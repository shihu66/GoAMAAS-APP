-- ==============================================================================
-- GoAMAAS Migration: Payment Requests Ownership Enforcement & Reference Uniqueness
-- File: supabase/migrations/20261024_harden_payment_requests_ownership_and_uniqueness.sql
-- ==============================================================================
--
-- Purpose:
-- 1. Enforce strict database-layer target ownership on public.payment_requests INSERTs
--    so authenticated users cannot submit website_subscription or website_package
--    payment requests referencing another tenant's subscribed_websites record, a
--    non-existent website UUID, or an unauthorized store_id.
-- 2. Enforce concurrency-safe, database-level partial unique indexes preventing:
--      a) Duplicate normalized transaction_id across 'pending' and 'approved' requests
--      b) Duplicate normalized bank_reference across 'pending' and 'approved' requests
--      c) Multiple 'pending' requests for the same (user_id, service_type, service_id)
--    Rejected requests ('rejected') intentionally release their transaction_id,
--    bank_reference, and pending service slot so legitimate merchants can resubmit
--    corrected payment details after an administrative rejection.
--    NULL, empty (''), and whitespace-only reference values are safely ignored.
-- 3. Protect core payment_requests columns from post-submission mutation and revoke
--    any unintended table privileges from PUBLIC, anon, and authenticated roles.
-- 4. Abort cleanly during preflight without deleting or mutating existing records
--    if legacy duplicate references or duplicate pending service rows exist.

-- --------------------------------------------------------------------------------
-- 1. Prerequisite Validation: Verify required tables, columns, and security helpers
-- --------------------------------------------------------------------------------
DO $$
DECLARE
  v_missing_roles TEXT[];
  v_missing_pr_cols TEXT[];
  v_missing_sw_cols TEXT[];
  v_missing_stores_cols TEXT[];
  v_missing_sm_cols TEXT[];
  v_missing_profiles_cols TEXT[];
  v_unexpected_rpc_overloads TEXT[];
BEGIN
  SELECT array_agg(req_role ORDER BY req_role) INTO v_missing_roles
  FROM pg_catalog.unnest(ARRAY['anon', 'authenticated', 'service_role']) AS req_role
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = req_role
  );

  IF v_missing_roles IS NOT NULL AND array_length(v_missing_roles, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: Required database roles do not exist: %', array_to_string(v_missing_roles, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
      AND p.proname = 'uid'
      AND pg_catalog.oidvectortypes(p.proargtypes) = ''
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
      AND p.proname = 'jwt'
      AND pg_catalog.oidvectortypes(p.proargtypes) = ''
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: Required Supabase auth helpers "auth.uid()" and "auth.jwt()" do not exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_requests'
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: Table "public.payment_requests" does not exist. Apply 20261015_complete_saas_website_builder_and_payments.sql first.';
  END IF;

  SELECT array_agg(col ORDER BY col) INTO v_missing_pr_cols
  FROM pg_catalog.unnest(ARRAY[
    'id', 'user_id', 'store_id', 'customer_name', 'customer_phone', 'customer_email',
    'service_type', 'service_id', 'service_name', 'plan_tier',
    'amount', 'currency', 'payment_method',
    'transaction_id', 'sender_number', 'bank_name', 'bank_account_name', 'bank_reference',
    'status', 'admin_notes', 'reviewed_by', 'reviewed_at', 'created_at', 'updated_at'
  ]) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = col
  );

  IF v_missing_pr_cols IS NOT NULL AND array_length(v_missing_pr_cols, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: "public.payment_requests" is missing required columns: %', array_to_string(v_missing_pr_cols, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscribed_websites'
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: Table "public.subscribed_websites" does not exist.';
  END IF;

  SELECT array_agg(col ORDER BY col) INTO v_missing_sw_cols
  FROM pg_catalog.unnest(ARRAY[
    'id', 'user_id', 'store_id', 'status', 'payment_status',
    'current_period_end', 'grace_period_end', 'updated_at'
  ]) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscribed_websites' AND column_name = col
  );

  IF v_missing_sw_cols IS NOT NULL AND array_length(v_missing_sw_cols, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: "public.subscribed_websites" is missing required columns (ensure 20261017_public_website_resolution_and_publishing.sql is applied first): %',
      array_to_string(v_missing_sw_cols, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stores'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'store_members'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: Required tenant tables ("public.stores", "public.store_members", "public.profiles") do not exist. Apply 20261010_security_and_rls_hardening.sql first.';
  END IF;

  SELECT array_agg(col ORDER BY col) INTO v_missing_stores_cols
  FROM pg_catalog.unnest(ARRAY['id', 'owner_id']) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = col
  );

  IF v_missing_stores_cols IS NOT NULL AND array_length(v_missing_stores_cols, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: "public.stores" is missing required columns: %', array_to_string(v_missing_stores_cols, ', ');
  END IF;

  SELECT array_agg(col ORDER BY col) INTO v_missing_sm_cols
  FROM pg_catalog.unnest(ARRAY['store_id', 'user_id', 'status', 'role']) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_members' AND column_name = col
  );

  IF v_missing_sm_cols IS NOT NULL AND array_length(v_missing_sm_cols, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: "public.store_members" is missing required columns: %', array_to_string(v_missing_sm_cols, ', ');
  END IF;

  SELECT array_agg(col ORDER BY col) INTO v_missing_profiles_cols
  FROM pg_catalog.unnest(ARRAY['id', 'role']) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = col
  );

  IF v_missing_profiles_cols IS NOT NULL AND array_length(v_missing_profiles_cols, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: "public.profiles" is missing required columns: %', array_to_string(v_missing_profiles_cols, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_approve_payment_request'
      AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text'
      AND p.prosecdef = true
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_reject_payment_request'
      AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text'
      AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: SECURITY DEFINER RPCs "public.admin_approve_payment_request(uuid, text)" and "public.admin_reject_payment_request(uuid, text)" must exist before applying 20261024.';
  END IF;

  SELECT array_agg(
    format('public.%I(%s)', p.proname, pg_catalog.oidvectortypes(p.proargtypes))
    ORDER BY p.proname, pg_catalog.oidvectortypes(p.proargtypes)
  ) INTO v_unexpected_rpc_overloads
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('admin_approve_payment_request', 'admin_reject_payment_request')
    AND pg_catalog.oidvectortypes(p.proargtypes) <> 'uuid, text';

  IF v_unexpected_rpc_overloads IS NOT NULL AND array_length(v_unexpected_rpc_overloads, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: Unexpected legacy RPC overload(s) found that could shadow hardened review RPCs: %. Drop obsolete overloads before applying 20261024.',
      array_to_string(v_unexpected_rpc_overloads, ', ');
  END IF;
END $$;

-- --------------------------------------------------------------------------------
-- 2. Read-Only Preflight Duplicate Inspection (Never Mutates or Deletes Rows)
-- --------------------------------------------------------------------------------
DO $$
DECLARE
  v_dup_trx TEXT[];
  v_dup_bank_ref TEXT[];
  v_dup_pending_service TEXT[];
BEGIN
  -- 2a. Check for duplicate normalized transaction_id across pending/approved rows
  SELECT array_agg(norm_trx || ' (' || cnt || ' rows)' ORDER BY norm_trx)
  INTO v_dup_trx
  FROM (
    SELECT upper(btrim(transaction_id, E' \t\n\r')) AS norm_trx, count(*) AS cnt
    FROM public.payment_requests
    WHERE status IN ('pending', 'approved')
      AND transaction_id IS NOT NULL
      AND btrim(transaction_id, E' \t\n\r') <> ''
    GROUP BY upper(btrim(transaction_id, E' \t\n\r'))
    HAVING count(*) > 1
  ) dup_t;

  IF v_dup_trx IS NOT NULL AND array_length(v_dup_trx, 1) > 0 THEN
    RAISE EXCEPTION E'Migration aborted: Duplicate active/approved transaction_id values detected in public.payment_requests: %.\nResolve collisions manually (e.g., reject duplicate pending requests via admin_reject_payment_request) before applying unique index.',
      array_to_string(v_dup_trx, ', ');
  END IF;

  -- 2b. Check for duplicate normalized bank_reference across pending/approved rows
  SELECT array_agg(norm_ref || ' (' || cnt || ' rows)' ORDER BY norm_ref)
  INTO v_dup_bank_ref
  FROM (
    SELECT upper(btrim(bank_reference, E' \t\n\r')) AS norm_ref, count(*) AS cnt
    FROM public.payment_requests
    WHERE status IN ('pending', 'approved')
      AND bank_reference IS NOT NULL
      AND btrim(bank_reference, E' \t\n\r') <> ''
    GROUP BY upper(btrim(bank_reference, E' \t\n\r'))
    HAVING count(*) > 1
  ) dup_b;

  IF v_dup_bank_ref IS NOT NULL AND array_length(v_dup_bank_ref, 1) > 0 THEN
    RAISE EXCEPTION E'Migration aborted: Duplicate active/approved bank_reference values detected in public.payment_requests: %.\nResolve collisions manually (e.g., reject duplicate pending requests via admin_reject_payment_request) before applying unique index.',
      array_to_string(v_dup_bank_ref, ', ');
  END IF;

  -- 2c. Check for multiple pending requests targeting the same normalized (user_id, service_type, service_id)
  SELECT array_agg(
    user_id::TEXT || ':' || service_type || ':' || norm_service_id || ' (' || cnt || ' rows)'
    ORDER BY user_id::TEXT, service_type, norm_service_id
  )
  INTO v_dup_pending_service
  FROM (
    SELECT user_id, service_type, lower(btrim(service_id, E' \t\n\r')) AS norm_service_id, count(*) AS cnt
    FROM public.payment_requests
    WHERE status = 'pending'
      AND service_id IS NOT NULL
      AND btrim(service_id, E' \t\n\r') <> ''
    GROUP BY user_id, service_type, lower(btrim(service_id, E' \t\n\r'))
    HAVING count(*) > 1
  ) dup_s;

  IF v_dup_pending_service IS NOT NULL AND array_length(v_dup_pending_service, 1) > 0 THEN
    RAISE EXCEPTION E'Migration aborted: Multiple pending payment_requests detected for the same (user_id, service_type, service_id): %.\nResolve duplicate pending requests manually before applying unique index.',
      array_to_string(v_dup_pending_service, ', ');
  END IF;
END $$;

-- --------------------------------------------------------------------------------
-- 3. Concurrency-Safe Partial Unique Indexes for Reference & Pending Service Guards
-- --------------------------------------------------------------------------------
-- Prevent reuse of any normalized non-empty transaction_id across pending or approved requests.
-- Rejected requests ('rejected') are excluded so merchants can resubmit after rejection.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_requests_active_transaction_id
  ON public.payment_requests ((upper(btrim(transaction_id, E' \t\n\r'))))
  WHERE status IN ('pending', 'approved')
    AND transaction_id IS NOT NULL
    AND btrim(transaction_id, E' \t\n\r') <> '';

-- Prevent reuse of any normalized non-empty bank_reference across pending or approved requests.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_requests_active_bank_reference
  ON public.payment_requests ((upper(btrim(bank_reference, E' \t\n\r'))))
  WHERE status IN ('pending', 'approved')
    AND bank_reference IS NOT NULL
    AND btrim(bank_reference, E' \t\n\r') <> '';

-- Upgrade uq_payment_requests_pending_user_service in place if an older case-sensitive expression exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'payment_requests'
      AND indexname = 'uq_payment_requests_pending_user_service'
      AND indexdef NOT ILIKE '%lower(btrim(service_id%'
  ) THEN
    DROP INDEX public.uq_payment_requests_pending_user_service;
  END IF;
END $$;

-- Prevent concurrent duplicate pending requests for the same user, service_type, and normalized service_id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_requests_pending_user_service
  ON public.payment_requests (user_id, service_type, (lower(btrim(service_id, E' \t\n\r'))))
  WHERE status = 'pending'
    AND service_id IS NOT NULL
    AND btrim(service_id, E' \t\n\r') <> '';

-- --------------------------------------------------------------------------------
-- 4. Private Internal Review Capability Store & Validated Authorization Helpers
-- --------------------------------------------------------------------------------
-- Private schema & single-use transactional capability table used exclusively by the
-- SECURITY DEFINER admin review RPCs (admin_approve_payment_request / admin_reject_payment_request)
-- to prove authorized RPC execution to trg_protect_payment_request_integrity without relying on
-- spoofable PG_CONTEXT string matching or user-writable session GUCs.
CREATE SCHEMA IF NOT EXISTS amaas_internal;

REVOKE ALL ON SCHEMA amaas_internal FROM PUBLIC;
REVOKE ALL ON SCHEMA amaas_internal FROM anon;
REVOKE ALL ON SCHEMA amaas_internal FROM authenticated;
REVOKE ALL ON SCHEMA amaas_internal FROM service_role;

CREATE TABLE IF NOT EXISTS amaas_internal.payment_review_authorizations (
  txid TEXT NOT NULL,
  request_id UUID NOT NULL,
  target_status TEXT NOT NULL CHECK (target_status IN ('approved', 'rejected')),
  reviewer_id UUID NOT NULL,
  rpc_name TEXT NOT NULL CHECK (rpc_name IN ('admin_approve_payment_request', 'admin_reject_payment_request')),
  CONSTRAINT chk_payment_review_auth_rpc_status_pair CHECK (
    (rpc_name = 'admin_approve_payment_request' AND target_status = 'approved')
    OR (rpc_name = 'admin_reject_payment_request' AND target_status = 'rejected')
  ),
  PRIMARY KEY (txid, request_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint con
    WHERE con.conrelid = 'amaas_internal.payment_review_authorizations'::pg_catalog.regclass
      AND con.conname = 'chk_payment_review_auth_rpc_status_pair'
  ) THEN
    ALTER TABLE amaas_internal.payment_review_authorizations
      ADD CONSTRAINT chk_payment_review_auth_rpc_status_pair CHECK (
        (rpc_name = 'admin_approve_payment_request' AND target_status = 'approved')
        OR (rpc_name = 'admin_reject_payment_request' AND target_status = 'rejected')
      );
  END IF;
END $$;

ALTER TABLE amaas_internal.payment_review_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE amaas_internal.payment_review_authorizations NO FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE amaas_internal.payment_review_authorizations FROM PUBLIC;
REVOKE ALL ON TABLE amaas_internal.payment_review_authorizations FROM anon;
REVOKE ALL ON TABLE amaas_internal.payment_review_authorizations FROM authenticated;
REVOKE ALL ON TABLE amaas_internal.payment_review_authorizations FROM service_role;

-- Harden public.is_admin() and public.protect_profile_role() so unprivileged client sessions
-- (SET ROLE authenticated / SET ROLE anon / non-owner session_user) can NEVER forge
-- request.jwt.claim.role = 'service_role' to self-promote public.profiles.role = 'admin'
-- and subsequently mint payment review capability tokens.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
DECLARE
  v_role text;
  v_jwt_role text;
  v_active_role text;
  v_is_session_owner_or_superuser boolean;
BEGIN
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');

  IF v_active_role = 'service_role' OR session_user = 'service_role' THEN
    RETURN true;
  END IF;

  -- Honor JWT service_role claim ONLY in a direct owner/superuser session where no client SET ROLE is active
  IF v_active_role IN ('none', current_user) THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      LEFT JOIN pg_catalog.pg_class c
        ON c.oid = 'public.profiles'::pg_catalog.regclass
       AND c.relowner = r.oid
      WHERE r.rolname = session_user
        AND (r.rolsuper = true OR c.oid IS NOT NULL)
    ) INTO v_is_session_owner_or_superuser;

    IF COALESCE(v_is_session_owner_or_superuser, false) THEN
      v_jwt_role := COALESCE(
        NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
        auth.jwt()->>'role'
      );
      IF v_jwt_role = 'service_role' THEN
        RETURN true;
      END IF;
    END IF;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = auth.uid();

  RETURN COALESCE(v_role = 'admin', false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger AS $$
DECLARE
  v_active_role text;
  v_is_direct_owner_maintenance boolean := false;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');
    IF v_active_role IN ('none', current_user) AND auth.uid() IS NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles r
        LEFT JOIN pg_catalog.pg_class c
          ON c.oid = 'public.profiles'::pg_catalog.regclass
         AND c.relowner = r.oid
        WHERE r.rolname = session_user
          AND (r.rolsuper = true OR c.oid IS NOT NULL)
      ) INTO v_is_direct_owner_maintenance;
    END IF;

    IF NOT v_is_direct_owner_maintenance AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access denied: Users cannot modify their own platform role or elevate privileges.';
    END IF;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_profile_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profile_role() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_role() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role();

CREATE OR REPLACE FUNCTION public.protect_profile_role_insert()
RETURNS trigger AS $$
DECLARE
  v_active_role text;
  v_is_direct_owner_maintenance boolean := false;
BEGIN
  IF NEW.role IS DISTINCT FROM 'merchant' THEN
    v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');
    IF v_active_role IN ('none', current_user) AND auth.uid() IS NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles r
        LEFT JOIN pg_catalog.pg_class c
          ON c.oid = 'public.profiles'::pg_catalog.regclass
         AND c.relowner = r.oid
        WHERE r.rolname = session_user
          AND (r.rolsuper = true OR c.oid IS NOT NULL)
      ) INTO v_is_direct_owner_maintenance;
    END IF;

    IF NOT v_is_direct_owner_maintenance AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access denied: Users cannot modify their own platform role or elevate privileges.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_profile_role_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profile_role_insert() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_role_insert() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_profile_role_insert ON public.profiles;
CREATE TRIGGER trg_protect_profile_role_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role_insert();

-- Verifies platform administrator status strictly against public.profiles for a specific user UUID.
-- Never consults user-controllable JWT claim GUCs (request.jwt.claim.role / auth.role()).
CREATE OR REPLACE FUNCTION public.is_verified_platform_admin(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
DECLARE
  v_active_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Prevent unprivileged client sessions from enumerating admin status of other user UUIDs
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');
  IF v_active_role IN ('authenticated', 'anon') AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role = 'admin'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.is_verified_platform_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_verified_platform_admin(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_verified_platform_admin(UUID) TO authenticated, service_role;

-- Uses SECURITY DEFINER with a locked search_path to avoid cross-table RLS recursion
-- and prevent store managers or staff (who may hold store access via store_members)
-- from submitting payment requests for a website owned by another user_id.
-- Verifies store management directly against public.stores, public.store_members, and
-- public.profiles so session-mutable JWT role GUCs cannot spoof store authorization.
-- Never discloses whether another user's website UUID exists because step 1 requires
-- p_user_id = auth.uid() and step 4 strictly filters sw.user_id = auth.uid().
CREATE OR REPLACE FUNCTION public.can_submit_payment_request(
  p_user_id UUID,
  p_store_id UUID,
  p_service_type TEXT,
  p_service_id TEXT,
  p_status TEXT DEFAULT 'pending'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_caller_id UUID;
  v_clean_service_id TEXT;
  v_website_uuid UUID;
  v_can_manage_store BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Submitter must match the authenticated user and request must start strictly as 'pending'
  IF p_user_id IS DISTINCT FROM v_caller_id THEN
    RETURN false;
  END IF;

  IF p_status IS DISTINCT FROM 'pending' THEN
    RETURN false;
  END IF;

  -- 2. Target service_id must be non-empty after stripping whitespace
  v_clean_service_id := btrim(COALESCE(p_service_id, ''), E' \t\n\r');
  IF v_clean_service_id = '' THEN
    RETURN false;
  END IF;

  -- 3. If a store_id is supplied, verify store management directly against authoritative tables
  IF p_store_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = p_store_id
        AND (
          s.owner_id = v_caller_id
          OR public.is_verified_platform_admin(v_caller_id)
          OR EXISTS (
            SELECT 1
            FROM public.store_members sm
            WHERE sm.store_id = p_store_id
              AND sm.user_id = v_caller_id
              AND sm.status = 'active'
              AND sm.role IN ('owner', 'admin', 'manager')
          )
        )
    ) INTO v_can_manage_store;

    IF NOT COALESCE(v_can_manage_store, false) THEN
      RETURN false;
    END IF;
  END IF;

  -- 4. Service-specific target validation
  IF p_service_type IN ('website_subscription', 'website_package') THEN
    IF v_clean_service_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN false;
    END IF;

    v_website_uuid := v_clean_service_id::UUID;

    RETURN EXISTS (
      SELECT 1
      FROM public.subscribed_websites sw
      WHERE sw.id = v_website_uuid
        AND sw.user_id = v_caller_id
        AND (
          p_store_id IS NULL
          OR sw.store_id IS NULL
          OR sw.store_id = p_store_id
        )
    );
  ELSIF p_service_type IN ('dashboard_plan', 'ai_automation') THEN
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.can_submit_payment_request(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_submit_payment_request(UUID, UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_submit_payment_request(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 4b. Hardened Administrative Review RPCs (Verified Admin Gate & Capability Minting)
-- --------------------------------------------------------------------------------
-- Replaces legacy public.is_admin() entry check (which trusted request.jwt.claim.role GUCs)
-- with strict public.is_verified_platform_admin(auth.uid()) BEFORE locking or probing any row,
-- mints a single-use capability row in amaas_internal.payment_review_authorizations, and
-- asserts exact single-row updates on both subscribed_websites and payment_requests.
CREATE OR REPLACE FUNCTION public.admin_approve_payment_request(
  p_request_id UUID,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID;
  v_req RECORD;
  v_clean_service_id TEXT;
  v_matched_count INTEGER := 0;
  v_website_uuid UUID;
  v_target_user_id UUID;
  v_sw_updated INTEGER := 0;
  v_pr_updated INTEGER := 0;
BEGIN
  -- 0. Authoritative platform admin check before any row lock or existence check
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL OR NOT public.is_verified_platform_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Only verified platform administrators can approve payment requests';
  END IF;

  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_FOUND',
      'message', 'Payment request not found'
    );
  END IF;

  -- 1. Lock payment request row for update
  SELECT * INTO v_req
  FROM public.payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_FOUND',
      'message', 'Payment request not found'
    );
  END IF;

  -- 2. Reject non-pending requests (prevents repeat approval and accidental re-extension)
  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_SETTLED',
      'message', 'Payment request is already ' || v_req.status
    );
  END IF;

  -- 3. If service is a website subscription or package, strictly validate and activate the target website FIRST
  IF v_req.service_type IN ('website_subscription', 'website_package') THEN
    v_clean_service_id := btrim(COALESCE(v_req.service_id, ''), E' \t\n\r');

    -- A. Validate service_id is not empty
    IF v_clean_service_id = '' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'MISSING_SERVICE_ID',
        'message', 'Payment approval failed: Website payment request is missing target website ID.'
      );
    END IF;

    -- B. Validate service_id is a valid UUID format
    IF v_clean_service_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'INVALID_SERVICE_ID',
        'message', 'Payment approval failed: Target website ID format is invalid (expected UUID).'
      );
    END IF;

    v_website_uuid := v_clean_service_id::UUID;

    -- C. Lock and verify target website exists in database
    SELECT user_id INTO v_target_user_id
    FROM public.subscribed_websites
    WHERE id = v_website_uuid
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'WEBSITE_NOT_FOUND',
        'message', 'Payment approval failed: Target website record does not exist in the database.'
      );
    END IF;

    -- D. Verify payment request submitter matches website owner
    IF v_target_user_id IS DISTINCT FROM v_req.user_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'TENANT_MISMATCH',
        'message', 'Payment approval failed: Payment request submitter does not match website owner.'
      );
    END IF;

    -- E. Ensure exactly 1 row matches to prevent ambiguous multi-row updates
    SELECT count(*) INTO v_matched_count
    FROM public.subscribed_websites
    WHERE id = v_website_uuid AND user_id = v_req.user_id;

    IF v_matched_count != 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'AMBIGUOUS_MATCH',
        'message', 'Payment approval failed: Unexpected number of matching website records (' || v_matched_count || ').'
      );
    END IF;

    -- F. Update exactly the locked target website and assert single-row mutation
    UPDATE public.subscribed_websites
    SET
      status = 'active',
      payment_status = 'paid',
      current_period_end = NOW() + INTERVAL '30 days',
      grace_period_end = NOW() + INTERVAL '35 days',
      updated_at = NOW()
    WHERE id = v_website_uuid AND user_id = v_req.user_id;

    GET DIAGNOSTICS v_sw_updated = ROW_COUNT;
    IF v_sw_updated <> 1 THEN
      RAISE EXCEPTION 'Payment approval aborted: Expected 1 subscribed_websites row updated, got %.', v_sw_updated;
    END IF;
  ELSIF v_req.service_type NOT IN ('dashboard_plan', 'ai_automation') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'UNSUPPORTED_SERVICE_TYPE',
      'message', 'Payment approval failed: Unsupported service_type.'
    );
  END IF;

  -- 4. Mint single-use, transaction-bound capability token consumed by trg_protect_payment_request_integrity
  INSERT INTO amaas_internal.payment_review_authorizations (
    txid, request_id, target_status, reviewer_id, rpc_name
  ) VALUES (
    pg_catalog.pg_current_xact_id()::TEXT,
    p_request_id,
    'approved',
    v_admin_id,
    'admin_approve_payment_request'
  );

  -- 5. Atomically mark payment request as approved ONLY after all service-specific activations succeed
  UPDATE public.payment_requests
  SET
    status = 'approved',
    admin_notes = p_admin_notes,
    reviewed_by = v_admin_id,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_request_id
    AND status = 'pending';

  GET DIAGNOSTICS v_pr_updated = ROW_COUNT;
  IF v_pr_updated <> 1 THEN
    RAISE EXCEPTION 'Payment approval aborted: Expected 1 pending payment_requests row updated, got %.', v_pr_updated;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM amaas_internal.payment_review_authorizations
    WHERE txid = pg_catalog.pg_current_xact_id()::TEXT
      AND request_id = p_request_id
  ) THEN
    RAISE EXCEPTION 'Payment approval aborted: Review capability token was not consumed.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'APPROVED',
    'message', 'Payment approved successfully. Service activated.',
    'requestId', p_request_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_reject_payment_request(
  p_request_id UUID,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID;
  v_req RECORD;
  v_pr_updated INTEGER := 0;
BEGIN
  -- 0. Authoritative platform admin check before any row lock or existence check
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL OR NOT public.is_verified_platform_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Only verified platform administrators can reject payment requests';
  END IF;

  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_FOUND',
      'message', 'Payment request not found'
    );
  END IF;

  -- 1. Lock payment request row for update
  SELECT * INTO v_req
  FROM public.payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_FOUND',
      'message', 'Payment request not found'
    );
  END IF;

  -- 2. Reject non-pending requests
  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_SETTLED',
      'message', 'Payment request is already ' || v_req.status
    );
  END IF;

  -- 3. Mint single-use, transaction-bound capability token consumed by trg_protect_payment_request_integrity
  INSERT INTO amaas_internal.payment_review_authorizations (
    txid, request_id, target_status, reviewer_id, rpc_name
  ) VALUES (
    pg_catalog.pg_current_xact_id()::TEXT,
    p_request_id,
    'rejected',
    v_admin_id,
    'admin_reject_payment_request'
  );

  -- 4. Atomically mark payment request as rejected and assert single-row mutation
  UPDATE public.payment_requests
  SET
    status = 'rejected',
    admin_notes = p_reason,
    reviewed_by = v_admin_id,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_request_id
    AND status = 'pending';

  GET DIAGNOSTICS v_pr_updated = ROW_COUNT;
  IF v_pr_updated <> 1 THEN
    RAISE EXCEPTION 'Payment rejection aborted: Expected 1 pending payment_requests row updated, got %.', v_pr_updated;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM amaas_internal.payment_review_authorizations
    WHERE txid = pg_catalog.pg_current_xact_id()::TEXT
      AND request_id = p_request_id
  ) THEN
    RAISE EXCEPTION 'Payment rejection aborted: Review capability token was not consumed.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'REJECTED',
    'message', 'Payment request rejected.',
    'requestId', p_request_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.admin_reject_payment_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reject_payment_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_request(UUID, TEXT) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 5. Row Integrity, Explicit Privilege Model, TRUNCATE Guard & Immutability Trigger
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_payment_request_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_caller_id UUID;
  v_active_role_setting TEXT;
  v_is_service_role BOOLEAN;
  v_is_current_owner_or_superuser BOOLEAN;
  v_is_session_owner_or_superuser BOOLEAN;
  v_is_review_rpc_definer BOOLEAN;
  v_authorized_rpc_name TEXT;
  v_in_admin_review_rpc BOOLEAN := false;
  v_is_backend_maintenance BOOLEAN;
BEGIN
  v_caller_id := auth.uid();

  -- Explicit positive privilege model (never uses negative role exclusions, PG_CONTEXT regexes, or JWT GUCs):
  -- 1) Explicit Supabase backend service_role
  v_is_service_role := (current_user = 'service_role');

  -- 2) Verify whether BOTH current_user AND session_user are PostgreSQL superuser or owner of public.payment_requests,
  --    AND no non-owner SET ROLE (e.g. SET ROLE authenticated / SET ROLE anon) is active in the session.
  --    This prevents any unrelated SECURITY DEFINER function invoked by anon/authenticated/authenticator
  --    (even when auth.uid() IS NULL) from ever qualifying as backend maintenance.
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    LEFT JOIN pg_catalog.pg_class c
      ON c.oid = 'public.payment_requests'::pg_catalog.regclass
     AND c.relowner = r.oid
    WHERE r.rolname = current_user
      AND (r.rolsuper = true OR c.oid IS NOT NULL)
  ) INTO v_is_current_owner_or_superuser;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    LEFT JOIN pg_catalog.pg_class c
      ON c.oid = 'public.payment_requests'::pg_catalog.regclass
     AND c.relowner = r.oid
    WHERE r.rolname = session_user
      AND (r.rolsuper = true OR c.oid IS NOT NULL)
  ) INTO v_is_session_owner_or_superuser;

  v_active_role_setting := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');

  -- 3) On UPDATE, consume single-use capability token from amaas_internal.payment_review_authorizations
  --    ONLY when executing under the exact owner of BOTH SECURITY DEFINER admin review RPCs.
  IF TG_OP = 'UPDATE' THEN
    SELECT (COUNT(*) = 2)
    INTO v_is_review_rpc_definer
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'public'
      AND p.proname IN ('admin_approve_payment_request', 'admin_reject_payment_request')
      AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text'
      AND p.prosecdef = true
      AND r.rolname = current_user;

    IF COALESCE(v_is_review_rpc_definer, false) AND v_caller_id IS NOT NULL THEN
      DELETE FROM amaas_internal.payment_review_authorizations
      WHERE txid = pg_catalog.pg_current_xact_id()::TEXT
        AND request_id = OLD.id
        AND target_status = NEW.status
        AND reviewer_id = v_caller_id
      RETURNING rpc_name INTO v_authorized_rpc_name;

      v_in_admin_review_rpc := (
        (v_authorized_rpc_name = 'admin_approve_payment_request' AND NEW.status = 'approved')
        OR (v_authorized_rpc_name = 'admin_reject_payment_request' AND NEW.status = 'rejected')
      );
    END IF;
  END IF;

  -- Direct backend / migration / SQL-Editor maintenance context:
  -- Strictly explicit service_role, OR direct owner/superuser session (session_user AND current_user
  -- both owner/superuser, no client SET ROLE active, outside admin review RPCs, and auth.uid() IS NULL).
  v_is_backend_maintenance := (
    v_is_service_role
    OR (
      COALESCE(v_is_current_owner_or_superuser, false)
      AND COALESCE(v_is_session_owner_or_superuser, false)
      AND v_active_role_setting IN ('none', current_user)
      AND NOT v_in_admin_review_rpc
      AND v_caller_id IS NULL
    )
  );

  IF TG_OP = 'DELETE' THEN
    IF NOT v_is_backend_maintenance THEN
      RAISE EXCEPTION 'Access denied: Payment request audit records cannot be deleted by client sessions.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Reject NaN / Infinity / non-positive amounts (PostgreSQL NUMERIC treats 'NaN' > 0 as true)
    IF NEW.amount IS NULL
       OR NEW.amount <= 0
       OR NEW.amount IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC) THEN
      RAISE EXCEPTION 'Invalid payment request amount: amount must be a finite positive number.';
    END IF;

    -- Normalize whitespace (and canonical lowercase for website UUIDs) on service_id and references
    IF NEW.service_id IS NOT NULL THEN
      IF NEW.service_type IN ('website_subscription', 'website_package') THEN
        NEW.service_id := lower(btrim(NEW.service_id, E' \t\n\r'));
      ELSE
        NEW.service_id := btrim(NEW.service_id, E' \t\n\r');
      END IF;
    END IF;
    NEW.transaction_id := NULLIF(btrim(COALESCE(NEW.transaction_id, ''), E' \t\n\r'), '');
    NEW.bank_reference := NULLIF(btrim(COALESCE(NEW.bank_reference, ''), E' \t\n\r'), '');

    IF NOT v_is_backend_maintenance THEN
      IF NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.admin_notes IS NOT NULL THEN
        RAISE EXCEPTION 'Access denied: Cannot set administrative review metadata when submitting a payment request.';
      END IF;

      IF NOT public.can_submit_payment_request(
        NEW.user_id,
        NEW.store_id,
        NEW.service_type,
        NEW.service_id,
        NEW.status
      ) THEN
        RAISE EXCEPTION 'Access denied: Invalid or unauthorized payment request target for service_type "%" and service_id "%".',
          COALESCE(NEW.service_type, 'null'),
          COALESCE(NEW.service_id, 'null');
      END IF;

      -- Force authoritative server timestamps on client submissions so created_at cannot be backdated/postdated
      NEW.created_at := NOW();
    ELSE
      NEW.created_at := COALESCE(NEW.created_at, NOW());
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Allow updates ONLY through the verified admin review RPCs (backed by public.profiles and single-use capability token)
    -- or explicit backend maintenance (service_role / direct owner maintenance).
    IF v_in_admin_review_rpc THEN
      IF NOT public.is_verified_platform_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: Only verified platform administrators can review payment requests.';
      END IF;

      IF OLD.status IS DISTINCT FROM 'pending' OR NEW.status NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Access denied: Administrative review may only transition pending requests to approved or rejected.';
      END IF;

      IF NEW.reviewed_by IS DISTINCT FROM v_caller_id OR NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL THEN
        RAISE EXCEPTION 'Access denied: Administrative review must record the authenticated reviewer and timestamp.';
      END IF;

      NEW.reviewed_at := NOW();
    ELSIF NOT v_is_backend_maintenance THEN
      RAISE EXCEPTION 'Access denied: Direct updates to payment requests are not permitted; use administrative review RPCs.';
    END IF;

    -- Core payment identity, customer submission details, target service, amount, and transaction
    -- references are immutable once created (even inside SECURITY DEFINER RPCs or owner sessions)
    -- unless explicitly repaired by service_role.
    IF NOT v_is_service_role THEN
      IF NEW.id IS DISTINCT FROM OLD.id
         OR NEW.user_id IS DISTINCT FROM OLD.user_id
         OR NEW.store_id IS DISTINCT FROM OLD.store_id
         OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
         OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
         OR NEW.customer_email IS DISTINCT FROM OLD.customer_email
         OR NEW.service_type IS DISTINCT FROM OLD.service_type
         OR NEW.service_id IS DISTINCT FROM OLD.service_id
         OR NEW.service_name IS DISTINCT FROM OLD.service_name
         OR NEW.plan_tier IS DISTINCT FROM OLD.plan_tier
         OR NEW.amount IS DISTINCT FROM OLD.amount
         OR NEW.currency IS DISTINCT FROM OLD.currency
         OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
         OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
         OR NEW.sender_number IS DISTINCT FROM OLD.sender_number
         OR NEW.bank_name IS DISTINCT FROM OLD.bank_name
         OR NEW.bank_account_name IS DISTINCT FROM OLD.bank_account_name
         OR NEW.bank_reference IS DISTINCT FROM OLD.bank_reference
         OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Access denied: Core payment request identity, target service, amount, and transaction reference fields are immutable.';
      END IF;
    END IF;

    IF NEW.amount IS NULL
       OR NEW.amount <= 0
       OR NEW.amount IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC) THEN
      RAISE EXCEPTION 'Invalid payment request amount: amount must be a finite positive number.';
    END IF;

    -- Normalize fields only when explicitly modified (preserves existing legacy values during status reviews)
    IF NEW.service_id IS DISTINCT FROM OLD.service_id AND NEW.service_id IS NOT NULL THEN
      IF NEW.service_type IN ('website_subscription', 'website_package') THEN
        NEW.service_id := lower(btrim(NEW.service_id, E' \t\n\r'));
      ELSE
        NEW.service_id := btrim(NEW.service_id, E' \t\n\r');
      END IF;
    END IF;
    IF NEW.transaction_id IS DISTINCT FROM OLD.transaction_id THEN
      NEW.transaction_id := NULLIF(btrim(COALESCE(NEW.transaction_id, ''), E' \t\n\r'), '');
    END IF;
    IF NEW.bank_reference IS DISTINCT FROM OLD.bank_reference THEN
      NEW.bank_reference := NULLIF(btrim(COALESCE(NEW.bank_reference, ''), E' \t\n\r'), '');
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_payment_request_integrity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_payment_request_integrity() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_payment_request_integrity() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_payment_request_integrity ON public.payment_requests;
CREATE TRIGGER trg_protect_payment_request_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_payment_request_integrity();

-- Statement-level BEFORE TRUNCATE guard (FOR EACH ROW triggers do not fire on TRUNCATE in PostgreSQL)
CREATE OR REPLACE FUNCTION public.block_payment_requests_truncate()
RETURNS TRIGGER AS $$
DECLARE
  v_active_role_setting TEXT;
  v_is_current_owner_or_superuser BOOLEAN;
  v_is_session_owner_or_superuser BOOLEAN;
BEGIN
  IF current_user = 'service_role' THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    LEFT JOIN pg_catalog.pg_class c
      ON c.oid = 'public.payment_requests'::pg_catalog.regclass
     AND c.relowner = r.oid
    WHERE r.rolname = current_user
      AND (r.rolsuper = true OR c.oid IS NOT NULL)
  ) INTO v_is_current_owner_or_superuser;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    LEFT JOIN pg_catalog.pg_class c
      ON c.oid = 'public.payment_requests'::pg_catalog.regclass
     AND c.relowner = r.oid
    WHERE r.rolname = session_user
      AND (r.rolsuper = true OR c.oid IS NOT NULL)
  ) INTO v_is_session_owner_or_superuser;

  v_active_role_setting := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');

  IF COALESCE(v_is_current_owner_or_superuser, false)
     AND COALESCE(v_is_session_owner_or_superuser, false)
     AND v_active_role_setting IN ('none', current_user)
     AND auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'Access denied: Payment request audit records cannot be truncated.';
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.block_payment_requests_truncate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.block_payment_requests_truncate() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_payment_requests_truncate() TO service_role;

DROP TRIGGER IF EXISTS trg_block_payment_requests_truncate ON public.payment_requests;
CREATE TRIGGER trg_block_payment_requests_truncate
  BEFORE TRUNCATE ON public.payment_requests
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.block_payment_requests_truncate();

-- Align ownership of internal capability store and payment security functions with public.payment_requests owner,
-- ensure the owner role holds required underlying privileges for non-superuser SECURITY DEFINER execution,
-- and lock search_path / least-privilege EXECUTE grants on all co-owned SECURITY DEFINER routines in public
-- so no co-owned definer can be abused via search_path shadowing to mint capability tokens.
DO $$
DECLARE
  v_pr_owner NAME;
  v_pr_owner_oid OID;
  v_runner_is_super BOOLEAN := false;
  v_fn RECORD;
  v_target_fn RECORD;
BEGIN
  SELECT c.relowner, pg_catalog.pg_get_userbyid(c.relowner)
  INTO v_pr_owner_oid, v_pr_owner
  FROM pg_catalog.pg_class c
  WHERE c.oid = 'public.payment_requests'::pg_catalog.regclass;

  IF v_pr_owner IS NULL THEN
    RAISE EXCEPTION 'Security setup failed: Could not determine owner of public.payment_requests.';
  END IF;

  IF v_pr_owner IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'Security setup failed: public.payment_requests cannot be owned by API role "%".', v_pr_owner;
  END IF;

  SELECT COALESCE(r.rolsuper, false)
  INTO v_runner_is_super
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = current_user;

  IF NOT v_runner_is_super AND NOT pg_catalog.pg_has_role(current_user, v_pr_owner_oid, 'MEMBER') THEN
    RAISE EXCEPTION 'Security setup failed: Migration runner "%" must be superuser or a member of public.payment_requests owner role "%" to align SECURITY DEFINER ownership.',
      current_user, v_pr_owner;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace n
    WHERE n.nspname = 'amaas_internal' AND n.nspowner <> v_pr_owner_oid
  ) THEN
    EXECUTE format('ALTER SCHEMA amaas_internal OWNER TO %I', v_pr_owner);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid = 'amaas_internal.payment_review_authorizations'::pg_catalog.regclass
      AND c.relowner <> v_pr_owner_oid
  ) THEN
    EXECUTE format('ALTER TABLE amaas_internal.payment_review_authorizations OWNER TO %I', v_pr_owner);
  END IF;

  FOR v_target_fn IN (
    SELECT p.oid::pg_catalog.regprocedure AS regproc
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        (p.proname = 'is_admin' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
        OR (p.proname = 'protect_profile_role' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
        OR (p.proname = 'protect_profile_role_insert' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
        OR (p.proname = 'is_verified_platform_admin' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid')
        OR (p.proname = 'can_submit_payment_request' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, uuid, text, text, text')
        OR (p.proname = 'admin_approve_payment_request' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text')
        OR (p.proname = 'admin_reject_payment_request' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text')
        OR (p.proname = 'protect_payment_request_integrity' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
        OR (p.proname = 'block_payment_requests_truncate' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
      )
      AND p.proowner <> v_pr_owner_oid
  ) LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO %I', v_target_fn.regproc, v_pr_owner);
  END LOOP;

  -- Ensure v_pr_owner holds required underlying privileges when non-superuser SECURITY DEFINER functions execute
  IF NOT has_schema_privilege(v_pr_owner_oid, 'public', 'USAGE') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', v_pr_owner);
  END IF;
  IF NOT has_table_privilege(v_pr_owner_oid, 'public.subscribed_websites', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner_oid, 'public.subscribed_websites', 'UPDATE') THEN
    EXECUTE format('GRANT SELECT, UPDATE ON TABLE public.subscribed_websites TO %I', v_pr_owner);
  END IF;
  IF NOT has_table_privilege(v_pr_owner_oid, 'public.profiles', 'SELECT') THEN
    EXECUTE format('GRANT SELECT ON TABLE public.profiles TO %I', v_pr_owner);
  END IF;
  IF NOT has_table_privilege(v_pr_owner_oid, 'public.stores', 'SELECT') THEN
    EXECUTE format('GRANT SELECT ON TABLE public.stores TO %I', v_pr_owner);
  END IF;
  IF NOT has_table_privilege(v_pr_owner_oid, 'public.store_members', 'SELECT') THEN
    EXECUTE format('GRANT SELECT ON TABLE public.store_members TO %I', v_pr_owner);
  END IF;

  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA amaas_internal REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role',
    v_pr_owner
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA amaas_internal REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role',
    v_pr_owner
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA amaas_internal REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role',
    v_pr_owner
  );

  -- Harden co-owned service_trials SECURITY DEFINER functions (from 20261015_service_trials_system.sql)
  -- which previously lacked SET search_path and had default PUBLIC/anon EXECUTE privileges.
  IF pg_catalog.to_regprocedure('public.activate_service_trial(text,text,text,uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID)
      SET search_path = pg_catalog, public, pg_temp;
    REVOKE ALL ON FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID) FROM anon;
    GRANT EXECUTE ON FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
  END IF;

  IF pg_catalog.to_regprocedure('public.protect_service_trial_invariants()') IS NOT NULL THEN
    ALTER FUNCTION public.protect_service_trial_invariants()
      SET search_path = pg_catalog, public, pg_temp;
    REVOKE ALL ON FUNCTION public.protect_service_trial_invariants() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.protect_service_trial_invariants() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.protect_service_trial_invariants() TO service_role;
  END IF;

  -- Ensure every other existing non-extension co-owned SECURITY DEFINER function or procedure in public
  -- pins an empty or pg_catalog-first search_path (without clobbering stricter SET search_path = '' settings).
  FOR v_fn IN (
    SELECT
      p.oid::pg_catalog.regprocedure AS regproc,
      CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS routine_kind
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND p.prosecdef = true
      AND p.proowner = v_pr_owner_oid
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_depend d
        WHERE d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::TEXT[])) AS cfg
        WHERE cfg IN ('search_path=', 'search_path=""', 'search_path=''''')
           OR (
             cfg ~ '^search_path=\s*"?pg_catalog"?(\s*,\s*"?[a-zA-Z0-9_]+"?)*\s*$'
             AND cfg !~ 'pg_temp.*public'
           )
      )
  ) LOOP
    EXECUTE format('ALTER %s %s SET search_path = pg_catalog, public, pg_temp', v_fn.routine_kind, v_fn.regproc);
  END LOOP;
END $$;

-- Re-assert strict privilege revocations after ownership alignment
REVOKE ALL ON SCHEMA amaas_internal FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE amaas_internal.payment_review_authorizations FROM PUBLIC, anon, authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 6. Hardened RLS Policies & Least-Privilege Table Grants on public.payment_requests
-- --------------------------------------------------------------------------------
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests NO FORCE ROW LEVEL SECURITY;

-- 6a. Explicitly drop all known legacy, snake_case, UI-generated, and obsolete policy names
--     (including remote legacy policies `payment_requests_select` and `payment_requests_insert`,
--     plus historical `20261015` policies such as `"Payment requests update policy"`).
DROP POLICY IF EXISTS payment_requests_select ON public.payment_requests;
DROP POLICY IF EXISTS payment_requests_insert ON public.payment_requests;
DROP POLICY IF EXISTS payment_requests_update ON public.payment_requests;
DROP POLICY IF EXISTS payment_requests_delete ON public.payment_requests;
DROP POLICY IF EXISTS payment_requests_all ON public.payment_requests;
DROP POLICY IF EXISTS payment_requests_admin ON public.payment_requests;
DROP POLICY IF EXISTS payment_requests_service_role ON public.payment_requests;
DROP POLICY IF EXISTS "Users can view their own payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Users can insert their own payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Users can create payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Admins can view all payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Admins can update payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Admins can manage all payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Payment requests select policy" ON public.payment_requests;
DROP POLICY IF EXISTS "Payment requests insert policy" ON public.payment_requests;
DROP POLICY IF EXISTS "Payment requests update policy" ON public.payment_requests;
DROP POLICY IF EXISTS "Payment requests delete policy" ON public.payment_requests;
DROP POLICY IF EXISTS "Payment requests service role policy" ON public.payment_requests;

-- 6b. Dynamic catalog sweep: drop any other legacy or ad-hoc RLS policies on public.payment_requests
--     so no permissive SELECT, INSERT, UPDATE, DELETE, or ALL policy can OR-bypass the intended rules.
DO $$
DECLARE
  v_pol RECORD;
BEGIN
  FOR v_pol IN (
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_requests'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.payment_requests', v_pol.policyname);
  END LOOP;
END $$;

-- 6c. Recreate ONLY the intended canonical policies:
--     1) Authenticated SELECT: own rows OR verified platform admin (for review queue visibility)
--     2) Authenticated INSERT: own pending row with null review fields and validated service/website ownership
--     3) Backend service_role ALL: explicit service_role access
--     Note: No client UPDATE or DELETE policies are created; verified admins review requests
--     exclusively via SECURITY DEFINER RPCs (admin_approve_payment_request / admin_reject_payment_request).
CREATE POLICY "Payment requests select policy"
  ON public.payment_requests
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_verified_platform_admin(auth.uid())
  );

CREATE POLICY "Payment requests insert policy"
  ON public.payment_requests
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND admin_notes IS NULL
    AND public.can_submit_payment_request(user_id, store_id, service_type, service_id, status)
  );

CREATE POLICY "Payment requests service role policy"
  ON public.payment_requests
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6d. Enforce least-privilege table grants:
--     Authenticated clients may only SELECT and INSERT; all approvals and rejections
--     must execute through the audited SECURITY DEFINER RPCs.
REVOKE ALL ON TABLE public.payment_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_requests FROM anon;
REVOKE ALL ON TABLE public.payment_requests FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.payment_requests TO authenticated;
GRANT ALL ON TABLE public.payment_requests TO service_role;

-- --------------------------------------------------------------------------------
-- 7. Post-Migration Security Invariant Verification Guard
-- --------------------------------------------------------------------------------
DO $$
DECLARE
  v_unexpected_policies TEXT[];
  v_policy_count INTEGER;
  v_rls_enabled BOOLEAN;
  v_rls_forced BOOLEAN;
  v_pr_owner OID;
  v_pr_owner_name NAME;
  v_bad_funcs TEXT[];
  v_extra_overloads TEXT[];
  v_valid_idx_count INTEGER;
  v_active_trg_count INTEGER;
BEGIN
  -- 7a. Verify RLS is enabled, NOT forced (so owner-aligned SECURITY DEFINER RPCs can update rows),
  --     and owner is not a client/API role.
  SELECT c.relrowsecurity, c.relforcerowsecurity, c.relowner, pg_catalog.pg_get_userbyid(c.relowner)
  INTO v_rls_enabled, v_rls_forced, v_pr_owner, v_pr_owner_name
  FROM pg_catalog.pg_class c
  WHERE c.oid = 'public.payment_requests'::pg_catalog.regclass;

  IF NOT COALESCE(v_rls_enabled, false) OR COALESCE(v_rls_forced, true) THEN
    RAISE EXCEPTION 'Security invariant check failed: public.payment_requests must have relrowsecurity=true and relforcerowsecurity=false.';
  END IF;

  IF v_pr_owner_name IS NULL OR v_pr_owner_name IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'Security invariant check failed: Invalid public.payment_requests owner "%".', COALESCE(v_pr_owner_name::TEXT, 'NULL');
  END IF;

  -- 7b. Verify ONLY the 3 canonical policies exist on public.payment_requests
  SELECT array_agg(policyname ORDER BY policyname)
  INTO v_unexpected_policies
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'payment_requests'
    AND policyname NOT IN (
      'Payment requests select policy',
      'Payment requests insert policy',
      'Payment requests service role policy'
    );

  IF v_unexpected_policies IS NOT NULL AND array_length(v_unexpected_policies, 1) > 0 THEN
    RAISE EXCEPTION 'Security invariant check failed: Unexpected RLS policies remain on public.payment_requests: %',
      array_to_string(v_unexpected_policies, ', ');
  END IF;

  SELECT count(*) INTO v_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'payment_requests';

  IF v_policy_count <> 3 THEN
    RAISE EXCEPTION 'Security invariant check failed: Expected exactly 3 RLS policies on public.payment_requests, found %.', v_policy_count;
  END IF;

  -- 7c. Verify table, definer-owner, and internal capability schema privileges & RLS state
  IF has_table_privilege('anon', 'public.payment_requests', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
    RAISE EXCEPTION 'Security invariant check failed: anon still holds table privileges on public.payment_requests.';
  END IF;

  IF has_table_privilege('authenticated', 'public.payment_requests', 'UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
    RAISE EXCEPTION 'Security invariant check failed: authenticated holds forbidden write/DDL privileges on public.payment_requests.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.payment_requests', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.payment_requests', 'INSERT') THEN
    RAISE EXCEPTION 'Security invariant check failed: authenticated lacks required SELECT/INSERT privileges on public.payment_requests.';
  END IF;

  IF has_schema_privilege('anon', 'amaas_internal', 'USAGE, CREATE')
     OR has_schema_privilege('authenticated', 'amaas_internal', 'USAGE, CREATE')
     OR has_schema_privilege('service_role', 'amaas_internal', 'USAGE, CREATE')
     OR has_table_privilege('anon', 'amaas_internal.payment_review_authorizations', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('authenticated', 'amaas_internal.payment_review_authorizations', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('service_role', 'amaas_internal.payment_review_authorizations', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'Security invariant check failed: Non-owner role holds access to amaas_internal capability store.';
  END IF;

  IF NOT has_schema_privilege(v_pr_owner, 'public', 'USAGE')
     OR NOT has_schema_privilege(v_pr_owner, 'auth', 'USAGE')
     OR NOT has_schema_privilege(v_pr_owner, 'amaas_internal', 'USAGE')
     OR NOT has_function_privilege(v_pr_owner, 'auth.uid()', 'EXECUTE')
     OR NOT has_function_privilege(v_pr_owner, 'auth.jwt()', 'EXECUTE')
     OR NOT has_table_privilege(v_pr_owner, 'public.payment_requests', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner, 'public.payment_requests', 'INSERT')
     OR NOT has_table_privilege(v_pr_owner, 'public.payment_requests', 'UPDATE')
     OR NOT has_table_privilege(v_pr_owner, 'public.payment_requests', 'DELETE')
     OR NOT has_table_privilege(v_pr_owner, 'public.subscribed_websites', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner, 'public.subscribed_websites', 'UPDATE')
     OR NOT has_table_privilege(v_pr_owner, 'public.profiles', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner, 'public.stores', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner, 'public.store_members', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner, 'amaas_internal.payment_review_authorizations', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner, 'amaas_internal.payment_review_authorizations', 'INSERT')
     OR NOT has_table_privilege(v_pr_owner, 'amaas_internal.payment_review_authorizations', 'DELETE') THEN
    RAISE EXCEPTION 'Security invariant check failed: SECURITY DEFINER owner role "%" lacks required schema, auth-helper, or table privileges.',
      v_pr_owner_name;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    WHERE c.oid = 'amaas_internal.payment_review_authorizations'::pg_catalog.regclass
      AND c.relrowsecurity = true
      AND c.relforcerowsecurity = false
      AND c.relowner = v_pr_owner
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'amaas_internal'
      AND tablename = 'payment_review_authorizations'
  ) THEN
    RAISE EXCEPTION 'Security invariant check failed: amaas_internal.payment_review_authorizations must be owner-aligned with RLS enabled and zero permissive policies.';
  END IF;

  -- 7d. Verify exact signatures, owner alignment, SECURITY DEFINER / SECURITY INVOKER mode, EXECUTE grants,
  --     and locked search_path on all 9 payment & role-guard functions, plus zero unexpected overloads.
  SELECT array_agg(
    format('public.%I(%s)', exp.fn_name, exp.fn_args)
    ORDER BY exp.fn_name, exp.fn_args
  )
  INTO v_bad_funcs
  FROM (
    VALUES
      ('is_admin', '', true),
      ('protect_profile_role', '', true),
      ('protect_profile_role_insert', '', true),
      ('is_verified_platform_admin', 'uuid', true),
      ('can_submit_payment_request', 'uuid, uuid, text, text, text', true),
      ('admin_approve_payment_request', 'uuid, text', true),
      ('admin_reject_payment_request', 'uuid, text', true),
      ('protect_payment_request_integrity', '', false),
      ('block_payment_requests_truncate', '', false)
  ) AS exp(fn_name, fn_args, fn_secdef)
  LEFT JOIN (
    SELECT
      p.proname,
      pg_catalog.oidvectortypes(p.proargtypes) AS argtypes,
      p.proowner,
      p.prosecdef,
      p.proconfig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ) cur ON cur.proname = exp.fn_name AND cur.argtypes = exp.fn_args
  WHERE cur.proname IS NULL
     OR cur.proowner <> v_pr_owner
     OR cur.prosecdef IS DISTINCT FROM exp.fn_secdef
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(COALESCE(cur.proconfig, ARRAY[]::TEXT[])) AS cfg
       WHERE cfg ~ '^search_path=\s*"?pg_catalog"?\s*,\s*"?public"?\s*,\s*"?pg_temp"?\s*$'
     );

  IF v_bad_funcs IS NOT NULL AND array_length(v_bad_funcs, 1) > 0 THEN
    RAISE EXCEPTION 'Security invariant check failed: Missing or misconfigured owner, security mode, or search_path on functions: %',
      array_to_string(v_bad_funcs, ', ');
  END IF;

  SELECT array_agg(
    format('public.%I(%s)', p.proname, pg_catalog.oidvectortypes(p.proargtypes))
    ORDER BY p.proname, pg_catalog.oidvectortypes(p.proargtypes)
  )
  INTO v_extra_overloads
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'is_admin',
      'protect_profile_role',
      'protect_profile_role_insert',
      'is_verified_platform_admin',
      'can_submit_payment_request',
      'admin_approve_payment_request',
      'admin_reject_payment_request',
      'protect_payment_request_integrity',
      'block_payment_requests_truncate'
    )
    AND NOT (
      (p.proname = 'is_admin' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
      OR (p.proname = 'protect_profile_role' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
      OR (p.proname = 'protect_profile_role_insert' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
      OR (p.proname = 'is_verified_platform_admin' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid')
      OR (p.proname = 'can_submit_payment_request' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, uuid, text, text, text')
      OR (p.proname = 'admin_approve_payment_request' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text')
      OR (p.proname = 'admin_reject_payment_request' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text')
      OR (p.proname = 'protect_payment_request_integrity' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
      OR (p.proname = 'block_payment_requests_truncate' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
    );

  IF v_extra_overloads IS NOT NULL AND array_length(v_extra_overloads, 1) > 0 THEN
    RAISE EXCEPTION 'Security invariant check failed: Unexpected function overload(s) exist in public: %',
      array_to_string(v_extra_overloads, ', ');
  END IF;

  IF has_function_privilege('anon', 'public.admin_approve_payment_request(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_reject_payment_request(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.can_submit_payment_request(uuid, uuid, text, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.is_verified_platform_admin(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.is_admin()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.protect_payment_request_integrity()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_payment_request_integrity()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.block_payment_requests_truncate()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.block_payment_requests_truncate()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security invariant check failed: Forbidden PUBLIC/anon/authenticated EXECUTE grant detected on payment security functions.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'amaas_internal'
  ) THEN
    RAISE EXCEPTION 'Security invariant check failed: Unexpected routines exist in schema amaas_internal.';
  END IF;

  SELECT array_agg(
    format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.oidvectortypes(p.proargtypes))
    ORDER BY n.nspname, p.proname
  )
  INTO v_bad_funcs
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
    AND p.prosecdef = true
    AND p.proowner = v_pr_owner
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::TEXT[])) AS cfg
      WHERE cfg IN ('search_path=', 'search_path=""', 'search_path=''''')
         OR (
           cfg ~ '^search_path=\s*"?pg_catalog"?(\s*,\s*"?[a-zA-Z0-9_]+"?)*\s*$'
           AND cfg !~ 'pg_temp.*public'
         )
    );

  IF v_bad_funcs IS NOT NULL AND array_length(v_bad_funcs, 1) > 0 THEN
    RAISE EXCEPTION 'Security invariant check failed: Co-owned SECURITY DEFINER routines lack empty or pg_catalog-first search_path: %',
      array_to_string(v_bad_funcs, ', ');
  END IF;

  -- 7e. Verify all 3 partial unique indexes and both enforcement triggers exist and are active
  SELECT count(*) INTO v_valid_idx_count
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = idx.relnamespace
  WHERE i.indrelid = 'public.payment_requests'::pg_catalog.regclass
    AND n.nspname = 'public'
    AND idx.relname IN (
      'uq_payment_requests_active_transaction_id',
      'uq_payment_requests_active_bank_reference',
      'uq_payment_requests_pending_user_service'
    )
    AND i.indisvalid = true
    AND i.indisunique = true;

  IF v_valid_idx_count <> 3 THEN
    RAISE EXCEPTION 'Security invariant check failed: Expected 3 valid unique indexes on public.payment_requests, found %.', v_valid_idx_count;
  END IF;

  SELECT count(*) INTO v_active_trg_count
  FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.payment_requests'::pg_catalog.regclass
    AND NOT t.tgisinternal
    AND t.tgname IN ('trg_protect_payment_request_integrity', 'trg_block_payment_requests_truncate')
    AND t.tgenabled IN ('O', 'A');

  IF v_active_trg_count <> 2 THEN
    RAISE EXCEPTION 'Security invariant check failed: Expected 2 active enforcement triggers on public.payment_requests, found %.', v_active_trg_count;
  END IF;
END $$;

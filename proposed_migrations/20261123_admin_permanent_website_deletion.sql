-- ==============================================================================
-- GoAMAAS Production Migration Candidate (NOT YET APPLIED TO PRODUCTION)
-- Target File: proposed_migrations/20261123_admin_permanent_website_deletion.sql
--
-- Purpose:
--   1. Implement atomic, transactional Permanent Website Deletion RPC expected by
--      /api/admin-website-action:
--        public.admin_permanently_delete_website(UUID, UUID, TEXT, TEXT)
--   2. Preserve shared stores & unrelated merchants, payment history, and audit logs.
--   3. Harden affected trigger functions (store_members, payment_requests,
--      service_trials) without weakening any tenant, membership, or payment rule.
--   4. Add durable, safely retriable Storage cleanup tracking table & RPCs so
--      post-commit Storage deletion can always be retried cleanly after DB commit.
--
-- Prerequisites (must already be installed in target database):
--   - 20261024_harden_payment_requests_ownership_and_uniqueness.sql
--   - 20261026_stores_gateway_pricing_and_admin_hardening.sql
--   - 20261029_website_builder_storage_and_autopublish.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. Prerequisite Schema & Privilege Preflight Verification
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT := '';
BEGIN
  IF pg_catalog.to_regclass('public.subscribed_websites') IS NULL THEN v_missing := v_missing || 'public.subscribed_websites, '; END IF;
  IF pg_catalog.to_regclass('public.stores') IS NULL THEN v_missing := v_missing || 'public.stores, '; END IF;
  IF pg_catalog.to_regclass('public.store_members') IS NULL THEN v_missing := v_missing || 'public.store_members, '; END IF;
  IF pg_catalog.to_regclass('public.products') IS NULL THEN v_missing := v_missing || 'public.products, '; END IF;
  IF pg_catalog.to_regclass('public.orders') IS NULL THEN v_missing := v_missing || 'public.orders, '; END IF;
  IF pg_catalog.to_regclass('public.customers') IS NULL THEN v_missing := v_missing || 'public.customers, '; END IF;
  IF pg_catalog.to_regclass('public.inventory_movements') IS NULL THEN v_missing := v_missing || 'public.inventory_movements, '; END IF;
  IF pg_catalog.to_regclass('public.payment_requests') IS NULL THEN v_missing := v_missing || 'public.payment_requests, '; END IF;
  IF pg_catalog.to_regclass('public.service_trials') IS NULL THEN v_missing := v_missing || 'public.service_trials, '; END IF;
  IF pg_catalog.to_regclass('public.website_lifecycle_audit_logs') IS NULL THEN v_missing := v_missing || 'public.website_lifecycle_audit_logs, '; END IF;
  IF pg_catalog.to_regclass('amaas_internal.payment_review_authorizations') IS NULL THEN v_missing := v_missing || 'amaas_internal.payment_review_authorizations, '; END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'Migration preflight failed: Missing required schema object(s): %', rtrim(v_missing, ', ');
  END IF;

  IF pg_catalog.to_regprocedure('public.is_verified_platform_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migration preflight failed: Function public.is_verified_platform_admin(uuid) is missing. Apply 20261024/20261026 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'website_id'
  ) THEN
    RAISE EXCEPTION 'Migration preflight failed: Column public.products.website_id is missing. Apply 20261029 first.';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 1. Allow 'delete' lifecycle action in public.website_lifecycle_audit_logs
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_constraint RECORD;
BEGIN
  FOR v_constraint IN (
    SELECT c.conname
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'website_lifecycle_audit_logs'
      AND c.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(c.oid) ILIKE '%suspend%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.website_lifecycle_audit_logs DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;
END $$;

ALTER TABLE public.website_lifecycle_audit_logs
  DROP CONSTRAINT IF EXISTS website_lifecycle_audit_logs_action_check;

ALTER TABLE public.website_lifecycle_audit_logs
  ADD CONSTRAINT website_lifecycle_audit_logs_action_check
  CHECK (action IN ('suspend', 'reactivate', 'renew', 'delete'));

-- ------------------------------------------------------------------------------
-- 2. Durable & Safely Retriable Post-Commit Storage Cleanup Outbox Table
--    Captures authoritative owner/website/store scope inside the same atomic
--    DB transaction as deletion so Storage retries can never guess or harm
--    shared-store / other-merchant assets after DB records are deleted.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.website_deletion_storage_cleanups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL UNIQUE,
  audit_log_id UUID REFERENCES public.website_lifecycle_audit_logs(id) ON DELETE RESTRICT,
  admin_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  deleted_store_id UUID,
  preserved_store_id UUID,
  is_shared_store BOOLEAN NOT NULL DEFAULT false,
  store_preserved BOOLEAN NOT NULL DEFAULT false,
  store_preservation_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  subdomain TEXT NOT NULL,
  business_name TEXT,
  cleanup_scope_prefixes JSONB NOT NULL DEFAULT '[]'::jsonb,
  cleanup_object_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  preserved_reference_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  manual_review_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  manual_review_required BOOLEAN NOT NULL DEFAULT false,
  deleted_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_object_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  failed_object_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  cleanup_status TEXT NOT NULL DEFAULT 'pending' CHECK (cleanup_status IN ('pending', 'partial_failed', 'manual_review_required', 'completed', 'skipped')),
  deleted_objects_count INTEGER NOT NULL DEFAULT 0 CHECK (deleted_objects_count >= 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_wdsc_shared_store_consistent CHECK (
    NOT (is_shared_store = true AND deleted_store_id IS NOT NULL)
  ),
  CONSTRAINT chk_wdsc_store_state_consistent CHECK (
    deleted_store_id IS NULL OR preserved_store_id IS NULL
  )
);

ALTER TABLE public.website_deletion_storage_cleanups
  ADD COLUMN IF NOT EXISTS preserved_store_id UUID,
  ADD COLUMN IF NOT EXISTS store_preserved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS store_preservation_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cleanup_object_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preserved_reference_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_review_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_review_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_object_paths JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
DECLARE
  v_chk RECORD;
BEGIN
  FOR v_chk IN (
    SELECT c.conname
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'website_deletion_storage_cleanups'
      AND c.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(c.oid) ILIKE '%cleanup_status%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.website_deletion_storage_cleanups DROP CONSTRAINT %I', v_chk.conname);
  END LOOP;
END $$;

ALTER TABLE public.website_deletion_storage_cleanups
  DROP CONSTRAINT IF EXISTS website_deletion_storage_cleanups_cleanup_status_check;

ALTER TABLE public.website_deletion_storage_cleanups
  ADD CONSTRAINT website_deletion_storage_cleanups_cleanup_status_check
  CHECK (cleanup_status IN ('pending', 'partial_failed', 'manual_review_required', 'completed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_website_deletion_storage_cleanups_status
  ON public.website_deletion_storage_cleanups (cleanup_status, updated_at DESC);

ALTER TABLE public.website_deletion_storage_cleanups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_deletion_storage_cleanups NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'website_deletion_storage_cleanups'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.website_deletion_storage_cleanups', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Website deletion storage cleanups admin select"
  ON public.website_deletion_storage_cleanups FOR SELECT
  TO authenticated
  USING (public.is_verified_platform_admin(auth.uid()));

CREATE POLICY "Website deletion storage cleanups service role policy"
  ON public.website_deletion_storage_cleanups FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.website_deletion_storage_cleanups FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.website_deletion_storage_cleanups TO authenticated;
GRANT ALL ON TABLE public.website_deletion_storage_cleanups TO service_role;

-- ------------------------------------------------------------------------------
-- 2b. Storage Deletion Reservation & Concurrent Writer Guard Registry
--     Tracks candidate paths reserved for post-commit Storage cleanup so any
--     concurrent INSERT/UPDATE on products, subscribed_websites, orders,
--     profiles, stores, or support_tickets immediately aborts deletion for that
--     path inside the writer transaction before Storage DELETE runs.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.storage_deletion_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_path TEXT NOT NULL,
  object_path_lower TEXT NOT NULL UNIQUE,
  website_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  store_id UUID,
  store_preserved BOOLEAN NOT NULL DEFAULT true,
  verification_token UUID,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'referenced_aborted', 'deleted')),
  referenced_by_table TEXT,
  aborted_reason TEXT,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storage_deletion_reservations_website_status
  ON public.storage_deletion_reservations (website_id, status);

ALTER TABLE public.storage_deletion_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_deletion_reservations NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'storage_deletion_reservations'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.storage_deletion_reservations', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Storage deletion reservations service role policy"
  ON public.storage_deletion_reservations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.storage_deletion_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.storage_deletion_reservations TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Harden protect_store_membership() without weakening any merchant/team rules
--    Allows backend service_role or direct table-owner/superuser cascade DELETE
--    when deleting an exclusive store cascades ON DELETE CASCADE to store_members.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_store_membership()
RETURNS trigger AS $$
DECLARE
  v_active_role text;
  v_is_store_owner boolean;
  v_is_platform_admin boolean;
  v_caller_member_role text;
  v_caller_profile_email text;
BEGIN
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');
  v_is_platform_admin := public.is_admin();

  IF NOT v_is_platform_admin THEN
    IF v_active_role = 'service_role' OR session_user = 'service_role' THEN
      v_is_platform_admin := true;
    ELSIF TG_OP = 'DELETE' AND v_active_role IN ('none', current_user) AND auth.uid() IS NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles r
        LEFT JOIN pg_catalog.pg_class c
          ON c.oid = 'public.store_members'::pg_catalog.regclass
         AND c.relowner = r.oid
        WHERE r.rolname = session_user
          AND (r.rolsuper = true OR c.oid IS NOT NULL)
      ) INTO v_is_platform_admin;
    END IF;
  END IF;

  SELECT (s.owner_id = auth.uid()) INTO v_is_store_owner
  FROM public.stores s
  WHERE s.id = COALESCE(NEW.store_id, OLD.store_id);

  v_is_store_owner := COALESCE(v_is_store_owner, false);

  -- 1. Universal Tenant & Identity Integrity
  IF TG_OP = 'UPDATE' AND NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    RAISE EXCEPTION 'Access denied: Cannot transfer membership to another store';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Access denied: Cannot reassign membership user ID';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL AND NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Access denied: Cannot alter email of an established member';
  END IF;

  -- 2. Store Owner or Platform Admin / Verified Backend Maintenance
  IF v_is_platform_admin OR v_is_store_owner THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Identify caller's active role in this store
  SELECT role INTO v_caller_member_role
  FROM public.store_members
  WHERE store_id = COALESCE(NEW.store_id, OLD.store_id)
    AND user_id = auth.uid()
    AND status = 'active';

  -- 3. INSERT (Inviting/Adding Members)
  IF TG_OP = 'INSERT' THEN
    IF v_caller_member_role IS NULL OR v_caller_member_role NOT IN ('admin', 'manager') THEN
      RAISE EXCEPTION 'Access denied: Only store owners or managers can invite team members';
    END IF;

    IF NEW.role IN ('owner', 'admin', 'manager') THEN
      RAISE EXCEPTION 'Access denied: Only the store owner or platform admin can grant privileged roles (owner, admin, manager)';
    END IF;

    IF NEW.status IS DISTINCT FROM 'invited' THEN
      RAISE EXCEPTION 'Access denied: New members can only be created with status invited';
    END IF;

    IF NEW.user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Access denied: Invitations cannot directly assign a user ID; recipients must claim the invitation';
    END IF;

    RETURN NEW;
  END IF;

  -- 4. UPDATE (Modifying Members)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS NULL AND NEW.user_id = auth.uid() THEN
      SELECT email INTO v_caller_profile_email
      FROM public.profiles
      WHERE id = auth.uid();

      IF v_caller_profile_email IS NULL OR LOWER(TRIM(v_caller_profile_email)) IS DISTINCT FROM LOWER(TRIM(OLD.email)) THEN
        RAISE EXCEPTION 'Access denied: You can only claim invitations sent to your verified email address';
      END IF;
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Access denied: Cannot modify role when accepting invitation';
      END IF;
      IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'Access denied: Cannot alter email when accepting invitation';
      END IF;
      IF NEW.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Access denied: Claiming invitation must set status to active';
      END IF;
      RETURN NEW;
    END IF;

    IF OLD.user_id = auth.uid() THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Access denied: Users cannot alter their own store role';
      END IF;
      IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Access denied: Cannot reassign membership user ID';
      END IF;
      IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'Access denied: Cannot reassign membership email address';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Access denied: Users cannot alter their own membership status';
      END IF;
      RETURN NEW;
    END IF;

    IF v_caller_member_role IN ('admin', 'manager') THEN
      IF OLD.role IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'Access denied: Non-owners cannot modify owner, admin, or manager records';
      END IF;
      IF NEW.role IN ('owner', 'admin', 'manager') AND NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Access denied: Only store owner can grant privileged roles';
      END IF;
      IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Access denied: Cannot reassign user ID of members';
      END IF;
      IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'Access denied: Cannot modify email of members';
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Access denied: Insufficient privileges to update membership';
  END IF;

  -- 5. DELETE (Removing Members)
  IF TG_OP = 'DELETE' THEN
    IF OLD.user_id = auth.uid() THEN
      RETURN OLD;
    END IF;

    IF v_caller_member_role IN ('admin', 'manager') THEN
      IF OLD.role IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'Access denied: Managers cannot delete owner, admin, or manager members';
      END IF;
      RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Access denied: Insufficient privileges to remove team member';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_store_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_store_membership() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_store_membership() TO service_role;

-- ------------------------------------------------------------------------------
-- 4. Harden protect_payment_request_integrity() FK ON DELETE SET NULL branch
--    Strictly preserves payment history & all existing approve/reject protections.
--    Permits nulling ONLY payment_requests.store_id when parent store has been
--    deleted, inside verified service_role or direct owner/superuser execution.
-- ------------------------------------------------------------------------------
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
  v_is_service_role := (current_user = 'service_role');

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

  IF TG_OP = 'UPDATE' THEN
    -- Hardened FK ON DELETE SET NULL cascade handler:
    -- Permits nulling payment_requests.store_id ONLY when parent store has been deleted,
    -- within an authenticated service_role execution or direct session owner/superuser context
    -- (never an unprivileged SET ROLE or rogue SECURITY DEFINER from a client session),
    -- with auth.uid() IS NULL and all non-store_id columns strictly preserved.
    IF OLD.store_id IS NOT NULL
       AND NEW.store_id IS NULL
       AND v_caller_id IS NULL
       AND (v_is_service_role OR COALESCE(v_is_current_owner_or_superuser, false))
       AND (
         v_active_role_setting = 'service_role'
         OR (
           COALESCE(v_is_session_owner_or_superuser, false)
           AND v_active_role_setting IN ('none', current_user)
         )
       )
       AND NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = OLD.store_id)
       AND NEW.id IS NOT DISTINCT FROM OLD.id
       AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
       AND NEW.customer_name IS NOT DISTINCT FROM OLD.customer_name
       AND NEW.customer_phone IS NOT DISTINCT FROM OLD.customer_phone
       AND NEW.customer_email IS NOT DISTINCT FROM OLD.customer_email
       AND NEW.service_type IS NOT DISTINCT FROM OLD.service_type
       AND NEW.service_id IS NOT DISTINCT FROM OLD.service_id
       AND NEW.service_name IS NOT DISTINCT FROM OLD.service_name
       AND NEW.plan_tier IS NOT DISTINCT FROM OLD.plan_tier
       AND NEW.amount IS NOT DISTINCT FROM OLD.amount
       AND NEW.currency IS NOT DISTINCT FROM OLD.currency
       AND NEW.payment_method IS NOT DISTINCT FROM OLD.payment_method
       AND NEW.transaction_id IS NOT DISTINCT FROM OLD.transaction_id
       AND NEW.sender_number IS NOT DISTINCT FROM OLD.sender_number
       AND NEW.bank_name IS NOT DISTINCT FROM OLD.bank_name
       AND NEW.bank_account_name IS NOT DISTINCT FROM OLD.bank_account_name
       AND NEW.bank_reference IS NOT DISTINCT FROM OLD.bank_reference
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.admin_notes IS NOT DISTINCT FROM OLD.admin_notes
       AND NEW.reviewed_by IS NOT DISTINCT FROM OLD.reviewed_by
       AND NEW.reviewed_at IS NOT DISTINCT FROM OLD.reviewed_at
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
      NEW.updated_at := NOW();
      RETURN NEW;
    END IF;

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
    IF NEW.amount IS NULL
       OR NEW.amount <= 0
       OR NEW.amount IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC) THEN
      RAISE EXCEPTION 'Invalid payment request amount: amount must be a finite positive number.';
    END IF;

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

      NEW.created_at := NOW();
    ELSE
      NEW.created_at := COALESCE(NEW.created_at, NOW());
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
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

-- ------------------------------------------------------------------------------
-- 5. Harden protect_service_trial_invariants() FK ON DELETE SET NULL branch
--    Keeps website free trials strictly blocked while ensuring any legacy trial
--    row referencing a deleted exclusive store can null store_id cleanly.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_service_trial_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role TEXT;
  v_is_privileged_backend BOOLEAN := false;
  v_clean_service_id TEXT;
BEGIN
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');

  IF v_active_role = 'service_role' OR session_user = 'service_role' THEN
    v_is_privileged_backend := true;
  ELSIF v_active_role IN ('none', current_user) AND auth.uid() IS NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      LEFT JOIN pg_catalog.pg_class c
        ON c.oid = 'public.service_trials'::pg_catalog.regclass
       AND c.relowner = r.oid
      WHERE r.rolname = session_user
        AND (r.rolsuper = true OR c.oid IS NOT NULL)
    ) INTO v_is_privileged_backend;
  END IF;

  -- Safe FK ON DELETE SET NULL cascade handler when an exclusive parent store is deleted
  IF TG_OP = 'UPDATE'
     AND v_is_privileged_backend
     AND auth.uid() IS NULL
     AND OLD.store_id IS NOT NULL
     AND NEW.store_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = OLD.store_id)
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.service_id IS NOT DISTINCT FROM OLD.service_id
     AND NEW.service_name IS NOT DISTINCT FROM OLD.service_name
     AND NEW.service_category IS NOT DISTINCT FROM OLD.service_category
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.started_at IS NOT DISTINCT FROM OLD.started_at
     AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  v_clean_service_id := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.service_id, '')));

  IF NEW.service_category = 'website'
     OR NEW.service_category NOT IN ('dashboard', 'ai_automation', 'landing_pages')
     OR v_clean_service_id IN ('website_lite', 'business_website_lite', 'bespoke_web_dev') THEN
    RAISE EXCEPTION 'Free trials are not available for Website Service. Paid verification is required.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_privileged_backend AND NOT public.is_admin() THEN
      IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Access denied: Service trial must belong to the authenticated user.';
      END IF;
      IF NEW.store_id IS NOT NULL AND NOT public.can_access_store(NEW.store_id) THEN
        RAISE EXCEPTION 'Access denied: Invalid or unauthorized store_id for service trial.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Cannot alter ownership of a service trial';
    END IF;
    IF NEW.service_id IS DISTINCT FROM OLD.service_id THEN
      RAISE EXCEPTION 'Cannot alter the service_id of an existing trial';
    END IF;
    IF NEW.service_category IS DISTINCT FROM OLD.service_category THEN
      RAISE EXCEPTION 'Cannot alter the service_category of an existing trial';
    END IF;
    IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN
      RAISE EXCEPTION 'Cannot modify the start timestamp of an existing trial';
    END IF;
    IF NEW.store_id IS DISTINCT FROM OLD.store_id
       AND NEW.store_id IS NOT NULL
       AND NOT v_is_privileged_backend
       AND NOT public.is_admin()
       AND NOT public.can_access_store(NEW.store_id) THEN
      RAISE EXCEPTION 'Access denied: Invalid or unauthorized store_id for service trial.';
    END IF;
    IF NEW.expires_at > OLD.expires_at AND NOT v_is_privileged_backend AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only an administrator can extend a trial period';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_service_trial_invariants() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_service_trial_invariants() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_service_trial_invariants() TO service_role;

-- ------------------------------------------------------------------------------
-- 6. Minimum Required Table Permissions (Least-Privilege Only)
--    admin_permanently_delete_website() runs as SECURITY INVOKER via service_role.
--    orders, customers, and inventory_movements are only COUNT(*)-inspected;
--    ON DELETE CASCADE from public.stores executes under table owner privileges.
-- ------------------------------------------------------------------------------
GRANT SELECT ON TABLE public.orders TO service_role;
GRANT SELECT ON TABLE public.customers TO service_role;
GRANT SELECT ON TABLE public.inventory_movements TO service_role;

-- ------------------------------------------------------------------------------
-- 6b. Storage Asset Path Extraction & Global Cross-Table Reference Scanner
--     Walks products, subscribed_websites (live config + draft + productCatalogMeta
--     + sections + nested items), orders (items + branding snapshots), stores
--     (logo_url), profiles (avatar_url), and support_tickets (messages).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.extract_website_asset_path(p_raw_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_trimmed TEXT;
  v_lower TEXT;
  v_match TEXT[];
  v_rel TEXT;
BEGIN
  v_trimmed := pg_catalog.btrim(COALESCE(p_raw_value, ''));
  IF v_trimmed = '' THEN
    RETURN NULL;
  END IF;

  v_lower := pg_catalog.lower(v_trimmed);
  IF v_lower LIKE 'data:%' OR v_lower LIKE 'blob:%' THEN
    RETURN NULL;
  END IF;

  v_match := pg_catalog.regexp_match(
    v_trimmed,
    '/storage/v1/object/(?:public/|sign/|authenticated/)?website-assets/([^?#]+)',
    'i'
  );
  IF v_match IS NOT NULL AND v_match[1] IS NOT NULL THEN
    v_rel := v_match[1];
  ELSIF v_lower LIKE 'website-assets/%' THEN
    v_rel := pg_catalog.regexp_replace(pg_catalog.substr(v_trimmed, 16), '[?#].*$', '');
  ELSE
    RETURN NULL;
  END IF;

  v_rel := pg_catalog.replace(v_rel, '%20', ' ');
  v_rel := pg_catalog.replace(v_rel, '%2F', '/');
  v_rel := pg_catalog.replace(v_rel, '%2f', '/');
  v_rel := pg_catalog.ltrim(pg_catalog.btrim(v_rel), '/');

  IF v_rel = ''
     OR pg_catalog.strpos(v_rel, '..') > 0
     OR pg_catalog.strpos(v_rel, '\') > 0
     OR pg_catalog.strpos(v_rel, '%00') > 0 THEN
    RETURN NULL;
  END IF;

  RETURN v_rel;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_supabase_storage_url_or_path(p_raw_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_lower TEXT;
BEGIN
  v_lower := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_raw_value, '')));
  IF v_lower = '' OR v_lower LIKE 'data:%' OR v_lower LIKE 'blob:%' THEN
    RETURN false;
  END IF;
  RETURN (
    v_lower LIKE '%/storage/v1/object/%'
    OR v_lower LIKE 'website-assets/%'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.jsonb_collect_website_asset_paths(p_doc JSONB)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH RECURSIVE nodes(val) AS (
    SELECT p_doc
    WHERE p_doc IS NOT NULL
    UNION ALL
    SELECT sub.elem
    FROM nodes n,
    LATERAL (
      SELECT e.value AS elem
      FROM pg_catalog.jsonb_each(n.val) e
      WHERE pg_catalog.jsonb_typeof(n.val) = 'object'
      UNION ALL
      SELECT a.value AS elem
      FROM pg_catalog.jsonb_array_elements(n.val) a
      WHERE pg_catalog.jsonb_typeof(n.val) = 'array'
    ) sub
  )
  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT extracted) FILTER (WHERE extracted IS NOT NULL),
    ARRAY[]::TEXT[]
  )
  FROM (
    SELECT public.extract_website_asset_path(nodes.val #>> '{}') AS extracted
    FROM nodes
    WHERE pg_catalog.jsonb_typeof(nodes.val) = 'string'
  ) leaf_paths;
$$;

CREATE OR REPLACE FUNCTION public.jsonb_collect_uncertain_storage_refs(p_doc JSONB)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH RECURSIVE nodes(val) AS (
    SELECT p_doc
    WHERE p_doc IS NOT NULL
    UNION ALL
    SELECT sub.elem
    FROM nodes n,
    LATERAL (
      SELECT e.value AS elem
      FROM pg_catalog.jsonb_each(n.val) e
      WHERE pg_catalog.jsonb_typeof(n.val) = 'object'
      UNION ALL
      SELECT a.value AS elem
      FROM pg_catalog.jsonb_array_elements(n.val) a
      WHERE pg_catalog.jsonb_typeof(n.val) = 'array'
    ) sub
  )
  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT raw_val) FILTER (WHERE raw_val IS NOT NULL),
    ARRAY[]::TEXT[]
  )
  FROM (
    SELECT NULLIF(pg_catalog.btrim(nodes.val #>> '{}'), '') AS raw_val
    FROM nodes
    WHERE pg_catalog.jsonb_typeof(nodes.val) = 'string'
      AND public.is_supabase_storage_url_or_path(nodes.val #>> '{}')
      AND public.extract_website_asset_path(nodes.val #>> '{}') IS NULL
  ) uncertain_refs;
$$;

CREATE OR REPLACE FUNCTION public.find_surviving_website_asset_references(
  p_candidate_paths TEXT[],
  p_exclude_website_id UUID DEFAULT NULL,
  p_exclude_product_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_exclude_store_id UUID DEFAULT NULL
)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_norm_candidates TEXT[];
  v_excl_prod_ids UUID[] := COALESCE(p_exclude_product_ids, ARRAY[]::UUID[]);
  v_ref_paths_lower TEXT[] := ARRAY[]::TEXT[];
  v_matched TEXT[] := ARRAY[]::TEXT[];
  v_ticket_matches TEXT[];
BEGIN
  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT pg_catalog.lower(pg_catalog.btrim(c))),
    ARRAY[]::TEXT[]
  )
  INTO v_norm_candidates
  FROM pg_catalog.unnest(COALESCE(p_candidate_paths, ARRAY[]::TEXT[])) AS c
  WHERE NULLIF(pg_catalog.btrim(COALESCE(c, '')), '') IS NOT NULL;

  IF COALESCE(pg_catalog.array_length(v_norm_candidates, 1), 0) = 0 THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  -- 1. Surviving public.products across ALL stores/merchants
  SELECT COALESCE(
    pg_catalog.array_cat(
      v_ref_paths_lower,
      COALESCE(
        (
          SELECT pg_catalog.array_agg(DISTINCT pg_catalog.lower(public.extract_website_asset_path(p.image_url)))
          FROM public.products p
          WHERE NOT (p.id = ANY(v_excl_prod_ids))
            AND (p_exclude_store_id IS NULL OR p.store_id IS DISTINCT FROM p_exclude_store_id)
            AND public.extract_website_asset_path(p.image_url) IS NOT NULL
            AND pg_catalog.lower(public.extract_website_asset_path(p.image_url)) = ANY(v_norm_candidates)
        ),
        ARRAY[]::TEXT[]
      )
    ),
    ARRAY[]::TEXT[]
  ) INTO v_ref_paths_lower;

  -- 2. Surviving public.subscribed_websites across ALL merchants/stores (live config + draft + productCatalogMeta + sections)
  SELECT COALESCE(
    pg_catalog.array_cat(
      v_ref_paths_lower,
      COALESCE(
        (
          SELECT pg_catalog.array_agg(DISTINCT pg_catalog.lower(rp))
          FROM public.subscribed_websites sw
          CROSS JOIN LATERAL pg_catalog.unnest(public.jsonb_collect_website_asset_paths(sw.config)) AS rp
          WHERE (p_exclude_website_id IS NULL OR sw.id IS DISTINCT FROM p_exclude_website_id)
            AND sw.config IS NOT NULL
            AND pg_catalog.lower(rp) = ANY(v_norm_candidates)
        ),
        ARRAY[]::TEXT[]
      )
    ),
    ARRAY[]::TEXT[]
  ) INTO v_ref_paths_lower;

  -- 3. Surviving public.orders across ALL surviving stores (order items & branding snapshots)
  SELECT COALESCE(
    pg_catalog.array_cat(
      v_ref_paths_lower,
      COALESCE(
        (
          SELECT pg_catalog.array_agg(DISTINCT pg_catalog.lower(op))
          FROM public.orders o
          CROSS JOIN LATERAL pg_catalog.unnest(public.jsonb_collect_website_asset_paths(o.items)) AS op
          WHERE (p_exclude_store_id IS NULL OR o.store_id IS DISTINCT FROM p_exclude_store_id)
            AND o.items IS NOT NULL
            AND pg_catalog.lower(op) = ANY(v_norm_candidates)
        ),
        ARRAY[]::TEXT[]
      )
    ),
    ARRAY[]::TEXT[]
  ) INTO v_ref_paths_lower;

  -- 4. Surviving public.stores (logo_url checked safely via to_jsonb so schema differences never error)
  SELECT COALESCE(
    pg_catalog.array_cat(
      v_ref_paths_lower,
      COALESCE(
        (
          SELECT pg_catalog.array_agg(DISTINCT pg_catalog.lower(public.extract_website_asset_path(pg_catalog.to_jsonb(s)->>'logo_url')))
          FROM public.stores s
          WHERE (p_exclude_store_id IS NULL OR s.id IS DISTINCT FROM p_exclude_store_id)
            AND public.extract_website_asset_path(pg_catalog.to_jsonb(s)->>'logo_url') IS NOT NULL
            AND pg_catalog.lower(public.extract_website_asset_path(pg_catalog.to_jsonb(s)->>'logo_url')) = ANY(v_norm_candidates)
        ),
        ARRAY[]::TEXT[]
      )
    ),
    ARRAY[]::TEXT[]
  ) INTO v_ref_paths_lower;

  -- 5. Surviving public.profiles (avatar_url checked safely via to_jsonb)
  SELECT COALESCE(
    pg_catalog.array_cat(
      v_ref_paths_lower,
      COALESCE(
        (
          SELECT pg_catalog.array_agg(DISTINCT pg_catalog.lower(public.extract_website_asset_path(pg_catalog.to_jsonb(pr)->>'avatar_url')))
          FROM public.profiles pr
          WHERE public.extract_website_asset_path(pg_catalog.to_jsonb(pr)->>'avatar_url') IS NOT NULL
            AND pg_catalog.lower(public.extract_website_asset_path(pg_catalog.to_jsonb(pr)->>'avatar_url')) = ANY(v_norm_candidates)
        ),
        ARRAY[]::TEXT[]
      )
    ),
    ARRAY[]::TEXT[]
  ) INTO v_ref_paths_lower;

  -- 6. Surviving public.support_tickets (messages JSONB if table exists)
  IF pg_catalog.to_regclass('public.support_tickets') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT COALESCE(
        pg_catalog.array_agg(DISTINCT pg_catalog.lower(tp)),
        ARRAY[]::TEXT[]
      )
      FROM public.support_tickets st
      CROSS JOIN LATERAL pg_catalog.unnest(public.jsonb_collect_website_asset_paths(st.messages)) AS tp
      WHERE st.messages IS NOT NULL
        AND pg_catalog.lower(tp) = ANY($1)
    $sql$
    INTO v_ticket_matches
    USING v_norm_candidates;

    v_ref_paths_lower := pg_catalog.array_cat(v_ref_paths_lower, COALESCE(v_ticket_matches, ARRAY[]::TEXT[]));
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT c ORDER BY c),
    ARRAY[]::TEXT[]
  )
  INTO v_matched
  FROM pg_catalog.unnest(COALESCE(p_candidate_paths, ARRAY[]::TEXT[])) AS c
  WHERE pg_catalog.lower(pg_catalog.btrim(COALESCE(c, ''))) = ANY(COALESCE(v_ref_paths_lower, ARRAY[]::TEXT[]));

  RETURN v_matched;
END;
$$;

REVOKE ALL ON FUNCTION public.find_surviving_website_asset_references(TEXT[], UUID, UUID[], UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_surviving_website_asset_references(TEXT[], UUID, UUID[], UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_surviving_website_asset_references(TEXT[], UUID, UUID[], UUID) TO service_role;

-- ------------------------------------------------------------------------------
-- 6c. Concurrent Writer Reservation-Guard Trigger Function
--     Ensures NO application writer (API route, RPC, or client SDK) can
--     silently introduce a surviving reference to a Storage object queued for
--     deletion without immediately flagging the reservation referenced_aborted.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_reserved_storage_paths()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_written_paths TEXT[] := ARRAY[]::TEXT[];
  v_written_lower TEXT[] := ARRAY[]::TEXT[];
  v_single_path TEXT;
  v_res RECORD;
BEGIN
  -- Fast O(1) bypass when no active un-deleted Storage reservation exists
  IF NOT EXISTS (
    SELECT 1
    FROM public.storage_deletion_reservations r
    WHERE r.status = 'reserved'
      AND r.expires_at > NOW()
  ) THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'products' THEN
    v_single_path := public.extract_website_asset_path(NEW.image_url);
    IF v_single_path IS NOT NULL THEN
      v_written_paths := ARRAY[v_single_path];
    END IF;
  ELSIF TG_TABLE_NAME = 'subscribed_websites' THEN
    v_written_paths := public.jsonb_collect_website_asset_paths(NEW.config);
  ELSIF TG_TABLE_NAME = 'orders' THEN
    v_written_paths := public.jsonb_collect_website_asset_paths(NEW.items);
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    v_single_path := public.extract_website_asset_path(pg_catalog.to_jsonb(NEW)->>'avatar_url');
    IF v_single_path IS NOT NULL THEN
      v_written_paths := ARRAY[v_single_path];
    END IF;
  ELSIF TG_TABLE_NAME = 'stores' THEN
    v_single_path := public.extract_website_asset_path(pg_catalog.to_jsonb(NEW)->>'logo_url');
    IF v_single_path IS NOT NULL THEN
      v_written_paths := ARRAY[v_single_path];
    END IF;
  ELSIF TG_TABLE_NAME = 'support_tickets' THEN
    v_written_paths := public.jsonb_collect_website_asset_paths(NEW.messages);
  END IF;

  IF COALESCE(pg_catalog.array_length(v_written_paths, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(DISTINCT pg_catalog.lower(p)), ARRAY[]::TEXT[])
  INTO v_written_lower
  FROM pg_catalog.unnest(v_written_paths) AS p
  WHERE NULLIF(pg_catalog.btrim(COALESCE(p, '')), '') IS NOT NULL;

  IF COALESCE(pg_catalog.array_length(v_written_lower, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;

  FOR v_res IN
    SELECT r.id, r.website_id, r.object_path, r.object_path_lower
    FROM public.storage_deletion_reservations r
    WHERE r.object_path_lower = ANY(v_written_lower)
      AND r.status IN ('reserved', 'deleted')
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('storage_path:' || v_res.object_path_lower, 0)
    );

    UPDATE public.storage_deletion_reservations
    SET
      status = 'referenced_aborted',
      referenced_by_table = TG_TABLE_NAME,
      aborted_reason = 'Concurrent write to ' || TG_TABLE_NAME || ' referenced reserved object path',
      updated_at = NOW()
    WHERE id = v_res.id;

    UPDATE public.website_deletion_storage_cleanups wc
    SET
      preserved_reference_paths = CASE
        WHEN wc.preserved_reference_paths @> pg_catalog.jsonb_build_array(v_res.object_path)
          THEN wc.preserved_reference_paths
        ELSE wc.preserved_reference_paths || pg_catalog.jsonb_build_array(v_res.object_path)
      END,
      updated_at = NOW()
    WHERE wc.website_id = v_res.website_id;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_reserved_storage_paths() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_reserved_storage_paths() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_reserved_storage_paths() TO service_role;

DROP TRIGGER IF EXISTS trg_guard_reserved_storage_paths_products ON public.products;
CREATE TRIGGER trg_guard_reserved_storage_paths_products
  AFTER INSERT OR UPDATE OF image_url ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_reserved_storage_paths();

DROP TRIGGER IF EXISTS trg_guard_reserved_storage_paths_subscribed_websites ON public.subscribed_websites;
CREATE TRIGGER trg_guard_reserved_storage_paths_subscribed_websites
  AFTER INSERT OR UPDATE OF config ON public.subscribed_websites
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_reserved_storage_paths();

DROP TRIGGER IF EXISTS trg_guard_reserved_storage_paths_orders ON public.orders;
CREATE TRIGGER trg_guard_reserved_storage_paths_orders
  AFTER INSERT OR UPDATE OF items ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_reserved_storage_paths();

DROP TRIGGER IF EXISTS trg_guard_reserved_storage_paths_profiles ON public.profiles;
CREATE TRIGGER trg_guard_reserved_storage_paths_profiles
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_reserved_storage_paths();

DROP TRIGGER IF EXISTS trg_guard_reserved_storage_paths_stores ON public.stores;
CREATE TRIGGER trg_guard_reserved_storage_paths_stores
  AFTER INSERT OR UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_reserved_storage_paths();

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.support_tickets') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_guard_reserved_storage_paths_support_tickets ON public.support_tickets;
    CREATE TRIGGER trg_guard_reserved_storage_paths_support_tickets
      AFTER INSERT OR UPDATE OF messages ON public.support_tickets
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_reserved_storage_paths();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7. Atomic Permanent Website + Exclusive Store Deletion RPC (service_role only)
--    Matches exact signature required by api/admin-website-action.ts:
--      public.admin_permanently_delete_website(UUID, UUID, TEXT, TEXT)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_permanently_delete_website(
  p_website_id UUID,
  p_admin_id UUID,
  p_confirm_subdomain TEXT,
  p_reason TEXT DEFAULT 'Permanent administrative deletion'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role TEXT;
  v_is_service_or_owner BOOLEAN := false;
  v_site RECORD;
  v_locked_store RECORD;
  v_clean_confirm TEXT;
  v_clean_reason TEXT;
  v_site_subdomain TEXT;
  v_site_full_domain TEXT;
  v_locked_store_id UUID := NULL;
  v_is_shared_store BOOLEAN := false;
  v_store_preserved BOOLEAN := false;
  v_store_preserve_reasons TEXT[] := ARRAY[]::TEXT[];
  v_exclusive_store_id UUID := NULL;
  v_orphan_prod_count INTEGER := 0;
  v_orphan_store_count INTEGER := 0;
  v_has_ambiguous_orphans BOOLEAN := false;
  v_exclusive_product_ids UUID[] := ARRAY[]::UUID[];
  v_all_deleted_product_ids UUID[] := ARRAY[]::UUID[];
  v_preserved_shared_product_ids UUID[] := ARRAY[]::UUID[];
  v_deleted_product_image_urls JSONB := '[]'::jsonb;
  v_cleanup_object_paths JSONB := '[]'::jsonb;
  v_preserved_reference_paths JSONB := '[]'::jsonb;
  v_manual_review_paths JSONB := '[]'::jsonb;
  v_manual_review_required BOOLEAN := false;
  v_candidate_prod_paths TEXT[] := ARRAY[]::TEXT[];
  v_candidate_site_paths TEXT[] := ARRAY[]::TEXT[];
  v_all_candidate_paths TEXT[] := ARRAY[]::TEXT[];
  v_referenced_paths_lower TEXT[] := ARRAY[]::TEXT[];
  v_uncertain_raw TEXT;
  v_deleted_products INTEGER := 0;
  v_deleted_inventory INTEGER := 0;
  v_deleted_customers INTEGER := 0;
  v_deleted_orders INTEGER := 0;
  v_deleted_members INTEGER := 0;
  v_audit_id UUID;
  v_cleanup_job_id UUID;
  v_scope_prefixes JSONB := '[]'::jsonb;
  v_initial_cleanup_status TEXT := 'pending';
  v_prod RECORD;
  v_is_referenced_by_sibling BOOLEAN := false;
  v_has_website_footprint BOOLEAN := false;
  v_has_owner_onboarded_profile BOOLEAN := false;
  v_has_other_profile BOOLEAN := false;
  v_has_team_members BOOLEAN := false;
  v_has_non_website_products BOOLEAN := false;
  v_has_non_website_orders BOOLEAN := false;
  v_has_non_website_customers BOOLEAN := false;
  v_has_non_website_inventory BOOLEAN := false;
  v_has_non_website_trials BOOLEAN := false;
  v_has_non_website_payments BOOLEAN := false;
  v_rel_storage_path TEXT;
  v_rel_lower TEXT;
  v_site_prefix_lower TEXT;
  v_excl_store_prefix_lower TEXT;
  v_locked_store_prod_prefix_lower TEXT;
  v_owner_matches_store BOOLEAN := false;
BEGIN
  -- Defense-in-depth caller role verification (in addition to GRANT EXECUTE TO service_role only)
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');
  IF v_active_role IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Access denied: Permanent website deletion RPC cannot execute under client roles.';
  END IF;

  v_is_service_or_owner := (
    current_user = 'service_role'
    OR v_active_role = 'service_role'
    OR (
      auth.uid() IS NULL
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles r
        LEFT JOIN pg_catalog.pg_class c
          ON c.oid = 'public.subscribed_websites'::pg_catalog.regclass
         AND c.relowner = r.oid
        WHERE r.rolname = current_user
          AND (r.rolsuper = true OR c.oid IS NOT NULL)
      )
    )
  );

  IF NOT v_is_service_or_owner THEN
    RAISE EXCEPTION 'Access denied: Permanent website deletion RPC requires verified service_role execution.';
  END IF;

  IF p_website_id IS NULL THEN
    RAISE EXCEPTION 'Target website ID is required for permanent deletion';
  END IF;

  -- Strict DB-level verification of the primary platform administrator identity
  IF p_admin_id IS NULL
     OR NOT public.is_verified_platform_admin(p_admin_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles pr
       WHERE pr.id = p_admin_id
         AND pr.role = 'admin'
         AND pg_catalog.lower(pg_catalog.btrim(COALESCE(pr.email, ''))) = 'official.amaas.dev@gmail.com'
     ) THEN
    RAISE EXCEPTION 'Only verified primary platform administrators can permanently delete websites';
  END IF;

  v_clean_confirm := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_confirm_subdomain, '')));
  v_clean_reason := COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), ''), 'Permanent administrative deletion');

  -- Transactional lock & deadlock subtransaction guard
  BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('website_cleanup:' || p_website_id::TEXT, 0)
    );

    SELECT *
    INTO v_site
    FROM public.subscribed_websites
    WHERE id = p_website_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'NOT_FOUND',
        'message', 'Subscribed website record not found.'
      );
    END IF;

    v_site_subdomain := pg_catalog.lower(pg_catalog.btrim(COALESCE(v_site.subdomain, '')));
    v_site_full_domain := pg_catalog.lower(
      pg_catalog.btrim(
        COALESCE(
          NULLIF(v_site.full_domain, ''),
          CASE WHEN v_site_subdomain <> '' THEN v_site_subdomain || '.amaas.xyz' ELSE '' END
        )
      )
    );

    IF v_site_subdomain = ''
       OR v_clean_confirm = ''
       OR (v_clean_confirm IS DISTINCT FROM v_site_subdomain AND v_clean_confirm IS DISTINCT FROM v_site_full_domain) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'SUBDOMAIN_CONFIRMATION_MISMATCH',
        'message', 'Subdomain confirmation does not match target website.'
      );
    END IF;

    IF v_site.store_id IS NOT NULL THEN
      -- Lock parent store BEFORE checking sibling websites or non-website usage
      -- so concurrent operations serialize cleanly.
      SELECT *
      INTO v_locked_store
      FROM public.stores
      WHERE id = v_site.store_id
      FOR UPDATE;

      IF FOUND THEN
        v_locked_store_id := v_locked_store.id;
      END IF;

      -- Inspect all products tied to this website inside the locked store FIRST
      -- (locking them consistently and distinguishing truly website-exclusive products
      -- from products showcased/referenced by surviving websites).
      IF v_locked_store_id IS NOT NULL THEN
        FOR v_prod IN
          SELECT p.id, p.image_url
          FROM public.products p
          WHERE p.store_id = v_locked_store_id
            AND p.website_id = p_website_id
          ORDER BY p.id
          FOR UPDATE
        LOOP
          SELECT EXISTS (
            SELECT 1
            FROM public.subscribed_websites sw2
            WHERE sw2.id <> p_website_id
              AND (
                sw2.store_id = v_locked_store_id
                OR (v_site.user_id IS NOT NULL AND sw2.user_id = v_site.user_id)
              )
              AND (
                EXISTS (
                  SELECT 1
                  FROM pg_catalog.jsonb_array_elements(
                    CASE
                      WHEN pg_catalog.jsonb_typeof(sw2.config->'servicesOrProducts') = 'array'
                      THEN sw2.config->'servicesOrProducts'
                      ELSE '[]'::jsonb
                    END
                  ) AS item
                  WHERE pg_catalog.lower(COALESCE(NULLIF(item->>'productId', ''), item->>'id', '')) = pg_catalog.lower(v_prod.id::TEXT)
                )
                OR EXISTS (
                  SELECT 1
                  FROM pg_catalog.jsonb_array_elements(
                    CASE
                      WHEN pg_catalog.jsonb_typeof(sw2.config->'items') = 'array'
                      THEN sw2.config->'items'
                      ELSE '[]'::jsonb
                    END
                  ) AS item2
                  WHERE pg_catalog.lower(COALESCE(NULLIF(item2->>'productId', ''), item2->>'id', '')) = pg_catalog.lower(v_prod.id::TEXT)
                )
                OR EXISTS (
                  SELECT 1
                  FROM pg_catalog.jsonb_array_elements(
                    CASE
                      WHEN pg_catalog.jsonb_typeof(sw2.config->'draft'->'servicesOrProducts') = 'array'
                      THEN sw2.config->'draft'->'servicesOrProducts'
                      ELSE '[]'::jsonb
                    END
                  ) AS ditem
                  WHERE pg_catalog.lower(COALESCE(NULLIF(ditem->>'productId', ''), ditem->>'id', '')) = pg_catalog.lower(v_prod.id::TEXT)
                )
                OR (
                  pg_catalog.jsonb_typeof(sw2.config->'productCatalogMeta') = 'object'
                  AND (sw2.config->'productCatalogMeta' ? v_prod.id::TEXT)
                  AND pg_catalog.lower(COALESCE(sw2.config->'productCatalogMeta'->(v_prod.id::TEXT)->>'isVisible', 'true')) <> 'false'
                )
                OR (
                  pg_catalog.jsonb_typeof(sw2.config->'draft'->'productCatalogMeta') = 'object'
                  AND (sw2.config->'draft'->'productCatalogMeta' ? v_prod.id::TEXT)
                  AND pg_catalog.lower(COALESCE(sw2.config->'draft'->'productCatalogMeta'->(v_prod.id::TEXT)->>'isVisible', 'true')) <> 'false'
                )
              )
          ) INTO v_is_referenced_by_sibling;

          IF COALESCE(v_is_referenced_by_sibling, false) THEN
            v_preserved_shared_product_ids := pg_catalog.array_append(v_preserved_shared_product_ids, v_prod.id);
          ELSE
            v_exclusive_product_ids := pg_catalog.array_append(v_exclusive_product_ids, v_prod.id);
          END IF;
        END LOOP;

        -- ------------------------------------------------------------------
        -- ISSUE 2: Comprehensive Store Exclusivity Verification across ALL
        -- schema references to stores(id):
        --   subscribed_websites, profiles, store_members, products, orders,
        --   customers, inventory_movements, service_trials, payment_requests.
        -- Only delete the store when ownership AND exclusive website
        -- association are conclusively established.
        -- ------------------------------------------------------------------
        IF v_site.user_id IS NULL OR v_locked_store.owner_id IS DISTINCT FROM v_site.user_id THEN
          v_store_preserve_reasons := pg_catalog.array_append(v_store_preserve_reasons, 'ownership_mismatch');
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.subscribed_websites sw
          WHERE sw.store_id = v_locked_store_id
            AND sw.id <> p_website_id
        ) INTO v_is_shared_store;

        IF v_is_shared_store THEN
          v_store_preserve_reasons := pg_catalog.array_append(v_store_preserve_reasons, 'sibling_websites');
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.profiles pr
          WHERE pr.store_id = v_locked_store_id
            AND (v_site.user_id IS NULL OR pr.id IS DISTINCT FROM v_site.user_id)
        ) INTO v_has_other_profile;

        IF v_has_other_profile THEN
          v_store_preserve_reasons := pg_catalog.array_append(v_store_preserve_reasons, 'other_user_profile_store_link');
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.profiles pr
          WHERE pr.id = v_site.user_id
            AND pr.store_id = v_locked_store_id
            AND COALESCE(pr.onboarding_completed, false) = true
        ) INTO v_has_owner_onboarded_profile;

        IF v_has_owner_onboarded_profile THEN
          v_store_preserve_reasons := pg_catalog.array_append(v_store_preserve_reasons, 'merchant_dashboard_onboarded_store');
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.store_members sm
          WHERE sm.store_id = v_locked_store_id
            AND (
              v_site.user_id IS NULL
              OR sm.user_id IS DISTINCT FROM v_site.user_id
              OR sm.role IS DISTINCT FROM 'owner'
              OR sm.status IS DISTINCT FROM 'active'
            )
        ) INTO v_has_team_members;

        IF v_has_team_members THEN
          v_store_preserve_reasons := pg_catalog.array_append(v_store_preserve_reasons, 'team_store_members');
        END IF;

        SELECT (
          COALESCE(pg_catalog.array_length(v_preserved_shared_product_ids, 1), 0) > 0
          OR EXISTS (
            SELECT 1
            FROM public.products p
            WHERE p.store_id = v_locked_store_id
              AND (p.website_id IS NULL OR p.website_id IS DISTINCT FROM p_website_id)
          )
        ) INTO v_has_non_website_products;

        IF v_has_non_website_products THEN
          v_store_preserve_reasons := pg_catalog.array_append(v_store_preserve_reasons, 'non_website_or_shared_products');
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.store_id = v_locked_store_id
            AND NOT (
              pg_catalog.lower(pg_catalog.btrim(COALESCE(o.items->0->'orderMeta'->>'websiteId', ''))) = pg_catalog.lower(p_website_id::TEXT)
              OR (
                NULLIF(pg_catalog.btrim(COALESCE(o.items->0->'orderMeta'->>'websiteId', '')), '') IS NULL
                AND (
                  pg_catalog.lower(pg_catalog.btrim(COALESCE(o.items->0->'orderMeta'->>'websiteSubdomain', o.items->0->'orderMeta'->>'subdomain', ''))) = v_site_subdomain
                  OR (
                    v_site_subdomain <> ''
                    AND pg_catalog.lower(pg_catalog.btrim(COALESCE(o.source, ''))) IN (
                      'website (' || v_site_subdomain || '.amaas.xyz)',
                      'website (' || v_site_full_domain || ')'
                    )
                  )
                )
              )
            )
        ) INTO v_has_non_website_orders;

        IF v_has_non_website_orders THEN
          v_store_preserve_reasons := pg_catalog.array_append(v_store_preserve_reasons, 'non_website_orders');
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.customers c
          WHERE c.store_id = v_locked_store_id
            AND NOT EXISTS (
              SELECT 1
              FROM public.orders o
              WHERE o.store_id = v_locked_store_id
                AND (
                  pg_catalog.lower(pg_catalog.btrim(COALESCE(o.items->0->'orderMeta'->>'websiteId', ''))) = pg_catalog.lower(p_website_id::TEXT)
                  OR (
                    NULLIF(pg_catalog.btrim(COALESCE(o.items->0->'orderMeta'->>'websiteId', '')), '') IS NULL
                    AND (
                      pg_catalog.lower(pg_catalog.btrim(COALESCE(o.items->0->'orderMeta'->>'websiteSubdomain', o.items->0->'orderMeta'->>'subdomain', ''))) = v_site_subdomain
                      OR (
                        v_site_subdomain <> ''
                        AND pg_catalog.lower(pg_catalog.btrim(COALESCE(o.source, ''))) IN (
                          'website (' || v_site_subdomain || '.amaas.xyz)',
                          'website (' || v_site_full_domain || ')'
                        )
                      )
                    )
                  )
                )
                AND (
                  (NULLIF(pg_catalog.btrim(COALESCE(c.phone, '')), '') IS NOT NULL
                   AND pg_catalog.btrim(COALESCE(o.customer_phone, '')) = pg_catalog.btrim(COALESCE(c.phone, '')))
                  OR (NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(c.email, ''))), '') IS NOT NULL
                      AND pg_catalog.lower(pg_catalog.btrim(COALESCE(o.customer_email, ''))) = pg_catalog.lower(pg_catalog.btrim(COALESCE(c.email, ''))))
                )
            )
        ) INTO v_has_non_website_customers;

        IF v_has_non_website_customers THEN
          v_store_preserve_reasons := pg_catalog.array_append(v_store_preserve_reasons, 'non_website_customers');
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.inventory_movements im
          WHERE im.store_id = v_locked_store_id
            AND NOT (im.product_id = ANY(COALESCE(v_exclusive_product_ids, ARRAY[]::UUID[])))
        ) INTO v_has_non_website_inventory;

        IF v_has_non_website_inventory THEN
          v_store_preserve_reasons := pg_catalog.array_append(v_store_preserve_reasons, 'non_website_inventory_movements');
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.service_trials st
          WHERE st.store_id = v_locked_store_id
            AND st.service_category IN ('dashboard', 'ai_automation', 'landing_pages')
        ) INTO v_has_non_website_trials;

        IF v_has_non_website_trials THEN
          v_store_preserve_reasons := pg_catalog.array_append(v_store_preserve_reasons, 'non_website_service_workflows');
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.payment_requests pr
          WHERE pr.store_id = v_locked_store_id
            AND (
              pr.service_type NOT IN ('website_subscription', 'website_package')
              OR pg_catalog.lower(pg_catalog.btrim(COALESCE(pr.service_id, ''))) IS DISTINCT FROM pg_catalog.lower(p_website_id::TEXT)
            )
        ) INTO v_has_non_website_payments;

        IF v_has_non_website_payments THEN
          v_store_preserve_reasons := pg_catalog.array_append(v_store_preserve_reasons, 'non_website_or_other_payment_requests');
        END IF;

        -- If the store pre-existed long before this website, carries no exclusive website
        -- records yet, and is actively linked in the owner's profile, preserve it as their
        -- merchant dashboard store rather than deleting it on site removal.
        v_has_website_footprint := (
          COALESCE(pg_catalog.array_length(v_exclusive_product_ids, 1), 0) > 0
          OR EXISTS (
            SELECT 1
            FROM public.orders o
            WHERE o.store_id = v_locked_store_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.payment_requests pr
            WHERE pr.store_id = v_locked_store_id
              AND pr.service_type IN ('website_subscription', 'website_package')
              AND pg_catalog.lower(pg_catalog.btrim(COALESCE(pr.service_id, ''))) = pg_catalog.lower(p_website_id::TEXT)
          )
        );

        IF NOT v_has_website_footprint
           AND v_locked_store.created_at IS NOT NULL
           AND v_site.created_at IS NOT NULL
           AND v_locked_store.created_at < (v_site.created_at - INTERVAL '5 minutes')
           AND EXISTS (
             SELECT 1
             FROM public.profiles pr
             WHERE pr.id = v_site.user_id
               AND pr.store_id = v_locked_store_id
           ) THEN
          v_store_preserve_reasons := pg_catalog.array_append(v_store_preserve_reasons, 'preexisting_profile_store_without_website_records');
        END IF;

        IF COALESCE(pg_catalog.array_length(v_store_preserve_reasons, 1), 0) = 0 THEN
          v_exclusive_store_id := v_locked_store_id;
          v_store_preserved := false;

          SELECT COUNT(*) INTO v_deleted_products FROM public.products WHERE store_id = v_exclusive_store_id;
          SELECT COUNT(*) INTO v_deleted_inventory FROM public.inventory_movements WHERE store_id = v_exclusive_store_id;
          SELECT COUNT(*) INTO v_deleted_customers FROM public.customers WHERE store_id = v_exclusive_store_id;
          SELECT COUNT(*) INTO v_deleted_orders FROM public.orders WHERE store_id = v_exclusive_store_id;
          SELECT COUNT(*) INTO v_deleted_members FROM public.store_members WHERE store_id = v_exclusive_store_id;
        ELSE
          v_exclusive_store_id := NULL;
          v_store_preserved := true;
        END IF;
      END IF;
    ELSE
      -- Handle subscribed_websites.store_id IS NULL safely:
      -- Never leave orphan products linked via website_id, and never guess a store by owner_id.
      SELECT COUNT(*), COUNT(DISTINCT p.store_id)
      INTO v_orphan_prod_count, v_orphan_store_count
      FROM public.products p
      WHERE p.website_id = p_website_id;

      IF v_orphan_prod_count > 0 THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.products p
          LEFT JOIN public.stores s ON s.id = p.store_id
          WHERE p.website_id = p_website_id
            AND (
              v_site.user_id IS NULL
              OR s.id IS NULL
              OR s.owner_id IS DISTINCT FROM v_site.user_id
              OR EXISTS (
                SELECT 1
                FROM public.subscribed_websites sw2
                WHERE sw2.store_id = p.store_id
                  AND sw2.id <> p_website_id
              )
            )
        ) INTO v_has_ambiguous_orphans;

        IF v_has_ambiguous_orphans OR v_orphan_store_count > 1 THEN
          RETURN jsonb_build_object(
            'success', false,
            'code', 'AMBIGUOUS_NULL_STORE_PRODUCTS',
            'message', 'Permanent deletion aborted safely: website store_id is NULL and linked product store ownership is shared or ambiguous. No records were deleted.'
          );
        END IF;

        FOR v_prod IN
          SELECT p.id, p.image_url
          FROM public.products p
          WHERE p.website_id = p_website_id
          ORDER BY p.id
          FOR UPDATE
        LOOP
          SELECT EXISTS (
            SELECT 1
            FROM public.subscribed_websites sw2
            WHERE sw2.id <> p_website_id
              AND (
                sw2.store_id = (SELECT p2.store_id FROM public.products p2 WHERE p2.id = v_prod.id)
                OR (v_site.user_id IS NOT NULL AND sw2.user_id = v_site.user_id)
              )
              AND (
                EXISTS (
                  SELECT 1
                  FROM pg_catalog.jsonb_array_elements(
                    CASE
                      WHEN pg_catalog.jsonb_typeof(sw2.config->'servicesOrProducts') = 'array'
                      THEN sw2.config->'servicesOrProducts'
                      ELSE '[]'::jsonb
                    END
                  ) AS item
                  WHERE pg_catalog.lower(COALESCE(NULLIF(item->>'productId', ''), item->>'id', '')) = pg_catalog.lower(v_prod.id::TEXT)
                )
                OR EXISTS (
                  SELECT 1
                  FROM pg_catalog.jsonb_array_elements(
                    CASE
                      WHEN pg_catalog.jsonb_typeof(sw2.config->'items') = 'array'
                      THEN sw2.config->'items'
                      ELSE '[]'::jsonb
                    END
                  ) AS item2
                  WHERE pg_catalog.lower(COALESCE(NULLIF(item2->>'productId', ''), item2->>'id', '')) = pg_catalog.lower(v_prod.id::TEXT)
                )
                OR EXISTS (
                  SELECT 1
                  FROM pg_catalog.jsonb_array_elements(
                    CASE
                      WHEN pg_catalog.jsonb_typeof(sw2.config->'draft'->'servicesOrProducts') = 'array'
                      THEN sw2.config->'draft'->'servicesOrProducts'
                      ELSE '[]'::jsonb
                    END
                  ) AS ditem
                  WHERE pg_catalog.lower(COALESCE(NULLIF(ditem->>'productId', ''), ditem->>'id', '')) = pg_catalog.lower(v_prod.id::TEXT)
                )
                OR (
                  pg_catalog.jsonb_typeof(sw2.config->'productCatalogMeta') = 'object'
                  AND (sw2.config->'productCatalogMeta' ? v_prod.id::TEXT)
                  AND pg_catalog.lower(COALESCE(sw2.config->'productCatalogMeta'->(v_prod.id::TEXT)->>'isVisible', 'true')) <> 'false'
                )
                OR (
                  pg_catalog.jsonb_typeof(sw2.config->'draft'->'productCatalogMeta') = 'object'
                  AND (sw2.config->'draft'->'productCatalogMeta' ? v_prod.id::TEXT)
                  AND pg_catalog.lower(COALESCE(sw2.config->'draft'->'productCatalogMeta'->(v_prod.id::TEXT)->>'isVisible', 'true')) <> 'false'
                )
              )
          ) INTO v_is_referenced_by_sibling;

          IF COALESCE(v_is_referenced_by_sibling, false) THEN
            v_preserved_shared_product_ids := pg_catalog.array_append(v_preserved_shared_product_ids, v_prod.id);
          ELSE
            v_exclusive_product_ids := pg_catalog.array_append(v_exclusive_product_ids, v_prod.id);
          END IF;
        END LOOP;
      END IF;
    END IF;

    -- Collect ALL candidate Storage asset references from:
    --   (a) deleted products (either exclusive store cascade OR v_exclusive_product_ids)
    --   (b) target website's live config + draft (logos, heroes, banners, sections, section items, catalogMeta)
    -- Then cross-check EVERY candidate path globally across ALL surviving rows of:
    --   products, subscribed_websites (config/draft), orders (items/branding snapshots),
    --   stores (logo_url), profiles (avatar_url), and support_tickets (messages).
    -- Only paths with proven exclusive ownership AND zero surviving references may be scheduled
    -- for cleanup; referenced paths are preserved, and unverified/uncertain paths go to manual review.
    IF v_exclusive_store_id IS NOT NULL THEN
      SELECT COALESCE(pg_catalog.array_agg(p.id), ARRAY[]::UUID[])
      INTO v_all_deleted_product_ids
      FROM public.products p
      WHERE p.store_id = v_exclusive_store_id;
    ELSE
      v_all_deleted_product_ids := COALESCE(v_exclusive_product_ids, ARRAY[]::UUID[]);
    END IF;

    v_site_prefix_lower := CASE
      WHEN v_site.user_id IS NOT NULL THEN pg_catalog.lower(v_site.user_id::TEXT || '/' || p_website_id::TEXT || '/')
      ELSE NULL
    END;
    v_excl_store_prefix_lower := CASE
      WHEN v_site.user_id IS NOT NULL
           AND v_exclusive_store_id IS NOT NULL
           AND NOT v_is_shared_store
           AND NOT v_store_preserved
           AND v_locked_store.owner_id IS NOT DISTINCT FROM v_site.user_id
      THEN pg_catalog.lower(v_site.user_id::TEXT || '/' || v_exclusive_store_id::TEXT || '/')
      ELSE NULL
    END;
    v_owner_matches_store := (
      v_site.user_id IS NOT NULL
      AND v_locked_store_id IS NOT NULL
      AND v_locked_store.owner_id IS NOT DISTINCT FROM v_site.user_id
    );
    v_locked_store_prod_prefix_lower := CASE
      WHEN v_owner_matches_store THEN
        pg_catalog.lower(v_site.user_id::TEXT || '/' || v_locked_store_id::TEXT || '/products/')
      ELSE NULL
    END;

    IF COALESCE(pg_catalog.array_length(v_all_deleted_product_ids, 1), 0) > 0 THEN
      FOR v_prod IN
        SELECT DISTINCT p.store_id, p.image_url
        FROM public.products p
        WHERE p.id = ANY(v_all_deleted_product_ids)
          AND NULLIF(pg_catalog.btrim(COALESCE(p.image_url, '')), '') IS NOT NULL
      LOOP
        v_rel_storage_path := public.extract_website_asset_path(v_prod.image_url);
        IF v_rel_storage_path IS NOT NULL THEN
          IF NOT (v_rel_storage_path = ANY(v_candidate_prod_paths)) THEN
            v_candidate_prod_paths := pg_catalog.array_append(v_candidate_prod_paths, v_rel_storage_path);
          END IF;
        ELSIF public.is_supabase_storage_url_or_path(v_prod.image_url) THEN
          -- Non-website-assets or malformed Supabase Storage object URL -> preserve & mark for manual review
          IF NOT (v_manual_review_paths @> pg_catalog.jsonb_build_array(pg_catalog.btrim(v_prod.image_url))) THEN
            v_manual_review_paths := v_manual_review_paths || pg_catalog.jsonb_build_array(pg_catalog.btrim(v_prod.image_url));
          END IF;
        END IF;
      END LOOP;
    END IF;

    v_candidate_site_paths := public.jsonb_collect_website_asset_paths(v_site.config);
    FOR v_uncertain_raw IN
      SELECT u FROM pg_catalog.unnest(public.jsonb_collect_uncertain_storage_refs(v_site.config)) AS u
    LOOP
      IF NOT (v_manual_review_paths @> pg_catalog.jsonb_build_array(v_uncertain_raw)) THEN
        v_manual_review_paths := v_manual_review_paths || pg_catalog.jsonb_build_array(v_uncertain_raw);
      END IF;
    END LOOP;

    SELECT COALESCE(pg_catalog.array_agg(DISTINCT p_cand ORDER BY p_cand), ARRAY[]::TEXT[])
    INTO v_all_candidate_paths
    FROM pg_catalog.unnest(
      pg_catalog.array_cat(COALESCE(v_candidate_prod_paths, ARRAY[]::TEXT[]), COALESCE(v_candidate_site_paths, ARRAY[]::TEXT[]))
    ) AS p_cand
    WHERE NULLIF(pg_catalog.btrim(COALESCE(p_cand, '')), '') IS NOT NULL;

    IF COALESCE(pg_catalog.array_length(v_all_candidate_paths, 1), 0) > 0 THEN
      SELECT COALESCE(pg_catalog.array_agg(DISTINCT pg_catalog.lower(rp)), ARRAY[]::TEXT[])
      INTO v_referenced_paths_lower
      FROM pg_catalog.unnest(
        public.find_surviving_website_asset_references(
          v_all_candidate_paths,
          p_website_id,
          v_all_deleted_product_ids,
          v_exclusive_store_id
        )
      ) AS rp;

      FOREACH v_rel_storage_path IN ARRAY v_all_candidate_paths LOOP
        v_rel_lower := pg_catalog.lower(v_rel_storage_path);
        IF v_rel_lower = ANY(COALESCE(v_referenced_paths_lower, ARRAY[]::TEXT[])) THEN
          v_preserved_reference_paths := v_preserved_reference_paths || pg_catalog.jsonb_build_array(v_rel_storage_path);
        ELSIF (
          (v_site_prefix_lower IS NOT NULL AND v_rel_lower LIKE (v_site_prefix_lower || '%'))
          OR (v_excl_store_prefix_lower IS NOT NULL AND v_rel_lower LIKE (v_excl_store_prefix_lower || '%'))
          OR (
            v_locked_store_prod_prefix_lower IS NOT NULL
            AND v_rel_storage_path = ANY(v_candidate_prod_paths)
            AND v_rel_lower LIKE (v_locked_store_prod_prefix_lower || '%')
          )
        ) THEN
          v_cleanup_object_paths := v_cleanup_object_paths || pg_catalog.jsonb_build_array(v_rel_storage_path);
          -- Record safe unreferenced product image URLs (legacy API field)
          SELECT COALESCE(
            v_deleted_product_image_urls || COALESCE(
              (
                SELECT pg_catalog.jsonb_agg(DISTINCT p.image_url)
                FROM public.products p
                WHERE p.id = ANY(v_all_deleted_product_ids)
                  AND pg_catalog.lower(COALESCE(public.extract_website_asset_path(p.image_url), '')) = v_rel_lower
              ),
              '[]'::jsonb
            ),
            v_deleted_product_image_urls
          ) INTO v_deleted_product_image_urls;
        ELSE
          -- Exclusive ownership cannot be conclusively established (e.g., general/ folder,
          -- other merchant/site/store scope, or ownership mismatch) -> preserve for manual review!
          IF NOT (v_manual_review_paths @> pg_catalog.jsonb_build_array(v_rel_storage_path)) THEN
            v_manual_review_paths := v_manual_review_paths || pg_catalog.jsonb_build_array(v_rel_storage_path);
          END IF;
        END IF;
      END LOOP;
    END IF;

    v_manual_review_required := (pg_catalog.jsonb_array_length(v_manual_review_paths) > 0);
    v_initial_cleanup_status := CASE
      WHEN v_manual_review_required AND pg_catalog.jsonb_array_length(v_cleanup_object_paths) = 0
      THEN 'manual_review_required'
      ELSE 'pending'
    END;

    -- ISSUE 1: When the store is preserved (shared store or preserved single-site store) OR store_id IS NULL:
    -- 1. Convert any p_website_id products actively referenced by surviving sibling websites into clean shared products (website_id = NULL).
    -- 2. Explicitly DELETE products exclusively associated with p_website_id (cascading their inventory_movements),
    --    preventing ON DELETE SET NULL from turning exclusive products into orphaned website_id = NULL rows.
    IF v_exclusive_store_id IS NULL THEN
      IF COALESCE(pg_catalog.array_length(v_preserved_shared_product_ids, 1), 0) > 0 THEN
        UPDATE public.products
        SET website_id = NULL
        WHERE id = ANY(v_preserved_shared_product_ids);
      END IF;

      IF COALESCE(pg_catalog.array_length(v_exclusive_product_ids, 1), 0) > 0 THEN
        SELECT COUNT(*)
        INTO v_deleted_inventory
        FROM public.inventory_movements im
        WHERE im.product_id = ANY(v_exclusive_product_ids);

        DELETE FROM public.products
        WHERE id = ANY(v_exclusive_product_ids);

        GET DIAGNOSTICS v_deleted_products = ROW_COUNT;
      END IF;
    END IF;

    -- Delete the website subscription row
    DELETE FROM public.subscribed_websites WHERE id = p_website_id;

    -- If store is conclusively exclusively owned and used only by this website,
    -- reassign affected profiles.store_id and delete the exclusive store
    -- (cascading products, inventory, customers, orders, store_members;
    -- setting payment_requests.store_id = NULL & service_trials.store_id = NULL to preserve history).
    IF v_exclusive_store_id IS NOT NULL THEN
      UPDATE public.profiles pr
      SET
        store_id = (
          SELECT s2.id
          FROM public.stores s2
          WHERE s2.owner_id = pr.id
            AND s2.id <> v_exclusive_store_id
          ORDER BY s2.created_at DESC, s2.id DESC
          LIMIT 1
        ),
        updated_at = NOW()
      WHERE pr.store_id = v_exclusive_store_id;

      DELETE FROM public.stores WHERE id = v_exclusive_store_id;
    END IF;

    -- Retain immutable permanent deletion audit log
    INSERT INTO public.website_lifecycle_audit_logs (
      website_id,
      admin_id,
      action,
      reason,
      verified_payment_request_id,
      previous_status,
      new_status,
      previous_deployment_status,
      new_deployment_status,
      payment_status_snapshot,
      previous_period_end,
      new_period_end
    ) VALUES (
      p_website_id,
      p_admin_id,
      'delete',
      v_clean_reason,
      NULL,
      v_site.status,
      'deleted',
      v_site.deployment_status,
      'deleted',
      v_site.payment_status,
      v_site.current_period_end,
      NULL
    )
    RETURNING id INTO v_audit_id;

    -- Persist durable storage cleanup scope so post-commit Storage cleanup can be
    -- retried safely even if the browser/API fails or times out after DB commit.
    IF v_site.user_id IS NOT NULL THEN
      v_scope_prefixes := jsonb_build_array(v_site.user_id::TEXT || '/' || p_website_id::TEXT);
      IF v_exclusive_store_id IS NOT NULL AND NOT v_is_shared_store AND NOT v_store_preserved THEN
        v_scope_prefixes := v_scope_prefixes || jsonb_build_array(v_site.user_id::TEXT || '/' || v_exclusive_store_id::TEXT);
      END IF;

      INSERT INTO public.website_deletion_storage_cleanups (
        website_id,
        audit_log_id,
        admin_id,
        owner_user_id,
        deleted_store_id,
        preserved_store_id,
        is_shared_store,
        store_preserved,
        store_preservation_reasons,
        subdomain,
        business_name,
        cleanup_scope_prefixes,
        cleanup_object_paths,
        preserved_reference_paths,
        manual_review_paths,
        manual_review_required,
        deleted_product_ids,
        cleanup_status
      ) VALUES (
        p_website_id,
        v_audit_id,
        p_admin_id,
        v_site.user_id,
        v_exclusive_store_id,
        CASE WHEN v_exclusive_store_id IS NULL THEN v_locked_store_id ELSE NULL END,
        v_is_shared_store,
        v_store_preserved,
        pg_catalog.to_jsonb(COALESCE(v_store_preserve_reasons, ARRAY[]::TEXT[])),
        v_site_subdomain,
        v_site.business_name,
        v_scope_prefixes,
        v_cleanup_object_paths,
        v_preserved_reference_paths,
        v_manual_review_paths,
        v_manual_review_required,
        pg_catalog.to_jsonb(COALESCE(v_exclusive_product_ids, ARRAY[]::UUID[])),
        v_initial_cleanup_status
      )
      RETURNING id INTO v_cleanup_job_id;

      -- Immediately reserve candidate Storage paths in the exact same atomic transaction
      -- as website deletion so any concurrent writer referencing a path afterwards triggers
      -- referenced_aborted BEFORE Storage DELETE executes.
      IF pg_catalog.jsonb_array_length(v_cleanup_object_paths) > 0 THEN
        INSERT INTO public.storage_deletion_reservations (
          object_path,
          object_path_lower,
          website_id,
          owner_user_id,
          store_id,
          store_preserved,
          status,
          reserved_at,
          expires_at,
          updated_at
        )
        SELECT
          cand,
          pg_catalog.lower(cand),
          p_website_id,
          v_site.user_id,
          v_locked_store_id,
          (v_exclusive_store_id IS NULL),
          'reserved',
          NOW(),
          NOW() + INTERVAL '15 minutes',
          NOW()
        FROM pg_catalog.jsonb_array_elements_text(v_cleanup_object_paths) AS cand
        ON CONFLICT (object_path_lower) DO UPDATE
        SET
          object_path = EXCLUDED.object_path,
          website_id = EXCLUDED.website_id,
          owner_user_id = EXCLUDED.owner_user_id,
          store_id = EXCLUDED.store_id,
          store_preserved = EXCLUDED.store_preserved,
          status = CASE
            WHEN public.storage_deletion_reservations.status = 'referenced_aborted'
              THEN 'referenced_aborted'
            ELSE 'reserved'
          END,
          reserved_at = NOW(),
          expires_at = NOW() + INTERVAL '15 minutes',
          updated_at = NOW();
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'DELETED',
      'message', CASE
        WHEN v_exclusive_store_id IS NOT NULL THEN
          'Website and all exclusively associated store business data were permanently deleted.'
        ELSE
          'Website and exclusively associated website products/assets were permanently deleted; shared or merchant dashboard store records were preserved.'
      END,
      'deletedWebsiteId', p_website_id,
      'deletedStoreId', v_exclusive_store_id,
      'preservedStoreId', CASE WHEN v_exclusive_store_id IS NULL THEN v_locked_store_id ELSE NULL END,
      'isSharedStore', v_is_shared_store,
      'storePreserved', v_store_preserved,
      'storePreservationReasons', pg_catalog.to_jsonb(COALESCE(v_store_preserve_reasons, ARRAY[]::TEXT[])),
      'deletedProductIds', pg_catalog.to_jsonb(COALESCE(v_exclusive_product_ids, ARRAY[]::UUID[])),
      'preservedSharedProductIds', pg_catalog.to_jsonb(COALESCE(v_preserved_shared_product_ids, ARRAY[]::UUID[])),
      'deletedProductImageUrls', v_deleted_product_image_urls,
      'cleanupObjectPaths', v_cleanup_object_paths,
      'preservedReferencedObjectPaths', v_preserved_reference_paths,
      'manualReviewObjectPaths', v_manual_review_paths,
      'manualReviewRequired', v_manual_review_required,
      'deletedSubdomain', v_site_subdomain,
      'ownerUserId', v_site.user_id,
      'storageCleanupJobId', v_cleanup_job_id,
      'cleanupScopePrefixes', v_scope_prefixes,
      'deletedCounts', jsonb_build_object(
        'products', v_deleted_products,
        'inventoryMovements', v_deleted_inventory,
        'customers', v_deleted_customers,
        'orders', v_deleted_orders,
        'storeMembers', v_deleted_members
      ),
      'auditLogId', v_audit_id
    );
  EXCEPTION
    WHEN deadlock_detected OR lock_not_available THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'CONCURRENT_MODIFICATION_RETRY',
        'message', 'Website deletion conflicted with a concurrent database operation and was safely rolled back. Please retry.'
      );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_permanently_delete_website(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_permanently_delete_website(UUID, UUID, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_permanently_delete_website(UUID, UUID, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 8. Service-Role RPCs for Verifying, Retrying & Recording Post-Commit Cleanup
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_verify_storage_paths_for_deletion(UUID, JSONB, UUID);

CREATE OR REPLACE FUNCTION public.admin_verify_storage_paths_for_deletion(
  p_admin_id UUID,
  p_candidate_paths JSONB,
  p_exclude_website_id UUID DEFAULT NULL,
  p_verification_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role TEXT;
  v_is_service_or_owner BOOLEAN := false;
  v_candidates TEXT[];
  v_referenced TEXT[];
  v_aborted TEXT[];
  v_all_blocked_lower TEXT[];
  v_safe TEXT[];
  v_token UUID;
  v_job RECORD;
  v_cand TEXT;
BEGIN
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');
  IF v_active_role IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Access denied: Storage path verification requires service_role.';
  END IF;

  v_is_service_or_owner := (
    current_user = 'service_role'
    OR v_active_role = 'service_role'
    OR (
      auth.uid() IS NULL
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles r
        LEFT JOIN pg_catalog.pg_class c
          ON c.oid = 'public.subscribed_websites'::pg_catalog.regclass
         AND c.relowner = r.oid
        WHERE r.rolname = current_user
          AND (r.rolsuper = true OR c.oid IS NOT NULL)
      )
    )
  );
  IF NOT v_is_service_or_owner THEN
    RAISE EXCEPTION 'Access denied: Storage path verification requires verified service_role execution.';
  END IF;

  IF p_admin_id IS NULL
     OR NOT public.is_verified_platform_admin(p_admin_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles pr
       WHERE pr.id = p_admin_id
         AND pr.role = 'admin'
         AND pg_catalog.lower(pg_catalog.btrim(COALESCE(pr.email, ''))) = 'official.amaas.dev@gmail.com'
     ) THEN
    RAISE EXCEPTION 'Only verified primary platform administrators can verify storage cleanup paths.';
  END IF;

  IF p_exclude_website_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('website_cleanup:' || p_exclude_website_id::TEXT, 0)
    );
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT pg_catalog.ltrim(pg_catalog.btrim(elem), '/')),
    ARRAY[]::TEXT[]
  )
  INTO v_candidates
  FROM pg_catalog.jsonb_array_elements_text(
    CASE WHEN p_candidate_paths IS NOT NULL AND pg_catalog.jsonb_typeof(p_candidate_paths) = 'array' THEN p_candidate_paths ELSE '[]'::jsonb END
  ) AS elem
  WHERE NULLIF(pg_catalog.btrim(elem), '') IS NOT NULL
    AND pg_catalog.strpos(elem, '..') = 0
    AND pg_catalog.strpos(elem, '\') = 0;

  v_referenced := public.find_surviving_website_asset_references(
    v_candidates,
    p_exclude_website_id,
    ARRAY[]::UUID[],
    NULL
  );

  -- Check reservation table for any path concurrently flagged 'referenced_aborted'
  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT r.object_path ORDER BY r.object_path),
    ARRAY[]::TEXT[]
  )
  INTO v_aborted
  FROM public.storage_deletion_reservations r
  WHERE r.object_path_lower = ANY(
    SELECT pg_catalog.lower(c) FROM pg_catalog.unnest(COALESCE(v_candidates, ARRAY[]::TEXT[])) AS c
  )
    AND r.status = 'referenced_aborted';

  SELECT COALESCE(pg_catalog.array_agg(DISTINCT pg_catalog.lower(x)), ARRAY[]::TEXT[])
  INTO v_all_blocked_lower
  FROM pg_catalog.unnest(
    pg_catalog.array_cat(COALESCE(v_referenced, ARRAY[]::TEXT[]), COALESCE(v_aborted, ARRAY[]::TEXT[]))
  ) AS x;

  SELECT COALESCE(pg_catalog.array_agg(c ORDER BY c), ARRAY[]::TEXT[])
  INTO v_safe
  FROM pg_catalog.unnest(COALESCE(v_candidates, ARRAY[]::TEXT[])) AS c
  WHERE NOT (pg_catalog.lower(c) = ANY(COALESCE(v_all_blocked_lower, ARRAY[]::TEXT[])));

  v_token := COALESCE(p_verification_token, gen_random_uuid());

  -- Upsert/confirm reservation locks on surviving safe paths when website job exists
  IF p_exclude_website_id IS NOT NULL AND COALESCE(pg_catalog.array_length(v_safe, 1), 0) > 0 THEN
    SELECT owner_user_id, COALESCE(deleted_store_id, preserved_store_id) AS eff_store_id, store_preserved
    INTO v_job
    FROM public.website_deletion_storage_cleanups
    WHERE website_id = p_exclude_website_id;

    IF FOUND THEN
      FOREACH v_cand IN ARRAY v_safe LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended('storage_path:' || pg_catalog.lower(v_cand), 0)
        );
        INSERT INTO public.storage_deletion_reservations (
          object_path,
          object_path_lower,
          website_id,
          owner_user_id,
          store_id,
          store_preserved,
          verification_token,
          status,
          reserved_at,
          expires_at,
          updated_at
        ) VALUES (
          v_cand,
          pg_catalog.lower(v_cand),
          p_exclude_website_id,
          v_job.owner_user_id,
          v_job.eff_store_id,
          COALESCE(v_job.store_preserved, true),
          v_token,
          'reserved',
          NOW(),
          NOW() + INTERVAL '5 minutes',
          NOW()
        )
        ON CONFLICT (object_path_lower) DO UPDATE
        SET
          verification_token = CASE
            WHEN public.storage_deletion_reservations.status = 'referenced_aborted'
              THEN public.storage_deletion_reservations.verification_token
            ELSE v_token
          END,
          status = CASE
            WHEN public.storage_deletion_reservations.status = 'referenced_aborted'
              THEN 'referenced_aborted'
            ELSE 'reserved'
          END,
          reserved_at = NOW(),
          expires_at = NOW() + INTERVAL '5 minutes',
          updated_at = NOW();
      END LOOP;

      -- Re-check after acquiring per-path advisory locks in case a concurrent writer aborted any row
      SELECT COALESCE(pg_catalog.array_agg(c ORDER BY c), ARRAY[]::TEXT[])
      INTO v_safe
      FROM pg_catalog.unnest(v_safe) AS c
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.storage_deletion_reservations r
        WHERE r.object_path_lower = pg_catalog.lower(c)
          AND r.status = 'referenced_aborted'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'verificationToken', v_token,
    'safeToDeletePaths', pg_catalog.to_jsonb(COALESCE(v_safe, ARRAY[]::TEXT[])),
    'referencedPaths', pg_catalog.to_jsonb(
      COALESCE(
        (
          SELECT pg_catalog.array_agg(DISTINCT r ORDER BY r)
          FROM pg_catalog.unnest(
            pg_catalog.array_cat(COALESCE(v_referenced, ARRAY[]::TEXT[]), COALESCE(v_aborted, ARRAY[]::TEXT[]))
          ) AS r
        ),
        ARRAY[]::TEXT[]
      )
    ),
    'abortedPaths', pg_catalog.to_jsonb(COALESCE(v_aborted, ARRAY[]::TEXT[]))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_verify_storage_paths_for_deletion(UUID, JSONB, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_verify_storage_paths_for_deletion(UUID, JSONB, UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_storage_paths_for_deletion(UUID, JSONB, UUID, UUID) TO service_role;

DROP FUNCTION IF EXISTS public.admin_record_website_storage_cleanup_result(UUID, UUID, TEXT, INTEGER, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.admin_record_website_storage_cleanup_result(UUID, UUID, TEXT, INTEGER, JSONB, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.admin_record_website_storage_cleanup_result(
  p_website_id UUID,
  p_admin_id UUID,
  p_status TEXT,
  p_deleted_count INTEGER DEFAULT 0,
  p_failed_paths JSONB DEFAULT '[]'::jsonb,
  p_error TEXT DEFAULT NULL,
  p_manual_review_paths JSONB DEFAULT NULL,
  p_deleted_paths JSONB DEFAULT '[]'::jsonb,
  p_verification_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role TEXT;
  v_is_service_or_owner BOOLEAN := false;
  v_clean_status TEXT;
  v_existing RECORD;
  v_existing_deleted_lower TEXT[] := ARRAY[]::TEXT[];
  v_new_deleted_paths TEXT[] := ARRAY[]::TEXT[];
  v_merged_deleted_json JSONB;
  v_late_aborted_paths TEXT[] := ARRAY[]::TEXT[];
  v_added_deleted_count INTEGER := 0;
  v_next_manual_paths JSONB;
  v_next_preserved_paths JSONB;
  v_next_manual_required BOOLEAN;
  v_next_status TEXT;
  v_next_error TEXT;
  v_row RECORD;
BEGIN
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');
  IF v_active_role IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Access denied: Storage cleanup recording requires service_role.';
  END IF;

  v_is_service_or_owner := (
    current_user = 'service_role'
    OR v_active_role = 'service_role'
    OR (
      auth.uid() IS NULL
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles r
        LEFT JOIN pg_catalog.pg_class c
          ON c.oid = 'public.website_deletion_storage_cleanups'::pg_catalog.regclass
         AND c.relowner = r.oid
        WHERE r.rolname = current_user
          AND (r.rolsuper = true OR c.oid IS NOT NULL)
      )
    )
  );
  IF NOT v_is_service_or_owner THEN
    RAISE EXCEPTION 'Access denied: Storage cleanup recording requires verified service_role execution.';
  END IF;

  IF p_admin_id IS NULL
     OR NOT public.is_verified_platform_admin(p_admin_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles pr
       WHERE pr.id = p_admin_id
         AND pr.role = 'admin'
         AND pg_catalog.lower(pg_catalog.btrim(COALESCE(pr.email, ''))) = 'official.amaas.dev@gmail.com'
     ) THEN
    RAISE EXCEPTION 'Only verified primary platform administrators can record storage cleanup state.';
  END IF;

  v_clean_status := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_status, '')));
  IF v_clean_status NOT IN ('pending', 'partial_failed', 'manual_review_required', 'completed', 'skipped') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_CLEANUP_STATUS',
      'message', 'Invalid storage cleanup status.'
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('website_cleanup:' || COALESCE(p_website_id::TEXT, 'null'), 0)
  );

  SELECT *
  INTO v_existing
  FROM public.website_deletion_storage_cleanups
  WHERE website_id = p_website_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CLEANUP_JOB_NOT_FOUND',
      'message', 'No deleted-website storage cleanup record exists for this website ID.'
    );
  END IF;

  -- Check if any reservation for this website collided with a late concurrent DB write
  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT r.object_path ORDER BY r.object_path),
    ARRAY[]::TEXT[]
  )
  INTO v_late_aborted_paths
  FROM public.storage_deletion_reservations r
  WHERE r.website_id = p_website_id
    AND r.status = 'referenced_aborted';

  v_next_manual_paths := CASE
    WHEN p_manual_review_paths IS NOT NULL AND pg_catalog.jsonb_typeof(p_manual_review_paths) = 'array'
      THEN p_manual_review_paths
    ELSE COALESCE(v_existing.manual_review_paths, '[]'::jsonb)
  END;

  v_next_preserved_paths := COALESCE(v_existing.preserved_reference_paths, '[]'::jsonb);
  IF COALESCE(pg_catalog.array_length(v_late_aborted_paths, 1), 0) > 0 THEN
    SELECT COALESCE(
      pg_catalog.jsonb_agg(DISTINCT x ORDER BY x),
      '[]'::jsonb
    )
    INTO v_next_preserved_paths
    FROM (
      SELECT pg_catalog.jsonb_array_elements_text(v_next_preserved_paths) AS x
      UNION
      SELECT u AS x FROM pg_catalog.unnest(v_late_aborted_paths) AS u
    ) merged_refs;
  END IF;

  v_next_manual_required := CASE
    WHEN p_manual_review_paths IS NOT NULL AND pg_catalog.jsonb_typeof(p_manual_review_paths) = 'array'
      THEN pg_catalog.jsonb_array_length(p_manual_review_paths) > 0
    WHEN v_clean_status = 'manual_review_required'
      THEN true
    ELSE COALESCE(v_existing.manual_review_required, false)
  END;

  IF v_existing.cleanup_status = 'completed'
     AND NOT COALESCE(v_existing.manual_review_required, false)
     AND v_clean_status = 'completed'
     AND NOT v_next_manual_required THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'id', v_existing.id,
      'websiteId', v_existing.website_id,
      'ownerUserId', v_existing.owner_user_id,
      'deletedStoreId', v_existing.deleted_store_id,
      'preservedStoreId', v_existing.preserved_store_id,
      'isSharedStore', v_existing.is_shared_store,
      'storePreserved', v_existing.store_preserved,
      'cleanupStatus', v_existing.cleanup_status,
      'manualReviewRequired', v_existing.manual_review_required,
      'manualReviewPaths', v_existing.manual_review_paths,
      'preservedReferencePaths', v_existing.preserved_reference_paths,
      'cleanupScopePrefixes', v_existing.cleanup_scope_prefixes,
      'deletedProductIds', v_existing.deleted_product_ids,
      'deletedObjectPaths', v_existing.deleted_object_paths,
      'failedObjectPaths', v_existing.failed_object_paths,
      'deletedObjectsCount', v_existing.deleted_objects_count,
      'attemptCount', v_existing.attempt_count
    );
  END IF;

  -- Deduplicate newly deleted paths against already recorded deleted_object_paths so
  -- retries or already-deleted objects never cause repeated-count drift.
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT pg_catalog.lower(e)), ARRAY[]::TEXT[])
  INTO v_existing_deleted_lower
  FROM pg_catalog.jsonb_array_elements_text(COALESCE(v_existing.deleted_object_paths, '[]'::jsonb)) AS e;

  IF p_deleted_paths IS NOT NULL AND pg_catalog.jsonb_typeof(p_deleted_paths) = 'array' AND pg_catalog.jsonb_array_length(p_deleted_paths) > 0 THEN
    SELECT COALESCE(pg_catalog.array_agg(DISTINCT pg_catalog.btrim(d)), ARRAY[]::TEXT[])
    INTO v_new_deleted_paths
    FROM pg_catalog.jsonb_array_elements_text(p_deleted_paths) AS d
    WHERE NULLIF(pg_catalog.btrim(d), '') IS NOT NULL
      AND NOT (pg_catalog.lower(pg_catalog.btrim(d)) = ANY(COALESCE(v_existing_deleted_lower, ARRAY[]::TEXT[])));

    v_added_deleted_count := COALESCE(pg_catalog.array_length(v_new_deleted_paths, 1), 0);

    SELECT COALESCE(pg_catalog.jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb)
    INTO v_merged_deleted_json
    FROM (
      SELECT pg_catalog.jsonb_array_elements_text(COALESCE(v_existing.deleted_object_paths, '[]'::jsonb)) AS x
      UNION
      SELECT u AS x FROM pg_catalog.unnest(v_new_deleted_paths) AS u
    ) md;

    -- Transition confirmed deleted reservations (that weren't concurrently aborted) to 'deleted'
    IF v_added_deleted_count > 0 THEN
      UPDATE public.storage_deletion_reservations
      SET
        status = 'deleted',
        verification_token = COALESCE(p_verification_token, verification_token),
        updated_at = NOW()
      WHERE website_id = p_website_id
        AND status = 'reserved'
        AND object_path_lower = ANY(
          SELECT pg_catalog.lower(u) FROM pg_catalog.unnest(v_new_deleted_paths) AS u
        );
    END IF;
  ELSE
    v_merged_deleted_json := COALESCE(v_existing.deleted_object_paths, '[]'::jsonb);
    v_added_deleted_count := GREATEST(0, COALESCE(p_deleted_count, 0));
  END IF;

  v_next_status := CASE
    WHEN v_clean_status = 'completed' AND v_next_manual_required THEN 'manual_review_required'
    ELSE v_clean_status
  END;

  v_next_error := CASE
    WHEN v_next_status = 'completed' AND NOT v_next_manual_required THEN NULL
    ELSE NULLIF(pg_catalog.btrim(COALESCE(p_error, '')), '')
  END;

  UPDATE public.website_deletion_storage_cleanups
  SET
    manual_review_paths = v_next_manual_paths,
    preserved_reference_paths = v_next_preserved_paths,
    manual_review_required = v_next_manual_required,
    cleanup_status = v_next_status,
    deleted_object_paths = v_merged_deleted_json,
    deleted_objects_count = COALESCE(deleted_objects_count, 0) + v_added_deleted_count,
    failed_object_paths = CASE
      WHEN v_next_status IN ('completed', 'manual_review_required') THEN '[]'::jsonb
      WHEN p_failed_paths IS NOT NULL AND jsonb_typeof(p_failed_paths) = 'array' THEN p_failed_paths
      ELSE failed_object_paths
    END,
    attempt_count = COALESCE(attempt_count, 0) + 1,
    last_error = v_next_error,
    last_attempt_at = NOW(),
    completed_at = CASE WHEN v_next_status = 'completed' AND NOT v_next_manual_required THEN COALESCE(completed_at, NOW()) ELSE NULL END,
    updated_at = NOW()
  WHERE id = v_existing.id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'id', v_row.id,
    'websiteId', v_row.website_id,
    'ownerUserId', v_row.owner_user_id,
    'deletedStoreId', v_row.deleted_store_id,
    'preservedStoreId', v_row.preserved_store_id,
    'isSharedStore', v_row.is_shared_store,
    'storePreserved', v_row.store_preserved,
    'cleanupStatus', v_row.cleanup_status,
    'manualReviewRequired', v_row.manual_review_required,
    'manualReviewPaths', v_row.manual_review_paths,
    'preservedReferencePaths', v_row.preserved_reference_paths,
    'cleanupScopePrefixes', v_row.cleanup_scope_prefixes,
    'deletedProductIds', v_row.deleted_product_ids,
    'deletedObjectPaths', v_row.deleted_object_paths,
    'failedObjectPaths', v_row.failed_object_paths,
    'lateConcurrentReferencePaths', pg_catalog.to_jsonb(COALESCE(v_late_aborted_paths, ARRAY[]::TEXT[])),
    'deletedObjectsCount', v_row.deleted_objects_count,
    'attemptCount', v_row.attempt_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_website_storage_cleanup_result(UUID, UUID, TEXT, INTEGER, JSONB, TEXT, JSONB, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_record_website_storage_cleanup_result(UUID, UUID, TEXT, INTEGER, JSONB, TEXT, JSONB, JSONB, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_website_storage_cleanup_result(UUID, UUID, TEXT, INTEGER, JSONB, TEXT, JSONB, JSONB, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_pending_website_storage_cleanups(
  p_admin_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role TEXT;
  v_is_service_or_owner BOOLEAN := false;
  v_safe_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_items JSONB := '[]'::jsonb;
BEGIN
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');
  IF v_active_role IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Access denied: Storage cleanup lookup requires service_role.';
  END IF;

  v_is_service_or_owner := (
    current_user = 'service_role'
    OR v_active_role = 'service_role'
    OR (
      auth.uid() IS NULL
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles r
        LEFT JOIN pg_catalog.pg_class c
          ON c.oid = 'public.website_deletion_storage_cleanups'::pg_catalog.regclass
         AND c.relowner = r.oid
        WHERE r.rolname = current_user
          AND (r.rolsuper = true OR c.oid IS NOT NULL)
      )
    )
  );
  IF NOT v_is_service_or_owner THEN
    RAISE EXCEPTION 'Access denied: Storage cleanup lookup requires verified service_role execution.';
  END IF;

  IF p_admin_id IS NULL
     OR NOT public.is_verified_platform_admin(p_admin_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles pr
       WHERE pr.id = p_admin_id
         AND pr.role = 'admin'
         AND pg_catalog.lower(pg_catalog.btrim(COALESCE(pr.email, ''))) = 'official.amaas.dev@gmail.com'
     ) THEN
    RAISE EXCEPTION 'Only verified primary platform administrators can inspect pending storage cleanups.';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', j.id,
        'websiteId', j.website_id,
        'auditLogId', j.audit_log_id,
        'ownerUserId', j.owner_user_id,
        'deletedStoreId', j.deleted_store_id,
        'preservedStoreId', j.preserved_store_id,
        'isSharedStore', j.is_shared_store,
        'storePreserved', j.store_preserved,
        'storePreservationReasons', j.store_preservation_reasons,
        'subdomain', j.subdomain,
        'businessName', j.business_name,
        'cleanupScopePrefixes', j.cleanup_scope_prefixes,
        'cleanupObjectPaths', j.cleanup_object_paths,
        'preservedReferencePaths', j.preserved_reference_paths,
        'manualReviewPaths', j.manual_review_paths,
        'manualReviewRequired', j.manual_review_required,
        'deletedProductIds', j.deleted_product_ids,
        'deletedObjectPaths', j.deleted_object_paths,
        'failedObjectPaths', j.failed_object_paths,
        'cleanupStatus', j.cleanup_status,
        'deletedObjectsCount', j.deleted_objects_count,
        'attemptCount', j.attempt_count,
        'lastError', j.last_error,
        'lastAttemptAt', j.last_attempt_at,
        'createdAt', j.created_at
      )
      ORDER BY j.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM (
    SELECT *
    FROM public.website_deletion_storage_cleanups
    WHERE cleanup_status IN ('pending', 'partial_failed', 'manual_review_required', 'skipped')
    ORDER BY created_at DESC
    LIMIT v_safe_limit
  ) j;

  RETURN jsonb_build_object('success', true, 'jobs', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_pending_website_storage_cleanups(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_pending_website_storage_cleanups(UUID, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_pending_website_storage_cleanups(UUID, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_website_storage_cleanup_job(
  p_admin_id UUID,
  p_website_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role TEXT;
  v_is_service_or_owner BOOLEAN := false;
  v_job RECORD;
BEGIN
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');
  IF v_active_role IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Access denied: Storage cleanup lookup requires service_role.';
  END IF;

  v_is_service_or_owner := (
    current_user = 'service_role'
    OR v_active_role = 'service_role'
    OR (
      auth.uid() IS NULL
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles r
        LEFT JOIN pg_catalog.pg_class c
          ON c.oid = 'public.website_deletion_storage_cleanups'::pg_catalog.regclass
         AND c.relowner = r.oid
        WHERE r.rolname = current_user
          AND (r.rolsuper = true OR c.oid IS NOT NULL)
      )
    )
  );
  IF NOT v_is_service_or_owner THEN
    RAISE EXCEPTION 'Access denied: Storage cleanup lookup requires verified service_role execution.';
  END IF;

  IF p_admin_id IS NULL
     OR NOT public.is_verified_platform_admin(p_admin_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles pr
       WHERE pr.id = p_admin_id
         AND pr.role = 'admin'
         AND pg_catalog.lower(pg_catalog.btrim(COALESCE(pr.email, ''))) = 'official.amaas.dev@gmail.com'
     ) THEN
    RAISE EXCEPTION 'Only verified primary platform administrators can inspect storage cleanup jobs.';
  END IF;

  SELECT *
  INTO v_job
  FROM public.website_deletion_storage_cleanups
  WHERE website_id = p_website_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CLEANUP_JOB_NOT_FOUND',
      'message', 'No storage cleanup record found for this website ID.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'job', jsonb_build_object(
      'id', v_job.id,
      'websiteId', v_job.website_id,
      'auditLogId', v_job.audit_log_id,
      'ownerUserId', v_job.owner_user_id,
      'deletedStoreId', v_job.deleted_store_id,
      'preservedStoreId', v_job.preserved_store_id,
      'isSharedStore', v_job.is_shared_store,
      'storePreserved', v_job.store_preserved,
      'storePreservationReasons', v_job.store_preservation_reasons,
      'subdomain', v_job.subdomain,
      'businessName', v_job.business_name,
      'cleanupScopePrefixes', v_job.cleanup_scope_prefixes,
      'cleanupObjectPaths', v_job.cleanup_object_paths,
      'preservedReferencePaths', v_job.preserved_reference_paths,
      'manualReviewPaths', v_job.manual_review_paths,
      'manualReviewRequired', v_job.manual_review_required,
      'deletedProductIds', v_job.deleted_product_ids,
      'deletedObjectPaths', v_job.deleted_object_paths,
      'failedObjectPaths', v_job.failed_object_paths,
      'cleanupStatus', v_job.cleanup_status,
      'deletedObjectsCount', v_job.deleted_objects_count,
      'attemptCount', v_job.attempt_count,
      'lastError', v_job.last_error,
      'lastAttemptAt', v_job.last_attempt_at,
      'completedAt', v_job.completed_at,
      'createdAt', v_job.created_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_website_storage_cleanup_job(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_website_storage_cleanup_job(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_website_storage_cleanup_job(UUID, UUID) TO service_role;

-- ------------------------------------------------------------------------------
-- 9. Dynamic Function & Table Owner Alignment + Security Invariant Assertions
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_pr_owner_oid OID;
  v_pr_owner NAME;
  v_fn RECORD;
BEGIN
  SELECT c.relowner, r.rolname
  INTO v_pr_owner_oid, v_pr_owner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
  WHERE c.oid = 'public.payment_requests'::pg_catalog.regclass;

  IF v_pr_owner IS NULL OR v_pr_owner IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'Security invariant check failed: Invalid public.payment_requests owner "%".',
      COALESCE(v_pr_owner::TEXT, 'NULL');
  END IF;

  IF (
    SELECT relowner
    FROM pg_catalog.pg_class
    WHERE oid = 'public.website_deletion_storage_cleanups'::pg_catalog.regclass
  ) IS DISTINCT FROM v_pr_owner_oid THEN
    EXECUTE format('ALTER TABLE public.website_deletion_storage_cleanups OWNER TO %I', v_pr_owner);
  END IF;

  IF (
    SELECT relowner
    FROM pg_catalog.pg_class
    WHERE oid = 'public.storage_deletion_reservations'::pg_catalog.regclass
  ) IS DISTINCT FROM v_pr_owner_oid THEN
    EXECUTE format('ALTER TABLE public.storage_deletion_reservations OWNER TO %I', v_pr_owner);
  END IF;

  FOR v_fn IN (
    SELECT p.oid, p.proname, p.proowner, p.proconfig
    FROM pg_catalog.pg_proc p
    WHERE p.oid IN (
      'public.protect_store_membership()'::pg_catalog.regprocedure,
      'public.protect_payment_request_integrity()'::pg_catalog.regprocedure,
      'public.protect_service_trial_invariants()'::pg_catalog.regprocedure,
      'public.guard_reserved_storage_paths()'::pg_catalog.regprocedure,
      'public.find_surviving_website_asset_references(text[], uuid, uuid[], uuid)'::pg_catalog.regprocedure,
      'public.admin_permanently_delete_website(uuid, uuid, text, text)'::pg_catalog.regprocedure,
      'public.admin_verify_storage_paths_for_deletion(uuid, jsonb, uuid, uuid)'::pg_catalog.regprocedure,
      'public.admin_record_website_storage_cleanup_result(uuid, uuid, text, integer, jsonb, text, jsonb, jsonb, uuid)'::pg_catalog.regprocedure,
      'public.admin_get_pending_website_storage_cleanups(uuid, integer)'::pg_catalog.regprocedure,
      'public.admin_get_website_storage_cleanup_job(uuid, uuid)'::pg_catalog.regprocedure
    )
  ) LOOP
    IF v_fn.proowner IS DISTINCT FROM v_pr_owner_oid THEN
      EXECUTE format('ALTER FUNCTION %s OWNER TO %I', v_fn.oid::pg_catalog.regprocedure, v_pr_owner);
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(v_fn.proconfig, ARRAY[]::TEXT[])) AS cfg
      WHERE cfg ~ '^search_path=\s*"?pg_catalog"?\s*,\s*"?public"?\s*,\s*"?pg_temp"?\s*$'
    ) THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp', v_fn.oid::pg_catalog.regprocedure);
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'public.admin_permanently_delete_website(uuid, uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_permanently_delete_website(uuid, uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.guard_reserved_storage_paths()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.guard_reserved_storage_paths()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.find_surviving_website_asset_references(text[], uuid, uuid[], uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.find_surviving_website_asset_references(text[], uuid, uuid[], uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_verify_storage_paths_for_deletion(uuid, jsonb, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_verify_storage_paths_for_deletion(uuid, jsonb, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_record_website_storage_cleanup_result(uuid, uuid, text, integer, jsonb, text, jsonb, jsonb, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_record_website_storage_cleanup_result(uuid, uuid, text, integer, jsonb, text, jsonb, jsonb, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_get_pending_website_storage_cleanups(uuid, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_get_pending_website_storage_cleanups(uuid, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_get_website_storage_cleanup_job(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_get_website_storage_cleanup_job(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.protect_payment_request_integrity()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_payment_request_integrity()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.protect_store_membership()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_store_membership()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.protect_service_trial_invariants()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_service_trial_invariants()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security invariant check failed: Unauthorized client EXECUTE privilege detected.';
  END IF;

  IF has_table_privilege('anon', 'public.website_deletion_storage_cleanups', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('authenticated', 'public.website_deletion_storage_cleanups', 'INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('anon', 'public.storage_deletion_reservations', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('authenticated', 'public.storage_deletion_reservations', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'Security invariant check failed: Client roles hold unauthorized privileges on cleanup/reservation tables.';
  END IF;
END $$;

-- Refresh PostgREST schema cache so newly installed/updated RPC signatures are immediately visible.
NOTIFY pgrst, 'reload schema';


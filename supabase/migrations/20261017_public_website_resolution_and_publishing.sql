-- ==============================================================================
-- GoAMAAS Migration: Hardened Multi-Tenant Subdomain Resolution & Publishing
-- File: supabase/migrations/20261017_public_website_resolution_and_publishing.sql
-- ==============================================================================

-- --------------------------------------------------------------------------------
-- 1. Prerequisite Checks: Validate required base tables, columns, and functions
-- --------------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT[];
  v_type_mismatch TEXT[];
BEGIN
  -- 1a. Verify public.subscribed_websites exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'subscribed_websites'
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: Table "public.subscribed_websites" does not exist. Run initial base schema migrations first.';
  END IF;

  -- 1b. Verify required base columns exist on public.subscribed_websites
  SELECT array_agg(col) INTO v_missing
  FROM unnest(ARRAY['id', 'user_id', 'subdomain', 'business_name', 'niche', 'status', 'deployment_status', 'created_at']) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'subscribed_websites' AND column_name = col
  );

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: Missing required base columns in "public.subscribed_websites": %', array_to_string(v_missing, ', ');
  END IF;

  -- 1c. Verify column data types of existing columns to prevent silent schema corruption
  SELECT array_agg(format('%s (expected %s, found %s)', column_name, expected_type, data_type))
  INTO v_type_mismatch
  FROM (
    SELECT column_name, data_type,
      CASE 
        WHEN column_name IN ('id', 'user_id', 'store_id') THEN 'uuid'
        WHEN column_name IN ('subdomain', 'full_domain', 'business_name', 'niche', 'template_id', 'template_name', 'status', 'deployment_status', 'payment_status', 'plan_tier', 'currency') THEN 'text/character varying'
        WHEN column_name = 'config' THEN 'json/jsonb'
        WHEN column_name IN ('created_at', 'updated_at', 'subscribed_at', 'current_period_end', 'grace_period_end') THEN 'timestamp'
        ELSE NULL
      END AS expected_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscribed_websites'
  ) col_check
  WHERE expected_type IS NOT NULL
    AND NOT (
      (expected_type = 'uuid' AND data_type = 'uuid') OR
      (expected_type = 'text/character varying' AND data_type IN ('text', 'character varying', 'character')) OR
      (expected_type = 'json/jsonb' AND data_type IN ('json', 'jsonb')) OR
      (expected_type = 'timestamp' AND data_type IN ('timestamp with time zone', 'timestamp without time zone'))
    );

  IF v_type_mismatch IS NOT NULL AND array_length(v_type_mismatch, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: Column type mismatch on "public.subscribed_websites": %', array_to_string(v_type_mismatch, '; ');
  END IF;

  -- 1d. Verify public.is_admin() function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: Function "public.is_admin()" does not exist. Apply 20261010_security_and_rls_hardening.sql first.';
  END IF;
END $$;

-- --------------------------------------------------------------------------------
-- 1.5 Tenant Helper Functions: can_manage_store & can_access_store
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_store(p_store_id UUID)
RETURNS boolean AS $$
DECLARE
  v_has_stores boolean;
  v_can_manage boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stores'
  ) INTO v_has_stores;

  IF NOT v_has_stores THEN
    RETURN false;
  END IF;

  EXECUTE '
    SELECT EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = $1
        AND (
          s.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.store_members sm
            WHERE sm.store_id = $1
              AND sm.user_id = auth.uid()
              AND sm.status = ''active''
              AND sm.role IN (''owner'', ''admin'', ''manager'')
          )
        )
    )' INTO v_can_manage USING p_store_id;

  RETURN COALESCE(v_can_manage, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.can_manage_store(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_store(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_store(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_store(p_store_id UUID)
RETURNS boolean AS $$
DECLARE
  v_has_stores boolean;
  v_can_access boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stores'
  ) INTO v_has_stores;

  IF NOT v_has_stores THEN
    RETURN false;
  END IF;

  EXECUTE '
    SELECT EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = $1
        AND (
          s.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.store_members sm
            WHERE sm.store_id = $1
              AND sm.user_id = auth.uid()
              AND sm.status = ''active''
          )
        )
    )' INTO v_can_access USING p_store_id;

  RETURN COALESCE(v_can_access, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.can_access_store(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_store(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_store(UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 2. Schema Upgrades: Safely add columns, set defaults, and update constraints
-- --------------------------------------------------------------------------------
ALTER TABLE public.subscribed_websites 
  ADD COLUMN IF NOT EXISTS store_id UUID,
  ADD COLUMN IF NOT EXISTS payment_status TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS full_domain TEXT,
  ADD COLUMN IF NOT EXISTS template_id TEXT DEFAULT 'tpl-modern-business',
  ADD COLUMN IF NOT EXISTS template_name TEXT DEFAULT 'Modern Executive',
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  ADD COLUMN IF NOT EXISTS grace_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '35 days'),
  ADD COLUMN IF NOT EXISTS resource_usage JSONB DEFAULT '{"storage_mb": 0, "bandwidth_mb": 0, "visits": 0}'::jsonb,
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

-- Safely drop legacy constraints so data normalization runs without check violations
ALTER TABLE public.subscribed_websites 
  DROP CONSTRAINT IF EXISTS chk_subscribed_websites_payment_status,
  DROP CONSTRAINT IF EXISTS subscribed_websites_deployment_status_check,
  DROP CONSTRAINT IF EXISTS chk_subscribed_websites_deployment_status,
  DROP CONSTRAINT IF EXISTS subscribed_websites_status_check,
  DROP CONSTRAINT IF EXISTS chk_subscribed_websites_status;

-- Set resilient defaults for columns if they lack defaults
ALTER TABLE public.subscribed_websites 
  ALTER COLUMN full_domain DROP NOT NULL,
  ALTER COLUMN full_domain SET DEFAULT '',
  ALTER COLUMN template_id SET DEFAULT 'tpl-modern-business',
  ALTER COLUMN template_name SET DEFAULT 'Modern Executive',
  ALTER COLUMN current_period_end SET DEFAULT (NOW() + INTERVAL '30 days'),
  ALTER COLUMN grace_period_end SET DEFAULT (NOW() + INTERVAL '35 days');

-- Reapply updated deployment_status constraint supporting 'live' and 'suspended'
ALTER TABLE public.subscribed_websites 
  ADD CONSTRAINT chk_subscribed_websites_deployment_status 
  CHECK (deployment_status IN ('deploying', 'ready', 'failed', 'live', 'maintenance', 'suspended', 'provisioning'));

-- Reapply updated status constraint
ALTER TABLE public.subscribed_websites 
  ADD CONSTRAINT chk_subscribed_websites_status 
  CHECK (status IN ('active', 'grace_period', 'past_due', 'suspended', 'cancelled', 'draft'));

-- --------------------------------------------------------------------------------
-- 3. Evidence-Based Payment Backfill, Normalization & Safe Audit Review Flagging
-- --------------------------------------------------------------------------------
-- Drop existing triggers before backfill so execution does not require any custom GUCs.
DROP TRIGGER IF EXISTS trg_protect_subscribed_website_security ON public.subscribed_websites;
DROP TRIGGER IF EXISTS trg_protect_subscribed_website_updates ON public.subscribed_websites;
DROP TRIGGER IF EXISTS trg_protect_subscribed_websites_user_id ON public.subscribed_websites;

DO $$
DECLARE
  v_has_payment_requests BOOLEAN;
  v_has_payment_cols BOOLEAN := FALSE;
BEGIN
  -- 3a. Safely check if payment_requests table and its required columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'payment_requests'
  ) INTO v_has_payment_requests;

  IF v_has_payment_requests THEN
    SELECT (
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'service_id') AND
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'service_type') AND
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'status')
    ) INTO v_has_payment_cols;
  END IF;

  -- 3b. Normalize legacy / non-standard payment status strings before applying new CHECK constraint
  IF v_has_payment_requests AND v_has_payment_cols THEN
    EXECUTE '
      UPDATE public.subscribed_websites sw
      SET payment_status = ''paid''
      WHERE sw.payment_status IN (''completed'', ''success'')
        AND EXISTS (
          SELECT 1 FROM public.payment_requests pr
          WHERE pr.status = ''approved''
            AND pr.service_type IN (''website_subscription'', ''website_package'')
            AND pr.service_id = sw.id::TEXT
        )
    ';
  END IF;

  UPDATE public.subscribed_websites
  SET payment_status = 'pending_review'
  WHERE payment_status IN ('completed', 'success');

  UPDATE public.subscribed_websites
  SET payment_status = 'failed'
  WHERE payment_status IN ('cancelled', 'canceled');

  -- 3c. Reconcile verified payments:
  IF v_has_payment_requests AND v_has_payment_cols THEN
    EXECUTE '
      UPDATE public.subscribed_websites sw
      SET payment_status = ''paid''
      WHERE (sw.payment_status IS NULL OR sw.payment_status IN (''pending'', ''pending_review''))
        AND EXISTS (
          SELECT 1 FROM public.payment_requests pr
          WHERE pr.status = ''approved''
            AND pr.service_type IN (''website_subscription'', ''website_package'')
            AND pr.service_id = sw.id::TEXT
        )
    ';
  END IF;

  -- 3d. Flag unverified active/live records for manual review:
  IF v_has_payment_requests AND v_has_payment_cols THEN
    EXECUTE '
      UPDATE public.subscribed_websites sw
      SET 
        payment_status = ''pending_review'',
        config = CASE 
          WHEN config IS NULL OR config->''paymentAuditNotice'' IS NULL OR config->''paymentAuditNotice'' = ''null''::jsonb THEN
            jsonb_set(
              COALESCE(config, ''{}''::jsonb),
              ''{paymentAuditNotice}'',
              jsonb_build_object(
                ''flaggedAt'', NOW(),
                ''previousStatus'', COALESCE(sw.payment_status, ''null''),
                ''reason'', ''Active/live website without verified approved payment record reconciled to pending_review for manual audit''
              )
            )
          ELSE config
        END
      WHERE (sw.payment_status IS NULL OR sw.payment_status IN (''pending'', ''pending_review''))
        AND sw.deployment_status = ''live''
        AND NOT EXISTS (
          SELECT 1 FROM public.payment_requests pr
          WHERE pr.status = ''approved''
            AND pr.service_type IN (''website_subscription'', ''website_package'')
            AND pr.service_id = sw.id::TEXT
        )
    ';
  ELSE
    UPDATE public.subscribed_websites sw
    SET 
      payment_status = 'pending_review',
      config = CASE 
        WHEN config IS NULL OR config->'paymentAuditNotice' IS NULL OR config->'paymentAuditNotice' = 'null'::jsonb THEN
          jsonb_set(
            COALESCE(config, '{}'::jsonb),
            '{paymentAuditNotice}',
            jsonb_build_object(
              'flaggedAt', NOW(),
              'previousStatus', COALESCE(sw.payment_status, 'null'),
              'reason', 'Active/live website without verified approved payment record reconciled to pending_review for manual audit'
            )
          )
        ELSE config
      END
    WHERE (sw.payment_status IS NULL OR sw.payment_status IN ('pending', 'pending_review'))
      AND sw.deployment_status = 'live';
  END IF;

  -- 3e. Normalize any remaining NULL or unexpected payment statuses to 'pending'
  UPDATE public.subscribed_websites
  SET payment_status = 'pending'
  WHERE payment_status IS NULL 
     OR payment_status NOT IN ('pending', 'paid', 'failed', 'refunded', 'pending_review');

END $$;

-- 3f. Enforce NOT NULL and final CHECK constraint on payment_status
ALTER TABLE public.subscribed_websites 
  ALTER COLUMN payment_status SET DEFAULT 'pending',
  ALTER COLUMN payment_status SET NOT NULL;

ALTER TABLE public.subscribed_websites 
  ADD CONSTRAINT chk_subscribed_websites_payment_status 
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'pending_review'));

-- --------------------------------------------------------------------------------
-- 4. High-Performance Composite Indexes for Multi-Tenant Lookups & Security
-- --------------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_subscribed_websites_subdomain;
DROP INDEX IF EXISTS idx_subscribed_websites_subdomain_clean;
DROP INDEX IF EXISTS idx_subscribed_websites_public_lookup;
DROP INDEX IF EXISTS idx_subscribed_websites_subdomain_lower;
DROP INDEX IF EXISTS idx_subscribed_websites_lookup_live;
DROP INDEX IF EXISTS idx_subscribed_websites_user_tenant;
DROP INDEX IF EXISTS idx_subscribed_websites_store_tenant;
DROP INDEX IF EXISTS idx_subscribed_websites_payment_status;

-- Subdomain duplicate check guard before applying unique index
DO $$
DECLARE
  v_duplicate_subdomains TEXT[];
BEGIN
  SELECT array_agg(sub) INTO v_duplicate_subdomains
  FROM (
    SELECT lower(trim(subdomain)) AS sub, count(*) 
    FROM public.subscribed_websites 
    GROUP BY lower(trim(subdomain)) 
    HAVING count(*) > 1
  ) t;

  IF v_duplicate_subdomains IS NOT NULL AND array_length(v_duplicate_subdomains, 1) > 0 THEN
    RAISE EXCEPTION E'Migration aborted: Duplicate subdomains detected in public.subscribed_websites.
Subdomains: %.
Resolve subdomain collisions manually before applying functional unique index.', array_to_string(v_duplicate_subdomains, ', ');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribed_websites_subdomain_lower 
  ON public.subscribed_websites (lower(trim(subdomain)));

CREATE INDEX IF NOT EXISTS idx_subscribed_websites_lookup_live 
  ON public.subscribed_websites (lower(trim(subdomain)))
  WHERE deployment_status = 'live' AND payment_status = 'paid' AND status IN ('active', 'grace_period');

CREATE INDEX IF NOT EXISTS idx_subscribed_websites_user_tenant 
  ON public.subscribed_websites (user_id, status);

CREATE INDEX IF NOT EXISTS idx_subscribed_websites_store_tenant 
  ON public.subscribed_websites (store_id)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscribed_websites_payment_status 
  ON public.subscribed_websites (payment_status, status);

-- --------------------------------------------------------------------------------
-- 5. Audited Row Level Security (RLS) & Least-Privilege Grants on public.subscribed_websites
-- --------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'subscribed_websites'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.subscribed_websites', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Public can view published websites by subdomain" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Allow public select for live websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Public storefront access" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Anon select published websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Anyone can view websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Website owners can manage their subscribed websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Admins can view and manage all subscribed websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Subscribed websites select policy" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Subscribed websites insert policy" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Subscribed websites update policy" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Subscribed websites delete policy" ON public.subscribed_websites;

ALTER TABLE public.subscribed_websites ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Authenticated tenant isolation (record owner, authorized store member/owner, or platform admin)
CREATE POLICY "Subscribed websites select policy"
  ON public.subscribed_websites FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR public.is_admin()
    OR (
      store_id IS NOT NULL AND public.can_access_store(store_id)
    )
  );

-- 2. INSERT: Authenticated users can only insert records for their own user_id and stores they manage,
-- and CANNOT create records directly with payment_status = 'paid' or deployment_status = 'live'
CREATE POLICY "Subscribed websites insert policy"
  ON public.subscribed_websites FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      auth.uid() = user_id
      AND (
        store_id IS NULL OR public.can_manage_store(store_id)
      )
      AND COALESCE(payment_status, 'pending') IN ('pending', 'pending_review')
      AND COALESCE(deployment_status, 'deploying') IN ('deploying', 'ready', 'provisioning', 'draft', 'failed')
    )
    OR public.is_admin()
  );

-- 3. UPDATE: Record owner, authorized store manager, or platform admin can update their own row
CREATE POLICY "Subscribed websites update policy"
  ON public.subscribed_websites FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR public.is_admin()
    OR (
      store_id IS NOT NULL AND public.can_manage_store(store_id)
    )
  )
  WITH CHECK (
    auth.uid() = user_id 
    OR public.is_admin()
    OR (
      store_id IS NOT NULL AND public.can_manage_store(store_id)
    )
  );

-- 4. DELETE: Strictly restricted to platform administrators. Ordinary merchants CANNOT delete records directly.
CREATE POLICY "Subscribed websites delete policy"
  ON public.subscribed_websites FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- --------------------------------------------------------------------------------
-- 5.1 Least-Privilege Table & Column Grants
-- --------------------------------------------------------------------------------
REVOKE ALL ON public.subscribed_websites FROM PUBLIC;
REVOKE ALL ON public.subscribed_websites FROM anon;
REVOKE ALL ON public.subscribed_websites FROM authenticated;

-- Grant SELECT to authenticated for RLS-filtered tenant queries
GRANT SELECT ON public.subscribed_websites TO authenticated;

-- Column-level least-privilege UPDATE grant: merchants can ONLY update legitimate editor fields
GRANT UPDATE (business_name, niche, template_id, template_name, config) 
  ON public.subscribed_websites TO authenticated;

-- Column-level least-privilege INSERT grant: merchants can insert draft metadata with tenant validation
GRANT INSERT (id, user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status, config) 
  ON public.subscribed_websites TO authenticated;

-- Full administrative access strictly reserved for service_role
GRANT ALL ON public.subscribed_websites TO service_role;

-- --------------------------------------------------------------------------------
-- 5.2 Comprehensive Security Trigger: Defense-in-Depth for Invariants & Hygiene
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_subscribed_website_security()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  v_is_admin := public.is_admin();

  -- =========================================================================
  -- A. DELETE CHECKS
  -- =========================================================================
  IF TG_OP = 'DELETE' THEN
    IF NOT v_is_admin AND auth.role() != 'service_role' THEN
      RAISE EXCEPTION 'Access denied: Direct deletion of subscribed website records is not permitted. Use legitimate cancellation or contact platform support.';
    END IF;
    RETURN OLD;
  END IF;

  -- =========================================================================
  -- B. INSERT CHECKS
  -- =========================================================================
  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_admin AND auth.role() != 'service_role' THEN
      -- Tenant Isolation: Cannot create a website belonging to another user
      IF NEW.user_id IS NULL OR NEW.user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: Website must be created with your own authenticated user_id.';
      END IF;

      -- Store Ownership & Authorization:
      IF NEW.store_id IS NOT NULL THEN
        IF NOT public.can_manage_store(NEW.store_id) THEN
          RAISE EXCEPTION 'Access denied: You are not authorized to associate a website with store %.', NEW.store_id;
        END IF;
      END IF;

      -- Payment Bypass Prevention: Cannot create a website directly marked as paid
      IF NEW.payment_status = 'paid' THEN
        RAISE EXCEPTION 'Access denied: New websites cannot be created with payment_status = ''paid''. Payment verification is required.';
      END IF;

      -- Publishing Bypass Prevention: Cannot create a website directly marked as live
      IF NEW.deployment_status = 'live' THEN
        RAISE EXCEPTION 'Access denied: New websites cannot be created with deployment_status = ''live''. Websites must be published via publish_client_website() after verified payment.';
      END IF;

      -- Default safe starting states for merchant drafts
      IF NEW.payment_status IS NULL THEN
        NEW.payment_status := 'pending';
      END IF;
      IF NEW.deployment_status IS NULL THEN
        NEW.deployment_status := 'deploying';
      END IF;
      IF NEW.status IS NULL THEN
        NEW.status := 'active';
      ELSIF NEW.status NOT IN ('active', 'draft') THEN
        RAISE EXCEPTION 'Access denied: New websites can only be created with status active or draft.';
      END IF;
    END IF;

    -- Subdomain hygiene
    IF NEW.subdomain IS NOT NULL THEN
      NEW.subdomain := lower(trim(NEW.subdomain));
      IF NEW.full_domain IS NULL OR NEW.full_domain = '' THEN
        NEW.full_domain := NEW.subdomain || '.amaas.xyz';
      END IF;
    END IF;

    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- =========================================================================
  -- C. UPDATE CHECKS
  -- =========================================================================
  IF TG_OP = 'UPDATE' THEN
    IF v_is_admin OR auth.role() = 'service_role' THEN
      NEW.updated_at := NOW();
      RETURN NEW;
    END IF;

    -- 1. Tenant isolation / ownership immutability: user_id and store_id cannot be transferred
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Access denied: Website ownership cannot be transferred to another user.';
    END IF;

    IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
      RAISE EXCEPTION 'Access denied: Reassigning website store_id is not permitted.';
    END IF;

    -- 2. Payment status protection: merchants cannot bypass payment by modifying payment_status directly
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'Access denied: payment_status cannot be modified directly. Payment verification is required.';
    END IF;

    -- 3. Subscription status transition protection:
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'Access denied: Cancelled subscriptions cannot be modified or reactivated directly.';
      END IF;
      IF OLD.status IN ('suspended', 'past_due') AND NEW.status IN ('active', 'grace_period') THEN
        RAISE EXCEPTION 'Access denied: Suspended or past-due subscriptions cannot be reactivated directly. Billing renewal or admin authorization is required.';
      END IF;
      IF OLD.status = 'draft' AND NEW.status = 'active' THEN
        RAISE EXCEPTION 'Access denied: Draft subscriptions cannot be activated directly.';
      END IF;
    END IF;

    -- 4. Universal Live Invariants
    IF NEW.deployment_status = 'live' THEN
      IF NEW.payment_status != 'paid' THEN
        RAISE EXCEPTION 'Access denied: Website cannot be set to live without verified payment (current payment_status: %).', COALESCE(NEW.payment_status, 'pending');
      END IF;
      IF NEW.status NOT IN ('active', 'grace_period') THEN
        RAISE EXCEPTION 'Access denied: Website cannot be set to live with inactive subscription status (current status: %).', COALESCE(NEW.status, 'unknown');
      END IF;
      IF NEW.grace_period_end IS NOT NULL AND NEW.grace_period_end < NOW() THEN
        RAISE EXCEPTION 'Access denied: Website cannot be set to live when subscription has expired.';
      END IF;
    END IF;

    -- 5. Subdomain modification protection:
    IF NEW.subdomain IS DISTINCT FROM OLD.subdomain AND OLD.deployment_status = 'live' THEN
      RAISE EXCEPTION 'Access denied: Subdomain cannot be changed directly while website is live. Unpublish website first.';
    END IF;

    -- Normalize subdomain and sync full_domain if subdomain changed
    IF NEW.subdomain IS DISTINCT FROM OLD.subdomain AND NEW.subdomain IS NOT NULL THEN
      NEW.subdomain := lower(trim(NEW.subdomain));
      IF NEW.full_domain IS NULL OR NEW.full_domain = '' OR NEW.full_domain = OLD.subdomain || '.amaas.xyz' THEN
        NEW.full_domain := NEW.subdomain || '.amaas.xyz';
      END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_subscribed_website_security() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_subscribed_website_security() FROM anon;
GRANT EXECUTE ON FUNCTION public.protect_subscribed_website_security() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_protect_subscribed_websites_user_id ON public.subscribed_websites;
DROP TRIGGER IF EXISTS trg_protect_subscribed_website_updates ON public.subscribed_websites;
DROP TRIGGER IF EXISTS trg_protect_subscribed_website_security ON public.subscribed_websites;

CREATE TRIGGER trg_protect_subscribed_website_security
  BEFORE INSERT OR UPDATE OR DELETE ON public.subscribed_websites
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_subscribed_website_security();

-- --------------------------------------------------------------------------------
-- 5.3 Stored Procedure: Safe Subdomain Availability Check (Global Multi-Tenant Check)
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_subdomain_availability(p_subdomain TEXT)
RETURNS JSONB AS $$
DECLARE
  v_clean TEXT;
  v_taken BOOLEAN;
BEGIN
  v_clean := lower(trim(COALESCE(p_subdomain, '')));
  IF length(v_clean) < 3 OR length(v_clean) > 30 THEN
    RETURN jsonb_build_object('available', false, 'code', 'INVALID_LENGTH', 'reason', 'Subdomain must be between 3 and 30 characters long.');
  END IF;

  IF v_clean !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RETURN jsonb_build_object('available', false, 'code', 'INVALID_FORMAT', 'reason', 'Subdomain can only contain lowercase letters, numbers, and hyphens (cannot start or end with a hyphen).');
  END IF;

  IF v_clean IN (
    'admin', 'api', 'app', 'billing', 'dashboard', 'amaas', 'auth', 'support',
    'staging', 'test', 'demo', 'www', 'root', 'mail', 'ns1', 'ns2', 'official',
    'pay', 'payments', 'payment', 'cdn', 'webhook', 'webhooks'
  ) THEN
    RETURN jsonb_build_object('available', false, 'code', 'RESERVED', 'reason', 'This subdomain is reserved by the AMAAS platform.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.subscribed_websites
    WHERE lower(trim(subdomain)) = v_clean
  ) INTO v_taken;

  IF v_taken THEN
    RETURN jsonb_build_object('available', false, 'code', 'TAKEN', 'reason', 'This subdomain is already registered by another merchant.');
  END IF;

  RETURN jsonb_build_object('available', true, 'code', 'AVAILABLE');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.check_subdomain_availability(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_subdomain_availability(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_subdomain_availability(TEXT) TO anon, authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 6. Stored Procedure: Secure Public Subdomain Resolution
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_published_website_by_subdomain(p_subdomain TEXT)
RETURNS JSONB AS $$
DECLARE
  v_clean_subdomain TEXT;
  v_site RECORD;
BEGIN
  v_clean_subdomain := lower(trim(COALESCE(p_subdomain, '')));

  IF length(v_clean_subdomain) < 2 OR length(v_clean_subdomain) > 63 OR v_clean_subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' OR v_clean_subdomain LIKE 'xn--%' THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'Invalid subdomain requested.'
    );
  END IF;

  SELECT 
    subdomain,
    business_name,
    niche,
    template_name,
    deployment_status,
    status,
    config
  INTO v_site
  FROM public.subscribed_websites
  WHERE lower(trim(subdomain)) = v_clean_subdomain
    AND deployment_status = 'live'
    AND payment_status = 'paid'
    AND status IN ('active', 'grace_period')
    AND (grace_period_end IS NULL OR grace_period_end >= NOW())
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'subdomain', v_clean_subdomain,
      'message', 'Website not found or is currently not published.'
    );
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'site', jsonb_build_object(
      'subdomain', v_site.subdomain,
      'fullDomainUrl', v_site.subdomain || '.amaas.xyz',
      'businessName', v_site.business_name,
      'niche', v_site.niche,
      'nicheLabel', COALESCE(v_site.template_name, 'Business Storefront'),
      'templateId', COALESCE(v_site.config->>'templateId', 'tpl-modern-business'),
      'templateName', COALESCE(v_site.template_name, 'Modern Executive'),
      'brandColor', COALESCE(v_site.config->>'brandColor', '#2563EB'),
      'logoUrl', v_site.config->>'logoUrl',
      'headline', COALESCE(v_site.config->>'headline', 'Welcome to our official website'),
      'subheadline', COALESCE(v_site.config->>'subheadline', ''),
      'aboutText', COALESCE(v_site.config->>'aboutText', ''),
      'phone', COALESCE(v_site.config->>'phone', ''),
      'email', COALESCE(v_site.config->>'email', ''),
      'address', COALESCE(v_site.config->>'address', ''),
      'whatsappNumber', COALESCE(v_site.config->>'whatsappNumber', v_site.config->>'phone', ''),
      'servicesOrProducts', COALESCE(v_site.config->'servicesOrProducts', v_site.config->'items', '[]'::jsonb),
      'socialLinks', COALESCE(v_site.config->'socialLinks', '{}'::jsonb),
      'deploymentStatus', v_site.deployment_status,
      'subscriptionStatus', v_site.status,
      'status', v_site.status,
      'sslStatus', 'active'
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.get_published_website_by_subdomain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_website_by_subdomain(TEXT) TO anon, authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 7. Stored Procedure: 1-Click Publish With Strict Authorization & Concurrency Safety
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_client_website(p_website_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_clean_subdomain TEXT;
  v_site RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Authentication required to publish a website.';
  END IF;

  SELECT id, user_id, store_id, subdomain, payment_status, status, deployment_status, grace_period_end
  INTO v_site
  FROM public.subscribed_websites
  WHERE id = p_website_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_FOUND',
      'message', 'Website record not found.'
    );
  END IF;

  IF v_site.user_id IS NULL THEN
    IF NOT public.is_admin() AND auth.role() != 'service_role' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'ORPHANED_RECORD',
        'message', 'Security exception: Website has no registered owner. Only platform administrators can publish or claim this website.'
      );
    END IF;
  ELSIF v_site.user_id != v_user_id AND NOT public.is_admin() AND auth.role() != 'service_role' THEN
    IF v_site.store_id IS NULL OR NOT public.can_manage_store(v_site.store_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'FORBIDDEN',
        'message', 'Unauthorized: You do not have permission to publish this website.'
      );
    END IF;
  END IF;

  v_clean_subdomain := lower(trim(COALESCE(v_site.subdomain, '')));
  IF length(v_clean_subdomain) < 2 OR length(v_clean_subdomain) > 63 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_SUBDOMAIN_LENGTH',
      'message', 'Subdomain must be between 2 and 63 characters in length.'
    );
  END IF;

  IF v_clean_subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' OR v_clean_subdomain LIKE 'xn--%' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_SUBDOMAIN_FORMAT',
      'message', 'Subdomain can only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.'
    );
  END IF;

  IF v_clean_subdomain IN (
    'app', 'admin', 'api', 'auth', 'oauth', 'login', 'register', 'dashboard', 'portal',
    'www', 'mail', 'email', 'smtp', 'imap', 'pop', 'ftp', 'ssh', 'ns1', 'ns2', 'dns',
    'dev', 'development', 'staging', 'test', 'testing', 'stage', 'prod', 'production', 'preview',
    'amaas', 'goamaas', 'official', 'billing', 'pay', 'payments', 'payment', 'support', 'help', 'status', 'docs', 'blog', 'store', 'shop',
    'cdn', 'static', 'assets', 'media', 'files', 'webhook', 'webhooks', 'bot', 'bots'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'RESERVED_SUBDOMAIN',
      'message', 'This subdomain is reserved by the AMAAS platform.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.subscribed_websites
    WHERE lower(trim(subdomain)) = v_clean_subdomain
      AND id != p_website_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SUBDOMAIN_TAKEN',
      'message', 'This subdomain is already registered by another merchant.'
    );
  END IF;

  IF v_site.payment_status != 'paid' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PAYMENT_REQUIRED',
      'message', 'Verified payment approval required before public publishing can be enabled. Current status: ' || COALESCE(v_site.payment_status, 'pending')
    );
  END IF;

  IF v_site.status NOT IN ('active', 'grace_period') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SUBSCRIPTION_INACTIVE',
      'message', 'Cannot publish website: subscription status is currently inactive or suspended.'
    );
  END IF;

  IF v_site.grace_period_end IS NOT NULL AND v_site.grace_period_end < NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SUBSCRIPTION_EXPIRED',
      'message', 'Cannot publish website: subscription grace period has expired. Please renew your subscription.'
    );
  END IF;

  UPDATE public.subscribed_websites
  SET 
    deployment_status = 'live',
    updated_at = NOW()
  WHERE id = p_website_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'PUBLISHED',
    'message', 'Website published successfully! Accessible at https://' || v_site.subdomain || '.amaas.xyz',
    'subdomain', v_site.subdomain,
    'fullDomainUrl', v_site.subdomain || '.amaas.xyz'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.publish_client_website(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_client_website(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_client_website(UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 8. Stored Procedure: Unpublish Website (Maintenance / Suspension Control)
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unpublish_client_website(p_website_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_site RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Authentication required to unpublish a website.';
  END IF;

  SELECT id, user_id, store_id, subdomain
  INTO v_site
  FROM public.subscribed_websites
  WHERE id = p_website_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Website record not found.');
  END IF;

  IF v_site.user_id IS NULL THEN
    IF NOT public.is_admin() AND auth.role() != 'service_role' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Security exception: Website has no registered owner.');
    END IF;
  ELSIF v_site.user_id != v_user_id AND NOT public.is_admin() AND auth.role() != 'service_role' THEN
    IF v_site.store_id IS NULL OR NOT public.can_manage_store(v_site.store_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: You do not have permission to manage this website.');
    END IF;
  END IF;

  UPDATE public.subscribed_websites
  SET 
    deployment_status = 'suspended',
    updated_at = NOW()
  WHERE id = p_website_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Website unpublished. Visitors will now see the maintenance notice.',
    'subdomain', v_site.subdomain
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.unpublish_client_website(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unpublish_client_website(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.unpublish_client_website(UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 9. Stored Procedure: Legitimate Subscription Cancellation (Audit Preserving)
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_client_website_subscription(p_website_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN;
  v_site RECORD;
BEGIN
  v_caller_id := auth.uid();
  v_is_admin := public.is_admin();

  IF v_caller_id IS NULL AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Authentication required: You must be signed in to cancel a subscription.';
  END IF;

  SELECT id, user_id, store_id, business_name, subdomain, status, deployment_status
  INTO v_site
  FROM public.subscribed_websites
  WHERE id = p_website_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Website record not found.'
    );
  END IF;

  IF NOT v_is_admin AND auth.role() != 'service_role' THEN
    IF v_site.user_id != v_caller_id AND (
      v_site.store_id IS NULL OR NOT public.can_manage_store(v_site.store_id)
    ) THEN
      RAISE EXCEPTION 'Access denied: You do not have permission to cancel this website subscription.';
    END IF;
  END IF;

  UPDATE public.subscribed_websites
  SET status = 'cancelled',
      deployment_status = 'suspended',
      updated_at = NOW()
  WHERE id = p_website_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Website subscription has been cancelled and unpublishing completed. Historical records preserved.',
    'website_id', p_website_id,
    'status', 'cancelled',
    'deployment_status', 'suspended'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.cancel_client_website_subscription(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_client_website_subscription(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_client_website_subscription(UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 10. Stored Procedure: Authorized Administrative Website Deletion
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_subscribed_website(p_website_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_deleted RECORD;
BEGIN
  v_is_admin := public.is_admin();
  IF NOT v_is_admin AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Access denied: Only platform administrators can permanently delete subscribed website records.';
  END IF;

  DELETE FROM public.subscribed_websites
  WHERE id = p_website_id
  RETURNING id, business_name, subdomain INTO v_deleted;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Website record not found or already deleted.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Website record permanently deleted by administrator.',
    'website_id', v_deleted.id,
    'subdomain', v_deleted.subdomain
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.admin_delete_subscribed_website(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_subscribed_website(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_subscribed_website(UUID) TO authenticated, service_role;

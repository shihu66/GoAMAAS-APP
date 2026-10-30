-- ==============================================================================
-- GoAMAAS Migration: Stores Least-Privilege, Authoritative Payment Pricing,
--                    Gateway Enforcement, Subdomain Hygiene & Admin Lifecycle RPCs
-- File: supabase/migrations/20261026_stores_gateway_pricing_and_admin_hardening.sql
-- ==============================================================================
--
-- Purpose:
-- 1. Fix missing explicit PostgreSQL grants on public.stores (and core tenant tables)
--    while enforcing strict least-privilege (no PUBLIC/anon access, no authenticated
--    DELETE/TRUNCATE on stores, trigger-enforced owner_id = auth.uid() & slug hygiene).
-- 2. Harden public.subscribed_websites subdomain validation inside BEFORE INSERT/UPDATE
--    trigger (blocking leading/trailing hyphens, <3 or >30 chars, punycode xn--%, and
--    all 23 reserved platform subdomains) and eliminate auth.role() GUC-spoofing paths.
-- 3. Lock down public.payment_gateway_configs (authenticated SELECT only; updates strictly
--    via verified-admin RPC public.admin_update_payment_gateway_config) and reject
--    disabled or unconfigured payment methods (e.g. disabled Nagad) on payment_requests INSERT.
-- 4. Create authoritative database pricing catalog (public.service_pricing_catalog) and
--    enforce server/database pricing validation on public.payment_requests INSERT so
--    tampered client amounts or ineligible service IDs are rejected at the DB engine level.
-- 5. Provide audited SECURITY DEFINER RPC public.admin_update_website_lifecycle() for
--    verified platform administrators to suspend, reactivate, and renew websites.
-- ==============================================================================

-- --------------------------------------------------------------------------------
-- 1. Non-Destructive Prerequisite Verification
-- --------------------------------------------------------------------------------
DO $$
DECLARE
  v_missing_tables TEXT[];
  v_missing_funcs TEXT[];
BEGIN
  SELECT array_agg(tbl ORDER BY tbl)
  INTO v_missing_tables
  FROM unnest(ARRAY[
    'profiles',
    'stores',
    'store_members',
    'subscribed_websites',
    'payment_requests',
    'payment_gateway_configs',
    'service_trials'
  ]) AS tbl
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_name = tbl
  );

  IF v_missing_tables IS NOT NULL AND array_length(v_missing_tables, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: Missing required table(s) in schema public: %. Apply prior migrations through 20261024 first.',
      array_to_string(v_missing_tables, ', ');
  END IF;

  SELECT array_agg(sig ORDER BY sig)
  INTO v_missing_funcs
  FROM unnest(ARRAY[
    'public.is_admin()',
    'public.is_verified_platform_admin(uuid)',
    'public.can_submit_payment_request(uuid,uuid,text,text,text)',
    'public.admin_approve_payment_request(uuid,text)',
    'public.admin_reject_payment_request(uuid,text)'
  ]) AS sig
  WHERE pg_catalog.to_regprocedure(sig) IS NULL;

  IF v_missing_funcs IS NOT NULL AND array_length(v_missing_funcs, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: Missing required security function(s): %. Apply 20261024_harden_payment_requests_ownership_and_uniqueness.sql first.',
      array_to_string(v_missing_funcs, ', ');
  END IF;
END $$;

-- --------------------------------------------------------------------------------
-- 2. Explicit Least-Privilege Grants & Multi-Tenant Store Ownership Hardening
-- --------------------------------------------------------------------------------

-- 2a-0. Ensure profiles and stores have all expected schema columns on older staging baselines
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT '৳';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS address TEXT;

-- 2a. Harden public.protect_store_ownership() to run BEFORE INSERT OR UPDATE,
--     enforce owner_id = auth.uid() for non-admin client inserts, block ID/owner
--     tampering on updates, and normalize/validate store name and slug.
CREATE OR REPLACE FUNCTION public.protect_store_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role TEXT;
  v_is_privileged_backend BOOLEAN := false;
  v_is_verified_admin BOOLEAN := false;
BEGIN
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');

  IF v_active_role = 'service_role' OR session_user = 'service_role' THEN
    v_is_privileged_backend := true;
  ELSIF v_active_role IN ('none', current_user) AND auth.uid() IS NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      LEFT JOIN pg_catalog.pg_class c
        ON c.oid = 'public.stores'::pg_catalog.regclass
       AND c.relowner = r.oid
      WHERE r.rolname = session_user
        AND (r.rolsuper = true OR c.oid IS NOT NULL)
    ) INTO v_is_privileged_backend;
  END IF;

  IF NOT v_is_privileged_backend AND auth.uid() IS NOT NULL THEN
    v_is_verified_admin := public.is_verified_platform_admin(auth.uid());
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_privileged_backend AND NOT v_is_verified_admin THEN
      IF auth.uid() IS NULL OR NEW.owner_id IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Access denied: Stores must be created with your own authenticated owner_id.';
      END IF;
    END IF;

    NEW.name := pg_catalog.btrim(COALESCE(NEW.name, ''));
    IF NEW.name = '' THEN
      RAISE EXCEPTION 'Invalid store name: Store name cannot be empty.';
    END IF;

    NEW.slug := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.slug, '')));
    IF pg_catalog.length(NEW.slug) < 3
       OR pg_catalog.length(NEW.slug) > 63
       OR NEW.slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
       OR NEW.slug LIKE 'xn--%' THEN
      RAISE EXCEPTION 'Invalid store slug: Slug must be 3-63 characters using only lowercase letters, numbers, and internal hyphens (no punycode).';
    END IF;
    IF NOT v_is_privileged_backend AND NEW.slug IN (
      'admin', 'amaas', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'bot', 'bots',
      'cdn', 'dashboard', 'demo', 'dev', 'development', 'dns', 'docs', 'email', 'files', 'ftp',
      'goamaas', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'oauth', 'official',
      'pay', 'payment', 'payments', 'pop', 'portal', 'preview', 'prod', 'production', 'register', 'root',
      'shop', 'smtp', 'ssh', 'stage', 'staging', 'static', 'status', 'store', 'support', 'test',
      'testing', 'webhook', 'webhooks', 'www'
    ) THEN
      RAISE EXCEPTION 'Reserved store slug: "%" is reserved by the AMAAS platform.', NEW.slug;
    END IF;

    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Access denied: Store ID is immutable.';
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at AND NOT v_is_privileged_backend THEN
      RAISE EXCEPTION 'Access denied: Store creation timestamp is immutable.';
    END IF;

    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      IF NOT v_is_privileged_backend AND NOT v_is_verified_admin THEN
        RAISE EXCEPTION 'Access denied: Only platform administrators can transfer store ownership.';
      END IF;
    END IF;

    NEW.name := pg_catalog.btrim(COALESCE(NEW.name, ''));
    IF NEW.name = '' THEN
      RAISE EXCEPTION 'Invalid store name: Store name cannot be empty.';
    END IF;

    NEW.slug := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.slug, '')));
    IF pg_catalog.length(NEW.slug) < 3
       OR pg_catalog.length(NEW.slug) > 63
       OR NEW.slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
       OR NEW.slug LIKE 'xn--%' THEN
      RAISE EXCEPTION 'Invalid store slug: Slug must be 3-63 characters using only lowercase letters, numbers, and internal hyphens (no punycode).';
    END IF;
    IF NOT v_is_privileged_backend AND NEW.slug IS DISTINCT FROM OLD.slug AND NEW.slug IN (
      'admin', 'amaas', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'bot', 'bots',
      'cdn', 'dashboard', 'demo', 'dev', 'development', 'dns', 'docs', 'email', 'files', 'ftp',
      'goamaas', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'oauth', 'official',
      'pay', 'payment', 'payments', 'pop', 'portal', 'preview', 'prod', 'production', 'register', 'root',
      'shop', 'smtp', 'ssh', 'stage', 'staging', 'static', 'status', 'store', 'support', 'test',
      'testing', 'webhook', 'webhooks', 'www'
    ) THEN
      RAISE EXCEPTION 'Reserved store slug: "%" is reserved by the AMAAS platform.', NEW.slug;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_store_ownership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_store_ownership() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_store_ownership() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_store_ownership ON public.stores;
CREATE TRIGGER trg_protect_store_ownership
  BEFORE INSERT OR UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_store_ownership();

-- 2b. Sweep any legacy policies and re-assert strict RLS policies on public.stores
--     (include direct owner_id = auth.uid() check on SELECT so INSERT ... RETURNING
--     succeeds without pre-insert snapshot miss)
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'stores'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.stores', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Stores select policy"
  ON public.stores FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id OR public.can_access_store(id));

CREATE POLICY "Stores insert policy"
  ON public.stores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Stores update policy"
  ON public.stores FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id OR public.is_verified_platform_admin(auth.uid()))
  WITH CHECK (auth.uid() = owner_id OR public.is_verified_platform_admin(auth.uid()));

CREATE POLICY "Stores delete policy"
  ON public.stores FOR DELETE
  TO authenticated
  USING (public.is_verified_platform_admin(auth.uid()));

CREATE POLICY "Stores service role policy"
  ON public.stores FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2c. Apply explicit least-privilege table grants on public.stores and core tenant tables
--     (fixes GoAmaas-Staging missing authenticated privileges on public.stores while
--     denying PUBLIC/anon access and denying authenticated store DELETE/TRUNCATE).
REVOKE ALL ON TABLE public.stores FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stores TO authenticated;
GRANT ALL ON TABLE public.stores TO service_role;

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

REVOKE ALL ON TABLE public.store_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_members TO authenticated;
GRANT ALL ON TABLE public.store_members TO service_role;

REVOKE ALL ON TABLE public.service_trials FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.service_trials TO authenticated;
GRANT ALL ON TABLE public.service_trials TO service_role;

DO $$
DECLARE
  v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['products', 'orders', 'customers', 'inventory_movements'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_tbl
    ) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', v_tbl);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_tbl);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'support_tickets'
  ) THEN
    REVOKE ALL ON TABLE public.support_tickets FROM PUBLIC, anon, authenticated;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.support_tickets TO authenticated;
    GRANT ALL ON TABLE public.support_tickets TO service_role;
  END IF;
END $$;

-- --------------------------------------------------------------------------------
-- 3. Subdomain Hygiene, Column Grants & Fee Integrity on public.subscribed_websites
-- --------------------------------------------------------------------------------
ALTER TABLE public.subscribed_websites
  ADD COLUMN IF NOT EXISTS plan_tier TEXT DEFAULT 'AMAAS Website Lite',
  ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC DEFAULT 600;

ALTER TABLE public.subscribed_websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscribed_websites NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscribed_websites'
      AND ('public' = ANY(roles) OR 'anon' = ANY(roles))
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.subscribed_websites', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Subscribed websites service role policy" ON public.subscribed_websites;
CREATE POLICY "Subscribed websites service role policy"
  ON public.subscribed_websites FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix missing plan_tier and monthly_fee column-level INSERT grants for authenticated
-- merchants (required by createSubscribedWebsiteInDb) while keeping UPDATE strictly
-- restricted to non-billing editor fields and enforcing authoritative fee in trigger.
REVOKE ALL ON TABLE public.subscribed_websites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.subscribed_websites TO authenticated;
GRANT UPDATE (business_name, niche, template_id, template_name, config)
  ON TABLE public.subscribed_websites TO authenticated;
GRANT INSERT (id, user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status, plan_tier, monthly_fee, config)
  ON TABLE public.subscribed_websites TO authenticated;
GRANT ALL ON TABLE public.subscribed_websites TO service_role;

CREATE OR REPLACE FUNCTION public.protect_subscribed_website_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role TEXT;
  v_is_admin BOOLEAN := false;
  v_catalog_fee NUMERIC := 600;
  v_catalog_plan_label TEXT := 'AMAAS Website Lite';
BEGIN
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');

  IF v_active_role = 'service_role' OR session_user = 'service_role' THEN
    v_is_admin := true;
  ELSIF v_active_role IN ('none', current_user) AND auth.uid() IS NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      LEFT JOIN pg_catalog.pg_class c
        ON c.oid = 'public.subscribed_websites'::pg_catalog.regclass
       AND c.relowner = r.oid
      WHERE r.rolname = session_user
        AND (r.rolsuper = true OR c.oid IS NOT NULL)
    ) INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN
    v_is_admin := public.is_admin();
  END IF;

  -- A. DELETE CHECKS
  IF TG_OP = 'DELETE' THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Access denied: Direct deletion of subscribed website records is not permitted. Use legitimate cancellation or contact platform support.';
    END IF;
    RETURN OLD;
  END IF;

  -- B. INSERT CHECKS
  IF TG_OP = 'INSERT' THEN
    IF NEW.subdomain IS NOT NULL THEN
      NEW.subdomain := pg_catalog.lower(pg_catalog.btrim(NEW.subdomain));
    END IF;

    IF NOT v_is_admin THEN
      IF NEW.user_id IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Access denied: Website must be created with your own authenticated user_id.';
      END IF;

      IF NEW.store_id IS NOT NULL THEN
        IF NOT public.can_manage_store(NEW.store_id) THEN
          RAISE EXCEPTION 'Access denied: You are not authorized to associate a website with store %.', NEW.store_id;
        END IF;
      END IF;

      IF NEW.payment_status = 'paid' THEN
        RAISE EXCEPTION 'Access denied: New websites cannot be created with payment_status = ''paid''. Payment verification is required.';
      END IF;

      IF NEW.deployment_status = 'live' THEN
        RAISE EXCEPTION 'Access denied: New websites cannot be created with deployment_status = ''live''. Websites must be published via publish_client_website() after verified payment.';
      END IF;

      IF NEW.subdomain IS NULL OR pg_catalog.length(NEW.subdomain) < 3 OR pg_catalog.length(NEW.subdomain) > 30 THEN
        RAISE EXCEPTION 'Invalid subdomain: Subdomain must be between 3 and 30 characters long.';
      END IF;

      IF NEW.subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' OR NEW.subdomain LIKE 'xn--%' THEN
        RAISE EXCEPTION 'Invalid subdomain: Subdomain may only contain lowercase letters, numbers, and internal hyphens (cannot start or end with a hyphen).';
      END IF;

      IF NEW.subdomain IN (
        'admin', 'amaas', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'bot', 'bots',
        'cdn', 'dashboard', 'demo', 'dev', 'development', 'dns', 'docs', 'email', 'files', 'ftp',
        'goamaas', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'oauth', 'official',
        'pay', 'payment', 'payments', 'pop', 'portal', 'preview', 'prod', 'production', 'register', 'root',
        'shop', 'smtp', 'ssh', 'stage', 'staging', 'static', 'status', 'store', 'support', 'test',
        'testing', 'webhook', 'webhooks', 'www'
      ) THEN
        RAISE EXCEPTION 'Reserved subdomain: "%" is reserved by the AMAAS platform.', NEW.subdomain;
      END IF;

      -- Enforce authoritative website_subscription monthly_fee from service_pricing_catalog
      IF pg_catalog.to_regclass('public.service_pricing_catalog') IS NOT NULL THEN
        SELECT c.price_bdt, c.plan_tier_label
        INTO v_catalog_fee, v_catalog_plan_label
        FROM public.service_pricing_catalog c
        WHERE c.service_type = 'website_subscription'
          AND c.service_code = 'website_lite'
          AND c.is_active = true
        LIMIT 1;

        v_catalog_fee := COALESCE(v_catalog_fee, 600);
        v_catalog_plan_label := COALESCE(NULLIF(pg_catalog.btrim(v_catalog_plan_label), ''), 'AMAAS Website Lite');
      END IF;

      IF NEW.monthly_fee IS NULL THEN
        NEW.monthly_fee := v_catalog_fee;
      ELSIF NEW.monthly_fee IS DISTINCT FROM v_catalog_fee THEN
        RAISE EXCEPTION 'Invalid monthly_fee: expected authoritative website subscription fee of % BDT, got %.',
          v_catalog_fee, NEW.monthly_fee;
      END IF;

      NEW.plan_tier := COALESCE(NULLIF(pg_catalog.btrim(COALESCE(NEW.plan_tier, '')), ''), v_catalog_plan_label);

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

    IF NEW.subdomain IS NOT NULL AND (NEW.full_domain IS NULL OR NEW.full_domain = '') THEN
      NEW.full_domain := NEW.subdomain || '.amaas.xyz';
    END IF;

    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- C. UPDATE CHECKS
  IF TG_OP = 'UPDATE' THEN
    IF v_is_admin THEN
      NEW.updated_at := NOW();
      RETURN NEW;
    END IF;

    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Access denied: Website ownership cannot be transferred to another user.';
    END IF;

    IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
      RAISE EXCEPTION 'Access denied: Reassigning website store_id is not permitted.';
    END IF;

    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'Access denied: payment_status cannot be modified directly. Payment verification is required.';
    END IF;

    IF NEW.monthly_fee IS DISTINCT FROM OLD.monthly_fee THEN
      RAISE EXCEPTION 'Access denied: monthly_fee cannot be modified directly.';
    END IF;

    IF NEW.plan_tier IS DISTINCT FROM OLD.plan_tier THEN
      RAISE EXCEPTION 'Access denied: plan_tier cannot be modified directly.';
    END IF;

    IF NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
       OR NEW.grace_period_end IS DISTINCT FROM OLD.grace_period_end THEN
      RAISE EXCEPTION 'Access denied: Billing period dates cannot be modified directly.';
    END IF;

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

    IF NEW.subdomain IS DISTINCT FROM OLD.subdomain THEN
      IF OLD.deployment_status = 'live' THEN
        RAISE EXCEPTION 'Access denied: Subdomain cannot be changed directly while website is live. Unpublish website first.';
      END IF;

      NEW.subdomain := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.subdomain, '')));

      IF pg_catalog.length(NEW.subdomain) < 3 OR pg_catalog.length(NEW.subdomain) > 30 THEN
        RAISE EXCEPTION 'Invalid subdomain: Subdomain must be between 3 and 30 characters long.';
      END IF;

      IF NEW.subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' OR NEW.subdomain LIKE 'xn--%' THEN
        RAISE EXCEPTION 'Invalid subdomain: Subdomain may only contain lowercase letters, numbers, and internal hyphens (cannot start or end with a hyphen).';
      END IF;

      IF NEW.subdomain IN (
        'admin', 'amaas', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'bot', 'bots',
        'cdn', 'dashboard', 'demo', 'dev', 'development', 'dns', 'docs', 'email', 'files', 'ftp',
        'goamaas', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'oauth', 'official',
        'pay', 'payment', 'payments', 'pop', 'portal', 'preview', 'prod', 'production', 'register', 'root',
        'shop', 'smtp', 'ssh', 'stage', 'staging', 'static', 'status', 'store', 'support', 'test',
        'testing', 'webhook', 'webhooks', 'www'
      ) THEN
        RAISE EXCEPTION 'Reserved subdomain: "%" is reserved by the AMAAS platform.', NEW.subdomain;
      END IF;

      IF NEW.full_domain IS NULL OR NEW.full_domain = '' OR NEW.full_domain = OLD.subdomain || '.amaas.xyz' THEN
        NEW.full_domain := NEW.subdomain || '.amaas.xyz';
      END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_subscribed_website_security() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_subscribed_website_security() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_subscribed_website_security() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_subscribed_websites_user_id ON public.subscribed_websites;
DROP TRIGGER IF EXISTS trg_protect_subscribed_website_updates ON public.subscribed_websites;
DROP TRIGGER IF EXISTS trg_protect_subscribed_website_security ON public.subscribed_websites;

CREATE TRIGGER trg_protect_subscribed_website_security
  BEFORE INSERT OR UPDATE OR DELETE ON public.subscribed_websites
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_subscribed_website_security();

-- Synchronize check_subdomain_availability with unified 54-word reserved list and punycode block
CREATE OR REPLACE FUNCTION public.check_subdomain_availability(p_subdomain TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_clean TEXT;
  v_taken BOOLEAN;
BEGIN
  v_clean := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_subdomain, '')));
  IF pg_catalog.length(v_clean) < 3 OR pg_catalog.length(v_clean) > 30 THEN
    RETURN jsonb_build_object('available', false, 'code', 'INVALID_LENGTH', 'reason', 'Subdomain must be between 3 and 30 characters long.');
  END IF;

  IF v_clean !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' OR v_clean LIKE 'xn--%' THEN
    RETURN jsonb_build_object('available', false, 'code', 'INVALID_FORMAT', 'reason', 'Subdomain can only contain lowercase letters, numbers, and internal hyphens (cannot start or end with a hyphen or use punycode).');
  END IF;

  IF v_clean IN (
    'admin', 'amaas', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'bot', 'bots',
    'cdn', 'dashboard', 'demo', 'dev', 'development', 'dns', 'docs', 'email', 'files', 'ftp',
    'goamaas', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'oauth', 'official',
    'pay', 'payment', 'payments', 'pop', 'portal', 'preview', 'prod', 'production', 'register', 'root',
    'shop', 'smtp', 'ssh', 'stage', 'staging', 'static', 'status', 'store', 'support', 'test',
    'testing', 'webhook', 'webhooks', 'www'
  ) THEN
    RETURN jsonb_build_object('available', false, 'code', 'RESERVED', 'reason', 'This subdomain is reserved by the AMAAS platform.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.subscribed_websites
    WHERE pg_catalog.lower(pg_catalog.btrim(subdomain)) = v_clean
  ) INTO v_taken;

  IF v_taken THEN
    RETURN jsonb_build_object('available', false, 'code', 'TAKEN', 'reason', 'This subdomain is already registered by another merchant.');
  END IF;

  RETURN jsonb_build_object('available', true, 'code', 'AVAILABLE');
END;
$$;

REVOKE ALL ON FUNCTION public.check_subdomain_availability(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_subdomain_availability(TEXT) TO anon, authenticated, service_role;

-- Synchronize get_published_website_by_subdomain with unified 3..30 length, punycode block, and 54-word reserved list
CREATE OR REPLACE FUNCTION public.get_published_website_by_subdomain(p_subdomain TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_clean_subdomain TEXT;
  v_site RECORD;
BEGIN
  v_clean_subdomain := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_subdomain, '')));

  IF pg_catalog.length(v_clean_subdomain) < 3
     OR pg_catalog.length(v_clean_subdomain) > 30
     OR v_clean_subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
     OR v_clean_subdomain LIKE 'xn--%'
     OR v_clean_subdomain IN (
       'admin', 'amaas', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'bot', 'bots',
       'cdn', 'dashboard', 'demo', 'dev', 'development', 'dns', 'docs', 'email', 'files', 'ftp',
       'goamaas', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'oauth', 'official',
       'pay', 'payment', 'payments', 'pop', 'portal', 'preview', 'prod', 'production', 'register', 'root',
       'shop', 'smtp', 'ssh', 'stage', 'staging', 'static', 'status', 'store', 'support', 'test',
       'testing', 'webhook', 'webhooks', 'www'
     ) THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'Invalid or reserved subdomain requested.'
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
  WHERE pg_catalog.lower(pg_catalog.btrim(subdomain)) = v_clean_subdomain
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
$$;

REVOKE ALL ON FUNCTION public.get_published_website_by_subdomain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_website_by_subdomain(TEXT) TO anon, authenticated, service_role;

-- Harden publish_client_website, unpublish_client_website, cancel_client_website_subscription,
-- and admin_delete_subscribed_website to eliminate GUC-spoofable auth.role() checks and unify subdomain rules
CREATE OR REPLACE FUNCTION public.publish_client_website(p_website_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_clean_subdomain TEXT;
  v_site RECORD;
BEGIN
  v_user_id := auth.uid();
  v_is_admin := public.is_admin();

  IF v_user_id IS NULL AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Authentication required to publish a website.';
  END IF;

  SELECT id, user_id, store_id
  INTO v_site
  FROM public.subscribed_websites
  WHERE id = p_website_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_FOUND',
      'message', 'Website record not found.'
    );
  END IF;

  IF v_site.user_id IS NULL THEN
    IF NOT v_is_admin THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'ORPHANED_RECORD',
        'message', 'Security exception: Website has no registered owner. Only platform administrators can publish or claim this website.'
      );
    END IF;
  ELSIF v_site.user_id IS DISTINCT FROM v_user_id AND NOT v_is_admin THEN
    IF v_site.store_id IS NULL OR NOT public.can_manage_store(v_site.store_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'FORBIDDEN',
        'message', 'Unauthorized: You do not have permission to publish this website.'
      );
    END IF;
  END IF;

  -- Lock target row FOR UPDATE only after caller authorization has passed
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

  v_clean_subdomain := pg_catalog.lower(pg_catalog.btrim(COALESCE(v_site.subdomain, '')));
  IF pg_catalog.length(v_clean_subdomain) < 3 OR pg_catalog.length(v_clean_subdomain) > 30 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_SUBDOMAIN_LENGTH',
      'message', 'Subdomain must be between 3 and 30 characters in length.'
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
    'admin', 'amaas', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'bot', 'bots',
    'cdn', 'dashboard', 'demo', 'dev', 'development', 'dns', 'docs', 'email', 'files', 'ftp',
    'goamaas', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'oauth', 'official',
    'pay', 'payment', 'payments', 'pop', 'portal', 'preview', 'prod', 'production', 'register', 'root',
    'shop', 'smtp', 'ssh', 'stage', 'staging', 'static', 'status', 'store', 'support', 'test',
    'testing', 'webhook', 'webhooks', 'www'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'RESERVED_SUBDOMAIN',
      'message', 'This subdomain is reserved by the AMAAS platform.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.subscribed_websites
    WHERE pg_catalog.lower(pg_catalog.btrim(subdomain)) = v_clean_subdomain
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
    'message', 'Website published successfully! Accessible at https://' || v_clean_subdomain || '.amaas.xyz',
    'subdomain', v_clean_subdomain,
    'fullDomainUrl', v_clean_subdomain || '.amaas.xyz'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_client_website(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_client_website(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_client_website(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unpublish_client_website(p_website_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_site RECORD;
BEGIN
  v_user_id := auth.uid();
  v_is_admin := public.is_admin();

  IF v_user_id IS NULL AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Authentication required to unpublish a website.';
  END IF;

  SELECT id, user_id, store_id, subdomain
  INTO v_site
  FROM public.subscribed_websites
  WHERE id = p_website_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Website record not found.');
  END IF;

  IF v_site.user_id IS NULL THEN
    IF NOT v_is_admin THEN
      RETURN jsonb_build_object('success', false, 'message', 'Security exception: Website has no registered owner.');
    END IF;
  ELSIF v_site.user_id IS DISTINCT FROM v_user_id AND NOT v_is_admin THEN
    IF v_site.store_id IS NULL OR NOT public.can_manage_store(v_site.store_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: You do not have permission to manage this website.');
    END IF;
  END IF;

  SELECT id, user_id, store_id, subdomain
  INTO v_site
  FROM public.subscribed_websites
  WHERE id = p_website_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Website record not found.');
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
$$;

REVOKE ALL ON FUNCTION public.unpublish_client_website(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unpublish_client_website(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.unpublish_client_website(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_client_website_subscription(p_website_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN;
  v_site RECORD;
BEGIN
  v_caller_id := auth.uid();
  v_is_admin := public.is_admin();

  IF v_caller_id IS NULL AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Authentication required: You must be signed in to cancel a subscription.';
  END IF;

  SELECT id, user_id, store_id, business_name, subdomain, status, deployment_status
  INTO v_site
  FROM public.subscribed_websites
  WHERE id = p_website_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Website record not found.'
    );
  END IF;

  IF NOT v_is_admin THEN
    IF v_site.user_id IS NULL OR (
      v_site.user_id IS DISTINCT FROM v_caller_id AND (
        v_site.store_id IS NULL OR NOT public.can_manage_store(v_site.store_id)
      )
    ) THEN
      RAISE EXCEPTION 'Access denied: You do not have permission to cancel this website subscription.';
    END IF;
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
$$;

REVOKE ALL ON FUNCTION public.cancel_client_website_subscription(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_client_website_subscription(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_client_website_subscription(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_subscribed_website(p_website_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_deleted RECORD;
BEGIN
  IF NOT public.is_admin() THEN
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
$$;

REVOKE ALL ON FUNCTION public.admin_delete_subscribed_website(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_subscribed_website(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_subscribed_website(UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 4. Payment Gateway Configurations Hardening & Verified-Admin Update RPC
-- --------------------------------------------------------------------------------
ALTER TABLE public.payment_gateway_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_configs NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_gateway_configs'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.payment_gateway_configs', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Payment gateway configs select policy"
  ON public.payment_gateway_configs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Payment gateway configs service role policy"
  ON public.payment_gateway_configs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.payment_gateway_configs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payment_gateway_configs TO authenticated;
GRANT ALL ON TABLE public.payment_gateway_configs TO service_role;

-- Idempotently ensure canonical gateway rows exist as configuration-only skeletons
-- without embedding live account details or overwriting existing settings
INSERT INTO public.payment_gateway_configs (id, display_name, is_enabled, account_number, instructions)
VALUES
  ('bkash', 'bKash Personal (Send Money)', false, '', 'Configure receiving bKash number in Admin Console before enabling.'),
  ('nagad', 'Nagad Personal (Send Money)', false, '', 'Configure receiving Nagad number in Admin Console before enabling.'),
  ('bank_transfer', 'Official Bank Transfer', false, '', 'Configure official bank account details in Admin Console before enabling.'),
  ('whatsapp_support', 'Official WhatsApp Billing & Domain Support', false, '', 'Configure official WhatsApp billing support number in Admin Console.')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_update_payment_gateway_config(
  p_gateway_id TEXT,
  p_is_enabled BOOLEAN DEFAULT NULL,
  p_account_number TEXT DEFAULT NULL,
  p_account_name TEXT DEFAULT NULL,
  p_bank_name TEXT DEFAULT NULL,
  p_branch_name TEXT DEFAULT NULL,
  p_routing_number TEXT DEFAULT NULL,
  p_instructions TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_admin_id UUID;
  v_clean_id TEXT;
  v_existing RECORD;
  v_effective_enabled BOOLEAN;
  v_effective_acc TEXT;
  v_updated RECORD;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL OR NOT public.is_verified_platform_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Only verified platform administrators can modify payment gateway configurations';
  END IF;

  v_clean_id := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_gateway_id, '')));
  IF v_clean_id NOT IN ('bkash', 'nagad', 'bank_transfer', 'whatsapp_support') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_GATEWAY',
      'message', 'Unsupported payment gateway identifier.'
    );
  END IF;

  SELECT *
  INTO v_existing
  FROM public.payment_gateway_configs
  WHERE id = v_clean_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_FOUND',
      'message', 'Payment gateway configuration row not found.'
    );
  END IF;

  v_effective_enabled := COALESCE(p_is_enabled, v_existing.is_enabled);
  v_effective_acc := CASE
    WHEN p_account_number IS NULL THEN pg_catalog.btrim(COALESCE(v_existing.account_number, ''))
    ELSE pg_catalog.btrim(p_account_number)
  END;

  IF v_effective_enabled = true AND v_clean_id IN ('bkash', 'nagad', 'bank_transfer') AND v_effective_acc = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'MISSING_ACCOUNT_NUMBER',
      'message', 'Cannot enable a payment gateway without a valid receiving account number.'
    );
  END IF;

  UPDATE public.payment_gateway_configs
  SET
    is_enabled = v_effective_enabled,
    account_number = CASE WHEN p_account_number IS NULL THEN account_number ELSE v_effective_acc END,
    account_name = CASE WHEN p_account_name IS NULL THEN account_name ELSE pg_catalog.btrim(p_account_name) END,
    bank_name = CASE WHEN p_bank_name IS NULL THEN bank_name ELSE pg_catalog.btrim(p_bank_name) END,
    branch_name = CASE WHEN p_branch_name IS NULL THEN branch_name ELSE pg_catalog.btrim(p_branch_name) END,
    routing_number = CASE WHEN p_routing_number IS NULL THEN routing_number ELSE pg_catalog.btrim(p_routing_number) END,
    instructions = CASE WHEN p_instructions IS NULL THEN instructions ELSE pg_catalog.btrim(p_instructions) END,
    updated_by = v_admin_id,
    updated_at = NOW()
  WHERE id = v_clean_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'UPDATED',
    'message', 'Payment gateway configuration updated.',
    'config', row_to_json(v_updated)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_payment_gateway_config(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_payment_gateway_config(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_payment_gateway_config(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 5. Authoritative Database Pricing Catalog & Payment Request Pricing/Gateway Trigger
-- --------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_pricing_catalog (
  service_type TEXT NOT NULL CHECK (service_type IN ('website_subscription', 'website_package', 'dashboard_plan', 'ai_automation')),
  service_code TEXT NOT NULL,
  plan_tier_label TEXT NOT NULL,
  price_bdt NUMERIC NOT NULL CHECK (price_bdt > 0),
  setup_fee_bdt NUMERIC NOT NULL DEFAULT 0 CHECK (setup_fee_bdt >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (service_type, service_code)
);

ALTER TABLE public.service_pricing_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_pricing_catalog NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_pricing_catalog'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.service_pricing_catalog', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Service pricing catalog select policy"
  ON public.service_pricing_catalog FOR SELECT
  TO authenticated
  USING (is_active = true OR public.is_verified_platform_admin(auth.uid()));

CREATE POLICY "Service pricing catalog service role policy"
  ON public.service_pricing_catalog FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.service_pricing_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.service_pricing_catalog TO authenticated;
GRANT ALL ON TABLE public.service_pricing_catalog TO service_role;

-- Seed missing catalog entries only; never overwrite legitimate administrator-managed prices
INSERT INTO public.service_pricing_catalog (service_type, service_code, plan_tier_label, price_bdt, setup_fee_bdt, is_active)
VALUES
  -- Website subscription default monthly tier (per-website monthly_fee is authoritative)
  ('website_subscription', 'website_lite', 'AMAAS Website Lite', 600, 0, true),
  -- One-time custom website packages
  ('website_package', 'starter_web', 'Starter Website', 8000, 0, true),
  ('website_package', 'business_web', 'Business Website', 15000, 0, true),
  ('website_package', 'advanced_web', 'Advanced Website', 25000, 0, true),
  ('website_package', 'custom_setup', 'Custom Setup Package', 5000, 0, true),
  -- Dashboard SaaS monthly tiers
  ('dashboard_plan', 'starter', 'Starter', 299, 0, true),
  ('dashboard_plan', 'business', 'Business', 599, 0, true),
  ('dashboard_plan', 'pro', 'Pro', 999, 0, true),
  ('dashboard_plan', 'enterprise', 'Enterprise', 1999, 0, true),
  ('dashboard_plan', 'dashboard_starter', 'Starter', 299, 0, true),
  ('dashboard_plan', 'dashboard_business', 'Business', 599, 0, true),
  ('dashboard_plan', 'dashboard_pro', 'Pro', 999, 0, true),
  ('dashboard_plan', 'dashboard_enterprise', 'Enterprise', 1999, 0, true),
  ('dashboard_plan', 'plan_starter', 'Starter', 500, 0, true),
  ('dashboard_plan', 'plan_growth', 'Growth', 1500, 0, true),
  ('dashboard_plan', 'plan_pro', 'Pro', 2500, 0, true),
  ('dashboard_plan', 'plan_enterprise', 'Enterprise', 2500, 0, true),
  -- AI Automation monthly service tiers (+ optional initial setup fee)
  ('ai_automation', 'basic_auto', 'BASIC AUTOMATION', 999, 1000, true),
  ('ai_automation', 'growth_auto', 'GROWTH AUTOMATION', 2499, 1500, true),
  ('ai_automation', 'ai_chatbot', 'AI CHATBOT', 3999, 0, true),
  ('ai_automation', 'biz_auto_pro', 'BUSINESS AUTOMATION PRO', 7999, 0, true),
  ('ai_automation', 'messenger_starter', 'Messenger AI Starter', 999, 1000, true),
  ('ai_automation', 'whatsapp_sales', 'WhatsApp AI Sales Agent', 2499, 2500, true),
  ('ai_automation', 'order_suite', 'Order & Follow-up Automation Suite', 3999, 3500, true),
  ('ai_automation', 'full_ai_pack', 'Full Commerce AI Automation Pack', 7999, 5000, true),
  ('ai_automation', 'ai_automations', 'AI Automation Suite', 999, 1000, true),
  ('ai_automation', 'ai_order_assistant', 'Order Automation Pack', 2000, 0, true),
  ('ai_automation', 'ai_bot', 'Bot Plan', 1200, 0, true)
ON CONFLICT (service_type, service_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.validate_payment_request_pricing_and_method()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role TEXT;
  v_is_privileged_backend BOOLEAN := false;
  v_gateway_id TEXT;
  v_gateway_enabled BOOLEAN;
  v_gateway_account TEXT;
  v_clean_service_id TEXT;
  v_clean_service_name TEXT;
  v_clean_plan_tier TEXT;
  v_package_code TEXT;
  v_site_monthly_fee NUMERIC;
  v_expected_price NUMERIC;
  v_expected_setup NUMERIC;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount::TEXT IN ('NaN', 'Infinity', '-Infinity') OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Invalid payment amount: amount must be a finite positive number.';
  END IF;

  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');

  IF v_active_role = 'service_role' OR session_user = 'service_role' THEN
    v_is_privileged_backend := true;
  ELSIF v_active_role IN ('none', current_user) AND auth.uid() IS NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      LEFT JOIN pg_catalog.pg_class c
        ON c.oid = 'public.payment_requests'::pg_catalog.regclass
       AND c.relowner = r.oid
      WHERE r.rolname = session_user
        AND (r.rolsuper = true OR c.oid IS NOT NULL)
    ) INTO v_is_privileged_backend;
  END IF;

  -- Privileged backend / owner administrative seeding may insert historical or audit rows directly
  IF v_is_privileged_backend THEN
    RETURN NEW;
  END IF;

  -- 1. Enforce enabled payment gateway configuration (blocks disabled Nagad or any disabled method)
  v_gateway_id := CASE NEW.payment_method
    WHEN 'bKash' THEN 'bkash'
    WHEN 'Nagad' THEN 'nagad'
    WHEN 'Bank Transfer' THEN 'bank_transfer'
    ELSE NULL
  END;

  IF v_gateway_id IS NULL THEN
    RAISE EXCEPTION 'Invalid payment method "%".', COALESCE(NEW.payment_method, 'NULL');
  END IF;

  SELECT g.is_enabled, pg_catalog.btrim(COALESCE(g.account_number, ''))
  INTO v_gateway_enabled, v_gateway_account
  FROM public.payment_gateway_configs g
  WHERE g.id = v_gateway_id;

  IF NOT FOUND OR v_gateway_enabled IS DISTINCT FROM true OR v_gateway_account = '' THEN
    RAISE EXCEPTION 'Payment method "%" is currently disabled or unavailable.', NEW.payment_method;
  END IF;

  -- 2. Enforce authoritative database pricing per service_type
  v_clean_service_id := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.service_id, '')));
  v_clean_service_name := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.service_name, '')));
  v_clean_plan_tier := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.plan_tier, '')));

  IF NEW.service_type = 'website_subscription' THEN
    IF v_clean_service_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Invalid service_id for website_subscription: expected website UUID.';
    END IF;

    SELECT COALESCE(sw.monthly_fee, 600)
    INTO v_site_monthly_fee
    FROM public.subscribed_websites sw
    WHERE sw.id = v_clean_service_id::UUID
      AND sw.user_id = NEW.user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target website record does not exist or is not owned by the submitting user for website_subscription.';
    END IF;

    IF NEW.amount <> v_site_monthly_fee THEN
      RAISE EXCEPTION 'Invalid payment amount: expected authoritative website subscription fee of % BDT, got %.',
        v_site_monthly_fee, NEW.amount;
    END IF;

  ELSIF NEW.service_type = 'website_package' THEN
    IF v_clean_service_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Invalid service_id for website_package: expected website UUID.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.subscribed_websites sw
      WHERE sw.id = v_clean_service_id::UUID
        AND sw.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Target website record does not exist or is not owned by the submitting user for website_package.';
    END IF;

    IF v_clean_plan_tier LIKE '%starter%' OR v_clean_service_name LIKE '%starter%' THEN
      v_package_code := 'starter_web';
    ELSIF v_clean_plan_tier LIKE '%business%' OR v_clean_service_name LIKE '%business%' THEN
      v_package_code := 'business_web';
    ELSIF v_clean_plan_tier LIKE '%advanced%' OR v_clean_service_name LIKE '%advanced%' THEN
      v_package_code := 'advanced_web';
    ELSIF v_clean_service_name LIKE '%custom setup%' OR v_clean_plan_tier = 'one-time' THEN
      v_package_code := 'custom_setup';
    ELSE
      SELECT c.service_code
      INTO v_package_code
      FROM public.service_pricing_catalog c
      WHERE c.service_type = 'website_package'
        AND c.is_active = true
        AND (
          pg_catalog.lower(c.service_code) IN (v_clean_plan_tier, v_clean_service_name)
          OR pg_catalog.lower(c.plan_tier_label) IN (v_clean_plan_tier, v_clean_service_name)
        )
      LIMIT 1;
    END IF;

    IF v_package_code IS NOT NULL THEN
      SELECT c.price_bdt
      INTO v_expected_price
      FROM public.service_pricing_catalog c
      WHERE c.service_type = 'website_package'
        AND c.service_code = v_package_code
        AND c.is_active = true;
    END IF;

    IF v_expected_price IS NULL OR NEW.amount <> v_expected_price THEN
      RAISE EXCEPTION 'Invalid payment amount: amount % does not match authoritative website_package pricing.', NEW.amount;
    END IF;

  ELSIF NEW.service_type = 'dashboard_plan' THEN
    SELECT c.price_bdt
    INTO v_expected_price
    FROM public.service_pricing_catalog c
    WHERE c.service_type = 'dashboard_plan'
      AND c.is_active = true
      AND c.service_code = v_clean_service_id;

    IF NOT FOUND AND v_clean_service_id LIKE 'plan_%' AND v_clean_plan_tier = 'pro' THEN
      SELECT c.price_bdt
      INTO v_expected_price
      FROM public.service_pricing_catalog c
      WHERE c.service_type = 'dashboard_plan'
        AND c.service_code = 'plan_pro'
        AND c.is_active = true;
    END IF;

    IF v_expected_price IS NULL THEN
      RAISE EXCEPTION 'Invalid or ineligible service_id "%" for dashboard_plan.', NEW.service_id;
    END IF;

    IF NEW.amount <> v_expected_price THEN
      RAISE EXCEPTION 'Invalid payment amount: expected authoritative dashboard_plan price of % BDT, got %.',
        v_expected_price, NEW.amount;
    END IF;

  ELSIF NEW.service_type = 'ai_automation' THEN
    SELECT c.price_bdt, c.setup_fee_bdt
    INTO v_expected_price, v_expected_setup
    FROM public.service_pricing_catalog c
    WHERE c.service_type = 'ai_automation'
      AND c.is_active = true
      AND c.service_code = v_clean_service_id;

    IF NOT FOUND AND (
      v_clean_service_id LIKE 'race_bot_%'
      OR v_clean_service_id LIKE 'ai_bank_race_%'
      OR v_clean_service_name IN ('ai bot', 'bot')
    ) THEN
      SELECT c.price_bdt, c.setup_fee_bdt
      INTO v_expected_price, v_expected_setup
      FROM public.service_pricing_catalog c
      WHERE c.service_type = 'ai_automation'
        AND c.service_code = 'ai_bot'
        AND c.is_active = true;
    END IF;

    IF v_expected_price IS NULL THEN
      RAISE EXCEPTION 'Invalid or ineligible service_id "%" for ai_automation.', NEW.service_id;
    END IF;

    IF NEW.amount <> v_expected_price AND NEW.amount <> (v_expected_price + COALESCE(v_expected_setup, 0)) THEN
      RAISE EXCEPTION 'Invalid payment amount: expected authoritative ai_automation price of % BDT (or % BDT with setup), got %.',
        v_expected_price, (v_expected_price + COALESCE(v_expected_setup, 0)), NEW.amount;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_payment_request_pricing_and_method() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_payment_request_pricing_and_method() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_payment_request_pricing_and_method() TO service_role;

DROP TRIGGER IF EXISTS trg_validate_payment_request_pricing_and_method ON public.payment_requests;
CREATE TRIGGER trg_validate_payment_request_pricing_and_method
  BEFORE INSERT ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_request_pricing_and_method();

-- --------------------------------------------------------------------------------
-- 6. Immutable Website Lifecycle Audit Trail & Hardened Admin Lifecycle RPC
-- --------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.website_lifecycle_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL,
  admin_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('suspend', 'reactivate', 'renew')),
  reason TEXT NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(reason)) > 0),
  verified_payment_request_id UUID,
  previous_status TEXT,
  new_status TEXT,
  previous_deployment_status TEXT,
  new_deployment_status TEXT,
  payment_status_snapshot TEXT,
  previous_period_end TIMESTAMPTZ,
  new_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_lifecycle_audit_logs_website_created
  ON public.website_lifecycle_audit_logs (website_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_website_lifecycle_audit_logs_admin_created
  ON public.website_lifecycle_audit_logs (admin_id, created_at DESC);

ALTER TABLE public.website_lifecycle_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_lifecycle_audit_logs NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'website_lifecycle_audit_logs'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.website_lifecycle_audit_logs', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Website lifecycle audit logs admin select policy"
  ON public.website_lifecycle_audit_logs FOR SELECT
  TO authenticated
  USING (public.is_verified_platform_admin(auth.uid()));

CREATE POLICY "Website lifecycle audit logs service role policy"
  ON public.website_lifecycle_audit_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.website_lifecycle_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.website_lifecycle_audit_logs TO authenticated;
GRANT ALL ON TABLE public.website_lifecycle_audit_logs TO service_role;

CREATE OR REPLACE FUNCTION public.protect_website_lifecycle_audit_logs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := NOW();
    RETURN NEW;
  END IF;

  IF COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none') = 'service_role'
     OR session_user = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Website lifecycle audit logs are immutable and cannot be modified or deleted.';
END;
$$;

REVOKE ALL ON FUNCTION public.protect_website_lifecycle_audit_logs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_website_lifecycle_audit_logs() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_website_lifecycle_audit_logs() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_website_lifecycle_audit_logs ON public.website_lifecycle_audit_logs;
CREATE TRIGGER trg_protect_website_lifecycle_audit_logs
  BEFORE INSERT OR UPDATE OR DELETE ON public.website_lifecycle_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_website_lifecycle_audit_logs();

CREATE OR REPLACE FUNCTION public.block_website_lifecycle_audit_logs_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none') = 'service_role'
     OR session_user = 'service_role' THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'Website lifecycle audit logs are immutable and cannot be truncated.';
END;
$$;

REVOKE ALL ON FUNCTION public.block_website_lifecycle_audit_logs_truncate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.block_website_lifecycle_audit_logs_truncate() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_website_lifecycle_audit_logs_truncate() TO service_role;

DROP TRIGGER IF EXISTS trg_block_website_lifecycle_audit_logs_truncate ON public.website_lifecycle_audit_logs;
CREATE TRIGGER trg_block_website_lifecycle_audit_logs_truncate
  BEFORE TRUNCATE ON public.website_lifecycle_audit_logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.block_website_lifecycle_audit_logs_truncate();

CREATE OR REPLACE FUNCTION public.admin_update_website_lifecycle(
  p_website_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_admin_id UUID;
  v_clean_action TEXT;
  v_clean_reason TEXT;
  v_site RECORD;
  v_verified_payment_id UUID := NULL;
  v_new_period_end TIMESTAMPTZ;
  v_new_grace_end TIMESTAMPTZ;
  v_audit_id UUID;
  v_rows INTEGER := 0;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL OR NOT public.is_verified_platform_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Only verified platform administrators can manage website lifecycle';
  END IF;

  v_clean_action := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_action, '')));
  IF v_clean_action NOT IN ('suspend', 'reactivate', 'renew') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_ACTION',
      'message', 'Unsupported lifecycle action. Expected suspend, reactivate, or renew.'
    );
  END IF;

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

  IF v_clean_action IN ('reactivate', 'renew') THEN
    IF v_site.status = 'cancelled' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'SUBSCRIPTION_CANCELLED',
        'message', 'Cannot reactivate or renew a cancelled website subscription.'
      );
    END IF;

    SELECT pr.id
    INTO v_verified_payment_id
    FROM public.payment_requests pr
    WHERE pr.status = 'approved'
      AND pr.service_type IN ('website_subscription', 'website_package')
      AND pr.user_id = v_site.user_id
      AND pg_catalog.lower(pg_catalog.btrim(pr.service_id)) = pg_catalog.lower(p_website_id::TEXT)
    ORDER BY COALESCE(pr.reviewed_at, pr.updated_at, pr.created_at) DESC
    LIMIT 1;

    IF v_site.payment_status IS DISTINCT FROM 'paid' OR v_verified_payment_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PAYMENT_REQUIRED',
        'message', 'Cannot activate or renew website without a verified approved payment request. Approve a payment submission first.'
      );
    END IF;
  END IF;

  v_clean_reason := NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '');
  IF v_clean_reason IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'REASON_REQUIRED',
      'message', 'An explicit administrative reason is required for website lifecycle audit logging.'
    );
  END IF;

  IF v_clean_action = 'suspend' THEN
    UPDATE public.subscribed_websites
    SET
      status = 'suspended',
      deployment_status = 'suspended',
      updated_at = NOW()
    WHERE id = p_website_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'Failed to suspend website %', p_website_id;
    END IF;

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
      v_admin_id,
      'suspend',
      v_clean_reason,
      NULL,
      v_site.status,
      'suspended',
      v_site.deployment_status,
      'suspended',
      v_site.payment_status,
      v_site.current_period_end,
      v_site.current_period_end
    )
    RETURNING id INTO v_audit_id;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'SUSPENDED',
      'message', 'Website suspended and taken offline.',
      'websiteId', p_website_id,
      'status', 'suspended',
      'deploymentStatus', 'suspended',
      'auditLogId', v_audit_id
    );

  ELSIF v_clean_action = 'reactivate' THEN
    v_new_period_end := CASE
      WHEN v_site.current_period_end IS NULL OR v_site.current_period_end < NOW() THEN NOW() + INTERVAL '30 days'
      ELSE v_site.current_period_end
    END;
    v_new_grace_end := CASE
      WHEN v_site.grace_period_end IS NULL OR v_site.grace_period_end < NOW() THEN NOW() + INTERVAL '35 days'
      ELSE v_site.grace_period_end
    END;

    UPDATE public.subscribed_websites
    SET
      status = 'active',
      deployment_status = 'live',
      current_period_end = v_new_period_end,
      grace_period_end = v_new_grace_end,
      updated_at = NOW()
    WHERE id = p_website_id
      AND payment_status = 'paid';

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'Failed to reactivate website %', p_website_id;
    END IF;

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
      v_admin_id,
      'reactivate',
      v_clean_reason,
      v_verified_payment_id,
      v_site.status,
      'active',
      v_site.deployment_status,
      'live',
      v_site.payment_status,
      v_site.current_period_end,
      v_new_period_end
    )
    RETURNING id INTO v_audit_id;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'REACTIVATED',
      'message', 'Website reactivated and live.',
      'websiteId', p_website_id,
      'status', 'active',
      'deploymentStatus', 'live',
      'auditLogId', v_audit_id
    );

  ELSIF v_clean_action = 'renew' THEN
    v_new_period_end := GREATEST(COALESCE(v_site.current_period_end, NOW()), NOW()) + INTERVAL '30 days';
    v_new_grace_end := v_new_period_end + INTERVAL '5 days';

    -- Never mutate payment_status here; verified payment_status = 'paid' is enforced above and in WHERE
    UPDATE public.subscribed_websites
    SET
      status = 'active',
      current_period_end = v_new_period_end,
      grace_period_end = v_new_grace_end,
      updated_at = NOW()
    WHERE id = p_website_id
      AND payment_status = 'paid';

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'Failed to renew website %', p_website_id;
    END IF;

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
      v_admin_id,
      'renew',
      v_clean_reason,
      v_verified_payment_id,
      v_site.status,
      'active',
      v_site.deployment_status,
      v_site.deployment_status,
      v_site.payment_status,
      v_site.current_period_end,
      v_new_period_end
    )
    RETURNING id INTO v_audit_id;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'RENEWED',
      'message', 'Website subscription renewed for 30 days.',
      'websiteId', p_website_id,
      'status', 'active',
      'paymentStatus', v_site.payment_status,
      'currentPeriodEnd', v_new_period_end,
      'gracePeriodEnd', v_new_grace_end,
      'auditLogId', v_audit_id
    );
  END IF;

  RETURN jsonb_build_object('success', false, 'code', 'UNEXPECTED_STATE', 'message', 'No lifecycle transition applied.');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_website_lifecycle(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_website_lifecycle(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_website_lifecycle(UUID, TEXT, TEXT) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 6b. Service Trials Policy Hardening (No Website Free Trial) & Legacy search_path Fix
-- --------------------------------------------------------------------------------
ALTER TABLE public.service_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_trials NO FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.service_trials FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.service_trials TO authenticated;
GRANT ALL ON TABLE public.service_trials TO service_role;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_trials'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.service_trials', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Service trials select policy"
  ON public.service_trials FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Service trials insert policy"
  ON public.service_trials FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND service_category IN ('dashboard', 'ai_automation', 'landing_pages')
    AND (store_id IS NULL OR public.can_access_store(store_id))
    AND expires_at <= (NOW() + INTERVAL '7 days 5 minutes')
  );

CREATE POLICY "Service trials update policy"
  ON public.service_trials FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Service trials delete policy"
  ON public.service_trials FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Service trials service role policy"
  ON public.service_trials FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

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

DROP TRIGGER IF EXISTS trg_protect_service_trial ON public.service_trials;
CREATE TRIGGER trg_protect_service_trial
  BEFORE INSERT OR UPDATE ON public.service_trials
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_service_trial_invariants();

CREATE OR REPLACE FUNCTION public.activate_service_trial(
  p_service_id TEXT,
  p_service_name TEXT,
  p_service_category TEXT,
  p_store_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_clean_id TEXT;
  v_clean_name TEXT;
  v_clean_cat TEXT;
  v_existing RECORD;
  v_new_trial RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to activate a service trial';
  END IF;

  v_clean_id := pg_catalog.btrim(COALESCE(p_service_id, ''));
  v_clean_name := pg_catalog.btrim(COALESCE(p_service_name, ''));
  v_clean_cat := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_service_category, '')));

  IF v_clean_id = '' OR v_clean_name = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_SERVICE',
      'message', 'Service identifier and name are required.'
    );
  END IF;

  IF v_clean_cat = 'website'
     OR v_clean_cat NOT IN ('dashboard', 'ai_automation', 'landing_pages')
     OR pg_catalog.lower(v_clean_id) IN ('website_lite', 'business_website_lite', 'bespoke_web_dev') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'TRIAL_NOT_ELIGIBLE',
      'message', 'Free trials are not available for Website Service. Paid verification is required.'
    );
  END IF;

  IF p_store_id IS NOT NULL AND NOT public.can_access_store(p_store_id) THEN
    RAISE EXCEPTION 'Access denied: Invalid or unauthorized store_id for service trial.';
  END IF;

  SELECT * INTO v_existing
  FROM public.service_trials
  WHERE user_id = v_user_id AND service_id = v_clean_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'TRIAL_ALREADY_USED',
      'message', 'You have already activated the 7-day free trial for this service.',
      'trial', row_to_json(v_existing)
    );
  END IF;

  INSERT INTO public.service_trials (
    user_id,
    store_id,
    service_id,
    service_name,
    service_category,
    status,
    started_at,
    expires_at
  ) VALUES (
    v_user_id,
    p_store_id,
    v_clean_id,
    v_clean_name,
    v_clean_cat,
    'active',
    NOW(),
    NOW() + INTERVAL '7 days'
  )
  RETURNING * INTO v_new_trial;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'TRIAL_ACTIVATED',
    'message', 'Your 7-day free trial has been activated successfully!',
    'trial', row_to_json(v_new_trial)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

-- Harden search_path on all earlier migration SECURITY DEFINER helpers so pg_catalog always precedes public
DO $$
DECLARE
  v_sig TEXT;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.handle_new_user()',
    'public.can_access_store(uuid)',
    'public.can_manage_store(uuid)',
    'public.protect_store_membership()',
    'public.protect_tenant_store_id()',
    'public.protect_user_ownership()'
  ]
  LOOP
    IF pg_catalog.to_regprocedure(v_sig) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp', v_sig);
    END IF;
  END LOOP;
END $$;

-- --------------------------------------------------------------------------------
-- 7. Owner Alignment & Post-Migration Security Invariant Verification
-- --------------------------------------------------------------------------------
DO $$
DECLARE
  v_pr_owner_oid OID;
  v_pr_owner NAME;
  v_bad_secdef TEXT[];
BEGIN
  SELECT c.relowner, pg_catalog.pg_get_userbyid(c.relowner)
  INTO v_pr_owner_oid, v_pr_owner
  FROM pg_catalog.pg_class c
  WHERE c.oid = 'public.payment_requests'::pg_catalog.regclass;

  IF v_pr_owner IS NULL OR v_pr_owner IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'Security invariant check failed: Invalid public.payment_requests owner "%".', COALESCE(v_pr_owner::TEXT, 'NULL');
  END IF;

  IF (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.service_pricing_catalog'::pg_catalog.regclass) <> v_pr_owner_oid THEN
    EXECUTE format('ALTER TABLE public.service_pricing_catalog OWNER TO %I', v_pr_owner);
  END IF;

  IF (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.payment_gateway_configs'::pg_catalog.regclass) <> v_pr_owner_oid THEN
    EXECUTE format('ALTER TABLE public.payment_gateway_configs OWNER TO %I', v_pr_owner);
  END IF;

  IF (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.website_lifecycle_audit_logs'::pg_catalog.regclass) <> v_pr_owner_oid THEN
    EXECUTE format('ALTER TABLE public.website_lifecycle_audit_logs OWNER TO %I', v_pr_owner);
  END IF;

  IF (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.service_trials'::pg_catalog.regclass) <> v_pr_owner_oid THEN
    EXECUTE format('ALTER TABLE public.service_trials OWNER TO %I', v_pr_owner);
  END IF;

  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_gateway_configs TO %I', v_pr_owner);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_pricing_catalog TO %I', v_pr_owner);
  EXECUTE format('GRANT SELECT, INSERT ON TABLE public.website_lifecycle_audit_logs TO %I', v_pr_owner);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_trials TO %I', v_pr_owner);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stores TO %I', v_pr_owner);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscribed_websites TO %I', v_pr_owner);

  EXECUTE format('ALTER FUNCTION public.protect_store_ownership() OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.protect_subscribed_website_security() OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.check_subdomain_availability(TEXT) OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.get_published_website_by_subdomain(TEXT) OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.publish_client_website(UUID) OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.unpublish_client_website(UUID) OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.cancel_client_website_subscription(UUID) OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.admin_delete_subscribed_website(UUID) OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.admin_update_payment_gateway_config(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.validate_payment_request_pricing_and_method() OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.protect_website_lifecycle_audit_logs() OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.block_website_lifecycle_audit_logs_truncate() OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.admin_update_website_lifecycle(UUID, TEXT, TEXT) OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.protect_service_trial_invariants() OWNER TO %I', v_pr_owner);
  EXECUTE format('ALTER FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID) OWNER TO %I', v_pr_owner);

  IF pg_catalog.to_regprocedure('public.can_access_store(uuid)') IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION public.can_access_store(UUID) OWNER TO %I', v_pr_owner);
  END IF;
  IF pg_catalog.to_regprocedure('public.can_manage_store(uuid)') IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION public.can_manage_store(UUID) OWNER TO %I', v_pr_owner);
  END IF;
  IF pg_catalog.to_regprocedure('public.protect_store_membership()') IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION public.protect_store_membership() OWNER TO %I', v_pr_owner);
  END IF;
  IF pg_catalog.to_regprocedure('public.protect_tenant_store_id()') IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION public.protect_tenant_store_id() OWNER TO %I', v_pr_owner);
  END IF;
  IF pg_catalog.to_regprocedure('public.protect_user_ownership()') IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION public.protect_user_ownership() OWNER TO %I', v_pr_owner);
  END IF;

  -- Verify stores least-privilege invariants
  IF has_table_privilege('anon', 'public.stores', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'Security invariant check failed: anon holds privileges on public.stores.';
  END IF;
  IF has_table_privilege('authenticated', 'public.stores', 'DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
    RAISE EXCEPTION 'Security invariant check failed: authenticated holds forbidden DELETE/DDL privileges on public.stores.';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.stores', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.stores', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.stores', 'UPDATE') THEN
    RAISE EXCEPTION 'Security invariant check failed: authenticated lacks required SELECT/INSERT/UPDATE privileges on public.stores.';
  END IF;

  -- Verify subscribed_websites column-level least-privilege invariants
  IF has_table_privilege('anon', 'public.subscribed_websites', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('authenticated', 'public.subscribed_websites', 'DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'Security invariant check failed: Unauthorized anon or DELETE/TRUNCATE privilege on public.subscribed_websites.';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.subscribed_websites', 'plan_tier', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.subscribed_websites', 'monthly_fee', 'INSERT') THEN
    RAISE EXCEPTION 'Security invariant check failed: authenticated lacks INSERT column grant on subscribed_websites(plan_tier, monthly_fee).';
  END IF;
  IF has_column_privilege('authenticated', 'public.subscribed_websites', 'monthly_fee', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.subscribed_websites', 'payment_status', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.subscribed_websites', 'deployment_status', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.subscribed_websites', 'status', 'UPDATE') THEN
    RAISE EXCEPTION 'Security invariant check failed: authenticated holds forbidden UPDATE column grant on billing/deployment columns of public.subscribed_websites.';
  END IF;

  -- Verify payment_gateway_configs, service_pricing_catalog, website_lifecycle_audit_logs & service_trials least-privilege invariants
  IF has_table_privilege('anon', 'public.payment_gateway_configs', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('authenticated', 'public.payment_gateway_configs', 'INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'Security invariant check failed: Client roles hold unauthorized write/anon access on public.payment_gateway_configs.';
  END IF;

  IF has_table_privilege('anon', 'public.service_pricing_catalog', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('authenticated', 'public.service_pricing_catalog', 'INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'Security invariant check failed: Client roles hold unauthorized write/anon access on public.service_pricing_catalog.';
  END IF;

  IF has_table_privilege('anon', 'public.website_lifecycle_audit_logs', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('authenticated', 'public.website_lifecycle_audit_logs', 'INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'Security invariant check failed: Client roles hold unauthorized write/anon access on public.website_lifecycle_audit_logs.';
  END IF;

  IF has_table_privilege('anon', 'public.service_trials', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('authenticated', 'public.service_trials', 'DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'Security invariant check failed: Client roles hold unauthorized anon/DELETE access on public.service_trials.';
  END IF;

  IF has_function_privilege('anon', 'public.admin_update_payment_gateway_config(text, boolean, text, text, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_update_website_lifecycle(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.protect_subscribed_website_security()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_subscribed_website_security()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.validate_payment_request_pricing_and_method()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.validate_payment_request_pricing_and_method()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.protect_website_lifecycle_audit_logs()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_website_lifecycle_audit_logs()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.block_website_lifecycle_audit_logs_truncate()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.block_website_lifecycle_audit_logs_truncate()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.activate_service_trial(text, text, text, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.protect_service_trial_invariants()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_service_trial_invariants()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security invariant check failed: Forbidden anon/authenticated EXECUTE privilege on 20261026 security functions.';
  END IF;

  -- Verify zero PUBLIC or anon RLS policies remain on sensitive multi-tenant & billing tables
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename IN (
        'stores',
        'subscribed_websites',
        'payment_requests',
        'payment_gateway_configs',
        'service_pricing_catalog',
        'website_lifecycle_audit_logs',
        'service_trials'
      )
      AND ('public' = ANY(pol.roles) OR 'anon' = ANY(pol.roles))
  ) THEN
    RAISE EXCEPTION 'Security invariant check failed: Forbidden PUBLIC or anon RLS policy detected on protected table.';
  END IF;

  -- Verify every SECURITY DEFINER function in public schema pins search_path with pg_catalog first
  SELECT array_agg(p.oid::pg_catalog.regprocedure::TEXT ORDER BY p.proname)
  INTO v_bad_secdef
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(COALESCE(p.proconfig, ARRAY[]::TEXT[])) cfg
      WHERE cfg LIKE 'search_path=pg_catalog%'
    );

  IF v_bad_secdef IS NOT NULL AND array_length(v_bad_secdef, 1) > 0 THEN
    RAISE EXCEPTION 'Security invariant check failed: SECURITY DEFINER function(s) in schema public lack fixed pg_catalog-first search_path: %.',
      array_to_string(v_bad_secdef, ', ');
  END IF;
END $$;

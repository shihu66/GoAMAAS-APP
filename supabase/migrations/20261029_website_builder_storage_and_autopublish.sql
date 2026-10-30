-- ==============================================================================
-- GoAMAAS Migration: Visual Website Builder, Storage Isolation & Auto-Publishing
-- File: supabase/migrations/20261029_website_builder_storage_and_autopublish.sql
--
-- Scope:
--   1. Align single website subscription plan label to 'GoAMAAS Website' (৳600 / 30 days)
--      without overwriting admin-managed prices or breaking historical records.
--   2. Ensure public.products baseline + website builder columns (website_id, image_url,
--      is_visible, sort_order), enforce RLS + least-privilege grants, and add cross-tenant
--      website ownership + safe-URI validation trigger.
--   3. Provision Supabase Storage bucket 'website-assets' (public read, 5 MB limit,
--      raster image MIME whitelist excluding active SVG) and strict owner-folder RLS
--      policies on storage.objects.
--   4. Upgrade public.publish_client_website(UUID) to promote saved draft configs
--      (including business_name, template_id, template_name) atomically upon publishing.
--   5. Upgrade public.admin_approve_payment_request(UUID, TEXT) to prevent self-approval,
--      reject cancelled website subscriptions, respect active admin compliance suspensions,
--      calculate accurate 30-day initial vs cumulative renewal windows, and automatically
--      publish eligible subscribed websites upon verified payment approval.
--   6. Upgrade public.get_published_website_by_subdomain(TEXT) to project visual builder
--      sections, theme settings, banners, custom links, visible website products from
--      public.products, and accurate grace-period status while never leaking drafts.
--   7. Align SECURITY DEFINER ownership and verify post-migration security invariants.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Prerequisite Checks
-- ------------------------------------------------------------------------------
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
    'products',
    'subscribed_websites',
    'payment_requests',
    'service_pricing_catalog'
  ]) AS tbl
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = tbl
  );

  IF v_missing_tables IS NOT NULL AND array_length(v_missing_tables, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed for 20261029: Missing required public table(s): %.',
      array_to_string(v_missing_tables, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'amaas_internal'
      AND table_name = 'payment_review_authorizations'
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed for 20261029: Missing amaas_internal.payment_review_authorizations. Apply 20261024 first.';
  END IF;

  SELECT array_agg(sig ORDER BY sig)
  INTO v_missing_funcs
  FROM unnest(ARRAY[
    'public.is_admin()',
    'public.is_verified_platform_admin(uuid)',
    'public.can_access_store(uuid)',
    'public.can_manage_store(uuid)',
    'public.admin_reject_payment_request(uuid,text)'
  ]) AS sig
  WHERE pg_catalog.to_regprocedure(sig) IS NULL;

  IF v_missing_funcs IS NOT NULL AND array_length(v_missing_funcs, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed for 20261029: Missing required security function(s): %. Apply prior migrations through 20261026 first.',
      array_to_string(v_missing_funcs, ', ');
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Single Website Subscription Plan Label Alignment ('GoAMAAS Website')
-- ------------------------------------------------------------------------------
INSERT INTO public.service_pricing_catalog (
  service_type,
  service_code,
  plan_tier_label,
  price_bdt,
  setup_fee_bdt,
  is_active
) VALUES (
  'website_subscription',
  'website_lite',
  'GoAMAAS Website',
  600,
  0,
  true
)
ON CONFLICT (service_type, service_code) DO NOTHING;

UPDATE public.service_pricing_catalog
SET plan_tier_label = 'GoAMAAS Website',
    updated_at = NOW()
WHERE service_type = 'website_subscription'
  AND service_code = 'website_lite'
  AND plan_tier_label IN ('AMAAS Website Lite', 'Website Lite');

ALTER TABLE public.subscribed_websites
  ALTER COLUMN plan_tier SET DEFAULT 'GoAMAAS Website';

-- ------------------------------------------------------------------------------
-- 3. Website Product Catalog Columns, RLS Enforcement & Cross-Tenant Integrity
-- ------------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS sales_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating NUMERIC DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS website_id UUID REFERENCES public.subscribed_websites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_website_visible_sort
  ON public.products (website_id, is_visible, sort_order, created_at DESC)
  WHERE website_id IS NOT NULL;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.products', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Products select policy"
  ON public.products FOR SELECT
  TO authenticated
  USING (public.can_access_store(store_id));

CREATE POLICY "Products insert policy"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "Products update policy"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "Products delete policy"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.can_manage_store(store_id));

CREATE POLICY "Products service role policy"
  ON public.products FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.products FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;

DO $$
BEGIN
  IF pg_catalog.to_regprocedure('public.protect_tenant_store_id()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_protect_products_store_id ON public.products;
    CREATE TRIGGER trg_protect_products_store_id
      BEFORE UPDATE ON public.products
      FOR EACH ROW
      EXECUTE FUNCTION public.protect_tenant_store_id();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_product_website_scope()
RETURNS trigger AS $$
DECLARE
  v_site_store_id UUID;
  v_site_user_id UUID;
  v_store_owner_id UUID;
  v_clean_img TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    RAISE EXCEPTION 'Access denied: Cannot reassign store_id or transfer records between stores.';
  END IF;

  IF NEW.image_url IS NOT NULL THEN
    v_clean_img := pg_catalog.lower(pg_catalog.btrim(NEW.image_url));
    IF v_clean_img LIKE 'javascript:%'
       OR v_clean_img LIKE 'vbscript:%'
       OR v_clean_img LIKE 'data:text/%' THEN
      RAISE EXCEPTION 'Invalid image_url: Unsafe URI scheme is not permitted.';
    END IF;
  END IF;

  IF NEW.website_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sw.store_id, sw.user_id
  INTO v_site_store_id, v_site_user_id
  FROM public.subscribed_websites sw
  WHERE sw.id = NEW.website_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid website_id: Subscribed website record does not exist.';
  END IF;

  IF v_site_user_id IS NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Cannot link product to an unowned website record.';
  END IF;

  IF v_site_store_id IS NOT NULL AND v_site_store_id = NEW.store_id THEN
    RETURN NEW;
  END IF;

  SELECT s.owner_id
  INTO v_store_owner_id
  FROM public.stores s
  WHERE s.id = NEW.store_id;

  IF v_site_store_id IS NULL AND v_store_owner_id IS NOT NULL AND v_store_owner_id = v_site_user_id THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Access denied: Cannot link product to a website belonging to a different tenant or store.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.validate_product_website_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_product_website_scope() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_product_website_scope() TO service_role;

DROP TRIGGER IF EXISTS trg_validate_product_website_scope ON public.products;
CREATE TRIGGER trg_validate_product_website_scope
  BEFORE INSERT OR UPDATE OF store_id, website_id, image_url ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_product_website_scope();

-- ------------------------------------------------------------------------------
-- 4. Supabase Storage Bucket ('website-assets') & Owner-Scoped RLS Policies
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_has_buckets BOOLEAN;
  v_has_objects BOOLEAN;
  v_has_size_limit BOOLEAN;
  v_has_mime_types BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) INTO v_has_buckets;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) INTO v_has_objects;

  IF v_has_buckets THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit'
    ) INTO v_has_size_limit;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types'
    ) INTO v_has_mime_types;

    IF v_has_size_limit AND v_has_mime_types THEN
      EXECUTE $sql$
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
          'website-assets',
          'website-assets',
          true,
          5242880,
          ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
        )
        ON CONFLICT (id) DO UPDATE
        SET public = true,
            file_size_limit = COALESCE(storage.buckets.file_size_limit, EXCLUDED.file_size_limit),
            allowed_mime_types = EXCLUDED.allowed_mime_types
      $sql$;
    ELSE
      EXECUTE $sql$
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('website-assets', 'website-assets', true)
        ON CONFLICT (id) DO UPDATE SET public = true
      $sql$;
    END IF;
  END IF;

  IF v_has_objects THEN
    EXECUTE 'DROP POLICY IF EXISTS "Website assets public read" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Website assets owner insert" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Website assets owner update" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Website assets owner delete" ON storage.objects';

    -- Public visitors can read rendered website logos, hero images, banners, and product photos
    EXECUTE $sql$
      CREATE POLICY "Website assets public read"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'website-assets')
    $sql$;

    -- Authenticated merchants can only upload into canonical owner-scoped subpath: <auth.uid()>/<subpath>
    EXECUTE $sql$
      CREATE POLICY "Website assets owner insert"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'website-assets'
          AND auth.uid() IS NOT NULL
          AND COALESCE(name, '') <> ''
          AND left(name, 1) <> '/'
          AND position('..' in name) = 0
          AND position('\' in name) = 0
          AND split_part(name, '/', 1) = auth.uid()::text
          AND NULLIF(btrim(split_part(name, '/', 2)), '') IS NOT NULL
        )
    $sql$;

    -- Authenticated merchants can only update objects inside their own prefix
    EXECUTE $sql$
      CREATE POLICY "Website assets owner update"
        ON storage.objects FOR UPDATE
        TO authenticated
        USING (
          bucket_id = 'website-assets'
          AND auth.uid() IS NOT NULL
          AND split_part(ltrim(COALESCE(name, ''), '/'), '/', 1) = auth.uid()::text
        )
        WITH CHECK (
          bucket_id = 'website-assets'
          AND auth.uid() IS NOT NULL
          AND COALESCE(name, '') <> ''
          AND left(name, 1) <> '/'
          AND position('..' in name) = 0
          AND position('\' in name) = 0
          AND split_part(name, '/', 1) = auth.uid()::text
          AND NULLIF(btrim(split_part(name, '/', 2)), '') IS NOT NULL
        )
    $sql$;

    -- Authenticated merchants can delete their own assets; verified platform admins can moderate
    EXECUTE $sql$
      CREATE POLICY "Website assets owner delete"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (
          bucket_id = 'website-assets'
          AND auth.uid() IS NOT NULL
          AND (
            split_part(ltrim(COALESCE(name, ''), '/'), '/', 1) = auth.uid()::text
            OR public.is_verified_platform_admin(auth.uid())
          )
        )
    $sql$;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. Upgrade public.publish_client_website(UUID) to Promote Draft Config Atomically
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_client_website(p_website_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_clean_subdomain TEXT;
  v_site RECORD;
  v_next_config JSONB;
  v_next_business_name TEXT;
  v_next_template_id TEXT;
  v_next_template_name TEXT;
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
  SELECT id, user_id, store_id, subdomain, business_name, template_id, template_name, payment_status, status, deployment_status, grace_period_end, config
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

  v_next_config := COALESCE(v_site.config, '{}'::jsonb);
  IF jsonb_typeof(v_next_config->'draft') = 'object' THEN
    v_next_config := ((v_next_config - 'draft' - 'hasUnpublishedDraft') || (v_next_config->'draft')) - 'draft' - 'hasUnpublishedDraft';
  ELSE
    v_next_config := v_next_config - 'draft' - 'hasUnpublishedDraft';
  END IF;

  v_next_business_name := COALESCE(NULLIF(pg_catalog.btrim(COALESCE(v_next_config->>'businessName', '')), ''), v_site.business_name);
  v_next_template_id := COALESCE(NULLIF(pg_catalog.btrim(COALESCE(v_next_config->>'templateId', '')), ''), v_site.template_id);
  v_next_template_name := COALESCE(NULLIF(pg_catalog.btrim(COALESCE(v_next_config->>'templateName', '')), ''), v_site.template_name);

  UPDATE public.subscribed_websites
  SET deployment_status = 'live',
      business_name = v_next_business_name,
      template_id = v_next_template_id,
      template_name = v_next_template_name,
      config = v_next_config,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.publish_client_website(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_client_website(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_client_website(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. Upgrade public.admin_approve_payment_request(UUID, TEXT) for Auto-Publishing
--    and Accurate 30-Day Initial / Cumulative Renewal Cycles
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_approve_payment_request(
  p_request_id UUID,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID;
  v_req RECORD;
  v_target_site RECORD;
  v_target_uuid UUID;
  v_clean_service_id TEXT;
  v_updated_site_count INTEGER := 0;
  v_updated_req_count INTEGER := 0;
  v_clean_sub TEXT;
  v_can_autopublish BOOLEAN := false;
  v_admin_suspended BOOLEAN := false;
  v_latest_lifecycle_action TEXT;
  v_base_period TIMESTAMPTZ;
  v_next_period_end TIMESTAMPTZ;
  v_next_grace_end TIMESTAMPTZ;
  v_next_config JSONB;
  v_next_business_name TEXT;
  v_next_template_id TEXT;
  v_next_template_name TEXT;
  v_catalog_active BOOLEAN;
  v_site_deployment_status TEXT := NULL;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL OR NOT public.is_verified_platform_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Access denied: Only verified platform administrators can approve payment requests.';
  END IF;

  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_REQUEST_ID',
      'message', 'Payment request ID is required.'
    );
  END IF;

  SELECT *
  INTO v_req
  FROM public.payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_FOUND',
      'message', 'Payment request not found.'
    );
  END IF;

  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_SETTLED',
      'message', format('Payment request is already %s and cannot be approved again.', v_req.status),
      'current_status', v_req.status
    );
  END IF;

  IF v_req.user_id IS NOT NULL AND v_req.user_id = v_caller_id THEN
    RAISE EXCEPTION 'Access denied: Administrators cannot approve their own payment requests.';
  END IF;

  IF v_req.service_type NOT IN ('website_subscription', 'website_package', 'dashboard_plan', 'ai_automation') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'UNSUPPORTED_SERVICE_TYPE',
      'message', format('Unsupported payment service_type: %s', COALESCE(v_req.service_type, 'NULL'))
    );
  END IF;

  IF v_req.service_type IN ('website_subscription', 'website_package') THEN
    v_clean_service_id := NULLIF(pg_catalog.btrim(COALESCE(v_req.service_id, ''), E' \t\n\r'), '');

    IF v_clean_service_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'MISSING_SERVICE_ID',
        'message', 'Cannot approve website payment: service_id is missing. Website payments must reference an explicit subscribed_websites.id UUID.'
      );
    END IF;

    IF v_clean_service_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'INVALID_SERVICE_ID',
        'message', format('Cannot approve website payment: service_id "%s" is not a valid website UUID.', v_clean_service_id)
      );
    END IF;

    v_target_uuid := v_clean_service_id::UUID;

    SELECT id, user_id, store_id, subdomain, business_name, template_id, template_name, status, payment_status, deployment_status, subscribed_at, current_period_end, grace_period_end, config
    INTO v_target_site
    FROM public.subscribed_websites
    WHERE id = v_target_uuid
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'WEBSITE_NOT_FOUND',
        'message', format('Cannot approve website payment: target subscribed_websites record (%s) does not exist.', v_target_uuid)
      );
    END IF;

    v_site_deployment_status := v_target_site.deployment_status;

    IF v_req.user_id IS NULL OR v_target_site.user_id IS NULL OR v_target_site.user_id != v_req.user_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'TENANT_MISMATCH',
        'message', 'Security rejection: target website owner does not match payment request user_id.'
      );
    END IF;

    IF v_req.store_id IS NOT NULL
       AND v_target_site.store_id IS NOT NULL
       AND v_req.store_id != v_target_site.store_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'TENANT_MISMATCH',
        'message', 'Security rejection: target website store_id does not match payment request store_id.'
      );
    END IF;

    IF v_target_site.status = 'cancelled' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'SUBSCRIPTION_CANCELLED',
        'message', 'Cannot approve website payment: target website subscription has been cancelled.'
      );
    END IF;

    IF v_target_site.status = 'suspended'
       AND pg_catalog.to_regclass('public.website_lifecycle_audit_logs') IS NOT NULL THEN
      SELECT l.action
      INTO v_latest_lifecycle_action
      FROM public.website_lifecycle_audit_logs l
      WHERE l.website_id = v_target_site.id
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT 1;

      IF v_latest_lifecycle_action = 'suspend' THEN
        v_admin_suspended := true;
      END IF;
    END IF;

    IF v_req.service_type = 'website_subscription' THEN
      -- Initial activation grants 30 days from approval time; renewals extend cumulatively from GREATEST(current_period_end, NOW())
      IF v_target_site.payment_status = 'paid' AND v_target_site.current_period_end IS NOT NULL THEN
        v_base_period := GREATEST(v_target_site.current_period_end, NOW());
      ELSE
        v_base_period := NOW();
      END IF;

      v_next_period_end := v_base_period + INTERVAL '30 days';
      v_next_grace_end := v_base_period + INTERVAL '37 days';

      -- Validate subdomain eligibility for automatic live publishing (never bypass active admin suspension)
      v_clean_sub := pg_catalog.lower(pg_catalog.btrim(COALESCE(v_target_site.subdomain, '')));
      IF NOT v_admin_suspended
         AND pg_catalog.length(v_clean_sub) BETWEEN 3 AND 30
         AND v_clean_sub ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
         AND v_clean_sub NOT LIKE 'xn--%'
         AND v_clean_sub NOT IN (
           'admin', 'amaas', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'bot', 'bots',
           'cdn', 'dashboard', 'demo', 'dev', 'development', 'dns', 'docs', 'email', 'files', 'ftp',
           'goamaas', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'oauth', 'official',
           'pay', 'payment', 'payments', 'pop', 'portal', 'preview', 'prod', 'production', 'register', 'root',
           'shop', 'smtp', 'ssh', 'stage', 'staging', 'static', 'status', 'store', 'support', 'test',
           'testing', 'webhook', 'webhooks', 'www'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM public.subscribed_websites sw2
           WHERE pg_catalog.lower(pg_catalog.btrim(sw2.subdomain)) = v_clean_sub
             AND sw2.id != v_target_site.id
         ) THEN
        v_can_autopublish := true;
      END IF;

      v_next_config := COALESCE(v_target_site.config, '{}'::jsonb);
      IF v_can_autopublish THEN
        IF jsonb_typeof(v_next_config->'draft') = 'object' THEN
          v_next_config := ((v_next_config - 'draft' - 'hasUnpublishedDraft') || (v_next_config->'draft')) - 'draft' - 'hasUnpublishedDraft';
        ELSE
          v_next_config := v_next_config - 'draft' - 'hasUnpublishedDraft';
        END IF;
      END IF;

      v_next_business_name := CASE
        WHEN v_can_autopublish THEN COALESCE(NULLIF(pg_catalog.btrim(COALESCE(v_next_config->>'businessName', '')), ''), v_target_site.business_name)
        ELSE v_target_site.business_name
      END;
      v_next_template_id := CASE
        WHEN v_can_autopublish THEN COALESCE(NULLIF(pg_catalog.btrim(COALESCE(v_next_config->>'templateId', '')), ''), v_target_site.template_id)
        ELSE v_target_site.template_id
      END;
      v_next_template_name := CASE
        WHEN v_can_autopublish THEN COALESCE(NULLIF(pg_catalog.btrim(COALESCE(v_next_config->>'templateName', '')), ''), v_target_site.template_name)
        ELSE v_target_site.template_name
      END;

      UPDATE public.subscribed_websites
      SET status = CASE WHEN v_admin_suspended THEN 'suspended' ELSE 'active' END,
          payment_status = 'paid',
          deployment_status = CASE
            WHEN v_admin_suspended THEN 'suspended'
            WHEN v_can_autopublish THEN 'live'
            ELSE deployment_status
          END,
          business_name = v_next_business_name,
          template_id = v_next_template_id,
          template_name = v_next_template_name,
          subscribed_at = COALESCE(subscribed_at, NOW()),
          current_period_end = v_next_period_end,
          grace_period_end = v_next_grace_end,
          config = v_next_config,
          updated_at = NOW()
      WHERE id = v_target_site.id;
    ELSE
      UPDATE public.subscribed_websites
      SET status = CASE WHEN v_admin_suspended THEN 'suspended' ELSE 'active' END,
          payment_status = 'paid',
          updated_at = NOW()
      WHERE id = v_target_site.id;
    END IF;

    GET DIAGNOSTICS v_updated_site_count = ROW_COUNT;
    IF v_updated_site_count <> 1 THEN
      RAISE EXCEPTION 'Payment approval aborted: Expected 1 subscribed_websites row updated, got %.', v_updated_site_count;
    END IF;
  ELSE
    -- Strict target-service, user, and store validation for dashboard_plan and ai_automation
    v_clean_service_id := NULLIF(pg_catalog.btrim(COALESCE(v_req.service_id, ''), E' \t\n\r'), '');

    IF v_clean_service_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'MISSING_SERVICE_ID',
        'message', format('Cannot approve %s payment: service_id is missing.', v_req.service_type)
      );
    END IF;

    IF v_req.user_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_req.user_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'TARGET_USER_NOT_FOUND',
        'message', 'Cannot approve payment: target customer profile does not exist.'
      );
    END IF;

    IF v_req.store_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = v_req.store_id
        AND (
          s.owner_id = v_req.user_id
          OR EXISTS (
            SELECT 1
            FROM public.store_members sm
            WHERE sm.store_id = s.id
              AND sm.user_id = v_req.user_id
              AND sm.status = 'active'
              AND sm.role IN ('owner', 'admin', 'manager')
          )
        )
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'STORE_NOT_FOUND',
        'message', 'Cannot approve payment: target store does not exist or submitter is not authorized to manage it.'
      );
    END IF;

    IF pg_catalog.to_regclass('public.service_pricing_catalog') IS NOT NULL THEN
      SELECT spc.is_active
      INTO v_catalog_active
      FROM public.service_pricing_catalog spc
      WHERE spc.service_type = v_req.service_type
        AND pg_catalog.lower(spc.service_code) = pg_catalog.lower(v_clean_service_id)
      LIMIT 1;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'SERVICE_NOT_FOUND',
          'message', format('Cannot approve %s payment: target service "%s" does not exist in service_pricing_catalog.', v_req.service_type, v_clean_service_id)
        );
      END IF;

      IF v_catalog_active IS DISTINCT FROM true THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'SERVICE_INACTIVE',
          'message', format('Cannot approve %s payment: target service "%s" is inactive and cannot be activated.', v_req.service_type, v_clean_service_id)
        );
      END IF;
    END IF;
  END IF;

  -- Mint single-use, transaction-bound capability token consumed by trg_protect_payment_request_integrity
  INSERT INTO amaas_internal.payment_review_authorizations (
    txid,
    request_id,
    target_status,
    reviewer_id,
    rpc_name
  ) VALUES (
    pg_catalog.pg_current_xact_id()::TEXT,
    p_request_id,
    'approved',
    v_caller_id,
    'admin_approve_payment_request'
  );

  UPDATE public.payment_requests
  SET status = 'approved',
      admin_notes = COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_admin_notes, '')), ''), admin_notes),
      reviewed_by = v_caller_id,
      reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_request_id
    AND status = 'pending';

  GET DIAGNOSTICS v_updated_req_count = ROW_COUNT;
  IF v_updated_req_count <> 1 THEN
    RAISE EXCEPTION 'Payment approval aborted: Expected 1 pending payment_requests row updated, got %.', v_updated_req_count;
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
    'message', CASE
      WHEN v_can_autopublish THEN 'Payment verified and website automatically published live.'
      WHEN v_admin_suspended THEN 'Payment verified and billing period extended. Website remains under administrative suspension until explicitly reactivated.'
      ELSE 'Payment request approved and target service activated.'
    END,
    'requestId', p_request_id,
    'request_id', p_request_id,
    'website_id', v_target_uuid,
    'auto_published', v_can_autopublish,
    'deployment_status', CASE
      WHEN v_admin_suspended THEN 'suspended'
      WHEN v_can_autopublish THEN 'live'
      WHEN v_target_uuid IS NOT NULL THEN v_site_deployment_status
      ELSE NULL
    END,
    'current_period_end', v_next_period_end,
    'grace_period_end', v_next_grace_end
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. Upgrade public.get_published_website_by_subdomain(TEXT) for Rich Storefront,
--    Visible Database Products, and Grace-Period Status Projection
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_published_website_by_subdomain(p_subdomain TEXT)
RETURNS JSONB AS $$
DECLARE
  v_clean_subdomain TEXT;
  v_site RECORD;
  v_effective_status TEXT;
  v_has_db_products BOOLEAN := false;
  v_visible_products JSONB := '[]'::jsonb;
  v_config_items JSONB;
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
    id,
    store_id,
    subdomain,
    business_name,
    niche,
    template_id,
    template_name,
    deployment_status,
    status,
    current_period_end,
    grace_period_end,
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

  v_effective_status := CASE
    WHEN v_site.status = 'grace_period' THEN 'grace_period'
    WHEN v_site.current_period_end IS NOT NULL AND v_site.current_period_end < NOW() THEN 'grace_period'
    ELSE v_site.status
  END;

  -- Check whether merchant has linked products in public.products for this website
  SELECT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.website_id = v_site.id
  ) INTO v_has_db_products;

  IF v_has_db_products THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id::text,
          'productId', p.id::text,
          'name', p.name,
          'price', '৳' || pg_catalog.btrim(pg_catalog.to_char(COALESCE(p.price, 0), 'FM999,999,990.##')),
          'priceNumeric', COALESCE(p.price, 0),
          'description', COALESCE(p.description, ''),
          'imageUrl', NULLIF(pg_catalog.btrim(COALESCE(p.image_url, '')), ''),
          'category', COALESCE(p.category, 'General'),
          'isVisible', true
        )
        ORDER BY COALESCE(p.sort_order, 0) ASC, p.created_at ASC
      ),
      '[]'::jsonb
    )
    INTO v_visible_products
    FROM public.products p
    WHERE p.website_id = v_site.id
      AND COALESCE(p.status, 'active') = 'active'
      AND COALESCE(p.is_visible, true) = true;
  ELSE
    v_config_items := COALESCE(v_site.config->'servicesOrProducts', v_site.config->'items', '[]'::jsonb);
    IF jsonb_typeof(v_config_items) = 'array' THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      INTO v_visible_products
      FROM jsonb_array_elements(v_config_items) AS elem
      WHERE CASE
        WHEN jsonb_typeof(elem->'isVisible') = 'boolean' THEN (elem->>'isVisible')::boolean
        ELSE true
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'site', jsonb_build_object(
      'subdomain', v_site.subdomain,
      'fullDomainUrl', v_site.subdomain || '.amaas.xyz',
      'businessName', v_site.business_name,
      'niche', v_site.niche,
      'nicheLabel', COALESCE(NULLIF(pg_catalog.btrim(COALESCE(v_site.config->>'nicheLabel', '')), ''), v_site.template_name, 'Business Storefront'),
      'templateId', COALESCE(v_site.template_id, v_site.config->>'templateId', 'tpl-modern-business'),
      'templateName', COALESCE(v_site.template_name, 'Modern Executive'),
      'brandColor', COALESCE(NULLIF(pg_catalog.btrim(COALESCE(v_site.config->>'brandColor', v_site.config->>'primaryColor', '')), ''), '#2563EB'),
      'logoUrl', NULLIF(pg_catalog.btrim(COALESCE(v_site.config->>'logoUrl', '')), ''),
      'heroImageUrl', NULLIF(pg_catalog.btrim(COALESCE(v_site.config->>'heroImageUrl', '')), ''),
      'headline', COALESCE(v_site.config->>'headline', 'Welcome to our official website'),
      'subheadline', COALESCE(v_site.config->>'subheadline', ''),
      'heroCtaText', COALESCE(NULLIF(pg_catalog.btrim(COALESCE(v_site.config->>'heroCtaText', v_site.config->>'ctaText', '')), ''), 'Contact Us'),
      'heroCtaLink', COALESCE(v_site.config->>'heroCtaLink', v_site.config->>'ctaLink', ''),
      'secondaryCtaText', COALESCE(v_site.config->>'secondaryCtaText', ''),
      'secondaryCtaLink', COALESCE(v_site.config->>'secondaryCtaLink', ''),
      'bannerImageUrl', NULLIF(pg_catalog.btrim(COALESCE(v_site.config->>'bannerImageUrl', '')), ''),
      'bannerTitle', COALESCE(v_site.config->>'bannerTitle', ''),
      'bannerSubtitle', COALESCE(v_site.config->>'bannerSubtitle', ''),
      'bannerCtaText', COALESCE(v_site.config->>'bannerCtaText', ''),
      'bannerCtaLink', COALESCE(v_site.config->>'bannerCtaLink', ''),
      'aboutText', COALESCE(v_site.config->>'aboutText', ''),
      'phone', COALESCE(v_site.config->>'phone', ''),
      'email', COALESCE(v_site.config->>'email', ''),
      'address', COALESCE(v_site.config->>'address', ''),
      'whatsappNumber', COALESCE(v_site.config->>'whatsappNumber', v_site.config->>'whatsapp', v_site.config->>'phone', ''),
      'servicesOrProducts', v_visible_products,
      'socialLinks', COALESCE(v_site.config->'socialLinks', '{}'::jsonb),
      'customLinks', CASE
        WHEN jsonb_typeof(v_site.config->'customLinks') = 'array' THEN v_site.config->'customLinks'
        ELSE '[]'::jsonb
      END,
      'sections', CASE
        WHEN jsonb_typeof(v_site.config->'sections') = 'array' THEN v_site.config->'sections'
        ELSE '[]'::jsonb
      END,
      'themeSettings', CASE
        WHEN jsonb_typeof(v_site.config->'themeSettings') = 'object' THEN v_site.config->'themeSettings'
        ELSE '{}'::jsonb
      END,
      'customDomain', NULLIF(pg_catalog.btrim(COALESCE(v_site.config->>'customDomain', '')), ''),
      'deploymentStatus', v_site.deployment_status,
      'subscriptionStatus', v_effective_status,
      'status', v_effective_status,
      'sslStatus', 'active'
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.get_published_website_by_subdomain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_website_by_subdomain(TEXT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 8. Function Ownership Alignment & Post-Migration Security Invariants
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_pr_owner NAME;
  v_bad_secdef TEXT[];
  v_products_rls BOOLEAN;
BEGIN
  SELECT r.rolname
  INTO v_pr_owner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
  WHERE c.oid = 'public.payment_requests'::pg_catalog.regclass;

  IF v_pr_owner IS NOT NULL THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO %I', v_pr_owner);
    EXECUTE format('GRANT SELECT ON TABLE public.profiles, public.stores, public.store_members, public.service_pricing_catalog TO %I', v_pr_owner);
    IF v_pr_owner != current_user THEN
      EXECUTE format('ALTER FUNCTION public.validate_product_website_scope() OWNER TO %I', v_pr_owner);
      EXECUTE format('ALTER FUNCTION public.publish_client_website(UUID) OWNER TO %I', v_pr_owner);
      EXECUTE format('ALTER FUNCTION public.admin_approve_payment_request(UUID, TEXT) OWNER TO %I', v_pr_owner);
      EXECUTE format('ALTER FUNCTION public.get_published_website_by_subdomain(TEXT) OWNER TO %I', v_pr_owner);
    END IF;
  END IF;

  SELECT c.relrowsecurity
  INTO v_products_rls
  FROM pg_catalog.pg_class c
  WHERE c.oid = 'public.products'::pg_catalog.regclass;

  IF COALESCE(v_products_rls, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Security invariant check failed in 20261029: Row Level Security is not enabled on public.products.';
  END IF;

  IF has_table_privilege('anon', 'public.products', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'Security invariant check failed in 20261029: anon holds forbidden table privileges on public.products.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'products'
      AND (
        'public' = ANY(pol.roles)
        OR 'anon' = ANY(pol.roles)
        OR pol.policyname NOT IN (
          'Products select policy',
          'Products insert policy',
          'Products update policy',
          'Products delete policy',
          'Products service role policy'
        )
      )
  ) OR (
    SELECT count(*)
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'products'
  ) <> 5 THEN
    RAISE EXCEPTION 'Security invariant check failed in 20261029: Unexpected or missing RLS policy detected on public.products.';
  END IF;

  -- Verify no SECURITY DEFINER function in public lacks pg_catalog-first search_path
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
    RAISE EXCEPTION 'Security invariant check failed in 20261029: SECURITY DEFINER function(s) lack pg_catalog-first search_path: %.',
      array_to_string(v_bad_secdef, ', ');
  END IF;

  IF has_function_privilege('anon', 'public.admin_approve_payment_request(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.publish_client_website(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.validate_product_website_scope()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.validate_product_website_scope()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security invariant check failed in 20261029: Forbidden anon/authenticated EXECUTE privilege detected.';
  END IF;
END $$;

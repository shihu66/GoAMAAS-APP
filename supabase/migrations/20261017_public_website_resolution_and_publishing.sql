-- ==============================================================================
-- GoAMAAS Migration: Hardened Multi-Tenant Subdomain Resolution & Publishing
-- File: supabase/migrations/20261017_public_website_resolution_and_publishing.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Prerequisite Checks: Fail clearly and safely if prerequisites are missing
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT[];
BEGIN
  -- 1a. Verify required table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'subscribed_websites'
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: Table "public.subscribed_websites" does not exist. Run initial database schema migrations first.';
  END IF;

  -- 1b. Verify required base columns exist
  SELECT array_agg(col) INTO v_missing
  FROM unnest(ARRAY['id', 'subdomain', 'config', 'status', 'deployment_status']) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscribed_websites' AND column_name = col
  );

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: Missing required columns in "public.subscribed_websites": %', array_to_string(v_missing, ', ');
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Schema Upgrades: Safely add columns and replace constraints
-- ------------------------------------------------------------------------------
ALTER TABLE public.subscribed_websites 
  ADD COLUMN IF NOT EXISTS payment_status TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS full_domain TEXT;

-- Drop any existing restrictive check constraint BEFORE updating rows to pending_review
ALTER TABLE public.subscribed_websites 
  DROP CONSTRAINT IF EXISTS chk_subscribed_websites_payment_status;

-- Add updated check constraint supporting pending_review
ALTER TABLE public.subscribed_websites 
  ADD CONSTRAINT chk_subscribed_websites_payment_status 
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'pending_review'));

-- Set default for all future website registrations
ALTER TABLE public.subscribed_websites 
  ALTER COLUMN payment_status SET DEFAULT 'pending';

-- ------------------------------------------------------------------------------
-- 3. Evidence-Based Payment Backfill & Safe Manual Review Flagging
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_has_payment_requests BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'payment_requests'
  ) INTO v_has_payment_requests;

  -- 3a. Backfill payment_status = 'paid' ONLY when backed by an approved payment request
  -- specifically proving payment for this exact website
  IF v_has_payment_requests THEN
    UPDATE public.subscribed_websites sw
    SET payment_status = 'paid'
    WHERE sw.payment_status IS NULL
      AND EXISTS (
        SELECT 1 FROM public.payment_requests pr
        WHERE pr.status = 'approved'
          AND pr.service_type IN ('website_subscription', 'website_package')
          AND (
            -- Direct match by website UUID
            pr.service_id = sw.id::TEXT
            -- Or direct match by subdomain slug
            OR lower(trim(pr.service_id)) = lower(trim(sw.subdomain))
            -- Or match by store_id ONLY if this store owns exactly one website
            OR (
              sw.store_id IS NOT NULL 
              AND pr.store_id = sw.store_id 
              AND pr.user_id = sw.user_id
              AND (
                SELECT count(*) 
                FROM public.subscribed_websites sw_count 
                WHERE sw_count.store_id = sw.store_id
              ) = 1
            )
          )
      );
  END IF;

  -- 3b. If a website was previously marked 'live' or 'active', but lacks an approved
  -- payment request, PRESERVE its existing data and flag for manual administrative review.
  UPDATE public.subscribed_websites sw
  SET 
    payment_status = 'pending_review',
    config = jsonb_set(
      COALESCE(config, '{}'::jsonb),
      '{paymentAuditNotice}',
      jsonb_build_object(
        'flaggedAt', NOW(),
        'reason', 'Historical live/active website flagged for manual payment verification audit.'
      )
    )
  WHERE sw.payment_status IS NULL
    AND (sw.deployment_status = 'live' OR sw.status = 'active');

  -- 3c. All remaining unverified or draft websites default to 'pending'
  UPDATE public.subscribed_websites
  SET payment_status = 'pending'
  WHERE payment_status IS NULL;
END $$;

-- Enforce NOT NULL on payment_status now that all rows are verified/flagged
ALTER TABLE public.subscribed_websites 
  ALTER COLUMN payment_status SET NOT NULL;

-- Backfill full_domain if missing
UPDATE public.subscribed_websites
SET full_domain = lower(trim(subdomain)) || '.amaas.xyz'
WHERE (full_domain IS NULL OR full_domain = '') AND subdomain IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 4. Collision-Proof Duplicate Subdomain Remediation (DNS-Safe <= 63 chars)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_dup RECORD;
  v_base TEXT;
  v_candidate TEXT;
  v_counter INT;
  v_resolved_count INT := 0;
BEGIN
  -- Identify duplicate subdomains (case-insensitive)
  -- Rank 1 = canonical website (verified paid > live > newest)
  -- Rank > 1 = secondary duplicate draft requiring collision-proof disambiguation
  FOR v_dup IN (
    SELECT 
      id, 
      subdomain,
      ROW_NUMBER() OVER (
        PARTITION BY lower(trim(subdomain)) 
        ORDER BY 
          CASE WHEN deployment_status = 'live' AND payment_status = 'paid' THEN 1
               WHEN payment_status = 'paid' THEN 2
               WHEN deployment_status = 'live' THEN 3
               ELSE 4 END,
          created_at DESC
      ) AS rank_num
    FROM public.subscribed_websites
    WHERE subdomain IS NOT NULL AND trim(subdomain) != ''
  ) LOOP
    IF v_dup.rank_num > 1 THEN
      -- Clean and truncate base to at most 45 characters to guarantee <= 63 chars with suffix
      v_base := substring(lower(regexp_replace(v_dup.subdomain, '(-dup-[a-z0-9-]+)+$', '')) FROM 1 FOR 45);
      IF length(v_base) < 3 THEN
        v_base := 'site-' || substring(replace(v_dup.id::TEXT, '-', '') FROM 1 FOR 6);
      END IF;

      -- Form initial collision-proof candidate with unique ID segment
      v_candidate := v_base || '-dup-' || substring(replace(v_dup.id::TEXT, '-', '') FROM 1 FOR 6);
      v_counter := 1;

      -- Loop until a truly unique subdomain is found
      WHILE EXISTS (
        SELECT 1 FROM public.subscribed_websites 
        WHERE lower(subdomain) = lower(v_candidate) AND id != v_dup.id
      ) LOOP
        v_candidate := substring(v_base FROM 1 FOR 42) || '-dup-' || v_counter || '-' || substring(replace(v_dup.id::TEXT, '-', '') FROM 1 FOR 4);
        v_counter := v_counter + 1;
      END LOOP;

      -- Update duplicate draft safely and document notice in config
      UPDATE public.subscribed_websites
      SET 
        subdomain = v_candidate,
        full_domain = v_candidate || '.amaas.xyz',
        deployment_status = 'maintenance',
        config = jsonb_set(
          COALESCE(config, '{}'::jsonb),
          '{subdomainCollisionNotice}',
          jsonb_build_object(
            'originalSubdomain', v_dup.subdomain,
            'assignedSubdomain', v_candidate,
            'remediatedAt', NOW(),
            'actionRequired', 'Please review and choose a distinct custom subdomain in dashboard settings.'
          )
        )
      WHERE id = v_dup.id;

      v_resolved_count := v_resolved_count + 1;
    END IF;
  END LOOP;

  IF v_resolved_count > 0 THEN
    RAISE NOTICE 'Safely disambiguated % colliding duplicate subdomain records.', v_resolved_count;
  END IF;
END $$;

-- Create unique index safely on lower(subdomain)
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribed_websites_subdomain_unique 
  ON public.subscribed_websites (lower(subdomain));

-- ------------------------------------------------------------------------------
-- 5. Audit & Reaffirm Strict RLS Policies on public.subscribed_websites
-- ------------------------------------------------------------------------------
ALTER TABLE public.subscribed_websites ENABLE ROW LEVEL SECURITY;

-- Drop ANY historical or permissive anonymous table policies
DROP POLICY IF EXISTS "Public can view published websites by subdomain" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Allow public select for live websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Public storefront access" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Anon select published websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Anyone can view websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Subscribed websites select policy" ON public.subscribed_websites;

-- Reaffirm authenticated tenant isolation (only record owner or platform admin can select)
CREATE POLICY "Subscribed websites select policy"
  ON public.subscribed_websites FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- ------------------------------------------------------------------------------
-- 6. Stored Procedure: Secure Public Subdomain Resolution
-- ------------------------------------------------------------------------------
-- Returns ONLY explicitly approved public storefront fields.
-- Never exposes user_id, store_id, internal billing details, or owner metadata.
CREATE OR REPLACE FUNCTION public.get_published_website_by_subdomain(p_subdomain TEXT)
RETURNS JSONB AS $$
DECLARE
  v_clean_subdomain TEXT;
  v_site RECORD;
BEGIN
  -- 1. Sanitize input: lowercase and trim
  v_clean_subdomain := lower(trim(COALESCE(p_subdomain, '')));

  -- 2. Validate format (DNS label RFC 1035: alphanumeric with hyphens, 2-63 chars)
  IF length(v_clean_subdomain) < 2 OR length(v_clean_subdomain) > 63 OR v_clean_subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' OR v_clean_subdomain LIKE 'xn--%' THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'Invalid subdomain requested.'
    );
  END IF;

  -- 3. Lookup published site with strict status requirements:
  -- deployment_status = 'live', verified payment_status = 'paid', and active subscription
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
  WHERE lower(subdomain) = v_clean_subdomain
    AND deployment_status = 'live'
    AND payment_status = 'paid'
    AND status IN ('active', 'grace_period')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'subdomain', v_clean_subdomain,
      'message', 'Website not found or is currently not published.'
    );
  END IF;

  -- 4. Construct sanitized public storefront projection (anti-leakage shield)
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
      'headline', COALESCE(v_site.config->>'headline', 'Welcome to our official website'),
      'subheadline', COALESCE(v_site.config->>'subheadline', 'Explore our catalog and connect with our team.'),
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Secure execution permissions
REVOKE ALL ON FUNCTION public.get_published_website_by_subdomain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_website_by_subdomain(TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. Stored Procedure: 1-Click Publish With Strict Authorization & Verification
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_client_website(p_website_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_clean_subdomain TEXT;
  v_site RECORD;
BEGIN
  -- 1. Authenticated user validation
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to publish a website.';
  END IF;

  -- 2. Retrieve website record with row lock
  SELECT id, user_id, subdomain, payment_status, status, deployment_status
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

  -- 3. Ownership or admin authorization check (Fail securely if user_id IS NULL)
  IF v_site.user_id IS NULL THEN
    IF NOT public.is_admin() THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'ORPHANED_RECORD',
        'message', 'Security exception: Website has no registered owner. Only platform administrators can publish or claim this website.'
      );
    END IF;
  ELSIF v_site.user_id != v_user_id AND NOT public.is_admin() THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'FORBIDDEN',
      'message', 'Unauthorized: You do not have permission to publish this website.'
    );
  END IF;

  -- 4. Subdomain format & length validation (RFC 1035)
  v_clean_subdomain := lower(trim(COALESCE(v_site.subdomain, '')));
  IF length(v_clean_subdomain) < 3 OR length(v_clean_subdomain) > 63 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_SUBDOMAIN_LENGTH',
      'message', 'Subdomain must be between 3 and 63 characters in length.'
    );
  END IF;

  IF v_clean_subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' OR v_clean_subdomain LIKE 'xn--%' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_SUBDOMAIN_FORMAT',
      'message', 'Subdomain can only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.'
    );
  END IF;

  -- 5. Reserved system subdomains check
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

  -- 6. Subdomain collision check across other websites
  IF EXISTS (
    SELECT 1 FROM public.subscribed_websites
    WHERE lower(subdomain) = v_clean_subdomain
      AND id != p_website_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SUBDOMAIN_TAKEN',
      'message', 'This subdomain is already registered by another merchant.'
    );
  END IF;

  -- 7. Verified payment approval check
  IF v_site.payment_status != 'paid' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PAYMENT_REQUIRED',
      'message', 'Verified payment approval required before public publishing can be enabled. Current status: ' || COALESCE(v_site.payment_status, 'pending')
    );
  END IF;

  -- 8. Active subscription status check
  IF v_site.status NOT IN ('active', 'grace_period') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SUBSCRIPTION_INACTIVE',
      'message', 'Cannot publish website: subscription status is currently inactive or suspended.'
    );
  END IF;

  -- 9. Update deployment status to live
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Secure execution permissions
REVOKE ALL ON FUNCTION public.publish_client_website(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_client_website(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. Stored Procedure: Unpublish Website (Maintenance / Suspension Control)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unpublish_client_website(p_website_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_site RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to unpublish a website.';
  END IF;

  SELECT id, user_id, subdomain
  INTO v_site
  FROM public.subscribed_websites
  WHERE id = p_website_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Website record not found.');
  END IF;

  -- Fail securely if user_id IS NULL
  IF v_site.user_id IS NULL THEN
    IF NOT public.is_admin() THEN
      RETURN jsonb_build_object('success', false, 'message', 'Security exception: Website has no registered owner.');
    END IF;
  ELSIF v_site.user_id != v_user_id AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: You do not own this website.');
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.unpublish_client_website(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unpublish_client_website(UUID) TO authenticated;

-- ==============================================================================
-- GoAMAAS Migration: Complete Website Builder, Subscription & Manual Payment System
-- ==============================================================================

-- 1. Create Payment Requests Table
CREATE TABLE IF NOT EXISTS public.payment_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('website_subscription', 'website_package', 'dashboard_plan', 'ai_automation')),
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  plan_tier TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT '৳',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('bKash', 'Nagad', 'Bank Transfer')),
  transaction_id TEXT,
  sender_number TEXT,
  bank_name TEXT,
  bank_account_name TEXT,
  bank_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_user ON public.payment_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON public.payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_service ON public.payment_requests(service_type, service_id);

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.payment_requests TO authenticated;
GRANT ALL ON TABLE public.payment_requests TO service_role;

-- Only create initial bootstrap RLS policies if hardened 20261024+ policies are not already installed.
-- Direct UPDATE policies for authenticated clients are intentionally omitted so customers and unmediated
-- client sessions can never modify status, admin_notes, reviewed_by, or reviewed_at directly.
DO $pol$
BEGIN
  IF pg_catalog.to_regclass('amaas_internal.payment_review_authorizations') IS NULL
     AND pg_catalog.to_regprocedure('public.can_submit_payment_request(uuid,uuid,text,text,text)') IS NULL THEN
    DROP POLICY IF EXISTS "Payment requests update policy" ON public.payment_requests;

    DROP POLICY IF EXISTS "Payment requests select policy" ON public.payment_requests;
    CREATE POLICY "Payment requests select policy"
      ON public.payment_requests FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id OR public.is_admin());

    DROP POLICY IF EXISTS "Payment requests insert policy" ON public.payment_requests;
    CREATE POLICY "Payment requests insert policy"
      ON public.payment_requests FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() = user_id
        AND status = 'pending'
        AND admin_notes IS NULL
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
      );
  END IF;
END
$pol$;

-- 2. System Payment Gateway Configurations Table
CREATE TABLE IF NOT EXISTS public.payment_gateway_configs (
  id TEXT PRIMARY KEY, -- 'bkash', 'nagad', 'bank_transfer', 'whatsapp_support'
  display_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  account_number TEXT,
  account_name TEXT,
  bank_name TEXT,
  branch_name TEXT,
  routing_number TEXT,
  instructions TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_gateway_configs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_gateway_configs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payment_gateway_configs TO authenticated;
GRANT ALL ON TABLE public.payment_gateway_configs TO service_role;

DO $gw_pol$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_gateway_configs'
      AND policyname = 'Payment gateway configs select policy'
  ) THEN
    CREATE POLICY "Payment gateway configs select policy"
      ON public.payment_gateway_configs FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END
$gw_pol$;

-- Seed initial payment configs safely without overwriting existing administrator-configured details
INSERT INTO public.payment_gateway_configs (id, display_name, is_enabled, account_number, account_name, instructions)
VALUES 
  ('bkash', 'bKash Personal (Send Money)', true, '+8801822332020', 'AMAAS Official Merchant', 'Send Money the exact payable amount to this personal bKash number, then submit your transaction ID below.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payment_gateway_configs (id, display_name, is_enabled, account_number, instructions)
VALUES 
  ('nagad', 'Nagad Personal (Send Money)', false, '', 'Nagad payment channel is currently being provisioned. Please use bKash or Bank Transfer.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payment_gateway_configs (id, display_name, is_enabled, bank_name, account_name, account_number, branch_name, routing_number, instructions)
VALUES 
  ('bank_transfer', 'Official Bank Transfer', true, 'City Bank PLC', 'AMAAS TECHNOLOGIES', '1503892019001', 'Gulshan Avenue Branch', '225261783', 'Please deposit or transfer funds, then send your deposit slip or transaction screenshot to our official WhatsApp contact.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payment_gateway_configs (id, display_name, is_enabled, account_number, instructions)
VALUES 
  ('whatsapp_support', 'Official WhatsApp Billing & Domain Support', true, '+8801822332020', 'Contact for instant manual verification, bank receipts, and custom domain setup.')
ON CONFLICT (id) DO NOTHING;

-- 3. Bootstrap Payment Review Stored Procedures
-- Guarded so this migration NEVER overwrites hardened capability-token implementations (20261024 / 20261029).
DO $bootstrap_rpcs$
BEGIN
  IF pg_catalog.to_regclass('amaas_internal.payment_review_authorizations') IS NULL
     AND pg_catalog.to_regprocedure('public.is_verified_platform_admin(uuid)') IS NULL THEN

    EXECUTE $fn_approve$
      CREATE OR REPLACE FUNCTION public.admin_approve_payment_request(
        p_request_id UUID,
        p_admin_notes TEXT DEFAULT NULL
      )
      RETURNS JSONB AS $$
      DECLARE
        v_admin_id UUID;
        v_req RECORD;
        v_website_uuid UUID;
        v_target_user_id UUID;
        v_updated_site_count INTEGER := 0;
        v_updated_req_count INTEGER := 0;
      BEGIN
        v_admin_id := auth.uid();
        IF v_admin_id IS NULL OR NOT public.is_admin() THEN
          RAISE EXCEPTION 'Only verified platform administrators can approve payment requests';
        END IF;

        SELECT * INTO v_req
        FROM public.payment_requests
        WHERE id = p_request_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Payment request not found');
        END IF;

        IF v_req.status != 'pending' THEN
          RETURN jsonb_build_object('success', false, 'code', 'ALREADY_SETTLED', 'message', 'Payment request is already ' || v_req.status);
        END IF;

        IF v_req.user_id IS NOT NULL AND v_req.user_id = v_admin_id THEN
          RAISE EXCEPTION 'Access denied: Administrators cannot approve their own payment requests.';
        END IF;

        IF v_req.service_type IN ('website_subscription', 'website_package') THEN
          IF v_req.service_id IS NULL OR pg_catalog.btrim(v_req.service_id) = '' THEN
            RETURN jsonb_build_object('success', false, 'code', 'MISSING_SERVICE_ID', 'message', 'Website payment request is missing target website ID.');
          END IF;

          IF v_req.service_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            RETURN jsonb_build_object('success', false, 'code', 'INVALID_SERVICE_ID', 'message', 'Target website ID format is invalid (expected UUID).');
          END IF;

          v_website_uuid := v_req.service_id::UUID;

          SELECT user_id INTO v_target_user_id
          FROM public.subscribed_websites
          WHERE id = v_website_uuid
          FOR UPDATE;

          IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'code', 'WEBSITE_NOT_FOUND', 'message', 'Target website record does not exist.');
          END IF;

          IF v_target_user_id IS DISTINCT FROM v_req.user_id THEN
            RETURN jsonb_build_object('success', false, 'code', 'TENANT_MISMATCH', 'message', 'Payment request submitter does not match website owner.');
          END IF;

          UPDATE public.subscribed_websites
          SET
            status = 'active',
            payment_status = 'paid',
            current_period_end = NOW() + INTERVAL '30 days',
            grace_period_end = NOW() + INTERVAL '35 days',
            updated_at = NOW()
          WHERE id = v_website_uuid
            AND user_id = v_req.user_id;

          GET DIAGNOSTICS v_updated_site_count = ROW_COUNT;
          IF v_updated_site_count <> 1 THEN
            RAISE EXCEPTION 'Payment approval aborted: Expected 1 subscribed_websites row updated, got %.', v_updated_site_count;
          END IF;
        END IF;

        UPDATE public.payment_requests
        SET
          status = 'approved',
          admin_notes = p_admin_notes,
          reviewed_by = v_admin_id,
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = p_request_id
          AND status = 'pending';

        GET DIAGNOSTICS v_updated_req_count = ROW_COUNT;
        IF v_updated_req_count <> 1 THEN
          RAISE EXCEPTION 'Payment approval aborted: Expected 1 pending payment_requests row updated, got %.', v_updated_req_count;
        END IF;

        RETURN jsonb_build_object(
          'success', true,
          'code', 'APPROVED',
          'message', 'Payment approved successfully. Service activated.',
          'requestId', p_request_id
        );
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
    $fn_approve$;

    REVOKE ALL ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) FROM anon;
    GRANT EXECUTE ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) TO authenticated, service_role;

    EXECUTE $fn_reject$
      CREATE OR REPLACE FUNCTION public.admin_reject_payment_request(
        p_request_id UUID,
        p_reason TEXT
      )
      RETURNS JSONB AS $$
      DECLARE
        v_admin_id UUID;
        v_req RECORD;
      BEGIN
        v_admin_id := auth.uid();
        IF v_admin_id IS NULL OR NOT public.is_admin() THEN
          RAISE EXCEPTION 'Only verified platform administrators can reject payment requests';
        END IF;

        SELECT * INTO v_req
        FROM public.payment_requests
        WHERE id = p_request_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RETURN jsonb_build_object('success', false, 'message', 'Payment request not found');
        END IF;

        IF v_req.status != 'pending' THEN
          RETURN jsonb_build_object('success', false, 'message', 'Payment request is already ' || v_req.status);
        END IF;

        UPDATE public.payment_requests
        SET
          status = 'rejected',
          admin_notes = p_reason,
          reviewed_by = v_admin_id,
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = p_request_id
          AND status = 'pending';

        RETURN jsonb_build_object(
          'success', true,
          'message', 'Payment request rejected.',
          'requestId', p_request_id
        );
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
    $fn_reject$;

    REVOKE ALL ON FUNCTION public.admin_reject_payment_request(UUID, TEXT) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.admin_reject_payment_request(UUID, TEXT) FROM anon;
    GRANT EXECUTE ON FUNCTION public.admin_reject_payment_request(UUID, TEXT) TO authenticated, service_role;
  END IF;
END
$bootstrap_rpcs$;

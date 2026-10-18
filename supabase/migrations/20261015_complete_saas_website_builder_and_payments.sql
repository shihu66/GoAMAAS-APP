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
    AND status = 'pending' -- Customers can only submit with status pending
  );

DROP POLICY IF EXISTS "Payment requests update policy" ON public.payment_requests;
CREATE POLICY "Payment requests update policy"
  ON public.payment_requests FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

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

DROP POLICY IF EXISTS "Payment gateway configs select policy" ON public.payment_gateway_configs;
CREATE POLICY "Payment gateway configs select policy"
  ON public.payment_gateway_configs FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Payment gateway configs modify policy" ON public.payment_gateway_configs;
CREATE POLICY "Payment gateway configs modify policy"
  ON public.payment_gateway_configs FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed initial payment configs safely
INSERT INTO public.payment_gateway_configs (id, display_name, is_enabled, account_number, account_name, instructions)
VALUES 
  ('bkash', 'bKash Personal (Send Money)', true, '+8801822332020', 'AMAAS Official Merchant', 'Send Money the exact payable amount to this personal bKash number, then submit your transaction ID below.')
ON CONFLICT (id) DO UPDATE SET
  account_number = EXCLUDED.account_number,
  account_name = EXCLUDED.account_name;

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

-- 3. Atomic Stored Procedure: Admin Approve Payment Request
CREATE OR REPLACE FUNCTION public.admin_approve_payment_request(
  p_request_id UUID,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID;
  v_req RECORD;
  v_sub RECORD;
BEGIN
  v_admin_id := auth.uid();
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only verified platform administrators can approve payment requests';
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

  -- Update payment request status
  UPDATE public.payment_requests
  SET 
    status = 'approved',
    admin_notes = p_admin_notes,
    reviewed_by = v_admin_id,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_request_id;

  -- If service is website subscription, update corresponding subscribed_websites
  IF v_req.service_type = 'website_subscription' THEN
    UPDATE public.subscribed_websites
    SET 
      status = 'active',
      subscription_status = 'active',
      payment_status = 'paid',
      current_period_end = NOW() + INTERVAL '30 days',
      grace_period_end = NOW() + INTERVAL '35 days',
      next_billing_date = (NOW() + INTERVAL '30 days')::TEXT,
      updated_at = NOW()
    WHERE user_id = v_req.user_id AND (id::TEXT = v_req.service_id OR store_id = v_req.store_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payment approved successfully. Service activated.',
    'requestId', p_request_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Atomic Stored Procedure: Admin Reject Payment Request
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
  IF NOT public.is_admin() THEN
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
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payment request rejected.',
    'requestId', p_request_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

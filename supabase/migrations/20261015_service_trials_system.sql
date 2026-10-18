-- ==============================================================================
-- GoAMAAS Migration: Independent 7-Day Free Trial System for Every Service
-- ==============================================================================

-- 1. Create service_trials Table
CREATE TABLE IF NOT EXISTS public.service_trials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  service_id TEXT NOT NULL, -- 'dashboard_starter', 'dashboard_business', 'dashboard_pro', 'dashboard_enterprise', 'ai_automations', 'landing_page_builder', 'business_website_lite', 'bespoke_web_dev'
  service_name TEXT NOT NULL,
  service_category TEXT NOT NULL CHECK (service_category IN ('dashboard', 'ai_automation', 'website', 'landing_pages')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Enforce: Each user can activate each service trial ONLY ONCE
  CONSTRAINT uq_user_service_trial UNIQUE (user_id, service_id)
);

-- Index for speedy queries by user and service
CREATE INDEX IF NOT EXISTS idx_service_trials_user ON public.service_trials(user_id);
CREATE INDEX IF NOT EXISTS idx_service_trials_service ON public.service_trials(user_id, service_id);

-- Enable Row Level Security
ALTER TABLE public.service_trials ENABLE ROW LEVEL SECURITY;

-- 2. RLS Policies
-- Users can view their own service trials; admins can view all
DROP POLICY IF EXISTS "Service trials select policy" ON public.service_trials;
CREATE POLICY "Service trials select policy"
  ON public.service_trials FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- Users can insert their own service trial (server constraint ensures 1 per service_id)
DROP POLICY IF EXISTS "Service trials insert policy" ON public.service_trials;
CREATE POLICY "Service trials insert policy"
  ON public.service_trials FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND expires_at <= (NOW() + INTERVAL '7 days 5 minutes') -- Prevent client from injecting forged distant expiration
  );

-- Only admins or user status update (e.g. converted) can update, with user_id and started_at locked
DROP POLICY IF EXISTS "Service trials update policy" ON public.service_trials;
CREATE POLICY "Service trials update policy"
  ON public.service_trials FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- Deletion policy: only admins can delete trials
DROP POLICY IF EXISTS "Service trials delete policy" ON public.service_trials;
CREATE POLICY "Service trials delete policy"
  ON public.service_trials FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 3. Immutability Trigger for user_id, service_id, and started_at
CREATE OR REPLACE FUNCTION public.protect_service_trial_invariants()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id != OLD.user_id THEN
      RAISE EXCEPTION 'Cannot alter ownership of a service trial';
    END IF;
    IF NEW.service_id != OLD.service_id THEN
      RAISE EXCEPTION 'Cannot alter the service_id of an existing trial';
    END IF;
    IF NEW.started_at != OLD.started_at THEN
      RAISE EXCEPTION 'Cannot modify the start timestamp of an existing trial';
    END IF;
    IF NEW.expires_at > OLD.expires_at AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only an administrator can extend a trial period';
    END IF;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_service_trial ON public.service_trials;
CREATE TRIGGER trg_protect_service_trial
  BEFORE UPDATE ON public.service_trials
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_service_trial_invariants();

-- 4. Server-Side Trial Activation Stored Function
CREATE OR REPLACE FUNCTION public.activate_service_trial(
  p_service_id TEXT,
  p_service_name TEXT,
  p_service_category TEXT,
  p_store_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_existing RECORD;
  v_new_trial RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to activate a service trial';
  END IF;

  -- Check if user has already activated this service trial
  SELECT * INTO v_existing
  FROM public.service_trials
  WHERE user_id = v_user_id AND service_id = p_service_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'TRIAL_ALREADY_USED',
      'message', 'You have already activated the 7-day free trial for this service.',
      'trial', row_to_json(v_existing)
    );
  END IF;

  -- Insert new trial record
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
    p_service_id,
    p_service_name,
    p_service_category,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

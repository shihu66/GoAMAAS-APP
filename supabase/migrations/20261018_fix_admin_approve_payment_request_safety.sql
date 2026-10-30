-- ==============================================================================
-- GoAMAAS Migration: Hardened Admin Payment Approval & Website Targeting Safety
-- File: supabase/migrations/20261018_fix_admin_approve_payment_request_safety.sql
-- ==============================================================================

-- Description:
-- Strengthens public.admin_approve_payment_request() to guarantee atomic, exact,
-- single-row matching for website subscriptions.
-- Prevents marking payment requests as 'approved' when the target website is missing,
-- invalid, or owned by a different merchant. Prevents sibling website activation.

DO $mig_20261018$
BEGIN
  -- Preserve hardened capability-token implementation if 20261024+ has already been applied
  IF pg_catalog.to_regclass('amaas_internal.payment_review_authorizations') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.is_verified_platform_admin(uuid)') IS NOT NULL THEN
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.admin_approve_payment_request(
      p_request_id UUID,
      p_admin_notes TEXT DEFAULT NULL
    )
    RETURNS JSONB AS $$
    DECLARE
      v_admin_id UUID;
      v_req RECORD;
      v_matched_count INTEGER := 0;
      v_website_uuid UUID;
      v_target_user_id UUID;
    BEGIN
      v_admin_id := auth.uid();
      IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only verified platform administrators can approve payment requests';
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
        -- A. Validate service_id is not empty
        IF v_req.service_id IS NULL OR trim(v_req.service_id) = '' THEN
          RETURN jsonb_build_object(
            'success', false,
            'code', 'MISSING_SERVICE_ID',
            'message', 'Payment approval failed: Website payment request is missing target website ID.'
          );
        END IF;

        -- B. Validate service_id is a valid UUID format
        IF v_req.service_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_SERVICE_ID',
            'message', 'Payment approval failed: Target website ID format is invalid (expected UUID).'
          );
        END IF;

        v_website_uuid := v_req.service_id::UUID;

        -- C. Verify target website exists in database
        SELECT user_id INTO v_target_user_id
        FROM public.subscribed_websites
        WHERE id = v_website_uuid;

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

        -- F. Lock and update exactly the target website
        UPDATE public.subscribed_websites
        SET
          status = 'active',
          payment_status = 'paid',
          current_period_end = NOW() + INTERVAL '30 days',
          grace_period_end = NOW() + INTERVAL '35 days',
          updated_at = NOW()
        WHERE id = v_website_uuid AND user_id = v_req.user_id;
      END IF;

      -- 4. Atomically mark payment request as approved ONLY after all service-specific activations succeed
      UPDATE public.payment_requests
      SET
        status = 'approved',
        admin_notes = p_admin_notes,
        reviewed_by = v_admin_id,
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = p_request_id;

      RETURN jsonb_build_object(
        'success', true,
        'code', 'APPROVED',
        'message', 'Payment approved successfully. Service activated.',
        'requestId', p_request_id
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
  $fn$;

  REVOKE ALL ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) FROM anon;
  GRANT EXECUTE ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) TO authenticated, service_role;
END
$mig_20261018$;


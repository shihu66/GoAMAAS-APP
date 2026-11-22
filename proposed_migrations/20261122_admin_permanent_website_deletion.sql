-- ==============================================================================
-- GoAMAAS Local Reviewed Migration (NOT YET APPLIED TO PRODUCTION)
-- Security Remediation: Safe Admin Permanent Website Deletion, Trigger Hardening,
-- Least-Privilege Grants, Owner Alignment, NULL store_id & Concurrency Safety
-- ==============================================================================

-- 1. Allow 'delete' lifecycle action in website_lifecycle_audit_logs
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

-- 2. Harden protect_store_membership() without weakening any merchant/team rules
--    Allows backend service_role or direct table-owner/superuser cascade DELETE
--    when deleting an exclusive store cascades ON DELETE CASCADE to store_members.
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

-- 3. Harden protect_payment_request_integrity() FK ON DELETE SET NULL branch
--    Strictly requires service_role setting OR direct session owner/superuser with no client SET ROLE,
--    alongside v_caller_id IS NULL, parent store no longer existing, and ALL other columns untouched.
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

-- 4. Minimum Required Table Permissions (Least-Privilege Only)
--    admin_permanently_delete_website() is SECURITY INVOKER invoked by service_role.
--    orders, customers, and inventory_movements are only COUNT(*)-inspected; ON DELETE CASCADE
--    from public.stores runs as table owner. Grant ONLY SELECT on these three tables.
GRANT SELECT ON TABLE public.orders TO service_role;
GRANT SELECT ON TABLE public.customers TO service_role;
GRANT SELECT ON TABLE public.inventory_movements TO service_role;

-- 5. Hardened Atomic Permanent Website + Exclusive Store Deletion RPC (service_role only)
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
  v_site RECORD;
  v_clean_confirm TEXT;
  v_clean_reason TEXT;
  v_site_subdomain TEXT;
  v_site_full_domain TEXT;
  v_locked_store_id UUID := NULL;
  v_is_shared_store BOOLEAN := false;
  v_exclusive_store_id UUID := NULL;
  v_orphan_prod_count INTEGER := 0;
  v_orphan_store_count INTEGER := 0;
  v_has_ambiguous_orphans BOOLEAN := false;
  v_deleted_products INTEGER := 0;
  v_deleted_inventory INTEGER := 0;
  v_deleted_customers INTEGER := 0;
  v_deleted_orders INTEGER := 0;
  v_deleted_members INTEGER := 0;
  v_audit_id UUID;
BEGIN
  -- Fix 5: Strict DB-level parameter & verified primary platform administrator checks
  IF p_website_id IS NULL THEN
    RAISE EXCEPTION 'Target website ID is required for permanent deletion';
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
    RAISE EXCEPTION 'Only verified primary platform administrators can permanently delete websites';
  END IF;

  v_clean_confirm := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_confirm_subdomain, '')));
  v_clean_reason := COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), ''), 'Permanent administrative deletion');

  -- Fix 8: Transactional lock & deadlock subtransaction guard
  BEGIN
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
      -- Lock parent store BEFORE checking sibling websites so concurrent sibling creation
      -- (which holds FOR KEY SHARE via FK stores(id)) serializes safely.
      SELECT id
      INTO v_locked_store_id
      FROM public.stores
      WHERE id = v_site.store_id
      FOR UPDATE;

      SELECT EXISTS (
        SELECT 1
        FROM public.subscribed_websites sw
        WHERE sw.store_id = v_site.store_id
          AND sw.id <> p_website_id
      ) INTO v_is_shared_store;

      IF NOT v_is_shared_store AND v_locked_store_id IS NOT NULL THEN
        v_exclusive_store_id := v_locked_store_id;

        SELECT COUNT(*) INTO v_deleted_products FROM public.products WHERE store_id = v_exclusive_store_id;
        SELECT COUNT(*) INTO v_deleted_inventory FROM public.inventory_movements WHERE store_id = v_exclusive_store_id;
        SELECT COUNT(*) INTO v_deleted_customers FROM public.customers WHERE store_id = v_exclusive_store_id;
        SELECT COUNT(*) INTO v_deleted_orders FROM public.orders WHERE store_id = v_exclusive_store_id;
        SELECT COUNT(*) INTO v_deleted_members FROM public.store_members WHERE store_id = v_exclusive_store_id;
      END IF;
    ELSE
      -- Fix 7: Handle subscribed_websites.store_id IS NULL safely.
      -- Never leave orphan products linked only via website_id, and never guess an unrelated store to delete.
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

        -- Lock and delete ONLY unambiguously owned website_id-scoped products (and count their cascading inventory rows);
        -- do NOT delete any unlinked store itself.
        PERFORM 1
        FROM public.products p
        WHERE p.website_id = p_website_id
        FOR UPDATE;

        SELECT COUNT(*)
        INTO v_deleted_inventory
        FROM public.inventory_movements im
        WHERE im.product_id IN (
          SELECT p.id
          FROM public.products p
          WHERE p.website_id = p_website_id
        );

        DELETE FROM public.products
        WHERE website_id = p_website_id;

        GET DIAGNOSTICS v_deleted_products = ROW_COUNT;
      END IF;
    END IF;

    DELETE FROM public.subscribed_websites WHERE id = p_website_id;

    IF v_exclusive_store_id IS NOT NULL THEN
      -- Fix 6: Safely reassign profiles.store_id to another active store owned by that user if present, else NULL
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

    RETURN jsonb_build_object(
      'success', true,
      'code', 'DELETED',
      'message', 'Website and all exclusively associated store business data were permanently deleted.',
      'deletedWebsiteId', p_website_id,
      'deletedStoreId', v_exclusive_store_id,
      'isSharedStore', v_is_shared_store,
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

-- 6. Fix 4: Dynamic Function Owner Alignment & Security Invariant Verification
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
    SELECT proowner
    FROM pg_catalog.pg_proc
    WHERE oid = 'public.protect_store_membership()'::pg_catalog.regprocedure
  ) IS DISTINCT FROM v_pr_owner_oid THEN
    EXECUTE format('ALTER FUNCTION public.protect_store_membership() OWNER TO %I', v_pr_owner);
  END IF;

  IF (
    SELECT proowner
    FROM pg_catalog.pg_proc
    WHERE oid = 'public.protect_payment_request_integrity()'::pg_catalog.regprocedure
  ) IS DISTINCT FROM v_pr_owner_oid THEN
    EXECUTE format('ALTER FUNCTION public.protect_payment_request_integrity() OWNER TO %I', v_pr_owner);
  END IF;

  IF (
    SELECT proowner
    FROM pg_catalog.pg_proc
    WHERE oid = 'public.admin_permanently_delete_website(uuid, uuid, text, text)'::pg_catalog.regprocedure
  ) IS DISTINCT FROM v_pr_owner_oid THEN
    EXECUTE format(
      'ALTER FUNCTION public.admin_permanently_delete_website(UUID, UUID, TEXT, TEXT) OWNER TO %I',
      v_pr_owner
    );
  END IF;

  FOR v_fn IN (
    SELECT p.proname, p.proowner, p.prosecdef, p.proconfig
    FROM pg_catalog.pg_proc p
    WHERE p.oid IN (
      'public.protect_store_membership()'::pg_catalog.regprocedure,
      'public.protect_payment_request_integrity()'::pg_catalog.regprocedure,
      'public.admin_permanently_delete_website(uuid, uuid, text, text)'::pg_catalog.regprocedure
    )
  ) LOOP
    IF v_fn.proowner IS DISTINCT FROM v_pr_owner_oid THEN
      RAISE EXCEPTION 'Owner alignment check failed for public.%', v_fn.proname;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(v_fn.proconfig, ARRAY[]::TEXT[])) AS cfg
      WHERE cfg ~ '^search_path=\s*"?pg_catalog"?\s*,\s*"?public"?\s*,\s*"?pg_temp"?\s*$'
    ) THEN
      RAISE EXCEPTION 'Pinned search_path check failed for public.%', v_fn.proname;
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'public.admin_permanently_delete_website(uuid, uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_permanently_delete_website(uuid, uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.protect_payment_request_integrity()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_payment_request_integrity()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.protect_store_membership()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_store_membership()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security invariant check failed: Unauthorized client EXECUTE privilege detected.';
  END IF;
END $$;

-- ==============================================================================
-- GoAMAAS Supabase Security Verification & Test Suite
-- File: /supabase/tests/security_verification_tests.sql
-- Description:
--   Comprehensive PL/pgSQL verification script designed to execute inside
--   Supabase SQL Editor or psql CLI. Validates all critical RLS policies,
--   triggers, and ownership safeguards. Runs inside an isolated transaction
--   block and automatically rolls back.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_store_owner_id  UUID := gen_random_uuid();
  v_manager_id      UUID := gen_random_uuid();
  v_staff_id        UUID := gen_random_uuid();
  v_attacker_id     UUID := gen_random_uuid();
  v_victim_user_id  UUID := gen_random_uuid();
  v_invitee_id      UUID := gen_random_uuid();
  v_admin_id        UUID := gen_random_uuid();

  v_store_a_id      UUID := gen_random_uuid();
  v_store_b_id      UUID := gen_random_uuid();
  v_product_a_id    UUID := gen_random_uuid();
  v_invite_id       UUID := gen_random_uuid();
  v_staff_member_id UUID := gen_random_uuid();

  v_error_caught    BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'STARTING GOAMAAS SECURITY SUITE VERIFICATION';
  RAISE NOTICE '------------------------------------------------------------';

  -- --------------------------------------------------------------------------
  -- SETUP: Seed Auth Users, Profiles, Stores, and Members for Isolated Role Emulation
  -- --------------------------------------------------------------------------
  -- Insert users into auth.users (handle_new_user automatically creates default merchant profiles)
  INSERT INTO auth.users (id, email)
  VALUES
    (v_store_owner_id, 'owner@example.com'),
    (v_manager_id, 'manager@example.com'),
    (v_staff_id, 'staff@example.com'),
    (v_attacker_id, 'attacker@example.com'),
    (v_victim_user_id, 'victim@example.com'),
    (v_invitee_id, 'legit_invitee@example.com'),
    (v_admin_id, 'admin@example.com')
  ON CONFLICT (id) DO NOTHING;

  -- Ensure profile data is populated for merchant roles
  UPDATE public.profiles
  SET full_name = 'Owner User', onboarding_completed = TRUE
  WHERE id = v_store_owner_id;

  UPDATE public.profiles
  SET full_name = 'Manager User', onboarding_completed = TRUE
  WHERE id = v_manager_id;

  UPDATE public.profiles
  SET full_name = 'Staff User', onboarding_completed = TRUE
  WHERE id = v_staff_id;

  UPDATE public.profiles
  SET full_name = 'Attacker User', onboarding_completed = TRUE
  WHERE id = v_attacker_id;

  UPDATE public.profiles
  SET full_name = 'Victim User', onboarding_completed = TRUE
  WHERE id = v_victim_user_id;

  UPDATE public.profiles
  SET full_name = 'Invited User', onboarding_completed = TRUE
  WHERE id = v_invitee_id;

  -- Emulate superuser/platform admin setup for v_admin_id by disabling trigger or setting claims
  -- In PostgreSQL superuser/migration context, platform admin can be initialized directly:
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'service_role')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  UPDATE public.profiles
  SET role = 'admin', full_name = 'Platform Admin', onboarding_completed = TRUE
  WHERE id = v_admin_id;

  INSERT INTO public.stores (id, owner_id, name, slug)
  VALUES 
    (v_store_a_id, v_store_owner_id, 'Store Alpha', 'store-alpha'),
    (v_store_b_id, v_victim_user_id, 'Store Beta', 'store-beta');

  -- Assign Manager to Store Alpha
  INSERT INTO public.store_members (id, store_id, user_id, name, email, role, status)
  VALUES (gen_random_uuid(), v_store_a_id, v_manager_id, 'Manager User', 'manager@example.com', 'manager', 'active');

  -- Assign Staff to Store Alpha
  INSERT INTO public.store_members (id, store_id, user_id, name, email, role, status)
  VALUES (v_staff_member_id, v_store_a_id, v_staff_id, 'Staff User', 'staff@example.com', 'staff', 'active');

  -- Add product in Store Alpha
  INSERT INTO public.products (id, store_id, name, price, stock, sku)
  VALUES (v_product_a_id, v_store_a_id, 'Leather Wallet', 1200, 50, 'WAL-001');

  -- --------------------------------------------------------------------------
  -- TEST 1: Merchant Role Escalation via Profile Update
  -- Expected: protect_profile_role() trigger blocks merchant from changing role to admin
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 1] Testing Merchant Self-Promotion to Admin via public.profiles...';
  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_attacker_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_attacker_id::text, true);

    UPDATE public.profiles
    SET role = 'admin'
    WHERE id = v_attacker_id;

    RAISE EXCEPTION 'TEST 1 FAILED: Attacker successfully modified role to admin!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Access denied: Users cannot modify their own platform role%' THEN
      RAISE NOTICE '  --> PASSED: Trigger protect_profile_role() correctly blocked privilege escalation.';
      v_error_caught := TRUE;
    ELSE
      RAISE EXCEPTION 'TEST 1 FAILED with unexpected error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected exception was not raised.';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 2: Authorized Profile Update (Full Name & Onboarding)
  -- Expected: Normal merchant can update non-privileged profile columns without recursion error
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 2] Testing Authorized Profile Update for Merchant...';
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_attacker_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_attacker_id::text, true);

    UPDATE public.profiles
    SET full_name = 'Attacker Reformed',
        onboarding_completed = TRUE
    WHERE id = v_attacker_id;

    RAISE NOTICE '  --> PASSED: Profile update succeeded with zero RLS recursion.';
  END;

  -- --------------------------------------------------------------------------
  -- TEST 3: Manager Privilege Escalation (Manager inviting Store Admin/Manager)
  -- Expected: protect_store_membership() blocks manager from creating owner/admin/manager
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 3] Testing Manager Privilege Escalation (Inviting Store Admin)...';
  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_manager_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_manager_id::text, true);

    INSERT INTO public.store_members (store_id, user_id, name, email, role, status)
    VALUES (v_store_a_id, NULL, 'Hacked Admin', 'rogue@example.com', 'admin', 'invited');

    RAISE EXCEPTION 'TEST 3 FAILED: Manager was able to assign elevated admin role!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Access denied: Only the store owner or platform admin can grant privileged roles%' THEN
      RAISE NOTICE '  --> PASSED: Trigger protect_store_membership() blocked manager escalation.';
      v_error_caught := TRUE;
    ELSE
      RAISE EXCEPTION 'TEST 3 FAILED with unexpected error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Expected exception was not raised.';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 4: Manager Directly Assigning user_id on Invite
  -- Expected: protect_store_membership() blocks manager from directly binding user_id
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 4] Testing Manager Directly Binding user_id on Invitation...';
  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_manager_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_manager_id::text, true);

    INSERT INTO public.store_members (store_id, user_id, name, email, role, status)
    VALUES (v_store_a_id, v_attacker_id, 'Pre-bound Staff', 'prebound@example.com', 'staff', 'invited');

    RAISE EXCEPTION 'TEST 4 FAILED: Manager directly injected user_id into invitation!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Access denied: Invitations cannot directly assign a user ID%' THEN
      RAISE NOTICE '  --> PASSED: Trigger protect_store_membership() blocked direct user_id assignment.';
      v_error_caught := TRUE;
    ELSE
      RAISE EXCEPTION 'TEST 4 FAILED with unexpected error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Expected exception was not raised.';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 5: Invitation-Role Tampering During Claim
  -- Expected: User claiming pending invite cannot elevate role to owner
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 5] Testing Invitation Role Tampering During Claim...';
  -- Owner creates the initial invitation
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_store_owner_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_store_owner_id::text, true);
  INSERT INTO public.store_members (id, store_id, user_id, name, email, role, status)
  VALUES (v_invite_id, v_store_a_id, NULL, 'Legit Staff Candidate', 'legit_invitee@example.com', 'staff', 'invited');

  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_invitee_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_invitee_id::text, true);

    -- Legitimate user attempts to elevate role to 'owner' during claim
    UPDATE public.store_members
    SET user_id = v_invitee_id,
        role = 'owner',
        status = 'active'
    WHERE id = v_invite_id;

    RAISE EXCEPTION 'TEST 5 FAILED: Claimer escalated invite role to owner!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Access denied: Cannot modify role when accepting invitation%' THEN
      RAISE NOTICE '  --> PASSED: Trigger prevented tampering with invited role during claim.';
      v_error_caught := TRUE;
    ELSE
      RAISE EXCEPTION 'TEST 5 FAILED with unexpected error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Expected exception was not raised.';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 6: Unauthorized Claim by Attacker with Mismatched Email
  -- Expected: protect_store_membership() and RLS block claim by non-matching email
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 6] Testing Invitation Hijacking by Attacker with Mismatched Email...';
  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_attacker_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_attacker_id::text, true);

    -- Attacker attempts to claim invite sent to legit_invitee@example.com
    UPDATE public.store_members
    SET user_id = v_attacker_id,
        status = 'active'
    WHERE id = v_invite_id;

    RAISE EXCEPTION 'TEST 6 FAILED: Attacker hijacked someone else''s pending invitation!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Access denied: You can only claim invitations sent to your verified email address%' THEN
      RAISE NOTICE '  --> PASSED: Trigger protect_store_membership() blocked mismatched email invite claim.';
      v_error_caught := TRUE;
    ELSE
      RAISE EXCEPTION 'TEST 6 FAILED with unexpected error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Expected exception was not raised.';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 7: Authorized Invitation Claim by Verified Recipient
  -- Expected: User with matching email successfully claims invite and becomes active
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 7] Testing Authorized Invitation Claim by Legitimate Recipient...';
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_invitee_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_invitee_id::text, true);

    UPDATE public.store_members
    SET user_id = v_invitee_id,
        status = 'active'
    WHERE id = v_invite_id;

    RAISE NOTICE '  --> PASSED: Legitimate recipient successfully accepted invitation.';
  END;

  -- --------------------------------------------------------------------------
  -- TEST 8: Member Self-Identity Tampering (Staff Changing Own Role)
  -- Expected: protect_store_membership() blocks members from self-escalating role
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 8] Testing Member Self-Identity Tampering (Staff altering own role)...';
  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_staff_id::text, true);

    UPDATE public.store_members
    SET role = 'manager'
    WHERE id = v_staff_member_id;

    RAISE EXCEPTION 'TEST 8 FAILED: Staff escalated own role to manager!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Access denied: Users cannot alter their own store role%' THEN
      RAISE NOTICE '  --> PASSED: Member role self-escalation blocked.';
      v_error_caught := TRUE;
    ELSE
      RAISE EXCEPTION 'TEST 8 FAILED with unexpected error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Expected exception was not raised.';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 9: Unauthorized Transfer of Membership Across Stores (store_id immutability)
  -- Expected: Trigger blocks altering store_id under any circumstances
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 9] Testing store_id Immutability Protection on store_members...';
  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_store_owner_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_store_owner_id::text, true);

    UPDATE public.store_members
    SET store_id = v_store_b_id
    WHERE id = v_staff_member_id;

    RAISE EXCEPTION 'TEST 9 FAILED: store_id was modified!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Access denied: Cannot transfer membership to another store%' THEN
      RAISE NOTICE '  --> PASSED: Membership transfer across stores blocked by trigger.';
      v_error_caught := TRUE;
    ELSE
      RAISE EXCEPTION 'TEST 9 FAILED with unexpected error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Expected exception was not raised.';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 10: Reassigning Established Member user_id
  -- Expected: Trigger blocks altering user_id once established
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 10] Testing user_id Immutability on Established Membership...';
  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_store_owner_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_store_owner_id::text, true);

    UPDATE public.store_members
    SET user_id = v_attacker_id
    WHERE id = v_staff_member_id;

    RAISE EXCEPTION 'TEST 10 FAILED: Established member user_id was reassigned!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Access denied: Cannot reassign membership user ID%' THEN
      RAISE NOTICE '  --> PASSED: Reassigning established member user_id blocked.';
      v_error_caught := TRUE;
    ELSE
      RAISE EXCEPTION 'TEST 10 FAILED with unexpected error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 10 FAILED: Expected exception was not raised.';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 11: Unauthorized Transfer of Store Ownership
  -- Expected: protect_store_ownership() blocks store owner from reassigning owner_id
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 11] Testing Store Ownership Transfer Restriction...';
  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_store_owner_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_store_owner_id::text, true);

    UPDATE public.stores
    SET owner_id = v_attacker_id
    WHERE id = v_store_a_id;

    RAISE EXCEPTION 'TEST 11 FAILED: Store owner reassigned owner_id without admin privilege!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Access denied: Only platform administrators can transfer store ownership%' THEN
      RAISE NOTICE '  --> PASSED: protect_store_ownership() blocked unauthorized ownership change.';
      v_error_caught := TRUE;
    ELSE
      RAISE EXCEPTION 'TEST 11 FAILED with unexpected error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 11 FAILED: Expected exception was not raised.';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 12: Tenant Table store_id Tampering (Products table)
  -- Expected: protect_tenant_store_id() blocks moving products across stores
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 12] Testing Tenant store_id Immutability on Products...';
  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_store_owner_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_store_owner_id::text, true);

    UPDATE public.products
    SET store_id = v_store_b_id
    WHERE id = v_product_a_id;

    RAISE EXCEPTION 'TEST 12 FAILED: Product was moved to another store!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Access denied: Cannot reassign store_id or transfer records between stores%' THEN
      RAISE NOTICE '  --> PASSED: protect_tenant_store_id() blocked moving product across stores.';
      v_error_caught := TRUE;
    ELSE
      RAISE EXCEPTION 'TEST 12 FAILED with unexpected error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_error_caught THEN
    RAISE EXCEPTION 'TEST 12 FAILED: Expected exception was not raised.';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 13: Cross-Tenant Boundary Helpers (can_access_store & can_manage_store)
  -- Expected: Attacker has no access to Store Alpha products or orders
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 13] Testing Cross-Tenant Boundary Helpers...';
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_attacker_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_attacker_id::text, true);

    IF public.can_access_store(v_store_a_id) THEN
      RAISE EXCEPTION 'TEST 13 FAILED: Attacker can_access_store returned true for foreign store!';
    END IF;

    IF public.can_manage_store(v_store_a_id) THEN
      RAISE EXCEPTION 'TEST 13 FAILED: Attacker can_manage_store returned true for foreign store!';
    END IF;

    -- Emulate Store Owner
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_store_owner_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_store_owner_id::text, true);
    IF NOT public.can_access_store(v_store_a_id) OR NOT public.can_manage_store(v_store_a_id) THEN
      RAISE EXCEPTION 'TEST 13 FAILED: Store owner denied access to own store!';
    END IF;

    RAISE NOTICE '  --> PASSED: Cross-tenant access controls strictly segregated.';
  END;

  -- --------------------------------------------------------------------------
  -- TEST 14: Authorized Store Owner Team Management
  -- Expected: Store owner can invite legitimate staff and assign manager roles
  -- --------------------------------------------------------------------------
  RAISE NOTICE '[TEST 14] Testing Authorized Owner Team Management...';
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_store_owner_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_store_owner_id::text, true);

    INSERT INTO public.store_members (store_id, user_id, name, email, role, status)
    VALUES (v_store_a_id, NULL, 'Authorized Operations Lead', 'ops@example.com', 'manager', 'invited');

    RAISE NOTICE '  --> PASSED: Store owner successfully invited manager.';
  END;

  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'ALL 14 SECURITY TESTS COMPLETED SUCCESSFULLY!';
  RAISE NOTICE '------------------------------------------------------------';
END $$;

-- Rollback transaction to avoid leaving any test data
ROLLBACK;

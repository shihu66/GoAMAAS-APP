-- ==============================================================================
-- GoAMAAS Production Migration Candidate (NOT YET APPLIED TO PRODUCTION)
-- Target File: proposed_migrations/20261124_single_admin_and_aal2_enforcement.sql
--
-- Purpose:
--   1. Enforce exclusive single-administrator policy in PostgreSQL:
--      Only official.amaas.dev@gmail.com may hold profiles.role = 'admin'
--      and execute administrative RPCs. Reject every other account.
--   2. Enforce AAL2 TOTP verification and `auth.mfa_factors` check in RPCs.
--   3. Tighten public.profiles INSERT/UPDATE triggers (protect_profile_role)
--      so non-admins can never elevate privileges and only official.amaas.dev@gmail.com
--      can hold admin role.
-- ==============================================================================

SET search_path = pg_catalog, public, pg_temp;

-- 1. Exclusive Admin Helper Functions
CREATE OR REPLACE FUNCTION public.is_authorized_admin_email(p_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, ''))) = 'official.amaas.dev@gmail.com';
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_verified_platform_admin(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
DECLARE
  v_active_role TEXT;
  v_user_email TEXT;
  v_profile_role TEXT;
  v_profile_email TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');
  IF v_active_role IN ('authenticated', 'anon') AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  -- Verify auth.users email matches allowlist
  SELECT pg_catalog.lower(pg_catalog.btrim(COALESCE(u.email, '')))
  INTO v_user_email
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF NOT public.is_authorized_admin_email(v_user_email) THEN
    RETURN false;
  END IF;

  -- Verify public.profiles role is 'admin' and email matches allowlist
  SELECT p.role, pg_catalog.lower(pg_catalog.btrim(COALESCE(p.email, '')))
  INTO v_profile_role, v_profile_email
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF COALESCE(v_profile_role, '') <> 'admin' THEN
    RETURN false;
  END IF;

  IF v_profile_email <> '' AND NOT public.is_authorized_admin_email(v_profile_email) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- AAL2 Verified Platform Admin Verification
CREATE OR REPLACE FUNCTION public.is_verified_aal2_platform_admin(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
DECLARE
  v_jwt_aal TEXT;
  v_has_verified_totp BOOLEAN := false;
BEGIN
  IF NOT public.is_verified_platform_admin(p_user_id) THEN
    RETURN false;
  END IF;

  -- Verify JWT AAL claim is aal2
  v_jwt_aal := pg_catalog.lower(pg_catalog.btrim(COALESCE(auth.jwt()->>'aal', '')));
  IF v_jwt_aal <> 'aal2' THEN
    RETURN false;
  END IF;

  -- Verify active verified TOTP factor exists in auth.mfa_factors if table exists
  IF pg_catalog.to_regclass('auth.mfa_factors') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM auth.mfa_factors f
      WHERE f.user_id = p_user_id
        AND f.factor_type = 'totp'
        AND f.status = 'verified'
    ) INTO v_has_verified_totp;

    IF NOT COALESCE(v_has_verified_totp, false) THEN
      RETURN false;
    END IF;
  END IF;

  return true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- 2. Protect profiles role updates and inserts
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger AS $$
DECLARE
  v_new_email TEXT;
  v_active_role TEXT;
  v_is_direct_owner_maintenance BOOLEAN := false;
BEGIN
  v_new_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, '')));

  -- If setting role = 'admin', email must be strictly official.amaas.dev@gmail.com
  IF NEW.role = 'admin' AND NOT public.is_authorized_admin_email(v_new_email) THEN
    RAISE EXCEPTION 'Access denied: Only official.amaas.dev@gmail.com can be assigned administrator privileges.';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.email IS DISTINCT FROM OLD.email THEN
    v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');
    IF v_active_role IN ('none', current_user) AND auth.uid() IS NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles r
        LEFT JOIN pg_catalog.pg_class c
          ON c.oid = 'public.profiles'::pg_catalog.regclass
         AND c.relowner = r.oid
        WHERE r.rolname = session_user
          AND (r.rolsuper = true OR c.oid IS NOT NULL)
      ) INTO v_is_direct_owner_maintenance;
    END IF;

    IF NOT v_is_direct_owner_maintenance AND NOT public.is_verified_platform_admin(auth.uid()) THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Access denied: Users cannot modify their own platform role or elevate privileges.';
      END IF;
    END IF;
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.protect_profile_role_insert()
RETURNS trigger AS $$
DECLARE
  v_new_email TEXT;
  v_active_role TEXT;
  v_is_direct_owner_maintenance BOOLEAN := false;
BEGIN
  v_new_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, '')));

  IF NEW.role = 'admin' AND NOT public.is_authorized_admin_email(v_new_email) THEN
    RAISE EXCEPTION 'Access denied: Only official.amaas.dev@gmail.com can be assigned administrator privileges.';
  END IF;

  IF NEW.role IS DISTINCT FROM 'merchant' AND NEW.role IS DISTINCT FROM 'admin' THEN
    NEW.role := 'merchant';
  END IF;

  IF NEW.role = 'admin' THEN
    v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');
    IF v_active_role IN ('none', current_user) AND auth.uid() IS NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles r
        LEFT JOIN pg_catalog.pg_class c
          ON c.oid = 'public.profiles'::pg_catalog.regclass
         AND c.relowner = r.oid
        WHERE r.rolname = session_user
          AND (r.rolsuper = true OR c.oid IS NOT NULL)
      ) INTO v_is_direct_owner_maintenance;
    END IF;

    IF NOT v_is_direct_owner_maintenance AND NOT public.is_verified_platform_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Access denied: Only platform administrators can assign admin roles.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Demote any unauthorized admin rows before creating unique index
UPDATE public.profiles
SET role = 'merchant'
WHERE role = 'admin'
  AND lower(btrim(coalesce(email, ''))) <> 'official.amaas.dev@gmail.com';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_single_admin_only
  ON public.profiles ((role))
  WHERE role = 'admin';

-- ==============================================================================
-- GoAMAAS Supabase PostgreSQL Database Schema & Security Hardening
-- Multi-Tenant E-Commerce, Multi-Store Staff Membership & Subscribed Websites
-- Source of Truth: /supabase/schema.sql
-- ==============================================================================

-- Ensure required extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. Helper Functions (SECURITY DEFINER with Fixed Search Path)
-- ==============================================================================

-- Securely check if the authenticated session user is an admin without RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
DECLARE
  v_role text;
  v_jwt_role text;
  v_active_role text;
  v_is_session_owner_or_superuser boolean;
BEGIN
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');

  IF v_active_role = 'service_role' OR session_user = 'service_role' THEN
    RETURN true;
  END IF;

  -- Honor JWT service_role claim ONLY in a direct owner/superuser session where no client SET ROLE is active
  IF v_active_role IN ('none', current_user) THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      LEFT JOIN pg_catalog.pg_class c
        ON c.oid = 'public.profiles'::pg_catalog.regclass
       AND c.relowner = r.oid
      WHERE r.rolname = session_user
        AND (r.rolsuper = true OR c.oid IS NOT NULL)
    ) INTO v_is_session_owner_or_superuser;

    IF COALESCE(v_is_session_owner_or_superuser, false) THEN
      v_jwt_role := COALESCE(
        NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
        auth.jwt()->>'role'
      );
      IF v_jwt_role = 'service_role' THEN
        RETURN true;
      END IF;
    END IF;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = auth.uid();

  RETURN COALESCE(v_role = 'admin', false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;


-- ==============================================================================
-- 2. Profiles Table & Admin Privilege Protection
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT UNIQUE,
  avatar_url TEXT,
  role TEXT DEFAULT 'merchant' CHECK (role IN ('merchant', 'admin')),
  onboarding_completed BOOLEAN DEFAULT FALSE,
  store_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Trigger: Strictly block ordinary users from elevating their role to admin
-- Standard non-recursive PostgreSQL trigger security
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger AS $$
DECLARE
  v_active_role text;
  v_is_direct_owner_maintenance boolean := false;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
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

    IF NOT v_is_direct_owner_maintenance AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access denied: Users cannot modify their own platform role or elevate privileges.';
    END IF;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_profile_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profile_role() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_role() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role();

CREATE OR REPLACE FUNCTION public.protect_profile_role_insert()
RETURNS trigger AS $$
DECLARE
  v_active_role text;
  v_is_direct_owner_maintenance boolean := false;
BEGIN
  IF NEW.role IS DISTINCT FROM 'merchant' THEN
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

    IF NOT v_is_direct_owner_maintenance AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access denied: Users cannot modify their own platform role or elevate privileges.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_profile_role_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profile_role_insert() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_role_insert() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_profile_role_insert ON public.profiles;
CREATE TRIGGER trg_protect_profile_role_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role_insert();

-- Profiles Policies (Clean, Non-recursive)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
CREATE POLICY "Profiles select policy"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insert policy" ON public.profiles;
CREATE POLICY "Profiles insert policy"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND (role = 'merchant' OR public.is_admin())
  );

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
CREATE POLICY "Profiles update policy"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Profiles delete policy" ON public.profiles;
CREATE POLICY "Profiles delete policy"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ==============================================================================
-- 3. Automatic Auth User Profile Creation Trigger
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_name text;
  v_email text;
BEGIN
  v_email := NULLIF(TRIM(new.email), '');

  -- Safely extract user's name
  v_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'name'), ''),
    CASE WHEN v_email IS NOT NULL AND POSITION('@' IN v_email) > 1 
         THEN split_part(v_email, '@', 1) 
         ELSE NULL 
    END,
    'Merchant'
  );

  -- SECURITY ENFORCEMENT:
  -- Role is ALWAYS hardcoded to 'merchant'. User-supplied metadata is NEVER trusted for role assignment.
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    role,
    onboarding_completed
  )
  VALUES (
    new.id,
    v_name,
    v_email,
    'merchant',
    FALSE
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    updated_at = NOW();

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==============================================================================
-- 4. Stores Table & Store Membership Table (Multi-staff Support)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT DEFAULT 'General',
  currency TEXT DEFAULT '৳',
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.store_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'manager', 'staff')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('active', 'invited')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, email)
);

ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;

-- Helper functions for tenant store access
CREATE OR REPLACE FUNCTION public.can_access_store(p_store_id UUID)
RETURNS boolean AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id
      AND (
        s.owner_id = auth.uid()
        OR public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.store_members sm
          WHERE sm.store_id = p_store_id
            AND sm.user_id = auth.uid()
            AND sm.status = 'active'
        )
      )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.can_access_store(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_store(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_store(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_store(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.can_manage_store(p_store_id UUID)
RETURNS boolean AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id
      AND (
        s.owner_id = auth.uid()
        OR public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.store_members sm
          WHERE sm.store_id = p_store_id
            AND sm.user_id = auth.uid()
            AND sm.status = 'active'
            AND sm.role IN ('owner', 'admin', 'manager')
        )
      )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.can_manage_store(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_store(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_store(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_store(UUID) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uq_store_members_store_email_lower 
  ON public.store_members (store_id, (lower(email)));

-- Store Membership Privilege Escalation Protection Trigger
CREATE OR REPLACE FUNCTION public.protect_store_membership()
RETURNS trigger AS $$
DECLARE
  v_is_store_owner boolean;
  v_is_platform_admin boolean;
  v_caller_member_role text;
  v_caller_profile_email text;
BEGIN
  v_is_platform_admin := public.is_admin();
  
  SELECT (s.owner_id = auth.uid()) INTO v_is_store_owner
  FROM public.stores s
  WHERE s.id = COALESCE(NEW.store_id, OLD.store_id);

  v_is_store_owner := COALESCE(v_is_store_owner, false);

  -- 1. Universal Tenant & Identity Integrity:
  -- Under NO circumstances can store_id be changed across stores (even by admin)
  IF TG_OP = 'UPDATE' AND NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    RAISE EXCEPTION 'Access denied: Cannot transfer membership to another store';
  END IF;

  -- 2. Once assigned, a member's user_id cannot be reassigned to a different user
  IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Access denied: Cannot reassign membership user ID';
  END IF;

  -- 3. Once established, an active member's email cannot be altered
  IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL AND NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Access denied: Cannot alter email of an established member';
  END IF;

  -- 4. Store Owner or Platform Admin have full authority over team management
  IF v_is_platform_admin OR v_is_store_owner THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- For non-owners, identify caller's active role in this store
  SELECT role INTO v_caller_member_role
  FROM public.store_members
  WHERE store_id = COALESCE(NEW.store_id, OLD.store_id)
    AND user_id = auth.uid()
    AND status = 'active';

  -- 5. INSERT (Inviting/Adding Members)
  IF TG_OP = 'INSERT' THEN
    IF v_caller_member_role IS NULL OR v_caller_member_role NOT IN ('admin', 'manager') THEN
      RAISE EXCEPTION 'Access denied: Only store owners or managers can invite team members';
    END IF;

    -- Privilege escalation prevention: Managers CANNOT assign owner, admin, or manager roles
    IF NEW.role IN ('owner', 'admin', 'manager') THEN
      RAISE EXCEPTION 'Access denied: Only the store owner or platform admin can grant privileged roles (owner, admin, manager)';
    END IF;

    -- Managers can only invite as 'invited' status
    IF NEW.status IS DISTINCT FROM 'invited' THEN
      RAISE EXCEPTION 'Access denied: New members can only be created with status invited';
    END IF;

    -- Invitations cannot directly bind user_id; recipients must claim the invitation
    IF NEW.user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Access denied: Invitations cannot directly assign a user ID; recipients must claim the invitation';
    END IF;

    RETURN NEW;
  END IF;

  -- 6. UPDATE (Modifying Members)
  IF TG_OP = 'UPDATE' THEN
    -- A user claiming their own pending invite:
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

    -- Existing members modifying their own row:
    -- Only allowed to update their own display name; cannot change user_id, email, role, store_id, or status
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

    -- Manager modifying another member
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

  -- 7. DELETE (Removing Members)
  IF TG_OP = 'DELETE' THEN
    -- A member can leave the store (delete their own membership record)
    IF OLD.user_id = auth.uid() THEN
      RETURN OLD;
    END IF;

    -- Manager removing team member
    IF v_caller_member_role IN ('admin', 'manager') THEN
      IF OLD.role IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'Access denied: Managers cannot delete owner, admin, or manager members';
      END IF;
      -- Manager can delete staff member or pending staff invite
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

DROP TRIGGER IF EXISTS trg_protect_store_membership ON public.store_members;
CREATE TRIGGER trg_protect_store_membership
  BEFORE INSERT OR UPDATE OR DELETE ON public.store_members
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_store_membership();

-- Trigger: Strictly protect store ownership from unauthorized transfer
CREATE OR REPLACE FUNCTION public.protect_store_ownership()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Access denied: Store ID is immutable.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access denied: Only platform administrators can transfer store ownership.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_store_ownership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_store_ownership() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_store_ownership() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_store_ownership ON public.stores;
CREATE TRIGGER trg_protect_store_ownership
  BEFORE UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_store_ownership();

-- Stores RLS Policies
DROP POLICY IF EXISTS "Store owners can manage their stores" ON public.stores;
DROP POLICY IF EXISTS "Admins can view all stores" ON public.stores;
DROP POLICY IF EXISTS "Stores select policy" ON public.stores;
CREATE POLICY "Stores select policy"
  ON public.stores FOR SELECT
  TO authenticated
  USING (public.can_access_store(id));

DROP POLICY IF EXISTS "Stores insert policy" ON public.stores;
CREATE POLICY "Stores insert policy"
  ON public.stores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Stores update policy" ON public.stores;
CREATE POLICY "Stores update policy"
  ON public.stores FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id OR public.is_admin())
  WITH CHECK (auth.uid() = owner_id OR public.is_admin());

DROP POLICY IF EXISTS "Stores delete policy" ON public.stores;
CREATE POLICY "Stores delete policy"
  ON public.stores FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id OR public.is_admin());

-- Store Members RLS Policies
DROP POLICY IF EXISTS "Store members select policy" ON public.store_members;
CREATE POLICY "Store members select policy"
  ON public.store_members FOR SELECT
  TO authenticated
  USING (
    public.can_access_store(store_id)
    OR user_id = auth.uid()
    OR (
      user_id IS NULL
      AND LOWER(email) = LOWER((SELECT email FROM public.profiles WHERE id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Store members insert policy" ON public.store_members;
CREATE POLICY "Store members insert policy"
  ON public.store_members FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_store(store_id));

DROP POLICY IF EXISTS "Store members update policy" ON public.store_members;
CREATE POLICY "Store members update policy"
  ON public.store_members FOR UPDATE
  TO authenticated
  USING (
    public.can_manage_store(store_id)
    OR user_id = auth.uid()
    OR (
      user_id IS NULL
      AND LOWER(email) = LOWER((SELECT email FROM public.profiles WHERE id = auth.uid()))
    )
  )
  WITH CHECK (
    public.can_manage_store(store_id)
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Store members delete policy" ON public.store_members;
CREATE POLICY "Store members delete policy"
  ON public.store_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_members.store_id AND s.owner_id = auth.uid())
    OR public.is_admin()
    OR user_id = auth.uid()
    OR (
      public.can_manage_store(store_id)
      AND role = 'staff'
    )
  );

-- Trigger: Universal Tenant store_id Immutability Protection
CREATE OR REPLACE FUNCTION public.protect_tenant_store_id()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    RAISE EXCEPTION 'Access denied: Cannot reassign store_id or transfer records between stores.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_tenant_store_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_tenant_store_id() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_tenant_store_id() TO service_role;

-- Trigger: User Ownership Transfer Protection (subscribed_websites, support_tickets)
CREATE OR REPLACE FUNCTION public.protect_user_ownership()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access denied: Cannot transfer record ownership to another user.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_user_ownership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_user_ownership() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_user_ownership() TO service_role;


-- ==============================================================================
-- 5. Products Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  price NUMERIC NOT NULL DEFAULT 0,
  cost_price NUMERIC DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  description TEXT,
  sales_count INTEGER DEFAULT 0,
  rating NUMERIC DEFAULT 5.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store owners can manage their products" ON public.products;
DROP POLICY IF EXISTS "Products select policy" ON public.products;
CREATE POLICY "Products select policy"
  ON public.products FOR SELECT
  TO authenticated
  USING (public.can_access_store(store_id));

DROP POLICY IF EXISTS "Products insert policy" ON public.products;
CREATE POLICY "Products insert policy"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_store(store_id));

DROP POLICY IF EXISTS "Products update policy" ON public.products;
CREATE POLICY "Products update policy"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));

DROP POLICY IF EXISTS "Products delete policy" ON public.products;
CREATE POLICY "Products delete policy"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.can_manage_store(store_id));

DROP TRIGGER IF EXISTS trg_protect_products_store_id ON public.products;
CREATE TRIGGER trg_protect_products_store_id
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_tenant_store_id();


-- ==============================================================================
-- 6. Orders Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  order_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  total NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  delivery_charge NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('paid', 'pending', 'failed')),
  payment_method TEXT DEFAULT 'Cash on Delivery (COD)',
  courier_name TEXT,
  tracking_code TEXT,
  source TEXT DEFAULT 'Storefront',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store owners can manage their orders" ON public.orders;
DROP POLICY IF EXISTS "Orders select policy" ON public.orders;
CREATE POLICY "Orders select policy"
  ON public.orders FOR SELECT
  TO authenticated
  USING (public.can_access_store(store_id));

DROP POLICY IF EXISTS "Orders insert policy" ON public.orders;
CREATE POLICY "Orders insert policy"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_store(store_id));

DROP POLICY IF EXISTS "Orders update policy" ON public.orders;
CREATE POLICY "Orders update policy"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));

DROP POLICY IF EXISTS "Orders delete policy" ON public.orders;
CREATE POLICY "Orders delete policy"
  ON public.orders FOR DELETE
  TO authenticated
  USING (public.can_manage_store(store_id));

DROP TRIGGER IF EXISTS trg_protect_orders_store_id ON public.orders;
CREATE TRIGGER trg_protect_orders_store_id
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_tenant_store_id();


-- ==============================================================================
-- 7. Customers Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  city TEXT,
  orders_count INTEGER DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store owners can manage their customers" ON public.customers;
DROP POLICY IF EXISTS "Customers select policy" ON public.customers;
CREATE POLICY "Customers select policy"
  ON public.customers FOR SELECT
  TO authenticated
  USING (public.can_access_store(store_id));

DROP POLICY IF EXISTS "Customers insert policy" ON public.customers;
CREATE POLICY "Customers insert policy"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_store(store_id));

DROP POLICY IF EXISTS "Customers update policy" ON public.customers;
CREATE POLICY "Customers update policy"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));

DROP POLICY IF EXISTS "Customers delete policy" ON public.customers;
CREATE POLICY "Customers delete policy"
  ON public.customers FOR DELETE
  TO authenticated
  USING (public.can_manage_store(store_id));

DROP TRIGGER IF EXISTS trg_protect_customers_store_id ON public.customers;
CREATE TRIGGER trg_protect_customers_store_id
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_tenant_store_id();


-- ==============================================================================
-- 8. Subscribed Websites Table (Removed Misleading Defaults)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.subscribed_websites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  business_name TEXT NOT NULL,
  niche TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  full_domain TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'grace_period', 'suspended', 'cancelled')),
  plan_tier TEXT DEFAULT 'AMAAS Website Lite',
  monthly_fee NUMERIC DEFAULT 600,
  currency TEXT DEFAULT '৳',
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL,
  grace_period_end TIMESTAMPTZ NOT NULL,
  deployment_status TEXT DEFAULT 'deploying' CHECK (deployment_status IN ('deploying', 'ready', 'failed')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  resource_usage JSONB NOT NULL DEFAULT '{"pagesCount": 0, "storageUsedMb": 0, "bandwidthUsedGb": 0, "updatesThisMonth": 0}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.subscribed_websites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Website owners can manage their subscribed websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Admins can view and manage all subscribed websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Subscribed websites select policy" ON public.subscribed_websites;
CREATE POLICY "Subscribed websites select policy"
  ON public.subscribed_websites FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Subscribed websites insert policy" ON public.subscribed_websites;
CREATE POLICY "Subscribed websites insert policy"
  ON public.subscribed_websites FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      auth.uid() = user_id
      AND (store_id IS NULL OR public.can_manage_store(store_id))
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Subscribed websites update policy" ON public.subscribed_websites;
CREATE POLICY "Subscribed websites update policy"
  ON public.subscribed_websites FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR public.is_admin()
    OR (store_id IS NOT NULL AND public.can_manage_store(store_id))
  )
  WITH CHECK (
    auth.uid() = user_id 
    OR public.is_admin()
    OR (store_id IS NOT NULL AND public.can_manage_store(store_id))
  );

DROP POLICY IF EXISTS "Subscribed websites delete policy" ON public.subscribed_websites;
CREATE POLICY "Subscribed websites delete policy"
  ON public.subscribed_websites FOR DELETE
  TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.subscribed_websites FROM PUBLIC;
REVOKE ALL ON public.subscribed_websites FROM anon;
REVOKE ALL ON public.subscribed_websites FROM authenticated;
GRANT SELECT ON public.subscribed_websites TO authenticated;
GRANT UPDATE (business_name, niche, template_id, template_name, config) ON public.subscribed_websites TO authenticated;
GRANT INSERT (id, user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status, plan_tier, monthly_fee, config) ON public.subscribed_websites TO authenticated;
GRANT ALL ON public.subscribed_websites TO service_role;

DROP TRIGGER IF EXISTS trg_protect_subscribed_websites_user_id ON public.subscribed_websites;
CREATE TRIGGER trg_protect_subscribed_websites_user_id
  BEFORE UPDATE ON public.subscribed_websites
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_ownership();


-- ==============================================================================
-- 9. Inventory Movements Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  product_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('restock', 'sale', 'adjustment', 'damaged')),
  quantity_change INTEGER NOT NULL,
  new_stock INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store owners can manage their inventory logs" ON public.inventory_movements;
DROP POLICY IF EXISTS "Inventory logs select policy" ON public.inventory_movements;
DROP POLICY IF EXISTS "Inventory movements select policy" ON public.inventory_movements;
CREATE POLICY "Inventory movements select policy"
  ON public.inventory_movements FOR SELECT
  TO authenticated
  USING (public.can_access_store(store_id));

DROP POLICY IF EXISTS "Inventory logs insert policy" ON public.inventory_movements;
DROP POLICY IF EXISTS "Inventory movements insert policy" ON public.inventory_movements;
CREATE POLICY "Inventory movements insert policy"
  ON public.inventory_movements FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_store(store_id));

DROP POLICY IF EXISTS "Inventory logs update policy" ON public.inventory_movements;
DROP POLICY IF EXISTS "Inventory movements update policy" ON public.inventory_movements;
CREATE POLICY "Inventory movements update policy"
  ON public.inventory_movements FOR UPDATE
  TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));

DROP POLICY IF EXISTS "Inventory logs delete policy" ON public.inventory_movements;
DROP POLICY IF EXISTS "Inventory movements delete policy" ON public.inventory_movements;
CREATE POLICY "Inventory movements delete policy"
  ON public.inventory_movements FOR DELETE
  TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = inventory_movements.store_id AND s.owner_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_protect_inventory_movements_store_id ON public.inventory_movements;
CREATE TRIGGER trg_protect_inventory_movements_store_id
  BEFORE UPDATE ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_tenant_store_id();


-- ==============================================================================
-- 10. Support Tickets Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticket_number TEXT UNIQUE NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view and manage their support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Admins can manage all support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Support tickets select policy" ON public.support_tickets;
CREATE POLICY "Support tickets select policy"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Support tickets insert policy" ON public.support_tickets;
CREATE POLICY "Support tickets insert policy"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Support tickets update policy" ON public.support_tickets;
CREATE POLICY "Support tickets update policy"
  ON public.support_tickets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (
    (auth.uid() = user_id AND user_id = (SELECT st.user_id FROM public.support_tickets st WHERE st.id = support_tickets.id))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Support tickets delete policy" ON public.support_tickets;
CREATE POLICY "Support tickets delete policy"
  ON public.support_tickets FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP TRIGGER IF EXISTS trg_protect_support_tickets_user_id ON public.support_tickets;
CREATE TRIGGER trg_protect_support_tickets_user_id
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_ownership();


-- ==============================================================================
-- 11. Platform Admin Provisioning Procedure & Security Notice
-- ==============================================================================
-- CRITICAL SECURITY RULE:
-- Platform administrators can NEVER be provisioned through user metadata or
-- client-side profile inserts/updates. They must be provisioned through a direct,
-- trusted database administrator operation in the Supabase Dashboard SQL Editor
-- (as superuser / postgres) by explicitly matching the EXACT auth.users UUID:
--
-- EXAMPLE SAFE PROMOTION:
-- UPDATE public.profiles
-- SET role = 'admin', updated_at = NOW()
-- WHERE id = '<EXACT_CONFIRMED_AUTH_USER_UUID>'
--   AND email = 'confirmed-admin@example.com';
-- ==============================================================================

-- ==============================================================================
-- 9. Service Trials System (Independent 7-Day Free Trial For Every Service)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.service_trials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  service_category TEXT NOT NULL CHECK (service_category IN ('dashboard', 'ai_automation', 'website', 'landing_pages')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_service_trial UNIQUE (user_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_service_trials_user ON public.service_trials(user_id);
CREATE INDEX IF NOT EXISTS idx_service_trials_service ON public.service_trials(user_id, service_id);

ALTER TABLE public.service_trials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service trials select policy" ON public.service_trials;
CREATE POLICY "Service trials select policy"
  ON public.service_trials FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Service trials insert policy" ON public.service_trials;
CREATE POLICY "Service trials insert policy"
  ON public.service_trials FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND expires_at <= (NOW() + INTERVAL '7 days 5 minutes')
  );

DROP POLICY IF EXISTS "Service trials update policy" ON public.service_trials;
CREATE POLICY "Service trials update policy"
  ON public.service_trials FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Service trials delete policy" ON public.service_trials;
CREATE POLICY "Service trials delete policy"
  ON public.service_trials FOR DELETE
  TO authenticated
  USING (public.is_admin());

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_service_trial_invariants() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_service_trial_invariants() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_service_trial_invariants() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_service_trial ON public.service_trials;
CREATE TRIGGER trg_protect_service_trial
  BEFORE UPDATE ON public.service_trials
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_service_trial_invariants();

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
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

DROP POLICY IF EXISTS "Payment gateway configs select policy" ON public.payment_gateway_configs;
CREATE POLICY "Payment gateway configs select policy"
  ON public.payment_gateway_configs FOR SELECT
  TO authenticated
  USING (true);

-- Seed initial payment configs safely
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

-- 3. Atomic Stored Procedure: Admin Approve Payment Request (Hardened Targeting)
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

REVOKE ALL ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) TO authenticated, service_role;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.admin_reject_payment_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reject_payment_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_request(UUID, TEXT) TO authenticated, service_role;


-- ==============================================================================
-- GoAMAAS Migration: Hardened Multi-Tenant Subdomain Resolution & Publishing
-- File: supabase/migrations/20261017_public_website_resolution_and_publishing.sql
-- ==============================================================================

-- --------------------------------------------------------------------------------
-- 1. Prerequisite Checks: Validate required base tables, columns, and functions
-- --------------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT[];
  v_type_mismatch TEXT[];
BEGIN
  -- 1a. Verify public.subscribed_websites exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'subscribed_websites'
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: Table "public.subscribed_websites" does not exist. Run initial base schema migrations first.';
  END IF;

  -- 1b. Verify required base columns exist on public.subscribed_websites
  SELECT array_agg(col) INTO v_missing
  FROM unnest(ARRAY['id', 'user_id', 'subdomain', 'business_name', 'niche', 'status', 'deployment_status', 'created_at']) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'subscribed_websites' AND column_name = col
  );

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: Missing required base columns in "public.subscribed_websites": %', array_to_string(v_missing, ', ');
  END IF;

  -- 1c. Verify column data types of existing columns to prevent silent schema corruption
  SELECT array_agg(format('%s (expected %s, found %s)', column_name, expected_type, data_type))
  INTO v_type_mismatch
  FROM (
    SELECT column_name, data_type,
      CASE 
        WHEN column_name IN ('id', 'user_id', 'store_id') THEN 'uuid'
        WHEN column_name IN ('subdomain', 'full_domain', 'business_name', 'niche', 'template_id', 'template_name', 'status', 'deployment_status', 'payment_status', 'plan_tier', 'currency') THEN 'text/character varying'
        WHEN column_name = 'config' THEN 'json/jsonb'
        WHEN column_name IN ('created_at', 'updated_at', 'subscribed_at', 'current_period_end', 'grace_period_end') THEN 'timestamp'
        ELSE NULL
      END AS expected_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscribed_websites'
  ) col_check
  WHERE expected_type IS NOT NULL
    AND NOT (
      (expected_type = 'uuid' AND data_type = 'uuid') OR
      (expected_type = 'text/character varying' AND data_type IN ('text', 'character varying', 'character')) OR
      (expected_type = 'json/jsonb' AND data_type IN ('json', 'jsonb')) OR
      (expected_type = 'timestamp' AND data_type IN ('timestamp with time zone', 'timestamp without time zone'))
    );

  IF v_type_mismatch IS NOT NULL AND array_length(v_type_mismatch, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: Column type mismatch on "public.subscribed_websites": %', array_to_string(v_type_mismatch, '; ');
  END IF;

  -- 1d. Verify public.is_admin() function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: Function "public.is_admin()" does not exist. Apply 20261010_security_and_rls_hardening.sql first.';
  END IF;
END $$;

-- --------------------------------------------------------------------------------
-- 1.5 Tenant Helper Functions: can_manage_store & can_access_store
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_store(p_store_id UUID)
RETURNS boolean AS $$
DECLARE
  v_has_stores boolean;
  v_can_manage boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stores'
  ) INTO v_has_stores;

  IF NOT v_has_stores THEN
    RETURN false;
  END IF;

  EXECUTE '
    SELECT EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = $1
        AND (
          s.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.store_members sm
            WHERE sm.store_id = $1
              AND sm.user_id = auth.uid()
              AND sm.status = ''active''
              AND sm.role IN (''owner'', ''admin'', ''manager'')
          )
        )
    )' INTO v_can_manage USING p_store_id;

  RETURN COALESCE(v_can_manage, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.can_manage_store(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_store(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_store(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_store(p_store_id UUID)
RETURNS boolean AS $$
DECLARE
  v_has_stores boolean;
  v_can_access boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stores'
  ) INTO v_has_stores;

  IF NOT v_has_stores THEN
    RETURN false;
  END IF;

  EXECUTE '
    SELECT EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = $1
        AND (
          s.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.store_members sm
            WHERE sm.store_id = $1
              AND sm.user_id = auth.uid()
              AND sm.status = ''active''
          )
        )
    )' INTO v_can_access USING p_store_id;

  RETURN COALESCE(v_can_access, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.can_access_store(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_store(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_store(UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 2. Schema Upgrades: Safely add columns, set defaults, and update constraints
-- --------------------------------------------------------------------------------
ALTER TABLE public.subscribed_websites 
  ADD COLUMN IF NOT EXISTS store_id UUID,
  ADD COLUMN IF NOT EXISTS payment_status TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS full_domain TEXT,
  ADD COLUMN IF NOT EXISTS template_id TEXT DEFAULT 'tpl-modern-business',
  ADD COLUMN IF NOT EXISTS template_name TEXT DEFAULT 'Modern Executive',
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  ADD COLUMN IF NOT EXISTS grace_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '35 days'),
  ADD COLUMN IF NOT EXISTS resource_usage JSONB DEFAULT '{"storage_mb": 0, "bandwidth_mb": 0, "visits": 0}'::jsonb,
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

-- Safely drop legacy constraints so data normalization runs without check violations
ALTER TABLE public.subscribed_websites 
  DROP CONSTRAINT IF EXISTS chk_subscribed_websites_payment_status,
  DROP CONSTRAINT IF EXISTS subscribed_websites_deployment_status_check,
  DROP CONSTRAINT IF EXISTS chk_subscribed_websites_deployment_status,
  DROP CONSTRAINT IF EXISTS subscribed_websites_status_check,
  DROP CONSTRAINT IF EXISTS chk_subscribed_websites_status;

-- Set resilient defaults for columns if they lack defaults
ALTER TABLE public.subscribed_websites 
  ALTER COLUMN full_domain DROP NOT NULL,
  ALTER COLUMN full_domain SET DEFAULT '',
  ALTER COLUMN template_id SET DEFAULT 'tpl-modern-business',
  ALTER COLUMN template_name SET DEFAULT 'Modern Executive',
  ALTER COLUMN current_period_end SET DEFAULT (NOW() + INTERVAL '30 days'),
  ALTER COLUMN grace_period_end SET DEFAULT (NOW() + INTERVAL '35 days');

-- Reapply updated deployment_status constraint supporting 'live' and 'suspended'
ALTER TABLE public.subscribed_websites 
  ADD CONSTRAINT chk_subscribed_websites_deployment_status 
  CHECK (deployment_status IN ('deploying', 'ready', 'failed', 'live', 'maintenance', 'suspended', 'provisioning'));

-- Reapply updated status constraint
ALTER TABLE public.subscribed_websites 
  ADD CONSTRAINT chk_subscribed_websites_status 
  CHECK (status IN ('active', 'grace_period', 'past_due', 'suspended', 'cancelled', 'draft'));

-- --------------------------------------------------------------------------------
-- 3. Evidence-Based Payment Backfill, Normalization & Safe Audit Review Flagging
-- --------------------------------------------------------------------------------
-- Drop existing triggers before backfill so execution does not require any custom GUCs.
DROP TRIGGER IF EXISTS trg_protect_subscribed_website_security ON public.subscribed_websites;
DROP TRIGGER IF EXISTS trg_protect_subscribed_website_updates ON public.subscribed_websites;
DROP TRIGGER IF EXISTS trg_protect_subscribed_websites_user_id ON public.subscribed_websites;

DO $$
DECLARE
  v_has_payment_requests BOOLEAN;
  v_has_payment_cols BOOLEAN := FALSE;
BEGIN
  -- 3a. Safely check if payment_requests table and its required columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'payment_requests'
  ) INTO v_has_payment_requests;

  IF v_has_payment_requests THEN
    SELECT (
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'service_id') AND
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'service_type') AND
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'status')
    ) INTO v_has_payment_cols;
  END IF;

  -- 3b. Normalize legacy / non-standard payment status strings before applying new CHECK constraint
  IF v_has_payment_requests AND v_has_payment_cols THEN
    EXECUTE '
      UPDATE public.subscribed_websites sw
      SET payment_status = ''paid''
      WHERE sw.payment_status IN (''completed'', ''success'')
        AND EXISTS (
          SELECT 1 FROM public.payment_requests pr
          WHERE pr.status = ''approved''
            AND pr.service_type IN (''website_subscription'', ''website_package'')
            AND pr.service_id = sw.id::TEXT
        )
    ';
  END IF;

  UPDATE public.subscribed_websites
  SET payment_status = 'pending_review'
  WHERE payment_status IN ('completed', 'success');

  UPDATE public.subscribed_websites
  SET payment_status = 'failed'
  WHERE payment_status IN ('cancelled', 'canceled');

  -- 3c. Reconcile verified payments:
  IF v_has_payment_requests AND v_has_payment_cols THEN
    EXECUTE '
      UPDATE public.subscribed_websites sw
      SET payment_status = ''paid''
      WHERE (sw.payment_status IS NULL OR sw.payment_status IN (''pending'', ''pending_review''))
        AND EXISTS (
          SELECT 1 FROM public.payment_requests pr
          WHERE pr.status = ''approved''
            AND pr.service_type IN (''website_subscription'', ''website_package'')
            AND pr.service_id = sw.id::TEXT
        )
    ';
  END IF;

  -- 3d. Flag unverified active/live records for manual review:
  IF v_has_payment_requests AND v_has_payment_cols THEN
    EXECUTE '
      UPDATE public.subscribed_websites sw
      SET 
        payment_status = ''pending_review'',
        config = CASE 
          WHEN config IS NULL OR config->''paymentAuditNotice'' IS NULL OR config->''paymentAuditNotice'' = ''null''::jsonb THEN
            jsonb_set(
              COALESCE(config, ''{}''::jsonb),
              ''{paymentAuditNotice}'',
              jsonb_build_object(
                ''flaggedAt'', NOW(),
                ''previousStatus'', COALESCE(sw.payment_status, ''null''),
                ''reason'', ''Active/live website without verified approved payment record reconciled to pending_review for manual audit''
              )
            )
          ELSE config
        END
      WHERE (sw.payment_status IS NULL OR sw.payment_status IN (''pending'', ''pending_review''))
        AND sw.deployment_status = ''live''
        AND NOT EXISTS (
          SELECT 1 FROM public.payment_requests pr
          WHERE pr.status = ''approved''
            AND pr.service_type IN (''website_subscription'', ''website_package'')
            AND pr.service_id = sw.id::TEXT
        )
    ';
  ELSE
    UPDATE public.subscribed_websites sw
    SET 
      payment_status = 'pending_review',
      config = CASE 
        WHEN config IS NULL OR config->'paymentAuditNotice' IS NULL OR config->'paymentAuditNotice' = 'null'::jsonb THEN
          jsonb_set(
            COALESCE(config, '{}'::jsonb),
            '{paymentAuditNotice}',
            jsonb_build_object(
              'flaggedAt', NOW(),
              'previousStatus', COALESCE(sw.payment_status, 'null'),
              'reason', 'Active/live website without verified approved payment record reconciled to pending_review for manual audit'
            )
          )
        ELSE config
      END
    WHERE (sw.payment_status IS NULL OR sw.payment_status IN ('pending', 'pending_review'))
      AND sw.deployment_status = 'live';
  END IF;

  -- 3e. Normalize any remaining NULL or unexpected payment statuses to 'pending'
  UPDATE public.subscribed_websites
  SET payment_status = 'pending'
  WHERE payment_status IS NULL 
     OR payment_status NOT IN ('pending', 'paid', 'failed', 'refunded', 'pending_review');

END $$;

-- 3f. Enforce NOT NULL and final CHECK constraint on payment_status
ALTER TABLE public.subscribed_websites 
  ALTER COLUMN payment_status SET DEFAULT 'pending',
  ALTER COLUMN payment_status SET NOT NULL;

ALTER TABLE public.subscribed_websites 
  ADD CONSTRAINT chk_subscribed_websites_payment_status 
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'pending_review'));

-- --------------------------------------------------------------------------------
-- 4. High-Performance Composite Indexes for Multi-Tenant Lookups & Security
-- --------------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_subscribed_websites_subdomain;
DROP INDEX IF EXISTS idx_subscribed_websites_subdomain_clean;
DROP INDEX IF EXISTS idx_subscribed_websites_public_lookup;
DROP INDEX IF EXISTS idx_subscribed_websites_subdomain_lower;
DROP INDEX IF EXISTS idx_subscribed_websites_lookup_live;
DROP INDEX IF EXISTS idx_subscribed_websites_user_tenant;
DROP INDEX IF EXISTS idx_subscribed_websites_store_tenant;
DROP INDEX IF EXISTS idx_subscribed_websites_payment_status;

-- Subdomain duplicate check guard before applying unique index
DO $$
DECLARE
  v_duplicate_subdomains TEXT[];
BEGIN
  SELECT array_agg(sub) INTO v_duplicate_subdomains
  FROM (
    SELECT lower(trim(subdomain)) AS sub, count(*) 
    FROM public.subscribed_websites 
    GROUP BY lower(trim(subdomain)) 
    HAVING count(*) > 1
  ) t;

  IF v_duplicate_subdomains IS NOT NULL AND array_length(v_duplicate_subdomains, 1) > 0 THEN
    RAISE EXCEPTION E'Migration aborted: Duplicate subdomains detected in public.subscribed_websites.
Subdomains: %.
Resolve subdomain collisions manually before applying functional unique index.', array_to_string(v_duplicate_subdomains, ', ');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribed_websites_subdomain_lower 
  ON public.subscribed_websites (lower(trim(subdomain)));

CREATE INDEX IF NOT EXISTS idx_subscribed_websites_lookup_live 
  ON public.subscribed_websites (lower(trim(subdomain)))
  WHERE deployment_status = 'live' AND payment_status = 'paid' AND status IN ('active', 'grace_period');

CREATE INDEX IF NOT EXISTS idx_subscribed_websites_user_tenant 
  ON public.subscribed_websites (user_id, status);

CREATE INDEX IF NOT EXISTS idx_subscribed_websites_store_tenant 
  ON public.subscribed_websites (store_id)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscribed_websites_payment_status 
  ON public.subscribed_websites (payment_status, status);

-- --------------------------------------------------------------------------------
-- 5. Audited Row Level Security (RLS) & Least-Privilege Grants on public.subscribed_websites
-- --------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'subscribed_websites'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.subscribed_websites', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Public can view published websites by subdomain" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Allow public select for live websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Public storefront access" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Anon select published websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Anyone can view websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Website owners can manage their subscribed websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Admins can view and manage all subscribed websites" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Subscribed websites select policy" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Subscribed websites insert policy" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Subscribed websites update policy" ON public.subscribed_websites;
DROP POLICY IF EXISTS "Subscribed websites delete policy" ON public.subscribed_websites;

ALTER TABLE public.subscribed_websites ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Authenticated tenant isolation (record owner, authorized store member/owner, or platform admin)
CREATE POLICY "Subscribed websites select policy"
  ON public.subscribed_websites FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR public.is_admin()
    OR (
      store_id IS NOT NULL AND public.can_access_store(store_id)
    )
  );

-- 2. INSERT: Authenticated users can only insert records for their own user_id and stores they manage,
-- and CANNOT create records directly with payment_status = 'paid' or deployment_status = 'live'
CREATE POLICY "Subscribed websites insert policy"
  ON public.subscribed_websites FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      auth.uid() = user_id
      AND (
        store_id IS NULL OR public.can_manage_store(store_id)
      )
      AND COALESCE(payment_status, 'pending') IN ('pending', 'pending_review')
      AND COALESCE(deployment_status, 'deploying') IN ('deploying', 'ready', 'provisioning', 'draft', 'failed')
    )
    OR public.is_admin()
  );

-- 3. UPDATE: Record owner, authorized store manager, or platform admin can update their own row
CREATE POLICY "Subscribed websites update policy"
  ON public.subscribed_websites FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR public.is_admin()
    OR (
      store_id IS NOT NULL AND public.can_manage_store(store_id)
    )
  )
  WITH CHECK (
    auth.uid() = user_id 
    OR public.is_admin()
    OR (
      store_id IS NOT NULL AND public.can_manage_store(store_id)
    )
  );

-- 4. DELETE: Strictly restricted to platform administrators. Ordinary merchants CANNOT delete records directly.
CREATE POLICY "Subscribed websites delete policy"
  ON public.subscribed_websites FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- --------------------------------------------------------------------------------
-- 5.1 Least-Privilege Table & Column Grants
-- --------------------------------------------------------------------------------
REVOKE ALL ON public.subscribed_websites FROM PUBLIC;
REVOKE ALL ON public.subscribed_websites FROM anon;
REVOKE ALL ON public.subscribed_websites FROM authenticated;

-- Grant SELECT to authenticated for RLS-filtered tenant queries
GRANT SELECT ON public.subscribed_websites TO authenticated;

-- Column-level least-privilege UPDATE grant: merchants can ONLY update legitimate editor fields
GRANT UPDATE (business_name, niche, template_id, template_name, config) 
  ON public.subscribed_websites TO authenticated;

-- Column-level least-privilege INSERT grant: merchants can insert draft metadata with tenant validation
GRANT INSERT (id, user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status, config) 
  ON public.subscribed_websites TO authenticated;

-- Full administrative access strictly reserved for service_role
GRANT ALL ON public.subscribed_websites TO service_role;

-- --------------------------------------------------------------------------------
-- 5.2 Comprehensive Security Trigger: Defense-in-Depth for Invariants & Hygiene
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_subscribed_website_security()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  v_is_admin := public.is_admin();

  -- =========================================================================
  -- A. DELETE CHECKS
  -- =========================================================================
  IF TG_OP = 'DELETE' THEN
    IF NOT v_is_admin AND auth.role() != 'service_role' THEN
      RAISE EXCEPTION 'Access denied: Direct deletion of subscribed website records is not permitted. Use legitimate cancellation or contact platform support.';
    END IF;
    RETURN OLD;
  END IF;

  -- =========================================================================
  -- B. INSERT CHECKS
  -- =========================================================================
  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_admin AND auth.role() != 'service_role' THEN
      -- Tenant Isolation: Cannot create a website belonging to another user
      IF NEW.user_id IS NULL OR NEW.user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: Website must be created with your own authenticated user_id.';
      END IF;

      -- Store Ownership & Authorization:
      IF NEW.store_id IS NOT NULL THEN
        IF NOT public.can_manage_store(NEW.store_id) THEN
          RAISE EXCEPTION 'Access denied: You are not authorized to associate a website with store %.', NEW.store_id;
        END IF;
      END IF;

      -- Payment Bypass Prevention: Cannot create a website directly marked as paid
      IF NEW.payment_status = 'paid' THEN
        RAISE EXCEPTION 'Access denied: New websites cannot be created with payment_status = ''paid''. Payment verification is required.';
      END IF;

      -- Publishing Bypass Prevention: Cannot create a website directly marked as live
      IF NEW.deployment_status = 'live' THEN
        RAISE EXCEPTION 'Access denied: New websites cannot be created with deployment_status = ''live''. Websites must be published via publish_client_website() after verified payment.';
      END IF;

      -- Default safe starting states for merchant drafts
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

    -- Subdomain hygiene
    IF NEW.subdomain IS NOT NULL THEN
      NEW.subdomain := lower(trim(NEW.subdomain));
      IF NEW.full_domain IS NULL OR NEW.full_domain = '' THEN
        NEW.full_domain := NEW.subdomain || '.amaas.xyz';
      END IF;
    END IF;

    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- =========================================================================
  -- C. UPDATE CHECKS
  -- =========================================================================
  IF TG_OP = 'UPDATE' THEN
    IF v_is_admin OR auth.role() = 'service_role' THEN
      NEW.updated_at := NOW();
      RETURN NEW;
    END IF;

    -- 1. Tenant isolation / ownership immutability: user_id and store_id cannot be transferred
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Access denied: Website ownership cannot be transferred to another user.';
    END IF;

    IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
      RAISE EXCEPTION 'Access denied: Reassigning website store_id is not permitted.';
    END IF;

    -- 2. Payment status protection: merchants cannot bypass payment by modifying payment_status directly
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'Access denied: payment_status cannot be modified directly. Payment verification is required.';
    END IF;

    -- 3. Subscription status transition protection:
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

    -- 4. Universal Live Invariants
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

    -- 5. Subdomain modification protection:
    IF NEW.subdomain IS DISTINCT FROM OLD.subdomain AND OLD.deployment_status = 'live' THEN
      RAISE EXCEPTION 'Access denied: Subdomain cannot be changed directly while website is live. Unpublish website first.';
    END IF;

    -- Normalize subdomain and sync full_domain if subdomain changed
    IF NEW.subdomain IS DISTINCT FROM OLD.subdomain AND NEW.subdomain IS NOT NULL THEN
      NEW.subdomain := lower(trim(NEW.subdomain));
      IF NEW.full_domain IS NULL OR NEW.full_domain = '' OR NEW.full_domain = OLD.subdomain || '.amaas.xyz' THEN
        NEW.full_domain := NEW.subdomain || '.amaas.xyz';
      END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_subscribed_website_security() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_subscribed_website_security() FROM anon;
GRANT EXECUTE ON FUNCTION public.protect_subscribed_website_security() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_protect_subscribed_websites_user_id ON public.subscribed_websites;
DROP TRIGGER IF EXISTS trg_protect_subscribed_website_updates ON public.subscribed_websites;
DROP TRIGGER IF EXISTS trg_protect_subscribed_website_security ON public.subscribed_websites;

CREATE TRIGGER trg_protect_subscribed_website_security
  BEFORE INSERT OR UPDATE OR DELETE ON public.subscribed_websites
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_subscribed_website_security();

-- --------------------------------------------------------------------------------
-- 5.3 Stored Procedure: Safe Subdomain Availability Check (Global Multi-Tenant Check)
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_subdomain_availability(p_subdomain TEXT)
RETURNS JSONB AS $$
DECLARE
  v_clean TEXT;
  v_taken BOOLEAN;
BEGIN
  v_clean := lower(trim(COALESCE(p_subdomain, '')));
  IF length(v_clean) < 3 OR length(v_clean) > 30 THEN
    RETURN jsonb_build_object('available', false, 'code', 'INVALID_LENGTH', 'reason', 'Subdomain must be between 3 and 30 characters long.');
  END IF;

  IF v_clean !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RETURN jsonb_build_object('available', false, 'code', 'INVALID_FORMAT', 'reason', 'Subdomain can only contain lowercase letters, numbers, and hyphens (cannot start or end with a hyphen).');
  END IF;

  IF v_clean IN (
    'admin', 'api', 'app', 'billing', 'dashboard', 'amaas', 'auth', 'support',
    'staging', 'test', 'demo', 'www', 'root', 'mail', 'ns1', 'ns2', 'official',
    'pay', 'payments', 'payment', 'cdn', 'webhook', 'webhooks'
  ) THEN
    RETURN jsonb_build_object('available', false, 'code', 'RESERVED', 'reason', 'This subdomain is reserved by the AMAAS platform.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.subscribed_websites
    WHERE lower(trim(subdomain)) = v_clean
  ) INTO v_taken;

  IF v_taken THEN
    RETURN jsonb_build_object('available', false, 'code', 'TAKEN', 'reason', 'This subdomain is already registered by another merchant.');
  END IF;

  RETURN jsonb_build_object('available', true, 'code', 'AVAILABLE');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.check_subdomain_availability(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_subdomain_availability(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_subdomain_availability(TEXT) TO anon, authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 6. Stored Procedure: Secure Public Subdomain Resolution
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_published_website_by_subdomain(p_subdomain TEXT)
RETURNS JSONB AS $$
DECLARE
  v_clean_subdomain TEXT;
  v_site RECORD;
BEGIN
  v_clean_subdomain := lower(trim(COALESCE(p_subdomain, '')));

  IF length(v_clean_subdomain) < 2 OR length(v_clean_subdomain) > 63 OR v_clean_subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' OR v_clean_subdomain LIKE 'xn--%' THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'Invalid subdomain requested.'
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
  WHERE lower(trim(subdomain)) = v_clean_subdomain
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.get_published_website_by_subdomain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_website_by_subdomain(TEXT) TO anon, authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 7. Stored Procedure: 1-Click Publish With Strict Authorization & Concurrency Safety
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_client_website(p_website_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_clean_subdomain TEXT;
  v_site RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Authentication required to publish a website.';
  END IF;

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

  IF v_site.user_id IS NULL THEN
    IF NOT public.is_admin() AND auth.role() != 'service_role' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'ORPHANED_RECORD',
        'message', 'Security exception: Website has no registered owner. Only platform administrators can publish or claim this website.'
      );
    END IF;
  ELSIF v_site.user_id != v_user_id AND NOT public.is_admin() AND auth.role() != 'service_role' THEN
    IF v_site.store_id IS NULL OR NOT public.can_manage_store(v_site.store_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'FORBIDDEN',
        'message', 'Unauthorized: You do not have permission to publish this website.'
      );
    END IF;
  END IF;

  v_clean_subdomain := lower(trim(COALESCE(v_site.subdomain, '')));
  IF length(v_clean_subdomain) < 2 OR length(v_clean_subdomain) > 63 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_SUBDOMAIN_LENGTH',
      'message', 'Subdomain must be between 2 and 63 characters in length.'
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

  IF EXISTS (
    SELECT 1 FROM public.subscribed_websites
    WHERE lower(trim(subdomain)) = v_clean_subdomain
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
    'message', 'Website published successfully! Accessible at https://' || v_site.subdomain || '.amaas.xyz',
    'subdomain', v_site.subdomain,
    'fullDomainUrl', v_site.subdomain || '.amaas.xyz'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.publish_client_website(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_client_website(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_client_website(UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 8. Stored Procedure: Unpublish Website (Maintenance / Suspension Control)
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unpublish_client_website(p_website_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_site RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Authentication required to unpublish a website.';
  END IF;

  SELECT id, user_id, store_id, subdomain
  INTO v_site
  FROM public.subscribed_websites
  WHERE id = p_website_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Website record not found.');
  END IF;

  IF v_site.user_id IS NULL THEN
    IF NOT public.is_admin() AND auth.role() != 'service_role' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Security exception: Website has no registered owner.');
    END IF;
  ELSIF v_site.user_id != v_user_id AND NOT public.is_admin() AND auth.role() != 'service_role' THEN
    IF v_site.store_id IS NULL OR NOT public.can_manage_store(v_site.store_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: You do not have permission to manage this website.');
    END IF;
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.unpublish_client_website(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unpublish_client_website(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.unpublish_client_website(UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 9. Stored Procedure: Legitimate Subscription Cancellation (Audit Preserving)
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_client_website_subscription(p_website_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN;
  v_site RECORD;
BEGIN
  v_caller_id := auth.uid();
  v_is_admin := public.is_admin();

  IF v_caller_id IS NULL AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Authentication required: You must be signed in to cancel a subscription.';
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

  IF NOT v_is_admin AND auth.role() != 'service_role' THEN
    IF v_site.user_id != v_caller_id AND (
      v_site.store_id IS NULL OR NOT public.can_manage_store(v_site.store_id)
    ) THEN
      RAISE EXCEPTION 'Access denied: You do not have permission to cancel this website subscription.';
    END IF;
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.cancel_client_website_subscription(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_client_website_subscription(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_client_website_subscription(UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 10. Stored Procedure: Authorized Administrative Website Deletion
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_subscribed_website(p_website_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_deleted RECORD;
BEGIN
  v_is_admin := public.is_admin();
  IF NOT v_is_admin AND auth.role() != 'service_role' THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.admin_delete_subscribed_website(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_subscribed_website(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_subscribed_website(UUID) TO authenticated, service_role;


-- ==============================================================================
-- GoAMAAS Migration: Payment Requests Ownership Enforcement & Reference Uniqueness
-- File: supabase/migrations/20261024_harden_payment_requests_ownership_and_uniqueness.sql
-- ==============================================================================

-- --------------------------------------------------------------------------------
-- 1. Prerequisite Validation: Verify required tables, columns, and security helpers
-- --------------------------------------------------------------------------------
DO $$
DECLARE
  v_missing_roles TEXT[];
  v_missing_pr_cols TEXT[];
  v_missing_sw_cols TEXT[];
  v_missing_stores_cols TEXT[];
  v_missing_sm_cols TEXT[];
  v_missing_profiles_cols TEXT[];
  v_unexpected_rpc_overloads TEXT[];
BEGIN
  SELECT array_agg(req_role ORDER BY req_role) INTO v_missing_roles
  FROM pg_catalog.unnest(ARRAY['anon', 'authenticated', 'service_role']) AS req_role
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = req_role
  );

  IF v_missing_roles IS NOT NULL AND array_length(v_missing_roles, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: Required database roles do not exist: %', array_to_string(v_missing_roles, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
      AND p.proname = 'uid'
      AND pg_catalog.oidvectortypes(p.proargtypes) = ''
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
      AND p.proname = 'jwt'
      AND pg_catalog.oidvectortypes(p.proargtypes) = ''
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: Required Supabase auth helpers "auth.uid()" and "auth.jwt()" do not exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_requests'
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: Table "public.payment_requests" does not exist. Apply 20261015_complete_saas_website_builder_and_payments.sql first.';
  END IF;

  SELECT array_agg(col ORDER BY col) INTO v_missing_pr_cols
  FROM pg_catalog.unnest(ARRAY[
    'id', 'user_id', 'store_id', 'customer_name', 'customer_phone', 'customer_email',
    'service_type', 'service_id', 'service_name', 'plan_tier',
    'amount', 'currency', 'payment_method',
    'transaction_id', 'sender_number', 'bank_name', 'bank_account_name', 'bank_reference',
    'status', 'admin_notes', 'reviewed_by', 'reviewed_at', 'created_at', 'updated_at'
  ]) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = col
  );

  IF v_missing_pr_cols IS NOT NULL AND array_length(v_missing_pr_cols, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: "public.payment_requests" is missing required columns: %', array_to_string(v_missing_pr_cols, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscribed_websites'
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: Table "public.subscribed_websites" does not exist.';
  END IF;

  SELECT array_agg(col ORDER BY col) INTO v_missing_sw_cols
  FROM pg_catalog.unnest(ARRAY[
    'id', 'user_id', 'store_id', 'status', 'payment_status',
    'current_period_end', 'grace_period_end', 'updated_at'
  ]) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscribed_websites' AND column_name = col
  );

  IF v_missing_sw_cols IS NOT NULL AND array_length(v_missing_sw_cols, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: "public.subscribed_websites" is missing required columns (ensure 20261017_public_website_resolution_and_publishing.sql is applied first): %',
      array_to_string(v_missing_sw_cols, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stores'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'store_members'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: Required tenant tables ("public.stores", "public.store_members", "public.profiles") do not exist. Apply 20261010_security_and_rls_hardening.sql first.';
  END IF;

  SELECT array_agg(col ORDER BY col) INTO v_missing_stores_cols
  FROM pg_catalog.unnest(ARRAY['id', 'owner_id']) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = col
  );

  IF v_missing_stores_cols IS NOT NULL AND array_length(v_missing_stores_cols, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: "public.stores" is missing required columns: %', array_to_string(v_missing_stores_cols, ', ');
  END IF;

  SELECT array_agg(col ORDER BY col) INTO v_missing_sm_cols
  FROM pg_catalog.unnest(ARRAY['store_id', 'user_id', 'status', 'role']) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_members' AND column_name = col
  );

  IF v_missing_sm_cols IS NOT NULL AND array_length(v_missing_sm_cols, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: "public.store_members" is missing required columns: %', array_to_string(v_missing_sm_cols, ', ');
  END IF;

  SELECT array_agg(col ORDER BY col) INTO v_missing_profiles_cols
  FROM pg_catalog.unnest(ARRAY['id', 'role']) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = col
  );

  IF v_missing_profiles_cols IS NOT NULL AND array_length(v_missing_profiles_cols, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: "public.profiles" is missing required columns: %', array_to_string(v_missing_profiles_cols, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_approve_payment_request'
      AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text'
      AND p.prosecdef = true
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_reject_payment_request'
      AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text'
      AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'Prerequisite check failed: SECURITY DEFINER RPCs "public.admin_approve_payment_request(uuid, text)" and "public.admin_reject_payment_request(uuid, text)" must exist before applying 20261024.';
  END IF;

  SELECT array_agg(
    format('public.%I(%s)', p.proname, pg_catalog.oidvectortypes(p.proargtypes))
    ORDER BY p.proname, pg_catalog.oidvectortypes(p.proargtypes)
  ) INTO v_unexpected_rpc_overloads
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('admin_approve_payment_request', 'admin_reject_payment_request')
    AND pg_catalog.oidvectortypes(p.proargtypes) <> 'uuid, text';

  IF v_unexpected_rpc_overloads IS NOT NULL AND array_length(v_unexpected_rpc_overloads, 1) > 0 THEN
    RAISE EXCEPTION 'Prerequisite check failed: Unexpected legacy RPC overload(s) found that could shadow hardened review RPCs: %. Drop obsolete overloads before applying 20261024.',
      array_to_string(v_unexpected_rpc_overloads, ', ');
  END IF;
END $$;

-- --------------------------------------------------------------------------------
-- 2. Read-Only Preflight Duplicate Inspection (Never Mutates or Deletes Rows)
-- --------------------------------------------------------------------------------
DO $$
DECLARE
  v_dup_trx TEXT[];
  v_dup_bank_ref TEXT[];
  v_dup_pending_service TEXT[];
BEGIN
  -- 2a. Check for duplicate normalized transaction_id across pending/approved rows
  SELECT array_agg(norm_trx || ' (' || cnt || ' rows)' ORDER BY norm_trx)
  INTO v_dup_trx
  FROM (
    SELECT upper(btrim(transaction_id, E' \t\n\r')) AS norm_trx, count(*) AS cnt
    FROM public.payment_requests
    WHERE status IN ('pending', 'approved')
      AND transaction_id IS NOT NULL
      AND btrim(transaction_id, E' \t\n\r') <> ''
    GROUP BY upper(btrim(transaction_id, E' \t\n\r'))
    HAVING count(*) > 1
  ) dup_t;

  IF v_dup_trx IS NOT NULL AND array_length(v_dup_trx, 1) > 0 THEN
    RAISE EXCEPTION E'Migration aborted: Duplicate active/approved transaction_id values detected in public.payment_requests: %.\nResolve collisions manually (e.g., reject duplicate pending requests via admin_reject_payment_request) before applying unique index.',
      array_to_string(v_dup_trx, ', ');
  END IF;

  -- 2b. Check for duplicate normalized bank_reference across pending/approved rows
  SELECT array_agg(norm_ref || ' (' || cnt || ' rows)' ORDER BY norm_ref)
  INTO v_dup_bank_ref
  FROM (
    SELECT upper(btrim(bank_reference, E' \t\n\r')) AS norm_ref, count(*) AS cnt
    FROM public.payment_requests
    WHERE status IN ('pending', 'approved')
      AND bank_reference IS NOT NULL
      AND btrim(bank_reference, E' \t\n\r') <> ''
    GROUP BY upper(btrim(bank_reference, E' \t\n\r'))
    HAVING count(*) > 1
  ) dup_b;

  IF v_dup_bank_ref IS NOT NULL AND array_length(v_dup_bank_ref, 1) > 0 THEN
    RAISE EXCEPTION E'Migration aborted: Duplicate active/approved bank_reference values detected in public.payment_requests: %.\nResolve collisions manually (e.g., reject duplicate pending requests via admin_reject_payment_request) before applying unique index.',
      array_to_string(v_dup_bank_ref, ', ');
  END IF;

  -- 2c. Check for multiple pending requests targeting the same normalized (user_id, service_type, service_id)
  SELECT array_agg(
    user_id::TEXT || ':' || service_type || ':' || norm_service_id || ' (' || cnt || ' rows)'
    ORDER BY user_id::TEXT, service_type, norm_service_id
  )
  INTO v_dup_pending_service
  FROM (
    SELECT user_id, service_type, lower(btrim(service_id, E' \t\n\r')) AS norm_service_id, count(*) AS cnt
    FROM public.payment_requests
    WHERE status = 'pending'
      AND service_id IS NOT NULL
      AND btrim(service_id, E' \t\n\r') <> ''
    GROUP BY user_id, service_type, lower(btrim(service_id, E' \t\n\r'))
    HAVING count(*) > 1
  ) dup_s;

  IF v_dup_pending_service IS NOT NULL AND array_length(v_dup_pending_service, 1) > 0 THEN
    RAISE EXCEPTION E'Migration aborted: Multiple pending payment_requests detected for the same (user_id, service_type, service_id): %.\nResolve duplicate pending requests manually before applying unique index.',
      array_to_string(v_dup_pending_service, ', ');
  END IF;
END $$;

-- --------------------------------------------------------------------------------
-- 3. Concurrency-Safe Partial Unique Indexes for Reference & Pending Service Guards
-- --------------------------------------------------------------------------------
-- Prevent reuse of any normalized non-empty transaction_id across pending or approved requests.
-- Rejected requests ('rejected') are excluded so merchants can resubmit after rejection.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_requests_active_transaction_id
  ON public.payment_requests ((upper(btrim(transaction_id, E' \t\n\r'))))
  WHERE status IN ('pending', 'approved')
    AND transaction_id IS NOT NULL
    AND btrim(transaction_id, E' \t\n\r') <> '';

-- Prevent reuse of any normalized non-empty bank_reference across pending or approved requests.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_requests_active_bank_reference
  ON public.payment_requests ((upper(btrim(bank_reference, E' \t\n\r'))))
  WHERE status IN ('pending', 'approved')
    AND bank_reference IS NOT NULL
    AND btrim(bank_reference, E' \t\n\r') <> '';

-- Upgrade uq_payment_requests_pending_user_service in place if an older case-sensitive expression exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'payment_requests'
      AND indexname = 'uq_payment_requests_pending_user_service'
      AND indexdef NOT ILIKE '%lower(btrim(service_id%'
  ) THEN
    DROP INDEX public.uq_payment_requests_pending_user_service;
  END IF;
END $$;

-- Prevent concurrent duplicate pending requests for the same user, service_type, and normalized service_id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_requests_pending_user_service
  ON public.payment_requests (user_id, service_type, (lower(btrim(service_id, E' \t\n\r'))))
  WHERE status = 'pending'
    AND service_id IS NOT NULL
    AND btrim(service_id, E' \t\n\r') <> '';

-- --------------------------------------------------------------------------------
-- 4. Private Internal Review Capability Store & Validated Authorization Helpers
-- --------------------------------------------------------------------------------
-- Private schema & single-use transactional capability table used exclusively by the
-- SECURITY DEFINER admin review RPCs (admin_approve_payment_request / admin_reject_payment_request)
-- to prove authorized RPC execution to trg_protect_payment_request_integrity without relying on
-- spoofable PG_CONTEXT string matching or user-writable session GUCs.
CREATE SCHEMA IF NOT EXISTS amaas_internal;

REVOKE ALL ON SCHEMA amaas_internal FROM PUBLIC;
REVOKE ALL ON SCHEMA amaas_internal FROM anon;
REVOKE ALL ON SCHEMA amaas_internal FROM authenticated;
REVOKE ALL ON SCHEMA amaas_internal FROM service_role;

CREATE TABLE IF NOT EXISTS amaas_internal.payment_review_authorizations (
  txid TEXT NOT NULL,
  request_id UUID NOT NULL,
  target_status TEXT NOT NULL CHECK (target_status IN ('approved', 'rejected')),
  reviewer_id UUID NOT NULL,
  rpc_name TEXT NOT NULL CHECK (rpc_name IN ('admin_approve_payment_request', 'admin_reject_payment_request')),
  CONSTRAINT chk_payment_review_auth_rpc_status_pair CHECK (
    (rpc_name = 'admin_approve_payment_request' AND target_status = 'approved')
    OR (rpc_name = 'admin_reject_payment_request' AND target_status = 'rejected')
  ),
  PRIMARY KEY (txid, request_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint con
    WHERE con.conrelid = 'amaas_internal.payment_review_authorizations'::pg_catalog.regclass
      AND con.conname = 'chk_payment_review_auth_rpc_status_pair'
  ) THEN
    ALTER TABLE amaas_internal.payment_review_authorizations
      ADD CONSTRAINT chk_payment_review_auth_rpc_status_pair CHECK (
        (rpc_name = 'admin_approve_payment_request' AND target_status = 'approved')
        OR (rpc_name = 'admin_reject_payment_request' AND target_status = 'rejected')
      );
  END IF;
END $$;

ALTER TABLE amaas_internal.payment_review_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE amaas_internal.payment_review_authorizations NO FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE amaas_internal.payment_review_authorizations FROM PUBLIC;
REVOKE ALL ON TABLE amaas_internal.payment_review_authorizations FROM anon;
REVOKE ALL ON TABLE amaas_internal.payment_review_authorizations FROM authenticated;
REVOKE ALL ON TABLE amaas_internal.payment_review_authorizations FROM service_role;

-- Harden public.is_admin() and public.protect_profile_role() so unprivileged client sessions
-- (SET ROLE authenticated / SET ROLE anon / non-owner session_user) can NEVER forge
-- request.jwt.claim.role = 'service_role' to self-promote public.profiles.role = 'admin'
-- and subsequently mint payment review capability tokens.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
DECLARE
  v_role text;
  v_jwt_role text;
  v_active_role text;
  v_is_session_owner_or_superuser boolean;
BEGIN
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');

  IF v_active_role = 'service_role' OR session_user = 'service_role' THEN
    RETURN true;
  END IF;

  -- Honor JWT service_role claim ONLY in a direct owner/superuser session where no client SET ROLE is active
  IF v_active_role IN ('none', current_user) THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      LEFT JOIN pg_catalog.pg_class c
        ON c.oid = 'public.profiles'::pg_catalog.regclass
       AND c.relowner = r.oid
      WHERE r.rolname = session_user
        AND (r.rolsuper = true OR c.oid IS NOT NULL)
    ) INTO v_is_session_owner_or_superuser;

    IF COALESCE(v_is_session_owner_or_superuser, false) THEN
      v_jwt_role := COALESCE(
        NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
        auth.jwt()->>'role'
      );
      IF v_jwt_role = 'service_role' THEN
        RETURN true;
      END IF;
    END IF;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = auth.uid();

  RETURN COALESCE(v_role = 'admin', false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger AS $$
DECLARE
  v_active_role text;
  v_is_direct_owner_maintenance boolean := false;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
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

    IF NOT v_is_direct_owner_maintenance AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access denied: Users cannot modify their own platform role or elevate privileges.';
    END IF;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_profile_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profile_role() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_role() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role();

CREATE OR REPLACE FUNCTION public.protect_profile_role_insert()
RETURNS trigger AS $$
DECLARE
  v_active_role text;
  v_is_direct_owner_maintenance boolean := false;
BEGIN
  IF NEW.role IS DISTINCT FROM 'merchant' THEN
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

    IF NOT v_is_direct_owner_maintenance AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access denied: Users cannot modify their own platform role or elevate privileges.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_profile_role_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profile_role_insert() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_role_insert() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_profile_role_insert ON public.profiles;
CREATE TRIGGER trg_protect_profile_role_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role_insert();

-- Verifies platform administrator status strictly against public.profiles for a specific user UUID.
-- Never consults user-controllable JWT claim GUCs (request.jwt.claim.role / auth.role()).
CREATE OR REPLACE FUNCTION public.is_verified_platform_admin(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
DECLARE
  v_active_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Prevent unprivileged client sessions from enumerating admin status of other user UUIDs
  v_active_role := COALESCE(NULLIF(pg_catalog.current_setting('role', true), ''), 'none');
  IF v_active_role IN ('authenticated', 'anon') AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role = 'admin'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.is_verified_platform_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_verified_platform_admin(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_verified_platform_admin(UUID) TO authenticated, service_role;

-- Uses SECURITY DEFINER with a locked search_path to avoid cross-table RLS recursion
-- and prevent store managers or staff (who may hold store access via store_members)
-- from submitting payment requests for a website owned by another user_id.
-- Verifies store management directly against public.stores, public.store_members, and
-- public.profiles so session-mutable JWT role GUCs cannot spoof store authorization.
-- Never discloses whether another user's website UUID exists because step 1 requires
-- p_user_id = auth.uid() and step 4 strictly filters sw.user_id = auth.uid().
CREATE OR REPLACE FUNCTION public.can_submit_payment_request(
  p_user_id UUID,
  p_store_id UUID,
  p_service_type TEXT,
  p_service_id TEXT,
  p_status TEXT DEFAULT 'pending'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_caller_id UUID;
  v_clean_service_id TEXT;
  v_website_uuid UUID;
  v_can_manage_store BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Submitter must match the authenticated user and request must start strictly as 'pending'
  IF p_user_id IS DISTINCT FROM v_caller_id THEN
    RETURN false;
  END IF;

  IF p_status IS DISTINCT FROM 'pending' THEN
    RETURN false;
  END IF;

  -- 2. Target service_id must be non-empty after stripping whitespace
  v_clean_service_id := btrim(COALESCE(p_service_id, ''), E' \t\n\r');
  IF v_clean_service_id = '' THEN
    RETURN false;
  END IF;

  -- 3. If a store_id is supplied, verify store management directly against authoritative tables
  IF p_store_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = p_store_id
        AND (
          s.owner_id = v_caller_id
          OR public.is_verified_platform_admin(v_caller_id)
          OR EXISTS (
            SELECT 1
            FROM public.store_members sm
            WHERE sm.store_id = p_store_id
              AND sm.user_id = v_caller_id
              AND sm.status = 'active'
              AND sm.role IN ('owner', 'admin', 'manager')
          )
        )
    ) INTO v_can_manage_store;

    IF NOT COALESCE(v_can_manage_store, false) THEN
      RETURN false;
    END IF;
  END IF;

  -- 4. Service-specific target validation
  IF p_service_type IN ('website_subscription', 'website_package') THEN
    IF v_clean_service_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN false;
    END IF;

    v_website_uuid := v_clean_service_id::UUID;

    RETURN EXISTS (
      SELECT 1
      FROM public.subscribed_websites sw
      WHERE sw.id = v_website_uuid
        AND sw.user_id = v_caller_id
        AND (
          p_store_id IS NULL
          OR sw.store_id IS NULL
          OR sw.store_id = p_store_id
        )
    );
  ELSIF p_service_type IN ('dashboard_plan', 'ai_automation') THEN
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.can_submit_payment_request(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_submit_payment_request(UUID, UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_submit_payment_request(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 4b. Hardened Administrative Review RPCs (Verified Admin Gate & Capability Minting)
-- --------------------------------------------------------------------------------
-- Replaces legacy public.is_admin() entry check (which trusted request.jwt.claim.role GUCs)
-- with strict public.is_verified_platform_admin(auth.uid()) BEFORE locking or probing any row,
-- mints a single-use capability row in amaas_internal.payment_review_authorizations, and
-- asserts exact single-row updates on both subscribed_websites and payment_requests.
CREATE OR REPLACE FUNCTION public.admin_approve_payment_request(
  p_request_id UUID,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID;
  v_req RECORD;
  v_clean_service_id TEXT;
  v_matched_count INTEGER := 0;
  v_website_uuid UUID;
  v_target_user_id UUID;
  v_sw_updated INTEGER := 0;
  v_pr_updated INTEGER := 0;
BEGIN
  -- 0. Authoritative platform admin check before any row lock or existence check
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL OR NOT public.is_verified_platform_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Only verified platform administrators can approve payment requests';
  END IF;

  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_FOUND',
      'message', 'Payment request not found'
    );
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
    v_clean_service_id := btrim(COALESCE(v_req.service_id, ''), E' \t\n\r');

    -- A. Validate service_id is not empty
    IF v_clean_service_id = '' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'MISSING_SERVICE_ID',
        'message', 'Payment approval failed: Website payment request is missing target website ID.'
      );
    END IF;

    -- B. Validate service_id is a valid UUID format
    IF v_clean_service_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'INVALID_SERVICE_ID',
        'message', 'Payment approval failed: Target website ID format is invalid (expected UUID).'
      );
    END IF;

    v_website_uuid := v_clean_service_id::UUID;

    -- C. Lock and verify target website exists in database
    SELECT user_id INTO v_target_user_id
    FROM public.subscribed_websites
    WHERE id = v_website_uuid
    FOR UPDATE;

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

    -- F. Update exactly the locked target website and assert single-row mutation
    UPDATE public.subscribed_websites
    SET
      status = 'active',
      payment_status = 'paid',
      current_period_end = NOW() + INTERVAL '30 days',
      grace_period_end = NOW() + INTERVAL '35 days',
      updated_at = NOW()
    WHERE id = v_website_uuid AND user_id = v_req.user_id;

    GET DIAGNOSTICS v_sw_updated = ROW_COUNT;
    IF v_sw_updated <> 1 THEN
      RAISE EXCEPTION 'Payment approval aborted: Expected 1 subscribed_websites row updated, got %.', v_sw_updated;
    END IF;
  ELSIF v_req.service_type NOT IN ('dashboard_plan', 'ai_automation') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'UNSUPPORTED_SERVICE_TYPE',
      'message', 'Payment approval failed: Unsupported service_type.'
    );
  END IF;

  -- 4. Mint single-use, transaction-bound capability token consumed by trg_protect_payment_request_integrity
  INSERT INTO amaas_internal.payment_review_authorizations (
    txid, request_id, target_status, reviewer_id, rpc_name
  ) VALUES (
    pg_catalog.pg_current_xact_id()::TEXT,
    p_request_id,
    'approved',
    v_admin_id,
    'admin_approve_payment_request'
  );

  -- 5. Atomically mark payment request as approved ONLY after all service-specific activations succeed
  UPDATE public.payment_requests
  SET
    status = 'approved',
    admin_notes = p_admin_notes,
    reviewed_by = v_admin_id,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_request_id
    AND status = 'pending';

  GET DIAGNOSTICS v_pr_updated = ROW_COUNT;
  IF v_pr_updated <> 1 THEN
    RAISE EXCEPTION 'Payment approval aborted: Expected 1 pending payment_requests row updated, got %.', v_pr_updated;
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
    'message', 'Payment approved successfully. Service activated.',
    'requestId', p_request_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment_request(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_reject_payment_request(
  p_request_id UUID,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID;
  v_req RECORD;
  v_pr_updated INTEGER := 0;
BEGIN
  -- 0. Authoritative platform admin check before any row lock or existence check
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL OR NOT public.is_verified_platform_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Only verified platform administrators can reject payment requests';
  END IF;

  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_FOUND',
      'message', 'Payment request not found'
    );
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

  -- 2. Reject non-pending requests
  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_SETTLED',
      'message', 'Payment request is already ' || v_req.status
    );
  END IF;

  -- 3. Mint single-use, transaction-bound capability token consumed by trg_protect_payment_request_integrity
  INSERT INTO amaas_internal.payment_review_authorizations (
    txid, request_id, target_status, reviewer_id, rpc_name
  ) VALUES (
    pg_catalog.pg_current_xact_id()::TEXT,
    p_request_id,
    'rejected',
    v_admin_id,
    'admin_reject_payment_request'
  );

  -- 4. Atomically mark payment request as rejected and assert single-row mutation
  UPDATE public.payment_requests
  SET
    status = 'rejected',
    admin_notes = p_reason,
    reviewed_by = v_admin_id,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_request_id
    AND status = 'pending';

  GET DIAGNOSTICS v_pr_updated = ROW_COUNT;
  IF v_pr_updated <> 1 THEN
    RAISE EXCEPTION 'Payment rejection aborted: Expected 1 pending payment_requests row updated, got %.', v_pr_updated;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM amaas_internal.payment_review_authorizations
    WHERE txid = pg_catalog.pg_current_xact_id()::TEXT
      AND request_id = p_request_id
  ) THEN
    RAISE EXCEPTION 'Payment rejection aborted: Review capability token was not consumed.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'REJECTED',
    'message', 'Payment request rejected.',
    'requestId', p_request_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.admin_reject_payment_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reject_payment_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_request(UUID, TEXT) TO authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 5. Row Integrity, Explicit Privilege Model, TRUNCATE Guard & Immutability Trigger
-- --------------------------------------------------------------------------------
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

  -- Explicit positive privilege model (never uses negative role exclusions, PG_CONTEXT regexes, or JWT GUCs):
  -- 1) Explicit Supabase backend service_role
  v_is_service_role := (current_user = 'service_role');

  -- 2) Verify whether BOTH current_user AND session_user are PostgreSQL superuser or owner of public.payment_requests,
  --    AND no non-owner SET ROLE (e.g. SET ROLE authenticated / SET ROLE anon) is active in the session.
  --    This prevents any unrelated SECURITY DEFINER function invoked by anon/authenticated/authenticator
  --    (even when auth.uid() IS NULL) from ever qualifying as backend maintenance.
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

  -- 3) On UPDATE, consume single-use capability token from amaas_internal.payment_review_authorizations
  --    ONLY when executing under the exact owner of BOTH SECURITY DEFINER admin review RPCs.
  IF TG_OP = 'UPDATE' THEN
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

  -- Direct backend / migration / SQL-Editor maintenance context:
  -- Strictly explicit service_role, OR direct owner/superuser session (session_user AND current_user
  -- both owner/superuser, no client SET ROLE active, outside admin review RPCs, and auth.uid() IS NULL).
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
    -- Reject NaN / Infinity / non-positive amounts (PostgreSQL NUMERIC treats 'NaN' > 0 as true)
    IF NEW.amount IS NULL
       OR NEW.amount <= 0
       OR NEW.amount IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC) THEN
      RAISE EXCEPTION 'Invalid payment request amount: amount must be a finite positive number.';
    END IF;

    -- Normalize whitespace (and canonical lowercase for website UUIDs) on service_id and references
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

      -- Force authoritative server timestamps on client submissions so created_at cannot be backdated/postdated
      NEW.created_at := NOW();
    ELSE
      NEW.created_at := COALESCE(NEW.created_at, NOW());
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Allow updates ONLY through the verified admin review RPCs (backed by public.profiles and single-use capability token)
    -- or explicit backend maintenance (service_role / direct owner maintenance).
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

    -- Core payment identity, customer submission details, target service, amount, and transaction
    -- references are immutable once created (even inside SECURITY DEFINER RPCs or owner sessions)
    -- unless explicitly repaired by service_role.
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

    -- Normalize fields only when explicitly modified (preserves existing legacy values during status reviews)
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

DROP TRIGGER IF EXISTS trg_protect_payment_request_integrity ON public.payment_requests;
CREATE TRIGGER trg_protect_payment_request_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_payment_request_integrity();

-- Statement-level BEFORE TRUNCATE guard (FOR EACH ROW triggers do not fire on TRUNCATE in PostgreSQL)
CREATE OR REPLACE FUNCTION public.block_payment_requests_truncate()
RETURNS TRIGGER AS $$
DECLARE
  v_active_role_setting TEXT;
  v_is_current_owner_or_superuser BOOLEAN;
  v_is_session_owner_or_superuser BOOLEAN;
BEGIN
  IF current_user = 'service_role' THEN
    RETURN NULL;
  END IF;

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

  IF COALESCE(v_is_current_owner_or_superuser, false)
     AND COALESCE(v_is_session_owner_or_superuser, false)
     AND v_active_role_setting IN ('none', current_user)
     AND auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'Access denied: Payment request audit records cannot be truncated.';
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.block_payment_requests_truncate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.block_payment_requests_truncate() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_payment_requests_truncate() TO service_role;

DROP TRIGGER IF EXISTS trg_block_payment_requests_truncate ON public.payment_requests;
CREATE TRIGGER trg_block_payment_requests_truncate
  BEFORE TRUNCATE ON public.payment_requests
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.block_payment_requests_truncate();

-- Align ownership of internal capability store and payment security functions with public.payment_requests owner,
-- ensure the owner role holds required underlying privileges for non-superuser SECURITY DEFINER execution,
-- and lock search_path / least-privilege EXECUTE grants on all co-owned SECURITY DEFINER routines in public
-- so no co-owned definer can be abused via search_path shadowing to mint capability tokens.
DO $$
DECLARE
  v_pr_owner NAME;
  v_pr_owner_oid OID;
  v_runner_is_super BOOLEAN := false;
  v_fn RECORD;
  v_target_fn RECORD;
BEGIN
  SELECT c.relowner, pg_catalog.pg_get_userbyid(c.relowner)
  INTO v_pr_owner_oid, v_pr_owner
  FROM pg_catalog.pg_class c
  WHERE c.oid = 'public.payment_requests'::pg_catalog.regclass;

  IF v_pr_owner IS NULL THEN
    RAISE EXCEPTION 'Security setup failed: Could not determine owner of public.payment_requests.';
  END IF;

  IF v_pr_owner IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'Security setup failed: public.payment_requests cannot be owned by API role "%".', v_pr_owner;
  END IF;

  SELECT COALESCE(r.rolsuper, false)
  INTO v_runner_is_super
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = current_user;

  IF NOT v_runner_is_super AND NOT pg_catalog.pg_has_role(current_user, v_pr_owner_oid, 'MEMBER') THEN
    RAISE EXCEPTION 'Security setup failed: Migration runner "%" must be superuser or a member of public.payment_requests owner role "%" to align SECURITY DEFINER ownership.',
      current_user, v_pr_owner;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace n
    WHERE n.nspname = 'amaas_internal' AND n.nspowner <> v_pr_owner_oid
  ) THEN
    EXECUTE format('ALTER SCHEMA amaas_internal OWNER TO %I', v_pr_owner);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid = 'amaas_internal.payment_review_authorizations'::pg_catalog.regclass
      AND c.relowner <> v_pr_owner_oid
  ) THEN
    EXECUTE format('ALTER TABLE amaas_internal.payment_review_authorizations OWNER TO %I', v_pr_owner);
  END IF;

  FOR v_target_fn IN (
    SELECT p.oid::pg_catalog.regprocedure AS regproc
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        (p.proname = 'is_admin' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
        OR (p.proname = 'protect_profile_role' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
        OR (p.proname = 'protect_profile_role_insert' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
        OR (p.proname = 'is_verified_platform_admin' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid')
        OR (p.proname = 'can_submit_payment_request' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, uuid, text, text, text')
        OR (p.proname = 'admin_approve_payment_request' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text')
        OR (p.proname = 'admin_reject_payment_request' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text')
        OR (p.proname = 'protect_payment_request_integrity' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
        OR (p.proname = 'block_payment_requests_truncate' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
      )
      AND p.proowner <> v_pr_owner_oid
  ) LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO %I', v_target_fn.regproc, v_pr_owner);
  END LOOP;

  -- Ensure v_pr_owner holds required underlying privileges when non-superuser SECURITY DEFINER functions execute
  IF NOT has_schema_privilege(v_pr_owner_oid, 'public', 'USAGE') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', v_pr_owner);
  END IF;
  IF NOT has_table_privilege(v_pr_owner_oid, 'public.subscribed_websites', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner_oid, 'public.subscribed_websites', 'UPDATE') THEN
    EXECUTE format('GRANT SELECT, UPDATE ON TABLE public.subscribed_websites TO %I', v_pr_owner);
  END IF;
  IF NOT has_table_privilege(v_pr_owner_oid, 'public.profiles', 'SELECT') THEN
    EXECUTE format('GRANT SELECT ON TABLE public.profiles TO %I', v_pr_owner);
  END IF;
  IF NOT has_table_privilege(v_pr_owner_oid, 'public.stores', 'SELECT') THEN
    EXECUTE format('GRANT SELECT ON TABLE public.stores TO %I', v_pr_owner);
  END IF;
  IF NOT has_table_privilege(v_pr_owner_oid, 'public.store_members', 'SELECT') THEN
    EXECUTE format('GRANT SELECT ON TABLE public.store_members TO %I', v_pr_owner);
  END IF;

  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA amaas_internal REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role',
    v_pr_owner
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA amaas_internal REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role',
    v_pr_owner
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA amaas_internal REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role',
    v_pr_owner
  );

  -- Harden co-owned service_trials SECURITY DEFINER functions (from 20261015_service_trials_system.sql)
  -- which previously lacked SET search_path and had default PUBLIC/anon EXECUTE privileges.
  IF pg_catalog.to_regprocedure('public.activate_service_trial(text,text,text,uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID)
      SET search_path = pg_catalog, public, pg_temp;
    REVOKE ALL ON FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID) FROM anon;
    GRANT EXECUTE ON FUNCTION public.activate_service_trial(TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
  END IF;

  IF pg_catalog.to_regprocedure('public.protect_service_trial_invariants()') IS NOT NULL THEN
    ALTER FUNCTION public.protect_service_trial_invariants()
      SET search_path = pg_catalog, public, pg_temp;
    REVOKE ALL ON FUNCTION public.protect_service_trial_invariants() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.protect_service_trial_invariants() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.protect_service_trial_invariants() TO service_role;
  END IF;

  -- Ensure every other existing non-extension co-owned SECURITY DEFINER function or procedure in public
  -- pins an empty or pg_catalog-first search_path (without clobbering stricter SET search_path = '' settings).
  FOR v_fn IN (
    SELECT
      p.oid::pg_catalog.regprocedure AS regproc,
      CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS routine_kind
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND p.prosecdef = true
      AND p.proowner = v_pr_owner_oid
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_depend d
        WHERE d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::TEXT[])) AS cfg
        WHERE cfg IN ('search_path=', 'search_path=""', 'search_path=''''')
           OR (
             cfg ~ '^search_path=\s*"?pg_catalog"?(\s*,\s*"?[a-zA-Z0-9_]+"?)*\s*$'
             AND cfg !~ 'pg_temp.*public'
           )
      )
  ) LOOP
    EXECUTE format('ALTER %s %s SET search_path = pg_catalog, public, pg_temp', v_fn.routine_kind, v_fn.regproc);
  END LOOP;
END $$;

-- Re-assert strict privilege revocations after ownership alignment
REVOKE ALL ON SCHEMA amaas_internal FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE amaas_internal.payment_review_authorizations FROM PUBLIC, anon, authenticated, service_role;

-- --------------------------------------------------------------------------------
-- 6. Hardened RLS Policies & Least-Privilege Table Grants on public.payment_requests
-- --------------------------------------------------------------------------------
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests NO FORCE ROW LEVEL SECURITY;

-- 6a. Explicitly drop all known legacy, snake_case, UI-generated, and obsolete policy names
--     (including remote legacy policies `payment_requests_select` and `payment_requests_insert`,
--     plus historical `20261015` policies such as `"Payment requests update policy"`).
DROP POLICY IF EXISTS payment_requests_select ON public.payment_requests;
DROP POLICY IF EXISTS payment_requests_insert ON public.payment_requests;
DROP POLICY IF EXISTS payment_requests_update ON public.payment_requests;
DROP POLICY IF EXISTS payment_requests_delete ON public.payment_requests;
DROP POLICY IF EXISTS payment_requests_all ON public.payment_requests;
DROP POLICY IF EXISTS payment_requests_admin ON public.payment_requests;
DROP POLICY IF EXISTS payment_requests_service_role ON public.payment_requests;
DROP POLICY IF EXISTS "Users can view their own payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Users can insert their own payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Users can create payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Admins can view all payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Admins can update payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Admins can manage all payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Payment requests select policy" ON public.payment_requests;
DROP POLICY IF EXISTS "Payment requests insert policy" ON public.payment_requests;
DROP POLICY IF EXISTS "Payment requests update policy" ON public.payment_requests;
DROP POLICY IF EXISTS "Payment requests delete policy" ON public.payment_requests;
DROP POLICY IF EXISTS "Payment requests service role policy" ON public.payment_requests;

-- 6b. Dynamic catalog sweep: drop any other legacy or ad-hoc RLS policies on public.payment_requests
--     so no permissive SELECT, INSERT, UPDATE, DELETE, or ALL policy can OR-bypass the intended rules.
DO $$
DECLARE
  v_pol RECORD;
BEGIN
  FOR v_pol IN (
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_requests'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.payment_requests', v_pol.policyname);
  END LOOP;
END $$;

-- 6c. Recreate ONLY the intended canonical policies:
--     1) Authenticated SELECT: own rows OR verified platform admin (for review queue visibility)
--     2) Authenticated INSERT: own pending row with null review fields and validated service/website ownership
--     3) Backend service_role ALL: explicit service_role access
--     Note: No client UPDATE or DELETE policies are created; verified admins review requests
--     exclusively via SECURITY DEFINER RPCs (admin_approve_payment_request / admin_reject_payment_request).
CREATE POLICY "Payment requests select policy"
  ON public.payment_requests
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_verified_platform_admin(auth.uid())
  );

CREATE POLICY "Payment requests insert policy"
  ON public.payment_requests
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND admin_notes IS NULL
    AND public.can_submit_payment_request(user_id, store_id, service_type, service_id, status)
  );

CREATE POLICY "Payment requests service role policy"
  ON public.payment_requests
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6d. Enforce least-privilege table grants:
--     Authenticated clients may only SELECT and INSERT; all approvals and rejections
--     must execute through the audited SECURITY DEFINER RPCs.
REVOKE ALL ON TABLE public.payment_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_requests FROM anon;
REVOKE ALL ON TABLE public.payment_requests FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.payment_requests TO authenticated;
GRANT ALL ON TABLE public.payment_requests TO service_role;

-- --------------------------------------------------------------------------------
-- 7. Post-Migration Security Invariant Verification Guard
-- --------------------------------------------------------------------------------
DO $$
DECLARE
  v_unexpected_policies TEXT[];
  v_policy_count INTEGER;
  v_rls_enabled BOOLEAN;
  v_rls_forced BOOLEAN;
  v_pr_owner OID;
  v_pr_owner_name NAME;
  v_bad_funcs TEXT[];
  v_extra_overloads TEXT[];
  v_valid_idx_count INTEGER;
  v_active_trg_count INTEGER;
BEGIN
  -- 7a. Verify RLS is enabled, NOT forced (so owner-aligned SECURITY DEFINER RPCs can update rows),
  --     and owner is not a client/API role.
  SELECT c.relrowsecurity, c.relforcerowsecurity, c.relowner, pg_catalog.pg_get_userbyid(c.relowner)
  INTO v_rls_enabled, v_rls_forced, v_pr_owner, v_pr_owner_name
  FROM pg_catalog.pg_class c
  WHERE c.oid = 'public.payment_requests'::pg_catalog.regclass;

  IF NOT COALESCE(v_rls_enabled, false) OR COALESCE(v_rls_forced, true) THEN
    RAISE EXCEPTION 'Security invariant check failed: public.payment_requests must have relrowsecurity=true and relforcerowsecurity=false.';
  END IF;

  IF v_pr_owner_name IS NULL OR v_pr_owner_name IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'Security invariant check failed: Invalid public.payment_requests owner "%".', COALESCE(v_pr_owner_name::TEXT, 'NULL');
  END IF;

  -- 7b. Verify ONLY the 3 canonical policies exist on public.payment_requests
  SELECT array_agg(policyname ORDER BY policyname)
  INTO v_unexpected_policies
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'payment_requests'
    AND policyname NOT IN (
      'Payment requests select policy',
      'Payment requests insert policy',
      'Payment requests service role policy'
    );

  IF v_unexpected_policies IS NOT NULL AND array_length(v_unexpected_policies, 1) > 0 THEN
    RAISE EXCEPTION 'Security invariant check failed: Unexpected RLS policies remain on public.payment_requests: %',
      array_to_string(v_unexpected_policies, ', ');
  END IF;

  SELECT count(*) INTO v_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'payment_requests';

  IF v_policy_count <> 3 THEN
    RAISE EXCEPTION 'Security invariant check failed: Expected exactly 3 RLS policies on public.payment_requests, found %.', v_policy_count;
  END IF;

  -- 7c. Verify table, definer-owner, and internal capability schema privileges & RLS state
  IF has_table_privilege('anon', 'public.payment_requests', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
    RAISE EXCEPTION 'Security invariant check failed: anon still holds table privileges on public.payment_requests.';
  END IF;

  IF has_table_privilege('authenticated', 'public.payment_requests', 'UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
    RAISE EXCEPTION 'Security invariant check failed: authenticated holds forbidden write/DDL privileges on public.payment_requests.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.payment_requests', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.payment_requests', 'INSERT') THEN
    RAISE EXCEPTION 'Security invariant check failed: authenticated lacks required SELECT/INSERT privileges on public.payment_requests.';
  END IF;

  IF has_schema_privilege('anon', 'amaas_internal', 'USAGE, CREATE')
     OR has_schema_privilege('authenticated', 'amaas_internal', 'USAGE, CREATE')
     OR has_schema_privilege('service_role', 'amaas_internal', 'USAGE, CREATE')
     OR has_table_privilege('anon', 'amaas_internal.payment_review_authorizations', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('authenticated', 'amaas_internal.payment_review_authorizations', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('service_role', 'amaas_internal.payment_review_authorizations', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'Security invariant check failed: Non-owner role holds access to amaas_internal capability store.';
  END IF;

  IF NOT has_schema_privilege(v_pr_owner, 'public', 'USAGE')
     OR NOT has_schema_privilege(v_pr_owner, 'auth', 'USAGE')
     OR NOT has_schema_privilege(v_pr_owner, 'amaas_internal', 'USAGE')
     OR NOT has_function_privilege(v_pr_owner, 'auth.uid()', 'EXECUTE')
     OR NOT has_function_privilege(v_pr_owner, 'auth.jwt()', 'EXECUTE')
     OR NOT has_table_privilege(v_pr_owner, 'public.payment_requests', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner, 'public.payment_requests', 'INSERT')
     OR NOT has_table_privilege(v_pr_owner, 'public.payment_requests', 'UPDATE')
     OR NOT has_table_privilege(v_pr_owner, 'public.payment_requests', 'DELETE')
     OR NOT has_table_privilege(v_pr_owner, 'public.subscribed_websites', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner, 'public.subscribed_websites', 'UPDATE')
     OR NOT has_table_privilege(v_pr_owner, 'public.profiles', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner, 'public.stores', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner, 'public.store_members', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner, 'amaas_internal.payment_review_authorizations', 'SELECT')
     OR NOT has_table_privilege(v_pr_owner, 'amaas_internal.payment_review_authorizations', 'INSERT')
     OR NOT has_table_privilege(v_pr_owner, 'amaas_internal.payment_review_authorizations', 'DELETE') THEN
    RAISE EXCEPTION 'Security invariant check failed: SECURITY DEFINER owner role "%" lacks required schema, auth-helper, or table privileges.',
      v_pr_owner_name;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    WHERE c.oid = 'amaas_internal.payment_review_authorizations'::pg_catalog.regclass
      AND c.relrowsecurity = true
      AND c.relforcerowsecurity = false
      AND c.relowner = v_pr_owner
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'amaas_internal'
      AND tablename = 'payment_review_authorizations'
  ) THEN
    RAISE EXCEPTION 'Security invariant check failed: amaas_internal.payment_review_authorizations must be owner-aligned with RLS enabled and zero permissive policies.';
  END IF;

  -- 7d. Verify exact signatures, owner alignment, SECURITY DEFINER / SECURITY INVOKER mode, EXECUTE grants,
  --     and locked search_path on all 9 payment & role-guard functions, plus zero unexpected overloads.
  SELECT array_agg(
    format('public.%I(%s)', exp.fn_name, exp.fn_args)
    ORDER BY exp.fn_name, exp.fn_args
  )
  INTO v_bad_funcs
  FROM (
    VALUES
      ('is_admin', '', true),
      ('protect_profile_role', '', true),
      ('protect_profile_role_insert', '', true),
      ('is_verified_platform_admin', 'uuid', true),
      ('can_submit_payment_request', 'uuid, uuid, text, text, text', true),
      ('admin_approve_payment_request', 'uuid, text', true),
      ('admin_reject_payment_request', 'uuid, text', true),
      ('protect_payment_request_integrity', '', false),
      ('block_payment_requests_truncate', '', false)
  ) AS exp(fn_name, fn_args, fn_secdef)
  LEFT JOIN (
    SELECT
      p.proname,
      pg_catalog.oidvectortypes(p.proargtypes) AS argtypes,
      p.proowner,
      p.prosecdef,
      p.proconfig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ) cur ON cur.proname = exp.fn_name AND cur.argtypes = exp.fn_args
  WHERE cur.proname IS NULL
     OR cur.proowner <> v_pr_owner
     OR cur.prosecdef IS DISTINCT FROM exp.fn_secdef
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(COALESCE(cur.proconfig, ARRAY[]::TEXT[])) AS cfg
       WHERE cfg ~ '^search_path=\s*"?pg_catalog"?\s*,\s*"?public"?\s*,\s*"?pg_temp"?\s*$'
     );

  IF v_bad_funcs IS NOT NULL AND array_length(v_bad_funcs, 1) > 0 THEN
    RAISE EXCEPTION 'Security invariant check failed: Missing or misconfigured owner, security mode, or search_path on functions: %',
      array_to_string(v_bad_funcs, ', ');
  END IF;

  SELECT array_agg(
    format('public.%I(%s)', p.proname, pg_catalog.oidvectortypes(p.proargtypes))
    ORDER BY p.proname, pg_catalog.oidvectortypes(p.proargtypes)
  )
  INTO v_extra_overloads
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'is_admin',
      'protect_profile_role',
      'protect_profile_role_insert',
      'is_verified_platform_admin',
      'can_submit_payment_request',
      'admin_approve_payment_request',
      'admin_reject_payment_request',
      'protect_payment_request_integrity',
      'block_payment_requests_truncate'
    )
    AND NOT (
      (p.proname = 'is_admin' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
      OR (p.proname = 'protect_profile_role' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
      OR (p.proname = 'protect_profile_role_insert' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
      OR (p.proname = 'is_verified_platform_admin' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid')
      OR (p.proname = 'can_submit_payment_request' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, uuid, text, text, text')
      OR (p.proname = 'admin_approve_payment_request' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text')
      OR (p.proname = 'admin_reject_payment_request' AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text')
      OR (p.proname = 'protect_payment_request_integrity' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
      OR (p.proname = 'block_payment_requests_truncate' AND pg_catalog.oidvectortypes(p.proargtypes) = '')
    );

  IF v_extra_overloads IS NOT NULL AND array_length(v_extra_overloads, 1) > 0 THEN
    RAISE EXCEPTION 'Security invariant check failed: Unexpected function overload(s) exist in public: %',
      array_to_string(v_extra_overloads, ', ');
  END IF;

  IF has_function_privilege('anon', 'public.admin_approve_payment_request(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_reject_payment_request(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.can_submit_payment_request(uuid, uuid, text, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.is_verified_platform_admin(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.is_admin()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.protect_payment_request_integrity()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_payment_request_integrity()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.block_payment_requests_truncate()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.block_payment_requests_truncate()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security invariant check failed: Forbidden PUBLIC/anon/authenticated EXECUTE grant detected on payment security functions.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'amaas_internal'
  ) THEN
    RAISE EXCEPTION 'Security invariant check failed: Unexpected routines exist in schema amaas_internal.';
  END IF;

  SELECT array_agg(
    format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.oidvectortypes(p.proargtypes))
    ORDER BY n.nspname, p.proname
  )
  INTO v_bad_funcs
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
    AND p.prosecdef = true
    AND p.proowner = v_pr_owner
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::TEXT[])) AS cfg
      WHERE cfg IN ('search_path=', 'search_path=""', 'search_path=''''')
         OR (
           cfg ~ '^search_path=\s*"?pg_catalog"?(\s*,\s*"?[a-zA-Z0-9_]+"?)*\s*$'
           AND cfg !~ 'pg_temp.*public'
         )
    );

  IF v_bad_funcs IS NOT NULL AND array_length(v_bad_funcs, 1) > 0 THEN
    RAISE EXCEPTION 'Security invariant check failed: Co-owned SECURITY DEFINER routines lack empty or pg_catalog-first search_path: %',
      array_to_string(v_bad_funcs, ', ');
  END IF;

  -- 7e. Verify all 3 partial unique indexes and both enforcement triggers exist and are active
  SELECT count(*) INTO v_valid_idx_count
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = idx.relnamespace
  WHERE i.indrelid = 'public.payment_requests'::pg_catalog.regclass
    AND n.nspname = 'public'
    AND idx.relname IN (
      'uq_payment_requests_active_transaction_id',
      'uq_payment_requests_active_bank_reference',
      'uq_payment_requests_pending_user_service'
    )
    AND i.indisvalid = true
    AND i.indisunique = true;

  IF v_valid_idx_count <> 3 THEN
    RAISE EXCEPTION 'Security invariant check failed: Expected 3 valid unique indexes on public.payment_requests, found %.', v_valid_idx_count;
  END IF;

  SELECT count(*) INTO v_active_trg_count
  FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.payment_requests'::pg_catalog.regclass
    AND NOT t.tgisinternal
    AND t.tgname IN ('trg_protect_payment_request_integrity', 'trg_block_payment_requests_truncate')
    AND t.tgenabled IN ('O', 'A');

  IF v_active_trg_count <> 2 THEN
    RAISE EXCEPTION 'Security invariant check failed: Expected 2 active enforcement triggers on public.payment_requests, found %.', v_active_trg_count;
  END IF;
END $$;

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


-- ==============================================================================
-- Migration 20261029: Visual Website Builder, Storage Isolation & Auto-Publishing
-- ==============================================================================

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

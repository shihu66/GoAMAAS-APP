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
BEGIN
  v_jwt_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt()->>'role'
  );
  IF v_jwt_role = 'service_role' THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();
  
  RETURN COALESCE(v_role = 'admin', false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

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
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access denied: Users cannot modify their own platform role or elevate privileges.';
    END IF;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_profile_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profile_role() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_role() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role();

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Subscribed websites update policy" ON public.subscribed_websites;
CREATE POLICY "Subscribed websites update policy"
  ON public.subscribed_websites FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Subscribed websites delete policy" ON public.subscribed_websites;
CREATE POLICY "Subscribed websites delete policy"
  ON public.subscribed_websites FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

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

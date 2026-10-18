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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;
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
-- ==============================================================================

-- ==============================================================================

-- ==============================================================================

-- ==============================================================================

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

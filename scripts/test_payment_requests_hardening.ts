import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';

async function runPaymentRequestsHardeningSuite() {
  console.log('=== PAYMENT REQUESTS OWNERSHIP & UNIQUENESS HARDENING TEST SUITE ===');
  let passed = 0;
  let total = 0;

  async function initSupabaseMockEnv(db: PGlite) {
    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
      END $$;

      CREATE SCHEMA IF NOT EXISTS auth;
      GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA auth TO authenticated, anon, service_role;
      GRANT ALL ON ALL ROUTINES IN SCHEMA auth TO authenticated, anon, service_role;

      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT,
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public._test_session (
        current_user_id UUID,
        current_email TEXT,
        session_role TEXT DEFAULT 'authenticated'
      );
      INSERT INTO public._test_session VALUES (NULL, NULL, 'authenticated');

      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, anon, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, anon, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated, anon, service_role;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT current_user_id FROM public._test_session LIMIT 1;
      $$ LANGUAGE sql STABLE SECURITY DEFINER;

      CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT AS $$
        SELECT current_email FROM public._test_session LIMIT 1;
      $$ LANGUAGE sql STABLE SECURITY DEFINER;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
        SELECT session_role FROM public._test_session LIMIT 1;
      $$ LANGUAGE sql STABLE SECURITY DEFINER;

      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
      $$ LANGUAGE sql STABLE SECURITY DEFINER;
    `);
  }

  async function test(name: string, fn: (db: PGlite) => Promise<void>) {
    total++;
    const db = new PGlite();
    await initSupabaseMockEnv(db);

    try {
      await fn(db);
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}`);
      console.error(`       Error: ${err.message || err}`);
    } finally {
      await db.close();
    }
  }

  const baseSchema = fs
    .readFileSync('supabase/schema.sql', 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
  const migration20261010 = fs
    .readFileSync('supabase/migrations/20261010_security_and_rls_hardening.sql', 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
  const migration20261015Trials = fs.readFileSync('supabase/migrations/20261015_service_trials_system.sql', 'utf8');
  const migration20261015Payments = fs.readFileSync(
    'supabase/migrations/20261015_complete_saas_website_builder_and_payments.sql',
    'utf8'
  );
  const migration20261017 = fs.readFileSync(
    'supabase/migrations/20261017_public_website_resolution_and_publishing.sql',
    'utf8'
  );
  const migration20261018 = fs.readFileSync(
    'supabase/migrations/20261018_fix_admin_approve_payment_request_safety.sql',
    'utf8'
  );
  const migration20261024 = fs.readFileSync(
    'supabase/migrations/20261024_harden_payment_requests_ownership_and_uniqueness.sql',
    'utf8'
  );
  const migration20261026 = fs.readFileSync(
    'supabase/migrations/20261026_stores_gateway_pricing_and_admin_hardening.sql',
    'utf8'
  );
  const migration20261029 = fs.readFileSync(
    'supabase/migrations/20261029_website_builder_storage_and_autopublish.sql',
    'utf8'
  );

  async function asUser(
    db: PGlite,
    userId: string | null,
    email: string | null = null,
    role: string = 'authenticated'
  ) {
    await db.exec(`RESET ROLE;`);
    await db.exec(`
      UPDATE public._test_session
      SET current_user_id = ${userId ? `'${userId}'::uuid` : 'NULL'},
          current_email = ${email ? `'${email}'` : 'NULL'},
          session_role = '${role}';
      SELECT set_config('request.jwt.claim.role', '${role}', false);
      SELECT set_config('request.jwt.claim.sub', ${userId ? `'${userId}'` : "''"}, false);
      SELECT set_config('request.jwt.claims', json_build_object('sub', ${userId ? `'${userId}'` : 'NULL'}, 'role', '${role}')::text, false);
    `);
    if (role === 'authenticated' || role === 'anon') {
      await db.exec(`SET ROLE ${role};`);
    } else {
      await db.exec(`RESET ROLE;`);
    }
  }

  async function setupHardenedFixture(db: PGlite) {
    await db.exec(baseSchema);
    await db.exec(migration20261024);
    await db.exec(migration20261026);
    await db.exec(migration20261029);

    const userA = '11111111-1111-4111-8111-111111111111';
    const userB = '22222222-2222-4222-8222-222222222222';
    const staffA = '33333333-3333-4333-8333-333333333333';
    const managerA = '44444444-4444-4444-8444-444444444444';
    const adminUser = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const storeA = 'aaaaaaaa-1111-4111-8111-111111111111';
    const storeA2 = 'aaaaaaaa-2222-4222-8222-222222222222';
    const storeB = 'bbbbbbbb-1111-4111-8111-111111111111';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${userA}', 'merchant_a@test.com'),
        ('${userB}', 'merchant_b@test.com'),
        ('${staffA}', 'staff_a@test.com'),
        ('${managerA}', 'manager_a@test.com'),
        ('${adminUser}', 'admin@amaas.xyz');

      INSERT INTO public.stores (id, owner_id, name, slug) VALUES
        ('${storeA}', '${userA}', 'Store A Primary', 'store-a'),
        ('${storeA2}', '${userA}', 'Store A Secondary', 'store-a2'),
        ('${storeB}', '${userB}', 'Store B', 'store-b');

      INSERT INTO public.store_members (store_id, user_id, name, email, role, status) VALUES
        ('${storeA}', '${staffA}', 'Staff A', 'staff_a@test.com', 'staff', 'active'),
        ('${storeA}', '${managerA}', 'Manager A', 'manager_a@test.com', 'manager', 'active');

      UPDATE public.profiles SET role = 'admin' WHERE id = '${adminUser}';
    `);

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const siteA1 = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain)
        VALUES ('${userA}', '${storeA}', 'Alpha Cafe', 'cafe', 'alphacafe', 'alphacafe.amaas.xyz')
        RETURNING id;
      `)
    ).rows[0].id;

    const siteA2 = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain)
        VALUES ('${userA}', '${storeA}', 'Alpha Bakery', 'bakery', 'alphabakery', 'alphabakery.amaas.xyz')
        RETURNING id;
      `)
    ).rows[0].id;

    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    const siteB1 = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain)
        VALUES ('${userB}', '${storeB}', 'Beta Gadgets', 'electronics', 'betagadgets', 'betagadgets.amaas.xyz')
        RETURNING id;
      `)
    ).rows[0].id;

    return { userA, userB, staffA, managerA, adminUser, storeA, storeA2, storeB, siteA1, siteA2, siteB1 };
  }

  // TEST 1: Ordered incremental recovery sequence + idempotency from confirmed baseline state
  await test('1. Full ordered recovery chain (baseline + 20261010 -> 20261015s -> 20261017 -> 20261018 -> 20261024) runs cleanly and idempotently', async (db) => {
    // Simulate confirmed remote state: baseline tables (subscribed_websites WITHOUT payment_status/updated_at, NO payment_requests) + 20261010
    await db.exec(`
      CREATE TABLE public.profiles (
        id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
        email TEXT,
        full_name TEXT,
        role TEXT DEFAULT 'merchant' CHECK (role IN ('merchant', 'admin')),
        onboarding_completed BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.stores (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.products (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        price NUMERIC NOT NULL DEFAULT 0,
        stock INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.orders (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        customer_name TEXT NOT NULL,
        total_amount NUMERIC NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.customers (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.subscribed_websites (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
        business_name TEXT NOT NULL,
        niche TEXT NOT NULL,
        subdomain TEXT UNIQUE NOT NULL,
        full_domain TEXT NOT NULL,
        template_id TEXT,
        template_name TEXT,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'grace_period', 'suspended', 'cancelled', 'draft')),
        plan_tier TEXT DEFAULT 'Website Lite',
        monthly_fee NUMERIC DEFAULT 600,
        currency TEXT DEFAULT 'BDT',
        subscribed_at TIMESTAMPTZ DEFAULT NOW(),
        current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
        grace_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '37 days'),
        deployment_status TEXT DEFAULT 'deploying' CHECK (deployment_status IN ('deploying', 'live', 'suspended', 'failed', 'provisioning', 'ready')),
        config JSONB DEFAULT '{}'::jsonb,
        resource_usage JSONB NOT NULL DEFAULT '{"pagesCount": 0, "storageUsedMb": 0, "bandwidthUsedGb": 0, "updatesThisMonth": 0}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.inventory_movements (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
        change_amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.support_tickets (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.exec(migration20261010);
    await db.exec(migration20261015Trials);
    await db.exec(migration20261015Payments);
    await db.exec(migration20261017);
    await db.exec(migration20261018);
    await db.exec(migration20261024);
    // Re-run 20261024 consecutively to prove full idempotency
    await db.exec(migration20261024);
    await db.exec(migration20261024);
    // Apply and re-run 20261026 consecutively to prove forward chain + idempotency
    await db.exec(migration20261026);
    await db.exec(migration20261026);
  });

  // TEST 2: Cross-tenant INSERT attempts are strictly blocked
  await test('2. Cross-tenant, store-manager, staff, missing-website, non-UUID, forged-status, and cross-store INSERT attempts are blocked', async (db) => {
    const { userA, userB, staffA, managerA, storeA, storeA2, storeB, siteA1 } = await setupHardenedFixture(db);

    async function expectInsertBlocked(label: string, sql: string) {
      let blocked = false;
      try {
        await db.query(sql);
      } catch {
        blocked = true;
      }
      if (!blocked) {
        throw new Error(`Expected INSERT to be blocked for scenario: ${label}`);
      }
    }

    // 2a. User B attempting website_subscription for User A's website
    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    await expectInsertBlocked(
      'User B referencing User A website_subscription',
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
      ) VALUES (
        '${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
        'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_CROSS_1'
      );`
    );

    // 2b. User B attempting website_package for User A's website (with store_id NULL)
    await expectInsertBlocked(
      'User B referencing User A website_package with NULL store_id',
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
      ) VALUES (
        '${userB}', NULL, 'Merchant B', '01800000000', 'merchant_b@test.com',
        'website_package', '${siteA1}', 'Website Package', '৳5,000', 5000, 'bKash', 'TRX_CROSS_2'
      );`
    );

    // 2c. Store A staff member (who can SELECT siteA1 via can_access_store) attempting payment request for User A's website
    await asUser(db, staffA, 'staff_a@test.com', 'authenticated');
    await expectInsertBlocked(
      'Store staff submitting website payment for store owner website',
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
      ) VALUES (
        '${staffA}', NULL, 'Staff A', '01811111111', 'staff_a@test.com',
        'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_STAFF_1'
      );`
    );

    // 2c-ii. Store A manager (who passes can_manage_store(storeA)) attempting website payment for User A's website
    await asUser(db, managerA, 'manager_a@test.com', 'authenticated');
    await expectInsertBlocked(
      'Store manager submitting website_subscription for store owner website',
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
      ) VALUES (
        '${managerA}', '${storeA}', 'Manager A', '01822222222', 'manager_a@test.com',
        'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_MGR_1'
      );`
    );

    // 2d. User A attempting website_subscription for a non-existent website UUID
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    await expectInsertBlocked(
      'User A referencing non-existent website UUID',
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '99999999-9999-4999-8999-999999999999', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_MISSING_1'
      );`
    );

    // 2e. User A attempting website_subscription with non-UUID service_id
    await expectInsertBlocked(
      'User A referencing non-UUID service_id for website_subscription',
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', 'alphacafe', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_BAD_ID'
      );`
    );

    // 2f. User A attempting non-website request referencing User B's store_id
    await expectInsertBlocked(
      'User A spoofing User B store_id on dashboard_plan',
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
      ) VALUES (
        '${userA}', '${storeB}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'dashboard_plan', 'plan_pro', 'Business Pro', '৳2,500/month', 2500, 'bKash', 'TRX_BAD_STORE'
      );`
    );

    // 2g. User A attaching mismatched storeA2 to siteA1 (which belongs to storeA)
    await expectInsertBlocked(
      'User A attaching mismatched storeA2 to siteA1',
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
      ) VALUES (
        '${userA}', '${storeA2}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_MISMATCH_STORE'
      );`
    );

    // 2h. User A attempting to forge status = 'approved' or reviewed_by metadata on INSERT
    await expectInsertBlocked(
      'User A forging status = approved on INSERT',
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'approved'
      );`
    );

    await expectInsertBlocked(
      'User A forging reviewed_by on INSERT',
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status, reviewed_by
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'pending', '${userA}'
      );`
    );
  });

  // TEST 3: Legitimate requests succeed across all supported service_type values
  await test('3. Legitimate requests succeed for owned website_subscription, website_package, dashboard_plan, and ai_automation', async (db) => {
    const { userA, storeA, siteA1, siteA2 } = await setupHardenedFixture(db);
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');

    // 3a. website_subscription (with whitespace-padded service_id normalized cleanly)
    const subRes = await db.query<{ id: string; service_id: string; transaction_id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '  ${siteA1}  ', 'Website Lite', '৳600/month', 600, 'bKash', '  trx_legit_sub_1  '
      ) RETURNING id, service_id, transaction_id;
    `);
    if (subRes.rows[0].service_id !== siteA1) throw new Error('service_id was not trimmed on INSERT');
    if (subRes.rows[0].transaction_id !== 'trx_legit_sub_1') throw new Error('transaction_id was not trimmed on INSERT');

    // 3b. website_package
    const pkgRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, bank_name, bank_account_name, bank_reference
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_package', '${siteA2}', 'Custom Setup Package', 'One-time', 5000, 'Bank Transfer', 'City Bank', 'Alpha Ltd', 'BANK_LEGIT_PKG_1'
      ) RETURNING id;
    `);
    if (!pkgRes.rows[0].id) throw new Error('Legitimate website_package INSERT failed');

    // 3c. dashboard_plan
    const planRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'dashboard_plan', 'plan_growth', 'Growth Plan', '৳1,500/month', 1500, 'bKash', 'TRX_LEGIT_PLAN_1'
      ) RETURNING id;
    `);
    if (!planRes.rows[0].id) throw new Error('Legitimate dashboard_plan INSERT failed');

    // 3d. ai_automation (with NULL store_id)
    const aiRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
      ) VALUES (
        '${userA}', NULL, 'Merchant A', '01700000000', 'merchant_a@test.com',
        'ai_automation', 'ai_order_assistant', 'Order Automation Pack', '৳2,000/month', 2000, 'bKash', 'TRX_LEGIT_AI_1'
      ) RETURNING id;
    `);
    if (!aiRes.rows[0].id) throw new Error('Legitimate ai_automation INSERT failed');
  });

  // TEST 4: Normalized duplicate transaction_id and bank_reference protection across users and statuses
  await test('4. Duplicate normalized transaction_id and bank_reference are blocked across tenants for pending and approved requests', async (db) => {
    const { userA, userB, adminUser, storeA, storeB, siteA1, siteA2, siteB1 } = await setupHardenedFixture(db);

    // User A submits bKash request with mixed-case/whitespace TrxID
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const req1 = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', '  bkx778899ab \n'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // User B attempts to reuse 'BKX778899AB' while User A's request is pending -> MUST FAIL with 23505
    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    let dupPendingTrxCode = '';
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
          'website_subscription', '${siteB1}', 'Website Lite', '৳600/month', 600, 'bKash', 'BKX778899AB'
        );
      `);
    } catch (err: any) {
      dupPendingTrxCode = err.code || 'ERROR';
    }
    if (dupPendingTrxCode !== '23505') {
      throw new Error(`Expected 23505 duplicate violation on pending transaction_id, got: ${dupPendingTrxCode}`);
    }

    // Admin approves User A's request -> transaction_id must STILL remain locked against reuse
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const appRes = await db.query<{ val: any }>(`SELECT public.admin_approve_payment_request('${req1}', 'Verified') AS val;`);
    if (!appRes.rows[0].val.success) throw new Error('Admin approval failed');

    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    let dupApprovedTrxCode = '';
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
          'website_subscription', '${siteB1}', 'Website Lite', '৳600/month', 600, 'bKash', 'bkx778899ab'
        );
      `);
    } catch (err: any) {
      dupApprovedTrxCode = err.code || 'ERROR';
    }
    if (dupApprovedTrxCode !== '23505') {
      throw new Error(`Expected 23505 duplicate violation on approved transaction_id, got: ${dupApprovedTrxCode}`);
    }

    // Bank reference collision test (same user on different website, case-insensitive)
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    await db.query(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, bank_reference
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${siteA2}', 'Website Lite', '৳600/month', 600, 'Bank Transfer', '  brac-ref-2026  '
      );
    `);

    let dupBankRefCode = '';
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, bank_reference
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'dashboard_plan', 'plan_pro', 'Pro Plan', '৳2,500/month', 2500, 'Bank Transfer', 'BRAC-REF-2026'
        );
      `);
    } catch (err: any) {
      dupBankRefCode = err.code || 'ERROR';
    }
    if (dupBankRefCode !== '23505') {
      throw new Error(`Expected 23505 duplicate violation on bank_reference, got: ${dupBankRefCode}`);
    }
  });

  // TEST 5: Concurrent duplicate requests via Promise.all enforce single winner
  await test('5. Concurrent duplicate submissions (Promise.all) allow exactly 1 winner and reject duplicates with 23505', async (db) => {
    const { userA, storeA, siteA1, siteA2 } = await setupHardenedFixture(db);
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');

    // 5a. Concurrent identical transaction_id across distinct services
    const trxAttempts = await Promise.allSettled([
      db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'RACE_TRX_001'
        );
      `),
      db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'dashboard_plan', 'plan_pro', 'Pro Plan', '৳2,500/month', 2500, 'bKash', '  race_trx_001  '
        );
      `),
      db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'ai_automation', 'ai_bot', 'Bot Plan', '৳1,200/month', 1200, 'bKash', 'race_trx_001'
        );
      `),
    ]);

    const trxFulfilled = trxAttempts.filter((r) => r.status === 'fulfilled');
    const trxRejected = trxAttempts.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected' && r.reason?.code === '23505'
    );
    if (trxFulfilled.length !== 1 || trxRejected.length !== 2) {
      throw new Error(
        `Expected 1 fulfilled and 2 rejected (23505) for concurrent transaction_id, got ${trxFulfilled.length} fulfilled / ${trxRejected.length} rejected`
      );
    }

    // 5b. Concurrent duplicate pending requests for the same (user_id, service_type, service_id) with distinct TrxIDs and case-varied UUIDs
    const serviceAttempts = await Promise.allSettled([
      db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '${siteA2.toLowerCase()}', 'Website Lite', '৳600/month', 600, 'bKash', 'UNIQUE_SVC_TRX_1'
        );
      `),
      db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '  ${siteA2.toUpperCase()} ', 'Website Lite', '৳600/month', 600, 'bKash', 'UNIQUE_SVC_TRX_2'
        );
      `),
    ]);

    const svcFulfilled = serviceAttempts.filter((r) => r.status === 'fulfilled');
    const svcRejected = serviceAttempts.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected' && r.reason?.code === '23505'
    );
    if (svcFulfilled.length !== 1 || svcRejected.length !== 1) {
      throw new Error(
        `Expected 1 fulfilled and 1 rejected (23505) for concurrent case-varied pending service, got ${svcFulfilled.length} fulfilled / ${svcRejected.length} rejected`
      );
    }
  });

  // TEST 6: NULL, empty, and whitespace-only reference values do not collide
  await test('6. NULL, empty, and whitespace-only transaction_id and bank_reference values do not trigger false collisions', async (db) => {
    const { userA, userB, storeA, storeB, siteA1, siteA2, siteB1 } = await setupHardenedFixture(db);

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const r1 = await db.query<{ transaction_id: string | null; bank_reference: string | null }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, bank_reference
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', NULL, ''
      ) RETURNING transaction_id, bank_reference;
    `);

    const r2 = await db.query<{ transaction_id: string | null; bank_reference: string | null }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, bank_reference
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${siteA2}', 'Website Lite', '৳600/month', 600, 'Bank Transfer', '   \t\n ', '  \r\n  '
      ) RETURNING transaction_id, bank_reference;
    `);

    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    const r3 = await db.query<{ transaction_id: string | null; bank_reference: string | null }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, bank_reference
      ) VALUES (
        '${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
        'website_subscription', '${siteB1}', 'Website Lite', '৳600/month', 600, 'bKash', '', NULL
      ) RETURNING transaction_id, bank_reference;
    `);

    if (r1.rows[0].bank_reference !== null || r2.rows[0].transaction_id !== null || r2.rows[0].bank_reference !== null || r3.rows[0].transaction_id !== null) {
      throw new Error('Empty/whitespace-only references were not normalized to NULL');
    }
  });

  // TEST 7: Rejected-request reference reuse and post-approval renewal workflow
  await test('7. Rejected requests release transaction_id, bank_reference, and pending slot; approved requests allow renewal only with a new reference', async (db) => {
    const { userA, adminUser, storeA, siteA1 } = await setupHardenedFixture(db);

    // 7a. Submit initial request
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const req1Id = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_RETRY_900'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // 7b. Admin rejects request (e.g., sender number typo while TrxID was real)
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const rejRes = await db.query<{ val: any }>(`
      SELECT public.admin_reject_payment_request('${req1Id}', 'Sender phone digits incomplete; please resubmit') AS val;
    `);
    if (!rejRes.rows[0].val.success) throw new Error('admin_reject_payment_request failed');

    // 7c. Merchant resubmits for the SAME siteA1 reusing 'TRX_RETRY_900' -> SUCCEEDS
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const req2Id = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01711223344', 'merchant_a@test.com',
          'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'trx_retry_900'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // 7d. Admin approves the resubmitted request
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const appRes = await db.query<{ val: any }>(`
      SELECT public.admin_approve_payment_request('${req2Id}', 'Verified on second submission') AS val;
    `);
    if (!appRes.rows[0].val.success) throw new Error('admin_approve_payment_request failed');

    // 7e. Next month renewal for siteA1: reusing approved 'TRX_RETRY_900' MUST FAIL, but a new TrxID SUCCEEDS
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    let reusedApprovedFailed = false;
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01711223344', 'merchant_a@test.com',
          'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_RETRY_900'
        );
      `);
    } catch (err: any) {
      if (err.code === '23505') reusedApprovedFailed = true;
    }
    if (!reusedApprovedFailed) throw new Error('Reusing an approved transaction_id on renewal was not blocked');

    const renewalRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01711223344', 'merchant_a@test.com',
        'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_MONTH2_901'
      ) RETURNING id;
    `);
    if (!renewalRes.rows[0].id) throw new Error('Legitimate renewal with new transaction_id failed');
  });

  // TEST 8: Preflight duplicate guard aborts cleanly without modifying or deleting existing rows
  await test('8. Migration preflight aborts cleanly on pre-existing duplicate references or pending services without mutating rows', async (db) => {
    await db.exec(baseSchema);

    // Drop the 20261024 unique indexes temporarily to simulate a pre-20261024 database containing duplicate rows
    await db.exec(`
      DROP INDEX IF EXISTS uq_payment_requests_active_transaction_id;
      DROP INDEX IF EXISTS uq_payment_requests_active_bank_reference;
      DROP INDEX IF EXISTS uq_payment_requests_pending_user_service;
    `);

    const userA = '11111111-1111-4111-8111-111111111111';
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${userA}', 'dup@test.com');
      INSERT INTO public.payment_requests (
        user_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, status
      ) VALUES
        ('${userA}', 'Dup 1', '01700000000', 'dup@test.com', 'dashboard_plan', 'plan_1', 'Plan 1', 'Pro', 1000, 'bKash', 'dup_trx_1', 'pending'),
        ('${userA}', 'Dup 2', '01700000000', 'dup@test.com', 'dashboard_plan', 'plan_2', 'Plan 2', 'Pro', 1000, 'bKash', '  DUP_TRX_1 ', 'approved');
    `);

    let abortedWithMessage = '';
    try {
      await db.exec(migration20261024);
    } catch (err: any) {
      abortedWithMessage = err.message || String(err);
    }

    if (!abortedWithMessage.includes('Duplicate active/approved transaction_id values detected')) {
      throw new Error(`Expected preflight abort message for duplicate transaction_id, got: ${abortedWithMessage}`);
    }

    // Verify zero rows were deleted or modified
    const countRes = await db.query<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM public.payment_requests;`);
    if (countRes.rows[0].cnt !== '2') {
      throw new Error(`Preflight unexpectedly mutated rows; expected 2 rows, found ${countRes.rows[0].cnt}`);
    }
  });

  // TEST 9: Explicit privilege model, custom-role denial, GUC-spoofing immunity (SELECT/INSERT/UPDATE/RPC), legacy row review, and search_path audit
  await test('9. Explicit privilege model blocks direct writes, custom DB roles, GUC-spoofed RPCs, and unrelated SECURITY DEFINER updates while preserving legacy row reviews', async (db) => {
    const { userA, userB, adminUser, storeA, siteA1, siteA2 } = await setupHardenedFixture(db);

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const reqId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_IMMUTABLE_1'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // 9a. Merchant direct UPDATE or DELETE -> MUST FAIL
    let merchantUpdateBlocked = false;
    try {
      await db.query(`UPDATE public.payment_requests SET service_id = '${siteA2}' WHERE id = '${reqId}';`);
    } catch {
      merchantUpdateBlocked = true;
    }
    if (!merchantUpdateBlocked) throw new Error('Merchant directly updated payment_requests');

    let merchantDeleteBlocked = false;
    try {
      await db.query(`DELETE FROM public.payment_requests WHERE id = '${reqId}';`);
    } catch {
      merchantDeleteBlocked = true;
    }
    if (!merchantDeleteBlocked) throw new Error('Merchant directly deleted payment_requests');

    // 9b. Even authenticated Admin cannot bypass RPC via direct table UPDATE (table UPDATE privilege revoked)
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    let adminDirectUpdateBlocked = false;
    try {
      await db.query(`UPDATE public.payment_requests SET status = 'approved' WHERE id = '${reqId}';`);
    } catch {
      adminDirectUpdateBlocked = true;
    }
    if (!adminDirectUpdateBlocked) throw new Error('Authenticated admin bypassed RPC via direct table UPDATE');

    // 9c. Arbitrary non-owner custom DB role is NOT treated as privileged backend (replaces current_user NOT IN ('authenticated','anon'))
    // Attach a temporary permissive policy so INSERT, UPDATE, and DELETE reach trg_protect_payment_request_integrity directly.
    await db.exec(`
      RESET ROLE;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_custom_worker') THEN
          CREATE ROLE test_custom_worker;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public, auth TO test_custom_worker;
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_requests TO test_custom_worker;
      GRANT EXECUTE ON FUNCTION public.protect_payment_request_integrity() TO test_custom_worker;
      GRANT EXECUTE ON FUNCTION public.can_submit_payment_request(UUID, UUID, TEXT, TEXT, TEXT) TO test_custom_worker;
      GRANT EXECUTE ON FUNCTION public.is_verified_platform_admin(UUID) TO test_custom_worker;
      DROP POLICY IF EXISTS "_tmp_custom_worker_policy" ON public.payment_requests;
      CREATE POLICY "_tmp_custom_worker_policy" ON public.payment_requests
        FOR ALL TO test_custom_worker USING (true) WITH CHECK (true);
      UPDATE public._test_session SET current_user_id = NULL, current_email = NULL, session_role = 'service_role';
      SET ROLE test_custom_worker;
    `);

    let customRoleInsertBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, status, reviewed_by
        ) VALUES (
          '${userA}', '${storeA}', 'Worker', '01700000000', 'merchant_a@test.com',
          'dashboard_plan', 'plan_pro', 'Pro', 'Pro', 2500, 'bKash', 'approved', '${adminUser}'
        );
      `);
    } catch {
      customRoleInsertBlocked = true;
    }
    if (!customRoleInsertBlocked) throw new Error('Non-owner custom DB role bypassed INSERT ownership/review checks');

    let customRoleUpdateBlocked = false;
    try {
      await db.query(`UPDATE public.payment_requests SET status = 'approved' WHERE id = '${reqId}';`);
    } catch (err: any) {
      if ((err.message || '').includes('Direct updates to payment requests are not permitted')) {
        customRoleUpdateBlocked = true;
      }
    }
    if (!customRoleUpdateBlocked) throw new Error('Non-owner custom DB role bypassed UPDATE trigger protection');

    let customRoleDeleteBlocked = false;
    try {
      await db.query(`DELETE FROM public.payment_requests WHERE id = '${reqId}';`);
    } catch (err: any) {
      if ((err.message || '').includes('cannot be deleted by client sessions')) {
        customRoleDeleteBlocked = true;
      }
    }
    if (!customRoleDeleteBlocked) throw new Error('Non-owner custom DB role bypassed DELETE trigger protection');

    await db.exec(`
      RESET ROLE;
      DROP POLICY IF EXISTS "_tmp_custom_worker_policy" ON public.payment_requests;
      REVOKE ALL ON TABLE public.payment_requests FROM test_custom_worker;
    `);

    // 9d. Adversarial GUC spoofing across SELECT, INSERT, direct UPDATE/DELETE, and SECURITY DEFINER admin RPCs:
    await db.exec(`RESET ROLE; GRANT UPDATE, DELETE ON TABLE public.payment_requests TO authenticated;`);

    await db.exec(`
      RESET ROLE;
      UPDATE public._test_session SET current_user_id = '${userB}', current_email = 'merchant_b@test.com', session_role = 'service_role';
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claims', '{"sub":"${userB}","role":"service_role"}', false);
    `);

    // Merchant B spoofing service_role GUC still cannot SELECT User A's payment_requests
    const spoofSelectRes = await db.query(`SELECT id FROM public.payment_requests WHERE id = '${reqId}';`);
    if (spoofSelectRes.rows.length !== 0) {
      throw new Error('Merchant B read User A payment request via JWT role GUC spoofing');
    }

    // Merchant B spoofing service_role GUC cannot attach User A's store_id on INSERT
    let gucInsertStoreSpoofBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userB}', '${storeA}', 'Merchant B', '01800000000', 'merchant_b@test.com',
          'dashboard_plan', 'plan_pro', 'Pro Plan', '৳2,500/month', 2500, 'bKash', 'TRX_GUC_SPOOF_1'
        );
      `);
    } catch {
      gucInsertStoreSpoofBlocked = true;
    }
    if (!gucInsertStoreSpoofBlocked) throw new Error('Authenticated user bypassed store_id ownership via JWT GUC spoofing');

    // Merchant B spoofing service_role GUC matches 0 rows under RLS UPDATE policy (is_verified_platform_admin ignores GUC)
    const gucUpdateRes = await db.query(`
      UPDATE public.payment_requests SET status = 'approved', admin_notes = 'forged' WHERE id = '${reqId}' RETURNING id;
    `);
    if (gucUpdateRes.rows.length !== 0) {
      throw new Error('Authenticated non-admin updated payment_requests via JWT GUC spoofing');
    }

    // Merchant B spoofing service_role GUC cannot approve or reject via SECURITY DEFINER RPCs (and website stays pending!)
    let gucRpcApproveBlocked = false;
    try {
      await db.query(`SELECT public.admin_approve_payment_request('${reqId}', 'GUC spoofed approval');`);
    } catch {
      gucRpcApproveBlocked = true;
    }
    if (!gucRpcApproveBlocked) throw new Error('GUC-spoofing merchant approved payment via admin_approve_payment_request');

    let gucRpcRejectBlocked = false;
    try {
      await db.query(`SELECT public.admin_reject_payment_request('${reqId}', 'GUC spoofed rejection');`);
    } catch {
      gucRpcRejectBlocked = true;
    }
    if (!gucRpcRejectBlocked) throw new Error('GUC-spoofing merchant rejected payment via admin_reject_payment_request');

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const siteCheckAfterSpoof = await db.query<{ payment_status: string }>(`
      SELECT payment_status FROM public.subscribed_websites WHERE id = '${siteA1}';
    `);
    if (siteCheckAfterSpoof.rows[0].payment_status !== 'pending') {
      throw new Error('Target website payment_status was mutated despite failed GUC-spoofed RPC');
    }

    // Even a real platform admin WITH spoofed service_role JWT GUC matches 0 rows under RLS on direct UPDATE/DELETE (no client UPDATE/DELETE policies exist)
    await db.exec(`
      RESET ROLE;
      UPDATE public._test_session SET current_user_id = '${adminUser}', current_email = 'admin@amaas.xyz', session_role = 'service_role';
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claims', '{"sub":"${adminUser}","role":"service_role"}', false);
    `);
    const adminRlsBlockedUpdate = await db.query(`
      UPDATE public.payment_requests SET status = 'approved', reviewed_by = '${adminUser}', reviewed_at = NOW() WHERE id = '${reqId}' RETURNING id;
    `);
    if (adminRlsBlockedUpdate.rows.length !== 0) {
      throw new Error('RLS allowed direct table UPDATE by authenticated admin');
    }

    const adminRlsBlockedDelete = await db.query(`
      DELETE FROM public.payment_requests WHERE id = '${reqId}' RETURNING id;
    `);
    if (adminRlsBlockedDelete.rows.length !== 0) {
      throw new Error('RLS allowed direct table DELETE by authenticated admin');
    }

    // Isolate trigger defense-in-depth: even if a permissive UPDATE policy existed, trigger STILL blocks direct admin UPDATE and immutable mutations under spoofed service_role GUC
    await db.exec(`
      RESET ROLE;
      CREATE POLICY "_tmp_admin_update_trigger_test" ON public.payment_requests
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
      UPDATE public._test_session SET current_user_id = '${adminUser}', current_email = 'admin@amaas.xyz', session_role = 'service_role';
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claims', '{"sub":"${adminUser}","role":"service_role"}', false);
    `);
    let triggerBlocksDirectAdminUpdate = false;
    try {
      await db.query(`UPDATE public.payment_requests SET status = 'approved', reviewed_by = '${adminUser}', reviewed_at = NOW() WHERE id = '${reqId}';`);
    } catch (err: any) {
      if ((err.message || '').includes('Direct updates to payment requests are not permitted')) {
        triggerBlocksDirectAdminUpdate = true;
      }
    }
    if (!triggerBlocksDirectAdminUpdate) {
      throw new Error('Trigger did not block direct table UPDATE by authenticated admin spoofing service_role GUC');
    }

    let triggerBlocksAdminImmutableSpoof = false;
    try {
      await db.query(`UPDATE public.payment_requests SET service_id = '${siteA2}' WHERE id = '${reqId}';`);
    } catch (err: any) {
      if ((err.message || '').includes('Direct updates to payment requests are not permitted') || (err.message || '').includes('immutable')) {
        triggerBlocksAdminImmutableSpoof = true;
      }
    }
    if (!triggerBlocksAdminImmutableSpoof) {
      throw new Error('Trigger did not block immutable column mutation under spoofed service_role GUC');
    }

    // Restore least-privilege table ACL and drop temporary test policy
    await db.exec(`
      RESET ROLE;
      DROP POLICY IF EXISTS "_tmp_admin_update_trigger_test" ON public.payment_requests;
      REVOKE UPDATE, DELETE ON TABLE public.payment_requests FROM authenticated;
    `);

    // 9e. Unrelated SECURITY DEFINER function owned by table owner cannot update payment_requests for authenticated callers
    await db.exec(`
      RESET ROLE;
      CREATE OR REPLACE FUNCTION public._test_rogue_definer_update(p_id UUID)
      RETURNS VOID AS $$
      BEGIN
        UPDATE public.payment_requests SET status = 'approved' WHERE id = p_id;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
      GRANT EXECUTE ON FUNCTION public._test_rogue_definer_update(UUID) TO authenticated;
    `);
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    let rogueDefinerBlocked = false;
    try {
      await db.query(`SELECT public._test_rogue_definer_update('${reqId}');`);
    } catch (err: any) {
      if ((err.message || '').includes('Direct updates to payment requests are not permitted')) {
        rogueDefinerBlocked = true;
      }
    }
    if (!rogueDefinerBlocked) {
      throw new Error('Unrelated SECURITY DEFINER function bypassed admin review RPC restriction');
    }
    await db.exec(`RESET ROLE; DROP FUNCTION public._test_rogue_definer_update(UUID);`);

    // 9f. Pre-existing legacy row with untrimmed transaction_id and empty-string bank_reference approves cleanly via RPC
    await db.exec(`
      RESET ROLE;
      ALTER TABLE public.payment_requests DISABLE TRIGGER trg_protect_payment_request_integrity;
      INSERT INTO public.payment_requests (
        id, user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, bank_reference, status
      ) VALUES (
        '77777777-7777-4777-8777-777777777777', '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${siteA2}', 'Website Lite', '৳600/month', 600, 'bKash', '  LEGACY_UNTRIMMED_TRX  ', '', 'pending'
      );
      ALTER TABLE public.payment_requests ENABLE TRIGGER trg_protect_payment_request_integrity;
    `);

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const legacyApproveRes = await db.query<{ val: any }>(`
      SELECT public.admin_approve_payment_request('77777777-7777-4777-8777-777777777777', 'Legacy row approved') AS val;
    `);
    if (!legacyApproveRes.rows[0].val.success) {
      throw new Error('Admin approval failed on pre-existing legacy untrimmed row: ' + legacyApproveRes.rows[0].val.message);
    }

    // 9g. Non-service_role owner session cannot mutate immutable core columns, while explicit service_role can repair
    await asUser(db, null, null, 'service_role'); // PGlite superuser/owner (current_user != 'service_role')
    let immutableTriggerBlocked = false;
    try {
      await db.query(`UPDATE public.payment_requests SET service_id = '${siteA2}' WHERE id = '${reqId}';`);
    } catch (err: any) {
      if ((err.message || '').includes('immutable')) immutableTriggerBlocked = true;
    }
    if (!immutableTriggerBlocked) throw new Error('Trigger did not block mutation of immutable service_id column for non-service_role session');

    await db.exec(`SET ROLE service_role;`);
    await db.query(`UPDATE public.payment_requests SET transaction_id = '  TRX_REPAIRED_BY_SVC_ROLE  ' WHERE id = '${reqId}';`);
    const repairedRow = await db.query<{ transaction_id: string }>(`
      SELECT transaction_id FROM public.payment_requests WHERE id = '${reqId}';
    `);
    if (repairedRow.rows[0].transaction_id !== 'TRX_REPAIRED_BY_SVC_ROLE') {
      throw new Error('Explicit service_role repair did not normalize or persist transaction_id');
    }
    await db.exec(`RESET ROLE;`);

    // 9h. Verify search_path and PUBLIC/anon privilege revocation on all 3 functions
    const fnCheck = await db.query<{ proname: string; proconfig: string[] }>(`
      SELECT p.proname, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN ('is_verified_platform_admin', 'can_submit_payment_request', 'protect_payment_request_integrity');
    `);
    if (fnCheck.rows.length !== 3) throw new Error(`Expected 3 functions, found ${fnCheck.rows.length}`);
    for (const row of fnCheck.rows) {
      const cfg = (row.proconfig || []).join('; ');
      if (!cfg.includes('search_path=pg_catalog, public, pg_temp')) {
        throw new Error(`Function ${row.proname} missing locked search_path: ${cfg}`);
      }
    }

    const anonExec = await db.query<{ has_submit: boolean; has_admin: boolean }>(`
      SELECT
        has_function_privilege('anon', 'public.can_submit_payment_request(uuid, uuid, text, text, text)', 'EXECUTE') AS has_submit,
        has_function_privilege('anon', 'public.is_verified_platform_admin(uuid)', 'EXECUTE') AS has_admin;
    `);
    if (anonExec.rows[0].has_submit || anonExec.rows[0].has_admin) {
      throw new Error('anon should not have EXECUTE privilege on payment authorization helpers');
    }
  });

  // TEST 10: Legacy permissive RLS policies (payment_requests_select, payment_requests_insert, update/delete/public) are completely purged
  await test('10. Legacy permissive RLS policies (payment_requests_select, payment_requests_insert, update/delete/public) are completely purged without data loss', async (db) => {
    const { userA, userB, adminUser, storeA, siteA1, siteB1 } = await setupHardenedFixture(db);

    // Seed an existing valid payment request for User A
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const existingReqId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_PRE_POLICY_CLEANUP'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // Simulate a database polluted with permissive legacy policies:
    // - payment_requests_select (permissive USING (true))
    // - payment_requests_insert (permissive WITH CHECK (true))
    // - payment_requests_update / payment_requests_delete / "Payment requests update policy"
    // - an unknown ad-hoc PUBLIC FOR ALL policy
    await db.exec(`
      RESET ROLE;
      CREATE POLICY payment_requests_select ON public.payment_requests FOR SELECT TO authenticated USING (true);
      CREATE POLICY payment_requests_insert ON public.payment_requests FOR INSERT TO authenticated WITH CHECK (true);
      CREATE POLICY payment_requests_update ON public.payment_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
      CREATE POLICY payment_requests_delete ON public.payment_requests FOR DELETE TO authenticated USING (true);
      CREATE POLICY "Payment requests update policy" ON public.payment_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
      CREATE POLICY "Adhoc legacy public all policy" ON public.payment_requests FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
    `);

    // Confirm the legacy permissive policy actually leaked User A's row to User B BEFORE re-applying 20261024
    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    const leakedBefore = await db.query(`SELECT id FROM public.payment_requests WHERE id = '${existingReqId}';`);
    if (leakedBefore.rows.length !== 1) {
      throw new Error('Expected legacy payment_requests_select USING (true) to expose row before migration cleanup');
    }

    // Apply migration 20261024 twice as superuser/owner to verify complete cleanup AND idempotency
    await db.exec(`RESET ROLE;`);
    await db.exec(migration20261024);
    await db.exec(migration20261024);

    // 10a. Verify ONLY the 3 intended canonical policies exist on public.payment_requests
    const polRes = await db.query<{ policyname: string; cmd: string; roles: string }>(`
      SELECT policyname, cmd, roles::text AS roles
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public' AND tablename = 'payment_requests'
      ORDER BY policyname;
    `);
    const actualNames = polRes.rows.map((r) => r.policyname);
    const expectedNames = [
      'Payment requests insert policy',
      'Payment requests select policy',
      'Payment requests service role policy',
    ];
    if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
      throw new Error(`Unexpected policies after migration: ${JSON.stringify(actualNames)}`);
    }

    // 10b. Verify existing payment data was preserved untouched
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const preservedRes = await db.query<{ id: string; transaction_id: string; status: string }>(`
      SELECT id, transaction_id, status FROM public.payment_requests WHERE id = '${existingReqId}';
    `);
    if (
      preservedRes.rows.length !== 1 ||
      preservedRes.rows[0].transaction_id !== 'TRX_PRE_POLICY_CLEANUP' ||
      preservedRes.rows[0].status !== 'pending'
    ) {
      throw new Error('Existing payment request data was not preserved cleanly');
    }

    // 10c. Verify User B can NO LONGER read User A's request or insert for User A's website
    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    const leakAfter = await db.query(`SELECT id FROM public.payment_requests WHERE id = '${existingReqId}';`);
    if (leakAfter.rows.length !== 0) {
      throw new Error('Legacy SELECT bypass survived migration cleanup!');
    }

    let crossTenantInsertBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
          'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_CROSS_AFTER_CLEANUP'
        );
      `);
    } catch {
      crossTenantInsertBlocked = true;
    }
    if (!crossTenantInsertBlocked) {
      throw new Error('Cross-tenant website INSERT succeeded after migration cleanup!');
    }

    // 10d. Verify User B CAN submit an authorized request for their own website siteB1
    const legitBId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
          'website_subscription', '${siteB1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_LEGIT_B_CLEANUP'
        ) RETURNING id;
      `)
    ).rows[0].id;
    if (!legitBId) throw new Error('Authorized merchant INSERT failed after policy cleanup');

    // 10e. Verify Admin can read queue via SELECT and review via secure RPCs, while direct UPDATE/DELETE remain blocked
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const adminQueue = await db.query(`SELECT id FROM public.payment_requests WHERE id IN ('${existingReqId}', '${legitBId}');`);
    if (adminQueue.rows.length !== 2) {
      throw new Error(`Expected verified admin SELECT to see 2 requests, saw ${adminQueue.rows.length}`);
    }

    let directAdminUpdateBlocked = false;
    try {
      await db.query(`UPDATE public.payment_requests SET status = 'approved' WHERE id = '${existingReqId}';`);
    } catch {
      directAdminUpdateBlocked = true;
    }
    if (!directAdminUpdateBlocked) throw new Error('Direct client UPDATE by admin was not blocked');

    const rpcApprove = await db.query<{ val: any }>(`
      SELECT public.admin_approve_payment_request('${existingReqId}', 'Approved cleanly via RPC') AS val;
    `);
    if (!rpcApprove.rows[0].val.success) {
      throw new Error('Admin RPC approval failed after policy cleanup: ' + rpcApprove.rows[0].val.message);
    }

    const rpcReject = await db.query<{ val: any }>(`
      SELECT public.admin_reject_payment_request('${legitBId}', 'Rejected cleanly via RPC') AS val;
    `);
    if (!rpcReject.rows[0].val.success) {
      throw new Error('Admin RPC rejection failed after policy cleanup: ' + rpcReject.rows[0].val.message);
    }
  });

  // TEST 11: Adversarial Trigger & RPC Execution-Context Impersonation Suite
  await test('11. Adversarial trigger review: blocks PG_CONTEXT spoofing, null-uid SECURITY DEFINER bypass, amaas_internal access, forged timestamps, NaN amounts, invalid transitions, and TRUNCATE', async (db) => {
    const { userA, userB, adminUser, storeA, siteA1, siteA2 } = await setupHardenedFixture(db);

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const pendingReqId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_ADV_TRIGGER_1'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // 11a. PG_CONTEXT spoofing attempt: owner-owned SECURITY DEFINER function embedding
    //      '\nPL/pgSQL function public.admin_approve_payment_request(' inside a multi-line SQL statement,
    //      invoked by a real verified platform admin -> MUST BE BLOCKED!
    await db.exec(`
      RESET ROLE;
      CREATE OR REPLACE FUNCTION public._test_spoof_pg_context(p_id UUID, p_admin UUID)
      RETURNS VOID AS $fn$
      BEGIN
        UPDATE public.payment_requests
        /* Spoofed stack line at start of newline inside PG_CONTEXT SQL statement frame:
PL/pgSQL function public.admin_approve_payment_request(uuid,text) line 121 at SQL statement
        */
        SET status = 'approved',
            reviewed_by = p_admin,
            reviewed_at = NOW()
        WHERE id = p_id;
      END;
      $fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
      GRANT EXECUTE ON FUNCTION public._test_spoof_pg_context(UUID, UUID) TO authenticated;
    `);

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    let pgContextSpoofBlocked = false;
    try {
      await db.query(`SELECT public._test_spoof_pg_context('${pendingReqId}', '${adminUser}');`);
    } catch (err: any) {
      if ((err.message || '').includes('Direct updates to payment requests are not permitted')) {
        pgContextSpoofBlocked = true;
      }
    }
    if (!pgContextSpoofBlocked) {
      throw new Error('PG_CONTEXT multi-line SQL comment spoof bypassed protect_payment_request_integrity()!');
    }
    await db.exec(`RESET ROLE; DROP FUNCTION public._test_spoof_pg_context(UUID, UUID);`);

    // 11b. Direct access to amaas_internal.payment_review_authorizations by anon, authenticated (including admin), and service_role -> DENIED
    for (const [uid, email, roleName] of [
      [null, null, 'anon'],
      [userA, 'merchant_a@test.com', 'authenticated'],
      [adminUser, 'admin@amaas.xyz', 'authenticated'],
    ] as const) {
      await asUser(db, uid, email, roleName);
      let capMintBlocked = false;
      try {
        await db.query(`
          INSERT INTO amaas_internal.payment_review_authorizations (txid, request_id, target_status, reviewer_id, rpc_name)
          VALUES (pg_current_xact_id()::text, '${pendingReqId}', 'approved', '${adminUser}', 'admin_approve_payment_request');
        `);
      } catch {
        capMintBlocked = true;
      }
      if (!capMintBlocked) {
        throw new Error(`Role ${roleName} (uid=${uid}) was able to write to amaas_internal.payment_review_authorizations!`);
      }
    }

    await db.exec(`RESET ROLE; SET ROLE service_role;`);
    let svcRoleInternalBlocked = false;
    try {
      await db.query(`SELECT * FROM amaas_internal.payment_review_authorizations;`);
    } catch {
      svcRoleInternalBlocked = true;
    }
    if (!svcRoleInternalBlocked) {
      throw new Error('service_role should not have direct access to amaas_internal.payment_review_authorizations');
    }
    await db.exec(`RESET ROLE;`);

    // 11c. Unrelated owner-owned SECURITY DEFINER function invoked when auth.uid() IS NULL
    //      (as anon, as authenticated with cleared JWT sub, and as a non-owner session_user login role)
    //      attempting forged INSERT, UPDATE, and DELETE -> ALL MUST BE BLOCKED!
    await db.exec(`
      RESET ROLE;
      CREATE OR REPLACE FUNCTION public._test_null_uid_definer_insert(p_uid UUID)
      RETURNS VOID AS $fn$
      BEGIN
        INSERT INTO public.payment_requests (
          user_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, status, reviewed_by
        ) VALUES (
          p_uid, 'Forged', '01700000000', 'forged@test.com',
          'dashboard_plan', 'plan_pro', 'Pro', 'Pro', 2500, 'bKash', 'approved', p_uid
        );
      END;
      $fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

      CREATE OR REPLACE FUNCTION public._test_null_uid_definer_update(p_id UUID)
      RETURNS VOID AS $fn$
      BEGIN
        UPDATE public.payment_requests SET status = 'approved' WHERE id = p_id;
      END;
      $fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

      CREATE OR REPLACE FUNCTION public._test_null_uid_definer_delete(p_id UUID)
      RETURNS VOID AS $fn$
      BEGIN
        DELETE FROM public.payment_requests WHERE id = p_id;
      END;
      $fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_direct_login_client') THEN
          CREATE ROLE test_direct_login_client LOGIN;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public, auth TO test_direct_login_client;
      GRANT EXECUTE ON FUNCTION public._test_null_uid_definer_insert(UUID) TO anon, authenticated, test_direct_login_client;
      GRANT EXECUTE ON FUNCTION public._test_null_uid_definer_update(UUID) TO anon, authenticated, test_direct_login_client;
      GRANT EXECUTE ON FUNCTION public._test_null_uid_definer_delete(UUID) TO anon, authenticated, test_direct_login_client;
    `);

    // Test under anon (auth.uid() IS NULL)
    await asUser(db, null, null, 'anon');
    for (const [label, sql] of [
      ['anon null-uid definer INSERT', `SELECT public._test_null_uid_definer_insert('${userB}');`],
      ['anon null-uid definer UPDATE', `SELECT public._test_null_uid_definer_update('${pendingReqId}');`],
      ['anon null-uid definer DELETE', `SELECT public._test_null_uid_definer_delete('${pendingReqId}');`],
    ] as const) {
      let blocked = false;
      try {
        await db.query(sql);
      } catch {
        blocked = true;
      }
      if (!blocked) throw new Error(`Bypass detected: ${label} succeeded!`);
    }

    // Test under authenticated with cleared auth.uid() (NULL)
    await asUser(db, null, null, 'authenticated');
    for (const [label, sql] of [
      ['authenticated null-uid definer INSERT', `SELECT public._test_null_uid_definer_insert('${userB}');`],
      ['authenticated null-uid definer UPDATE', `SELECT public._test_null_uid_definer_update('${pendingReqId}');`],
      ['authenticated null-uid definer DELETE', `SELECT public._test_null_uid_definer_delete('${pendingReqId}');`],
    ] as const) {
      let blocked = false;
      try {
        await db.query(sql);
      } catch {
        blocked = true;
      }
      if (!blocked) throw new Error(`Bypass detected: ${label} succeeded!`);
    }

    // 11d. Forged created_at on client INSERT (backdated 1999) is overwritten to server NOW()
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const tsRes = await db.query<{ yr: number }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, created_at
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${siteA2}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_FORGED_TS_1', '1999-01-01T00:00:00Z'
      ) RETURNING EXTRACT(YEAR FROM created_at)::int AS yr;
    `);
    if (tsRes.rows[0].yr <= 2000) {
      throw new Error(`Client forged backdated created_at (${tsRes.rows[0].yr}) was not overwritten by server NOW()!`);
    }

    // 11e. NaN and Infinity numeric amounts are strictly rejected on INSERT
    for (const badAmt of ["'NaN'::numeric", "'Infinity'::numeric", "'-Infinity'::numeric", '0', '-500']) {
      let amtBlocked = false;
      try {
        await db.query(`
          INSERT INTO public.payment_requests (
            user_id, store_id, customer_name, customer_phone, customer_email,
            service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
          ) VALUES (
            '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
            'dashboard_plan', 'plan_nan_test', 'Plan', 'Pro', ${badAmt}, 'bKash', 'TRX_BAD_AMT_1'
          );
        `);
      } catch {
        amtBlocked = true;
      }
      if (!amtBlocked) {
        throw new Error(`Expected bad amount (${badAmt}) to be rejected on INSERT!`);
      }
    }

    // 11f. TRUNCATE protection: blocked by revoked privilege AND by statement-level BEFORE TRUNCATE trigger even if misgranted
    let directTruncateBlocked = false;
    try {
      await db.query(`TRUNCATE TABLE public.payment_requests;`);
    } catch {
      directTruncateBlocked = true;
    }
    if (!directTruncateBlocked) throw new Error('Authenticated client truncated payment_requests!');

    await db.exec(`RESET ROLE; GRANT TRUNCATE ON TABLE public.payment_requests TO authenticated;`);
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    let triggerTruncateBlocked = false;
    try {
      await db.query(`TRUNCATE TABLE public.payment_requests;`);
    } catch (err: any) {
      if ((err.message || '').includes('cannot be truncated')) {
        triggerTruncateBlocked = true;
      }
    }
    if (!triggerTruncateBlocked) {
      throw new Error('trg_block_payment_requests_truncate failed to block TRUNCATE when privilege was temporarily granted!');
    }
    await db.exec(`RESET ROLE; REVOKE TRUNCATE ON TABLE public.payment_requests FROM authenticated;`);

    // 11g. Finally, test under SET SESSION AUTHORIZATION test_direct_login_client
    //      (where session_user = 'test_direct_login_client', role = 'none', auth.uid() = NULL)
    //      invoking owner-owned SECURITY DEFINER functions -> ALL 3 MUST RAISE 'Access denied'!
    await db.exec(`
      RESET ROLE;
      UPDATE public._test_session SET current_user_id = NULL, current_email = NULL, session_role = 'anon';
      SET SESSION AUTHORIZATION test_direct_login_client;
    `);
    for (const [label, sql] of [
      ['direct session_user null-uid definer INSERT', `SELECT public._test_null_uid_definer_insert('${userB}');`],
      ['direct session_user null-uid definer UPDATE', `SELECT public._test_null_uid_definer_update('${pendingReqId}');`],
      ['direct session_user null-uid definer DELETE', `SELECT public._test_null_uid_definer_delete('${pendingReqId}');`],
    ] as const) {
      let blocked = false;
      try {
        await db.query(sql);
      } catch (err: any) {
        if ((err.message || '').includes('Access denied')) {
          blocked = true;
        } else {
          throw new Error(`Unexpected error for ${label}: ${err.message}`);
        }
      }
      if (!blocked) throw new Error(`Bypass detected: ${label} succeeded!`);
    }
  });

  // TEST 12: Admin RPC Authorization, Anti-Oracle, Row-Count Safety & RLS Interaction
  await test('12. Admin RPCs enforce verified platform admin before row locks (zero GUC oracle), roll back if payment_requests update affects 0 rows, and leave zero residual capability tokens', async (db) => {
    const { userA, userB, adminUser, storeA, siteA1, siteA2 } = await setupHardenedFixture(db);

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const reqPendingId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_RPC_AUDIT_1'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // Seed an already-settled request and a missing-website request via owner maintenance
    await asUser(db, null, null, 'service_role');
    const reqOrphanSiteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '99999999-9999-4999-8999-999999999999', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_RPC_AUDIT_2'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // Approve reqPendingId legitimately first so we have an 'approved' row to probe for ALREADY_SETTLED oracle
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const legitApp = await db.query<{ val: any }>(`
      SELECT public.admin_approve_payment_request('${reqPendingId}', 'Initial approval') AS val;
    `);
    if (!legitApp.rows[0].val.success) throw new Error('Legitimate admin approval failed');

    // 12a. GUC-spoofed non-admin (Merchant B with request.jwt.claim.role = 'service_role') probing:
    //      - non-existent UUID
    //      - already-approved cross-tenant UUID
    //      - orphan-website pending UUID
    //      MUST raise authorization exception immediately on ALL THREE (never returning JSON oracle codes!)
    await db.exec(`
      RESET ROLE;
      UPDATE public._test_session SET current_user_id = '${userB}', current_email = 'merchant_b@test.com', session_role = 'service_role';
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claims', '{"sub":"${userB}","role":"service_role"}', false);
    `);

    for (const targetUuid of [
      '00000000-0000-4000-8000-000000000000',
      reqPendingId,
      reqOrphanSiteId,
    ]) {
      let approveRaisedAuth = false;
      try {
        await db.query(`SELECT public.admin_approve_payment_request('${targetUuid}', 'Oracle probe');`);
      } catch (err: any) {
        if ((err.message || '').includes('Only verified platform administrators can approve payment requests')) {
          approveRaisedAuth = true;
        }
      }
      if (!approveRaisedAuth) {
        throw new Error(`Cross-tenant oracle leak on admin_approve_payment_request for target ${targetUuid}`);
      }

      let rejectRaisedAuth = false;
      try {
        await db.query(`SELECT public.admin_reject_payment_request('${targetUuid}', 'Oracle probe');`);
      } catch (err: any) {
        if ((err.message || '').includes('Only verified platform administrators can reject payment requests')) {
          rejectRaisedAuth = true;
        }
      }
      if (!rejectRaisedAuth) {
        throw new Error(`Cross-tenant oracle leak on admin_reject_payment_request for target ${targetUuid}`);
      }
    }

    // 12b. service_role with NULL auth.uid() cannot invoke admin_approve_payment_request / admin_reject_payment_request
    await db.exec(`
      RESET ROLE;
      UPDATE public._test_session SET current_user_id = NULL, current_email = NULL, session_role = 'service_role';
      SET ROLE service_role;
    `);
    let nullAdminRpcBlocked = false;
    try {
      await db.query(`SELECT public.admin_reject_payment_request('${reqOrphanSiteId}', 'No reviewer UUID');`);
    } catch (err: any) {
      if ((err.message || '').includes('Only verified platform administrators')) {
        nullAdminRpcBlocked = true;
      }
    }
    if (!nullAdminRpcBlocked) {
      throw new Error('admin_reject_payment_request allowed execution with NULL auth.uid()!');
    }
    await db.exec(`RESET ROLE;`);

    // 12c. Legacy whitespace-padded website UUID in payment_requests approves cleanly, AND
    //      if payment_requests UPDATE affects 0 rows (e.g., suppressed by non-BYPASSRLS FORCE RLS or row suppression),
    //      admin_approve_payment_request raises an exception via ROW_COUNT <> 1 and rolls back subscribed_websites!
    await db.exec(`
      RESET ROLE;
      ALTER TABLE public.payment_requests DISABLE TRIGGER trg_protect_payment_request_integrity;
      INSERT INTO public.payment_requests (
        id, user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, status
      ) VALUES (
        '88888888-8888-4888-8888-888888888888', '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '  ${siteA2}  ', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_RPC_AUDIT_3', 'pending'
      );
      ALTER TABLE public.payment_requests ENABLE TRIGGER trg_protect_payment_request_integrity;

      CREATE OR REPLACE FUNCTION public._test_suppress_pr_update()
      RETURNS TRIGGER AS $fn$
      BEGIN
        RETURN NULL;
      END;
      $fn$ LANGUAGE plpgsql;

      CREATE TRIGGER zz_tmp_suppress_pr_update
        BEFORE UPDATE ON public.payment_requests
        FOR EACH ROW
        EXECUTE FUNCTION public._test_suppress_pr_update();
    `);

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    let zeroRowUpdateAbortedAtomically = false;
    try {
      await db.query(`SELECT public.admin_approve_payment_request('88888888-8888-4888-8888-888888888888', 'Should rollback');`);
    } catch (err: any) {
      if ((err.message || '').includes('Expected 1 pending payment_requests row updated, got 0')) {
        zeroRowUpdateAbortedAtomically = true;
      }
    }
    if (!zeroRowUpdateAbortedAtomically) {
      throw new Error('Expected admin_approve_payment_request to fail atomically when payment_requests UPDATE affects 0 rows');
    }

    // Verify siteA2 was NOT left marked 'paid' (full atomic rollback!)
    const siteA2AfterRollback = await db.query<{ payment_status: string }>(`
      SELECT payment_status FROM public.subscribed_websites WHERE id = '${siteA2}';
    `);
    if (siteA2AfterRollback.rows[0].payment_status !== 'pending') {
      throw new Error(`Atomic rollback failed: siteA2 payment_status became ${siteA2AfterRollback.rows[0].payment_status}`);
    }

    // Remove temporary 0-row suppression trigger and verify approval of whitespace-padded legacy UUID succeeds cleanly and leaves 0 tokens
    await db.exec(`
      RESET ROLE;
      DROP TRIGGER zz_tmp_suppress_pr_update ON public.payment_requests;
      DROP FUNCTION public._test_suppress_pr_update();
    `);
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const cleanApprove = await db.query<{ val: any }>(`
      SELECT public.admin_approve_payment_request('88888888-8888-4888-8888-888888888888', 'Approved after removing suppression trigger') AS val;
    `);
    if (!cleanApprove.rows[0].val.success) {
      throw new Error('Expected approval of whitespace-padded legacy UUID to succeed: ' + cleanApprove.rows[0].val.message);
    }

    await db.exec(`RESET ROLE;`);
    const leftoverTokens = await db.query<{ cnt: string }>(`
      SELECT count(*)::text AS cnt FROM amaas_internal.payment_review_authorizations;
    `);
    if (leftoverTokens.rows[0].cnt !== '0') {
      throw new Error(`Expected 0 residual capability tokens, found ${leftoverTokens.rows[0].cnt}`);
    }
  });

  // TEST 13: Dry-run transaction rollback safety & exact catalog parity between schema.sql and incremental migrations
  await test('13. Migration supports safe BEGIN/ROLLBACK dry-runs, aborts cleanly on duplicate bank_reference/pending service, and matches schema.sql catalog state', async (db) => {
    // 13a. Verify duplicate bank_reference preflight abort & duplicate pending service preflight abort preserve data
    await db.exec(baseSchema);
    await db.exec(`
      DROP INDEX IF EXISTS uq_payment_requests_active_transaction_id;
      DROP INDEX IF EXISTS uq_payment_requests_active_bank_reference;
      DROP INDEX IF EXISTS uq_payment_requests_pending_user_service;
      ALTER TABLE public.payment_requests DISABLE TRIGGER trg_protect_payment_request_integrity;
    `);

    const u1 = '11111111-1111-4111-8111-111111111111';
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${u1}', 'preflight@test.com');
      INSERT INTO public.payment_requests (
        user_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, bank_reference, status
      ) VALUES
        ('${u1}', 'C1', '01700000000', 'p@test.com', 'dashboard_plan', 'plan_a', 'Plan A', 'Pro', 1000, 'Bank Transfer', 'ref-999', 'pending'),
        ('${u1}', 'C2', '01700000000', 'p@test.com', 'dashboard_plan', 'plan_b', 'Plan B', 'Pro', 1000, 'Bank Transfer', '  REF-999 ', 'approved');
      ALTER TABLE public.payment_requests ENABLE TRIGGER trg_protect_payment_request_integrity;
    `);

    let bankDupMsg = '';
    try {
      await db.exec(migration20261024);
    } catch (err: any) {
      bankDupMsg = err.message || String(err);
    }
    if (!bankDupMsg.includes('Duplicate active/approved bank_reference values detected')) {
      throw new Error(`Expected duplicate bank_reference preflight abort, got: ${bankDupMsg}`);
    }

    // 13b. Verify staging dry-run pattern `BEGIN; <migration20261024>; ROLLBACK;` does NOT prematurely commit!
    const dryRunDb = new PGlite();
    await initSupabaseMockEnv(dryRunDb);
    await dryRunDb.exec(baseSchema);
    await dryRunDb.exec(`
      DROP SCHEMA IF EXISTS amaas_internal CASCADE;
      CREATE POLICY legacy_dryrun_marker ON public.payment_requests FOR SELECT TO authenticated USING (true);
    `);
    await dryRunDb.exec(`BEGIN;\n${migration20261024}\nROLLBACK;`);
    const markerStillThere = await dryRunDb.query(`
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_requests' AND policyname = 'legacy_dryrun_marker';
    `);
    if (markerStillThere.rows.length !== 1) {
      throw new Error('BEGIN ... ROLLBACK dry-run did not roll back cleanly (migration may contain an embedded COMMIT)!');
    }

    // 13c. Compare fresh schema.sql DB vs incremental migration chain DB
    const schemaDb = new PGlite();
    await initSupabaseMockEnv(schemaDb);
    await schemaDb.exec(baseSchema);

    const chainDb = new PGlite();
    await initSupabaseMockEnv(chainDb);
    await chainDb.exec(`
      CREATE TABLE public.profiles (
        id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
        email TEXT, full_name TEXT,
        role TEXT DEFAULT 'merchant' CHECK (role IN ('merchant', 'admin')),
        onboarding_completed BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.stores (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.products (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL, sku TEXT NOT NULL, price NUMERIC NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.orders (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        customer_name TEXT NOT NULL, total_amount NUMERIC NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.customers (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.subscribed_websites (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
        business_name TEXT NOT NULL, niche TEXT NOT NULL, subdomain TEXT UNIQUE NOT NULL, full_domain TEXT NOT NULL,
        template_id TEXT, template_name TEXT,
        status TEXT DEFAULT 'active', plan_tier TEXT DEFAULT 'Website Lite', monthly_fee NUMERIC DEFAULT 600, currency TEXT DEFAULT 'BDT',
        subscribed_at TIMESTAMPTZ DEFAULT NOW(), current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
        grace_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '37 days'),
        deployment_status TEXT DEFAULT 'deploying', config JSONB DEFAULT '{}'::jsonb,
        resource_usage JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.inventory_movements (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
        change_amount INTEGER NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.support_tickets (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
        subject TEXT NOT NULL, description TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await chainDb.exec(migration20261010);
    await chainDb.exec(migration20261015Trials);
    await chainDb.exec(migration20261015Payments);
    await chainDb.exec(migration20261017);
    await chainDb.exec(migration20261018);
    await chainDb.exec(migration20261024);
    await chainDb.exec(migration20261026);
    await chainDb.exec(migration20261029);

    async function snapshotCatalog(targetDb: PGlite) {
      const policies = (
        await targetDb.query(`
          SELECT policyname, permissive, roles::text, cmd, qual, with_check
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'payment_requests'
          ORDER BY policyname;
        `)
      ).rows;

      const indexes = (
        await targetDb.query(`
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'payment_requests'
          ORDER BY indexname;
        `)
      ).rows;

      const triggers = (
        await targetDb.query(`
          SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS tgdef
          FROM pg_trigger
          WHERE tgrelid = 'public.payment_requests'::regclass AND NOT tgisinternal
          ORDER BY tgname;
        `)
      ).rows;

      const funcs = (
        await targetDb.query(`
          SELECT p.proname, p.prosecdef, p.provolatile, p.proconfig, trim(p.prosrc) AS prosrc
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN (
              'is_verified_platform_admin',
              'can_submit_payment_request',
              'admin_approve_payment_request',
              'admin_reject_payment_request',
              'protect_payment_request_integrity',
              'block_payment_requests_truncate'
            )
          ORDER BY p.proname;
        `)
      ).rows;

      const privs = (
        await targetDb.query(`
          SELECT
            r AS role_name,
            has_table_privilege(r, 'public.payment_requests', 'SELECT') AS pr_select,
            has_table_privilege(r, 'public.payment_requests', 'INSERT') AS pr_insert,
            has_table_privilege(r, 'public.payment_requests', 'UPDATE') AS pr_update,
            has_table_privilege(r, 'public.payment_requests', 'DELETE') AS pr_delete,
            has_table_privilege(r, 'public.payment_requests', 'TRUNCATE') AS pr_truncate,
            has_schema_privilege(r, 'amaas_internal', 'USAGE') AS internal_usage,
            has_function_privilege(r, 'public.admin_approve_payment_request(uuid, text)', 'EXECUTE') AS exec_approve,
            has_function_privilege(r, 'public.admin_reject_payment_request(uuid, text)', 'EXECUTE') AS exec_reject,
            has_function_privilege(r, 'public.can_submit_payment_request(uuid, uuid, text, text, text)', 'EXECUTE') AS exec_submit,
            has_function_privilege(r, 'public.is_verified_platform_admin(uuid)', 'EXECUTE') AS exec_is_admin
          FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r
          ORDER BY r;
        `)
      ).rows;

      return { policies, indexes, triggers, funcs, privs };
    }

    const snapSchema = await snapshotCatalog(schemaDb);
    const snapChain = await snapshotCatalog(chainDb);

    for (const key of ['policies', 'indexes', 'triggers', 'funcs', 'privs'] as const) {
      if (JSON.stringify(snapSchema[key]) !== JSON.stringify(snapChain[key])) {
        throw new Error(
          `Catalog parity mismatch between schema.sql and migration chain on "${key}":\nschema=${JSON.stringify(
            snapSchema[key]
          )}\nchain=${JSON.stringify(snapChain[key])}`
        );
      }
    }
  });

  // TEST 14: Focused Capability-Token & Co-Owned SECURITY DEFINER Adversarial Regression Suite
  await test('14. Capability-token mechanism resists co-owned SECURITY DEFINER abuse, GUC profile self-promotion, search_path operator hijacking, and token forgery/reuse/rebinding', async (db) => {
    const { userA, userB, adminUser, storeA, storeB, siteA1, siteB1 } = await setupHardenedFixture(db);
    const adminUser2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${adminUser2}', 'admin2@amaas.xyz');
      UPDATE public.profiles SET role = 'admin' WHERE id = '${adminUser2}';
    `);

    // Create two pending requests owned by userA (victimReqId and otherReqId)
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const victimReqId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_CAP_TOKEN_VICTIM_1'
        ) RETURNING id;
      `)
    ).rows[0].id;

    const otherReqId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'dashboard_plan', 'plan_enterprise', 'Enterprise Plan', 'Enterprise', 2500, 'bKash', 'TRX_CAP_TOKEN_VICTIM_2'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // ---------------------------------------------------------------------------
    // 14a. Catalog audit of amaas_internal & ALL owner-owned SECURITY DEFINER functions
    // ---------------------------------------------------------------------------
    await db.exec(`RESET ROLE;`);

    const internalRoutines = await db.query(`
      SELECT p.proname
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'amaas_internal';
    `);
    if (internalRoutines.rows.length !== 0) {
      throw new Error(`Expected 0 routines in amaas_internal, found: ${JSON.stringify(internalRoutines.rows)}`);
    }

    const secDefFuncs = (
      await db.query<{
        sig: string;
        proname: string;
        proconfig: string[] | null;
        public_exec: boolean;
        anon_exec: boolean;
        auth_exec: boolean;
      }>(`
        SELECT
          p.oid::pg_catalog.regprocedure::text AS sig,
          p.proname,
          p.proconfig,
          EXISTS (
            SELECT 1
            FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
            WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
          ) AS public_exec,
          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_catalog.pg_class c ON c.oid = 'public.payment_requests'::pg_catalog.regclass
        WHERE n.nspname = 'public'
          AND p.prosecdef = true
          AND p.proowner = c.relowner
        ORDER BY p.proname;
      `)
    ).rows;

    if (secDefFuncs.length < 22) {
      throw new Error(`Expected at least 22 co-owned SECURITY DEFINER functions in public, found ${secDefFuncs.length}`);
    }

    for (const fn of secDefFuncs) {
      const cfg = (fn.proconfig || []).join('; ');
      if (!cfg.includes('search_path=pg_catalog, public, pg_temp')) {
        throw new Error(`Co-owned SECURITY DEFINER function ${fn.sig} lacks locked pg_catalog-first search_path: ${cfg}`);
      }
      if (fn.public_exec) {
        throw new Error(`Co-owned SECURITY DEFINER function ${fn.sig} still grants EXECUTE to PUBLIC`);
      }
    }

    const anonCallable = secDefFuncs.filter((f) => f.anon_exec).map((f) => f.proname).sort();
    if (JSON.stringify(anonCallable) !== JSON.stringify(['check_subdomain_availability', 'get_published_website_by_subdomain'])) {
      throw new Error(`Unexpected anon-callable SECURITY DEFINER functions: ${JSON.stringify(anonCallable)}`);
    }

    // Direct access to amaas_internal.payment_review_authorizations must fail for anon, authenticated, AND service_role
    for (const roleName of ['anon', 'authenticated', 'service_role'] as const) {
      await db.exec(`RESET ROLE; SET ROLE ${roleName};`);
      for (const stmt of [
        `SELECT * FROM amaas_internal.payment_review_authorizations;`,
        `INSERT INTO amaas_internal.payment_review_authorizations VALUES ('1', '${victimReqId}', 'approved', '${adminUser}', 'admin_approve_payment_request');`,
        `DELETE FROM amaas_internal.payment_review_authorizations;`,
      ]) {
        let denied = false;
        try {
          await db.query(stmt);
        } catch {
          denied = true;
        }
        if (!denied) {
          throw new Error(`Role ${roleName} unexpectedly accessed amaas_internal.payment_review_authorizations via: ${stmt}`);
        }
      }
    }
    await db.exec(`RESET ROLE;`);

    // ---------------------------------------------------------------------------
    // 14b. Regression: GUC spoofing cannot self-promote profiles.role = 'admin' to mint tokens
    // ---------------------------------------------------------------------------
    await db.exec(`
      RESET ROLE;
      UPDATE public._test_session
      SET current_user_id = '${userB}', current_email = 'merchant_b@test.com', session_role = 'service_role';
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claims', '{"sub":"${userB}","role":"service_role"}', false);
    `);

    const spoofIsAdmin = await db.query<{ val: boolean }>(`SELECT public.is_admin() AS val;`);
    if (spoofIsAdmin.rows[0].val !== false) {
      throw new Error('GUC-spoofed authenticated session caused public.is_admin() to return true!');
    }

    const enumOtherAdmin = await db.query<{ val: boolean }>(`
      SELECT public.is_verified_platform_admin('${adminUser}') AS val;
    `);
    if (enumOtherAdmin.rows[0].val !== false) {
      throw new Error('is_verified_platform_admin leaked another user UUID admin status to authenticated caller!');
    }

    let selfPromoteBlocked = false;
    try {
      await db.query(`UPDATE public.profiles SET role = 'admin' WHERE id = '${userB}';`);
    } catch (err: any) {
      if ((err.message || '').includes('Access denied')) {
        selfPromoteBlocked = true;
      }
    }
    if (!selfPromoteBlocked) {
      throw new Error('CRITICAL: GUC-spoofed authenticated user self-promoted public.profiles.role to admin!');
    }

    // Attempt profile DELETE + re-INSERT with role = 'admin'
    await db.query(`DELETE FROM public.profiles WHERE id = '${userB}';`);
    const roleStillMerchant = await db.query<{ role: string }>(`
      SELECT role FROM public.profiles WHERE id = '${userB}';
    `);
    if (roleStillMerchant.rows.length !== 1 || roleStillMerchant.rows[0].role !== 'merchant') {
      throw new Error('GUC-spoofed authenticated user deleted or altered their own profile row!');
    }

    const orphanUser = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await db.exec(`
      RESET ROLE;
      INSERT INTO auth.users (id, email) VALUES ('${orphanUser}', 'orphan@test.com');
      DELETE FROM public.profiles WHERE id = '${orphanUser}';
      UPDATE public._test_session
      SET current_user_id = '${orphanUser}', current_email = 'orphan@test.com', session_role = 'service_role';
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claims', '{"sub":"${orphanUser}","role":"service_role"}', false);
    `);
    let insertAdminProfileBlocked = false;
    try {
      await db.query(`INSERT INTO public.profiles (id, email, role) VALUES ('${orphanUser}', 'orphan@test.com', 'admin');`);
    } catch {
      insertAdminProfileBlocked = true;
    }
    if (!insertAdminProfileBlocked) {
      throw new Error('CRITICAL: GUC-spoofed authenticated user inserted a profile with role = admin!');
    }

    // Verify admin RPCs remain strictly blocked after all self-promotion attempts
    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    await db.exec(`
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claims', '{"sub":"${userB}","role":"service_role"}', false);
    `);
    for (const rpcSql of [
      `SELECT public.admin_approve_payment_request('${victimReqId}', 'Attempt after self-promotion');`,
      `SELECT public.admin_reject_payment_request('${victimReqId}', 'Attempt after self-promotion');`,
    ]) {
      let rpcBlocked = false;
      try {
        await db.query(rpcSql);
      } catch (err: any) {
        if ((err.message || '').includes('Only verified platform administrators')) {
          rpcBlocked = true;
        }
      }
      if (!rpcBlocked) {
        throw new Error(`Unauthorized caller executed ${rpcSql}`);
      }
    }

    // ---------------------------------------------------------------------------
    // 14c. Adversarial invocation of EVERY exposed owner-owned SECURITY DEFINER function
    //      under an attacker-controlled search_path with trojan = and != operators
    // ---------------------------------------------------------------------------
    await db.exec(`
      RESET ROLE;
      CREATE SCHEMA attacker_hijack;
      GRANT USAGE, CREATE ON SCHEMA attacker_hijack TO anon, authenticated;

      CREATE TABLE attacker_hijack.pwned_log (
        id SERIAL PRIMARY KEY,
        executed_as TEXT NOT NULL,
        detail TEXT NOT NULL
      );
      GRANT ALL ON TABLE attacker_hijack.pwned_log TO anon, authenticated;
      GRANT ALL ON SEQUENCE attacker_hijack.pwned_log_id_seq TO anon, authenticated;

      CREATE OR REPLACE FUNCTION attacker_hijack.trojan_text_eq(a TEXT, b TEXT)
      RETURNS BOOLEAN AS $fn$
      BEGIN
        IF current_user NOT IN ('anon', 'authenticated') THEN
          INSERT INTO attacker_hijack.pwned_log (executed_as, detail)
          VALUES (current_user, 'trojan_text_eq');

          INSERT INTO amaas_internal.payment_review_authorizations (
            txid, request_id, target_status, reviewer_id, rpc_name
          ) VALUES (
            pg_catalog.pg_current_xact_id()::TEXT,
            '${victimReqId}'::UUID,
            'approved',
            '${adminUser}'::UUID,
            'admin_approve_payment_request'
          ) ON CONFLICT DO NOTHING;

          UPDATE public.payment_requests
          SET status = 'approved', admin_notes = 'PWNED_VIA_TROJAN_OP', reviewed_by = '${adminUser}'::UUID, reviewed_at = NOW()
          WHERE id = '${victimReqId}'::UUID;
        END IF;
        RETURN pg_catalog.texteq(a, b);
      END;
      $fn$ LANGUAGE plpgsql VOLATILE;

      CREATE OR REPLACE FUNCTION attacker_hijack.trojan_text_ne(a TEXT, b TEXT)
      RETURNS BOOLEAN AS $fn$
      BEGIN
        IF current_user NOT IN ('anon', 'authenticated') THEN
          INSERT INTO attacker_hijack.pwned_log (executed_as, detail)
          VALUES (current_user, 'trojan_text_ne');
        END IF;
        RETURN pg_catalog.textne(a, b);
      END;
      $fn$ LANGUAGE plpgsql VOLATILE;

      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA attacker_hijack TO PUBLIC, anon, authenticated;

      CREATE OPERATOR attacker_hijack.= (
        LEFTARG = TEXT,
        RIGHTARG = TEXT,
        PROCEDURE = attacker_hijack.trojan_text_eq
      );

      CREATE OPERATOR attacker_hijack.!= (
        LEFTARG = TEXT,
        RIGHTARG = TEXT,
        PROCEDURE = attacker_hijack.trojan_text_ne
      );
    `);

    // Exercise anon-callable SECURITY DEFINER functions with poisoned search_path
    await asUser(db, null, null, 'anon');
    await db.exec(`SET search_path = attacker_hijack, pg_temp, public, pg_catalog;`);

    let anonTrialDenied = false;
    try {
      await db.query(`SELECT public.activate_service_trial('svc_1', 'Svc 1', 'cat', NULL);`);
    } catch {
      anonTrialDenied = true;
    }
    if (!anonTrialDenied) {
      throw new Error('anon was able to execute public.activate_service_trial!');
    }

    await db.query(`SELECT public.check_subdomain_availability('alphacafe');`);
    await db.query(`SELECT public.get_published_website_by_subdomain('alphacafe');`);

    // Exercise EVERY authenticated-callable co-owned SECURITY DEFINER function & reachable trigger as userB
    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    await db.exec(`SET search_path = attacker_hijack, pg_temp, public, pg_catalog;`);

    // 1 & 2) activate_service_trial (first call INSERTs, second call hits FOUND branch with text `=`)
    await db.query(`SELECT public.activate_service_trial('ai_sales_agent', 'AI Sales Agent', 'ai_automation', '${storeB}');`);
    await db.query(`SELECT public.activate_service_trial('ai_sales_agent', 'AI Sales Agent', 'ai_automation', '${storeB}');`);

    // 3) Trigger protect_service_trial_invariants (SECURITY DEFINER trigger on service_trials UPDATE)
    await db.query(`
      UPDATE public.service_trials
      SET service_name = 'AI Sales Agent v2'
      WHERE user_id = '${userB}' AND service_id = 'ai_sales_agent';
    `);

    // 4-10) Helper & public website resolution SECURITY DEFINER functions
    await db.query(`SELECT public.is_admin();`);
    await db.query(`SELECT public.is_verified_platform_admin('${userB}');`);
    await db.query(`SELECT public.can_access_store('${storeB}');`);
    await db.query(`SELECT public.can_access_store('${storeA}');`);
    await db.query(`SELECT public.can_manage_store('${storeB}');`);
    await db.query(`SELECT public.can_manage_store('${storeA}');`);
    await db.query(`SELECT public.can_submit_payment_request('${userB}', '${storeB}', 'website_subscription', '${siteB1}', 'pending');`);
    await db.query(`SELECT public.can_submit_payment_request('${userB}', '${storeB}', 'website_subscription', '${siteA1}', 'pending');`);
    await db.query(`SELECT public.check_subdomain_availability('betagadgets');`);
    await db.query(`SELECT public.get_published_website_by_subdomain('betagadgets');`);

    // 11-13) Client website lifecycle SECURITY DEFINER RPCs (own site + cross-tenant siteA1 attempt)
    await db.query(`SELECT public.publish_client_website('${siteB1}');`);
    await db.query(`SELECT public.unpublish_client_website('${siteB1}');`);
    await db.query(`SELECT public.cancel_client_website_subscription('${siteB1}');`);

    for (const crossSiteSql of [
      `SELECT public.publish_client_website('${siteA1}');`,
      `SELECT public.unpublish_client_website('${siteA1}');`,
      `SELECT public.cancel_client_website_subscription('${siteA1}');`,
      `SELECT public.admin_delete_subscribed_website('${siteA1}');`,
    ]) {
      let failedOrDenied = false;
      try {
        const res = await db.query<{ val: any }>(crossSiteSql.replace(';', ' AS val;'));
        if (res.rows[0]?.val && res.rows[0].val.success === false) {
          failedOrDenied = true;
        }
      } catch {
        failedOrDenied = true;
      }
      if (!failedOrDenied) {
        throw new Error(`Cross-tenant website RPC unexpectedly succeeded for userB: ${crossSiteSql}`);
      }
    }

    // Trigger remaining co-owned SECURITY DEFINER triggers via legitimate tenant DML under poisoned search_path
    await db.query(`UPDATE public.profiles SET full_name = 'Merchant B Updated' WHERE id = '${userB}';`);
    await db.query(`
      INSERT INTO public.store_members (store_id, name, email, role, status)
      VALUES ('${storeB}', 'B Staff', 'bstaff@test.com', 'staff', 'invited');
    `);

    await db.exec(`RESET ROLE; SET search_path = pg_catalog, public;`);

    const pwnedRows = await db.query(`SELECT * FROM attacker_hijack.pwned_log;`);
    if (pwnedRows.rows.length !== 0) {
      throw new Error(`CRITICAL: Trojan search_path operator executed inside SECURITY DEFINER context: ${JSON.stringify(pwnedRows.rows)}`);
    }

    const residualTokensAfterHijack = await db.query<{ cnt: string }>(`
      SELECT count(*)::text AS cnt FROM amaas_internal.payment_review_authorizations;
    `);
    if (residualTokensAfterHijack.rows[0].cnt !== '0') {
      throw new Error(`CRITICAL: Unauthorized capability token minted: count=${residualTokensAfterHijack.rows[0].cnt}`);
    }

    const victimAfterHijack = await db.query<{
      status: string;
      reviewed_by: string | null;
      reviewed_at: string | null;
      admin_notes: string | null;
    }>(`
      SELECT status, reviewed_by, reviewed_at, admin_notes
      FROM public.payment_requests
      WHERE id = '${victimReqId}';
    `);
    if (
      victimAfterHijack.rows[0].status !== 'pending' ||
      victimAfterHijack.rows[0].reviewed_by !== null ||
      victimAfterHijack.rows[0].reviewed_at !== null ||
      victimAfterHijack.rows[0].admin_notes !== null
    ) {
      throw new Error(`CRITICAL: Victim payment request was mutated during adversarial definer sweep: ${JSON.stringify(victimAfterHijack.rows[0])}`);
    }

    await db.exec(`DROP SCHEMA attacker_hijack CASCADE;`);

    // ---------------------------------------------------------------------------
    // 14d. Strict 4-way capability-token binding (txid, request_id, target_status/rpc_name, reviewer_id)
    //      and single-use atomic consumption
    // ---------------------------------------------------------------------------
    // Verify chk_payment_review_auth_rpc_status_pair blocks mismatched (rpc_name, target_status)
    for (const [badRpc, badStatus] of [
      ['admin_approve_payment_request', 'rejected'],
      ['admin_reject_payment_request', 'approved'],
    ] as const) {
      let checkFailed = false;
      try {
        await db.query(`
          INSERT INTO amaas_internal.payment_review_authorizations (txid, request_id, target_status, reviewer_id, rpc_name)
          VALUES ('tx_mismatch_test', '${victimReqId}', '${badStatus}', '${adminUser}', '${badRpc}');
        `);
      } catch (err: any) {
        if ((err.message || '').includes('chk_payment_review_auth_rpc_status_pair')) {
          checkFailed = true;
        }
      }
      if (!checkFailed) {
        throw new Error(`Expected chk_payment_review_auth_rpc_status_pair to reject (${badRpc}, ${badStatus})`);
      }
    }

    // Create a temporary owner-owned SECURITY DEFINER test harness to prove that even an owner-owned
    // UPDATE statement cannot succeed unless a token bound to ALL FOUR attributes exists in the current txid,
    // and that each token is strictly single-use.
    await db.exec(`
      CREATE OR REPLACE FUNCTION public._test_owner_update_with_seeded_token(
        p_seed_txid TEXT,
        p_seed_req UUID,
        p_seed_status TEXT,
        p_seed_reviewer UUID,
        p_seed_rpc TEXT,
        p_update_req UUID,
        p_update_status TEXT,
        p_update_reviewer UUID
      ) RETURNS VOID AS $fn$
      BEGIN
        IF p_seed_txid IS NOT NULL THEN
          INSERT INTO amaas_internal.payment_review_authorizations (
            txid, request_id, target_status, reviewer_id, rpc_name
          ) VALUES (
            CASE WHEN p_seed_txid = 'CURRENT' THEN pg_catalog.pg_current_xact_id()::TEXT ELSE p_seed_txid END,
            p_seed_req,
            p_seed_status,
            p_seed_reviewer,
            p_seed_rpc
          );
        END IF;

        UPDATE public.payment_requests
        SET status = p_update_status,
            reviewed_by = p_update_reviewer,
            reviewed_at = NOW(),
            admin_notes = 'Binding test'
        WHERE id = p_update_req;
      END;
      $fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
      GRANT EXECUTE ON FUNCTION public._test_owner_update_with_seeded_token(TEXT, UUID, TEXT, UUID, TEXT, UUID, TEXT, UUID) TO authenticated;
    `);

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');

    const bindingNegativeCases: Array<[string, string]> = [
      [
        'no token minted',
        `SELECT public._test_owner_update_with_seeded_token(NULL, NULL, NULL, NULL, NULL, '${victimReqId}', 'approved', '${adminUser}');`,
      ],
      [
        'stale/wrong txid token',
        `SELECT public._test_owner_update_with_seeded_token('999999999', '${victimReqId}', 'approved', '${adminUser}', 'admin_approve_payment_request', '${victimReqId}', 'approved', '${adminUser}');`,
      ],
      [
        'wrong request_id token (cross-request replay in same txid)',
        `SELECT public._test_owner_update_with_seeded_token('CURRENT', '${otherReqId}', 'approved', '${adminUser}', 'admin_approve_payment_request', '${victimReqId}', 'approved', '${adminUser}');`,
      ],
      [
        'wrong target_status token (approved token used for rejected update)',
        `SELECT public._test_owner_update_with_seeded_token('CURRENT', '${victimReqId}', 'approved', '${adminUser}', 'admin_approve_payment_request', '${victimReqId}', 'rejected', '${adminUser}');`,
      ],
      [
        'wrong reviewer_id token (bound to adminUser2 while caller is adminUser)',
        `SELECT public._test_owner_update_with_seeded_token('CURRENT', '${victimReqId}', 'approved', '${adminUser2}', 'admin_approve_payment_request', '${victimReqId}', 'approved', '${adminUser}');`,
      ],
      [
        'forged reviewed_by column mismatching caller',
        `SELECT public._test_owner_update_with_seeded_token('CURRENT', '${victimReqId}', 'approved', '${adminUser}', 'admin_approve_payment_request', '${victimReqId}', 'approved', '${adminUser2}');`,
      ],
    ];

    for (const [label, sql] of bindingNegativeCases) {
      let rejected = false;
      try {
        await db.query(sql);
      } catch (err: any) {
        if ((err.message || '').includes('Access denied')) {
          rejected = true;
        } else {
          throw new Error(`Unexpected error on ${label}: ${err.message}`);
        }
      }
      if (!rejected) {
        throw new Error(`Token binding bypass: ${label} unexpectedly succeeded!`);
      }
    }

    // Even if a token were somehow bound to non-admin userB, trigger re-verifies is_verified_platform_admin(v_caller_id)
    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    let unverifiedReviewerBlocked = false;
    try {
      await db.query(`
        SELECT public._test_owner_update_with_seeded_token(
          'CURRENT', '${victimReqId}', 'approved', '${userB}', 'admin_approve_payment_request',
          '${victimReqId}', 'approved', '${userB}'
        );
      `);
    } catch (err: any) {
      if ((err.message || '').includes('Access denied: Only verified platform administrators can review payment requests')) {
        unverifiedReviewerBlocked = true;
      }
    }
    if (!unverifiedReviewerBlocked) {
      throw new Error('Expected trigger to reject capability token bound to non-admin reviewer_id!');
    }

    // Single-use proof: after legitimate admin_approve_payment_request consumes its token in the same transaction,
    // a second UPDATE in the exact same transaction has no remaining token and fails with Access denied!
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    let reuseInSameTxBlocked = false;
    try {
      await db.exec(`
        BEGIN;
        SELECT public.admin_approve_payment_request('${victimReqId}', 'First legitimate approval');
        SELECT public._test_owner_update_with_seeded_token(
          NULL, NULL, NULL, NULL, NULL,
          '${victimReqId}', 'rejected', '${adminUser}'
        );
        COMMIT;
      `);
    } catch (err: any) {
      await db.exec(`ROLLBACK;`);
      if ((err.message || '').includes('Access denied: Direct updates to payment requests are not permitted')) {
        reuseInSameTxBlocked = true;
      } else {
        throw new Error(`Unexpected error during single-use same-tx replay test: ${err.message}`);
      }
    }
    if (!reuseInSameTxBlocked) {
      throw new Error('Capability token was reused for a second UPDATE inside the same transaction!');
    }

    // Clean up temporary harness and verify legitimate approval still works cleanly end-to-end
    await db.exec(`
      RESET ROLE;
      DROP FUNCTION public._test_owner_update_with_seeded_token(TEXT, UUID, TEXT, UUID, TEXT, UUID, TEXT, UUID);
    `);

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const finalLegitApprove = await db.query<{ val: any }>(`
      SELECT public.admin_approve_payment_request('${victimReqId}', 'Verified final approval') AS val;
    `);
    if (!finalLegitApprove.rows[0].val.success) {
      throw new Error(`Final legitimate approval failed: ${JSON.stringify(finalLegitApprove.rows[0].val)}`);
    }

    await db.exec(`RESET ROLE;`);
    const finalTokenCount = await db.query<{ cnt: string }>(`
      SELECT count(*)::text AS cnt FROM amaas_internal.payment_review_authorizations;
    `);
    if (finalTokenCount.rows[0].cnt !== '0') {
      throw new Error(`Expected 0 tokens after legitimate approval, found ${finalTokenCount.rows[0].cnt}`);
    }
  });

  // TEST 15: Non-Superuser Supabase Role Topology, Dotted/Hyphenated Role Names, Procedures/proconfig Edge Cases,
  //          Missing-20261017 & Legacy-Overload Preflight Guards, and Observed Token Mint/Consume Telemetry
  await test('15. Non-superuser Supabase topology (dotted/hyphenated roles, PostgREST authenticator, procedures, SET search_path=\'\', overload & 20261017 preflight guards, and approve/reject token telemetry)', async () => {
    // 15a. Missing 20261017 columns (payment_status, updated_at on subscribed_websites) must abort cleanly in Section 1 and roll back
    const missing20261017Db = new PGlite();
    await initSupabaseMockEnv(missing20261017Db);
    await missing20261017Db.exec(`
      CREATE TABLE public.profiles (
        id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
        email TEXT, full_name TEXT,
        role TEXT DEFAULT 'merchant' CHECK (role IN ('merchant', 'admin')),
        onboarding_completed BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.stores (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.products (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL, sku TEXT NOT NULL, price NUMERIC NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.orders (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        customer_name TEXT NOT NULL, total_amount NUMERIC NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.customers (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.subscribed_websites (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
        business_name TEXT NOT NULL, niche TEXT NOT NULL, subdomain TEXT UNIQUE NOT NULL, full_domain TEXT NOT NULL,
        status TEXT DEFAULT 'active', current_period_end TIMESTAMPTZ, grace_period_end TIMESTAMPTZ,
        deployment_status TEXT DEFAULT 'deploying', resource_usage JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.inventory_movements (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
        change_amount INTEGER NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.support_tickets (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
        subject TEXT NOT NULL, description TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await missing20261017Db.exec(migration20261010);
    await missing20261017Db.exec(migration20261015Trials);
    await missing20261017Db.exec(migration20261015Payments);
    // Intentionally skip migration20261017 (so payment_status & updated_at are absent on subscribed_websites)
    await missing20261017Db.exec(migration20261018);

    let missingSwColErr = '';
    try {
      await missing20261017Db.exec(`BEGIN;\n${migration20261024}\nCOMMIT;`);
    } catch (err: any) {
      await missing20261017Db.exec(`ROLLBACK;`);
      missingSwColErr = err.message || String(err);
    }
    if (!missingSwColErr.includes('"public.subscribed_websites" is missing required columns') || !missingSwColErr.includes('payment_status')) {
      throw new Error(`Expected Section 1 prerequisite error for missing subscribed_websites.payment_status, got: ${missingSwColErr}`);
    }
    const noInternalSchemaAfterRollback = await missing20261017Db.query(`
      SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'amaas_internal';
    `);
    if (noInternalSchemaAfterRollback.rows.length !== 0) {
      throw new Error('Failed migration did not roll back amaas_internal schema creation!');
    }

    // 15b. Legacy 1-arg RPC overload (e.g. admin_approve_payment_request(uuid)) must be rejected in Section 1
    await missing20261017Db.exec(migration20261017);
    await missing20261017Db.exec(`
      CREATE OR REPLACE FUNCTION public.admin_approve_payment_request(p_request_id UUID)
      RETURNS JSONB AS $$
      BEGIN
        RETURN jsonb_build_object('success', true, 'legacy_bypass', true);
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);
    let overloadErr = '';
    try {
      await missing20261017Db.exec(`BEGIN;\n${migration20261024}\nCOMMIT;`);
    } catch (err: any) {
      await missing20261017Db.exec(`ROLLBACK;`);
      overloadErr = err.message || String(err);
    }
    if (!overloadErr.includes('Unexpected legacy RPC overload(s) found')) {
      throw new Error(`Expected Section 1 overload guard to reject 1-arg admin_approve_payment_request(uuid), got: ${overloadErr}`);
    }

    // 15c. Full Non-Superuser Supabase Cloud Simulation with Dotted/Hyphenated Role Names
    const supaDb = new PGlite();
    await supaDb.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE "authenticator.pooler-01" NOSUPERUSER NOINHERIT LOGIN;
      GRANT anon, authenticated, service_role TO "authenticator.pooler-01";

      CREATE ROLE "postgres.staging-01" NOSUPERUSER CREATEROLE CREATEDB BYPASSRLS LOGIN;
      GRANT USAGE, CREATE ON SCHEMA public TO "postgres.staging-01";
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    `);
    // Ensure CREATE SCHEMA amaas_internal works for non-superuser "postgres.staging-01" on current DB
    const dbNameRes = await supaDb.query<{ d: string }>(`SELECT current_database() AS d;`);
    await supaDb.exec(`GRANT CREATE ON DATABASE "${dbNameRes.rows[0].d}" TO "postgres.staging-01";`);

    // Create auth schema owned by a separate auth admin role (mirroring Supabase's supabase_auth_admin)
    await supaDb.exec(`
      CREATE ROLE supabase_auth_admin NOSUPERUSER LOGIN;
      CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
      GRANT USAGE ON SCHEMA auth TO "postgres.staging-01", "authenticator.pooler-01", anon, authenticated, service_role;

      SET SESSION AUTHORIZATION supabase_auth_admin;
      CREATE TABLE auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT,
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE auth._test_session (
        current_user_id UUID,
        current_email TEXT,
        session_role TEXT DEFAULT 'authenticated'
      );
      INSERT INTO auth._test_session VALUES (NULL, NULL, 'authenticated');

      GRANT ALL ON TABLE auth.users TO "postgres.staging-01", service_role;
      GRANT SELECT ON TABLE auth.users TO authenticated;
      GRANT SELECT, UPDATE ON TABLE auth._test_session TO "postgres.staging-01", "authenticator.pooler-01", service_role;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT current_user_id FROM auth._test_session LIMIT 1;
      $$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, auth;

      CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT AS $$
        SELECT current_email FROM auth._test_session LIMIT 1;
      $$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, auth;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
        SELECT session_role FROM auth._test_session LIMIT 1;
      $$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, auth;

      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
        SELECT COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
      $$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, auth;

      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO "postgres.staging-01", anon, authenticated, service_role;
      RESET SESSION AUTHORIZATION;
    `);

    // Now switch to NON-SUPERUSER dotted/hyphenated owner "postgres.staging-01" to build tables & run all migrations!
    await supaDb.exec(`
      RESET ROLE;
      RESET SESSION AUTHORIZATION;
      SET SESSION AUTHORIZATION "postgres.staging-01";

      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, anon, service_role;

      CREATE TABLE public.profiles (
        id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
        email TEXT, full_name TEXT,
        role TEXT DEFAULT 'merchant' CHECK (role IN ('merchant', 'admin')),
        onboarding_completed BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.stores (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.products (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL, sku TEXT NOT NULL, price NUMERIC NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.orders (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        customer_name TEXT NOT NULL, total_amount NUMERIC NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.customers (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.subscribed_websites (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
        business_name TEXT NOT NULL, niche TEXT NOT NULL, subdomain TEXT UNIQUE NOT NULL, full_domain TEXT NOT NULL,
        status TEXT DEFAULT 'active', current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
        grace_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '37 days'),
        deployment_status TEXT DEFAULT 'deploying', resource_usage JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.inventory_movements (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
        change_amount INTEGER NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.support_tickets (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
        subject TEXT NOT NULL, description TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await supaDb.exec(migration20261010);
    await supaDb.exec(migration20261015Trials);
    await supaDb.exec(migration20261015Payments);
    await supaDb.exec(migration20261017);
    await supaDb.exec(migration20261018);

    // Seed co-owned SECURITY DEFINER edge cases before running 20261024:
    // 1) A SECURITY DEFINER PROCEDURE without search_path (must be hardened via ALTER PROCEDURE)
    // 2) A SECURITY DEFINER FUNCTION with strict SET search_path = '' (must NOT be clobbered)
    // 3) A SECURITY DEFINER FUNCTION with quoted SET search_path = "pg_catalog", "public" (must be accepted)
    // 4) A SECURITY DEFINER FUNCTION with unsafe pg_temp-before-public search_path (must be fixed)
    await supaDb.exec(`
      CREATE OR REPLACE PROCEDURE public._test_coowned_definer_proc()
      LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN
        NULL;
      END;
      $$;
      REVOKE ALL ON PROCEDURE public._test_coowned_definer_proc() FROM PUBLIC, anon, authenticated;

      CREATE OR REPLACE FUNCTION public._test_strict_empty_search_path()
      RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
      BEGIN
        RETURN true;
      END;
      $$;
      REVOKE ALL ON FUNCTION public._test_strict_empty_search_path() FROM PUBLIC, anon, authenticated;

      CREATE OR REPLACE FUNCTION public._test_quoted_pg_catalog_search_path()
      RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = "pg_catalog", "public" AS $$
      BEGIN
        RETURN true;
      END;
      $$;
      REVOKE ALL ON FUNCTION public._test_quoted_pg_catalog_search_path() FROM PUBLIC, anon, authenticated;

      CREATE OR REPLACE FUNCTION public._test_pg_temp_before_public_definer()
      RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp, public AS $$
      BEGIN
        RETURN true;
      END;
      $$;
      REVOKE ALL ON FUNCTION public._test_pg_temp_before_public_definer() FROM PUBLIC, anon, authenticated;
    `);

    // Verify we are genuinely running 20261024 as a non-superuser dotted/hyphenated role!
    const whoami = await supaDb.query<{ u: string; sup: boolean }>(`
      SELECT current_user AS u, (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user) AS sup;
    `);
    if (whoami.rows[0].u !== 'postgres.staging-01' || whoami.rows[0].sup !== false) {
      throw new Error(`Expected non-superuser postgres.staging-01, got: ${JSON.stringify(whoami.rows[0])}`);
    }

    // Execute 20261024 twice to verify first-run + idempotency under non-superuser dotted/hyphenated owner
    await supaDb.exec(migration20261024);
    await supaDb.exec(migration20261024);

    // Verify SET search_path = '' was preserved untouched while procedure and unsafe pg_temp-first function were hardened
    const edgeProconfig = await supaDb.query<{ proname: string; proconfig: string[] }>(`
      SELECT proname, proconfig
      FROM pg_catalog.pg_proc
      WHERE pronamespace = 'public'::pg_catalog.regnamespace
        AND proname IN (
          '_test_coowned_definer_proc',
          '_test_strict_empty_search_path',
          '_test_quoted_pg_catalog_search_path',
          '_test_pg_temp_before_public_definer'
        )
      ORDER BY proname;
    `);
    const cfgMap = Object.fromEntries(edgeProconfig.rows.map((r) => [r.proname, (r.proconfig || []).join('; ')]));
    if (!['search_path=""', 'search_path='].includes(cfgMap['_test_strict_empty_search_path'])) {
      throw new Error(`SET search_path = '' was unexpectedly overwritten: ${cfgMap['_test_strict_empty_search_path']}`);
    }
    if (!cfgMap['_test_coowned_definer_proc'].includes('search_path=pg_catalog, public, pg_temp')) {
      throw new Error(`Co-owned SECURITY DEFINER procedure did not get hardened search_path: ${cfgMap['_test_coowned_definer_proc']}`);
    }
    if (!cfgMap['_test_pg_temp_before_public_definer'].includes('search_path=pg_catalog, public, pg_temp')) {
      throw new Error(`Unsafe pg_temp-before-public definer was not repaired: ${cfgMap['_test_pg_temp_before_public_definer']}`);
    }

    // Attach owner-only audit telemetry on amaas_internal.payment_review_authorizations to prove capability token
    // creation (INSERT) and single-use consumption (DELETE) for BOTH admin_approve_payment_request and admin_reject_payment_request!
    await supaDb.exec(`
      CREATE TABLE amaas_internal._test_token_events (
        seq SERIAL PRIMARY KEY,
        op TEXT NOT NULL,
        txid TEXT NOT NULL,
        request_id UUID NOT NULL,
        target_status TEXT NOT NULL,
        reviewer_id UUID NOT NULL,
        rpc_name TEXT NOT NULL
      );
      REVOKE ALL ON TABLE amaas_internal._test_token_events FROM PUBLIC, anon, authenticated, service_role;

      CREATE OR REPLACE FUNCTION public._test_record_token_lifecycle()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          INSERT INTO amaas_internal._test_token_events (op, txid, request_id, target_status, reviewer_id, rpc_name)
          VALUES ('MINT', NEW.txid, NEW.request_id, NEW.target_status, NEW.reviewer_id, NEW.rpc_name);
          RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
          INSERT INTO amaas_internal._test_token_events (op, txid, request_id, target_status, reviewer_id, rpc_name)
          VALUES ('CONSUME', OLD.txid, OLD.request_id, OLD.target_status, OLD.reviewer_id, OLD.rpc_name);
          RETURN OLD;
        END IF;
        RETURN NULL;
      END;
      $$;
      REVOKE ALL ON FUNCTION public._test_record_token_lifecycle() FROM PUBLIC, anon, authenticated;

      CREATE TRIGGER trg_test_record_token_lifecycle
        AFTER INSERT OR DELETE ON amaas_internal.payment_review_authorizations
        FOR EACH ROW
        EXECUTE FUNCTION public._test_record_token_lifecycle();
    `);

    // Seed users, stores, and websites as dotted owner "postgres.staging-01" (verifies protect_profile_role & triggers work without ::regrole errors!)
    const uA = '11111111-1111-4111-8111-111111111111';
    const uB = '22222222-2222-4222-8222-222222222222';
    const uAdmin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const stA = 'aaaaaaaa-1111-4111-8111-111111111111';
    const stB = 'bbbbbbbb-1111-4111-8111-111111111111';

    await supaDb.exec(`
      UPDATE auth._test_session SET current_user_id = NULL, current_email = NULL, session_role = 'service_role';
      INSERT INTO auth.users (id, email) VALUES
        ('${uA}', 'a@supa.test'),
        ('${uB}', 'b@supa.test'),
        ('${uAdmin}', 'admin@supa.test');
      UPDATE public.profiles SET role = 'admin' WHERE id = '${uAdmin}';
      INSERT INTO public.stores (id, owner_id, name, slug) VALUES
        ('${stA}', '${uA}', 'Store A', 'store-a'),
        ('${stB}', '${uB}', 'Store B', 'store-b');
    `);

    async function asPostgrestClient(uid: string | null, email: string | null, dbRole: 'anon' | 'authenticated' | 'service_role') {
      await supaDb.exec(`
        RESET ROLE;
        RESET SESSION AUTHORIZATION;
        SET SESSION AUTHORIZATION "authenticator.pooler-01";
        UPDATE auth._test_session
        SET current_user_id = ${uid ? `'${uid}'::uuid` : 'NULL'},
            current_email = ${email ? `'${email}'` : 'NULL'},
            session_role = '${dbRole}';
        SET ROLE ${dbRole};
        SELECT set_config('request.jwt.claim.role', '${dbRole}', false);
        SELECT set_config('request.jwt.claim.sub', ${uid ? `'${uid}'` : "''"}, false);
        SELECT set_config('request.jwt.claims', json_build_object('sub', ${uid ? `'${uid}'` : 'NULL'}, 'role', '${dbRole}')::text, false);
      `);
    }

    await asPostgrestClient(uA, 'a@supa.test', 'authenticated');
    const swA = (
      await supaDb.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain)
        VALUES ('${uA}', '${stA}', 'Supa Alpha', 'retail', 'supaalpha', 'supaalpha.amaas.xyz')
        RETURNING id;
      `)
    ).rows[0].id;

    // Submit two requests as Merchant A via PostgREST authenticator -> authenticated
    const reqToReject = (
      await supaDb.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, bank_reference
        ) VALUES (
          '${uA}', '${stA}', 'Merchant A', '01700000000', 'a@supa.test',
          'dashboard_plan', 'plan_growth', 'Growth', 'Growth', 1500, 'Bank Transfer', 'TRX_SUPA_REJ_1', 'BNK_SUPA_REJ_1'
        ) RETURNING id;
      `)
    ).rows[0].id;

    const reqToApprove = (
      await supaDb.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${uA}', '${stA}', 'Merchant A', '01700000000', 'a@supa.test',
          'website_subscription', '${swA}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_SUPA_APP_1'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // Concurrent duplicate submission race under PostgREST authenticator -> authenticated
    const concurrentRace = await Promise.allSettled(
      Array.from({ length: 4 }, (_, idx) =>
        supaDb.query(`
          INSERT INTO public.payment_requests (
            user_id, store_id, customer_name, customer_phone, customer_email,
            service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
          ) VALUES (
            '${uA}', '${stA}', 'Merchant A', '01700000000', 'a@supa.test',
            'ai_automation', 'race_bot_${idx}', 'AI Bot', 'Pro', 1200, 'bKash', '  trx_supa_concurrent_1  '
          );
        `)
      )
    );
    const raceWinners = concurrentRace.filter((r) => r.status === 'fulfilled');
    const raceLosers = concurrentRace.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    if (raceWinners.length !== 1 || raceLosers.length !== 3 || !raceLosers.every((l) => (l.reason as any)?.code === '23505')) {
      throw new Error(`Expected 1 winner and 3 SQLSTATE 23505 losers in concurrent submission race, got winners=${raceWinners.length}`);
    }

    // Merchant B with forged JWT service_role claims under PostgREST authenticator -> strictly blocked on cross-tenant website,
    // duplicate references (case/whitespace normalized), profile promotion, and both admin review RPCs
    await asPostgrestClient(uB, 'b@supa.test', 'authenticated');
    await supaDb.exec(`
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claims', '{"sub":"${uB}","role":"service_role"}', false);
    `);

    for (const [desc, badSql] of [
      [
        'cross-tenant website payment under non-superuser PostgREST',
        `INSERT INTO public.payment_requests (user_id, store_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id) VALUES ('${uB}', '${stB}', 'B', '01800000000', 'b@supa.test', 'website_subscription', '${swA}', 'Lite', 'Lite', 600, 'bKash', 'TRX_B_CROSS');`,
      ],
      [
        'duplicate normalized transaction_id across tenants',
        `INSERT INTO public.payment_requests (user_id, store_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id) VALUES ('${uB}', '${stB}', 'B', '01800000000', 'b@supa.test', 'dashboard_plan', 'plan_starter', 'Starter', 'Starter', 500, 'bKash', '  trx_supa_app_1  ');`,
      ],
      [
        'duplicate normalized bank_reference across tenants',
        `INSERT INTO public.payment_requests (user_id, store_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, bank_reference) VALUES ('${uB}', '${stB}', 'B', '01800000000', 'b@supa.test', 'dashboard_plan', 'plan_starter', 'Starter', 'Starter', 500, 'Bank Transfer', '  bnk_supa_rej_1  ');`,
      ],
      ['forged JWT self-promote profile', `UPDATE public.profiles SET role = 'admin' WHERE id = '${uB}';`],
      ['unauthorized approve RPC', `SELECT public.admin_approve_payment_request('${reqToApprove}', 'forged');`],
      ['unauthorized reject RPC', `SELECT public.admin_reject_payment_request('${reqToReject}', 'forged');`],
    ] as const) {
      let blocked = false;
      try {
        await supaDb.query(badSql);
      } catch {
        blocked = true;
      }
      if (!blocked) {
        throw new Error(`Expected ${desc} to fail, but it succeeded!`);
      }
    }

    // Verified Admin via PostgREST authenticator -> authenticated:
    // First verify transactional rollback of an approval leaves zero side effects and zero capability tokens
    await asPostgrestClient(uAdmin, 'admin@supa.test', 'authenticated');
    await supaDb.exec(`BEGIN;`);
    const rolledBackApp = await supaDb.query<{ val: any }>(`
      SELECT public.admin_approve_payment_request('${reqToApprove}', 'Dry run rollback') AS val;
    `);
    if (!rolledBackApp.rows[0].val.success) {
      throw new Error(`Expected dry-run approval before ROLLBACK to succeed, got: ${JSON.stringify(rolledBackApp.rows[0].val)}`);
    }
    await supaDb.exec(`ROLLBACK;`);

    const stillPendingAfterRollback = await supaDb.query<{ status: string }>(`
      SELECT status FROM public.payment_requests WHERE id = '${reqToApprove}';
    `);
    if (stillPendingAfterRollback.rows[0].status !== 'pending') {
      throw new Error(`Expected rolled-back approval to remain pending, got: ${stillPendingAfterRollback.rows[0].status}`);
    }

    // Now perform committed rejection of reqToReject and committed approval of reqToApprove
    const rejOut = await supaDb.query<{ val: any }>(`
      SELECT public.admin_reject_payment_request('${reqToReject}', 'Wrong sender digits') AS val;
    `);
    if (!rejOut.rows[0].val.success || rejOut.rows[0].val.code !== 'REJECTED') {
      throw new Error(`Non-superuser admin_reject_payment_request failed: ${JSON.stringify(rejOut.rows[0].val)}`);
    }

    const appOut = await supaDb.query<{ val: any }>(`
      SELECT public.admin_approve_payment_request('${reqToApprove}', 'Verified bKash settlement') AS val;
    `);
    if (!appOut.rows[0].val.success || appOut.rows[0].val.code !== 'APPROVED') {
      throw new Error(`Non-superuser admin_approve_payment_request failed: ${JSON.stringify(appOut.rows[0].val)}`);
    }

    // Inspect capability token MINT -> CONSUME audit trail and subscribed_websites activation as owner
    await supaDb.exec(`RESET ROLE; RESET SESSION AUTHORIZATION; SET SESSION AUTHORIZATION "postgres.staging-01";`);
    const tokenEvents = (
      await supaDb.query<{
        seq: number;
        op: string;
        txid: string;
        request_id: string;
        target_status: string;
        reviewer_id: string;
        rpc_name: string;
      }>(`
        SELECT seq, op, txid, request_id, target_status, reviewer_id, rpc_name
        FROM amaas_internal._test_token_events
        ORDER BY seq;
      `)
    ).rows;

    if (tokenEvents.length !== 4) {
      throw new Error(`Expected exactly 4 committed token lifecycle events (MINT+CONSUME for reject and approve), got: ${JSON.stringify(tokenEvents)}`);
    }
    if (
      tokenEvents[0].op !== 'MINT' ||
      tokenEvents[0].request_id !== reqToReject ||
      tokenEvents[0].target_status !== 'rejected' ||
      tokenEvents[0].rpc_name !== 'admin_reject_payment_request' ||
      tokenEvents[0].reviewer_id !== uAdmin ||
      tokenEvents[1].op !== 'CONSUME' ||
      tokenEvents[1].txid !== tokenEvents[0].txid ||
      tokenEvents[1].request_id !== reqToReject
    ) {
      throw new Error(`Unexpected rejection capability token lifecycle: ${JSON.stringify(tokenEvents.slice(0, 2))}`);
    }
    if (
      tokenEvents[2].op !== 'MINT' ||
      tokenEvents[2].request_id !== reqToApprove ||
      tokenEvents[2].target_status !== 'approved' ||
      tokenEvents[2].rpc_name !== 'admin_approve_payment_request' ||
      tokenEvents[2].reviewer_id !== uAdmin ||
      tokenEvents[3].op !== 'CONSUME' ||
      tokenEvents[3].txid !== tokenEvents[2].txid ||
      tokenEvents[3].request_id !== reqToApprove
    ) {
      throw new Error(`Unexpected approval capability token lifecycle: ${JSON.stringify(tokenEvents.slice(2, 4))}`);
    }

    const residualCapRows = await supaDb.query<{ cnt: string }>(`
      SELECT count(*)::text AS cnt FROM amaas_internal.payment_review_authorizations;
    `);
    if (residualCapRows.rows[0].cnt !== '0') {
      throw new Error(`Expected 0 residual capability tokens, found ${residualCapRows.rows[0].cnt}`);
    }

    const swPaid = await supaDb.query<{ status: string; payment_status: string }>(`
      SELECT status, payment_status FROM public.subscribed_websites WHERE id = '${swA}';
    `);
    if (swPaid.rows[0].status !== 'active' || swPaid.rows[0].payment_status !== 'paid') {
      throw new Error(`Expected subscribed_websites to be active/paid, got: ${JSON.stringify(swPaid.rows[0])}`);
    }
  });

  // TEST 16: Exhaustive Audit Matrix Extensions (Anon Runtime Denials, User-ID Impersonation,
  //          Terminal State Machine, Billing Idempotency, Rejection Rollback & Schema Boundary Probes)
  await test('16. Exhaustive audit extensions: anon/staff/manager isolation, user_id spoofing, terminal transitions, billing idempotency, NULL/-0.01 amounts, concurrent bank_reference, and rejection rollback', async (db) => {
    const { userA, userB, staffA, managerA, adminUser, storeA, storeB, siteA1, siteA2, siteB1 } =
      await setupHardenedFixture(db);

    // Seed a valid pending request for User A on siteA1
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const reqApproveId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '${siteA1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_AUDIT16_APP'
        ) RETURNING id;
      `)
    ).rows[0].id;

    const reqRejectId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '${siteA2}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_AUDIT16_REJ'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // 16a. Runtime anon denial across SELECT, INSERT, UPDATE, DELETE, and both admin RPCs
    await asUser(db, null, null, 'anon');
    for (const [label, sql] of [
      ['anon SELECT payment_requests', `SELECT id FROM public.payment_requests;`],
      [
        'anon INSERT payment_requests',
        `INSERT INTO public.payment_requests (user_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id) VALUES ('${userA}', 'Anon', '01700000000', 'anon@test.com', 'dashboard_plan', 'plan_pro', 'Pro', 'Pro', 600, 'bKash', 'TRX_ANON_1');`,
      ],
      ['anon UPDATE payment_requests', `UPDATE public.payment_requests SET status = 'approved' WHERE id = '${reqApproveId}';`],
      ['anon DELETE payment_requests', `DELETE FROM public.payment_requests WHERE id = '${reqApproveId}';`],
      ['anon admin_approve_payment_request', `SELECT public.admin_approve_payment_request('${reqApproveId}', 'anon');`],
      ['anon admin_reject_payment_request', `SELECT public.admin_reject_payment_request('${reqRejectId}', 'anon');`],
    ] as const) {
      let denied = false;
      try {
        await db.query(sql);
      } catch {
        denied = true;
      }
      if (!denied) {
        throw new Error(`Expected ${label} to fail with permission error, but it succeeded`);
      }
    }

    // Store staff & manager of storeA cannot SELECT User A's store-linked payment_requests or call admin RPCs
    for (const [memberId, memberEmail, memberLabel] of [
      [staffA, 'staff_a@test.com', 'staffA'],
      [managerA, 'manager_a@test.com', 'managerA'],
    ] as const) {
      await asUser(db, memberId, memberEmail, 'authenticated');
      const visibleRows = await db.query(`SELECT id FROM public.payment_requests WHERE store_id = '${storeA}';`);
      if (visibleRows.rows.length !== 0) {
        throw new Error(`${memberLabel} was able to SELECT store owner payment_requests (${visibleRows.rows.length} rows)!`);
      }
      for (const rpcSql of [
        `SELECT public.admin_approve_payment_request('${reqApproveId}', 'member attempt');`,
        `SELECT public.admin_reject_payment_request('${reqRejectId}', 'member attempt');`,
      ]) {
        let blocked = false;
        try {
          await db.query(rpcSql);
        } catch (err: any) {
          if ((err.message || '').includes('Only verified platform administrators')) blocked = true;
        }
        if (!blocked) throw new Error(`${memberLabel} unexpectedly executed admin RPC: ${rpcSql}`);
      }
    }

    // service_role with NULL auth.uid() is also blocked on admin_approve_payment_request
    await db.exec(`
      RESET ROLE;
      UPDATE public._test_session SET current_user_id = NULL, current_email = NULL, session_role = 'service_role';
      SET ROLE service_role;
    `);
    let nullUidApproveBlocked = false;
    try {
      await db.query(`SELECT public.admin_approve_payment_request('${reqApproveId}', 'null uid');`);
    } catch (err: any) {
      if ((err.message || '').includes('Only verified platform administrators')) {
        nullUidApproveBlocked = true;
      }
    }
    if (!nullUidApproveBlocked) {
      throw new Error('service_role with NULL auth.uid() bypassed admin_approve_payment_request check');
    }
    await db.exec(`RESET ROLE;`);

    // 16b. Cross-user user_id spoofing & forged review fields on INSERT
    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    for (const [label, sql] of [
      [
        'userB spoofing user_id = userA on consistent (userA, storeA, siteA1)',
        `INSERT INTO public.payment_requests (user_id, store_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id) VALUES ('${userA}', '${storeA}', 'Spoof A', '01700000000', 'merchant_a@test.com', 'dashboard_plan', 'plan_spoof', 'Pro', 'Pro', 2500, 'bKash', 'TRX_UID_SPOOF');`,
      ],
      [
        'userB forging status = rejected on INSERT',
        `INSERT INTO public.payment_requests (user_id, store_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, status, transaction_id) VALUES ('${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com', 'website_subscription', '${siteB1}', 'Website Lite', 'Lite', 600, 'bKash', 'rejected', 'TRX_REJ_FORGE');`,
      ],
      [
        'userB forging reviewed_at on INSERT',
        `INSERT INTO public.payment_requests (user_id, store_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, reviewed_at, transaction_id) VALUES ('${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com', 'website_subscription', '${siteB1}', 'Website Lite', 'Lite', 600, 'bKash', NOW(), 'TRX_REVAT_FORGE');`,
      ],
      [
        'userB forging admin_notes on INSERT',
        `INSERT INTO public.payment_requests (user_id, store_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, admin_notes, transaction_id) VALUES ('${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com', 'website_subscription', '${siteB1}', 'Website Lite', 'Lite', 600, 'bKash', 'Pre-approved note', 'TRX_NOTES_FORGE');`,
      ],
    ] as const) {
      let blocked = false;
      try {
        await db.query(sql);
      } catch {
        blocked = true;
      }
      if (!blocked) throw new Error(`Expected INSERT block for: ${label}`);
    }

    // 16c. Exhaustive terminal state transitions & billing period idempotency
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const firstApprove = await db.query<{ val: any }>(`
      SELECT public.admin_approve_payment_request('${reqApproveId}', 'Initial settlement') AS val;
    `);
    if (!firstApprove.rows[0].val.success) throw new Error('Initial approval failed');

    const periodAfterFirst = (
      await db.query<{ cpe: string; gpe: string }>(`
        SELECT current_period_end::text AS cpe, grace_period_end::text AS gpe
        FROM public.subscribed_websites WHERE id = '${siteA1}';
      `)
    ).rows[0];

    // Repeated approval -> ALREADY_SETTLED, billing dates unchanged
    const secondApprove = await db.query<{ val: any }>(`
      SELECT public.admin_approve_payment_request('${reqApproveId}', 'Duplicate settlement') AS val;
    `);
    if (secondApprove.rows[0].val.success || secondApprove.rows[0].val.code !== 'ALREADY_SETTLED') {
      throw new Error(`Expected ALREADY_SETTLED on repeated approval, got: ${JSON.stringify(secondApprove.rows[0].val)}`);
    }

    // Reject after approve -> ALREADY_SETTLED, status stays approved & website stays paid
    const rejectAfterApprove = await db.query<{ val: any }>(`
      SELECT public.admin_reject_payment_request('${reqApproveId}', 'Try reversing approval') AS val;
    `);
    if (rejectAfterApprove.rows[0].val.success || rejectAfterApprove.rows[0].val.code !== 'ALREADY_SETTLED') {
      throw new Error(`Expected ALREADY_SETTLED on reject-after-approve, got: ${JSON.stringify(rejectAfterApprove.rows[0].val)}`);
    }

    const periodAfterDuplicates = (
      await db.query<{ cpe: string; gpe: string; payment_status: string }>(`
        SELECT current_period_end::text AS cpe, grace_period_end::text AS gpe, payment_status
        FROM public.subscribed_websites WHERE id = '${siteA1}';
      `)
    ).rows[0];
    if (
      periodAfterDuplicates.cpe !== periodAfterFirst.cpe ||
      periodAfterDuplicates.gpe !== periodAfterFirst.gpe ||
      periodAfterDuplicates.payment_status !== 'paid'
    ) {
      throw new Error('Repeated approval or reject-after-approve mutated subscribed_websites billing state!');
    }

    // Reject reqRejectId, then test approve-after-reject and repeated rejection
    const firstReject = await db.query<{ val: any }>(`
      SELECT public.admin_reject_payment_request('${reqRejectId}', 'Invalid slip') AS val;
    `);
    if (!firstReject.rows[0].val.success) throw new Error('Initial rejection failed');

    const approveAfterReject = await db.query<{ val: any }>(`
      SELECT public.admin_approve_payment_request('${reqRejectId}', 'Approve rejected row') AS val;
    `);
    if (approveAfterReject.rows[0].val.success || approveAfterReject.rows[0].val.code !== 'ALREADY_SETTLED') {
      throw new Error(`Expected ALREADY_SETTLED on approve-after-reject, got: ${JSON.stringify(approveAfterReject.rows[0].val)}`);
    }

    const secondReject = await db.query<{ val: any }>(`
      SELECT public.admin_reject_payment_request('${reqRejectId}', 'Reject again') AS val;
    `);
    if (secondReject.rows[0].val.success || secondReject.rows[0].val.code !== 'ALREADY_SETTLED') {
      throw new Error(`Expected ALREADY_SETTLED on repeated rejection, got: ${JSON.stringify(secondReject.rows[0].val)}`);
    }

    // Trigger-level terminal-state lock even if an owner-owned function mints a fresh capability token for an already-settled row
    await db.exec(`
      RESET ROLE;
      CREATE OR REPLACE FUNCTION public._test_force_settled_transition(p_req UUID, p_status TEXT, p_rpc TEXT, p_admin UUID)
      RETURNS VOID AS $fn$
      BEGIN
        INSERT INTO amaas_internal.payment_review_authorizations (txid, request_id, target_status, reviewer_id, rpc_name)
        VALUES (pg_catalog.pg_current_xact_id()::TEXT, p_req, p_status, p_admin, p_rpc);
        UPDATE public.payment_requests
        SET status = p_status, reviewed_by = p_admin, reviewed_at = NOW()
        WHERE id = p_req;
      END;
      $fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
      GRANT EXECUTE ON FUNCTION public._test_force_settled_transition(UUID, TEXT, TEXT, UUID) TO authenticated;
    `);
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    for (const [settledId, expectedCurrent, nextSt, rpcName] of [
      [reqApproveId, 'approved', 'rejected', 'admin_reject_payment_request'],
      [reqRejectId, 'rejected', 'approved', 'admin_approve_payment_request'],
    ] as const) {
      let blockedByTrigger = false;
      try {
        await db.query(`SELECT public._test_force_settled_transition('${settledId}', '${nextSt}', '${rpcName}', '${adminUser}');`);
      } catch (err: any) {
        if ((err.message || '').includes('Administrative review may only transition pending requests to approved or rejected')) {
          blockedByTrigger = true;
        }
      }
      if (!blockedByTrigger) {
        throw new Error(`Trigger failed to block settled transition on ${settledId} -> ${nextSt}`);
      }
      const afterAttempt = await db.query<{ status: string }>(
        `SELECT status FROM public.payment_requests WHERE id = '${settledId}';`
      );
      if (afterAttempt.rows[0].status !== expectedCurrent) {
        throw new Error(`Settled row ${settledId} status mutated to ${afterAttempt.rows[0].status}`);
      }
    }
    await db.exec(`RESET ROLE; DROP FUNCTION public._test_force_settled_transition(UUID, TEXT, TEXT, UUID);`);

    // 16d. NULL & fractional negative amounts, concurrent bank_reference race, and rejection 0-row atomic rollback
    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    for (const badAmt of ['NULL', '-0.01']) {
      let amtFailed = false;
      try {
        await db.query(`
          INSERT INTO public.payment_requests (
            user_id, store_id, customer_name, customer_phone, customer_email,
            service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
          ) VALUES (
            '${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
            'dashboard_plan', 'plan_amt_check', 'Pro', 'Pro', ${badAmt}, 'bKash', 'TRX_AMT_EDGE'
          );
        `);
      } catch {
        amtFailed = true;
      }
      if (!amtFailed) {
        throw new Error(`Expected amount=${badAmt} to fail on INSERT`);
      }
    }

    const bankRace = await Promise.allSettled([
      db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, bank_reference
        ) VALUES (
          '${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
          'dashboard_plan', 'plan_bank_race_1', 'Pro', 'Pro', 2500, 'Bank Transfer', '  city-slip-7788 \n'
        );
      `),
      db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, bank_reference
        ) VALUES (
          '${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
          'ai_automation', 'ai_bank_race_2', 'Bot', 'Pro', 1200, 'Bank Transfer', 'CITY-SLIP-7788'
        );
      `),
    ]);
    const bankWinners = bankRace.filter((r) => r.status === 'fulfilled');
    const bankLosers = bankRace.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected' && r.reason?.code === '23505'
    );
    if (bankWinners.length !== 1 || bankLosers.length !== 1) {
      throw new Error(`Expected 1 winner and 1 23505 loser on concurrent bank_reference, got ${bankWinners.length}/${bankLosers.length}`);
    }

    // Rejection 0-row suppression rollback leaves 0 residual capability tokens and status='pending'
    const pendingToSuppressRej = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
          'website_subscription', '${siteB1}', 'Website Lite', '৳600/month', 600, 'bKash', 'TRX_SUPPRESS_REJ_1'
        ) RETURNING id;
      `)
    ).rows[0].id;

    await db.exec(`
      RESET ROLE;
      CREATE OR REPLACE FUNCTION public._test_suppress_rej_update()
      RETURNS TRIGGER AS $fn$ BEGIN RETURN NULL; END; $fn$ LANGUAGE plpgsql;
      CREATE TRIGGER zz_tmp_suppress_rej_update
        BEFORE UPDATE ON public.payment_requests
        FOR EACH ROW EXECUTE FUNCTION public._test_suppress_rej_update();
    `);
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    let suppressRejAborted = false;
    try {
      await db.query(`SELECT public.admin_reject_payment_request('${pendingToSuppressRej}', 'Suppressed');`);
    } catch (err: any) {
      if ((err.message || '').includes('Expected 1 pending payment_requests row updated, got 0')) {
        suppressRejAborted = true;
      }
    }
    if (!suppressRejAborted) {
      throw new Error('Expected admin_reject_payment_request to abort when UPDATE affects 0 rows');
    }
    await db.exec(`
      RESET ROLE;
      DROP TRIGGER zz_tmp_suppress_rej_update ON public.payment_requests;
      DROP FUNCTION public._test_suppress_rej_update();
    `);
    const residualTokens = await db.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM amaas_internal.payment_review_authorizations;`
    );
    if (residualTokens.rows[0].cnt !== '0') {
      throw new Error(`Expected 0 residual capability tokens after aborted rejection, found ${residualTokens.rows[0].cnt}`);
    }

    // 16e. Verify 20261026 authoritative pricing catalog & gateway enforcement closes positive underpayment
    //      and fake service_id probes while preserving column-scoped reference uniqueness on valid catalog requests.
    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    let lowAmtRejected = false;
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
          'dashboard_plan', 'pro', 'Pro Plan', 'Pro', 0.01, 'bKash', 'LOW_AMT_PROBE_1'
        );
      `);
    } catch {
      lowAmtRejected = true;
    }
    if (!lowAmtRejected) {
      throw new Error('Expected 0.01 underpayment on dashboard_plan pro to be rejected by service_pricing_catalog trigger');
    }

    let fakeServiceRejected = false;
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
          'dashboard_plan', 'plan_low_amt_probe', 'Pro Plan', '৳2,500/month', 0.01, 'bKash', 'FAKE_SVC_PROBE_1'
        );
      `);
    } catch {
      fakeServiceRejected = true;
    }
    if (!fakeServiceRejected) {
      throw new Error('Expected fake service_id plan_low_amt_probe to be rejected by service_pricing_catalog trigger');
    }

    const validColRow1 = await db.query<{ id: string; status: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
      ) VALUES (
        '${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
        'dashboard_plan', 'pro', 'Pro Plan', 'Pro', 999, 'bKash', 'CROSS_COL_REF_1'
      ) RETURNING id, status;
    `);
    if (validColRow1.rows[0].status !== 'pending') {
      throw new Error('Unexpected status on valid catalog dashboard_plan submission');
    }

    const crossColRow = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, bank_reference
      ) VALUES (
        '${userB}', '${storeB}', 'Merchant B', '01800000000', 'merchant_b@test.com',
        'ai_automation', 'ai_bot', 'AI Bot', 'Bot Plan', 1200, 'Bank Transfer', 'CROSS_COL_REF_1'
      ) RETURNING id;
    `);
    if (!crossColRow.rows[0].id) {
      throw new Error('Expected cross-column reference probe with valid catalog pricing to insert');
    }
  });

  console.log(`\n============================================================`);
  console.log(`PAYMENT HARDENING RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log(`============================================================`);

  if (passed !== total) process.exit(1);
}

runPaymentRequestsHardeningSuite().catch((err) => {
  console.error('Fatal error in payment hardening test suite:', err);
  process.exit(1);
});

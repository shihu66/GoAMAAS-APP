import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  AI_AUTOMATION_PACKAGES,
  DASHBOARD_SUBSCRIPTION_PLANS,
  DEFAULT_WEBSITE_SUBSCRIPTION_PLAN,
  FREE_MERCHANT_DASHBOARD_PLAN,
  WEBSITE_DEVELOPMENT_PACKAGES,
  evaluateServiceAccessState,
  getDashboardPlanById,
  normalizeDashboardPlanId,
  resolveAuthoritativeServicePrice,
  resolveCatalogPlanState,
} from '../src/data/pricingConfig';
import { evaluateIntegrationStatus } from '../src/pages/dashboard/TeamSettingsPage';
import {
  AUTHORIZED_ADMIN_EMAIL,
  isAuthorizedAdminEmail,
  normalizeAdminEmail,
} from '../src/lib/adminSecurity';
import { buildMerchantWebsiteInsertPayload } from '../src/lib/supabase';
import { PaymentRequest, ServiceTrialRecord } from '../src/types';

function assert(condition: unknown, label: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

async function initSupabaseAndStorageEnv(db: PGlite) {
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

    CREATE SCHEMA IF NOT EXISTS storage;
    GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role;

    CREATE TABLE IF NOT EXISTS storage.buckets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      public BOOLEAN DEFAULT false,
      file_size_limit BIGINT,
      allowed_mime_types TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS storage.objects (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      bucket_id TEXT REFERENCES storage.buckets(id) ON DELETE CASCADE NOT NULL,
      name TEXT NOT NULL,
      owner UUID DEFAULT auth.uid(),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (bucket_id, name)
    );
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
    GRANT ALL ON storage.buckets TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;

    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated, anon, service_role;
  `);
}

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

async function runFreeMerchantDashboardSuite() {
  const rootDir = process.cwd();
  console.log('=== GOAMAAS 100% FREE FOREVER MERCHANT DASHBOARD E2E VERIFICATION SUITE ===\n');

  // =========================================================================
  // SCENARIO 1: Newly registered merchant accesses dashboard without paying
  // =========================================================================
  console.log('Scenario 1: Newly registered merchant accesses core dashboard without paying');
  assert(
    FREE_MERCHANT_DASHBOARD_PLAN.priceMonthly === 0,
    'FREE_MERCHANT_DASHBOARD_PLAN.priceMonthly is ৳0'
  );
  assert(
    DASHBOARD_SUBSCRIPTION_PLANS.every((p) => p.priceMonthly === 0 && p.trialDays === 0),
    'All legacy DashboardPlanConfig entries have priceMonthly=0 and trialDays=0'
  );

  for (const planCode of ['starter', 'business', 'pro', 'enterprise', 'plan_growth', 'dashboard_pro']) {
    const resolvedState = resolveCatalogPlanState({
      serviceType: 'dashboard_plan',
      serviceId: planCode,
      fallbackLabel: planCode,
      fallbackPriceBdt: 999,
    });
    assert(
      resolvedState.isAvailable === false && resolvedState.priceBdt === null,
      `resolveCatalogPlanState blocks paid checkout for dashboard_plan "${planCode}"`
    );

    const authoritativePrice = resolveAuthoritativeServicePrice({
      serviceType: 'dashboard_plan',
      serviceId: planCode,
    });
    assert(
      authoritativePrice === null,
      `resolveAuthoritativeServicePrice returns null for dashboard_plan "${planCode}"`
    );
  }

  const newMerchantModules: Array<{ id: string; name: string; category: 'dashboard' | 'landing_pages' }> = [
    { id: 'dashboard_starter', name: 'Overview', category: 'dashboard' },
    { id: 'dashboard_business', name: 'Inventory & Orders', category: 'dashboard' },
    { id: 'dashboard_pro', name: 'Analytics & Products', category: 'dashboard' },
    { id: 'dashboard_enterprise', name: 'Multi-Store & Team', category: 'dashboard' },
    { id: 'landing_pages_builder', name: 'Landing Page Builder', category: 'landing_pages' },
  ];

  for (const mod of newMerchantModules) {
    const access = evaluateServiceAccessState({
      serviceId: mod.id,
      serviceName: mod.name,
      category: mod.category,
      role: 'merchant',
      userId: 'new-merchant-0001',
      paymentRequests: [],
      subscribedWebsites: [],
      serviceTrials: [],
    });
    assert(
      access.hasAccess === true && access.status === 'subscribed' && access.isExpired === false,
      `New unpaid merchant immediately receives full access to ${mod.name} (${mod.id})`
    );
  }

  const coreDashboardPages = [
    'src/pages/dashboard/DashboardOverviewPage.tsx',
    'src/pages/dashboard/ProductsPage.tsx',
    'src/pages/dashboard/InventoryPage.tsx',
    'src/pages/dashboard/OrdersPage.tsx',
    'src/pages/dashboard/CustomersPage.tsx',
    'src/pages/dashboard/AnalyticsPage.tsx',
    'src/pages/dashboard/LandingPageBuilderPage.tsx',
    'src/pages/dashboard/TeamSettingsPage.tsx',
  ];

  for (const relFile of coreDashboardPages) {
    const src = fs.readFileSync(path.join(rootDir, relFile), 'utf8');
    assert(
      !src.includes('TrialGateBanner') && !src.includes('TrialStatusBadge'),
      `${relFile} contains zero TrialGateBanner or TrialStatusBadge locks`
    );
  }

  // =========================================================================
  // SCENARIO 2: Existing merchant accesses dashboard regardless of previous plan
  // =========================================================================
  console.log('\nScenario 2: Existing merchant accesses dashboard regardless of previous dashboard-plan status');
  const legacyStatuses: Array<'pending' | 'approved' | 'rejected'> = ['pending', 'approved', 'rejected'];
  const legacyPlanIds = ['starter', 'business', 'pro', 'enterprise', 'plan_growth', 'dashboard_starter'];

  for (const planId of legacyPlanIds) {
    const normalized = normalizeDashboardPlanId(planId);
    assert(normalized !== null, `Legacy plan ID "${planId}" normalizes cleanly to "${normalized}"`);
    const planObj = getDashboardPlanById(planId);
    assert(planObj?.priceMonthly === 0, `getDashboardPlanById("${planId}") resolves to ৳0/month`);

    for (const reqStatus of legacyStatuses) {
      const legacyPayments: PaymentRequest[] = [
        {
          id: `legacy-pay-${planId}-${reqStatus}`,
          userId: 'existing-merchant-0002',
          customerName: 'Existing Merchant',
          customerPhone: '+8801711223344',
          customerEmail: 'existing@merchant.bd',
          serviceType: 'dashboard_plan',
          serviceId: planId,
          serviceName: `Dashboard ${planId}`,
          planTier: planId,
          amount: 599,
          currency: '৳',
          paymentMethod: 'bKash',
          transactionId: 'LEGACYTRX123',
          status: reqStatus,
          createdAt: '2025-01-10T00:00:00Z',
          updatedAt: '2025-01-10T00:00:00Z',
        },
      ];

      const access = evaluateServiceAccessState({
        serviceId: 'dashboard_pro',
        serviceName: 'Merchant Dashboard',
        category: 'dashboard',
        role: 'merchant',
        userId: 'existing-merchant-0002',
        paymentRequests: legacyPayments,
        subscribedWebsites: [],
        serviceTrials: [],
      });
      assert(
        access.hasAccess === true && access.status === 'subscribed' && access.isExpired === false,
        `Existing merchant with ${reqStatus} legacy "${planId}" record has unrestricted access`
      );
    }
  }

  // =========================================================================
  // SCENARIO 3: Expired dashboard subscriptions/trials do NOT block dashboard
  // =========================================================================
  console.log('\nScenario 3: Expired dashboard subscriptions/trials do not block core dashboard features');
  const expiredTrials: ServiceTrialRecord[] = [
    {
      id: 'exp-dash-1',
      userId: 'expired-merchant-0003',
      serviceId: 'dashboard_pro',
      serviceName: 'Dashboard Pro',
      serviceCategory: 'dashboard',
      startedAt: '2024-01-01T00:00:00Z',
      expiresAt: '2024-01-08T00:00:00Z',
      status: 'expired',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-08T00:00:00Z',
    },
    {
      id: 'exp-dash-2',
      userId: 'expired-merchant-0003',
      serviceId: 'dashboard_business',
      serviceName: 'Dashboard Business',
      serviceCategory: 'dashboard',
      startedAt: '2024-01-01T00:00:00Z',
      expiresAt: '2024-01-08T00:00:00Z',
      status: 'expired',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-08T00:00:00Z',
    },
    {
      id: 'exp-lp-1',
      userId: 'expired-merchant-0003',
      serviceId: 'landing_pages_builder',
      serviceName: 'Landing Page Builder',
      serviceCategory: 'landing_pages',
      startedAt: '2024-01-01T00:00:00Z',
      expiresAt: '2024-01-08T00:00:00Z',
      status: 'expired',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-08T00:00:00Z',
    },
    {
      id: 'exp-ai-1',
      userId: 'expired-merchant-0003',
      serviceId: 'growth_auto',
      serviceName: 'Growth Automation',
      serviceCategory: 'ai_automation',
      startedAt: '2024-01-01T00:00:00Z',
      expiresAt: '2024-01-08T00:00:00Z',
      status: 'expired',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-08T00:00:00Z',
    },
  ];

  const dashAfterExpiry = evaluateServiceAccessState({
    serviceId: 'dashboard_pro',
    serviceName: 'Dashboard Pro',
    category: 'dashboard',
    role: 'merchant',
    userId: 'expired-merchant-0003',
    paymentRequests: [],
    subscribedWebsites: [],
    serviceTrials: expiredTrials,
    now: new Date('2026-11-01T00:00:00Z'),
  });
  assert(
    dashAfterExpiry.hasAccess === true && dashAfterExpiry.isExpired === false,
    'Expired dashboard_pro trial never blocks core Merchant Dashboard access'
  );

  const lpAfterExpiry = evaluateServiceAccessState({
    serviceId: 'landing_pages_builder',
    serviceName: 'Landing Page Builder',
    category: 'landing_pages',
    role: 'merchant',
    userId: 'expired-merchant-0003',
    paymentRequests: [],
    subscribedWebsites: [],
    serviceTrials: expiredTrials,
    now: new Date('2026-11-01T00:00:00Z'),
  });
  assert(
    lpAfterExpiry.hasAccess === true && lpAfterExpiry.isExpired === false,
    'Expired landing_pages_builder trial never blocks Landing Page Builder access'
  );

  const aiAfterExpiry = evaluateServiceAccessState({
    serviceId: 'growth_auto',
    serviceName: 'Growth Automation',
    category: 'ai_automation',
    role: 'merchant',
    userId: 'expired-merchant-0003',
    paymentRequests: [],
    subscribedWebsites: [],
    serviceTrials: expiredTrials,
    now: new Date('2026-11-01T00:00:00Z'),
  });
  assert(
    aiAfterExpiry.hasAccess === false && aiAfterExpiry.isExpired === true && aiAfterExpiry.status === 'trial_expired',
    'Paid AI Automation module still enforces trial expiry when unpaid'
  );

  const unpaidWebsiteAccess = evaluateServiceAccessState({
    serviceId: 'website_lite',
    serviceName: 'GoAMAAS Website',
    category: 'website',
    role: 'merchant',
    userId: 'expired-merchant-0003',
    paymentRequests: [],
    subscribedWebsites: [],
    serviceTrials: expiredTrials,
    now: new Date('2026-11-01T00:00:00Z'),
  });
  assert(
    unpaidWebsiteAccess.hasAccess === false && unpaidWebsiteAccess.status === 'available',
    'Standalone GoAMAAS Website hosting (৳600/month) still requires verified payment'
  );

  // =========================================================================
  // SCENARIO 4 & 5: Real PGlite DB + RLS CRUD for unpaid merchant & isolation
  // =========================================================================
  console.log('\nScenario 4: Products, inventory, orders, customers, website sync, courier/payment settings & analytics');
  const db = new PGlite();
  await initSupabaseAndStorageEnv(db);

  const baseSchema = fs
    .readFileSync(path.join(rootDir, 'supabase/schema.sql'), 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
  const migration20261029 = fs.readFileSync(
    path.join(rootDir, 'supabase/migrations/20261029_website_builder_storage_and_autopublish.sql'),
    'utf8'
  );
  await db.exec(baseSchema);
  await db.exec(migration20261029);

  const merchantA = '11111111-1111-4111-8111-111111111111';
  const merchantB = '22222222-2222-4222-8222-222222222222';

  await asUser(db, null, null, 'service_role');
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${merchantA}', 'free.merchant.a@amaas.xyz', '{"full_name":"Nadia Boutique"}'::jsonb),
      ('${merchantB}', 'free.merchant.b@amaas.xyz', '{"full_name":"Tanvir Electronics"}'::jsonb);
  `);

  // Authenticate as brand-new unpaid Merchant A (zero payment_requests rows!)
  await asUser(db, merchantA, 'free.merchant.a@amaas.xyz', 'authenticated');

  const paymentCountA = (
    await db.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM public.payment_requests WHERE user_id = '${merchantA}';`)
  ).rows[0].cnt;
  assert(paymentCountA === '0', 'Merchant A has 0 payment_requests in PostgreSQL');

  // Create store
  const storeA = (
    await db.query<{ id: string }>(`
      INSERT INTO public.stores (owner_id, name, slug, category, currency, phone, address)
      VALUES ('${merchantA}', 'Nadia Boutique House', 'nadia-boutique', 'Fashion', '৳', '+8801711999111', 'Uttara, Dhaka')
      RETURNING id;
    `)
  ).rows[0].id;
  await db.query(`UPDATE public.profiles SET store_id = '${storeA}', onboarding_completed = true WHERE id = '${merchantA}';`);
  assert(Boolean(storeA), 'Unpaid Merchant A creates and updates store without any subscription gate');

  // Create draft connected website record (to verify product <-> website sync)
  const { payload: websitePayloadA, error: websiteBuildError } = buildMerchantWebsiteInsertPayload({
    userId: merchantA,
    storeId: storeA,
    businessName: 'Nadia Boutique Online',
    niche: 'Fashion',
    subdomain: 'nadiaboutique',
    templateId: 'fashion-minimal',
    templateName: 'Fashion Minimal',
    config: { heroTitle: 'Nadia Boutique' },
  });
  if (websiteBuildError || !websitePayloadA) {
    throw websiteBuildError || new Error('Failed to build merchant website insert payload');
  }

  const websiteCols = Object.keys(websitePayloadA);
  const websitePlaceholders = websiteCols.map((_, idx) => `$${idx + 1}`);
  const websiteParams = websiteCols.map((key) => {
    const val = (websitePayloadA as Record<string, unknown>)[key];
    return typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
  });

  const websiteIdA = (
    await db.query<{ id: string }>(
      `INSERT INTO public.subscribed_websites (${websiteCols.join(', ')})
       VALUES (${websitePlaceholders.join(', ')})
       RETURNING id;`,
      websiteParams
    )
  ).rows[0].id;

  // Create product synced to connected website
  const productA = (
    await db.query<{ id: string; website_id: string; is_visible: boolean }>(
      `INSERT INTO public.products (store_id, website_id, name, sku, category, price, cost_price, stock, low_stock_threshold, status, is_visible)
       VALUES ($1, $2, 'Muslin Jamdani Saree', 'NB-JAM-01', 'Saree', 4800, 3100, 25, 5, 'active', true)
       RETURNING id, website_id, is_visible;`,
      [storeA, websiteIdA]
    )
  ).rows[0];
  assert(
    productA.website_id === websiteIdA && productA.is_visible === true,
    'Unpaid Merchant A creates product and syncs visibility with connected website'
  );

  // Record inventory movement
  const invLogA = (
    await db.query<{ id: string; new_stock: number }>(
      `INSERT INTO public.inventory_movements (store_id, product_id, product_name, type, quantity_change, new_stock, reason)
       VALUES ($1, $2, 'Muslin Jamdani Saree', 'restock', 10, 35, 'Festival restock')
       RETURNING id, new_stock;`,
      [storeA, productA.id]
    )
  ).rows[0];
  await db.query(`UPDATE public.products SET stock = 35 WHERE id = $1;`, [productA.id]);
  assert(invLogA.new_stock === 35, 'Unpaid Merchant A logs inventory movements and updates warehouse stock');

  // Create customer
  const customerA = (
    await db.query<{ id: string }>(
      `INSERT INTO public.customers (store_id, name, phone, email, address, city, orders_count, total_spent)
       VALUES ($1, 'Farhana Rahman', '+8801811555666', 'farhana@example.com', 'Banani Road 11', 'Dhaka', 2, 9720)
       RETURNING id;`,
      [storeA]
    )
  ).rows[0];
  assert(Boolean(customerA.id), 'Unpaid Merchant A creates CRM customer records');

  // Create previous-month & current-month orders
  await db.query(
    `INSERT INTO public.orders (store_id, order_number, customer_name, customer_phone, address, city, total, subtotal, delivery_charge, status, payment_status, created_at)
     VALUES
       ($1, 'ORD-PREV-101', 'Farhana Rahman', '+8801811555666', 'Banani', 'Dhaka', 4860, 4800, 60, 'delivered', 'paid', date_trunc('month', NOW()) - INTERVAL '10 days'),
       ($1, 'ORD-CURR-202', 'Farhana Rahman', '+8801811555666', 'Banani', 'Dhaka', 4860, 4800, 60, 'confirmed', 'pending', date_trunc('month', NOW()) + INTERVAL '2 days');`,
    [storeA]
  );
  const ordersA = (await db.query<{ order_number: string }>(`SELECT order_number FROM public.orders WHERE store_id = $1;`, [storeA])).rows;
  assert(ordersA.length === 2, 'Unpaid Merchant A creates & queries previous-month and current-month orders');

  // Verify Honest Courier & Payment Gateway Integration Status Evaluator
  assert(
    evaluateIntegrationStatus(['', '', ''], false) === 'not_configured',
    'Courier/Payment integration with empty fields reports "not_configured" (never falsely connected)'
  );
  assert(
    evaluateIntegrationStatus(['api-key-only', '', '+8801700000000'], true) === 'incomplete',
    'Courier/Payment integration with missing required secret reports "incomplete" even if enabled=true'
  );
  assert(
    evaluateIntegrationStatus(['api-key-123', 'secret-456', '+8801700000000'], false) === 'incomplete',
    'Courier/Payment integration with disabled toggle reports "incomplete"'
  );
  assert(
    evaluateIntegrationStatus(['api-key-123', 'secret-456', '+8801700000000'], true) === 'credentials_saved',
    'Courier/Payment integration with all required fields and enabled=true reports "credentials_saved"'
  );

  // Verify Previous-Month & Current-Month Sales Graphs & Performance Insights in Overview & Analytics
  const overviewSrc = fs.readFileSync(path.join(rootDir, 'src/pages/dashboard/DashboardOverviewPage.tsx'), 'utf8');
  const analyticsSrc = fs.readFileSync(path.join(rootDir, 'src/pages/dashboard/AnalyticsPage.tsx'), 'utf8');
  assert(
    overviewSrc.includes('dataKey="previousMonth"') &&
      overviewSrc.includes('dataKey="currentMonth"') &&
      overviewSrc.includes('Business Performance Insights'),
    'DashboardOverviewPage renders Previous-Month vs Current-Month sales graph and Business Performance Insights'
  );
  assert(
    analyticsSrc.includes('previousMonthSales') &&
      analyticsSrc.includes('currentMonthSales') &&
      analyticsSrc.includes('Business Performance Insights'),
    'AnalyticsPage renders Previous-Month vs Current-Month sales graph and Business Performance Insights'
  );

  // =========================================================================
  // SCENARIO 5: Merchant data isolation remains strictly enforced under RLS
  // =========================================================================
  console.log('\nScenario 5: Merchant data isolation remains enforced under PostgreSQL RLS');
  await asUser(db, merchantB, 'free.merchant.b@amaas.xyz', 'authenticated');
  const storeB = (
    await db.query<{ id: string }>(`
      INSERT INTO public.stores (owner_id, name, slug, category, currency, phone, address)
      VALUES ('${merchantB}', 'Tanvir Electronics', 'tanvir-electronics', 'Electronics', '৳', '+8801911888222', 'Agrabad, Chattogram')
      RETURNING id;
    `)
  ).rows[0].id;

  const leakedStores = (await db.query(`SELECT id FROM public.stores WHERE id = $1;`, [storeA])).rows;
  const leakedProducts = (await db.query(`SELECT id FROM public.products WHERE store_id = $1;`, [storeA])).rows;
  const leakedOrders = (await db.query(`SELECT id FROM public.orders WHERE store_id = $1;`, [storeA])).rows;
  const leakedCustomers = (await db.query(`SELECT id FROM public.customers WHERE store_id = $1;`, [storeA])).rows;
  const leakedMovements = (await db.query(`SELECT id FROM public.inventory_movements WHERE store_id = $1;`, [storeA])).rows;
  const leakedWebsites = (await db.query(`SELECT id FROM public.subscribed_websites WHERE user_id = $1;`, [merchantA])).rows;

  assert(leakedStores.length === 0, 'Merchant B cannot SELECT Merchant A store');
  assert(leakedProducts.length === 0, 'Merchant B cannot SELECT Merchant A products');
  assert(leakedOrders.length === 0, 'Merchant B cannot SELECT Merchant A orders');
  assert(leakedCustomers.length === 0, 'Merchant B cannot SELECT Merchant A customers');
  assert(leakedMovements.length === 0, 'Merchant B cannot SELECT Merchant A inventory movements');
  assert(leakedWebsites.length === 0, 'Merchant B cannot SELECT Merchant A subscribed websites');

  const updatedCrossTenant = await db.query(
    `UPDATE public.products SET price = 1 WHERE id = $1 RETURNING id;`,
    [productA.id]
  );
  assert(updatedCrossTenant.rows.length === 0, 'Merchant B cannot UPDATE Merchant A products');
  assert(Boolean(storeB), 'Merchant B manages only their own isolated store');

  // =========================================================================
  // SCENARIO 6: Admin access controls & payment security remain unchanged
  // =========================================================================
  console.log('\nScenario 6: Admin access controls and standalone payment security remain unchanged');
  assert(
    AUTHORIZED_ADMIN_EMAIL === 'official.amaas.dev@gmail.com',
    'AUTHORIZED_ADMIN_EMAIL remains locked to official.amaas.dev@gmail.com'
  );
  assert(
    isAuthorizedAdminEmail('  OFFICIAL.AMAAS.DEV@GMAIL.COM ') === true,
    'Normalized official admin email passes isAuthorizedAdminEmail'
  );
  assert(
    isAuthorizedAdminEmail('free.merchant.a@amaas.xyz') === false &&
      isAuthorizedAdminEmail('admin@amaas.xyz') === false &&
      normalizeAdminEmail(null) === '',
    'All non-official emails are rejected by isAuthorizedAdminEmail'
  );

  // Verify merchant cannot self-promote to admin in PostgreSQL
  let roleElevationBlocked = false;
  try {
    await db.query(`UPDATE public.profiles SET role = 'admin' WHERE id = $1;`, [merchantB]);
  } catch (err: any) {
    roleElevationBlocked = String(err?.message || '').includes('Access denied');
  }
  assert(roleElevationBlocked, 'PostgreSQL trigger blocks merchant from escalating profile role to admin');

  // Verify AppContext blocks paid payment submission for dashboard_plan while keeping standalone paid services intact
  const appContextSrc = fs.readFileSync(path.join(rootDir, 'src/context/AppContext.tsx'), 'utf8');
  assert(
    appContextSrc.includes("params.serviceType === 'dashboard_plan'"),
    'AppContext.submitPaymentRequest explicitly rejects paid submissions for dashboard_plan'
  );
  assert(
    DEFAULT_WEBSITE_SUBSCRIPTION_PLAN.priceMonthly === 600,
    'Standalone GoAMAAS Website hosting remains ৳600/month'
  );
  assert(
    JSON.stringify(WEBSITE_DEVELOPMENT_PACKAGES.map((p) => p.priceOneTime)) === JSON.stringify([8000, 15000, 25000]),
    'Custom Website Development packages remain ৳8,000 / ৳15,000 / ৳25,000'
  );
  assert(
    JSON.stringify(AI_AUTOMATION_PACKAGES.map((p) => p.priceMonthly)) === JSON.stringify([999, 2499, 3999, 7999]),
    'Managed AI Automation packages remain ৳999 / ৳2,499 / ৳3,999 / ৳7,999'
  );

  // =========================================================================
  // SCENARIO 7: Zero Production database / supabase/ modifications
  // =========================================================================
  console.log('\nScenario 7: Zero Production database or supabase/ directory changes');
  const expectedMigrations = [
    '20261010_security_and_rls_hardening.sql',
    '20261015_complete_saas_website_builder_and_payments.sql',
    '20261015_service_trials_system.sql',
    '20261017_public_website_resolution_and_publishing.sql',
    '20261018_fix_admin_approve_payment_request_safety.sql',
    '20261024_harden_payment_requests_ownership_and_uniqueness.sql',
    '20261026_stores_gateway_pricing_and_admin_hardening.sql',
    '20261029_website_builder_storage_and_autopublish.sql',
  ];
  const actualMigrations = fs
    .readdirSync(path.join(rootDir, 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  assert(
    JSON.stringify(actualMigrations) === JSON.stringify(expectedMigrations),
    'supabase/migrations contains exact unmodified list of 8 existing migrations'
  );

  if (fs.existsSync(path.join(rootDir, '.git'))) {
    const supabaseDiff = execSync('git status --porcelain supabase/', { cwd: rootDir }).toString().trim();
    assert(supabaseDiff === '', 'git status --porcelain supabase/ is completely empty (0 DB files touched)');
  }

  await db.close();
  console.log('\nALL 7 FREE MERCHANT DASHBOARD VERIFICATION SCENARIOS PASSED.');
}

runFreeMerchantDashboardSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});

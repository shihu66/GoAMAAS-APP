import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import {
  DASHBOARD_SUBSCRIPTION_PLANS,
  AI_AUTOMATION_PACKAGES,
  WEBSITE_DEVELOPMENT_PACKAGES,
  DEFAULT_WEBSITE_SUBSCRIPTION_PLAN,
  normalizeDashboardPlanId,
  resolveCatalogPlanState,
  resolveAuthoritativeServicePrice,
} from '../src/data/pricingConfig';
import { RESERVED_PLATFORM_SUBDOMAINS, validateSubdomainFormat, sanitizeStoreSlug } from '../src/lib/supabase';

async function runRemediation20261026Suite() {
  console.log('=== GOAMAAS 20261026 COMPREHENSIVE SECURITY & FUNCTIONAL REMEDIATION SUITE ===');
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
  const migration20261026 = fs.readFileSync(
    'supabase/migrations/20261026_stores_gateway_pricing_and_admin_hardening.sql',
    'utf8'
  );

  async function setupFixture(db: PGlite) {
    await db.exec(baseSchema);

    const userA = '11111111-1111-4111-8111-111111111111';
    const userB = '22222222-2222-4222-8222-222222222222';
    const adminUser = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
        ('${userA}', 'merchant_a@test.com', '{"role":"admin"}'::jsonb),
        ('${userB}', 'merchant_b@test.com', '{}'::jsonb),
        ('${adminUser}', 'admin@amaas.xyz', '{}'::jsonb);

      INSERT INTO public.profiles (id, email, full_name, role) VALUES
        ('${userA}', 'merchant_a@test.com', 'Merchant A', 'merchant'),
        ('${userB}', 'merchant_b@test.com', 'Merchant B', 'merchant'),
        ('${adminUser}', 'admin@amaas.xyz', 'Platform Admin', 'merchant')
      ON CONFLICT (id) DO NOTHING;

      UPDATE public.profiles SET role = 'admin' WHERE id = '${adminUser}';
    `);

    return { userA, userB, adminUser };
  }

  // TEST 1: Migration 20261026 idempotency and transactional rollback safety
  await test('1. Migration 20261026 is re-runnable idempotently and supports clean BEGIN ... ROLLBACK dry-run', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261026);
    await db.exec(migration20261026);

    await db.exec(`
      BEGIN;
      CREATE TEMP TABLE _dry_run_20261026 (ok int);
      INSERT INTO _dry_run_20261026 VALUES (1);
    `);
    await db.exec(migration20261026);
    await db.exec(`ROLLBACK;`);

    const check = await db.query<{ rel: string | null }>(`SELECT to_regclass('pg_temp._dry_run_20261026')::text AS rel;`);
    if (check.rows[0].rel !== null) {
      throw new Error('BEGIN ... ROLLBACK dry-run failed to roll back temp marker');
    }
  });

  // TEST 2: public.stores explicit grants, owner persistence, slug normalization, and cross-tenant isolation
  await test('2. public.stores grants least-privilege access to authenticated, persists real UUID stores, and blocks cross-tenant reads/writes/deletes', async (db) => {
    const { userA, userB } = await setupFixture(db);

    const privCheck = await db.query<{
      anon_any: boolean;
      auth_sel: boolean;
      auth_ins: boolean;
      auth_upd: boolean;
      auth_del: boolean;
      auth_trunc: boolean;
    }>(`
      SELECT
        has_table_privilege('anon', 'public.stores', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') AS anon_any,
        has_table_privilege('authenticated', 'public.stores', 'SELECT') AS auth_sel,
        has_table_privilege('authenticated', 'public.stores', 'INSERT') AS auth_ins,
        has_table_privilege('authenticated', 'public.stores', 'UPDATE') AS auth_upd,
        has_table_privilege('authenticated', 'public.stores', 'DELETE') AS auth_del,
        has_table_privilege('authenticated', 'public.stores', 'TRUNCATE') AS auth_trunc;
    `);
    const p = privCheck.rows[0];
    if (p.anon_any || !p.auth_sel || !p.auth_ins || !p.auth_upd || p.auth_del || p.auth_trunc) {
      throw new Error(`Unexpected public.stores privileges: ${JSON.stringify(p)}`);
    }

    // User A creates their own store
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const slugA = sanitizeStoreSlug('Alpha Fashion House', userA.slice(0, 6));
    const storeRes = await db.query<{ id: string; slug: string; owner_id: string }>(`
      INSERT INTO public.stores (owner_id, name, slug, category, currency, phone, address)
      VALUES ('${userA}', '  Alpha Fashion House  ', '  ${slugA.toUpperCase()}  ', 'Fashion', '৳', '+8801700000001', 'Dhaka')
      RETURNING id, slug, owner_id;
    `);
    const storeA = storeRes.rows[0].id;
    if (storeRes.rows[0].slug !== slugA) {
      throw new Error(`Expected normalized store slug ${slugA}, got ${storeRes.rows[0].slug}`);
    }

    // Link storeA to User A's profile (UUID store_id)
    await db.query(`UPDATE public.profiles SET store_id = '${storeA}' WHERE id = '${userA}';`);

    // User A cannot forge owner_id = userB on INSERT
    let forgedOwnerBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.stores (owner_id, name, slug)
        VALUES ('${userB}', 'Forged Store', 'forged-store-123');
      `);
    } catch {
      forgedOwnerBlocked = true;
    }
    if (!forgedOwnerBlocked) throw new Error('User A created a store owned by User B');

    // Invalid store slugs (leading/trailing hyphen, reserved keyword, punycode) are rejected
    for (const badSlug of ['-badslug', 'badslug-', 'admin', 'webhook', 'xn--80aswg']) {
      let rejected = false;
      try {
        await db.query(`
          INSERT INTO public.stores (owner_id, name, slug)
          VALUES ('${userA}', 'Bad Slug Store', '${badSlug}');
        `);
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error(`Expected invalid store slug "${badSlug}" to be rejected`);
    }

    // User A cannot transfer ownership of storeA to User B
    let transferBlocked = false;
    try {
      await db.query(`UPDATE public.stores SET owner_id = '${userB}' WHERE id = '${storeA}';`);
    } catch {
      transferBlocked = true;
    }
    if (!transferBlocked) throw new Error('Non-admin transferred store ownership');

    // User A cannot DELETE their store directly
    let deleteBlocked = false;
    try {
      await db.query(`DELETE FROM public.stores WHERE id = '${storeA}';`);
    } catch {
      deleteBlocked = true;
    }
    if (!deleteBlocked) throw new Error('Authenticated user directly deleted from public.stores');

    // User B cannot SELECT or UPDATE User A's store
    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    const bSelect = await db.query(`SELECT id FROM public.stores WHERE id = '${storeA}';`);
    if (bSelect.rows.length !== 0) {
      throw new Error('User B read User A store across tenant boundary');
    }
    const bUpdate = await db.query(`UPDATE public.stores SET name = 'Hijacked' WHERE id = '${storeA}' RETURNING id;`);
    if (bUpdate.rows.length !== 0) {
      throw new Error('User B updated User A store across tenant boundary');
    }
  });

  // TEST 3: Multi-website persistence, strict subdomain hygiene (hyphens/reserved/xn--), and public RPC resolution
  await test('3. Subdomain rules match across TypeScript & PostgreSQL; multi-website creation, unpublish, and anon table isolation work end-to-end', async (db) => {
    const { userA, userB } = await setupFixture(db);

    // Verify unified 54-word platform reserved set + leading/trailing hyphens + punycode in both TS and SQL
    if (RESERVED_PLATFORM_SUBDOMAINS.size !== 54) {
      throw new Error(`Expected 54 unified reserved subdomains, found ${RESERVED_PLATFORM_SUBDOMAINS.size}`);
    }

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const invalidSubdomains = [
      '',
      'ab',
      'a'.repeat(31),
      '-leading',
      'trailing-',
      '-both-',
      'has.dot',
      'xn--p1ai',
      'admin',
      'api',
      'www',
      'pay',
      'payments',
      'payment',
      'cdn',
      'webhook',
      'webhooks',
      'official',
      'shop',
      'store',
      'goamaas',
      'login',
    ];

    for (const sub of invalidSubdomains) {
      const tsRes = validateSubdomainFormat(sub);
      if (tsRes.valid) {
        throw new Error(`TypeScript validateSubdomainFormat unexpectedly accepted "${sub}"`);
      }

      const rpcCheck = await db.query<{ res: { available: boolean } }>(
        `SELECT public.check_subdomain_availability($1) AS res;`,
        [sub]
      );
      if (rpcCheck.rows[0].res.available !== false) {
        throw new Error(`SQL check_subdomain_availability unexpectedly accepted "${sub}"`);
      }

      let insertRejected = false;
      try {
        await db.query(
          `INSERT INTO public.subscribed_websites (user_id, business_name, niche, subdomain, full_domain)
           VALUES ($1, 'Bad Sub Site', 'ecommerce', $2, $3);`,
          [userA, sub, `${sub}.amaas.xyz`]
        );
      } catch {
        insertRejected = true;
      }
      if (!insertRejected) {
        throw new Error(`SQL trigger on subscribed_websites unexpectedly allowed subdomain "${sub}"`);
      }
    }

    // Valid internal-hyphen subdomains succeed and support multiple websites per merchant
    const s1 = await db.query<{ id: string }>(`
      INSERT INTO public.subscribed_websites (user_id, business_name, niche, subdomain, full_domain, config)
      VALUES ('${userA}', 'Dhaka Looms', 'fashion', 'dhaka-looms', 'dhaka-looms.amaas.xyz', '{"headline":"Handcrafted Textiles"}'::jsonb)
      RETURNING id;
    `);
    const s2 = await db.query<{ id: string }>(`
      INSERT INTO public.subscribed_websites (user_id, business_name, niche, subdomain, full_domain, config)
      VALUES ('${userA}', 'Dhaka Gadgets', 'electronics', 'dhaka-gadgets', 'dhaka-gadgets.amaas.xyz', '{"headline":"Smart Tech"}'::jsonb)
      RETURNING id;
    `);
    if (!s1.rows[0].id || !s2.rows[0].id || s1.rows[0].id === s2.rows[0].id) {
      throw new Error('Failed to create multiple distinct websites for User A');
    }

    // User B cannot view User A's websites and cannot register duplicate subdomain
    await asUser(db, userB, 'merchant_b@test.com', 'authenticated');
    const leakCheck = await db.query(`SELECT id FROM public.subscribed_websites;`);
    if (leakCheck.rows.length !== 0) {
      throw new Error('User B saw User A websites via subscribed_websites SELECT');
    }

    let dupSubBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.subscribed_websites (user_id, business_name, niche, subdomain, full_domain)
        VALUES ('${userB}', 'Copycat', 'fashion', 'dhaka-looms', 'dhaka-looms.amaas.xyz');
      `);
    } catch (err: any) {
      if (err.code === '23505') dupSubBlocked = true;
    }
    if (!dupSubBlocked) throw new Error('Duplicate subdomain registration was not blocked with 23505');

    // Anonymous caller cannot query subscribed_websites table directly, and unpublished draft is not exposed via RPC
    await asUser(db, null, null, 'anon');
    let anonDirectDenied = false;
    try {
      await db.query(`SELECT id FROM public.subscribed_websites LIMIT 1;`);
    } catch {
      anonDirectDenied = true;
    }
    if (!anonDirectDenied) throw new Error('Anonymous caller directly queried public.subscribed_websites');

    const draftRpc = await db.query<{ res: { found: boolean } }>(`
      SELECT public.get_published_website_by_subdomain('dhaka-looms') AS res;
    `);
    if (draftRpc.rows[0].res.found !== false) {
      throw new Error('Unpaid/unpublished draft website leaked via get_published_website_by_subdomain');
    }
  });

  // TEST 4: Payment gateway configuration-only defaults, partial non-overwriting updates, and disabled Nagad enforcement
  await test('4. payment_gateway_configs is configuration-only in 20261026, preserves existing settings on partial updates & reruns, and blocks disabled Nagad', async (db) => {
    const { userA, adminUser } = await setupFixture(db);

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const siteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (user_id, business_name, niche, subdomain, full_domain)
        VALUES ('${userA}', 'Gateway Test Shop', 'ecommerce', 'gateway-shop', 'gateway-shop.amaas.xyz')
        RETURNING id;
      `)
    ).rows[0].id;

    // Merchant can SELECT gateway configs, but cannot UPDATE directly or via admin RPC
    const gwRows = await db.query<{ id: string; is_enabled: boolean }>(`
      SELECT id, is_enabled FROM public.payment_gateway_configs ORDER BY id;
    `);
    if (gwRows.rows.length < 4) {
      throw new Error('Expected seeded payment_gateway_configs rows');
    }

    let directGwUpdateBlocked = false;
    try {
      await db.query(`UPDATE public.payment_gateway_configs SET is_enabled = true, account_number = '+8801999999999' WHERE id = 'nagad';`);
    } catch {
      directGwUpdateBlocked = true;
    }
    if (!directGwUpdateBlocked) throw new Error('Merchant directly updated payment_gateway_configs');

    // Merchant spoofing service_role JWT claim still cannot invoke admin_update_payment_gateway_config
    await db.exec(`SELECT set_config('request.jwt.claim.role', 'service_role', false);`);
    let nonAdminGwRpcBlocked = false;
    try {
      await db.query(`SELECT public.admin_update_payment_gateway_config('nagad', true, '+8801800000000');`);
    } catch {
      nonAdminGwRpcBlocked = true;
    }
    if (!nonAdminGwRpcBlocked) throw new Error('Non-admin updated gateway config via RPC');

    // Merchant submitting a Nagad payment while Nagad is disabled MUST fail at DB layer
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    let disabledNagadBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, sender_number
        ) VALUES (
          '${userA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '${siteId}', 'AMAAS Website Lite', '৳600/month', 600, 'Nagad', 'NGD_DISABLED_1', '01700000000'
        );
      `);
    } catch (err: any) {
      if ((err.message || '').includes('disabled or unavailable')) {
        disabledNagadBlocked = true;
      }
    }
    if (!disabledNagadBlocked) throw new Error('Disabled Nagad payment request was not blocked by DB trigger');

    // Verified admin cannot enable Nagad without an account_number (including NULL when existing account_number is empty)
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const emptyEnableRes = await db.query<{ val: { success: boolean; code: string } }>(`
      SELECT public.admin_update_payment_gateway_config('nagad', true, '   ') AS val;
    `);
    if (emptyEnableRes.rows[0].val.success !== false || emptyEnableRes.rows[0].val.code !== 'MISSING_ACCOUNT_NUMBER') {
      throw new Error('Admin enabled Nagad with blank account number');
    }

    const nullEnableRes = await db.query<{ val: { success: boolean; code: string } }>(`
      SELECT public.admin_update_payment_gateway_config('nagad', true, NULL) AS val;
    `);
    if (nullEnableRes.rows[0].val.success !== false || nullEnableRes.rows[0].val.code !== 'MISSING_ACCOUNT_NUMBER') {
      throw new Error('Admin enabled Nagad with NULL account number when unconfigured');
    }

    // Verified admin configures custom bank_transfer & nagad settings
    const customBankRes = await db.query<{ val: { success: boolean } }>(`
      SELECT public.admin_update_payment_gateway_config(
        'bank_transfer',
        true,
        '9988776655443',
        'Custom Holdings Ltd',
        'Eastern Bank PLC',
        'Banani Branch',
        '095260434',
        'Initial custom bank instructions'
      ) AS val;
    `);
    if (!customBankRes.rows[0].val.success) {
      throw new Error('Admin failed to configure custom bank_transfer details');
    }

    // Partial update (updating ONLY instructions with NULL for all other parameters) must NOT overwrite existing settings
    const partialBankRes = await db.query<{ val: { success: boolean } }>(`
      SELECT public.admin_update_payment_gateway_config(
        'bank_transfer',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        'Updated instructions only'
      ) AS val;
    `);
    if (!partialBankRes.rows[0].val.success) {
      throw new Error('Partial admin_update_payment_gateway_config failed');
    }

    // Re-running migration20261026 and baseSchema must NEVER overwrite admin-configured gateway settings
    await asUser(db, null, null, 'service_role');
    await db.exec(migration20261026);
    await db.exec(baseSchema);

    const bankCheck = (
      await db.query<{
        is_enabled: boolean;
        account_number: string;
        account_name: string;
        bank_name: string;
        branch_name: string;
        routing_number: string;
        instructions: string;
      }>(`
        SELECT is_enabled, account_number, account_name, bank_name, branch_name, routing_number, instructions
        FROM public.payment_gateway_configs
        WHERE id = 'bank_transfer';
      `)
    ).rows[0];
    if (
      !bankCheck.is_enabled ||
      bankCheck.account_number !== '9988776655443' ||
      bankCheck.account_name !== 'Custom Holdings Ltd' ||
      bankCheck.bank_name !== 'Eastern Bank PLC' ||
      bankCheck.branch_name !== 'Banani Branch' ||
      bankCheck.routing_number !== '095260434' ||
      bankCheck.instructions !== 'Updated instructions only'
    ) {
      throw new Error(`Gateway settings were silently overwritten: ${JSON.stringify(bankCheck)}`);
    }

    // Verify 20261026 seeds ONLY disabled empty skeletons when rows are absent (zero hardcoded live account details)
    await db.exec(`DELETE FROM public.payment_gateway_configs;`);
    await db.exec(migration20261026);
    const skeletonRows = await db.query<{ id: string; is_enabled: boolean; account_number: string; bank_name: string | null }>(`
      SELECT id, is_enabled, account_number, bank_name FROM public.payment_gateway_configs ORDER BY id;
    `);
    if (skeletonRows.rows.length !== 4) {
      throw new Error(`Expected 4 configuration skeleton rows, got ${skeletonRows.rows.length}`);
    }
    for (const r of skeletonRows.rows) {
      if (r.is_enabled !== false || r.account_number !== '' || r.bank_name !== null) {
        throw new Error(`20261026 seeded non-empty or enabled gateway credentials: ${JSON.stringify(r)}`);
      }
    }

    // Verified admin configures account_number and enables Nagad -> Nagad payment now succeeds
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const validEnableRes = await db.query<{ val: { success: boolean } }>(`
      SELECT public.admin_update_payment_gateway_config('nagad', true, '01800000099', 'Configured Test Nagad') AS val;
    `);
    if (!validEnableRes.rows[0].val.success) {
      throw new Error('Verified admin failed to enable Nagad with valid account number');
    }

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const nagadReq = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, sender_number
      ) VALUES (
        '${userA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${siteId}', 'AMAAS Website Lite', '৳600/month', 600, 'Nagad', 'NGD_ENABLED_OK_1', '01700000000'
      ) RETURNING id;
    `);
    if (!nagadReq.rows[0].id) {
      throw new Error('Enabled Nagad payment request failed');
    }
  });

  // TEST 5: Authoritative pricing enforcement + re-runnable service_pricing_catalog preservation + Bank Transfer deduplication
  await test('5. Tampered payment amounts are rejected, service_pricing_catalog reruns preserve admin prices, and Bank Transfer + publish work atomically', async (db) => {
    const { userA, adminUser } = await setupFixture(db);

    // Check TS helper parity with DB catalog
    if (resolveAuthoritativeServicePrice({ serviceType: 'website_subscription', serviceId: 'any', websiteMonthlyFee: 600 }) !== 600) {
      throw new Error('TS pricing mismatch for website_subscription');
    }
    if (resolveAuthoritativeServicePrice({ serviceType: 'dashboard_plan', serviceId: 'pro' }) !== 999) {
      throw new Error('TS pricing mismatch for dashboard_plan pro');
    }
    if (resolveAuthoritativeServicePrice({ serviceType: 'ai_automation', serviceId: 'growth_auto' }) !== 2499) {
      throw new Error('TS pricing mismatch for ai_automation growth_auto');
    }
    if (resolveAuthoritativeServicePrice({ serviceType: 'website_package', serviceId: 'starter_web', planTier: 'Starter Website' }) !== 8000) {
      throw new Error('TS pricing mismatch for website_package starter_web');
    }
    if (resolveAuthoritativeServicePrice({ serviceType: 'dashboard_plan', serviceId: 'non_existent_plan' }) !== null) {
      throw new Error('TS pricing helper accepted unrecognized dashboard_plan');
    }

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const siteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (user_id, business_name, niche, subdomain, full_domain)
        VALUES ('${userA}', 'Pricing Guard Shop', 'ecommerce', 'pricing-shop', 'pricing-shop.amaas.xyz')
        RETURNING id;
      `)
    ).rows[0].id;

    // Tampered amounts and unrecognized service codes MUST fail at PostgreSQL trigger layer
    const invalidPayloads = [
      // 1 BDT instead of 600 BDT for website_subscription
      `INSERT INTO public.payment_requests (user_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id)
       VALUES ('${userA}', 'M', '01700000000', 'm@t.com', 'website_subscription', '${siteId}', 'AMAAS Website Lite', '৳600/month', 1, 'bKash', 'TAMP_1')`,
      // 100 BDT instead of 999 BDT for dashboard_plan 'pro'
      `INSERT INTO public.payment_requests (user_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id)
       VALUES ('${userA}', 'M', '01700000000', 'm@t.com', 'dashboard_plan', 'pro', 'Dashboard Pro', 'Pro', 100, 'bKash', 'TAMP_2')`,
      // Unrecognized dashboard_plan code
      `INSERT INTO public.payment_requests (user_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id)
       VALUES ('${userA}', 'M', '01700000000', 'm@t.com', 'dashboard_plan', 'hacked_free_tier', 'Hacked', 'Hacked', 299, 'bKash', 'TAMP_3')`,
      // 50 BDT instead of 2499 BDT for ai_automation 'growth_auto'
      `INSERT INTO public.payment_requests (user_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id)
       VALUES ('${userA}', 'M', '01700000000', 'm@t.com', 'ai_automation', 'growth_auto', 'GROWTH AUTOMATION', 'GROWTH AUTOMATION', 50, 'bKash', 'TAMP_4')`,
      // 500 BDT instead of 15000 BDT for Business Website package
      `INSERT INTO public.payment_requests (user_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id)
       VALUES ('${userA}', 'M', '01700000000', 'm@t.com', 'website_package', '${siteId}', 'Business Website', 'Business Website', 500, 'bKash', 'TAMP_5')`,
    ];

    for (const sql of invalidPayloads) {
      let rejected = false;
      try {
        await db.query(sql);
      } catch {
        rejected = true;
      }
      if (!rejected) {
        throw new Error(`Expected tampered payment payload to be rejected:\n${sql}`);
      }
    }

    // Administrator / service_role updates prices in service_pricing_catalog -> re-running 20261026 & schema.sql MUST NOT overwrite them
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      UPDATE public.service_pricing_catalog
      SET price_bdt = 1299
      WHERE service_type = 'dashboard_plan' AND service_code = 'pro';

      UPDATE public.service_pricing_catalog
      SET price_bdt = 9500
      WHERE service_type = 'website_package' AND service_code = 'starter_web';

      UPDATE public.service_pricing_catalog
      SET is_active = false
      WHERE service_type = 'dashboard_plan' AND service_code = 'starter';
    `);

    await db.exec(migration20261026);
    await db.exec(baseSchema);

    const catalogAfterRerun = await db.query<{ service_code: string; price_bdt: string; is_active: boolean }>(`
      SELECT service_code, price_bdt::text, is_active
      FROM public.service_pricing_catalog
      WHERE (service_type = 'dashboard_plan' AND service_code IN ('pro', 'starter'))
         OR (service_type = 'website_package' AND service_code = 'starter_web')
      ORDER BY service_code;
    `);
    const byCode = Object.fromEntries(catalogAfterRerun.rows.map((r) => [r.service_code, r]));
    if (
      byCode.pro?.price_bdt !== '1299' ||
      byCode.starter_web?.price_bdt !== '9500' ||
      byCode.starter?.is_active !== false
    ) {
      throw new Error(`service_pricing_catalog rerun overwrote admin-managed prices: ${JSON.stringify(byCode)}`);
    }

    // Verify DB trigger enforces the updated admin-managed catalog prices (old 999 rejected, new 1299 accepted)
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    let stalePriceRejected = false;
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'dashboard_plan', 'pro', 'Dashboard Pro', 'Pro', 999, 'bKash', 'OLD_PRO_999'
        );
      `);
    } catch {
      stalePriceRejected = true;
    }
    if (!stalePriceRejected) {
      throw new Error('Stale 999 BDT price was accepted after admin updated dashboard_plan pro to 1299 BDT');
    }

    // Legitimate Bank Transfer with bank_reference (matching fixed ManualPaymentModal)
    const bankReq = await db.query<{ id: string; bank_reference: string }>(`
      INSERT INTO public.payment_requests (
        user_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount,
        payment_method, bank_name, bank_account_name, bank_reference
      ) VALUES (
        '${userA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${siteId}', 'AMAAS Website Lite', '৳600/month', 600,
        'Bank Transfer', 'City Bank PLC', 'Alpha Traders', '  city-slip-88412  '
      ) RETURNING id, bank_reference;
    `);
    const reqId = bankReq.rows[0].id;
    if (bankReq.rows[0].bank_reference !== 'city-slip-88412') {
      throw new Error('bank_reference was not trimmed cleanly');
    }

    // Duplicate case-varied bank_reference is rejected with 23505 (using updated 1299 BDT price for pro)
    let dupBankRefBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount,
          payment_method, bank_reference
        ) VALUES (
          '${userA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'dashboard_plan', 'pro', 'Dashboard Pro', 'Pro', 1299,
          'Bank Transfer', 'CITY-SLIP-88412'
        );
      `);
    } catch (err: any) {
      if (err.code === '23505') dupBankRefBlocked = true;
    }
    if (!dupBankRefBlocked) throw new Error('Duplicate bank_reference was not rejected with 23505');

    // Admin approves -> website payment_status becomes 'paid' -> Merchant publishes -> Public anon RPC resolves live site
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const approveRes = await db.query<{ val: { success: boolean } }>(`
      SELECT public.admin_approve_payment_request('${reqId}', 'Bank deposit verified') AS val;
    `);
    if (!approveRes.rows[0].val.success) {
      throw new Error('Admin approval of Bank Transfer failed');
    }

    // Repeated approval of already-approved request must fail cleanly
    const secondApprove = await db.query<{ val: { success: boolean } }>(`
      SELECT public.admin_approve_payment_request('${reqId}', 'Double approve attempt') AS val;
    `);
    if (secondApprove.rows[0].val.success !== false) {
      throw new Error('Repeated approval of already-approved request succeeded');
    }

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const pubRes = await db.query<{ val: { success: boolean } }>(`
      SELECT public.publish_client_website('${siteId}') AS val;
    `);
    if (!pubRes.rows[0].val.success) {
      throw new Error('Merchant failed to publish paid website');
    }

    await asUser(db, null, null, 'anon');
    const liveCheck = await db.query<{ val: { found: boolean; site: any } }>(`
      SELECT public.get_published_website_by_subdomain('pricing-shop') AS val;
    `);
    if (!liveCheck.rows[0].val.found || liveCheck.rows[0].val.site?.subdomain !== 'pricing-shop') {
      throw new Error('Published website did not resolve publicly via get_published_website_by_subdomain');
    }
  });

  // TEST 6: Admin authorization hardening, unpaid renew prevention, and immutable lifecycle audit trail
  await test('6. Admin role ignores metadata/GUC spoofing, blocks unpaid renew/reactivate, requires audit reason, and writes immutable website_lifecycle_audit_logs', async (db) => {
    const { userA, adminUser } = await setupFixture(db);

    // Note: In setupFixture, userA has raw_user_meta_data = '{"role":"admin"}' in auth.users!
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    await db.exec(`
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claims', '{"sub":"${userA}","role":"service_role","user_metadata":{"role":"admin"}}', false);
    `);

    const adminCheck = await db.query<{ is_ver: boolean; is_adm: boolean }>(`
      SELECT public.is_verified_platform_admin('${userA}') AS is_ver, public.is_admin() AS is_adm;
    `);
    if (adminCheck.rows[0].is_ver || adminCheck.rows[0].is_adm) {
      throw new Error('Merchant with forged user_metadata.role=admin or spoofed GUC passed admin check!');
    }

    // User A cannot self-promote in public.profiles
    let selfPromoteBlocked = false;
    try {
      await db.query(`UPDATE public.profiles SET role = 'admin' WHERE id = '${userA}';`);
    } catch {
      selfPromoteBlocked = true;
    }
    if (!selfPromoteBlocked) throw new Error('Merchant self-promoted profile.role to admin');

    // Create unpaid website for User A
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const siteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (user_id, business_name, niche, subdomain, full_domain)
        VALUES ('${userA}', 'Audit Lifecycle Cafe', 'cafe', 'unpaid-cafe', 'unpaid-cafe.amaas.xyz')
        RETURNING id;
      `)
    ).rows[0].id;

    // Non-admin cannot invoke admin_update_website_lifecycle or admin_delete_subscribed_website even with spoofed GUC
    await db.exec(`SELECT set_config('request.jwt.claim.role', 'service_role', false);`);
    for (const sql of [
      `SELECT public.admin_update_website_lifecycle('${siteId}', 'renew', 'spoof');`,
      `SELECT public.admin_update_website_lifecycle('${siteId}', 'suspend', 'spoof');`,
      `SELECT public.admin_delete_subscribed_website('${siteId}');`,
    ]) {
      let blocked = false;
      try {
        await db.query(sql);
      } catch {
        blocked = true;
      }
      if (!blocked) throw new Error(`Non-admin executed privileged website RPC: ${sql}`);
    }

    // 1) Verified admin CANNOT reactivate OR renew an unpaid website (must NOT set payment_status = 'paid')
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const reactivateUnpaid = await db.query<{ val: { success: boolean; code: string } }>(`
      SELECT public.admin_update_website_lifecycle('${siteId}', 'reactivate', 'Attempt unpaid reactivate') AS val;
    `);
    if (reactivateUnpaid.rows[0].val.success !== false || reactivateUnpaid.rows[0].val.code !== 'PAYMENT_REQUIRED') {
      throw new Error('Admin reactivated an unpaid website without verified payment');
    }

    const renewUnpaid = await db.query<{ val: { success: boolean; code: string } }>(`
      SELECT public.admin_update_website_lifecycle('${siteId}', 'renew', 'Attempt unpaid renew') AS val;
    `);
    if (renewUnpaid.rows[0].val.success !== false || renewUnpaid.rows[0].val.code !== 'PAYMENT_REQUIRED') {
      throw new Error(`Expected unpaid renew to fail with PAYMENT_REQUIRED, got: ${JSON.stringify(renewUnpaid.rows[0].val)}`);
    }

    const afterUnpaidAttempts = (
      await db.query<{ payment_status: string }>(`SELECT payment_status FROM public.subscribed_websites WHERE id = '${siteId}';`)
    ).rows[0];
    if (afterUnpaidAttempts.payment_status !== 'pending') {
      throw new Error(`Unpaid renew mutated payment_status to ${afterUnpaidAttempts.payment_status}`);
    }

    // Even if payment_status were 'paid' without an approved payment_requests row, renew MUST still reject with PAYMENT_REQUIRED
    await asUser(db, null, null, 'service_role');
    await db.exec(`UPDATE public.subscribed_websites SET payment_status = 'paid' WHERE id = '${siteId}';`);
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const renewWithoutApprovedPr = await db.query<{ val: { success: boolean; code: string } }>(`
      SELECT public.admin_update_website_lifecycle('${siteId}', 'renew', 'No payment request row') AS val;
    `);
    if (renewWithoutApprovedPr.rows[0].val.success !== false || renewWithoutApprovedPr.rows[0].val.code !== 'PAYMENT_REQUIRED') {
      throw new Error('Renew succeeded without an approved payment_requests record');
    }
    await asUser(db, null, null, 'service_role');
    await db.exec(`UPDATE public.subscribed_websites SET payment_status = 'pending' WHERE id = '${siteId}';`);

    // 2) Merchant submits legitimate payment -> Verified admin approves via admin_approve_payment_request
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const prId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_subscription', '${siteId}', 'AMAAS Website Lite', '৳600/month', 600, 'bKash', 'LIFE_TRX_901'
        ) RETURNING id;
      `)
    ).rows[0].id;

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const approveRes = await db.query<{ val: { success: boolean } }>(`
      SELECT public.admin_approve_payment_request('${prId}', 'Verified bKash statement') AS val;
    `);
    if (!approveRes.rows[0].val.success) {
      throw new Error('admin_approve_payment_request failed');
    }

    // 3) Missing or blank reason MUST fail with REASON_REQUIRED on all lifecycle actions
    for (const action of ['suspend', 'reactivate', 'renew']) {
      const noReasonRes = await db.query<{ val: { success: boolean; code: string } }>(`
        SELECT public.admin_update_website_lifecycle('${siteId}', '${action}', '   ') AS val;
      `);
      if (noReasonRes.rows[0].val.success !== false || noReasonRes.rows[0].val.code !== 'REASON_REQUIRED') {
        throw new Error(`Expected REASON_REQUIRED for blank reason on ${action}`);
      }
    }

    // 4) Verified admin suspends, reactivates, and renews paid website -> all 3 audit trail entries are recorded
    const suspendRes = await db.query<{ val: { success: boolean; auditLogId: string } }>(`
      SELECT public.admin_update_website_lifecycle('${siteId}', 'suspend', '  Policy compliance check  ') AS val;
    `);
    if (!suspendRes.rows[0].val.success || !suspendRes.rows[0].val.auditLogId) {
      throw new Error('Verified admin suspend failed');
    }

    const suspendedState = await db.query<{ status: string; deployment_status: string }>(`
      SELECT status, deployment_status FROM public.subscribed_websites WHERE id = '${siteId}';
    `);
    if (suspendedState.rows[0].status !== 'suspended' || suspendedState.rows[0].deployment_status !== 'suspended') {
      throw new Error('Website was not suspended properly');
    }

    const reactivatePaid = await db.query<{ val: { success: boolean; auditLogId: string } }>(`
      SELECT public.admin_update_website_lifecycle('${siteId}', 'reactivate', 'Compliance review cleared') AS val;
    `);
    if (!reactivatePaid.rows[0].val.success || !reactivatePaid.rows[0].val.auditLogId) {
      throw new Error('Verified admin reactivate failed on paid site');
    }

    const renewPaid = await db.query<{ val: { success: boolean; auditLogId: string; paymentStatus: string } }>(`
      SELECT public.admin_update_website_lifecycle('${siteId}', 'renew', 'Verified 30-day cycle extension') AS val;
    `);
    if (!renewPaid.rows[0].val.success || !renewPaid.rows[0].val.auditLogId || renewPaid.rows[0].val.paymentStatus !== 'paid') {
      throw new Error('Verified admin renew failed on paid site');
    }

    // 5) Verify audit trail contents, RLS isolation, and append-only immutability
    const auditLogs = await db.query<{
      website_id: string;
      admin_id: string;
      action: string;
      reason: string;
      verified_payment_request_id: string | null;
      created_at: string;
    }>(`
      SELECT website_id, admin_id, action, reason, verified_payment_request_id, created_at::text
      FROM public.website_lifecycle_audit_logs
      WHERE website_id = '${siteId}'
      ORDER BY created_at ASC, id ASC;
    `);
    if (auditLogs.rows.length !== 3) {
      throw new Error(`Expected 3 lifecycle audit rows, found ${auditLogs.rows.length}`);
    }
    const actions = auditLogs.rows.map((r) => r.action);
    if (actions[0] !== 'suspend' || actions[1] !== 'reactivate' || actions[2] !== 'renew') {
      throw new Error(`Unexpected audit action sequence: ${JSON.stringify(actions)}`);
    }
    if (
      auditLogs.rows[0].reason !== 'Policy compliance check' ||
      auditLogs.rows[0].admin_id !== adminUser ||
      !auditLogs.rows[0].created_at ||
      auditLogs.rows[1].verified_payment_request_id !== prId ||
      auditLogs.rows[2].verified_payment_request_id !== prId
    ) {
      throw new Error(`Audit row fields mismatch: ${JSON.stringify(auditLogs.rows)}`);
    }

    // Verified admin cannot UPDATE or DELETE audit rows
    for (const dml of [
      `UPDATE public.website_lifecycle_audit_logs SET reason = 'Tampered' WHERE website_id = '${siteId}';`,
      `DELETE FROM public.website_lifecycle_audit_logs WHERE website_id = '${siteId}';`,
    ]) {
      let immutableBlocked = false;
      try {
        await db.query(dml);
      } catch {
        immutableBlocked = true;
      }
      if (!immutableBlocked) {
        throw new Error(`Audit log immutability violated by admin DML: ${dml}`);
      }
    }

    // Non-admin merchant cannot SELECT or INSERT into website_lifecycle_audit_logs
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const merchantAuditSelect = await db.query(`SELECT id FROM public.website_lifecycle_audit_logs;`);
    if (merchantAuditSelect.rows.length !== 0) {
      throw new Error('Non-admin merchant read website_lifecycle_audit_logs');
    }
    let merchantAuditInsertBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.website_lifecycle_audit_logs (website_id, admin_id, action, reason)
        VALUES ('${siteId}', '${userA}', 'renew', 'Forged audit row');
      `);
    } catch {
      merchantAuditInsertBlocked = true;
    }
    if (!merchantAuditInsertBlocked) {
      throw new Error('Non-admin merchant inserted into website_lifecycle_audit_logs');
    }

    // Anon cannot access website_lifecycle_audit_logs at all
    await asUser(db, null, null, 'anon');
    let anonAuditBlocked = false;
    try {
      await db.query(`SELECT id FROM public.website_lifecycle_audit_logs LIMIT 1;`);
    } catch {
      anonAuditBlocked = true;
    }
    if (!anonAuditBlocked) {
      throw new Error('Anonymous role queried website_lifecycle_audit_logs');
    }
  });

  // TEST 7: Full incremental migration chain (20261010 -> 20261026), no-free-trial Website policy, and SECURITY DEFINER search_path invariants
  await test('7. Incremental migration chain (20261010..20261026) upgrades cleanly, blocks Website free trials & cross-tenant trial store_id, and pins search_path on all SECURITY DEFINER functions', async (db) => {
    // Bootstrap pre-20261010 minimal baseline tables (simulating an early Supabase project upgraded through all 7 migrations)
    await db.exec(`
      CREATE TABLE public.profiles (
        id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
        full_name TEXT,
        email TEXT UNIQUE,
        avatar_url TEXT,
        role TEXT DEFAULT 'merchant' CHECK (role IN ('merchant', 'admin')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.stores (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.products (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        price NUMERIC NOT NULL DEFAULT 0,
        stock INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.orders (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        order_number TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        total NUMERIC NOT NULL DEFAULT 0,
        subtotal NUMERIC NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.customers (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.subscribed_websites (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
        business_name TEXT NOT NULL,
        niche TEXT NOT NULL,
        subdomain TEXT UNIQUE NOT NULL,
        full_domain TEXT NOT NULL,
        template_id TEXT NOT NULL DEFAULT 'tpl-modern-business',
        template_name TEXT NOT NULL DEFAULT 'Modern Executive',
        status TEXT DEFAULT 'active',
        plan_tier TEXT DEFAULT 'AMAAS Website Lite',
        monthly_fee NUMERIC DEFAULT 600,
        currency TEXT DEFAULT '৳',
        subscribed_at TIMESTAMPTZ DEFAULT NOW(),
        current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
        grace_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '35 days'),
        deployment_status TEXT DEFAULT 'deploying',
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        resource_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE public.subscribed_websites ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.inventory_movements (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
        product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
        product_name TEXT NOT NULL,
        type TEXT NOT NULL,
        quantity_change INTEGER NOT NULL,
        new_stock INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.support_tickets (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        ticket_number TEXT UNIQUE NOT NULL,
        subject TEXT NOT NULL,
        category TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'open',
        messages JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
    `);

    const orderedMigrations = [
      'supabase/migrations/20261010_security_and_rls_hardening.sql',
      'supabase/migrations/20261015_service_trials_system.sql',
      'supabase/migrations/20261015_complete_saas_website_builder_and_payments.sql',
      'supabase/migrations/20261017_public_website_resolution_and_publishing.sql',
      'supabase/migrations/20261018_fix_admin_approve_payment_request_safety.sql',
      'supabase/migrations/20261024_harden_payment_requests_ownership_and_uniqueness.sql',
      'supabase/migrations/20261026_stores_gateway_pricing_and_admin_hardening.sql',
    ];

    for (const migPath of orderedMigrations) {
      const sql = fs.readFileSync(migPath, 'utf8').replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
      await db.exec(sql);
    }

    // Verify zero SECURITY DEFINER functions in public lack pg_catalog-first search_path
    const secDefAudit = await db.query<{ sig: string }>(`
      SELECT p.oid::pg_catalog.regprocedure::text AS sig
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
          WHERE cfg LIKE 'search_path=pg_catalog%'
        );
    `);
    if (secDefAudit.rows.length !== 0) {
      throw new Error(`SECURITY DEFINER functions missing fixed search_path: ${JSON.stringify(secDefAudit.rows)}`);
    }

    const userA = '11111111-1111-4111-8111-111111111111';
    const userB = '22222222-2222-4222-8222-222222222222';
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${userA}', 'a@test.com'),
        ('${userB}', 'b@test.com');
    `);

    await asUser(db, userB, 'b@test.com', 'authenticated');
    const storeB = (
      await db.query<{ id: string }>(`
        INSERT INTO public.stores (owner_id, name, slug)
        VALUES ('${userB}', 'Beta Store', 'beta-store-01')
        RETURNING id;
      `)
    ).rows[0].id;

    // User A CANNOT activate a free trial for Website Service via RPC or direct INSERT
    await asUser(db, userA, 'a@test.com', 'authenticated');
    const webTrialRpc = await db.query<{ val: { success: boolean; code: string } }>(`
      SELECT public.activate_service_trial('website_lite', 'AMAAS Website Lite', 'website', NULL) AS val;
    `);
    if (webTrialRpc.rows[0].val.success !== false || webTrialRpc.rows[0].val.code !== 'TRIAL_NOT_ELIGIBLE') {
      throw new Error(`Website free trial RPC was not blocked: ${JSON.stringify(webTrialRpc.rows[0].val)}`);
    }

    let directWebTrialBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.service_trials (user_id, service_id, service_name, service_category)
        VALUES ('${userA}', 'website_lite', 'AMAAS Website Lite', 'website');
      `);
    } catch {
      directWebTrialBlocked = true;
    }
    if (!directWebTrialBlocked) {
      throw new Error('Direct INSERT of Website Service free trial was not blocked');
    }

    // User A CANNOT attach User B's store_id to a service trial
    let crossStoreTrialBlocked = false;
    try {
      await db.query(`
        SELECT public.activate_service_trial('ai_automations', 'AI Automation Suite', 'ai_automation', '${storeB}');
      `);
    } catch {
      crossStoreTrialBlocked = true;
    }
    if (!crossStoreTrialBlocked) {
      throw new Error('Cross-tenant store_id in activate_service_trial was not blocked');
    }

    // Legitimate non-website 7-day trial succeeds once and blocks duplicate activation
    const validTrial = await db.query<{ val: { success: boolean; code: string } }>(`
      SELECT public.activate_service_trial('ai_automations', 'AI Automation Suite', 'ai_automation', NULL) AS val;
    `);
    if (!validTrial.rows[0].val.success || validTrial.rows[0].val.code !== 'TRIAL_ACTIVATED') {
      throw new Error(`Valid non-website service trial failed: ${JSON.stringify(validTrial.rows[0].val)}`);
    }

    const dupTrial = await db.query<{ val: { success: boolean; code: string } }>(`
      SELECT public.activate_service_trial('ai_automations', 'AI Automation Suite', 'ai_automation', NULL) AS val;
    `);
    if (dupTrial.rows[0].val.success !== false || dupTrial.rows[0].val.code !== 'TRIAL_ALREADY_USED') {
      throw new Error('Duplicate service trial activation was not blocked with TRIAL_ALREADY_USED');
    }
  });

  // TEST 8: Regression coverage for subscribed_websites column grants + fee tampering, website_package price-downgrade block, audit log TRUNCATE block, and legacy RLS policy sweeps
  await test('8. subscribed_websites supports plan_tier/monthly_fee INSERT while blocking fee tampering, website_package rejects unrecognized tier downgrades, audit log TRUNCATE is blocked, and stray anon/PUBLIC policies are swept', async (db) => {
    const { userA, adminUser } = await setupFixture(db);

    // 8a. Inject stray legacy PUBLIC/anon policies across protected tables, re-run 20261026, and verify all are swept cleanly
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      CREATE POLICY "Legacy anon stores leak" ON public.stores FOR SELECT TO anon USING (true);
      CREATE POLICY "Legacy public websites leak" ON public.subscribed_websites FOR SELECT USING (true);
      CREATE POLICY "Legacy anon gateway leak" ON public.payment_gateway_configs FOR SELECT TO anon USING (true);
      CREATE POLICY "Legacy public pricing leak" ON public.service_pricing_catalog FOR SELECT USING (true);
      CREATE POLICY "Legacy anon audit leak" ON public.website_lifecycle_audit_logs FOR SELECT TO anon USING (true);
      CREATE POLICY "Legacy anon trials leak" ON public.service_trials FOR SELECT TO anon USING (true);
    `);

    await db.exec(migration20261026);

    const strayPolicies = await db.query<{ policyname: string; tablename: string }>(`
      SELECT policyname, tablename
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename IN (
          'stores',
          'subscribed_websites',
          'payment_requests',
          'payment_gateway_configs',
          'service_pricing_catalog',
          'website_lifecycle_audit_logs',
          'service_trials'
        )
        AND ('public' = ANY(roles) OR 'anon' = ANY(roles));
    `);
    if (strayPolicies.rows.length !== 0) {
      throw new Error(`Stray anon/PUBLIC policies were not swept by 20261026: ${JSON.stringify(strayPolicies.rows)}`);
    }

    // 8b. Authenticated merchant INSERT matching createSubscribedWebsiteInDb (with plan_tier & monthly_fee = 600) succeeds
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const createdSite = await db.query<{ id: string; plan_tier: string; monthly_fee: string }>(`
      INSERT INTO public.subscribed_websites (
        user_id, store_id, business_name, niche, subdomain, full_domain,
        template_id, template_name, status, plan_tier, monthly_fee, config
      ) VALUES (
        '${userA}', NULL, 'Merchant App Payload Site', 'ecommerce', 'app-payload-site', 'app-payload-site.amaas.xyz',
        'tpl-modern-business', 'Modern Executive', 'active', 'AMAAS Website Lite', 600, '{"headline":"Hello"}'::jsonb
      )
      RETURNING id, plan_tier, monthly_fee::text;
    `);
    const siteId = createdSite.rows[0].id;
    if (createdSite.rows[0].monthly_fee !== '600' || createdSite.rows[0].plan_tier !== 'AMAAS Website Lite') {
      throw new Error(`Unexpected created website billing defaults: ${JSON.stringify(createdSite.rows[0])}`);
    }

    // 8c. Authenticated merchant INSERT with tampered monthly_fee = 1 MUST fail
    let tamperedFeeInsertBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.subscribed_websites (
          user_id, business_name, niche, subdomain, full_domain, plan_tier, monthly_fee
        ) VALUES (
          '${userA}', 'Cheap Site', 'ecommerce', 'cheap-fee-site', 'cheap-fee-site.amaas.xyz', 'AMAAS Website Lite', 1
        );
      `);
    } catch (err: any) {
      if ((err.message || '').includes('Invalid monthly_fee')) {
        tamperedFeeInsertBlocked = true;
      }
    }
    if (!tamperedFeeInsertBlocked) {
      throw new Error('Merchant created website with tampered monthly_fee = 1');
    }

    // 8d. Authenticated merchant UPDATE of monthly_fee or plan_tier MUST fail
    for (const badUpd of [
      `UPDATE public.subscribed_websites SET monthly_fee = 1 WHERE id = '${siteId}';`,
      `UPDATE public.subscribed_websites SET plan_tier = 'Free Forever' WHERE id = '${siteId}';`,
    ]) {
      let updBlocked = false;
      try {
        await db.query(badUpd);
      } catch {
        updBlocked = true;
      }
      if (!updBlocked) {
        throw new Error(`Merchant modified protected website billing column: ${badUpd}`);
      }
    }

    // 8e. Admin updates service_pricing_catalog website_lite price to 750 -> trigger enforces 750 on new inserts
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      UPDATE public.service_pricing_catalog
      SET price_bdt = 750
      WHERE service_type = 'website_subscription' AND service_code = 'website_lite';
    `);

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    let staleFeeBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.subscribed_websites (
          user_id, business_name, niche, subdomain, full_domain, monthly_fee
        ) VALUES (
          '${userA}', 'Stale 600 Site', 'ecommerce', 'stale-fee-site', 'stale-fee-site.amaas.xyz', 600
        );
      `);
    } catch (err: any) {
      if ((err.message || '').includes('750')) {
        staleFeeBlocked = true;
      }
    }
    if (!staleFeeBlocked) {
      throw new Error('Stale 600 BDT monthly_fee was accepted after catalog fee updated to 750 BDT');
    }

    const nullFeeSite = await db.query<{ monthly_fee: string }>(`
      INSERT INTO public.subscribed_websites (
        user_id, business_name, niche, subdomain, full_domain, monthly_fee
      ) VALUES (
        '${userA}', 'Null Auto 750 Site', 'ecommerce', 'null-750-site', 'null-750-site.amaas.xyz', NULL
      ) RETURNING monthly_fee::text;
    `);
    if (nullFeeSite.rows[0].monthly_fee !== '750') {
      throw new Error(`Expected NULL monthly_fee to auto-populate catalog 750, got ${nullFeeSite.rows[0].monthly_fee}`);
    }

    const explicit750Site = await db.query<{ monthly_fee: string }>(`
      INSERT INTO public.subscribed_websites (
        user_id, business_name, niche, subdomain, full_domain, monthly_fee
      ) VALUES (
        '${userA}', 'Explicit 750 Site', 'ecommerce', 'explicit-750-site', 'explicit-750-site.amaas.xyz', 750
      ) RETURNING monthly_fee::text;
    `);
    if (explicit750Site.rows[0].monthly_fee !== '750') {
      throw new Error(`Expected explicit 750 monthly_fee to succeed, got ${explicit750Site.rows[0].monthly_fee}`);
    }

    // Restore website_lite catalog fee to 600 for subsequent checks
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      UPDATE public.service_pricing_catalog
      SET price_bdt = 600
      WHERE service_type = 'website_subscription' AND service_code = 'website_lite';
    `);

    // 8f. website_package with unrecognized tier/name attempting 5000 BDT custom_setup downgrade MUST be rejected
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    let downgradePkgBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'website_package', '${siteId}', 'Enterprise Custom Store', 'Enterprise', 5000, 'bKash', 'DOWNGRADE_PKG_5000'
        );
      `);
    } catch (err: any) {
      if ((err.message || '').includes('website_package pricing')) {
        downgradePkgBlocked = true;
      }
    }
    if (!downgradePkgBlocked) {
      throw new Error('Unrecognized website_package tier downgraded to 5000 BDT custom_setup price');
    }

    // 8g. TRUNCATE on website_lifecycle_audit_logs is blocked for anon, authenticated, and even owner non-service_role sessions
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    await db.query(`SELECT public.admin_update_website_lifecycle('${siteId}', 'suspend', 'Audit truncate test');`);

    for (const roleMode of ['anon', 'authenticated'] as const) {
      await asUser(db, roleMode === 'authenticated' ? adminUser : null, 'admin@amaas.xyz', roleMode);
      let truncBlocked = false;
      try {
        await db.query(`TRUNCATE TABLE public.website_lifecycle_audit_logs;`);
      } catch {
        truncBlocked = true;
      }
      if (!truncBlocked) {
        throw new Error(`Role "${roleMode}" truncated public.website_lifecycle_audit_logs`);
      }
    }

    // Even direct session owner (without service_role) is blocked by BEFORE TRUNCATE statement trigger
    await db.exec(`RESET ROLE;`);
    let ownerTruncBlocked = false;
    try {
      await db.query(`TRUNCATE TABLE public.website_lifecycle_audit_logs;`);
    } catch (err: any) {
      if ((err.message || '').includes('cannot be truncated')) {
        ownerTruncBlocked = true;
      }
    }
    if (!ownerTruncBlocked) {
      throw new Error('BEFORE TRUNCATE trigger did not block non-service_role TRUNCATE on website_lifecycle_audit_logs');
    }
  });

  // TEST 9: Dashboard pricing catalog parity, legacy alias migration, inactive plan handling, and strict payment validation
  await test('9. Dashboard plan IDs/labels/prices match active service_pricing_catalog, legacy plan_* aliases migrate safely, and inactive/unavailable plans never fall back to static prices', async (db) => {
    const { userA } = await setupFixture(db);

    // 9a. Verify exact dashboard plan IDs, labels, prices, and zero duplicate IDs across all config arrays
    const expectedDashboardPlans = [
      { id: 'starter', name: 'Starter', price: 299 },
      { id: 'business', name: 'Business', price: 599 },
      { id: 'pro', name: 'Pro', price: 999 },
      { id: 'enterprise', name: 'Enterprise', price: 1999 },
    ];
    if (DASHBOARD_SUBSCRIPTION_PLANS.length !== 4) {
      throw new Error(`Expected 4 dashboard plans, got ${DASHBOARD_SUBSCRIPTION_PLANS.length}`);
    }
    for (let i = 0; i < expectedDashboardPlans.length; i++) {
      const actual = DASHBOARD_SUBSCRIPTION_PLANS[i];
      const exp = expectedDashboardPlans[i];
      if (actual.id !== exp.id || actual.name !== exp.name || actual.priceMonthly !== exp.price) {
        throw new Error(
          `Dashboard plan mismatch at index ${i}: expected ${JSON.stringify(exp)}, got id=${actual.id}, name=${actual.name}, price=${actual.priceMonthly}`
        );
      }
    }

    const allIds = [
      ...DASHBOARD_SUBSCRIPTION_PLANS.map((p) => p.id),
      ...AI_AUTOMATION_PACKAGES.map((p) => p.id),
      ...WEBSITE_DEVELOPMENT_PACKAGES.map((p) => p.id),
      DEFAULT_WEBSITE_SUBSCRIPTION_PLAN.id,
    ];
    if (new Set(allIds).size !== allIds.length) {
      throw new Error(`Duplicate plan/package IDs detected in pricingConfig: ${allIds.join(', ')}`);
    }

    // 9b. Verify legacy aliases migrate to canonical IDs and NEVER resolve to 500/1500/2500
    const aliasExpectations: Array<[string, string, number]> = [
      ['plan_starter', 'starter', 299],
      ['plan_growth', 'business', 599],
      ['growth', 'business', 599],
      ['plan_pro', 'pro', 999],
      ['plan_enterprise', 'enterprise', 1999],
      ['dashboard_starter', 'starter', 299],
      ['dashboard_business', 'business', 599],
      ['dashboard_pro', 'pro', 999],
      ['dashboard_enterprise', 'enterprise', 1999],
      ['STARTER', 'starter', 299],
      ['BUSINESS', 'business', 599],
      ['PRO', 'pro', 999],
      ['ENTERPRISE', 'enterprise', 1999],
    ];

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const dbCatalogRes = await db.query<{
      service_type: 'website_subscription' | 'website_package' | 'dashboard_plan' | 'ai_automation';
      service_code: string;
      plan_tier_label: string;
      price_bdt: string;
      setup_fee_bdt: string;
      is_active: boolean;
    }>(`SELECT service_type, service_code, plan_tier_label, price_bdt::text, setup_fee_bdt::text, is_active FROM public.service_pricing_catalog;`);

    const liveCatalog = dbCatalogRes.rows.map((r) => ({
      serviceType: r.service_type,
      serviceCode: r.service_code,
      planTierLabel: r.plan_tier_label,
      priceBdt: Number(r.price_bdt),
      setupFeeBdt: Number(r.setup_fee_bdt),
      isActive: r.is_active,
    }));

    for (const [alias, expectedId, expectedPrice] of aliasExpectations) {
      const normalized = normalizeDashboardPlanId(alias);
      if (normalized !== expectedId) {
        throw new Error(`Alias "${alias}" normalized to "${normalized}" instead of "${expectedId}"`);
      }
      const resolvedWithCatalog = resolveAuthoritativeServicePrice({
        serviceType: 'dashboard_plan',
        serviceId: alias,
        catalog: liveCatalog,
        requireCatalog: true,
      });
      if (resolvedWithCatalog !== expectedPrice) {
        throw new Error(
          `Alias "${alias}" resolved to ${resolvedWithCatalog} with live catalog instead of ${expectedPrice}`
        );
      }
      const resolvedOffline = resolveAuthoritativeServicePrice({
        serviceType: 'dashboard_plan',
        serviceId: alias,
      });
      if (resolvedOffline !== expectedPrice) {
        throw new Error(
          `Alias "${alias}" resolved to ${resolvedOffline} offline instead of ${expectedPrice}`
        );
      }
    }

    if (normalizeDashboardPlanId('unknown_plan') !== null) {
      throw new Error('normalizeDashboardPlanId accepted unknown_plan');
    }

    // 9c. Verify every frontend plan/package ID matches an active row in public.service_pricing_catalog
    for (const plan of DASHBOARD_SUBSCRIPTION_PLANS) {
      const state = resolveCatalogPlanState({
        serviceType: 'dashboard_plan',
        serviceId: plan.id,
        fallbackLabel: plan.name,
        fallbackPriceBdt: plan.priceMonthly,
        catalog: liveCatalog,
        requireCatalog: true,
      });
      if (!state.isAvailable || state.priceBdt !== plan.priceMonthly || state.planTierLabel !== plan.name) {
        throw new Error(
          `Frontend dashboard plan ${plan.id} failed live catalog parity: ${JSON.stringify(state)}`
        );
      }
    }

    for (const auto of AI_AUTOMATION_PACKAGES) {
      const state = resolveCatalogPlanState({
        serviceType: 'ai_automation',
        serviceId: auto.id,
        fallbackLabel: auto.name,
        fallbackPriceBdt: auto.priceMonthly,
        catalog: liveCatalog,
        requireCatalog: true,
      });
      if (!state.isAvailable || state.priceBdt !== auto.priceMonthly || state.planTierLabel !== auto.name) {
        throw new Error(
          `Frontend automation package ${auto.id} failed live catalog parity: ${JSON.stringify(state)}`
        );
      }
    }

    for (const web of WEBSITE_DEVELOPMENT_PACKAGES) {
      const state = resolveCatalogPlanState({
        serviceType: 'website_package',
        serviceId: web.id,
        fallbackLabel: web.name,
        fallbackPriceBdt: web.priceOneTime,
        catalog: liveCatalog,
        requireCatalog: true,
      });
      if (!state.isAvailable || state.priceBdt !== web.priceOneTime || state.planTierLabel !== web.name) {
        throw new Error(
          `Frontend website package ${web.id} failed live catalog parity: ${JSON.stringify(state)}`
        );
      }
    }

    // 9d. Verify NO fallback prices bypass catalog validation when catalog is empty or plan is inactive
    if (
      resolveAuthoritativeServicePrice({
        serviceType: 'dashboard_plan',
        serviceId: 'business',
        catalog: [],
        requireCatalog: true,
      }) !== null
    ) {
      throw new Error('Empty catalog fell back to static dashboard_plan price');
    }

    const catalogWithInactivePro = liveCatalog.map((entry) =>
      entry.serviceType === 'dashboard_plan' && entry.serviceCode === 'pro'
        ? { ...entry, isActive: false }
        : entry
    );
    if (
      resolveAuthoritativeServicePrice({
        serviceType: 'dashboard_plan',
        serviceId: 'pro',
        catalog: catalogWithInactivePro,
      }) !== null
    ) {
      throw new Error('Inactive pro plan fell back to static 999 BDT price');
    }
    const inactiveProState = resolveCatalogPlanState({
      serviceType: 'dashboard_plan',
      serviceId: 'pro',
      fallbackLabel: 'Pro',
      fallbackPriceBdt: 999,
      catalog: catalogWithInactivePro,
      requireCatalog: true,
    });
    if (inactiveProState.isAvailable || inactiveProState.priceBdt !== null) {
      throw new Error('resolveCatalogPlanState marked inactive Pro plan as available');
    }

    // 9e. Verify database trigger accepts exact 299/599/999/1999 canonical submissions and rejects legacy 500/1500/2500 amounts on canonical IDs + rejects inactive plans
    const wrongCanonicalPayloads: Array<[string, string, number]> = [
      ['starter', 'Starter', 500],
      ['business', 'Business', 1500],
      ['pro', 'Pro', 2500],
      ['enterprise', 'Enterprise', 2500],
    ];
    for (const [planCode, tierLabel, wrongAmount] of wrongCanonicalPayloads) {
      let rejected = false;
      try {
        await db.query(`
          INSERT INTO public.payment_requests (
            user_id, customer_name, customer_phone, customer_email,
            service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
          ) VALUES (
            '${userA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
            'dashboard_plan', '${planCode}', 'GoAMAAS Dashboard — ${tierLabel} Plan', '${tierLabel}', ${wrongAmount}, 'bKash', 'WRONG_${planCode.toUpperCase()}'
          );
        `);
      } catch (err: any) {
        if ((err.message || '').includes('Invalid payment amount')) {
          rejected = true;
        }
      }
      if (!rejected) {
        throw new Error(`Canonical plan "${planCode}" accepted legacy mismatched amount ${wrongAmount}`);
      }
    }

    // Valid canonical submissions for all 4 dashboard plans (clearing pending between each due to partial unique index per service)
    for (const exp of expectedDashboardPlans) {
      const inserted = await db.query<{ id: string; service_id: string; plan_tier: string; amount: string }>(`
        INSERT INTO public.payment_requests (
          user_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'dashboard_plan', '${exp.id}', 'GoAMAAS Dashboard — ${exp.name} Plan', '${exp.name}', ${exp.price}, 'bKash', 'VALID_${exp.id.toUpperCase()}_2026'
        ) RETURNING id, service_id, plan_tier, amount::text;
      `);
      if (
        inserted.rows[0].service_id !== exp.id ||
        inserted.rows[0].plan_tier !== exp.name ||
        Number(inserted.rows[0].amount) !== exp.price
      ) {
        throw new Error(`Unexpected inserted payment_request row for ${exp.id}: ${JSON.stringify(inserted.rows[0])}`);
      }
    }

    // Mark 'enterprise' inactive in DB catalog and confirm DB trigger blocks new enterprise payment requests
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      DELETE FROM public.payment_requests WHERE user_id = '${userA}' AND service_id = 'enterprise';
      UPDATE public.service_pricing_catalog
      SET is_active = false
      WHERE service_type = 'dashboard_plan' AND service_code = 'enterprise';
    `);

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    let inactiveDbRejected = false;
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
          'dashboard_plan', 'enterprise', 'GoAMAAS Dashboard — Enterprise Plan', 'Enterprise', 1999, 'bKash', 'INACTIVE_ENT_1999'
        );
      `);
    } catch (err: any) {
      if ((err.message || '').includes('Invalid or ineligible service_id')) {
        inactiveDbRejected = true;
      }
    }
    if (!inactiveDbRejected) {
      throw new Error('Inactive enterprise dashboard_plan was accepted by payment_requests trigger');
    }
  });

  console.log(`\n=== SUMMARY: ${passed}/${total} REMEDIATION TESTS PASSED ===`);
  if (passed !== total) {
    process.exit(1);
  }
}

runRemediation20261026Suite().catch((err) => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});

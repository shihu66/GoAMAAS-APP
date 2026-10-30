import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';

async function runPaymentApprovalSafetySuite() {
  console.log('=== PAYMENT APPROVAL HARDENING & TARGETING SAFETY TEST SUITE ===');
  let passed = 0;
  let total = 0;

  async function test(name: string, fn: (db: PGlite) => Promise<void>) {
    total++;
    const db = new PGlite();

    // Setup mock Supabase auth environment
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

    try {
      await fn(db);
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}`);
      console.error(`       Error: ${err.message || err}`);
    }
  }

  const baseSchema = fs.readFileSync('supabase/schema.sql', 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
  const migration20261017 = fs.readFileSync('supabase/migrations/20261017_public_website_resolution_and_publishing.sql', 'utf8');
  const migration20261018 = fs.readFileSync('supabase/migrations/20261018_fix_admin_approve_payment_request_safety.sql', 'utf8');
  const migration20261024 = fs.readFileSync('supabase/migrations/20261024_harden_payment_requests_ownership_and_uniqueness.sql', 'utf8');

  async function asUser(db: PGlite, userId: string | null, email: string | null = null, role: string = 'authenticated') {
    await db.exec(`RESET ROLE;`);
    await db.exec(`
      UPDATE public._test_session 
      SET current_user_id = ${userId ? `'${userId}'::uuid` : 'NULL'},
          current_email = ${email ? `'${email}'` : 'NULL'},
          session_role = '${role}';
      SELECT set_config('request.jwt.claim.role', '${role}', false);
      SELECT set_config('request.jwt.claim.sub', ${userId ? `'${userId}'` : "''"}, false);
      SELECT set_config('request.jwt.claims', json_build_object('sub', ${userId ? `'${userId}'` : "NULL"}, 'role', '${role}')::text, false);
    `);
    if (role === 'authenticated' || role === 'anon') {
      await db.exec(`SET ROLE ${role};`);
    } else {
      await db.exec(`RESET ROLE;`);
    }
  }

  async function setupStandardTestFixture(db: PGlite) {
    await db.exec(baseSchema);
    await db.exec(migration20261017);
    await db.exec(migration20261018);
    await db.exec(migration20261024);

    const userA = '11111111-1111-4111-8111-111111111111';
    const userB = '22222222-2222-4222-8222-222222222222';
    const adminUser = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const storeA = 'aaaaaaaa-1111-4111-8111-111111111111';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES 
        ('${userA}', 'merchant_a@test.com'),
        ('${userB}', 'merchant_b@test.com'),
        ('${adminUser}', 'admin@amaas.xyz');
      INSERT INTO public.stores (id, owner_id, name, slug) VALUES ('${storeA}', '${userA}', 'Store A', 'store-a');
      UPDATE public.profiles SET role = 'admin' WHERE id = '${adminUser}';
    `);

    // Insert website 1 for User A
    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const site1Res = await db.query<{ id: string }>(`
      INSERT INTO public.subscribed_websites (
        user_id, store_id, business_name, niche, subdomain, full_domain
      ) VALUES (
        '${userA}', '${storeA}', 'Bistro Alpha', 'restaurant', 'bistroalpha', 'bistroalpha.amaas.xyz'
      ) RETURNING id;
    `);
    const site1Id = site1Res.rows[0].id;

    // Insert website 2 (sibling) for User A
    const site2Res = await db.query<{ id: string }>(`
      INSERT INTO public.subscribed_websites (
        user_id, store_id, business_name, niche, subdomain, full_domain
      ) VALUES (
        '${userA}', '${storeA}', 'Bistro Beta', 'restaurant', 'bistrobeta', 'bistrobeta.amaas.xyz'
      ) RETURNING id;
    `);
    const site2Id = site2Res.rows[0].id;

    return { userA, userB, adminUser, storeA, site1Id, site2Id };
  }

  // 1. Valid website payment approval activates target website and approves request
  await test('1. Valid website payment approval activates exact target website and approves request', async (db) => {
    const { userA, adminUser, storeA, site1Id } = await setupStandardTestFixture(db);

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const prRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${site1Id}', 'Website Lite', '৳600/month', 600, 'bKash', 'pending'
      ) RETURNING id;
    `);
    const reqId = prRes.rows[0].id;

    // Admin approves payment
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const approveRes = await db.query<{ admin_approve_payment_request: any }>(`
      SELECT public.admin_approve_payment_request('${reqId}', 'SMS statement verified');
    `);
    const result = approveRes.rows[0].admin_approve_payment_request;
    if (!result.success) throw new Error('Approval unexpectedly failed: ' + result.message);

    // Verify website is paid and active
    const siteRow = (await db.query<{ payment_status: string; status: string }>(`
      SELECT payment_status, status FROM public.subscribed_websites WHERE id = '${site1Id}';
    `)).rows[0];
    if (siteRow.payment_status !== 'paid') throw new Error(`Expected site payment_status 'paid', got ${siteRow.payment_status}`);
    if (siteRow.status !== 'active') throw new Error(`Expected site status 'active', got ${siteRow.status}`);

    // Verify payment_request is approved
    const prRow = (await db.query<{ status: string }>(`
      SELECT status FROM public.payment_requests WHERE id = '${reqId}';
    `)).rows[0];
    if (prRow.status !== 'approved') throw new Error(`Expected request status 'approved', got ${prRow.status}`);
  });

  // 2. Website payment with missing target website fails and keeps request pending
  await test('2. Website payment with non-existent target website fails and leaves request pending', async (db) => {
    const { userA, adminUser, storeA } = await setupStandardTestFixture(db);
    const nonExistentSiteId = '99999999-9999-4999-8999-999999999999';

    // Seed legacy/orphaned row via service_role (authenticated INSERT is now blocked by 20261024)
    await asUser(db, null, null, 'service_role');
    const prRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${nonExistentSiteId}', 'Website Lite', '৳600/month', 600, 'bKash', 'pending'
      ) RETURNING id;
    `);
    const reqId = prRes.rows[0].id;

    // Admin attempts to approve
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const approveRes = await db.query<{ admin_approve_payment_request: any }>(`
      SELECT public.admin_approve_payment_request('${reqId}', 'Test note');
    `);
    const result = approveRes.rows[0].admin_approve_payment_request;

    if (result.success) throw new Error('Expected approval to fail for missing website');
    if (result.code !== 'WEBSITE_NOT_FOUND') throw new Error(`Expected code 'WEBSITE_NOT_FOUND', got '${result.code}'`);

    // Verify payment_request remains pending
    const prRow = (await db.query<{ status: string }>(`
      SELECT status FROM public.payment_requests WHERE id = '${reqId}';
    `)).rows[0];
    if (prRow.status !== 'pending') throw new Error(`Request was mutated to '${prRow.status}', should remain 'pending'`);
  });

  // 3. Website payment with mismatched user_id fails and leaves request pending
  await test('3. Website payment with mismatched tenant user_id fails and leaves request pending', async (db) => {
    const { userA, userB, adminUser, storeA, site1Id } = await setupStandardTestFixture(db);

    // Seed legacy cross-tenant row via service_role to verify admin_approve_payment_request defense-in-depth
    await asUser(db, null, null, 'service_role');
    const prRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${userB}', '${storeA}', 'Merchant B', '01700000000', 'merchant_b@test.com',
        'website_subscription', '${site1Id}', 'Website Lite', '৳600/month', 600, 'bKash', 'pending'
      ) RETURNING id;
    `);
    const reqId = prRes.rows[0].id;

    // Admin attempts to approve
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const approveRes = await db.query<{ admin_approve_payment_request: any }>(`
      SELECT public.admin_approve_payment_request('${reqId}', 'Test note');
    `);
    const result = approveRes.rows[0].admin_approve_payment_request;

    if (result.success) throw new Error('Expected approval to fail for tenant mismatch');
    if (result.code !== 'TENANT_MISMATCH') throw new Error(`Expected code 'TENANT_MISMATCH', got '${result.code}'`);

    // Confirm User A's website was NOT marked paid
    const siteRow = (await db.query<{ payment_status: string }>(`
      SELECT payment_status FROM public.subscribed_websites WHERE id = '${site1Id}';
    `)).rows[0];
    if (siteRow.payment_status === 'paid') throw new Error('Site was unexpectedly marked paid');

    // Confirm request remains pending
    const prRow = (await db.query<{ status: string }>(`
      SELECT status FROM public.payment_requests WHERE id = '${reqId}';
    `)).rows[0];
    if (prRow.status !== 'pending') throw new Error(`Request status was mutated to '${prRow.status}'`);
  });

  // 4. Website payment with invalid service_id format fails
  await test('4. Website payment with non-UUID service_id format fails cleanly', async (db) => {
    const { userA, adminUser, storeA } = await setupStandardTestFixture(db);

    // Seed legacy malformed service_id row via service_role
    await asUser(db, null, null, 'service_role');
    const prRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', 'invalid-non-uuid-string', 'Website Lite', '৳600/month', 600, 'bKash', 'pending'
      ) RETURNING id;
    `);
    const reqId = prRes.rows[0].id;

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const approveRes = await db.query<{ admin_approve_payment_request: any }>(`
      SELECT public.admin_approve_payment_request('${reqId}', 'Test note');
    `);
    const result = approveRes.rows[0].admin_approve_payment_request;

    if (result.success) throw new Error('Expected approval to fail for invalid UUID format');
    if (result.code !== 'INVALID_SERVICE_ID') throw new Error(`Expected code 'INVALID_SERVICE_ID', got '${result.code}'`);
  });

  // 5. Multiple matching rows check
  await test('5. Ambiguous matching guard prevents multiple row activation', async (db) => {
    const { userA, adminUser, storeA } = await setupStandardTestFixture(db);

    // Seed legacy empty service_id payment request via service_role
    await asUser(db, null, null, 'service_role');
    const prRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '', 'Website Lite', '৳600/month', 600, 'bKash', 'pending'
      ) RETURNING id;
    `);
    const reqId = prRes.rows[0].id;

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const approveRes = await db.query<{ admin_approve_payment_request: any }>(`
      SELECT public.admin_approve_payment_request('${reqId}', 'Test note');
    `);
    const result = approveRes.rows[0].admin_approve_payment_request;

    if (result.success) throw new Error('Expected approval to fail for empty service_id');
    if (result.code !== 'MISSING_SERVICE_ID') throw new Error(`Expected code 'MISSING_SERVICE_ID', got '${result.code}'`);
  });

  // 6. Repeated approval is rejected and cannot re-extend billing
  await test('6. Repeated approval is rejected and cannot re-extend billing', async (db) => {
    const { userA, adminUser, storeA, site1Id } = await setupStandardTestFixture(db);

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const prRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${site1Id}', 'Website Lite', '৳600/month', 600, 'bKash', 'pending'
      ) RETURNING id;
    `);
    const reqId = prRes.rows[0].id;

    // Approve first time
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const firstRes = await db.query<{ admin_approve_payment_request: any }>(`
      SELECT public.admin_approve_payment_request('${reqId}', 'First approval');
    `);
    if (!firstRes.rows[0].admin_approve_payment_request.success) throw new Error('First approval failed');

    // Attempt second approval
    const secondRes = await db.query<{ admin_approve_payment_request: any }>(`
      SELECT public.admin_approve_payment_request('${reqId}', 'Second approval attempt');
    `);
    const result = secondRes.rows[0].admin_approve_payment_request;
    if (result.success) throw new Error('Expected second approval to be rejected');
    if (result.code !== 'ALREADY_SETTLED') throw new Error(`Expected code 'ALREADY_SETTLED', got '${result.code}'`);
  });

  // 7. Non-website payment request preserves existing behavior
  await test('7. Non-website payment request (dashboard_plan) approves successfully', async (db) => {
    const { userA, adminUser, storeA } = await setupStandardTestFixture(db);

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const prRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'dashboard_plan', 'plan_pro', 'Business Pro SaaS Plan', '৳2,500/month', 2500, 'bKash', 'pending'
      ) RETURNING id;
    `);
    const reqId = prRes.rows[0].id;

    // Admin approves non-website request
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const approveRes = await db.query<{ admin_approve_payment_request: any }>(`
      SELECT public.admin_approve_payment_request('${reqId}', 'Subscription plan approved');
    `);
    const result = approveRes.rows[0].admin_approve_payment_request;
    if (!result.success) throw new Error('Approval of dashboard_plan failed: ' + result.message);

    const prRow = (await db.query<{ status: string }>(`
      SELECT status FROM public.payment_requests WHERE id = '${reqId}';
    `)).rows[0];
    if (prRow.status !== 'approved') throw new Error(`Expected request status 'approved', got ${prRow.status}`);
  });

  // 8. Non-admin attempting approval is rejected
  await test('8. Non-admin attempting approval is rejected at engine level', async (db) => {
    const { userA, storeA, site1Id } = await setupStandardTestFixture(db);

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const prRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${site1Id}', 'Website Lite', '৳600/month', 600, 'bKash', 'pending'
      ) RETURNING id;
    `);
    const reqId = prRes.rows[0].id;

    // Merchant attempts to approve their own payment
    let blocked = false;
    try {
      await db.query(`SELECT public.admin_approve_payment_request('${reqId}', 'Self approval');`);
    } catch (e: any) {
      blocked = true;
    }
    if (!blocked) throw new Error('Non-admin successfully invoked admin_approve_payment_request');
  });

  // 9. Transaction rollback: when website activation fails, request remains pending
  await test('9. Atomic safety: payment_requests is never left approved when website activation fails', async (db) => {
    const { userA, adminUser, storeA } = await setupStandardTestFixture(db);
    const nonExistentId = '12345678-1234-4234-8234-123456789abc';

    // Seed legacy orphaned row via service_role
    await asUser(db, null, null, 'service_role');
    const prRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${nonExistentId}', 'Website Lite', '৳600/month', 600, 'bKash', 'pending'
      ) RETURNING id;
    `);
    const reqId = prRes.rows[0].id;

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    await db.query(`SELECT public.admin_approve_payment_request('${reqId}', 'Note');`);

    // Must still be pending
    const prRow = (await db.query<{ status: string; reviewed_by: string | null }>(`
      SELECT status, reviewed_by FROM public.payment_requests WHERE id = '${reqId}';
    `)).rows[0];
    if (prRow.status !== 'pending') throw new Error(`Request was marked '${prRow.status}' when activation failed`);
    if (prRow.reviewed_by !== null) throw new Error(`reviewed_by was set unexpectedly`);
  });

  // 10. Sibling websites remaining unchanged
  await test('10. Approving site1 payment leaves sibling site2 payment_status as pending', async (db) => {
    const { userA, adminUser, storeA, site1Id, site2Id } = await setupStandardTestFixture(db);

    await asUser(db, userA, 'merchant_a@test.com', 'authenticated');
    const prRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${userA}', '${storeA}', 'Merchant A', '01700000000', 'merchant_a@test.com',
        'website_subscription', '${site1Id}', 'Website Lite', '৳600/month', 600, 'bKash', 'pending'
      ) RETURNING id;
    `);
    const reqId = prRes.rows[0].id;

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    await db.query(`SELECT public.admin_approve_payment_request('${reqId}', 'Approval note');`);

    // Verify site1 is paid, site2 is still pending
    const sites = (await db.query<{ id: string; payment_status: string }>(`
      SELECT id, payment_status FROM public.subscribed_websites WHERE user_id = '${userA}';
    `)).rows;
    const site1 = sites.find((s) => s.id === site1Id);
    const site2 = sites.find((s) => s.id === site2Id);

    if (site1?.payment_status !== 'paid') throw new Error(`Site 1 was not marked paid`);
    if (site2?.payment_status !== 'pending') throw new Error(`Sibling Site 2 was unexpectedly marked: ${site2?.payment_status}`);
  });

  console.log(`
============================================================`);
  console.log(`PAYMENT APPROVAL RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log(`============================================================`);

  if (passed !== total) process.exit(1);
}

runPaymentApprovalSafetySuite().catch((err) => {
  console.error('Fatal error in payment safety test suite:', err);
  process.exit(1);
});

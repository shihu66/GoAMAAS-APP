import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

async function runPostgresSecurityTests() {
  console.log('=== REAL POSTGRESQL ENGINE SECURITY & RLS TEST SUITE ===');
  const db = new PGlite();

  // 1. Setup Supabase Auth Mock Environment in PostgreSQL
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
      id UUID PRIMARY KEY,
      email TEXT,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Session state variables
    CREATE TABLE IF NOT EXISTS public._test_session (
      current_user_id UUID,
      current_email TEXT,
      session_role TEXT DEFAULT 'authenticated'
    );
    INSERT INTO public._test_session VALUES (NULL, NULL, 'authenticated');

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT current_user_id FROM public._test_session LIMIT 1;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT AS $$
      SELECT current_email FROM public._test_session LIMIT 1;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
      SELECT session_role FROM public._test_session LIMIT 1;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
    $$ LANGUAGE sql STABLE;
  `);

  console.log('[OK] PostgreSQL mock auth environment initialized.');

  // 2. Load and Apply base schema.sql then Migration SQL
  const schemaPath = path.resolve("supabase/schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, 'utf8').replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
  await db.exec(schemaSql);
  console.log("[OK] Base schema applied successfully to PostgreSQL.");
  await db.exec(`
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, anon, service_role;
    ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.stores FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.store_members FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.subscribed_websites FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
  `);

  const migrationPath = path.resolve('supabase/migrations/20261010_security_and_rls_hardening.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8').replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');

  try {
    await db.exec(migrationSql);
    console.log('[OK] Migration applied successfully to PostgreSQL.');
  } catch (err: any) {
    console.error('Migration failed to execute on PostgreSQL:', err.message, 'pos:', err.position, 'where:', err.where);
    process.exit(1);
  }

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}`);
      console.error(`       Error: ${err.message || err}`);
    }
  }

  // Helper to switch simulated user session
  async function asUser(userId: string | null, email: string | null = null, role: string = 'authenticated') {
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

  const userMerchantA = '11111111-1111-1111-1111-111111111111';
  const userMerchantB = '22222222-2222-2222-2222-222222222222';
  const userStaffA = '33333333-3333-3333-3333-333333333333';
  const userAdmin = '99999999-9999-9999-9999-999999999999';

  // Seed Users into auth.users (trigger creates profiles)
  await asUser(null, null, 'service_role');
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${userMerchantA}', 'merchantA@test.com', '{"full_name": "Merchant A", "role": "admin"}'::jsonb),
      ('${userMerchantB}', 'merchantB@test.com', '{"full_name": "Merchant B"}'::jsonb),
      ('${userStaffA}', 'staffA@test.com', '{"full_name": "Staff A"}'::jsonb),
      ('${userAdmin}', 'superadmin@test.com', '{"full_name": "Super Admin"}'::jsonb);

    -- Elevate only the official platform admin manually in database
    UPDATE public.profiles SET role = 'admin' WHERE id = '${userAdmin}';
  `);

  // TEST 1: Role Spoofing on Signup Prevented
  await test('Signup trigger ignores user-supplied {"role": "admin"} metadata', async () => {
    const res = await db.query<{ role: string }>(`SELECT role FROM public.profiles WHERE id = '${userMerchantA}'`);
    if (res.rows[0].role !== 'merchant') {
      throw new Error(`Expected role 'merchant', but got '${res.rows[0].role}'`);
    }
  });

  // TEST 2: Normal Profile Update Works Without RLS Recursion
  await test('Normal merchant can update allowed fields without RLS recursion', async () => {
    await asUser(userMerchantA, 'merchantA@test.com');
    await db.exec(`
      UPDATE public.profiles
      SET full_name = 'Merchant A Updated', onboarding_completed = true
      WHERE id = '${userMerchantA}';
    `);
    const res = await db.query<{ full_name: string; onboarding_completed: boolean }>(`SELECT full_name, onboarding_completed FROM public.profiles WHERE id = '${userMerchantA}'`);
    if (res.rows[0].full_name !== 'Merchant A Updated' || !res.rows[0].onboarding_completed) {
      throw new Error('Profile update was not persisted');
    }
  });

  // TEST 3: Self-Promotion to Admin Role is Blocked
  await test('Merchant attempting self-promotion to admin fails at PostgreSQL engine level', async () => {
    await asUser(userMerchantA, 'merchantA@test.com');
    let threw = false;
    try {
      await db.exec(`
        UPDATE public.profiles
        SET role = 'admin'
        WHERE id = '${userMerchantA}';
      `);
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('Access denied')) {
        throw new Error(`Unexpected error message: ${e.message}`);
      }
    }
    if (!threw) {
      throw new Error('Self-promotion did not throw an exception!');
    }
    const res = await db.query<{ role: string }>(`SELECT role FROM public.profiles WHERE id = '${userMerchantA}'`);
    if (res.rows[0].role !== 'merchant') {
      throw new Error(`Role was illegally updated to ${res.rows[0].role}`);
    }
  });

  // Setup Stores & Tenancy
  const storeA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const storeB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  await asUser(userMerchantA, 'merchantA@test.com');
  await db.exec(`
    INSERT INTO public.stores (id, owner_id, name, slug) VALUES
      ('${storeA}', '${userMerchantA}', 'Store A', 'store-a');
  `);

  await asUser(userMerchantB, 'merchantB@test.com');
  await db.exec(`
    INSERT INTO public.stores (id, owner_id, name, slug) VALUES
      ('${storeB}', '${userMerchantB}', 'Store B', 'store-b');
  `);

  // Add Staff Member to Store A
  await asUser(userMerchantA, 'merchantA@test.com');
  await db.exec(`
    INSERT INTO public.store_members (store_id, user_id, name, email, role, status) VALUES
      ('${storeA}', '${userStaffA}', 'Staff Member A', 'staffA@test.com', 'manager', 'active');
  `);

  // TEST 4: Cross-Tenant Data Isolation (Select)
  await test('Cross-tenant isolation: User B cannot view Store A products', async () => {
    // Insert product into Store A
    await asUser(userMerchantA, 'merchantA@test.com');
    await db.exec(`
      INSERT INTO public.products (store_id, name, sku, price, stock) VALUES
        ('${storeA}', 'Store A Item', 'SKU-A-1', 500, 10);
    `);

    // Merchant B attempts to view Store A products
    await asUser(userMerchantB, 'merchantB@test.com');
    const res = await db.query(`SELECT * FROM public.products WHERE store_id = '${storeA}'`);
    if (res.rows.length !== 0) {
      throw new Error(`Merchant B illegally saw ${res.rows.length} products of Store A`);
    }
  });

  // TEST 5: Cross-Tenant Write Blocked by WITH CHECK
  await test('Cross-tenant write: User B cannot insert product into Store A', async () => {
    await asUser(userMerchantB, 'merchantB@test.com');
    let threw = false;
    try {
      await db.exec(`
        INSERT INTO public.products (store_id, name, sku, price, stock) VALUES
          ('${storeA}', 'Hacked Item', 'HACK-1', 999, 1);
      `);
    } catch {
      threw = true;
    }
    if (!threw) {
      throw new Error('User B was able to insert product into Store A without authorization');
    }
  });

  // TEST 6: Manager Cannot Grant Privileged Roles (Privilege Escalation Prevention)
  await test('Manager cannot invite another member with role "admin" or "owner"', async () => {
    await asUser(userStaffA, 'staffA@test.com');
    let threw = false;
    try {
      await db.exec(`
        INSERT INTO public.store_members (store_id, name, email, role, status) VALUES
          ('${storeA}', 'New Admin', 'newadmin@test.com', 'admin', 'invited');
      `);
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('Access denied')) {
        throw new Error(`Unexpected error message: ${e.message}`);
      }
    }
    if (!threw) {
      throw new Error('Manager was able to grant admin role');
    }
  });

  // TEST 7: Manager Can Invite Staff Member
  await test('Manager can invite a staff member with role "staff"', async () => {
    await asUser(userStaffA, 'staffA@test.com');
    await db.exec(`
      INSERT INTO public.store_members (store_id, name, email, role, status) VALUES
        ('${storeA}', 'New Staff', 'newstaff@test.com', 'staff', 'invited');
    `);
    const res = await db.query(`SELECT * FROM public.store_members WHERE email = 'newstaff@test.com'`);
    if (res.rows.length === 0) {
      throw new Error('Staff invitation was not inserted');
    }
  });

  // TEST 8: Manager Cannot Self-Promote to Admin or Owner
  await test('Manager cannot self-promote to admin or owner role', async () => {
    await asUser(userStaffA, 'staffA@test.com');
    let threw = false;
    try {
      await db.exec(`
        UPDATE public.store_members
        SET role = 'owner'
        WHERE store_id = '${storeA}' AND user_id = '${userStaffA}';
      `);
    } catch (e: any) {
      threw = true;
      if (!e.message.includes('Access denied')) {
        throw new Error(`Unexpected error message: ${e.message}`);
      }
    }
    if (!threw) {
      throw new Error('Manager self-escalation succeeded unexpectedly');
    }
  });

  // TEST 9: Store Owner Can Update Member Roles
  await test('Store Owner can promote staff to manager or admin', async () => {
    await asUser(userMerchantA, 'merchantA@test.com');
    await db.exec(`
      UPDATE public.store_members
      SET role = 'admin'
      WHERE store_id = '${storeA}' AND email = 'newstaff@test.com';
    `);
    const res = await db.query<{ role: string }>(`SELECT role FROM public.store_members WHERE email = 'newstaff@test.com'`);
    if (res.rows[0].role !== 'admin') {
      throw new Error(`Expected role 'admin', got '${res.rows[0].role}'`);
    }
  });

  // TEST 10: Subscribed Websites Default Integrity
  await test('Subscribed websites default to "deploying" and zero resource telemetry', async () => {
    await asUser(userMerchantA, 'merchantA@test.com');
    await db.exec(`
      INSERT INTO public.subscribed_websites (
        user_id, business_name, niche, subdomain, full_domain, template_id, template_name, current_period_end, grace_period_end
      ) VALUES (
        '${userMerchantA}', 'My Test Business', 'Fashion', 'testbiz', 'testbiz.amaas.xyz', 't1', 'Template 1', NOW() + INTERVAL '30 days', NOW() + INTERVAL '37 days'
      );
    `);
    const res = await db.query<{ deployment_status: string; resource_usage: any }>(`SELECT deployment_status, resource_usage FROM public.subscribed_websites WHERE subdomain = 'testbiz'`);
    if (res.rows[0].deployment_status !== 'deploying') {
      throw new Error(`Expected status 'deploying', got '${res.rows[0].deployment_status}'`);
    }
    if (res.rows[0].resource_usage.storageUsedMb !== 0 || res.rows[0].resource_usage.bandwidthUsedGb !== 0) {
      throw new Error(`Expected 0 usage telemetry, got ${JSON.stringify(res.rows[0].resource_usage)}`);
    }
  });

  console.log(`\n========================================`);
  console.log(`POSTGRESQL ENGINE RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log(`========================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

runPostgresSecurityTests().catch((e) => {
  console.error('Fatal error in Postgres test suite:', e);
  process.exit(1);
});

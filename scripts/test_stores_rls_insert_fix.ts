import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  StoreWorkspaceCoordinator,
  resolveTargetStoreIdForProduct,
} from '../src/lib/storeWorkspace';
import { isRlsPolicyError } from '../src/lib/supabase';
import type { Store } from '../src/types';

function makeStore(id: string, name: string, slug = 'store-slug'): Store {
  return {
    id,
    name,
    slug,
    category: 'General E-Commerce',
    currency: '৳',
    phone: '',
    address: '',
    createdAt: '2026-11-01',
  };
}

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

async function runTests() {
  let passed = 0;
  const totalChecks = 10;

  const baseSchema = fs
    .readFileSync(path.resolve('supabase/schema.sql'), 'utf8')
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/gi, '');
  const mig20261010 = fs
    .readFileSync(
      path.resolve('supabase/migrations/20261010_security_and_rls_hardening.sql'),
      'utf8'
    )
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/gi, '');
  const mig20261017 = fs
    .readFileSync(
      path.resolve('supabase/migrations/20261017_public_website_resolution_and_publishing.sql'),
      'utf8'
    )
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/gi, '');
  const mig20261026 = fs
    .readFileSync(
      path.resolve('supabase/migrations/20261026_stores_gateway_pricing_and_admin_hardening.sql'),
      'utf8'
    )
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/gi, '');

  const USER_A = '11111111-1111-4111-8111-111111111111';
  const USER_B = '22222222-2222-4222-8222-222222222222';
  const USER_STAFF = '33333333-3333-4333-8333-333333333333';
  const STORE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const STORE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

  async function setupPre20261026Db(): Promise<PGlite> {
    const db = new PGlite();
    await initSupabaseMockEnv(db);
    await db.exec(baseSchema);
    await db.exec(mig20261010);
    await db.exec(mig20261017);
    await db.exec(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stores TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_members TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;
      INSERT INTO auth.users (id, email) VALUES
        ('${USER_A}', 'merchant_a@example.com'),
        ('${USER_B}', 'merchant_b@example.com'),
        ('${USER_STAFF}', 'staff@example.com');
      INSERT INTO public.profiles (id, email, full_name, role) VALUES
        ('${USER_A}', 'merchant_a@example.com', 'Merchant A', 'merchant'),
        ('${USER_B}', 'merchant_b@example.com', 'Merchant B', 'merchant'),
        ('${USER_STAFF}', 'staff@example.com', 'Staff Member', 'merchant')
      ON CONFLICT (id) DO NOTHING;
    `);
    return db;
  }

  async function check(name: string, fn: () => Promise<void> | void) {
    await fn();
    passed += 1;
    console.log(`PASS [${passed}/${totalChecks}]: ${name}`);
  }

  // Test 1: Existing merchant with existing store reuses store without INSERT
  await check('1. Existing merchant with existing store loads and reuses store without INSERT', async () => {
    const db = await setupPre20261026Db();
    try {
      await asUser(db, USER_A, 'merchant_a@example.com', 'authenticated');
      await db.exec(
        `INSERT INTO public.stores (id, owner_id, name, slug) VALUES ('${STORE_A}', '${USER_A}', 'Existing Store A', 'existing-store-a');`
      );

      let createCalls = 0;
      const coordinator = new StoreWorkspaceCoordinator({
        fetchStores: async () => {
          const res = await db.query<{
            id: string;
            owner_id: string;
            name: string;
            slug: string;
            category: string | null;
            currency: string | null;
            phone: string | null;
            address: string | null;
          }>(`SELECT * FROM public.stores ORDER BY created_at ASC;`);
          return {
            data: res.rows.map((r) => ({
              id: r.id,
              name: r.name,
              slug: r.slug,
              category: r.category || 'General E-Commerce',
              currency: r.currency || '৳',
              phone: r.phone || '',
              address: r.address || '',
              createdAt: '2026-11-01',
            })),
            error: null,
          };
        },
        createStore: async () => {
          createCalls += 1;
          return { data: null, error: new Error('Should not attempt INSERT when store exists') };
        },
      });

      const res = await coordinator.initialize({ userId: USER_A, userName: 'Merchant A' });
      assert.equal(res.status, 'ready');
      assert.equal(res.storeId, STORE_A);
      assert.equal(res.stores.length, 1);
      assert.equal(createCalls, 0);
    } finally {
      await db.close();
    }
  });

  // Test 2: New merchant with no store creates store cleanly under BOTH Production (pre-20261026) and Staging (20261026) RLS
  await check('2. New merchant reproduces legacy RETURNING * 42501 failure and succeeds via two-step INSERT -> SELECT under Production & 20261026 RLS', async () => {
    const db = await setupPre20261026Db();
    try {
      await asUser(db, USER_A, 'merchant_a@example.com', 'authenticated');

      // Reproduce exact Production bug: INSERT ... RETURNING * fails under pre-20261026 SELECT policy USING (can_access_store(id))
      let legacyRlsError: unknown = null;
      try {
        await db.exec(
          `INSERT INTO public.stores (owner_id, name, slug) VALUES ('${USER_A}', 'Legacy Store', 'legacy-store-1') RETURNING *;`
        );
      } catch (err) {
        legacyRlsError = err;
      }
      assert.ok(legacyRlsError, 'Legacy INSERT ... RETURNING * must reproduce 42501 RLS error on pre-20261026 policy');
      assert.match(
        String((legacyRlsError as Error).message || legacyRlsError),
        /row-level security policy for table "stores"/i
      );

      // Fixed two-step flow: INSERT without RETURNING, then SELECT in new snapshot
      await db.exec(
        `INSERT INTO public.stores (owner_id, name, slug, category, currency) VALUES ('${USER_A}', 'Production Fixed Store', 'prod-fixed-store', 'Fashion & Apparel', '৳');`
      );
      const selected = await db.query<{ id: string; owner_id: string; name: string; slug: string }>(
        `SELECT * FROM public.stores WHERE owner_id = '${USER_A}' AND slug = 'prod-fixed-store' LIMIT 1;`
      );
      assert.equal(selected.rows.length, 1);
      assert.equal(selected.rows[0].owner_id, USER_A);
      assert.equal(selected.rows[0].name, 'Production Fixed Store');

      // Also verify UPDATE ... RETURNING * succeeds on existing row under pre-20261026 RLS
      const updated = await db.query<{ id: string; name: string }>(
        `UPDATE public.stores SET name = 'Updated Fixed Store' WHERE id = '${selected.rows[0].id}' RETURNING id, name;`
      );
      assert.equal(updated.rows[0].name, 'Updated Fixed Store');

      // Verify same two-step INSERT -> SELECT also succeeds with 20261026 policy applied
      const db2026 = new PGlite();
      try {
        await initSupabaseMockEnv(db2026);
        await db2026.exec(baseSchema);
        await db2026.exec(mig20261026);
        await db2026.exec(`
          INSERT INTO auth.users (id, email) VALUES ('${USER_B}', 'merchant_b@example.com');
          INSERT INTO public.profiles (id, email, full_name, role) VALUES ('${USER_B}', 'merchant_b@example.com', 'Merchant B', 'merchant') ON CONFLICT (id) DO NOTHING;
        `);
        await asUser(db2026, USER_B, 'merchant_b@example.com', 'authenticated');
        await db2026.exec(
          `INSERT INTO public.stores (owner_id, name, slug) VALUES ('${USER_B}', 'Store B 20261026', 'store-b-20261026');`
        );
        const selectedB = await db2026.query<{ owner_id: string }>(
          `SELECT owner_id FROM public.stores WHERE owner_id = '${USER_B}' AND slug = 'store-b-20261026';`
        );
        assert.equal(selectedB.rows.length, 1);
        assert.equal(selectedB.rows[0].owner_id, USER_B);
      } finally {
        await db2026.close();
      }
    } finally {
      await db.close();
    }
  });

  // Test 3: Correct ownership mapping (owner_id = auth.uid(), forged owner_id rejected) & source contract check
  await check('3. Forged owner_id is rejected by PostgreSQL RLS and createStoreInDb never chains .select() onto .insert()', async () => {
    const db = await setupPre20261026Db();
    try {
      await asUser(db, USER_A, 'merchant_a@example.com', 'authenticated');
      let forgedError: unknown = null;
      try {
        await db.exec(
          `INSERT INTO public.stores (owner_id, name, slug) VALUES ('${USER_B}', 'Forged Owner Store', 'forged-store');`
        );
      } catch (err) {
        forgedError = err;
      }
      assert.ok(forgedError, 'PostgreSQL RLS must reject INSERT when owner_id !== auth.uid()');
      assert.match(String((forgedError as Error).message || forgedError), /row-level security/i);
    } finally {
      await db.close();
    }

    // Verify source implementation in src/lib/supabase.ts
    const supabaseSrc = fs.readFileSync(path.resolve('src/lib/supabase.ts'), 'utf8');
    const fnStart = supabaseSrc.indexOf('export async function createStoreInDb');
    const fnEnd = supabaseSrc.indexOf('export async function updateStoreInDb');
    const fnBody = supabaseSrc.slice(fnStart, fnEnd);

    assert.ok(fnBody.includes('ensureActiveSupabaseSession()'), 'createStoreInDb must validate active session');
    assert.ok(fnBody.includes('owner_id: user.id'), 'createStoreInDb must set owner_id to authenticated user.id');
    assert.ok(
      !fnBody.includes('.insert({ ...basePayload, slug: targetSlug })\n      .select('),
      'createStoreInDb must NOT chain .select() directly onto .insert()'
    );
    assert.equal(
      /\.insert\([\s\S]{0,120}\)\.select\(/m.test(fnBody),
      false,
      'createStoreInDb must execute INSERT without RETURNING (.select) before running separate SELECT'
    );
    assert.ok(
      fnBody.includes("eq('owner_id', user.id)") && fnBody.includes("eq('slug', targetSlug)"),
      'createStoreInDb must perform separate post-insert SELECT by owner_id and slug'
    );
  });

  // Test 4: Store members relationship & can_access_store / can_manage_store verification
  await check('4. Owner satisfies can_access_store & can_manage_store without store_members row and can invite team members', async () => {
    const db = await setupPre20261026Db();
    try {
      await asUser(db, USER_A, 'merchant_a@example.com', 'authenticated');
      await db.exec(
        `INSERT INTO public.stores (id, owner_id, name, slug) VALUES ('${STORE_A}', '${USER_A}', 'Owner Store', 'owner-store');`
      );

      const accessCheck = await db.query<{ can_access: boolean; can_manage: boolean }>(
        `SELECT public.can_access_store('${STORE_A}'::uuid) AS can_access, public.can_manage_store('${STORE_A}'::uuid) AS can_manage;`
      );
      assert.equal(accessCheck.rows[0].can_access, true);
      assert.equal(accessCheck.rows[0].can_manage, true);

      // Owner can invite active/invited member into store_members
      const invited = await db.query<{ id: string; store_id: string; role: string }>(
        `INSERT INTO public.store_members (store_id, user_id, name, email, role, status)
         VALUES ('${STORE_A}', '${USER_STAFF}', 'Staff Member', 'staff@example.com', 'manager', 'active')
         RETURNING id, store_id, role;`
      );
      assert.equal(invited.rows[0].store_id, STORE_A);
      assert.equal(invited.rows[0].role, 'manager');

      // Invited active manager can read the store via can_access_store
      await asUser(db, USER_STAFF, 'staff@example.com', 'authenticated');
      const staffStoreRead = await db.query<{ id: string }>(
        `SELECT id FROM public.stores WHERE id = '${STORE_A}'::uuid;`
      );
      assert.equal(staffStoreRead.rows.length, 1);

      // Non-member USER_B cannot access STORE_A
      await asUser(db, USER_B, 'merchant_b@example.com', 'authenticated');
      const nonMemberRead = await db.query<{ id: string }>(
        `SELECT id FROM public.stores WHERE id = '${STORE_A}'::uuid;`
      );
      assert.equal(nonMemberRead.rows.length, 0);
    } finally {
      await db.close();
    }
  });

  // Test 5: Duplicate store prevention across concurrent calls, signup, onboarding, and settings
  await check('5. Duplicate store prevention enforces single-flight resolution across onboarding, settings, and signup', async () => {
    const appCtxSrc = fs.readFileSync(path.resolve('src/context/AppContext.tsx'), 'utf8');
    // Only StoreWorkspaceCoordinator constructor (deps.createStore) should reference createStoreInDb
    const directCreateMatches = appCtxSrc.match(/\bcreateStoreInDb\s*\(/g) || [];
    assert.equal(
      directCreateMatches.length,
      0,
      'AppContext.tsx must route all store creation through StoreWorkspaceCoordinator / resolveMerchantStoreForAction, never direct createStoreInDb() calls'
    );

    let createCount = 0;
    let storeInDb: Store | null = null;
    const coordinator = new StoreWorkspaceCoordinator({
      fetchStores: async () => ({ data: storeInDb ? [storeInDb] : [], error: null }),
      createStore: async (params) => {
        createCount += 1;
        await new Promise((r) => setTimeout(r, 20));
        storeInDb = makeStore(STORE_A, params.name, 'no-dup-store');
        return { data: storeInDb, error: null };
      },
    });

    const [r1, r2, r3] = await Promise.all([
      coordinator.initialize({ userId: USER_A, preferredName: 'Signup Brand' }),
      coordinator.initialize({ userId: USER_A, preferredName: 'Onboarding Brand' }),
      coordinator.initialize({ userId: USER_A, preferredName: 'Settings Brand' }),
    ]);

    assert.equal(createCount, 1);
    assert.equal(r1.storeId, STORE_A);
    assert.equal(r2.storeId, STORE_A);
    assert.equal(r3.storeId, STORE_A);
  });

  // Test 6: RLS error does NOT retry INSERT repeatedly and shows actionable error
  await check('6. RLS violation (42501) does not retry INSERT repeatedly and surfaces actionable error', async () => {
    assert.equal(
      isRlsPolicyError({ code: '42501', message: 'new row violates row-level security policy for table "stores"' }),
      true
    );
    assert.equal(isRlsPolicyError({ code: '23505', message: 'duplicate key value' }), false);

    let insertAttempts = 0;
    const coordinator = new StoreWorkspaceCoordinator({
      fetchStores: async () => ({ data: [], error: null }),
      createStore: async () => {
        insertAttempts += 1;
        return {
          data: null,
          error: new Error(
            'Store creation was rejected by database row-level security (42501): new row violates row-level security policy for table "stores"'
          ),
        };
      },
    });

    const first = await coordinator.initialize({ userId: USER_A, userName: 'Merchant A' });
    assert.equal(first.status, 'error');
    assert.equal(first.reason, 'error');
    assert.match(first.error || '', /42501|row-level security/i);
    assert.equal(insertAttempts, 1);

    // Subsequent implicit call without forceRefresh must NOT spam another INSERT
    const second = await coordinator.initialize({ userId: USER_A, userName: 'Merchant A' });
    assert.equal(second.status, 'error');
    assert.equal(insertAttempts, 1, 'Coordinator must not repeatedly retry INSERT after 42501 RLS failure');
    assert.equal(coordinator.getSnapshot().isInitializing, false);
  });

  // Test 7: Session refresh before store creation
  await check('7. ensureActiveSupabaseSession refreshes expiring tokens and verifies access_token before store operations', () => {
    const supabaseSrc = fs.readFileSync(path.resolve('src/lib/supabase.ts'), 'utf8');
    const fnStart = supabaseSrc.indexOf('export async function ensureActiveSupabaseSession');
    const fnEnd = supabaseSrc.indexOf('export async function verifyServicePricingViaServer');
    const fnBody = supabaseSrc.slice(fnStart, fnEnd);

    assert.ok(fnBody.includes('supabase.auth.refreshSession()'));
    assert.ok(fnBody.includes('supabase.auth.getUser()'));
    assert.ok(fnBody.includes('!session?.access_token'));
  });

  // Test 8: Cross-tenant isolation on stores & products
  await check('8. Cross-tenant isolation prevents User B from reading, updating, deleting, or injecting products into User A store', async () => {
    const db = await setupPre20261026Db();
    try {
      await asUser(db, USER_A, 'merchant_a@example.com', 'authenticated');
      await db.exec(
        `INSERT INTO public.stores (id, owner_id, name, slug) VALUES ('${STORE_A}', '${USER_A}', 'Tenant A Store', 'tenant-a');`
      );

      await asUser(db, USER_B, 'merchant_b@example.com', 'authenticated');
      await db.exec(
        `INSERT INTO public.stores (id, owner_id, name, slug) VALUES ('${STORE_B}', '${USER_B}', 'Tenant B Store', 'tenant-b');`
      );

      // User B cannot read User A's store
      const bReadsA = await db.query(`SELECT * FROM public.stores WHERE id = '${STORE_A}'::uuid;`);
      assert.equal(bReadsA.rows.length, 0);

      // User B cannot update User A's store
      const bUpdatesA = await db.query(
        `UPDATE public.stores SET name = 'Hijacked' WHERE id = '${STORE_A}'::uuid RETURNING id;`
      );
      assert.equal(bUpdatesA.rows.length, 0);

      // User B cannot delete User A's store
      const bDeletesA = await db.query(
        `DELETE FROM public.stores WHERE id = '${STORE_A}'::uuid RETURNING id;`
      );
      assert.equal(bDeletesA.rows.length, 0);

      // User B cannot insert a product into User A's store
      let crossTenantProductErr: unknown = null;
      try {
        await db.exec(
          `INSERT INTO public.products (store_id, name, sku, category, price, status)
           VALUES ('${STORE_A}', 'Stolen Product', 'SKU-999', 'General', 100, 'active');`
        );
      } catch (err) {
        crossTenantProductErr = err;
      }
      assert.ok(crossTenantProductErr, 'RLS must block cross-tenant product insertion into foreign store_id');
    } finally {
      await db.close();
    }
  });

  // Test 9: Google OAuth -> onboarding / dashboard initialization
  await check('9. Google OAuth callback redirects to /onboarding or /dashboard and initializes store cleanly', async () => {
    const callbackSrc = fs.readFileSync(path.resolve('src/pages/auth/AuthCallbackPage.tsx'), 'utf8');
    assert.ok(callbackSrc.includes("navigate('/dashboard', { replace: true })"));
    assert.ok(callbackSrc.includes("navigate('/onboarding', { replace: true })"));

    const coordinator = new StoreWorkspaceCoordinator({
      fetchStores: async () => ({ data: [], error: null }),
      createStore: async (params) => ({
        data: makeStore(STORE_A, params.name, 'google-oauth-store'),
        error: null,
      }),
    });

    const oauthResolution = await coordinator.initialize({
      userId: USER_A,
      userName: 'OAuth Merchant',
      userRole: 'merchant',
      isAdminRoute: false,
      allowAutoProvision: true,
    });

    assert.equal(oauthResolution.status, 'ready');
    assert.equal(oauthResolution.storeId, STORE_A);
  });

  // Test 10: Product upload after store workspace initialization under Production RLS
  await check('10. Product upload succeeds into newly created store under Production pre-20261026 RLS policies', async () => {
    const db = await setupPre20261026Db();
    try {
      await asUser(db, USER_A, 'merchant_a@example.com', 'authenticated');

      // Step 1: Create store via fixed two-step INSERT -> SELECT
      await db.exec(
        `INSERT INTO public.stores (owner_id, name, slug, category, currency)
         VALUES ('${USER_A}', 'Product Upload Store', 'product-upload-store', 'Electronics', '৳');`
      );
      const storeQuery = await db.query<{ id: string }>(
        `SELECT id FROM public.stores WHERE owner_id = '${USER_A}' AND slug = 'product-upload-store' LIMIT 1;`
      );
      assert.equal(storeQuery.rows.length, 1);
      const resolvedStoreId = storeQuery.rows[0].id;

      // Step 2: Coordinator selects resolvedStoreId
      const targetStoreId = resolveTargetStoreIdForProduct({
        linkedWebsiteStoreId: undefined,
        availableStores: [makeStore(resolvedStoreId, 'Product Upload Store', 'product-upload-store')],
        resolvedStoreId,
      });
      assert.equal(targetStoreId, resolvedStoreId);

      // Step 3: Insert product (RETURNING * works on products because can_manage_store checks parent public.stores row)
      const insertedProd = await db.query<{ id: string; store_id: string; name: string }>(
        `INSERT INTO public.products (store_id, name, sku, category, price, cost_price, stock, low_stock_threshold, status)
         VALUES ('${targetStoreId}', 'Wireless Earbuds Pro', 'SKU-WLP-01', 'Electronics', 2490, 1400, 25, 5, 'active')
         RETURNING id, store_id, name;`
      );
      assert.equal(insertedProd.rows.length, 1);
      assert.equal(insertedProd.rows[0].store_id, resolvedStoreId);
      assert.equal(insertedProd.rows[0].name, 'Wireless Earbuds Pro');
    } finally {
      await db.close();
    }
  });

  console.log(`\nALL ${passed}/${totalChecks} STORES RLS INSERT & WORKSPACE REGRESSION TESTS PASSED.`);
}

runTests().catch((err) => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});

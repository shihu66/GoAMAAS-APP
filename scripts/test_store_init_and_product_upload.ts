import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  StoreWorkspaceCoordinator,
  resolveTargetStoreIdForProduct,
  selectPreferredActiveStoreId,
} from '../src/lib/storeWorkspace';
import type { Store } from '../src/types';

function makeStore(id: string, name: string, slug = 'store-slug'): Store {
  return {
    id,
    name,
    slug,
    category: 'Fashion & Apparel',
    currency: '৳',
    phone: '01700000000',
    address: 'Dhaka',
    createdAt: '2026-11-01',
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  let passed = 0;
  const check = async (name: string, fn: () => Promise<void> | void) => {
    await fn();
    passed += 1;
    console.log(`PASS [${passed}]: ${name}`);
  };

  const USER_A = '11111111-1111-4111-8111-111111111111';
  const USER_B = '22222222-2222-4222-8222-222222222222';
  const STORE_A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const STORE_A2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  const STORE_B1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  const ORPHAN_STORE = '99999999-9999-4999-8999-999999999999';

  // 1. Merchant with one existing store
  await check('1. Merchant with one existing store resolves cleanly without duplicate store creation', async () => {
    let fetchCalls = 0;
    let createCalls = 0;
    const store1 = makeStore(STORE_A1, 'Aarong Heritage');

    const coordinator = new StoreWorkspaceCoordinator({
      fetchStores: async () => {
        fetchCalls += 1;
        return { data: [store1], error: null };
      },
      createStore: async () => {
        createCalls += 1;
        return { data: null, error: new Error('Should not create store') };
      },
    });

    const res = await coordinator.initialize({ userId: USER_A, userName: 'Ayesha' });
    assert.equal(res.status, 'ready');
    assert.equal(res.storeId, STORE_A1);
    assert.equal(res.stores.length, 1);
    assert.equal(fetchCalls, 1);
    assert.equal(createCalls, 0);
    assert.equal(coordinator.getSnapshot().isInitializing, false);
    assert.equal(coordinator.getSnapshot().error, null);
  });

  // 2. Merchant with multiple stores
  await check('2. Merchant with multiple stores selects preferred store and validates website target store', async () => {
    const store1 = makeStore(STORE_A1, 'Main Clothing Store', 'main-clothing');
    const store2 = makeStore(STORE_A2, 'Luxury Bags Store', 'luxury-bags');

    const coordinator = new StoreWorkspaceCoordinator({
      fetchStores: async () => ({ data: [store1, store2], error: null }),
      createStore: async () => ({ data: null, error: null }),
    });

    const res = await coordinator.initialize({
      userId: USER_A,
      profileStoreId: STORE_A2,
    });
    assert.equal(res.status, 'ready');
    assert.equal(res.storeId, STORE_A2);
    assert.equal(res.stores.length, 2);

    // Product linked to website on STORE_A1 uses STORE_A1 cleanly
    const targetForSite1 = resolveTargetStoreIdForProduct({
      linkedWebsiteStoreId: STORE_A1,
      availableStores: res.stores,
      resolvedStoreId: res.storeId,
    });
    assert.equal(targetForSite1, STORE_A1);

    // Selecting preferred store deterministically prioritizes user selection > current > profile > website > first
    assert.equal(
      selectPreferredActiveStoreId({
        stores: [store1, store2],
        userSelectedStoreId: STORE_A1,
        profileStoreId: STORE_A2,
      }),
      STORE_A1
    );
  });

  // 3. Store initialization after Google login (source check + OAuth provisioning flow)
  await check('3. Store initialization after Google login provisions store cleanly without /auth/callback lockout', async () => {
    const appCtxSource = fs.readFileSync(
      path.resolve('src/context/AppContext.tsx'),
      'utf8'
    );
    const storeInitStart = appCtxSource.indexOf('const resolveMerchantStoreForAction');
    const storeInitEnd = appCtxSource.indexOf('const retryStoreInitialization');
    const storeInitSection = appCtxSource.slice(storeInitStart, storeInitEnd);
    // Ensure /auth/callback no longer permanently suppresses store creation for merchant OAuth users
    assert.equal(
      storeInitSection.includes("window.location.pathname === '/auth/callback'"),
      false,
      'AppContext store initialization should not block initialization after Google OAuth callback'
    );

    let linkedUid = '';
    let linkedSid = '';
    const coordinator = new StoreWorkspaceCoordinator({
      fetchStores: async () => ({ data: [], error: null }),
      createStore: async (params) => ({
        data: makeStore(STORE_A1, params.name),
        error: null,
      }),
      linkUserProfileStore: async (uid, sid) => {
        linkedUid = uid;
        linkedSid = sid;
      },
    });

    const res = await coordinator.initialize({
      userId: USER_A,
      userName: 'Tariq Google',
      userRole: 'merchant',
      isAdminRoute: false,
      allowAutoProvision: true,
    });
    await delay(10);

    assert.equal(res.status, 'ready');
    assert.equal(res.storeId, STORE_A1);
    assert.equal(linkedUid, USER_A);
    assert.equal(linkedSid, STORE_A1);
  });

  // 4. Product upload immediately after dashboard loading (single-flight deduplication)
  await check('4. Product upload immediately after dashboard loading joins single-flight initialization without race', async () => {
    let fetchCalls = 0;
    let createCalls = 0;
    const store1 = makeStore(STORE_A1, 'Instant Store');

    const coordinator = new StoreWorkspaceCoordinator({
      fetchStores: async () => {
        fetchCalls += 1;
        await delay(30);
        return { data: [], error: null };
      },
      createStore: async (params) => {
        createCalls += 1;
        await delay(20);
        return { data: makeStore(STORE_A1, params.name), error: null };
      },
    });

    // Simulate dashboard mount effect + immediate Add Product click + Order click simultaneously
    const [mountRes, addProductRes, addOrderRes] = await Promise.all([
      coordinator.initialize({ userId: USER_A, userName: 'Nadia' }),
      coordinator.initialize({ userId: USER_A, userName: 'Nadia' }),
      coordinator.initialize({ userId: USER_A, userName: 'Nadia' }),
    ]);

    assert.equal(fetchCalls, 1, 'Concurrent callers must share a single fetchStores request');
    assert.equal(createCalls, 1, 'Concurrent callers must never double-provision stores');
    assert.equal(mountRes.storeId, STORE_A1);
    assert.equal(addProductRes.storeId, STORE_A1);
    assert.equal(addOrderRes.storeId, STORE_A1);
    assert.equal(coordinator.getSnapshot().isInitializing, false);
  });

  // 5. Slow Supabase response
  await check('5. Slow Supabase response resolves cleanly and resets loading flag', async () => {
    const store1 = makeStore(STORE_A1, 'Slow Network Store');
    const coordinator = new StoreWorkspaceCoordinator({
      fetchStores: async () => {
        await delay(60);
        return { data: [store1], error: null };
      },
      createStore: async () => ({ data: null, error: null }),
    });

    const pending = coordinator.initialize({ userId: USER_A });
    assert.equal(coordinator.getSnapshot().isInitializing, true);
    assert.equal(coordinator.getSnapshot().status, 'loading');

    const res = await pending;
    assert.equal(res.status, 'ready');
    assert.equal(res.storeId, STORE_A1);
    assert.equal(coordinator.getSnapshot().isInitializing, false);
    assert.equal(coordinator.getSnapshot().status, 'ready');
  });

  // 6. Failed store lookup with proper error recovery
  await check('6. Failed store lookup transitions to error state (not stuck loading) and recovers on retry', async () => {
    let attempt = 0;
    let createCalls = 0;
    const store1 = makeStore(STORE_A1, 'Recovered Store');

    const coordinator = new StoreWorkspaceCoordinator({
      fetchStores: async () => {
        attempt += 1;
        if (attempt === 1) {
          return { data: null, error: new Error('Database connection timeout') };
        }
        return { data: [store1], error: null };
      },
      createStore: async () => {
        createCalls += 1;
        return { data: makeStore(STORE_A2, 'Duplicate'), error: null };
      },
    });

    const firstAttempt = await coordinator.initialize({ userId: USER_A });
    assert.equal(firstAttempt.status, 'error');
    assert.equal(firstAttempt.reason, 'error');
    assert.match(firstAttempt.error || '', /timeout/i);
    assert.equal(createCalls, 0, 'Must NOT create duplicate store when fetchStores errored');
    assert.equal(coordinator.getSnapshot().isInitializing, false, 'Loading flag must reset on error');
    assert.equal(coordinator.getSnapshot().status, 'error');

    // Retry recovers cleanly
    const retryAttempt = await coordinator.initialize({ userId: USER_A, forceRefresh: true });
    assert.equal(retryAttempt.status, 'ready');
    assert.equal(retryAttempt.storeId, STORE_A1);
    assert.equal(coordinator.getSnapshot().isInitializing, false);
    assert.equal(coordinator.getSnapshot().error, null);
  });

  // 7. Switching active stores during initialization
  await check('7. Switching active stores while initialization is in-flight preserves user choice', async () => {
    const store1 = makeStore(STORE_A1, 'Store One');
    const store2 = makeStore(STORE_A2, 'Store Two');

    const coordinator = new StoreWorkspaceCoordinator({
      fetchStores: async () => {
        await delay(40);
        return { data: [store1, store2], error: null };
      },
      createStore: async () => ({ data: null, error: null }),
    });

    const initPromise = coordinator.initialize({ userId: USER_A, profileStoreId: STORE_A1 });
    await delay(10);
    coordinator.selectActiveStore(STORE_A2);

    const res = await initPromise;
    assert.equal(res.status, 'ready');
    assert.equal(res.storeId, STORE_A2, 'Slow initial fetch must not overwrite merchant active store selection');
    assert.equal(coordinator.getSnapshot().activeStoreId, STORE_A2);
  });

  // 8. Product upload after page refresh (session rehydration)
  await check('8. Product upload after page refresh rehydrates store and links target store_id accurately', async () => {
    const freshCoordinator = new StoreWorkspaceCoordinator({
      fetchStores: async () => {
        await delay(15);
        return { data: [makeStore(STORE_A1, 'Refreshed Store')], error: null };
      },
      createStore: async () => ({ data: null, error: null }),
    });

    // Simulate auth rehydration completing after page refresh
    freshCoordinator.syncUserSession(USER_A);
    const resolution = await freshCoordinator.initialize({
      userId: USER_A,
      profileStoreId: STORE_A1,
    });
    assert.equal(resolution.status, 'ready');
    assert.equal(resolution.storeId, STORE_A1);

    // Simulate product target store resolution
    const targetStoreId = resolveTargetStoreIdForProduct({
      linkedWebsiteStoreId: STORE_A1,
      availableStores: resolution.stores,
      resolvedStoreId: resolution.storeId,
    });
    assert.equal(targetStoreId, STORE_A1);
  });

  // 9. Product image upload & non-blocking storefront sync verification
  await check('9. Image upload uses active session owner folder and addProduct does not block on storefront sync failure', () => {
    const supabaseSource = fs.readFileSync(path.resolve('src/lib/supabase.ts'), 'utf8');
    const appCtxSource = fs.readFileSync(path.resolve('src/context/AppContext.tsx'), 'utf8');

    // Verify uploadWebsiteAssetToStorage uses ensureActiveSupabaseSession and owner-first folder path
    const uploadFnIdx = supabaseSource.indexOf('export async function uploadWebsiteAssetToStorage');
    const uploadFnEndIdx = supabaseSource.indexOf('export async function deleteWebsiteAssetFromStorage');
    const uploadFnBlock = supabaseSource.slice(uploadFnIdx, uploadFnEndIdx);
    assert.ok(
      uploadFnBlock.includes('ensureActiveSupabaseSession()'),
      'uploadWebsiteAssetToStorage must use ensureActiveSupabaseSession()'
    );
    assert.ok(
      uploadFnBlock.includes('`${ownerUid}/${cleanScope}/${folder}/'),
      'uploadWebsiteAssetToStorage must enforce ownerUid folder path for Storage RLS'
    );

    // Verify fetchUserStoresFromDb uses ensureActiveSupabaseSession and does NOT silently return [] on auth failure
    const fetchStoresIdx = supabaseSource.indexOf('export async function fetchUserStoresFromDb');
    const fetchStoresEndIdx = supabaseSource.indexOf('export async function createStoreInDb');
    const fetchStoresBlock = supabaseSource.slice(fetchStoresIdx, fetchStoresEndIdx);
    assert.ok(
      fetchStoresBlock.includes('ensureActiveSupabaseSession()'),
      'fetchUserStoresFromDb must use ensureActiveSupabaseSession()'
    );
    assert.ok(
      fetchStoresBlock.includes('data: null,') && fetchStoresBlock.includes('Unable to verify your login session'),
      'fetchUserStoresFromDb must report auth/session error instead of false empty store array'
    );

    // Verify addProduct isolates syncProductCatalogStateToWebsite in try/catch after creating DB product
    const addProductIdx = appCtxSource.indexOf('const addProduct = async');
    const updateProductIdx = appCtxSource.indexOf('const updateProduct = async');
    const addProductBlock = appCtxSource.slice(addProductIdx, updateProductIdx);
    assert.ok(
      addProductBlock.includes('setProducts((prev) => [enrichedProduct'),
      'addProduct must persist product into state immediately after createProductInDb succeeds'
    );
    assert.ok(
      addProductBlock.includes('try {') && addProductBlock.includes('syncProductCatalogStateToWebsite'),
      'addProduct must wrap storefront website sync in non-blocking try/catch'
    );
  });

  // 10. Multi-tenant isolation & stale session cancellation + DB immutability guard
  await check('10. Multi-tenant isolation discards stale session responses and ignores orphaned foreign website storeIds', async () => {
    const storeB = makeStore(STORE_B1, 'Tenant B Store');
    let tenantAResolved = false;

    const coordinator = new StoreWorkspaceCoordinator({
      fetchStores: async () => {
        if (!tenantAResolved) {
          await delay(40);
          tenantAResolved = true;
          return { data: [makeStore(STORE_A1, 'Tenant A Store')], error: null };
        }
        return { data: [storeB], error: null };
      },
      createStore: async () => ({ data: null, error: null }),
    });

    // Start slow init for Tenant A
    const tenantAPromise = coordinator.initialize({ userId: USER_A });
    await delay(10);

    // Switch session to Tenant B while Tenant A's fetch is still in flight
    coordinator.resetForUnauthenticated();
    coordinator.syncUserSession(USER_B);

    const staleRes = await tenantAPromise;
    assert.equal(staleRes.reason, 'stale', 'Stale Tenant A fetch must be discarded cleanly');
    assert.equal(coordinator.getSnapshot().activeStoreId, '', 'Tenant A store must not leak into Tenant B');

    const tenantBRes = await coordinator.initialize({ userId: USER_B });
    assert.equal(tenantBRes.status, 'ready');
    assert.equal(tenantBRes.storeId, STORE_B1);

    // Orphaned / cross-tenant website storeId cannot override Tenant B's valid store
    const safeStoreId = resolveTargetStoreIdForProduct({
      linkedWebsiteStoreId: ORPHAN_STORE,
      availableStores: tenantBRes.stores,
      resolvedStoreId: tenantBRes.storeId,
    });
    assert.equal(safeStoreId, STORE_B1);

    // Verify no service-role usage leaked into src/
    const srcFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) srcFiles.push(full);
      }
    };
    walk(path.resolve('src'));
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      assert.equal(
        content.includes('SERVICE_ROLE'),
        false,
        `Frontend file ${file} must never reference SERVICE_ROLE`
      );
    }
  });

  console.log(`\nALL ${passed} STORE WORKSPACE & PRODUCT UPLOAD REGRESSION TESTS PASSED.`);
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import customerPortalHandler from '../api/customer-portal';
import {
  clearMerchantOAuthIntentStorage,
  consumeMerchantOAuthIntent,
  getMainAppOrigin,
  isSafeInternalRedirectPath,
  isTenantSubdomainHost,
  setMerchantOAuthIntent,
} from '../src/lib/supabase';
import { StoreWorkspaceCoordinator } from '../src/lib/storeWorkspace';

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
}

function invokeHandler(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  opts: { method: string; url: string; headers?: Record<string, string>; body?: unknown }
): Promise<{ statusCode: number; headers: Record<string, string>; json: any }> {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter() as IncomingMessage & { body?: unknown };
    req.method = opts.method;
    req.url = opts.url;
    req.headers = opts.headers || {};
    if (opts.body !== undefined) {
      req.body = opts.body;
    }

    const resHeaders: Record<string, string> = {};
    let chunks: Buffer[] = [];
    const res = {
      statusCode: 200,
      setHeader(name: string, val: string) {
        resHeaders[name.toLowerCase()] = String(val);
      },
      end(data?: any) {
        if (data) {
          chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed: any = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = { raw };
        }
        resolve({ statusCode: res.statusCode, headers: resHeaders, json: parsed });
      },
    } as unknown as ServerResponse;

    handler(req, res).catch(reject);
  });
}

function testCustomerPortalUiRequirements(): void {
  const modalSource = readText('src/components/website/CustomerPortalModal.tsx');
  assert.ok(
    modalSource.includes('Ready to Start Your Own Business?'),
    'CustomerPortalModal must display the exact title "Ready to Start Your Own Business?"'
  );
  assert.ok(
    modalSource.includes(
      'Turn your business idea into reality. Create your own branded website and manage your business with GoAMAAS.'
    ),
    'CustomerPortalModal must display the exact required description'
  );
  assert.ok(
    modalSource.includes('Start Your Business'),
    'CustomerPortalModal must display the exact CTA "Start Your Business"'
  );
  assert.ok(
    modalSource.includes('onStartBusiness') && modalSource.includes('renderStartBusinessCard()'),
    'CustomerPortalModal must wire Start Your Business CTA to onStartBusiness'
  );

  const rendererSource = readText('src/components/website/WebsitePreviewRenderer.tsx');
  assert.ok(
    rendererSource.includes('onStartBusiness={onStartCustomerBusiness}'),
    'WebsitePreviewRenderer must forward onStartCustomerBusiness to CustomerPortalModal'
  );

  const publicPageSource = readText('src/pages/public/PublicTenantWebsitePage.tsx');
  assert.ok(
    publicPageSource.includes('transitionCustomerToMerchantOnboarding') &&
      publicPageSource.includes('onStartCustomerBusiness={handleStartBusinessFromCustomerPortal}'),
    'PublicTenantWebsitePage must invoke transitionCustomerToMerchantOnboarding when Start Your Business is clicked'
  );

  console.log('PASS [1/6]: Customer Portal Start Your Business UI copy & wiring verified');
}

async function testNoPrematureStoreProvisioningAndExplicitTransition(): Promise<void> {
  let fetchCalls = 0;
  let createCalls = 0;
  let linkCalls = 0;

  const coordinator = new StoreWorkspaceCoordinator({
    fetchStores: async () => {
      fetchCalls++;
      return { data: [], error: null };
    },
    createStore: async () => {
      createCalls++;
      return {
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Explicit Business Store',
          slug: 'explicit-business',
          category: 'Fashion',
          currency: '৳',
          phone: '',
          address: '',
          createdAt: '2026-11-18',
        },
        error: null,
      };
    },
    linkUserProfileStore: async () => {
      linkCalls++;
    },
  });

  // Scenario C & I: Transitioning to /onboarding loads existing stores read-only -> ZERO stores created!
  coordinator.syncUserSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const preOnboardingRes = await coordinator.initialize({
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userName: 'Tariq',
    userRole: 'merchant',
    isAdminRoute: false,
    allowAutoProvision: false,
  });

  assert.equal(fetchCalls, 1);
  assert.equal(createCalls, 0, 'Must NEVER auto-create a store on Customer -> Onboarding transition');
  assert.equal(linkCalls, 0);
  assert.equal(preOnboardingRes.status, 'missing');
  assert.equal(preOnboardingRes.stores.length, 0);

  // Scenario D: Explicit onboarding completion calls initialize({ allowAutoProvision: true }) -> creates 1 store
  const explicitCompleteRes = await coordinator.initialize({
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userName: 'Tariq',
    preferredName: 'Tariq Crafts',
    userRole: 'merchant',
    isAdminRoute: false,
    allowAutoProvision: true,
    forceRefresh: true,
  });

  assert.equal(createCalls, 1, 'Store must be created once onboarding explicitly completes');
  assert.equal(linkCalls, 1);
  assert.equal(explicitCompleteRes.status, 'ready');
  assert.equal(explicitCompleteRes.storeId, '11111111-1111-4111-8111-111111111111');

  // Verify AppContext guards match this invariant structurally
  const appCtx = readText('src/context/AppContext.tsx');
  assert.ok(
    appCtx.includes('isOnPreOnboardingOrAuthRoute') &&
      appCtx.includes("pathname === '/onboarding'") &&
      appCtx.includes('!isOnPreOnboardingOrAuthRoute'),
    'AppContext post-auth effect must disable allowAutoProvision on /onboarding and auth routes'
  );
  assert.ok(
    appCtx.includes('transitionCustomerToMerchantOnboarding') &&
      appCtx.includes('allowAutoProvision: false'),
    'transitionCustomerToMerchantOnboarding must check existing stores with allowAutoProvision: false'
  );

  console.log('PASS [2/6]: Zero premature store creation + single explicit onboarding store creation verified');
}

function testOriginAndOAuthRedirectHelpers(): void {
  const prevWindow = (globalThis as any).window;
  const mockStore = new Map<string, string>();
  const storageApi = {
    getItem: (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null),
    setItem: (k: string, v: string) => {
      mockStore.set(k, String(v));
    },
    removeItem: (k: string) => {
      mockStore.delete(k);
    },
  };

  try {
    // 1. Subdomain host on .amaas.xyz -> main origin must be https://amaas.xyz
    (globalThis as any).window = {
      location: { hostname: 'dhakakicks.amaas.xyz', protocol: 'https:', port: '', origin: 'https://dhakakicks.amaas.xyz', pathname: '/' },
      sessionStorage: storageApi,
      localStorage: storageApi,
    };
    assert.equal(isTenantSubdomainHost(), true);
    assert.equal(getMainAppOrigin(), 'https://amaas.xyz');

    // 2. Subdomain host on .localhost:3000 -> main origin must preserve port
    (globalThis as any).window = {
      location: { hostname: 'dhakakicks.localhost', protocol: 'http:', port: '3000', origin: 'http://dhakakicks.localhost:3000', pathname: '/' },
      sessionStorage: storageApi,
      localStorage: storageApi,
    };
    assert.equal(isTenantSubdomainHost(), true);
    assert.equal(getMainAppOrigin(), 'http://localhost:3000');

    // 3. Main origin app.amaas.xyz or amaas.xyz -> not a tenant subdomain
    (globalThis as any).window = {
      location: { hostname: 'app.amaas.xyz', protocol: 'https:', port: '', origin: 'https://app.amaas.xyz', pathname: '/onboarding' },
      sessionStorage: storageApi,
      localStorage: storageApi,
    };
    assert.equal(isTenantSubdomainHost(), false);
    assert.equal(getMainAppOrigin(), 'https://app.amaas.xyz');

    // 4. Safe internal redirect path & merchant OAuth intent round-trip
    assert.equal(isSafeInternalRedirectPath('/onboarding'), true);
    assert.equal(isSafeInternalRedirectPath('/dashboard'), true);
    assert.equal(isSafeInternalRedirectPath('//evil.com'), false);
    assert.equal(isSafeInternalRedirectPath('/admin'), false);
    assert.equal(isSafeInternalRedirectPath('/login'), false);

    clearMerchantOAuthIntentStorage();
    setMerchantOAuthIntent('/onboarding');
    assert.equal(consumeMerchantOAuthIntent(), '/onboarding');
    assert.equal(consumeMerchantOAuthIntent(), null);
  } finally {
    (globalThis as any).window = prevWindow;
  }

  const loginSrc = readText('src/pages/auth/LoginPage.tsx');
  assert.ok(
    loginSrc.includes('nextPath: redirectTarget'),
    'LoginPage must preserve redirect target when starting Google OAuth'
  );
  const callbackSrc = readText('src/pages/auth/AuthCallbackPage.tsx');
  assert.ok(
    callbackSrc.includes('consumeMerchantOAuthIntent()') &&
      callbackSrc.includes("merchantNextIntent !== '/onboarding' || !resolvedStoreId"),
    'AuthCallbackPage must consume merchantNextIntent and avoid duplicate onboarding loops'
  );

  console.log('PASS [3/6]: Subdomain origin handoff & OAuth redirect intent persistence verified');
}

async function testCustomerDataPreservedAfterMerchantConversion(): Promise<void> {
  const prevEnv = {
    url: process.env.VITE_SUPABASE_URL,
    anon: process.env.VITE_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const prevFetch = globalThis.fetch;

  const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const sellerStoreId = '11111111-1111-4111-8111-111111111111';
  const sellerWebsiteId = '22222222-2222-4222-8222-222222222222';
  const ownMerchantStoreId = '99999999-9999-4999-8999-999999999999';

  // User has BOTH merchant onboarding metadata AND existing customer portal metadata + carts!
  let updatedMetadataPayload: Record<string, any> | null = null;
  const userMetadata: Record<string, any> = {
    full_name: 'Nadia Merchant-Customer',
    onboarding_completed: true,
    store_id: ownMerchantStoreId,
    customer_portal_profile: {
      fullName: 'Nadia Rahman',
      phone: '01755667788',
      savedAddresses: [
        {
          id: 'addr-1',
          label: 'Home',
          recipientName: 'Nadia Rahman',
          phone: '01755667788',
          shippingAddress: 'House 22, Banani',
          city: 'Dhaka',
          isDefault: true,
        },
      ],
    },
    customer_store_carts: {
      sellerstore: {
        version: 1,
        updatedAt: '2026-11-18T00:00:00.000Z',
        items: [{ productId: 'prod-1', name: 'Silk Scarf', unitPrice: 950, quantity: 2 }],
      },
    },
  };

  process.env.VITE_SUPABASE_URL = 'https://mock.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key-mock';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-mock';

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(input);

    if (urlStr.endsWith('/auth/v1/user')) {
      return new Response(
        JSON.stringify({
          id: userId,
          email: 'nadia@gmail.com',
          user_metadata: userMetadata,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.includes(`/auth/v1/admin/users/${userId}`)) {
      if (init?.method === 'PUT') {
        updatedMetadataPayload = JSON.parse(String(init.body || '{}'));
        return new Response(
          JSON.stringify({
            id: userId,
            email: 'nadia@gmail.com',
            user_metadata: updatedMetadataPayload?.user_metadata,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          id: userId,
          email: 'nadia@gmail.com',
          user_metadata: userMetadata,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.includes('/rest/v1/subscribed_websites')) {
      return new Response(
        JSON.stringify([
          {
            id: sellerWebsiteId,
            store_id: sellerStoreId,
            user_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            subdomain: 'sellerstore',
            business_name: 'Seller Couture',
            status: 'active',
            payment_status: 'paid',
            deployment_status: 'live',
            current_period_end: new Date(Date.now() + 86400_000 * 30).toISOString(),
            config: {
              products: [
                {
                  id: 'prod-1',
                  productId: 'prod-1',
                  name: 'Silk Scarf',
                  priceNumeric: 950,
                  isVisible: true,
                  stock: 10,
                },
              ],
            },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.includes('/rest/v1/stores')) {
      return new Response(
        JSON.stringify([
          {
            id: sellerStoreId,
            owner_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            name: 'Seller Couture',
            phone: '01700001122',
            address: 'Banani, Dhaka',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.includes('/rest/v1/products')) {
      return new Response(
        JSON.stringify([
          { id: 'prod-1', name: 'Silk Scarf', price: 950, stock: 10, status: 'active' },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.includes('/rest/v1/orders')) {
      return new Response(
        JSON.stringify([
          {
            id: 'ord-cust-1',
            store_id: sellerStoreId,
            order_number: 'ORD-1001',
            customer_name: 'Nadia Rahman',
            customer_email: 'nadia@gmail.com',
            customer_phone: '01755667788',
            subtotal: 1900,
            delivery_charge: 60,
            total: 1960,
            status: 'confirmed',
            payment_status: 'pending',
            payment_method: 'Cash on Delivery (COD)',
            address: 'House 22, Banani',
            city: 'Dhaka',
            created_at: '2026-11-18T00:00:00.000Z',
            items: [
              {
                productId: 'prod-1',
                name: 'Silk Scarf',
                price: 950,
                quantity: 2,
                orderMeta: {
                  customerAuthUserId: userId,
                  websiteId: sellerWebsiteId,
                  websiteSubdomain: 'sellerstore',
                },
              },
            ],
          },
          {
            id: 'ord-other-cust',
            store_id: sellerStoreId,
            order_number: 'ORD-9999',
            customer_name: 'Stranger Customer',
            customer_email: 'stranger@gmail.com',
            customer_phone: '01900000000',
            subtotal: 500,
            delivery_charge: 60,
            total: 560,
            status: 'pending',
            items: [
              {
                productId: 'prod-1',
                name: 'Silk Scarf',
                price: 500,
                quantity: 1,
                orderMeta: {
                  customerAuthUserId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                  websiteId: sellerWebsiteId,
                  websiteSubdomain: 'sellerstore',
                },
              },
            ],
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    // 1. Orders remain accessible & strictly isolated to THIS user's customerAuthUserId (never leaking stranger's order)
    const ordersResp = await invokeHandler(customerPortalHandler, {
      method: 'GET',
      url: '/api/customer-portal?action=orders&subdomain=sellerstore',
      headers: { authorization: 'Bearer valid-mock-jwt-token-over-20-chars' },
    });
    assert.equal(ordersResp.statusCode, 200);
    assert.equal(ordersResp.json.orders.length, 1);
    assert.equal(ordersResp.json.orders[0].orderNumber, 'ORD-1001');

    // 2. Saved addresses & profile intact after merchant onboarding metadata was added
    const profResp = await invokeHandler(customerPortalHandler, {
      method: 'GET',
      url: '/api/customer-portal?action=profile&subdomain=sellerstore',
      headers: { authorization: 'Bearer valid-mock-jwt-token-over-20-chars' },
    });
    assert.equal(profResp.statusCode, 200);
    assert.equal(profResp.json.profile.savedAddresses.length, 1);
    assert.equal(profResp.json.profile.savedAddresses[0].shippingAddress, 'House 22, Banani');

    // 3. Updating customer profile preserves onboarding_completed & store_id in user_metadata!
    const patchResp = await invokeHandler(customerPortalHandler, {
      method: 'PATCH',
      url: '/api/customer-portal?action=profile&subdomain=sellerstore',
      headers: { authorization: 'Bearer valid-mock-jwt-token-over-20-chars' },
      body: { subdomain: 'sellerstore', phone: '01755667799' },
    });
    assert.equal(patchResp.statusCode, 200);
    const savedMetaEnvelope = updatedMetadataPayload as { user_metadata?: Record<string, any> } | null;
    assert.ok(savedMetaEnvelope?.user_metadata);
    assert.equal(savedMetaEnvelope.user_metadata.onboarding_completed, true);
    assert.equal(savedMetaEnvelope.user_metadata.store_id, ownMerchantStoreId);
    assert.ok(savedMetaEnvelope.user_metadata.customer_store_carts.sellerstore);
  } finally {
    globalThis.fetch = prevFetch;
    process.env.VITE_SUPABASE_URL = prevEnv.url;
    process.env.VITE_SUPABASE_ANON_KEY = prevEnv.anon;
    process.env.SUPABASE_SERVICE_ROLE_KEY = prevEnv.service;
  }

  console.log('PASS [4/6]: Customer orders, saved addresses, carts & merchant metadata coexist cleanly without cross-customer leaks');
}

function testSessionIsolationAndRefreshSafety(): void {
  const protectedSrc = readText('src/components/auth/ProtectedRoute.tsx');
  assert.ok(
    protectedSrc.includes('if (isCustomerSessionOnly)') &&
      protectedSrc.includes("location.pathname === '/onboarding'") &&
      protectedSrc.includes("get('from') === 'customer_portal'"),
    'ProtectedRoute must block customer sessions from /dashboard while permitting explicit /onboarding?from=customer_portal handoff'
  );

  const appCtx = readText('src/context/AppContext.tsx');
  // Merchant browsing storefront without customer-only lock must retain merchant scope so returning to /dashboard works cleanly
  assert.ok(
    appCtx.includes(
      'overrideScope === undefined && isCustomerPortalSessionActive(userId)'
    ),
    'buildUserFromSession must derive customer-only lock strictly from overrideScope or isCustomerPortalSessionActive(userId)'
  );
  // clearAuthenticatedSessionState resets onboarding state on logout
  assert.ok(
    appCtx.includes('setOnboarding(INITIAL_ONBOARDING)') &&
      appCtx.includes("localStorage.removeItem('goamaas_onboarding')"),
    'Logout / session clear must reset onboarding state to prevent stale leakage across accounts'
  );

  const dashLayout = readText('src/components/layout/DashboardLayout.tsx');
  assert.ok(
    dashLayout.includes('hydrateMerchantWorkspace'),
    'DashboardLayout must hydrate merchant stores/websites on entry after storefront browsing'
  );

  console.log('PASS [5/6]: Session isolation, logout hygiene, and storefront <-> dashboard coexistence verified');
}

function testNoDatabaseOrServiceKeyRegression(): void {
  const srcFiles = [
    'src/lib/supabase.ts',
    'src/context/AppContext.tsx',
    'src/components/website/CustomerPortalModal.tsx',
    'src/components/website/WebsitePreviewRenderer.tsx',
    'src/pages/public/PublicTenantWebsitePage.tsx',
    'src/pages/onboarding/OnboardingFlow.tsx',
    'src/components/onboarding/GuidedWebsiteWizard.tsx',
    'src/components/auth/ProtectedRoute.tsx',
    'src/pages/auth/LoginPage.tsx',
    'src/pages/auth/AuthCallbackPage.tsx',
  ];

  for (const rel of srcFiles) {
    const content = readText(rel);
    assert.ok(
      !content.includes('SUPABASE_SERVICE_ROLE_KEY'),
      `Client file ${rel} must NEVER reference SUPABASE_SERVICE_ROLE_KEY`
    );
  }

  console.log('PASS [6/6]: Zero service role key exposure in frontend modules verified');
}

async function main(): Promise<void> {
  testCustomerPortalUiRequirements();
  await testNoPrematureStoreProvisioningAndExplicitTransition();
  testOriginAndOAuthRedirectHelpers();
  await testCustomerDataPreservedAfterMerchantConversion();
  testSessionIsolationAndRefreshSafety();
  testNoDatabaseOrServiceKeyRegression();
  console.log('\nALL CUSTOMER-TO-MERCHANT CONVERSION CHECKS PASSED (6/6).');
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});

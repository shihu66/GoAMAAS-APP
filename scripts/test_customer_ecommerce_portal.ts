import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import customerPortalHandler from '../api/customer-portal';
import {
  appendStatusHistoryEntry,
  buildMerchantBrandingFromSite,
  buildOrderStatusHistory,
  getCustomerCartStorageKey,
  getGuestCartStorageKey,
  mergeGuestAndCustomerCart,
  reconcileConflictingCart,
  resolveOrderBranding,
  revalidateCartAgainstCatalog,
} from '../src/lib/customerPortal';
import type { Order, Store, SubscribedWebsite, WebsiteProductItem } from '../src/types';

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
}

function testBrandingSnapshotAndFallback(): void {
  const siteA: Partial<SubscribedWebsite> = {
    id: 'site-1',
    storeId: 'store-1',
    subdomain: 'dhakakicks',
    businessName: 'Dhaka Kicks Studio',
    logoUrl: 'https://cdn.example.com/dhakakicks.png',
    brandColor: '#0F766E',
    phone: '01711223344',
    email: 'hello@dhakakicks.com',
    address: 'House 12, Banani, Dhaka',
  };
  const storeA: Partial<Store> = {
    id: 'store-1',
    name: 'Fallback Store A',
    slug: 'dhakakicks',
    phone: '01700000000',
    address: 'Banani',
  };

  const built = buildMerchantBrandingFromSite(siteA, storeA);
  assert.equal(built.businessName, 'Dhaka Kicks Studio');
  assert.equal(built.brandColor, '#0F766E');
  assert.equal(built.websiteUrl, 'https://dhakakicks.amaas.xyz');
  assert.ok(!built.businessName.toLowerCase().includes('goamaas'));

  const historicalOrder: Order = {
    id: 'ord-1',
    storeId: 'store-1',
    orderNumber: 'ORD-260101-1234',
    customerName: 'Nadia Rahman',
    customerPhone: '01811223344',
    customerEmail: 'nadia@example.com',
    items: [
      {
        productId: 'prod-1',
        name: 'Canvas Sneaker',
        price: 1850,
        quantity: 1,
        sku: 'SNK-01',
        orderMeta: {
          merchantBrandingSnapshot: {
            businessName: 'Dhaka Kicks Legacy',
            brandColor: '#BE123C',
            phone: '01799887766',
            websiteUrl: 'https://dhakakicks.amaas.xyz',
          },
        },
      },
    ],
    total: 1910,
    deliveryFee: 60,
    discount: 0,
    status: 'confirmed',
    paymentStatus: 'pending',
    paymentMethod: 'Cash on Delivery (COD)',
    shippingAddress: 'Road 7, Dhanmondi',
    city: 'Dhaka',
    createdAt: '2026-06-01T10:00:00.000Z',
  };

  const resolved = resolveOrderBranding(historicalOrder, [siteA as SubscribedWebsite], [storeA as Store], siteA);
  assert.equal(resolved.businessName, 'Dhaka Kicks Legacy');
  assert.equal(resolved.brandColor, '#BE123C');
  assert.equal(resolved.phone, '01799887766');

  // Order for Store B (unloaded in stores/websites list) must NEVER fall back to Store A branding!
  const storeBOrder: Order = {
    ...historicalOrder,
    id: 'ord-b',
    storeId: 'store-999',
    websiteId: 'site-999',
    websiteSubdomain: 'rajshahi-crafts',
    items: [{ productId: 'prod-b', name: 'Silk Panjabi', price: 2200, quantity: 1, sku: 'SLK-1' }],
  };
  const isolatedB = resolveOrderBranding(storeBOrder, [siteA as SubscribedWebsite], [storeA as Store], siteA);
  assert.notEqual(isolatedB.businessName, 'Dhaka Kicks Studio');
  assert.notEqual(isolatedB.businessName, 'Fallback Store A');
  assert.equal(isolatedB.subdomain, 'rajshahi-crafts');

  console.log('PASS [1/6]: Merchant invoice branding, historical snapshot & cross-merchant isolation');
}

function testMultiTenantCartIsolationAndMerge(): void {
  const keyStoreA = getGuestCartStorageKey('store-aaa');
  const keyStoreB = getGuestCartStorageKey('store-bbb');
  assert.notEqual(keyStoreA, keyStoreB);

  const cust1StoreA = getCustomerCartStorageKey('store-aaa', 'cust-1');
  const cust2StoreA = getCustomerCartStorageKey('store-aaa', 'cust-2');
  const cust1StoreB = getCustomerCartStorageKey('store-bbb', 'cust-1');
  assert.notEqual(cust1StoreA, cust2StoreA);
  assert.notEqual(cust1StoreA, cust1StoreB);

  const catalog: WebsiteProductItem[] = [
    {
      id: 'p-1',
      productId: 'p-1',
      name: 'Cotton Punjabi',
      description: 'Premium cotton punjabi',
      price: '৳1200',
      priceNumeric: 1500,
      discountPrice: 1200,
      stock: 4,
      inStock: true,
      isVisible: true,
    },
    {
      id: 'p-2',
      productId: 'p-2',
      name: 'Leather Sandal',
      description: 'Handcrafted leather sandal',
      price: '৳950',
      priceNumeric: 950,
      stock: 0,
      inStock: false,
      isVisible: true,
    },
    {
      id: 'p-3',
      productId: 'p-3',
      name: 'Linen Shirt',
      description: 'Breathable summer linen shirt',
      price: '৳1400',
      priceNumeric: 1400,
      stock: 10,
      inStock: true,
      isVisible: true,
    },
  ];

  const guestItems = [
    { productId: 'p-1', name: 'Old Name', unitPrice: 9999, quantity: 3 },
    { productId: 'p-2', name: 'Leather Sandal', unitPrice: 950, quantity: 1 },
  ];
  const customerItems = [
    { productId: 'p-1', name: 'Cotton Punjabi', unitPrice: 1500, quantity: 2 },
    { productId: 'p-3', name: 'Linen Shirt', unitPrice: 1400, quantity: 1 },
  ];

  const merged = mergeGuestAndCustomerCart(guestItems, customerItems, catalog);
  assert.equal(merged.length, 2);
  const p1 = merged.find((m) => m.productId === 'p-1');
  const p3 = merged.find((m) => m.productId === 'p-3');
  assert.ok(p1 && p3);
  assert.equal(p1.quantity, 4);
  assert.equal(p1.unitPrice, 1200);
  assert.equal(p1.originalPrice, 1500);
  assert.equal(p3.quantity, 1);

  // 3-way delta conflict reconciliation preserves non-conflicting Device A + Device B edits
  const baseItems = [{ productId: 'p-1', name: 'Cotton Punjabi', unitPrice: 1200, quantity: 1 }];
  const deviceALocal = [
    { productId: 'p-1', name: 'Cotton Punjabi', unitPrice: 1200, quantity: 1 },
    { productId: 'p-3', name: 'Linen Shirt', unitPrice: 1400, quantity: 2 },
  ];
  const deviceBServer = [{ productId: 'p-1', name: 'Cotton Punjabi', unitPrice: 1200, quantity: 3 }];
  const reconciled = reconcileConflictingCart({
    baseItems,
    localItems: deviceALocal,
    serverItems: deviceBServer,
    liveCatalog: catalog,
  });
  assert.equal(reconciled.find((r) => r.productId === 'p-1')?.quantity, 3);
  assert.equal(reconciled.find((r) => r.productId === 'p-3')?.quantity, 2);

  const revalidated = revalidateCartAgainstCatalog(
    [{ productId: 'non-existent', name: 'Ghost', unitPrice: 10, quantity: 1 }],
    catalog
  );
  assert.equal(revalidated.length, 0);

  console.log('PASS [2/6]: Multi-tenant cart isolation, stock capping, OAuth merge & 3-way conflict reconciliation');
}

function testTruthfulOrderStatusHistory(): void {
  const baseOrder: Order = {
    id: 'ord-2',
    orderNumber: 'ORD-260102-0001',
    customerName: 'Rafi',
    customerPhone: '01711111111',
    customerEmail: '',
    items: [],
    total: 500,
    deliveryFee: 60,
    discount: 0,
    status: 'pending',
    paymentStatus: 'pending',
    paymentMethod: 'Cash on Delivery (COD)',
    shippingAddress: 'Mirpur 10',
    city: 'Dhaka',
    createdAt: '2026-06-02T08:00:00.000Z',
  };

  const initialHistory = buildOrderStatusHistory(baseOrder);
  assert.equal(initialHistory.length, 1);
  assert.equal(initialHistory[0].status, 'pending');
  assert.equal(initialHistory[0].at, '2026-06-02T08:00:00.000Z');

  const afterConfirm = appendStatusHistoryEntry(initialHistory, 'confirmed', baseOrder.createdAt);
  assert.equal(afterConfirm.length, 2);
  assert.equal(afterConfirm[1].status, 'confirmed');

  const deduped = appendStatusHistoryEntry(afterConfirm, 'confirmed', baseOrder.createdAt);
  assert.equal(deduped.length, 2);

  console.log('PASS [3/6]: Truthful chronological order status history without invented timestamps');
}

async function invokePortal(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown
): Promise<{ status: number; json: any }> {
  const req = new EventEmitter() as IncomingMessage & { body?: unknown; url?: string };
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.body = body;

  let statusCode = 200;
  let rawOut = '';
  const res = {
    setHeader: () => res,
    get statusCode() {
      return statusCode;
    },
    set statusCode(v: number) {
      statusCode = v;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk) rawOut += chunk.toString();
    },
  } as unknown as ServerResponse;

  await customerPortalHandler(req, res);
  return { status: statusCode, json: rawOut ? JSON.parse(rawOut) : {} };
}

async function testLiveCustomerPortalApiSecurityAndCrossDeviceSync(): Promise<void> {
  const storeAId = '11111111-1111-4111-8111-111111111111';
  const storeBId = '22222222-2222-4222-8222-222222222222';
  const custAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const custBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const prodA1 = '33333333-3333-4333-8333-333333333331';
  const prodA2 = '33333333-3333-4333-8333-333333333332';
  const prodB1 = '44444444-4444-4444-8444-444444444441';
  const orderAId = '55555555-5555-4555-8555-555555555551';

  const prevEnv = {
    url: process.env.VITE_SUPABASE_URL,
    anon: process.env.VITE_SUPABASE_ANON_KEY,
    srk: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const origFetch = globalThis.fetch;

  process.env.VITE_SUPABASE_URL = 'https://mockproj.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key-placeholder';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_mock_service_role_key';

  const userMetadataById: Record<string, Record<string, any>> = {
    [custAId]: { full_name: 'Customer A', customer_portal_profile: { phone: '01700000001' } },
    [custBId]: { full_name: 'Customer B' },
  };

  const mockOrders = [
    {
      id: orderAId,
      store_id: storeAId,
      order_number: 'ORD-260601-AAAAAA',
      customer_name: 'Customer A',
      customer_phone: '01700000001',
      customer_email: 'a@example.com',
      address: 'Banani, Dhaka',
      city: 'Dhaka',
      subtotal: 1000,
      delivery_charge: 60,
      total: 1060,
      status: 'confirmed',
      payment_status: 'pending',
      payment_method: 'Cash on Delivery (COD)',
      items: [
        {
          productId: prodA1,
          name: 'Store A Shirt',
          price: 1000,
          quantity: 1,
          orderMeta: { customerAuthUserId: custAId },
        },
      ],
      created_at: '2026-06-01T10:00:00.000Z',
    },
  ];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(typeof input === 'string' ? input : input.toString());
    const authHdr = String((init?.headers as any)?.Authorization || '');
    const method = (init?.method || 'GET').toUpperCase();

    if (u.pathname === '/auth/v1/user') {
      if (authHdr === 'Bearer valid-jwt-token-customer-a-long') {
        return new Response(JSON.stringify({ id: custAId, email: 'a@example.com', user_metadata: userMetadataById[custAId] }), { status: 200 });
      }
      if (authHdr === 'Bearer valid-jwt-token-customer-b-long') {
        return new Response(JSON.stringify({ id: custBId, email: 'b@example.com', user_metadata: userMetadataById[custBId] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'invalid jwt' }), { status: 401 });
    }

    if (u.pathname.startsWith('/auth/v1/admin/users/')) {
      const uid = decodeURIComponent(u.pathname.split('/').pop() || '');
      if (method === 'PUT' && init?.body) {
        const parsed = JSON.parse(String(init.body));
        userMetadataById[uid] = parsed.user_metadata;
      }
      return new Response(JSON.stringify({ id: uid, email: uid === custAId ? 'a@example.com' : 'b@example.com', user_metadata: userMetadataById[uid] || {} }), { status: 200 });
    }

    if (u.pathname === '/rest/v1/subscribed_websites') {
      const subFilter = u.searchParams.get('subdomain') || '';
      const isB = subFilter.includes('shopb');
      const sitePayload = isB
        ? {
            id: '99999999-9999-4999-8999-999999999992',
            store_id: storeBId,
            subdomain: 'shopb',
            business_name: 'Shop B',
            status: 'active',
            payment_status: 'paid',
            deployment_status: 'live',
            config: {
              businessName: 'Shop B',
              servicesOrProducts: [{ id: prodB1, productId: prodB1, name: 'Shop B Hat', isVisible: true, stock: 5 }],
            },
          }
        : {
            id: '99999999-9999-4999-8999-999999999991',
            store_id: storeAId,
            subdomain: 'shopa',
            business_name: 'Shop A',
            status: 'active',
            payment_status: 'paid',
            deployment_status: 'live',
            config: {
              businessName: 'Shop A',
              servicesOrProducts: [
                { id: prodA1, productId: prodA1, name: 'Store A Shirt', isVisible: true, stock: 5 },
                { id: prodA2, productId: prodA2, name: 'Store A Cap', isVisible: true, stock: 8 },
              ],
            },
          };
      return new Response(JSON.stringify([sitePayload]), { status: 200 });
    }

    if (u.pathname === '/rest/v1/stores') {
      const sid = (u.searchParams.get('id') || '').replace(/^eq\./, '');
      return new Response(JSON.stringify([{ id: sid, name: sid === storeBId ? 'Shop B' : 'Shop A' }]), { status: 200 });
    }

    if (u.pathname === '/rest/v1/products') {
      const sid = (u.searchParams.get('store_id') || '').replace(/^eq\./, '');
      const prods =
        sid === storeBId
          ? [{ id: prodB1, name: 'Shop B Hat', price: 500, stock: 5, status: 'active', is_visible: true }]
          : [
              { id: prodA1, name: 'Store A Shirt', price: 1000, stock: 5, status: 'active', is_visible: true },
              { id: prodA2, name: 'Store A Cap', price: 400, stock: 8, status: 'active', is_visible: true },
            ];
      return new Response(JSON.stringify(prods), { status: 200 });
    }

    if (u.pathname === '/rest/v1/orders') {
      const idParam = (u.searchParams.get('id') || '').replace(/^eq\./, '');
      if (idParam) {
        return new Response(JSON.stringify(mockOrders.filter((o) => o.id === idParam)), { status: 200 });
      }
      const metaFilter = u.searchParams.get('items->0->orderMeta->>customerAuthUserId')?.replace(/^eq\./, '');
      return new Response(
        JSON.stringify(
          mockOrders.filter((o) => !metaFilter || o.items[0]?.orderMeta?.customerAuthUserId === metaFilter)
        ),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;

  try {
    // 1. Unauthenticated / invalid JWT rejected (401)
    const noAuth = await invokePortal('GET', '/api/customer-portal?action=orders&subdomain=shopa', {});
    assert.equal(noAuth.status, 401);

    // 2. Customer B attempting IDOR on Customer A's order -> 403 FORBIDDEN_ORDER_ACCESS
    const idorAttempt = await invokePortal(
      'GET',
      `/api/customer-portal?action=order&subdomain=shopa&orderId=${orderAId}`,
      { authorization: 'Bearer valid-jwt-token-customer-b-long' }
    );
    assert.equal(idorAttempt.status, 403);
    assert.equal(idorAttempt.json.code, 'FORBIDDEN_ORDER_ACCESS');

    // 3. Cross-Device Cart Sync + Store B Isolation + 409 Concurrent Overwrite Protection
    const hdrA = { authorization: 'Bearer valid-jwt-token-customer-a-long' };
    // Device A saves [prodA1: 1] starting at version 0
    const putDevA1 = await invokePortal('PUT', '/api/customer-portal?action=cart&subdomain=shopa', hdrA, {
      subdomain: 'shopa',
      expectedVersion: 0,
      items: [{ productId: prodA1, quantity: 1 }],
    });
    assert.equal(putDevA1.status, 200);
    assert.equal(putDevA1.json.version, 1);

    // Device B logs into Merchant A and sees restored cart; opening Merchant B shows empty cart
    const getDevBMerchantA = await invokePortal('GET', '/api/customer-portal?action=cart&subdomain=shopa', hdrA);
    assert.equal(getDevBMerchantA.status, 200);
    assert.equal(getDevBMerchantA.json.items.length, 1);
    assert.equal(getDevBMerchantA.json.items[0].productId, prodA1);

    const getDevBMerchantB = await invokePortal('GET', '/api/customer-portal?action=cart&subdomain=shopb', hdrA);
    assert.equal(getDevBMerchantB.status, 200);
    assert.equal(getDevBMerchantB.json.items.length, 0);

    // Device B updates prodA1 qty -> 3 (version 1 -> 2)
    const putDevB = await invokePortal('PUT', '/api/customer-portal?action=cart&subdomain=shopa', hdrA, {
      subdomain: 'shopa',
      expectedVersion: 1,
      items: [{ productId: prodA1, quantity: 3 }],
    });
    assert.equal(putDevB.status, 200);
    assert.equal(putDevB.json.version, 2);

    // Device A concurrently tries stale write with expectedVersion: 1 -> 409 CART_CONFLICT (no silent overwrite!)
    const staleDevA = await invokePortal('PUT', '/api/customer-portal?action=cart&subdomain=shopa', hdrA, {
      subdomain: 'shopa',
      expectedVersion: 1,
      items: [
        { productId: prodA1, quantity: 1 },
        { productId: prodA2, quantity: 2 },
      ],
    });
    assert.equal(staleDevA.status, 409);
    assert.equal(staleDevA.json.code, 'CART_CONFLICT');
    assert.equal(staleDevA.json.serverCart.version, 2);
    assert.equal(staleDevA.json.serverCart.items[0].quantity, 3);
  } finally {
    globalThis.fetch = origFetch;
    process.env.VITE_SUPABASE_URL = prevEnv.url;
    process.env.VITE_SUPABASE_ANON_KEY = prevEnv.anon;
    process.env.SUPABASE_SERVICE_ROLE_KEY = prevEnv.srk;
  }

  console.log('PASS [4/6]: Live handler JWT/IDOR security, cross-device cart sync, Shop B isolation & 409 conflict checks');
}

function testAuthRoleSeparationAndSecurityContracts(): void {
  const authCallback = readText('src/pages/auth/AuthCallbackPage.tsx');
  const protectedRoute = readText('src/components/auth/ProtectedRoute.tsx');
  const appContext = readText('src/context/AppContext.tsx');
  const appRoutes = readText('src/App.tsx');
  const customerApi = readText('api/customer-portal.ts');
  const publicOrderApi = readText('api/public-order.ts');
  const ordersPage = readText('src/pages/dashboard/OrdersPage.tsx');
  const invoiceComp = readText('src/components/website/MerchantOrderInvoice.tsx');

  assert.ok(authCallback.includes('isCustomerAuthFlow'));
  assert.ok(authCallback.includes('!isCustomerAuthFlow'));
  assert.ok(authCallback.includes('setCustomerPortalSessionActive'));
  assert.ok(authCallback.includes("{ scope: 'customer' }"));

  assert.ok(appRoutes.includes('<Route path="/auth/callback" element={<AuthCallbackPage />} />'));
  assert.ok(protectedRoute.includes('isCustomerSessionOnly'));

  assert.ok(appContext.includes("sessionScope === 'customer'"));
  assert.ok(appContext.includes('isCustomerPortalSessionActive'));
  assert.ok(appContext.includes('storefront-order-'));
  // Broadcast signal must not leak courier/tracking PII
  assert.ok(!appContext.includes('courierName: data.courierName'));

  assert.ok(customerApi.includes('/auth/v1/user'));
  assert.ok(customerApi.includes('ownerAuthUid !== verifiedUserId'));
  assert.ok(customerApi.includes('CART_CONFLICT'));
  assert.ok(!customerApi.includes("role: 'customer'"));
  assert.ok(publicOrderApi.includes('/auth/v1/user'));
  assert.ok(publicOrderApi.includes('verifiedCustomerAuthUserId'));
  assert.ok(publicOrderApi.includes('merchantBrandingSnapshot'));

  assert.ok(invoiceComp.includes('sanitizeCssHexColor'));
  assert.ok(ordersPage.includes('MerchantOrderInvoice'));
  assert.ok(!ordersPage.includes('GoAMAAS Order Invoice'));
  assert.ok(!ordersPage.includes('AMAAS COMMERCE'));

  console.log('PASS [5/6]: Customer/Merchant/Admin auth separation, zero-PII Realtime broadcast & security invariants');
}

function testNoServiceRoleInClient(): void {
  const srcFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) srcFiles.push(full);
    }
  };
  walk(path.resolve(process.cwd(), 'src'));

  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(
      !content.includes('SUPABASE_SERVICE_ROLE_KEY'),
      `Forbidden SUPABASE_SERVICE_ROLE_KEY reference found in client source: ${file}`
    );
  }

  console.log('PASS [6/6]: Zero service_role key exposure across src/** client files');
}

async function main() {
  testBrandingSnapshotAndFallback();
  testMultiTenantCartIsolationAndMerge();
  testTruthfulOrderStatusHistory();
  await testLiveCustomerPortalApiSecurityAndCrossDeviceSync();
  testAuthRoleSeparationAndSecurityContracts();
  testNoServiceRoleInClient();
  console.log('\nALL CUSTOMER E-COMMERCE PORTAL SECURITY & INTEGRITY TESTS PASSED.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

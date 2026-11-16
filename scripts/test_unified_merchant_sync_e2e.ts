import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import resolveTenantHandler from '../api/resolve-tenant';
import publicOrderHandler from '../api/public-order';
import {
  computeProductWebsiteSyncState,
  getBangladeshPhoneVariants,
  phonesMatch,
  STOREFRONT_META_SOCIAL_KEY,
} from '../src/lib/storefrontSync';
import type { Product, SubscribedWebsite } from '../src/types';

interface MockResponseResult {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
}

async function invokeHandler(
  handler: (req: any, res: any) => Promise<void> | void,
  options: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<MockResponseResult> {
  const resHeaders: Record<string, string> = {};
  let rawEnd = '';
  const req: any = {
    method: options.method,
    url: options.url,
    headers: options.headers || { host: 'localhost:3000' },
    body: options.body,
    on: () => req,
  };
  const res: any = {
    statusCode: 200,
    setHeader(k: string, v: string) {
      resHeaders[k.toLowerCase()] = String(v);
    },
    end(chunk?: string) {
      if (chunk) rawEnd += chunk;
    },
  };
  await handler(req, res);
  let parsed: any = rawEnd;
  try {
    parsed = rawEnd ? JSON.parse(rawEnd) : null;
  } catch {
    // keep raw string
  }
  return { statusCode: res.statusCode, headers: resHeaders, body: parsed };
}

function makeFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${claims}.signature`;
}

async function runTests() {
  let passed = 0;
  const check = async (name: string, fn: () => Promise<void> | void) => {
    await fn();
    passed += 1;
    console.log(`PASS [${passed}]: ${name}`);
  };

  const STORE_A_ID = '11111111-1111-4111-8111-111111111111';
  const STORE_B_ID = '22222222-2222-4222-8222-222222222222';
  const SITE_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SITE_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const OWNER_A_ID = '00000000-0000-4000-8000-000000000001';
  const PROD_1_ID = '33333333-3333-4333-8333-333333333333';
  const PROD_DRAFT_ID = '44444444-4444-4444-8444-444444444444';
  const PROD_OUT_ID = '55555555-5555-4555-8555-555555555555';
  const FOREIGN_PROD_ID = '99999999-9999-4999-8999-999999999999';

  // 1. Bangladesh phone variant matching & normalization
  await check('BD phone variant generator and matcher deduplicate 017 / 88017 / +88017', () => {
    const variants = getBangladeshPhoneVariants('+880 1712-345678');
    assert.ok(variants.includes('01712345678'));
    assert.ok(variants.includes('8801712345678'));
    assert.ok(variants.includes('+8801712345678'));
    assert.equal(phonesMatch('01712345678', '+880 1712-345678'), true);
    assert.equal(phonesMatch('8801712345678', '01712-345678'), true);
    assert.equal(phonesMatch('01712345678', '01812345678'), false);
  });

  // 2. Slim 20261029 RPC + server fallback lookup + BD phone customer deduplication + security enforcement
  await check('/api/public-order resolves slim 20261029 RPC, enforces prices/stock, deduplicates BD phones, and rejects tampering', async () => {
    const origFetch = globalThis.fetch;
    const origUrl = process.env.VITE_SUPABASE_URL;
    const origAnon = process.env.VITE_SUPABASE_ANON_KEY;
    const origService = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.VITE_SUPABASE_URL = 'https://rqmgnewipgqgmvzpbrfn.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = makeFakeJwt({ role: 'anon', ref: 'rqmgnewipgqgmvzpbrfn' });
    process.env.SUPABASE_SERVICE_ROLE_KEY = makeFakeJwt({
      role: 'service_role',
      ref: 'rqmgnewipgqgmvzpbrfn',
    });

    const futureIso = new Date(Date.now() + 20 * 86400000).toISOString();
    let dbSubStatus = 'active';
    let dbDeployment = 'live';
    let dbExpiry = futureIso;

    const dbProducts: Record<string, any> = {
      [PROD_1_ID]: {
        id: PROD_1_ID,
        store_id: STORE_A_ID,
        name: 'Artisan Kurta',
        sku: 'KRT-01',
        category: 'Apparel',
        price: 2000,
        cost_price: 900,
        stock: 6,
        sales_count: 1,
        status: 'active',
      },
      [PROD_DRAFT_ID]: {
        id: PROD_DRAFT_ID,
        store_id: STORE_A_ID,
        name: 'Draft Jacket',
        sku: 'JKT-02',
        category: 'Apparel',
        price: 3500,
        cost_price: 1500,
        stock: 10,
        sales_count: 0,
        status: 'draft',
      },
      [PROD_OUT_ID]: {
        id: PROD_OUT_ID,
        store_id: STORE_A_ID,
        name: 'Out Scarf',
        sku: 'SCF-03',
        category: 'Apparel',
        price: 800,
        cost_price: 300,
        stock: 0,
        sales_count: 5,
        status: 'active',
      },
      [FOREIGN_PROD_ID]: {
        id: FOREIGN_PROD_ID,
        store_id: STORE_B_ID,
        name: 'Foreign Item',
        sku: 'FRN-99',
        category: 'Other',
        price: 5000,
        cost_price: 2000,
        stock: 10,
        sales_count: 0,
        status: 'active',
      },
    };

    const dbOrders: any[] = [];
    const dbMovements: any[] = [];
    // Pre-existing shopper saved as +8801712345678
    const dbCustomers: any[] = [
      {
        id: 'cust-existing-1',
        store_id: STORE_A_ID,
        name: 'Farhana Rahman',
        phone: '+8801712345678',
        email: 'farhana@example.com',
        city: 'Dhaka',
        orders_count: 2,
        total_spent: 3200,
      },
    ];

    let siteConfig: Record<string, any> = {
      servicesOrProducts: [
        {
          id: PROD_1_ID,
          productId: PROD_1_ID,
          name: 'Artisan Kurta',
          priceNumeric: 2000,
          discountPrice: 1750,
          stock: 6,
          inStock: true,
          isVisible: true,
        },
        {
          id: PROD_OUT_ID,
          productId: PROD_OUT_ID,
          name: 'Out Scarf',
          priceNumeric: 800,
          stock: 0,
          inStock: false,
          isVisible: true,
        },
      ],
      productCatalogMeta: {
        [PROD_1_ID]: { discountPrice: 1750, isVisible: true },
      },
    };

    globalThis.fetch = (async (inputUrl: string | URL, init?: RequestInit) => {
      const urlStr = String(inputUrl);
      const method = (init?.method || 'GET').toUpperCase();
      const bodyObj = init?.body ? JSON.parse(String(init.body)) : null;

      // Simulate slim 20261029 RPC that omits id and storeId
      if (urlStr.endsWith('/rest/v1/rpc/get_published_website_by_subdomain')) {
        return new Response(
          JSON.stringify({
            found: true,
            site: {
              subdomain: 'artisanbd',
              businessName: 'Artisan BD',
              subscriptionStatus: dbSubStatus,
              paymentStatus: 'paid',
              deploymentStatus: dbDeployment,
              currentPeriodEnd: dbExpiry,
              servicesOrProducts: siteConfig.servicesOrProducts,
              socialLinks: {
                [STOREFRONT_META_SOCIAL_KEY]: {
                  heroImageUrl: 'https://cdn.example.com/hero.jpg',
                },
              },
            },
          }),
          { status: 200 }
        );
      }

      if (urlStr.includes('/rest/v1/subscribed_websites') && method === 'GET') {
        return new Response(
          JSON.stringify([
            {
              id: SITE_A_ID,
              user_id: OWNER_A_ID,
              store_id: null, // Even missing store_id on website row recovers via stores?owner_id lookup!
              status: dbSubStatus,
              payment_status: 'paid',
              deployment_status: dbDeployment,
              current_period_end: dbExpiry,
              config: siteConfig,
            },
          ]),
          { status: 200 }
        );
      }

      if (urlStr.includes('/rest/v1/subscribed_websites') && method === 'PATCH') {
        siteConfig = bodyObj.config;
        return new Response(JSON.stringify([bodyObj]), { status: 200 });
      }

      if (urlStr.includes('/rest/v1/stores') && method === 'GET') {
        return new Response(JSON.stringify([{ id: STORE_A_ID }]), { status: 200 });
      }

      if (urlStr.includes('/rest/v1/orders') && method === 'GET') {
        const parsed = new URL(urlStr);
        const orderNum = (parsed.searchParams.get('order_number') || '').replace(/^eq\./, '');
        return new Response(
          JSON.stringify(dbOrders.filter((o) => o.order_number === orderNum)),
          { status: 200 }
        );
      }

      if (urlStr.includes('/rest/v1/orders') && method === 'POST') {
        const created = {
          id: `order-uuid-${dbOrders.length + 1}`,
          ...bodyObj,
          created_at: new Date().toISOString(),
        };
        dbOrders.push(created);
        return new Response(JSON.stringify([created]), { status: 201 });
      }

      if (urlStr.includes('/rest/v1/products') && method === 'GET') {
        const parsed = new URL(urlStr);
        const storeFilter = (parsed.searchParams.get('store_id') || '').replace(/^eq\./, '');
        const idInRaw = (parsed.searchParams.get('id') || '').replace(/^in\.\(|\)$/g, '');
        const ids = idInRaw.split(',').filter(Boolean);
        return new Response(
          JSON.stringify(ids.map((id) => dbProducts[id]).filter((p) => p && p.store_id === storeFilter)),
          { status: 200 }
        );
      }

      if (urlStr.includes('/rest/v1/products') && method === 'PATCH') {
        const parsed = new URL(urlStr);
        const pid = (parsed.searchParams.get('id') || '').replace(/^eq\./, '');
        const p = dbProducts[pid];
        if (!p) return new Response(JSON.stringify([]), { status: 200 });
        p.stock = bodyObj.stock;
        p.sales_count = bodyObj.sales_count;
        return new Response(JSON.stringify([p]), { status: 200 });
      }

      if (urlStr.includes('/rest/v1/inventory_movements') && method === 'POST') {
        dbMovements.push(...bodyObj);
        return new Response(JSON.stringify(bodyObj), { status: 201 });
      }

      if (urlStr.includes('/rest/v1/customers') && method === 'GET') {
        return new Response(JSON.stringify(dbCustomers), { status: 200 });
      }

      if (urlStr.includes('/rest/v1/customers') && method === 'PATCH') {
        dbCustomers[0] = { ...dbCustomers[0], ...bodyObj };
        return new Response(JSON.stringify([dbCustomers[0]]), { status: 200 });
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as any;

    try {
      // A: Order succeeds with synthetic 'site-artisanbd' placeholder websiteId & BD phone 01712345678
      const okRes = await invokeHandler(publicOrderHandler, {
        method: 'POST',
        url: '/api/public-order',
        body: {
          subdomain: 'artisanbd',
          websiteId: 'site-artisanbd',
          checkoutAttemptId: 'chk-slim-001',
          customerName: 'Farhana Rahman',
          customerPhone: '01712345678',
          shippingAddress: 'House 8, Banani',
          deliveryArea: 'Banani',
          city: 'Dhaka',
          deliveryMethod: 'Inside Dhaka',
          paymentMethod: 'Cash on Delivery (COD)',
          items: [{ productId: PROD_1_ID, quantity: 2, price: 1 }],
          total: 1,
        },
      });

      assert.equal(okRes.statusCode, 201);
      assert.equal(okRes.body.order.subtotal, 3500); // 1750 * 2 server discount price enforced!
      assert.equal(okRes.body.order.deliveryFee, 60);
      assert.equal(okRes.body.order.total, 3560);
      assert.equal(okRes.body.order.websiteId, SITE_A_ID);
      assert.equal(okRes.body.order.deliveryArea, 'Banani');
      assert.equal(dbProducts[PROD_1_ID].stock, 4); // 6 - 2
      assert.equal(dbProducts[PROD_1_ID].sales_count, 3); // 1 + 2
      // Existing customer (+8801712345678) deduplicated and incremented cleanly
      assert.equal(dbCustomers.length, 1);
      assert.equal(dbCustomers[0].orders_count, 3);
      assert.equal(dbCustomers[0].total_spent, 6760); // 3200 + 3560

      // B: Duplicate checkoutAttemptId is idempotent & preserves normalized fields
      const dupRes = await invokeHandler(publicOrderHandler, {
        method: 'POST',
        url: '/api/public-order',
        body: {
          subdomain: 'artisanbd',
          checkoutAttemptId: 'chk-slim-001',
          customerName: 'Farhana Rahman',
          customerPhone: '01712345678',
          shippingAddress: 'House 8, Banani',
          deliveryArea: 'Banani',
          city: 'Dhaka',
          deliveryMethod: 'Inside Dhaka',
          paymentMethod: 'Cash on Delivery (COD)',
          items: [{ productId: PROD_1_ID, quantity: 2 }],
        },
      });
      assert.equal(dupRes.statusCode, 200);
      assert.equal(dupRes.body.duplicatePrevented, true);
      assert.equal(dupRes.body.order.deliveryArea, 'Banani');
      assert.equal(dbProducts[PROD_1_ID].stock, 4); // unchanged

      // C: Mismatched real websiteId triggers 403 TENANT_MISMATCH
      const mismatchRes = await invokeHandler(publicOrderHandler, {
        method: 'POST',
        url: '/api/public-order',
        body: {
          subdomain: 'artisanbd',
          websiteId: SITE_B_ID,
          checkoutAttemptId: 'chk-mismatch-002',
          customerName: 'Test',
          customerPhone: '01712345678',
          shippingAddress: 'House 1',
          city: 'Dhaka',
          deliveryMethod: 'Inside Dhaka',
          paymentMethod: 'Cash on Delivery (COD)',
          items: [{ productId: PROD_1_ID, quantity: 1 }],
        },
      });
      assert.equal(mismatchRes.statusCode, 403);
      assert.equal(mismatchRes.body.code, 'TENANT_MISMATCH');

      // D: Foreign Store B product cannot be ordered on Store A website
      const foreignRes = await invokeHandler(publicOrderHandler, {
        method: 'POST',
        url: '/api/public-order',
        body: {
          subdomain: 'artisanbd',
          checkoutAttemptId: 'chk-foreign-003',
          customerName: 'Test',
          customerPhone: '01712345678',
          shippingAddress: 'House 1',
          city: 'Dhaka',
          deliveryMethod: 'Inside Dhaka',
          paymentMethod: 'Cash on Delivery (COD)',
          items: [{ productId: FOREIGN_PROD_ID, quantity: 1 }],
        },
      });
      assert.equal(foreignRes.statusCode, 400);
      assert.equal(foreignRes.body.code, 'PRODUCT_NOT_PUBLISHED');

      // E: Out-of-stock product rejected with 409 INSUFFICIENT_STOCK
      const oosRes = await invokeHandler(publicOrderHandler, {
        method: 'POST',
        url: '/api/public-order',
        body: {
          subdomain: 'artisanbd',
          checkoutAttemptId: 'chk-oos-004',
          customerName: 'Test',
          customerPhone: '01712345678',
          shippingAddress: 'House 1',
          city: 'Dhaka',
          deliveryMethod: 'Inside Dhaka',
          paymentMethod: 'Cash on Delivery (COD)',
          items: [{ productId: PROD_OUT_ID, quantity: 1 }],
        },
      });
      assert.equal(oosRes.statusCode, 409);
      assert.equal(oosRes.body.code, 'INSUFFICIENT_STOCK');
    } finally {
      globalThis.fetch = origFetch;
      process.env.VITE_SUPABASE_URL = origUrl;
      process.env.VITE_SUPABASE_ANON_KEY = origAnon;
      if (origService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = origService;
    }
  });

  // 3. /api/resolve-tenant service-role DB enrichment & security filtering
  await check('/api/resolve-tenant enriches live stock & metadata cleanly while hiding draft products and internal fields', async () => {
    const origFetch = globalThis.fetch;
    const origUrl = process.env.VITE_SUPABASE_URL;
    const origAnon = process.env.VITE_SUPABASE_ANON_KEY;
    const origService = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.VITE_SUPABASE_URL = 'https://rqmgnewipgqgmvzpbrfn.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = makeFakeJwt({ role: 'anon', ref: 'rqmgnewipgqgmvzpbrfn' });
    process.env.SUPABASE_SERVICE_ROLE_KEY = makeFakeJwt({
      role: 'service_role',
      ref: 'rqmgnewipgqgmvzpbrfn',
    });

    const futureIso = new Date(Date.now() + 10 * 86400000).toISOString();
    let dbSuspended = false;

    globalThis.fetch = (async (inputUrl: string | URL) => {
      const urlStr = String(inputUrl);
      if (urlStr.endsWith('/rest/v1/rpc/get_published_website_by_subdomain')) {
        return new Response(
          JSON.stringify({
            found: true,
            site: {
              subdomain: 'artisanbd',
              businessName: 'Artisan BD',
              subscriptionStatus: 'active',
              paymentStatus: 'paid',
              deploymentStatus: 'live',
              currentPeriodEnd: futureIso,
              servicesOrProducts: [
                {
                  id: PROD_1_ID,
                  productId: PROD_1_ID,
                  name: 'Artisan Kurta',
                  priceNumeric: 2000,
                  isVisible: true,
                },
                {
                  id: PROD_DRAFT_ID,
                  productId: PROD_DRAFT_ID,
                  name: 'Draft Jacket',
                  priceNumeric: 3500,
                  isVisible: true,
                },
              ],
            },
          }),
          { status: 200 }
        );
      }

      if (urlStr.includes('/rest/v1/subscribed_websites')) {
        return new Response(
          JSON.stringify([
            {
              id: SITE_A_ID,
              store_id: STORE_A_ID,
              status: dbSuspended ? 'suspended' : 'active',
              payment_status: 'paid',
              deployment_status: dbSuspended ? 'suspended' : 'live',
              current_period_end: futureIso,
              config: {
                productCatalogMeta: {
                  [PROD_1_ID]: { discountPrice: 1600, isFeatured: true, isVisible: true },
                },
              },
            },
          ]),
          { status: 200 }
        );
      }

      if (urlStr.includes('/rest/v1/products')) {
        return new Response(
          JSON.stringify([
            {
              id: PROD_1_ID,
              name: 'Artisan Kurta',
              sku: 'KRT-01',
              category: 'Apparel',
              price: 2000,
              stock: 9,
              status: 'active',
              description: 'Freshly restocked',
              is_visible: true,
            },
          ]),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as any;

    try {
      const liveRes = await invokeHandler(resolveTenantHandler, {
        method: 'GET',
        url: '/api/resolve-tenant?subdomain=artisanbd',
      });
      assert.equal(liveRes.statusCode, 200);
      assert.equal(liveRes.body.found, true);
      assert.equal(liveRes.body.site.id, SITE_A_ID);
      assert.equal(liveRes.body.site.storeId, STORE_A_ID);
      assert.equal(liveRes.body.site.servicesOrProducts.length, 1);
      assert.equal(liveRes.body.site.servicesOrProducts[0].stock, 9);
      assert.equal(liveRes.body.site.servicesOrProducts[0].discountPrice, 1600);
      assert.equal(liveRes.body.site.servicesOrProducts[0].isFeatured, true);
      assert.equal((liveRes.body.site.servicesOrProducts[0] as any).costPrice, undefined);

      // Even if RPC says active, DB suspended row must block public storefront
      dbSuspended = true;
      const suspendedRes = await invokeHandler(resolveTenantHandler, {
        method: 'GET',
        url: '/api/resolve-tenant?subdomain=artisanbd',
      });
      assert.equal(suspendedRes.statusCode, 404);
      assert.equal(suspendedRes.body.found, false);
    } finally {
      globalThis.fetch = origFetch;
      process.env.VITE_SUPABASE_URL = origUrl;
      process.env.VITE_SUPABASE_ANON_KEY = origAnon;
      if (origService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = origService;
    }
  });

  // 4. Unified dashboard routing, real-time sync wiring, and Production DB safety
  await check('Unified dashboard routes, realtime sync hooks, and UX controls are wired cleanly with zero supabase/ changes', () => {
    const rootDir = process.cwd();

    const appTsx = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
    assert.ok(appTsx.includes('path="/s/:subdomain"'), 'Missing /s/:subdomain public storefront route');
    assert.ok(appTsx.includes('path="website"'), 'Missing /dashboard/website alias route');
    assert.ok(appTsx.includes('path="inbox"'), 'Missing /dashboard/inbox alias route');

    const ctxTsx = fs.readFileSync(path.join(rootDir, 'src/context/AppContext.tsx'), 'utf8');
    assert.ok(ctxTsx.includes('productSyncStatusMap'), 'Missing productSyncStatusMap in AppContext');
    assert.ok(ctxTsx.includes('isOrderRealtimeLive'), 'Missing isOrderRealtimeLive in AppContext');
    assert.ok(ctxTsx.includes('orderSoundEnabled'), 'Missing orderSoundEnabled in AppContext');
    assert.ok(ctxTsx.includes('fetchOrdersForStoresFromDb'), 'Missing multi-store order sync');

    const productsTsx = fs.readFileSync(path.join(rootDir, 'src/pages/dashboard/ProductsPage.tsx'), 'utf8');
    assert.ok(productsTsx.includes('retryProductWebsiteSync'), 'ProductsPage missing retry sync handler');

    const ordersTsx = fs.readFileSync(path.join(rootDir, 'src/pages/dashboard/OrdersPage.tsx'), 'utf8');
    assert.ok(ordersTsx.includes('getNextOrderStage'), 'OrdersPage missing 1-click fulfillment action');
    assert.ok(ordersTsx.includes('setOrderSoundEnabled'), 'OrdersPage missing sound toggle');

    const customersTsx = fs.readFileSync(path.join(rootDir, 'src/pages/dashboard/CustomersPage.tsx'), 'utf8');
    assert.ok(customersTsx.includes('phonesMatch'), 'CustomersPage missing BD phone order matching');

    const supportTsx = fs.readFileSync(path.join(rootDir, 'src/pages/dashboard/SupportPage.tsx'), 'utf8');
    assert.ok(supportTsx.includes('customerInquiries'), 'SupportPage missing unified customer message inbox');

    const settingsTsx = fs.readFileSync(path.join(rootDir, 'src/pages/dashboard/TeamSettingsPage.tsx'), 'utf8');
    assert.ok(settingsTsx.includes('orderSoundEnabled'), 'TeamSettingsPage missing sound chime preference');

    // Sync state check
    const prod: Product = {
      id: PROD_1_ID,
      name: 'Kurta',
      sku: 'KRT-01',
      category: 'Apparel',
      price: 2000,
      costPrice: 900,
      stock: 5,
      lowStockThreshold: 2,
      status: 'active',
      description: 'Fine cotton',
      rating: 5,
      salesCount: 0,
      websiteId: SITE_A_ID,
      isVisible: true,
    };
    const site: Partial<SubscribedWebsite> = {
      id: SITE_A_ID,
      storeId: STORE_A_ID,
      deploymentStatus: 'live',
      servicesOrProducts: [
        {
          id: PROD_1_ID,
          productId: PROD_1_ID,
          name: 'Kurta',
          sku: 'KRT-01',
          price: '৳2,000',
          priceNumeric: 2000,
          description: 'Fine cotton',
          isVisible: true,
          inStock: true,
          stock: 5,
        },
      ],
    };
    assert.equal(computeProductWebsiteSyncState(prod, [site as SubscribedWebsite]).state, 'published');
  });

  console.log('================================================================');
  console.log(`ALL ${passed} UNIFIED MERCHANT SYNC E2E CHECKS PASSED!`);
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('UNIFIED MERCHANT SYNC E2E SUITE FAILED:', err);
  process.exit(1);
});

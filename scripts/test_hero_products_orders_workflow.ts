import assert from 'node:assert/strict';
import resolveTenantHandler from '../api/resolve-tenant';
import publicOrderHandler from '../api/public-order';
import {
  STOREFRONT_META_SOCIAL_KEY,
  buildWebsiteProductItemFromProduct,
  computeProductWebsiteSyncState,
  embedPublicStorefrontMetaInConfig,
  extractOrderMetadataFromItems,
  extractPublicStorefrontMeta,
  getEffectiveProductUnitPrice,
  mergeStoreProductsWithWebsites,
  removeProductFromWebsiteCatalog,
  upsertProductIntoWebsiteCatalog,
  validatePublicCustomerOrderInput,
} from '../src/lib/storefrontSync';
import {
  mapDatabaseRowToSubscribedWebsite,
  sanitizeWebsiteConfigForInsert,
} from '../src/lib/supabase';
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
  const PROD_1_ID = '33333333-3333-4333-8333-333333333333';
  const PROD_2_ID = '44444444-4444-4444-8444-444444444444';
  const FOREIGN_PROD_ID = '99999999-9999-4999-8999-999999999999';

  // 1-4. Hero image upload, replace, remove, and 20261018 RPC projection via __storefrontMeta
  await check('Hero image embeds into config + __storefrontMeta and persists across 20261018 RPC projection', () => {
    const heroUrl1 =
      'https://rqmgnewipgqgmvzpbrfn.supabase.co/storage/v1/object/public/website-assets/user-1/heroes/hero-v1.webp';
    const insertedCfg = sanitizeWebsiteConfigForInsert({
      headline: 'Authentic Bengal Handloom',
      heroImageUrl: heroUrl1,
      socialLinks: { facebook: 'https://facebook.com/bengalloom' },
      themeSettings: { heroLayout: 'split', primaryColor: '#0F172A' },
    });

    assert.equal(insertedCfg.heroImageUrl, heroUrl1);
    assert.equal(insertedCfg.socialLinks[STOREFRONT_META_SOCIAL_KEY].heroImageUrl, heroUrl1);

    // Simulate Production 20261018 get_published_website_by_subdomain RPC which returns socialLinks
    // from config->'socialLinks' while omitting top-level heroImageUrl / themeSettings
    const simulated20261018RpcSite = {
      id: SITE_A_ID,
      subdomain: 'bengalloom',
      businessName: 'Bengal Handloom',
      socialLinks: insertedCfg.socialLinks,
    };
    const extracted = extractPublicStorefrontMeta(simulated20261018RpcSite);
    assert.equal(extracted.heroImageUrl, heroUrl1);
    assert.equal(extracted.themeSettings?.heroLayout, 'split');
    assert.equal((extracted.socialLinks as any)[STOREFRONT_META_SOCIAL_KEY], undefined);
    assert.equal(extracted.socialLinks.facebook, 'https://facebook.com/bengalloom');

    // Replace hero image
    const heroUrl2 =
      'https://rqmgnewipgqgmvzpbrfn.supabase.co/storage/v1/object/public/website-assets/user-1/heroes/hero-v2.webp';
    const replacedCfg = embedPublicStorefrontMetaInConfig({
      ...insertedCfg,
      heroImageUrl: heroUrl2,
    });
    const replacedSite = mapDatabaseRowToSubscribedWebsite({
      id: SITE_A_ID,
      user_id: 'user-1',
      store_id: STORE_A_ID,
      business_name: 'Bengal Handloom',
      subdomain: 'bengalloom',
      config: replacedCfg,
    });
    assert.equal(replacedSite.heroImageUrl, heroUrl2);

    // Remove hero image -> clean fallback (undefined, never resurfaces old URL)
    const removedCfg = embedPublicStorefrontMetaInConfig({
      ...replacedCfg,
      heroImageUrl: '',
    });
    const removedSite = mapDatabaseRowToSubscribedWebsite({
      id: SITE_A_ID,
      user_id: 'user-1',
      store_id: STORE_A_ID,
      business_name: 'Bengal Handloom',
      subdomain: 'bengalloom',
      config: removedCfg,
    });
    assert.equal(removedSite.heroImageUrl, undefined);
  });

  // 5-8. Product creation, publish deduplication, update_pending detection, unpublish, and reload merge
  await check('Product publish deduplication, 4-state sync status, unpublish, and reload persistence', () => {
    const prod1: Product = {
      id: PROD_1_ID,
      name: 'Jamdani Muslin Saree',
      sku: 'JAM-101',
      category: 'Fashion & Apparel',
      price: 4500,
      discountPrice: 3900,
      costPrice: 2500,
      stock: 12,
      lowStockThreshold: 3,
      status: 'active',
      description: 'Handwoven 84-count cotton Jamdani',
      rating: 5,
      salesCount: 0,
      image: 'https://rqmgnewipgqgmvzpbrfn.supabase.co/storage/v1/object/public/website-assets/p1.webp',
      websiteId: SITE_A_ID,
      isVisible: true,
      sortOrder: 0,
    };

    const effective = getEffectiveProductUnitPrice(prod1);
    assert.equal(effective.unitPrice, 3900);
    assert.equal(effective.hasDiscount, true);
    assert.equal(effective.originalPrice, 4500);

    // Repeated publish never duplicates products
    let catalog = upsertProductIntoWebsiteCatalog([], prod1, { visible: true });
    catalog = upsertProductIntoWebsiteCatalog(catalog, prod1, { visible: true });
    catalog = upsertProductIntoWebsiteCatalog(catalog, prod1, { visible: true });
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0].productId, PROD_1_ID);
    assert.equal(catalog[0].discountPrice, 3900);
    assert.equal(catalog[0].priceNumeric, 4500);

    const liveSite: SubscribedWebsite = {
      id: SITE_A_ID,
      storeId: STORE_A_ID,
      businessName: 'Bengal Handloom',
      ownerName: 'Merchant A',
      email: 'merchant@example.com',
      phone: '01711223344',
      niche: 'ecommerce',
      nicheLabel: 'Fashion',
      templateId: 'tpl-modern',
      templateName: 'Modern',
      subdomain: 'bengalloom',
      fullDomainUrl: 'bengalloom.amaas.xyz',
      brandColor: '#2563EB',
      address: 'Dhaka, Bangladesh',
      headline: 'Bengal Handloom',
      subheadline: 'Handwoven',
      aboutText: 'Authentic',
      servicesOrProducts: catalog,
      whatsappNumber: '01711223344',
      productCatalogMeta: {
        [PROD_1_ID]: {
          imageUrl: prod1.image,
          discountPrice: 3900,
          websiteId: SITE_A_ID,
          isVisible: true,
          sortOrder: 0,
        },
      },
      socialLinks: {},
      planName: 'GoAMAAS Website',
      monthlyFee: 600,
      subscriptionStatus: 'active',
      paymentStatus: 'paid',
      deploymentStatus: 'live',
      sslStatus: 'active',
      nextBillingDate: '2026-12-01',
      createdAt: '2026-11-01',
      lastUpdatedAt: '2026-11-01',
      resourceUsage: {
        pagesCount: 1,
        pagesLimit: 10,
        storageUsedMb: 1,
        storageLimitMb: 500,
        bandwidthUsedGb: 0.1,
        bandwidthLimitGb: 50,
        monthlyUpdatesUsed: 0,
        monthlyUpdatesLimit: 30,
      },
    };

    // Published state
    assert.equal(computeProductWebsiteSyncState(prod1, [liveSite]).state, 'published');

    // Editing product price triggers update_pending until synced
    const editedProd1: Product = { ...prod1, discountPrice: 3600 };
    assert.equal(computeProductWebsiteSyncState(editedProd1, [liveSite]).state, 'update_pending');

    // Zero stock triggers unavailable
    const outProd1: Product = { ...prod1, stock: 0 };
    assert.equal(computeProductWebsiteSyncState(outProd1, [liveSite]).state, 'unavailable');

    // Unpublishing removes from website catalog while keeping store product intact
    const afterUnpublish = removeProductFromWebsiteCatalog(catalog, PROD_1_ID, prod1.sku);
    assert.equal(afterUnpublish.length, 0);
    const siteAfterUnpublish: SubscribedWebsite = {
      ...liveSite,
      servicesOrProducts: afterUnpublish,
    };
    assert.equal(
      computeProductWebsiteSyncState({ ...prod1, isVisible: false }, [siteAfterUnpublish]).state,
      'draft'
    );

    // Reload persistence on 20261018 baseline (where DB row lacks image_url / discount_price / website_id)
    const bareDbRowProduct: Product = {
      id: PROD_1_ID,
      name: 'Jamdani Muslin Saree',
      sku: 'JAM-101',
      category: 'Fashion & Apparel',
      price: 4500,
      costPrice: 2500,
      stock: 12,
      lowStockThreshold: 3,
      status: 'active',
      description: 'Handwoven 84-count cotton Jamdani',
      rating: 5,
      salesCount: 0,
    };
    const rehydrated = mergeStoreProductsWithWebsites([bareDbRowProduct], [liveSite]);
    assert.equal(rehydrated[0].image, prod1.image);
    assert.equal(rehydrated[0].discountPrice, 3900);
    assert.equal(rehydrated[0].websiteId, SITE_A_ID);
    assert.equal(rehydrated[0].isVisible, true);
  });

  // 9. Public tenant resolver endpoint (/api/resolve-tenant)
  await check('/api/resolve-tenant hydrates hero image, strips __storefrontMeta, and hides unpublished items', async () => {
    const origFetch = globalThis.fetch;
    const origUrl = process.env.VITE_SUPABASE_URL;
    const origAnon = process.env.VITE_SUPABASE_ANON_KEY;

    process.env.VITE_SUPABASE_URL = 'https://rqmgnewipgqgmvzpbrfn.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = makeFakeJwt({
      role: 'anon',
      ref: 'rqmgnewipgqgmvzpbrfn',
    });

    const futureIso = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          found: true,
          site: {
            id: SITE_A_ID,
            storeId: STORE_A_ID,
            subdomain: 'bengalloom',
            businessName: 'Bengal Handloom',
            subscriptionStatus: 'active',
            paymentStatus: 'paid',
            deploymentStatus: 'live',
            currentPeriodEnd: futureIso,
            servicesOrProducts: [
              { id: PROD_1_ID, productId: PROD_1_ID, name: 'Visible Saree', priceNumeric: 3900, isVisible: true },
              { id: PROD_2_ID, productId: PROD_2_ID, name: 'Hidden Draft Item', priceNumeric: 1900, isVisible: false },
            ],
            socialLinks: {
              facebook: 'https://facebook.com/bengalloom',
              __storefrontMeta: {
                heroImageUrl: 'https://rqmgnewipgqgmvzpbrfn.supabase.co/storage/v1/object/public/website-assets/hero.webp',
                themeSettings: { heroLayout: 'cover' },
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as any;

    try {
      const res = await invokeHandler(resolveTenantHandler, {
        method: 'GET',
        url: '/api/resolve-tenant?subdomain=bengalloom',
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.found, true);
      assert.equal(
        res.body.site.heroImageUrl,
        'https://rqmgnewipgqgmvzpbrfn.supabase.co/storage/v1/object/public/website-assets/hero.webp'
      );
      assert.equal(res.body.site.themeSettings.heroLayout, 'cover');
      assert.equal(res.body.site.socialLinks.__storefrontMeta, undefined);
      assert.equal(res.body.site.servicesOrProducts.length, 1);
      assert.equal(res.body.site.servicesOrProducts[0].name, 'Visible Saree');
      assert.ok(res.headers['cache-control']?.includes('no-store'));
    } finally {
      globalThis.fetch = origFetch;
      process.env.VITE_SUPABASE_URL = origUrl;
      process.env.VITE_SUPABASE_ANON_KEY = origAnon;
    }
  });

  // 10-17. Public website customer checkout, server price/stock enforcement, idempotency, tenant isolation, and snapshot immutability
  await check('/api/public-order enforces server prices, stock limits, idempotency, tenant isolation, and order snapshot immutability', async () => {
    const origFetch = globalThis.fetch;
    const origUrl = process.env.VITE_SUPABASE_URL;
    const origAnon = process.env.VITE_SUPABASE_ANON_KEY;
    const origService = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.VITE_SUPABASE_URL = 'https://rqmgnewipgqgmvzpbrfn.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = makeFakeJwt({
      role: 'anon',
      ref: 'rqmgnewipgqgmvzpbrfn',
    });

    // In-memory mock DB state for Store A and Store B
    let siteActive = true;
    const dbProducts: Record<string, any> = {
      [PROD_1_ID]: {
        id: PROD_1_ID,
        store_id: STORE_A_ID,
        name: 'Jamdani Muslin Saree',
        sku: 'JAM-101',
        category: 'Fashion & Apparel',
        price: 4500,
        stock: 5,
        sales_count: 2,
        status: 'active',
      },
      [PROD_2_ID]: {
        id: PROD_2_ID,
        store_id: STORE_A_ID,
        name: 'Sold Out Shawl',
        sku: 'SHW-000',
        category: 'Fashion & Apparel',
        price: 2200,
        stock: 0,
        sales_count: 10,
        status: 'active',
      },
      [FOREIGN_PROD_ID]: {
        id: FOREIGN_PROD_ID,
        store_id: STORE_B_ID,
        name: 'Merchant B Secret Product',
        sku: 'MB-999',
        category: 'Gadgets',
        price: 9900,
        stock: 20,
        sales_count: 0,
        status: 'active',
      },
    };
    const dbOrders: any[] = [];
    const dbMovements: any[] = [];
    const dbCustomers: any[] = [];
    let siteConfigServices = [
      {
        id: PROD_1_ID,
        productId: PROD_1_ID,
        sku: 'JAM-101',
        name: 'Jamdani Muslin Saree',
        priceNumeric: 4500,
        discountPrice: 3900,
        stock: 5,
        inStock: true,
        isVisible: true,
      },
      {
        id: PROD_2_ID,
        productId: PROD_2_ID,
        sku: 'SHW-000',
        name: 'Sold Out Shawl',
        priceNumeric: 2200,
        stock: 0,
        inStock: false,
        isVisible: true,
      },
    ];

    globalThis.fetch = (async (inputUrl: string | URL, init?: RequestInit) => {
      const urlStr = String(inputUrl);
      const method = (init?.method || 'GET').toUpperCase();
      const bodyObj = init?.body ? JSON.parse(String(init.body)) : null;

      if (urlStr.endsWith('/rest/v1/rpc/get_published_website_by_subdomain')) {
        if (!siteActive) {
          return new Response(JSON.stringify({ found: false }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            found: true,
            site: {
              id: SITE_A_ID,
              storeId: STORE_A_ID,
              subdomain: 'bengalloom',
              subscriptionStatus: 'active',
              paymentStatus: 'paid',
              deploymentStatus: 'live',
              currentPeriodEnd: new Date(Date.now() + 86400000 * 15).toISOString(),
              servicesOrProducts: siteConfigServices,
            },
          }),
          { status: 200 }
        );
      }

      if (urlStr.includes('/rest/v1/orders') && method === 'GET') {
        const parsed = new URL(urlStr);
        const storeFilter = (parsed.searchParams.get('store_id') || '').replace(/^eq\./, '');
        const orderNumFilter = (parsed.searchParams.get('order_number') || '').replace(/^eq\./, '');
        const matches = dbOrders.filter(
          (o) => o.store_id === storeFilter && o.order_number === orderNumFilter
        );
        return new Response(JSON.stringify(matches), { status: 200 });
      }

      if (urlStr.includes('/rest/v1/orders') && method === 'POST') {
        const created = {
          id: `aaaaaaaa-0000-4000-8000-${String(dbOrders.length + 1).padStart(12, '0')}`,
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
        const rows = ids
          .map((id) => dbProducts[id])
          .filter((p) => p && p.store_id === storeFilter);
        return new Response(JSON.stringify(rows), { status: 200 });
      }

      if (urlStr.includes('/rest/v1/products') && method === 'PATCH') {
        const parsed = new URL(urlStr);
        const pid = (parsed.searchParams.get('id') || '').replace(/^eq\./, '');
        const storeFilter = (parsed.searchParams.get('store_id') || '').replace(/^eq\./, '');
        const gteRaw = parsed.searchParams.get('stock');
        const minStock = gteRaw?.startsWith('gte.') ? Number(gteRaw.slice(4)) : 0;
        const target = dbProducts[pid];
        if (!target || target.store_id !== storeFilter || target.stock < minStock) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        target.stock = bodyObj.stock;
        target.sales_count = bodyObj.sales_count;
        return new Response(JSON.stringify([target]), { status: 200 });
      }

      if (urlStr.includes('/rest/v1/inventory_movements') && method === 'POST') {
        if (Array.isArray(bodyObj)) dbMovements.push(...bodyObj);
        return new Response(JSON.stringify(bodyObj), { status: 201 });
      }

      if (urlStr.includes('/rest/v1/customers') && method === 'GET') {
        return new Response(JSON.stringify(dbCustomers), { status: 200 });
      }

      if (urlStr.includes('/rest/v1/customers') && (method === 'POST' || method === 'PATCH')) {
        dbCustomers.push(bodyObj);
        return new Response(JSON.stringify([bodyObj]), { status: 201 });
      }

      if (urlStr.includes('/rest/v1/subscribed_websites') && method === 'GET') {
        return new Response(
          JSON.stringify([{ config: { servicesOrProducts: siteConfigServices } }]),
          { status: 200 }
        );
      }

      if (urlStr.includes('/rest/v1/subscribed_websites') && method === 'PATCH') {
        siteConfigServices = bodyObj.config.servicesOrProducts;
        return new Response(JSON.stringify([bodyObj]), { status: 200 });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    }) as any;

    try {
      // Case A: Missing SUPABASE_SERVICE_ROLE_KEY -> Honest 503 error, zero fake orders
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      const missingKeyRes = await invokeHandler(publicOrderHandler, {
        method: 'POST',
        url: '/api/public-order',
        body: {
          subdomain: 'bengalloom',
          checkoutAttemptId: 'chk-missing-key-001',
          customerName: 'Nusrat Jahan',
          customerPhone: '01712345678',
          shippingAddress: 'House 14, Road 7, Dhanmondi',
          city: 'Dhaka',
          deliveryMethod: 'Inside Dhaka',
          paymentMethod: 'Cash on Delivery (COD)',
          items: [{ productId: PROD_1_ID, quantity: 1 }],
        },
      });
      assert.equal(missingKeyRes.statusCode, 503);
      assert.equal(missingKeyRes.body.code, 'SERVER_SERVICE_ROLE_KEY_REQUIRED');
      assert.equal(dbOrders.length, 0);

      // Configure valid server-only service_role key
      process.env.SUPABASE_SERVICE_ROLE_KEY = makeFakeJwt({
        role: 'service_role',
        ref: 'rqmgnewipgqgmvzpbrfn',
      });

      // Case B: Valid customer order + tampered client price (price: 1, total: 1) -> Server enforces 3900 * 2 + 60 = 7860!
      const validPayload = {
        subdomain: 'bengalloom',
        websiteId: SITE_A_ID,
        checkoutAttemptId: 'chk-valid-attempt-1001',
        customerName: 'Nusrat Jahan',
        customerPhone: '01712-345678',
        customerEmail: 'nusrat@example.com',
        shippingAddress: 'House 14, Road 7',
        deliveryArea: 'Dhanmondi',
        city: 'Dhaka',
        deliveryInstructions: 'Call at gate',
        orderNotes: 'Gift wrap please',
        deliveryMethod: 'Inside Dhaka' as const,
        paymentMethod: 'Cash on Delivery (COD)' as const,
        price: 1,
        total: 1,
        items: [{ productId: PROD_1_ID, quantity: 2, price: 1 }],
      };

      assert.equal(validatePublicCustomerOrderInput(validPayload).valid, true);

      const orderRes = await invokeHandler(publicOrderHandler, {
        method: 'POST',
        url: '/api/public-order',
        body: validPayload,
      });
      assert.equal(orderRes.statusCode, 201);
      assert.equal(orderRes.body.ok, true);
      assert.equal(orderRes.body.success, true);
      assert.equal(orderRes.body.order.subtotal, 7800); // 3900 * 2
      assert.equal(orderRes.body.order.deliveryFee, 60); // Inside Dhaka
      assert.equal(orderRes.body.order.total, 7860);
      assert.equal(dbProducts[PROD_1_ID].stock, 3); // Decremented 5 -> 3
      assert.equal(dbOrders.length, 1);
      assert.equal(dbMovements.length, 1);
      assert.equal(dbMovements[0].quantity_change, -2);
      assert.equal(siteConfigServices[0].stock, 3);

      // Verify order metadata extraction for Merchant Dashboard OrdersPage
      const extractedOrderMeta = extractOrderMetadataFromItems(orderRes.body.order.items);
      assert.equal(extractedOrderMeta.orderSource, 'public_website');
      assert.equal(extractedOrderMeta.websiteSubdomain, 'bengalloom');
      assert.equal(extractedOrderMeta.deliveryArea, 'Dhanmondi');
      assert.equal(extractedOrderMeta.deliveryInstructions, 'Call at gate');
      assert.equal(extractedOrderMeta.orderNotes, 'Gift wrap please');

      // Case C: Duplicate submit with same checkoutAttemptId -> Idempotent 200, stock NOT double-decremented
      const duplicateRes = await invokeHandler(publicOrderHandler, {
        method: 'POST',
        url: '/api/public-order',
        body: validPayload,
      });
      assert.equal(duplicateRes.statusCode, 200);
      assert.equal(duplicateRes.body.duplicatePrevented, true);
      assert.equal(duplicateRes.body.order.orderNumber, orderRes.body.order.orderNumber);
      assert.equal(dbProducts[PROD_1_ID].stock, 3);
      assert.equal(dbOrders.length, 1);

      // Case D: Out-of-stock & insufficient stock rejected (never negative inventory)
      const outOfStockRes = await invokeHandler(publicOrderHandler, {
        method: 'POST',
        url: '/api/public-order',
        body: {
          ...validPayload,
          checkoutAttemptId: 'chk-out-of-stock-1002',
          items: [{ productId: PROD_2_ID, quantity: 1 }],
        },
      });
      assert.equal(outOfStockRes.statusCode, 409);
      assert.equal(outOfStockRes.body.code, 'INSUFFICIENT_STOCK');
      assert.equal(dbProducts[PROD_2_ID].stock, 0);

      const exceedStockRes = await invokeHandler(publicOrderHandler, {
        method: 'POST',
        url: '/api/public-order',
        body: {
          ...validPayload,
          checkoutAttemptId: 'chk-exceed-stock-1003',
          items: [{ productId: PROD_1_ID, quantity: 10 }], // Only 3 left
        },
      });
      assert.equal(exceedStockRes.statusCode, 409);
      assert.equal(exceedStockRes.body.code, 'INSUFFICIENT_STOCK');
      assert.equal(dbProducts[PROD_1_ID].stock, 3);

      // Case E: Cross-tenant isolation — Merchant B product ID rejected on Merchant A storefront
      const crossTenantRes = await invokeHandler(publicOrderHandler, {
        method: 'POST',
        url: '/api/public-order',
        body: {
          ...validPayload,
          checkoutAttemptId: 'chk-cross-tenant-1004',
          items: [{ productId: FOREIGN_PROD_ID, quantity: 1 }],
        },
      });
      assert.equal(crossTenantRes.statusCode, 400);
      assert.equal(crossTenantRes.body.code, 'PRODUCT_NOT_PUBLISHED');
      assert.equal(dbProducts[FOREIGN_PROD_ID].stock, 20);

      // Case F: Unpublished / inactive website rejects checkout
      siteActive = false;
      const inactiveSiteRes = await invokeHandler(publicOrderHandler, {
        method: 'POST',
        url: '/api/public-order',
        body: {
          ...validPayload,
          checkoutAttemptId: 'chk-inactive-site-1005',
        },
      });
      assert.equal(inactiveSiteRes.statusCode, 404);
      assert.equal(inactiveSiteRes.body.code, 'STOREFRONT_NOT_LIVE');

      // Case G: Historical order snapshot immutability when product is later edited or unpublished
      dbProducts[PROD_1_ID].price = 9999;
      dbProducts[PROD_1_ID].name = 'Renamed Future Saree';
      siteConfigServices = [];
      assert.equal(dbOrders[0].items[0].name, 'Jamdani Muslin Saree');
      assert.equal(dbOrders[0].items[0].price, 3900);
      assert.equal(dbOrders[0].total, 7860);
    } finally {
      globalThis.fetch = origFetch;
      process.env.VITE_SUPABASE_URL = origUrl;
      process.env.VITE_SUPABASE_ANON_KEY = origAnon;
      if (origService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = origService;
    }
  });

  console.log(`\nALL ${passed} WORKFLOW TEST SUITES PASSED SUCCESSFULLY.`);
}

runTests().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});

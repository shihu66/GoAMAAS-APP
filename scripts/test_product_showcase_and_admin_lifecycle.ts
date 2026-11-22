import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import adminWebsiteActionHandler from '../api/admin-website-action';
import {
  buildWebsiteProductItemFromProduct,
  mergeStoreProductsWithWebsites,
} from '../src/lib/storefrontSync';
import {
  sanitizeWebsiteConfigForInsert,
} from '../src/lib/supabase';
import {
  isWebsiteTrulyLive,
} from '../src/lib/paymentWorkflow';
import type {
  Product,
  SubscribedWebsite,
} from '../src/types';

interface MockDbCall {
  method: string;
  url: string;
  body?: unknown;
}

function makeMockReqRes(params: {
  method?: string;
  origin?: string;
  authorization?: string;
  body?: unknown;
}) {
  const req = new EventEmitter() as IncomingMessage & { body?: unknown; url?: string };
  req.method = params.method || 'POST';
  req.url = '/api/admin-website-action';
  req.headers = {
    'content-type': 'application/json',
    ...(params.origin ? { origin: params.origin } : {}),
    ...(params.authorization ? { authorization: params.authorization } : {}),
  };
  req.body = params.body;
  req.socket = { remoteAddress: '203.0.113.55' } as IncomingMessage['socket'];

  const headers: Record<string, string> = {};
  let rawEnd = '';
  const res = {
    statusCode: 200,
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = String(v);
    },
    getHeader(k: string) {
      return headers[k.toLowerCase()];
    },
    end(chunk?: string | Buffer) {
      if (chunk) rawEnd += chunk.toString();
    },
  } as unknown as ServerResponse;

  return {
    req,
    res,
    getResult: () => ({
      statusCode: res.statusCode,
      headers,
      json: rawEnd ? (JSON.parse(rawEnd) as Record<string, unknown>) : null,
    }),
  };
}

function buildFakeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.fakesig`;
}

async function runTests() {
  let passed = 0;
  const check = async (name: string, fn: () => Promise<void> | void) => {
    await fn();
    passed += 1;
    console.log(`PASS [${passed}]: ${name}`);
  };

  console.log('================================================================');
  console.log('GoAMAAS — Product Showcase Unification & Admin Website Lifecycle');
  console.log('Automated Functional & Security Verification Suite');
  console.log('================================================================');

  const root = process.cwd();
  const websitePageSrc = fs.readFileSync(
    path.join(root, 'src/pages/dashboard/SubscribedWebsitePage.tsx'),
    'utf8'
  );
  const productsPageSrc = fs.readFileSync(
    path.join(root, 'src/pages/dashboard/ProductsPage.tsx'),
    'utf8'
  );
  const adminPageSrc = fs.readFileSync(
    path.join(root, 'src/pages/admin/AdminDashboardPage.tsx'),
    'utf8'
  );
  const previewSrc = fs.readFileSync(
    path.join(root, 'src/components/website/WebsitePreviewRenderer.tsx'),
    'utf8'
  );
  const appCtxSrc = fs.readFileSync(path.join(root, 'src/context/AppContext.tsx'), 'utf8');

  // =========================================================================
  // FIX 1: Unify Product Management & Product Showcase
  // =========================================================================
  await check('1.1 SubscribedWebsitePage removes duplicate product add/edit/delete CRUD UI', () => {
    assert.ok(!websitePageSrc.includes('isProductModalOpen'));
    assert.ok(!websitePageSrc.includes('handleSaveProductModal'));
    assert.ok(!websitePageSrc.includes('handleConfirmDeleteProduct'));
    assert.ok(!websitePageSrc.includes('Add / Edit Website Product'));
    assert.ok(!websitePageSrc.includes('Add Product Modal'));
  });

  await check('1.2 SubscribedWebsitePage renames tab/section to Product Showcase and links to /dashboard/products', () => {
    assert.ok(websitePageSrc.includes('Product Showcase'));
    assert.ok(websitePageSrc.includes('to="/dashboard/products"'));
    assert.ok(websitePageSrc.includes('Manage Products'));
    assert.ok(productsPageSrc.includes('addProduct'));
    assert.ok(productsPageSrc.includes('updateProduct'));
    assert.ok(productsPageSrc.includes('deleteProduct'));
  });

  await check('1.3 Product Showcase settings (defaultSort & columns) sanitize cleanly and sync to renderer', () => {
    const sanitized = sanitizeWebsiteConfigForInsert({
      headline: 'Showcase Store',
      themeSettings: {
        productShowcaseDefaultSort: 'featured',
        productShowcaseColumns: 2,
      },
    });
    assert.equal(sanitized.themeSettings?.productShowcaseDefaultSort, 'featured');
    assert.equal(sanitized.themeSettings?.productShowcaseColumns, 2);
    assert.ok(previewSrc.includes('productShowcaseDefaultSort'));
    assert.ok(previewSrc.includes('productShowcaseColumns'));
  });

  await check('1.4 Showcase sync preserves store product SKU, price, stock, and tenant isolation', () => {
    const storeProduct: Product = {
      id: '11111111-1111-4111-8111-111111111111',
      storeId: '22222222-2222-4222-8222-222222222222',
      websiteId: undefined,
      name: 'Artisan Leather Tote',
      sku: 'SKU-TOTE-99',
      category: 'Bags',
      price: 3200,
      costPrice: 1500,
      stock: 14,
      lowStockThreshold: 3,
      status: 'active',
      description: 'Hand-stitched full-grain leather',
      isFeatured: true,
      sortOrder: 0,
      isVisible: true,
      rating: 5,
      salesCount: 0,
    };

    const showcaseItem = buildWebsiteProductItemFromProduct(storeProduct, 0);
    assert.equal(showcaseItem.id, storeProduct.id);
    assert.equal(showcaseItem.priceNumeric, 3200);
    assert.equal(showcaseItem.isFeatured, true);
    assert.equal(showcaseItem.sortOrder, 0);
    // Original product stock and SKU are untouched by showcase mapping
    assert.equal(storeProduct.stock, 14);
    assert.equal(storeProduct.sku, 'SKU-TOTE-99');
  });

  await check('1.5 Merchant republish is blocked client-side when website is suspended', () => {
    assert.ok(appCtxSrc.includes("site.subscriptionStatus === 'suspended'"));
    assert.ok(websitePageSrc.includes("activeWebsite.subscriptionStatus === 'suspended'"));
  });

  await check('1.6 mergeStoreProductsWithWebsites restores isFeatured, sortOrder, and isVisible across refresh', () => {
    const prodId = '11111111-1111-4111-8111-111111111111';
    const siteId = '33333333-3333-4333-8333-333333333333';
    const rawDbProduct: Product = {
      id: prodId,
      storeId: '22222222-2222-4222-8222-222222222222',
      websiteId: undefined,
      name: 'Featured Watch',
      sku: 'SKU-WATCH-1',
      category: 'Accessories',
      price: 4500,
      costPrice: 2000,
      stock: 5,
      lowStockThreshold: 2,
      status: 'active',
      description: 'Water-resistant timepiece',
      isFeatured: undefined,
      sortOrder: undefined,
      isVisible: undefined,
      rating: 5,
      salesCount: 0,
    };
    const siteWithMeta = {
      id: siteId,
      userId: '44444444-4444-4444-8444-444444444444',
      storeId: rawDbProduct.storeId,
      businessName: 'Watch Studio',
      ownerName: 'Owner',
      email: 'owner@watch.amaas.xyz',
      phone: '01700000000',
      niche: 'ecommerce',
      nicheLabel: 'E-commerce',
      templateId: 't1',
      templateName: 'Modern',
      subdomain: 'watchstudio',
      fullDomainUrl: 'watchstudio.amaas.xyz',
      brandColor: '#2563EB',
      address: 'Dhaka',
      headline: 'Watch Studio',
      subheadline: 'Fine Watches',
      aboutText: 'About',
      servicesOrProducts: [],
      productCatalogMeta: {
        [prodId]: {
          websiteId: siteId,
          isVisible: true,
          sortOrder: 2,
          isFeatured: true,
        },
      },
      whatsappNumber: '01700000000',
      socialLinks: {},
      planName: 'GoAMAAS Website',
      monthlyFee: 600,
      subscriptionStatus: 'active',
      paymentStatus: 'paid',
      deploymentStatus: 'live',
      sslStatus: 'active',
      nextBillingDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      resourceUsage: {
        pagesCount: 1,
        pagesLimit: 10,
        storageUsedMb: 10,
        storageLimitMb: 500,
        bandwidthUsedGb: 1,
        bandwidthLimitGb: 50,
        monthlyUpdatesUsed: 0,
        monthlyUpdatesLimit: 50,
      },
    } as SubscribedWebsite;

    const [merged] = mergeStoreProductsWithWebsites([rawDbProduct], [siteWithMeta]);
    assert.equal(merged.isFeatured, true);
    assert.equal(merged.isVisible, true);
    assert.equal(merged.sortOrder, 2);
    assert.equal(merged.websiteId, siteId);
  });

  await check('1.7 Storefront filter enforces store_id before website match, sequential dense reorder, and resolve-tenant sorting', () => {
    const resolveTenantSrc = fs.readFileSync(path.join(root, 'api/resolve-tenant.ts'), 'utf8');
    // store_id isolation runs before catalog/website matches
    const storeCheckIdx = websitePageSrc.indexOf('if (activeWebsite.storeId && p.storeId && p.storeId !== activeWebsite.storeId)');
    const webIdCheckIdx = websitePageSrc.indexOf('if (p.websiteId === activeWebsite.id) return true;');
    assert.ok(storeCheckIdx > -1 && webIdCheckIdx > storeCheckIdx);
    // sequential dense sortOrder normalization (no Promise.all race)
    const moveFnSlice = websitePageSrc.slice(
      websitePageSrc.indexOf('const handleMoveDbProduct'),
      websitePageSrc.indexOf('const handleToggleLegacyProductVisibility')
    );
    assert.ok(!moveFnSlice.includes('Promise.all'));
    assert.ok(moveFnSlice.includes('await updateProduct(item.id, { sortOrder: i }'));
    // AppContext syncProductCatalogStateToWebsite uses subscribedWebsitesRef and persists isFeatured
    assert.ok(appCtxSrc.includes('isFeatured: prod.isFeatured === true'));
    assert.ok(appCtxSrc.includes('subscribedWebsitesRef.current'));
    // Public resolve-tenant endpoint sorts enrichedItems by sortOrder
    assert.ok(resolveTenantSrc.includes('.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))'));
  });

  // =========================================================================
  // FIX 2: Admin Website Suspend & Two-Step Delete (Server + UI)
  // =========================================================================
  await check('2.1 AdminDashboardPage enforces strong Two-Step Permanent Deletion UI and removes incomplete fallback', () => {
    const supabaseLibSrc = fs.readFileSync(path.join(root, 'src/lib/supabase.ts'), 'utf8');
    assert.ok(!adminPageSrc.includes('disabled={hasPaymentHistory || !isOnline}'));
    assert.ok(!adminPageSrc.includes('Non-destructive to merchant data'));
    assert.ok(adminPageSrc.includes('Step 1 of 2: Verify Website Deletion'));
    assert.ok(adminPageSrc.includes('Step 2 of 2: Final Deletion Confirmation'));
    assert.ok(adminPageSrc.includes('PERMANENTLY DELETE WEBSITE AND ALL ASSOCIATED DATA'));
    assert.ok(adminPageSrc.includes('explicitConfirmed: true'));
    assert.ok(adminPageSrc.includes('confirmSubdomain: normalizedTyped'));
    assert.ok(adminPageSrc.includes('setLifecycleError'));
    // Ensure client wrapper never silently falls back to incomplete admin_delete_subscribed_website RPC
    const deleteWrapperSlice = supabaseLibSrc.slice(
      supabaseLibSrc.indexOf('export async function adminDeleteSubscribedWebsiteInDb'),
      supabaseLibSrc.indexOf('export async function adminUpdateWebsiteLifecycleInDb')
    );
    assert.ok(!deleteWrapperSlice.includes("supabase.rpc('admin_delete_subscribed_website'"));
    assert.ok(deleteWrapperSlice.includes('ATOMIC_DELETE_UNAVAILABLE'));
  });

  // Set up controlled mock environment for testing /api/admin-website-action handler
  const prevEnv = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
  };
  const originalFetch = globalThis.fetch;

  const WEBSITE_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ADMIN_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const MERCHANT_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const STORE_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const adminToken = buildFakeJwt({ sub: ADMIN_UUID, aal: 'aal2' });
  const adminAal1Token = buildFakeJwt({ sub: ADMIN_UUID, aal: 'aal1' });
  const merchantToken = buildFakeJwt({ sub: MERCHANT_UUID, aal: 'aal1' });

  let rpcInstalledInMock = true;
  let customRpcResultOverride: Record<string, unknown> | null = null;
  let forceStorageDeleteFail = false;
  let crossUserSiblingSite: { id: string; user_id: string; store_id: string; config: Record<string, unknown> } | null = null;
  let siteStoreIdOverride: string | null | undefined = undefined;
  let storageDeleteRequests: Array<{ url: string; prefixes: string[] }> = [];
  let storageListRequests: string[] = [];
  let dbCalls: MockDbCall[] = [];
  const SHARED_IMAGE_URL = `https://example-project.supabase.co/storage/v1/object/public/website-assets/${MERCHANT_UUID}/general/shared-logo.png`;
  const EXCLUSIVE_HERO_URL = `https://example-project.supabase.co/storage/v1/object/public/website-assets/${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`;
  const EXCLUSIVE_PROD_URL = `https://example-project.supabase.co/storage/v1/object/public/website-assets/${MERCHANT_UUID}/${STORE_UUID}/products/item-1.png`;
  const SIBLING_SITE_UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const SIBLING_STORE_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const OTHER_MERCHANT_UUID = '77777777-7777-4777-8777-777777777777';
  const CROSS_USER_SIBLING_SITE_UUID = '88888888-8888-4888-8888-888888888888';
  const PAYMENT_UUID = '99999999-9999-4999-8999-999999999999';

  let currentSiteState: {
    id: string;
    user_id: string;
    store_id: string | null;
    business_name: string;
    subdomain: string;
    full_domain: string;
    status: string;
    deployment_status: string;
    payment_status: string;
    current_period_end: string;
    grace_period_end: string;
    config: Record<string, unknown>;
  } = {
    id: WEBSITE_UUID,
    user_id: MERCHANT_UUID,
    store_id: STORE_UUID,
    business_name: 'Forty Nine Electronics',
    subdomain: 'fortyninee',
    full_domain: 'fortyninee.amaas.xyz',
    status: 'active',
    deployment_status: 'live',
    payment_status: 'paid',
    current_period_end: new Date(Date.now() + 20 * 86400 * 1000).toISOString(),
    grace_period_end: new Date(Date.now() + 25 * 86400 * 1000).toISOString(),
    config: {
      logoUrl: SHARED_IMAGE_URL,
      heroImageUrl: EXCLUSIVE_HERO_URL,
    },
  };

  try {
    process.env.VITE_SUPABASE_URL = 'https://example-project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-not-real';
    process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key-not-real';
    process.env.UPSTASH_REDIS_REST_URL = '';
    process.env.UPSTASH_REDIS_REST_TOKEN = '';
    process.env.NODE_ENV = 'production';

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || 'GET').toUpperCase();
      const bodyText = typeof init?.body === 'string' ? init.body : undefined;
      let parsedBody: unknown;
      try {
        parsedBody = bodyText ? JSON.parse(bodyText) : undefined;
      } catch {
        parsedBody = bodyText;
      }

      if (url.endsWith('/auth/v1/user')) {
        const auth = String(
          (init?.headers as Record<string, string> | undefined)?.Authorization || ''
        );
        const token = auth.replace(/^Bearer\s+/i, '').trim();
        if (token === adminToken || token === adminAal1Token) {
          return new Response(
            JSON.stringify({
              id: ADMIN_UUID,
              email: 'official.amaas.dev@gmail.com',
              email_confirmed_at: '2026-01-01T00:00:00Z',
              factors: [{ factor_type: 'totp', status: 'verified' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (token === merchantToken) {
          return new Response(
            JSON.stringify({
              id: MERCHANT_UUID,
              email: 'merchant@example.com',
              email_confirmed_at: '2026-01-01T00:00:00Z',
              factors: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ message: 'Invalid JWT' }), { status: 401 });
      }

      dbCalls.push({ method, url, body: parsedBody });

      if (url.includes('/rest/v1/profiles')) {
        return new Response(
          JSON.stringify([
            {
              id: ADMIN_UUID,
              email: 'official.amaas.dev@gmail.com',
              role: 'admin',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/rest/v1/subscribed_websites') && method === 'GET') {
        const effectiveSite =
          siteStoreIdOverride !== undefined
            ? { ...currentSiteState, store_id: siteStoreIdOverride }
            : currentSiteState;
        if (url.includes(`id=eq.${WEBSITE_UUID}`)) {
          return new Response(JSON.stringify([effectiveSite]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes(`store_id=eq.${STORE_UUID}`)) {
          const rows = crossUserSiblingSite
            ? [effectiveSite, crossUserSiblingSite]
            : [effectiveSite];
          return new Response(JSON.stringify(rows), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes(`user_id=eq.${MERCHANT_UUID}`)) {
          return new Response(
            JSON.stringify([
              effectiveSite,
              {
                id: SIBLING_SITE_UUID,
                user_id: MERCHANT_UUID,
                store_id: SIBLING_STORE_UUID,
                config: { logoUrl: SHARED_IMAGE_URL },
              },
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify([effectiveSite]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/rest/v1/subscribed_websites') && method === 'PATCH') {
        const patch = (parsedBody || {}) as Record<string, string>;
        currentSiteState = {
          ...currentSiteState,
          ...patch,
        };
        return new Response(JSON.stringify([currentSiteState]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/rest/v1/payment_requests') && method === 'GET') {
        return new Response(
          JSON.stringify([
            {
              id: PAYMENT_UUID,
              service_id: WEBSITE_UUID,
              reviewed_at: new Date().toISOString(),
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/rest/v1/website_lifecycle_audit_logs') && method === 'POST') {
        return new Response(JSON.stringify([{ id: 'audit-log-1' }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/rest/v1/products') && method === 'GET') {
        if (url.includes(`store_id=in.(${SIBLING_STORE_UUID})`)) {
          return new Response(
            JSON.stringify([{ id: 'prod-sibling-1', image_url: SHARED_IMAGE_URL }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify([{ id: 'prod-del-1', image_url: EXCLUSIVE_PROD_URL }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/storage/v1/object/list/website-assets') && method === 'POST') {
        const prefix = String((parsedBody as Record<string, unknown>)?.prefix || '');
        storageListRequests.push(prefix);
        if (prefix === `${MERCHANT_UUID}/${WEBSITE_UUID}`) {
          return new Response(
            JSON.stringify([{ id: 'obj-1', name: 'heroes/hero-1.png' }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (prefix === `${MERCHANT_UUID}/${STORE_UUID}`) {
          return new Response(
            JSON.stringify([{ id: 'obj-2', name: 'products/item-1.png' }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/storage/v1/object/website-assets') && method === 'DELETE') {
        const prefixes = Array.isArray((parsedBody as { prefixes?: unknown[] })?.prefixes)
          ? ((parsedBody as { prefixes: string[] }).prefixes)
          : [];
        storageDeleteRequests.push({ url, prefixes });
        if (forceStorageDeleteFail) {
          return new Response(JSON.stringify({ error: 'Storage delete error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(prefixes.map((name) => ({ name }))), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/rest/v1/rpc/admin_permanently_delete_website') && method === 'POST') {
        if (!rpcInstalledInMock) {
          return new Response(
            JSON.stringify({
              code: 'PGRST202',
              message: 'Could not find the function public.admin_permanently_delete_website',
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }
        const responsePayload = customRpcResultOverride ?? {
          success: true,
          code: 'DELETED',
          message:
            'Website and all exclusively associated store, product, inventory, customer, and order records were permanently deleted.',
          deletedWebsiteId: WEBSITE_UUID,
          deletedStoreId: STORE_UUID,
          isSharedStore: false,
          deletedCounts: {
            products: 1,
            inventoryMovements: 2,
            customers: 1,
            orders: 1,
            storeMembers: 1,
          },
          auditLogId: 'audit-del-1',
        };
        return new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    await check('2.2 /api/admin-website-action blocks storefront wildcard origin with 403', async () => {
      const { req, res, getResult } = makeMockReqRes({
        origin: 'https://fortyninee.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: { action: 'suspend', websiteId: WEBSITE_UUID, reason: 'test' },
      });
      await adminWebsiteActionHandler(req, res);
      const out = getResult();
      assert.equal(out.statusCode, 403);
      assert.equal(out.json?.code, 'CORS_ORIGIN_FORBIDDEN');
    });

    await check('2.3 /api/admin-website-action rejects unauthenticated request with 401', async () => {
      const { req, res, getResult } = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        body: { action: 'suspend', websiteId: WEBSITE_UUID, reason: 'test' },
      });
      await adminWebsiteActionHandler(req, res);
      assert.equal(getResult().statusCode, 401);
    });

    await check('2.4 /api/admin-website-action rejects non-admin merchant JWT with 403', async () => {
      dbCalls = [];
      const { req, res, getResult } = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${merchantToken}`,
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(req, res);
      const out = getResult();
      assert.equal(out.statusCode, 403);
      assert.equal(out.json?.code, 'FORBIDDEN_ADMIN_REQUIRED');
      assert.equal(dbCalls.length, 0);
    });

    await check('2.5 /api/admin-website-action enforces AAL2 MFA when admin TOTP is enrolled', async () => {
      const { req, res, getResult } = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminAal1Token}`,
        body: { action: 'suspend', websiteId: WEBSITE_UUID, reason: 'Audit hold' },
      });
      await adminWebsiteActionHandler(req, res);
      assert.equal(getResult().statusCode, 403);
      assert.equal(getResult().json?.code, 'MFA_REQUIRED');
    });

    await check('2.6 /api/admin-website-action rejects delete without subdomain match or explicit confirmation', async () => {
      const missingFlag = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: { action: 'delete', websiteId: WEBSITE_UUID, confirmSubdomain: 'fortyninee' },
      });
      await adminWebsiteActionHandler(missingFlag.req, missingFlag.res);
      assert.equal(missingFlag.getResult().statusCode, 400);
      assert.equal(missingFlag.getResult().json?.code, 'DELETE_CONFIRMATION_REQUIRED');

      const mismatch = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'wrong-subdomain',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(mismatch.req, mismatch.res);
      assert.equal(mismatch.getResult().statusCode, 409);
      assert.equal(mismatch.getResult().json?.code, 'SUBDOMAIN_CONFIRMATION_MISMATCH');
    });

    await check('2.7 Authorized admin SUSPEND takes site offline, logs audit, and preserves merchant data', async () => {
      dbCalls = [];
      const { req, res, getResult } = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'suspend',
          websiteId: WEBSITE_UUID,
          reason: 'Billing compliance investigation',
        },
      });
      await adminWebsiteActionHandler(req, res);
      const out = getResult();
      assert.equal(out.statusCode, 200);
      assert.equal(out.json?.ok, true);
      assert.equal(out.json?.status, 'suspended');
      assert.equal(out.json?.deploymentStatus, 'suspended');

      const patchCall = dbCalls.find(
        (c) => c.method === 'PATCH' && c.url.includes('/rest/v1/subscribed_websites')
      );
      assert.ok(patchCall);
      assert.deepEqual((patchCall?.body as Record<string, unknown>)?.status, 'suspended');
      assert.deepEqual((patchCall?.body as Record<string, unknown>)?.deployment_status, 'suspended');

      const auditCall = dbCalls.find(
        (c) => c.method === 'POST' && c.url.includes('/rest/v1/website_lifecycle_audit_logs')
      );
      assert.ok(auditCall);
      assert.equal((auditCall?.body as Record<string, unknown>)?.action, 'suspend');
      assert.equal(
        (auditCall?.body as Record<string, unknown>)?.reason,
        'Billing compliance investigation'
      );

      // Verify storefront helper treats suspended site as offline immediately
      const suspendedSite: SubscribedWebsite = {
        id: currentSiteState.id,
        userId: currentSiteState.user_id,
        storeId: currentSiteState.store_id ?? STORE_UUID,
        businessName: currentSiteState.business_name,
        ownerName: 'Owner',
        email: 'owner@fortyninee.amaas.xyz',
        phone: '01700000000',
        niche: 'ecommerce',
        nicheLabel: 'E-commerce',
        templateId: 't1',
        templateName: 'Modern',
        subdomain: 'fortyninee',
        fullDomainUrl: 'fortyninee.amaas.xyz',
        brandColor: '#2563EB',
        address: 'Dhaka',
        headline: 'Forty Nine',
        subheadline: 'Shop online',
        aboutText: 'About us',
        servicesOrProducts: [],
        whatsappNumber: '01700000000',
        socialLinks: {},
        planName: 'GoAMAAS Website',
        monthlyFee: 600,
        subscriptionStatus: 'suspended',
        paymentStatus: 'paid',
        deploymentStatus: 'suspended',
        sslStatus: 'active',
        nextBillingDate: currentSiteState.current_period_end,
        currentPeriodEnd: currentSiteState.current_period_end,
        gracePeriodEndsAt: currentSiteState.grace_period_end,
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        resourceUsage: {
          pagesCount: 1,
          pagesLimit: 10,
          storageUsedMb: 10,
          storageLimitMb: 500,
          bandwidthUsedGb: 1,
          bandwidthLimitGb: 50,
          monthlyUpdatesUsed: 0,
          monthlyUpdatesLimit: 50,
        },
      };
      assert.equal(isWebsiteTrulyLive(suspendedSite), false);
    });

    await check('2.8 Authorized admin REACTIVATE restores original live website without mutating data', async () => {
      dbCalls = [];
      const { req, res, getResult } = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'reactivate',
          websiteId: WEBSITE_UUID,
          reason: 'Compliance review passed',
        },
      });
      await adminWebsiteActionHandler(req, res);
      const out = getResult();
      assert.equal(out.statusCode, 200);
      assert.equal(out.json?.ok, true);
      assert.equal(out.json?.status, 'active');
      assert.equal(out.json?.deploymentStatus, 'live');
      assert.ok(!dbCalls.some((c) => c.method === 'DELETE'));
    });

    await check('2.9 DELETE fails closed with 501 ATOMIC_DELETE_RPC_REQUIRED when atomic RPC is absent (0 storage or partial DB deletes)', async () => {
      dbCalls = [];
      storageDeleteRequests = [];
      rpcInstalledInMock = false;
      const { req, res, getResult } = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(req, res);
      const out = getResult();
      assert.equal(out.statusCode, 501);
      assert.equal(out.json?.code, 'ATOMIC_DELETE_RPC_REQUIRED');
      assert.equal(storageDeleteRequests.length, 0);
      assert.ok(!dbCalls.some((c) => c.method === 'DELETE'));
    });

    await check('2.10 Authorized admin DELETE invokes atomic transactional RPC and removes only exclusive website/store Storage objects', async () => {
      dbCalls = [];
      storageDeleteRequests = [];
      rpcInstalledInMock = true;
      const { req, res, getResult } = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(req, res);
      const out = getResult();
      assert.equal(out.statusCode, 200);
      assert.equal(out.json?.ok, true);
      assert.equal(out.json?.code, 'DELETED');
      assert.equal(out.json?.deletedStoreId, STORE_UUID);

      // Verify atomic RPC call was used instead of fragmented REST deletes
      const rpcCall = dbCalls.find(
        (c) => c.method === 'POST' && c.url.endsWith('/rest/v1/rpc/admin_permanently_delete_website')
      );
      assert.ok(rpcCall);
      assert.ok(!dbCalls.some((c) => c.method === 'DELETE' && c.url.includes('/rest/v1/')));

      // Verify exclusive Storage files were deleted while shared /general/ logo asset was protected
      assert.equal(storageDeleteRequests.length, 1);
      const removed = storageDeleteRequests[0].prefixes;
      assert.ok(removed.includes(`${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`));
      assert.ok(removed.includes(`${MERCHANT_UUID}/${STORE_UUID}/products/item-1.png`));
      assert.ok(!removed.includes(`${MERCHANT_UUID}/general/shared-logo.png`));
    });

    await check('2.11 Zero service-role key or admin secret references in src/ or built dist/', () => {
      const scanFiles = (dir: string): string[] => {
        if (!fs.existsSync(dir)) return [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const out: string[] = [];
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) out.push(...scanFiles(full));
          else if (/\.(ts|tsx|js|mjs|css|html)$/.test(e.name)) out.push(full);
        }
        return out;
      };
      for (const file of [...scanFiles(path.join(root, 'src')), ...scanFiles(path.join(root, 'dist'))]) {
        const content = fs.readFileSync(file, 'utf8');
        assert.ok(
          !content.includes('SUPABASE_SERVICE_ROLE_KEY'),
          `Found SUPABASE_SERVICE_ROLE_KEY reference in client artifact: ${file}`
        );
        assert.ok(
          !content.includes('UPSTASH_REDIS_REST_TOKEN'),
          `Found UPSTASH_REDIS_REST_TOKEN reference in client artifact: ${file}`
        );
      }
    });
    await check('2.12 Post-RPC Storage cleanup NEVER deletes store/product assets when rpcResult.isSharedStore === true', async () => {
      storageDeleteRequests = [];
      storageListRequests = [];
      customRpcResultOverride = {
        success: true,
        code: 'DELETED',
        deletedWebsiteId: WEBSITE_UUID,
        deletedStoreId: null,
        isSharedStore: true,
        deletedCounts: { products: 0, inventoryMovements: 0, customers: 0, orders: 0, storeMembers: 0 },
      };
      const { req, res, getResult } = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(req, res);
      const out = getResult();
      assert.equal(out.statusCode, 200);
      assert.equal(out.json?.isSharedStore, true);
      assert.equal(out.json?.deletedStoreId, null);
      assert.equal(storageDeleteRequests.length, 1);
      const removed = storageDeleteRequests[0].prefixes;
      assert.ok(removed.includes(`${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`));
      assert.ok(!removed.includes(`${MERCHANT_UUID}/${STORE_UUID}/products/item-1.png`));
      assert.ok(!storageListRequests.includes(`${MERCHANT_UUID}/${STORE_UUID}`));
      customRpcResultOverride = null;
    });

    await check('2.13 NULL store_id never guesses a store by owner_id and only removes verified website-scoped paths', async () => {
      storageDeleteRequests = [];
      storageListRequests = [];
      dbCalls = [];
      siteStoreIdOverride = null;
      customRpcResultOverride = {
        success: true,
        code: 'DELETED',
        deletedWebsiteId: WEBSITE_UUID,
        deletedStoreId: null,
        isSharedStore: false,
        deletedCounts: { products: 0, inventoryMovements: 0, customers: 0, orders: 0, storeMembers: 0 },
      };
      const { req, res, getResult } = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(req, res);
      const out = getResult();
      assert.equal(out.statusCode, 200);
      assert.equal(out.json?.deletedStoreId, null);
      // Never queried public.stores to guess store by owner_id
      assert.ok(!dbCalls.some((c) => c.url.includes('/rest/v1/stores')));
      assert.equal(storageDeleteRequests.length, 1);
      assert.deepEqual(storageDeleteRequests[0].prefixes, [
        `${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`,
      ]);
      siteStoreIdOverride = undefined;
      customRpcResultOverride = null;
    });

    await check('2.14 Cross-user shared store sibling website assets are excluded from Storage deletion', async () => {
      storageDeleteRequests = [];
      crossUserSiblingSite = {
        id: CROSS_USER_SIBLING_SITE_UUID,
        user_id: OTHER_MERCHANT_UUID,
        store_id: STORE_UUID,
        config: { bannerImageUrl: EXCLUSIVE_HERO_URL },
      };
      customRpcResultOverride = {
        success: true,
        code: 'DELETED',
        deletedWebsiteId: WEBSITE_UUID,
        deletedStoreId: null,
        isSharedStore: true,
      };
      const { req, res, getResult } = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(req, res);
      assert.equal(getResult().statusCode, 200);
      // Since cross-user sibling referenced EXCLUSIVE_HERO_URL and shared store was preserved, 0 assets removed
      assert.equal(storageDeleteRequests.length, 0);
      crossUserSiblingSite = null;
      customRpcResultOverride = null;
    });

    await check('2.15 Malformed or ambiguous rpcResult skips Storage cleanup completely and returns storageCleanupWarning', async () => {
      const malformedPayloads: Array<Record<string, unknown>> = [
        {
          success: true,
          code: 'DELETED',
          deletedWebsiteId: WEBSITE_UUID,
          deletedStoreId: 'not-a-valid-uuid',
          isSharedStore: false,
        },
        {
          success: true,
          code: 'DELETED',
          deletedWebsiteId: WEBSITE_UUID,
          deletedStoreId: STORE_UUID,
          isSharedStore: true, // inconsistent!
        },
        {
          success: true,
          code: 'DELETED',
          deletedWebsiteId: WEBSITE_UUID,
          deletedStoreId: null,
          // missing isSharedStore boolean
        },
        {
          success: true,
          code: 'DELETED',
          deletedWebsiteId: SIBLING_SITE_UUID, // mismatched website id!
          deletedStoreId: STORE_UUID,
          isSharedStore: false,
        },
      ];

      for (const payload of malformedPayloads) {
        storageDeleteRequests = [];
        storageListRequests = [];
        customRpcResultOverride = payload;
        const { req, res, getResult } = makeMockReqRes({
          origin: 'https://app.amaas.xyz',
          authorization: `Bearer ${adminToken}`,
          body: {
            action: 'delete',
            websiteId: WEBSITE_UUID,
            confirmSubdomain: 'fortyninee',
            explicitConfirmed: true,
          },
        });
        await adminWebsiteActionHandler(req, res);
        const out = getResult();
        assert.equal(out.statusCode, 200);
        assert.equal(out.json?.storageCleanupSkipped, true);
        assert.equal(out.json?.deletedStorageObjects, 0);
        assert.ok(typeof out.json?.storageCleanupWarning === 'string' && out.json.storageCleanupWarning.length > 10);
        assert.equal(storageDeleteRequests.length, 0);
        assert.equal(storageListRequests.length, 0);
      }
      customRpcResultOverride = null;
    });

    await check('2.16 Partial Storage failure returns 200 post-commit with storageCleanupWarning', async () => {
      storageDeleteRequests = [];
      forceStorageDeleteFail = true;
      const { req, res, getResult } = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(req, res);
      const out = getResult();
      assert.equal(out.statusCode, 200);
      assert.equal(out.json?.ok, true);
      assert.equal(out.json?.deletedStorageObjects, 0);
      assert.ok(typeof out.json?.storageCleanupWarning === 'string' && out.json.storageCleanupWarning.length > 10);
      forceStorageDeleteFail = false;
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.VITE_SUPABASE_URL = prevEnv.VITE_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = prevEnv.SUPABASE_SERVICE_ROLE_KEY;
    process.env.VITE_SUPABASE_ANON_KEY = prevEnv.VITE_SUPABASE_ANON_KEY;
    process.env.UPSTASH_REDIS_REST_URL = prevEnv.UPSTASH_REDIS_REST_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = prevEnv.UPSTASH_REDIS_REST_TOKEN;
    process.env.NODE_ENV = prevEnv.NODE_ENV;
  }

  // =========================================================================
  // PART 3: ISOLATED IN-MEMORY POSTGRES (PGlite) LIFECYCLE & ATOMIC DELETE
  // =========================================================================
  // Loads the local reviewed migration file (/proposed_migrations/20261122_admin_permanent_website_deletion.sql)
  // completely in-memory (NEVER touches production Supabase or files inside supabase/).
  console.log('\n[3] Running isolated in-memory PGlite lifecycle, trigger & atomic permanent-delete verification...');

  const PROPOSED_PERMANENT_DELETE_SQL = fs.readFileSync(
    path.join(root, 'proposed_migrations/20261122_admin_permanent_website_deletion.sql'),
    'utf8'
  );

  const db = new PGlite();
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role BYPASSRLS; ELSE ALTER ROLE service_role BYPASSRLS; END IF;
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

  const setDbSession = async (
    userId: string | null,
    email: string | null,
    role: 'anon' | 'authenticated' | 'service_role' | 'postgres'
  ) => {
    await db.exec('RESET ROLE;');
    await db.exec(`
      UPDATE public._test_session
      SET current_user_id = ${userId ? `'${userId}'::uuid` : 'NULL'},
          current_email = ${email ? `'${email}'` : 'NULL'},
          session_role = '${role}';
      SELECT set_config('request.jwt.claim.role', '${role}', false);
      SELECT set_config('request.jwt.claim.sub', ${userId ? `'${userId}'` : "''"}, false);
      SELECT set_config('request.jwt.claims', json_build_object('sub', ${userId ? `'${userId}'` : 'NULL'}, 'role', '${role}')::text, false);
    `);
    if (role === 'anon' || role === 'authenticated' || role === 'service_role') {
      await db.exec(`SET ROLE ${role};`);
    }
  };

  const baseSchemaSql = fs
    .readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
  const migration20261029Sql = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261029_website_builder_storage_and_autopublish.sql'),
    'utf8'
  );
  await db.exec(baseSchemaSql);
  await db.exec(migration20261029Sql);
  // Revoke PGlite default privileges on orders, customers, inventory_movements from service_role BEFORE
  // applying the reviewed migration so Fix 3's least-privilege SELECT grants are genuinely tested!
  await db.exec(`
    REVOKE ALL ON TABLE public.orders FROM service_role;
    REVOKE ALL ON TABLE public.customers FROM service_role;
    REVOKE ALL ON TABLE public.inventory_movements FROM service_role;
  `);
  await db.exec(PROPOSED_PERMANENT_DELETE_SQL);

  const DB_ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const DB_SECONDARY_ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99';
  const DB_MERCH_A = '11111111-1111-4111-8111-111111111111';
  const DB_CUST_A = '11111111-1111-4111-8111-111111111999';
  const DB_MERCH_B = '22222222-2222-4222-8222-222222222222';
  const DB_MERCH_C = '33333333-3333-4333-8333-333333333333';

  await setDbSession(null, null, 'postgres');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${DB_ADMIN}', 'official.amaas.dev@gmail.com'),
      ('${DB_SECONDARY_ADMIN}', 'spoofed.admin@amaas.test'),
      ('${DB_MERCH_A}', 'merchant.a@amaas.test'),
      ('${DB_CUST_A}', 'google.customer@amaas.test'),
      ('${DB_MERCH_B}', 'merchant.b@amaas.test'),
      ('${DB_MERCH_C}', 'merchant.c@amaas.test');

    INSERT INTO public.profiles (id, email, full_name, role) VALUES
      ('${DB_ADMIN}', 'official.amaas.dev@gmail.com', 'Platform Admin', 'admin'),
      ('${DB_SECONDARY_ADMIN}', 'spoofed.admin@amaas.test', 'Spoofed Secondary Admin', 'admin'),
      ('${DB_MERCH_A}', 'merchant.a@amaas.test', 'Merchant A', 'merchant'),
      ('${DB_CUST_A}', 'google.customer@amaas.test', 'Storefront Customer', 'merchant'),
      ('${DB_MERCH_B}', 'merchant.b@amaas.test', 'Merchant B', 'merchant'),
      ('${DB_MERCH_C}', 'merchant.c@amaas.test', 'Merchant C', 'merchant')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, email = EXCLUDED.email;
  `);

  const storeAId = (
    await db.query<{ id: string }>(
      `INSERT INTO public.stores (owner_id, name, slug, category, currency) VALUES ('${DB_MERCH_A}', 'Alpha Store', 'alpha-store', 'Fashion', '৳') RETURNING id;`
    )
  ).rows[0].id;
  const storeBId = (
    await db.query<{ id: string }>(
      `INSERT INTO public.stores (owner_id, name, slug, category, currency) VALUES ('${DB_MERCH_B}', 'Beta Store', 'beta-store', 'Electronics', '৳') RETURNING id;`
    )
  ).rows[0].id;
  const storeSharedId = (
    await db.query<{ id: string }>(
      `INSERT INTO public.stores (owner_id, name, slug, category, currency) VALUES ('${DB_MERCH_C}', 'Shared Store', 'shared-store', 'Retail', '৳') RETURNING id;`
    )
  ).rows[0].id;

  await db.exec(`
    UPDATE public.profiles SET store_id = '${storeAId}' WHERE id = '${DB_MERCH_A}';
    UPDATE public.profiles SET store_id = '${storeBId}' WHERE id = '${DB_MERCH_B}';
    UPDATE public.profiles SET store_id = '${storeSharedId}' WHERE id = '${DB_MERCH_C}';
  `);

  await setDbSession(DB_MERCH_A, 'merchant.a@amaas.test', 'authenticated');
  await db.exec(`
    INSERT INTO public.store_members (store_id, user_id, name, email, role, status) VALUES
      ('${storeAId}', '${DB_MERCH_A}', 'Merchant A Owner', 'merchant.a@amaas.test', 'owner', 'active'),
      ('${storeAId}', NULL, 'Alpha Staff', 'staff@alpha.test', 'staff', 'invited');
  `);

  await setDbSession(DB_MERCH_B, 'merchant.b@amaas.test', 'authenticated');
  await db.exec(`
    INSERT INTO public.store_members (store_id, user_id, name, email, role, status) VALUES
      ('${storeBId}', '${DB_MERCH_B}', 'Merchant B Owner', 'merchant.b@amaas.test', 'owner', 'active');
  `);

  await setDbSession(null, null, 'postgres');

  const siteAId = (
    await db.query<{ id: string }>(`
      INSERT INTO public.subscribed_websites (
        user_id, store_id, business_name, niche, subdomain, full_domain,
        template_id, template_name, status, payment_status, deployment_status,
        current_period_end, grace_period_end
      ) VALUES (
        '${DB_MERCH_A}', '${storeAId}', 'Alpha Shop', 'ecommerce', 'alpha-shop', 'alpha-shop.amaas.xyz',
        't1', 'Modern', 'active', 'paid', 'live',
        NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days'
      ) RETURNING id;
    `)
  ).rows[0].id;

  const siteBId = (
    await db.query<{ id: string }>(`
      INSERT INTO public.subscribed_websites (
        user_id, store_id, business_name, niche, subdomain, full_domain,
        template_id, template_name, status, payment_status, deployment_status,
        current_period_end, grace_period_end
      ) VALUES (
        '${DB_MERCH_B}', '${storeBId}', 'Beta Shop', 'ecommerce', 'beta-shop', 'beta-shop.amaas.xyz',
        't1', 'Modern', 'active', 'paid', 'live',
        NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days'
      ) RETURNING id;
    `)
  ).rows[0].id;

  const siteShared1Id = (
    await db.query<{ id: string }>(`
      INSERT INTO public.subscribed_websites (
        user_id, store_id, business_name, niche, subdomain, full_domain,
        template_id, template_name, status, payment_status, deployment_status,
        current_period_end, grace_period_end
      ) VALUES (
        '${DB_MERCH_C}', '${storeSharedId}', 'Shared One', 'ecommerce', 'shared-one', 'shared-one.amaas.xyz',
        't1', 'Modern', 'active', 'paid', 'live',
        NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days'
      ) RETURNING id;
    `)
  ).rows[0].id;

  const siteShared2Id = (
    await db.query<{ id: string }>(`
      INSERT INTO public.subscribed_websites (
        user_id, store_id, business_name, niche, subdomain, full_domain,
        template_id, template_name, status, payment_status, deployment_status,
        current_period_end, grace_period_end
      ) VALUES (
        '${DB_MERCH_C}', '${storeSharedId}', 'Shared Two', 'ecommerce', 'shared-two', 'shared-two.amaas.xyz',
        't1', 'Modern', 'active', 'paid', 'live',
        NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days'
      ) RETURNING id;
    `)
  ).rows[0].id;

  const prodAId = (
    await db.query<{ id: string }>(`
      INSERT INTO public.products (store_id, website_id, name, sku, price, stock)
      VALUES ('${storeAId}', '${siteAId}', 'Alpha Tee', 'ALPHA-1', 500, 10)
      RETURNING id;
    `)
  ).rows[0].id;
  const prodBId = (
    await db.query<{ id: string }>(`
      INSERT INTO public.products (store_id, website_id, name, sku, price, stock)
      VALUES ('${storeBId}', '${siteBId}', 'Beta Laptop', 'BETA-1', 50000, 3)
      RETURNING id;
    `)
  ).rows[0].id;
  await db.exec(`
    INSERT INTO public.products (store_id, website_id, name, sku, price, stock)
    VALUES ('${storeSharedId}', '${siteShared1Id}', 'Shared Item', 'SHARED-1', 1200, 8);

    INSERT INTO public.inventory_movements (store_id, product_id, product_name, type, quantity_change, new_stock, reason)
    VALUES
      ('${storeAId}', '${prodAId}', 'Alpha Tee', 'restock', 10, 10, 'Initial stock'),
      ('${storeBId}', '${prodBId}', 'Beta Laptop', 'restock', 3, 3, 'Initial stock');

    INSERT INTO public.customers (store_id, name, phone, email)
    VALUES
      ('${storeAId}', 'Alpha Customer', '01711111111', 'google.customer@amaas.test'),
      ('${storeBId}', 'Beta Customer', '01722222222', 'beta.customer@amaas.test'),
      ('${storeSharedId}', 'Shared Customer', '01733333333', 'shared.customer@amaas.test');

    INSERT INTO public.orders (store_id, order_number, customer_name, customer_phone, address, city, total, subtotal, items)
    VALUES
      ('${storeAId}', 'ORD-ALPHA-1', 'Alpha Customer', '01711111111', 'Dhaka', 'Dhaka', 500, 500, '[{"name":"Alpha Tee","qty":1}]'::jsonb),
      ('${storeBId}', 'ORD-BETA-1', 'Beta Customer', '01722222222', 'Chattogram', 'Chattogram', 50000, 50000, '[{"name":"Beta Laptop","qty":1}]'::jsonb),
      ('${storeSharedId}', 'ORD-SHARED-1', 'Shared Customer', '01733333333', 'Sylhet', 'Sylhet', 1200, 1200, '[{"name":"Shared Item","qty":1}]'::jsonb);

    INSERT INTO public.service_trials (user_id, store_id, service_id, service_name, service_category)
    VALUES ('${DB_MERCH_A}', '${storeAId}', 'dashboard_pro', 'Dashboard Pro', 'dashboard');

    INSERT INTO public.payment_requests (
      user_id, store_id, customer_name, customer_phone, customer_email,
      service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, status
    ) VALUES
      ('${DB_MERCH_A}', '${storeAId}', 'Merchant A', '01711111111', 'merchant.a@amaas.test',
       'website_subscription', '${siteAId}', 'Alpha Shop', 'AMAAS Website Lite', 600, 'bKash', 'TRX-ALPHA-001', 'approved'),
      ('${DB_MERCH_B}', '${storeBId}', 'Merchant B', '01722222222', 'merchant.b@amaas.test',
       'website_subscription', '${siteBId}', 'Beta Shop', 'AMAAS Website Lite', 600, 'bKash', 'TRX-BETA-001', 'approved');
  `);

  await check('3.1 DB SUSPEND preserves all merchant business data and blocks merchant republish bypass', async () => {
    await setDbSession(DB_ADMIN, 'official.amaas.dev@gmail.com', 'authenticated');
    const suspRes = await db.query<{ res: { success: boolean; status: string } }>(
      `SELECT public.admin_update_website_lifecycle('${siteAId}'::uuid, 'suspend', 'Audit hold') AS res;`
    );
    assert.equal(suspRes.rows[0].res.success, true);
    assert.equal(suspRes.rows[0].res.status, 'suspended');

    await setDbSession(DB_MERCH_A, 'merchant.a@amaas.test', 'authenticated');
    let publishBlocked = false;
    try {
      const pubRes = await db.query<{ res: { success: boolean } }>(
        `SELECT public.publish_client_website('${siteAId}'::uuid) AS res;`
      );
      publishBlocked = pubRes.rows[0]?.res?.success === false;
    } catch {
      publishBlocked = true;
    }
    assert.equal(publishBlocked, true);

    await setDbSession(null, null, 'service_role');
    const counts = await db.query<{
      stores: string;
      products: string;
      inventory: string;
      customers: string;
      orders: string;
      members: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM public.stores WHERE id = '${storeAId}') AS stores,
        (SELECT COUNT(*) FROM public.products WHERE store_id = '${storeAId}') AS products,
        (SELECT COUNT(*) FROM public.inventory_movements WHERE store_id = '${storeAId}') AS inventory,
        (SELECT COUNT(*) FROM public.customers WHERE store_id = '${storeAId}') AS customers,
        (SELECT COUNT(*) FROM public.orders WHERE store_id = '${storeAId}') AS orders,
        (SELECT COUNT(*) FROM public.store_members WHERE store_id = '${storeAId}') AS members;
    `);
    assert.equal(Number(counts.rows[0].stores), 1);
    assert.equal(Number(counts.rows[0].products), 1);
    assert.equal(Number(counts.rows[0].inventory), 1);
    assert.equal(Number(counts.rows[0].customers), 1);
    assert.equal(Number(counts.rows[0].orders), 1);
    assert.equal(Number(counts.rows[0].members), 2);
  });

  await check('3.2 DB REACTIVATE restores original live website and keeps all original data intact', async () => {
    await setDbSession(DB_ADMIN, 'official.amaas.dev@gmail.com', 'authenticated');
    const reactRes = await db.query<{ res: { success: boolean; status: string; deploymentStatus: string } }>(
      `SELECT public.admin_update_website_lifecycle('${siteAId}'::uuid, 'reactivate', 'Cleared review') AS res;`
    );
    assert.equal(reactRes.rows[0].res.success, true);
    assert.equal(reactRes.rows[0].res.status, 'active');
    assert.equal(reactRes.rows[0].res.deploymentStatus, 'live');
  });

  await check('3.3 DB Fix 5: Strict admin & parameter verification rejects anon, authenticated, NULL args, and spoofed non-primary admins', async () => {
    await setDbSession(null, null, 'anon');
    let anonFailed = false;
    try {
      await db.query(
        `SELECT public.admin_permanently_delete_website('${siteAId}'::uuid, '${DB_ADMIN}'::uuid, 'alpha-shop', 'hack');`
      );
    } catch {
      anonFailed = true;
    }
    assert.equal(anonFailed, true);

    await setDbSession(DB_MERCH_A, 'merchant.a@amaas.test', 'authenticated');
    let merchantFailed = false;
    try {
      await db.query(
        `SELECT public.admin_permanently_delete_website('${siteAId}'::uuid, '${DB_ADMIN}'::uuid, 'alpha-shop', 'hack');`
      );
    } catch {
      merchantFailed = true;
    }
    assert.equal(merchantFailed, true);

    await setDbSession(null, null, 'service_role');
    let forgedNonAdminFailed = false;
    try {
      await db.query(
        `SELECT public.admin_permanently_delete_website('${siteAId}'::uuid, '${DB_MERCH_A}'::uuid, 'alpha-shop', 'forged');`
      );
    } catch {
      forgedNonAdminFailed = true;
    }
    assert.equal(forgedNonAdminFailed, true);

    let secondaryAdminFailed = false;
    try {
      await db.query(
        `SELECT public.admin_permanently_delete_website('${siteAId}'::uuid, '${DB_SECONDARY_ADMIN}'::uuid, 'alpha-shop', 'spoofed email');`
      );
    } catch {
      secondaryAdminFailed = true;
    }
    assert.equal(secondaryAdminFailed, true);

    let nullAdminFailed = false;
    try {
      await db.query(
        `SELECT public.admin_permanently_delete_website('${siteAId}'::uuid, NULL, 'alpha-shop', 'null admin');`
      );
    } catch {
      nullAdminFailed = true;
    }
    assert.equal(nullAdminFailed, true);

    let nullWebsiteFailed = false;
    try {
      await db.query(
        `SELECT public.admin_permanently_delete_website(NULL, '${DB_ADMIN}'::uuid, 'alpha-shop', 'null website');`
      );
    } catch {
      nullWebsiteFailed = true;
    }
    assert.equal(nullWebsiteFailed, true);
  });

  await check('3.4 DB transaction rolls back completely on simulated failure (zero partial deletes)', async () => {
    await setDbSession(null, null, 'postgres');
    await db.exec(`
      CREATE OR REPLACE FUNCTION public._test_fail_store_delete()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Simulated mid-transaction failure during store delete';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_test_fail_store_delete
        BEFORE DELETE ON public.stores
        FOR EACH ROW EXECUTE FUNCTION public._test_fail_store_delete();
    `);

    await setDbSession(null, null, 'service_role');
    let threw = false;
    try {
      await db.query(
        `SELECT public.admin_permanently_delete_website('${siteAId}'::uuid, '${DB_ADMIN}'::uuid, 'alpha-shop', 'Rollback test');`
      );
    } catch {
      threw = true;
    }
    assert.equal(threw, true);

    const intact = await db.query<{ site_cnt: string; store_cnt: string; del_audit_cnt: string }>(`
      SELECT
        (SELECT COUNT(*) FROM public.subscribed_websites WHERE id = '${siteAId}') AS site_cnt,
        (SELECT COUNT(*) FROM public.stores WHERE id = '${storeAId}') AS store_cnt,
        (SELECT COUNT(*) FROM public.website_lifecycle_audit_logs WHERE website_id = '${siteAId}' AND action = 'delete') AS del_audit_cnt;
    `);
    assert.equal(Number(intact.rows[0].site_cnt), 1);
    assert.equal(Number(intact.rows[0].store_cnt), 1);
    assert.equal(Number(intact.rows[0].del_audit_cnt), 0);

    await setDbSession(null, null, 'postgres');
    await db.exec(`
      DROP TRIGGER IF EXISTS trg_test_fail_store_delete ON public.stores;
      DROP FUNCTION IF EXISTS public._test_fail_store_delete();
    `);
  });

  await check('3.5 DB Fix 3 (Least-Privilege) & atomic permanent delete remove exclusive Alpha data while keeping Merchant B, users, payments & audit logs', async () => {
    // Confirm service_role holds ONLY SELECT (not INSERT/UPDATE/DELETE) on orders, customers, inventory_movements
    await setDbSession(null, null, 'postgres');
    const privRes = await db.query<{
      ord_sel: boolean;
      ord_del: boolean;
      cust_sel: boolean;
      cust_del: boolean;
      inv_sel: boolean;
      inv_del: boolean;
    }>(`
      SELECT
        has_table_privilege('service_role', 'public.orders', 'SELECT') AS ord_sel,
        has_table_privilege('service_role', 'public.orders', 'DELETE') AS ord_del,
        has_table_privilege('service_role', 'public.customers', 'SELECT') AS cust_sel,
        has_table_privilege('service_role', 'public.customers', 'DELETE') AS cust_del,
        has_table_privilege('service_role', 'public.inventory_movements', 'SELECT') AS inv_sel,
        has_table_privilege('service_role', 'public.inventory_movements', 'DELETE') AS inv_del;
    `);
    assert.equal(privRes.rows[0].ord_sel, true);
    assert.equal(privRes.rows[0].ord_del, false);
    assert.equal(privRes.rows[0].cust_sel, true);
    assert.equal(privRes.rows[0].cust_del, false);
    assert.equal(privRes.rows[0].inv_sel, true);
    assert.equal(privRes.rows[0].inv_del, false);

    await setDbSession(null, null, 'service_role');
    const delRes = await db.query<{
      res: {
        success: boolean;
        code: string;
        deletedWebsiteId: string;
        deletedStoreId: string;
        isSharedStore: boolean;
        deletedCounts: {
          products: number;
          inventoryMovements: number;
          customers: number;
          orders: number;
          storeMembers: number;
        };
      };
    }>(
      `SELECT public.admin_permanently_delete_website('${siteAId}'::uuid, '${DB_ADMIN}'::uuid, 'alpha-shop', 'Permanent termination verified') AS res;`
    );
    const out = delRes.rows[0].res;
    assert.equal(out.success, true);
    assert.equal(out.code, 'DELETED');
    assert.equal(out.deletedWebsiteId, siteAId);
    assert.equal(out.deletedStoreId, storeAId);
    assert.equal(out.isSharedStore, false);
    assert.equal(out.deletedCounts.products, 1);
    assert.equal(out.deletedCounts.inventoryMovements, 1);
    assert.equal(out.deletedCounts.customers, 1);
    assert.equal(out.deletedCounts.orders, 1);
    assert.equal(out.deletedCounts.storeMembers, 2);

    const alphaGone = await db.query<{
      websites: string;
      stores: string;
      products: string;
      inventory: string;
      customers: string;
      orders: string;
      members: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM public.subscribed_websites WHERE id = '${siteAId}') AS websites,
        (SELECT COUNT(*) FROM public.stores WHERE id = '${storeAId}') AS stores,
        (SELECT COUNT(*) FROM public.products WHERE store_id = '${storeAId}') AS products,
        (SELECT COUNT(*) FROM public.inventory_movements WHERE store_id = '${storeAId}') AS inventory,
        (SELECT COUNT(*) FROM public.customers WHERE store_id = '${storeAId}') AS customers,
        (SELECT COUNT(*) FROM public.orders WHERE store_id = '${storeAId}') AS orders,
        (SELECT COUNT(*) FROM public.store_members WHERE store_id = '${storeAId}') AS members;
    `);
    assert.equal(Number(alphaGone.rows[0].websites), 0);
    assert.equal(Number(alphaGone.rows[0].stores), 0);
    assert.equal(Number(alphaGone.rows[0].products), 0);
    assert.equal(Number(alphaGone.rows[0].inventory), 0);
    assert.equal(Number(alphaGone.rows[0].customers), 0);
    assert.equal(Number(alphaGone.rows[0].orders), 0);
    assert.equal(Number(alphaGone.rows[0].members), 0);

    await setDbSession(null, null, 'postgres');
    const retained = await db.query<{
      auth_users: string;
      profiles: string;
      merch_a_store_id: string | null;
      alpha_payments: string;
      alpha_payment_store_id: string | null;
      alpha_trials: string;
      delete_audits: string;
      beta_stores: string;
      beta_websites: string;
      beta_products: string;
      beta_orders: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM auth.users WHERE id IN ('${DB_MERCH_A}', '${DB_CUST_A}')) AS auth_users,
        (SELECT COUNT(*) FROM public.profiles WHERE id IN ('${DB_MERCH_A}', '${DB_CUST_A}')) AS profiles,
        (SELECT store_id::text FROM public.profiles WHERE id = '${DB_MERCH_A}') AS merch_a_store_id,
        (SELECT COUNT(*) FROM public.payment_requests WHERE service_id = '${siteAId}') AS alpha_payments,
        (SELECT store_id::text FROM public.payment_requests WHERE service_id = '${siteAId}' LIMIT 1) AS alpha_payment_store_id,
        (SELECT COUNT(*) FROM public.service_trials WHERE user_id = '${DB_MERCH_A}') AS alpha_trials,
        (SELECT COUNT(*) FROM public.website_lifecycle_audit_logs WHERE website_id = '${siteAId}' AND action = 'delete') AS delete_audits,
        (SELECT COUNT(*) FROM public.stores WHERE id = '${storeBId}') AS beta_stores,
        (SELECT COUNT(*) FROM public.subscribed_websites WHERE id = '${siteBId}') AS beta_websites,
        (SELECT COUNT(*) FROM public.products WHERE store_id = '${storeBId}') AS beta_products,
        (SELECT COUNT(*) FROM public.orders WHERE store_id = '${storeBId}') AS beta_orders;
    `);
    assert.equal(Number(retained.rows[0].auth_users), 2);
    assert.equal(Number(retained.rows[0].profiles), 2);
    assert.equal(retained.rows[0].merch_a_store_id, null);
    assert.equal(Number(retained.rows[0].alpha_payments), 1);
    assert.equal(retained.rows[0].alpha_payment_store_id, null);
    assert.equal(Number(retained.rows[0].alpha_trials), 1);
    assert.equal(Number(retained.rows[0].delete_audits), 1);
    assert.equal(Number(retained.rows[0].beta_stores), 1);
    assert.equal(Number(retained.rows[0].beta_websites), 1);
    assert.equal(Number(retained.rows[0].beta_products), 1);
    assert.equal(Number(retained.rows[0].beta_orders), 1);
  });

  await check('3.6 DB shared store protection preserves shared store, products, and sibling website when deleting shared-one', async () => {
    await setDbSession(null, null, 'service_role');
    const sharedRes = await db.query<{
      res: {
        success: boolean;
        deletedWebsiteId: string;
        deletedStoreId: string | null;
        isSharedStore: boolean;
      };
    }>(
      `SELECT public.admin_permanently_delete_website('${siteShared1Id}'::uuid, '${DB_ADMIN}'::uuid, 'shared-one', 'Delete one site sharing a store') AS res;`
    );
    const out = sharedRes.rows[0].res;
    assert.equal(out.success, true);
    assert.equal(out.deletedWebsiteId, siteShared1Id);
    assert.equal(out.deletedStoreId, null);
    assert.equal(out.isSharedStore, true);

    const sharedSurvived = await db.query<{
      site1: string;
      site2: string;
      shared_store: string;
      shared_products: string;
      shared_orders: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM public.subscribed_websites WHERE id = '${siteShared1Id}') AS site1,
        (SELECT COUNT(*) FROM public.subscribed_websites WHERE id = '${siteShared2Id}') AS site2,
        (SELECT COUNT(*) FROM public.stores WHERE id = '${storeSharedId}') AS shared_store,
        (SELECT COUNT(*) FROM public.products WHERE store_id = '${storeSharedId}') AS shared_products,
        (SELECT COUNT(*) FROM public.orders WHERE store_id = '${storeSharedId}') AS shared_orders;
    `);
    assert.equal(Number(sharedSurvived.rows[0].site1), 0);
    assert.equal(Number(sharedSurvived.rows[0].site2), 1);
    assert.equal(Number(sharedSurvived.rows[0].shared_store), 1);
    assert.equal(Number(sharedSurvived.rows[0].shared_products), 1);
    assert.equal(Number(sharedSurvived.rows[0].shared_orders), 1);
  });

  await check('3.7 DB Fix 2: Hardened protect_payment_request_integrity() blocks rogue FK-bypass and preserves payment approval/rejection', async () => {
    await setDbSession(null, null, 'postgres');
    const dummyStoreId = (
      await db.query<{ id: string }>(
        `INSERT INTO public.stores (owner_id, name, slug, category, currency) VALUES ('${DB_MERCH_A}', 'PayGuard Store', 'payguard-store', 'General', '৳') RETURNING id;`
      )
    ).rows[0].id;
    const payGuardPrId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, status
        ) VALUES (
          '${DB_MERCH_B}', '${storeBId}', 'Merchant B', '01722222222', 'merchant.b@amaas.test',
          'website_subscription', '${siteBId}', 'Beta Shop', 'AMAAS Website Lite', 600, 'bKash', 'TRX-GUARD-PENDING', 'pending'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // 1. Rogue SECURITY DEFINER function owned by table owner invoked by authenticated cannot spoof store_id = NULL even if parent store absent
    await db.exec(`
      CREATE OR REPLACE FUNCTION public._test_rogue_null_store(p_pr_id UUID)
      RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN
        UPDATE public.payment_requests SET store_id = NULL WHERE id = p_pr_id;
      END;
      $$;
      GRANT EXECUTE ON FUNCTION public._test_rogue_null_store(UUID) TO authenticated;
    `);
    await db.exec(`DELETE FROM public.stores WHERE id = '${dummyStoreId}';`);

    const orphanStorePrId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, status
        ) VALUES (
          '${DB_MERCH_B}', '${storeBId}', 'Merchant B', '01722222222', 'merchant.b@amaas.test',
          'dashboard_plan', 'dashboard_pro', 'Dashboard Pro', 'Pro', 999, 'Nagad', 'TRX-ROGUE-PR', 'pending'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // Bypass FK temporarily? Test both direct authenticated attack AND rogue SECURITY DEFINER attack (even with auth.uid() null inside authenticated/anon context)
    await setDbSession(DB_MERCH_B, 'merchant.b@amaas.test', 'authenticated');
    let directNullBlocked = false;
    try {
      await db.query(`UPDATE public.payment_requests SET store_id = NULL WHERE id = '${orphanStorePrId}';`);
    } catch {
      directNullBlocked = true;
    }
    assert.equal(directNullBlocked, true);

    await setDbSession(null, null, 'authenticated');
    let rogueDefinerBlocked = false;
    try {
      await db.query(`SELECT public._test_rogue_null_store('${orphanStorePrId}'::uuid);`);
    } catch {
      rogueDefinerBlocked = true;
    }
    assert.equal(rogueDefinerBlocked, true);

    // 2. Verify existing admin_approve_payment_request & admin_reject_payment_request still work
    await setDbSession(DB_ADMIN, 'official.amaas.dev@gmail.com', 'authenticated');
    const approveRes = await db.query<{ res: { success: boolean; code: string } }>(
      `SELECT public.admin_approve_payment_request('${payGuardPrId}'::uuid, 'Verified still works') AS res;`
    );
    assert.equal(approveRes.rows[0].res.success, true);
    assert.equal(approveRes.rows[0].res.code, 'APPROVED');

    const rejectRes = await db.query<{ res: { success: boolean; code: string } }>(
      `SELECT public.admin_reject_payment_request('${orphanStorePrId}'::uuid, 'Rejected cleanly') AS res;`
    );
    assert.equal(rejectRes.rows[0].res.success, true);
    assert.equal(rejectRes.rows[0].res.code, 'REJECTED');

    await setDbSession(null, null, 'postgres');
    await db.exec(`DROP FUNCTION IF EXISTS public._test_rogue_null_store(UUID);`);
  });

  await check('3.8 DB Fix 4: Dynamic function owner alignment matches public.payment_requests.relowner', async () => {
    await setDbSession(null, null, 'postgres');
    const ownerCheck = await db.query<{ mismatched: string }>(`
      SELECT COUNT(*) AS mismatched
      FROM pg_catalog.pg_proc p
      WHERE p.oid IN (
        'public.protect_store_membership()'::pg_catalog.regprocedure,
        'public.protect_payment_request_integrity()'::pg_catalog.regprocedure,
        'public.admin_permanently_delete_website(uuid, uuid, text, text)'::pg_catalog.regprocedure
      )
      AND p.proowner IS DISTINCT FROM (
        SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = 'public.payment_requests'::pg_catalog.regclass
      );
    `);
    assert.equal(Number(ownerCheck.rows[0].mismatched), 0);
  });

  await check('3.9 DB Fix 6: Multi-store merchant profile reassigns profiles.store_id to surviving active store when primary store is deleted', async () => {
    await setDbSession(null, null, 'postgres');
    const merchMultiId = '44444444-4444-4444-8444-444444444444';
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${merchMultiId}', 'multi@amaas.test');
      INSERT INTO public.profiles (id, email, full_name, role)
      VALUES ('${merchMultiId}', 'multi@amaas.test', 'Multi Merchant', 'merchant')
      ON CONFLICT (id) DO NOTHING;
    `);
    const survivingStoreId = (
      await db.query<{ id: string }>(
        `INSERT INTO public.stores (owner_id, name, slug, category, currency) VALUES ('${merchMultiId}', 'Surviving Store', 'surviving-store', 'Retail', '৳') RETURNING id;`
      )
    ).rows[0].id;
    const doomedStoreId = (
      await db.query<{ id: string }>(
        `INSERT INTO public.stores (owner_id, name, slug, category, currency) VALUES ('${merchMultiId}', 'Doomed Store', 'doomed-store', 'Retail', '৳') RETURNING id;`
      )
    ).rows[0].id;

    await db.exec(`UPDATE public.profiles SET store_id = '${doomedStoreId}' WHERE id = '${merchMultiId}';`);
    const doomedSiteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (
          user_id, store_id, business_name, niche, subdomain, full_domain,
          template_id, template_name, status, payment_status, deployment_status,
          current_period_end, grace_period_end
        ) VALUES (
          '${merchMultiId}', '${doomedStoreId}', 'Doomed Shop', 'ecommerce', 'doomed-shop', 'doomed-shop.amaas.xyz',
          't1', 'Modern', 'active', 'paid', 'live',
          NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days'
        ) RETURNING id;
      `)
    ).rows[0].id;

    await setDbSession(null, null, 'service_role');
    const delMulti = await db.query<{ res: { success: boolean; deletedStoreId: string } }>(
      `SELECT public.admin_permanently_delete_website('${doomedSiteId}'::uuid, '${DB_ADMIN}'::uuid, 'doomed-shop', 'Fix 6 test') AS res;`
    );
    assert.equal(delMulti.rows[0].res.success, true);
    assert.equal(delMulti.rows[0].res.deletedStoreId, doomedStoreId);

    await setDbSession(null, null, 'postgres');
    const profRow = await db.query<{ store_id: string | null }>(
      `SELECT store_id::text FROM public.profiles WHERE id = '${merchMultiId}';`
    );
    assert.equal(profRow.rows[0].store_id, survivingStoreId);
  });

  await check('3.10 DB Fix 7: NULL store_id deletes cleanly with 0 or exclusive website_id products, and fails closed when ambiguous/shared', async () => {
    await setDbSession(null, null, 'postgres');
    const nullEmptySiteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (
          user_id, store_id, business_name, niche, subdomain, full_domain,
          template_id, template_name, status, payment_status, deployment_status,
          current_period_end, grace_period_end
        ) VALUES (
          '${DB_MERCH_B}', NULL, 'Null Empty', 'ecommerce', 'null-empty', 'null-empty.amaas.xyz',
          't1', 'Modern', 'active', 'paid', 'live',
          NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days'
        ) RETURNING id;
      `)
    ).rows[0].id;

    const unlinkedExclusiveStoreId = (
      await db.query<{ id: string }>(
        `INSERT INTO public.stores (owner_id, name, slug, category, currency) VALUES ('${DB_MERCH_A}', 'Unlinked Store', 'unlinked-store', 'General', '৳') RETURNING id;`
      )
    ).rows[0].id;
    const nullWithProdSiteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (
          user_id, store_id, business_name, niche, subdomain, full_domain,
          template_id, template_name, status, payment_status, deployment_status,
          current_period_end, grace_period_end
        ) VALUES (
          '${DB_MERCH_A}', NULL, 'Null With Prods', 'ecommerce', 'null-prods', 'null-prods.amaas.xyz',
          't1', 'Modern', 'active', 'paid', 'live',
          NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days'
        ) RETURNING id;
      `)
    ).rows[0].id;
    const nullProdId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.products (store_id, website_id, name, sku, price, stock)
        VALUES ('${unlinkedExclusiveStoreId}', '${nullWithProdSiteId}', 'Orphan Proof', 'ORPH-1', 350, 4)
        RETURNING id;
      `)
    ).rows[0].id;

    // Ambiguous case: website_id points to a product in storeBId (shared/linked to siteBId) while site.store_id is NULL
    const nullAmbiguousSiteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (
          user_id, store_id, business_name, niche, subdomain, full_domain,
          template_id, template_name, status, payment_status, deployment_status,
          current_period_end, grace_period_end
        ) VALUES (
          '${DB_MERCH_B}', NULL, 'Null Ambiguous', 'ecommerce', 'null-ambig', 'null-ambig.amaas.xyz',
          't1', 'Modern', 'active', 'paid', 'live',
          NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days'
        ) RETURNING id;
      `)
    ).rows[0].id;
    await db.exec(`
      INSERT INTO public.products (store_id, website_id, name, sku, price, stock)
      VALUES ('${storeBId}', '${nullAmbiguousSiteId}', 'Shared Store Ambiguous Prod', 'AMBIG-1', 900, 2);
    `);

    await setDbSession(null, null, 'service_role');

    // Case A: NULL store_id, 0 products
    const resEmpty = await db.query<{ res: { success: boolean; deletedStoreId: string | null } }>(
      `SELECT public.admin_permanently_delete_website('${nullEmptySiteId}'::uuid, '${DB_ADMIN}'::uuid, 'null-empty', 'Null empty') AS res;`
    );
    assert.equal(resEmpty.rows[0].res.success, true);
    assert.equal(resEmpty.rows[0].res.deletedStoreId, null);

    // Case B: NULL store_id + exclusive website_id product -> deletes product cleanly, preserves unlinked store
    const resProd = await db.query<{ res: { success: boolean; deletedStoreId: string | null; deletedCounts: { products: number } } }>(
      `SELECT public.admin_permanently_delete_website('${nullWithProdSiteId}'::uuid, '${DB_ADMIN}'::uuid, 'null-prods', 'Null with exclusive products') AS res;`
    );
    assert.equal(resProd.rows[0].res.success, true);
    assert.equal(resProd.rows[0].res.deletedStoreId, null);
    assert.equal(resProd.rows[0].res.deletedCounts.products, 1);

    const checkOrphans = await db.query<{ prod_cnt: string; store_cnt: string }>(`
      SELECT
        (SELECT COUNT(*) FROM public.products WHERE id = '${nullProdId}') AS prod_cnt,
        (SELECT COUNT(*) FROM public.stores WHERE id = '${unlinkedExclusiveStoreId}') AS store_cnt;
    `);
    assert.equal(Number(checkOrphans.rows[0].prod_cnt), 0);
    assert.equal(Number(checkOrphans.rows[0].store_cnt), 1);

    // Case C: NULL store_id + ambiguous shared product -> fails closed!
    const resAmbig = await db.query<{ res: { success: boolean; code: string } }>(
      `SELECT public.admin_permanently_delete_website('${nullAmbiguousSiteId}'::uuid, '${DB_ADMIN}'::uuid, 'null-ambig', 'Should fail closed') AS res;`
    );
    assert.equal(resAmbig.rows[0].res.success, false);
    assert.equal(resAmbig.rows[0].res.code, 'AMBIGUOUS_NULL_STORE_PRODUCTS');

    const ambigSurvived = await db.query<{ site_cnt: string; prod_cnt: string }>(`
      SELECT
        (SELECT COUNT(*) FROM public.subscribed_websites WHERE id = '${nullAmbiguousSiteId}') AS site_cnt,
        (SELECT COUNT(*) FROM public.products WHERE website_id = '${nullAmbiguousSiteId}') AS prod_cnt;
    `);
    assert.equal(Number(ambigSurvived.rows[0].site_cnt), 1);
    assert.equal(Number(ambigSurvived.rows[0].prod_cnt), 1);
  });

  await check('3.11 DB Fix 8: Concurrent dual deletion returns NOT_FOUND cleanly and deadlock (40P01) rolls back atomically', async () => {
    // 1. Dual deletion on already-deleted siteAId returns clean NOT_FOUND
    await setDbSession(null, null, 'service_role');
    const secondDel = await db.query<{ res: { success: boolean; code: string } }>(
      `SELECT public.admin_permanently_delete_website('${siteAId}'::uuid, '${DB_ADMIN}'::uuid, 'alpha-shop', 'Concurrent second delete') AS res;`
    );
    assert.equal(secondDel.rows[0].res.success, false);
    assert.equal(secondDel.rows[0].res.code, 'NOT_FOUND');

    // 2. Deadlock (SQLSTATE 40P01) during deletion rolls back all subtransaction changes and returns CONCURRENT_MODIFICATION_RETRY
    await setDbSession(null, null, 'postgres');
    await db.exec(`
      CREATE OR REPLACE FUNCTION public._test_deadlock_store_delete()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Simulated deadlock conflict' USING ERRCODE = '40P01';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_test_deadlock_store_delete
        BEFORE DELETE ON public.stores
        FOR EACH ROW EXECUTE FUNCTION public._test_deadlock_store_delete();
    `);

    await setDbSession(null, null, 'service_role');
    const dlRes = await db.query<{ res: { success: boolean; code: string } }>(
      `SELECT public.admin_permanently_delete_website('${siteBId}'::uuid, '${DB_ADMIN}'::uuid, 'beta-shop', 'Deadlock rollback') AS res;`
    );
    assert.equal(dlRes.rows[0].res.success, false);
    assert.equal(dlRes.rows[0].res.code, 'CONCURRENT_MODIFICATION_RETRY');

    // Beta site + store + audit logs remain completely intact
    const betaIntact = await db.query<{ site_cnt: string; store_cnt: string; del_audit_cnt: string }>(`
      SELECT
        (SELECT COUNT(*) FROM public.subscribed_websites WHERE id = '${siteBId}') AS site_cnt,
        (SELECT COUNT(*) FROM public.stores WHERE id = '${storeBId}') AS store_cnt,
        (SELECT COUNT(*) FROM public.website_lifecycle_audit_logs WHERE website_id = '${siteBId}' AND action = 'delete') AS del_audit_cnt;
    `);
    assert.equal(Number(betaIntact.rows[0].site_cnt), 1);
    assert.equal(Number(betaIntact.rows[0].store_cnt), 1);
    assert.equal(Number(betaIntact.rows[0].del_audit_cnt), 0);

    await setDbSession(null, null, 'postgres');
    await db.exec(`
      DROP TRIGGER IF EXISTS trg_test_deadlock_store_delete ON public.stores;
      DROP FUNCTION IF EXISTS public._test_deadlock_store_delete();
    `);
  });

  await check('3.12 DB protect_store_membership() continues blocking client privilege escalation while allowing owner deletes', async () => {
    await setDbSession(DB_MERCH_A, 'merchant.a@amaas.test', 'authenticated');
    let crossTenantMemberBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.store_members (store_id, user_id, name, email, role, status)
        VALUES ('${storeBId}', '${DB_MERCH_A}', 'Attacker', 'attacker@amaas.test', 'admin', 'active');
      `);
    } catch {
      crossTenantMemberBlocked = true;
    }
    assert.equal(crossTenantMemberBlocked, true);
  });

  await db.close();
  console.log(`\nALL CHECKS PASSED (${passed}/${passed})`);
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});

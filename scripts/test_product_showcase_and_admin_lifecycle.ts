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
  ip?: string;
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
  req.socket = { remoteAddress: params.ip || '203.0.113.55' } as IncomingMessage['socket'];

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

  await check('2.2 AdminDashboardPage & AppContext wire View Details, Suspend/Reactivate, owner email/phone, inline feedback, retry cleanup queue, and synchronous double-click lock', () => {
    const supabaseLibSrc = fs.readFileSync(path.join(root, 'src/lib/supabase.ts'), 'utf8');
    // UI action labels & owner info in Permanent Delete modal
    assert.ok(adminPageSrc.includes('View Details'));
    assert.ok(adminPageSrc.includes('<span>Suspend</span>') || adminPageSrc.includes("'Suspending...'"));
    assert.ok(adminPageSrc.includes("'Reactivate'"));
    assert.ok(adminPageSrc.includes('Reactivate Website'));
    assert.ok(adminPageSrc.includes('Owner Email'));
    assert.ok(adminPageSrc.includes('Owner Phone'));
    assert.ok(adminPageSrc.includes('site.email'));
    assert.ok(adminPageSrc.includes('site.phone'));
    // Synchronous double-click / concurrency guard + inline feedback + retry queue
    assert.ok(adminPageSrc.includes('inFlightWebsiteActionIdsRef'));
    assert.ok(adminPageSrc.includes('websiteWorkflowFeedback'));
    assert.ok(adminPageSrc.includes('pendingStorageCleanups'));
    assert.ok(adminPageSrc.includes('handleRetryWebsiteStorageCleanup'));
    assert.ok(adminPageSrc.includes('Pending Storage Asset Cleanups'));
    // AppContext & Supabase client wrappers
    assert.ok(appCtxSrc.includes('retryWebsiteStorageCleanup'));
    assert.ok(appCtxSrc.includes('refreshPendingStorageCleanups'));
    assert.ok(appCtxSrc.includes('inFlightWebsiteDeletionIdsRef'));
    assert.ok(appCtxSrc.includes('AdminWebsiteDeleteResult'));
    assert.ok(supabaseLibSrc.includes('adminRetryWebsiteStorageCleanupInDb'));
    assert.ok(supabaseLibSrc.includes('fetchPendingWebsiteStorageCleanupsFromDb'));
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
  const SPOOFED_ADMIN_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb99';
  const spoofedAdminToken = buildFakeJwt({ sub: SPOOFED_ADMIN_UUID, aal: 'aal2' });

  let rpcInstalledInMock = true;
  let rpcHttpErrorOverride: { status: number; body: Record<string, unknown> } | null = null;
  let rpcThrowOverride: Error | null = null;
  let customRpcResultOverride: Record<string, unknown> | null = null;
  let forceStorageDeleteFail = false;
  let forceGlobalVerifyFail = false;
  let forceBatchConfirmVerifyFail = false;
  let adminFactorsOverride: Array<{ factor_type: string; status: string }> | null = null;
  let verifyCallCount = 0;
  let onBeforeBatchConfirmVerify: ((candidatePaths: string[], callNum: number) => void) | null = null;
  let simulateMissingLogoColumn = false;
  let targetStoreOrdersOverride: Array<{ id: string; items: unknown }> = [];
  let siblingOrdersOverride: Array<{ id: string; items: unknown }> = [];
  let siblingSiteConfigOverride: Record<string, unknown> | null = null;
  let globallyProtectedPathsMock = new Set<string>();
  let globallyAbortedPathsMock = new Set<string>();
  let mockCleanupJobState: {
    id: string;
    websiteId: string;
    ownerUserId: string;
    deletedStoreId: string | null;
    preservedStoreId?: string | null;
    isSharedStore: boolean;
    storePreserved?: boolean;
    cleanupStatus: string;
    cleanupObjectPaths: string[];
    preservedReferencePaths: string[];
    manualReviewPaths: string[];
    manualReviewRequired: boolean;
    deletedObjectPaths?: string[];
    failedObjectPaths: string[];
    deletedObjectsCount: number;
  } | null = null;
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
              factors: adminFactorsOverride ?? [{ factor_type: 'totp', status: 'verified' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (token === spoofedAdminToken) {
          return new Response(
            JSON.stringify({
              id: SPOOFED_ADMIN_UUID,
              email: 'spoofed.admin@amaas.test',
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
        if (url.includes(`id=eq.${ADMIN_UUID}`)) {
          return new Response(
            JSON.stringify([
              {
                id: ADMIN_UUID,
                email: 'official.amaas.dev@gmail.com',
                role: 'admin',
                avatar_url: null,
              },
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify([{ id: MERCHANT_UUID, avatar_url: null }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/rest/v1/stores') && method === 'GET') {
        if (simulateMissingLogoColumn) {
          return new Response(
            JSON.stringify({ code: '42703', message: 'column stores.logo_url does not exist' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/rest/v1/orders') && method === 'GET') {
        if (url.includes(`store_id=in.`)) {
          return new Response(JSON.stringify(siblingOrdersOverride), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(targetStoreOrdersOverride), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
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
                config: siblingSiteConfigOverride ?? { logoUrl: SHARED_IMAGE_URL },
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

      if (url.endsWith('/rest/v1/rpc/admin_verify_storage_paths_for_deletion') && method === 'POST') {
        verifyCallCount += 1;
        if (forceGlobalVerifyFail || (verifyCallCount > 1 && forceBatchConfirmVerifyFail)) {
          return new Response(JSON.stringify({ message: 'Transient RPC error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const rawCandidates = Array.isArray((parsedBody as { p_candidate_paths?: unknown[] })?.p_candidate_paths)
          ? ((parsedBody as { p_candidate_paths: string[] }).p_candidate_paths)
          : [];
        if (verifyCallCount > 1 && onBeforeBatchConfirmVerify) {
          onBeforeBatchConfirmVerify(rawCandidates, verifyCallCount);
        }
        const refPaths: string[] = [];
        const abortedPaths: string[] = [];
        const safePaths: string[] = [];
        for (const p of rawCandidates) {
          const lower = p.toLowerCase();
          if (globallyAbortedPathsMock.has(lower)) {
            abortedPaths.push(p);
            refPaths.push(p);
          } else if (globallyProtectedPathsMock.has(lower)) {
            refPaths.push(p);
          } else {
            safePaths.push(p);
          }
        }
        const reqToken = (parsedBody as { p_verification_token?: string })?.p_verification_token;
        return new Response(
          JSON.stringify({
            success: true,
            verificationToken: reqToken || '99999999-1111-4111-8111-999999999999',
            safeToDeletePaths: safePaths,
            referencedPaths: refPaths,
            abortedPaths,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/rest/v1/rpc/admin_get_website_storage_cleanup_job') && method === 'POST') {
        if (mockCleanupJobState) {
          return new Response(JSON.stringify({ success: true, job: mockCleanupJobState }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({ success: false, code: 'CLEANUP_JOB_NOT_FOUND' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/rest/v1/rpc/admin_get_pending_website_storage_cleanups') && method === 'POST') {
        return new Response(
          JSON.stringify({
            success: true,
            jobs: [
              mockCleanupJobState ?? {
                id: 'cleanup-job-1',
                websiteId: WEBSITE_UUID,
                ownerUserId: MERCHANT_UUID,
                deletedStoreId: STORE_UUID,
                isSharedStore: false,
                cleanupStatus: 'partial_failed',
                failedObjectPaths: [`${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/rest/v1/rpc/admin_record_website_storage_cleanup_result') && method === 'POST') {
        const pb = (parsedBody || {}) as {
          p_status?: string;
          p_deleted_count?: number;
          p_deleted_paths?: string[];
          p_failed_paths?: string[];
          p_manual_review_paths?: string[] | null;
        };
        if (mockCleanupJobState) {
          const nextManual = Array.isArray(pb.p_manual_review_paths)
            ? pb.p_manual_review_paths
            : mockCleanupJobState.manualReviewPaths;
          const prevDeleted = Array.isArray(mockCleanupJobState.deletedObjectPaths)
            ? mockCleanupJobState.deletedObjectPaths
            : [];
          const prevDeletedLower = new Set(prevDeleted.map((p) => p.toLowerCase()));
          let addedCount = 0;
          const nextDeleted = [...prevDeleted];
          if (Array.isArray(pb.p_deleted_paths) && pb.p_deleted_paths.length > 0) {
            for (const dp of pb.p_deleted_paths) {
              const lower = String(dp).toLowerCase();
              if (!prevDeletedLower.has(lower)) {
                prevDeletedLower.add(lower);
                nextDeleted.push(dp);
                addedCount += 1;
              }
            }
          } else {
            addedCount = Number(pb.p_deleted_count || 0);
          }
          mockCleanupJobState = {
            ...mockCleanupJobState,
            cleanupStatus: pb.p_status || mockCleanupJobState.cleanupStatus,
            deletedObjectPaths: nextDeleted,
            deletedObjectsCount: (mockCleanupJobState.deletedObjectsCount || 0) + addedCount,
            failedObjectPaths: Array.isArray(pb.p_failed_paths) ? pb.p_failed_paths : [],
            manualReviewPaths: nextManual,
            manualReviewRequired: nextManual.length > 0,
          };
        }
        return new Response(
          JSON.stringify({
            success: true,
            lateConcurrentReferencePaths: Array.from(globallyAbortedPathsMock),
            deletedObjectsCount: mockCleanupJobState?.deletedObjectsCount ?? Number(pb.p_deleted_count || 0),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url.endsWith('/rest/v1/rpc/admin_permanently_delete_website') && method === 'POST') {
        if (rpcThrowOverride) {
          throw rpcThrowOverride;
        }
        if (rpcHttpErrorOverride) {
          return new Response(JSON.stringify(rpcHttpErrorOverride.body), {
            status: rpcHttpErrorOverride.status,
            headers: { 'Content-Type': 'application/json' },
          });
        }
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

      // Verify atomic RPC call & exact parameter payload was used instead of fragmented REST deletes
      const rpcCall = dbCalls.find(
        (c) => c.method === 'POST' && c.url.endsWith('/rest/v1/rpc/admin_permanently_delete_website')
      );
      assert.ok(rpcCall);
      assert.deepEqual(rpcCall?.body, {
        p_website_id: WEBSITE_UUID,
        p_admin_id: ADMIN_UUID,
        p_confirm_subdomain: 'fortyninee',
        p_reason: 'Permanent admin deletion of website and exclusively associated store data',
      });
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
    await check('2.12 Post-RPC Storage cleanup NEVER deletes surviving store/product assets or lists store folder when isSharedStore === true', async () => {
      storageDeleteRequests = [];
      storageListRequests = [];
      customRpcResultOverride = {
        success: true,
        code: 'DELETED',
        deletedWebsiteId: WEBSITE_UUID,
        deletedStoreId: null,
        isSharedStore: true,
        storePreserved: true,
        deletedProductIds: [],
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
      assert.equal(out.json?.storePreserved, true);
      assert.equal(out.json?.deletedStoreId, null);
      assert.equal(storageDeleteRequests.length, 1);
      const removed = storageDeleteRequests[0].prefixes;
      assert.ok(removed.includes(`${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`));
      assert.ok(!removed.includes(`${MERCHANT_UUID}/${STORE_UUID}/products/item-1.png`));
      assert.ok(!storageListRequests.includes(`${MERCHANT_UUID}/${STORE_UUID}`));
      customRpcResultOverride = null;
    });

    await check('2.12b Shared/preserved store cleanup removes confirmed deletedProductIds image assets without wiping surviving store assets', async () => {
      storageDeleteRequests = [];
      storageListRequests = [];
      const DEL_PROD_UUID = '77777777-7777-4777-8777-777777777701';
      const DEL_PROD_ONLY_PATH = `${MERCHANT_UUID}/${STORE_UUID}/products/exclusive-site-only.png`;
      const DEL_PROD_ONLY_URL = `https://mock.supabase.co/storage/v1/object/public/website-assets/${DEL_PROD_ONLY_PATH}`;
      customRpcResultOverride = {
        success: true,
        code: 'DELETED',
        deletedWebsiteId: WEBSITE_UUID,
        deletedStoreId: null,
        preservedStoreId: STORE_UUID,
        isSharedStore: true,
        storePreserved: true,
        deletedProductIds: [DEL_PROD_UUID],
        deletedProductImageUrls: [DEL_PROD_ONLY_URL],
        cleanupObjectPaths: [DEL_PROD_ONLY_PATH],
        deletedCounts: { products: 1, inventoryMovements: 1, customers: 0, orders: 0, storeMembers: 0 },
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
      assert.equal(out.json?.storePreserved, true);
      assert.equal(out.json?.preservedStoreId, STORE_UUID);
      assert.deepEqual(out.json?.deletedProductIds, [DEL_PROD_UUID]);
      assert.equal(storageDeleteRequests.length, 1);
      const removed = storageDeleteRequests[0].prefixes;
      assert.ok(removed.includes(`${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`));
      assert.ok(removed.includes(DEL_PROD_ONLY_PATH));
      // Surviving product ('prod-del-1' -> item-1.png) inside preserved store MUST stay protected!
      assert.ok(!removed.includes(`${MERCHANT_UUID}/${STORE_UUID}/products/item-1.png`));
      // Still must NEVER recursively list the preserved store folder!
      assert.ok(!storageListRequests.includes(`${MERCHANT_UUID}/${STORE_UUID}`));
      assert.ok(!removed.includes(`${MERCHANT_UUID}/general/shared-logo.png`));
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
      // Never queried public.stores to guess store by owner_id (only explicit surviving sibling store_id logo_url check is allowed)
      assert.ok(!dbCalls.some((c) => c.url.includes('/rest/v1/stores') && c.url.includes('owner_id')));
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

    await check('2.16 Partial Storage failure returns 200 post-commit with storageCleanupWarning, retry completes, and duplicate retry is idempotent', async () => {
      storageDeleteRequests = [];
      forceStorageDeleteFail = true;
      mockCleanupJobState = {
        id: 'cleanup-job-1',
        websiteId: WEBSITE_UUID,
        ownerUserId: MERCHANT_UUID,
        deletedStoreId: STORE_UUID,
        isSharedStore: false,
        storePreserved: false,
        cleanupStatus: 'pending',
        cleanupObjectPaths: [
          `${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`,
          `${MERCHANT_UUID}/${STORE_UUID}/products/item-1.png`,
        ],
        preservedReferencePaths: [],
        manualReviewPaths: [],
        manualReviewRequired: false,
        failedObjectPaths: [],
        deletedObjectsCount: 0,
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
      assert.equal(out.json?.ok, true);
      assert.equal(out.json?.deletedStorageObjects, 0);
      assert.equal(out.json?.storageCleanupStatus, 'partial_failed');
      assert.ok(Array.isArray(out.json?.failedStoragePaths) && (out.json?.failedStoragePaths as string[]).length > 0);
      assert.ok(typeof out.json?.storageCleanupWarning === 'string' && out.json.storageCleanupWarning.length > 10);

      // Now retry cleanup after Storage recovers
      forceStorageDeleteFail = false;
      storageDeleteRequests = [];
      const retryReq = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'retry_storage_cleanup',
          websiteId: WEBSITE_UUID,
        },
      });
      await adminWebsiteActionHandler(retryReq.req, retryReq.res);
      const retryOut = retryReq.getResult();
      assert.equal(retryOut.statusCode, 200);
      assert.equal(retryOut.json?.code, 'STORAGE_CLEANUP_COMPLETED');
      assert.equal(retryOut.json?.cleanupStatus, 'completed');
      assert.equal(storageDeleteRequests.length, 1);
      assert.ok(!storageDeleteRequests[0].prefixes.includes(`${MERCHANT_UUID}/general/shared-logo.png`));

      // Duplicate cleanup attempt returns idempotent 200 without invoking Storage DELETE again
      storageDeleteRequests = [];
      const dupReq = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'retry_storage_cleanup',
          websiteId: WEBSITE_UUID,
        },
      });
      await adminWebsiteActionHandler(dupReq.req, dupReq.res);
      const dupOut = dupReq.getResult();
      assert.equal(dupOut.statusCode, 200);
      assert.equal(dupOut.json?.code, 'STORAGE_CLEANUP_ALREADY_COMPLETED');
      assert.equal(dupOut.json?.idempotent, true);
      assert.equal(dupOut.json?.deletedStorageObjects, 0);
      assert.equal(storageDeleteRequests.length, 0);
      mockCleanupJobState = null;
    });

    await check('2.17 Image referenced by surviving order snapshot is preserved even when store is preserved and handles missing stores.logo_url gracefully', async () => {
      storageDeleteRequests = [];
      simulateMissingLogoColumn = true;
      const DEL_PROD_UUID = '77777777-7777-4777-8777-777777777702';
      const ORDER_SNAP_PATH = `${MERCHANT_UUID}/${STORE_UUID}/products/order-snap-prod.png`;
      const ORDER_SNAP_URL = `https://example-project.supabase.co/storage/v1/object/public/website-assets/${ORDER_SNAP_PATH}`;
      targetStoreOrdersOverride = [
        {
          id: 'ord-snap-1',
          items: [
            {
              productId: DEL_PROD_UUID,
              name: 'Ordered Product',
              imageUrl: ORDER_SNAP_URL,
              orderMeta: {
                websiteId: WEBSITE_UUID,
                merchantBrandingSnapshot: { logoUrl: EXCLUSIVE_HERO_URL },
              },
            },
          ],
        },
      ];
      customRpcResultOverride = {
        success: true,
        code: 'DELETED',
        deletedWebsiteId: WEBSITE_UUID,
        deletedStoreId: null,
        preservedStoreId: STORE_UUID,
        isSharedStore: true,
        storePreserved: true,
        deletedProductIds: [DEL_PROD_UUID],
        deletedProductImageUrls: [ORDER_SNAP_URL],
        cleanupObjectPaths: [],
        preservedReferencedObjectPaths: [ORDER_SNAP_PATH, `${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`],
        manualReviewObjectPaths: [],
        manualReviewRequired: false,
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
      assert.equal(out.json?.storageCleanupStatus, 'completed');
      const allDeletedPrefixes = storageDeleteRequests.flatMap((r) => r.prefixes);
      assert.ok(!allDeletedPrefixes.includes(ORDER_SNAP_PATH));
      assert.ok(!allDeletedPrefixes.includes(`${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`));
      const preservedRefs = (out.json?.preservedReferencedAssetPaths || []) as string[];
      assert.ok(preservedRefs.includes(ORDER_SNAP_PATH));
      simulateMissingLogoColumn = false;
      targetStoreOrdersOverride = [];
      customRpcResultOverride = null;
    });

    await check('2.18 Image referenced in surviving sibling draft, nested section items, or productCatalogMeta is preserved across deletion', async () => {
      storageDeleteRequests = [];
      const HERO_PATH = `${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`;
      const PROD_SHARED_DRAFT_PATH = `${MERCHANT_UUID}/${STORE_UUID}/products/draft-section-prod.png`;
      siblingSiteConfigOverride = {
        draft: {
          sections: [
            {
              id: 'sec-1',
              items: [
                {
                  imageUrl: `https://example-project.supabase.co/storage/v1/object/public/website-assets/${HERO_PATH}`,
                },
              ],
            },
          ],
          productCatalogMeta: {
            'prod-x': {
              imageUrl: `https://example-project.supabase.co/storage/v1/object/public/website-assets/${PROD_SHARED_DRAFT_PATH}`,
            },
          },
        },
      };
      customRpcResultOverride = {
        success: true,
        code: 'DELETED',
        deletedWebsiteId: WEBSITE_UUID,
        deletedStoreId: null,
        preservedStoreId: STORE_UUID,
        isSharedStore: true,
        storePreserved: true,
        deletedProductIds: ['77777777-7777-4777-8777-777777777703'],
        deletedProductImageUrls: [
          `https://example-project.supabase.co/storage/v1/object/public/website-assets/${PROD_SHARED_DRAFT_PATH}`,
        ],
        cleanupObjectPaths: [],
        preservedReferencedObjectPaths: [HERO_PATH, PROD_SHARED_DRAFT_PATH],
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
      const allDeletedPrefixes = storageDeleteRequests.flatMap((r) => r.prefixes);
      assert.ok(!allDeletedPrefixes.includes(HERO_PATH));
      assert.ok(!allDeletedPrefixes.includes(PROD_SHARED_DRAFT_PATH));
      siblingSiteConfigOverride = null;
      customRpcResultOverride = null;
    });

    await check('2.19 Unverified ownership paths and global verification failures preserve assets and mark manual_review_required without rolling back DB', async () => {
      storageDeleteRequests = [];
      const UNOWNED_FOREIGN_URL = `https://example-project.supabase.co/storage/v1/object/public/website-assets/${OTHER_MERCHANT_UUID}/some-site/unowned.png`;
      const OTHER_BUCKET_URL = `https://example-project.supabase.co/storage/v1/object/public/custom-bucket/orphan.png`;
      const prevConfig = currentSiteState.config;
      currentSiteState = {
        ...currentSiteState,
        config: {
          logoUrl: UNOWNED_FOREIGN_URL,
          heroImageUrl: EXCLUSIVE_HERO_URL,
          sections: [{ imageUrl: OTHER_BUCKET_URL }],
        },
      };
      customRpcResultOverride = {
        success: true,
        code: 'DELETED',
        deletedWebsiteId: WEBSITE_UUID,
        deletedStoreId: STORE_UUID,
        isSharedStore: false,
        storePreserved: false,
        manualReviewObjectPaths: [
          `${OTHER_MERCHANT_UUID}/some-site/unowned.png`,
          OTHER_BUCKET_URL,
        ],
        manualReviewRequired: true,
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
      assert.equal(out.json?.ok, true);
      assert.equal(out.json?.storageCleanupStatus, 'manual_review_required');
      assert.equal(out.json?.manualReviewRequired, true);
      const manualPaths = (out.json?.manualReviewAssetPaths || []) as string[];
      assert.ok(manualPaths.includes(`${OTHER_MERCHANT_UUID}/some-site/unowned.png`));
      assert.ok(manualPaths.includes(OTHER_BUCKET_URL));
      const allDeleted = storageDeleteRequests.flatMap((r) => r.prefixes);
      assert.ok(!allDeleted.includes(`${OTHER_MERCHANT_UUID}/some-site/unowned.png`));
      assert.ok(allDeleted.includes(`${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`));

      // Now simulate global verification RPC failure -> must preserve all candidates and return 200 with manual_review_required
      storageDeleteRequests = [];
      forceGlobalVerifyFail = true;
      currentSiteState = { ...currentSiteState, config: prevConfig };
      customRpcResultOverride = null;
      const failVerify = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(failVerify.req, failVerify.res);
      const failOut = failVerify.getResult();
      assert.equal(failOut.statusCode, 200);
      assert.equal(failOut.json?.ok, true);
      assert.equal(failOut.json?.storageCleanupSkipped, true);
      assert.equal(failOut.json?.storageCleanupStatus, 'manual_review_required');
      assert.equal(failOut.json?.manualReviewRequired, true);
      assert.equal(failOut.json?.deletedStorageObjects, 0);
      assert.equal(storageDeleteRequests.length, 0);

      forceGlobalVerifyFail = false;
      currentSiteState = { ...currentSiteState, config: prevConfig };
      customRpcResultOverride = null;
    });

    await check('2.20 Unenrolled TOTP admin and non-primary admin identity are blocked on delete and retry_storage_cleanup', async () => {
      dbCalls = [];
      adminFactorsOverride = [];
      const noTotpDel = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(noTotpDel.req, noTotpDel.res);
      assert.equal(noTotpDel.getResult().statusCode, 403);
      assert.equal(noTotpDel.getResult().json?.code, 'MFA_REQUIRED');

      const noTotpRetry = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'retry_storage_cleanup',
          websiteId: WEBSITE_UUID,
        },
      });
      await adminWebsiteActionHandler(noTotpRetry.req, noTotpRetry.res);
      assert.equal(noTotpRetry.getResult().statusCode, 403);
      assert.equal(noTotpRetry.getResult().json?.code, 'MFA_REQUIRED');
      assert.equal(dbCalls.length, 0);

      adminFactorsOverride = null;
      const spoofedRes = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${spoofedAdminToken}`,
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(spoofedRes.req, spoofedRes.res);
      assert.equal(spoofedRes.getResult().statusCode, 403);
      assert.equal(spoofedRes.getResult().json?.code, 'FORBIDDEN_ADMIN_REQUIRED');
    });

    await check('2.21 Two-pass pre-DELETE confirm catches late concurrent reference between initial verify and Storage DELETE', async () => {
      storageDeleteRequests = [];
      verifyCallCount = 0;
      globallyAbortedPathsMock.clear();
      const RACE_PROD_PATH = `${MERCHANT_UUID}/${STORE_UUID}/products/item-1.png`.toLowerCase();
      onBeforeBatchConfirmVerify = () => {
        // Simulate a concurrent order/product write committing AFTER initial verify succeeded
        globallyAbortedPathsMock.add(RACE_PROD_PATH);
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
      assert.ok(verifyCallCount >= 2);
      const deletedPrefixes = storageDeleteRequests.flatMap((r) => r.prefixes.map((p) => p.toLowerCase()));
      assert.ok(!deletedPrefixes.includes(RACE_PROD_PATH));
      assert.ok(deletedPrefixes.includes(`${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`.toLowerCase()));
      const conflicts = ((out.json?.concurrentReferenceConflicts || []) as string[]).map((p) => p.toLowerCase());
      assert.ok(conflicts.includes(RACE_PROD_PATH));

      // Also verify failing pre-DELETE per-batch confirm preserves objects without Storage DELETE
      storageDeleteRequests = [];
      verifyCallCount = 0;
      onBeforeBatchConfirmVerify = null;
      globallyAbortedPathsMock.clear();
      forceBatchConfirmVerifyFail = true;
      const failConfirm = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(failConfirm.req, failConfirm.res);
      const failConfirmOut = failConfirm.getResult();
      assert.equal(failConfirmOut.statusCode, 200);
      assert.equal(failConfirmOut.json?.storageCleanupStatus, 'manual_review_required');
      assert.equal(failConfirmOut.json?.deletedStorageObjects, 0);
      assert.equal(storageDeleteRequests.length, 0);

      forceBatchConfirmVerifyFail = false;
    });

    await check('2.22 retry_storage_cleanup excludes already-deleted objects and avoids double-counting across retries', async () => {
      storageDeleteRequests = [];
      verifyCallCount = 0;
      globallyAbortedPathsMock.clear();
      const ALREADY_DELETED = `${MERCHANT_UUID}/${WEBSITE_UUID}/heroes/hero-1.png`;
      const STILL_PENDING = `${MERCHANT_UUID}/${STORE_UUID}/products/item-1.png`;
      mockCleanupJobState = {
        id: 'cleanup-job-dedup',
        websiteId: WEBSITE_UUID,
        ownerUserId: MERCHANT_UUID,
        deletedStoreId: STORE_UUID,
        isSharedStore: false,
        storePreserved: false,
        cleanupStatus: 'partial_failed',
        cleanupObjectPaths: [ALREADY_DELETED, STILL_PENDING],
        preservedReferencePaths: [],
        manualReviewPaths: [],
        manualReviewRequired: false,
        deletedObjectPaths: [ALREADY_DELETED],
        failedObjectPaths: [ALREADY_DELETED, STILL_PENDING],
        deletedObjectsCount: 1,
      };
      const retryReq = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        body: {
          action: 'retry_storage_cleanup',
          websiteId: WEBSITE_UUID,
        },
      });
      await adminWebsiteActionHandler(retryReq.req, retryReq.res);
      const retryOut = retryReq.getResult();
      assert.equal(retryOut.statusCode, 200);
      assert.equal(retryOut.json?.code, 'STORAGE_CLEANUP_COMPLETED');
      assert.equal(retryOut.json?.deletedStorageObjects, 1);
      const prefixes = storageDeleteRequests.flatMap((r) => r.prefixes);
      assert.ok(!prefixes.includes(ALREADY_DELETED));
      assert.ok(prefixes.includes(STILL_PENDING));
      assert.equal(mockCleanupJobState?.deletedObjectsCount, 2);
      mockCleanupJobState = null;
    });

    await check('2.23 DELETE reports ATOMIC_DELETE_RPC_REQUIRED ONLY on confirmed missing RPC (PG 42883 / PGRST202)', async () => {
      rpcInstalledInMock = true;
      storageDeleteRequests = [];

      // Case A: PostgreSQL 42883 explicitly naming admin_permanently_delete_website
      rpcHttpErrorOverride = {
        status: 404,
        body: {
          code: '42883',
          message:
            'function public.admin_permanently_delete_website(uuid, uuid, text, text) does not exist',
        },
      };
      const pgMissing = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        ip: '203.0.113.81',
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(pgMissing.req, pgMissing.res);
      assert.equal(pgMissing.getResult().statusCode, 501);
      assert.equal(pgMissing.getResult().json?.code, 'ATOMIC_DELETE_RPC_REQUIRED');
      assert.equal(storageDeleteRequests.length, 0);

      // Case B: Ambiguous 404 without PGRST202/42883 must NOT falsely report missing RPC
      rpcHttpErrorOverride = {
        status: 404,
        body: {
          message: 'Not Found',
        },
      };
      const unknown404 = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        ip: '203.0.113.81',
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(unknown404.req, unknown404.res);
      assert.equal(unknown404.getResult().statusCode, 502);
      assert.equal(unknown404.getResult().json?.code, 'ATOMIC_DELETE_FAILED');
      assert.equal(storageDeleteRequests.length, 0);

      rpcHttpErrorOverride = null;
    });

    await check('2.24 DELETE distinguishes Wrong RPC Arguments from missing RPC (PGRST202 hint, PGRST203, 22P02)', async () => {
      storageDeleteRequests = [];

      // Case A: PostgREST PGRST202 with "Perhaps you meant to call..." -> function exists, argument mismatch
      rpcHttpErrorOverride = {
        status: 404,
        body: {
          code: 'PGRST202',
          message:
            'Could not find the function public.admin_permanently_delete_website(p_wrong) in the schema cache',
          hint: 'Perhaps you meant to call the function public.admin_permanently_delete_website(p_admin_id, p_confirm_subdomain, p_reason, p_website_id)',
        },
      };
      const wrongHint = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        ip: '203.0.113.82',
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(wrongHint.req, wrongHint.res);
      assert.equal(wrongHint.getResult().statusCode, 400);
      assert.equal(wrongHint.getResult().json?.code, 'INVALID_RPC_ARGUMENTS');
      assert.equal(storageDeleteRequests.length, 0);

      // Case B: PGRST203 overload ambiguity
      rpcHttpErrorOverride = {
        status: 300,
        body: {
          code: 'PGRST203',
          message:
            'Could not choose the best candidate function between public.admin_permanently_delete_website(...)',
        },
      };
      const overloadErr = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        ip: '203.0.113.82',
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(overloadErr.req, overloadErr.res);
      assert.equal(overloadErr.getResult().statusCode, 400);
      assert.equal(overloadErr.getResult().json?.code, 'INVALID_RPC_ARGUMENTS');

      // Case C: PostgreSQL 22P02 invalid input syntax
      rpcHttpErrorOverride = {
        status: 400,
        body: {
          code: '22P02',
          message: 'invalid input syntax for type uuid inside admin_permanently_delete_website',
        },
      };
      const invalidUuidType = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        ip: '203.0.113.82',
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(invalidUuidType.req, invalidUuidType.res);
      assert.equal(invalidUuidType.getResult().statusCode, 400);
      assert.equal(invalidUuidType.getResult().json?.code, 'INVALID_RPC_ARGUMENTS');

      rpcHttpErrorOverride = null;
    });

    await check('2.25 DELETE classifies Permission Denied (42501) accurately even when message names the RPC', async () => {
      storageDeleteRequests = [];
      rpcHttpErrorOverride = {
        status: 403,
        body: {
          code: '42501',
          message: 'permission denied for function admin_permanently_delete_website',
        },
      };
      const { req, res, getResult } = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        ip: '203.0.113.83',
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
      assert.equal(out.json?.code, 'RPC_PERMISSION_DENIED');
      assert.ok(!String(out.json?.error || '').includes('not yet installed'));
      assert.equal(storageDeleteRequests.length, 0);
      rpcHttpErrorOverride = null;
    });

    await check('2.26 DELETE classifies DB Admin Authorization failure accurately (P0001 and JSON rejection)', async () => {
      storageDeleteRequests = [];
      rpcHttpErrorOverride = {
        status: 400,
        body: {
          code: 'P0001',
          message:
            'Only verified primary platform administrators can permanently delete websites (admin_permanently_delete_website)',
        },
      };
      const pgAuthFail = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        ip: '203.0.113.84',
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(pgAuthFail.req, pgAuthFail.res);
      assert.equal(pgAuthFail.getResult().statusCode, 403);
      assert.equal(pgAuthFail.getResult().json?.code, 'FORBIDDEN_ADMIN_REQUIRED');
      assert.equal(storageDeleteRequests.length, 0);

      rpcHttpErrorOverride = null;
      customRpcResultOverride = {
        success: false,
        code: 'FORBIDDEN_ADMIN_REQUIRED',
        message: 'Verified primary platform administrator check failed.',
      };
      const jsonAuthFail = makeMockReqRes({
        origin: 'https://app.amaas.xyz',
        authorization: `Bearer ${adminToken}`,
        ip: '203.0.113.84',
        body: {
          action: 'delete',
          websiteId: WEBSITE_UUID,
          confirmSubdomain: 'fortyninee',
          explicitConfirmed: true,
        },
      });
      await adminWebsiteActionHandler(jsonAuthFail.req, jsonAuthFail.res);
      assert.equal(jsonAuthFail.getResult().statusCode, 403);
      assert.equal(jsonAuthFail.getResult().json?.code, 'FORBIDDEN_ADMIN_REQUIRED');
      assert.equal(storageDeleteRequests.length, 0);
      customRpcResultOverride = null;
    });

    await check('2.27 DELETE classifies Schema-Cache Mismatch (PGRST002 / PGRST204 / stale PGRST202) accurately', async () => {
      storageDeleteRequests = [];

      for (const body of [
        {
          code: 'PGRST002',
          message: 'Could not query the database for the schema cache. Retrying.',
        },
        {
          code: 'PGRST204',
          message: "Could not find the 'website_id' column of 'products' in the schema cache",
        },
        {
          code: 'PGRST202',
          message: 'Could not find the function public.admin_permanently_delete_website in the schema cache',
          hint: "Run NOTIFY pgrst, 'reload schema' to reload schema cache",
        },
      ]) {
        rpcHttpErrorOverride = { status: 503, body };
        const resPair = makeMockReqRes({
          origin: 'https://app.amaas.xyz',
          authorization: `Bearer ${adminToken}`,
          ip: '203.0.113.85',
          body: {
            action: 'delete',
            websiteId: WEBSITE_UUID,
            confirmSubdomain: 'fortyninee',
            explicitConfirmed: true,
          },
        });
        await adminWebsiteActionHandler(resPair.req, resPair.res);
        assert.equal(resPair.getResult().statusCode, 503);
        assert.equal(resPair.getResult().json?.code, 'SCHEMA_CACHE_MISMATCH');
        assert.equal(storageDeleteRequests.length, 0);
      }

      rpcHttpErrorOverride = null;
    });

    await check('2.28 DELETE classifies Database Timeout (PG 57014 / HTTP 504 / AbortError) accurately and logs sanitized diagnostics without leaking tokens', async () => {
      storageDeleteRequests = [];
      const capturedLogs: string[] = [];
      const origConsoleError = console.error;
      console.error = (...args: unknown[]) => {
        capturedLogs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
      };

      try {
        // Case A: PostgreSQL 57014 statement timeout with sensitive-looking string in raw DB message
        rpcHttpErrorOverride = {
          status: 500,
          body: {
            code: '57014',
            message:
              'canceling statement due to statement timeout in admin_permanently_delete_website for Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signatureSecretHere customer@example.com',
          },
        };
        const pgTimeout = makeMockReqRes({
          origin: 'https://app.amaas.xyz',
          authorization: `Bearer ${adminToken}`,
          ip: '203.0.113.86',
          body: {
            action: 'delete',
            websiteId: WEBSITE_UUID,
            confirmSubdomain: 'fortyninee',
            explicitConfirmed: true,
          },
        });
        await adminWebsiteActionHandler(pgTimeout.req, pgTimeout.res);
        assert.equal(pgTimeout.getResult().statusCode, 504);
        assert.equal(pgTimeout.getResult().json?.code, 'DATABASE_TIMEOUT');
        assert.equal(storageDeleteRequests.length, 0);

        // Case B: Fetch AbortError timeout
        rpcHttpErrorOverride = null;
        const abortErr = new Error('The operation was aborted due to timeout');
        abortErr.name = 'AbortError';
        rpcThrowOverride = abortErr;
        const fetchTimeout = makeMockReqRes({
          origin: 'https://app.amaas.xyz',
          authorization: `Bearer ${adminToken}`,
          ip: '203.0.113.86',
          body: {
            action: 'delete',
            websiteId: WEBSITE_UUID,
            confirmSubdomain: 'fortyninee',
            explicitConfirmed: true,
          },
        });
        await adminWebsiteActionHandler(fetchTimeout.req, fetchTimeout.res);
        assert.equal(fetchTimeout.getResult().statusCode, 504);
        assert.equal(fetchTimeout.getResult().json?.code, 'DATABASE_TIMEOUT');
        assert.equal(storageDeleteRequests.length, 0);

        // Verify diagnostic logs captured PG code & sanitized output without leaking secrets or emails
        const joinedLogs = capturedLogs.join('\n');
        assert.ok(joinedLogs.includes('57014'));
        assert.ok(joinedLogs.includes('DATABASE_TIMEOUT'));
        assert.ok(!joinedLogs.includes('signatureSecretHere'));
        assert.ok(!joinedLogs.includes('customer@example.com'));
        assert.ok(!joinedLogs.includes('test-service-role-key-not-real'));

        // Case C: Mismatched Supabase project env vars fail closed with SUPABASE_PROJECT_MISMATCH
        const prevSrvUrl = process.env.SUPABASE_URL;
        process.env.SUPABASE_URL = 'https://different-project-ref.supabase.co';
        try {
          const mismatchReq = makeMockReqRes({
            origin: 'https://app.amaas.xyz',
            authorization: `Bearer ${adminToken}`,
            ip: '203.0.113.86',
            body: {
              action: 'delete',
              websiteId: WEBSITE_UUID,
              confirmSubdomain: 'fortyninee',
              explicitConfirmed: true,
            },
          });
          await adminWebsiteActionHandler(mismatchReq.req, mismatchReq.res);
          assert.equal(mismatchReq.getResult().statusCode, 503);
          assert.equal(mismatchReq.getResult().json?.code, 'SUPABASE_PROJECT_MISMATCH');
        } finally {
          if (prevSrvUrl === undefined) delete process.env.SUPABASE_URL;
          else process.env.SUPABASE_URL = prevSrvUrl;
        }
      } finally {
        rpcThrowOverride = null;
        rpcHttpErrorOverride = null;
        console.error = origConsoleError;
      }
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
  // Loads the new local reviewed migration file (/proposed_migrations/20261123_admin_permanent_website_deletion.sql)
  // completely in-memory (NEVER touches production Supabase or files inside supabase/).
  console.log('\n[3] Running isolated in-memory PGlite lifecycle, trigger & atomic permanent-delete verification...');

  const PROPOSED_PERMANENT_DELETE_SQL = fs.readFileSync(
    path.join(root, 'proposed_migrations/20261123_admin_permanent_website_deletion.sql'),
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
      ('${storeAId}', '${DB_MERCH_A}', 'Merchant A Owner', 'merchant.a@amaas.test', 'owner', 'active');
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

  // Issue 1 shared store fixture products:
  // - sharedNullProdId: dashboard/shared product (website_id IS NULL) -> MUST survive
  // - sharedSite1ExclusiveProdId: exclusive to siteShared1Id -> MUST be deleted cleanly with inventory + storage path
  // - sharedSite1CrossRefProdId: website_id = siteShared1Id BUT referenced in siteShared2Id.config -> MUST survive as shared (website_id = NULL)
  // - sharedSite2ExclusiveProdId: belongs to siteShared2Id -> MUST survive with website_id = siteShared2Id
  const sharedNullProdId = (
    await db.query<{ id: string }>(`
      INSERT INTO public.products (store_id, website_id, name, sku, price, stock, image_url)
      VALUES ('${storeSharedId}', NULL, 'Shared Catalog Base', 'SHARED-NULL-1', 900, 12,
        'https://mock.supabase.co/storage/v1/object/public/website-assets/${DB_MERCH_C}/${storeSharedId}/products/shared-base.png')
      RETURNING id;
    `)
  ).rows[0].id;
  const sharedSite1ExclusiveProdId = (
    await db.query<{ id: string }>(`
      INSERT INTO public.products (store_id, website_id, name, sku, price, stock, image_url)
      VALUES ('${storeSharedId}', '${siteShared1Id}', 'Site 1 Exclusive Item', 'SHARED-S1-EXCL', 1200, 8,
        'https://mock.supabase.co/storage/v1/object/public/website-assets/${DB_MERCH_C}/${storeSharedId}/products/site1-exclusive.png')
      RETURNING id;
    `)
  ).rows[0].id;
  const sharedSite1CrossRefProdId = (
    await db.query<{ id: string }>(`
      INSERT INTO public.products (store_id, website_id, name, sku, price, stock, image_url)
      VALUES ('${storeSharedId}', '${siteShared1Id}', 'Cross-Showcased Item', 'SHARED-CROSS-1', 1500, 6,
        'https://mock.supabase.co/storage/v1/object/public/website-assets/${DB_MERCH_C}/${storeSharedId}/products/cross-shared.png')
      RETURNING id;
    `)
  ).rows[0].id;
  const sharedSite2ExclusiveProdId = (
    await db.query<{ id: string }>(`
      INSERT INTO public.products (store_id, website_id, name, sku, price, stock, image_url)
      VALUES ('${storeSharedId}', '${siteShared2Id}', 'Site 2 Exclusive Item', 'SHARED-S2-EXCL', 1800, 5,
        'https://mock.supabase.co/storage/v1/object/public/website-assets/${DB_MERCH_C}/${siteShared2Id}/products/site2-exclusive.png')
      RETURNING id;
    `)
  ).rows[0].id;

  await db.exec(`
    UPDATE public.subscribed_websites
    SET config = jsonb_build_object(
      'servicesOrProducts', jsonb_build_array(
        jsonb_build_object('id', '${sharedSite1CrossRefProdId}', 'productId', '${sharedSite1CrossRefProdId}', 'name', 'Cross-Showcased Item'),
        jsonb_build_object('id', '${sharedSite2ExclusiveProdId}', 'productId', '${sharedSite2ExclusiveProdId}', 'name', 'Site 2 Exclusive Item')
      )
    )
    WHERE id = '${siteShared2Id}';

    INSERT INTO public.inventory_movements (store_id, product_id, product_name, type, quantity_change, new_stock, reason)
    VALUES
      ('${storeAId}', '${prodAId}', 'Alpha Tee', 'restock', 10, 10, 'Initial stock'),
      ('${storeBId}', '${prodBId}', 'Beta Laptop', 'restock', 3, 3, 'Initial stock'),
      ('${storeSharedId}', '${sharedNullProdId}', 'Shared Catalog Base', 'restock', 12, 12, 'Shared base stock'),
      ('${storeSharedId}', '${sharedSite1ExclusiveProdId}', 'Site 1 Exclusive Item', 'restock', 8, 8, 'Site 1 stock'),
      ('${storeSharedId}', '${sharedSite1CrossRefProdId}', 'Cross-Showcased Item', 'restock', 6, 6, 'Cross shared stock'),
      ('${storeSharedId}', '${sharedSite2ExclusiveProdId}', 'Site 2 Exclusive Item', 'restock', 5, 5, 'Site 2 stock');

    INSERT INTO public.customers (store_id, name, phone, email)
    VALUES
      ('${storeAId}', 'Alpha Customer', '01711111111', 'google.customer@amaas.test'),
      ('${storeBId}', 'Beta Customer', '01722222222', 'beta.customer@amaas.test'),
      ('${storeSharedId}', 'Shared Customer', '01733333333', 'shared.customer@amaas.test');

    INSERT INTO public.orders (store_id, order_number, customer_name, customer_phone, customer_email, address, city, total, subtotal, source, items)
    VALUES
      ('${storeAId}', 'ORD-ALPHA-1', 'Alpha Customer', '01711111111', 'google.customer@amaas.test', 'Dhaka', 'Dhaka', 500, 500,
       'Website (alpha-shop.amaas.xyz)', '[{"name":"Alpha Tee","qty":1,"orderMeta":{"websiteId":"${siteAId}","websiteSubdomain":"alpha-shop"}}]'::jsonb),
      ('${storeBId}', 'ORD-BETA-1', 'Beta Customer', '01722222222', 'beta.customer@amaas.test', 'Chattogram', 'Chattogram', 50000, 50000,
       'Website (beta-shop.amaas.xyz)', '[{"name":"Beta Laptop","qty":1,"orderMeta":{"websiteId":"${siteBId}","websiteSubdomain":"beta-shop"}}]'::jsonb),
      ('${storeSharedId}', 'ORD-SHARED-1', 'Shared Customer', '01733333333', 'shared.customer@amaas.test', 'Sylhet', 'Sylhet', 1200, 1200,
       'Website (shared-one.amaas.xyz)', '[{"name":"Site 1 Exclusive Item","qty":1,"orderMeta":{"websiteId":"${siteShared1Id}","websiteSubdomain":"shared-one"}}]'::jsonb);

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
    assert.equal(Number(counts.rows[0].members), 1);
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
    assert.equal(out.deletedCounts.storeMembers, 1);

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
    assert.equal(Number(retained.rows[0].delete_audits), 1);
    assert.equal(Number(retained.rows[0].beta_stores), 1);
    assert.equal(Number(retained.rows[0].beta_websites), 1);
    assert.equal(Number(retained.rows[0].beta_products), 1);
    assert.equal(Number(retained.rows[0].beta_orders), 1);
  });

  await check('3.6 DB Issue 1 (Shared Store Product Cleanup): deletes only deleted website exclusive products/inventory/assets while preserving shared store, shared products, cross-referenced products, and sibling website products', async () => {
    await setDbSession(null, null, 'service_role');
    const sharedRes = await db.query<{
      res: {
        success: boolean;
        deletedWebsiteId: string;
        deletedStoreId: string | null;
        preservedStoreId: string | null;
        isSharedStore: boolean;
        storePreserved: boolean;
        deletedProductIds: string[];
        preservedSharedProductIds: string[];
        cleanupObjectPaths: string[];
        deletedCounts: { products: number; inventoryMovements: number };
      };
    }>(
      `SELECT public.admin_permanently_delete_website('${siteShared1Id}'::uuid, '${DB_ADMIN}'::uuid, 'shared-one', 'Delete one site sharing a store') AS res;`
    );
    const out = sharedRes.rows[0].res;
    assert.equal(out.success, true);
    assert.equal(out.deletedWebsiteId, siteShared1Id);
    assert.equal(out.deletedStoreId, null);
    assert.equal(out.preservedStoreId, storeSharedId);
    assert.equal(out.isSharedStore, true);
    assert.equal(out.storePreserved, true);
    assert.deepEqual(out.deletedProductIds, [sharedSite1ExclusiveProdId]);
    assert.deepEqual(out.preservedSharedProductIds, [sharedSite1CrossRefProdId]);
    assert.deepEqual(out.cleanupObjectPaths, [
      `${DB_MERCH_C}/${storeSharedId}/products/site1-exclusive.png`,
    ]);
    assert.equal(out.deletedCounts.products, 1);
    assert.equal(out.deletedCounts.inventoryMovements, 1);

    const sharedCheck = await db.query<{
      site1: string;
      site2: string;
      shared_store: string;
      shared_orders: string;
      null_prod_cnt: string;
      s1_excl_prod_cnt: string;
      s1_excl_inv_cnt: string;
      cross_prod_website_id: string | null;
      cross_prod_inv_cnt: string;
      s2_prod_website_id: string | null;
      s2_prod_inv_cnt: string;
      orphaned_cnt: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM public.subscribed_websites WHERE id = '${siteShared1Id}') AS site1,
        (SELECT COUNT(*) FROM public.subscribed_websites WHERE id = '${siteShared2Id}') AS site2,
        (SELECT COUNT(*) FROM public.stores WHERE id = '${storeSharedId}') AS shared_store,
        (SELECT COUNT(*) FROM public.orders WHERE store_id = '${storeSharedId}') AS shared_orders,
        (SELECT COUNT(*) FROM public.products WHERE id = '${sharedNullProdId}' AND website_id IS NULL) AS null_prod_cnt,
        (SELECT COUNT(*) FROM public.products WHERE id = '${sharedSite1ExclusiveProdId}') AS s1_excl_prod_cnt,
        (SELECT COUNT(*) FROM public.inventory_movements WHERE product_id = '${sharedSite1ExclusiveProdId}') AS s1_excl_inv_cnt,
        (SELECT website_id::text FROM public.products WHERE id = '${sharedSite1CrossRefProdId}') AS cross_prod_website_id,
        (SELECT COUNT(*) FROM public.inventory_movements WHERE product_id = '${sharedSite1CrossRefProdId}') AS cross_prod_inv_cnt,
        (SELECT website_id::text FROM public.products WHERE id = '${sharedSite2ExclusiveProdId}') AS s2_prod_website_id,
        (SELECT COUNT(*) FROM public.inventory_movements WHERE product_id = '${sharedSite2ExclusiveProdId}') AS s2_prod_inv_cnt,
        (SELECT COUNT(*) FROM public.products WHERE store_id = '${storeSharedId}' AND id NOT IN ('${sharedNullProdId}', '${sharedSite1CrossRefProdId}', '${sharedSite2ExclusiveProdId}')) AS orphaned_cnt;
    `);
    const row = sharedCheck.rows[0];
    assert.equal(Number(row.site1), 0);
    assert.equal(Number(row.site2), 1);
    assert.equal(Number(row.shared_store), 1);
    assert.equal(Number(row.shared_orders), 1);
    assert.equal(Number(row.null_prod_cnt), 1);
    // Exclusive product & its inventory deleted (zero orphan!)
    assert.equal(Number(row.s1_excl_prod_cnt), 0);
    assert.equal(Number(row.s1_excl_inv_cnt), 0);
    assert.equal(Number(row.orphaned_cnt), 0);
    // Cross-referenced product preserved cleanly with website_id = NULL + inventory intact
    assert.equal(row.cross_prod_website_id, null);
    assert.equal(Number(row.cross_prod_inv_cnt), 1);
    // Surviving sibling website product + inventory preserved intact
    assert.equal(row.s2_prod_website_id, siteShared2Id);
    assert.equal(Number(row.s2_prod_inv_cnt), 1);
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
    const deadlockStoreId = (
      await db.query<{ id: string }>(
        `INSERT INTO public.stores (owner_id, name, slug, category, currency) VALUES ('${DB_MERCH_B}', 'Deadlock Test Store', 'deadlock-test-store', 'Retail', '৳') RETURNING id;`
      )
    ).rows[0].id;
    const deadlockSiteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (
          user_id, store_id, business_name, niche, subdomain, full_domain,
          template_id, template_name, status, payment_status, deployment_status,
          current_period_end, grace_period_end
        ) VALUES (
          '${DB_MERCH_B}', '${deadlockStoreId}', 'Deadlock Shop', 'ecommerce', 'deadlock-shop', 'deadlock-shop.amaas.xyz',
          't1', 'Modern', 'active', 'paid', 'live',
          NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days'
        ) RETURNING id;
      `)
    ).rows[0].id;

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
      `SELECT public.admin_permanently_delete_website('${deadlockSiteId}'::uuid, '${DB_ADMIN}'::uuid, 'deadlock-shop', 'Deadlock rollback') AS res;`
    );
    assert.equal(dlRes.rows[0].res.success, false);
    assert.equal(dlRes.rows[0].res.code, 'CONCURRENT_MODIFICATION_RETRY');

    // Exclusive site + store + audit logs remain completely intact after 40P01 rollback
    const dlIntact = await db.query<{ site_cnt: string; store_cnt: string; del_audit_cnt: string }>(`
      SELECT
        (SELECT COUNT(*) FROM public.subscribed_websites WHERE id = '${deadlockSiteId}') AS site_cnt,
        (SELECT COUNT(*) FROM public.stores WHERE id = '${deadlockStoreId}') AS store_cnt,
        (SELECT COUNT(*) FROM public.website_lifecycle_audit_logs WHERE website_id = '${deadlockSiteId}' AND action = 'delete') AS del_audit_cnt;
    `);
    assert.equal(Number(dlIntact.rows[0].site_cnt), 1);
    assert.equal(Number(dlIntact.rows[0].store_cnt), 1);
    assert.equal(Number(dlIntact.rows[0].del_audit_cnt), 0);

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

  await check('3.13 DB legacy website service_trials row does NOT block exclusive store deletion while new website trials stay blocked', async () => {
    await setDbSession(null, null, 'postgres');
    const legacyStoreId = (
      await db.query<{ id: string }>(
        `INSERT INTO public.stores (owner_id, name, slug, category, currency) VALUES ('${DB_MERCH_A}', 'Legacy Trial Store', 'legacy-trial-store', 'Retail', '৳') RETURNING id;`
      )
    ).rows[0].id;
    const legacySiteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (
          user_id, store_id, business_name, niche, subdomain, full_domain,
          template_id, template_name, status, payment_status, deployment_status,
          current_period_end, grace_period_end
        ) VALUES (
          '${DB_MERCH_A}', '${legacyStoreId}', 'Legacy Trial Shop', 'ecommerce', 'legacy-trial-shop', 'legacy-trial-shop.amaas.xyz',
          't1', 'Modern', 'active', 'paid', 'live',
          NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days'
        ) RETURNING id;
      `)
    ).rows[0].id;

    // Simulate historical pre-20261026 service_trials row with service_category = 'website' linked to this store
    await db.exec(`
      ALTER TABLE public.service_trials DISABLE TRIGGER trg_protect_service_trial;
      INSERT INTO public.service_trials (user_id, store_id, service_id, service_name, service_category)
      VALUES ('${DB_MERCH_A}', '${legacyStoreId}', 'website_lite', 'Website Lite Legacy', 'website');
      ALTER TABLE public.service_trials ENABLE TRIGGER trg_protect_service_trial;
    `);

    // Inserting a new website trial must still be blocked
    await setDbSession(DB_MERCH_B, 'merchant.b@amaas.test', 'authenticated');
    let websiteTrialBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.service_trials (user_id, store_id, service_id, service_name, service_category)
        VALUES ('${DB_MERCH_B}', '${storeBId}', 'website_lite', 'Blocked Trial', 'website');
      `);
    } catch {
      websiteTrialBlocked = true;
    }
    assert.equal(websiteTrialBlocked, true);

    // Deleting legacySiteId via service_role must succeed and null out legacy service_trials.store_id cleanly
    await setDbSession(null, null, 'service_role');
    const delLegacyRes = await db.query<{ res: { success: boolean; deletedStoreId: string } }>(
      `SELECT public.admin_permanently_delete_website('${legacySiteId}'::uuid, '${DB_ADMIN}'::uuid, 'legacy-trial-shop', 'Legacy trial cascade test') AS res;`
    );
    assert.equal(delLegacyRes.rows[0].res.success, true);
    assert.equal(delLegacyRes.rows[0].res.deletedStoreId, legacyStoreId);

    await setDbSession(null, null, 'postgres');
    const legacyTrialRow = await db.query<{ store_id: string | null }>(
      `SELECT store_id::text FROM public.service_trials WHERE user_id = '${DB_MERCH_A}' AND service_category = 'website';`
    );
    assert.equal(legacyTrialRow.rows.length, 1);
    assert.equal(legacyTrialRow.rows[0].store_id, null);
  });

  await check('3.14 DB retriable storage cleanup outbox tracks pending -> partial_failed -> completed and blocks non-service_role access', async () => {
    await setDbSession(null, null, 'postgres');
    const outboxCheck = await db.query<{
      website_id: string;
      deleted_store_id: string | null;
      preserved_store_id: string | null;
      is_shared_store: boolean;
      store_preserved: boolean;
      cleanup_status: string;
      cleanup_scope_prefixes: string[];
      cleanup_object_paths: string[];
    }>(`
      SELECT website_id::text, deleted_store_id::text, preserved_store_id::text,
             is_shared_store, store_preserved, cleanup_status, cleanup_scope_prefixes, cleanup_object_paths
      FROM public.website_deletion_storage_cleanups
      WHERE website_id IN ('${siteAId}', '${siteShared1Id}')
      ORDER BY created_at ASC;
    `);
    const alphaJob = outboxCheck.rows.find((r) => r.website_id === siteAId);
    const sharedJob = outboxCheck.rows.find((r) => r.website_id === siteShared1Id);
    assert.ok(alphaJob);
    assert.equal(alphaJob.deleted_store_id, storeAId);
    assert.equal(alphaJob.preserved_store_id, null);
    assert.equal(alphaJob.is_shared_store, false);
    assert.equal(alphaJob.store_preserved, false);
    assert.equal(alphaJob.cleanup_status, 'pending');
    assert.deepEqual(alphaJob.cleanup_scope_prefixes, [
      `${DB_MERCH_A}/${siteAId}`,
      `${DB_MERCH_A}/${storeAId}`,
    ]);

    assert.ok(sharedJob);
    assert.equal(sharedJob.deleted_store_id, null);
    assert.equal(sharedJob.preserved_store_id, storeSharedId);
    assert.equal(sharedJob.is_shared_store, true);
    assert.equal(sharedJob.store_preserved, true);
    assert.deepEqual(sharedJob.cleanup_scope_prefixes, [`${DB_MERCH_C}/${siteShared1Id}`]);
    assert.deepEqual(sharedJob.cleanup_object_paths, [
      `${DB_MERCH_C}/${storeSharedId}/products/site1-exclusive.png`,
    ]);

    // Authenticated merchant cannot call cleanup RPCs or read cleanup table via RLS
    await setDbSession(DB_MERCH_A, 'merchant.a@amaas.test', 'authenticated');
    let clientRpcBlocked = false;
    try {
      await db.query(
        `SELECT public.admin_record_website_storage_cleanup_result('${siteAId}'::uuid, '${DB_ADMIN}'::uuid, 'completed', 1);`
      );
    } catch {
      clientRpcBlocked = true;
    }
    assert.equal(clientRpcBlocked, true);
    const merchRows = await db.query(`SELECT id FROM public.website_deletion_storage_cleanups;`);
    assert.equal(merchRows.rows.length, 0);

    // Service role records partial failure -> lists pending jobs -> marks completed
    await setDbSession(null, null, 'service_role');
    const partialRes = await db.query<{ res: { success: boolean; cleanupStatus: string; attemptCount: number } }>(`
      SELECT public.admin_record_website_storage_cleanup_result(
        '${siteAId}'::uuid,
        '${DB_ADMIN}'::uuid,
        'partial_failed',
        1,
        '["${DB_MERCH_A}/${siteAId}/heroes/hero-1.png"]'::jsonb,
        'Transient 503 during storage delete'
      ) AS res;
    `);
    assert.equal(partialRes.rows[0].res.success, true);
    assert.equal(partialRes.rows[0].res.cleanupStatus, 'partial_failed');
    assert.equal(partialRes.rows[0].res.attemptCount, 1);

    const pendingRes = await db.query<{ res: { success: boolean; jobs: Array<{ websiteId: string }> } }>(
      `SELECT public.admin_get_pending_website_storage_cleanups('${DB_ADMIN}'::uuid, 20) AS res;`
    );
    assert.equal(pendingRes.rows[0].res.success, true);
    assert.ok(pendingRes.rows[0].res.jobs.some((j) => j.websiteId === siteAId));

    const completeRes = await db.query<{ res: { success: boolean; cleanupStatus: string; deletedObjectsCount: number; attemptCount: number } }>(`
      SELECT public.admin_record_website_storage_cleanup_result(
        '${siteAId}'::uuid,
        '${DB_ADMIN}'::uuid,
        'completed',
        1,
        '[]'::jsonb,
        NULL
      ) AS res;
    `);
    assert.equal(completeRes.rows[0].res.success, true);
    assert.equal(completeRes.rows[0].res.cleanupStatus, 'completed');
    assert.equal(completeRes.rows[0].res.deletedObjectsCount, 2);
    assert.equal(completeRes.rows[0].res.attemptCount, 2);
  });

  await check('3.15 DB Issue 2 (Store Exclusivity Verification): single-website stores used by Merchant Dashboard, profiles.store_id, team members, dashboard products/orders/customers/inventory, service trials, or ownership mismatch are PRESERVED while website-exclusive products are removed', async () => {
    await setDbSession(null, null, 'postgres');

    const createSingleSiteScenario = async (opts: {
      ownerId: string;
      siteUserId?: string;
      subdomain: string;
      onboardedProfile?: boolean;
      extraProfileUserId?: string;
      addStaffMember?: boolean;
      addDashboardProduct?: boolean;
      addDashboardOrder?: boolean;
      addManualCustomer?: boolean;
      addDashboardTrial?: boolean;
      addDashboardPayment?: boolean;
      preexistingDaysAgo?: number;
    }) => {
      const storeId = (
        await db.query<{ id: string }>(
          `INSERT INTO public.stores (owner_id, name, slug, category, currency${
            opts.preexistingDaysAgo ? ', created_at' : ''
          }) VALUES ('${opts.ownerId}', 'Store ${opts.subdomain}', 'store-${opts.subdomain}', 'Retail', '৳'${
            opts.preexistingDaysAgo ? `, NOW() - INTERVAL '${opts.preexistingDaysAgo} days'` : ''
          }) RETURNING id;`
        )
      ).rows[0].id;

      const siteId = (
        await db.query<{ id: string }>(`
          INSERT INTO public.subscribed_websites (
            user_id, store_id, business_name, niche, subdomain, full_domain,
            template_id, template_name, status, payment_status, deployment_status,
            current_period_end, grace_period_end
          ) VALUES (
            '${opts.siteUserId || opts.ownerId}', '${storeId}', 'Site ${opts.subdomain}', 'ecommerce', '${opts.subdomain}', '${opts.subdomain}.amaas.xyz',
            't1', 'Modern', 'active', 'paid', 'live',
            NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days'
          ) RETURNING id;
        `)
      ).rows[0].id;

      if (opts.onboardedProfile) {
        await db.exec(
          `UPDATE public.profiles SET store_id = '${storeId}', onboarding_completed = true WHERE id = '${opts.ownerId}';`
        );
      } else if (opts.preexistingDaysAgo) {
        await db.exec(
          `UPDATE public.profiles SET store_id = '${storeId}', onboarding_completed = false WHERE id = '${opts.ownerId}';`
        );
      }

      if (opts.extraProfileUserId) {
        await db.exec(
          `UPDATE public.profiles SET store_id = '${storeId}' WHERE id = '${opts.extraProfileUserId}';`
        );
      }

      if (opts.addStaffMember) {
        await setDbSession(opts.ownerId, 'merchant.a@amaas.test', 'authenticated');
        await db.exec(`
          INSERT INTO public.store_members (store_id, user_id, name, email, role, status)
          VALUES ('${storeId}', NULL, 'Team Staff', 'team-${opts.subdomain}@amaas.test', 'staff', 'invited');
        `);
        await setDbSession(null, null, 'postgres');
      }

      let siteProdId: string | null = null;
      if (!opts.preexistingDaysAgo) {
        siteProdId = (
          await db.query<{ id: string }>(`
            INSERT INTO public.products (store_id, website_id, name, sku, price, stock)
            VALUES ('${storeId}', '${siteId}', 'Site Only Item', 'SKU-${opts.subdomain}-W', 400, 5)
            RETURNING id;
          `)
        ).rows[0].id;
      }

      let dashProdId: string | null = null;
      if (opts.addDashboardProduct) {
        dashProdId = (
          await db.query<{ id: string }>(`
            INSERT INTO public.products (store_id, website_id, name, sku, price, stock)
            VALUES ('${storeId}', NULL, 'Dashboard POS Item', 'SKU-${opts.subdomain}-D', 800, 9)
            RETURNING id;
          `)
        ).rows[0].id;
        await db.exec(`
          INSERT INTO public.inventory_movements (store_id, product_id, product_name, type, quantity_change, new_stock, reason)
          VALUES ('${storeId}', '${dashProdId}', 'Dashboard POS Item', 'restock', 9, 9, 'Dashboard restock');
        `);
      }

      if (opts.addDashboardOrder) {
        await db.exec(`
          INSERT INTO public.orders (store_id, order_number, customer_name, customer_phone, address, city, total, subtotal, source, items)
          VALUES ('${storeId}', 'ORD-DASH-${opts.subdomain}', 'Walk-in Buyer', '01800000000', 'Dhaka', 'Dhaka', 800, 800, 'Dashboard', '[{"name":"Manual Sale","qty":1}]'::jsonb);
        `);
      }

      if (opts.addManualCustomer) {
        await db.exec(`
          INSERT INTO public.customers (store_id, name, phone, email)
          VALUES ('${storeId}', 'Manual CRM Client', '01900000000', 'crm-${opts.subdomain}@amaas.test');
        `);
      }

      if (opts.addDashboardTrial) {
        await db.exec(`
          INSERT INTO public.service_trials (user_id, store_id, service_id, service_name, service_category)
          VALUES ('${opts.ownerId}', '${storeId}', 'dashboard_pro', 'Dashboard Pro', 'dashboard');
        `);
      }

      if (opts.addDashboardPayment) {
        await db.exec(`
          INSERT INTO public.payment_requests (
            user_id, store_id, customer_name, customer_phone, customer_email,
            service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, status
          ) VALUES (
            '${opts.ownerId}', '${storeId}', 'Merchant', '01711111111', 'merchant@amaas.test',
            'dashboard_plan', 'dashboard_pro', 'Dashboard Pro', 'Pro', 1200, 'bKash', 'TRX-DASH-${opts.subdomain}', 'approved'
          );
        `);
      }

      return { storeId, siteId, siteProdId, dashProdId };
    };

    const DB_MERCH_PREEX = '55555555-5555-4555-8555-555555555555';
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${DB_MERCH_PREEX}', 'preex.merchant@amaas.test');
      INSERT INTO public.profiles (id, email, full_name, role)
      VALUES ('${DB_MERCH_PREEX}', 'preex.merchant@amaas.test', 'Preexisting Merchant', 'merchant')
      ON CONFLICT (id) DO NOTHING;
    `);

    const s1 = await createSingleSiteScenario({
      ownerId: DB_MERCH_A,
      subdomain: 'iso-onboarded',
      onboardedProfile: true,
    });
    const s2 = await createSingleSiteScenario({
      ownerId: DB_MERCH_A,
      subdomain: 'iso-team',
      addStaffMember: true,
    });
    const s3 = await createSingleSiteScenario({
      ownerId: DB_MERCH_A,
      subdomain: 'iso-dash-prod',
      addDashboardProduct: true,
    });
    const s4 = await createSingleSiteScenario({
      ownerId: DB_MERCH_A,
      subdomain: 'iso-dash-order-crm',
      addDashboardOrder: true,
      addManualCustomer: true,
    });
    const s5 = await createSingleSiteScenario({
      ownerId: DB_MERCH_A,
      subdomain: 'iso-workflows',
      addDashboardTrial: true,
      addDashboardPayment: true,
    });
    const s6 = await createSingleSiteScenario({
      ownerId: DB_MERCH_B,
      siteUserId: DB_MERCH_A,
      subdomain: 'iso-owner-mismatch',
    });
    const s7 = await createSingleSiteScenario({
      ownerId: DB_MERCH_PREEX,
      subdomain: 'iso-preexisting-prof',
      preexistingDaysAgo: 7,
    });

    await setDbSession(null, null, 'service_role');

    const runAndAssertPreserved = async (
      scenario: { storeId: string; siteId: string; siteProdId: string | null; dashProdId: string | null },
      subdomain: string,
      expectedReason: string
    ) => {
      const delRes = await db.query<{
        res: {
          success: boolean;
          deletedWebsiteId: string;
          deletedStoreId: string | null;
          preservedStoreId: string | null;
          isSharedStore: boolean;
          storePreserved: boolean;
          storePreservationReasons: string[];
          deletedProductIds: string[];
        };
      }>(
        `SELECT public.admin_permanently_delete_website('${scenario.siteId}'::uuid, '${DB_ADMIN}'::uuid, '${subdomain}', 'Issue 2 exclusivity test') AS res;`
      );
      const out = delRes.rows[0].res;
      assert.equal(out.success, true);
      assert.equal(out.deletedWebsiteId, scenario.siteId);
      assert.equal(out.deletedStoreId, null, `${subdomain}: store must NOT be deleted`);
      assert.equal(out.preservedStoreId, scenario.storeId);
      assert.equal(out.isSharedStore, false);
      assert.equal(out.storePreserved, true);
      assert.ok(
        out.storePreservationReasons.includes(expectedReason),
        `${subdomain}: expected reason ${expectedReason}, got ${JSON.stringify(out.storePreservationReasons)}`
      );
      if (scenario.siteProdId) {
        assert.deepEqual(out.deletedProductIds, [scenario.siteProdId]);
      }

      const verifyDb = await db.query<{
        site_cnt: string;
        store_cnt: string;
        site_prod_cnt: string;
        dash_prod_cnt: string;
      }>(`
        SELECT
          (SELECT COUNT(*) FROM public.subscribed_websites WHERE id = '${scenario.siteId}') AS site_cnt,
          (SELECT COUNT(*) FROM public.stores WHERE id = '${scenario.storeId}') AS store_cnt,
          ${scenario.siteProdId ? `(SELECT COUNT(*) FROM public.products WHERE id = '${scenario.siteProdId}')` : '0'} AS site_prod_cnt,
          ${scenario.dashProdId ? `(SELECT COUNT(*) FROM public.products WHERE id = '${scenario.dashProdId}')` : '0'} AS dash_prod_cnt;
      `);
      assert.equal(Number(verifyDb.rows[0].site_cnt), 0);
      assert.equal(Number(verifyDb.rows[0].store_cnt), 1);
      assert.equal(Number(verifyDb.rows[0].site_prod_cnt), 0);
      if (scenario.dashProdId) {
        assert.equal(Number(verifyDb.rows[0].dash_prod_cnt), 1);
      }
    };

    await runAndAssertPreserved(s1, 'iso-onboarded', 'merchant_dashboard_onboarded_store');
    await runAndAssertPreserved(s2, 'iso-team', 'team_store_members');
    await runAndAssertPreserved(s3, 'iso-dash-prod', 'non_website_or_shared_products');
    await runAndAssertPreserved(s4, 'iso-dash-order-crm', 'non_website_orders');
    await runAndAssertPreserved(s5, 'iso-workflows', 'non_website_service_workflows');
    await runAndAssertPreserved(s6, 'iso-owner-mismatch', 'ownership_mismatch');
    await runAndAssertPreserved(s7, 'iso-preexisting-prof', 'preexisting_profile_store_without_website_records');

    // Verify s4 manual order/customer & s5 trial/payment remained completely intact
    const s4s5Check = await db.query<{ ord_cnt: string; cust_cnt: string; tr_cnt: string; pr_cnt: string }>(`
      SELECT
        (SELECT COUNT(*) FROM public.orders WHERE store_id = '${s4.storeId}' AND source = 'Dashboard') AS ord_cnt,
        (SELECT COUNT(*) FROM public.customers WHERE store_id = '${s4.storeId}') AS cust_cnt,
        (SELECT COUNT(*) FROM public.service_trials WHERE store_id = '${s5.storeId}' AND service_category = 'dashboard') AS tr_cnt,
        (SELECT COUNT(*) FROM public.payment_requests WHERE store_id = '${s5.storeId}' AND service_type = 'dashboard_plan') AS pr_cnt;
    `);
    assert.equal(Number(s4s5Check.rows[0].ord_cnt), 1);
    assert.equal(Number(s4s5Check.rows[0].cust_cnt), 1);
    assert.equal(Number(s4s5Check.rows[0].tr_cnt), 1);
    assert.equal(Number(s4s5Check.rows[0].pr_cnt), 1);
  });

  await check('3.16 DB Storage Ownership & Fail-Safe Audit: protects sibling configs/drafts, surviving orders, support_tickets & unowned general/foreign/other-bucket URLs while recording manual review and idempotent retries', async () => {
    await setDbSession(null, null, 'postgres');
    const storeStgId = (
      await db.query<{ id: string }>(
        `INSERT INTO public.stores (owner_id, name, slug, category, currency) VALUES ('${DB_MERCH_C}', 'Storage Audit Store', 'storage-audit-store', 'Retail', '৳') RETURNING id;`
      )
    ).rows[0].id;
    const siteSurvId = (
      await db.query<{ id: string }>(
        `INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status, payment_status, deployment_status, current_period_end, grace_period_end)
         VALUES ('${DB_MERCH_C}', '${storeStgId}', 'Surviving Audit Site', 'ecommerce', 'audit-surv', 'audit-surv.amaas.xyz', 't1', 'Modern', 'active', 'paid', 'live', NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days') RETURNING id;`
      )
    ).rows[0].id;
    const siteDelId = (
      await db.query<{ id: string }>(
        `INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status, payment_status, deployment_status, current_period_end, grace_period_end)
         VALUES ('${DB_MERCH_C}', '${storeStgId}', 'Deleted Audit Site', 'ecommerce', 'audit-del', 'audit-del.amaas.xyz', 't1', 'Modern', 'active', 'paid', 'live', NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days') RETURNING id;`
      )
    ).rows[0].id;

    const safeSiteImgPath = `${DB_MERCH_C}/${siteDelId}/heroes/exclusive-hero.png`;
    const safeProdImgPath = `${DB_MERCH_C}/${storeStgId}/products/exclusive-item.png`;
    const sharedSiblingProdImgPath = `${DB_MERCH_C}/${storeStgId}/products/shared-via-draft.png`;
    const orderSnapImgPath = `${DB_MERCH_C}/${siteDelId}/products/ordered-snapshot.png`;
    const unownedGeneralPath = `${DB_MERCH_C}/general/shared-brand.png`;
    const foreignOwnerPath = `${DB_MERCH_B}/99999999-9999-4999-8999-999999999999/foreign.png`;
    const otherBucketUrl = `https://mock.supabase.co/storage/v1/object/public/other-bucket/asset.png`;
    const ticketImgPath = `${DB_MERCH_C}/${siteDelId}/tickets/evidence.png`;

    await db.exec(`
      INSERT INTO public.products (store_id, website_id, name, sku, price, stock, image_url) VALUES
        ('${storeStgId}', '${siteDelId}', 'Exclusive Asset Prod', 'STG-1', 100, 5, 'https://mock.supabase.co/storage/v1/object/public/website-assets/${safeProdImgPath}'),
        ('${storeStgId}', '${siteDelId}', 'Sibling Draft Image Prod', 'STG-2', 200, 5, 'https://mock.supabase.co/storage/v1/object/public/website-assets/${sharedSiblingProdImgPath}'),
        ('${storeStgId}', '${siteDelId}', 'Order Snapshot Image Prod', 'STG-3', 300, 5, 'https://mock.supabase.co/storage/v1/object/public/website-assets/${orderSnapImgPath}');

      UPDATE public.subscribed_websites
      SET config = jsonb_build_object(
        'heroImageUrl', 'https://mock.supabase.co/storage/v1/object/public/website-assets/${safeSiteImgPath}',
        'logoUrl', 'https://mock.supabase.co/storage/v1/object/public/website-assets/${unownedGeneralPath}',
        'bannerImageUrl', 'https://mock.supabase.co/storage/v1/object/public/website-assets/${foreignOwnerPath}',
        'sections', jsonb_build_array(
          jsonb_build_object('imageUrl', '${otherBucketUrl}', 'items', jsonb_build_array(
            jsonb_build_object('imageUrl', 'https://mock.supabase.co/storage/v1/object/public/website-assets/${ticketImgPath}')
          ))
        )
      )
      WHERE id = '${siteDelId}';

      UPDATE public.subscribed_websites
      SET config = jsonb_build_object(
        'draft', jsonb_build_object(
          'sections', jsonb_build_array(
            jsonb_build_object('items', jsonb_build_array(
              jsonb_build_object('imageUrl', 'https://mock.supabase.co/storage/v1/object/public/website-assets/${sharedSiblingProdImgPath}')
            ))
          )
        )
      )
      WHERE id = '${siteSurvId}';

      INSERT INTO public.orders (store_id, order_number, customer_name, customer_phone, address, city, total, subtotal, source, items)
      VALUES (
        '${storeStgId}', 'ORD-AUDIT-SNAP', 'Snap Buyer', '01755555555', 'Dhaka', 'Dhaka', 300, 300,
        'Website (audit-del.amaas.xyz)',
        jsonb_build_array(
          jsonb_build_object(
            'name', 'Order Snapshot Image Prod',
            'qty', 1,
            'imageUrl', 'https://mock.supabase.co/storage/v1/object/public/website-assets/${orderSnapImgPath}',
            'orderMeta', jsonb_build_object('websiteId', '${siteDelId}')
          )
        )
      );

      INSERT INTO public.support_tickets (ticket_number, user_id, subject, category, messages)
      VALUES (
        'TKT-AUDIT-001',
        '${DB_MERCH_B}', 'Unrelated ticket referencing image', 'technical',
        jsonb_build_array(jsonb_build_object('text', 'Ref', 'attachmentUrl', 'https://mock.supabase.co/storage/v1/object/public/website-assets/${ticketImgPath}'))
      );
    `);

    await setDbSession(null, null, 'service_role');
    const delAuditRes = await db.query<{
      res: {
        success: boolean;
        deletedStoreId: string | null;
        cleanupObjectPaths: string[];
        preservedReferencedObjectPaths: string[];
        manualReviewObjectPaths: string[];
        manualReviewRequired: boolean;
      };
    }>(
      `SELECT public.admin_permanently_delete_website('${siteDelId}'::uuid, '${DB_ADMIN}'::uuid, 'audit-del', 'Storage ownership audit') AS res;`
    );
    const out = delAuditRes.rows[0].res;
    assert.equal(out.success, true);
    assert.equal(out.deletedStoreId, null);

    // Only truly exclusive, verified-ownership paths are in cleanupObjectPaths
    assert.ok(out.cleanupObjectPaths.includes(safeSiteImgPath));
    assert.ok(out.cleanupObjectPaths.includes(safeProdImgPath));
    assert.ok(!out.cleanupObjectPaths.includes(sharedSiblingProdImgPath));
    assert.ok(!out.cleanupObjectPaths.includes(orderSnapImgPath));
    assert.ok(!out.cleanupObjectPaths.includes(unownedGeneralPath));
    assert.ok(!out.cleanupObjectPaths.includes(foreignOwnerPath));
    assert.ok(!out.cleanupObjectPaths.includes(otherBucketUrl));
    assert.ok(!out.cleanupObjectPaths.includes(ticketImgPath));

    // Surviving references from draft, orders, and support_tickets are all preserved!
    assert.ok(out.preservedReferencedObjectPaths.includes(sharedSiblingProdImgPath));
    assert.ok(out.preservedReferencedObjectPaths.includes(orderSnapImgPath));
    assert.ok(out.preservedReferencedObjectPaths.includes(ticketImgPath));

    // Unowned general/foreign/other-bucket URLs are flagged for manual review!
    assert.equal(out.manualReviewRequired, true);
    assert.ok(out.manualReviewObjectPaths.includes(unownedGeneralPath));
    assert.ok(out.manualReviewObjectPaths.includes(foreignOwnerPath));
    assert.ok(out.manualReviewObjectPaths.includes(otherBucketUrl));

    // Pre-Storage-DELETE global verification excludes referenced paths and approves safe ones
    const verifyRes = await db.query<{
      res: { success: boolean; safeToDeletePaths: string[]; referencedPaths: string[] };
    }>(`
      SELECT public.admin_verify_storage_paths_for_deletion(
        '${DB_ADMIN}'::uuid,
        to_jsonb(ARRAY['${safeSiteImgPath}', '${orderSnapImgPath}', '${ticketImgPath}']),
        '${siteDelId}'::uuid
      ) AS res;
    `);
    assert.equal(verifyRes.rows[0].res.success, true);
    assert.deepEqual(verifyRes.rows[0].res.safeToDeletePaths, [safeSiteImgPath]);
    assert.ok(verifyRes.rows[0].res.referencedPaths.includes(orderSnapImgPath));
    assert.ok(verifyRes.rows[0].res.referencedPaths.includes(ticketImgPath));

    // Idempotent duplicate completion test when manual review paths are cleared later
    const completeOnce = await db.query<{
      res: { success: boolean; idempotent: boolean; cleanupStatus: string; deletedObjectsCount: number };
    }>(`
      SELECT public.admin_record_website_storage_cleanup_result(
        '${siteDelId}'::uuid, '${DB_ADMIN}'::uuid, 'completed', 2, '[]'::jsonb, NULL, '[]'::jsonb
      ) AS res;
    `);
    assert.equal(completeOnce.rows[0].res.success, true);
    assert.equal(completeOnce.rows[0].res.idempotent, false);
    assert.equal(completeOnce.rows[0].res.cleanupStatus, 'completed');
    assert.equal(completeOnce.rows[0].res.deletedObjectsCount, 2);

    const completeDup = await db.query<{
      res: { success: boolean; idempotent: boolean; cleanupStatus: string; deletedObjectsCount: number };
    }>(`
      SELECT public.admin_record_website_storage_cleanup_result(
        '${siteDelId}'::uuid, '${DB_ADMIN}'::uuid, 'completed', 2, '[]'::jsonb, NULL, '[]'::jsonb
      ) AS res;
    `);
    assert.equal(completeDup.rows[0].res.success, true);
    assert.equal(completeDup.rows[0].res.idempotent, true);
    assert.equal(completeDup.rows[0].res.deletedObjectsCount, 2);

    // Non-service_role client cannot invoke admin_verify_storage_paths_for_deletion or admin_get_website_storage_cleanup_job
    await setDbSession(DB_MERCH_C, 'merchant.c@amaas.test', 'authenticated');
    let verifyBlocked = false;
    try {
      await db.query(
        `SELECT public.admin_verify_storage_paths_for_deletion('${DB_ADMIN}'::uuid, '[]'::jsonb, '${siteDelId}'::uuid);`
      );
    } catch {
      verifyBlocked = true;
    }
    assert.equal(verifyBlocked, true);
  });

  await check('3.17 Concurrent DB writes flip storage_deletion_reservations to referenced_aborted via triggers, verification excludes them, retries deduplicate, and unauthorized RPC calls fail', async () => {
    await setDbSession(null, null, 'postgres');

    const storeRaceId = (
      await db.query<{ id: string }>(
        `INSERT INTO public.stores (owner_id, name, slug, category, currency) VALUES ('${DB_MERCH_C}', 'Race Guard Store', 'race-guard-store', 'Retail', '৳') RETURNING id;`
      )
    ).rows[0].id;

    const siteRaceDelId = (
      await db.query<{ id: string }>(
        `INSERT INTO public.subscribed_websites (
          user_id, store_id, business_name, niche, subdomain, full_domain,
          template_id, template_name, status, payment_status, deployment_status,
          current_period_end, grace_period_end
        ) VALUES (
          '${DB_MERCH_C}', '${storeRaceId}', 'Race Del Site', 'ecommerce', 'race-del', 'race-del.amaas.xyz',
          't1', 'Modern', 'active', 'paid', 'live',
          NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days'
        ) RETURNING id;`
      )
    ).rows[0].id;

    const siteRaceSurvId = (
      await db.query<{ id: string }>(
        `INSERT INTO public.subscribed_websites (
          user_id, store_id, business_name, niche, subdomain, full_domain,
          template_id, template_name, status, payment_status, deployment_status,
          current_period_end, grace_period_end
        ) VALUES (
          '${DB_MERCH_C}', '${storeRaceId}', 'Race Surv Site', 'ecommerce', 'race-surv', 'race-surv.amaas.xyz',
          't1', 'Modern', 'active', 'paid', 'live',
          NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days'
        ) RETURNING id;`
      )
    ).rows[0].id;

    const survProdRaceId = (
      await db.query<{ id: string }>(
        `INSERT INTO public.products (store_id, website_id, name, sku, price, stock, image_url)
         VALUES ('${storeRaceId}', '${siteRaceSurvId}', 'Surviving Race Prod', 'RACE-SURV-1', 250, 10, NULL)
         RETURNING id;`
      )
    ).rows[0].id;

    const pathOrderRace = `${DB_MERCH_C}/${siteRaceDelId}/heroes/order-race.png`;
    const pathProdRace = `${DB_MERCH_C}/${storeRaceId}/products/prod-race.png`;
    const pathSiteRace = `${DB_MERCH_C}/${siteRaceDelId}/banners/site-race.png`;
    const pathSafeDelete = `${DB_MERCH_C}/${siteRaceDelId}/heroes/truly-exclusive.png`;

    await db.exec(`
      INSERT INTO public.products (store_id, website_id, name, sku, price, stock, image_url)
      VALUES ('${storeRaceId}', '${siteRaceDelId}', 'Deleted Race Prod', 'RACE-DEL-1', 150, 4,
        'https://mock.supabase.co/storage/v1/object/public/website-assets/${pathProdRace}');

      UPDATE public.subscribed_websites
      SET config = jsonb_build_object(
        'heroImageUrl', 'https://mock.supabase.co/storage/v1/object/public/website-assets/${pathOrderRace}',
        'bannerImageUrl', 'https://mock.supabase.co/storage/v1/object/public/website-assets/${pathSiteRace}',
        'sections', jsonb_build_array(
          jsonb_build_object('imageUrl', 'https://mock.supabase.co/storage/v1/object/public/website-assets/${pathSafeDelete}')
        )
      )
      WHERE id = '${siteRaceDelId}';
    `);

    await setDbSession(null, null, 'service_role');
    const delRace = await db.query<{
      res: { success: boolean; cleanupObjectPaths: string[] };
    }>(
      `SELECT public.admin_permanently_delete_website('${siteRaceDelId}'::uuid, '${DB_ADMIN}'::uuid, 'race-del', 'Race reservation check') AS res;`
    );
    assert.equal(delRace.rows[0].res.success, true);
    assert.ok(delRace.rows[0].res.cleanupObjectPaths.includes(pathOrderRace));
    assert.ok(delRace.rows[0].res.cleanupObjectPaths.includes(pathProdRace));
    assert.ok(delRace.rows[0].res.cleanupObjectPaths.includes(pathSiteRace));
    assert.ok(delRace.rows[0].res.cleanupObjectPaths.includes(pathSafeDelete));

    // Reservations created atomically as 'reserved'
    const resRows = await db.query<{ object_path: string; status: string }>(
      `SELECT object_path, status FROM public.storage_deletion_reservations WHERE website_id = '${siteRaceDelId}'::uuid;`
    );
    assert.equal(resRows.rows.length, 4);
    assert.ok(resRows.rows.every((r) => r.status === 'reserved'));

    // Concurrent DB writers reference 3 of those paths AFTER deletion committed
    await setDbSession(null, null, 'postgres');
    await db.exec(`
      INSERT INTO public.orders (store_id, order_number, customer_name, customer_phone, address, city, total, subtotal, source, items)
      VALUES (
        '${storeRaceId}', 'ORD-RACE-CONC', 'Concurrent Buyer', '01766666666', 'Dhaka', 'Dhaka', 150, 150,
        'Website (race-surv.amaas.xyz)',
        jsonb_build_array(jsonb_build_object(
          'name', 'Concurrent Item',
          'qty', 1,
          'imageUrl', 'https://mock.supabase.co/storage/v1/object/public/website-assets/${pathOrderRace}'
        ))
      );

      UPDATE public.products
      SET image_url = 'https://mock.supabase.co/storage/v1/object/public/website-assets/${pathProdRace}'
      WHERE id = '${survProdRaceId}'::uuid;

      UPDATE public.subscribed_websites
      SET config = jsonb_build_object(
        'bannerImageUrl', 'https://mock.supabase.co/storage/v1/object/public/website-assets/${pathSiteRace}'
      )
      WHERE id = '${siteRaceSurvId}'::uuid;
    `);

    await setDbSession(null, null, 'service_role');
    const postWriteResRows = await db.query<{ object_path: string; status: string }>(
      `SELECT object_path, status FROM public.storage_deletion_reservations WHERE website_id = '${siteRaceDelId}'::uuid;`
    );
    const statusMap = new Map(postWriteResRows.rows.map((r) => [r.object_path, r.status]));
    assert.equal(statusMap.get(pathOrderRace), 'referenced_aborted');
    assert.equal(statusMap.get(pathProdRace), 'referenced_aborted');
    assert.equal(statusMap.get(pathSiteRace), 'referenced_aborted');
    assert.equal(statusMap.get(pathSafeDelete), 'reserved');

    // Global verify RPC sees all 3 aborted paths + excludes them, returning only pathSafeDelete
    const raceVerify = await db.query<{
      res: {
        success: boolean;
        verificationToken: string;
        safeToDeletePaths: string[];
        referencedPaths: string[];
        abortedPaths: string[];
      };
    }>(`
      SELECT public.admin_verify_storage_paths_for_deletion(
        '${DB_ADMIN}'::uuid,
        to_jsonb(ARRAY['${pathOrderRace}', '${pathProdRace}', '${pathSiteRace}', '${pathSafeDelete}']),
        '${siteRaceDelId}'::uuid
      ) AS res;
    `);
    assert.equal(raceVerify.rows[0].res.success, true);
    assert.ok(raceVerify.rows[0].res.verificationToken.length > 10);
    assert.deepEqual(raceVerify.rows[0].res.safeToDeletePaths, [pathSafeDelete]);
    assert.ok(raceVerify.rows[0].res.abortedPaths.includes(pathOrderRace));
    assert.ok(raceVerify.rows[0].res.abortedPaths.includes(pathProdRace));
    assert.ok(raceVerify.rows[0].res.abortedPaths.includes(pathSiteRace));

    // Record partial with explicit p_deleted_paths & verify overlapping retry deduplicates
    const rec1 = await db.query<{
      res: {
        success: boolean;
        deletedObjectsCount: number;
        lateConcurrentReferencePaths: string[];
      };
    }>(`
      SELECT public.admin_record_website_storage_cleanup_result(
        '${siteRaceDelId}'::uuid,
        '${DB_ADMIN}'::uuid,
        'partial_failed',
        1,
        to_jsonb(ARRAY['${pathSafeDelete}']),
        'Retry test',
        '[]'::jsonb,
        to_jsonb(ARRAY['${pathSafeDelete}']),
        '${raceVerify.rows[0].res.verificationToken}'::uuid
      ) AS res;
    `);
    assert.equal(rec1.rows[0].res.deletedObjectsCount, 1);
    assert.equal(rec1.rows[0].res.lateConcurrentReferencePaths.length, 3);

    // Retry overlapping SAME path -> count must NOT increase to 2!
    const rec2 = await db.query<{
      res: { success: boolean; deletedObjectsCount: number; cleanupStatus: string };
    }>(`
      SELECT public.admin_record_website_storage_cleanup_result(
        '${siteRaceDelId}'::uuid,
        '${DB_ADMIN}'::uuid,
        'completed',
        1,
        '[]'::jsonb,
        NULL,
        '[]'::jsonb,
        to_jsonb(ARRAY['${pathSafeDelete}']),
        '${raceVerify.rows[0].res.verificationToken}'::uuid
      ) AS res;
    `);
    assert.equal(rec2.rows[0].res.deletedObjectsCount, 1);
    assert.equal(rec2.rows[0].res.cleanupStatus, 'completed');

    // Invalid secondary admin ID fails even under service_role
    let secondaryBlocked = false;
    try {
      await db.query(
        `SELECT public.admin_verify_storage_paths_for_deletion('${DB_SECONDARY_ADMIN}'::uuid, '[]'::jsonb, '${siteRaceDelId}'::uuid);`
      );
    } catch {
      secondaryBlocked = true;
    }
    assert.equal(secondaryBlocked, true);

    // Direct client (authenticated / anon) cannot access storage_deletion_reservations or record cleanup RPC
    await setDbSession(DB_MERCH_C, 'merchant.c@amaas.test', 'authenticated');
    let directTableBlocked = false;
    try {
      await db.query(`SELECT * FROM public.storage_deletion_reservations LIMIT 1;`);
    } catch {
      directTableBlocked = true;
    }
    assert.equal(directTableBlocked, true);

    let directRecordBlocked = false;
    try {
      await db.query(
        `SELECT public.admin_record_website_storage_cleanup_result('${siteRaceDelId}'::uuid, '${DB_ADMIN}'::uuid, 'completed', 0);`
      );
    } catch {
      directRecordBlocked = true;
    }
    assert.equal(directRecordBlocked, true);
  });

  await db.close();
  console.log(`\nALL CHECKS PASSED (${passed}/${passed})`);
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});

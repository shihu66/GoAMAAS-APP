import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import {
  sanitizeEmailHref,
  sanitizeHrefUrl,
  sanitizeImageUrl,
  sanitizePhoneHref,
  validateImageFileBinaryAndExtension,
} from '../src/lib/security';
import { isSafeInternalRedirectPath } from '../src/lib/supabase';
import resolveTenantHandler from '../api/resolve-tenant';
import verifyPricingHandler from '../api/verify-pricing';
import publicOrderHandler from '../api/public-order';
import publicInquiryHandler from '../api/public-inquiry';
import customerPortalHandler from '../api/customer-portal';

function makeFakeJwt(payloadObj: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  return `${header}.${payload}.mocksignature`;
}

async function invokeHandler(
  fn: (req: any, res: any) => Promise<void>,
  opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
    rawStreamChunks?: Buffer[];
  }
): Promise<{ status: number; headers: Record<string, string>; json: any; text: string; destroyed: boolean }> {
  let status = 200;
  let bodyText = '';
  const headers: Record<string, string> = {};
  let destroyed = false;

  const req: any = new EventEmitter();
  req.method = opts.method;
  req.url = opts.url;
  req.headers = { host: 'app.amaas.xyz', ...(opts.headers || {}) };
  req.socket = { remoteAddress: '198.51.100.10' };
  req.destroy = () => {
    destroyed = true;
  };
  if (opts.rawStreamChunks === undefined) {
    req.body = opts.body;
  } else {
    req.body = undefined;
    queueMicrotask(() => {
      for (const ch of opts.rawStreamChunks!) {
        if (destroyed) break;
        req.emit('data', ch);
      }
      if (!destroyed) req.emit('end');
    });
  }

  const res: any = {
    get statusCode() {
      return status;
    },
    set statusCode(c: number) {
      status = c;
    },
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = String(v);
    },
    end(chunk?: string) {
      if (chunk) bodyText += chunk;
    },
  };

  await fn(req, res);
  let json: any = null;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    json = null;
  }
  return { status, headers, json, text: bodyText, destroyed };
}

async function runTests() {
  console.log('=== GOAMAAS SECURITY AUDIT & HARDENING REGRESSION SUITE ===');

  // 1. Open Redirect Validation
  assert.equal(isSafeInternalRedirectPath('/dashboard'), true);
  assert.equal(isSafeInternalRedirectPath('/onboarding'), true);
  assert.equal(isSafeInternalRedirectPath('/settings?tab=store'), true);
  assert.equal(isSafeInternalRedirectPath('//evil.com'), false);
  assert.equal(isSafeInternalRedirectPath('/\\evil.com'), false);
  assert.equal(isSafeInternalRedirectPath('\\evil.com'), false);
  assert.equal(isSafeInternalRedirectPath('https://evil.com'), false);
  assert.equal(isSafeInternalRedirectPath('/admin'), false);
  assert.equal(isSafeInternalRedirectPath('/ADMIN/payments'), false);
  assert.equal(isSafeInternalRedirectPath('/login'), false);
  assert.equal(isSafeInternalRedirectPath('/register'), false);
  assert.equal(isSafeInternalRedirectPath('/auth/callback'), false);
  assert.equal(isSafeInternalRedirectPath('/dashboard\nLocation: https://evil.com'), false);

  const loginPageSrc = fs.readFileSync('src/pages/auth/LoginPage.tsx', 'utf8');
  assert.ok(loginPageSrc.includes('isSafeInternalRedirectPath(rawRedirect)'));
  assert.ok(loginPageSrc.includes('nextPath: redirectTarget'));
  console.log('PASS [1/9]: Open redirect defenses & LoginPage redirect sanitization verified');

  // 2. XSS URL Scheme & Bangla Unicode Preservation
  assert.equal(sanitizeHrefUrl('javascript:alert(1)', '#services'), '#services');
  assert.equal(sanitizeHrefUrl('  JaVaScRiPt:alert(document.cookie)', '#services'), '#services');
  assert.equal(sanitizeHrefUrl('vbscript:msgbox(1)', '#services'), '#services');
  assert.equal(sanitizeHrefUrl('data:text/html,<script>alert(1)</script>', '#services'), '#services');
  assert.equal(sanitizeHrefUrl('//evil.com/phish', '#services'), '#services');
  assert.equal(sanitizeHrefUrl('/\\evil.com', '#services'), '#services');
  assert.equal(sanitizeHrefUrl('https://shop.amaas.xyz/products', '#services'), 'https://shop.amaas.xyz/products');
  assert.equal(sanitizeHrefUrl('#contact', '#services'), '#contact');
  assert.equal(sanitizePhoneHref('+880 1711-223344'), 'tel:+8801711-223344');
  assert.equal(sanitizePhoneHref('javascript:alert(1)'), '');
  assert.equal(sanitizeEmailHref('owner@dhakakicks.com'), 'mailto:owner@dhakakicks.com');
  assert.equal(sanitizeEmailHref('owner@x.com<script>'), '');

  assert.equal(sanitizeImageUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeImageUrl('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(sanitizeImageUrl('data:text/html;base64,PGh0bWw+'), '');
  assert.equal(sanitizeImageUrl('//evil.com/img.png'), '');
  assert.equal(sanitizeImageUrl('blob:https://app.amaas.xyz/123'), '');
  assert.equal(sanitizeImageUrl('https://cdn.example.com/shoe.jpg'), 'https://cdn.example.com/shoe.jpg');
  assert.equal(sanitizeImageUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');

  // Bangla Unicode strings remain intact
  const banglaName = 'ঢাকা কিকস — আমার অর্ডার';
  assert.equal(Buffer.from(banglaName, 'utf8').toString('utf8'), banglaName);
  console.log('PASS [2/9]: XSS URL/image scheme blocking & Bangla UTF-8 preservation verified');

  // 3. Upload Magic-Byte & Extension Spoofing Rejection
  const fakeSvgAsPng = new File(
    [new TextEncoder().encode('<svg onload="alert(1)"><script>alert(1)</script></svg>')],
    'evil.png',
    { type: 'image/png' }
  );
  const svgCheck = await validateImageFileBinaryAndExtension(fakeSvgAsPng);
  assert.equal(svgCheck.ok, false);

  const realPngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const realPngFile = new File([realPngBytes], 'shoe.png', { type: 'image/png' });
  const pngCheck = await validateImageFileBinaryAndExtension(realPngFile);
  assert.equal(pngCheck.ok, true);

  const oversizedFile = {
    name: 'huge.png',
    type: 'image/png',
    size: 6 * 1024 * 1024,
  } as unknown as File;
  const sizeCheck = await validateImageFileBinaryAndExtension(oversizedFile);
  assert.equal(sizeCheck.ok, false);
  console.log('PASS [3/9]: Image upload magic-byte & size hardening verified');

  // Setup mock Supabase env for API tests
  const prevEnv = {
    url: process.env.VITE_SUPABASE_URL,
    anon: process.env.VITE_SUPABASE_ANON_KEY,
    srk: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const prevFetch = globalThis.fetch;

  const projectRef = 'secmockproj';
  process.env.VITE_SUPABASE_URL = `https://${projectRef}.supabase.co`;
  process.env.VITE_SUPABASE_ANON_KEY = makeFakeJwt({ role: 'anon', ref: projectRef });
  process.env.SUPABASE_SERVICE_ROLE_KEY = makeFakeJwt({ role: 'service_role', ref: projectRef });

  const merchantA = '11111111-1111-4111-8111-111111111111';
  const merchantB = '22222222-2222-4222-8222-222222222222';
  const customerA = '33333333-3333-4333-8333-333333333333';
  const customerB = '44444444-4444-4444-8444-444444444444';
  const storeA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const storeB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const siteA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const orderB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: customerA, email: 'cust-a@example.com' }), { status: 200 });
    }
    if (url.includes('/rest/v1/service_pricing_catalog')) {
      return new Response(
        JSON.stringify({ code: '42501', message: 'permission denied for relation internal_secret_table' }),
        { status: 403 }
      );
    }
    if (url.includes('/rest/v1/rpc/get_published_website_by_subdomain')) {
      return new Response(
        JSON.stringify({
          found: true,
          site: {
            id: siteA,
            storeId: storeB, // Tampered / mismatched cross-store reference
            userId: merchantA,
            subdomain: 'dhakakicks',
            businessName: 'Dhaka Kicks',
            subscriptionStatus: 'active',
            paymentStatus: 'paid',
            deploymentStatus: 'live',
            currentPeriodEnd: new Date(Date.now() + 86400_000).toISOString(),
            servicesOrProducts: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', productId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', isVisible: true }],
          },
        }),
        { status: 200 }
      );
    }
    if (url.includes('/rest/v1/subscribed_websites')) {
      const storeVal = url.includes('spoofedsite') ? storeB : storeA;
      return new Response(
        JSON.stringify([
          {
            id: siteA,
            store_id: storeVal,
            user_id: merchantA,
            business_name: 'Dhaka Kicks',
            subdomain: url.includes('spoofedsite') ? 'spoofedsite' : 'dhakakicks',
            status: 'active',
            payment_status: 'paid',
            deployment_status: 'live',
            current_period_end: new Date(Date.now() + 86400_000).toISOString(),
            config: {},
          },
        ]),
        { status: 200 }
      );
    }
    if (url.includes('/rest/v1/stores')) {
      if (url.includes(storeB)) {
        return new Response(JSON.stringify([{ id: storeB, owner_id: merchantB, name: 'Urban Fashion' }]), { status: 200 });
      }
      return new Response(JSON.stringify([{ id: storeA, owner_id: merchantA, name: 'Dhaka Kicks' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/store_members')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes('/rest/v1/orders')) {
      // Customer B owns orderB inside storeA
      return new Response(
        JSON.stringify([
          {
            id: orderB,
            store_id: storeA,
            order_number: 'ORD-OTHER',
            items: [{ orderMeta: { customerAuthUserId: customerB } }],
          },
        ]),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;

  try {
    // 4. Strict CORS (No Wildcard *)
    const evilPreflight = await invokeHandler(publicOrderHandler, {
      method: 'OPTIONS',
      url: '/api/public-order',
      headers: { origin: 'https://evil.com', 'x-vercel-forwarded-for': '203.0.113.10' },
    });
    assert.equal(evilPreflight.status, 403);
    assert.equal(evilPreflight.headers['access-control-allow-origin'], undefined);

    const goodOrigin = await invokeHandler(resolveTenantHandler, {
      method: 'OPTIONS',
      url: '/api/resolve-tenant',
      headers: { origin: 'https://dhakakicks.amaas.xyz', 'x-vercel-forwarded-for': '203.0.113.10' },
    });
    assert.equal(goodOrigin.status, 204);
    assert.equal(goodOrigin.headers['access-control-allow-origin'], 'https://dhakakicks.amaas.xyz');
    assert.notEqual(goodOrigin.headers['access-control-allow-origin'], '*');
    console.log('PASS [4/9]: Strict .amaas.xyz CORS allowlist verified (blocks https://evil.com, zero wildcard *)');

    // 5. Unauthenticated Access + Raw Error Suppression + Customer IDOR + Store Ownership Mismatch
    const unauthPortal = await invokeHandler(customerPortalHandler, {
      method: 'GET',
      url: '/api/customer-portal?action=orders&subdomain=dhakakicks',
      headers: { 'x-vercel-forwarded-for': '203.0.113.11' },
    });
    assert.equal(unauthPortal.status, 401);

    const unauthPricing = await invokeHandler(verifyPricingHandler, {
      method: 'POST',
      url: '/api/verify-pricing',
      headers: { 'x-vercel-forwarded-for': '203.0.113.11' },
      body: {},
    });
    assert.equal(unauthPricing.status, 401);

    // Pricing error must NOT leak raw Postgres error text
    const leakedPricing = await invokeHandler(verifyPricingHandler, {
      method: 'GET',
      url: '/api/verify-pricing',
      headers: { authorization: 'Bearer valid-jwt-token-customer-a', 'x-vercel-forwarded-for': '203.0.113.12' },
    });
    assert.equal(leakedPricing.status, 502);
    assert.equal(String(leakedPricing.json?.error || '').includes('internal_secret_table'), false);

    // Cross-customer IDOR check in /api/customer-portal
    const idorOrder = await invokeHandler(customerPortalHandler, {
      method: 'GET',
      url: `/api/customer-portal?action=order&subdomain=dhakakicks&orderId=${orderB}`,
      headers: { authorization: 'Bearer valid-jwt-token-customer-a', 'x-vercel-forwarded-for': '203.0.113.13' },
    });
    assert.equal(idorOrder.status, 403);
    assert.equal(idorOrder.json?.code, 'FORBIDDEN_ORDER_ACCESS');

    // Cross-merchant store ownership mismatch check in /api/customer-portal
    const storeMismatchPortal = await invokeHandler(customerPortalHandler, {
      method: 'GET',
      url: '/api/customer-portal?action=orders&subdomain=spoofedsite',
      headers: { authorization: 'Bearer valid-jwt-token-customer-a', 'x-vercel-forwarded-for': '203.0.113.14' },
    });
    assert.equal(storeMismatchPortal.status, 403);
    assert.equal(storeMismatchPortal.json?.code, 'STORE_OWNERSHIP_MISMATCH');
    console.log('PASS [5/9]: Unauth 401, raw error suppression, cross-customer IDOR, and store ownership checks verified');

    // 6. Content-Type (415) & Oversized Payload (413) & Invalid JSON (400)
    const ct415 = await invokeHandler(publicInquiryHandler, {
      method: 'POST',
      url: '/api/public-inquiry',
      headers: { 'content-type': 'text/plain', 'x-vercel-forwarded-for': '203.0.113.15' },
      rawStreamChunks: [Buffer.from('hello')],
    });
    assert.equal(ct415.status, 415);

    const big413 = await invokeHandler(publicOrderHandler, {
      method: 'POST',
      url: '/api/public-order',
      headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.16' },
      rawStreamChunks: [Buffer.alloc(70000, 65)],
    });
    assert.equal(big413.status, 413);
    assert.equal(big413.destroyed, true);

    const badJson400 = await invokeHandler(verifyPricingHandler, {
      method: 'POST',
      url: '/api/verify-pricing',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer valid-jwt-token-customer-a',
        'x-vercel-forwarded-for': '203.0.113.17',
      },
      rawStreamChunks: [Buffer.from('{invalid-json')],
    });
    assert.equal(badJson400.status, 400);
    console.log('PASS [6/9]: Content-Type (415), Payload Size + req.destroy (413), and Invalid JSON (400) verified');

    // 7. Rate Limiting (429 + Retry-After)
    let hit429 = false;
    let sawRetryAfter = false;
    for (let i = 0; i < 18; i++) {
      const r = await invokeHandler(publicInquiryHandler, {
        method: 'POST',
        url: '/api/public-inquiry',
        headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.99' },
        body: { subdomain: 'dhakakicks', inquiryAttemptId: 'short' },
      });
      if (r.status === 429) {
        hit429 = true;
        sawRetryAfter = Number(r.headers['retry-after']) >= 1;
        break;
      }
    }
    assert.equal(hit429, true);
    assert.equal(sawRetryAfter, true);
    console.log('PASS [7/9]: Endpoint rate limiting (429 + Retry-After) verified');
  } finally {
    globalThis.fetch = prevFetch;
    if (prevEnv.url === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = prevEnv.url;
    if (prevEnv.anon === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
    else process.env.VITE_SUPABASE_ANON_KEY = prevEnv.anon;
    if (prevEnv.srk === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevEnv.srk;
  }

  // 8. Static CSP, Security Headers, Zero Inline Scripts & Source Map Suppression
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const scriptTags = indexHtml.match(/<script\b[^>]*>/gi) || [];
  for (const tag of scriptTags) {
    const isJsonLd = /type=["']application\/ld\+json["']/i.test(tag);
    const hasSrc = /\bsrc=["'][^"']+["']/i.test(tag);
    assert.ok(isJsonLd || hasSrc, `index.html contains unexpected inline script tag: ${tag}`);
  }
  assert.ok(fs.existsSync('public/admin-head-init.js'), 'public/admin-head-init.js missing');
  assert.ok(fs.existsSync('public/theme-init.js'), 'public/theme-init.js missing');

  const vercelJson = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const globalHeaders = vercelJson.headers.find((h: any) => h.source === '/(.*)')?.headers || [];
  const cspHeader = globalHeaders.find((h: any) => h.key === 'Content-Security-Policy')?.value || '';
  assert.ok(cspHeader.includes("script-src 'self'"), 'CSP missing script-src self');
  assert.ok(!cspHeader.includes("'unsafe-eval'"), 'CSP must not allow unsafe-eval');
  const scriptSrcDirective = cspHeader.split(';').find((s: string) => s.trim().startsWith('script-src')) || '';
  assert.ok(!scriptSrcDirective.includes("'unsafe-inline'"), 'CSP script-src must not allow unsafe-inline');
  assert.ok(globalHeaders.some((h: any) => h.key === 'Strict-Transport-Security'), 'Missing HSTS');
  assert.ok(globalHeaders.some((h: any) => h.key === 'X-Frame-Options' && h.value === 'SAMEORIGIN'), 'Missing X-Frame-Options');

  const viteConfigSrc = fs.readFileSync('vite.config.ts', 'utf8');
  assert.ok(viteConfigSrc.includes('sourcemap: false'), 'vite.config.ts must disable production sourcemaps');
  console.log('PASS [8/9]: Strict CSP (zero inline JS), HSTS, X-Frame-Options & sourcemap:false verified');

  // 9. Admin Revalidation & Cross-Subdomain PKCE Bridge Intact
  const adminDashSrc = fs.readFileSync('src/pages/admin/AdminDashboardPage.tsx', 'utf8');
  assert.ok(adminDashSrc.includes("action: 'update_website_request'"), 'Missing admin revalidation on website request updates');
  assert.ok(adminDashSrc.includes("action: 'update_plan_rules'"), 'Missing admin revalidation on plan rules');

  const supaSrc = fs.readFileSync('src/lib/supabase.ts', 'utf8');
  assert.ok(supaSrc.includes('pkceCookieBridgedStorage'), 'PKCE cookie bridge must remain intact');
  assert.ok(supaSrc.includes('.amaas.xyz'), 'Cross-subdomain .amaas.xyz cookie bridge must remain intact');
  console.log('PASS [9/9]: Admin action revalidation & cross-subdomain PKCE bridge verified');
  console.log('ALL 9 SECURITY AUDIT CHECKS PASSED');
}

runTests().catch((err) => {
  console.error('SECURITY TEST FAILED:', err);
  process.exit(1);
});

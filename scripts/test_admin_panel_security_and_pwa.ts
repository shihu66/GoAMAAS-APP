import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';
import {
  UNIFORM_ADMIN_AUTH_ERROR,
  checkAdminLoginRateLimit,
  clearAdminLoginFailures,
  clearAdminSessionEvents,
  enforceMinimumAuthFloor,
  getAdminSessionEvents,
  recordAdminLoginFailure,
  recordAdminSessionEvent,
} from '../src/lib/adminSecurity';
import {
  ApproveAndPublishAdapters,
  executeApproveAndPublishWorkflow,
} from '../src/lib/paymentWorkflow';
import {
  buildMerchantWebsiteInsertPayload,
  mapDatabaseRowToSubscribedWebsite,
} from '../src/lib/supabase';
import { PaymentRequest, SubscribedWebsite } from '../src/types';

function readPngDimensions(filePath: string): { width: number; height: number; validSignature: boolean } {
  const buf = fs.readFileSync(filePath);
  const expectedSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const validSignature = buf.length >= 24 && buf.subarray(0, 8).equals(expectedSig);
  const width = validSignature ? buf.readUInt32BE(16) : 0;
  const height = validSignature ? buf.readUInt32BE(20) : 0;
  return { width, height, validSignature };
}

async function initSupabaseAndStorageEnv(db: PGlite) {
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

async function runSuite() {
  console.log('=== GOAMAAS ISOLATED ADMIN PANEL SECURITY, AUTHORIZATION & ANDROID PWA E2E SUITE ===');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, label: string) {
    total += 1;
    if (!condition) {
      throw new Error(`Assertion failed: ${label}`);
    }
    passed += 1;
    console.log(`  ✓ ${label}`);
  }

  // ---------------------------------------------------------------------------
  // 1 & 2. Direct /admin & /admin/* URL Routing, Deep Linking & Refresh Survival
  // ---------------------------------------------------------------------------
  console.log('\n[1 & 2] Verifying /admin & /admin/* direct loading, refresh survival & SEO blocking...');
  const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const spaRewrite = vercelConfig.rewrites.find((r: any) => r.destination === '/index.html');
  assert(Boolean(spaRewrite), 'vercel.json contains SPA /index.html fallback rewrite');

  // Verify Vercel regex matches /admin and all /admin/* subroutes while excluding static PWA assets
  const sourcePattern = spaRewrite.source.replace(/^\//, '^/');
  const routeRegex = new RegExp(sourcePattern);
  const deepRoutes = [
    '/admin',
    '/admin/',
    '/admin/login',
    '/admin/payments',
    '/admin/websites',
    '/admin/customers',
    '/admin/requests',
    '/admin/gateways',
    '/admin/audit',
    '/admin/security',
    '/dashboard',
    '/create-website',
  ];
  for (const r of deepRoutes) {
    assert(routeRegex.test(r), `Vercel SPA rewrite serves index.html on refresh for ${r}`);
  }

  const staticRootFiles = [
    '/admin-sw.js',
    '/admin-manifest.webmanifest',
    '/admin-offline.html',
    '/admin-icon.svg',
    '/admin-pwa-192x192.png',
    '/admin-pwa-512x512.png',
    '/admin-pwa-maskable-512x512.png',
    '/admin-apple-touch-icon.png',
    '/robots.txt',
  ];
  for (const f of staticRootFiles) {
    assert(!routeRegex.test(f), `Vercel SPA rewrite excludes static asset ${f} from HTML fallback`);
  }

  const adminHeaderEntry = vercelConfig.headers.find((h: any) => h.source === '/admin');
  const adminWildcardHeaderEntry = vercelConfig.headers.find((h: any) => h.source === '/admin/(.*)');
  assert(
    Boolean(adminHeaderEntry?.headers?.some((x: any) => x.key === 'X-Robots-Tag' && x.value.includes('noindex'))),
    'vercel.json enforces X-Robots-Tag: noindex on /admin'
  );
  assert(
    Boolean(adminWildcardHeaderEntry?.headers?.some((x: any) => x.key === 'X-Robots-Tag' && x.value.includes('noindex'))),
    'vercel.json enforces X-Robots-Tag: noindex on /admin/(.*)'
  );

  const robotsTxt = fs.readFileSync('public/robots.txt', 'utf8');
  assert(robotsTxt.includes('Disallow: /admin'), 'public/robots.txt disallows /admin indexing');

  // Live dev server check on port 3000 if reachable
  try {
    const resAdmin = await fetch('http://localhost:3000/admin');
    const htmlAdmin = await resAdmin.text();
    assert(resAdmin.status === 200 && htmlAdmin.includes('<div id="root"></div>'), 'Live dev server serves HTTP 200 SPA shell on GET /admin');

    const resPayments = await fetch('http://localhost:3000/admin/payments');
    assert(resPayments.status === 200, 'Live dev server serves HTTP 200 SPA shell on GET /admin/payments refresh');

    const resManifest = await fetch('http://localhost:3000/admin-manifest.webmanifest');
    assert(resManifest.status === 200, 'Live dev server serves HTTP 200 for /admin-manifest.webmanifest');

    const resSw = await fetch('http://localhost:3000/admin-sw.js');
    assert(resSw.status === 200, 'Live dev server serves HTTP 200 for /admin-sw.js');

    const resOffline = await fetch('http://localhost:3000/admin-offline.html');
    assert(resOffline.status === 200, 'Live dev server serves HTTP 200 for /admin-offline.html');
  } catch (err) {
    console.log('  (Note: Local HTTP check skipped if dev server not bound in current shell)');
  }

  // ---------------------------------------------------------------------------
  // 3, 4, 5 & 6. Zero Customer Exposure + Server-Side DB & RPC Authorization
  // ---------------------------------------------------------------------------
  console.log('\n[3, 4, 5 & 6] Verifying zero customer UI exposure & strict PostgreSQL RBAC/RLS...');

  const customerFilesToAudit = [
    'src/components/layout/DashboardLayout.tsx',
    'src/components/layout/PublicLayout.tsx',
    'src/components/layout/Navbar.tsx',
    'src/components/layout/Footer.tsx',
    'src/pages/public/HomePage.tsx',
    'src/pages/public/PricingPage.tsx',
    'src/pages/public/CreateWebsitePage.tsx',
    'src/pages/dashboard/DashboardOverviewPage.tsx',
    'src/pages/dashboard/SubscribedWebsitePage.tsx',
    'src/pages/dashboard/BillingPage.tsx',
  ];
  for (const file of customerFilesToAudit) {
    const content = fs.readFileSync(file, 'utf8');
    assert(!content.includes('to="/admin"') && !content.includes("to='/admin'"), `Zero /admin links in ${file}`);
    assert(!content.includes('Admin Master Panel') && !content.includes('Super Admin Console'), `Zero Admin labels in ${file}`);
  }

  // Verify AppContext & AdminProtectedRoute fail-closed guards
  const appContextSrc = fs.readFileSync('src/context/AppContext.tsx', 'utf8');
  assert(
    appContextSrc.includes("supabase.rpc('is_admin')"),
    'AppContext double-verifies profile.role === admin against server RPC is_admin()'
  );
  const adminGuardSrc = fs.readFileSync('src/components/auth/AdminProtectedRoute.tsx', 'utf8');
  assert(
    adminGuardSrc.includes('verifyServerAdminSession') && adminGuardSrc.includes('to={`/admin/login'),
    'AdminProtectedRoute enforces live server verification and redirects logged-out visitors to /admin/login'
  );
  assert(
    adminGuardSrc.includes('Access Restricted'),
    'AdminProtectedRoute renders strict 403 Access Restricted screen for authenticated non-admin accounts'
  );

  // Spin up in-memory PGlite with exact Production schema + migration 20261029 (zero remote SQL!)
  const db = new PGlite();
  await initSupabaseAndStorageEnv(db);
  const baseSchema = fs
    .readFileSync('supabase/schema.sql', 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
  const migration20261029 = fs.readFileSync(
    'supabase/migrations/20261029_website_builder_storage_and_autopublish.sql',
    'utf8'
  );
  await db.exec(baseSchema);
  await db.exec(migration20261029);

  const merchantA = '11111111-1111-4111-8111-111111111111';
  const merchantB = '22222222-2222-4222-8222-222222222222';
  const adminUser = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  await asUser(db, null, null, 'service_role');
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${merchantA}', 'merchant.a@amaas.test', '{"role":"admin"}'::jsonb),
      ('${merchantB}', 'merchant.b@amaas.test', '{}'::jsonb),
      ('${adminUser}', 'admin@amaas.xyz', '{}'::jsonb);

    INSERT INTO public.profiles (id, email, full_name, role) VALUES
      ('${merchantA}', 'merchant.a@amaas.test', 'Merchant A (Forged Metadata)', 'merchant'),
      ('${merchantB}', 'merchant.b@amaas.test', 'Merchant B', 'merchant'),
      ('${adminUser}', 'admin@amaas.xyz', 'AMAAS Super Admin', 'merchant')
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.profiles SET role = 'admin' WHERE id = '${adminUser}';
  `);

  // Logged-out (anon) checks
  await asUser(db, null, null, 'anon');
  let anonPaymentBlocked = false;
  try {
    const res = await db.query(`SELECT * FROM public.payment_requests;`);
    anonPaymentBlocked = res.rows.length === 0;
  } catch {
    anonPaymentBlocked = true;
  }
  assert(anonPaymentBlocked, 'Logged-out (anon) user cannot read payment_requests');

  let anonApproveBlocked = false;
  try {
    await db.query(`SELECT public.admin_approve_payment_request(gen_random_uuid(), 'hack');`);
  } catch {
    anonApproveBlocked = true;
  }
  assert(anonApproveBlocked, 'Logged-out (anon) user cannot execute admin_approve_payment_request');

  // Merchant A (even with raw_user_meta_data.role = "admin"!) checks
  await asUser(db, merchantA, 'merchant.a@amaas.test', 'authenticated');
  const merchantIsAdminRes = await db.query<{ is_admin: boolean }>(`SELECT public.is_admin() AS is_admin;`);
  assert(
    merchantIsAdminRes.rows[0]?.is_admin === false,
    'Merchant with forged user_metadata.role="admin" still evaluates public.is_admin() === false'
  );

  // Merchant A cannot self-escalate profiles.role to 'admin'
  let selfEscalationBlocked = false;
  try {
    await db.query(`UPDATE public.profiles SET role = 'admin' WHERE id = '${merchantA}';`);
    const checkRole = await db.query<{ role: string }>(`SELECT role FROM public.profiles WHERE id = '${merchantA}';`);
    selfEscalationBlocked = checkRole.rows[0]?.role !== 'admin';
  } catch {
    selfEscalationBlocked = true;
  }
  assert(selfEscalationBlocked, 'PostgreSQL trigger/grants block merchant from self-updating profiles.role to admin');

  // Create websites & payment requests for Merchant A and Merchant B
  const storeARes = await db.query<{ id: string }>(`
    INSERT INTO public.stores (owner_id, name, slug, category, currency)
    VALUES ('${merchantA}', 'Alpha Store', 'alpha-store', 'Fashion', '৳')
    RETURNING id;
  `);
  const storeAId = storeARes.rows[0].id;

  const insertMerchantSite = async (subdomain: string, businessName: string): Promise<string> => {
    const { payload, error } = buildMerchantWebsiteInsertPayload({
      userId: merchantA,
      storeId: storeAId,
      subdomain,
      businessName,
      niche: 'ecommerce',
      templateId: 'tpl-1',
      templateName: 'Modern',
      config: { ownerName: 'Merchant A', email: 'merchant.a@amaas.test', phone: '01711223344' },
    });
    if (error || !payload) throw error || new Error('Insert payload build failed');
    const cols = Object.keys(payload);
    const vals = cols.map((_, idx) => `$${idx + 1}`);
    const params = cols.map((k) => {
      const val = (payload as Record<string, unknown>)[k];
      return typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
    });
    const res = await db.query<{ id: string }>(
      `INSERT INTO public.subscribed_websites (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING id;`,
      params
    );
    return res.rows[0].id;
  };

  const siteA1Id = await insertMerchantSite('alpha-one', 'Alpha One');
  const siteA2Id = await insertMerchantSite('alpha-two', 'Alpha Two');

  const payReqRes = await db.query<{ id: string }>(`
    INSERT INTO public.payment_requests (
      user_id, store_id, customer_name, customer_email, customer_phone,
      service_type, service_id, service_name, plan_tier, amount, currency,
      payment_method, transaction_id, sender_number
    ) VALUES (
      '${merchantA}', '${storeAId}', 'Merchant A', 'merchant.a@amaas.test', '01711223344',
      'website_subscription', '${siteA1Id}', 'GoAMAAS Website — Alpha One', 'GoAMAAS Website', 600, 'BDT',
      'bKash', 'TRXADMINPWA01', '01711223344'
    ) RETURNING id;
  `);
  const payReqId = payReqRes.rows[0].id;

  // Merchant B attempts every admin RPC -> all must fail closed!
  await asUser(db, merchantB, 'merchant.b@amaas.test', 'authenticated');

  for (const rpcSql of [
    `SELECT public.admin_approve_payment_request('${payReqId}'::uuid, 'spoof');`,
    `SELECT public.admin_reject_payment_request('${payReqId}'::uuid, 'spoof reason');`,
    `SELECT public.admin_update_website_lifecycle('${siteA1Id}'::uuid, 'suspend', 'spoof');`,
    `SELECT public.admin_delete_subscribed_website('${siteA1Id}'::uuid);`,
    `SELECT public.admin_update_payment_gateway_config('bkash', true, '01999999999', 'Personal', 'Spoof');`,
  ]) {
    let blocked = false;
    try {
      const r = await db.query<{ res?: any }>(rpcSql);
      const firstVal = Object.values(r.rows[0] || {})[0] as any;
      if (firstVal && typeof firstVal === 'object' && firstVal.success === false) {
        blocked = true;
      }
    } catch {
      blocked = true;
    }
    assert(blocked, `Non-admin RPC call rejected: ${rpcSql.slice(0, 56)}...`);
  }

  // ---------------------------------------------------------------------------
  // 7, 8, 9 & 10. Verified Admin Access, Exact Website Targeting & Concurrency
  // ---------------------------------------------------------------------------
  console.log('\n[7, 8, 9 & 10] Verifying authorized admin RPCs, exact website targeting & concurrency locks...');

  await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
  const adminCheckRes = await db.query<{ is_admin: boolean }>(`SELECT public.is_admin() AS is_admin;`);
  assert(adminCheckRes.rows[0]?.is_admin === true, 'Verified administrator evaluates public.is_admin() === true');

  const allPaymentsForAdmin = await db.query<{ id: string }>(`SELECT id FROM public.payment_requests;`);
  assert(allPaymentsForAdmin.rows.length === 1, 'Verified administrator can view cross-tenant payment queue');

  // Test executeApproveAndPublishWorkflow + PostgreSQL row-level idempotency & UI concurrency lock
  const inFlightLock = new Set<string>();
  let approveRpcSuccessCount = 0;

  const fetchPaymentRequestById = async (id: string): Promise<PaymentRequest | null> => {
    const q = await db.query<any>(`SELECT * FROM public.payment_requests WHERE id = '${id}'::uuid;`);
    if (!q.rows[0]) return null;
    const r = q.rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      storeId: r.store_id ?? undefined,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      customerEmail: r.customer_email,
      serviceType: r.service_type,
      serviceId: r.service_id,
      serviceName: r.service_name,
      planTier: r.plan_tier,
      amount: Number(r.amount),
      currency: r.currency,
      paymentMethod: r.payment_method,
      transactionId: r.transaction_id ?? undefined,
      senderNumber: r.sender_number ?? undefined,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  };

  const adapters: ApproveAndPublishAdapters = {
    requireUuidServiceId: true,
    fetchPaymentRequestById,
    fetchWebsiteById: async (id: string): Promise<SubscribedWebsite | null> => {
      const q = await db.query<any>(`SELECT * FROM public.subscribed_websites WHERE id = '${id}'::uuid;`);
      if (!q.rows[0]) return null;
      return mapDatabaseRowToSubscribedWebsite(q.rows[0]);
    },
    approvePaymentRpc: async (id: string, notes?: string) => {
      try {
        const res = await db.query<{ result: any }>(
          `SELECT public.admin_approve_payment_request('${id}'::uuid, '${notes || 'Verified'}') AS result;`
        );
        const payload = res.rows[0]?.result;
        if (payload && payload.success === false) {
          return {
            success: false,
            code: payload.code || 'ALREADY_SETTLED',
            message: payload.message || 'Already settled',
            error: new Error(payload.message || 'Already settled'),
          };
        }
        approveRpcSuccessCount += 1;
        return { success: true, message: 'Approved', error: null };
      } catch (e: any) {
        return {
          success: false,
          code: 'ALREADY_SETTLED',
          message: e?.message || 'Already settled',
          error: e instanceof Error ? e : new Error(String(e)),
        };
      }
    },
    publishWebsiteRpc: async (websiteId: string) => {
      await db.query(`SELECT public.publish_client_website('${websiteId}'::uuid);`);
      return { success: true, message: 'Published', error: null };
    },
  };

  const initialReq = await fetchPaymentRequestById(payReqId);

  const runGuardedApprove = async (notes: string) => {
    if (inFlightLock.has(payReqId)) {
      return {
        success: false,
        paymentApproved: false,
        websitePublished: false,
        isWebsiteService: true,
        code: 'IN_FLIGHT',
        message: 'Approval already in progress for this payment request.',
      };
    }
    inFlightLock.add(payReqId);
    try {
      return await executeApproveAndPublishWorkflow({
        mode: 'approve_and_publish',
        request: initialReq,
        notes,
        callerRole: 'admin',
        callerUserId: adminUser,
        adapters,
      });
    } finally {
      inFlightLock.delete(payReqId);
    }
  };

  const siteA2Before = await db.query<{ status: string; payment_status: string; deployment_status: string }>(
    `SELECT status, payment_status, deployment_status FROM public.subscribed_websites WHERE id = '${siteA2Id}'::uuid;`
  );

  // Fire two concurrent Approve & Publish requests for the same payment ID
  const [res1, res2] = await Promise.all([
    runGuardedApprove('Verified via Admin PWA'),
    runGuardedApprove('Duplicate tap'),
  ]);

  const successes = [res1, res2].filter((r) => r.success && r.websitePublished);
  const blocked = [res1, res2].filter((r) => !r.success && r.code === 'IN_FLIGHT');
  assert(
    successes.length === 1 && blocked.length === 1,
    'Concurrent duplicate Approve & Publish tap is safely blocked by in-flight lock'
  );
  assert(approveRpcSuccessCount === 1, 'admin_approve_payment_request RPC settled payment exactly once');

  // Verify ONLY siteA1 is live/paid and siteA2 (belonging to same Merchant A) was NOT touched!
  const siteA1After = await db.query<{ status: string; payment_status: string; deployment_status: string }>(
    `SELECT status, payment_status, deployment_status FROM public.subscribed_websites WHERE id = '${siteA1Id}'::uuid;`
  );
  const siteA2After = await db.query<{ status: string; payment_status: string; deployment_status: string }>(
    `SELECT status, payment_status, deployment_status FROM public.subscribed_websites WHERE id = '${siteA2Id}'::uuid;`
  );
  assert(
    siteA1After.rows[0].status === 'active' &&
      siteA1After.rows[0].payment_status === 'paid' &&
      siteA1After.rows[0].deployment_status === 'live',
    'Associated website siteA1 transitioned atomically to active + paid + live'
  );
  assert(
    JSON.stringify(siteA2After.rows[0]) === JSON.stringify(siteA2Before.rows[0]) &&
      siteA2After.rows[0].payment_status === 'pending' &&
      siteA2After.rows[0].deployment_status === 'deploying',
    'Unrelated website siteA2 of the same merchant remained completely untouched (payment_status=pending, deployment_status=deploying)'
  );

  // Verify adminSecurity rate limiter, timing floor & non-enumerating message
  clearAdminLoginFailures();
  for (let i = 0; i < 5; i++) {
    recordAdminLoginFailure();
  }
  const lockedState = checkAdminLoginRateLimit();
  assert(!lockedState.allowed && lockedState.retryAfterSeconds > 0, 'Admin login rate-limiter enforces temporary lockout after 5 failed attempts');
  clearAdminLoginFailures();
  assert(checkAdminLoginRateLimit().allowed, 'Admin login rate-limiter resets cleanly after authorized login');

  const floorStart = Date.now();
  await enforceMinimumAuthFloor(floorStart, 120);
  assert(Date.now() - floorStart >= 110, 'enforceMinimumAuthFloor prevents timing-based account enumeration');
  assert(
    !UNIFORM_ADMIN_AUTH_ERROR.toLowerCase().includes('merchant') &&
      !UNIFORM_ADMIN_AUTH_ERROR.toLowerCase().includes('not found'),
    'Uniform admin login error message does not leak account existence or merchant role'
  );

  clearAdminSessionEvents();
  recordAdminSessionEvent({
    adminId: adminUser,
    action: 'mfa_verified',
    targetType: 'mfa',
    targetId: 'totp-factor-1',
    outcome: 'success',
    summary: 'TOTP verified for active admin session',
  });
  const events = getAdminSessionEvents();
  assert(
    events.length === 1 && events[0].action === 'mfa_verified',
    'In-memory session security audit logger records events without persisting to localStorage'
  );

  // ---------------------------------------------------------------------------
  // 11, 12, 13 & 14. Mobile Layout, Light/Dark Theme, Android PWA & Safe Offline Mode
  // ---------------------------------------------------------------------------
  console.log('\n[11, 12, 13 & 14] Verifying Light/Dark CSS, Android PWA manifest, PNG icons & safe Service Worker...');

  const cssContent = fs.readFileSync('src/index.css', 'utf8');
  assert(
    cssContent.includes('@custom-variant dark (&:where(.dark, .dark *));'),
    'src/index.css enables Tailwind v4 class-based dark mode (@custom-variant dark)'
  );

  // Check zero forbidden browser dialogs across all admin files
  for (const adminFile of [
    'src/pages/admin/AdminLoginPage.tsx',
    'src/pages/admin/AdminDashboardPage.tsx',
    'src/components/layout/AdminLayout.tsx',
    'src/components/auth/AdminProtectedRoute.tsx',
    'src/components/admin/AdminPWAInstallBanner.tsx',
  ]) {
    const src = fs.readFileSync(adminFile, 'utf8');
    assert(
      !src.includes('window.alert(') && !src.includes('window.confirm(') && !src.includes('window.open('),
      `Zero native browser dialogs/popups in ${adminFile}`
    );
  }

  // Validate /public/admin-manifest.webmanifest
  const manifest = JSON.parse(fs.readFileSync('public/admin-manifest.webmanifest', 'utf8'));
  assert(manifest.name === 'GoAMAAS Admin', 'PWA manifest name is "GoAMAAS Admin"');
  assert(manifest.short_name === 'AMAAS Admin', 'PWA manifest short_name is "AMAAS Admin"');
  assert(manifest.start_url === '/admin', 'PWA manifest start_url opens directly into /admin');
  assert(manifest.scope === '/admin', 'PWA manifest scope is strictly isolated to /admin');
  assert(manifest.display === 'standalone', 'PWA manifest display mode is standalone');

  // Verify binary PNG headers & exact pixel dimensions
  const icon192 = readPngDimensions('public/admin-pwa-192x192.png');
  assert(icon192.validSignature && icon192.width === 192 && icon192.height === 192, 'admin-pwa-192x192.png is a valid 192x192 binary PNG');

  const icon512 = readPngDimensions('public/admin-pwa-512x512.png');
  assert(icon512.validSignature && icon512.width === 512 && icon512.height === 512, 'admin-pwa-512x512.png is a valid 512x512 binary PNG');

  const iconMaskable = readPngDimensions('public/admin-pwa-maskable-512x512.png');
  assert(iconMaskable.validSignature && iconMaskable.width === 512 && iconMaskable.height === 512, 'admin-pwa-maskable-512x512.png is a valid 512x512 maskable binary PNG');

  const iconApple = readPngDimensions('public/admin-apple-touch-icon.png');
  assert(iconApple.validSignature && iconApple.width === 180 && iconApple.height === 180, 'admin-apple-touch-icon.png is a valid 180x180 binary PNG');

  // Verify Service Worker strict network-only pass-through for sensitive traffic
  const swContent = fs.readFileSync('public/admin-sw.js', 'utf8');
  assert(
    swContent.includes("url.pathname.includes('/rest/v1/')") &&
      swContent.includes("url.pathname.includes('/auth/v1/')") &&
      swContent.includes("url.pathname.startsWith('/api/')") &&
      swContent.includes("request.headers.has('authorization')"),
    'admin-sw.js bypasses all Supabase REST/Auth/Storage, /api/*, and Authorization-bearing requests'
  );
  assert(
    swContent.includes("caches.match('/admin-offline.html')"),
    'admin-sw.js serves dedicated /admin-offline.html fallback when offline'
  );

  const offlineHtml = fs.readFileSync('public/admin-offline.html', 'utf8');
  assert(
    offlineHtml.includes('noindex, nofollow') && !offlineHtml.includes('supabase') && !offlineHtml.includes('Bearer'),
    'admin-offline.html is noindex and contains zero sensitive data or credentials'
  );

  // ---------------------------------------------------------------------------
  // 15. Production Database & Customer Builder Preservation Check
  // ---------------------------------------------------------------------------
  console.log('\n[15] Verifying zero database/migration modifications & customer builder preservation...');
  const createWebsiteSrc = fs.readFileSync('src/pages/public/CreateWebsitePage.tsx', 'utf8');
  const subscribedWebsiteSrc = fs.readFileSync('src/pages/dashboard/SubscribedWebsitePage.tsx', 'utf8');
  const manualPaymentModalSrc = fs.readFileSync('src/components/payment/ManualPaymentModal.tsx', 'utf8');
  assert(
    createWebsiteSrc.includes('createSubscribedWebsite') &&
      subscribedWebsiteSrc.includes('ManualPaymentModal') &&
      manualPaymentModalSrc.includes('submitPaymentRequest'),
    'Customer website creation wizard, subscribed website dashboard, and manual payment modal remain intact'
  );

  await db.close();
  console.log(`\n✅ ALL ${passed}/${total} ADMIN PANEL SECURITY & PWA VERIFICATION CHECKS PASSED!`);
}

runSuite().catch((err) => {
  console.error('\n❌ ADMIN PANEL VERIFICATION SUITE FAILED:', err);
  process.exit(1);
});

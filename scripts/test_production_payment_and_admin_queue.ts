import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { transform } from 'esbuild';
import resolveTenantHandler from '../api/resolve-tenant';
import {
  executeApproveAndPublishWorkflow,
  isPlatformAdminAccountEmail,
  isWebsiteTrulyLive,
  resolveClientWebsiteLifecycleState,
  validateClientWriteSessionOwnership,
  validateManualPaymentSubmissionInput,
} from '../src/lib/paymentWorkflow';
import {
  PAYMENT_REQUESTS_RESTRICTED_INSERT_COLUMNS,
  PAYMENT_REQUEST_CLIENT_CONFIRM_SELECT,
  RawPaymentRequestRow,
  UUID_REGEX,
  buildClientPaymentRequestInsertPayload,
  buildMerchantWebsiteInsertPayload,
  mapDatabaseRowToSubscribedWebsite,
} from '../src/lib/supabase';
import {
  PaymentDiagnosticStage,
  clearPaymentDiagnosticsForTest,
  emitPaymentDiagnostic,
  getRecentPaymentDiagnostics,
} from '../src/lib/paymentDiagnostics';
import { PaymentRequest } from '../src/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function mapRow(row: RawPaymentRequestRow): PaymentRequest {
  return {
    id: row.id,
    userId: row.user_id,
    storeId: row.store_id ?? undefined,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    serviceType: row.service_type,
    serviceId: row.service_id,
    serviceName: row.service_name,
    planTier: row.plan_tier,
    amount: Number(row.amount),
    currency: row.currency,
    paymentMethod: row.payment_method,
    transactionId: row.transaction_id ?? undefined,
    senderNumber: row.sender_number ?? undefined,
    bankName: row.bank_name ?? undefined,
    bankAccountName: row.bank_account_name ?? undefined,
    bankReference: row.bank_reference ?? undefined,
    status: row.status,
    adminNotes: row.admin_notes ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createFakeAnonJwt(ref: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ iss: 'supabase', ref, role: 'anon', iat: 1700000000, exp: 2099999999 })
  ).toString('base64url');
  return `${header}.${payload}.testsignature`;
}

async function verifyStandaloneNodeEsmPricingHandler(testWebsiteId: string, testUserId: string) {
  console.log('\n[1/4] Testing /api/verify-pricing standalone Node ESM compilation & PGRST205 fallback...');

  const sourceTs = fs.readFileSync('api/verify-pricing.ts', 'utf8');
  // Transpile WITHOUT bundling (bundle: false) to mirror Vercel's per-file Node ESM compilation
  const transpiled = await transform(sourceTs, {
    loader: 'ts',
    format: 'esm',
    target: 'node20',
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goamaas-esm-verify-'));
  const tmpMjs = path.join(tmpDir, 'verify-pricing.mjs');
  fs.writeFileSync(tmpMjs, transpiled.code, 'utf8');

  const prevUrl = process.env.VITE_SUPABASE_URL;
  const prevKey = process.env.VITE_SUPABASE_ANON_KEY;
  const originalFetch = globalThis.fetch;

  try {
    // Dynamically import standalone .mjs outside repo tree so any relative '../src/...' import would crash with ERR_MODULE_NOT_FOUND
    const importedModule = (await import(pathToFileURL(tmpMjs).href)) as {
      default: (req: any, res: any) => Promise<void>;
    };
    assert(typeof importedModule.default === 'function', 'Default handler exported cleanly in standalone Node ESM');

    process.env.VITE_SUPABASE_URL = 'https://rqmgnewipgqgmvzpbrfn.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = createFakeAnonJwt('rqmgnewipgqgmvzpbrfn');

    // Case A: Unauthenticated GET -> 401 JSON (not 500 FUNCTION_INVOCATION_FAILED)
    let resStatusA = 0;
    let resBodyA = '';
    const headersA: Record<string, string> = {};
    await importedModule.default(
      { method: 'GET', url: '/api/verify-pricing', headers: { host: 'app.amaas.xyz' } },
      {
        setHeader: (k: string, v: string) => {
          headersA[k.toLowerCase()] = v;
        },
        get statusCode() {
          return resStatusA;
        },
        set statusCode(code: number) {
          resStatusA = code;
        },
        end: (chunk?: string) => {
          resBodyA = chunk || '';
        },
      }
    );
    assert(resStatusA === 401, `Expected 401 for unauthenticated GET, received ${resStatusA}`);
    const parsedA = JSON.parse(resBodyA);
    assert(parsedA.code === 'AUTH_REQUIRED', `Expected AUTH_REQUIRED, received ${parsedA.code}`);

    // Case B: Authenticated POST when Production DB returns 404 PGRST205 on service_pricing_catalog
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: testUserId, email: 'client@example.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/rest/v1/service_pricing_catalog')) {
        return new Response(
          JSON.stringify({
            code: 'PGRST205',
            details: null,
            hint: null,
            message: "Could not find the table 'public.service_pricing_catalog' in the schema cache",
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/rest/v1/subscribed_websites')) {
        return new Response(
          JSON.stringify([
            {
              id: testWebsiteId,
              user_id: testUserId,
              subdomain: 'dhaka-loom-prod',
              business_name: 'Dhaka Loom Production',
              plan_tier: 'GoAMAAS Website',
              monthly_fee: 600,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected URL in mock fetch: ${url}`);
    }) as typeof fetch;

    let resStatusB = 0;
    let resBodyB = '';
    await importedModule.default(
      {
        method: 'POST',
        url: '/api/verify-pricing',
        headers: {
          host: 'app.amaas.xyz',
          authorization: 'Bearer simulated-client-jwt-token',
          'content-type': 'application/json',
        },
        body: {
          serviceType: 'website_subscription',
          serviceId: testWebsiteId,
          serviceName: 'GoAMAAS Website (dhaka-loom-prod.amaas.xyz)',
          planTier: 'GoAMAAS Website',
        },
      },
      {
        setHeader: () => {},
        get statusCode() {
          return resStatusB;
        },
        set statusCode(code: number) {
          resStatusB = code;
        },
        end: (chunk?: string) => {
          resBodyB = chunk || '';
        },
      }
    );

    assert(resStatusB === 200, `Expected 200 OK from /api/verify-pricing POST, received ${resStatusB}: ${resBodyB}`);
    const parsedB = JSON.parse(resBodyB);
    assert(parsedB.ok === true, 'Expected ok: true');
    assert(
      parsedB.catalogSource === 'server_authoritative_fallback',
      `Expected server_authoritative_fallback when PGRST205 occurs, got ${parsedB.catalogSource}`
    );
    assert(parsedB.resolvedPrice?.amount === 600, `Expected 600 BDT, got ${parsedB.resolvedPrice?.amount}`);
    assert(parsedB.resolvedPrice?.serviceId === testWebsiteId, 'Expected exact website UUID');
    console.log('  ✓ Standalone Node ESM /api/verify-pricing passed (401 JSON + 200 OK PGRST205 fallback)');
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
    else process.env.VITE_SUPABASE_ANON_KEY = prevKey;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function runProductionBaselineWorkflowSuite() {
  console.log('=== GOAMAAS PRODUCTION (rqmgnewipgqgmvzpbrfn) PAYMENT & ADMIN QUEUE VERIFICATION ===');

  const clientUserId = '11111111-aaaa-4bbb-8ccc-111111111111';
  const clientEmail = 'merchant.prod@example.com';
  const otherMerchantId = '22222222-bbbb-4ccc-8ddd-222222222222';
  const otherMerchantEmail = 'other.prod@example.com';
  const adminUserId = '99999999-cccc-4ddd-8eee-999999999999';
  const adminEmail = 'official.amaas.dev@gmail.com';
  const sampleWebsiteId = '77777777-1111-4222-8333-444444444444';

  await verifyStandaloneNodeEsmPricingHandler(sampleWebsiteId, clientUserId);

  console.log('\n[2/4] Booting PGlite with EXACT Production (rqmgnewipgqgmvzpbrfn) schema baseline...');
  const db = new PGlite();

  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;

    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    GRANT ALL ON ALL TABLES IN SCHEMA auth TO authenticated, anon, service_role;

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

    GRANT ALL ON ALL ROUTINES IN SCHEMA auth TO authenticated, anon, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated, anon, service_role;
  `);

  async function asRole(
    userId: string | null,
    email: string | null = null,
    role: 'anon' | 'authenticated' | 'service_role' = 'authenticated'
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
    }
  }

  // Load ONLY base schema (lines 1..1034 before appended service_trials) + 20261010 + 20261015 + 20261017 + 20261018
  const stripUuidOssp = (sql: string) =>
    sql.replace(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"?uuid-ossp"?\s*;/gi, '');

  await db.exec(`
    CREATE OR REPLACE FUNCTION public.uuid_generate_v4() RETURNS UUID AS $$
      SELECT gen_random_uuid();
    $$ LANGUAGE sql;
  `);

  const fullSchemaLines = fs.readFileSync('supabase/schema.sql', 'utf8').split('\n');
  const baseSchemaOnly = stripUuidOssp(fullSchemaLines.slice(0, 1034).join('\n'));
  const mig20261010 = stripUuidOssp(
    fs.readFileSync('supabase/migrations/20261010_security_and_rls_hardening.sql', 'utf8')
  );
  const mig20261015 = stripUuidOssp(
    fs.readFileSync('supabase/migrations/20261015_complete_saas_website_builder_and_payments.sql', 'utf8')
  );
  const mig20261017 = stripUuidOssp(
    fs.readFileSync('supabase/migrations/20261017_public_website_resolution_and_publishing.sql', 'utf8')
  );
  const mig20261018 = stripUuidOssp(
    fs.readFileSync('supabase/migrations/20261018_fix_admin_approve_payment_request_safety.sql', 'utf8')
  );

  await db.exec(baseSchemaOnly);
  await db.exec(mig20261010);
  await db.exec(mig20261015);
  await db.exec(mig20261017);
  await db.exec(mig20261018);

  // Confirm Production baseline invariants: service_pricing_catalog & website_lifecycle_audit_logs do NOT exist
  let pricingTableMissing = false;
  try {
    await db.query(`SELECT 1 FROM public.service_pricing_catalog LIMIT 1;`);
  } catch {
    pricingTableMissing = true;
  }
  assert(pricingTableMissing, 'Production baseline must NOT contain public.service_pricing_catalog');

  // Seed users & elevate platform admin strictly as DB owner / service_role
  await asRole(null, null, 'service_role');
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${clientUserId}', '${clientEmail}', '{"provider":"google","email_verified":true}'::jsonb),
      ('${otherMerchantId}', '${otherMerchantEmail}', '{"provider":"google","email_verified":true}'::jsonb),
      ('${adminUserId}', '${adminEmail}', '{"provider":"google","email_verified":true}'::jsonb);

    INSERT INTO public.profiles (id, email, full_name, role) VALUES
      ('${clientUserId}', '${clientEmail}', 'Tanvir Hasan', 'merchant'),
      ('${otherMerchantId}', '${otherMerchantEmail}', 'Maliha Karim', 'merchant'),
      ('${adminUserId}', '${adminEmail}', 'GoAMAAS Admin', 'merchant')
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.profiles SET role = 'admin' WHERE id = '${adminUserId}';
  `);

  console.log('  ✓ Production baseline schema loaded (no service_pricing_catalog, 20261018 RPC active)');

  console.log('\n[3/4] Running Client Website Creation -> Manual Payment -> Admin Queue -> Approve & Publish...');

  // Step 1: Client creates a store and two websites
  await asRole(clientUserId, clientEmail, 'authenticated');
  const validStoreUuid = 'aaaa1111-bbbb-4ccc-8ddd-eeeeffff0001';
  const staleClientStoreUuid = 'deadbeef-dead-4bee-8bee-deadbeef0001';
  await db.query(
    `INSERT INTO public.stores (id, owner_id, name, slug, category) VALUES ($1::uuid, $2::uuid, 'Dhaka Loom Store', 'dhaka-loom-store', 'Fashion');`,
    [validStoreUuid, clientUserId]
  );

  const { payload: payloadPrimary, error: buildErrPrimary } = buildMerchantWebsiteInsertPayload({
    userId: clientUserId,
    businessName: 'Dhaka Loom Production',
    niche: 'fashion',
    subdomain: 'dhaka-loom-prod',
    storeId: validStoreUuid,
    templateId: 'tpl-fashion-house',
    templateName: 'Fashion House',
    config: {
      headline: 'Handcrafted Jamdani & Muslin',
      ownerName: 'Tanvir Hasan',
      phone: '01712345678',
      email: clientEmail,
    },
  });
  assert(!buildErrPrimary && payloadPrimary, 'Primary website insert payload built cleanly');

  const insertedSiteRes = await db.query<Record<string, any>>(
    `
    INSERT INTO public.subscribed_websites (
      user_id, store_id, business_name, niche, subdomain, full_domain,
      template_id, template_name, status, config
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    RETURNING *;
    `,
    [
      payloadPrimary.user_id,
      payloadPrimary.store_id ?? null,
      payloadPrimary.business_name,
      payloadPrimary.niche,
      payloadPrimary.subdomain,
      payloadPrimary.full_domain,
      payloadPrimary.template_id,
      payloadPrimary.template_name,
      payloadPrimary.status,
      JSON.stringify(payloadPrimary.config),
    ]
  );

  const primaryWebsite = mapDatabaseRowToSubscribedWebsite(insertedSiteRes.rows[0] as any);
  assert(primaryWebsite.paymentStatus !== 'paid', 'New website must NOT start paid');
  assert(primaryWebsite.deploymentStatus !== 'live', 'New website must NOT start live');
  assert(!isWebsiteTrulyLive(primaryWebsite), 'Unpaid website must NOT be live');
  const initialLifecycle = resolveClientWebsiteLifecycleState(primaryWebsite, []);
  assert(
    initialLifecycle.stage === 'draft_awaiting_payment',
    `Expected draft_awaiting_payment before submission, got ${initialLifecycle.stage}`
  );
  assert(initialLifecycle.canSubmitInitialPayment === true, 'Client can submit initial payment');

  // Create a sibling unpaid website (no store_id) to verify exact-website publishing isolation & stale storeId guard
  const { payload: payloadSibling, error: buildErrSibling } = buildMerchantWebsiteInsertPayload({
    userId: clientUserId,
    businessName: 'Dhaka Loom Outlet 2',
    niche: 'fashion',
    subdomain: 'dhaka-loom-second',
    config: { headline: 'Second Outlet' },
  });
  assert(!buildErrSibling && payloadSibling, 'Sibling website insert payload built cleanly');

  const siblingSiteRes = await db.query<Record<string, any>>(
    `
    INSERT INTO public.subscribed_websites (
      user_id, store_id, business_name, niche, subdomain, full_domain,
      template_id, template_name, status, config
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    RETURNING *;
    `,
    [
      payloadSibling.user_id,
      payloadSibling.store_id ?? null,
      payloadSibling.business_name,
      payloadSibling.niche,
      payloadSibling.subdomain,
      payloadSibling.full_domain,
      payloadSibling.template_id,
      payloadSibling.template_name,
      payloadSibling.status,
      JSON.stringify(payloadSibling.config),
    ]
  );
  const siblingWebsiteId = String(siblingSiteRes.rows[0].id);

  // Public anon check BEFORE payment submission -> MUST NOT be publicly accessible
  await asRole(null, null, 'anon');
  const preSubmitPub = await db.query<{ res: any }>(
    `SELECT public.get_published_website_by_subdomain('dhaka-loom-prod') AS res;`
  );
  assert(preSubmitPub.rows[0].res?.found === false, 'Unpaid website must not resolve publicly');

  // Step 2: Client enters Transaction ID, Amount Paid (600), Sender Number (01712345678), and clicks Submit Payment
  await asRole(clientUserId, clientEmail, 'authenticated');
  const clientValidation = validateManualPaymentSubmissionInput({
    paymentMethod: 'bKash',
    transactionId: 'trx99887766a',
    senderNumber: '01712345678',
    amount: 600,
    serviceId: primaryWebsite.id,
  });
  assert(clientValidation.valid, 'Valid client payment fields should pass validation');
  assert(clientValidation.normalizedReference === 'TRX99887766A', 'Transaction ID normalized');

  // Verify stale store_id existence check (prevents 23503 FK error on payment_requests if client passes stale storeId)
  const staleStoreCheckRes = await db.query<{ id: string }>(
    `SELECT id FROM public.stores WHERE id = $1 LIMIT 1;`,
    [staleClientStoreUuid]
  );
  assert((staleStoreCheckRes.rows[0]?.id ?? null) === null, 'Stale storeId must resolve to NULL before insert');

  const storeCheckRes = await db.query<{ id: string }>(
    `SELECT id FROM public.stores WHERE id = $1 LIMIT 1;`,
    [primaryWebsite.storeId]
  );
  const safeStoreId = storeCheckRes.rows[0]?.id ?? null;
  assert(safeStoreId === validStoreUuid, 'Valid storeId resolves cleanly from public.stores');

  const insertedPaymentRes = await db.query<RawPaymentRequestRow>(
    `
    INSERT INTO public.payment_requests (
      user_id, store_id, customer_name, customer_phone, customer_email,
      service_type, service_id, service_name, plan_tier, amount, currency,
      payment_method, transaction_id, sender_number, status
    ) VALUES (
      $1, $2, $3, $4, $5,
      'website_subscription', $6, $7, 'GoAMAAS Website', $8, '৳',
      'bKash', $9, $10, 'pending'
    )
    RETURNING *;
    `,
    [
      clientUserId,
      safeStoreId,
      'Tanvir Hasan',
      clientValidation.normalizedSender,
      clientEmail,
      primaryWebsite.id,
      `GoAMAAS Website (${primaryWebsite.fullDomainUrl})`,
      600,
      clientValidation.normalizedReference,
      clientValidation.normalizedSender,
    ]
  );

  const insertedPayment = insertedPaymentRes.rows[0];
  assert(Boolean(insertedPayment && UUID_REGEX.test(insertedPayment.id)), 'Confirmed UUID returned from payment_requests');
  assert(insertedPayment.status === 'pending', 'Submitted payment must have status = pending');
  assert(insertedPayment.transaction_id === 'TRX99887766A', 'Exact Transaction ID persisted');
  assert(Number(insertedPayment.amount) === 600, 'Exact 600 BDT amount persisted');
  assert(insertedPayment.sender_number === '01712345678', 'Exact sender number persisted');
  assert(insertedPayment.service_id === primaryWebsite.id, 'Bound to exact client website UUID');

  // Website MUST STILL NOT be publicly accessible while payment is pending!
  await asRole(null, null, 'anon');
  const pendingPub = await db.query<{ res: any }>(
    `SELECT public.get_published_website_by_subdomain('dhaka-loom-prod') AS res;`
  );
  assert(
    pendingPub.rows[0].res?.found === false,
    'Website MUST NOT become publicly accessible before admin approval'
  );

  // Step 3: Tenant isolation check — another merchant querying global payment_requests sees 0 rows
  await asRole(otherMerchantId, otherMerchantEmail, 'authenticated');
  const otherMerchantRows = await db.query<RawPaymentRequestRow>(
    `SELECT * FROM public.payment_requests ORDER BY created_at DESC;`
  );
  assert(
    otherMerchantRows.rows.length === 0,
    'RLS must prevent non-admin merchants from seeing other clients payment requests'
  );

  // Step 4: Reproduce the OLD Admin Panel bug vs FIXED Admin Queue fetch as official.amaas.dev@gmail.com
  await asRole(adminUserId, adminEmail, 'authenticated');
  const isAdminCheck = await db.query<{ ok: boolean }>(`SELECT public.is_admin() AS ok;`);
  assert(isAdminCheck.rows[0].ok === true, 'Admin session verified via public.is_admin()');

  // Old broken query (filtered by admin's own user_id when role/MFA state desynced):
  const oldBuggyAdminQuery = await db.query<RawPaymentRequestRow>(
    `SELECT * FROM public.payment_requests WHERE user_id = $1 ORDER BY created_at DESC;`,
    [adminUserId]
  );
  assert(
    oldBuggyAdminQuery.rows.length === 0,
    'Confirmed old bug: filtering by admin user_id hides all client payment requests'
  );

  // Fixed global Admin Queue query (`fetchAdminPaymentRequestsFromDb()` / `fetchUserPaymentRequests(undefined, { isAdminQueue: true })`):
  const fixedAdminQueue = await db.query<RawPaymentRequestRow>(
    `SELECT * FROM public.payment_requests ORDER BY created_at DESC;`
  );
  assert(
    fixedAdminQueue.rows.length === 1,
    `Expected 1 pending client payment request in Admin Queue, got ${fixedAdminQueue.rows.length}`
  );
  const adminVisibleReq = mapRow(fixedAdminQueue.rows[0]);
  assert(adminVisibleReq.id === insertedPayment.id, 'Admin sees exact submitted payment request');
  assert(adminVisibleReq.transactionId === 'TRX99887766A', 'Admin sees client Transaction ID');
  assert(adminVisibleReq.amount === 600, 'Admin sees client payment amount (600 BDT)');
  assert(adminVisibleReq.senderNumber === '01712345678', 'Admin sees client sender mobile number');
  assert(adminVisibleReq.serviceId === primaryWebsite.id, 'Admin sees exact target website UUID');

  // Step 5: Admin clicks "Approve & Publish" -> executes Production 20261018 approve RPC + 20261017 publish RPC
  const approvalOutcome = await executeApproveAndPublishWorkflow({
    mode: 'approve_and_publish',
    request: adminVisibleReq,
    notes: 'Verified bKash TRX99887766A against statement.',
    callerRole: 'admin',
    callerUserId: adminUserId,
    adapters: {
      requireUuidServiceId: true,
      approvePaymentRpc: async (reqId, notes) => {
        const rpcRes = await db.query<{ res: any }>(
          `SELECT public.admin_approve_payment_request($1::uuid, $2::text) AS res;`,
          [reqId, notes || null]
        );
        const body = rpcRes.rows[0]?.res;
        return {
          success: Boolean(body?.success),
          code: body?.code || 'APPROVED',
          message: body?.message || 'Approved',
          requestId: reqId,
          error: body?.success ? null : new Error(body?.message || 'Approve failed'),
        };
      },
      fetchPaymentRequestById: async (reqId) => {
        const r = await db.query<RawPaymentRequestRow>(
          `SELECT * FROM public.payment_requests WHERE id = $1::uuid;`,
          [reqId]
        );
        return r.rows[0] ? mapRow(r.rows[0]) : null;
      },
      fetchWebsiteById: async (websiteId) => {
        const w = await db.query<Record<string, any>>(
          `SELECT * FROM public.subscribed_websites WHERE id = $1::uuid;`,
          [websiteId]
        );
        return w.rows[0] ? mapDatabaseRowToSubscribedWebsite(w.rows[0] as any) : null;
      },
      publishWebsiteRpc: async (websiteId) => {
        const pub = await db.query<{ res: any }>(
          `SELECT public.publish_client_website($1::uuid) AS res;`,
          [websiteId]
        );
        const body = pub.rows[0]?.res;
        return {
          success: Boolean(body?.success),
          message: body?.message || 'Published',
          error: body?.success ? null : new Error(body?.message || 'Publish failed'),
        };
      },
    },
  });

  assert(approvalOutcome.success === true, `Expected Approve & Publish to succeed: ${approvalOutcome.message}`);
  assert(approvalOutcome.paymentApproved === true, 'Payment marked approved');
  assert(approvalOutcome.websitePublished === true, 'Exact client website published live on Production 20261018+20261017 RPCs');

  // Verify sibling website was NOT published or marked paid
  const siblingCheck = await db.query<Record<string, any>>(
    `SELECT * FROM public.subscribed_websites WHERE id = $1::uuid;`,
    [siblingWebsiteId]
  );
  const siblingMapped = mapDatabaseRowToSubscribedWebsite(siblingCheck.rows[0] as any);
  assert(siblingMapped.paymentStatus !== 'paid', 'Sibling website must remain unpaid');
  assert(siblingMapped.deploymentStatus !== 'live', 'Sibling website must remain unpublished');
  assert(!isWebsiteTrulyLive(siblingMapped), 'Sibling website must NOT be live');

  // Step 6: Public anon visitor + /api/resolve-tenant now resolve the exact published subdomain!
  await asRole(null, null, 'anon');
  const postApprovePub = await db.query<{ res: any }>(
    `SELECT public.get_published_website_by_subdomain('dhaka-loom-prod') AS res;`
  );
  assert(postApprovePub.rows[0].res?.found === true, 'Approved website must be publicly accessible via RPC');
  assert(
    (postApprovePub.rows[0].res?.site?.businessName || postApprovePub.rows[0].res?.site?.business_name) ===
      'Dhaka Loom Production',
    'Public RPC returns exact client website'
  );

  // Verify /api/resolve-tenant returns 200 OK JSON for the published subdomain
  const prevUrl = process.env.VITE_SUPABASE_URL;
  const prevKey = process.env.VITE_SUPABASE_ANON_KEY;
  const origFetch = globalThis.fetch;
  try {
    process.env.VITE_SUPABASE_URL = 'https://rqmgnewipgqgmvzpbrfn.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = createFakeAnonJwt('rqmgnewipgqgmvzpbrfn');
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(postApprovePub.rows[0].res), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    let tenantStatus = 0;
    let tenantBody = '';
    await resolveTenantHandler(
      {
        method: 'GET',
        url: '/api/resolve-tenant?subdomain=dhaka-loom-prod',
        headers: { host: 'app.amaas.xyz' },
      } as any,
      {
        setHeader: () => {},
        get statusCode() {
          return tenantStatus;
        },
        set statusCode(c: number) {
          tenantStatus = c;
        },
        end: (chunk?: string) => {
          tenantBody = chunk || '';
        },
      } as any
    );
    assert(tenantStatus === 200, `Expected 200 from /api/resolve-tenant, got ${tenantStatus}`);
    const tenantJson = JSON.parse(tenantBody);
    assert(tenantJson.found === true, 'Expected resolve-tenant found: true');
    assert(tenantJson.subdomain === 'dhaka-loom-prod', 'Expected exact subdomain');
    assert(
      (tenantJson.site?.businessName || tenantJson.site?.business_name) === 'Dhaka Loom Production',
      'Expected exact client website in resolve-tenant response'
    );
  } finally {
    globalThis.fetch = origFetch;
    if (prevUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
    else process.env.VITE_SUPABASE_ANON_KEY = prevKey;
  }

  console.log('  ✓ Full client -> pending DB row -> Admin Queue -> Approve & Publish -> live subdomain verified');

  console.log('\n[4/4] Verifying all 8 structured diagnostic stages & PII/secret sanitization...');
  clearPaymentDiagnosticsForTest();

  const stagesToVerify: Array<{
    stage: PaymentDiagnosticStage;
    httpStatus: number | null;
    errorCode: string | null;
    requestId: string | null;
  }> = [
    { stage: 'PAYMENT_SUBMIT_STARTED', httpStatus: null, errorCode: null, requestId: null },
    { stage: 'PRICING_VERIFICATION_SUCCEEDED', httpStatus: 200, errorCode: null, requestId: null },
    { stage: 'PAYMENT_REQUEST_INSERT_STARTED', httpStatus: null, errorCode: null, requestId: null },
    {
      stage: 'PAYMENT_REQUEST_INSERT_SUCCEEDED',
      httpStatus: 201,
      errorCode: null,
      requestId: insertedPayment.id,
    },
    {
      stage: 'PAYMENT_REQUEST_INSERT_FAILED',
      httpStatus: 403,
      errorCode: '42501',
      requestId: null,
    },
    { stage: 'ADMIN_QUEUE_FETCH_STARTED', httpStatus: null, errorCode: null, requestId: null },
    { stage: 'ADMIN_QUEUE_FETCH_SUCCEEDED', httpStatus: 200, errorCode: null, requestId: null },
    { stage: 'ADMIN_QUEUE_FETCH_FAILED', httpStatus: 401, errorCode: 'PGRST301', requestId: null },
  ];

  for (const item of stagesToVerify) {
    emitPaymentDiagnostic({
      stage: item.stage,
      httpStatus: item.httpStatus,
      errorCode: item.errorCode,
      requestId: item.requestId,
      projectRef: 'rqmgnewipgqgmvzpbrfn',
      hasUserId: true,
      hasWebsiteId: true,
    });
  }

  // Attempt to inject sensitive strings into diagnostic fields — must be scrubbed!
  emitPaymentDiagnostic({
    stage: 'PAYMENT_REQUEST_INSERT_FAILED',
    httpStatus: 400,
    errorCode: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret',
    requestId: 'official.amaas.dev@gmail.com',
    projectRef: 'sb_secret_super_secret_key_123',
    hasUserId: true,
    hasWebsiteId: false,
  });
  emitPaymentDiagnostic({
    stage: 'PAYMENT_REQUEST_INSERT_FAILED',
    httpStatus: 400,
    errorCode: '01712345678',
    requestId: '01712345678',
    projectRef: 'merchant.prod@example.com',
    hasUserId: true,
    hasWebsiteId: false,
  });

  const logs = getRecentPaymentDiagnostics();
  assert(logs.length === 10, `Expected 10 diagnostic entries, got ${logs.length}`);
  for (const requiredStage of stagesToVerify.map((s) => s.stage)) {
    assert(
      logs.some((l) => l.stage === requiredStage),
      `Missing required diagnostic stage: ${requiredStage}`
    );
  }
  const serializedLogs = JSON.stringify(logs);
  assert(!serializedLogs.includes('eyJhbGci'), 'JWT token must never appear in diagnostics');
  assert(!serializedLogs.includes('sb_secret_'), 'Secret key must never appear in diagnostics');
  assert(!serializedLogs.includes('@gmail.com'), 'Admin email must never appear in diagnostics');
  assert(!serializedLogs.includes('@example.com'), 'Client email must never appear in diagnostics');
  assert(!serializedLogs.includes('01712345678'), 'Phone number must never appear in diagnostics');

  console.log('  ✓ All 8 diagnostic stages verified & sensitive token/email/phone scrubbing confirmed');

  console.log('\n[5/5] Verifying PostgreSQL 42501 ACL behavior (column-level grants vs missing table grants & 0-row atomicity)...');

  const leastPrivPayload = buildClientPaymentRequestInsertPayload({
    userId: clientUserId,
    storeId: safeStoreId,
    customerName: 'Tanvir Hasan',
    customerPhone: '01712345678',
    customerEmail: clientEmail,
    serviceType: 'website_subscription',
    serviceId: siblingWebsiteId,
    serviceName: 'GoAMAAS Website (dhaka-loom-second.amaas.xyz)',
    planTier: 'GoAMAAS Website',
    amount: 600,
    paymentMethod: 'bKash',
    transactionId: 'TRX55443322B',
    senderNumber: '01712345678',
  });

  for (const restrictedCol of PAYMENT_REQUESTS_RESTRICTED_INSERT_COLUMNS) {
    assert(
      !(restrictedCol in leastPrivPayload),
      `Restricted column "${restrictedCol}" must NOT appear in client INSERT payload`
    );
  }
  assert(!('bank_name' in leastPrivPayload), 'Unused bank_name omitted for bKash');
  assert(!('bank_account_name' in leastPrivPayload), 'Unused bank_account_name omitted for bKash');
  assert(!('bank_reference' in leastPrivPayload), 'Unused bank_reference omitted for bKash');

  // 5a. Column-level INSERT + SELECT grants (excluding server-defaulted status/currency & admin review columns):
  //     Old 18-column INSERT ... RETURNING * fails with 42501, whereas least-privilege payload + explicit SELECT succeeds!
  await asRole(null, null, 'service_role');
  await db.exec(`
    REVOKE ALL ON TABLE public.payment_requests FROM PUBLIC, anon, authenticated;
    GRANT SELECT (${PAYMENT_REQUEST_CLIENT_CONFIRM_SELECT}) ON TABLE public.payment_requests TO authenticated;
    GRANT INSERT (
      user_id, store_id, customer_name, customer_phone, customer_email,
      service_type, service_id, service_name, plan_tier, amount,
      payment_method, transaction_id, sender_number,
      bank_name, bank_account_name, bank_reference
    ) ON TABLE public.payment_requests TO authenticated;
  `);

  await asRole(clientUserId, clientEmail, 'authenticated');
  let oldQuery42501Code = '';
  let oldQuery42501Msg = '';
  try {
    await db.query(
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, currency,
        payment_method, transaction_id, sender_number, status
      ) VALUES ($1,$2,'Tanvir Hasan','01712345678',$3,'website_subscription',$4,'GoAMAAS Website','GoAMAAS Website',600,'৳','bKash','TRXOLD42501','01712345678','pending')
      RETURNING *;`,
      [clientUserId, safeStoreId, clientEmail, siblingWebsiteId]
    );
  } catch (err: any) {
    oldQuery42501Code = String(err?.code || '');
    oldQuery42501Msg = String(err?.message || '');
  }
  assert(oldQuery42501Code === '42501', `Expected SQLSTATE 42501 on over-privileged INSERT ... RETURNING *, got "${oldQuery42501Code}"`);
  assert(
    oldQuery42501Msg === 'permission denied for table payment_requests',
    `Expected exact message "permission denied for table payment_requests", got "${oldQuery42501Msg}"`
  );

  // Verify least-privilege payload + PAYMENT_REQUEST_CLIENT_CONFIRM_SELECT succeeds under column-level grants!
  const lpKeys = Object.keys(leastPrivPayload);
  const lpPlaceholders = lpKeys.map((_, idx) => `$${idx + 1}`).join(', ');
  const lpValues = lpKeys.map((k) => (leastPrivPayload as Record<string, unknown>)[k]);
  const colScopedRes = await db.query<RawPaymentRequestRow>(
    `INSERT INTO public.payment_requests (${lpKeys.join(', ')}) VALUES (${lpPlaceholders}) RETURNING ${PAYMENT_REQUEST_CLIENT_CONFIRM_SELECT};`,
    lpValues
  );
  assert(colScopedRes.rows.length === 1, 'Least-privilege INSERT ... RETURNING succeeded under column-level grants');
  assert(UUID_REGEX.test(colScopedRes.rows[0].id), 'Real UUID confirmed');
  assert(colScopedRes.rows[0].status === 'pending', 'Default status = pending populated by PostgreSQL');
  assert(colScopedRes.rows[0].currency === '৳', 'Default currency = ৳ populated by PostgreSQL');

  // 5b. Missing table-level INSERT or SELECT grants on Production (even when RLS INSERT policy exists):
  //     Verify all 3 missing-grant combinations fail with SQLSTATE 42501 and persist ZERO rows!
  await asRole(null, null, 'service_role');
  const countBeforeRevoke = Number(
    (await db.query<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM public.payment_requests;`)).rows[0].cnt
  );

  const missingGrantModes: Array<{ label: string; setupSql: string }> = [
    {
      label: 'no SELECT and no INSERT granted to authenticated',
      setupSql: `REVOKE ALL ON TABLE public.payment_requests FROM PUBLIC, anon, authenticated;`,
    },
    {
      label: 'SELECT granted without INSERT to authenticated',
      setupSql: `REVOKE ALL ON TABLE public.payment_requests FROM PUBLIC, anon, authenticated; GRANT SELECT ON TABLE public.payment_requests TO authenticated;`,
    },
    {
      label: 'INSERT granted without SELECT to authenticated (INSERT ... RETURNING)',
      setupSql: `REVOKE ALL ON TABLE public.payment_requests FROM PUBLIC, anon, authenticated; GRANT INSERT ON TABLE public.payment_requests TO authenticated;`,
    },
  ];

  for (const mode of missingGrantModes) {
    await asRole(null, null, 'service_role');
    await db.exec(mode.setupSql);

    await asRole(clientUserId, clientEmail, 'authenticated');
    let errCode = '';
    let errMsg = '';
    try {
      await db.query(
        `INSERT INTO public.payment_requests (${lpKeys.join(', ')}) VALUES (${lpPlaceholders}) RETURNING ${PAYMENT_REQUEST_CLIENT_CONFIRM_SELECT};`,
        lpValues.map((v, i) => (lpKeys[i] === 'transaction_id' ? 'TRXATOMIC001' : v))
      );
    } catch (err: any) {
      errCode = String(err?.code || '');
      errMsg = String(err?.message || '');
    }
    assert(errCode === '42501', `Expected 42501 when ${mode.label}, got "${errCode}"`);
    assert(
      errMsg === 'permission denied for table payment_requests',
      `Expected "permission denied for table payment_requests" when ${mode.label}, got "${errMsg}"`
    );

    await asRole(null, null, 'service_role');
    const countAfter = Number(
      (await db.query<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM public.payment_requests;`)).rows[0].cnt
    );
    assert(
      countAfter === countBeforeRevoke,
      `INSERT must NOT persist any row when 42501 occurs (${mode.label}): expected ${countBeforeRevoke}, got ${countAfter}`
    );
  }

  console.log('  ✓ Confirmed SQLSTATE 42501 ACL behavior, least-privilege column compatibility, and 0-row atomic abort');

  console.log('\n[6/6] Verifying cross-tab session overwrite guard, self-approval enforcement, and approval diagnostics...');

  // 6a. Legitimate separate client Google account passes session ownership validation
  const validClientWrite = validateClientWriteSessionOwnership({
    authUserId: clientUserId,
    authUserEmail: clientEmail,
    expectedUserId: clientUserId,
    actionLabel: 'payment submission',
  });
  assert(validClientWrite.allowed === true, 'Separate client Google account must be allowed');
  assert(!isPlatformAdminAccountEmail(clientEmail), 'Client email is not platform admin');
  assert(isPlatformAdminAccountEmail('official.amaas.dev@gmail.com'), 'Admin email recognized');
  assert(isPlatformAdminAccountEmail('  OFFICIAL.AMAAS.DEV@GMAIL.COM '), 'Case-insensitive admin email recognized');

  // 6b. Cross-tab overwrite: client opened wizard as clientUserId, then another tab signed into official.amaas.dev@gmail.com
  const crossTabSwitchedCheck = validateClientWriteSessionOwnership({
    authUserId: adminUserId,
    authUserEmail: adminEmail,
    expectedUserId: clientUserId,
    actionLabel: 'payment submission',
  });
  assert(crossTabSwitchedCheck.allowed === false, 'Cross-tab session overwrite to admin must be blocked');
  assert(
    crossTabSwitchedCheck.code === 'SESSION_ACCOUNT_CHANGED',
    `Expected SESSION_ACCOUNT_CHANGED, got ${crossTabSwitchedCheck.code}`
  );

  // 6c. Direct merchant submission while browser is signed into official.amaas.dev@gmail.com must be blocked
  const directAdminMerchantCheck = validateClientWriteSessionOwnership({
    authUserId: adminUserId,
    authUserEmail: adminEmail,
    expectedUserId: adminUserId,
    actionLabel: 'website creation',
  });
  assert(directAdminMerchantCheck.allowed === false, 'Platform admin account must not create self-owned merchant payment/website');
  assert(
    directAdminMerchantCheck.code === 'ADMIN_MERCHANT_SUBMISSION_BLOCKED',
    `Expected ADMIN_MERCHANT_SUBMISSION_BLOCKED, got ${directAdminMerchantCheck.code}`
  );

  // 6d. Self-approval restriction remains strictly enforced on BOTH frontend guard (case-insensitive) and PostgreSQL RPC
  const selfApprovalFrontend = await executeApproveAndPublishWorkflow({
    mode: 'approve_and_publish',
    request: {
      ...adminVisibleReq,
      id: '99999999-9999-4999-8999-999999999999',
      status: 'pending',
      userId: adminUserId.toUpperCase(),
    },
    callerRole: 'admin',
    callerUserId: adminUserId.toLowerCase(),
    adapters: {
      requireUuidServiceId: true,
      approvePaymentRpc: async () => {
        throw new Error('RPC must NOT be called when frontend self-approval guard triggers');
      },
      fetchPaymentRequestById: async () => null,
      fetchWebsiteById: async () => null,
      publishWebsiteRpc: async () => ({ success: false, message: 'unreachable', error: null }),
    },
  });
  assert(selfApprovalFrontend.success === false, 'Frontend guard must reject self-approval');
  assert(selfApprovalFrontend.code === 'SELF_APPROVAL_FORBIDDEN', 'Expected SELF_APPROVAL_FORBIDDEN');
  assert(
    selfApprovalFrontend.message === 'Access denied: Administrators cannot approve their own payment requests.',
    `Unexpected self-approval message: ${selfApprovalFrontend.message}`
  );

  // Restore standard authenticated SELECT/INSERT grants and verify end-to-end Production baseline behavior
  // when a row was contaminated with user_id = adminUserId despite client-typed contact fields:
  await asRole(null, null, 'service_role');
  await db.exec(`GRANT SELECT, INSERT ON TABLE public.payment_requests TO authenticated;`);
  const adminSelfReqRes = await db.query<RawPaymentRequestRow>(
    `
    INSERT INTO public.payment_requests (
      user_id, customer_name, customer_phone, customer_email,
      service_type, service_id, service_name, plan_tier, amount,
      payment_method, transaction_id, sender_number, status
    ) VALUES (
      $1, 'Client Typed Name', '01799999999', 'client.typed@example.com',
      'ai_automation', 'starter', 'AI Starter', 'Starter', 2500,
      'bKash', 'TRXSELFADM01', '01799999999', 'pending'
    ) RETURNING *;
    `,
    [adminUserId]
  );
  const adminSelfReqRow = adminSelfReqRes.rows[0];
  const adminSelfReqId = adminSelfReqRow.id;

  await asRole(adminUserId, adminEmail, 'authenticated');
  let rpcWasCalledOnSelfOwnedRow = false;
  const prodSelfWorkflowOutcome = await executeApproveAndPublishWorkflow({
    mode: 'approve_and_publish',
    request: mapRow(adminSelfReqRow),
    callerRole: 'admin',
    callerUserId: adminUserId,
    adapters: {
      requireUuidServiceId: true,
      approvePaymentRpc: async (reqId, notes) => {
        rpcWasCalledOnSelfOwnedRow = true;
        const rpcRes = await db.query<{ res: any }>(
          `SELECT public.admin_approve_payment_request($1::uuid, $2::text) AS res;`,
          [reqId, notes || null]
        );
        const body = rpcRes.rows[0]?.res;
        return {
          success: Boolean(body?.success),
          code: body?.code || 'APPROVED',
          message: body?.message || 'Approved',
          requestId: reqId,
          error: body?.success ? null : new Error(body?.message || 'Approve failed'),
        };
      },
      fetchPaymentRequestById: async () => null,
      fetchWebsiteById: async () => null,
      publishWebsiteRpc: async () => ({ success: false, message: 'unreachable', error: null }),
    },
  });
  assert(prodSelfWorkflowOutcome.success === false, 'Self-owned row must be rejected');
  assert(
    prodSelfWorkflowOutcome.code === 'SELF_APPROVAL_FORBIDDEN',
    `Expected SELF_APPROVAL_FORBIDDEN, got ${prodSelfWorkflowOutcome.code}`
  );
  assert(
    prodSelfWorkflowOutcome.message === 'Access denied: Administrators cannot approve their own payment requests.',
    `Unexpected message: ${prodSelfWorkflowOutcome.message}`
  );
  assert(rpcWasCalledOnSelfOwnedRow === false, 'Frontend guard must halt before calling RPC');

  const checkStillPending = await db.query<{ status: string }>(
    `SELECT status FROM public.payment_requests WHERE id = $1::uuid;`,
    [adminSelfReqId]
  );
  assert(checkStillPending.rows[0].status === 'pending', 'Self-owned row must remain pending in DB');

  // 6e. Verify new approval & session mismatch diagnostic stages scrub all tokens/PII
  clearPaymentDiagnosticsForTest();
  emitPaymentDiagnostic({
    stage: 'CLIENT_SESSION_MISMATCH_BLOCKED',
    httpStatus: 403,
    errorCode: 'SESSION_ACCOUNT_CHANGED',
    operation: 'SUBMIT_PAYMENT_PRECHECK',
    table: 'payment_requests',
    requestId: null,
    projectRef: 'rqmgnewipgqgmvzpbrfn',
    hasUserId: true,
    hasWebsiteId: true,
    originLayer: 'session_check',
  });
  emitPaymentDiagnostic({
    stage: 'ADMIN_APPROVAL_STARTED',
    httpStatus: null,
    errorCode: null,
    operation: 'approve_and_publish',
    table: 'payment_requests',
    requestId: insertedPayment.id,
    projectRef: 'rqmgnewipgqgmvzpbrfn',
    hasUserId: true,
    hasWebsiteId: true,
    callerMatchesRequestOwner: false,
  });
  emitPaymentDiagnostic({
    stage: 'ADMIN_APPROVAL_FAILED',
    httpStatus: 403,
    errorCode: 'SELF_APPROVAL_FORBIDDEN',
    operation: 'approve_and_publish',
    table: 'payment_requests',
    requestId: adminSelfReqId,
    projectRef: 'rqmgnewipgqgmvzpbrfn',
    hasUserId: true,
    hasWebsiteId: false,
    callerMatchesRequestOwner: true,
    originLayer: 'frontend_guard',
  });
  emitPaymentDiagnostic({
    stage: 'ADMIN_APPROVAL_SUCCEEDED',
    httpStatus: 200,
    errorCode: null,
    operation: 'approve_and_publish',
    table: 'payment_requests',
    requestId: insertedPayment.id,
    projectRef: 'rqmgnewipgqgmvzpbrfn',
    hasUserId: true,
    hasWebsiteId: true,
    callerMatchesRequestOwner: false,
    originLayer: 'rpc',
  });

  const approvalDiagLogs = getRecentPaymentDiagnostics();
  assert(approvalDiagLogs.length === 4, `Expected 4 approval/session diagnostic logs, got ${approvalDiagLogs.length}`);
  assert(approvalDiagLogs[2].callerMatchesRequestOwner === true, 'Expected callerMatchesRequestOwner=true on self-approval failure');
  assert(approvalDiagLogs[2].originLayer === 'frontend_guard', 'Expected originLayer=frontend_guard');
  assert(approvalDiagLogs[3].callerMatchesRequestOwner === false, 'Expected callerMatchesRequestOwner=false on valid approval');
  const approvalDiagJson = JSON.stringify(approvalDiagLogs);
  assert(!approvalDiagJson.includes('@'), 'No email addresses in approval diagnostics');
  assert(!approvalDiagJson.includes('TRX'), 'No transaction IDs in approval diagnostics');
  assert(!approvalDiagJson.includes('017'), 'No phone numbers in approval diagnostics');

  console.log('  ✓ Cross-tab session overwrite guard, self-approval enforcement, and diagnostics verified');
  console.log('\nALL PRODUCTION BASELINE & NODE ESM TESTS PASSED!');
}

runProductionBaselineWorkflowSuite().catch((err: any) => {
  console.error('\nTEST SUITE FAILED:', err?.message || String(err));
  if (err?.detail) console.error('Detail:', err.detail);
  if (err?.hint) console.error('Hint:', err.hint);
  if (err?.position) console.error('Position:', err.position);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});

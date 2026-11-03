import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import verifyPricingHandler from '../api/verify-pricing';
import resolveTenantHandler from '../api/resolve-tenant';
import {
  ApproveAndPublishAdapters,
  THIRTY_DAYS_MS,
  buildVerifiedPaymentReceipt,
  executeApproveAndPublishWorkflow,
  getPublicWebsiteHref,
  getWebsiteSubscriptionExpiryMs,
  hasDuplicateActiveTransactionReference,
  isWebsitePaymentService,
  isWebsiteSubscriptionExpired,
  isWebsiteTrulyLive,
  resolveClientWebsiteLifecycleState,
  validateManualPaymentSubmissionInput,
} from '../src/lib/paymentWorkflow';
import {
  RawPaymentRequestRow,
  buildMerchantWebsiteInsertPayload,
  mapDatabaseRowToSubscribedWebsite,
} from '../src/lib/supabase';
import { PaymentRequest, SubscribedWebsite } from '../src/types';

function mapRowToPaymentRequest(row: RawPaymentRequestRow): PaymentRequest {
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function runCompleteLifecycleSuite() {
  console.log('=== GOAMAAS COMPLETE PAYMENT, RECEIPT & 30-DAY SUBSCRIPTION LIFECYCLE SUITE (14 SCENARIOS) ===');

  const db = new PGlite();

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

  async function asUser(
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

  const baseSchema = fs
    .readFileSync('supabase/schema.sql', 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
  const migration20261029 = fs.readFileSync(
    'supabase/migrations/20261029_website_builder_storage_and_autopublish.sql',
    'utf8'
  );

  await db.exec(baseSchema);
  await db.exec(migration20261029);

  const clientGoogleId = '11111111-2222-4333-8444-555555555555';
  const clientEmail = 'merchant.dhakacraft@gmail.com';
  const otherMerchantId = '22222222-3333-4444-8555-666666666666';
  const otherMerchantEmail = 'other.merchant@gmail.com';
  const adminUserId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const adminEmail = 'official.amaas.dev@gmail.com';

  await asUser(null, null, 'service_role');
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${clientGoogleId}', '${clientEmail}', '{"provider":"google","email_verified":true}'::jsonb),
      ('${otherMerchantId}', '${otherMerchantEmail}', '{"provider":"google","email_verified":true}'::jsonb),
      ('${adminUserId}', '${adminEmail}', '{"provider":"google","email_verified":true}'::jsonb);

    INSERT INTO public.profiles (id, email, full_name, role) VALUES
      ('${clientGoogleId}', '${clientEmail}', 'Arifur Rahman', 'merchant'),
      ('${otherMerchantId}', '${otherMerchantEmail}', 'Nusrat Jahan', 'merchant'),
      ('${adminUserId}', '${adminEmail}', 'GoAMAAS Admin', 'merchant')
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.profiles SET role = 'admin' WHERE id = '${adminUserId}';
  `);

  await asUser(clientGoogleId, clientEmail, 'authenticated');
  const clientStoreId = (
    await db.query<{ id: string }>(`
      INSERT INTO public.stores (owner_id, name, slug, category, currency, phone, address)
      VALUES ('${clientGoogleId}', 'Dhaka Craft Studio', 'dhaka-craft-studio', 'Handicrafts', '৳', '+8801711998877', 'Banani, Dhaka')
      RETURNING id;
    `)
  ).rows[0].id;
  await db.query(`UPDATE public.profiles SET store_id = '${clientStoreId}' WHERE id = '${clientGoogleId}';`);

  // Add a product to client's store so we can verify products remain saved across expiry & renewal
  await db.query(`
    INSERT INTO public.products (store_id, name, sku, category, price, stock)
    VALUES ('${clientStoreId}', 'Handwoven Jamdani Stole', 'JMD-001', 'Handicrafts', 2450, 18);
  `);

  async function createWebsiteForClient(subdomain: string, businessName: string): Promise<SubscribedWebsite> {
    await asUser(clientGoogleId, clientEmail, 'authenticated');
    const { payload, error } = buildMerchantWebsiteInsertPayload({
      userId: clientGoogleId,
      storeId: clientStoreId,
      subdomain,
      businessName,
      niche: 'ecommerce',
      templateId: 'tpl-ecom-1',
      templateName: 'Artisan Commerce',
      config: {
        ownerName: 'Arifur Rahman',
        phone: '+8801711998877',
        email: clientEmail,
        nicheLabel: 'Handicrafts',
        logoUrl: 'https://cdn.amaas.xyz/logos/dhakacraft.png',
        brandColor: '#059669',
        headline: 'Authentic Handcrafted Heritage',
        subheadline: 'Handwoven in Dhaka',
      },
    });
    if (error || !payload) throw error || new Error('Failed to build website payload');

    const cols = Object.keys(payload);
    const vals = cols.map((_, idx) => `$${idx + 1}`);
    const params = cols.map((k) => {
      const val = (payload as Record<string, unknown>)[k];
      return typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
    });

    const res = await db.query<Record<string, unknown>>(
      `INSERT INTO public.subscribed_websites (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING *;`,
      params
    );
    return mapDatabaseRowToSubscribedWebsite(res.rows[0]);
  }

  function createAdminAdapters(): ApproveAndPublishAdapters {
    return {
      requireUuidServiceId: true,
      approvePaymentRpc: async (requestId: string, notes?: string) => {
        await asUser(adminUserId, adminEmail, 'authenticated');
        try {
          const r = await db.query<{ res: Record<string, unknown> }>(
            `SELECT public.admin_approve_payment_request($1::uuid, $2::text) AS res;`,
            [requestId, notes || null]
          );
          const payload = r.rows[0]?.res || {};
          if (!payload.success) {
            const msg = String(payload.message || 'Approval failed');
            return {
              success: false,
              code: payload.code ? String(payload.code) : undefined,
              message: msg,
              error: new Error(msg),
            };
          }
          return {
            success: true,
            code: String(payload.code || 'APPROVED'),
            message: String(payload.message || 'Approved'),
            requestId: String(payload.request_id || requestId),
            websiteId: payload.website_id ? String(payload.website_id) : undefined,
            autoPublished: Boolean(payload.auto_published),
            deploymentStatus: payload.deployment_status as SubscribedWebsite['deploymentStatus'],
            error: null,
          };
        } catch (err: any) {
          return {
            success: false,
            code: 'RPC_ERROR',
            message: err.message || 'RPC failed',
            error: err instanceof Error ? err : new Error(String(err)),
          };
        }
      },
      fetchPaymentRequestById: async (requestId: string) => {
        await asUser(adminUserId, adminEmail, 'authenticated');
        const r = await db.query<RawPaymentRequestRow>(
          `SELECT * FROM public.payment_requests WHERE id = $1::uuid;`,
          [requestId]
        );
        return r.rows[0] ? mapRowToPaymentRequest(r.rows[0]) : null;
      },
      fetchWebsiteById: async (websiteId: string) => {
        await asUser(adminUserId, adminEmail, 'authenticated');
        const r = await db.query<Record<string, unknown>>(
          `SELECT * FROM public.subscribed_websites WHERE id = $1::uuid;`,
          [websiteId]
        );
        return r.rows[0] ? mapDatabaseRowToSubscribedWebsite(r.rows[0]) : null;
      },
      publishWebsiteRpc: async (websiteId: string) => {
        await asUser(adminUserId, adminEmail, 'authenticated');
        try {
          const r = await db.query<{ res: Record<string, unknown> }>(
            `SELECT public.publish_client_website($1::uuid) AS res;`,
            [websiteId]
          );
          const payload = r.rows[0]?.res || {};
          if (!payload.success) {
            const msg = String(payload.message || 'Publish failed');
            return { success: false, message: msg, error: new Error(msg) };
          }
          return {
            success: true,
            message: String(payload.message || 'Published'),
            error: null,
          };
        } catch (err: any) {
          return {
            success: false,
            message: err.message || 'Publish RPC failed',
            error: err instanceof Error ? err : new Error(String(err)),
          };
        }
      },
    };
  }

  // Helper to invoke /api/verify-pricing serverless handler directly
  async function invokeVerifyPricing(params: {
    method?: 'GET' | 'POST';
    bearerToken?: string;
    body?: Record<string, unknown>;
    simulateMissingCatalogTable?: boolean;
    simulateEmptyCatalogTable?: boolean;
  }) {
    const originalFetch = globalThis.fetch;
    const prevUrl = process.env.VITE_SUPABASE_URL;
    const prevPubKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const prevAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

    let statusCode = 200;
    let bodyText = '';
    const headers: Record<string, string> = {};

    const mockReq: any = {
      method: params.method || 'POST',
      url: '/api/verify-pricing',
      headers: {
        host: 'app.amaas.xyz',
        ...(params.bearerToken ? { authorization: `Bearer ${params.bearerToken}` } : {}),
      },
      body: params.body || {},
    };
    const mockRes: any = {
      get statusCode() {
        return statusCode;
      },
      set statusCode(c: number) {
        statusCode = c;
      },
      setHeader(k: string, v: string) {
        headers[k.toLowerCase()] = String(v);
      },
      end(chunk?: string) {
        if (chunk) bodyText += chunk;
      },
    };

    try {
      process.env.VITE_SUPABASE_URL = 'https://umiheyukaddfaupsyooh.supabase.co';
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key_abc123';
      delete process.env.VITE_SUPABASE_ANON_KEY;

      globalThis.fetch = (async (input: any) => {
        const url = String(input);
        if (url.includes('/auth/v1/user')) {
          if (params.bearerToken === 'valid-google-jwt') {
            return new Response(
              JSON.stringify({ id: clientGoogleId, email: clientEmail }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return new Response(JSON.stringify({ message: 'Invalid JWT' }), { status: 401 });
        }

        if (url.includes('/rest/v1/service_pricing_catalog')) {
          if (params.simulateMissingCatalogTable) {
            return new Response(
              JSON.stringify({
                code: 'PGRST205',
                message: "Could not find the table 'public.service_pricing_catalog' in the schema cache",
              }),
              { status: 404, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (params.simulateEmptyCatalogTable) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          await asUser(clientGoogleId, clientEmail, 'authenticated');
          const catRows = await db.query(
            `SELECT service_type, service_code, plan_tier_label, price_bdt, setup_fee_bdt, is_active, updated_at FROM public.service_pricing_catalog;`
          );
          return new Response(JSON.stringify(catRows.rows), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (url.includes('/rest/v1/subscribed_websites')) {
          const parsedUrl = new URL(url);
          const idParam = (parsedUrl.searchParams.get('id') || '').replace(/^eq\./, '');
          await asUser(clientGoogleId, clientEmail, 'authenticated');
          const siteRows = await db.query(
            `SELECT * FROM public.subscribed_websites WHERE id = $1::uuid AND user_id = $2::uuid;`,
            [idParam, clientGoogleId]
          );
          return new Response(JSON.stringify(siteRows.rows), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ error: 'Unhandled URL' }), { status: 500 });
      }) as typeof fetch;

      await verifyPricingHandler(mockReq, mockRes);
      return {
        statusCode,
        headers,
        json: bodyText ? JSON.parse(bodyText) : null,
      };
    } finally {
      globalThis.fetch = originalFetch;
      if (prevUrl === undefined) delete process.env.VITE_SUPABASE_URL;
      else process.env.VITE_SUPABASE_URL = prevUrl;
      if (prevPubKey === undefined) delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      else process.env.VITE_SUPABASE_PUBLISHABLE_KEY = prevPubKey;
      if (prevAnonKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
      else process.env.VITE_SUPABASE_ANON_KEY = prevAnonKey;
    }
  }

  // Helper to invoke /api/resolve-tenant serverless handler directly
  async function invokeResolveTenant(subdomainHost: string) {
    const originalFetch = globalThis.fetch;
    const prevUrl = process.env.VITE_SUPABASE_URL;
    const prevPubKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    let statusCode = 200;
    let bodyText = '';
    const headers: Record<string, string> = {};

    const mockReq: any = {
      method: 'GET',
      url: '/api/resolve-tenant',
      headers: { host: subdomainHost },
    };
    const mockRes: any = {
      get statusCode() {
        return statusCode;
      },
      set statusCode(c: number) {
        statusCode = c;
      },
      setHeader(k: string, v: string) {
        headers[k.toLowerCase()] = String(v);
      },
      end(chunk?: string) {
        if (chunk) bodyText += chunk;
      },
    };

    try {
      process.env.VITE_SUPABASE_URL = 'https://umiheyukaddfaupsyooh.supabase.co';
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key_abc123';

      globalThis.fetch = (async (_input: any, init?: RequestInit) => {
        const parsedBody = init?.body ? JSON.parse(String(init.body)) : {};
        await asUser(null, null, 'anon');
        const rpcRes = await db.query<{ res: unknown }>(
          `SELECT public.get_published_website_by_subdomain($1) AS res;`,
          [parsedBody.p_subdomain]
        );
        return new Response(JSON.stringify(rpcRes.rows[0]?.res ?? { found: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      await resolveTenantHandler(mockReq, mockRes);
      return {
        statusCode,
        headers,
        json: bodyText ? JSON.parse(bodyText) : null,
      };
    } finally {
      globalThis.fetch = originalFetch;
      if (prevUrl === undefined) delete process.env.VITE_SUPABASE_URL;
      else process.env.VITE_SUPABASE_URL = prevUrl;
      if (prevPubKey === undefined) delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      else process.env.VITE_SUPABASE_PUBLISHABLE_KEY = prevPubKey;
    }
  }

  let passed = 0;
  function passScenario(num: number, title: string) {
    passed += 1;
    console.log(`[PASS] Scenario ${num}: ${title}`);
  }

  // =========================================================================
  // SCENARIO 1: Client logs in with Google, creates website, opens payment modal,
  //             and pricing verifies without "Unable to verify active service pricing..."
  // =========================================================================
  const primaryWebsite = await createWebsiteForClient('dhakacraft', 'Dhaka Craft Studio');
  const siblingWebsite = await createWebsiteForClient('dhakacraftsecond', 'Dhaka Craft Second Brand');

  assert(primaryWebsite.paymentStatus === 'pending', 'New website must start with paymentStatus=pending');
  assert(primaryWebsite.deploymentStatus !== 'live', 'New website must start unpublished (not live)');

  const draftLifecycle = resolveClientWebsiteLifecycleState(primaryWebsite, []);
  assert(
    draftLifecycle.label === 'Draft — Awaiting Payment',
    `Expected Draft — Awaiting Payment, got ${draftLifecycle.label}`
  );

  // 1a. Seeded service_pricing_catalog
  const pricingSeeded = await invokeVerifyPricing({
    method: 'POST',
    bearerToken: 'valid-google-jwt',
    body: { serviceType: 'website_subscription', serviceId: primaryWebsite.id },
  });
  assert(
    pricingSeeded.statusCode === 200 &&
      pricingSeeded.json?.ok === true &&
      pricingSeeded.json?.resolvedPrice?.amount === 600 &&
      pricingSeeded.json?.resolvedPrice?.subdomain === 'dhakacraft',
    `Expected 200 verified price 600 (seeded), got ${JSON.stringify(pricingSeeded)}`
  );

  // 1b. Missing service_pricing_catalog table in Production DB (PGRST205) -> still resolves cleanly via server-stored website fee & canonical catalog!
  const pricingMissingTable = await invokeVerifyPricing({
    method: 'POST',
    bearerToken: 'valid-google-jwt',
    body: { serviceType: 'website_subscription', serviceId: primaryWebsite.id },
    simulateMissingCatalogTable: true,
  });
  assert(
    pricingMissingTable.statusCode === 200 &&
      pricingMissingTable.json?.ok === true &&
      pricingMissingTable.json?.catalogSource === 'server_authoritative_fallback' &&
      pricingMissingTable.json?.resolvedPrice?.amount === 600,
    `Expected 200 fallback server_authoritative_fallback price 600 when catalog table missing, got ${JSON.stringify(pricingMissingTable)}`
  );

  // 1c. Empty service_pricing_catalog (0 rows) -> still resolves cleanly!
  const pricingEmptyTable = await invokeVerifyPricing({
    method: 'POST',
    bearerToken: 'valid-google-jwt',
    body: { serviceType: 'website_subscription', serviceId: primaryWebsite.id },
    simulateEmptyCatalogTable: true,
  });
  assert(
    pricingEmptyTable.statusCode === 200 &&
      pricingEmptyTable.json?.ok === true &&
      pricingEmptyTable.json?.resolvedPrice?.amount === 600,
    `Expected 200 fallback price 600 when catalog table empty, got ${JSON.stringify(pricingEmptyTable)}`
  );

  // 1d. Expired/missing session returns actionable 401 AUTH_REQUIRED (never generic pricing message)
  const pricingNoAuth = await invokeVerifyPricing({
    method: 'POST',
    body: { serviceType: 'website_subscription', serviceId: primaryWebsite.id },
  });
  assert(
    pricingNoAuth.statusCode === 401 && pricingNoAuth.json?.code === 'AUTH_REQUIRED',
    `Expected 401 AUTH_REQUIRED for expired session, got ${JSON.stringify(pricingNoAuth)}`
  );
  passScenario(
    1,
    'Google client creates website, opens payment modal, and /api/verify-pricing verifies server price (seeded, unmigrated, & empty catalog resilience)'
  );

  // =========================================================================
  // SCENARIO 2: Client submits valid payment with Transaction ID -> saved as pending
  // =========================================================================
  const clientValidation = validateManualPaymentSubmissionInput({
    paymentMethod: 'bKash',
    transactionId: '  bkash778899init  ',
    senderNumber: '01711998877',
    amount: pricingSeeded.json.resolvedPrice.amount,
    serviceId: primaryWebsite.id,
  });
  assert(
    clientValidation.valid && clientValidation.normalizedReference === 'BKASH778899INIT',
    'Expected normalized valid bKash submission input'
  );

  // Tampered client amount (৳1 instead of ৳600) must be blocked by Postgres trigger
  await asUser(clientGoogleId, clientEmail, 'authenticated');
  let tamperRejected = false;
  try {
    await db.query(
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, currency,
        payment_method, transaction_id, sender_number, status
      ) VALUES ($1::uuid, $2::uuid, 'Arifur Rahman', '+8801711998877', $3,
        'website_subscription', $4, 'GoAMAAS Website (dhakacraft.amaas.xyz)', 'GoAMAAS Website', 1, '৳',
        'bKash', 'TAMPER001', '01711998877', 'pending');`,
      [clientGoogleId, clientStoreId, clientEmail, primaryWebsite.id]
    );
  } catch {
    tamperRejected = true;
  }
  assert(tamperRejected, 'Tampered client payment amount (৳1) must be rejected by server/DB');

  // Valid ৳600 submission saved as pending (never paid!)
  const firstPendingRow = (
    await db.query<RawPaymentRequestRow>(
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, currency,
        payment_method, transaction_id, sender_number, status
      ) VALUES ($1::uuid, $2::uuid, 'Arifur Rahman', '+8801711998877', $3,
        'website_subscription', $4, 'GoAMAAS Website (dhakacraft.amaas.xyz)', 'GoAMAAS Website', 600, '৳',
        'bKash', $5, '01711998877', 'pending') RETURNING *;`,
      [
        clientGoogleId,
        clientStoreId,
        clientEmail,
        primaryWebsite.id,
        clientValidation.normalizedReference,
      ]
    )
  ).rows[0];
  const firstPendingReq = mapRowToPaymentRequest(firstPendingRow);
  assert(firstPendingReq.status === 'pending', 'Submitted payment request must be saved as pending');
  assert(firstPendingReq.serviceId === primaryWebsite.id, 'Payment must bind exact website ID');
  assert(
    buildVerifiedPaymentReceipt(firstPendingReq, primaryWebsite) === null,
    'Receipt MUST NOT be generated for pending payment'
  );
  passScenario(
    2,
    'Client submits valid payment with Transaction ID -> saved as pending bound to exact website ID & Google user'
  );

  // =========================================================================
  // SCENARIO 3: Website is NOT publicly accessible while payment is pending
  // =========================================================================
  const pendingPublicCheck = await invokeResolveTenant('dhakacraft.amaas.xyz');
  assert(
    pendingPublicCheck.statusCode === 404 &&
      pendingPublicCheck.json?.found === false &&
      pendingPublicCheck.json?.site === undefined &&
      !JSON.stringify(pendingPublicCheck.json).includes(clientEmail) &&
      (pendingPublicCheck.headers['cache-control'] || '').includes('no-store'),
    `Expected pending website to return 404 with no-store and zero PII, got ${JSON.stringify(pendingPublicCheck)}`
  );
  assert(!isWebsiteTrulyLive(primaryWebsite), 'Pending website must not be marked live');

  const pendingLifecycle = resolveClientWebsiteLifecycleState(primaryWebsite, [firstPendingReq]);
  assert(
    pendingLifecycle.label === 'Payment Under Admin Verification',
    `Expected Payment Under Admin Verification, got ${pendingLifecycle.label}`
  );
  passScenario(3, 'Website is strictly blocked from public access (HTTP 404, zero PII) while payment is pending');

  // =========================================================================
  // SCENARIO 4: Duplicate Transaction ID and duplicate pending website payment are blocked
  // =========================================================================
  assert(
    hasDuplicateActiveTransactionReference([firstPendingReq], '  bkash778899init '),
    'Client pre-check must detect case-insensitive duplicate active Transaction ID'
  );

  // 4a. Duplicate pending request on the SAME website ID blocked by unique partial index
  let dupPendingBlocked = false;
  try {
    await db.query(
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, currency,
        payment_method, transaction_id, sender_number, status
      ) VALUES ($1::uuid, $2::uuid, 'Arifur Rahman', '+8801711998877', $3,
        'website_subscription', $4, 'GoAMAAS Website (dhakacraft.amaas.xyz)', 'GoAMAAS Website', 600, '৳',
        'bKash', 'BKASHDIFFERENT99', '01711998877', 'pending');`,
      [clientGoogleId, clientStoreId, clientEmail, primaryWebsite.id]
    );
  } catch {
    dupPendingBlocked = true;
  }
  assert(dupPendingBlocked, 'Duplicate pending payment for the same website must be blocked');

  // 4b. Reusing the same active Transaction ID on a different website is also blocked by unique index
  let dupTrxBlocked = false;
  try {
    await db.query(
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, currency,
        payment_method, transaction_id, sender_number, status
      ) VALUES ($1::uuid, $2::uuid, 'Arifur Rahman', '+8801711998877', $3,
        'website_subscription', $4, 'GoAMAAS Website (dhakacraftsecond.amaas.xyz)', 'GoAMAAS Website', 600, '৳',
        'bKash', 'bkash778899init', '01711998877', 'pending');`,
      [clientGoogleId, clientStoreId, clientEmail, siblingWebsite.id]
    );
  } catch {
    dupTrxBlocked = true;
  }
  assert(dupTrxBlocked, 'Duplicate active Transaction ID must be blocked across requests');
  passScenario(4, 'Duplicate active Transaction ID and duplicate pending website payment are strictly blocked');

  // =========================================================================
  // SCENARIO 5: Payment request appears in Admin queue with full fields & searchability
  // =========================================================================
  await asUser(adminUserId, adminEmail, 'authenticated');
  const adminQueueRows = (
    await db.query<RawPaymentRequestRow>(
      `SELECT * FROM public.payment_requests ORDER BY created_at DESC;`
    )
  ).rows.map(mapRowToPaymentRequest);
  const queuedItem = adminQueueRows.find((r) => r.id === firstPendingReq.id);
  assert(Boolean(queuedItem), 'Submitted payment request must appear in Admin queue');
  assert(
    queuedItem!.customerName === 'Arifur Rahman' &&
      queuedItem!.customerEmail === clientEmail &&
      queuedItem!.serviceId === primaryWebsite.id &&
      queuedItem!.amount === 600 &&
      queuedItem!.paymentMethod === 'bKash' &&
      queuedItem!.transactionId === 'BKASH778899INIT' &&
      queuedItem!.senderNumber === '01711998877' &&
      queuedItem!.status === 'pending',
    'Admin queue item must contain complete client, website, amount, gateway, TrxID, and sender details'
  );

  // Verify search predicate matches TrxID, client email, and website subdomain
  const matchesAdminSearch = (query: string) => {
    const q = query.trim().toLowerCase();
    return (
      (queuedItem!.transactionId || '').toLowerCase().includes(q) ||
      (queuedItem!.customerEmail || '').toLowerCase().includes(q) ||
      primaryWebsite.subdomain.toLowerCase().includes(q) ||
      primaryWebsite.fullDomainUrl.toLowerCase().includes(q) ||
      queuedItem!.serviceId.toLowerCase().includes(q)
    );
  };
  assert(matchesAdminSearch('bkash778899init'), 'Admin search must match Transaction ID');
  assert(matchesAdminSearch('merchant.dhakacraft@gmail.com'), 'Admin search must match client email');
  assert(matchesAdminSearch('dhakacraft.amaas.xyz'), 'Admin search must match website subdomain');
  passScenario(5, 'Payment request appears in Admin queue with full metadata and matches TrxID, email, & subdomain search');

  // =========================================================================
  // SCENARIO 6: Admin rejects invalid payment with reason -> client sees reason, site stays offline
  // =========================================================================
  await asUser(adminUserId, adminEmail, 'authenticated');
  const rejectRpc = await db.query<{ res: { success?: boolean } }>(
    `SELECT public.admin_reject_payment_request($1::uuid, $2::text) AS res;`,
    [firstPendingReq.id, 'Transaction ID BKASH778899INIT was not found in our bKash statement.']
  );
  assert(rejectRpc.rows[0]?.res?.success === true, 'Admin rejection RPC must succeed');

  const rejectedRow = (
    await db.query<RawPaymentRequestRow>(
      `SELECT * FROM public.payment_requests WHERE id = $1::uuid;`,
      [firstPendingReq.id]
    )
  ).rows[0];
  const rejectedReq = mapRowToPaymentRequest(rejectedRow);
  assert(
    rejectedReq.status === 'rejected' &&
      rejectedReq.adminNotes?.includes('not found in our bKash statement'),
    'Rejected payment must record status=rejected and rejection reason'
  );
  assert(
    buildVerifiedPaymentReceipt(rejectedReq, primaryWebsite) === null,
    'Receipt MUST NOT be generated for rejected payment'
  );

  const rejectedLifecycle = resolveClientWebsiteLifecycleState(primaryWebsite, [rejectedReq]);
  assert(
    rejectedLifecycle.label === 'Payment Rejected — Resubmit Required' &&
      rejectedLifecycle.latestRejectedRequest?.adminNotes?.includes('not found in our bKash statement'),
    `Expected Payment Rejected — Resubmit Required with reason, got ${JSON.stringify(rejectedLifecycle)}`
  );

  const rejectedPublicCheck = await invokeResolveTenant('dhakacraft.amaas.xyz');
  assert(rejectedPublicCheck.statusCode === 404, 'Rejected payment website must remain unpublished (404)');
  passScenario(6, 'Admin rejects invalid payment -> client sees rejection reason, no receipt issued, website stays 404');

  // =========================================================================
  // SCENARIO 7: Client resubmits valid payment -> new pending request created
  // =========================================================================
  await asUser(clientGoogleId, clientEmail, 'authenticated');
  const resubmittedRow = (
    await db.query<RawPaymentRequestRow>(
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, currency,
        payment_method, transaction_id, sender_number, status
      ) VALUES ($1::uuid, $2::uuid, 'Arifur Rahman', '+8801711998877', $3,
        'website_subscription', $4, 'GoAMAAS Website (dhakacraft.amaas.xyz)', 'GoAMAAS Website', 600, '৳',
        'bKash', 'BKASHVALID600OK', '01711998877', 'pending') RETURNING *;`,
      [clientGoogleId, clientStoreId, clientEmail, primaryWebsite.id]
    )
  ).rows[0];
  const resubmittedReq = mapRowToPaymentRequest(resubmittedRow);
  assert(resubmittedReq.status === 'pending', 'Resubmitted payment must be saved as pending');

  const resubmitLifecycle = resolveClientWebsiteLifecycleState(primaryWebsite, [
    resubmittedReq,
    rejectedReq,
  ]);
  assert(
    resubmitLifecycle.label === 'Payment Under Admin Verification',
    `Expected Payment Under Admin Verification after resubmit, got ${resubmitLifecycle.label}`
  );
  passScenario(7, 'Client resubmits valid payment after rejection -> new pending request enters verification');

  // =========================================================================
  // SCENARIO 8: Admin approves valid payment -> payment marked approved & exact website published
  // =========================================================================
  const adapters = createAdminAdapters();
  const approveOutcome = await executeApproveAndPublishWorkflow({
    mode: 'approve_and_publish',
    request: resubmittedReq,
    notes: 'Verified bKash statement TrxID BKASHVALID600OK',
    callerRole: 'admin',
    callerUserId: adminUserId,
    adapters,
  });
  assert(
    approveOutcome.success &&
      approveOutcome.paymentApproved &&
      approveOutcome.websitePublished &&
      approveOutcome.code === 'APPROVED_AND_PUBLISHED',
    `Expected APPROVED_AND_PUBLISHED, got ${JSON.stringify(approveOutcome)}`
  );

  const approvedReq1 = await adapters.fetchPaymentRequestById(resubmittedReq.id);
  const liveWebsite1 = await adapters.fetchWebsiteById(primaryWebsite.id);
  assert(
    approvedReq1?.status === 'approved' &&
      liveWebsite1?.paymentStatus === 'paid' &&
      liveWebsite1?.subscriptionStatus === 'active' &&
      liveWebsite1?.deploymentStatus === 'live' &&
      isWebsiteTrulyLive(liveWebsite1),
    'Approved website must be server-confirmed paid + active + live'
  );

  const liveLifecycle = resolveClientWebsiteLifecycleState(liveWebsite1!, [
    approvedReq1!,
    rejectedReq,
  ]);
  assert(
    liveLifecycle.label === 'Live & Public',
    `Expected Live & Public, got ${liveLifecycle.label}`
  );
  passScenario(8, 'Admin approves valid payment -> payment marked approved and website verified Live & Public');

  // =========================================================================
  // SCENARIO 9: Exact client website becomes publicly accessible on <subdomain>.amaas.xyz
  //             while sibling unpaid website remains strictly blocked
  // =========================================================================
  const livePublicCheck = await invokeResolveTenant('dhakacraft.amaas.xyz');
  assert(
    livePublicCheck.statusCode === 200 &&
      livePublicCheck.json?.found === true &&
      livePublicCheck.json?.site?.subdomain === 'dhakacraft' &&
      livePublicCheck.json?.site?.businessName === 'Dhaka Craft Studio' &&
      livePublicCheck.json?.site?.headline === 'Authentic Handcrafted Heritage' &&
      livePublicCheck.json?.site?.id === undefined,
    `Expected dhakacraft.amaas.xyz to resolve 200 with exact sanitized public website, got ${JSON.stringify(livePublicCheck)}`
  );
  assert(
    getPublicWebsiteHref(liveWebsite1!, 'app.amaas.xyz') === 'https://dhakacraft.amaas.xyz',
    'Canonical production live URL must be https://dhakacraft.amaas.xyz'
  );

  const siblingPublicCheck = await invokeResolveTenant('dhakacraftsecond.amaas.xyz');
  assert(
    siblingPublicCheck.statusCode === 404 && siblingPublicCheck.json?.found === false,
    'Unpaid sibling website of the same Google user MUST NOT be published or publicly accessible'
  );
  passScenario(
    9,
    'Exact approved client website resolves 200 on dhakacraft.amaas.xyz while sibling unpaid website stays 404'
  );

  // =========================================================================
  // SCENARIO 10: Official Payment Receipt is generated with all required fields
  // =========================================================================
  const receipt1 = buildVerifiedPaymentReceipt(approvedReq1!, liveWebsite1);
  assert(receipt1 !== null, 'Official receipt must be generated for approved payment');
  assert(
    receipt1.receiptNumber.startsWith('RCPT-') &&
      receipt1.platformName === 'GoAMAAS' &&
      receipt1.companyName === 'AMAAS Technologies' &&
      receipt1.clientName === 'Arifur Rahman' &&
      receipt1.clientEmail === clientEmail &&
      receipt1.websiteName === 'Dhaka Craft Studio' &&
      receipt1.subdomain === 'dhakacraft' &&
      receipt1.amountBdt === 600 &&
      receipt1.paymentMethod === 'bKash' &&
      receipt1.transactionId === 'BKASHVALID600OK' &&
      Boolean(receipt1.approvedAtIso) &&
      Boolean(receipt1.subscriptionStartIso) &&
      Boolean(receipt1.subscriptionExpiryIso) &&
      receipt1.statusLabel === 'PAID / APPROVED' &&
      receipt1.websiteUrl === 'https://dhakacraft.amaas.xyz',
    `Receipt #1 missing required fields: ${JSON.stringify(receipt1)}`
  );
  passScenario(10, 'Official GoAMAAS / AMAAS Technologies Payment Receipt generated with all required fields');

  // =========================================================================
  // SCENARIO 11: Subscription expiry date is set to EXACTLY 30 days from approval
  // =========================================================================
  const startMs1 = Date.parse(liveWebsite1!.subscribedAt!);
  const expiryMs1 = getWebsiteSubscriptionExpiryMs(liveWebsite1);
  assert(
    Number.isFinite(startMs1) && expiryMs1 !== null,
    `Expected valid subscribedAt and currentPeriodEnd timestamps, got ${JSON.stringify(liveWebsite1)}`
  );
  const deltaMs1 = Math.abs(expiryMs1 - startMs1 - THIRTY_DAYS_MS);
  assert(
    deltaMs1 < 2000,
    `Expected exact 30-day period (${THIRTY_DAYS_MS} ms), got delta ${expiryMs1 - startMs1} ms`
  );
  passScenario(11, 'Subscription period is set to exactly 30 days (2,592,000,000 ms) from approval');

  // =========================================================================
  // SCENARIO 12: Simulated expired website immediately stops public access (even inside
  //              legacy DB grace_period) while remaining 100% saved & editable for owner
  // =========================================================================
  await asUser(null, null, 'service_role');
  await db.query(
    `UPDATE public.subscribed_websites
     SET subscribed_at = NOW() - INTERVAL '30 days 5 seconds',
         current_period_end = NOW() - INTERVAL '5 seconds',
         grace_period_end = NOW() + INTERVAL '7 days'
     WHERE id = $1::uuid;`,
    [primaryWebsite.id]
  );

  // Public subdomain access MUST immediately return 404 with expired: true and ZERO PII!
  const expiredPublicCheck = await invokeResolveTenant('dhakacraft.amaas.xyz');
  assert(
    expiredPublicCheck.statusCode === 404 &&
      expiredPublicCheck.json?.found === false &&
      expiredPublicCheck.json?.expired === true &&
      expiredPublicCheck.json?.site === undefined &&
      !JSON.stringify(expiredPublicCheck.json).includes(clientEmail) &&
      !JSON.stringify(expiredPublicCheck.json).includes('01711998877'),
    `Expected expired website to stop public access immediately (404, zero PII), got ${JSON.stringify(expiredPublicCheck)}`
  );

  // Client logs in under original Google account: website record, subdomain, design, logo, products, and receipt #1 remain saved!
  await asUser(clientGoogleId, clientEmail, 'authenticated');
  const savedSiteRows = await db.query<Record<string, unknown>>(
    `SELECT * FROM public.subscribed_websites WHERE id = $1::uuid AND user_id = $2::uuid;`,
    [primaryWebsite.id, clientGoogleId]
  );
  assert(savedSiteRows.rows.length === 1, 'Expired website record must remain saved under client account');
  const expiredWebsite = mapDatabaseRowToSubscribedWebsite(savedSiteRows.rows[0]);
  assert(
    expiredWebsite.subdomain === 'dhakacraft' &&
      expiredWebsite.logoUrl === 'https://cdn.amaas.xyz/logos/dhakacraft.png' &&
      expiredWebsite.brandColor === '#059669' &&
      expiredWebsite.headline === 'Authentic Handcrafted Heritage' &&
      isWebsiteSubscriptionExpired(expiredWebsite) &&
      !isWebsiteTrulyLive(expiredWebsite),
    'Expired website must preserve subdomain, branding, and design while marked expired/non-live'
  );

  // Client can still edit saved expired website design in Visual Website Editor (stored in config JSONB)
  await db.query(
    `UPDATE public.subscribed_websites
     SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{subheadline}', '"Updated While Expired & Ready for Renewal"')
     WHERE id = $1::uuid;`,
    [primaryWebsite.id]
  );
  const savedProducts = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM public.products WHERE store_id = $1::uuid;`,
    [clientStoreId]
  );
  assert(Number(savedProducts.rows[0]?.count) === 1, 'Store products must remain intact when website expires');

  const expiredLifecycle = resolveClientWebsiteLifecycleState(expiredWebsite, [
    approvedReq1!,
    rejectedReq,
  ]);
  assert(
    expiredLifecycle.label === 'Expired — Renew to Publish',
    `Expected Expired — Renew to Publish, got ${expiredLifecycle.label}`
  );
  passScenario(
    12,
    'Expired website immediately stops public access (404, zero PII) while remaining 100% saved, editable, and labeled "Expired — Renew to Publish"'
  );

  // =========================================================================
  // SCENARIO 13: Client submits renewal payment on exact same website ID -> Admin approves ->
  //              extends 30 days from NOW(), republishes same website, issues new receipt #2
  //              while preserving receipt #1, and blocks double-extension on repeated clicks
  // =========================================================================
  await asUser(clientGoogleId, clientEmail, 'authenticated');
  const renewalPendingRow = (
    await db.query<RawPaymentRequestRow>(
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, currency,
        payment_method, transaction_id, sender_number, status
      ) VALUES ($1::uuid, $2::uuid, 'Arifur Rahman', '+8801711998877', $3,
        'website_subscription', $4, 'GoAMAAS Website Renewal (dhakacraft.amaas.xyz)', 'GoAMAAS Website', 600, '৳',
        'bKash', 'BKASHRENEW30DAY2', '01711998877', 'pending') RETURNING *;`,
      [clientGoogleId, clientStoreId, clientEmail, primaryWebsite.id]
    )
  ).rows[0];
  const renewalPendingReq = mapRowToPaymentRequest(renewalPendingRow);

  const renewalPendingLifecycle = resolveClientWebsiteLifecycleState(expiredWebsite, [
    renewalPendingReq,
    approvedReq1!,
    rejectedReq,
  ]);
  assert(
    renewalPendingLifecycle.label === 'Renewal Payment Under Verification',
    `Expected Renewal Payment Under Verification, got ${renewalPendingLifecycle.label}`
  );

  // Still offline until admin approves renewal!
  const preRenewalApproveCheck = await invokeResolveTenant('dhakacraft.amaas.xyz');
  assert(preRenewalApproveCheck.statusCode === 404, 'Website must remain offline while renewal payment is pending');

  const beforeRenewalNowMs = Date.now();
  const renewalApproveOutcome = await executeApproveAndPublishWorkflow({
    mode: 'approve_and_publish',
    request: renewalPendingReq,
    notes: 'Verified 30-day renewal TrxID BKASHRENEW30DAY2',
    callerRole: 'admin',
    callerUserId: adminUserId,
    adapters,
  });
  assert(
    renewalApproveOutcome.success &&
      renewalApproveOutcome.paymentApproved &&
      renewalApproveOutcome.websitePublished,
    `Expected renewal approval & republish to succeed, got ${JSON.stringify(renewalApproveOutcome)}`
  );

  const renewedWebsite = await adapters.fetchWebsiteById(primaryWebsite.id);
  const approvedRenewalReq = await adapters.fetchPaymentRequestById(renewalPendingReq.id);
  assert(
    renewedWebsite !== null &&
      renewedWebsite.id === primaryWebsite.id &&
      renewedWebsite.subdomain === 'dhakacraft' &&
      renewedWebsite.subheadline === 'Updated While Expired & Ready for Renewal' &&
      isWebsiteTrulyLive(renewedWebsite),
    'Exact same saved website (with edits made while expired) must be republished live'
  );

  const renewedExpiryMs = getWebsiteSubscriptionExpiryMs(renewedWebsite)!;
  assert(
    renewedExpiryMs >= beforeRenewalNowMs + THIRTY_DAYS_MS - 5000 &&
      renewedExpiryMs <= Date.now() + THIRTY_DAYS_MS + 5000,
    `Expected expired website renewal to extend 30 days from NOW(), got expiry ${renewedWebsite.currentPeriodEnd}`
  );

  // Verify public access restored immediately (including edits saved while expired)!
  const renewedPublicCheck = await invokeResolveTenant('dhakacraft.amaas.xyz');
  assert(
    renewedPublicCheck.statusCode === 200 &&
      renewedPublicCheck.json?.found === true &&
      renewedPublicCheck.json?.site?.subdomain === 'dhakacraft' &&
      renewedPublicCheck.json?.site?.subheadline === 'Updated While Expired & Ready for Renewal',
    `Republished renewed website must resolve 200 immediately on dhakacraft.amaas.xyz, got ${JSON.stringify(renewedPublicCheck)}`
  );

  // Verify new receipt #2 generated while prior receipt #1 remains intact
  const receipt2 = buildVerifiedPaymentReceipt(approvedRenewalReq!, renewedWebsite);
  assert(
    receipt2 !== null &&
      receipt2.receiptNumber !== receipt1.receiptNumber &&
      receipt2.transactionId === 'BKASHRENEW30DAY2' &&
      buildVerifiedPaymentReceipt(approvedReq1!, renewedWebsite)?.receiptNumber === receipt1.receiptNumber,
    'Renewal must generate a distinct new receipt while preserving prior receipts'
  );

  // Verify idempotency: repeated Approve click (both stale pending object & approved object) or Retry Publish does NOT double-extend period!
  const staleRepeatApprove = await executeApproveAndPublishWorkflow({
    mode: 'approve_and_publish',
    request: renewalPendingReq,
    callerRole: 'admin',
    callerUserId: adminUserId,
    adapters,
  });
  assert(
    staleRepeatApprove.success && staleRepeatApprove.websitePublished,
    'Repeated approve click with stale pending object must handle ALREADY_SETTLED idempotently'
  );
  const directDbDuplicateApprove = await adapters.approvePaymentRpc(renewalPendingReq.id, 'duplicate click');
  assert(
    !directDbDuplicateApprove.success,
    'Direct second DB RPC call to admin_approve_payment_request must refuse to re-approve an already settled request'
  );
  const retryPublishAttempt = await executeApproveAndPublishWorkflow({
    mode: 'retry_publish',
    request: approvedRenewalReq,
    callerRole: 'admin',
    callerUserId: adminUserId,
    adapters,
  });
  assert(retryPublishAttempt.success, 'Idempotent retry_publish on live site should succeed safely');
  const postRetryWebsite = await adapters.fetchWebsiteById(primaryWebsite.id);
  assert(
    getWebsiteSubscriptionExpiryMs(postRetryWebsite) === renewedExpiryMs,
    'Repeated approve/retry clicks MUST NOT double-extend the 30-day subscription period'
  );
  passScenario(
    13,
    'Expired website renewal extends 30 days from NOW(), republishes exact same website, issues new receipt alongside prior receipt, and prevents double-extension'
  );

  // =========================================================================
  // SCENARIO 14: Unauthenticated & non-admin users cannot approve/reject payments or publish websites
  // =========================================================================
  // Create a pending request on siblingWebsite to test unauthorized attempts against a real pending row
  await asUser(clientGoogleId, clientEmail, 'authenticated');
  const siblingPendingRow = (
    await db.query<RawPaymentRequestRow>(
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, currency,
        payment_method, transaction_id, sender_number, status
      ) VALUES ($1::uuid, $2::uuid, 'Arifur Rahman', '+8801711998877', $3,
        'website_subscription', $4, 'GoAMAAS Website (dhakacraftsecond.amaas.xyz)', 'GoAMAAS Website', 600, '৳',
        'bKash', 'BKASHSIBLING600', '01711998877', 'pending') RETURNING *;`,
      [clientGoogleId, clientStoreId, clientEmail, siblingWebsite.id]
    )
  ).rows[0];
  const siblingPendingReq = mapRowToPaymentRequest(siblingPendingRow);

  // 14a. Workflow blocks non-admin caller
  const nonAdminWorkflowAttempt = await executeApproveAndPublishWorkflow({
    mode: 'approve_and_publish',
    request: siblingPendingReq,
    callerRole: 'merchant',
    callerUserId: otherMerchantId,
    adapters,
  });
  assert(
    !nonAdminWorkflowAttempt.success && nonAdminWorkflowAttempt.code === 'FORBIDDEN',
    'Non-admin caller must be blocked with FORBIDDEN by workflow'
  );

  // 14b. Postgres RPCs block non-admin authenticated user directly
  await asUser(otherMerchantId, otherMerchantEmail, 'authenticated');
  let nonAdminApproveBlocked = false;
  try {
    const r = await db.query<{ res: { success?: boolean } }>(
      `SELECT public.admin_approve_payment_request($1::uuid, 'hack') AS res;`,
      [siblingPendingReq.id]
    );
    if (r.rows[0]?.res?.success !== true) nonAdminApproveBlocked = true;
  } catch {
    nonAdminApproveBlocked = true;
  }
  assert(nonAdminApproveBlocked, 'Non-admin DB call to admin_approve_payment_request must fail');

  let nonAdminRejectBlocked = false;
  try {
    const r = await db.query<{ res: { success?: boolean } }>(
      `SELECT public.admin_reject_payment_request($1::uuid, 'hack') AS res;`,
      [siblingPendingReq.id]
    );
    if (r.rows[0]?.res?.success !== true) nonAdminRejectBlocked = true;
  } catch {
    nonAdminRejectBlocked = true;
  }
  assert(nonAdminRejectBlocked, 'Non-admin DB call to admin_reject_payment_request must fail');

  let nonOwnerPublishBlocked = false;
  try {
    const r = await db.query<{ res: { success?: boolean } }>(
      `SELECT public.publish_client_website($1::uuid) AS res;`,
      [siblingWebsite.id]
    );
    if (r.rows[0]?.res?.success !== true) nonOwnerPublishBlocked = true;
  } catch {
    nonOwnerPublishBlocked = true;
  }
  assert(nonOwnerPublishBlocked, 'Unauthorized user DB call to publish_client_website must fail');

  // 14c. Even the website owner themselves CANNOT publish an unpaid website via publish_client_website!
  await asUser(clientGoogleId, clientEmail, 'authenticated');
  let unpaidOwnerPublishBlocked = false;
  try {
    const r = await db.query<{ res: { success?: boolean } }>(
      `SELECT public.publish_client_website($1::uuid) AS res;`,
      [siblingWebsite.id]
    );
    if (r.rows[0]?.res?.success !== true) unpaidOwnerPublishBlocked = true;
  } catch {
    unpaidOwnerPublishBlocked = true;
  }
  assert(unpaidOwnerPublishBlocked, 'Owner cannot self-publish unpaid website before admin approval');

  // 14d. Unauthenticated (anon) user cannot approve/publish
  await asUser(null, null, 'anon');
  let anonApproveBlocked = false;
  try {
    const r = await db.query<{ res: { success?: boolean } }>(
      `SELECT public.admin_approve_payment_request($1::uuid, 'anon') AS res;`,
      [siblingPendingReq.id]
    );
    if (r.rows[0]?.res?.success !== true) anonApproveBlocked = true;
  } catch {
    anonApproveBlocked = true;
  }
  assert(anonApproveBlocked, 'Anonymous user call to admin_approve_payment_request must fail');
  passScenario(
    14,
    'Unauthenticated and non-admin users are strictly blocked from approving/rejecting payments or publishing websites'
  );

  await db.close();
  console.log(`\n=== SUMMARY: ${passed}/14 Mandatory Lifecycle Scenarios Passed ===`);
}

runCompleteLifecycleSuite().catch((err) => {
  console.error('Lifecycle test suite failed:', err);
  process.exit(1);
});

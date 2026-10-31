import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import {
  ApproveAndPublishAdapters,
  executeApproveAndPublishWorkflow,
  hasDuplicateActiveTransactionReference,
  isWebsitePaymentService,
  isWebsiteTrulyLive,
  normalizeTransactionReference,
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

async function runManualPaymentAndPublishSuite() {
  console.log('=== GOAMAAS MANUAL PAYMENT VERIFICATION & INSTANT WEBSITE PUBLISHING E2E SUITE ===');
  let passed = 0;
  let total = 0;

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

  const baseSchema = fs
    .readFileSync('supabase/schema.sql', 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
  const migration20261029 = fs.readFileSync(
    'supabase/migrations/20261029_website_builder_storage_and_autopublish.sql',
    'utf8'
  );

  async function setupFixture(db: PGlite) {
    await db.exec(baseSchema);
    await db.exec(migration20261029);

    const merchantA = '11111111-1111-4111-8111-111111111111';
    const merchantB = '22222222-2222-4222-8222-222222222222';
    const adminUser = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
        ('${merchantA}', 'merchant.a@test.com', '{}'::jsonb),
        ('${merchantB}', 'merchant.b@test.com', '{}'::jsonb),
        ('${adminUser}', 'admin@amaas.xyz', '{}'::jsonb);

      INSERT INTO public.profiles (id, email, full_name, role) VALUES
        ('${merchantA}', 'merchant.a@test.com', 'Rahim Fashion', 'merchant'),
        ('${merchantB}', 'merchant.b@test.com', 'Karim Mart', 'merchant'),
        ('${adminUser}', 'admin@amaas.xyz', 'Platform Admin', 'merchant')
      ON CONFLICT (id) DO NOTHING;

      UPDATE public.profiles SET role = 'admin' WHERE id = '${adminUser}';
    `);

    await asUser(db, merchantA, 'merchant.a@test.com', 'authenticated');
    const storeA = (
      await db.query<{ id: string }>(`
        INSERT INTO public.stores (owner_id, name, slug, category, currency, phone, address)
        VALUES ('${merchantA}', 'Rahim Fashion House', 'rahim-fashion', 'Fashion & Apparel', '৳', '+8801711000111', 'Dhanmondi, Dhaka')
        RETURNING id;
      `)
    ).rows[0].id;
    await db.query(`UPDATE public.profiles SET store_id = '${storeA}' WHERE id = '${merchantA}';`);

    await asUser(db, merchantB, 'merchant.b@test.com', 'authenticated');
    const storeB = (
      await db.query<{ id: string }>(`
        INSERT INTO public.stores (owner_id, name, slug, category, currency, phone, address)
        VALUES ('${merchantB}', 'Karim Grocery Mart', 'karim-mart', 'Grocery', '৳', '+8801811000222', 'Mirpur, Dhaka')
        RETURNING id;
      `)
    ).rows[0].id;
    await db.query(`UPDATE public.profiles SET store_id = '${storeB}' WHERE id = '${merchantB}';`);

    return { merchantA, merchantB, adminUser, storeA, storeB };
  }

  async function createMerchantWebsite(
    db: PGlite,
    userId: string,
    email: string,
    storeId: string,
    subdomain: string,
    businessName: string
  ): Promise<SubscribedWebsite> {
    await asUser(db, userId, email, 'authenticated');
    const { payload, error } = buildMerchantWebsiteInsertPayload({
      userId,
      storeId,
      subdomain,
      businessName,
      niche: 'ecommerce',
      templateId: 'tpl-ecom-1',
      templateName: 'Modern Commerce',
      config: {
        ownerName: businessName,
        phone: '+8801711000111',
        email,
        nicheLabel: 'E-Commerce',
      },
    });
    if (error || !payload) {
      throw error || new Error('Failed to build merchant website insert payload');
    }

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
    return mapDatabaseRowToSubscribedWebsite(res.rows[0] as any);
  }

  function createDbAdapters(
    db: PGlite,
    adminUserId: string,
    options?: { simulatePublishFailureOnce?: { count: number } }
  ): ApproveAndPublishAdapters {
    return {
      requireUuidServiceId: true,
      approvePaymentRpc: async (requestId: string, notes?: string) => {
        await asUser(db, adminUserId, 'admin@amaas.xyz', 'authenticated');
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
        await asUser(db, adminUserId, 'admin@amaas.xyz', 'authenticated');
        const r = await db.query<RawPaymentRequestRow>(
          `SELECT * FROM public.payment_requests WHERE id = $1::uuid;`,
          [requestId]
        );
        return r.rows[0] ? mapRowToPaymentRequest(r.rows[0]) : null;
      },
      fetchWebsiteById: async (websiteId: string) => {
        await asUser(db, adminUserId, 'admin@amaas.xyz', 'authenticated');
        const r = await db.query<Record<string, unknown>>(
          `SELECT * FROM public.subscribed_websites WHERE id = $1::uuid;`,
          [websiteId]
        );
        return r.rows[0] ? mapDatabaseRowToSubscribedWebsite(r.rows[0]) : null;
      },
      publishWebsiteRpc: async (websiteId: string) => {
        if (options?.simulatePublishFailureOnce && options.simulatePublishFailureOnce.count > 0) {
          options.simulatePublishFailureOnce.count -= 1;
          return {
            success: false,
            message: 'Simulated transient network failure during publish_client_website',
            error: new Error('Simulated transient network failure during publish_client_website'),
          };
        }
        await asUser(db, adminUserId, 'admin@amaas.xyz', 'authenticated');
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

  async function test(name: string, fn: (db: PGlite) => Promise<void>) {
    total++;
    const db = new PGlite();
    await initSupabaseAndStorageEnv(db);
    try {
      await fn(db);
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}`);
      console.error(`       Error: ${err.message || err}`);
    } finally {
      await db.close();
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Client Submission Field Validation & Configured Payment Methods
  // ---------------------------------------------------------------------------
  await test('1. Client validation enforces required fields and supports bKash, Nagad (when enabled), and Bank Transfer while blocking disabled methods or tampered amounts', async (db) => {
    const { merchantA, adminUser, storeA } = await setupFixture(db);
    const siteA = await createMerchantWebsite(
      db,
      merchantA,
      'merchant.a@test.com',
      storeA,
      'rahimfashion',
      'Rahim Fashion House'
    );

    // Missing Transaction ID rejected by client validator
    const missingTrx = validateManualPaymentSubmissionInput({
      paymentMethod: 'bKash',
      transactionId: '   ',
      senderNumber: '01711223344',
      amount: 600,
      serviceId: siteA.id,
    });
    if (missingTrx.valid) throw new Error('Expected empty Transaction ID to fail validation');

    // Missing or invalid Sender Phone rejected by client validator
    const badPhone = validateManualPaymentSubmissionInput({
      paymentMethod: 'bKash',
      transactionId: 'BK99887766',
      senderNumber: '12345',
      amount: 600,
      serviceId: siteA.id,
    });
    if (badPhone.valid) throw new Error('Expected short sender phone number to fail validation');

    // Missing serviceId rejected
    const missingService = validateManualPaymentSubmissionInput({
      paymentMethod: 'bKash',
      transactionId: 'BK99887766',
      senderNumber: '01711223344',
      amount: 600,
      serviceId: '',
    });
    if (missingService.valid) throw new Error('Expected missing serviceId to fail validation');

    // Valid bKash submission normalized
    const validBkash = validateManualPaymentSubmissionInput({
      paymentMethod: 'bKash',
      transactionId: '  bk998877aa  ',
      senderNumber: '+880 1711-223344',
      amount: 600,
      serviceId: siteA.id,
    });
    if (!validBkash.valid || validBkash.normalizedReference !== 'BK998877AA') {
      throw new Error(`Expected normalized BK998877AA, got ${JSON.stringify(validBkash)}`);
    }

    // Nagad is disabled by default in seed config -> DB trigger blocks Nagad until admin enables it
    await asUser(db, merchantA, 'merchant.a@test.com', 'authenticated');
    let nagadBlockedWhenDisabled = false;
    try {
      await db.query(
        `INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, currency,
          payment_method, transaction_id, sender_number, status
        ) VALUES ($1::uuid, $2::uuid, 'Rahim', '+8801711000111', 'merchant.a@test.com',
          'website_subscription', $3, 'GoAMAAS Website', 'GoAMAAS Website', 600, '৳',
          'Nagad', 'NGD11223344', '01711000111', 'pending');`,
        [merchantA, storeA, siteA.id]
      );
    } catch {
      nagadBlockedWhenDisabled = true;
    }
    if (!nagadBlockedWhenDisabled) {
      throw new Error('Expected disabled Nagad gateway submission to be rejected');
    }

    // Tampered amount (e.g. ৳50 instead of ৳600) is blocked by DB trigger
    let tamperedBlocked = false;
    try {
      await db.query(
        `INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, currency,
          payment_method, transaction_id, sender_number, status
        ) VALUES ($1::uuid, $2::uuid, 'Rahim', '+8801711000111', 'merchant.a@test.com',
          'website_subscription', $3, 'GoAMAAS Website', 'GoAMAAS Website', 50, '৳',
          'bKash', 'BK50TAMPER', '01711000111', 'pending');`,
        [merchantA, storeA, siteA.id]
      );
    } catch {
      tamperedBlocked = true;
    }
    if (!tamperedBlocked) {
      throw new Error('Expected tampered payment amount (৳50) to be blocked');
    }

    // Admin enables Nagad & Bank Transfer via secure 8-arg RPC -> merchant can submit both
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    await db.query(`
      SELECT public.admin_update_payment_gateway_config(
        'nagad', true, '01899887766', 'GoAMAAS Merchant', '', '', '', 'Send Money to Nagad'
      );
    `);
    await db.query(`
      SELECT public.admin_update_payment_gateway_config(
        'bank_transfer', true, '1234567890123', 'GoAMAAS Ltd', 'City Bank', 'Gulshan', '225261729', 'Official Bank Transfer'
      );
    `);

    const siteA2 = await createMerchantWebsite(
      db,
      merchantA,
      'merchant.a@test.com',
      storeA,
      'rahimshoes',
      'Rahim Shoes'
    );
    const siteA3 = await createMerchantWebsite(
      db,
      merchantA,
      'merchant.a@test.com',
      storeA,
      'rahimbags',
      'Rahim Bags'
    );

    await asUser(db, merchantA, 'merchant.a@test.com', 'authenticated');
    const nagadReq = await db.query<RawPaymentRequestRow>(
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, currency,
        payment_method, transaction_id, sender_number, status
      ) VALUES ($1::uuid, $2::uuid, 'Rahim', '+8801711000111', 'merchant.a@test.com',
        'website_subscription', $3, 'GoAMAAS Website', 'GoAMAAS Website', 600, '৳',
        'Nagad', 'NGD99887766', '01711000111', 'pending') RETURNING *;`,
      [merchantA, storeA, siteA2.id]
    );
    if (nagadReq.rows[0]?.status !== 'pending') {
      throw new Error('Expected Nagad payment request to be saved as pending');
    }

    const bankValidation = validateManualPaymentSubmissionInput({
      paymentMethod: 'Bank Transfer',
      transactionId: 'city-ref-2026-01',
      senderNumber: '01711000111',
      amount: 600,
      serviceId: siteA3.id,
    });
    if (!bankValidation.valid || bankValidation.normalizedReference !== 'CITY-REF-2026-01') {
      throw new Error('Bank Transfer validation failed');
    }

    const bankReq = await db.query<RawPaymentRequestRow>(
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, currency,
        payment_method, transaction_id, sender_number, bank_name, bank_account_name, bank_reference, status
      ) VALUES ($1::uuid, $2::uuid, 'Rahim', '+8801711000111', 'merchant.a@test.com',
        'website_subscription', $3, 'GoAMAAS Website', 'GoAMAAS Website', 600, '৳',
        'Bank Transfer', $4, $5, 'City Bank', 'Rahim Fashion', $4, 'pending') RETURNING *;`,
      [merchantA, storeA, siteA3.id, bankValidation.normalizedReference, bankValidation.normalizedSender]
    );
    if (bankReq.rows[0]?.bank_reference !== 'CITY-REF-2026-01') {
      throw new Error('Expected Bank Transfer reference to persist cleanly');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Duplicate Transaction ID Prevention & Rejection Resubmission
  // ---------------------------------------------------------------------------
  await test('2. Prevents duplicate Transaction IDs across pending/approved requests (case-insensitive & cross-tenant) while allowing reuse/resubmission after rejection', async (db) => {
    const { merchantA, merchantB, adminUser, storeA, storeB } = await setupFixture(db);
    const siteA = await createMerchantWebsite(
      db,
      merchantA,
      'merchant.a@test.com',
      storeA,
      'dupchecka',
      'Dup Check A'
    );
    const siteB = await createMerchantWebsite(
      db,
      merchantB,
      'merchant.b@test.com',
      storeB,
      'dupcheckb',
      'Dup Check B'
    );

    await asUser(db, merchantA, 'merchant.a@test.com', 'authenticated');
    const firstInsert = await db.query<RawPaymentRequestRow>(
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, currency,
        payment_method, transaction_id, sender_number, status
      ) VALUES ($1::uuid, $2::uuid, 'Rahim', '+8801711000111', 'merchant.a@test.com',
        'website_subscription', $3, 'GoAMAAS Website', 'GoAMAAS Website', 600, '৳',
        'bKash', 'TRX88776655', '01711000111', 'pending') RETURNING *;`,
      [merchantA, storeA, siteA.id]
    );
    const firstMapped = mapRowToPaymentRequest(firstInsert.rows[0]);

    // Client-side helper catches lowercase/padded duplicate
    if (!hasDuplicateActiveTransactionReference([firstMapped], '  trx88776655 ')) {
      throw new Error('Expected hasDuplicateActiveTransactionReference to catch case-insensitive duplicate');
    }

    // Cross-tenant merchant B attempting to submit same TrxID in lowercase is blocked by DB unique index
    await asUser(db, merchantB, 'merchant.b@test.com', 'authenticated');
    let duplicateBlockedInDb = false;
    try {
      await db.query(
        `INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, currency,
          payment_method, transaction_id, sender_number, status
        ) VALUES ($1::uuid, $2::uuid, 'Karim', '+8801811000222', 'merchant.b@test.com',
          'website_subscription', $3, 'GoAMAAS Website', 'GoAMAAS Website', 600, '৳',
          'bKash', 'trx88776655', '01811000222', 'pending');`,
        [merchantB, storeB, siteB.id]
      );
    } catch (err: any) {
      duplicateBlockedInDb = String(err.code) === '23505' || String(err.message).includes('uq_payment_requests_active_transaction_id');
    }
    if (!duplicateBlockedInDb) {
      throw new Error('Expected PostgreSQL unique index to block cross-tenant duplicate Transaction ID');
    }

    // Admin rejects merchantA's request with clear reason -> reason stored in admin_notes -> merchant can resubmit
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const rejRes = await db.query<{ res: Record<string, unknown> }>(
      `SELECT public.admin_reject_payment_request($1::uuid, 'Sender number mismatch — please resubmit with correct TrxID') AS res;`,
      [firstMapped.id]
    );
    if (!rejRes.rows[0]?.res?.success) {
      throw new Error(`Expected admin rejection to succeed: ${JSON.stringify(rejRes.rows[0]?.res)}`);
    }

    const rejectedRow = (
      await db.query<RawPaymentRequestRow>(
        `SELECT * FROM public.payment_requests WHERE id = $1::uuid;`,
        [firstMapped.id]
      )
    ).rows[0];
    if (
      rejectedRow.status !== 'rejected' ||
      rejectedRow.admin_notes !== 'Sender number mismatch — please resubmit with correct TrxID' ||
      rejectedRow.reviewed_by !== adminUser ||
      !rejectedRow.reviewed_at
    ) {
      throw new Error(`Unexpected rejected row state: ${JSON.stringify(rejectedRow)}`);
    }

    const rejectedMapped = mapRowToPaymentRequest(rejectedRow);
    if (hasDuplicateActiveTransactionReference([rejectedMapped], 'TRX88776655')) {
      throw new Error('Rejected Transaction ID should no longer block corrected resubmission');
    }

    // Merchant A resubmits for the same website after rejection -> succeeds!
    await asUser(db, merchantA, 'merchant.a@test.com', 'authenticated');
    const resubmitted = await db.query<RawPaymentRequestRow>(
      `INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, currency,
        payment_method, transaction_id, sender_number, status
      ) VALUES ($1::uuid, $2::uuid, 'Rahim', '+8801711000111', 'merchant.a@test.com',
        'website_subscription', $3, 'GoAMAAS Website', 'GoAMAAS Website', 600, '৳',
        'bKash', 'TRX99001122', '01711000111', 'pending') RETURNING *;`,
      [merchantA, storeA, siteA.id]
    );
    if (resubmitted.rows[0]?.status !== 'pending') {
      throw new Error('Expected resubmission after rejection to succeed');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Unauthorized Approval, Client Tampering, Self-Approval & Unpaid Publish Blocked
  // ---------------------------------------------------------------------------
  await test('3. Blocks client-submitted approved status, merchant approval attempts, self-approval, and unpaid website publishing', async (db) => {
    const { merchantA, merchantB, adminUser, storeA } = await setupFixture(db);
    const siteA = await createMerchantWebsite(
      db,
      merchantA,
      'merchant.a@test.com',
      storeA,
      'securefashion',
      'Secure Fashion'
    );

    // Unpaid website is NOT live and cannot be published by merchant
    if (isWebsiteTrulyLive(siteA)) {
      throw new Error('Unpaid newly created website must NOT report isWebsiteTrulyLive === true');
    }

    await asUser(db, merchantA, 'merchant.a@test.com', 'authenticated');
    const unpaidPub = await db.query<{ res: Record<string, unknown> }>(
      `SELECT public.publish_client_website($1::uuid) AS res;`,
      [siteA.id]
    );
    if (unpaidPub.rows[0]?.res?.success !== false || unpaidPub.rows[0]?.res?.code !== 'PAYMENT_REQUIRED') {
      throw new Error(`Expected unpaid publish_client_website to fail with PAYMENT_REQUIRED, got ${JSON.stringify(unpaidPub.rows[0]?.res)}`);
    }

    // Client tries to INSERT payment_requests with status = 'approved' -> blocked
    let forgedInsertBlocked = false;
    try {
      await db.query(
        `INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, currency,
          payment_method, transaction_id, sender_number, status
        ) VALUES ($1::uuid, $2::uuid, 'Rahim', '+8801711000111', 'merchant.a@test.com',
          'website_subscription', $3, 'GoAMAAS Website', 'GoAMAAS Website', 600, '৳',
          'bKash', 'FORGED1234', '01711000111', 'approved');`,
        [merchantA, storeA, siteA.id]
      );
    } catch {
      forgedInsertBlocked = true;
    }
    if (!forgedInsertBlocked) {
      throw new Error('Client-forged status=approved on INSERT was not blocked');
    }

    // Valid pending request
    const validReqRow = (
      await db.query<RawPaymentRequestRow>(
        `INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, currency,
          payment_method, transaction_id, sender_number, status
        ) VALUES ($1::uuid, $2::uuid, 'Rahim', '+8801711000111', 'merchant.a@test.com',
          'website_subscription', $3, 'GoAMAAS Website', 'GoAMAAS Website', 600, '৳',
          'bKash', 'VALIDSEC1234', '01711000111', 'pending') RETURNING *;`,
        [merchantA, storeA, siteA.id]
      )
    ).rows[0];
    const validReq = mapRowToPaymentRequest(validReqRow);

    // Merchant attempting orchestrator is rejected before touching RPC
    const adapters = createDbAdapters(db, adminUser);
    const merchantOrchestratorAttempt = await executeApproveAndPublishWorkflow({
      mode: 'approve_and_publish',
      request: validReq,
      callerRole: 'merchant',
      callerUserId: merchantA,
      adapters,
    });
    if (merchantOrchestratorAttempt.success || merchantOrchestratorAttempt.code !== 'FORBIDDEN') {
      throw new Error('Expected non-admin caller to be rejected by executeApproveAndPublishWorkflow');
    }

    // Merchant calling DB RPC directly is rejected by PostgreSQL EXECUTE privilege / role check
    await asUser(db, merchantB, 'merchant.b@test.com', 'authenticated');
    let directMerchantRpcBlocked = false;
    try {
      const r = await db.query<{ res: Record<string, unknown> }>(
        `SELECT public.admin_approve_payment_request($1::uuid, 'hack') AS res;`,
        [validReq.id]
      );
      if (r.rows[0]?.res?.success === false) {
        directMerchantRpcBlocked = true;
      }
    } catch {
      directMerchantRpcBlocked = true;
    }
    if (!directMerchantRpcBlocked) {
      throw new Error('Expected merchant calling admin_approve_payment_request RPC directly to be blocked');
    }

    // Self-approval blocked if callerUserId === request.userId
    const selfApprovalAttempt = await executeApproveAndPublishWorkflow({
      mode: 'approve_and_publish',
      request: { ...validReq, userId: adminUser },
      callerRole: 'admin',
      callerUserId: adminUser,
      adapters,
    });
    if (selfApprovalAttempt.success || selfApprovalAttempt.code !== 'SELF_APPROVAL_FORBIDDEN') {
      throw new Error('Expected admin self-approval to be blocked');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Full Approve & Publish Happy Path + Exact Target Website Isolation
  // ---------------------------------------------------------------------------
  await test('4. Approves payment and publishes ONLY the exact associated website (leaving sibling websites of the same store untouched) and makes public subdomain live', async (db) => {
    const { merchantA, adminUser, storeA } = await setupFixture(db);

    // Merchant A creates TWO websites under the SAME storeA
    const site1 = await createMerchantWebsite(
      db,
      merchantA,
      'merchant.a@test.com',
      storeA,
      'rahimmainstore',
      'Rahim Main Store'
    );
    const site2 = await createMerchantWebsite(
      db,
      merchantA,
      'merchant.a@test.com',
      storeA,
      'rahimoutlet',
      'Rahim Outlet Draft'
    );

    // Submit ৳600 bKash payment ONLY for site1
    await asUser(db, merchantA, 'merchant.a@test.com', 'authenticated');
    const reqRow = (
      await db.query<RawPaymentRequestRow>(
        `INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, currency,
          payment_method, transaction_id, sender_number, status
        ) VALUES ($1::uuid, $2::uuid, 'Rahim Fashion', '+8801711000111', 'merchant.a@test.com',
          'website_subscription', $3, 'GoAMAAS Website — Rahim Main Store', 'GoAMAAS Website', 600, '৳',
          'bKash', $4, '01711000111', 'pending') RETURNING *;`,
        [merchantA, storeA, site1.id, normalizeTransactionReference('bkash77889900')]
      )
    ).rows[0];
    const pendingReq = mapRowToPaymentRequest(reqRow);

    if (!isWebsitePaymentService(pendingReq.serviceType)) {
      throw new Error('Expected website_subscription to be recognized as website service');
    }

    // Before approval, public subdomain lookup returns { found: false } for site1
    await asUser(db, null, null, 'anon');
    const prePublic1 = await db.query<{ res: { found?: boolean; site?: Record<string, unknown> } }>(
      `SELECT public.get_published_website_by_subdomain('rahimmainstore') AS res;`
    );
    if (prePublic1.rows[0]?.res?.found !== false) {
      throw new Error(`Unpaid website must NOT be publicly resolvable before approval: ${JSON.stringify(prePublic1.rows[0]?.res)}`);
    }

    // Verified Admin executes Approve & Publish workflow
    const adapters = createDbAdapters(db, adminUser);
    const outcome = await executeApproveAndPublishWorkflow({
      mode: 'approve_and_publish',
      request: pendingReq,
      notes: 'Verified bKash statement ৳600',
      callerRole: 'admin',
      callerUserId: adminUser,
      adapters,
    });

    if (
      !outcome.success ||
      !outcome.paymentApproved ||
      !outcome.websitePublished ||
      outcome.code !== 'APPROVED_AND_PUBLISHED' ||
      outcome.websiteId !== site1.id ||
      outcome.deploymentStatus !== 'live'
    ) {
      throw new Error(`Expected APPROVED_AND_PUBLISHED outcome, got ${JSON.stringify(outcome)}`);
    }

    // Verify DB audit fields on payment_requests
    const settledReq = await adapters.fetchPaymentRequestById(pendingReq.id);
    if (
      !settledReq ||
      settledReq.status !== 'approved' ||
      settledReq.reviewedBy !== adminUser ||
      !settledReq.reviewedAt ||
      settledReq.adminNotes !== 'Verified bKash statement ৳600'
    ) {
      throw new Error(`Unexpected settled payment request audit fields: ${JSON.stringify(settledReq)}`);
    }

    // Verify site1 is Active + Paid + Live
    const updatedSite1 = await adapters.fetchWebsiteById(site1.id);
    if (!updatedSite1 || !isWebsiteTrulyLive(updatedSite1)) {
      throw new Error(`Expected site1 to be truly live, got ${JSON.stringify(updatedSite1)}`);
    }

    // Verify sibling site2 under the SAME storeA was NOT touched or published!
    const untouchedSite2 = await adapters.fetchWebsiteById(site2.id);
    if (
      !untouchedSite2 ||
      untouchedSite2.paymentStatus !== 'pending' ||
      untouchedSite2.deploymentStatus !== 'deploying' ||
      isWebsiteTrulyLive(untouchedSite2)
    ) {
      throw new Error(`Sibling website site2 was unexpectedly modified: ${JSON.stringify(untouchedSite2)}`);
    }

    // Verify public anonymous subdomain lookup serves site1 and still hides site2
    await asUser(db, null, null, 'anon');
    const postPublic1 = await db.query<{ res: { found?: boolean; site?: Record<string, unknown> } }>(
      `SELECT public.get_published_website_by_subdomain('rahimmainstore') AS res;`
    );
    const postPublic2 = await db.query<{ res: { found?: boolean; site?: Record<string, unknown> } }>(
      `SELECT public.get_published_website_by_subdomain('rahimoutlet') AS res;`
    );
    if (postPublic1.rows[0]?.res?.found !== true || postPublic1.rows[0]?.res?.site?.subdomain !== 'rahimmainstore') {
      throw new Error('Expected rahimmainstore.amaas.xyz to resolve publicly immediately after Approve & Publish');
    }
    if (postPublic2.rows[0]?.res?.found !== false) {
      throw new Error('Expected unpaid sibling rahimoutlet.amaas.xyz to remain unexposed');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Repeated Clicks & Idempotency (No Double Approval or Extra 30-Day Extension)
  // ---------------------------------------------------------------------------
  await test('5. Repeated approval calls are idempotent: prevents double approval and never extends billing cycle twice for the same payment request', async (db) => {
    const { merchantA, adminUser, storeA } = await setupFixture(db);
    const site = await createMerchantWebsite(
      db,
      merchantA,
      'merchant.a@test.com',
      storeA,
      'idempotentshop',
      'Idempotent Shop'
    );

    await asUser(db, merchantA, 'merchant.a@test.com', 'authenticated');
    const reqRow = (
      await db.query<RawPaymentRequestRow>(
        `INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, currency,
          payment_method, transaction_id, sender_number, status
        ) VALUES ($1::uuid, $2::uuid, 'Rahim', '+8801711000111', 'merchant.a@test.com',
          'website_subscription', $3, 'GoAMAAS Website', 'GoAMAAS Website', 600, '৳',
          'bKash', 'IDEMPOTENT01', '01711000111', 'pending') RETURNING *;`,
        [merchantA, storeA, site.id]
      )
    ).rows[0];
    const pendingReq = mapRowToPaymentRequest(reqRow);

    const adapters = createDbAdapters(db, adminUser);
    const firstRun = await executeApproveAndPublishWorkflow({
      mode: 'approve_and_publish',
      request: pendingReq,
      callerRole: 'admin',
      callerUserId: adminUser,
      adapters,
    });
    if (!firstRun.success || !firstRun.websitePublished) {
      throw new Error(`First approval failed: ${JSON.stringify(firstRun)}`);
    }

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const periodAfterFirst = (
      await db.query<{ current_period_end: string }>(
        `SELECT current_period_end::text FROM public.subscribed_websites WHERE id = $1::uuid;`,
        [site.id]
      )
    ).rows[0].current_period_end;

    // Simulate stale UI passing the still-'pending' object a second time (race / repeated click)
    const secondRunWithStalePendingObj = await executeApproveAndPublishWorkflow({
      mode: 'approve_and_publish',
      request: pendingReq,
      callerRole: 'admin',
      callerUserId: adminUser,
      adapters,
    });
    if (!secondRunWithStalePendingObj.success || !secondRunWithStalePendingObj.websitePublished) {
      throw new Error(`Expected idempotent handling on stale repeat click, got ${JSON.stringify(secondRunWithStalePendingObj)}`);
    }

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const periodAfterSecond = (
      await db.query<{ current_period_end: string }>(
        `SELECT current_period_end::text FROM public.subscribed_websites WHERE id = $1::uuid;`,
        [site.id]
      )
    ).rows[0].current_period_end;

    if (periodAfterFirst !== periodAfterSecond) {
      throw new Error(
        `Billing period was extended twice on repeated approval! First=${periodAfterFirst}, Second=${periodAfterSecond}`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Approval Failure Safety (Cancelled or Missing Target Website)
  // ---------------------------------------------------------------------------
  await test('6. Fails safely if target website was cancelled or deleted before approval — payment stays unapproved and website stays offline', async (db) => {
    const { merchantA, adminUser, storeA } = await setupFixture(db);
    const site = await createMerchantWebsite(
      db,
      merchantA,
      'merchant.a@test.com',
      storeA,
      'cancelledshop',
      'Cancelled Shop'
    );

    await asUser(db, merchantA, 'merchant.a@test.com', 'authenticated');
    const reqRow = (
      await db.query<RawPaymentRequestRow>(
        `INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, currency,
          payment_method, transaction_id, sender_number, status
        ) VALUES ($1::uuid, $2::uuid, 'Rahim', '+8801711000111', 'merchant.a@test.com',
          'website_subscription', $3, 'GoAMAAS Website', 'GoAMAAS Website', 600, '৳',
          'bKash', 'CANCELSAFE01', '01711000111', 'pending') RETURNING *;`,
        [merchantA, storeA, site.id]
      )
    ).rows[0];
    const pendingReq = mapRowToPaymentRequest(reqRow);

    // Merchant cancels website before admin reviews payment
    await asUser(db, null, null, 'service_role');
    await db.query(
      `UPDATE public.subscribed_websites SET status = 'cancelled', deployment_status = 'suspended' WHERE id = $1::uuid;`,
      [site.id]
    );

    const adapters = createDbAdapters(db, adminUser);
    const outcome = await executeApproveAndPublishWorkflow({
      mode: 'approve_and_publish',
      request: pendingReq,
      callerRole: 'admin',
      callerUserId: adminUser,
      adapters,
    });

    if (outcome.success || outcome.paymentApproved || outcome.websitePublished || outcome.code !== 'WEBSITE_CANCELLED') {
      throw new Error(`Expected safe WEBSITE_CANCELLED halt, got ${JSON.stringify(outcome)}`);
    }

    // Verify DB request remained pending (atomic rollback / precheck guard)
    const freshReq = await adapters.fetchPaymentRequestById(pendingReq.id);
    if (freshReq?.status !== 'pending') {
      throw new Error(`Expected payment request to remain pending on cancelled website, got ${freshReq?.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 7: Partial Success (`website_package` or Publish Failure) & Safe Retry Publish Recovery
  // ---------------------------------------------------------------------------
  await test('7. Separates Payment Approved from Publish Failed on transient publish error and recovers cleanly via Retry Publish without re-approving', async (db) => {
    const { merchantA, adminUser, storeA } = await setupFixture(db);
    const site = await createMerchantWebsite(
      db,
      merchantA,
      'merchant.a@test.com',
      storeA,
      'recoverystore',
      'Recovery Store'
    );

    // Submit a `website_package` payment (Starter Website ৳8,000):
    // In DB migration 20261029, `admin_approve_payment_request` marks `website_package` as `paid` + `active`,
    // while `deployment_status` stays `'deploying'` until `publish_client_website` succeeds!
    await asUser(db, merchantA, 'merchant.a@test.com', 'authenticated');
    const reqRow = (
      await db.query<RawPaymentRequestRow>(
        `INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, currency,
          payment_method, transaction_id, sender_number, status
        ) VALUES ($1::uuid, $2::uuid, 'Rahim', '+8801711000111', 'merchant.a@test.com',
          'website_package', $3, 'Starter Website', 'Starter Website', 8000, '৳',
          'bKash', 'PKG8000REC01', '01711000111', 'pending') RETURNING *;`,
        [merchantA, storeA, site.id]
      )
    ).rows[0];
    const pkgReq = mapRowToPaymentRequest(reqRow);

    // Simulate 1 transient failure in `publish_client_website` after DB approves payment
    const failureCounter = { count: 1 };
    const adapters = createDbAdapters(db, adminUser, { simulatePublishFailureOnce: failureCounter });

    const partialOutcome = await executeApproveAndPublishWorkflow({
      mode: 'approve_and_publish',
      request: pkgReq,
      notes: 'Starter package verified',
      callerRole: 'admin',
      callerUserId: adminUser,
      adapters,
    });

    if (
      partialOutcome.success !== false ||
      partialOutcome.paymentApproved !== true ||
      partialOutcome.websitePublished !== false ||
      partialOutcome.partialFailure !== true ||
      partialOutcome.code !== 'PUBLISH_FAILED'
    ) {
      throw new Error(`Expected partialFailure PUBLISH_FAILED result, got ${JSON.stringify(partialOutcome)}`);
    }

    // Verify website is NOT falsely reported as Live during partial failure!
    const midSite = await adapters.fetchWebsiteById(site.id);
    if (!midSite || midSite.paymentStatus !== 'paid' || midSite.deploymentStatus === 'live' || isWebsiteTrulyLive(midSite)) {
      throw new Error(`Expected paid + non-live website state after publish failure, got ${JSON.stringify(midSite)}`);
    }

    // Now run idempotent Retry Publish (`mode: 'retry_publish'`) -> succeeds and publishes exact website!
    const approvedReq = await adapters.fetchPaymentRequestById(pkgReq.id);
    const retryOutcome = await executeApproveAndPublishWorkflow({
      mode: 'retry_publish',
      request: approvedReq,
      callerRole: 'admin',
      callerUserId: adminUser,
      adapters,
    });

    if (
      !retryOutcome.success ||
      !retryOutcome.paymentApproved ||
      !retryOutcome.websitePublished ||
      retryOutcome.deploymentStatus !== 'live' ||
      retryOutcome.code !== 'APPROVED_AND_PUBLISHED'
    ) {
      throw new Error(`Expected Retry Publish recovery to succeed, got ${JSON.stringify(retryOutcome)}`);
    }

    const finalSite = await adapters.fetchWebsiteById(site.id);
    if (!finalSite || !isWebsiteTrulyLive(finalSite)) {
      throw new Error('Expected website to be verified Live after Retry Publish');
    }

    await asUser(db, null, null, 'anon');
    const publicLookup = await db.query<{ res: { found?: boolean; site?: Record<string, unknown> } }>(
      `SELECT public.get_published_website_by_subdomain('recoverystore') AS res;`
    );
    if (publicLookup.rows[0]?.res?.found !== true || publicLookup.rows[0]?.res?.site?.subdomain !== 'recoverystore') {
      throw new Error('Expected recoverystore.amaas.xyz to resolve publicly after Retry Publish');
    }
  });

  console.log(`\n=== SUMMARY: ${passed}/${total} Manual Payment & Instant Website Publishing E2E Tests Passed ===`);
  if (passed !== total) {
    process.exit(1);
  }
}

runManualPaymentAndPublishSuite().catch((err) => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});

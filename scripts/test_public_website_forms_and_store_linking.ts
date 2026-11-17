import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import resolveTenantHandler from '../api/resolve-tenant';
import publicOrderHandler from '../api/public-order';
import publicInquiryHandler from '../api/public-inquiry';
import {
  validatePublicCustomerInquiryInput,
  validatePublicCustomerOrderInput,
} from '../src/lib/storefrontSync';

function makeFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

async function invokeHandler(
  handler: (req: any, res: any) => Promise<void> | void,
  opts: { method: string; url: string; body?: unknown; headers?: Record<string, string> }
): Promise<{ statusCode: number; headers: Record<string, string>; body: any }> {
  const responseHeaders: Record<string, string> = {};
  let rawBody = '';
  const req: any = {
    method: opts.method,
    url: opts.url,
    headers: { host: 'localhost:3000', ...(opts.headers || {}) },
    body: opts.body,
    on: () => {},
  };
  const res: any = {
    statusCode: 200,
    setHeader: (k: string, v: string) => {
      responseHeaders[k.toLowerCase()] = String(v);
    },
    end: (chunk?: string) => {
      if (chunk) rawBody += String(chunk);
    },
  };
  await handler(req, res);
  let parsed: any = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsed = rawBody;
  }
  return { statusCode: res.statusCode, headers: responseHeaders, body: parsed };
}

async function initSupabasePglite(db: PGlite) {
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

    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated, anon, service_role;
  `);

  const baseSchema = fs
    .readFileSync(path.resolve(process.cwd(), 'supabase/schema.sql'), 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
  const migration20261029 = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261029_website_builder_storage_and_autopublish.sql'),
    'utf8'
  );
  await db.exec(baseSchema);
  await db.exec(migration20261029);
}

function createPgliteRestFetchBridge(db: PGlite, options: { failNextInquiryInsert?: boolean }) {
  return async (inputUrl: string | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = String(inputUrl);
    const parsed = new URL(urlStr);
    const pathname = parsed.pathname;
    const method = (init?.method || 'GET').toUpperCase();
    const bodyObj = init?.body ? JSON.parse(String(init.body)) : null;

    if (pathname === '/rest/v1/rpc/get_published_website_by_subdomain') {
      const sub = String(bodyObj?.p_subdomain || '');
      const res = await db.query<{ result: any }>(
        `SELECT public.get_published_website_by_subdomain($1) AS result`,
        [sub]
      );
      return new Response(JSON.stringify(res.rows[0]?.result || { found: false }), { status: 200 });
    }

    const tableMatch = pathname.match(/^\/rest\/v1\/([a-z0-9_]+)$/i);
    if (!tableMatch) {
      return new Response(JSON.stringify({ error: `Unhandled route ${pathname}` }), { status: 404 });
    }
    const table = tableMatch[1];

    // Build WHERE clauses from PostgREST params
    const clauses: string[] = [];
    const params: any[] = [];
    let limitClause = '';
    let orderClause = '';

    for (const [key, val] of parsed.searchParams.entries()) {
      if (key === 'select') continue;
      if (key === 'limit') {
        limitClause = `LIMIT ${Math.max(1, Math.min(100, Number(val) || 10))}`;
        continue;
      }
      if (key === 'order') {
        const [col, dir] = val.split('.');
        orderClause = `ORDER BY ${col} ${dir?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`;
        continue;
      }
      if (key === 'or') {
        const inner = val.replace(/^\(|\)$/g, '');
        const orParts = inner.split(',').map((expr) => {
          const dotIdx = expr.indexOf('.');
          const col = expr.slice(0, dotIdx);
          const rest = expr.slice(dotIdx + 1);
          const eqIdx = rest.indexOf('.');
          const value = rest.slice(eqIdx + 1);
          params.push(decodeURIComponent(value));
          return `${col} = $${params.length}`;
        });
        clauses.push(`(${orParts.join(' OR ')})`);
        continue;
      }
      if (val.startsWith('eq.')) {
        params.push(val.slice(3));
        clauses.push(`${key} = $${params.length}`);
      } else if (val.startsWith('ilike.')) {
        params.push(val.slice(6));
        clauses.push(`LOWER(${key}) = LOWER($${params.length})`);
      } else if (val.startsWith('gte.')) {
        params.push(Number(val.slice(4)));
        clauses.push(`${key} >= $${params.length}`);
      } else if (val.startsWith('in.')) {
        const list = val.slice(3).replace(/^\(|\)$/g, '').split(',').filter(Boolean);
        const placeholders = list.map((item) => {
          params.push(item);
          return `$${params.length}`;
        });
        clauses.push(`${key} IN (${placeholders.join(', ')})`);
      }
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    if (method === 'GET') {
      const q = `SELECT * FROM public.${table} ${whereSql} ${orderClause} ${limitClause}`;
      const res = await db.query(q, params);
      return new Response(JSON.stringify(res.rows), { status: 200 });
    }

    if (method === 'POST') {
      if (table === 'support_tickets' && options.failNextInquiryInsert) {
        options.failNextInquiryInsert = false;
        return new Response(JSON.stringify({ message: 'Simulated DB insert failure' }), { status: 500 });
      }
      const rowsInput = Array.isArray(bodyObj) ? bodyObj : [bodyObj];
      const inserted: any[] = [];
      for (const item of rowsInput) {
        const cols = Object.keys(item);
        const vals = cols.map((c) => {
          const v = item[c];
          if (v !== null && typeof v === 'object') return JSON.stringify(v);
          return v;
        });
        const ph = cols.map((_, idx) => `$${idx + 1}`);
        const q = `INSERT INTO public.${table} (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`;
        const res = await db.query(q, vals);
        inserted.push(...res.rows);
      }
      return new Response(JSON.stringify(inserted), { status: 201 });
    }

    if (method === 'PATCH') {
      const cols = Object.keys(bodyObj);
      const setParts = cols.map((c) => {
        const v = bodyObj[c];
        params.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
        return `${c} = $${params.length}`;
      });
      const q = `UPDATE public.${table} SET ${setParts.join(', ')} ${whereSql} RETURNING *`;
      const res = await db.query(q, params);
      return new Response(JSON.stringify(res.rows), { status: 200 });
    }

    return new Response(JSON.stringify({ error: `Unsupported method ${method}` }), { status: 405 });
  };
}

async function runTests() {
  console.log('Running GoAMAAS Public Website Forms & Store Linking Regression Suite...');
  const db = new PGlite();
  await initSupabasePglite(db);

  const MERCH_A_ID = '11111111-1111-4111-8111-111111111111';
  const MERCH_B_ID = '22222222-2222-4222-8222-222222222222';
  const MERCH_MULTI_ID = '33333333-3333-4333-8333-333333333333';
  const STORE_A_ID = 'aaaa1111-1111-4111-8111-111111111111';
  const STORE_B_ID = 'bbbb2222-2222-4222-8222-222222222222';
  const STORE_M1_ID = 'cccc3333-3333-4333-8333-333333333331';
  const STORE_M2_ID = 'cccc3333-3333-4333-8333-333333333332';

  const PROD_A_ID = 'dddd1111-1111-4111-8111-111111111111';
  const PROD_UNLINKED_ID = 'dddd2222-2222-4222-8222-222222222222';
  const PROD_MULTI_ID = 'dddd3333-3333-4333-8333-333333333333';
  const PROD_FOREIGN_ID = 'dddd4444-4444-4444-8444-444444444444';

  const SITE_LINKED_ID = 'eeee1111-1111-4111-8111-111111111111';
  const SITE_UNLINKED_SINGLE_ID = 'eeee2222-2222-4222-8222-222222222222';
  const SITE_MULTI_ID = 'eeee3333-3333-4333-8333-333333333333';
  const SITE_INACTIVE_ID = 'eeee4444-4444-4444-8444-444444444444';
  const SITE_CROSS_TENANT_ID = 'eeee5555-5555-4555-8555-555555555555';

  const futureIso = new Date(Date.now() + 86400000 * 25).toISOString();
  const pastIso = new Date(Date.now() - 86400000 * 5).toISOString();

  await db.query(`UPDATE public._test_session SET current_user_id = NULL, current_email = NULL, session_role = 'service_role';`);

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${MERCH_A_ID}', 'mercha@example.com'),
      ('${MERCH_B_ID}', 'merchb@example.com'),
      ('${MERCH_MULTI_ID}', 'multi@example.com');

    INSERT INTO public.profiles (id, email, full_name, role) VALUES
      ('${MERCH_A_ID}', 'mercha@example.com', 'Merchant A', 'merchant'),
      ('${MERCH_B_ID}', 'merchb@example.com', 'Merchant B', 'merchant'),
      ('${MERCH_MULTI_ID}', 'multi@example.com', 'Merchant Multi', 'merchant')
    ON CONFLICT (id) DO NOTHING;
  `);

  await db.query(`
    INSERT INTO public.stores (id, owner_id, name, slug, category, currency) VALUES
      ('${STORE_A_ID}', '${MERCH_A_ID}', 'Aroma Shop', 'aroma-shop', 'Fashion', '৳'),
      ('${STORE_B_ID}', '${MERCH_B_ID}', 'Bazar Two', 'bazar-two', 'Electronics', '৳'),
      ('${STORE_M1_ID}', '${MERCH_MULTI_ID}', 'Multi One', 'multi-one', 'Fashion', '৳'),
      ('${STORE_M2_ID}', '${MERCH_MULTI_ID}', 'Multi Two', 'multi-two', 'Beauty', '৳');
  `);

  // Insert live sites + one inactive + one cross-tenant store_id edge case before products
  await db.query(`
    INSERT INTO public.subscribed_websites (id, user_id, store_id, business_name, niche, subdomain, full_domain, status, payment_status, deployment_status, current_period_end, config) VALUES
      ('${SITE_LINKED_ID}', '${MERCH_A_ID}', '${STORE_A_ID}', 'Aroma Shop', 'fashion', 'aromashop', 'aromashop.amaas.xyz', 'active', 'paid', 'live', '${futureIso}', $1::jsonb),
      ('${SITE_UNLINKED_SINGLE_ID}', '${MERCH_B_ID}', NULL, 'Bazar Two', 'ecommerce', 'bazartwo', 'bazartwo.amaas.xyz', 'active', 'paid', 'live', '${futureIso}', $2::jsonb),
      ('${SITE_MULTI_ID}', '${MERCH_MULTI_ID}', NULL, 'Multi Storefront', 'salon', 'multishop', 'multishop.amaas.xyz', 'active', 'paid', 'live', '${futureIso}', $3::jsonb),
      ('${SITE_INACTIVE_ID}', '${MERCH_A_ID}', '${STORE_A_ID}', 'Expired Shop', 'fashion', 'expiredshop', 'expiredshop.amaas.xyz', 'suspended', 'paid', 'suspended', '${pastIso}', $1::jsonb),
      ('${SITE_CROSS_TENANT_ID}', '${MERCH_B_ID}', '${STORE_A_ID}', 'Hijacked Link Shop', 'ecommerce', 'crosslink', 'crosslink.amaas.xyz', 'active', 'paid', 'live', '${futureIso}', $4::jsonb);
  `, [
    JSON.stringify({
      servicesOrProducts: [{ id: PROD_A_ID, productId: PROD_A_ID, name: 'Silk Panjabi', priceNumeric: 2400, isVisible: true }],
    }),
    JSON.stringify({
      servicesOrProducts: [{ id: PROD_UNLINKED_ID, productId: PROD_UNLINKED_ID, name: 'Smart Watch', priceNumeric: 3500, isVisible: true }],
    }),
    JSON.stringify({
      servicesOrProducts: [{ id: PROD_MULTI_ID, productId: PROD_MULTI_ID, name: 'Lip Balm', priceNumeric: 450, isVisible: true }],
    }),
    JSON.stringify({
      servicesOrProducts: [{ id: PROD_FOREIGN_ID, productId: PROD_FOREIGN_ID, name: 'Foreign Product', priceNumeric: 999, isVisible: true }],
    }),
  ]);

  await db.query(`
    INSERT INTO public.products (id, store_id, website_id, name, sku, category, price, cost_price, stock, sales_count, status, is_visible) VALUES
      ('${PROD_A_ID}', '${STORE_A_ID}', '${SITE_LINKED_ID}', 'Silk Panjabi', 'SP-01', 'Fashion', 2400, 1200, 10, 0, 'active', true),
      ('${PROD_UNLINKED_ID}', '${STORE_B_ID}', '${SITE_UNLINKED_SINGLE_ID}', 'Smart Watch', 'SW-01', 'Electronics', 3500, 2000, 5, 0, 'active', true),
      ('${PROD_MULTI_ID}', '${STORE_M1_ID}', '${SITE_MULTI_ID}', 'Lip Balm', 'LB-01', 'Beauty', 450, 150, 8, 0, 'active', true),
      ('${PROD_FOREIGN_ID}', '${STORE_A_ID}', NULL, 'Foreign Product', 'FP-99', 'Fashion', 999, 500, 10, 0, 'active', true);
  `);

  const prevEnv = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const prevFetch = globalThis.fetch;
  const bridgeOptions = { failNextInquiryInsert: false };

  process.env.VITE_SUPABASE_URL = 'https://rqmgnewipgqgmvzpbrfn.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = makeFakeJwt({ role: 'anon', ref: 'rqmgnewipgqgmvzpbrfn' });
  process.env.SUPABASE_SERVICE_ROLE_KEY = makeFakeJwt({ role: 'service_role', ref: 'rqmgnewipgqgmvzpbrfn' });
  globalThis.fetch = createPgliteRestFetchBridge(db, bridgeOptions) as any;

  try {
    // 1. Published website with valid store_id resolves & saves public order
    const resolveLinked = await invokeHandler(resolveTenantHandler, {
      method: 'GET',
      url: '/api/resolve-tenant?subdomain=aromashop',
    });
    assert.equal(resolveLinked.statusCode, 200);
    assert.equal(resolveLinked.body.found, true);
    assert.equal(resolveLinked.body.site.storeId, STORE_A_ID);
    assert.equal(resolveLinked.body.site.id, SITE_LINKED_ID);

    const order1Res = await invokeHandler(publicOrderHandler, {
      method: 'POST',
      url: '/api/public-order',
      body: {
        subdomain: 'aromashop',
        checkoutAttemptId: 'chk-test-001',
        customerName: 'Rafiq Islam',
        customerPhone: '01711223344',
        shippingAddress: 'House 12, Road 4, Banani',
        city: 'Dhaka',
        deliveryMethod: 'Inside Dhaka',
        paymentMethod: 'Cash on Delivery (COD)',
        items: [{ productId: PROD_A_ID, quantity: 2 }],
      },
    });
    assert.equal(order1Res.statusCode, 201);
    assert.equal(order1Res.body.ok, true);
    assert.equal(order1Res.body.order.total, 4860);
    const dbOrdersA = await db.query(`SELECT * FROM public.orders WHERE store_id = $1`, [STORE_A_ID]);
    assert.equal(dbOrdersA.rows.length, 1);
    console.log('✓ Test 1 passed: Linked website resolves storeId and persists order to store A.');

    // 2. Published website with NULL store_id & 1 owned store auto-resolves safely & saves public order
    const resolveUnlinked = await invokeHandler(resolveTenantHandler, {
      method: 'GET',
      url: '/api/resolve-tenant?subdomain=bazartwo',
    });
    assert.equal(resolveUnlinked.statusCode, 200);
    assert.equal(resolveUnlinked.body.site.storeId, STORE_B_ID);

    const order2Res = await invokeHandler(publicOrderHandler, {
      method: 'POST',
      url: '/api/public-order',
      body: {
        subdomain: 'bazartwo',
        checkoutAttemptId: 'chk-test-002',
        customerName: 'Nadia Karim',
        customerPhone: '01811223344',
        shippingAddress: 'Road 9, Agrabad',
        city: 'Chattogram',
        deliveryMethod: 'Outside Dhaka',
        paymentMethod: 'bKash',
        items: [{ productId: PROD_UNLINKED_ID, quantity: 1 }],
      },
    });
    assert.equal(order2Res.statusCode, 201);
    assert.equal(order2Res.body.order.total, 3620);
    const dbOrdersB = await db.query(`SELECT * FROM public.orders WHERE store_id = $1`, [STORE_B_ID]);
    assert.equal(dbOrdersB.rows.length, 1);
    console.log('✓ Test 2 passed: Website with NULL store_id and single owned store resolves safely.');

    // 3. Published website with NULL store_id & multiple owned stores rejects cleanly (never routes to arbitrary first store)
    const resolveMulti = await invokeHandler(resolveTenantHandler, {
      method: 'GET',
      url: '/api/resolve-tenant?subdomain=multishop',
    });
    assert.equal(resolveMulti.statusCode, 200);
    assert.equal(resolveMulti.body.site.storeId, undefined);

    const orderMultiRes = await invokeHandler(publicOrderHandler, {
      method: 'POST',
      url: '/api/public-order',
      body: {
        subdomain: 'multishop',
        checkoutAttemptId: 'chk-test-multi',
        customerName: 'Mina Begum',
        customerPhone: '01911223344',
        shippingAddress: 'House 5, Sylhet',
        city: 'Sylhet',
        deliveryMethod: 'Outside Dhaka',
        paymentMethod: 'Cash on Delivery (COD)',
        items: [{ productId: PROD_MULTI_ID, quantity: 1 }],
      },
    });
    assert.equal(orderMultiRes.statusCode, 422);
    assert.equal(orderMultiRes.body.code, 'STORE_LINK_AMBIGUOUS');
    const multiOrdersCount = await db.query<any>(
      `SELECT count(*)::int AS cnt FROM public.orders WHERE store_id IN ($1, $2)`,
      [STORE_M1_ID, STORE_M2_ID]
    );
    assert.equal(multiOrdersCount.rows[0].cnt, 0);
    console.log('✓ Test 3 passed: Multi-store merchant with NULL website store_id rejects cleanly as STORE_LINK_AMBIGUOUS.');

    // 4. Stock update, inventory movement audit log, customer BD phone deduplication & idempotency
    const prodARow = await db.query<any>(`SELECT stock, sales_count FROM public.products WHERE id = $1`, [PROD_A_ID]);
    assert.equal(prodARow.rows[0].stock, 8);
    assert.equal(prodARow.rows[0].sales_count, 2);

    const movesA = await db.query<any>(`SELECT * FROM public.inventory_movements WHERE store_id = $1`, [STORE_A_ID]);
    assert.equal(movesA.rows.length, 1);
    assert.equal(movesA.rows[0].quantity_change, -2);
    assert.equal(movesA.rows[0].new_stock, 8);

    // Retry exact same checkoutAttemptId -> idempotent 200 without double-decrementing stock
    const retryOrder1 = await invokeHandler(publicOrderHandler, {
      method: 'POST',
      url: '/api/public-order',
      body: {
        subdomain: 'aromashop',
        checkoutAttemptId: 'chk-test-001',
        customerName: 'Rafiq Islam',
        customerPhone: '01711223344',
        shippingAddress: 'House 12, Road 4, Banani',
        city: 'Dhaka',
        deliveryMethod: 'Inside Dhaka',
        paymentMethod: 'Cash on Delivery (COD)',
        items: [{ productId: PROD_A_ID, quantity: 2 }],
      },
    });
    assert.equal(retryOrder1.statusCode, 200);
    assert.equal(retryOrder1.body.duplicatePrevented, true);
    const prodARowAfterRetry = await db.query<any>(`SELECT stock FROM public.products WHERE id = $1`, [PROD_A_ID]);
    assert.equal(prodARowAfterRetry.rows[0].stock, 8);

    // Same customer places second order using +880 format -> deduplicates into single customer record
    const secondOrderA = await invokeHandler(publicOrderHandler, {
      method: 'POST',
      url: '/api/public-order',
      body: {
        subdomain: 'aromashop',
        checkoutAttemptId: 'chk-test-001b',
        customerName: 'Rafiq Islam',
        customerPhone: '+8801711223344',
        shippingAddress: 'House 12, Road 4, Banani',
        city: 'Dhaka',
        deliveryMethod: 'Store Pickup',
        paymentMethod: 'Cash on Delivery (COD)',
        items: [{ productId: PROD_A_ID, quantity: 1 }],
      },
    });
    assert.equal(secondOrderA.statusCode, 201);
    const custRowsA = await db.query<any>(`SELECT * FROM public.customers WHERE store_id = $1`, [STORE_A_ID]);
    assert.equal(custRowsA.rows.length, 1);
    assert.equal(custRowsA.rows[0].orders_count, 2);
    console.log('✓ Test 4 passed: Stock decremented, movement logged, BD phone deduplicated, and order idempotent.');

    // 5. Public contact/inquiry form persists to merchant support_tickets + 0-order lead & fails cleanly if DB insert errors
    const validInquiryCheck = validatePublicCustomerInquiryInput({
      subdomain: 'aromashop',
      inquiryAttemptId: 'inq-validate-01',
      customerName: 'Sadia Chowdhury',
      customerPhone: '01611998877',
      message: 'Do you have size XL available?',
    });
    assert.equal(validInquiryCheck.valid, true);

    const inquiryRes = await invokeHandler(publicInquiryHandler, {
      method: 'POST',
      url: '/api/public-inquiry',
      body: {
        subdomain: 'aromashop',
        inquiryAttemptId: 'inq-attempt-001',
        customerName: 'Sadia Chowdhury',
        customerPhone: '01611998877',
        customerEmail: 'sadia@example.com',
        productName: 'Silk Panjabi',
        productId: PROD_A_ID,
        message: 'Is XL size available for urgent delivery?',
      },
    });
    assert.equal(inquiryRes.statusCode, 201);
    assert.equal(inquiryRes.body.ok, true);
    assert.match(inquiryRes.body.inquiry.ticketNumber, /^INQ-/);

    const ticketRows = await db.query<any>(`SELECT * FROM public.support_tickets WHERE user_id = $1`, [MERCH_A_ID]);
    assert.equal(ticketRows.rows.length, 1);
    assert.equal(ticketRows.rows[0].messages[0].inquiryMeta.storeId, STORE_A_ID);

    const leadRows = await db.query<any>(
      `SELECT * FROM public.customers WHERE store_id = $1 AND phone = '01611998877'`,
      [STORE_A_ID]
    );
    assert.equal(leadRows.rows.length, 1);
    assert.equal(leadRows.rows[0].orders_count, 0);

    // Simulated DB insert failure -> returns 502 error, zero fake success
    bridgeOptions.failNextInquiryInsert = true;
    const failedInquiryRes = await invokeHandler(publicInquiryHandler, {
      method: 'POST',
      url: '/api/public-inquiry',
      body: {
        subdomain: 'aromashop',
        inquiryAttemptId: 'inq-attempt-fail',
        customerName: 'Fail Case',
        customerPhone: '01799887766',
        message: 'Testing failure handling',
      },
    });
    assert.equal(failedInquiryRes.statusCode, 502);
    assert.equal(failedInquiryRes.body.ok, false);
    assert.equal(failedInquiryRes.body.code, 'INQUIRY_INSERT_FAILED');
    console.log('✓ Test 5 passed: Public contact inquiry persists to support_tickets + CRM lead and handles DB errors honestly.');

    // 6. Inactive / suspended / expired website rejects both order & inquiry
    const inactiveOrderRes = await invokeHandler(publicOrderHandler, {
      method: 'POST',
      url: '/api/public-order',
      body: {
        subdomain: 'expiredshop',
        checkoutAttemptId: 'chk-expired-01',
        customerName: 'Guest User',
        customerPhone: '01755667788',
        shippingAddress: 'House 10, Gulshan',
        city: 'Dhaka',
        deliveryMethod: 'Inside Dhaka',
        paymentMethod: 'Cash on Delivery (COD)',
        items: [{ productId: PROD_A_ID, quantity: 1 }],
      },
    });
    assert.ok([403, 404].includes(inactiveOrderRes.statusCode));

    const inactiveInquiryRes = await invokeHandler(publicInquiryHandler, {
      method: 'POST',
      url: '/api/public-inquiry',
      body: {
        subdomain: 'expiredshop',
        inquiryAttemptId: 'inq-expired-01',
        customerName: 'Guest User',
        customerPhone: '01755667788',
        message: 'Are you open?',
      },
    });
    assert.ok([403, 404].includes(inactiveInquiryRes.statusCode));
    console.log('✓ Test 6 passed: Suspended/expired storefront rejects orders & inquiries.');

    // 7. Cross-tenant / tampered storeId / websiteId rejected cleanly
    const tamperedWebsiteIdRes = await invokeHandler(publicOrderHandler, {
      method: 'POST',
      url: '/api/public-order',
      body: {
        subdomain: 'aromashop',
        websiteId: SITE_UNLINKED_SINGLE_ID, // Mismatched websiteId
        storeId: STORE_B_ID, // Client attempting to override storeId
        checkoutAttemptId: 'chk-tampered-01',
        customerName: 'Mallory',
        customerPhone: '01700001111',
        shippingAddress: 'Road 1, Dhaka',
        city: 'Dhaka',
        deliveryMethod: 'Inside Dhaka',
        paymentMethod: 'Cash on Delivery (COD)',
        items: [{ productId: PROD_A_ID, quantity: 1 }],
      },
    });
    assert.equal(tamperedWebsiteIdRes.statusCode, 403);
    assert.equal(tamperedWebsiteIdRes.body.code, 'TENANT_MISMATCH');

    const crossTenantLinkOrder = await invokeHandler(publicOrderHandler, {
      method: 'POST',
      url: '/api/public-order',
      body: {
        subdomain: 'crosslink', // Owned by MERCH_B_ID but store_id points to MERCH_A_ID's STORE_A_ID
        checkoutAttemptId: 'chk-cross-01',
        customerName: 'Visitor',
        customerPhone: '01722334455',
        shippingAddress: 'House 2, Mirpur',
        city: 'Dhaka',
        deliveryMethod: 'Inside Dhaka',
        paymentMethod: 'Cash on Delivery (COD)',
        items: [{ productId: PROD_FOREIGN_ID, quantity: 1 }],
      },
    });
    assert.equal(crossTenantLinkOrder.statusCode, 403);
    assert.equal(crossTenantLinkOrder.body.code, 'STORE_OWNERSHIP_MISMATCH');

    const crossTenantLinkInquiry = await invokeHandler(publicInquiryHandler, {
      method: 'POST',
      url: '/api/public-inquiry',
      body: {
        subdomain: 'crosslink',
        inquiryAttemptId: 'inq-cross-01',
        customerName: 'Visitor',
        customerPhone: '01722334455',
        message: 'Trying to write to foreign store',
      },
    });
    assert.equal(crossTenantLinkInquiry.statusCode, 403);
    assert.equal(crossTenantLinkInquiry.body.code, 'STORE_OWNERSHIP_MISMATCH');
    console.log('✓ Test 7 passed: Cross-tenant store links and tampered websiteId/storeId rejected.');

    // 8. Anonymous customer submits inquiry via email-only with zero auth header
    const anonInquiryRes = await invokeHandler(publicInquiryHandler, {
      method: 'POST',
      url: '/api/public-inquiry',
      headers: {}, // explicitly no Authorization
      body: {
        subdomain: 'bazartwo',
        inquiryAttemptId: 'inq-anon-email-01',
        customerName: 'Anonymous Visitor',
        customerEmail: 'anon@example.com',
        subject: 'Wholesale quote',
        message: 'Looking for 50 units pricing.',
      },
    });
    assert.equal(anonInquiryRes.statusCode, 201);
    const ticketsB = await db.query(`SELECT * FROM public.support_tickets WHERE user_id = $1`, [MERCH_B_ID]);
    assert.equal(ticketsB.rows.length, 1);
    console.log('✓ Test 8 passed: Anonymous unauthenticated visitors can submit inquiries and orders.');

    // 9. Case-insensitive / padded subdomain lookup works reliably across all 3 endpoints
    const resolveUpper = await invokeHandler(resolveTenantHandler, {
      method: 'GET',
      url: '/api/resolve-tenant?subdomain=%20AromaShop%20',
    });
    assert.equal(resolveUpper.statusCode, 200);
    assert.equal(resolveUpper.body.subdomain, 'aromashop');

    const inquiryUpper = await invokeHandler(publicInquiryHandler, {
      method: 'POST',
      url: '/api/public-inquiry',
      body: {
        subdomain: '  BazarTwo  ',
        inquiryAttemptId: 'inq-case-01',
        customerName: 'Tariq',
        customerPhone: '01733445566',
        message: 'Checking padded subdomain',
      },
    });
    assert.equal(inquiryUpper.statusCode, 201);
    console.log('✓ Test 9 passed: Case-insensitive and whitespace-trimmed subdomain routing works cleanly.');

    // 10. Client validation & frontend security invariant checks
    const badOrder = validatePublicCustomerOrderInput({
      subdomain: 'aromashop',
      checkoutAttemptId: 'chk-bad',
      customerName: 'A',
      customerPhone: '123',
      shippingAddress: 'Road',
      city: 'Dhaka',
      deliveryMethod: 'Inside Dhaka',
      paymentMethod: 'Cash on Delivery (COD)',
      items: [{ productId: PROD_A_ID, quantity: 1 }],
    });
    assert.equal(badOrder.valid, false);

    // Ensure no SUPABASE_SERVICE_ROLE_KEY or 'store-tenant' appears anywhere under src/
    const walkSrc = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files.push(...walkSrc(full));
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(full);
      }
      return files;
    };
    const srcFiles = walkSrc(path.resolve(process.cwd(), 'src'));
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      assert.equal(
        content.includes('SUPABASE_SERVICE_ROLE_KEY'),
        false,
        `Security violation: SUPABASE_SERVICE_ROLE_KEY referenced in client file ${file}`
      );
      assert.equal(
        content.includes("'store-tenant'"),
        false,
        `Stale placeholder 'store-tenant' found in ${file}`
      );
    }
    console.log('✓ Test 10 passed: Frontend security invariants verified (zero service role exposure, zero stale store-tenant fallback).');

    console.log('\nALL 10 PUBLIC WEBSITE FORMS & STORE LINKING REGRESSION TESTS PASSED.');
  } finally {
    globalThis.fetch = prevFetch;
    process.env.VITE_SUPABASE_URL = prevEnv.VITE_SUPABASE_URL;
    process.env.VITE_SUPABASE_ANON_KEY = prevEnv.VITE_SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = prevEnv.SUPABASE_SERVICE_ROLE_KEY;
    await db.close();
  }
}

runTests().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});

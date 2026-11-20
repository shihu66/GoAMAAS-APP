import { PGlite } from '@electric-sql/pglite';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type { ServerResponse } from 'http';
import resolveTenantHandler from '../api/resolve-tenant';
import verifyPricingHandler from '../api/verify-pricing';
import customerPortalHandler from '../api/customer-portal';
import publicOrderHandler from '../api/public-order';
import publicInquiryHandler from '../api/public-inquiry';
import {
  sanitizeHrefUrl,
  sanitizeImageUrl,
  sanitizePhoneHref,
  sanitizeEmailHref,
  validateImageFileBinaryAndExtension,
} from '../src/lib/security';
import { isSafeInternalRedirectPath } from '../src/lib/supabase';

interface AuditCheckResult {
  name: string;
  section: string;
  status: 'PASS' | 'FAIL' | 'FINDING';
  detail: string;
}

const results: AuditCheckResult[] = [];

function recordPass(section: string, name: string, detail = '') {
  results.push({ section, name, status: 'PASS', detail });
  console.log(`[PASS] [${section}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function recordFail(section: string, name: string, detail: string) {
  results.push({ section, name, status: 'FAIL', detail });
  console.error(`[FAIL] [${section}] ${name} — ${detail}`);
}

function recordFinding(section: string, name: string, detail: string) {
  results.push({ section, name, status: 'FINDING', detail });
  console.warn(`[FINDING] [${section}] ${name} — ${detail}`);
}

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message);
}

// ============================================================================
// Mock HTTP Req/Res & Mocked Supabase/GoTrue REST Fetch Layer
// ============================================================================
function createMockReq(opts: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  rawBody?: string;
  parsedBody?: unknown;
  streamOversized?: boolean;
}) {
  const emitter = new EventEmitter() as any;
  emitter.method = opts.method || 'GET';
  emitter.url = opts.url || '/';
  emitter.headers = Object.fromEntries(
    Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  emitter.socket = { remoteAddress: '203.0.113.42' };
  emitter.destroyed = false;
  emitter.destroy = () => {
    emitter.destroyed = true;
  };
  if (opts.parsedBody !== undefined) {
    emitter.body = opts.parsedBody;
  } else if (opts.rawBody !== undefined) {
    emitter.body = opts.rawBody;
  }

  if (opts.streamOversized) {
    // Emit streaming chunks > 65536 bytes
    delete emitter.body;
    setImmediate(() => {
      emitter.emit('data', Buffer.alloc(40000, 'a'));
      if (!emitter.destroyed) {
        emitter.emit('data', Buffer.alloc(40000, 'b'));
      }
      emitter.emit('end');
    });
  }
  return emitter;
}

function createMockRes() {
  const headers: Record<string, string> = {};
  let bodyStr = '';
  const res: any = {
    statusCode: 200,
    setHeader(k: string, v: string | string[]) {
      headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
    },
    getHeader(k: string) {
      return headers[k.toLowerCase()];
    },
    end(chunk?: any) {
      if (chunk) bodyStr += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    },
  };
  return {
    res: res as ServerResponse,
    get status() {
      return res.statusCode;
    },
    get headers() {
      return headers;
    },
    get text() {
      return bodyStr;
    },
    json() {
      try {
        return JSON.parse(bodyStr || '{}');
      } catch {
        return {};
      }
    },
  };
}

// ============================================================================
// PART A: PostgreSQL RLS, Tenant Isolation & Privilege Escalation (PGlite)
// ============================================================================
async function runDatabaseIsolationTests() {
  console.log('\n--- PART A: POSTGRESQL MULTI-TENANT & PRIVILEGE ESCALATION (PGlite) ---');
  const baseSchema = fs
    .readFileSync(path.resolve('supabase/schema.sql'), 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');

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

    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated, anon, service_role;

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
  `);

  async function asUser(userId: string | null, email: string | null, role = 'authenticated') {
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

  await db.exec(baseSchema);

  const merchantA = '11111111-1111-4111-8111-111111111111';
  const merchantB = '22222222-2222-4222-8222-222222222222';
  const customerU = '33333333-3333-4333-8333-333333333333';
  const managerA = '44444444-4444-4444-8444-444444444444';
  const adminU = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const storeA = '10101010-1010-4010-8010-101010101010';
  const storeB = '20202020-2020-4020-8020-202020202020';
  const siteA = '11112222-3333-4444-8555-666677778888';
  const siteB = '22223333-4444-4555-8666-777788889999';
  const prodA = 'aaaa1111-1111-4111-8111-111111111111';
  const prodB = 'bbbb2222-2222-4222-8222-222222222222';
  const custRecA = 'cccc1111-1111-4111-8111-111111111111';
  const orderA = 'dddd1111-1111-4111-8111-111111111111';

  await asUser(null, null, 'service_role');
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${merchantA}', 'merchanta@test.com', '{"role":"admin"}'::jsonb),
      ('${merchantB}', 'merchantb@test.com', '{"role":"admin"}'::jsonb),
      ('${customerU}', 'customer@test.com', '{"customer_portal":true}'::jsonb),
      ('${managerA}', 'managera@test.com', '{}'::jsonb),
      ('${adminU}', 'official.amaas.dev@gmail.com', '{}'::jsonb);

    UPDATE public.profiles SET role = 'admin' WHERE id = '${adminU}';

    INSERT INTO public.stores (id, owner_id, name, slug) VALUES
      ('${storeA}', '${merchantA}', 'Dhaka Kicks', 'dhakakicks'),
      ('${storeB}', '${merchantB}', 'Urban Wear', 'urbanwear');

    INSERT INTO public.store_members (store_id, user_id, name, email, role, status) VALUES
      ('${storeA}', '${managerA}', 'Manager A', 'managera@test.com', 'manager', 'active');

    INSERT INTO public.subscribed_websites (id, user_id, store_id, business_name, niche, subdomain, status, payment_status, deployment_status) VALUES
      ('${siteA}', '${merchantA}', '${storeA}', 'Dhaka Kicks', 'Footwear', 'dhakakicks', 'active', 'paid', 'live'),
      ('${siteB}', '${merchantB}', '${storeB}', 'Urban Wear', 'Apparel', 'urbanwear', 'active', 'paid', 'live');

    INSERT INTO public.products (id, store_id, website_id, name, sku, price, stock, image_url) VALUES
      ('${prodA}', '${storeA}', '${siteA}', 'Air Runner', 'DK-01', 2500, 10, 'https://cdn.example.com/shoe.png'),
      ('${prodB}', '${storeB}', '${siteB}', 'Street Hoodie', 'UW-01', 1800, 5, 'https://cdn.example.com/hoodie.png');

    INSERT INTO public.customers (id, store_id, name, phone, email) VALUES
      ('${custRecA}', '${storeA}', 'Rahim', '01711111111', 'customer@test.com');

    INSERT INTO public.orders (id, store_id, order_number, customer_name, customer_phone, customer_email, address, city, total, items) VALUES
      ('${orderA}', '${storeA}', 'ORD-DK-1001', 'Rahim', '01711111111', 'customer@test.com', 'House 12, Dhanmondi, Dhaka', 'Dhaka', 2500, '[{"productId":"${prodA}","name":"Air Runner","price":2500,"quantity":1,"orderMeta":{"customerAuthUserId":"${customerU}"}}]'::jsonb);
  `);

  // Test A1: handle_new_user ignores metadata role='admin'
  try {
    const roles = await db.query<{ id: string; role: string }>(
      `SELECT id, role FROM public.profiles WHERE id IN ('${merchantA}', '${merchantB}', '${customerU}')`
    );
    assert(roles.rows.every((r) => r.role === 'merchant'), 'All non-admin signups defaulted to merchant');
    recordPass('DB', 'Signup trigger ignores raw_user_meta_data.role="admin"');
  } catch (e: any) {
    recordFail('DB', 'Signup trigger role check', e.message);
  }

  // Test A2: Cross-tenant SELECT isolation for Merchant B against Store A tables
  try {
    await asUser(merchantB, 'merchantb@test.com', 'authenticated');
    const pRes = await db.query(`SELECT id FROM public.products WHERE store_id = '${storeA}'`);
    const oRes = await db.query(`SELECT id FROM public.orders WHERE store_id = '${storeA}'`);
    const cRes = await db.query(`SELECT id FROM public.customers WHERE store_id = '${storeA}'`);
    const sRes = await db.query(`SELECT id FROM public.stores WHERE id = '${storeA}'`);
    const wRes = await db.query(`SELECT id FROM public.subscribed_websites WHERE id = '${siteA}'`);
    assert(
      pRes.rows.length === 0 && oRes.rows.length === 0 && cRes.rows.length === 0 && sRes.rows.length === 0 && wRes.rows.length === 0,
      `Expected 0 cross-tenant rows, got p=${pRes.rows.length}, o=${oRes.rows.length}, c=${cRes.rows.length}, s=${sRes.rows.length}, w=${wRes.rows.length}`
    );
    recordPass('DB', 'Merchant B cannot SELECT Store A products, orders, customers, stores, or subscribed_websites');
  } catch (e: any) {
    recordFail('DB', 'Merchant B cross-tenant SELECT isolation', e.message);
  }

  // Test A3: Cross-tenant INSERT/UPDATE/DELETE blocked for Merchant B
  try {
    await asUser(merchantB, 'merchantb@test.com', 'authenticated');
    let insFailed = false;
    try {
      await db.exec(`INSERT INTO public.products (store_id, name, sku, price, stock) VALUES ('${storeA}', 'Injected', 'BAD-1', 1, 1)`);
    } catch {
      insFailed = true;
    }
    const updRes = await db.query(`UPDATE public.orders SET status = 'cancelled' WHERE id = '${orderA}' RETURNING id`);
    const delRes = await db.query(`DELETE FROM public.customers WHERE id = '${custRecA}' RETURNING id`);
    assert(insFailed && updRes.rows.length === 0 && delRes.rows.length === 0, 'Cross-tenant write succeeded');
    recordPass('DB', 'Merchant B blocked from inserting/updating/deleting inside Store A');
  } catch (e: any) {
    recordFail('DB', 'Merchant B cross-tenant mutation isolation', e.message);
  }

  // Test A4: Authenticated Customer cannot directly read merchant tables via RLS
  try {
    await asUser(customerU, 'customer@test.com', 'authenticated');
    const cOrders = await db.query(`SELECT id FROM public.orders`);
    const cCustomers = await db.query(`SELECT id FROM public.customers`);
    const cProducts = await db.query(`SELECT id FROM public.products`);
    assert(cOrders.rows.length === 0 && cCustomers.rows.length === 0 && cProducts.rows.length === 0, 'Customer saw merchant rows directly');
    recordPass('DB', 'Customer JWT sees 0 rows on direct SELECT against orders, customers, and products');
  } catch (e: any) {
    recordFail('DB', 'Customer direct table RLS block', e.message);
  }

  // Test A5: Privilege escalation attempts (Merchant/Customer -> Admin, Store A store_id transfer, Manager -> Owner)
  try {
    await asUser(customerU, 'customer@test.com', 'authenticated');
    let esc1 = false;
    try {
      await db.exec(`UPDATE public.profiles SET role = 'admin' WHERE id = '${customerU}'`);
    } catch {
      esc1 = true;
    }

    await asUser(merchantA, 'merchanta@test.com', 'authenticated');
    let esc2 = false;
    try {
      await db.exec(`UPDATE public.products SET store_id = '${storeB}' WHERE id = '${prodA}'`);
    } catch {
      esc2 = true;
    }

    let esc3 = false;
    try {
      await db.exec(`UPDATE public.products SET website_id = '${siteB}' WHERE id = '${prodA}'`);
    } catch {
      esc3 = true;
    }

    await asUser(managerA, 'managera@test.com', 'authenticated');
    let esc4 = false;
    try {
      await db.exec(`UPDATE public.store_members SET role = 'owner' WHERE user_id = '${managerA}'`);
    } catch {
      esc4 = true;
    }

    assert(esc1 && esc2 && esc3 && esc4, `Escalation check results: esc1=${esc1} esc2=${esc2} esc3=${esc3} esc4=${esc4}`);
    recordPass('DB', 'Blocked profile admin escalation, store_id transfer, cross-tenant website_id link, and manager->owner self-promotion');
  } catch (e: any) {
    recordFail('DB', 'Privilege escalation trigger suite', e.message);
  }

  // Test A6: Anon role isolation & amaas_internal lockdown
  try {
    await asUser(null, null, 'anon');
    const anonOrders = await db.query<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM public.orders`).catch(() => ({ rows: [{ cnt: -1 }] }));
    let internalBlocked = false;
    try {
      await db.query(`SELECT * FROM amaas_internal.payment_review_authorizations`);
    } catch {
      internalBlocked = true;
    }
    assert((anonOrders.rows[0]?.cnt ?? -2) === -1 && internalBlocked, 'Anon accessed protected schema/table');
    recordPass('DB', 'anon blocked from public.orders and amaas_internal.payment_review_authorizations');
  } catch (e: any) {
    recordFail('DB', 'Anon isolation check', e.message);
  }

  // Test A7 (Audit Finding Probe): Does DB trigger validate_product_website_scope block data:image/svg+xml?
  try {
    await asUser(merchantA, 'merchanta@test.com', 'authenticated');
    let svgAcceptedInDb = false;
    try {
      await db.exec(
        `UPDATE public.products SET image_url = 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+' WHERE id = '${prodA}'`
      );
      svgAcceptedInDb = true;
    } catch {
      svgAcceptedInDb = false;
    }
    if (svgAcceptedInDb) {
      recordFinding(
        'DB',
        'products.image_url DB trigger permits data:image/svg+xml',
        'validate_product_website_scope() blocks javascript:, vbscript:, data:text/%, but does NOT block data:image/svg+xml'
      );
    } else {
      recordPass('DB', 'products.image_url rejects data:image/svg+xml');
    }
  } catch (e: any) {
    recordFail('DB', 'SVG data URI DB trigger probe', e.message);
  }

  await db.close();
}

// ============================================================================
// PART B: Vercel Serverless API Security Abuse Tests
// ============================================================================
async function runApiSecurityTests() {
  console.log('\n--- PART B: VERCEL SERVERLESS API SECURITY ABUSE TESTS ---');

  process.env.VITE_SUPABASE_URL = 'https://mock-proj.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key-mock-12345678901234567890';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_mock_service_role_key_12345';
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  const merchantAToken = 'token-merchant-a-valid-1234567890';
  const merchantBToken = 'token-merchant-b-valid-1234567890';
  const customerAToken = 'token-customer-a-valid-1234567890';

  const merchantAId = '11111111-1111-4111-8111-111111111111';
  const merchantBId = '22222222-2222-4222-8222-222222222222';
  const customerAId = '33333333-3333-4333-8333-333333333333';
  const customerBId = '55555555-5555-4555-8555-555555555555';

  const storeAId = '10101010-1010-4010-8010-101010101010';
  const storeBId = '20202020-2020-4020-8020-202020202020';
  const siteAId = '11112222-3333-4444-8555-666677778888';
  const siteBId = '22223333-4444-4555-8666-777788889999';
  const prodAId = 'aaaa1111-1111-4111-8111-111111111111';
  const prodBId = 'bbbb2222-2222-4222-8222-222222222222';
  const orderAId = 'dddd1111-1111-4111-8111-111111111111';
  const orderOtherCustInStoreB = 'eeee2222-2222-4222-8222-222222222222';

  let lastInsertedOrderBody: any = null;
  const origFetch = globalThis.fetch;

  (globalThis as any).fetch = async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers || {});
    const auth = headers.get('authorization') || '';
    const method = (init?.method || 'GET').toUpperCase();

    const jsonResp = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

    if (url.includes('/auth/v1/user')) {
      if (auth === `Bearer ${merchantAToken}`) return jsonResp({ id: merchantAId, email: 'merchanta@test.com' });
      if (auth === `Bearer ${merchantBToken}`) return jsonResp({ id: merchantBId, email: 'merchantb@test.com' });
      if (auth === `Bearer ${customerAToken}`) return jsonResp({ id: customerAId, email: 'customera@test.com' });
      return jsonResp({ error: 'invalid jwt' }, 401);
    }

    if (url.includes('/rest/v1/rpc/get_published_website_by_subdomain')) {
      const reqBody = JSON.parse(String(init?.body || '{}'));
      const sub = String(reqBody.p_subdomain || '').toLowerCase();
      if (sub === 'dhakakicks') {
        return jsonResp({
          found: true,
          site: {
            id: siteAId,
            storeId: storeAId,
            subdomain: 'dhakakicks',
            businessName: 'Dhaka Kicks',
            status: 'active',
            paymentStatus: 'paid',
            deploymentStatus: 'live',
            currentPeriodEnd: '2099-01-01T00:00:00Z',
          },
        });
      }
      if (sub === 'urbanwear') {
        return jsonResp({
          found: true,
          site: {
            id: siteBId,
            storeId: storeBId,
            subdomain: 'urbanwear',
            businessName: 'Urban Wear',
            status: 'active',
            paymentStatus: 'paid',
            deploymentStatus: 'live',
            currentPeriodEnd: '2099-01-01T00:00:00Z',
          },
        });
      }
      return jsonResp({ found: false });
    }

    if (url.includes('/rest/v1/subscribed_websites')) {
      if (url.includes(siteAId) || url.toLowerCase().includes('dhakakicks')) {
        return jsonResp([
          {
            id: siteAId,
            store_id: storeAId,
            user_id: merchantAId,
            business_name: 'Dhaka Kicks',
            subdomain: 'dhakakicks',
            status: 'active',
            payment_status: 'paid',
            deployment_status: 'live',
            current_period_end: '2099-01-01T00:00:00Z',
            config: { businessName: 'Dhaka Kicks', deliveryInsideDhaka: 70 },
          },
        ]);
      }
      if (url.includes(siteBId) || url.toLowerCase().includes('urbanwear')) {
        return jsonResp([
          {
            id: siteBId,
            store_id: storeBId,
            user_id: merchantBId,
            business_name: 'Urban Wear',
            subdomain: 'urbanwear',
            status: 'active',
            payment_status: 'paid',
            deployment_status: 'live',
            current_period_end: '2099-01-01T00:00:00Z',
            config: {
              businessName: 'Urban Wear',
              deliveryInsideDhaka: 70,
              servicesOrProducts: [
                { productId: prodBId, id: prodBId, name: 'Street Hoodie', priceNumeric: 1800, isVisible: true },
              ],
            },
          },
        ]);
      }
      return jsonResp([]);
    }

    if (url.includes('/rest/v1/stores')) {
      if (url.includes(storeAId)) return jsonResp([{ id: storeAId, owner_id: merchantAId, name: 'Dhaka Kicks' }]);
      if (url.includes(storeBId)) return jsonResp([{ id: storeBId, owner_id: merchantBId, name: 'Urban Wear' }]);
      return jsonResp([]);
    }

    if (url.includes('/rest/v1/products')) {
      if (method === 'PATCH') {
        return jsonResp([
          { id: prodBId, store_id: storeBId, website_id: siteBId, name: 'Street Hoodie', sku: 'UW-01', price: 1800, stock: 3, sales_count: 2, status: 'active', is_visible: true },
        ]);
      }
      if (url.includes(storeBId)) {
        return jsonResp([
          { id: prodBId, store_id: storeBId, website_id: siteBId, name: 'Street Hoodie', sku: 'UW-01', price: 1800, stock: 5, sales_count: 0, status: 'active', is_visible: true },
        ]);
      }
      if (url.includes(storeAId)) {
        return jsonResp([
          { id: prodAId, store_id: storeAId, website_id: siteAId, name: 'Air Runner', sku: 'DK-01', price: 2500, stock: 10, sales_count: 0, status: 'active', is_visible: true },
        ]);
      }
      return jsonResp([]);
    }

    if (url.includes('/rest/v1/orders')) {
      if (method === 'GET') {
        if (url.includes(`store_id=eq.${storeBId}`) && url.includes(orderAId)) {
          // Order A belongs to store A, so store B query yields []
          return jsonResp([]);
        }
        if (url.includes(`store_id=eq.${storeBId}`) && url.includes(orderOtherCustInStoreB)) {
          // Belongs to Customer B inside Store B
          return jsonResp([
            {
              id: orderOtherCustInStoreB,
              store_id: storeBId,
              order_number: 'ORD-UW-9999',
              customer_name: 'Victim Customer',
              customer_phone: '01811111111',
              total: 1800,
              items: [{ productId: prodBId, name: 'Street Hoodie', price: 1800, quantity: 1, orderMeta: { customerAuthUserId: customerBId } }],
            },
          ]);
        }
        if (url.includes(`store_id=eq.${storeBId}`)) {
          return jsonResp([]);
        }
        return jsonResp([]);
      }
      if (method === 'POST') {
        lastInsertedOrderBody = JSON.parse(String(init?.body || '{}'));
        return jsonResp([{ ...lastInsertedOrderBody, id: 'ffffffff-1111-4111-8111-111111111111', created_at: '2026-11-20T00:00:00Z' }], 201);
      }
    }

    if (url.includes('/rest/v1/service_pricing_catalog')) {
      return jsonResp([{ service_type: 'website_subscription', service_code: 'website_lite', plan_tier_label: 'GoAMAAS Website', price_bdt: 600, setup_fee_bdt: 0, is_active: true }]);
    }

    return jsonResp([], 200);
  };

  try {
    // Test B1: CORS enforcement
    try {
      const badOrigins = ['https://evil.com', 'https://a.b.amaas.xyz', 'https://xn--bcher-kva.amaas.xyz', 'https://admin.amaas.xyz', 'http://dhakakicks.amaas.xyz'];
      for (const badOrigin of badOrigins) {
        const resMock = createMockRes();
        await publicOrderHandler(createMockReq({ method: 'OPTIONS', headers: { origin: badOrigin } }), resMock.res);
        assert(resMock.status === 403 && !resMock.headers['access-control-allow-origin'], `Expected 403 for ${badOrigin}, got ${resMock.status}`);
      }
      // verify-pricing rejects storefront origins too
      const vpRes = createMockRes();
      await verifyPricingHandler(createMockReq({ method: 'OPTIONS', headers: { origin: 'https://dhakakicks.amaas.xyz' } }), vpRes.res);
      assert(vpRes.status === 403, `Expected verify-pricing to reject storefront origin, got ${vpRes.status}`);

      // Valid storefront origin allowed on public-order
      const okRes = createMockRes();
      await publicOrderHandler(createMockReq({ method: 'OPTIONS', headers: { origin: 'https://dhakakicks.amaas.xyz' } }), okRes.res);
      assert(okRes.status === 204 && okRes.headers['access-control-allow-origin'] === 'https://dhakakicks.amaas.xyz', 'Allowed valid storefront origin');
      recordPass('API', 'CORS rejects evil, multi-level, punycode, reserved, and HTTP origins; verify-pricing restricts storefronts');
    } catch (e: any) {
      recordFail('API', 'CORS origin validation', e.message);
    }

    // Test B2: Malformed X-Forwarded-Host bug probe on resolve-tenant & verify-pricing
    try {
      const rtRes = createMockRes();
      await resolveTenantHandler(
        createMockReq({ method: 'GET', url: '/api/resolve-tenant?subdomain=dhakakicks', headers: { 'x-forwarded-host': 'bad host' } }),
        rtRes.res
      );
      const vpRes = createMockRes();
      await verifyPricingHandler(
        createMockReq({
          method: 'GET',
          url: '/api/verify-pricing?serviceType=website_subscription&serviceId=website_lite',
          headers: { authorization: `Bearer ${merchantAToken}`, 'x-forwarded-host': 'bad host' },
        }),
        vpRes.res
      );
      if (rtRes.status === 500 || vpRes.status === 500) {
        recordFinding(
          'API',
          'Untrusted X-Forwarded-Host throws TypeError -> HTTP 500',
          `resolve-tenant returned ${rtRes.status}, verify-pricing returned ${vpRes.status} for "x-forwarded-host: bad host"`
        );
      } else {
        recordPass('API', 'Malformed X-Forwarded-Host handled gracefully without 500');
      }
    } catch (e: any) {
      recordFail('API', 'Malformed X-Forwarded-Host probe', e.message);
    }

    // Test B3: Customer Portal cross-store isolation & same-store IDOR protection
    try {
      // Customer A tries reading Customer A's order from Store A while specifying subdomain=urbanwear (Store B)
      const crossStoreRes = createMockRes();
      await customerPortalHandler(
        createMockReq({
          method: 'GET',
          url: `/api/customer-portal?action=order&subdomain=urbanwear&orderId=${orderAId}`,
          headers: { authorization: `Bearer ${customerAToken}` },
        }),
        crossStoreRes.res
      );
      assert(crossStoreRes.status === 404, `Expected 404 cross-store order lookup, got ${crossStoreRes.status}`);

      // Customer A tries reading Customer B's order inside Store B (IDOR)
      const idorRes = createMockRes();
      await customerPortalHandler(
        createMockReq({
          method: 'GET',
          url: `/api/customer-portal?action=order&subdomain=urbanwear&orderId=${orderOtherCustInStoreB}`,
          headers: { authorization: `Bearer ${customerAToken}` },
        }),
        idorRes.res
      );
      assert(idorRes.status === 403 && idorRes.json().code === 'FORBIDDEN_ORDER_ACCESS', `Expected 403 IDOR block, got ${idorRes.status}`);

      // Invalid JWT
      const badAuthRes = createMockRes();
      await customerPortalHandler(
        createMockReq({
          method: 'GET',
          url: `/api/customer-portal?action=orders&subdomain=urbanwear`,
          headers: { authorization: 'Bearer invalid-jwt-token-00000000000000' },
        }),
        badAuthRes.res
      );
      assert(badAuthRes.status === 401, `Expected 401 for bad JWT, got ${badAuthRes.status}`);

      recordPass('API', 'Customer Portal blocks cross-store order reads, same-store IDOR, and invalid JWTs');
    } catch (e: any) {
      recordFail('API', 'Customer Portal authorization & IDOR checks', e.message);
    }

    // Test B4: Verify-Pricing blocks cross-merchant websiteId lookup
    try {
      const resMock = createMockRes();
      await verifyPricingHandler(
        createMockReq({
          method: 'POST',
          url: '/api/verify-pricing',
          headers: {
            authorization: `Bearer ${merchantBToken}`,
            'content-type': 'application/json',
            host: 'app.amaas.xyz',
          },
          parsedBody: {
            serviceType: 'website_subscription',
            serviceId: siteAId,
          },
        }),
        resMock.res
      );
      assert(resMock.status === 403 || resMock.status === 404, `Expected 403/404 when Merchant B accesses Merchant A websiteId, got ${resMock.status}`);
      recordPass('API', 'verify-pricing enforces website ownership (blocks Merchant B querying Merchant A websiteId)');
    } catch (e: any) {
      recordFail('API', 'verify-pricing cross-tenant ownership test', e.message);
    }

    // Test B5: Public Order rejects cross-store products, negative quantities, spoofed customerAuthUserId, and price tampering
    try {
      // Cross-store product attack: buy Store A product on Store B subdomain
      const crossProdRes = createMockRes();
      await publicOrderHandler(
        createMockReq({
          method: 'POST',
          url: '/api/public-order',
          headers: { 'content-type': 'application/json' },
          parsedBody: {
            checkoutAttemptId: 'attempt-cross-store-12345',
            subdomain: 'urbanwear',
            customerName: 'Attacker',
            customerPhone: '01712345678',
            shippingAddress: 'Dhaka',
            deliveryZone: 'inside_dhaka',
            items: [{ productId: prodAId, name: 'Air Runner', price: 1, quantity: 1 }],
          },
        }),
        crossProdRes.res
      );
      assert(crossProdRes.status >= 400 && crossProdRes.status < 500, `Expected 4xx for cross-store product, got ${crossProdRes.status}`);

      // Client price tampering + spoofed customerAuthUserId without Bearer JWT
      lastInsertedOrderBody = null;
      const priceTamperRes = createMockRes();
      await publicOrderHandler(
        createMockReq({
          method: 'POST',
          url: '/api/public-order',
          headers: { 'content-type': 'application/json' },
          parsedBody: {
            checkoutAttemptId: 'attempt-price-tamper-12345',
            subdomain: 'urbanwear',
            customerName: 'Price Tamperer',
            customerPhone: '01712345678',
            shippingAddress: 'House 10, Road 2',
            city: 'Dhaka',
            deliveryZone: 'inside_dhaka',
            customerAuthUserId: 'victim-uuid-spoofed',
            items: [{ productId: prodBId, name: 'Street Hoodie', price: 1, quantity: 2 }],
          },
        }),
        priceTamperRes.res
      );
      assert(priceTamperRes.status === 201, `Expected 201 for valid product with server pricing, got ${priceTamperRes.status}: ${priceTamperRes.text}`);
      const orderOut = priceTamperRes.json().order;
      assert(
        orderOut.subtotal === 3600 && orderOut.deliveryFee === 60 && orderOut.total === 3660 && !orderOut.customerAuthUserId,
        `Server must compute 1800*2+60=3660 and strip spoofed customerAuthUserId; got subtotal=${orderOut.subtotal} fee=${orderOut.deliveryFee} total=${orderOut.total} authUid=${orderOut.customerAuthUserId}`
      );
      recordPass('API', 'public-order blocks cross-store products, enforces DB unit prices (1 -> 1800) & delivery fee (60), and strips spoofed customerAuthUserId');
    } catch (e: any) {
      recordFail('API', 'public-order tampering & cross-store isolation', e.message);
    }

    // Test B6: HTTP strict validation (405, 415, 400 invalid JSON, 413 payload > 64KB, 429 rate limit)
    try {
      const m405 = createMockRes();
      await publicInquiryHandler(createMockReq({ method: 'GET', url: '/api/public-inquiry' }), m405.res);
      assert(m405.status === 405, `Expected 405, got ${m405.status}`);

      const ct415 = createMockRes();
      await publicInquiryHandler(
        createMockReq({ method: 'POST', headers: { 'content-type': 'text/plain' }, rawBody: '{}' }),
        ct415.res
      );
      assert(ct415.status === 415, `Expected 415, got ${ct415.status}`);

      const json400 = createMockRes();
      await publicInquiryHandler(
        createMockReq({ method: 'POST', headers: { 'content-type': 'application/json' }, rawBody: '{invalid-json' }),
        json400.res
      );
      assert(json400.status === 400, `Expected 400 invalid JSON, got ${json400.status}`);

      const big413 = createMockRes();
      await publicOrderHandler(
        createMockReq({ method: 'POST', headers: { 'content-type': 'application/json' }, streamOversized: true }),
        big413.res
      );
      assert(big413.status === 413, `Expected 413 oversized payload, got ${big413.status}`);

      // Trigger rate limit on public-inquiry (12/min per IP)
      let hit429 = false;
      let retryAfter = '';
      for (let i = 0; i < 16; i++) {
        const rlRes = createMockRes();
        await publicInquiryHandler(
          createMockReq({
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.77' },
            parsedBody: {},
          }),
          rlRes.res
        );
        if (rlRes.status === 429) {
          hit429 = true;
          retryAfter = rlRes.headers['retry-after'] || '';
          break;
        }
      }
      assert(hit429 && Number(retryAfter) > 0, `Expected 429 with Retry-After, hit=${hit429} retryAfter=${retryAfter}`);
      recordPass('API', 'Enforces 405 method, 415 Content-Type, 400 JSON parse, 413 body limit (64KB stream destroy), and 429 Retry-After');
    } catch (e: any) {
      recordFail('API', 'HTTP transport & rate-limit enforcement', e.message);
    }
  } finally {
    globalThis.fetch = origFetch;
  }
}

// ============================================================================
// PART C: XSS, File Upload Magic Bytes & Open Redirect Probes
// ============================================================================
async function runInputAndXssTests() {
  console.log('\n--- PART C: XSS, FILE UPLOAD MAGIC BYTES & OPEN REDIRECT PROBES ---');

  try {
    const xssUrls = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(document.cookie)',
      '\u0000javascript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+',
      '//evil.com/phish',
      '/\\evil.com',
    ];
    for (const u of xssUrls) {
      assert(sanitizeHrefUrl(u, '#') === '#', `sanitizeHrefUrl leaked ${u}`);
      assert(sanitizeImageUrl(u) === '', `sanitizeImageUrl leaked ${u}`);
    }
    assert(sanitizeImageUrl('data:image/png;base64,iVBORw0KGgo=').startsWith('data:image/png;base64,'), 'Allowed safe PNG data URI');
    assert(sanitizePhoneHref('+8801712345678\r\n<script>') === 'tel:+8801712345678', 'Phone stripped script chars');
    assert(sanitizeEmailHref('user@example.com<script>') === '', 'Email rejected angle brackets');
    recordPass('XSS', 'sanitizeHrefUrl / sanitizeImageUrl / sanitizePhoneHref / sanitizeEmailHref block javascript/vbscript/data:text/SVG');
  } catch (e: any) {
    recordFail('XSS', 'URL sanitizer probes', e.message);
  }

  try {
    // Disguised SVG uploaded as evil.png with MIME image/png
    const fakeSvgFile = new File(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'], 'evil.png', {
      type: 'image/png',
    });
    const svgRes = await validateImageFileBinaryAndExtension(fakeSvgFile);
    assert(!svgRes.ok, 'Expected SVG-in-PNG disguise to be rejected');

    const realSvgMime = new File(['<svg></svg>'], 'logo.svg', { type: 'image/svg+xml' });
    const svgMimeRes = await validateImageFileBinaryAndExtension(realSvgMime);
    assert(!svgMimeRes.ok, 'Expected image/svg+xml to be rejected');

    // Real PNG header bytes
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const validPng = new File([pngBytes], 'logo.png', { type: 'image/png' });
    const pngRes = await validateImageFileBinaryAndExtension(validPng);
    assert(pngRes.ok, `Expected real PNG magic bytes to pass: ${JSON.stringify(pngRes)}`);
    recordPass('UPLOAD', 'validateImageFileBinaryAndExtension blocks spoofed SVG-in-PNG and SVG MIME, allows valid PNG magic bytes');
  } catch (e: any) {
    recordFail('UPLOAD', 'Binary upload magic-byte verification', e.message);
  }

  try {
    const unsafeRedirects = [
      '',
      '//evil.com',
      '/\\evil.com',
      'https://evil.com/steal',
      '/dashboard\r\nSet-Cookie: a=b',
      'javascript:alert(1)',
    ];
    for (const r of unsafeRedirects) {
      assert(!isSafeInternalRedirectPath(r), `isSafeInternalRedirectPath allowed unsafe: ${r}`);
    }
    assert(isSafeInternalRedirectPath('/dashboard?tab=orders'), 'Expected safe internal path to pass');
    assert(isSafeInternalRedirectPath('/onboarding?from=customer_portal'), 'Expected onboarding transition path to pass');
    recordPass('REDIRECT', 'isSafeInternalRedirectPath blocks //, /\\, external URLs, CRLF injection, and javascript:');
  } catch (e: any) {
    recordFail('REDIRECT', 'Internal redirect path validation', e.message);
  }
}

// ============================================================================
// PART D: Source-Level Regression Verification of Second-Pass Findings
// ============================================================================
function runSourceAuditChecks() {
  console.log('\n--- PART D: SOURCE-LEVEL STATIC VERIFICATION OF AUDIT FINDINGS ---');

  const appCtx = fs.readFileSync('src/context/AppContext.tsx', 'utf8');
  if (/updateProductInDb\(id,\s*\{\s*stock:\s*newStock\s*\}\)/.test(appCtx)) {
    recordFinding(
      'MULTI-TENANT',
      'AppContext.adjustProductStock omits storeId parameter',
      'src/context/AppContext.tsx calls updateProductInDb(id, { stock: newStock }) without passing storeId (mitigated by DB RLS can_manage_store)'
    );
  }

  const wizard = fs.readFileSync('src/components/onboarding/GuidedWebsiteWizard.tsx', 'utf8');
  if (wizard.includes('accept="image/*"')) {
    recordFinding(
      'XSS/UPLOAD',
      'GuidedWebsiteWizard file inputs use accept="image/*"',
      'src/components/onboarding/GuidedWebsiteWizard.tsx allows selecting SVG in browser picker and renders raw logoUrl/item.imageUrl without sanitizeImageUrl()'
    );
  }

  const tracker = fs.readFileSync('src/components/website/CustomerOrderTracker.tsx', 'utf8');
  if (tracker.includes('src={it.imageUrl}') || tracker.includes('href={`tel:${branding.phone}`}') || tracker.includes('href={`mailto:${branding.email}`}')) {
    recordFinding(
      'XSS',
      'CustomerOrderTracker renders unsanitized it.imageUrl / tel: / mailto:',
      'src/components/website/CustomerOrderTracker.tsx bypasses sanitizeImageUrl / sanitizePhoneHref / sanitizeEmailHref'
    );
  }

  const vercelJson = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const adminRules = (vercelJson.headers || []).filter((h: any) => String(h.source || '').startsWith('/admin'));
  const hasAdminCspOverride = adminRules.some((r: any) =>
    (r.headers || []).some((hdr: any) => String(hdr.key || '').toLowerCase() === 'content-security-policy')
  );
  if (!hasAdminCspOverride) {
    recordFinding(
      'HEADERS',
      '/admin routes inherit global CSP frame-ancestors \'self\'',
      'vercel.json sets X-Frame-Options: DENY on /admin, but browsers prioritize global CSP frame-ancestors \'self\' unless overridden'
    );
  }
}

async function main() {
  console.log('=== GOAMAAS INDEPENDENT SECOND-PASS SECURITY VERIFICATION SUITE ===');
  await runDatabaseIsolationTests();
  await runApiSecurityTests();
  await runInputAndXssTests();
  runSourceAuditChecks();

  const passes = results.filter((r) => r.status === 'PASS').length;
  const fails = results.filter((r) => r.status === 'FAIL').length;
  const findings = results.filter((r) => r.status === 'FINDING').length;
  console.log(`\nSUMMARY: PASS=${passes}, FAIL=${fails}, CONFIRMED_FINDINGS=${findings}`);
  if (fails > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});

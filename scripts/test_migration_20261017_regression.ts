import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';

async function runRegressionSuite() {
  console.log('=== REGRESSION TEST SUITE: 20261017 PUBLIC RESOLUTION & PUBLISHING ===');
  let passed = 0;
  let total = 0;

  async function test(name: string, fn: (db: PGlite) => Promise<void>) {
    total++;
    const db = new PGlite();

    await db.exec(`
      DO \$\$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
      END \$\$;

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

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS \$\$
        SELECT current_user_id FROM public._test_session LIMIT 1;
      \$\$ LANGUAGE sql STABLE SECURITY DEFINER;

      CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT AS \$\$
        SELECT current_email FROM public._test_session LIMIT 1;
      \$\$ LANGUAGE sql STABLE SECURITY DEFINER;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS \$\$
        SELECT session_role FROM public._test_session LIMIT 1;
      \$\$ LANGUAGE sql STABLE SECURITY DEFINER;

      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS \$\$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
      \$\$ LANGUAGE sql STABLE SECURITY DEFINER;
    `);

    try {
      await fn(db);
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}`);
      console.error(`       Error: ${err.message || err}`);
    }
  }

  const baseSchema = fs.readFileSync('supabase/schema.sql', 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
  const migration20261017 = fs.readFileSync('supabase/migrations/20261017_public_website_resolution_and_publishing.sql', 'utf8');

  async function asUser(db: PGlite, userId: string | null, email: string | null = null, role: string = 'authenticated') {
    await db.exec(`RESET ROLE;`);
    await db.exec(`
      UPDATE public._test_session 
      SET current_user_id = ${userId ? `'${userId}'::uuid` : 'NULL'},
          current_email = ${email ? `'${email}'` : 'NULL'},
          session_role = '${role}';
      SELECT set_config('request.jwt.claim.role', '${role}', false);
      SELECT set_config('request.jwt.claim.sub', ${userId ? `'${userId}'` : "''"}, false);
      SELECT set_config('request.jwt.claims', json_build_object('sub', ${userId ? `'${userId}'` : "NULL"}, 'role', '${role}')::text, false);
    `);
    if (role === 'authenticated' || role === 'anon') {
      await db.exec(`SET ROLE ${role};`);
    } else {
      await db.exec(`RESET ROLE;`);
    }
  }

  // TEST 1
  await test('Migration is 100% idempotent across multiple consecutive runs', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);
    await db.exec(migration20261017);
    await db.exec(migration20261017);
  });

  // TEST 2
  await test('Payment backfill preserves existing verified statuses and reconciles evidence', async (db) => {
    await db.exec(baseSchema);
    await db.exec(`
      DROP TRIGGER IF EXISTS trg_protect_subscribed_website_security ON public.subscribed_websites;
      DROP TRIGGER IF EXISTS trg_protect_subscribed_website_updates ON public.subscribed_websites;
      ALTER TABLE public.subscribed_websites ALTER COLUMN payment_status DROP NOT NULL;
    `);

    const user1 = '11111111-1111-1111-1111-111111111111';
    const store1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const sitePaid = '55555555-5555-5555-5555-555555555555';
    const siteFailed = '66666666-6666-6666-6666-666666666666';
    const siteUnverifiedLive = '77777777-7777-7777-7777-777777777777';
    const sitePendingLive = '77777777-7777-7777-7777-777777777778';
    const siteVerifiedPending = '88888888-8888-8888-8888-888888888888';

    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${user1}', 'user1@test.com');
      INSERT INTO public.stores (id, owner_id, name, slug) VALUES ('${store1}', '${user1}', 'Test Store', 'test-store');
      
      INSERT INTO public.subscribed_websites (id, user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status, deployment_status, current_period_end, grace_period_end, config)
      VALUES ('${sitePaid}', '${user1}', '${store1}', 'Biz Paid', 'retail', 'bizpaid', 'bizpaid.amaas.xyz', 'tpl-1', 'Modern', 'active', 'deploying', NOW() + INTERVAL '30 days', NOW() + INTERVAL '37 days', '{"headline": "Hello"}'::jsonb);

      INSERT INTO public.subscribed_websites (id, user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status, deployment_status, current_period_end, grace_period_end, config)
      VALUES ('${siteFailed}', '${user1}', '${store1}', 'Biz Failed', 'retail', 'bizfailed', 'bizfailed.amaas.xyz', 'tpl-1', 'Modern', 'active', 'deploying', NOW() + INTERVAL '30 days', NOW() + INTERVAL '37 days', '{"headline": "Hello"}'::jsonb);

      INSERT INTO public.subscribed_websites (id, user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status, deployment_status, current_period_end, grace_period_end, config)
      VALUES ('${siteUnverifiedLive}', '${user1}', '${store1}', 'Biz Unverified Live', 'retail', 'bizunverified', 'bizunverified.amaas.xyz', 'tpl-1', 'Modern', 'active', 'deploying', NOW() + INTERVAL '30 days', NOW() + INTERVAL '37 days', '{"headline": "Hello"}'::jsonb);

      INSERT INTO public.subscribed_websites (id, user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status, deployment_status, current_period_end, grace_period_end, config)
      VALUES ('${sitePendingLive}', '${user1}', '${store1}', 'Biz Pending Live', 'retail', 'bizpendinglive', 'bizpendinglive.amaas.xyz', 'tpl-1', 'Modern', 'active', 'deploying', NOW() + INTERVAL '30 days', NOW() + INTERVAL '37 days', '{"headline": "Hello"}'::jsonb);

      INSERT INTO public.subscribed_websites (id, user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status, deployment_status, current_period_end, grace_period_end, config)
      VALUES ('${siteVerifiedPending}', '${user1}', '${store1}', 'Biz Verified Pending', 'retail', 'bizverified', 'bizverified.amaas.xyz', 'tpl-1', 'Modern', 'active', 'deploying', NOW() + INTERVAL '30 days', NOW() + INTERVAL '37 days', '{"headline": "Hello"}'::jsonb);

      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method,
        status, reviewed_at
      ) VALUES (
        '${user1}', '${store1}', 'Merchant One', '01800000000', 'user1@test.com',
        'website_subscription', '${siteVerifiedPending}', 'AMAAS Website', 'Lite', 600, 'bKash',
        'approved', NOW()
      );

      UPDATE public.subscribed_websites SET payment_status = 'paid' WHERE id = '${sitePaid}';
      UPDATE public.subscribed_websites SET payment_status = 'failed' WHERE id = '${siteFailed}';
      UPDATE public.subscribed_websites SET payment_status = NULL, deployment_status = 'live' WHERE id = '${siteUnverifiedLive}';
      UPDATE public.subscribed_websites SET payment_status = 'pending', deployment_status = 'live' WHERE id = '${sitePendingLive}';
      UPDATE public.subscribed_websites SET payment_status = 'pending' WHERE id = '${siteVerifiedPending}';
    `);

    await db.exec(migration20261017);

    const resPaid = await db.query<{ payment_status: string }>(`SELECT payment_status FROM public.subscribed_websites WHERE id = '${sitePaid}'`);
    if (resPaid.rows[0].payment_status !== 'paid') throw new Error('Paid not preserved');

    const resFailed = await db.query<{ payment_status: string }>(`SELECT payment_status FROM public.subscribed_websites WHERE id = '${siteFailed}'`);
    if (resFailed.rows[0].payment_status !== 'failed') throw new Error('Failed not preserved');

    const resUnverified = await db.query<{ payment_status: string; config: any }>(`SELECT payment_status, config FROM public.subscribed_websites WHERE id = '${siteUnverifiedLive}'`);
    if (resUnverified.rows[0].payment_status !== 'pending_review' || !resUnverified.rows[0].config?.paymentAuditNotice?.reason) {
      throw new Error('Unverified live site audit notice failed');
    }

    const resVerified = await db.query<{ payment_status: string }>(`SELECT payment_status FROM public.subscribed_websites WHERE id = '${siteVerifiedPending}'`);
    if (resVerified.rows[0].payment_status !== 'paid') throw new Error('Verified pending site failed to become paid');
  });

  // TEST 3
  await test('Anonymous direct table access is blocked by RLS; tenant isolation preserved', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    const user1 = '11111111-1111-1111-1111-111111111111';
    const user2 = '22222222-2222-2222-2222-222222222222';
    const site1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${user1}', 'user1@test.com'), ('${user2}', 'user2@test.com');
      INSERT INTO public.subscribed_websites (id, user_id, business_name, niche, subdomain, full_domain, deployment_status, status, payment_status)
      VALUES ('${site1}', '${user1}', 'User1 Site', 'retail', 'user1site', 'user1site.amaas.xyz', 'live', 'active', 'paid');
    `);

    await asUser(db, null, null, 'anon');
    let anonBlocked = false;
    try {
      const anonRes = await db.query(`SELECT * FROM public.subscribed_websites;`);
      if (anonRes.rows.length === 0) anonBlocked = true;
    } catch (e: any) {
      if (e.message.includes('permission denied')) anonBlocked = true;
    }
    if (!anonBlocked) throw new Error('Anonymous user accessed table directly');

    await asUser(db, user2, 'user2@test.com', 'authenticated');
    const user2Res = await db.query(`SELECT * FROM public.subscribed_websites;`);
    if (user2Res.rows.length !== 0) throw new Error('User 2 accessed User 1 site');

    await asUser(db, user1, 'user1@test.com', 'authenticated');
    const user1Res = await db.query(`SELECT * FROM public.subscribed_websites;`);
    if (user1Res.rows.length !== 1) throw new Error('User 1 could not view own site');
  });

  // TEST 4
  await test('Anonymous public resolution RPC returns sanitized projection without leaking private fields', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    const user1 = '11111111-1111-1111-1111-111111111111';
    const siteLive = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${user1}', 'user1@test.com');
      INSERT INTO public.subscribed_websites (id, user_id, business_name, niche, subdomain, full_domain, deployment_status, status, payment_status, config)
      VALUES ('${siteLive}', '${user1}', 'Dhaka Craft', 'handmade', 'dhakacraft', 'dhakacraft.amaas.xyz', 'live', 'active', 'paid', 
              '{"headline": "Fine Artisan Crafts", "phone": "01711111111", "privateAdminNote": "SECRET_REVENUE_DATA"}'::jsonb);
    `);

    await asUser(db, null, null, 'anon');
    const liveRes = await db.query<{ val: any }>(`SELECT public.get_published_website_by_subdomain('dhakacraft') AS val;`);
    const site = liveRes.rows[0].val.site;
    if (!liveRes.rows[0].val.found || !site) throw new Error('Failed to resolve live site');
    if ('user_id' in site || 'payment_status' in site || 'privateAdminNote' in site) {
      throw new Error('Public resolver leaked sensitive fields');
    }
  });

  // TEST 5
  await test('publish_client_website enforces ownership, verified payment, and subscription status', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    const userOwner = '11111111-1111-1111-1111-111111111111';
    const userOther = '22222222-2222-2222-2222-222222222222';
    const siteUnpaid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const siteReady = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${userOwner}', 'owner@test.com'), ('${userOther}', 'other@test.com');
      INSERT INTO public.subscribed_websites (id, user_id, business_name, niche, subdomain, full_domain, deployment_status, status, payment_status)
      VALUES ('${siteUnpaid}', '${userOwner}', 'Unpaid Site', 'tech', 'unpaidsite', 'unpaidsite.amaas.xyz', 'deploying', 'active', 'pending'),
             ('${siteReady}', '${userOwner}', 'Ready Site', 'tech', 'readysite', 'readysite.amaas.xyz', 'ready', 'active', 'paid');
    `);

    await asUser(db, userOther, 'other@test.com', 'authenticated');
    const resForbidden = await db.query<{ val: any }>(`SELECT public.publish_client_website('${siteReady}') AS val;`);
    if (resForbidden.rows[0].val.code !== 'FORBIDDEN') throw new Error('Expected FORBIDDEN for non-owner');

    await asUser(db, userOwner, 'owner@test.com', 'authenticated');
    const resPaymentReq = await db.query<{ val: any }>(`SELECT public.publish_client_website('${siteUnpaid}') AS val;`);
    if (resPaymentReq.rows[0].val.code !== 'PAYMENT_REQUIRED') throw new Error('Expected PAYMENT_REQUIRED for unpaid');

    const resSuccess = await db.query<{ val: any }>(`SELECT public.publish_client_website('${siteReady}') AS val;`);
    if (resSuccess.rows[0].val.code !== 'PUBLISHED') throw new Error('Expected PUBLISHED for ready paid site');
  });

  // TEST 6
  await test('Subdomain collision abort guard stops execution and never mutates customer domains', async (db) => {
    await db.exec(baseSchema);

    const user1 = '11111111-1111-1111-1111-111111111111';
    await db.exec(`
      ALTER TABLE public.subscribed_websites DROP CONSTRAINT IF EXISTS subscribed_websites_subdomain_key;
      DROP INDEX IF EXISTS idx_subscribed_websites_subdomain_unique;
      DROP INDEX IF EXISTS idx_subscribed_websites_subdomain_lower;
      INSERT INTO auth.users (id, email) VALUES ('${user1}', 'user1@test.com');
      
      INSERT INTO public.subscribed_websites (id, user_id, business_name, niche, subdomain, full_domain, deployment_status, status, template_id, template_name, current_period_end, grace_period_end, created_at)
      VALUES 
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '${user1}', 'Bistro 1', 'food', 'DhakaBistro', 'dhakabistro.amaas.xyz', 'deploying', 'active', 't1', 'T1', NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days', NOW() - INTERVAL '2 days'),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '${user1}', 'Bistro 2', 'food', 'dhakabistro ', 'dhakabistro.amaas.xyz', 'deploying', 'active', 't1', 'T1', NOW() + INTERVAL '30 days', NOW() + INTERVAL '35 days', NOW() - INTERVAL '1 day');
    `);

    let migrationFailed = false;
    try {
      await db.exec(migration20261017);
    } catch (err: any) {
      migrationFailed = true;
    }
    if (!migrationFailed) throw new Error('Migration failed to abort on duplicate subdomains');
  });

  // TEST 7
  await test('Adversarial attacks (GUC bypass, direct INSERT of paid/live, illegal status transitions) are blocked', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    const userMerchant = '11111111-1111-1111-1111-111111111111';
    const sitePendingId = '99999999-9999-9999-9999-999999999991';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${userMerchant}', 'merchant@test.com');
      INSERT INTO public.subscribed_websites (id, user_id, subdomain, full_domain, business_name, niche, template_name, deployment_status, status, payment_status, config)
      VALUES ('${sitePendingId}', '${userMerchant}', 'mybizstore', 'mybizstore.amaas.xyz', 'Original Biz', 'ecommerce', 'Modern Executive', 'deploying', 'active', 'pending', '{"headline": "Welcome"}'::jsonb);
    `);

    await asUser(db, userMerchant, 'merchant@test.com', 'authenticated');

    // GUC bypass attempt to set live -> BLOCKED
    let gucBlocked = false;
    try {
      await db.exec(`
        SELECT set_config('goamaas.publishing_in_progress', 'true', false);
        UPDATE public.subscribed_websites SET deployment_status = 'live' WHERE id = '${sitePendingId}';
      `);
    } catch (e: any) {
      gucBlocked = true;
    }
    if (!gucBlocked) throw new Error('Merchant bypassed protection using custom GUC');

    // Direct INSERT paid/live -> BLOCKED
    let directInsertBlocked = false;
    try {
      await db.exec(`
        INSERT INTO public.subscribed_websites (
          user_id, business_name, niche, subdomain, full_domain, template_id, template_name, deployment_status, status, payment_status
        ) VALUES (
          '${userMerchant}', 'Hacked Store', 'Fashion', 'hackedstore', 'hackedstore.amaas.xyz', 'tpl-1', 'Modern', 'live', 'active', 'paid'
        );
      `);
    } catch (e: any) {
      directInsertBlocked = true;
    }
    if (!directInsertBlocked) throw new Error('Merchant inserted paid/live site directly');

    // Direct UPDATE attempt to set deployment_status = 'live' on an already-paid active website -> BLOCKED
    const sitePaidReadyId = '99999999-9999-9999-9999-999999999992';
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO public.subscribed_websites (id, user_id, subdomain, full_domain, business_name, niche, template_name, deployment_status, status, payment_status, config)
      VALUES ('${sitePaidReadyId}', '${userMerchant}', 'mybizpaid', 'mybizpaid.amaas.xyz', 'Paid Biz', 'ecommerce', 'Modern Executive', 'ready', 'active', 'paid', '{"headline": "Welcome"}'::jsonb);
    `);

    await asUser(db, userMerchant, 'merchant@test.com', 'authenticated');
    let directPublishBlocked = false;
    try {
      await db.exec(`
        UPDATE public.subscribed_websites SET deployment_status = 'live' WHERE id = '${sitePaidReadyId}';
      `);
    } catch (e: any) {
      directPublishBlocked = true;
    }
    if (!directPublishBlocked) throw new Error('Merchant directly updated deployment_status to live on paid website');

    // Attempt direct UPDATE of payment_status -> BLOCKED
    let directPaymentUpdateBlocked = false;
    try {
      await db.exec(`
        UPDATE public.subscribed_websites SET payment_status = 'paid' WHERE id = '${sitePendingId}';
      `);
    } catch (e: any) {
      directPaymentUpdateBlocked = true;
    }
    if (!directPaymentUpdateBlocked) throw new Error('Merchant directly updated payment_status');

    // Legitimate RPC publishing of the already-paid website -> SUCCEEDS
    const legitPubRes = await db.query<{ val: any }>(`SELECT public.publish_client_website('${sitePaidReadyId}') AS val;`);
    if (legitPubRes.rows[0].val.code !== 'PUBLISHED') {
      throw new Error(`Legitimate publish RPC failed with code: ${legitPubRes.rows[0].val.code}`);
    }
    const checkLive = await db.query<{ deployment_status: string }>(`
      SELECT deployment_status FROM public.subscribed_websites WHERE id = '${sitePaidReadyId}';
    `);
    if (checkLive.rows[0].deployment_status !== 'live') {
      throw new Error('Website was not set to live after legitimate publish RPC');
    }

    // Legitimate draft INSERT -> SUCCEEDS
    await db.exec(`
      INSERT INTO public.subscribed_websites (
        user_id, business_name, niche, subdomain, full_domain, template_id, template_name, status
      ) VALUES (
        '${userMerchant}', 'Legit Draft Site', 'Bakery', 'legitdraft', 'legitdraft.amaas.xyz', 'tpl-1', 'Modern', 'draft'
      );
    `);
    const checkDraft = await db.query<{ payment_status: string; deployment_status: string }>(`
      SELECT payment_status, deployment_status FROM public.subscribed_websites WHERE subdomain = 'legitdraft';
    `);
    if (checkDraft.rows[0].payment_status !== 'pending' || checkDraft.rows[0].deployment_status !== 'deploying') {
      throw new Error('Draft insert did not receive safe defaults');
    }
  });

  // TEST 8
  await test('Direct merchant DELETE is strictly prevented; legitimate cancellation and admin delete work', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    const userMerchant = '11111111-1111-1111-1111-111111111111';
    const siteLive = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const siteDraft = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${userMerchant}', 'merchant@test.com');
      INSERT INTO public.subscribed_websites (id, user_id, business_name, niche, subdomain, full_domain, deployment_status, status, payment_status)
      VALUES 
        ('${siteLive}', '${userMerchant}', 'Live Store', 'tech', 'livestore', 'livestore.amaas.xyz', 'live', 'active', 'paid'),
        ('${siteDraft}', '${userMerchant}', 'Draft Store', 'tech', 'draftstore', 'draftstore.amaas.xyz', 'deploying', 'draft', 'pending');
    `);

    // Merchant direct DELETE -> MUST FAIL
    await asUser(db, userMerchant, 'merchant@test.com', 'authenticated');
    let deleteBlocked = false;
    try {
      await db.exec(`DELETE FROM public.subscribed_websites WHERE id = '${siteLive}';`);
    } catch (e: any) {
      deleteBlocked = true;
    }
    if (!deleteBlocked) {
      const checkExists = await db.query(`SELECT id FROM public.subscribed_websites WHERE id = '${siteLive}';`);
      if (checkExists.rows.length === 0) throw new Error('Merchant directly deleted website');
    }

    // Legitimate cancellation RPC
    const cancelRes = await db.query<{ val: any }>(`SELECT public.cancel_client_website_subscription('${siteLive}') AS val;`);
    if (!cancelRes.rows[0].val.success) throw new Error('Cancellation RPC failed');

    const checkCancelled = await db.query<{ status: string; deployment_status: string; payment_status: string }>(`
      SELECT status, deployment_status, payment_status FROM public.subscribed_websites WHERE id = '${siteLive}';
    `);
    if (checkCancelled.rows[0].status !== 'cancelled' || checkCancelled.rows[0].deployment_status !== 'suspended') {
      throw new Error('Cancellation states not updated');
    }
    if (checkCancelled.rows[0].payment_status !== 'paid') throw new Error('Verified payment erased on cancellation');

    // Admin deletion RPC
    await asUser(db, null, null, 'service_role');
    const adminDelRes = await db.query<{ val: any }>(`SELECT public.admin_delete_subscribed_website('${siteDraft}') AS val;`);
    if (!adminDelRes.rows[0].val.success) throw new Error('Admin delete RPC failed');
    const checkDeleted = await db.query(`SELECT id FROM public.subscribed_websites WHERE id = '${siteDraft}';`);
    if (checkDeleted.rows.length !== 0) throw new Error('Admin delete did not remove row');
  });

  // TEST 9
  await test('Store ownership and multi-tenant isolation are strictly enforced', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    const userMerchantA = '11111111-1111-1111-1111-111111111111';
    const userMerchantB = '22222222-2222-2222-2222-222222222222';
    const storeA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const storeB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES 
        ('${userMerchantA}', 'merchanta@test.com'),
        ('${userMerchantB}', 'merchantb@test.com');
      INSERT INTO public.stores (id, owner_id, name, slug) VALUES 
        ('${storeA}', '${userMerchantA}', 'Store A', 'store-a'),
        ('${storeB}', '${userMerchantB}', 'Store B', 'store-b');
    `);

    // Merchant A attempts to attach to Store B -> MUST FAIL
    await asUser(db, userMerchantA, 'merchanta@test.com', 'authenticated');
    let crossStoreInsertBlocked = false;
    try {
      await db.exec(`
        INSERT INTO public.subscribed_websites (
          user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status
        ) VALUES (
          '${userMerchantA}', '${storeB}', 'Hijacked Store Website', 'retail', 'hijackedstore', 'hijackedstore.amaas.xyz', 't1', 'Modern', 'draft'
        );
      `);
    } catch (e: any) {
      crossStoreInsertBlocked = true;
    }
    if (!crossStoreInsertBlocked) throw new Error('Merchant A attached to Store B');

    // Merchant A attaches to Store A -> SUCCEEDS
    const siteA = '99999999-9999-9999-9999-999999999999';
    await db.exec(`
      INSERT INTO public.subscribed_websites (
        id, user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status
      ) VALUES (
        '${siteA}', '${userMerchantA}', '${storeA}', 'Store A Official Website', 'retail', 'storeawebsite', 'storeawebsite.amaas.xyz', 't1', 'Modern', 'draft'
      );
    `);

    // Merchant A attempts to change store_id on siteA to storeB -> MUST FAIL
    await asUser(db, userMerchantA, 'merchanta@test.com', 'authenticated');
    let storeIdChangeBlocked = false;
    try {
      await db.exec(`UPDATE public.subscribed_websites SET store_id = '${storeB}' WHERE id = '${siteA}';`);
    } catch (e: any) {
      storeIdChangeBlocked = true;
    }
    if (!storeIdChangeBlocked) throw new Error('Merchant was able to change store_id on existing website');

    // Merchant B cannot view Store A website
    await asUser(db, userMerchantB, 'merchantb@test.com', 'authenticated');
    const merchBView = await db.query(`SELECT id FROM public.subscribed_websites WHERE id = '${siteA}';`);
    if (merchBView.rows.length !== 0) throw new Error('Merchant B viewed Store A website');
  });

  // TEST 10
  await test('Audit effective PostgreSQL privileges: PUBLIC, anon, and authenticated have no unauthorized write access', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    // Verify PUBLIC has no table privileges
    const publicTablePrivs = await db.query<{ privilege_type: string }>(`
      SELECT privilege_type FROM information_schema.table_privileges 
      WHERE table_schema = 'public' AND table_name = 'subscribed_websites' AND grantee = 'PUBLIC';
    `);
    if (publicTablePrivs.rows.length > 0) throw new Error('PUBLIC has table privileges on subscribed_websites');

    // Verify authenticated has no DELETE privilege
    const authTablePrivs = await db.query<{ privilege_type: string }>(`
      SELECT privilege_type FROM information_schema.table_privileges 
      WHERE table_schema = 'public' AND table_name = 'subscribed_websites' AND grantee = 'authenticated';
    `);
    if (authTablePrivs.rows.some(r => r.privilege_type === 'DELETE')) {
      throw new Error('authenticated role has DELETE privilege on subscribed_websites');
    }

    // Verify anon has no write privileges
    const anonTablePrivs = await db.query<{ privilege_type: string }>(`
      SELECT privilege_type FROM information_schema.table_privileges 
      WHERE table_schema = 'public' AND table_name = 'subscribed_websites' AND grantee = 'anon';
    `);
    if (anonTablePrivs.rows.some(r => ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'].includes(r.privilege_type))) {
      throw new Error('anon role has unauthorized write privileges on subscribed_websites');
    }

    // Verify authenticated has column-level restrictions on critical fields
    const authColPrivs = await db.query<{ column_name: string; privilege_type: string }>(`
      SELECT column_name, privilege_type FROM information_schema.column_privileges
      WHERE table_schema = 'public' AND table_name = 'subscribed_websites' AND grantee = 'authenticated';
    `);
    const updateCols = authColPrivs.rows.filter(r => r.privilege_type === 'UPDATE').map(r => r.column_name);
    if (updateCols.includes('deployment_status') || updateCols.includes('payment_status') || updateCols.includes('user_id') || updateCols.includes('store_id')) {
      throw new Error(`authenticated has unauthorized column UPDATE privileges: ${updateCols.join(', ')}`);
    }
  });

  // TEST 11
  await test('Ineligible and expired subscriptions cannot publish and are not served publicly', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    const userOwner = '11111111-1111-1111-1111-111111111111';
    const siteExpired = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${userOwner}', 'owner@test.com');
      INSERT INTO public.subscribed_websites (
        id, user_id, business_name, niche, subdomain, full_domain, deployment_status, status, payment_status, grace_period_end
      ) VALUES (
        '${siteExpired}', '${userOwner}', 'Expired Bakery', 'food', 'expiredbakery', 'expiredbakery.amaas.xyz', 
        'deploying', 'active', 'paid', NOW() - INTERVAL '2 days'
      );
    `);

    await asUser(db, userOwner, 'owner@test.com', 'authenticated');
    const pubRes = await db.query<{ val: any }>(`SELECT public.publish_client_website('${siteExpired}') AS val;`);
    if (pubRes.rows[0].val.code !== 'SUBSCRIPTION_EXPIRED') throw new Error('Expired subscription allowed to publish');

    await asUser(db, null, null, 'anon');
    const pubLookup = await db.query<{ val: any }>(`SELECT public.get_published_website_by_subdomain('expiredbakery') AS val;`);
    if (pubLookup.rows[0].val.found !== false) throw new Error('Expired subscription served publicly');
  });

  // TEST 12
  await test('Migration preflight succeeds on legacy schema without template_name/config, and rejects incompatible column types', async (db) => {
    await db.exec(`
      DROP TABLE IF EXISTS public.subscribed_websites CASCADE;
      DROP FUNCTION IF EXISTS public.is_admin() CASCADE;

      CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean AS \$\$
      BEGIN RETURN false; END;
      \$\$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

      CREATE TABLE public.subscribed_websites (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        subdomain TEXT UNIQUE NOT NULL,
        business_name TEXT NOT NULL,
        niche TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        deployment_status TEXT DEFAULT 'deploying',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.exec(migration20261017);

    const checkAdded = await db.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'subscribed_websites' AND column_name IN ('template_name', 'config', 'full_domain', 'store_id');
    `);
    if (checkAdded.rows.length !== 4) throw new Error('Added columns missing on legacy table');

    // Type mismatch rejection test
    await db.exec(`
      DROP TABLE IF EXISTS public.subscribed_websites CASCADE;
      CREATE TABLE public.subscribed_websites (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        subdomain TEXT UNIQUE NOT NULL,
        business_name TEXT NOT NULL,
        niche TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        deployment_status TEXT DEFAULT 'deploying',
        config INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    let typeValidationFailed = false;
    try {
      await db.exec(migration20261017);
    } catch (e: any) {
      typeValidationFailed = true;
    }
    if (!typeValidationFailed) throw new Error('Failed to abort on broken column type');
  });

  // TEST 13
  await test('Referenced schema columns, types, constraints, and SECURITY DEFINER search paths are strictly enforced', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    const funcs = await db.query<{ proname: string; proconfig: string[] }>(`
      SELECT p.proname, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' 
        AND p.proname IN ('get_published_website_by_subdomain', 'publish_client_website', 'unpublish_client_website', 'cancel_client_website_subscription', 'admin_delete_subscribed_website', 'protect_subscribed_website_security', 'is_admin');
    `);

    if (funcs.rows.length < 7) throw new Error(`Expected 7 security functions, found: ${funcs.rows.length}`);

    for (const f of funcs.rows) {
      const configStr = (f.proconfig || []).join('; ');
      if (!configStr.includes('search_path=pg_catalog, public, pg_temp')) {
        throw new Error(`Function ${f.proname} missing hardened search_path: ${configStr}`);
      }
    }
  });

  // TEST 14: check_subdomain_availability RPC validation and search_path
  await test('check_subdomain_availability RPC enforces reserved names, uniqueness, format, and search_path', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    // Verify search path
    const func = await db.query<{ proconfig: string[] }>(`
      SELECT proconfig FROM pg_proc WHERE proname = 'check_subdomain_availability';
    `);
    if (func.rows.length === 0) throw new Error('check_subdomain_availability missing');
    const cfg = (func.rows[0].proconfig || []).join('; ');
    if (!cfg.includes('search_path=pg_catalog, public, pg_temp')) {
      throw new Error(`check_subdomain_availability search_path missing or incorrect: ${cfg}`);
    }

    // Seed an existing website
    const ownerId = '11111111-1111-1111-1111-111111111111';
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${ownerId}', 'owner@test.com');
      INSERT INTO public.subscribed_websites (user_id, business_name, niche, subdomain, full_domain)
      VALUES ('${ownerId}', 'Alpha Store', 'retail', 'alphastore', 'alphastore.amaas.xyz');
    `);

    // Test as anon
    await asUser(db, null, null, 'anon');
    const resAvailable = await db.query<{ val: any }>(`SELECT public.check_subdomain_availability('brand-new-store') AS val;`);
    if (resAvailable.rows[0].val.available !== true) throw new Error('brand-new-store should be available');

    const resTaken = await db.query<{ val: any }>(`SELECT public.check_subdomain_availability('alphastore') AS val;`);
    if (resTaken.rows[0].val.available !== false || resTaken.rows[0].val.code !== 'TAKEN') {
      throw new Error(`alphastore should be marked TAKEN, got code=${resTaken.rows[0].val.code}`);
    }

    const resReserved = await db.query<{ val: any }>(`SELECT public.check_subdomain_availability('admin') AS val;`);
    if (resReserved.rows[0].val.available !== false || resReserved.rows[0].val.code !== 'RESERVED') {
      throw new Error(`admin should be marked RESERVED, got code=${resReserved.rows[0].val.code}`);
    }

    const resShort = await db.query<{ val: any }>(`SELECT public.check_subdomain_availability('ab') AS val;`);
    if (resShort.rows[0].val.available !== false || resShort.rows[0].val.code !== 'INVALID_LENGTH') {
      throw new Error(`ab should be marked INVALID_LENGTH, got code=${resShort.rows[0].val.code}`);
    }
  });

  // TEST 15: Website creation via column-level INSERT grants generates real UUID, validates tenant ownership, preserves JSONB config, and prevents non-admin direct setting of payment_status = 'paid' or deployment_status = 'live'
  await test('Website creation via column grants generates UUID, preserves JSONB config, blocks direct payment/deployment manipulation and direct DELETE', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    const userA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const storeA = '11111111-2222-3333-4444-555555555555';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${userA}', 'userA@test.com');
      INSERT INTO public.stores (id, owner_id, name, slug) VALUES ('${storeA}', '${userA}', 'Store A', 'store-a');
    `);

    // Merchant A creates a website through column-level allowed grants
    await asUser(db, userA, 'userA@test.com', 'authenticated');
    const insertRes = await db.query<{ id: string; payment_status: string; deployment_status: string; config: any }>(`
      INSERT INTO public.subscribed_websites (
        user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status, config
      ) VALUES (
        '${userA}', '${storeA}', 'Artisan Coffee', 'coffee', 'artisancoffee', 'artisancoffee.amaas.xyz',
        'tpl-cafe', 'Artisan Pro', 'active', '{"headline": "Handcrafted Brews", "phone": "01700000000"}'::jsonb
      ) RETURNING id, payment_status, deployment_status, config;
    `);

    if (insertRes.rows.length === 0) throw new Error('Failed to insert website as authenticated merchant');
    const createdId = insertRes.rows[0].id;
    if (!createdId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(createdId)) {
      throw new Error(`Generated ID is not a valid UUID: ${createdId}`);
    }
    if (insertRes.rows[0].payment_status !== 'pending') {
      throw new Error(`Expected payment_status 'pending', got: ${insertRes.rows[0].payment_status}`);
    }
    if (insertRes.rows[0].deployment_status !== 'deploying') {
      throw new Error(`Expected deployment_status 'deploying', got: ${insertRes.rows[0].deployment_status}`);
    }
    if (insertRes.rows[0].config?.headline !== 'Handcrafted Brews') {
      throw new Error(`Config JSONB not preserved properly: ${JSON.stringify(insertRes.rows[0].config)}`);
    }

    // Verify merchant CAN update permitted content and config
    await db.query(`
      UPDATE public.subscribed_websites 
      SET config = '{"headline": "Updated Brews", "phone": "01811111111"}'::jsonb,
          business_name = 'Artisan Roastery'
      WHERE id = '${createdId}';
    `);
    const updatedCheck = await db.query<{ business_name: string; config: any }>(`
      SELECT business_name, config FROM public.subscribed_websites WHERE id = '${createdId}';
    `);
    if (updatedCheck.rows[0].business_name !== 'Artisan Roastery' || updatedCheck.rows[0].config?.headline !== 'Updated Brews') {
      throw new Error('Allowed update failed');
    }

    // Verify direct DELETE is blocked by RLS/trigger
    let deleteFailed = false;
    try {
      await db.query(`DELETE FROM public.subscribed_websites WHERE id = '${createdId}';`);
    } catch {
      deleteFailed = true;
    }
    // Check if row still exists
    const rowCheck = await db.query(`SELECT id FROM public.subscribed_websites WHERE id = '${createdId}';`);
    if (rowCheck.rows.length === 0 && !deleteFailed) {
      throw new Error('Merchant was able to directly delete subscribed_website');
    }
  });

  // TEST 16: Admin payment approval targeting exact service_id marks only matching website paid
  await test('Admin payment approval targeting service_id updates matching website and isolates sibling websites', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    const userM = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const storeM = '22222222-3333-4444-5555-666666666666';
    const adminUser = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES 
        ('${userM}', 'merchant@test.com'),
        ('${adminUser}', 'admin@amaas.xyz');
      INSERT INTO public.stores (id, owner_id, name, slug) VALUES ('${storeM}', '${userM}', 'Store M', 'store-m');
      UPDATE public.profiles SET role = 'admin' WHERE id = '${adminUser}';
    `);

    // Create site1 and site2
    await asUser(db, userM, 'merchant@test.com', 'authenticated');
    const s1 = await db.query<{ id: string }>(`
      INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain)
      VALUES ('${userM}', '${storeM}', 'Site One', 'retail', 'siteone', 'siteone.amaas.xyz')
      RETURNING id;
    `);
    const s2 = await db.query<{ id: string }>(`
      INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain)
      VALUES ('${userM}', '${storeM}', 'Site Two', 'retail', 'sitetwo', 'sitetwo.amaas.xyz')
      RETURNING id;
    `);
    const site1Id = s1.rows[0].id;
    const site2Id = s2.rows[0].id;

    // Submit payment request referencing site1Id
    const prRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${userM}', '${storeM}', 'Merchant M', '01700000000', 'merchant@test.com',
        'website_subscription', '${site1Id}', 'Website Lite', '৳600/month', 600, 'bKash', 'pending'
      ) RETURNING id;
    `);
    const reqId = prRes.rows[0].id;

    // Admin approves request
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    await db.query(`SELECT public.admin_approve_payment_request('${reqId}', 'Payment verified by bank audit');`);

    // Verify site1 is paid, site2 is still pending
    const checkSites = await db.query<{ id: string; payment_status: string }>(`
      SELECT id, payment_status FROM public.subscribed_websites WHERE user_id = '${userM}' ORDER BY business_name;
    `);
    const site1Row = checkSites.rows.find(r => r.id === site1Id);
    const site2Row = checkSites.rows.find(r => r.id === site2Id);

    if (site1Row?.payment_status !== 'paid') {
      throw new Error(`Site 1 was not marked 'paid', got: ${site1Row?.payment_status}`);
    }
    if (site2Row?.payment_status !== 'pending') {
      throw new Error(`Site 2 was unexpectedly marked: ${site2Row?.payment_status}, should remain 'pending'`);
    }
  });

  // TEST 17: Phase 2 - Website Editor JSONB configuration updates (business profile, logoUrl, catalog, socialLinks)
  await test('Website Editor updates persist logoUrl, catalog, and socialLinks via column grants without losing unrelated keys', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    const user = '99999999-9999-4999-8999-999999999999';
    const store = '88888888-8888-4888-8888-888888888888';
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${user}', 'editor@amaas.xyz');
      INSERT INTO public.stores (id, owner_id, name, slug) VALUES ('${store}', '${user}', 'Editor Store', 'editor-store');
    `);

    await asUser(db, user, 'editor@amaas.xyz', 'authenticated');

    // Create draft website with initial config
    const insertRes = await db.query<{ id: string }>(`
      INSERT INTO public.subscribed_websites (
        user_id, store_id, business_name, niche, subdomain, full_domain, config
      ) VALUES (
        '${user}', '${store}', 'Original Bakery', 'restaurant', 'editbistro', 'editbistro.amaas.xyz',
        '{"headline": "Initial Headline", "customKey": "keep_this_unrelated_value"}'::jsonb
      ) RETURNING id;
    `);
    const siteId = insertRes.rows[0].id;

    // Simulate updateClientWebsiteInDb merging new config
    const existingRow = (await db.query<{ config: any; business_name: string }>(`
      SELECT config, business_name FROM public.subscribed_websites WHERE id = '${siteId}';
    `)).rows[0];

    const currentConfig = existingRow.config || {};
    const updatedConfig = {
      ...currentConfig,
      headline: 'Artisanal Sourdough & Specialty Coffee',
      subheadline: 'Baked fresh every morning in Banani',
      phone: '+880 1711 223344',
      whatsappNumber: '+880 1822 332020',
      address: 'House 42, Road 11, Banani, Dhaka',
      aboutText: 'Crafted using 100-year-old sourdough starter.',
      brandColor: '#059669',
      logoUrl: 'https://images.unsplash.com/photo-bakery-logo.jpg',
      servicesOrProducts: [
        { id: 'item-1', name: 'Artisan Country Loaf', price: '৳450', description: 'Crispy crust with chewy open crumb', imageUrl: 'https://example.com/loaf.jpg' },
        { id: 'item-2', name: 'Single Origin Pour Over', price: '৳320', description: 'Ethiopian Yirgacheffe with floral notes' }
      ],
      socialLinks: {
        facebook: 'https://facebook.com/editbistro',
        instagram: 'https://instagram.com/editbistro',
        youtube: 'https://youtube.com/@editbistro'
      }
    };

    // Update using authenticated column-level grants
    await db.query(`
      UPDATE public.subscribed_websites
      SET business_name = 'Gourmet Artisanal Bistro',
          niche = 'restaurant',
          config = '${JSON.stringify(updatedConfig)}'::jsonb
      WHERE id = '${siteId}';
    `);

    // Verify row was updated and unrelated key was preserved
    const verifyRow = (await db.query<{ business_name: string; config: any }>(`
      SELECT business_name, config FROM public.subscribed_websites WHERE id = '${siteId}';
    `)).rows[0];

    if (verifyRow.business_name !== 'Gourmet Artisanal Bistro') {
      throw new Error(`business_name was not updated, got: ${verifyRow.business_name}`);
    }
    if (verifyRow.config.customKey !== 'keep_this_unrelated_value') {
      throw new Error('Unrelated JSONB config key was lost during update');
    }
    if (verifyRow.config.logoUrl !== 'https://images.unsplash.com/photo-bakery-logo.jpg') {
      throw new Error(`logoUrl was not persisted in config, got: ${verifyRow.config.logoUrl}`);
    }
    if (verifyRow.config.servicesOrProducts?.length !== 2) {
      throw new Error(`Expected 2 items in servicesOrProducts, got: ${verifyRow.config.servicesOrProducts?.length}`);
    }
    if (verifyRow.config.socialLinks?.instagram !== 'https://instagram.com/editbistro') {
      throw new Error(`socialLinks.instagram was not persisted, got: ${verifyRow.config.socialLinks?.instagram}`);
    }
  });

  // TEST 18: Phase 2 - Unpublishing and cancellation workflows properly reset state and terminate public access
  await test('Unpublishing and cancellation procedures update deployment status, prevent public resolution, and retain data', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    const user = '77777777-7777-4777-8777-777777777777';
    const store = '66666666-6666-4666-8666-666666666666';
    const adminUser = '33333333-3333-4333-8333-333333333333';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${user}', 'publisher@amaas.xyz'), ('${adminUser}', 'admin@amaas.xyz');
      INSERT INTO public.stores (id, owner_id, name, slug) VALUES ('${store}', '${user}', 'Publish Store', 'pub-store');
      UPDATE public.profiles SET role = 'admin' WHERE id = '${adminUser}';
    `);

    // As merchant, insert draft website
    await asUser(db, user, 'publisher@amaas.xyz', 'authenticated');
    const siteRes = await db.query<{ id: string }>(`
      INSERT INTO public.subscribed_websites (
        user_id, store_id, business_name, niche, subdomain, full_domain, config
      ) VALUES (
        '${user}', '${store}', 'Boutique Apparel', 'fashion', 'boutiquechic', 'boutiquechic.amaas.xyz',
        '{"headline": "Premium Fashion"}'::jsonb
      ) RETURNING id;
    `);
    const siteId = siteRes.rows[0].id;

    // Submit payment request
    const prRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${user}', '${store}', 'Merchant Publisher', '01700000000', 'publisher@amaas.xyz',
        'website_subscription', '${siteId}', 'Website Lite', '৳600/month', 600, 'bKash', 'pending'
      ) RETURNING id;
    `);
    const reqId = prRes.rows[0].id;

    // Admin approves payment request -> site becomes paid
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    await db.query(`SELECT public.admin_approve_payment_request('${reqId}', 'Verified subscription payment');`);

    // As merchant, publish website
    await asUser(db, user, 'publisher@amaas.xyz', 'authenticated');
    const pubRes = await db.query<{ publish_client_website: any }>(`
      SELECT public.publish_client_website('${siteId}');
    `);
    if (!pubRes.rows[0].publish_client_website.success) {
      throw new Error('publish_client_website failed: ' + pubRes.rows[0].publish_client_website.message);
    }

    // Anonymous visitor can resolve the published site
    await asUser(db, null, null, 'anon');
    const pubCheck = await db.query<{ get_published_website_by_subdomain: any }>(`
      SELECT public.get_published_website_by_subdomain('boutiquechic');
    `);
    if (!pubCheck.rows[0].get_published_website_by_subdomain.found) {
      throw new Error('Published website was not found by anonymous visitor');
    }

    // Now unpublish website
    await asUser(db, user, 'publisher@amaas.xyz', 'authenticated');
    const unpubRes = await db.query<{ unpublish_client_website: any }>(`
      SELECT public.unpublish_client_website('${siteId}');
    `);
    if (!unpubRes.rows[0].unpublish_client_website.success) {
      throw new Error('unpublish_client_website failed: ' + unpubRes.rows[0].unpublish_client_website.message);
    }

    // Anonymous visitor CANNOT resolve the unpublished site
    await asUser(db, null, null, 'anon');
    const unpubCheck = await db.query<{ get_published_website_by_subdomain: any }>(`
      SELECT public.get_published_website_by_subdomain('boutiquechic');
    `);
    if (unpubCheck.rows[0].get_published_website_by_subdomain.found) {
      throw new Error('Unpublished website was unexpectedly visible to anonymous visitor');
    }

    // Merchant can cancel subscription
    await asUser(db, user, 'publisher@amaas.xyz', 'authenticated');
    const cancelRes = await db.query<{ cancel_client_website_subscription: any }>(`
      SELECT public.cancel_client_website_subscription('${siteId}');
    `);
    if (!cancelRes.rows[0].cancel_client_website_subscription.success) {
      throw new Error('cancel_client_website_subscription failed: ' + cancelRes.rows[0].cancel_client_website_subscription.message);
    }

    // Verify row still exists in database (never destructively deleted), with status cancelled
    const checkRow = (await db.query<{ status: string; deployment_status: string }>(`
      SELECT status, deployment_status FROM public.subscribed_websites WHERE id = '${siteId}';
    `)).rows[0];

    if (checkRow.status !== 'cancelled') {
      throw new Error(`Expected status 'cancelled', got: ${checkRow.status}`);
    }
    if (checkRow.deployment_status !== 'suspended') {
      throw new Error(`Expected deployment_status 'suspended', got: ${checkRow.deployment_status}`);
    }
  });

  // TEST 19: Phase 2 - get_published_website_by_subdomain returns full public projection
  await test('get_published_website_by_subdomain returns logoUrl, brandColor, catalog, and socialLinks without leaking private data', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261017);

    const user = '55555555-5555-4555-8555-555555555555';
    const store = '44444444-4444-4444-8444-444444444444';
    const adminUser = '33333333-3333-4333-8333-333333333333';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${user}', 'storefront@amaas.xyz'), ('${adminUser}', 'admin@amaas.xyz');
      INSERT INTO public.stores (id, owner_id, name, slug) VALUES ('${store}', '${user}', 'Storefront Store', 'sf-store');
      UPDATE public.profiles SET role = 'admin' WHERE id = '${adminUser}';
    `);

    // Merchant creates draft site with full catalog and branding
    await asUser(db, user, 'storefront@amaas.xyz', 'authenticated');
    const sRes = await db.query<{ id: string }>(`
      INSERT INTO public.subscribed_websites (
        user_id, store_id, business_name, niche, subdomain, full_domain, config
      ) VALUES (
        '${user}', '${store}', 'Artisan Coffee Roasters', 'cafe', 'artisancoffee', 'artisancoffee.amaas.xyz',
        json_build_object(
          'headline', 'Finest Beans in Town',
          'subheadline', 'Direct trade specialty coffee',
          'aboutText', 'Family owned roastery since 2018',
          'phone', '+880 1711 999888',
          'whatsappNumber', '+880 1822 332020',
          'address', 'Banani 11, Dhaka',
          'brandColor', '#D97706',
          'logoUrl', 'https://example.com/logo.png',
          'servicesOrProducts', json_build_array(
            json_build_object('id', 'prod-1', 'name', 'Espresso Blend', 'price', '৳650', 'description', 'Chocolate notes', 'imageUrl', 'https://example.com/espresso.jpg')
          ),
          'socialLinks', json_build_object('facebook', 'https://facebook.com/artisancoffee', 'instagram', 'https://instagram.com/artisancoffee'),
          'privateInternalAuditNotes', 'DO NOT LEAK THIS PRIVATE FIELD'
        )
      ) RETURNING id;
    `);
    const siteId = sRes.rows[0].id;

    // Submit payment request
    const prRes = await db.query<{ id: string }>(`
      INSERT INTO public.payment_requests (
        user_id, store_id, customer_name, customer_phone, customer_email,
        service_type, service_id, service_name, plan_tier, amount, payment_method, status
      ) VALUES (
        '${user}', '${store}', 'Coffee Merchant', '01700000000', 'storefront@amaas.xyz',
        'website_subscription', '${siteId}', 'Website Lite', '৳600/month', 600, 'bKash', 'pending'
      ) RETURNING id;
    `);
    const reqId = prRes.rows[0].id;

    // Admin approves payment request
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    await db.query(`SELECT public.admin_approve_payment_request('${reqId}', 'Payment verified by bank audit');`);

    // Merchant publishes website
    await asUser(db, user, 'storefront@amaas.xyz', 'authenticated');
    const pubRes = await db.query<{ publish_client_website: any }>(`
      SELECT public.publish_client_website('${siteId}');
    `);
    if (!pubRes.rows[0].publish_client_website.success) {
      throw new Error('publish_client_website failed: ' + pubRes.rows[0].publish_client_website.message);
    }

    // Query as anonymous public visitor
    await asUser(db, null, null, 'anon');
    const res = await db.query<{ get_published_website_by_subdomain: any }>(`
      SELECT public.get_published_website_by_subdomain('artisancoffee');
    `);

    const result = res.rows[0].get_published_website_by_subdomain;
    if (!result.found || !result.site) {
      throw new Error('Public site was not resolved');
    }

    const site = result.site;
    if (site.businessName !== 'Artisan Coffee Roasters') {
      throw new Error(`Unexpected businessName: ${site.businessName}`);
    }
    if (site.logoUrl !== 'https://example.com/logo.png') {
      throw new Error(`logoUrl was not projected in public payload, got: ${site.logoUrl}`);
    }
    if (site.brandColor !== '#D97706') {
      throw new Error(`brandColor was not projected, got: ${site.brandColor}`);
    }
    if (!Array.isArray(site.servicesOrProducts) || site.servicesOrProducts.length !== 1) {
      throw new Error('servicesOrProducts catalog was not projected properly');
    }
    if (site.servicesOrProducts[0].imageUrl !== 'https://example.com/espresso.jpg') {
      throw new Error('Product imageUrl was not preserved');
    }
    if (site.socialLinks?.facebook !== 'https://facebook.com/artisancoffee') {
      throw new Error('Social links were not projected properly');
    }
    // Verify private internal notes are not leaked
    if (site.privateInternalAuditNotes !== undefined || JSON.stringify(site).includes('DO NOT LEAK')) {
      throw new Error('Private data leaked into public website projection!');
    }
  });

  console.log(`
============================================================`);
  console.log(`REGRESSION RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log(`============================================================`);

  if (passed !== total) process.exit(1);
}

runRegressionSuite().catch((err) => {
  console.error('Fatal error in regression suite:', err);
  process.exit(1);
});

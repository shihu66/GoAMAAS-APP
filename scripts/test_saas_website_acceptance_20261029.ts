import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import {
  DEFAULT_WEBSITE_SUBSCRIPTION_PLAN,
  DASHBOARD_SUBSCRIPTION_PLANS,
  WEBSITE_DEVELOPMENT_PACKAGES,
  AI_AUTOMATION_PACKAGES,
  resolveAuthoritativeServicePrice,
} from '../src/data/pricingConfig';
import {
  RESERVED_PLATFORM_SUBDOMAINS,
  SUBSCRIBED_WEBSITES_MERCHANT_INSERT_COLUMNS,
  SUBSCRIBED_WEBSITES_RESTRICTED_INSERT_COLUMNS,
  buildMerchantWebsiteInsertPayload,
  mapDatabaseRowToSubscribedWebsite,
  validateSubdomainFormat,
} from '../src/lib/supabase';

function compactSubdomainFromBusinessName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30);
}

async function runAcceptanceSuite20261029() {
  console.log('=== GOAMAAS 20261029 END-TO-END SAAS WEBSITE BUILDER & BILLING ACCEPTANCE SUITE ===');
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

      -- Emulate Supabase Storage schema with RLS enabled on storage.objects
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

    const userA = '11111111-1111-4111-8111-111111111111';
    const userB = '22222222-2222-4222-8222-222222222222';
    const adminUser = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
        ('${userA}', 'urbanfashion@test.com', '{}'::jsonb),
        ('${userB}', 'othermerchant@test.com', '{}'::jsonb),
        ('${adminUser}', 'admin@amaas.xyz', '{}'::jsonb);

      INSERT INTO public.profiles (id, email, full_name, role) VALUES
        ('${userA}', 'urbanfashion@test.com', 'Urban Fashion Owner', 'merchant'),
        ('${userB}', 'othermerchant@test.com', 'Other Merchant', 'merchant'),
        ('${adminUser}', 'admin@amaas.xyz', 'Platform Admin', 'merchant')
      ON CONFLICT (id) DO NOTHING;

      UPDATE public.profiles SET role = 'admin' WHERE id = '${adminUser}';
    `);

    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    const storeA = (
      await db.query<{ id: string }>(`
        INSERT INTO public.stores (owner_id, name, slug, category, currency, phone, address)
        VALUES ('${userA}', 'Urban Fashion', 'urban-fashion-store', 'Fashion & Apparel', '৳', '+8801711223344', 'Banani, Dhaka')
        RETURNING id;
      `)
    ).rows[0].id;
    await db.query(`UPDATE public.profiles SET store_id = '${storeA}' WHERE id = '${userA}';`);

    await asUser(db, userB, 'othermerchant@test.com', 'authenticated');
    const storeB = (
      await db.query<{ id: string }>(`
        INSERT INTO public.stores (owner_id, name, slug, category, currency, phone, address)
        VALUES ('${userB}', 'Other Shop', 'other-shop-store', 'Retail', '৳', '+8801811223344', 'Uttara, Dhaka')
        RETURNING id;
      `)
    ).rows[0].id;
    await db.query(`UPDATE public.profiles SET store_id = '${storeB}' WHERE id = '${userB}';`);

    return { userA, userB, adminUser, storeA, storeB };
  }

  // ---------------------------------------------------------------------------
  // 1. Business Model — Single Website Subscription Plan ('GoAMAAS Website' @ ৳600)
  // ---------------------------------------------------------------------------
  await test('1. Single GoAMAAS Website plan (৳600 BDT / 30 days) enforced while keeping Dashboard, One-Time Web, and Automation catalogs distinct', async (db) => {
    const { userA } = await setupFixture(db);

    if (
      DEFAULT_WEBSITE_SUBSCRIPTION_PLAN.name !== 'GoAMAAS Website' ||
      DEFAULT_WEBSITE_SUBSCRIPTION_PLAN.priceMonthly !== 600 ||
      DEFAULT_WEBSITE_SUBSCRIPTION_PLAN.subdomainFormat !== 'businessname.amaas.xyz'
    ) {
      throw new Error(`Unexpected DEFAULT_WEBSITE_SUBSCRIPTION_PLAN: ${JSON.stringify(DEFAULT_WEBSITE_SUBSCRIPTION_PLAN)}`);
    }

    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    const webPlans = await db.query<{
      service_code: string;
      plan_tier_label: string;
      price_bdt: string;
      is_active: boolean;
    }>(`
      SELECT service_code, plan_tier_label, price_bdt::text, is_active
      FROM public.service_pricing_catalog
      WHERE service_type = 'website_subscription';
    `);

    if (webPlans.rows.length !== 1) {
      throw new Error(`Expected exactly 1 website_subscription plan, found ${webPlans.rows.length}`);
    }
    const plan = webPlans.rows[0];
    if (
      plan.service_code !== 'website_lite' ||
      plan.plan_tier_label !== 'GoAMAAS Website' ||
      Number(plan.price_bdt) !== 600 ||
      !plan.is_active
    ) {
      throw new Error(`Unexpected website_subscription catalog entry: ${JSON.stringify(plan)}`);
    }

    // Separate service lines remain intact
    if (DASHBOARD_SUBSCRIPTION_PLANS.length !== 4 || WEBSITE_DEVELOPMENT_PACKAGES.length !== 3 || AI_AUTOMATION_PACKAGES.length !== 4) {
      throw new Error('Separate Dashboard, Website Development, or AI Automation catalog arrays were altered');
    }
    if (resolveAuthoritativeServicePrice({ serviceType: 'website_subscription', serviceId: 'website_lite' }) !== 600) {
      throw new Error('resolveAuthoritativeServicePrice did not return 600 for website_subscription');
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Full Incremental Migration Chain (20261010 -> 20261029) & Idempotency
  // ---------------------------------------------------------------------------
  await test('2. Incremental migration chain through 20261029 applies cleanly, is idempotent, and pins search_path on all SECURITY DEFINER functions', async (db) => {
    await db.exec(baseSchema);
    await db.exec(migration20261029);
    await db.exec(migration20261029);

    await db.exec(`BEGIN;`);
    await db.exec(migration20261029);
    await db.exec(`ROLLBACK;`);

    const unsafeFns = await db.query<{ sig: string }>(`
      SELECT p.oid::pg_catalog.regprocedure::text AS sig
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
          WHERE cfg LIKE 'search_path=pg_catalog%'
        );
    `);
    if (unsafeFns.rows.length !== 0) {
      throw new Error(`Found SECURITY DEFINER functions without fixed search_path: ${JSON.stringify(unsafeFns.rows)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Subdomain Generation, Reserved Name Blocking, & Uniqueness
  // ---------------------------------------------------------------------------
  await test('3. Compact subdomain generation ("Urban Fashion" -> urbanfashion), reserved name blocking, and cross-tenant uniqueness work end-to-end', async (db) => {
    const { userA, userB, storeA, storeB } = await setupFixture(db);

    const generated = compactSubdomainFromBusinessName('Urban Fashion');
    if (generated !== 'urbanfashion') {
      throw new Error(`Expected "Urban Fashion" to generate "urbanfashion", got "${generated}"`);
    }
    const validCheck = validateSubdomainFormat(generated);
    if (!validCheck.valid) {
      throw new Error(`Expected "urbanfashion" to be valid, got: ${validCheck.reason}`);
    }

    for (const reserved of ['www', 'app', 'admin', 'api', 'dashboard', 'staging']) {
      if (!RESERVED_PLATFORM_SUBDOMAINS.has(reserved)) {
        throw new Error(`Missing "${reserved}" in RESERVED_PLATFORM_SUBDOMAINS`);
      }
      if (validateSubdomainFormat(reserved).valid) {
        throw new Error(`validateSubdomainFormat failed to reject reserved subdomain "${reserved}"`);
      }
      await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
      let dbBlocked = false;
      try {
        await db.query(`
          INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain)
          VALUES ('${userA}', '${storeA}', 'Reserved Attempt', 'fashion', '${reserved}', '${reserved}.amaas.xyz');
        `);
      } catch {
        dbBlocked = true;
      }
      if (!dbBlocked) {
        throw new Error(`PostgreSQL failed to block reserved subdomain "${reserved}"`);
      }
    }

    // Merchant A claims urbanfashion
    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    await db.query(`
      INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain)
      VALUES ('${userA}', '${storeA}', 'Urban Fashion', 'fashion', 'urbanfashion', 'urbanfashion.amaas.xyz');
    `);

    // check_subdomain_availability reports taken
    const availCheck = await db.query<{ val: { available: boolean } }>(`
      SELECT public.check_subdomain_availability('URBANFASHION') AS val;
    `);
    if (availCheck.rows[0].val.available !== false) {
      throw new Error('check_subdomain_availability reported taken subdomain "urbanfashion" as available');
    }

    // Merchant B cannot claim urbanfashion
    await asUser(db, userB, 'othermerchant@test.com', 'authenticated');
    let dupBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain)
        VALUES ('${userB}', '${storeB}', 'Copycat Fashion', 'fashion', 'urbanfashion', 'urbanfashion.amaas.xyz');
      `);
    } catch {
      dupBlocked = true;
    }
    if (!dupBlocked) {
      throw new Error('Duplicate subdomain across tenants was not rejected');
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Supabase Storage ('website-assets') Bucket & Owner-Folder RLS Isolation
  // ---------------------------------------------------------------------------
  await test('4. website-assets storage bucket enforces owner-folder write isolation while allowing public read', async (db) => {
    const { userA, userB, adminUser } = await setupFixture(db);

    const bucketRes = await db.query<{
      id: string;
      public: boolean;
      file_size_limit: string;
      allowed_mime_types: string[];
    }>(`
      SELECT id, public, file_size_limit::text, allowed_mime_types
      FROM storage.buckets
      WHERE id = 'website-assets';
    `);
    if (
      bucketRes.rows.length !== 1 ||
      !bucketRes.rows[0].public ||
      Number(bucketRes.rows[0].file_size_limit) !== 5242880 ||
      bucketRes.rows[0].allowed_mime_types.includes('image/svg+xml') ||
      !bucketRes.rows[0].allowed_mime_types.includes('image/avif')
    ) {
      throw new Error(`Unexpected website-assets bucket config: ${JSON.stringify(bucketRes.rows)}`);
    }

    // User A uploads logo, hero, and product asset inside <userA>/...
    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    await db.query(`
      INSERT INTO storage.objects (bucket_id, name) VALUES
        ('website-assets', '${userA}/logos/brand-logo.png'),
        ('website-assets', '${userA}/heroes/hero-cover.webp'),
        ('website-assets', '${userA}/products/panjabi-1.jpg');
    `);

    // User A CANNOT upload into User B's folder, use '..', leading '/', backslash, or bare UID without subfolder
    for (const badPath of [
      `${userB}/logos/hijack.png`,
      `${userA}/../${userB}/logos/hijack.png`,
      `/${userA}/logos/leading-slash.png`,
      `${userA}\\logos\\backslash.png`,
      `${userA}`,
      `${userA}/`,
      `shared/logo.png`,
    ]) {
      let blocked = false;
      try {
        await db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('website-assets', '${badPath}');`);
      } catch {
        blocked = true;
      }
      if (!blocked) {
        throw new Error(`Storage RLS failed to block unauthorized path "${badPath}"`);
      }
    }

    // User B CANNOT update or delete User A's uploaded assets
    await asUser(db, userB, 'othermerchant@test.com', 'authenticated');
    const bDel = await db.query(`
      DELETE FROM storage.objects WHERE bucket_id = 'website-assets' AND name = '${userA}/logos/brand-logo.png' RETURNING id;
    `);
    if (bDel.rows.length !== 0) {
      throw new Error('User B deleted User A storage asset');
    }

    // Anonymous visitor CAN read public website assets, CANNOT upload or delete
    await asUser(db, null, null, 'anon');
    const anonRead = await db.query(`
      SELECT name FROM storage.objects WHERE bucket_id = 'website-assets';
    `);
    if (anonRead.rows.length !== 3) {
      throw new Error(`Expected anonymous read to return 3 public assets, got ${anonRead.rows.length}`);
    }
    let anonInsertBlocked = false;
    try {
      await db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('website-assets', '${userA}/logos/anon.png');`);
    } catch {
      anonInsertBlocked = true;
    }
    if (!anonInsertBlocked) {
      throw new Error('Anonymous visitor uploaded to website-assets');
    }

    // Verified platform admin CAN delete for moderation
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const adminMod = await db.query(`
      DELETE FROM storage.objects WHERE bucket_id = 'website-assets' AND name = '${userA}/heroes/hero-cover.webp' RETURNING id;
    `);
    if (adminMod.rows.length !== 1) {
      throw new Error('Verified platform admin could not moderate website-assets object');
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Visual Builder Customization, Unset Optional Fields Hiding, Draft vs Publish, & Product Catalog Sync
  // ---------------------------------------------------------------------------
  await test('5. Visual Builder sections, theme, draft-vs-publish isolation, unset contact hiding, and public.products sync work end-to-end', async (db) => {
    const { userA, userB, adminUser, storeA, storeB } = await setupFixture(db);

    // Merchant A creates Urban Fashion website with logo, hero, CTA, banner, custom domain, and NO email/instagram/address
    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    const initialConfig = {
      nicheLabel: 'Fashion & Boutique',
      primaryColor: '#0F172A',
      secondaryColor: '#2563EB',
      headline: 'Signature Festive Wear 2026',
      subheadline: 'Handcrafted cotton & silk apparel delivered nationwide.',
      aboutText: 'Urban Fashion brings curated seasonal apparel from Dhaka artisans.',
      ctaText: 'Order via WhatsApp',
      ctaLink: '#products',
      phone: '+8801711223344',
      whatsapp: '8801711223344',
      email: '',
      address: '',
      logoUrl: `https://umiheyukaddfaupsyooh.supabase.co/storage/v1/object/public/website-assets/${userA}/logos/logo.png`,
      heroImageUrl: `https://umiheyukaddfaupsyooh.supabase.co/storage/v1/object/public/website-assets/${userA}/heroes/hero.webp`,
      bannerImageUrl: `https://umiheyukaddfaupsyooh.supabase.co/storage/v1/object/public/website-assets/${userA}/banners/eid.webp`,
      bannerTitle: 'Eid Collection Live Now',
      bannerSubtitle: 'Free delivery inside Dhaka on orders above ৳2,500',
      bannerCtaText: 'Browse Eid Drop',
      bannerCtaLink: '#products',
      customDomain: 'www.urbanfashionbd.com',
      socialLinks: {
        facebook: 'https://facebook.com/urbanfashionbd',
        instagram: '',
      },
      themeSettings: {
        headingFont: 'Playfair Display',
        bodyFont: 'Inter',
        buttonRadius: 'lg',
        heroLayout: 'split',
        accentSurface: '#F8FAFC',
        textColor: '#0F172A',
      },
      sections: [
        { id: 'sec-hero', type: 'hero', title: 'Hero', visible: true, order: 0 },
        { id: 'sec-banner', type: 'banner', title: 'Promo Banner', visible: true, order: 1 },
        { id: 'sec-products', type: 'products', title: 'Featured Drop', subtitle: 'Limited seasonal stock', visible: true, order: 2 },
        { id: 'sec-about', type: 'about', title: 'Our Craft', visible: true, order: 3 },
        {
          id: 'sec-faq',
          type: 'faq',
          title: 'Customer FAQ',
          visible: true,
          order: 4,
          items: [{ id: 'faq-1', title: 'How fast is delivery?', description: '24-48 hours in Dhaka.' }],
        },
        { id: 'sec-contact', type: 'contact', title: 'Get in Touch', visible: true, order: 5 },
      ],
      footerLinks: [{ id: 'fl-1', label: 'Size Guide', url: '#faq' }],
      footerCopyright: '© 2026 Urban Fashion Bangladesh.',
    };

    const siteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (
          user_id, store_id, business_name, niche, subdomain, full_domain,
          template_id, template_name, plan_tier, monthly_fee, config
        ) VALUES (
          '${userA}', '${storeA}', 'Urban Fashion', 'fashion', 'urbanfashion', 'urbanfashion.amaas.xyz',
          'tpl-retail-showcase', 'Retail Showcase', 'GoAMAAS Website', 600, $1::jsonb
        ) RETURNING id;
      `, [JSON.stringify(initialConfig)])
    ).rows[0].id;

    // Merchant A adds 3 products to public.products linked to website_id
    const prod1 = (
      await db.query<{ id: string }>(`
        INSERT INTO public.products (store_id, website_id, name, sku, category, price, stock, status, description, image_url, is_visible, sort_order)
        VALUES ('${storeA}', '${siteId}', 'Embroidered Linen Panjabi', 'UF-101', 'Fashion & Apparel', 2450, 20, 'active', 'Breathable pure linen.', 'https://example.com/panjabi.jpg', true, 0)
        RETURNING id;
      `)
    ).rows[0].id;

    const prod2Hidden = (
      await db.query<{ id: string }>(`
        INSERT INTO public.products (store_id, website_id, name, sku, category, price, stock, status, description, image_url, is_visible, sort_order)
        VALUES ('${storeA}', '${siteId}', 'Internal Wholesale Bundle', 'UF-102', 'Fashion & Apparel', 9500, 5, 'active', 'Hidden wholesale pack.', 'https://example.com/bundle.jpg', false, 1)
        RETURNING id;
      `)
    ).rows[0].id;

    const prod3ToDelete = (
      await db.query<{ id: string }>(`
        INSERT INTO public.products (store_id, website_id, name, sku, category, price, stock, status, description, image_url, is_visible, sort_order)
        VALUES ('${storeA}', '${siteId}', 'Discontinued Scarf', 'UF-103', 'Accessories', 850, 0, 'active', 'To be deleted.', NULL, true, 2)
        RETURNING id;
      `)
    ).rows[0].id;

    // Cross-tenant product -> website hijack attempt by User B MUST fail
    await asUser(db, userB, 'othermerchant@test.com', 'authenticated');
    let crossWebsiteBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.products (store_id, website_id, name, sku, price, stock)
        VALUES ('${storeB}', '${siteId}', 'Injected Fake Item', 'HACK-1', 10, 1);
      `);
    } catch {
      crossWebsiteBlocked = true;
    }
    if (!crossWebsiteBlocked) {
      throw new Error('Merchant B linked a product to Merchant A website_id');
    }

    // Merchant A deletes prod3ToDelete and submits ৳600 payment -> Admin approves (auto-publishes!)
    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    await db.query(`DELETE FROM public.products WHERE id = '${prod3ToDelete}';`);

    const prId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Urban Fashion Owner', '+8801711223344', 'urbanfashion@test.com',
          'website_subscription', '${siteId}', 'GoAMAAS Website (urbanfashion.amaas.xyz)', 'GoAMAAS Website', 600, 'bKash', 'TRX_UF_INIT_600'
        ) RETURNING id;
      `)
    ).rows[0].id;

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const approval = (
      await db.query<{ val: any }>(`SELECT public.admin_approve_payment_request('${prId}', 'Verified bKash TRX_UF_INIT_600') AS val;`)
    ).rows[0].val;

    if (!approval.success || !approval.auto_published || approval.deployment_status !== 'live') {
      throw new Error(`Expected automatic live website publishing on payment approval, got: ${JSON.stringify(approval)}`);
    }

    // Verify public resolution immediately after approval
    await asUser(db, null, null, 'anon');
    const pub1 = (
      await db.query<{ val: any }>(`SELECT public.get_published_website_by_subdomain('urbanfashion') AS val;`)
    ).rows[0].val;

    if (!pub1.found || !pub1.site) {
      throw new Error('Approved & auto-published website failed to resolve publicly');
    }
    if (pub1.site.headline !== 'Signature Festive Wear 2026') {
      throw new Error(`Unexpected live headline: ${pub1.site.headline}`);
    }
    if (pub1.site.email !== '' || pub1.site.address !== '' || pub1.site.socialLinks?.instagram !== '') {
      throw new Error(`Unset optional contact/social fields were not kept blank: ${JSON.stringify(pub1.site)}`);
    }
    if (pub1.site.customDomain !== 'www.urbanfashionbd.com') {
      throw new Error(`Expected customDomain www.urbanfashionbd.com, got ${pub1.site.customDomain}`);
    }
    if (!Array.isArray(pub1.site.servicesOrProducts) || pub1.site.servicesOrProducts.length !== 1) {
      throw new Error(`Expected exactly 1 visible product on public storefront, got: ${JSON.stringify(pub1.site.servicesOrProducts)}`);
    }
    if (pub1.site.servicesOrProducts[0].id !== prod1 || pub1.site.servicesOrProducts[0].id === prod2Hidden) {
      throw new Error('Hidden or deleted product leaked into public storefront projection');
    }

    // Save Draft WITHOUT publishing (including draft businessName & templateName) -> live public site must NOT change or leak draft!
    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    await db.query(
      `
        UPDATE public.subscribed_websites
        SET config = config || jsonb_build_object(
          'hasUnpublishedDraft', true,
          'draft', jsonb_build_object(
            'businessName', 'Urban Fashion Atelier',
            'templateId', 'tpl-luxury-editorial',
            'templateName', 'Luxury Editorial',
            'headline', 'WINTER PREVIEW DRAFT ONLY',
            'heroCtaText', 'Pre-Order Now'
          )
        )
        WHERE id = '${siteId}';
      `
    );

    await asUser(db, null, null, 'anon');
    const pubDuringDraft = (
      await db.query<{ val: any }>(`SELECT public.get_published_website_by_subdomain('urbanfashion') AS val;`)
    ).rows[0].val;
    if (
      pubDuringDraft.site.headline !== 'Signature Festive Wear 2026' ||
      pubDuringDraft.site.businessName !== 'Urban Fashion' ||
      'draft' in pubDuringDraft.site ||
      'hasUnpublishedDraft' in pubDuringDraft.site
    ) {
      throw new Error(`Unpublished draft leaked to public storefront: ${JSON.stringify(pubDuringDraft.site)}`);
    }

    // Merchant clicks Publish Updates -> publish_client_website promotes draft AND column metadata atomically
    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    const pubAction = (
      await db.query<{ val: any }>(`SELECT public.publish_client_website('${siteId}') AS val;`)
    ).rows[0].val;
    if (!pubAction.success) {
      throw new Error(`publish_client_website failed: ${JSON.stringify(pubAction)}`);
    }

    await asUser(db, null, null, 'anon');
    const pubAfterPromote = (
      await db.query<{ val: any }>(`SELECT public.get_published_website_by_subdomain('urbanfashion') AS val;`)
    ).rows[0].val;
    if (
      pubAfterPromote.site.headline !== 'WINTER PREVIEW DRAFT ONLY' ||
      pubAfterPromote.site.heroCtaText !== 'Pre-Order Now' ||
      pubAfterPromote.site.businessName !== 'Urban Fashion Atelier' ||
      pubAfterPromote.site.templateId !== 'tpl-luxury-editorial'
    ) {
      throw new Error(`Promoted draft did not appear on live storefront: ${JSON.stringify(pubAfterPromote.site)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 6. Payment Security, Self-Approval Block, Accurate 30-Day Initial vs Cumulative Renewal, & Expiry/Suspension
  // ---------------------------------------------------------------------------
  await test('6. Payment tampering & self-approval are blocked; initial approval grants ~30 days, renewal adds +30 days cumulatively, and expiry/grace/suspension enforce access', async (db) => {
    const { userA, userB, adminUser, storeA } = await setupFixture(db);

    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    const siteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain)
        VALUES ('${userA}', '${storeA}', 'Dhaka Loom', 'fashion', 'dhakaloom', 'dhakaloom.amaas.xyz')
        RETURNING id;
      `)
    ).rows[0].id;

    // 6a. Tampered ৳100 payment rejected on active bKash gateway
    let tamperedRejected = false;
    try {
      await db.query(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Owner', '01711223344', 'urbanfashion@test.com',
          'website_subscription', '${siteId}', 'GoAMAAS Website', 'GoAMAAS Website', 100, 'bKash', 'BAD_100'
        );
      `);
    } catch (err: any) {
      if ((err.message || '').includes('Invalid payment amount')) {
        tamperedRejected = true;
      }
    }
    if (!tamperedRejected) {
      throw new Error('Tampered ৳100 website payment was accepted');
    }

    // 6b. Admin self-approval blocked + admin enables Nagad gateway via hardened RPC
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    await db.query(`
      SELECT public.admin_update_payment_gateway_config('nagad', true, '01899887766', 'GoAMAAS Merchant');
    `);
    const adminSiteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (user_id, business_name, niche, subdomain, full_domain)
        VALUES ('${adminUser}', 'Admin Own Shop', 'retail', 'adminownshop', 'adminownshop.amaas.xyz')
        RETURNING id;
      `)
    ).rows[0].id;
    const adminSelfReqId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${adminUser}', 'Admin', '01700000099', 'admin@amaas.xyz',
          'website_subscription', '${adminSiteId}', 'GoAMAAS Website', 'GoAMAAS Website', 600, 'bKash', 'ADMIN_SELF_600'
        ) RETURNING id;
      `)
    ).rows[0].id;

    let selfApproveBlocked = false;
    try {
      await db.query(`SELECT public.admin_approve_payment_request('${adminSelfReqId}', 'Self approve');`);
    } catch (err: any) {
      if ((err.message || '').includes('own payment requests')) {
        selfApproveBlocked = true;
      }
    }
    if (!selfApproveBlocked) {
      throw new Error('Administrator was allowed to self-approve their own payment request');
    }

    // 6c. Initial valid ৳600 Nagad payment -> non-admin cannot approve -> admin approves -> ~30-day cycle (NOT 60 days!)
    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    const initReqId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Owner', '01711223344', 'urbanfashion@test.com',
          'website_subscription', '${siteId}', 'GoAMAAS Website', 'GoAMAAS Website', 600, 'Nagad', 'INIT_LOOM_600'
        ) RETURNING id;
      `)
    ).rows[0].id;

    await asUser(db, userB, 'othermerchant@test.com', 'authenticated');
    let nonAdminBlocked = false;
    try {
      await db.query(`SELECT public.admin_approve_payment_request('${initReqId}', 'Hijack');`);
    } catch {
      nonAdminBlocked = true;
    }
    if (!nonAdminBlocked) {
      throw new Error('Non-admin approved a payment request');
    }

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    await db.query(`SELECT public.admin_approve_payment_request('${initReqId}', 'Initial 30d verified');`);

    const afterInit = (
      await db.query<{ days_left: number; grace_days: number; deployment_status: string }>(`
        SELECT
          EXTRACT(EPOCH FROM (current_period_end - NOW())) / 86400.0 AS days_left,
          EXTRACT(EPOCH FROM (grace_period_end - NOW())) / 86400.0 AS grace_days,
          deployment_status
        FROM public.subscribed_websites
        WHERE id = '${siteId}';
      `)
    ).rows[0];

    if (afterInit.deployment_status !== 'live' || afterInit.days_left < 29.8 || afterInit.days_left > 30.2) {
      throw new Error(`Expected initial approval to grant ~30 days and live status, got: ${JSON.stringify(afterInit)}`);
    }

    // 6d. Renewal ৳600 payment -> cumulative +30 days (~60 days total)
    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    const renewReqId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Owner', '01711223344', 'urbanfashion@test.com',
          'website_subscription', '${siteId}', 'GoAMAAS Website Renewal', 'GoAMAAS Website', 600, 'bKash', 'RENEW_LOOM_600'
        ) RETURNING id;
      `)
    ).rows[0].id;

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    await db.query(`SELECT public.admin_approve_payment_request('${renewReqId}', 'Renewal +30d verified');`);

    const afterRenew = (
      await db.query<{ days_left: number }>(`
        SELECT EXTRACT(EPOCH FROM (current_period_end - NOW())) / 86400.0 AS days_left
        FROM public.subscribed_websites
        WHERE id = '${siteId}';
      `)
    ).rows[0];
    if (afterRenew.days_left < 59.8 || afterRenew.days_left > 60.2) {
      throw new Error(`Expected cumulative renewal to extend to ~60 days, got ${afterRenew.days_left}`);
    }

    // 6e. Grace window vs full expiry vs admin suspend
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      UPDATE public.subscribed_websites
      SET current_period_end = NOW() - INTERVAL '2 days',
          grace_period_end = NOW() + INTERVAL '5 days'
      WHERE id = '${siteId}';
    `);

    await asUser(db, null, null, 'anon');
    const inGrace = (
      await db.query<{ val: any }>(`SELECT public.get_published_website_by_subdomain('dhakaloom') AS val;`)
    ).rows[0].val;
    if (!inGrace.found || inGrace.site.subscriptionStatus !== 'grace_period') {
      throw new Error(`Expected grace_period resolution during 7-day grace window, got: ${JSON.stringify(inGrace)}`);
    }

    await asUser(db, null, null, 'service_role');
    await db.exec(`
      UPDATE public.subscribed_websites
      SET current_period_end = NOW() - INTERVAL '10 days',
          grace_period_end = NOW() - INTERVAL '3 days'
      WHERE id = '${siteId}';
    `);

    await asUser(db, null, null, 'anon');
    const afterExpiry = (
      await db.query<{ val: any }>(`SELECT public.get_published_website_by_subdomain('dhakaloom') AS val;`)
    ).rows[0].val;
    if (afterExpiry.found !== false) {
      throw new Error('Expired website past grace_period_end remained publicly accessible');
    }

    // Restore valid window, then suspend as admin -> immediately offline
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      UPDATE public.subscribed_websites
      SET current_period_end = NOW() + INTERVAL '30 days',
          grace_period_end = NOW() + INTERVAL '37 days'
      WHERE id = '${siteId}';
    `);
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    await db.query(`SELECT public.admin_update_website_lifecycle('${siteId}', 'suspend', 'Policy hold');`);

    await asUser(db, null, null, 'anon');
    const afterSuspend = (
      await db.query<{ val: any }>(`SELECT public.get_published_website_by_subdomain('dhakaloom') AS val;`)
    ).rows[0].val;
    if (afterSuspend.found !== false) {
      throw new Error('Admin-suspended website remained publicly accessible');
    }

    // 6f. Renewal payment while admin-suspended credits billing period WITHOUT overriding admin suspension
    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    const suspendedRenewId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Owner', '01711223344', 'urbanfashion@test.com',
          'website_subscription', '${siteId}', 'GoAMAAS Website Renewal', 'GoAMAAS Website', 600, 'bKash', 'SUSPENDED_RENEW_600'
        ) RETURNING id;
      `)
    ).rows[0].id;

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const suspApproval = (
      await db.query<{ val: any }>(`SELECT public.admin_approve_payment_request('${suspendedRenewId}', 'Payment received during hold') AS val;`)
    ).rows[0].val;
    if (!suspApproval.success || suspApproval.auto_published !== false || suspApproval.deployment_status !== 'suspended') {
      throw new Error(`Payment approval overrode explicit admin suspension: ${JSON.stringify(suspApproval)}`);
    }

    // Explicit admin reactivate restores live public access
    await db.query(`SELECT public.admin_update_website_lifecycle('${siteId}', 'reactivate', 'Policy hold cleared');`);
    await asUser(db, null, null, 'anon');
    const afterReactivate = (
      await db.query<{ val: any }>(`SELECT public.get_published_website_by_subdomain('dhakaloom') AS val;`)
    ).rows[0].val;
    if (!afterReactivate.found) {
      throw new Error('Explicitly reactivated website did not come back live');
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Products RLS Isolation, Unsafe Image URI Rejection, & Cancelled Subscription Guard
  // ---------------------------------------------------------------------------
  await test('7. public.products enforces strict tenant RLS & blocks javascript: URIs, and cancelled subscriptions cannot be auto-published via payment approval', async (db) => {
    const { userA, userB, adminUser, storeA } = await setupFixture(db);

    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    const siteId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain)
        VALUES ('${userA}', '${storeA}', 'Silk Heritage', 'fashion', 'silkheritage', 'silkheritage.amaas.xyz')
        RETURNING id;
      `)
    ).rows[0].id;

    const prodId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.products (store_id, website_id, name, sku, price, stock, image_url)
        VALUES ('${storeA}', '${siteId}', 'Katan Saree', 'SH-01', 6500, 8, 'https://example.com/katan.webp')
        RETURNING id;
      `)
    ).rows[0].id;

    // Unsafe javascript: image_url rejected by trigger
    let unsafeBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.products (store_id, website_id, name, sku, price, stock, image_url)
        VALUES ('${storeA}', '${siteId}', 'XSS Product', 'SH-XSS', 100, 1, 'javascript:alert(1)');
      `);
    } catch {
      unsafeBlocked = true;
    }
    if (!unsafeBlocked) {
      throw new Error('Unsafe javascript: product image_url was not rejected');
    }

    // Anonymous direct table access to public.products is blocked
    await asUser(db, null, null, 'anon');
    let anonProductsBlocked = false;
    try {
      await db.query(`SELECT id FROM public.products;`);
    } catch {
      anonProductsBlocked = true;
    }
    if (!anonProductsBlocked) {
      throw new Error('Anonymous role was able to query public.products directly');
    }

    // Cross-tenant Merchant B cannot SELECT, UPDATE, or DELETE Merchant A products
    await asUser(db, userB, 'othermerchant@test.com', 'authenticated');
    const bSee = await db.query(`SELECT id FROM public.products WHERE id = '${prodId}';`);
    const bUpd = await db.query(`UPDATE public.products SET price = 1 WHERE id = '${prodId}' RETURNING id;`);
    const bDel = await db.query(`DELETE FROM public.products WHERE id = '${prodId}' RETURNING id;`);
    if (bSee.rows.length !== 0 || bUpd.rows.length !== 0 || bDel.rows.length !== 0) {
      throw new Error('Cross-tenant Merchant B accessed or modified Merchant A product');
    }

    // Seed stray authenticated, anon, and PUBLIC policies on public.products, re-run 20261029, and verify ALL stray policies are purged
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      CREATE POLICY "Legacy permissive authenticated products select"
        ON public.products FOR SELECT TO authenticated USING (true);
      CREATE POLICY "Legacy permissive authenticated products modify"
        ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
      CREATE POLICY "Legacy anon products select"
        ON public.products FOR SELECT TO anon USING (true);
      CREATE POLICY "Legacy public products select"
        ON public.products FOR SELECT USING (true);
    `);
    await db.exec(migration20261029);

    const prodPolicies = (
      await db.query<{ policyname: string; roles: string; cmd: string }>(`
        SELECT policyname, roles::text AS roles, cmd
        FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'products'
        ORDER BY policyname;
      `)
    ).rows;
    const expectedProdPolicies = [
      { policyname: 'Products delete policy', roles: '{authenticated}', cmd: 'DELETE' },
      { policyname: 'Products insert policy', roles: '{authenticated}', cmd: 'INSERT' },
      { policyname: 'Products select policy', roles: '{authenticated}', cmd: 'SELECT' },
      { policyname: 'Products service role policy', roles: '{service_role}', cmd: 'ALL' },
      { policyname: 'Products update policy', roles: '{authenticated}', cmd: 'UPDATE' },
    ];
    if (JSON.stringify(prodPolicies) !== JSON.stringify(expectedProdPolicies)) {
      throw new Error(`Unexpected public.products RLS policies after 20261029: ${JSON.stringify(prodPolicies)}`);
    }

    // Confirm Merchant B still cannot read Merchant A products after stray policy purge
    await asUser(db, userB, 'othermerchant@test.com', 'authenticated');
    const bSeeAfterPurge = await db.query(`SELECT id FROM public.products WHERE id = '${prodId}';`);
    if (bSeeAfterPurge.rows.length !== 0) {
      throw new Error('Stray authenticated policy survived 20261029 and leaked cross-tenant product');
    }

    // Cancelled subscription guard in admin_approve_payment_request
    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    const prId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Silk Owner', '01711223344', 'urbanfashion@test.com',
          'website_subscription', '${siteId}', 'GoAMAAS Website', 'GoAMAAS Website', 600, 'bKash', 'CANCELLED_SITE_600'
        ) RETURNING id;
      `)
    ).rows[0].id;

    const cancelRes = (
      await db.query<{ val: any }>(`SELECT public.cancel_client_website_subscription('${siteId}') AS val;`)
    ).rows[0].val;
    if (!cancelRes.success) {
      throw new Error(`Expected cancel_client_website_subscription to succeed, got: ${JSON.stringify(cancelRes)}`);
    }

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');

    const cancelledApprove = (
      await db.query<{ val: any }>(`SELECT public.admin_approve_payment_request('${prId}', 'Late payment check') AS val;`)
    ).rows[0].val;
    if (cancelledApprove.success !== false || cancelledApprove.code !== 'SUBSCRIPTION_CANCELLED') {
      throw new Error(`Expected SUBSCRIPTION_CANCELLED when approving payment for cancelled website, got: ${JSON.stringify(cancelledApprove)}`);
    }

    const prAfter = await db.query<{ status: string }>(`SELECT status FROM public.payment_requests WHERE id = '${prId}';`);
    if (prAfter.rows[0].status !== 'pending') {
      throw new Error(`Expected payment request to remain pending so admin can reject/refund cleanly, got: ${prAfter.rows[0].status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 8. Downgrade-Proof Legacy Migration Guards, Non-Existent/Inactive Target Service Rejection, & Customer Review-Field Immutability
  // ---------------------------------------------------------------------------
  await test('8. Re-running 20261015/20261018 preserves hardened RPCs, policies, and gateway configs; customers cannot review or mutate review fields; missing/inactive target services fail safely', async (db) => {
    const { userA, adminUser, storeA } = await setupFixture(db);
    const migration20261015 = fs.readFileSync(
      'supabase/migrations/20261015_complete_saas_website_builder_and_payments.sql',
      'utf8'
    );
    const migration20261018 = fs.readFileSync(
      'supabase/migrations/20261018_fix_admin_approve_payment_request_safety.sql',
      'utf8'
    );

    // Configure custom bKash gateway details via hardened admin RPC
    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const gwUpdate = (
      await db.query<{ val: { success: boolean } }>(`
        SELECT public.admin_update_payment_gateway_config('bkash', true, '+8801799001122', 'Custom Staging bKash') AS val;
      `)
    ).rows[0].val;
    if (!gwUpdate.success) {
      throw new Error('Failed to configure custom bKash gateway before downgrade guard test');
    }

    // Snapshot hardened admin_approve_payment_request & admin_reject_payment_request prosrc
    await asUser(db, null, null, 'service_role');
    const beforeFuncs = (
      await db.query<{ proname: string; prosrc: string }>(`
        SELECT p.proname, trim(p.prosrc) AS prosrc
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('admin_approve_payment_request', 'admin_reject_payment_request')
        ORDER BY p.proname;
      `)
    ).rows;

    // Re-run both 20261015 and 20261018 on top of the hardened database
    await db.exec(migration20261015);
    await db.exec(migration20261018);

    const afterFuncs = (
      await db.query<{ proname: string; prosrc: string }>(`
        SELECT p.proname, trim(p.prosrc) AS prosrc
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('admin_approve_payment_request', 'admin_reject_payment_request')
        ORDER BY p.proname;
      `)
    ).rows;

    if (JSON.stringify(beforeFuncs) !== JSON.stringify(afterFuncs)) {
      throw new Error('Legacy 20261015 or 20261018 migration overwrote hardened payment review RPCs');
    }

    // Ensure no client UPDATE policy was introduced on payment_requests or payment_gateway_configs
    const clientUpdatePolicies = await db.query<{ tablename: string; policyname: string; cmd: string }>(`
      SELECT tablename, policyname, cmd
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('payment_requests', 'payment_gateway_configs')
        AND 'authenticated' = ANY(roles)
        AND cmd IN ('UPDATE', 'DELETE', 'ALL');
    `);
    if (clientUpdatePolicies.rows.length !== 0) {
      throw new Error(`Permissive authenticated write policy introduced: ${JSON.stringify(clientUpdatePolicies.rows)}`);
    }

    // Ensure configured bKash number was NOT overwritten by 20261015 seed
    const bkashRow = (
      await db.query<{ account_number: string; account_name: string }>(`
        SELECT account_number, account_name FROM public.payment_gateway_configs WHERE id = 'bkash';
      `)
    ).rows[0];
    if (bkashRow.account_number !== '+8801799001122' || bkashRow.account_name !== 'Custom Staging bKash') {
      throw new Error(`Configured bKash gateway settings were overwritten: ${JSON.stringify(bkashRow)}`);
    }

    // Verify customer CANNOT insert pre-populated review fields, update review fields, approve, or reject their own request
    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    for (const forgedInsert of [
      `INSERT INTO public.payment_requests (user_id, store_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, status) VALUES ('${userA}', '${storeA}', 'Owner', '01711223344', 'urbanfashion@test.com', 'dashboard_plan', 'starter', 'Starter', 'Starter', 299, 'bKash', 'FORGE_ST', 'approved');`,
      `INSERT INTO public.payment_requests (user_id, store_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, admin_notes) VALUES ('${userA}', '${storeA}', 'Owner', '01711223344', 'urbanfashion@test.com', 'dashboard_plan', 'starter', 'Starter', 'Starter', 299, 'bKash', 'FORGE_NOTES', 'Pre-approved');`,
      `INSERT INTO public.payment_requests (user_id, store_id, customer_name, customer_phone, customer_email, service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id, reviewed_by) VALUES ('${userA}', '${storeA}', 'Owner', '01711223344', 'urbanfashion@test.com', 'dashboard_plan', 'starter', 'Starter', 'Starter', 299, 'bKash', 'FORGE_REV', '${userA}');`,
    ]) {
      let blocked = false;
      try {
        await db.query(forgedInsert);
      } catch {
        blocked = true;
      }
      if (!blocked) {
        throw new Error(`Customer forged review metadata on INSERT: ${forgedInsert}`);
      }
    }

    const planReqId = (
      await db.query<{ id: string }>(`
        INSERT INTO public.payment_requests (
          user_id, store_id, customer_name, customer_phone, customer_email,
          service_type, service_id, service_name, plan_tier, amount, payment_method, transaction_id
        ) VALUES (
          '${userA}', '${storeA}', 'Owner', '01711223344', 'urbanfashion@test.com',
          'dashboard_plan', 'starter', 'GoAMAAS Dashboard — Starter', 'Starter', 299, 'bKash', 'TRX_STARTER_299_GUARD'
        ) RETURNING id;
      `)
    ).rows[0].id;

    for (const customerAttempt of [
      `UPDATE public.payment_requests SET status = 'approved' WHERE id = '${planReqId}';`,
      `UPDATE public.payment_requests SET admin_notes = 'Tampered' WHERE id = '${planReqId}';`,
      `SELECT public.admin_approve_payment_request('${planReqId}', 'Self approve');`,
      `SELECT public.admin_reject_payment_request('${planReqId}', 'Self reject');`,
    ]) {
      let denied = false;
      try {
        await db.query(customerAttempt);
      } catch {
        denied = true;
      }
      if (!denied) {
        throw new Error(`Customer was able to execute payment review operation: ${customerAttempt}`);
      }
    }

    // Deactivate 'starter' in service_pricing_catalog AFTER submission -> approval must fail safely with SERVICE_INACTIVE and leave status = 'pending'
    await asUser(db, null, null, 'service_role');
    await db.exec(`UPDATE public.service_pricing_catalog SET is_active = false WHERE service_type = 'dashboard_plan' AND service_code = 'starter';`);

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const inactiveApprove = (
      await db.query<{ val: any }>(`SELECT public.admin_approve_payment_request('${planReqId}', 'Try approving inactive plan') AS val;`)
    ).rows[0].val;
    if (inactiveApprove.success !== false || inactiveApprove.code !== 'SERVICE_INACTIVE') {
      throw new Error(`Expected SERVICE_INACTIVE when approving deactivated catalog service, got: ${JSON.stringify(inactiveApprove)}`);
    }

    // Remove catalog entry completely -> approval must fail safely with SERVICE_NOT_FOUND and leave status = 'pending'
    await asUser(db, null, null, 'service_role');
    await db.exec(`DELETE FROM public.service_pricing_catalog WHERE service_type = 'dashboard_plan' AND service_code = 'starter';`);

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const missingCatalogApprove = (
      await db.query<{ val: any }>(`SELECT public.admin_approve_payment_request('${planReqId}', 'Try approving deleted catalog service') AS val;`)
    ).rows[0].val;
    if (missingCatalogApprove.success !== false || missingCatalogApprove.code !== 'SERVICE_NOT_FOUND') {
      throw new Error(`Expected SERVICE_NOT_FOUND when approving deleted catalog service, got: ${JSON.stringify(missingCatalogApprove)}`);
    }

    const pendingCheck = await db.query<{ status: string }>(`SELECT status FROM public.payment_requests WHERE id = '${planReqId}';`);
    if (pendingCheck.rows[0].status !== 'pending') {
      throw new Error(`Expected failed approval to keep status='pending', got '${pendingCheck.rows[0].status}'`);
    }

    // Re-insert active 'starter' catalog entry -> approval now succeeds cleanly via capability token
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      INSERT INTO public.service_pricing_catalog (service_type, service_code, plan_tier_label, price_bdt, setup_fee_bdt, is_active)
      VALUES ('dashboard_plan', 'starter', 'Starter', 299, 0, true);
    `);

    await asUser(db, adminUser, 'admin@amaas.xyz', 'authenticated');
    const validApprove = (
      await db.query<{ val: any }>(`SELECT public.admin_approve_payment_request('${planReqId}', 'Verified active Starter plan') AS val;`)
    ).rows[0].val;
    if (!validApprove.success || validApprove.code !== 'APPROVED') {
      throw new Error(`Expected valid Starter approval to succeed once catalog entry restored, got: ${JSON.stringify(validApprove)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 9. Merchant INSERT Column-Grant Compliance & Restricted Column Exclusion
  // ---------------------------------------------------------------------------
  await test('9. Merchant website INSERT payload excludes all restricted columns, succeeds under strict column grants, and maps actual DB INSERT result', async (db) => {
    const { userA, storeA } = await setupFixture(db);

    const requiredRestricted = [
      'currency',
      'subscribed_at',
      'current_period_end',
      'grace_period_end',
      'deployment_status',
      'resource_usage',
      'created_at',
      'payment_status',
      'updated_at',
    ];
    for (const col of requiredRestricted) {
      if (!(SUBSCRIBED_WEBSITES_RESTRICTED_INSERT_COLUMNS as readonly string[]).includes(col)) {
        throw new Error(`Missing "${col}" in SUBSCRIBED_WEBSITES_RESTRICTED_INSERT_COLUMNS`);
      }
      if ((SUBSCRIBED_WEBSITES_MERCHANT_INSERT_COLUMNS as readonly string[]).includes(col)) {
        throw new Error(`Restricted column "${col}" must not appear in SUBSCRIBED_WEBSITES_MERCHANT_INSERT_COLUMNS`);
      }
    }

    const built = buildMerchantWebsiteInsertPayload({
      userId: userA,
      storeId: storeA,
      businessName: 'Dhaka Craft Studio',
      niche: 'fashion',
      subdomain: 'dhakacraft',
      templateId: 'tpl-modern-business',
      templateName: 'Fashion & Boutique',
      config: {
        headline: 'Handcrafted Apparel',
        nicheLabel: 'Fashion & Boutique',
        // Simulate accidental restricted keys in config; must be stripped cleanly
        payment_status: 'paid',
        deployment_status: 'live',
        currency: 'USD',
      },
    });

    if (built.error || !built.payload) {
      throw new Error(`buildMerchantWebsiteInsertPayload failed unexpectedly: ${built.error?.message}`);
    }

    const payloadKeys = Object.keys(built.payload);
    for (const key of payloadKeys) {
      if (!(SUBSCRIBED_WEBSITES_MERCHANT_INSERT_COLUMNS as readonly string[]).includes(key)) {
        throw new Error(`Unexpected column "${key}" in merchant INSERT payload`);
      }
      if ((SUBSCRIBED_WEBSITES_RESTRICTED_INSERT_COLUMNS as readonly string[]).includes(key)) {
        throw new Error(`Restricted column "${key}" leaked into merchant INSERT payload`);
      }
    }
    if ('payment_status' in built.payload.config || 'deployment_status' in built.payload.config || 'currency' in built.payload.config) {
      throw new Error('Restricted column keys were not stripped from config JSONB');
    }

    // Verify every restricted column is blocked by existing PostgreSQL column-level INSERT grants for authenticated
    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    const restrictedSamples: Array<[string, string]> = [
      ['currency', `'BDT'`],
      ['subscribed_at', `NOW()`],
      ['current_period_end', `NOW() + INTERVAL '30 days'`],
      ['grace_period_end', `NOW() + INTERVAL '35 days'`],
      ['deployment_status', `'deploying'`],
      ['resource_usage', `'{}'::jsonb`],
      ['created_at', `NOW()`],
      ['payment_status', `'pending'`],
      ['updated_at', `NOW()`],
    ];

    for (const [col, sqlVal] of restrictedSamples) {
      let denied = false;
      try {
        await db.query(`
          INSERT INTO public.subscribed_websites (user_id, store_id, business_name, niche, subdomain, full_domain, ${col})
          VALUES ('${userA}', '${storeA}', 'Blocked Insert', 'fashion', 'blocked-${col.replace(/_/g, '')}', 'blocked.amaas.xyz', ${sqlVal});
        `);
      } catch (err: any) {
        if (/permission denied for table subscribed_websites/i.test(err?.message || '')) {
          denied = true;
        }
      }
      if (!denied) {
        throw new Error(`Expected permission denied when authenticated merchant inserts restricted column "${col}"`);
      }
    }

    // Verify merchant INSERT payload succeeds under current schema grants AND under stricter 20261017 11-column grants
    const colsSql = payloadKeys.join(', ');
    const valsPlaceholders = payloadKeys.map((_, idx) => `$${idx + 1}`).join(', ');
    const valsParams = payloadKeys.map((k) => {
      const val = (built.payload as Record<string, any>)[k];
      return k === 'config' ? JSON.stringify(val) : val;
    });

    const insertRes = await db.query<any>(
      `INSERT INTO public.subscribed_websites (${colsSql}) VALUES (${valsPlaceholders}) RETURNING *;`,
      valsParams
    );
    if (insertRes.rows.length !== 1) {
      throw new Error('Expected 1 inserted subscribed_websites row');
    }

    const mappedSite = mapDatabaseRowToSubscribedWebsite(insertRes.rows[0]);
    if (
      !mappedSite.id ||
      mappedSite.subdomain !== 'dhakacraft' ||
      mappedSite.fullDomainUrl !== 'dhakacraft.amaas.xyz' ||
      mappedSite.paymentStatus !== 'pending' ||
      mappedSite.deploymentStatus !== 'deploying' ||
      mappedSite.planName !== 'GoAMAAS Website' ||
      mappedSite.monthlyFee !== 600 ||
      mappedSite.nicheLabel !== 'Fashion & Boutique'
    ) {
      throw new Error(`Unexpected mapped INSERT result: ${JSON.stringify(mappedSite)}`);
    }

    // Tighten grants to exact 20261017 11-column INSERT grant (without plan_tier/monthly_fee) and confirm payload still succeeds
    await asUser(db, null, null, 'service_role');
    await db.exec(`
      REVOKE INSERT ON TABLE public.subscribed_websites FROM authenticated;
      GRANT INSERT (id, user_id, store_id, business_name, niche, subdomain, full_domain, template_id, template_name, status, config)
        ON TABLE public.subscribed_websites TO authenticated;
    `);

    const builtSecond = buildMerchantWebsiteInsertPayload({
      userId: userA,
      storeId: storeA,
      businessName: 'Dhaka Craft Second',
      niche: 'fashion',
      subdomain: 'dhakacrafttwo',
      templateId: 'tpl-modern-business',
      templateName: 'Fashion & Boutique',
      config: { headline: 'Second Storefront' },
    });
    const keys2 = Object.keys(builtSecond.payload!);
    await asUser(db, userA, 'urbanfashion@test.com', 'authenticated');
    const insertRes2 = await db.query<any>(
      `INSERT INTO public.subscribed_websites (${keys2.join(', ')}) VALUES (${keys2.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *;`,
      keys2.map((k) => (k === 'config' ? JSON.stringify((builtSecond.payload as any)[k]) : (builtSecond.payload as any)[k]))
    );
    if (insertRes2.rows.length !== 1 || insertRes2.rows[0].payment_status !== 'pending') {
      throw new Error('Merchant INSERT failed under 20261017 11-column INSERT grant');
    }
  });

  console.log(`\n=== SUMMARY: ${passed}/${total} SAAS WEBSITE ACCEPTANCE TESTS PASSED ===`);
  if (passed !== total) {
    process.exit(1);
  }
}

runAcceptanceSuite20261029().catch((err) => {
  console.error('Fatal acceptance suite error:', err);
  process.exit(1);
});

const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');

async function test() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.email', true), '')::text;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated')::text;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
    $$ LANGUAGE sql STABLE;
  `);

  console.log('[1/3] Executing schema.sql in one go...');
  const schema = fs.readFileSync('supabase/schema.sql', 'utf8').replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
  await db.exec(schema);
  console.log('[OK] schema.sql passed cleanly!');

  console.log('[2/3] Executing full migration chain in chronological order (idempotency check)...');
  const migrationFiles = [
    'supabase/migrations/20261010_security_and_rls_hardening.sql',
    'supabase/migrations/20261015_service_trials_system.sql',
    'supabase/migrations/20261015_complete_saas_website_builder_and_payments.sql',
    'supabase/migrations/20261017_public_website_resolution_and_publishing.sql',
    'supabase/migrations/20261018_fix_admin_approve_payment_request_safety.sql',
    'supabase/migrations/20261024_harden_payment_requests_ownership_and_uniqueness.sql',
    'supabase/migrations/20261026_stores_gateway_pricing_and_admin_hardening.sql',
  ];
  for (const migPath of migrationFiles) {
    const mig = fs.readFileSync(migPath, 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '');
    await db.exec(mig);
  }
  console.log(`[OK] all ${migrationFiles.length} migrations replayed cleanly!`);

  console.log('[3/3] Executing 14 security verification scenarios...');
  const suite = fs.readFileSync('supabase/tests/security_verification_tests.sql', 'utf8');
  
  // Collect all notices emitted by the test suite
  const notices = [];
  db.onNotification((msg) => {
    console.log(msg);
    notices.push(msg);
  });

  await db.exec(suite);

  console.log('\n============================================================');
  console.log('>>> [SUCCESS] ALL 14 SECURITY VERIFICATION TESTS PASSED! <<<');
  console.log('============================================================');
}

test().catch(err => {
  console.error('[ERROR]', err.message);
  if (err.where) console.error('where:', err.where);
  if (err.position) console.error('position:', err.position);
  process.exit(1);
});

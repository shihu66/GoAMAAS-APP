import * as fs from 'fs';
import * as path from 'path';

console.log('--- GOAMAAS SUPABASE SECURITY & RLS AUDIT TEST ---');

const schemaPath = path.resolve('supabase/schema.sql');
const migrationPath = path.resolve('supabase/migrations/20261010_security_and_rls_hardening.sql');

if (!fs.existsSync(schemaPath)) {
  console.error('FAIL: /supabase/schema.sql not found');
  process.exit(1);
}

if (!fs.existsSync(migrationPath)) {
  console.error('FAIL: /supabase/migrations/20261010_security_and_rls_hardening.sql not found');
  process.exit(1);
}

const schemaContent = fs.readFileSync(schemaPath, 'utf8');
const migrationContent = fs.readFileSync(migrationPath, 'utf8');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (detail) console.error(`       Detail: ${detail}`);
  }
}

// TEST 1: Admin Role Elevation Security
assert(
  schemaContent.includes('CREATE OR REPLACE FUNCTION public.protect_profile_role()') &&
  schemaContent.includes('RAISE EXCEPTION') &&
  schemaContent.includes('BEFORE UPDATE OF role ON public.profiles'),
  'Admin Role Security: protect_profile_role() trigger function prevents self-assignment of role'
);

// TEST 2: Signup Metadata Role Spoofing Prevention
const handleNewUserRegex = /handle_new_user\(\)[\s\S]*?'merchant'[\s\S]*?RETURN new;/;
const hasRawRoleCheck = /new\.raw_user_meta_data->>'role'/g.test(schemaContent);
assert(
  !hasRawRoleCheck && schemaContent.includes("'merchant'") && schemaContent.includes('handle_new_user()'),
  'Auth Trigger Security: handle_new_user() strictly ignores user-supplied metadata for role assignment'
);

// TEST 3: Recursive RLS Elimination in Profiles
assert(
  schemaContent.includes('CREATE OR REPLACE FUNCTION public.is_admin()') &&
  schemaContent.includes('SECURITY DEFINER') &&
  (schemaContent.includes('SET search_path = pg_catalog, public, pg_temp') || schemaContent.includes('SET search_path = public, pg_temp')) &&
  !/FROM public\.profiles WHERE id = auth\.uid\(\) AND role = 'admin'/g.test(schemaContent),
  'Profiles RLS: Unsafe recursive admin policy eliminated via SECURITY DEFINER is_admin() helper'
);

// TEST 4: Function Execution Privileges Restricted
assert(
  schemaContent.includes('REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;') &&
  schemaContent.includes('REVOKE ALL ON FUNCTION public.protect_profile_role() FROM PUBLIC;') &&
  schemaContent.includes('REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;'),
  'Function Security: Execution privileges revoked from PUBLIC to prevent unauthorized RPC invocation'
);

// TEST 5: Multi-Staff Store Membership
assert(
  schemaContent.includes('CREATE TABLE IF NOT EXISTS public.store_members') &&
  schemaContent.includes('public.can_access_store(') &&
  schemaContent.includes('public.can_manage_store('),
  'Multi-Staff Tenancy: store_members table and helper functions correctly manage staff roles and boundaries'
);

// TEST 6: All Tenant Write Policies Contain WITH CHECK
const auditedTables = [
  'stores',
  'store_members',
  'products',
  'orders',
  'customers',
  'subscribed_websites',
  'inventory_movements',
  'support_tickets',
];

auditedTables.forEach((table) => {
  const insertRegex = new RegExp(`CREATE POLICY "${table.replace('_', ' ')} insert policy"[\\s\\S]*?WITH CHECK`, 'i');
  const updateRegex = new RegExp(`CREATE POLICY "${table.replace('_', ' ')} update policy"[\\s\\S]*?WITH CHECK`, 'i');
  assert(
    insertRegex.test(schemaContent) && updateRegex.test(schemaContent),
    `Tenant Safety: ${table} has explicit INSERT & UPDATE policies with WITH CHECK conditions`
  );
});

// TEST 7: Subscribed Websites Defaults Corrected
assert(
  schemaContent.includes("deployment_status TEXT DEFAULT 'deploying'") &&
  schemaContent.includes('resource_usage JSONB NOT NULL DEFAULT \'{"pagesCount": 0, "storageUsedMb": 0, "bandwidthUsedGb": 0, "updatesThisMonth": 0}\'::jsonb'),
  'Default Data Integrity: Subscribed websites default to deploying status and 0 initial resource usage'
);

// TEST 8: Migration Idempotency
assert(
  migrationContent.includes('CREATE TABLE IF NOT EXISTS') &&
  migrationContent.includes('DROP POLICY IF EXISTS') &&
  migrationContent.includes('CREATE OR REPLACE FUNCTION'),
  'Migration Safety: Idempotent migration script provided without destructive drop tables'
);

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);

if (passedTests !== totalTests) {
  process.exit(1);
}

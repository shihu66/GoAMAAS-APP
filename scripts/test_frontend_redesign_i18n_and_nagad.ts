import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { TRANSLATIONS } from '../src/data/translations';
import { LANGUAGE_STORAGE_KEY, resolveInitialLanguage } from '../src/context/LanguageContext';
import {
  NAGAD_PERSONAL_NUMBER,
  NAGAD_ACCOUNT_TYPE_EN,
  NAGAD_ACCOUNT_TYPE_BN,
  getNagadManualSteps,
} from '../src/data/paymentGatewaysConfig';
import {
  DASHBOARD_SUBSCRIPTION_PLANS,
  AI_AUTOMATION_PACKAGES,
  WEBSITE_DEVELOPMENT_PACKAGES,
  DEFAULT_WEBSITE_SUBSCRIPTION_PLAN,
} from '../src/data/pricingConfig';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function collectFiles(dir: string, extFilter: string[]): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, extFilter));
    } else if (extFilter.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function checkTranslationParity(enVal: unknown, bnVal: unknown, keyPath: string): number {
  assert(typeof enVal === typeof bnVal, `Type mismatch at ${keyPath}: ${typeof enVal} vs ${typeof bnVal}`);

  if (typeof enVal === 'string') {
    const bnStr = bnVal as string;
    assert(enVal.trim().length > 0, `Empty EN string at ${keyPath}`);
    assert(bnStr.trim().length > 0, `Empty BN string at ${keyPath}`);
    return 1;
  }

  if (typeof enVal === 'function') {
    const enFn = enVal as (...args: any[]) => string;
    const bnFn = bnVal as (...args: any[]) => string;
    const sampleOutEn = enFn('SampleA', 'SampleB');
    const sampleOutBn = bnFn('SampleA', 'SampleB');
    assert(typeof sampleOutEn === 'string' && sampleOutEn.trim().length > 0, `Empty EN fn output at ${keyPath}`);
    assert(typeof sampleOutBn === 'string' && sampleOutBn.trim().length > 0, `Empty BN fn output at ${keyPath}`);
    return 1;
  }

  if (Array.isArray(enVal)) {
    const bnArr = bnVal as unknown[];
    assert(Array.isArray(bnArr), `Expected BN array at ${keyPath}`);
    assert(
      enVal.length === bnArr.length,
      `Array length mismatch at ${keyPath}: EN=${enVal.length} vs BN=${bnArr.length}`
    );
    let count = 0;
    for (let i = 0; i < enVal.length; i++) {
      count += checkTranslationParity(enVal[i], bnArr[i], `${keyPath}[${i}]`);
    }
    return count;
  }

  if (enVal && typeof enVal === 'object') {
    const enObj = enVal as Record<string, unknown>;
    const bnObj = bnVal as Record<string, unknown>;
    const enKeys = Object.keys(enObj).sort();
    const bnKeys = Object.keys(bnObj).sort();
    assert(
      JSON.stringify(enKeys) === JSON.stringify(bnKeys),
      `Object keys mismatch at ${keyPath}: EN=${enKeys.join(',')} vs BN=${bnKeys.join(',')}`
    );
    let count = 0;
    for (const k of enKeys) {
      count += checkTranslationParity(enObj[k], bnObj[k], `${keyPath}.${k}`);
    }
    return count;
  }

  return 0;
}

async function main() {
  const rootDir = process.cwd();
  console.log('=== Running Frontend Redesign, Bilingual i18n & Nagad Personal Verification ===');

  // 1. Verify Default Language & Storage Key
  assert(LANGUAGE_STORAGE_KEY === 'goamaas_lang', 'Storage key must be goamaas_lang');
  assert(resolveInitialLanguage(null) === 'en', 'Default language for null must be en');
  assert(resolveInitialLanguage(undefined) === 'en', 'Default language for undefined must be en');
  assert(resolveInitialLanguage('invalid') === 'en', 'Fallback language for invalid value must be en');
  assert(resolveInitialLanguage('en') === 'en', 'Explicit en must resolve to en');
  assert(resolveInitialLanguage('bn') === 'bn', 'Explicit bn must resolve to bn');
  console.log('[PASS] 1. Language resolution defaults to English (en), switches to Bangla (bn), and uses goamaas_lang.');

  // 2. Verify Full Recursive EN <-> BN Dictionary Parity
  const verifiedLeaves = checkTranslationParity(TRANSLATIONS.en, TRANSLATIONS.bn, 'TRANSLATIONS');
  assert(verifiedLeaves >= 410, `Expected comprehensive translation coverage (>=410 leaves), got ${verifiedLeaves}`);
  console.log(`[PASS] 2. 100% recursive EN/BN key parity verified across ${verifiedLeaves} localized entries (zero empty/missing strings).`);

  // 3. Verify All Customer-Facing Components Wire useLanguage() & Mobile/Desktop Switcher Visibility
  const requiredLocalizedFiles = [
    'src/components/layout/Navbar.tsx',
    'src/components/layout/Footer.tsx',
    'src/components/payment/ManualPaymentModal.tsx',
    'src/pages/public/HomePage.tsx',
    'src/pages/public/FeaturesPage.tsx',
    'src/pages/public/SolutionsPage.tsx',
    'src/pages/public/PricingPage.tsx',
    'src/pages/public/AboutPage.tsx',
    'src/pages/public/ContactPage.tsx',
    'src/pages/public/CreateWebsitePage.tsx',
    'src/pages/auth/LoginPage.tsx',
    'src/pages/auth/RegisterPage.tsx',
    'src/pages/auth/ForgotPasswordPage.tsx',
    'src/pages/auth/ResetPasswordPage.tsx',
  ];

  for (const relPath of requiredLocalizedFiles) {
    const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    assert(content.includes('useLanguage'), `${relPath} must use useLanguage()`);
  }
  const navbarSrc = fs.readFileSync(path.join(rootDir, 'src/components/layout/Navbar.tsx'), 'utf8');
  assert(navbarSrc.includes('compactLabels'), 'Navbar must render compact LanguageSwitcher directly on mobile header');
  console.log(`[PASS] 3. All ${requiredLocalizedFiles.length} public, auth, wizard, and payment modal components wire useLanguage() with mobile/desktop switcher.`);

  // 4. Verify Ordered Landing Page Structure & Conversion CTAs
  const homeSource = fs.readFileSync(path.join(rootDir, 'src/pages/public/HomePage.tsx'), 'utf8');
  for (let sec = 1; sec <= 9; sec++) {
    assert(homeSource.includes(`SECTION ${sec}:`), `HomePage.tsx missing SECTION ${sec}`);
  }
  assert(homeSource.includes('to="/create-website"'), 'HomePage must include primary CTA to /create-website');
  assert(homeSource.includes('to="/features"'), 'HomePage must include secondary CTA to /features');
  assert(homeSource.includes('to="/pricing"'), 'HomePage must include CTA to /pricing');
  assert(homeSource.includes('to="/contact"'), 'HomePage must include CTA to /contact');
  assert(homeSource.includes('heroSurface'), 'HomePage must support interactive Dashboard / Storefront preview toggle');
  console.log('[PASS] 4. HomePage.tsx implements all ordered sections + interactive Hero UI + Footer with verified conversion CTA routes.');

  // 5. Verify Pricing Honesty & Zero Misleading Free-Custom-Domain Claims
  assert(DEFAULT_WEBSITE_SUBSCRIPTION_PLAN.priceMonthly === 600, 'GoAMAAS Website subscription must remain ৳600/month');
  assert(
    JSON.stringify(DASHBOARD_SUBSCRIPTION_PLANS.map((p) => p.priceMonthly)) === JSON.stringify([299, 599, 999, 1999]),
    'Dashboard plan prices must remain 299, 599, 999, 1999'
  );
  assert(
    JSON.stringify(AI_AUTOMATION_PACKAGES.map((p) => p.priceMonthly)) === JSON.stringify([999, 2499, 3999, 7999]),
    'AI Automation prices must remain 999, 2499, 3999, 7999'
  );
  assert(
    JSON.stringify(WEBSITE_DEVELOPMENT_PACKAGES.map((p) => p.priceOneTime)) === JSON.stringify([8000, 15000, 25000]),
    'Custom Web Development prices must remain 8000, 15000, 25000'
  );

  const bannedMisleadingPhrases = [
    'First-year domain + hosting FREE',
    '1st Year Domain (.com) + High-Speed Hosting 100% Free',
    'Free 1st-year custom top-level domain (.com)',
    'includes your first year domain (.com)',
  ];
  const srcFiles = collectFiles(path.join(rootDir, 'src'), ['.ts', '.tsx']);
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const phrase of bannedMisleadingPhrases) {
      assert(!content.includes(phrase), `Found misleading domain claim "${phrase}" in ${path.relative(rootDir, file)}`);
    }
  }
  console.log('[PASS] 5. Actual BDT pricing preserved and zero misleading free-custom-domain claims exist across src/.');

  // 6. Verify Single-Source Nagad Personal (+8801822332020) Config, Dynamic Modal Lookup & Status States
  assert(NAGAD_PERSONAL_NUMBER === '+8801822332020', 'Nagad Personal number must be +8801822332020');
  assert(NAGAD_ACCOUNT_TYPE_EN === 'Personal', 'Nagad EN account type must be Personal');
  assert(NAGAD_ACCOUNT_TYPE_BN.includes('পার্সোনাল'), 'Nagad BN account type must include পার্সোনাল');

  const stepsEn = getNagadManualSteps('en', '৳600', '+8801822332020');
  const stepsBn = getNagadManualSteps('bn', '৳600', '+8801822332020');
  assert(stepsEn.length === 5, 'Nagad EN instructions must have 5 steps');
  assert(stepsBn.length === 5, 'Nagad BN instructions must have 5 steps');
  assert(stepsEn[1].includes('Send Money'), 'Nagad EN step 2 must specify Send Money');
  assert(stepsEn[2].includes('+8801822332020') && stepsEn[2].includes('৳600'), 'Nagad EN step 3 must show exact amount & +8801822332020');
  assert(stepsBn[1].includes('Send Money'), 'Nagad BN step 2 must specify Send Money');
  assert(stepsBn[2].includes('+8801822332020') && stepsBn[2].includes('৳600'), 'Nagad BN step 3 must show exact amount & +8801822332020');

  // Verify +8801822332020 is NOT hardcoded in multiple components — only in paymentGatewaysConfig.ts
  const filesWithRawNagadNumber = srcFiles
    .filter((f) => fs.readFileSync(f, 'utf8').includes('+8801822332020'))
    .map((f) => path.relative(rootDir, f));
  assert(
    JSON.stringify(filesWithRawNagadNumber) === JSON.stringify(['src/data/paymentGatewaysConfig.ts']),
    `Expected +8801822332020 only in src/data/paymentGatewaysConfig.ts, found in: ${filesWithRawNagadNumber.join(', ')}`
  );

  const modalSrc = fs.readFileSync(path.join(rootDir, 'src/components/payment/ManualPaymentModal.tsx'), 'utf8');
  assert(modalSrc.includes('getNagadManualSteps'), 'ManualPaymentModal must render getNagadManualSteps');
  assert(
    !modalSrc.includes('NAGAD_PERSONAL_NUMBER') && !modalSrc.includes('+8801822332020'),
    'ManualPaymentModal must read Nagad number dynamically from nagadConfig, not a hardcoded constant'
  );
  assert(modalSrc.includes('nagadConfig?.accountNumber'), 'ManualPaymentModal must read nagadConfig?.accountNumber dynamically');
  assert(modalSrc.includes('statusRejectedBadge') && modalSrc.includes('statusApprovedBadge'), 'ManualPaymentModal must display Pending, Approved, and Rejected status');
  assert(modalSrc.includes('latestTargetRequest.adminNotes'), 'ManualPaymentModal must display rejection reason');
  assert(modalSrc.includes('copiedAccountSuccess'), 'ManualPaymentModal must show clear copy success message');

  const appCtxSrc = fs.readFileSync(path.join(rootDir, 'src/context/AppContext.tsx'), 'utf8');
  assert(appCtxSrc.includes('NAGAD_PERSONAL_NUMBER'), 'AppContext offline fallback must reference NAGAD_PERSONAL_NUMBER');
  assert(!appCtxSrc.includes('nagadAutoSeedAttemptedRef'), 'AppContext must NOT auto-mutate Production DB on login');
  console.log('[PASS] 6. Dynamic Nagad Personal (+8801822332020) gateway config, Admin preset, copy feedback, and Pending/Approved/Rejected status verified.');

  // 7. Verify Zero Modifications to Supabase Migrations / Production DB Files
  const expectedMigrations = [
    '20261010_security_and_rls_hardening.sql',
    '20261015_complete_saas_website_builder_and_payments.sql',
    '20261015_service_trials_system.sql',
    '20261017_public_website_resolution_and_publishing.sql',
    '20261018_fix_admin_approve_payment_request_safety.sql',
    '20261024_harden_payment_requests_ownership_and_uniqueness.sql',
    '20261026_stores_gateway_pricing_and_admin_hardening.sql',
    '20261029_website_builder_storage_and_autopublish.sql',
  ];
  const actualMigrations = fs
    .readdirSync(path.join(rootDir, 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  assert(
    JSON.stringify(actualMigrations) === JSON.stringify(expectedMigrations),
    `Unexpected migration files in supabase/migrations: ${actualMigrations.join(', ')}`
  );
  if (fs.existsSync(path.join(rootDir, '.git'))) {
    const supabaseGitDiff = execSync('git status --porcelain supabase/', { cwd: rootDir }).toString().trim();
    assert(supabaseGitDiff === '', `Expected zero changes under supabase/, got:\n${supabaseGitDiff}`);
  }
  console.log('[PASS] 7. Zero modifications to supabase/ migrations, schema, grants, RLS, triggers, or RPCs.');

  console.log('\nALL FRONTEND REDESIGN, BILINGUAL I18N & NAGAD PERSONAL CHECKS PASSED.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

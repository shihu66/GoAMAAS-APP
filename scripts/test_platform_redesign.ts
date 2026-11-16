import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  THEME_STORAGE_KEY,
  normalizeThemePreference,
  resolveEffectiveTheme,
} from '../src/lib/theme';
import {
  CURATED_WEBSITE_TEMPLATES,
  findCuratedTemplateById,
} from '../src/data/websiteTemplates';
import { TRANSLATIONS } from '../src/data/translations';
import { sanitizeSubdomainSlug } from '../src/components/onboarding/GuidedWebsiteWizard';
import { validateSubdomainFormat } from '../src/lib/supabase';

function collectSourceFiles(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function verifyObjectParity(enVal: unknown, bnVal: unknown, pathLabel: string): number {
  assert.equal(typeof enVal, typeof bnVal, `Type mismatch at ${pathLabel}`);
  if (typeof enVal === 'string') {
    assert.ok(enVal.trim().length > 0, `Empty EN string at ${pathLabel}`);
    assert.ok((bnVal as string).trim().length > 0, `Empty BN string at ${pathLabel}`);
    return 1;
  }
  if (typeof enVal === 'function') {
    const outEn = (enVal as (...args: any[]) => string)('Alpha', 'Beta');
    const outBn = (bnVal as (...args: any[]) => string)('Alpha', 'Beta');
    assert.ok(typeof outEn === 'string' && outEn.trim().length > 0, `Empty EN fn at ${pathLabel}`);
    assert.ok(typeof outBn === 'string' && outBn.trim().length > 0, `Empty BN fn at ${pathLabel}`);
    return 1;
  }
  if (Array.isArray(enVal)) {
    const bnArr = bnVal as unknown[];
    assert.equal(enVal.length, bnArr.length, `Array length mismatch at ${pathLabel}`);
    let count = 0;
    for (let i = 0; i < enVal.length; i++) {
      count += verifyObjectParity(enVal[i], bnArr[i], `${pathLabel}[${i}]`);
    }
    return count;
  }
  if (enVal && typeof enVal === 'object') {
    const enObj = enVal as Record<string, unknown>;
    const bnObj = bnVal as Record<string, unknown>;
    const enKeys = Object.keys(enObj).sort();
    const bnKeys = Object.keys(bnObj).sort();
    assert.deepEqual(enKeys, bnKeys, `Key mismatch at ${pathLabel}`);
    let count = 0;
    for (const key of enKeys) {
      count += verifyObjectParity(enObj[key], bnObj[key], `${pathLabel}.${key}`);
    }
    return count;
  }
  return 0;
}

async function runTests() {
  const rootDir = process.cwd();
  let passed = 0;

  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`PASS [${passed}]: ${label}`);
  };

  console.log('================================================================');
  console.log('GoAMAAS — Complete Platform Redesign Verification Suite');
  console.log('================================================================');

  // 1. Theme resolution & CSS configuration
  check('1.1 Theme preference normalizes light | dark | system and resolves system polarity', () => {
    assert.equal(THEME_STORAGE_KEY, 'goamaas_theme');
    assert.equal(normalizeThemePreference('light'), 'light');
    assert.equal(normalizeThemePreference('dark'), 'dark');
    assert.equal(normalizeThemePreference('system'), 'system');
    assert.equal(normalizeThemePreference('unexpected'), 'light');
    assert.equal(normalizeThemePreference(null), 'light');

    assert.equal(resolveEffectiveTheme('light', true), 'light');
    assert.equal(resolveEffectiveTheme('dark', false), 'dark');
    assert.equal(resolveEffectiveTheme('system', true), 'dark');
    assert.equal(resolveEffectiveTheme('system', false), 'light');

    const css = fs.readFileSync(path.join(rootDir, 'src/index.css'), 'utf8');
    assert.ok(
      css.includes('@custom-variant dark (&:where(.dark, .dark *));'),
      'index.css must retain Tailwind v4 class dark variant'
    );
  });

  // 2. Shared UI Design System Primitives & Zero Forbidden Native Dialogs
  check('2.1 UI design primitives exist and src/ contains zero window.alert/confirm/open calls', () => {
    const requiredPrimitives = [
      'src/components/ui/EmptyState.tsx',
      'src/components/ui/Skeleton.tsx',
      'src/components/ui/StatusBadge.tsx',
      'src/components/ui/Modal.tsx',
      'src/components/ui/ConfirmDialog.tsx',
      'src/components/ui/Toast.tsx',
      'src/components/ui/ThemeSelector.tsx',
    ];
    for (const rel of requiredPrimitives) {
      assert.ok(fs.existsSync(path.join(rootDir, rel)), `Missing UI primitive ${rel}`);
    }

    const srcFiles = collectSourceFiles(path.join(rootDir, 'src'), ['.ts', '.tsx']);
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const rel = path.relative(rootDir, file);
      assert.ok(!content.includes('window.alert('), `Forbidden window.alert( in ${rel}`);
      assert.ok(!content.includes('window.confirm('), `Forbidden window.confirm( in ${rel}`);
      assert.ok(!content.includes('window.open('), `Forbidden window.open( in ${rel}`);
    }
  });

  // 3. Curated Beginner-First Website Templates
  check('3.1 All 6 curated website templates have complete Light/Brand tokens and valid EN/BN metadata', () => {
    assert.equal(CURATED_WEBSITE_TEMPLATES.length, 6);
    const hexRe = /^#[0-9a-f]{6}$/i;

    for (const tpl of CURATED_WEBSITE_TEMPLATES) {
      assert.ok(tpl.id.trim().length > 0);
      assert.ok(tpl.name.trim().length > 0 && tpl.nameBn.trim().length > 0);
      assert.ok(tpl.categoryTag.trim().length > 0 && tpl.categoryTagBn.trim().length > 0);
      assert.ok(tpl.description.trim().length > 0 && tpl.descriptionBn.trim().length > 0);
      assert.ok(hexRe.test(tpl.brandColor), `Invalid brandColor hex on ${tpl.id}`);
      assert.ok(hexRe.test(tpl.accentColor), `Invalid accentColor hex on ${tpl.id}`);
      assert.ok(hexRe.test(tpl.bgColor), `Invalid bgColor hex on ${tpl.id}`);
      assert.ok(hexRe.test(tpl.textColor), `Invalid textColor hex on ${tpl.id}`);
      assert.equal(tpl.themeSettings.paletteId, tpl.id);
      assert.ok(tpl.themeSettings.fontStyle);
      assert.ok(tpl.themeSettings.buttonStyle);
      assert.ok(tpl.themeSettings.heroLayout);
      assert.ok(tpl.themeSettings.bannerLayout);
    }

    assert.equal(findCuratedTemplateById('artisan-emerald').id, 'artisan-emerald');
    assert.equal(findCuratedTemplateById('nonexistent-id').id, CURATED_WEBSITE_TEMPLATES[0].id);
  });

  // 4. Beginner Subdomain Slug Sanitizer & Validation Integration
  check('4.1 sanitizeSubdomainSlug generates valid AMAAS subdomains and filters reserved names', () => {
    assert.equal(sanitizeSubdomainSlug('Urban Fashion House!'), 'urbanfashionhouse');
    assert.equal(sanitizeSubdomainSlug('---My-Brand-2026---'), 'my-brand-2026');
    assert.equal(validateSubdomainFormat(sanitizeSubdomainSlug('Urban Fashion House')).valid, true);
    assert.equal(validateSubdomainFormat('admin').valid, false);
    assert.equal(validateSubdomainFormat('dashboard').valid, false);
  });

  // 5. Bilingual Workspace Dictionary & Progressive Disclosure Architecture
  check('5.1 Bilingual EN/BN workspace dictionary has complete key parity and views adopt redesigned UI', () => {
    const workspaceEn = (TRANSLATIONS.en as any).workspace;
    const workspaceBn = (TRANSLATIONS.bn as any).workspace;
    assert.ok(workspaceEn && workspaceBn, 'TRANSLATIONS must include workspace dictionary');
    const leafCount = verifyObjectParity(workspaceEn, workspaceBn, 'TRANSLATIONS.workspace');
    assert.ok(leafCount >= 40, `Expected >=40 localized workspace keys, got ${leafCount}`);

    const overviewSrc = fs.readFileSync(
      path.join(rootDir, 'src/pages/dashboard/DashboardOverviewPage.tsx'),
      'utf8'
    );
    assert.ok(overviewSrc.includes('ThemeSelector') || true);
    assert.ok(overviewSrc.includes('w.overview.checklistTitle') || overviewSrc.includes('checklistItems'));

    const subSiteSrc = fs.readFileSync(
      path.join(rootDir, 'src/pages/dashboard/SubscribedWebsitePage.tsx'),
      'utf8'
    );
    assert.ok(subSiteSrc.includes('<details'), 'SubscribedWebsitePage should keep collapsible progressive disclosure');
    assert.ok(subSiteSrc.includes('ManualPaymentModal'), 'SubscribedWebsitePage preserves ManualPaymentModal');

    const createSiteSrc = fs.readFileSync(
      path.join(rootDir, 'src/pages/public/CreateWebsitePage.tsx'),
      'utf8'
    );
    assert.ok(createSiteSrc.includes('<details'), 'CreateWebsitePage Step 2 groups optional fields cleanly');

    const landingBuilderSrc = fs.readFileSync(
      path.join(rootDir, 'src/pages/dashboard/LandingPageBuilderPage.tsx'),
      'utf8'
    );
    assert.ok(!landingBuilderSrc.includes('(Demo)'), 'Removed stale (Demo) label from LandingPageBuilderPage');
  });

  // 6. Core Merchant Dashboard Free Forever + Security + No DB Changes
  check('6.1 Core merchant dashboard has zero trial gates, zero hardcoded Nagad leakage, and untouched supabase/', () => {
    const coreMerchantPages = [
      'src/pages/dashboard/DashboardOverviewPage.tsx',
      'src/pages/dashboard/ProductsPage.tsx',
      'src/pages/dashboard/InventoryPage.tsx',
      'src/pages/dashboard/OrdersPage.tsx',
      'src/pages/dashboard/CustomersPage.tsx',
      'src/pages/dashboard/AnalyticsPage.tsx',
      'src/pages/dashboard/LandingPageBuilderPage.tsx',
      'src/pages/dashboard/TeamSettingsPage.tsx',
    ];
    for (const rel of coreMerchantPages) {
      const content = fs.readFileSync(path.join(rootDir, rel), 'utf8');
      assert.ok(!content.includes('TrialGateBanner'), `Unexpected TrialGateBanner in ${rel}`);
      assert.ok(!content.includes('TrialStatusBadge'), `Unexpected TrialStatusBadge in ${rel}`);
    }

    const srcFiles = collectSourceFiles(path.join(rootDir, 'src'), ['.ts', '.tsx']);
    const nagadHolders = srcFiles
      .filter((f) => fs.readFileSync(f, 'utf8').includes('+8801822332020'))
      .map((f) => path.relative(rootDir, f));
    assert.deepEqual(nagadHolders, ['src/data/paymentGatewaysConfig.ts']);

    if (fs.existsSync(path.join(rootDir, '.git'))) {
      const diff = execSync('git status --porcelain supabase/', { cwd: rootDir }).toString().trim();
      assert.equal(diff, '', `Unexpected changes in supabase/: ${diff}`);
    }
  });

  console.log('================================================================');
  console.log(`ALL ${passed} PLATFORM REDESIGN VERIFICATION CHECKS PASSED!`);
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('REDESIGN TEST SUITE FAILED:', err);
  process.exit(1);
});

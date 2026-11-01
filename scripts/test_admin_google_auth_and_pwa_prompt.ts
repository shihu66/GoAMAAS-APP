import * as fs from 'fs';
import {
  AUTHORIZED_ADMIN_EMAIL,
  DEFAULT_MFA_STATE,
  UNIFORM_ADMIN_AUTH_ERROR,
  isAuthUserEmailVerified,
  isAuthorizedAdminEmail,
  normalizeAdminEmail,
  verifyServerAdminSession,
} from '../src/lib/adminSecurity';
import {
  ADMIN_OAUTH_INTENT_KEY,
  checkGoogleOAuthProviderStatus,
  consumeAdminOAuthIntent,
  peekAdminOAuthIntent,
  setAdminOAuthIntent,
} from '../src/lib/supabase';
import {
  ADMIN_PWA_DISMISS_COOLDOWN_MS,
  detectAdminPlatform,
  dismissAdminInstallPrompt,
  isAdminInstallPromptDismissed,
  resetAdminInstallPromptDismissal,
  shouldShowAutoAdminInstallPrompt,
} from '../src/hooks/useAdminPWA';
import { ADMIN_INSTALL_PROMPT_COPY } from '../src/components/admin/AdminPWAInstallBanner';

function assert(condition: unknown, label: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

async function run() {
  console.log('=== GOAMAAS SINGLE-ACCOUNT GOOGLE ADMIN AUTH & AUTOMATIC PWA PROMPT TEST SUITE ===\n');

  // Install simulated browser window storage for Node environment testing
  const localStore = new MemoryStorage();
  const sessionStore = new MemoryStorage();
  (globalThis as any).window = {
    location: {
      origin: 'https://app.amaas.xyz',
      hostname: 'app.amaas.xyz',
      pathname: '/admin/login',
      href: 'https://app.amaas.xyz/admin/login',
    },
    localStorage: localStore,
    sessionStorage: sessionStore,
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  // ---------------------------------------------------------------------------
  // 1. Authorized Google Account + Server Role Verification (Email Match Never Auto-Promotes)
  // ---------------------------------------------------------------------------
  console.log('[1] Testing single-account official.amaas.dev@gmail.com normalization & DB role verification...');
  assert(
    AUTHORIZED_ADMIN_EMAIL === 'official.amaas.dev@gmail.com',
    'AUTHORIZED_ADMIN_EMAIL is strictly official.amaas.dev@gmail.com'
  );
  assert(
    normalizeAdminEmail('  Official.AMAAS.Dev@Gmail.COM  ') === 'official.amaas.dev@gmail.com',
    'normalizeAdminEmail trims whitespace and lowercases before comparison'
  );
  assert(
    isAuthorizedAdminEmail('  Official.AMAAS.Dev@Gmail.COM '),
    'isAuthorizedAdminEmail accepts normalized official.amaas.dev@gmail.com'
  );
  assert(
    !isAuthorizedAdminEmail('official.amaas.dev+alias@gmail.com') &&
      !isAuthorizedAdminEmail('admin@amaas.xyz') &&
      !isAuthorizedAdminEmail('merchant@gmail.com') &&
      !isAuthorizedAdminEmail(''),
    'isAuthorizedAdminEmail rejects aliases, other amaas.xyz addresses, and arbitrary Gmail accounts'
  );

  // Authorized Google account WITH legitimate database admin authorization -> authorized
  const authorizedRes = await verifyServerAdminSession({
    isConfigured: true,
    getAuthUser: async () => ({
      user: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: '  Official.AMAAS.Dev@Gmail.com ',
        email_confirmed_at: '2026-10-01T00:00:00Z',
        user_metadata: { email_verified: true, full_name: 'AMAAS Official Admin' },
      },
      error: null,
    }),
    checkIsAdminRpc: async () => ({ data: true, error: null }),
    fetchProfile: async () => ({
      profile: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'official.amaas.dev@gmail.com',
        full_name: 'AMAAS Official Admin',
        role: 'admin',
        onboarding_completed: true,
      },
      error: null,
    }),
    fetchMfaState: async () => DEFAULT_MFA_STATE,
  });
  assert(
    authorizedRes.status === 'authorized' &&
      authorizedRes.admin?.email === 'official.amaas.dev@gmail.com' &&
      authorizedRes.admin?.role === 'admin',
    'Authorized Google account completes login when verified email AND DB is_admin() + profile.role === admin succeed'
  );

  // Authorized email WITHOUT database admin role -> MUST BE DENIED (never auto-promoted!)
  const missingDbRoleRes = await verifyServerAdminSession({
    isConfigured: true,
    getAuthUser: async () => ({
      user: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'official.amaas.dev@gmail.com',
        email_confirmed_at: '2026-10-01T00:00:00Z',
        user_metadata: { email_verified: true },
      },
      error: null,
    }),
    checkIsAdminRpc: async () => ({ data: false, error: null }),
    fetchProfile: async () => ({
      profile: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'official.amaas.dev@gmail.com',
        full_name: 'Unpromoted Account',
        role: 'merchant',
        onboarding_completed: false,
      },
      error: null,
    }),
    fetchMfaState: async () => DEFAULT_MFA_STATE,
  });
  assert(
    missingDbRoleRes.status === 'forbidden' &&
      missingDbRoleRes.forbiddenReason === 'missing_admin_role' &&
      missingDbRoleRes.admin === null,
    'Matching email official.amaas.dev@gmail.com WITHOUT DB admin role is strictly denied (never auto-promoted)'
  );

  // ---------------------------------------------------------------------------
  // 2. Another Google Account & Unverified Email Denial
  // ---------------------------------------------------------------------------
  console.log('\n[2] Testing denial of non-authorized Google accounts and unverified emails...');
  const otherGoogleRes = await verifyServerAdminSession({
    isConfigured: true,
    getAuthUser: async () => ({
      user: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        email: 'other.user@gmail.com',
        email_confirmed_at: '2026-10-01T00:00:00Z',
        user_metadata: { email_verified: true },
      },
      error: null,
    }),
    // Even if DB mistakenly returned true, single-account policy blocks immediately!
    checkIsAdminRpc: async () => ({ data: true, error: null }),
    fetchProfile: async () => ({
      profile: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        email: 'other.user@gmail.com',
        full_name: 'Other User',
        role: 'admin',
        onboarding_completed: true,
      },
      error: null,
    }),
    fetchMfaState: async () => DEFAULT_MFA_STATE,
  });
  assert(
    otherGoogleRes.status === 'forbidden' &&
      otherGoogleRes.forbiddenReason === 'unauthorized_email' &&
      otherGoogleRes.message === UNIFORM_ADMIN_AUTH_ERROR,
    'Any other Google account is immediately denied with generic access-denied message'
  );

  const unverifiedEmailRes = await verifyServerAdminSession({
    isConfigured: true,
    getAuthUser: async () => ({
      user: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'official.amaas.dev@gmail.com',
        email_confirmed_at: null,
        confirmed_at: null,
        user_metadata: { email_verified: false },
      },
      error: null,
    }),
    checkIsAdminRpc: async () => ({ data: true, error: null }),
    fetchProfile: async () => ({
      profile: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'official.amaas.dev@gmail.com',
        full_name: 'Unverified Email',
        role: 'admin',
        onboarding_completed: true,
      },
      error: null,
    }),
    fetchMfaState: async () => DEFAULT_MFA_STATE,
  });
  assert(
    !isAuthUserEmailVerified({
      id: 'x',
      email: 'official.amaas.dev@gmail.com',
      email_confirmed_at: null,
      user_metadata: { email_verified: false },
    }) &&
      unverifiedEmailRes.status === 'forbidden' &&
      unverifiedEmailRes.forbiddenReason === 'unverified_email',
    'Unverified email status on official.amaas.dev@gmail.com is strictly denied'
  );

  // ---------------------------------------------------------------------------
  // 3. Admin Login UI Inspection (Google-Only, Zero Email/Password Login)
  // ---------------------------------------------------------------------------
  console.log('\n[3] Verifying email/password login is completely removed from AdminLoginPage.tsx...');
  const adminLoginSrc = fs.readFileSync('src/pages/admin/AdminLoginPage.tsx', 'utf8');
  assert(
    !adminLoginSrc.includes('signInWithPassword') &&
      !adminLoginSrc.includes('handlePasswordSignIn') &&
      !adminLoginSrc.includes('type="password"') &&
      !adminLoginSrc.includes('type="email"') &&
      !adminLoginSrc.includes('current-password'),
    'Email/password inputs and signInWithPassword are completely absent from AdminLoginPage.tsx'
  );
  assert(
    adminLoginSrc.includes('signInWithGoogle') &&
      adminLoginSrc.includes('AUTHORIZED_ADMIN_EMAIL') &&
      adminLoginSrc.includes('Sign in with Google'),
    'AdminLoginPage.tsx provides exclusively Google Sign-In restricted to AUTHORIZED_ADMIN_EMAIL'
  );

  // ---------------------------------------------------------------------------
  // 4 & 5. Protected Routes, Sign-Out Purge, OAuth Callback & Session Restoration
  // ---------------------------------------------------------------------------
  console.log('\n[4 & 5] Verifying OAuth callback handling, intent preservation & protected route guards...');
  setAdminOAuthIntent('/admin/payments');
  assert(
    peekAdminOAuthIntent() === '/admin/payments',
    'setAdminOAuthIntent stores deep /admin/payments destination in sessionStorage'
  );
  assert(
    consumeAdminOAuthIntent() === '/admin/payments' &&
      sessionStore.getItem(ADMIN_OAUTH_INTENT_KEY) === null,
    'consumeAdminOAuthIntent returns deep /admin/payments destination once and clears sessionStorage'
  );
  setAdminOAuthIntent('/dashboard/orders');
  assert(
    consumeAdminOAuthIntent() === '/admin',
    'setAdminOAuthIntent sanitizes non-admin paths back to /admin'
  );

  const callbackSrc = fs.readFileSync('src/pages/auth/AuthCallbackPage.tsx', 'utf8');
  assert(
    callbackSrc.includes('await supabase.auth.getSession()') &&
      callbackSrc.includes('if (!session?.user && code)') &&
      callbackSrc.includes('verifyServerAdminSession()') &&
      callbackSrc.includes("navigate('/admin/login?denied=1', { replace: true })"),
    'AuthCallbackPage prevents double-PKCE exchange race, verifies server admin session, and signs out/redirects unauthorized accounts'
  );

  const guardSrc = fs.readFileSync('src/components/auth/AdminProtectedRoute.tsx', 'utf8');
  assert(
    guardSrc.includes('purgeUnauthorizedSession') &&
      guardSrc.includes('to="/admin/login?denied=1"') &&
      guardSrc.includes('isAuthorizedAdminEmail(verification.admin.email)'),
    'AdminProtectedRoute signs out unauthorized accounts and redirects to /admin/login?denied=1 without exposing Admin Dashboard'
  );

  const providerCheck = await checkGoogleOAuthProviderStatus();
  assert(
    typeof providerCheck.enabled === 'boolean' && typeof providerCheck.checked === 'boolean',
    `checkGoogleOAuthProviderStatus preflight executed cleanly (enabled=${providerCheck.enabled}, checked=${providerCheck.checked})`
  );

  // ---------------------------------------------------------------------------
  // 6. MFA Enforcement Verification
  // ---------------------------------------------------------------------------
  console.log('\n[6] Verifying AAL2 TOTP Multi-Factor Authentication enforcement...');
  const mfaRequiredRes = await verifyServerAdminSession({
    isConfigured: true,
    getAuthUser: async () => ({
      user: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'official.amaas.dev@gmail.com',
        email_confirmed_at: '2026-10-01T00:00:00Z',
        user_metadata: { email_verified: true },
      },
      error: null,
    }),
    checkIsAdminRpc: async () => ({ data: true, error: null }),
    fetchProfile: async () => ({
      profile: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'official.amaas.dev@gmail.com',
        full_name: 'AMAAS Official Admin',
        role: 'admin',
        onboarding_completed: true,
      },
      error: null,
    }),
    fetchMfaState: async () => ({
      currentLevel: 'aal1',
      nextLevel: 'aal2',
      verifiedTotpFactors: [
        { id: 'factor-1', friendlyName: 'Admin Authenticator', factorType: 'totp', status: 'verified' },
      ],
      unverifiedTotpFactors: [],
      isMfaEnrolled: true,
      isMfaVerifiedForSession: false,
    }),
  });
  assert(
    mfaRequiredRes.status === 'mfa_required',
    'Enrolled TOTP factor at AAL1 strictly requires MFA step-up before granting authorized status'
  );

  const mfaVerifiedRes = await verifyServerAdminSession({
    isConfigured: true,
    getAuthUser: async () => ({
      user: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'official.amaas.dev@gmail.com',
        email_confirmed_at: '2026-10-01T00:00:00Z',
        user_metadata: { email_verified: true },
      },
      error: null,
    }),
    checkIsAdminRpc: async () => ({ data: true, error: null }),
    fetchProfile: async () => ({
      profile: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'official.amaas.dev@gmail.com',
        full_name: 'AMAAS Official Admin',
        role: 'admin',
        onboarding_completed: true,
      },
      error: null,
    }),
    fetchMfaState: async () => ({
      currentLevel: 'aal2',
      nextLevel: 'aal2',
      verifiedTotpFactors: [
        { id: 'factor-1', friendlyName: 'Admin Authenticator', factorType: 'totp', status: 'verified' },
      ],
      unverifiedTotpFactors: [],
      isMfaEnrolled: true,
      isMfaVerifiedForSession: true,
    }),
  });
  assert(
    mfaVerifiedRes.status === 'authorized',
    'Enrolled TOTP factor at AAL2 unlocks authorized status cleanly'
  );

  // ---------------------------------------------------------------------------
  // 7, 8, 9 & 10. Automatic PWA Install Prompt, Dismissal, Standalone Suppression & Fallbacks
  // ---------------------------------------------------------------------------
  console.log('\n[7, 8, 9 & 10] Verifying Automatic Admin App Install Prompt, dismissal & platform fallbacks...');
  assert(
    ADMIN_INSTALL_PROMPT_COPY.title === 'Install GoAMAAS Admin' &&
      ADMIN_INSTALL_PROMPT_COPY.description ===
        'Install the Admin App for quick and convenient access.' &&
      ADMIN_INSTALL_PROMPT_COPY.primaryButton === 'Install App' &&
      ADMIN_INSTALL_PROMPT_COPY.secondaryButton === 'Not Now',
    'AdminPWAInstallPrompt matches exact required title, description, Install App, and Not Now copy'
  );

  resetAdminInstallPromptDismissal();
  assert(
    !isAdminInstallPromptDismissed(),
    'Install prompt dismissal starts clean before user dismisses'
  );
  assert(
    shouldShowAutoAdminInstallPrompt({
      canPromptInstall: true,
      isIOS: false,
      isInstalled: false,
      isDismissed: false,
      isEmbeddedIframe: false,
    }) === true,
    'Install prompt appears automatically when beforeinstallprompt is available on Android/Desktop Chrome'
  );

  // Dismiss prompt -> must NOT re-appear
  const dismissedTime = 1_700_000_000_000;
  dismissAdminInstallPrompt(dismissedTime);
  assert(
    isAdminInstallPromptDismissed(dismissedTime + 60_000) === true,
    'Dismissal persists across page loads within cooldown window'
  );
  assert(
    shouldShowAutoAdminInstallPrompt({
      canPromptInstall: true,
      isIOS: false,
      isInstalled: false,
      isDismissed: isAdminInstallPromptDismissed(dismissedTime + 60_000),
      isEmbeddedIframe: false,
    }) === false,
    'Prompt does not repeatedly interrupt users after clicking Not Now'
  );
  assert(
    isAdminInstallPromptDismissed(dismissedTime + ADMIN_PWA_DISMISS_COOLDOWN_MS + 1000) === false,
    'Dismissal expires cleanly after 14-day cooldown window'
  );

  // Installed app -> never show redundant prompt
  resetAdminInstallPromptDismissal();
  assert(
    shouldShowAutoAdminInstallPrompt({
      canPromptInstall: true,
      isIOS: false,
      isInstalled: true,
      isDismissed: false,
      isEmbeddedIframe: false,
    }) === false &&
      shouldShowAutoAdminInstallPrompt({
        canPromptInstall: false,
        isIOS: true,
        isInstalled: true,
        isDismissed: false,
        isEmbeddedIframe: false,
      }) === false,
    'Already installed standalone apps never receive redundant installation prompts'
  );

  // Platform detection: Android Chrome, Desktop Chrome, iOS Safari
  const iosSafari = detectAdminPlatform(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
  );
  assert(
    iosSafari.isIOS && iosSafari.isSafari && !iosSafari.isAndroid,
    'Correctly detects iOS Safari for Share -> Add to Home Screen instructions'
  );
  assert(
    shouldShowAutoAdminInstallPrompt({
      canPromptInstall: false,
      isIOS: true,
      isInstalled: false,
      isDismissed: false,
      isEmbeddedIframe: false,
    }) === true,
    'iOS Safari displays manual installation guidance when not installed and not dismissed'
  );

  const androidChrome = detectAdminPlatform(
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
  );
  assert(
    androidChrome.isAndroid && !androidChrome.isIOS && !androidChrome.isSafari,
    'Correctly detects Android Chrome'
  );

  const desktopChrome = detectAdminPlatform(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  );
  assert(
    !desktopChrome.isAndroid && !desktopChrome.isIOS && !desktopChrome.isSafari,
    'Correctly detects Desktop Chrome'
  );

  const pwaBannerSrc = fs.readFileSync('src/components/admin/AdminPWAInstallBanner.tsx', 'utf8');
  assert(
    pwaBannerSrc.includes('Add to Home Screen') &&
      pwaBannerSrc.includes('Share') &&
      pwaBannerSrc.includes('Automatic prompt unavailable in this browser view'),
    'AdminPWAInstallBanner includes iOS Share -> Add to Home Screen instructions and unavailable browser fallback message'
  );

  // ---------------------------------------------------------------------------
  // 11 & 12. Service Worker Sensitive-Data Protection & Customer App Preservation
  // ---------------------------------------------------------------------------
  console.log('\n[11 & 12] Verifying Admin PWA cache isolation & customer login/pages preservation...');
  const swSrc = fs.readFileSync('public/admin-sw.js', 'utf8');
  assert(
    swSrc.includes("cache: 'no-store'") &&
      swSrc.includes("url.pathname.startsWith('/auth/')") &&
      swSrc.includes("url.pathname.includes('/realtime/v1/')") &&
      swSrc.includes("payload.type === 'ADMIN_SIGN_OUT'"),
    'admin-sw.js enforces cache: no-store on /admin navigations, bypasses auth/realtime/API routes, and purges on ADMIN_SIGN_OUT'
  );

  const customerLoginSrc = fs.readFileSync('src/pages/auth/LoginPage.tsx', 'utf8');
  assert(
    customerLoginSrc.includes('loginWithEmail') && customerLoginSrc.includes('loginWithGoogle'),
    'Customer-facing LoginPage preserves both email/password and Google authentication'
  );

  console.log('\n✅ ALL 12/12 ADMIN GOOGLE AUTH, SINGLE-EMAIL RESTRICTION & PWA INSTALL PROMPT SUITES PASSED!');
}

run().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});

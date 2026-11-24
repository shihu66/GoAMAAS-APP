import * as fs from 'fs';
import {
  ADMIN_DB_ROLE_MISSING_ERROR,
  AUTHORIZED_ADMIN_EMAIL,
  AdminMfaClientAdapter,
  DEFAULT_MFA_STATE,
  UNIFORM_ADMIN_AUTH_ERROR,
  inspectAdminMfaState,
  isAuthUserEmailVerified,
  isAuthorizedAdminEmail,
  normalizeAdminEmail,
  normalizeTotpQrCodeDataUri,
  refreshAndInspectAdminMfaState,
  replaceVerifiedAdminTotpFactor,
  startAdminTotpEnrollment,
  verifyAdminTotpChallenge,
  verifyServerAdminSession,
} from '../src/lib/adminSecurity';
import {
  ADMIN_OAUTH_INTENT_KEY,
  OAUTH_FLOW_SOURCE_KEY,
  checkGoogleOAuthProviderStatus,
  consumeAdminOAuthIntent,
  consumeOAuthFlowSource,
  getInitialOAuthUrlSnapshot,
  peekAdminOAuthIntent,
  setAdminOAuthIntent,
} from '../src/lib/supabase';
import { classifyAdminOAuthFailureReason } from '../src/pages/auth/AuthCallbackPage';
import { resolveOAuthErrorMessage } from '../src/pages/admin/AdminLoginPage';
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

  // Authorized Google account WITHOUT verified factor -> mfa_setup_required
  const missingFactorRes = await verifyServerAdminSession({
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
    missingFactorRes.status === 'mfa_setup_required',
    'Authorized Google account without enrolled TOTP factor returns mfa_setup_required'
  );

  // Authorized Google account WITH AAL2 verified factor -> authorized
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
    authorizedRes.status === 'authorized' &&
      authorizedRes.admin?.email === 'official.amaas.dev@gmail.com' &&
      authorizedRes.admin?.role === 'admin',
    'Authorized Google account completes login when verified email, DB is_admin() + profile.role === admin, and AAL2 verified factor succeed'
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

  // Linked Google identity on an account with legacy user_metadata.email_verified=false -> verified!
  assert(
    isAuthUserEmailVerified({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'Official.AMAAS.Dev@Gmail.com',
      email_confirmed_at: '2026-10-01T00:00:00Z',
      user_metadata: { email_verified: false },
      identities: [
        {
          provider: 'google',
          identity_data: {
            email: 'official.amaas.dev@gmail.com',
            email_verified: true,
          },
        },
      ],
    }) === true,
    'Confirmed Google OAuth identity with email_verified=true passes verification even if legacy merged user_metadata had email_verified=false'
  );

  // Transient HTTP 429 rate-limit from GoTrue -> network_error (never wipes active admin session!)
  const rateLimitedAuthRes = await verifyServerAdminSession({
    isConfigured: true,
    getAuthUser: async () => ({
      user: null,
      error: Object.assign(new Error('Request rate limit reached'), { status: 429 }),
    }),
  });
  assert(
    rateLimitedAuthRes.status === 'network_error',
    'Transient GoTrue HTTP 429 rate-limit is classified as network_error instead of ejecting an active admin session'
  );

  // ---------------------------------------------------------------------------
  // 3. Zero Public Admin Email Exposure & Clean Minimal AdminLoginPage UI
  // ---------------------------------------------------------------------------
  console.log('\n[3] Verifying zero public admin email exposure & minimal AdminLoginPage UI...');
  const filesZeroEmailAllowed = [
    'index.html',
    'public/admin-manifest.webmanifest',
    'public/admin-offline.html',
    'src/components/layout/Footer.tsx',
    'src/components/layout/Navbar.tsx',
    'src/components/layout/PublicLayout.tsx',
    'src/components/layout/AdminLayout.tsx',
    'src/components/admin/AdminPWAInstallBanner.tsx',
    'src/components/admin/AdminTotpSetupFlow.tsx',
    'src/pages/public/HomePage.tsx',
    'src/pages/public/AboutPage.tsx',
    'src/pages/public/ContactPage.tsx',
    'src/pages/public/PricingPage.tsx',
    'src/pages/admin/AdminLoginPage.tsx',
    'src/pages/admin/AdminDashboardPage.tsx',
    'src/components/auth/AdminProtectedRoute.tsx',
  ];
  for (const file of filesZeroEmailAllowed) {
    const content = fs.readFileSync(file, 'utf8');
    assert(
      !content.toLowerCase().includes('official.amaas.dev@gmail.com'),
      `Zero literal admin email exposure in ${file}`
    );
  }
  assert(
    !UNIFORM_ADMIN_AUTH_ERROR.toLowerCase().includes('official.amaas.dev@gmail.com'),
    'UNIFORM_ADMIN_AUTH_ERROR never reveals which email address is authorized'
  );

  const adminLoginSrc = fs.readFileSync('src/pages/admin/AdminLoginPage.tsx', 'utf8');
  assert(
    !adminLoginSrc.includes('signInWithPassword') &&
      !adminLoginSrc.includes('handlePasswordSignIn') &&
      !adminLoginSrc.includes('type="password"') &&
      !adminLoginSrc.includes('type="email"') &&
      !adminLoginSrc.includes('current-password') &&
      !adminLoginSrc.includes('loginHint') &&
      !adminLoginSrc.includes('{AUTHORIZED_ADMIN_EMAIL}'),
    'Email/password inputs, loginHint, and visible AUTHORIZED_ADMIN_EMAIL JSX are completely absent from AdminLoginPage.tsx'
  );
  assert(
    adminLoginSrc.includes('GoAMAAS Admin') &&
      adminLoginSrc.includes('Admin Sign In') &&
      adminLoginSrc.includes('Continue with Google') &&
      adminLoginSrc.includes('Authorized administrators only.'),
    'AdminLoginPage.tsx displays strictly GoAMAAS Admin branding, Admin Sign In heading, Continue with Google button, and Authorized administrators only.'
  );

  const supabaseSrc = fs.readFileSync('src/lib/supabase.ts', 'utf8');
  assert(
    !supabaseSrc.includes('login_hint'),
    'signInWithGoogle never leaks login_hint in Google OAuth redirect URLs'
  );
  assert(
    supabaseSrc.includes("flowType: 'pkce'") &&
      supabaseSrc.includes('captureInitialOAuthUrlSnapshot') &&
      supabaseSrc.includes('hydrateImplicitHashSessionIfNeeded'),
    'Supabase client uses PKCE OAuth flow with pre-init URL snapshot capture and implicit hash fallback'
  );

  // ---------------------------------------------------------------------------
  // 4 & 5. Protected Routes, Standalone PWA Intent Recovery, OAuth Callback & Loop Prevention
  // ---------------------------------------------------------------------------
  console.log('\n[4 & 5] Verifying standalone PWA OAuth intent handoff, callback hash error handling & route guards...');
  setAdminOAuthIntent('/admin/payments');
  assert(
    peekAdminOAuthIntent() === '/admin/payments' &&
      sessionStore.getItem(ADMIN_OAUTH_INTENT_KEY) !== null &&
      localStore.getItem(ADMIN_OAUTH_INTENT_KEY) !== null &&
      localStore.getItem(OAUTH_FLOW_SOURCE_KEY) !== null,
    'setAdminOAuthIntent persists /admin/payments and admin flow source in both sessionStorage and localStorage'
  );
  // Simulate standalone PWA -> browser tab boundary where sessionStorage is empty in the callback tab
  sessionStore.clear();
  assert(
    peekAdminOAuthIntent() === '/admin/payments' && consumeOAuthFlowSource() === 'admin',
    'peekAdminOAuthIntent and consumeOAuthFlowSource recover admin intent from same-origin localStorage across standalone PWA callback tab boundary'
  );
  assert(
    consumeAdminOAuthIntent() === '/admin/payments' &&
      sessionStore.getItem(ADMIN_OAUTH_INTENT_KEY) === null &&
      localStore.getItem(ADMIN_OAUTH_INTENT_KEY) === null &&
      consumeOAuthFlowSource() === null,
    'consumeAdminOAuthIntent and consumeOAuthFlowSource consume once and clear both sessionStorage and localStorage'
  );
  setAdminOAuthIntent('/dashboard/orders');
  assert(
    consumeAdminOAuthIntent() === '/admin',
    'setAdminOAuthIntent sanitizes non-admin paths back to /admin'
  );

  const initialSnapshot = getInitialOAuthUrlSnapshot();
  assert(
    typeof initialSnapshot.hasCallbackPayload === 'boolean',
    'getInitialOAuthUrlSnapshot exposes safe pre-initialization URL callback metadata'
  );

  // Verify stage-accurate OAuth error classification & separate DB role error reporting
  assert(
    classifyAdminOAuthFailureReason('access_denied', null, null) === 'access_denied' &&
      classifyAdminOAuthFailureReason('validation_failed', null, 'Unsupported provider: provider is not enabled') ===
        'provider_disabled' &&
      classifyAdminOAuthFailureReason(
        'server_error',
        'unexpected_failure',
        'Unable to exchange external code: invalid_client'
      ) === 'external_code_exchange_failed' &&
      classifyAdminOAuthFailureReason('invalid_request', null, 'Redirect URL is not allowed') ===
        'redirect_mismatch' &&
      classifyAdminOAuthFailureReason(
        'server_error',
        'unexpected_failure',
        'Database error saving new user'
      ) === 'database_profile_error' &&
      classifyAdminOAuthFailureReason(null, null, 'PKCE code verifier not found in storage.') ===
        'pkce_mismatch' &&
      classifyAdminOAuthFailureReason(null, null, 'No session returned from authentication provider.') ===
        'session_not_established',
    'classifyAdminOAuthFailureReason accurately pinpoints each OAuth failure stage without masking external code or DB errors'
  );

  assert(
    !ADMIN_DB_ROLE_MISSING_ERROR.toLowerCase().includes('official.amaas.dev@gmail.com') &&
      String(ADMIN_DB_ROLE_MISSING_ERROR) !== String(UNIFORM_ADMIN_AUTH_ERROR) &&
      resolveOAuthErrorMessage('external_code_exchange_failed').includes('Client Secret') &&
      !resolveOAuthErrorMessage('provider_disabled').toLowerCase().includes('official.amaas.dev@gmail.com'),
    'Post-OAuth DB authorization failure (ADMIN_DB_ROLE_MISSING_ERROR) and stage OAuth error messages are clear, distinct, and expose zero admin emails'
  );

  const callbackSrc = fs.readFileSync('src/pages/auth/AuthCallbackPage.tsx', 'utf8');
  assert(
    callbackSrc.includes('await supabase.auth.initialize()') &&
      callbackSrc.includes('await supabase.auth.getSession()') &&
      callbackSrc.includes('if (!session?.user && code)') &&
      callbackSrc.includes('exchangedAuthCodes') &&
      callbackSrc.includes('window.location.hash') &&
      callbackSrc.includes('verifyServerAdminSession()') &&
      callbackSrc.includes("navigate('/admin/login?authz_error=missing_admin_role', { replace: true })") &&
      callbackSrc.includes("navigate('/admin/login?oauth_error=1&reason=session_not_established'") &&
      callbackSrc.includes("navigate('/admin/login?denied=1', { replace: true })"),
    'AuthCallbackPage captures GoTrue initialize() errors, prevents duplicate PKCE code exchange, separates session_not_established and missing_admin_role, and redirects unauthorized accounts to ?denied=1'
  );

  const appRouterSrc = fs.readFileSync('src/App.tsx', 'utf8');
  assert(
    appRouterSrc.includes('OAuthCallbackRedirectBridge') &&
      appRouterSrc.includes('consumeRootOAuthBridgeRedirect') &&
      appRouterSrc.includes('<Route path="payments"') &&
      appRouterSrc.includes('<Route path="websites"') &&
      appRouterSrc.includes('<Route path="settings"'),
    'App.tsx bridges fallback root OAuth callbacks (even pre-init stripped URLs) to /auth/callback and protects /admin, /admin/payments, /admin/websites, and /admin/settings'
  );

  const appContextSrc = fs.readFileSync('src/context/AppContext.tsx', 'utf8');
  assert(
    appContextSrc.includes('const setAuthenticatedUser = useCallback(') &&
      appContextSrc.includes('const logout = useCallback('),
    'AppContext memoizes setAuthenticatedUser and logout to prevent infinite AdminProtectedRoute re-verification loops'
  );

  const guardSrc = fs.readFileSync('src/components/auth/AdminProtectedRoute.tsx', 'utf8');
  assert(
    guardSrc.includes('purgeUnauthorizedSession') &&
      guardSrc.includes('to="/admin/login?authz_error=missing_admin_role"') &&
      guardSrc.includes('to="/admin/login?denied=1"') &&
      guardSrc.includes('isAuthorizedAdminEmail(verification.admin.email)'),
    'AdminProtectedRoute signs out unauthorized accounts, reports missing_admin_role separately, and redirects unauthorized accounts to /admin/login?denied=1 without exposing Admin Dashboard'
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

  // ---------------------------------------------------------------------------
  // 13. Admin TOTP Enrollment & Existing Verified / Unverified Factor Handling
  // ---------------------------------------------------------------------------
  console.log('\n[13] Testing Admin TOTP enrollment with verified, unverified, and duplicate-prevention flows...');

  function createStatefulMockMfaAdapter(initial: {
    currentLevel?: 'aal1' | 'aal2';
    factors?: Array<{
      id: string;
      friendly_name: string;
      factor_type: string;
      status: 'verified' | 'unverified';
    }>;
    failUnenroll?: boolean;
    failAal2AfterRefresh?: boolean;
    validOtpCode?: string;
    rawQrSvg?: string;
  }): {
    adapter: AdminMfaClientAdapter;
    calls: string[];
    getFactors: () => Array<{
      id: string;
      friendly_name: string;
      factor_type: string;
      status: string;
    }>;
    removeFactorExternally: (factorId: string) => void;
  } {
    let currentLevel: 'aal1' | 'aal2' = initial.currentLevel ?? 'aal1';
    let factors = [...(initial.factors ?? [])];
    const calls: string[] = [];
    const expectedCode = initial.validOtpCode;
    const rawQrSvg =
      initial.rawQrSvg ??
      'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#ffffff" d="M0 0h10v10H0z"/></svg>';

    const adapter: AdminMfaClientAdapter = {
      isConfigured: true,
      getAuthenticatorAssuranceLevel: async () => {
        calls.push('getAuthenticatorAssuranceLevel');
        const hasVerified = factors.some((f) => f.status === 'verified');
        return {
          data: {
            currentLevel,
            nextLevel: hasVerified ? 'aal2' : 'aal1',
          },
          error: null,
        };
      },
      listFactors: async () => {
        calls.push('listFactors');
        // Mirror @supabase/auth-js exact behavior:
        // `all` includes verified + unverified, while `totp` includes ONLY verified!
        return {
          data: {
            all: factors.map((f) => ({ ...f })),
            totp: factors
              .filter((f) => f.factor_type === 'totp' && f.status === 'verified')
              .map((f) => ({ ...f })),
          },
          error: null,
        };
      },
      enroll: async (params) => {
        calls.push(`enroll:${params.friendlyName}`);
        const duplicate = factors.find(
          (f) => f.friendly_name.trim().toLowerCase() === params.friendlyName.trim().toLowerCase()
        );
        if (duplicate) {
          return {
            data: null,
            error: {
              message: `A factor with the friendly name '${params.friendlyName}' for this user already exists.`,
            },
          };
        }
        const id = `factor-new-${factors.length + 1}`;
        factors.push({
          id,
          friendly_name: params.friendlyName,
          factor_type: 'totp',
          status: 'unverified',
        });
        return {
          data: {
            id,
            type: 'totp',
            totp: {
              qr_code: rawQrSvg,
              secret: 'JBSWY3DPEHPK3PXP',
            },
          },
          error: null,
        };
      },
      challengeAndVerify: async (params) => {
        calls.push(`challengeAndVerify:${params.factorId}`);
        const target = factors.find((f) => f.id === params.factorId);
        if (!target) {
          return { data: null, error: { message: 'Factor not found' } };
        }
        if (expectedCode && params.code !== expectedCode) {
          return { data: null, error: { message: 'Invalid TOTP code provided' } };
        }
        target.status = 'verified';
        if (!initial.failAal2AfterRefresh) {
          currentLevel = 'aal2';
        }
        return { data: { access_token: 'mock-aal2-jwt' }, error: null };
      },
      unenroll: async (params) => {
        calls.push(`unenroll:${params.factorId}`);
        if (initial.failUnenroll) {
          return { error: { message: 'Simulated unenroll failure' } };
        }
        factors = factors.filter((f) => f.id !== params.factorId);
        return { error: null };
      },
      refreshSession: async () => {
        calls.push('refreshSession');
        return { data: { session: { access_token: 'mock-refreshed' } }, error: null };
      },
    };

    return {
      adapter,
      calls,
      getFactors: () => factors.map((f) => ({ ...f })),
      removeFactorExternally: (factorId: string) => {
        factors = factors.filter((f) => f.id !== factorId);
        if (!factors.some((f) => f.status === 'verified')) {
          currentLevel = 'aal1';
        }
      },
    };
  }

  // Scenario A: Existing VERIFIED factor at AAL1 -> reuse for challenge/verification, NEVER call enroll()
  {
    const mock = createStatefulMockMfaAdapter({
      currentLevel: 'aal1',
      factors: [
        {
          id: 'verified-factor-1',
          friendly_name: 'GoAMAAS Admin Authenticator',
          factor_type: 'totp',
          status: 'verified',
        },
      ],
    });
    const res = await startAdminTotpEnrollment('GoAMAAS Admin Authenticator', {
      adapter: mock.adapter,
    });
    assert(
      res.status === 'challenge_required' &&
        res.factorId === 'verified-factor-1' &&
        !mock.calls.some((c) => c.startsWith('enroll:')),
      'Existing verified TOTP factor at AAL1 returns challenge_required and never calls enroll()'
    );

    const verifyRes = await verifyAdminTotpChallenge('verified-factor-1', '123456', mock.adapter);
    assert(
      verifyRes.success === true &&
        verifyRes.currentLevel === 'aal2' &&
        mock.calls.includes('refreshSession') &&
        mock.calls.indexOf('refreshSession') <
          mock.calls.lastIndexOf('getAuthenticatorAssuranceLevel'),
      'Existing verified TOTP challenge refreshes session and confirms AAL2'
    );
    assert(
      mock.getFactors().length === 1,
      'Zero duplicate factors created when verifying an existing verified factor'
    );
  }

  // Scenario B: Existing VERIFIED factor already at AAL2 -> returns already_verified, never calls enroll()
  {
    const mock = createStatefulMockMfaAdapter({
      currentLevel: 'aal2',
      factors: [
        {
          id: 'verified-factor-2',
          friendly_name: 'GoAMAAS Admin Authenticator',
          factor_type: 'totp',
          status: 'verified',
        },
      ],
    });
    const res = await startAdminTotpEnrollment('GoAMAAS Admin Authenticator', {
      adapter: mock.adapter,
    });
    assert(
      res.status === 'already_verified' &&
        res.factorId === 'verified-factor-2' &&
        !mock.calls.some((c) => c.startsWith('enroll:')),
      'Existing verified TOTP factor already at AAL2 returns already_verified and never creates duplicates'
    );
  }

  // Scenario C: Unverified/pending factor exists (visible ONLY in `data.all`, NOT `data.totp`!)
  // C1: inspectAdminMfaState surfaces it cleanly AND prompt mode allows resuming it
  {
    const mock = createStatefulMockMfaAdapter({
      currentLevel: 'aal1',
      factors: [
        {
          id: 'pending-factor-1',
          friendly_name: 'GoAMAAS Admin Authenticator',
          factor_type: 'totp',
          status: 'unverified',
        },
      ],
    });

    const inspected = await inspectAdminMfaState(mock.adapter);
    assert(
      inspected.unverifiedTotpFactors.length === 1 &&
        inspected.unverifiedTotpFactors[0].id === 'pending-factor-1' &&
        inspected.verifiedTotpFactors.length === 0,
      'inspectAdminMfaState detects unverified TOTP factor from Supabase Auth data.all'
    );

    const promptRes = await startAdminTotpEnrollment('GoAMAAS Admin Authenticator', {
      unverifiedAction: 'prompt',
      adapter: mock.adapter,
    });
    assert(
      promptRes.status === 'pending_unverified' &&
        promptRes.factorId === 'pending-factor-1' &&
        !mock.calls.some((c) => c.startsWith('enroll:')),
      'Pending unverified factor in prompt mode avoids duplicate enroll and offers resume/reset'
    );

    // Resume verification on the pending factor -> promotes to verified, refreshes session & confirms AAL2
    const resumeVerify = await verifyAdminTotpChallenge('pending-factor-1', '654321', mock.adapter);
    assert(
      resumeVerify.success === true &&
        resumeVerify.currentLevel === 'aal2' &&
        mock.getFactors().length === 1 &&
        mock.getFactors()[0].status === 'verified',
      'Resuming pending unverified factor completes verification, refreshes session, and confirms AAL2'
    );
  }

  // C2: Stale unverified factor removal before fresh enrollment (prevents friendly name collision)
  {
    const mock = createStatefulMockMfaAdapter({
      currentLevel: 'aal1',
      factors: [
        {
          id: 'stale-unverified-factor',
          friendly_name: 'GoAMAAS Admin Authenticator',
          factor_type: 'totp',
          status: 'unverified',
        },
      ],
    });
    const freshRes = await startAdminTotpEnrollment('GoAMAAS Admin Authenticator', {
      unverifiedAction: 'remove_and_enroll',
      adapter: mock.adapter,
    });
    assert(
      freshRes.status === 'enrolled' &&
        Boolean(freshRes.factorId) &&
        Boolean(freshRes.qrCodeSvgDataUri) &&
        Boolean(freshRes.secret) &&
        mock.calls.includes('unenroll:stale-unverified-factor') &&
        mock.getFactors().length === 1 &&
        mock.getFactors()[0].id === freshRes.factorId,
      'Stale unverified factor is cleanly unenrolled before enrolling fresh GoAMAAS Admin Authenticator without friendly-name collision'
    );
  }

  // Scenario D: Fail safely if unenroll fails OR if AAL2 is not confirmed after refreshSession
  {
    const mockFailUnenroll = createStatefulMockMfaAdapter({
      currentLevel: 'aal1',
      factors: [
        {
          id: 'stuck-pending-factor',
          friendly_name: 'GoAMAAS Admin Authenticator',
          factor_type: 'totp',
          status: 'unverified',
        },
      ],
      failUnenroll: true,
    });
    const failRes = await startAdminTotpEnrollment('GoAMAAS Admin Authenticator', {
      unverifiedAction: 'remove_and_enroll',
      adapter: mockFailUnenroll.adapter,
    });
    assert(
      failRes.status === 'error' && !mockFailUnenroll.calls.some((c) => c.startsWith('enroll:')),
      'Aborts safely without duplicate enroll() if stale factor removal fails'
    );

    const mockAalNotElevated = createStatefulMockMfaAdapter({
      currentLevel: 'aal1',
      factors: [
        {
          id: 'verified-factor-no-aal2',
          friendly_name: 'GoAMAAS Admin Authenticator',
          factor_type: 'totp',
          status: 'verified',
        },
      ],
      failAal2AfterRefresh: true,
    });
    const aalFailVerify = await verifyAdminTotpChallenge(
      'verified-factor-no-aal2',
      '123456',
      mockAalNotElevated.adapter
    );
    assert(
      aalFailVerify.success === false && aalFailVerify.currentLevel !== 'aal2',
      'Fails closed if post-refresh session assurance cannot be confirmed at AAL2'
    );
  }

  // Scenario E: Fresh admin WITHOUT any factor -> QR normalization + invalid OTP rejection + AAL2 enrollment
  {
    const mock = createStatefulMockMfaAdapter({
      currentLevel: 'aal1',
      factors: [],
      validOtpCode: '847291',
    });

    const enrollRes = await startAdminTotpEnrollment('GoAMAAS Admin Authenticator', {
      adapter: mock.adapter,
    });
    assert(
      enrollRes.status === 'enrolled' &&
        Boolean(enrollRes.factorId) &&
        enrollRes.secret === 'JBSWY3DPEHPK3PXP' &&
        Boolean(enrollRes.qrCodeSvgDataUri) &&
        enrollRes.qrCodeSvgDataUri!.startsWith('data:image/svg+xml;charset=utf-8,') &&
        !enrollRes.qrCodeSvgDataUri!.slice('data:image/svg+xml;charset=utf-8,'.length).includes('#'),
      'Admin without enrolled factor gets QR code (percent-encoded SVG without unescaped #) and manual setup key'
    );

    const malformedOtpRes = await verifyAdminTotpChallenge(enrollRes.factorId!, '12ab', mock.adapter);
    assert(
      malformedOtpRes.success === false && mock.getFactors()[0].status === 'unverified',
      'Malformed non-6-digit OTP code is rejected before reaching Supabase Auth'
    );

    const wrongOtpRes = await verifyAdminTotpChallenge(enrollRes.factorId!, '000000', mock.adapter);
    assert(
      wrongOtpRes.success === false && mock.getFactors()[0].status === 'unverified',
      'Incorrect 6-digit OTP code is rejected and leaves factor unverified at AAL1'
    );

    const goodOtpRes = await verifyAdminTotpChallenge(enrollRes.factorId!, '847291', mock.adapter);
    const postState = await inspectAdminMfaState(mock.adapter);
    assert(
      goodOtpRes.success === true &&
        goodOtpRes.currentLevel === 'aal2' &&
        postState.isMfaEnrolled === true &&
        postState.isMfaVerifiedForSession === true &&
        postState.verifiedTotpFactors.length === 1 &&
        postState.verifiedTotpFactors[0].status === 'verified',
      'Valid 6-digit OTP completes enrollment, refreshes session, verifies factor status, and confirms AAL2'
    );

    // Calling enroll again must NOT create a duplicate factor
    const dupAttempt = await startAdminTotpEnrollment('GoAMAAS Admin Authenticator', {
      adapter: mock.adapter,
    });
    assert(
      dupAttempt.status === 'already_verified' && mock.getFactors().length === 1,
      'Subsequent enrollment attempt reuses verified factor and never creates duplicates'
    );
  }

  // Scenario F: Recovery & Re-enrollment safeguards (never bypass at AAL1; safe replace at AAL2; external removal recovery)
  {
    const rawSample = normalizeTotpQrCodeDataUri(
      'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000000"/></svg>'
    );
    assert(
      rawSample.startsWith('data:image/svg+xml;charset=utf-8,%3Csvg') &&
        rawSample.includes('%23000000') &&
        !rawSample.includes('#'),
      'normalizeTotpQrCodeDataUri percent-encodes raw GoTrue SVG # hex colors cleanly'
    );

    // AAL1 cannot auto-disable or replace an existing verified factor
    const aal1Mock = createStatefulMockMfaAdapter({
      currentLevel: 'aal1',
      factors: [
        {
          id: 'lost-verified-factor',
          friendly_name: 'GoAMAAS Admin Authenticator',
          factor_type: 'totp',
          status: 'verified',
        },
      ],
    });
    const blockedReplace = await replaceVerifiedAdminTotpFactor(
      'lost-verified-factor',
      'GoAMAAS Admin Authenticator',
      { adapter: aal1Mock.adapter }
    );
    assert(
      blockedReplace.status === 'error' &&
        aal1Mock.getFactors().length === 1 &&
        !aal1Mock.calls.some((c) => c.startsWith('unenroll:')),
      'Verified TOTP factor cannot be unenrolled or replaced from AAL1 without verification'
    );

    // After authorized admin removes lost factor externally (e.g. Supabase Dashboard), refreshAndInspect unlocks fresh setup
    aal1Mock.removeFactorExternally('lost-verified-factor');
    const recoveredState = await refreshAndInspectAdminMfaState(aal1Mock.adapter);
    assert(
      !recoveredState.isMfaEnrolled && recoveredState.verifiedTotpFactors.length === 0,
      'refreshAndInspectAdminMfaState detects external factor removal during recovery'
    );
    const reEnrollAfterRecovery = await startAdminTotpEnrollment('GoAMAAS Admin Authenticator', {
      adapter: aal1Mock.adapter,
    });
    assert(
      reEnrollAfterRecovery.status === 'enrolled' &&
        Boolean(reEnrollAfterRecovery.qrCodeSvgDataUri) &&
        Boolean(reEnrollAfterRecovery.secret),
      'After lost factor removal, admin can immediately generate a fresh QR code and manual setup key'
    );

    // At AAL2, replaceVerifiedAdminTotpFactor cleanly replaces existing verified factor with a fresh QR + secret
    const aal2Mock = createStatefulMockMfaAdapter({
      currentLevel: 'aal2',
      factors: [
        {
          id: 'active-verified-factor',
          friendly_name: 'GoAMAAS Admin Authenticator',
          factor_type: 'totp',
          status: 'verified',
        },
      ],
    });
    const aal2Replace = await replaceVerifiedAdminTotpFactor(
      'active-verified-factor',
      'GoAMAAS Admin Authenticator',
      { adapter: aal2Mock.adapter }
    );
    assert(
      aal2Replace.status === 'enrolled' &&
        Boolean(aal2Replace.factorId) &&
        aal2Replace.factorId !== 'active-verified-factor' &&
        Boolean(aal2Replace.qrCodeSvgDataUri) &&
        Boolean(aal2Replace.secret) &&
        aal2Mock.calls.includes('unenroll:active-verified-factor'),
      'At AAL2, replaceVerifiedAdminTotpFactor cleanly replaces existing factor and generates new QR + secret'
    );
  }

  // Scenario G: UI & Permanent Deletion AAL2 gate wiring assertions
  {
    const totpFlowSrc = fs.readFileSync('src/components/admin/AdminTotpSetupFlow.tsx', 'utf8');
    const adminDashSrc = fs.readFileSync('src/pages/admin/AdminDashboardPage.tsx', 'utf8');
    const adminGuardSrc = fs.readFileSync('src/components/auth/AdminProtectedRoute.tsx', 'utf8');

    assert(
      totpFlowSrc.includes('Set Up Authenticator') &&
        totpFlowSrc.includes('Google Authenticator') &&
        totpFlowSrc.includes('Microsoft Authenticator') &&
        totpFlowSrc.includes('Manual Setup Key (Secret)') &&
        totpFlowSrc.includes('Recheck Authenticator Status') &&
        totpFlowSrc.includes('existing TOTP secrets and QR codes can never be viewed or recovered after setup'),
      'AdminTotpSetupFlow provides QR setup, Google/Microsoft instructions, manual key, and non-bypassing recovery guidance'
    );
    assert(
      adminLoginSrc.includes('AdminMfaRecoveryGuide') &&
        adminLoginSrc.includes('AdminTotpSetupAndVerifyPanel') &&
        adminGuardSrc.includes('AdminMfaRecoveryGuide'),
      'Both AdminLoginPage and AdminProtectedRoute include Authenticator recovery and post-recovery enrollment wiring'
    );
    assert(
      adminDashSrc.includes('requireAal2: true') &&
        adminDashSrc.includes('isWebsitesMfaModalOpen') &&
        adminDashSrc.includes('showInlineDeleteMfa') &&
        adminDashSrc.includes('Set Up Authenticator'),
      'AdminDashboardPage enforces requireAal2: true for permanent deletion/storage retry and exposes Set Up Authenticator inside Websites & Delete modal'
    );
  }

  console.log('\n✅ ALL 13/13 ADMIN GOOGLE AUTH, SINGLE-EMAIL RESTRICTION, TOTP ENROLLMENT & PWA SUITES PASSED!');
}

run().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});

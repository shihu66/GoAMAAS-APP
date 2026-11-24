import { supabase, isSupabaseConfigured, getUserProfile, UserProfileRecord } from './supabase';

export const AUTHORIZED_ADMIN_EMAIL = 'official.amaas.dev@gmail.com';

export type AdminAuthStatus =
  | 'authorized'
  | 'mfa_required'
  | 'unauthenticated'
  | 'forbidden'
  | 'unconfigured'
  | 'network_error';

export type AdminForbiddenReason =
  | 'unauthorized_email'
  | 'unverified_email'
  | 'missing_admin_role';

export interface VerifiedAdminFactor {
  id: string;
  friendlyName: string;
  factorType: 'totp' | string;
  status: 'verified' | 'unverified' | string;
  createdAt?: string;
}

export interface AdminMfaState {
  currentLevel: 'aal1' | 'aal2' | null;
  nextLevel: 'aal1' | 'aal2' | null;
  verifiedTotpFactors: VerifiedAdminFactor[];
  unverifiedTotpFactors: VerifiedAdminFactor[];
  allFactors?: VerifiedAdminFactor[];
  isMfaEnrolled: boolean;
  isMfaVerifiedForSession: boolean;
  inspectionError?: string | null;
}

export interface AdminMfaClientAdapter {
  isConfigured?: boolean;
  getAuthenticatorAssuranceLevel: () => Promise<{
    data: { currentLevel?: string | null; nextLevel?: string | null } | null;
    error: { message?: string } | null;
  }>;
  listFactors: () => Promise<{
    data: {
      all?: Array<{
        id: string;
        friendly_name?: string | null;
        factor_type: string;
        status: string;
        created_at?: string;
      }>;
      totp?: Array<{
        id: string;
        friendly_name?: string | null;
        factor_type: string;
        status: string;
        created_at?: string;
      }>;
      phone?: Array<{
        id: string;
        friendly_name?: string | null;
        factor_type: string;
        status: string;
        created_at?: string;
      }>;
      webauthn?: Array<{
        id: string;
        friendly_name?: string | null;
        factor_type: string;
        status: string;
        created_at?: string;
      }>;
    } | null;
    error: { message?: string } | null;
  }>;
  enroll: (params: { factorType: 'totp'; friendlyName: string }) => Promise<{
    data: {
      id: string;
      type: string;
      totp?: { qr_code: string; secret: string };
    } | null;
    error: { message?: string; code?: string } | null;
  }>;
  challengeAndVerify: (params: { factorId: string; code: string }) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
  unenroll: (params: { factorId: string }) => Promise<{
    error: { message?: string } | null;
  }>;
  refreshSession: () => Promise<{
    data: { session: unknown } | null;
    error: { message?: string } | null;
  }>;
}

export type AdminTotpEnrollmentStatus =
  | 'enrolled'
  | 'already_verified'
  | 'challenge_required'
  | 'pending_unverified'
  | 'error';

export interface StartAdminTotpEnrollmentResult {
  status: AdminTotpEnrollmentStatus;
  factorId: string | null;
  qrCodeSvgDataUri: string | null;
  secret: string | null;
  existingFactor?: VerifiedAdminFactor | null;
  unverifiedFactors?: VerifiedAdminFactor[];
  error: string | null;
}

export interface VerifiedAdminIdentity {
  id: string;
  email: string;
  name: string;
  role: 'admin';
}

export interface AdminVerificationResult {
  status: AdminAuthStatus;
  admin: VerifiedAdminIdentity | null;
  mfa: AdminMfaState;
  forbiddenReason?: AdminForbiddenReason;
  message?: string;
}

export interface AdminAuthIdentityLike {
  provider?: string;
  identity_data?: Record<string, unknown> | null;
}

export interface AdminAuthUserLike {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
  identities?: AdminAuthIdentityLike[] | null;
}

export interface AdminVerificationDependencies {
  isConfigured?: boolean;
  getAuthUser?: () => Promise<{ user: AdminAuthUserLike | null; error: unknown }>;
  checkIsAdminRpc?: () => Promise<{ data: boolean | null; error: unknown }>;
  fetchProfile?: (userId: string) => Promise<{ profile: UserProfileRecord | null; error: unknown }>;
  fetchMfaState?: () => Promise<AdminMfaState>;
}

export interface AdminSessionAuditEntry {
  id: string;
  timestamp: string;
  adminId: string;
  action: string;
  targetType: 'payment_request' | 'website' | 'gateway' | 'session' | 'mfa' | 'plan' | 'request';
  targetId: string;
  outcome: 'success' | 'blocked' | 'failed';
  summary: string;
}

export const UNIFORM_ADMIN_AUTH_ERROR =
  'Access denied. You are not authorized to access GoAMAAS Admin.';

export const ADMIN_DB_ROLE_MISSING_ERROR =
  "Google authentication succeeded, but database administrator authorization failed: this account's profile role is not set to 'admin' (public.is_admin() returned false).";

export function normalizeAdminEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function isAuthorizedAdminEmail(email: string | null | undefined): boolean {
  return normalizeAdminEmail(email) === AUTHORIZED_ADMIN_EMAIL;
}

export function isAuthUserEmailVerified(user: AdminAuthUserLike | null | undefined): boolean {
  if (!user) return false;
  const normalizedUserEmail = normalizeAdminEmail(user.email);
  const googleIdentityVerified = Array.isArray(user.identities)
    ? user.identities.some((identity) => {
        if (identity?.provider !== 'google') return false;
        const idData = identity.identity_data || {};
        const idEmail =
          typeof idData.email === 'string' ? normalizeAdminEmail(idData.email) : normalizedUserEmail;
        return (
          Boolean(normalizedUserEmail) &&
          idEmail === normalizedUserEmail &&
          (idData.email_verified === true || idData.verified === true)
        );
      })
    : false;

  if (googleIdentityVerified && Boolean(user.email_confirmed_at || user.confirmed_at)) {
    return true;
  }

  const meta = user.user_metadata || {};
  if (meta.email_verified === false) {
    return false;
  }
  return Boolean(
    user.email_confirmed_at ||
      user.confirmed_at ||
      meta.email_verified === true
  );
}

const RATE_LIMIT_STORAGE_KEY = 'goamaas_admin_auth_guard_v1';
const MAX_ATTEMPTS_PER_WINDOW = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BASE_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

interface RateLimitRecord {
  failures: number[];
  lockoutUntil: number;
  lockoutCount: number;
}

export const DEFAULT_MFA_STATE: AdminMfaState = {
  currentLevel: null,
  nextLevel: null,
  verifiedTotpFactors: [],
  unverifiedTotpFactors: [],
  allFactors: [],
  isMfaEnrolled: false,
  isMfaVerifiedForSession: false,
  inspectionError: null,
};

// In-memory session-scoped audit buffer (never persisted to localStorage, zero PII)
let adminSessionEvents: AdminSessionAuditEntry[] = [];
const sessionAuditListeners = new Set<() => void>();

export function subscribeAdminSessionEvents(listener: () => void): () => void {
  sessionAuditListeners.add(listener);
  return () => {
    sessionAuditListeners.delete(listener);
  };
}

export function getAdminSessionEvents(): AdminSessionAuditEntry[] {
  return adminSessionEvents;
}

export function recordAdminSessionEvent(
  entry: Omit<AdminSessionAuditEntry, 'id' | 'timestamp'>
): void {
  const cleanEntry: AdminSessionAuditEntry = {
    ...entry,
    id: `adm-evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  adminSessionEvents = [cleanEntry, ...adminSessionEvents].slice(0, 100);
  sessionAuditListeners.forEach((fn) => fn());
}

export function clearAdminSessionEvents(): void {
  adminSessionEvents = [];
  sessionAuditListeners.forEach((fn) => fn());
}

let memoryRateLimitFallback: RateLimitRecord = {
  failures: [],
  lockoutUntil: 0,
  lockoutCount: 0,
};

function readRateLimitState(): RateLimitRecord {
  const now = Date.now();
  if (typeof window === 'undefined') {
    return {
      failures: memoryRateLimitFallback.failures.filter((ts) => now - ts < ATTEMPT_WINDOW_MS),
      lockoutUntil: memoryRateLimitFallback.lockoutUntil,
      lockoutCount: memoryRateLimitFallback.lockoutCount,
    };
  }
  try {
    const raw =
      window.sessionStorage.getItem(RATE_LIMIT_STORAGE_KEY) ||
      window.localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    if (!raw) {
      return {
        failures: memoryRateLimitFallback.failures.filter((ts) => now - ts < ATTEMPT_WINDOW_MS),
        lockoutUntil: memoryRateLimitFallback.lockoutUntil,
        lockoutCount: memoryRateLimitFallback.lockoutCount,
      };
    }
    const parsed = JSON.parse(raw) as Partial<RateLimitRecord>;
    const failures = Array.isArray(parsed.failures)
      ? parsed.failures.filter((ts) => typeof ts === 'number' && now - ts < ATTEMPT_WINDOW_MS)
      : [];
    return {
      failures,
      lockoutUntil: typeof parsed.lockoutUntil === 'number' ? parsed.lockoutUntil : 0,
      lockoutCount: typeof parsed.lockoutCount === 'number' ? parsed.lockoutCount : 0,
    };
  } catch {
    return {
      failures: memoryRateLimitFallback.failures.filter((ts) => now - ts < ATTEMPT_WINDOW_MS),
      lockoutUntil: memoryRateLimitFallback.lockoutUntil,
      lockoutCount: memoryRateLimitFallback.lockoutCount,
    };
  }
}

function writeRateLimitState(state: RateLimitRecord): void {
  memoryRateLimitFallback = state;
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(state);
    window.sessionStorage.setItem(RATE_LIMIT_STORAGE_KEY, serialized);
    window.localStorage.setItem(RATE_LIMIT_STORAGE_KEY, serialized);
  } catch {
    // Ignore storage quota exceptions; memoryRateLimitFallback remains active
  }
}

export function checkAdminLoginRateLimit(): {
  allowed: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
} {
  const now = Date.now();
  const state = readRateLimitState();
  if (state.lockoutUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((state.lockoutUntil - now) / 1000)),
      remainingAttempts: 0,
    };
  }
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS_PER_WINDOW - state.failures.length),
  };
}

export function recordAdminLoginFailure(): {
  lockedOut: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
} {
  const now = Date.now();
  const state = readRateLimitState();
  const failures = [...state.failures.filter((ts) => now - ts < ATTEMPT_WINDOW_MS), now];
  let lockoutUntil = state.lockoutUntil;
  let lockoutCount = state.lockoutCount;

  if (failures.length >= MAX_ATTEMPTS_PER_WINDOW) {
    lockoutCount += 1;
    const multiplier = Math.min(4, Math.pow(2, lockoutCount - 1));
    lockoutUntil = now + BASE_LOCKOUT_MS * multiplier;
  }

  writeRateLimitState({ failures, lockoutUntil, lockoutCount });

  if (lockoutUntil > now) {
    return {
      lockedOut: true,
      retryAfterSeconds: Math.max(1, Math.ceil((lockoutUntil - now) / 1000)),
      remainingAttempts: 0,
    };
  }

  return {
    lockedOut: false,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS_PER_WINDOW - failures.length),
  };
}

export function clearAdminLoginFailures(): void {
  memoryRateLimitFallback = { failures: [], lockoutUntil: 0, lockoutCount: 0 };
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(RATE_LIMIT_STORAGE_KEY);
    window.localStorage.removeItem(RATE_LIMIT_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export async function enforceMinimumAuthFloor(
  startedAtMs: number,
  minimumMs = 450
): Promise<void> {
  const elapsed = Date.now() - startedAtMs;
  if (elapsed < minimumMs) {
    await new Promise((resolve) => setTimeout(resolve, minimumMs - elapsed));
  }
}

function logSanitizedAdminDiagnostic(reasonCode: string): void {
  try {
    if ((import.meta as any).env?.DEV) {
      console.warn(`[GoAMAAS Admin Security] Verification status: ${reasonCode}`);
    }
  } catch {
    // Ignore environment inspection errors
  }
}

function isLikelyNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  const status =
    err && typeof err === 'object' && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : NaN;
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const msg =
    err instanceof Error
      ? err.message.toLowerCase()
      : typeof err === 'string'
      ? err.toLowerCase()
      : '';
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('too many requests') ||
    msg.includes('rate limit')
  );
}

function getDefaultAdminMfaClientAdapter(): AdminMfaClientAdapter | null {
  if (!isSupabaseConfigured || !supabase) return null;
  const client = supabase;
  return {
    isConfigured: true,
    getAuthenticatorAssuranceLevel: () => client.auth.mfa.getAuthenticatorAssuranceLevel(),
    listFactors: () => client.auth.mfa.listFactors(),
    enroll: (params) => client.auth.mfa.enroll(params),
    challengeAndVerify: (params) => client.auth.mfa.challengeAndVerify(params),
    unenroll: (params) => client.auth.mfa.unenroll(params),
    refreshSession: () => client.auth.refreshSession(),
  };
}

export async function inspectAdminMfaState(
  adapterOverride?: AdminMfaClientAdapter
): Promise<AdminMfaState> {
  const adapter = adapterOverride ?? getDefaultAdminMfaClientAdapter();
  if (!adapter || adapter.isConfigured === false) {
    return DEFAULT_MFA_STATE;
  }

  try {
    const [aalRes, factorsRes] = await Promise.all([
      adapter.getAuthenticatorAssuranceLevel(),
      adapter.listFactors(),
    ]);

    if (aalRes.error || factorsRes.error) {
      return {
        ...DEFAULT_MFA_STATE,
        inspectionError:
          factorsRes.error?.message ||
          aalRes.error?.message ||
          'Failed to inspect MFA factors from Supabase Auth.',
      };
    }

    const currentLevel: 'aal1' | 'aal2' | null =
      aalRes.data?.currentLevel === 'aal2'
        ? 'aal2'
        : aalRes.data?.currentLevel === 'aal1'
          ? 'aal1'
          : null;
    const nextLevel: 'aal1' | 'aal2' | null =
      aalRes.data?.nextLevel === 'aal2'
        ? 'aal2'
        : aalRes.data?.nextLevel === 'aal1'
          ? 'aal1'
          : null;

    // @supabase/auth-js populates `data.all` with ALL factors (verified + unverified),
    // while `data.totp` contains ONLY verified TOTP factors. Merge both defensively.
    const factorMap = new Map<string, VerifiedAdminFactor>();
    const rawSources = [
      ...(factorsRes.data?.all || []),
      ...(factorsRes.data?.totp || []),
      ...(factorsRes.data?.phone || []),
      ...(factorsRes.data?.webauthn || []),
    ];

    for (const f of rawSources) {
      if (!f || !f.id || factorMap.has(f.id)) continue;
      factorMap.set(f.id, {
        id: f.id,
        friendlyName:
          (f.friendly_name || '').trim() ||
          (f.status === 'verified' ? 'Authenticator App' : 'Pending Authenticator'),
        factorType: f.factor_type || 'totp',
        status: f.status || 'unverified',
        createdAt: f.created_at,
      });
    }

    const allFactors = Array.from(factorMap.values());
    const verifiedTotpFactors = allFactors.filter(
      (f) => f.factorType === 'totp' && f.status === 'verified'
    );
    const unverifiedTotpFactors = allFactors.filter(
      (f) => f.factorType === 'totp' && f.status !== 'verified'
    );

    const isMfaEnrolled = verifiedTotpFactors.length > 0;
    const isMfaVerifiedForSession = isMfaEnrolled && currentLevel === 'aal2';

    return {
      currentLevel,
      nextLevel,
      verifiedTotpFactors,
      unverifiedTotpFactors,
      allFactors,
      isMfaEnrolled,
      isMfaVerifiedForSession,
      inspectionError: null,
    };
  } catch (err: unknown) {
    return {
      ...DEFAULT_MFA_STATE,
      inspectionError:
        err instanceof Error ? err.message : 'Unable to inspect Supabase MFA state.',
    };
  }
}

/**
 * Verifies administrator authorization strictly against Supabase Auth server + PostgreSQL:
 * 1. Fails closed when Supabase is unconfigured (never trusts localStorage, URL params, or demo role state).
 * 2. Calls supabase.auth.getUser() to validate the JWT directly with Supabase Auth.
 * 3. Strictly enforces normalized email === 'official.amaas.dev@gmail.com' AND verified email status.
 * 4. Calls PostgreSQL RPC public.is_admin() AND checks public.profiles.role === 'admin' (email match NEVER auto-promotes).
 * 5. Enforces AAL2 MFA step-up when a verified TOTP factor is enrolled on the admin account.
 */
export async function verifyServerAdminSession(
  deps?: AdminVerificationDependencies
): Promise<AdminVerificationResult> {
  const configured = deps?.isConfigured ?? Boolean(isSupabaseConfigured && supabase);
  if (!configured) {
    return {
      status: 'unconfigured',
      admin: null,
      mfa: DEFAULT_MFA_STATE,
      message:
        'Administrative access is unavailable because Supabase backend credentials are not configured.',
    };
  }

  const getAuthUser =
    deps?.getAuthUser ||
    (async () => {
      if (!supabase) return { user: null, error: new Error('Supabase client unavailable') };
      const { data, error } = await supabase.auth.getUser();
      return { user: data.user as AdminAuthUserLike | null, error };
    });

  const checkIsAdminRpc =
    deps?.checkIsAdminRpc ||
    (async () => {
      if (!supabase) return { data: false, error: new Error('Supabase client unavailable') };
      const res = await supabase.rpc('is_admin');
      return { data: res.data === true, error: res.error };
    });

  const fetchProfile = deps?.fetchProfile || getUserProfile;
  const fetchMfaState = deps?.fetchMfaState || inspectAdminMfaState;

  try {
    const { user: authUser, error: authError } = await getAuthUser();

    if (authError) {
      if (isLikelyNetworkFailure(authError)) {
        return {
          status: 'network_error',
          admin: null,
          mfa: DEFAULT_MFA_STATE,
          message:
            'Unable to reach the authentication server. Check your internet connection and retry.',
        };
      }
      return {
        status: 'unauthenticated',
        admin: null,
        mfa: DEFAULT_MFA_STATE,
      };
    }

    if (!authUser) {
      return {
        status: 'unauthenticated',
        admin: null,
        mfa: DEFAULT_MFA_STATE,
      };
    }

    const normalizedEmail = normalizeAdminEmail(authUser.email);

    // 1. Strict Single-Account Email Allowlist Check (trimmed & lowercased)
    if (!isAuthorizedAdminEmail(normalizedEmail)) {
      logSanitizedAdminDiagnostic('forbidden:unauthorized_email');
      return {
        status: 'forbidden',
        admin: null,
        mfa: DEFAULT_MFA_STATE,
        forbiddenReason: 'unauthorized_email',
        message: UNIFORM_ADMIN_AUTH_ERROR,
      };
    }

    // 2. Mandatory Verified Email Check
    if (!isAuthUserEmailVerified(authUser)) {
      logSanitizedAdminDiagnostic('forbidden:unverified_email');
      return {
        status: 'forbidden',
        admin: null,
        mfa: DEFAULT_MFA_STATE,
        forbiddenReason: 'unverified_email',
        message: UNIFORM_ADMIN_AUTH_ERROR,
      };
    }

    // 3. Authoritative Server/Database Role Verification (is_admin() + profiles.role === 'admin')
    const [rpcRes, profileRes, mfaState] = await Promise.all([
      checkIsAdminRpc(),
      fetchProfile(authUser.id),
      fetchMfaState(),
    ]);

    if (
      (rpcRes.error && isLikelyNetworkFailure(rpcRes.error)) ||
      (profileRes.error && isLikelyNetworkFailure(profileRes.error))
    ) {
      logSanitizedAdminDiagnostic('network_error:role_verification');
      return {
        status: 'network_error',
        admin: null,
        mfa: mfaState,
        message: 'Unable to verify administrator permissions due to a network interruption.',
      };
    }

    const isRpcAdmin = rpcRes.data === true && !rpcRes.error;
    const isProfileAdmin = profileRes.profile?.role === 'admin' && !profileRes.error;
    const profileEmailMatches =
      !profileRes.profile?.email || isAuthorizedAdminEmail(profileRes.profile.email);

    if (!isRpcAdmin || !isProfileAdmin || !profileEmailMatches) {
      logSanitizedAdminDiagnostic('forbidden:missing_admin_role');
      return {
        status: 'forbidden',
        admin: null,
        mfa: mfaState,
        forbiddenReason: 'missing_admin_role',
        message: UNIFORM_ADMIN_AUTH_ERROR,
      };
    }

    const fullNameMeta = authUser.user_metadata?.full_name;
    const verifiedAdmin: VerifiedAdminIdentity = {
      id: authUser.id,
      email: AUTHORIZED_ADMIN_EMAIL,
      name:
        profileRes.profile?.full_name ||
        (typeof fullNameMeta === 'string' && fullNameMeta.trim() ? fullNameMeta.trim() : '') ||
        'AMAAS Administrator',
      role: 'admin',
    };

    // 4. Enforce mandatory TOTP step-up whenever the admin has an enrolled verified TOTP factor
    if (
      mfaState.isMfaEnrolled &&
      mfaState.nextLevel === 'aal2' &&
      mfaState.currentLevel !== 'aal2'
    ) {
      return {
        status: 'mfa_required',
        admin: verifiedAdmin,
        mfa: mfaState,
        message: 'Enter your 6-digit authenticator verification code to unlock GoAMAAS Admin.',
      };
    }

    return {
      status: 'authorized',
      admin: verifiedAdmin,
      mfa: mfaState,
    };
  } catch (err) {
    if (isLikelyNetworkFailure(err)) {
      return {
        status: 'network_error',
        admin: null,
        mfa: DEFAULT_MFA_STATE,
        message: 'Network connection interrupted while verifying administrator session.',
      };
    }
    return {
      status: 'unauthenticated',
      admin: null,
      mfa: DEFAULT_MFA_STATE,
    };
  }
}

/**
 * Revalidates the active admin session against Supabase Auth + PostgreSQL immediately
 * before executing any privileged administrative action.
 */
export async function revalidateAdminBeforeAction(params: {
  action: string;
  targetType: AdminSessionAuditEntry['targetType'];
  targetId: string;
}): Promise<{
  allowed: boolean;
  verification: AdminVerificationResult;
  errorMessage?: string;
}> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      allowed: false,
      verification: {
        status: 'network_error',
        admin: null,
        mfa: DEFAULT_MFA_STATE,
        message: 'Device is offline.',
      },
      errorMessage:
        'Your device is offline. Reconnect to the internet before running administrative actions.',
    };
  }

  const verification = await verifyServerAdminSession();

  if (
    verification.status !== 'authorized' ||
    !verification.admin ||
    !isAuthorizedAdminEmail(verification.admin.email)
  ) {
    const errorMessage =
      verification.status === 'mfa_required'
        ? 'Multi-factor step-up verification is required before executing this action.'
        : verification.status === 'forbidden'
        ? UNIFORM_ADMIN_AUTH_ERROR
        : verification.status === 'network_error'
        ? 'Unable to verify your administrator session due to a network error. Please retry.'
        : 'Your administrator session has expired. Please sign in again.';

    recordAdminSessionEvent({
      adminId: verification.admin?.id || 'unverified',
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      outcome: 'blocked',
      summary: `Blocked pre-action revalidation (${verification.status})`,
    });

    return {
      allowed: false,
      verification,
      errorMessage,
    };
  }

  return {
    allowed: true,
    verification,
  };
}

export async function verifyAdminTotpChallenge(
  factorId: string,
  code: string,
  adapterOverride?: AdminMfaClientAdapter
): Promise<{ success: boolean; currentLevel?: 'aal1' | 'aal2' | null; error: string | null }> {
  const adapter = adapterOverride ?? getDefaultAdminMfaClientAdapter();
  if (!adapter || adapter.isConfigured === false) {
    return {
      success: false,
      currentLevel: null,
      error: 'Supabase authentication is not configured.',
    };
  }
  const cleanFactorId = (factorId || '').trim();
  if (!cleanFactorId) {
    return { success: false, currentLevel: null, error: 'Missing authenticator factor ID.' };
  }
  const cleanCode = code.replace(/\s+/g, '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return {
      success: false,
      currentLevel: null,
      error: 'Enter a valid 6-digit verification code.',
    };
  }

  const { error } = await adapter.challengeAndVerify({
    factorId: cleanFactorId,
    code: cleanCode,
  });

  if (error) {
    return {
      success: false,
      currentLevel: null,
      error: 'Invalid or expired verification code. Please try again.',
    };
  }

  const refreshRes = await adapter.refreshSession();
  const aalRes = await adapter.getAuthenticatorAssuranceLevel();
  const confirmedLevel: 'aal1' | 'aal2' | null =
    aalRes.data?.currentLevel === 'aal2'
      ? 'aal2'
      : aalRes.data?.currentLevel === 'aal1'
        ? 'aal1'
        : null;

  if (refreshRes.error || aalRes.error || confirmedLevel !== 'aal2') {
    return {
      success: false,
      currentLevel: confirmedLevel,
      error:
        refreshRes.error?.message ||
        aalRes.error?.message ||
        'Authenticator code verified, but AAL2 session assurance could not be confirmed after refreshing the session. Please try again.',
    };
  }

  return { success: true, currentLevel: 'aal2', error: null };
}

function normalizeFactorFriendlyName(name: string | null | undefined): string {
  return (name || '').trim().toLowerCase();
}

export async function startAdminTotpEnrollment(
  friendlyName = 'GoAMAAS Admin Authenticator',
  options?: {
    unverifiedAction?: 'remove_and_enroll' | 'prompt';
    adapter?: AdminMfaClientAdapter;
  }
): Promise<StartAdminTotpEnrollmentResult> {
  const adapter = options?.adapter ?? getDefaultAdminMfaClientAdapter();
  if (!adapter || adapter.isConfigured === false) {
    return {
      status: 'error',
      factorId: null,
      qrCodeSvgDataUri: null,
      secret: null,
      error: 'Supabase authentication is not configured.',
    };
  }

  const cleanFriendlyName = (friendlyName || '').trim() || 'GoAMAAS Admin Authenticator';
  const normalizedTargetName = normalizeFactorFriendlyName(cleanFriendlyName);
  const unverifiedAction = options?.unverifiedAction ?? 'remove_and_enroll';

  // Step 1: Always inspect live MFA factors & AAL via Supabase Auth before enrolling
  const existing = await inspectAdminMfaState(adapter);
  if (existing.inspectionError) {
    return {
      status: 'error',
      factorId: null,
      qrCodeSvgDataUri: null,
      secret: null,
      error: existing.inspectionError,
    };
  }

  const allFactors =
    existing.allFactors || [
      ...existing.verifiedTotpFactors,
      ...existing.unverifiedTotpFactors,
    ];

  // Step 2: If a verified TOTP factor already exists, NEVER enroll a duplicate factor.
  // Use it directly for AAL2 challenge/verification (or report already_verified if already at AAL2).
  const verifiedMatch =
    existing.verifiedTotpFactors.find(
      (f) => normalizeFactorFriendlyName(f.friendlyName) === normalizedTargetName
    ) || existing.verifiedTotpFactors[0];

  if (verifiedMatch) {
    return {
      status: existing.currentLevel === 'aal2' ? 'already_verified' : 'challenge_required',
      factorId: verifiedMatch.id,
      qrCodeSvgDataUri: null,
      secret: null,
      existingFactor: verifiedMatch,
      error: null,
    };
  }

  // Prevent friendly name collision with any existing verified non-TOTP factor
  const verifiedFriendlyCollision = allFactors.find(
    (f) =>
      f.status === 'verified' &&
      normalizeFactorFriendlyName(f.friendlyName) === normalizedTargetName
  );
  if (verifiedFriendlyCollision) {
    return {
      status: 'error',
      factorId: verifiedFriendlyCollision.id,
      qrCodeSvgDataUri: null,
      secret: null,
      existingFactor: verifiedFriendlyCollision,
      error: `A verified authenticator factor named "${cleanFriendlyName}" already exists on this account.`,
    };
  }

  // Step 3: Detect any unverified/pending TOTP factor or friendly-name collision
  const pendingFactors = Array.from(
    new Map(
      allFactors
        .filter(
          (f) =>
            f.status !== 'verified' &&
            (f.factorType === 'totp' ||
              normalizeFactorFriendlyName(f.friendlyName) === normalizedTargetName)
        )
        .map((f) => [f.id, f])
    ).values()
  );

  if (pendingFactors.length > 0) {
    if (unverifiedAction === 'prompt') {
      return {
        status: 'pending_unverified',
        factorId: pendingFactors[0].id,
        qrCodeSvgDataUri: null,
        secret: null,
        existingFactor: pendingFactors[0],
        unverifiedFactors: pendingFactors,
        error: null,
      };
    }

    for (const stale of pendingFactors) {
      const { error: unenrollError } = await adapter.unenroll({ factorId: stale.id });
      if (unenrollError) {
        return {
          status: 'error',
          factorId: null,
          qrCodeSvgDataUri: null,
          secret: null,
          existingFactor: stale,
          unverifiedFactors: pendingFactors,
          error:
            unenrollError.message ||
            'Could not remove the pending unverified authenticator factor before starting a new setup.',
        };
      }
    }

    // Re-inspect after cleanup to confirm no duplicate friendly name remains
    const postCleanup = await inspectAdminMfaState(adapter);
    if (postCleanup.inspectionError) {
      return {
        status: 'error',
        factorId: null,
        qrCodeSvgDataUri: null,
        secret: null,
        error: postCleanup.inspectionError,
      };
    }

    const postAll =
      postCleanup.allFactors || [
        ...postCleanup.verifiedTotpFactors,
        ...postCleanup.unverifiedTotpFactors,
      ];
    const remainingMatch = postAll.find(
      (f) => normalizeFactorFriendlyName(f.friendlyName) === normalizedTargetName
    );
    if (remainingMatch) {
      return {
        status: remainingMatch.status === 'verified'
          ? postCleanup.currentLevel === 'aal2'
            ? 'already_verified'
            : 'challenge_required'
          : 'error',
        factorId: remainingMatch.id,
        qrCodeSvgDataUri: null,
        secret: null,
        existingFactor: remainingMatch,
        error:
          remainingMatch.status === 'verified'
            ? null
            : `Factor "${cleanFriendlyName}" still exists after cleanup. Please remove it manually and retry.`,
      };
    }
  }

  // Step 4: Enroll cleanly when no duplicate or verified TOTP factor exists
  const { data, error } = await adapter.enroll({
    factorType: 'totp',
    friendlyName: cleanFriendlyName,
  });

  if (error || !data || data.type !== 'totp' || !data.totp) {
    const rawMsg = error?.message || '';
    if (rawMsg.toLowerCase().includes('already exists')) {
      const recheck = await inspectAdminMfaState(adapter);
      const existingVerified = recheck.verifiedTotpFactors[0];
      if (existingVerified) {
        return {
          status: recheck.currentLevel === 'aal2' ? 'already_verified' : 'challenge_required',
          factorId: existingVerified.id,
          qrCodeSvgDataUri: null,
          secret: null,
          existingFactor: existingVerified,
          error: null,
        };
      }
      const existingPending = recheck.unverifiedTotpFactors[0];
      if (existingPending) {
        return {
          status: 'pending_unverified',
          factorId: existingPending.id,
          qrCodeSvgDataUri: null,
          secret: null,
          existingFactor: existingPending,
          unverifiedFactors: recheck.unverifiedTotpFactors,
          error: null,
        };
      }
    }

    const mfaDisabledHint =
      rawMsg.toLowerCase().includes('mfa') && rawMsg.toLowerCase().includes('disabled')
        ? 'TOTP Multi-Factor Authentication is currently disabled in Supabase Auth project settings. Enable TOTP in the Supabase Dashboard (Authentication -> Multi-Factor) to enroll a hardware/app authenticator.'
        : rawMsg || 'Could not start TOTP enrollment.';
    return {
      status: 'error',
      factorId: null,
      qrCodeSvgDataUri: null,
      secret: null,
      error: mfaDisabledHint,
    };
  }

  return {
    status: 'enrolled',
    factorId: data.id,
    qrCodeSvgDataUri: data.totp.qr_code,
    secret: data.totp.secret,
    error: null,
  };
}

export async function unenrollAdminTotpFactor(
  factorId: string,
  adapterOverride?: AdminMfaClientAdapter
): Promise<{ success: boolean; error: string | null }> {
  const adapter = adapterOverride ?? getDefaultAdminMfaClientAdapter();
  if (!adapter || adapter.isConfigured === false) {
    return { success: false, error: 'Supabase authentication is not configured.' };
  }

  const { error } = await adapter.unenroll({ factorId });
  if (error) {
    return { success: false, error: error.message || 'Failed to remove authenticator factor.' };
  }
  return { success: true, error: null };
}

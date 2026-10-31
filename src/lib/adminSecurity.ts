import { supabase, isSupabaseConfigured, getUserProfile } from './supabase';

export type AdminAuthStatus =
  | 'authorized'
  | 'mfa_required'
  | 'unauthenticated'
  | 'forbidden'
  | 'unconfigured'
  | 'network_error';

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
  isMfaEnrolled: boolean;
  isMfaVerifiedForSession: boolean;
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
  message?: string;
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
  'Invalid credentials or unauthorized administrator account.';

const RATE_LIMIT_STORAGE_KEY = 'goamaas_admin_auth_guard_v1';
const MAX_ATTEMPTS_PER_WINDOW = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BASE_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

interface RateLimitRecord {
  failures: number[];
  lockoutUntil: number;
  lockoutCount: number;
}

const DEFAULT_MFA_STATE: AdminMfaState = {
  currentLevel: null,
  nextLevel: null,
  verifiedTotpFactors: [],
  unverifiedTotpFactors: [],
  isMfaEnrolled: false,
  isMfaVerifiedForSession: false,
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

function isLikelyNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
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
    msg.includes('load failed')
  );
}

export async function inspectAdminMfaState(): Promise<AdminMfaState> {
  if (!isSupabaseConfigured || !supabase) {
    return DEFAULT_MFA_STATE;
  }

  try {
    const [aalRes, factorsRes] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);

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

    const allTotp = factorsRes.data?.totp || [];
    const verifiedTotpFactors: VerifiedAdminFactor[] = allTotp
      .filter((f) => f.status === 'verified')
      .map((f) => ({
        id: f.id,
        friendlyName: f.friendly_name || 'Authenticator App',
        factorType: f.factor_type,
        status: f.status,
        createdAt: f.created_at,
      }));

    const unverifiedTotpFactors: VerifiedAdminFactor[] = allTotp
      .filter((f) => f.status !== 'verified')
      .map((f) => ({
        id: f.id,
        friendlyName: f.friendly_name || 'Pending Authenticator',
        factorType: f.factor_type,
        status: f.status,
        createdAt: f.created_at,
      }));

    const isMfaEnrolled = verifiedTotpFactors.length > 0;
    const isMfaVerifiedForSession = isMfaEnrolled && currentLevel === 'aal2';

    return {
      currentLevel,
      nextLevel,
      verifiedTotpFactors,
      unverifiedTotpFactors,
      isMfaEnrolled,
      isMfaVerifiedForSession,
    };
  } catch {
    return DEFAULT_MFA_STATE;
  }
}

/**
 * Verifies administrator authorization strictly against Supabase Auth server + PostgreSQL:
 * 1. Fails closed when Supabase is unconfigured (never trusts localStorage or demo role state).
 * 2. Calls supabase.auth.getUser() to validate the JWT directly with Supabase Auth.
 * 3. Calls PostgreSQL RPC public.is_admin() AND checks public.profiles.role === 'admin'.
 * 4. Enforces AAL2 MFA step-up when a verified TOTP factor is enrolled on the admin account.
 */
export async function verifyServerAdminSession(): Promise<AdminVerificationResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      status: 'unconfigured',
      admin: null,
      mfa: DEFAULT_MFA_STATE,
      message:
        'Administrative access is unavailable because Supabase backend credentials are not configured.',
    };
  }

  try {
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

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

    const [rpcRes, profileRes, mfaState] = await Promise.all([
      supabase.rpc('is_admin'),
      getUserProfile(authUser.id),
      inspectAdminMfaState(),
    ]);

    if (rpcRes.error && isLikelyNetworkFailure(rpcRes.error)) {
      return {
        status: 'network_error',
        admin: null,
        mfa: mfaState,
        message: 'Unable to verify administrator permissions due to a network interruption.',
      };
    }

    const isRpcAdmin = rpcRes.data === true && !rpcRes.error;
    const isProfileAdmin = profileRes.profile?.role === 'admin' && !profileRes.error;

    if (!isRpcAdmin || !isProfileAdmin) {
      return {
        status: 'forbidden',
        admin: null,
        mfa: mfaState,
        message: 'Access denied: Your account is not authorized to access GoAMAAS Admin.',
      };
    }

    const verifiedAdmin: VerifiedAdminIdentity = {
      id: authUser.id,
      email: authUser.email || profileRes.profile?.email || '',
      name:
        profileRes.profile?.full_name ||
        authUser.user_metadata?.full_name ||
        authUser.email?.split('@')[0] ||
        'Administrator',
      role: 'admin',
    };

    // Enforce mandatory TOTP step-up whenever the admin has an enrolled verified TOTP factor
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

  if (verification.status !== 'authorized' || !verification.admin) {
    const errorMessage =
      verification.status === 'mfa_required'
        ? 'Multi-factor step-up verification is required before executing this action.'
        : verification.status === 'forbidden'
        ? 'Access denied: Administrator authorization was revoked.'
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
  code: string
): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase authentication is not configured.' };
  }
  const cleanCode = code.replace(/\s+/g, '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return { success: false, error: 'Enter a valid 6-digit verification code.' };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: cleanCode,
  });

  if (error) {
    return {
      success: false,
      error: 'Invalid or expired verification code. Please try again.',
    };
  }

  return { success: true, error: null };
}

export async function startAdminTotpEnrollment(friendlyName = 'GoAMAAS Admin Mobile'): Promise<{
  factorId: string | null;
  qrCodeSvgDataUri: string | null;
  secret: string | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      factorId: null,
      qrCodeSvgDataUri: null,
      secret: null,
      error: 'Supabase authentication is not configured.',
    };
  }

  // Clean up any stale unverified factor with the same friendly name first
  const existing = await inspectAdminMfaState();
  for (const stale of existing.unverifiedTotpFactors) {
    await supabase.auth.mfa.unenroll({ factorId: stale.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  });

  if (error || !data || data.type !== 'totp') {
    const rawMsg = error?.message || '';
    const mfaDisabledHint =
      rawMsg.toLowerCase().includes('mfa') && rawMsg.toLowerCase().includes('disabled')
        ? 'TOTP Multi-Factor Authentication is currently disabled in Supabase Auth project settings. Enable TOTP in the Supabase Dashboard (Authentication -> Multi-Factor) to enroll a hardware/app authenticator.'
        : rawMsg || 'Could not start TOTP enrollment.';
    return {
      factorId: null,
      qrCodeSvgDataUri: null,
      secret: null,
      error: mfaDisabledHint,
    };
  }

  return {
    factorId: data.id,
    qrCodeSvgDataUri: data.totp.qr_code,
    secret: data.totp.secret,
    error: null,
  };
}

export async function unenrollAdminTotpFactor(
  factorId: string
): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase authentication is not configured.' };
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    return { success: false, error: error.message || 'Failed to remove authenticator factor.' };
  }
  return { success: true, error: null };
}

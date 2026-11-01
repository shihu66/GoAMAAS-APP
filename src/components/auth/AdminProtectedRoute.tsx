import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  Loader2,
  Lock,
  WifiOff,
  RefreshCw,
  KeyRound,
} from 'lucide-react';
import { supabase, isSupabaseConfigured, signOutFromSupabase } from '../../lib/supabase';
import {
  AUTHORIZED_ADMIN_EMAIL,
  AdminMfaState,
  AdminVerificationResult,
  UNIFORM_ADMIN_AUTH_ERROR,
  VerifiedAdminIdentity,
  clearAdminSessionEvents,
  isAuthorizedAdminEmail,
  recordAdminLoginFailure,
  recordAdminSessionEvent,
  verifyAdminTotpChallenge,
  verifyServerAdminSession,
} from '../../lib/adminSecurity';
import { notifyAdminServiceWorkerSignOut, useAdminPWA } from '../../hooks/useAdminPWA';
import { useApp } from '../../context/AppContext';

interface AdminSecurityContextValue {
  verifiedAdmin: VerifiedAdminIdentity;
  mfa: AdminMfaState;
  isOnline: boolean;
  refreshVerification: () => Promise<AdminVerificationResult>;
  secureSignOut: () => Promise<void>;
}

const AdminSecurityContext = createContext<AdminSecurityContextValue | null>(null);

export function useAdminSecurity(): AdminSecurityContextValue {
  const ctx = useContext(AdminSecurityContext);
  if (!ctx) {
    throw new Error('useAdminSecurity must be used within AdminProtectedRoute.');
  }
  return ctx;
}

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

export const AdminProtectedRoute: React.FC<AdminProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setAuthenticatedUser, logout } = useApp();
  const { isOnline } = useAdminPWA(theme);

  const [verification, setVerification] = useState<AdminVerificationResult | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [forbiddenSignedOut, setForbiddenSignedOut] = useState<boolean>(false);
  const hadAuthorizedSessionRef = useRef<boolean>(false);
  const purgingForbiddenRef = useRef<boolean>(false);

  // Step-up MFA challenge state
  const [totpCode, setTotpCode] = useState<string>('');
  const [totpError, setTotpError] = useState<string | null>(null);
  const [isVerifyingTotp, setIsVerifyingTotp] = useState<boolean>(false);

  const purgeUnauthorizedSession = useCallback(async () => {
    if (purgingForbiddenRef.current) return;
    purgingForbiddenRef.current = true;
    try {
      hadAuthorizedSessionRef.current = false;
      clearAdminSessionEvents();
      notifyAdminServiceWorkerSignOut();
      if (isSupabaseConfigured) {
        await signOutFromSupabase();
      }
      await logout();
      recordAdminLoginFailure();
    } finally {
      setForbiddenSignedOut(true);
      purgingForbiddenRef.current = false;
    }
  }, [logout]);

  const runVerification = useCallback(
    async (options?: { silent?: boolean }): Promise<AdminVerificationResult> => {
      if (!options?.silent) {
        setIsChecking(true);
      }
      const result = await verifyServerAdminSession();
      setVerification(result);
      if (
        result.status === 'authorized' &&
        result.admin &&
        isAuthorizedAdminEmail(result.admin.email)
      ) {
        hadAuthorizedSessionRef.current = true;
        setAuthenticatedUser({
          id: result.admin.id,
          name: result.admin.name,
          email: AUTHORIZED_ADMIN_EMAIL,
          role: 'admin',
          storeId: '',
        });
      } else if (result.status === 'forbidden') {
        await purgeUnauthorizedSession();
      }
      if (!options?.silent) {
        setIsChecking(false);
      }
      return result;
    },
    [purgeUnauthorizedSession, setAuthenticatedUser]
  );

  const secureSignOut = useCallback(async () => {
    hadAuthorizedSessionRef.current = false;
    recordAdminSessionEvent({
      adminId: verification?.admin?.id || 'admin',
      action: 'admin_sign_out',
      targetType: 'session',
      targetId: 'current_session',
      outcome: 'success',
      summary: 'Administrator signed out securely.',
    });
    clearAdminSessionEvents();
    notifyAdminServiceWorkerSignOut();
    if (isSupabaseConfigured) {
      await signOutFromSupabase();
    }
    await logout();
    navigate('/admin/login', { replace: true });
  }, [logout, navigate, verification?.admin?.id]);

  // Initial server verification + re-verify when route changes inside /admin/*
  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await verifyServerAdminSession();
      if (!active) return;
      setVerification(res);
      if (
        res.status === 'authorized' &&
        res.admin &&
        isAuthorizedAdminEmail(res.admin.email)
      ) {
        hadAuthorizedSessionRef.current = true;
        setAuthenticatedUser({
          id: res.admin.id,
          name: res.admin.name,
          email: AUTHORIZED_ADMIN_EMAIL,
          role: 'admin',
          storeId: '',
        });
      } else if (res.status === 'forbidden') {
        await purgeUnauthorizedSession();
      }
      if (active) {
        setIsChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [location.pathname, purgeUnauthorizedSession, setAuthenticatedUser]);

  // Revalidate session on window focus, visibility change, auth state changes, and 2-minute heartbeat
  useEffect(() => {
    const revalidateSilently = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      void runVerification({ silent: true });
    };

    const intervalId = window.setInterval(revalidateSilently, 120_000);
    window.addEventListener('focus', revalidateSilently);
    document.addEventListener('visibilitychange', revalidateSilently);

    let unsubscribeAuth: (() => void) | undefined;
    if (isSupabaseConfigured && supabase) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          setVerification({
            status: 'unauthenticated',
            admin: null,
            mfa: {
              currentLevel: null,
              nextLevel: null,
              verifiedTotpFactors: [],
              unverifiedTotpFactors: [],
              isMfaEnrolled: false,
              isMfaVerifiedForSession: false,
            },
          });
        } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          void runVerification({ silent: true });
        }
      });
      unsubscribeAuth = () => subscription.unsubscribe();
    }

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', revalidateSilently);
      document.removeEventListener('visibilitychange', revalidateSilently);
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, [runVerification]);

  // 1. Authoritative Server Verification Loading Gate (never expose admin shell/data before resolved)
  if (isChecking && !verification) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3 shadow-sm">
          <Loader2 className="w-7 h-7 text-blue-600 dark:text-blue-400 animate-spin mx-auto" />
          <h1 className="text-sm font-bold text-slate-900 dark:text-white">
            Verifying Administrator Session
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Confirming server-side permissions with GoAMAAS Security...
          </p>
        </div>
      </div>
    );
  }

  const currentStatus = verification?.status || 'unauthenticated';

  // 2. Unauthenticated or Expired Session -> Redirect to dedicated /admin/login
  if (currentStatus === 'unauthenticated') {
    const expiredQuery = hadAuthorizedSessionRef.current ? '?expired=1' : '';
    return (
      <Navigate
        to={`/admin/login${expiredQuery}`}
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  // 3. Backend Unconfigured -> Fail Closed (never allow demo/localStorage bypass)
  if (currentStatus === 'unconfigured') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-7 space-y-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-base font-bold text-slate-900 dark:text-white">
            Administrative Console Unavailable
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            GoAMAAS Admin requires a live server-verified Supabase backend connection and never grants offline or client-side fallback access.
          </p>
        </div>
      </div>
    );
  }

  // 4. Network Interruption During Session Check -> Safe Retry Screen (Zero Cached Admin Data)
  if (currentStatus === 'network_error') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-7 space-y-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <WifiOff className="w-6 h-6" />
          </div>
          <h1 className="text-base font-bold text-slate-900 dark:text-white">
            Secure Connection Interrupted
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {verification?.message ||
              'Unable to verify your administrator session while offline. Reconnect to the internet and try again.'}
          </p>
          <button
            type="button"
            onClick={() => void runVerification()}
            className="w-full min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Session Verification</span>
          </button>
        </div>
      </div>
    );
  }

  // 5. Unauthorized Account -> Immediately sign out & redirect to /admin/login?denied=1 (Zero Admin Data Exposed)
  if (currentStatus === 'forbidden') {
    if (forbiddenSignedOut) {
      return (
        <Navigate
          to="/admin/login?denied=1"
          state={{ from: location.pathname }}
          replace
        />
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-7 space-y-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-base font-bold text-slate-900 dark:text-white">
            Access Restricted
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {UNIFORM_ADMIN_AUTH_ERROR}
          </p>
        </div>
      </div>
    );
  }

  // 6. Mandatory Step-Up TOTP MFA Gate (when verified TOTP factor is enrolled, require AAL2)
  if (currentStatus === 'mfa_required' && verification) {
    const primaryFactor = verification.mfa.verifiedTotpFactors[0];

    const handleVerifyMfa = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!primaryFactor || isVerifyingTotp) return;
      setIsVerifyingTotp(true);
      setTotpError(null);
      try {
        const res = await verifyAdminTotpChallenge(primaryFactor.id, totpCode);
        if (!res.success) {
          setTotpError(res.error || 'Verification failed.');
          return;
        }
        setTotpCode('');
        recordAdminSessionEvent({
          adminId: verification.admin?.id || 'admin',
          action: 'mfa_step_up_verified',
          targetType: 'mfa',
          targetId: primaryFactor.id,
          outcome: 'success',
          summary: 'AAL2 TOTP authenticator verification succeeded.',
        });
        await runVerification();
      } finally {
        setIsVerifyingTotp(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-7 space-y-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">
                Two-Factor Verification Required
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                GoAMAAS Admin · Step-Up Security
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Enter the 6-digit code from <strong>{primaryFactor?.friendlyName || 'your authenticator app'}</strong> to unlock administrative access.
          </p>

          <form onSubmit={(e) => void handleVerifyMfa(e)} className="space-y-4">
            <div>
              <label
                htmlFor="admin-mfa-code"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                6-Digit Authenticator Code
              </label>
              <input
                id="admin-mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={totpCode}
                onChange={(e) => {
                  setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  if (totpError) setTotpError(null);
                }}
                placeholder="000000"
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-lg tracking-widest text-center tabular-nums focus:outline-hidden focus:border-blue-600"
              />
              {totpError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium mt-1.5">
                  {totpError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isVerifyingTotp || totpCode.length !== 6}
              className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {isVerifyingTotp && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Verify &amp; Unlock Console</span>
            </button>
          </form>

          <button
            type="button"
            onClick={() => void secureSignOut()}
            className="w-full min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
          >
            Cancel &amp; Sign Out
          </button>
        </div>
      </div>
    );
  }

  // 7. Verified Platform Admin (authorized + email match)
  if (!verification?.admin || !isAuthorizedAdminEmail(verification.admin.email)) {
    return <Navigate to="/admin/login?denied=1" replace />;
  }

  return (
    <AdminSecurityContext.Provider
      value={{
        verifiedAdmin: verification.admin,
        mfa: verification.mfa,
        isOnline,
        refreshVerification: () => runVerification({ silent: true }),
        secureSignOut,
      }}
    >
      {children}
    </AdminSecurityContext.Provider>
  );
};

import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  Loader2,
  AlertCircle,
  KeyRound,
  WifiOff,
  Sun,
  Moon,
  ExternalLink,
} from 'lucide-react';
import {
  supabase,
  isSupabaseConfigured,
  signOutFromSupabase,
  signInWithGoogle,
} from '../../lib/supabase';
import {
  AUTHORIZED_ADMIN_EMAIL,
  UNIFORM_ADMIN_AUTH_ERROR,
  VerifiedAdminFactor,
  checkAdminLoginRateLimit,
  clearAdminLoginFailures,
  clearAdminSessionEvents,
  enforceMinimumAuthFloor,
  isAuthorizedAdminEmail,
  recordAdminLoginFailure,
  recordAdminSessionEvent,
  verifyAdminTotpChallenge,
  verifyServerAdminSession,
} from '../../lib/adminSecurity';
import { notifyAdminServiceWorkerSignOut, useAdminPWA } from '../../hooks/useAdminPWA';
import {
  AdminPWAInstallButton,
  AdminPWAInstallPrompt,
} from '../../components/admin/AdminPWAInstallBanner';
import { useApp } from '../../context/AppContext';

export const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { theme, toggleTheme, setAuthenticatedUser, logout } = useApp();
  const { isOnline, isEmbeddedIframe } = useAdminPWA(theme);

  const intendedDestination = (() => {
    const fromState = (location.state as { from?: string } | null)?.from;
    if (fromState && fromState.startsWith('/admin') && fromState !== '/admin/login') {
      return fromState;
    }
    return '/admin';
  })();

  const isExpiredSession = searchParams.get('expired') === '1';
  const isDeniedQuery =
    searchParams.get('denied') === '1' || searchParams.get('unauthorized') === '1';
  const isOauthErrorQuery =
    searchParams.get('oauth_error') === '1' || Boolean(searchParams.get('error'));

  const [isCheckingExisting, setIsCheckingExisting] = useState(true);
  const [isSubmittingMfa, setIsSubmittingMfa] = useState(false);
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(() => {
    if (isDeniedQuery) return UNIFORM_ADMIN_AUTH_ERROR;
    if (isOauthErrorQuery) {
      return 'Google authentication could not be completed. Please try again with the authorized administrator account.';
    }
    return null;
  });
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  // MFA step-up challenge right inside login when enrolled on the authorized admin account
  const [mfaChallengeFactor, setMfaChallengeFactor] = useState<VerifiedAdminFactor | null>(null);
  const [totpCode, setTotpCode] = useState('');

  // Check if user already holds a valid server-verified admin session, or purge any unauthorized session
  useEffect(() => {
    let active = true;
    void (async () => {
      const rate = checkAdminLoginRateLimit();
      if (!rate.allowed) {
        setLockoutSeconds(rate.retryAfterSeconds);
      }

      if (!isSupabaseConfigured || !supabase) {
        if (active) setIsCheckingExisting(false);
        return;
      }

      const startedAt = Date.now();
      const res = await verifyServerAdminSession();
      if (!active) return;

      if (
        res.status === 'authorized' &&
        res.admin &&
        isAuthorizedAdminEmail(res.admin.email)
      ) {
        clearAdminLoginFailures();
        setAuthenticatedUser({
          id: res.admin.id,
          name: res.admin.name,
          email: AUTHORIZED_ADMIN_EMAIL,
          role: 'admin',
          storeId: '',
        });
        navigate(intendedDestination, { replace: true });
        return;
      }

      if (
        res.status === 'mfa_required' &&
        res.admin &&
        isAuthorizedAdminEmail(res.admin.email) &&
        res.mfa.verifiedTotpFactors[0]
      ) {
        setMfaChallengeFactor(res.mfa.verifiedTotpFactors[0]);
        setIsCheckingExisting(false);
        return;
      }

      // If an unauthorized Google or merchant session is present, immediately sign out and show generic denial
      if (res.status === 'forbidden') {
        await enforceMinimumAuthFloor(startedAt, 350);
        clearAdminSessionEvents();
        notifyAdminServiceWorkerSignOut();
        await signOutFromSupabase();
        await logout();
        const failure = recordAdminLoginFailure();
        if (!active) return;
        if (failure.lockedOut) {
          setLockoutSeconds(failure.retryAfterSeconds);
          setErrorBanner(
            `Too many unsuccessful sign-in attempts. Sign-in is temporarily locked for ${failure.retryAfterSeconds}s.`
          );
        } else {
          setErrorBanner(UNIFORM_ADMIN_AUTH_ERROR);
        }
      }

      if (active) {
        setIsCheckingExisting(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [intendedDestination, logout, navigate, setAuthenticatedUser]);

  // Countdown timer when rate-limit lockout is active
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = window.setInterval(() => {
      const check = checkAdminLoginRateLimit();
      setLockoutSeconds(check.allowed ? 0 : check.retryAfterSeconds);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockoutSeconds]);

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallengeFactor || isSubmittingMfa) return;
    setIsSubmittingMfa(true);
    setErrorBanner(null);

    try {
      const verifyRes = await verifyAdminTotpChallenge(mfaChallengeFactor.id, totpCode);
      if (!verifyRes.success) {
        setErrorBanner(verifyRes.error || 'Invalid authenticator code.');
        return;
      }

      const finalCheck = await verifyServerAdminSession();
      if (
        finalCheck.status === 'authorized' &&
        finalCheck.admin &&
        isAuthorizedAdminEmail(finalCheck.admin.email)
      ) {
        clearAdminLoginFailures();
        setAuthenticatedUser({
          id: finalCheck.admin.id,
          name: finalCheck.admin.name,
          email: AUTHORIZED_ADMIN_EMAIL,
          role: 'admin',
          storeId: '',
        });
        recordAdminSessionEvent({
          adminId: finalCheck.admin.id,
          action: 'admin_sign_in_mfa',
          targetType: 'session',
          targetId: mfaChallengeFactor.id,
          outcome: 'success',
          summary: 'Verified administrator Google session with AAL2 TOTP MFA.',
        });
        navigate(intendedDestination, { replace: true });
      } else {
        clearAdminSessionEvents();
        notifyAdminServiceWorkerSignOut();
        await signOutFromSupabase();
        await logout();
        setMfaChallengeFactor(null);
        setTotpCode('');
        setErrorBanner(UNIFORM_ADMIN_AUTH_ERROR);
      }
    } finally {
      setIsSubmittingMfa(false);
    }
  };

  const handleAdminGoogleSignIn = async () => {
    if (isSubmittingMfa || isGoogleRedirecting) return;
    if (!isOnline) {
      setErrorBanner('Your device is offline. Reconnect to the internet to authenticate.');
      return;
    }

    const rate = checkAdminLoginRateLimit();
    if (!rate.allowed) {
      setLockoutSeconds(rate.retryAfterSeconds);
      setErrorBanner(
        `Too many unsuccessful sign-in attempts. Please wait ${rate.retryAfterSeconds}s.`
      );
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setErrorBanner('Administrative authentication service is not configured.');
      return;
    }

    setIsGoogleRedirecting(true);
    setErrorBanner(null);

    // Clean callback URL without query string guarantees exact allowlist match in Supabase GoTrue
    const callbackUrl = `${window.location.origin}/auth/callback`;
    const { error } = await signInWithGoogle(callbackUrl, {
      isAdminFlow: true,
      nextPath: intendedDestination,
      loginHint: AUTHORIZED_ADMIN_EMAIL,
    });

    if (error) {
      setIsGoogleRedirecting(false);
      setErrorBanner(error.message || 'Unable to start Google sign-in. Please retry.');
    }
  };

  if (isCheckingExisting) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <Loader2 className="w-7 h-7 text-blue-600 dark:text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between p-4 sm:p-6 antialiased">
      {/* Automatic PWA Install Prompt when supported */}
      <AdminPWAInstallPrompt theme={theme} />

      {/* Minimal Top Bar */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between gap-4 py-2">
        <div className="flex items-center gap-2.5">
          <img
            src="/admin-icon.svg"
            alt="GoAMAAS Admin emblem"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg shrink-0"
          />
          <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            GoAMAAS Admin
          </span>
        </div>

        <div className="flex items-center gap-2">
          <AdminPWAInstallButton theme={theme} variant="compact" />
          <button
            type="button"
            onClick={toggleTheme}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="Toggle color theme"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Dedicated Sign-In Card */}
      <main className="w-full max-w-md mx-auto my-6 space-y-5">
        {!isOnline && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2.5">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>Device is offline. Connect to the internet to authenticate.</span>
          </div>
        )}

        {isExpiredSession && !errorBanner && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs">
            Your administrator session expired. Sign in with Google again to continue.
          </div>
        )}

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-1.5">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center mb-3">
              {mfaChallengeFactor ? (
                <KeyRound className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {mfaChallengeFactor ? 'Two-Factor Verification' : 'Administrator Sign In'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {mfaChallengeFactor
                ? `Enter the 6-digit code from ${mfaChallengeFactor.friendlyName}.`
                : 'Restricted operations console for AMAAS Technologies. Sign in exclusively with the authorized Google account.'}
            </p>
          </div>

          {errorBanner && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/70 text-rose-700 dark:text-rose-200 text-xs flex items-start gap-2.5 leading-relaxed"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{errorBanner}</span>
            </div>
          )}

          {mfaChallengeFactor ? (
            <form onSubmit={(e) => void handleTotpSubmit(e)} className="space-y-4">
              <div>
                <label
                  htmlFor="login-totp-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Authenticator Code
                </label>
                <input
                  id="login-totp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={totpCode}
                  onChange={(e) => {
                    setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    if (errorBanner) setErrorBanner(null);
                  }}
                  placeholder="000000"
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-lg tracking-widest text-center tabular-nums focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingMfa || totpCode.length !== 6}
                className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {isSubmittingMfa && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Verify &amp; Enter Console</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  clearAdminSessionEvents();
                  notifyAdminServiceWorkerSignOut();
                  await signOutFromSupabase();
                  await logout();
                  setMfaChallengeFactor(null);
                  setTotpCode('');
                  setErrorBanner(null);
                }}
                className="w-full min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
              >
                Cancel &amp; Sign Out
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Authorized Administrator Account
                </p>
                <p className="text-xs font-mono font-semibold text-slate-900 dark:text-white break-all">
                  {AUTHORIZED_ADMIN_EMAIL}
                </p>
              </div>

              <button
                type="button"
                disabled={isGoogleRedirecting || lockoutSeconds > 0 || !isOnline}
                onClick={() => void handleAdminGoogleSignIn()}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-3 transition-colors shadow-xs cursor-pointer"
              >
                {isGoogleRedirecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Redirecting to Google...</span>
                  </>
                ) : lockoutSeconds > 0 ? (
                  <span className="tabular-nums">Temporarily Locked ({lockoutSeconds}s)</span>
                ) : (
                  <>
                    <span className="w-6 h-6 rounded-md bg-white flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                        />
                      </svg>
                    </span>
                    <span>Sign in with Google</span>
                  </>
                )}
              </button>

              {isEmbeddedIframe && typeof window !== 'undefined' && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 space-y-1.5 leading-relaxed">
                  <p>
                    Google blocks sign-in inside embedded preview frames. Open Admin Login in a
                    dedicated browser tab to complete Google authentication:
                  </p>
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span>Open Admin Login in Full Tab</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center leading-relaxed">
                Any other Google account is automatically rejected and signed out. Server-side
                administrator role verification is enforced on every request.
              </p>
            </div>
          )}
        </div>

        {/* Dedicated Android / Desktop / iOS PWA Install Card */}
        <AdminPWAInstallButton theme={theme} variant="card" />
      </main>

      {/* Quiet Security Footer */}
      <footer className="w-full max-w-5xl mx-auto py-3 text-center text-[11px] text-slate-500 dark:text-slate-500">
        GoAMAAS Admin &middot; AMAAS Technologies &middot; Server-verified access only
      </footer>
    </div>
  );
};

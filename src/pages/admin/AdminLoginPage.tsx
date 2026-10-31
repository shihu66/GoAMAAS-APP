import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  KeyRound,
  WifiOff,
  Sun,
  Moon,
} from 'lucide-react';
import {
  supabase,
  isSupabaseConfigured,
  signOutFromSupabase,
  signInWithGoogle,
} from '../../lib/supabase';
import {
  UNIFORM_ADMIN_AUTH_ERROR,
  VerifiedAdminFactor,
  checkAdminLoginRateLimit,
  clearAdminLoginFailures,
  clearAdminSessionEvents,
  enforceMinimumAuthFloor,
  recordAdminLoginFailure,
  recordAdminSessionEvent,
  verifyAdminTotpChallenge,
  verifyServerAdminSession,
} from '../../lib/adminSecurity';
import { useAdminPWA } from '../../hooks/useAdminPWA';
import { AdminPWAInstallButton } from '../../components/admin/AdminPWAInstallBanner';
import { useApp } from '../../context/AppContext';

export const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { theme, toggleTheme, setAuthenticatedUser } = useApp();
  const { isOnline } = useAdminPWA(theme);

  const intendedDestination = (() => {
    const fromState = (location.state as { from?: string } | null)?.from;
    if (fromState && fromState.startsWith('/admin') && fromState !== '/admin/login') {
      return fromState;
    }
    return '/admin';
  })();

  const isExpiredSession = searchParams.get('expired') === '1';
  const isOauthUnauthorized = searchParams.get('unauthorized') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingExisting, setIsCheckingExisting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(
    isOauthUnauthorized ? UNIFORM_ADMIN_AUTH_ERROR : null
  );
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  // MFA step-up challenge right inside login if enrolled
  const [mfaChallengeFactor, setMfaChallengeFactor] = useState<VerifiedAdminFactor | null>(null);
  const [totpCode, setTotpCode] = useState('');

  // Check if user already holds a valid server-verified admin session
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

      const res = await verifyServerAdminSession();
      if (!active) return;

      if (res.status === 'authorized' && res.admin) {
        setAuthenticatedUser({
          id: res.admin.id,
          name: res.admin.name,
          email: res.admin.email,
          role: 'admin',
          storeId: '',
        });
        navigate(intendedDestination, { replace: true });
        return;
      }

      if (res.status === 'mfa_required' && res.mfa.verifiedTotpFactors[0]) {
        setMfaChallengeFactor(res.mfa.verifiedTotpFactors[0]);
      }

      setIsCheckingExisting(false);
    })();

    return () => {
      active = false;
    };
  }, [intendedDestination, navigate, setAuthenticatedUser]);

  // Countdown timer when rate-limit lockout is active
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = window.setInterval(() => {
      const check = checkAdminLoginRateLimit();
      setLockoutSeconds(check.allowed ? 0 : check.retryAfterSeconds);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockoutSeconds]);

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isGoogleRedirecting) return;

    if (!isOnline) {
      setErrorBanner('Your device is offline. Reconnect to the internet to sign in.');
      return;
    }

    const rate = checkAdminLoginRateLimit();
    if (!rate.allowed) {
      setLockoutSeconds(rate.retryAfterSeconds);
      setErrorBanner(
        `Too many unsuccessful sign-in attempts. Please wait ${rate.retryAfterSeconds}s before trying again.`
      );
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setErrorBanner('Administrative authentication service is not configured.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setErrorBanner('Enter both your email address and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorBanner(null);
    const startedAt = Date.now();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error || !data.user) {
        await enforceMinimumAuthFloor(startedAt, 500);
        const failure = recordAdminLoginFailure();
        if (failure.lockedOut) {
          setLockoutSeconds(failure.retryAfterSeconds);
          setErrorBanner(
            `Too many unsuccessful sign-in attempts. Sign-in is temporarily locked for ${failure.retryAfterSeconds}s.`
          );
        } else {
          setErrorBanner(UNIFORM_ADMIN_AUTH_ERROR);
        }
        return;
      }

      // Immediately verify platform admin status on the server (never leak whether account was valid non-admin)
      const adminCheck = await verifyServerAdminSession();
      await enforceMinimumAuthFloor(startedAt, 500);

      if (adminCheck.status === 'forbidden' || adminCheck.status === 'unauthenticated') {
        await signOutFromSupabase();
        clearAdminSessionEvents();
        const failure = recordAdminLoginFailure();
        if (failure.lockedOut) {
          setLockoutSeconds(failure.retryAfterSeconds);
          setErrorBanner(
            `Too many unsuccessful sign-in attempts. Sign-in is temporarily locked for ${failure.retryAfterSeconds}s.`
          );
        } else {
          // Uniform non-enumerating error: never disclose that a valid merchant account exists vs admin account
          setErrorBanner(UNIFORM_ADMIN_AUTH_ERROR);
        }
        return;
      }

      if (adminCheck.status === 'network_error') {
        setErrorBanner(
          adminCheck.message || 'Network error while verifying administrator permissions.'
        );
        return;
      }

      clearAdminLoginFailures();

      if (adminCheck.status === 'mfa_required' && adminCheck.mfa.verifiedTotpFactors[0]) {
        setMfaChallengeFactor(adminCheck.mfa.verifiedTotpFactors[0]);
        setPassword('');
        return;
      }

      if (adminCheck.status === 'authorized' && adminCheck.admin) {
        setAuthenticatedUser({
          id: adminCheck.admin.id,
          name: adminCheck.admin.name,
          email: adminCheck.admin.email,
          role: 'admin',
          storeId: '',
        });
        recordAdminSessionEvent({
          adminId: adminCheck.admin.id,
          action: 'admin_sign_in',
          targetType: 'session',
          targetId: 'admin_portal',
          outcome: 'success',
          summary: 'Verified administrator session established.',
        });
        navigate(intendedDestination, { replace: true });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallengeFactor || isSubmitting) return;
    setIsSubmitting(true);
    setErrorBanner(null);

    try {
      const verifyRes = await verifyAdminTotpChallenge(mfaChallengeFactor.id, totpCode);
      if (!verifyRes.success) {
        setErrorBanner(verifyRes.error || 'Invalid authenticator code.');
        return;
      }

      const finalCheck = await verifyServerAdminSession();
      if (finalCheck.status === 'authorized' && finalCheck.admin) {
        setAuthenticatedUser({
          id: finalCheck.admin.id,
          name: finalCheck.admin.name,
          email: finalCheck.admin.email,
          role: 'admin',
          storeId: '',
        });
        recordAdminSessionEvent({
          adminId: finalCheck.admin.id,
          action: 'admin_sign_in_mfa',
          targetType: 'session',
          targetId: mfaChallengeFactor.id,
          outcome: 'success',
          summary: 'Verified administrator session with AAL2 TOTP MFA.',
        });
        navigate(intendedDestination, { replace: true });
      } else {
        setErrorBanner(UNIFORM_ADMIN_AUTH_ERROR);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminGoogleSignIn = async () => {
    if (isSubmitting || isGoogleRedirecting) return;
    if (!isOnline) {
      setErrorBanner('Your device is offline. Reconnect to continue.');
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

    setIsGoogleRedirecting(true);
    setErrorBanner(null);
    const callbackUrl = `${window.location.origin}/auth/callback?next=/admin`;
    const { error } = await signInWithGoogle(callbackUrl);
    if (error) {
      setIsGoogleRedirecting(false);
      setErrorBanner('Unable to start Google sign-in. Please use email and password or retry.');
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
            Your administrator session expired. Please sign in again to continue.
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
                : 'Restricted operations portal for authorized AMAAS Technologies administrators.'}
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
                disabled={isSubmitting || totpCode.length !== 6}
                className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Verify &amp; Enter Console</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  await signOutFromSupabase();
                  setMfaChallengeFactor(null);
                  setTotpCode('');
                  setErrorBanner(null);
                }}
                className="w-full min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
              >
                Use Different Credentials
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <form onSubmit={(e) => void handlePasswordSignIn(e)} className="space-y-4">
                <div>
                  <label
                    htmlFor="admin-email"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Administrator Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="admin-email"
                      type="email"
                      autoComplete="username"
                      required
                      disabled={isSubmitting || lockoutSeconds > 0}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errorBanner) setErrorBanner(null);
                      }}
                      placeholder="admin@amaas.xyz"
                      className="w-full min-h-[48px] pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:border-blue-600 disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="admin-password"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      disabled={isSubmitting || lockoutSeconds > 0}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorBanner) setErrorBanner(null);
                      }}
                      placeholder="Enter administrator password"
                      className="w-full min-h-[48px] pl-10 pr-12 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:border-blue-600 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="min-h-[44px] min-w-[44px] absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || isGoogleRedirecting || lockoutSeconds > 0 || !isOnline}
                  className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying Access...</span>
                    </>
                  ) : lockoutSeconds > 0 ? (
                    <span className="tabular-nums">Locked ({lockoutSeconds}s)</span>
                  ) : (
                    <span>Sign In to GoAMAAS Admin</span>
                  )}
                </button>
              </form>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 bg-white dark:bg-slate-900 text-[11px] text-slate-400">
                    or authorized workspace SSO
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={isSubmitting || isGoogleRedirecting || lockoutSeconds > 0 || !isOnline}
                onClick={() => void handleAdminGoogleSignIn()}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 disabled:opacity-50 text-slate-800 dark:text-slate-200 font-semibold text-xs inline-flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
              >
                {isGoogleRedirecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
                )}
                <span>Continue with Authorized Google Account</span>
              </button>
            </div>
          )}
        </div>

        {/* Dedicated Android / Mobile PWA Install Card */}
        <AdminPWAInstallButton theme={theme} variant="card" />
      </main>

      {/* Quiet Security Footer */}
      <footer className="w-full max-w-5xl mx-auto py-3 text-center text-[11px] text-slate-500 dark:text-slate-500">
        GoAMAAS Admin &middot; AMAAS Technologies &middot; Server-verified access only
      </footer>
    </div>
  );
};

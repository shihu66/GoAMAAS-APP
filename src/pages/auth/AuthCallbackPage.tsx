import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  supabase,
  isSupabaseConfigured,
  UUID_REGEX,
  getUserProfile,
  upsertUserProfile,
  consumeAdminOAuthIntent,
  signOutFromSupabase,
} from '../../lib/supabase';
import {
  AUTHORIZED_ADMIN_EMAIL,
  clearAdminLoginFailures,
  clearAdminSessionEvents,
  isAuthorizedAdminEmail,
  recordAdminLoginFailure,
  recordAdminSessionEvent,
  verifyServerAdminSession,
} from '../../lib/adminSecurity';
import { notifyAdminServiceWorkerSignOut } from '../../hooks/useAdminPWA';
import { useApp } from '../../context/AppContext';
import { Loader2, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthenticatedUser, logout, showToast } = useApp();
  const processedRef = useRef(false);

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAdminFlowState, setIsAdminFlowState] = useState<boolean>(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const nextFromQuery = (searchParams.get('next') || '').trim();
    const nextFromIntent = consumeAdminOAuthIntent();
    const effectiveNext = nextFromQuery || nextFromIntent || '';
    const isAdminAuthFlow =
      effectiveNext === '/admin' || effectiveNext.startsWith('/admin/');
    setIsAdminFlowState(isAdminAuthFlow);

    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      if (isAdminAuthFlow) {
        void (async () => {
          clearAdminSessionEvents();
          notifyAdminServiceWorkerSignOut();
          await signOutFromSupabase();
          await logout();
          navigate('/admin/login?oauth_error=1', { replace: true });
        })();
        return;
      }
      setStatus('error');
      if (errorParam === 'access_denied') {
        setErrorMessage(
          'Google authentication was cancelled. You can try again or use your email and password.'
        );
      } else {
        setErrorMessage(
          errorDescription || errorParam || 'Authentication was cancelled or encountered an error.'
        );
      }
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      if (isAdminAuthFlow) {
        navigate('/admin/login?oauth_error=1', { replace: true });
        return;
      }
      setStatus('error');
      setErrorMessage(
        'Supabase credentials are not configured in this environment. Unable to verify authentication session.'
      );
      return;
    }

    const processAuth = async () => {
      if (!supabase) {
        setStatus('error');
        setErrorMessage('Supabase client is not available.');
        return;
      }

      try {
        // 1. Check whether detectSessionInUrl already redeemed the PKCE code or implicit hash
        let {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        // 2. Only exchange ?code= manually if session is not yet populated
        const code = searchParams.get('code');
        if (!session?.user && code) {
          const { data: exchangeData, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeData?.session?.user) {
            session = exchangeData.session;
            sessionError = null;
          } else if (exchangeError) {
            // Re-check getSession() in case detectSessionInUrl completed concurrently
            const retryRes = await supabase.auth.getSession();
            if (retryRes.data.session?.user) {
              session = retryRes.data.session;
              sessionError = null;
            } else {
              throw exchangeError;
            }
          }
        }

        if (sessionError) {
          throw sessionError;
        }

        let authenticatedUser = session?.user;

        if (!authenticatedUser) {
          const hash = window.location.hash;
          if (hash && hash.includes('access_token')) {
            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError || !userData.user) {
              throw userError || new Error('No user found in active session.');
            }
            authenticatedUser = userData.user;
          } else {
            throw new Error('No session returned from authentication provider.');
          }
        }

        // Dedicated /admin OAuth flow: strictly verify official email + email_verified + server-side admin role
        if (isAdminAuthFlow) {
          const adminVerification = await verifyServerAdminSession();

          if (
            adminVerification.status === 'forbidden' ||
            adminVerification.status === 'unauthenticated'
          ) {
            clearAdminSessionEvents();
            notifyAdminServiceWorkerSignOut();
            await signOutFromSupabase();
            await logout();
            recordAdminLoginFailure();
            navigate('/admin/login?denied=1', { replace: true });
            return;
          }

          if (adminVerification.status === 'network_error') {
            navigate('/admin/login?oauth_error=1', { replace: true });
            return;
          }

          const safeAdminTarget =
            effectiveNext.startsWith('/admin') && effectiveNext !== '/admin/login'
              ? effectiveNext
              : '/admin';

          if (adminVerification.status === 'mfa_required') {
            clearAdminLoginFailures();
            navigate('/admin/login', {
              state: { from: safeAdminTarget },
              replace: true,
            });
            return;
          }

          if (
            adminVerification.status === 'authorized' &&
            adminVerification.admin &&
            isAuthorizedAdminEmail(adminVerification.admin.email)
          ) {
            clearAdminLoginFailures();
            setAuthenticatedUser({
              id: adminVerification.admin.id,
              name: adminVerification.admin.name,
              email: AUTHORIZED_ADMIN_EMAIL,
              role: 'admin',
              storeId: '',
            });
            recordAdminSessionEvent({
              adminId: adminVerification.admin.id,
              action: 'admin_sign_in_google',
              targetType: 'session',
              targetId: 'admin_portal',
              outcome: 'success',
              summary: 'Verified Google OAuth administrator session established.',
            });
            setStatus('success');
            navigate(safeAdminTarget, { replace: true });
            return;
          }

          clearAdminSessionEvents();
          notifyAdminServiceWorkerSignOut();
          await signOutFromSupabase();
          await logout();
          navigate('/admin/login?denied=1', { replace: true });
          return;
        }

        // Standard Customer / Merchant OAuth Flow
        const userMeta = authenticatedUser.user_metadata || {};
        const fullName =
          userMeta.full_name ||
          userMeta.name ||
          authenticatedUser.email?.split('@')[0] ||
          'Merchant';
        const email = authenticatedUser.email || '';
        const userId = authenticatedUser.id;

        const { profile } = await getUserProfile(userId);
        let onboardingCompleted = false;

        if (!profile) {
          const { error: upsertErr } = await upsertUserProfile({
            id: userId,
            full_name: fullName,
            email,
            role: 'merchant',
            onboarding_completed: Boolean(userMeta.onboarding_completed),
          });
          if (upsertErr) {
            throw new Error('Profile setup failed: ' + upsertErr.message);
          }
          onboardingCompleted = Boolean(userMeta.onboarding_completed);
        } else {
          onboardingCompleted = Boolean(profile.onboarding_completed);
        }

        const candidateStoreId = String(profile?.store_id || userMeta.store_id || '').trim();
        const resolvedStoreId = UUID_REGEX.test(candidateStoreId) ? candidateStoreId : '';

        let verifiedRole: 'merchant' | 'admin' = 'merchant';
        if (profile?.role === 'admin' && isAuthorizedAdminEmail(email)) {
          const { data: rpcAdmin } = await supabase.rpc('is_admin');
          if (rpcAdmin === true) {
            verifiedRole = 'admin';
          }
        }

        setAuthenticatedUser({
          id: userId,
          name: fullName,
          email,
          role: verifiedRole,
          storeId: resolvedStoreId,
        });

        setStatus('success');
        showToast(`Welcome, ${fullName}!`, 'success');

        setTimeout(() => {
          if (onboardingCompleted) {
            navigate('/dashboard', { replace: true });
          } else {
            navigate('/onboarding', { replace: true });
          }
        }, 400);
      } catch (err: unknown) {
        if (isAdminAuthFlow) {
          clearAdminSessionEvents();
          notifyAdminServiceWorkerSignOut();
          await signOutFromSupabase().catch(() => {});
          await logout().catch(() => {});
          navigate('/admin/login?oauth_error=1', { replace: true });
          return;
        }
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to finalize authentication session.'
        );
      }
    };

    void processAuth();
  }, [logout, navigate, searchParams, setAuthenticatedUser, showToast]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-6 text-center">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl space-y-6">
        {status === 'loading' && (
          <div className="space-y-4">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {isAdminFlowState
                ? 'Verifying Administrator Authorization...'
                : 'Authenticating with Google...'}
            </h2>
            <p className="text-xs text-slate-500">
              {isAdminFlowState
                ? 'Confirming verified Google identity and server-side administrator permissions.'
                : 'Verifying your session and synchronizing your merchant workspace.'}
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Authentication Confirmed
            </h2>
            <p className="text-xs text-slate-500">
              Session established. Redirecting...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Authentication Notice
            </h2>
            <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-left leading-relaxed">
              {errorMessage}
            </div>
            <div className="pt-2">
              <Link
                to={isAdminFlowState ? '/admin/login' : '/login'}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
              >
                <span>Return to Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

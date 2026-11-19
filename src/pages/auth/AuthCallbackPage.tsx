import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  supabase,
  isSupabaseConfigured,
  UUID_REGEX,
  getUserProfile,
  upsertUserProfile,
  consumeAdminOAuthIntent,
  consumeMerchantOAuthIntent,
  consumeCustomerOAuthIntent,
  consumeOAuthFlowSource,
  isSafeInternalRedirectPath,
  getInitialOAuthUrlSnapshot,
  hydrateImplicitHashSessionIfNeeded,
  setCustomerPortalSessionActive,
  clearCustomerPortalSessionActive,
  signOutFromSupabase,
  isTenantSubdomainHost,
} from '../../lib/supabase';
import { fetchCustomerProfileFromPortal } from '../../lib/customerPortal';
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

// Module-level single-flight guard ensuring a single-use OAuth authorization code is never redeemed twice
const exchangedAuthCodes = new Set<string>();

export function classifyAdminOAuthFailureReason(
  errorParam: string | null,
  errorCode: string | null,
  errorDescription: string | null
): string {
  const combined = `${errorParam || ''} ${errorCode || ''} ${errorDescription || ''}`.toLowerCase();
  if (errorParam === 'access_denied' || combined.includes('access_denied')) {
    return 'access_denied';
  }
  if (combined.includes('provider is not enabled') || combined.includes('unsupported provider')) {
    return 'provider_disabled';
  }
  if (
    combined.includes('unable to exchange external code') ||
    combined.includes('invalid_client') ||
    combined.includes('unauthorized_client') ||
    combined.includes('error getting user profile from external provider')
  ) {
    return 'external_code_exchange_failed';
  }
  if (
    combined.includes('redirect_uri') ||
    combined.includes('redirect url') ||
    combined.includes('not allowed')
  ) {
    return 'redirect_mismatch';
  }
  if (
    combined.includes('database error') ||
    combined.includes('saving new user') ||
    combined.includes('duplicate key')
  ) {
    return 'database_profile_error';
  }
  if (
    combined.includes('code verifier') ||
    combined.includes('flow_state') ||
    combined.includes('both auth code and code verifier')
  ) {
    return 'pkce_mismatch';
  }
  if (
    combined.includes('session_not_established') ||
    combined.includes('no session returned') ||
    combined.includes('auth session missing')
  ) {
    return 'session_not_established';
  }
  if (combined.includes('unexpected_failure') || combined.includes('server_error')) {
    return 'oauth_server_error';
  }
  return 'session_failed';
}

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthenticatedUser, logout, showToast } = useApp();
  const processedRef = useRef(false);

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAdminFlowState, setIsAdminFlowState] = useState<boolean>(false);
  const [isCustomerFlowState, setIsCustomerFlowState] = useState<boolean>(false);
  const [customerReturnTarget, setCustomerReturnTarget] = useState<string | null>(null);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const initialSnapshot = getInitialOAuthUrlSnapshot();
    const nextFromQuery = (searchParams.get('next') || '').trim();
    const nextFromIntent = consumeAdminOAuthIntent();
    const merchantNextIntent = consumeMerchantOAuthIntent();
    const customerIntent = consumeCustomerOAuthIntent();
    const oauthFlowSource = consumeOAuthFlowSource();
    const effectiveNext = nextFromQuery || nextFromIntent || '';
    const onTenantSubdomain = isTenantSubdomainHost();
    const isAdminAuthFlow =
      !onTenantSubdomain &&
      (oauthFlowSource === 'admin' ||
        effectiveNext === '/admin' ||
        effectiveNext.startsWith('/admin/'));
    const isCustomerAuthFlow =
      !isAdminAuthFlow &&
      (oauthFlowSource === 'customer' || Boolean(customerIntent) || onTenantSubdomain);
    setIsAdminFlowState(isAdminAuthFlow);
    setIsCustomerFlowState(isCustomerAuthFlow);
    if (isCustomerAuthFlow) {
      setCustomerReturnTarget(
        customerIntent?.returnPath || (onTenantSubdomain ? '/' : null)
      );
    }

    const hashParams =
      typeof window !== 'undefined' && window.location.hash
        ? new URLSearchParams(window.location.hash.replace(/^#/, ''))
        : new URLSearchParams();

    const errorParam =
      searchParams.get('error') || hashParams.get('error') || initialSnapshot.error;
    const errorCode =
      searchParams.get('error_code') || hashParams.get('error_code') || initialSnapshot.errorCode;
    const errorDescription =
      searchParams.get('error_description') ||
      hashParams.get('error_description') ||
      initialSnapshot.errorDescription;

    if (errorParam || errorCode) {
      const reason = classifyAdminOAuthFailureReason(errorParam, errorCode, errorDescription);
      try {
        if ((import.meta as any).env?.DEV) {
          console.warn('[GoAMAAS Auth Callback] OAuth error returned:', reason);
        }
      } catch {}

      if (isAdminAuthFlow) {
        void (async () => {
          clearAdminSessionEvents();
          notifyAdminServiceWorkerSignOut();
          await signOutFromSupabase();
          await logout({ silent: true });
          navigate(`/admin/login?oauth_error=1&reason=${encodeURIComponent(reason)}`, {
            replace: true,
          });
        })();
        return;
      }
      setStatus('error');
      if (reason === 'access_denied') {
        setErrorMessage(
          isCustomerAuthFlow
            ? 'Google sign-in was cancelled or denied. Please try again with a Google account or continue with guest checkout.'
            : 'Google authentication was cancelled. You can try again or use your email and password.'
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
        navigate('/admin/login?oauth_error=1&reason=unconfigured', { replace: true });
        return;
      }
      setStatus('error');
      setErrorMessage(
        'Supabase credentials are not configured in this environment. Unable to verify authentication session.'
      );
      return;
    }

    const handleVerifiedAdminFlow = async (targetAdminPath: string) => {
      const adminVerification = await verifyServerAdminSession();

      if (adminVerification.status === 'unauthenticated') {
        clearAdminSessionEvents();
        notifyAdminServiceWorkerSignOut();
        await signOutFromSupabase();
        await logout({ silent: true });
        navigate('/admin/login?oauth_error=1&reason=session_not_established', {
          replace: true,
        });
        return;
      }

      if (adminVerification.status === 'forbidden') {
        clearAdminSessionEvents();
        notifyAdminServiceWorkerSignOut();
        await signOutFromSupabase();
        await logout({ silent: true });

        // Separate issue: Google login succeeded for the authorized Google account,
        // but server-side database authorization (is_admin() / profiles.role === 'admin') failed.
        if (adminVerification.forbiddenReason === 'missing_admin_role') {
          navigate('/admin/login?authz_error=missing_admin_role', { replace: true });
          return;
        }

        recordAdminLoginFailure();
        navigate('/admin/login?denied=1', { replace: true });
        return;
      }

      if (adminVerification.status === 'network_error') {
        navigate('/admin/login?oauth_error=1&reason=network_error', { replace: true });
        return;
      }

      const safeAdminTarget =
        targetAdminPath.startsWith('/admin') && targetAdminPath !== '/admin/login'
          ? targetAdminPath
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
      await logout({ silent: true });
      navigate('/admin/login?denied=1', { replace: true });
    };

    const processAuth = async () => {
      if (!supabase) {
        setStatus('error');
        setErrorMessage('Supabase client is not available.');
        return;
      }

      try {
        // 1. Await GoTrueClient.initialize() so any URL callback exchange error is captured
        //    rather than silently discarded by getSession().
        const initResult = await supabase.auth.initialize();

        // 2. Check whether detectSessionInUrl already redeemed the PKCE code or active session
        const getSessionRes = await supabase.auth.getSession();
        let session = getSessionRes.data.session;
        let sessionError: Error | null = getSessionRes.error;

        // 3. Only exchange ?code= manually if session is not yet populated and code was not already redeemed
        const code = searchParams.get('code');
        if (!session?.user && code) {
          if (!initResult?.error && !exchangedAuthCodes.has(code)) {
            exchangedAuthCodes.add(code);
            const flowId = searchParams.get('sb_flow_id') || initialSnapshot.flowId || undefined;
            const { data: exchangeData, error: exchangeError } =
              await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
            if (exchangeData?.session?.user) {
              session = exchangeData.session;
              sessionError = null;
            } else if (exchangeError) {
              await new Promise((resolve) => setTimeout(resolve, 200));
              const retryRes = await supabase.auth.getSession();
              if (retryRes.data.session?.user) {
                session = retryRes.data.session;
                sessionError = null;
              } else {
                throw exchangeError;
              }
            }
          }
        }

        // 4. Fallback for implicit #access_token/#refresh_token URL fragments if ever returned
        if (!session?.user) {
          const implicitRes = await hydrateImplicitHashSessionIfNeeded();
          if (implicitRes.session?.user) {
            session = implicitRes.session;
            sessionError = null;
          } else if (implicitRes.error && !initResult?.error) {
            sessionError = implicitRes.error;
          }
        }

        if (!session?.user && initResult?.error) {
          throw initResult.error;
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
          clearCustomerPortalSessionActive();
          await handleVerifiedAdminFlow(effectiveNext || '/admin');
          return;
        }

        // Dedicated Storefront Customer OAuth flow:
        // Strictly scoped to the merchant storefront customer portal; NEVER grants merchant/admin dashboard access,
        // NEVER modifies profiles.role, and NEVER triggers merchant store provisioning.
        if (isCustomerAuthFlow) {
          const userMeta = authenticatedUser.user_metadata || {};
          const fullName =
            userMeta.full_name ||
            userMeta.name ||
            authenticatedUser.email?.split('@')[0] ||
            'Customer';
          const email = authenticatedUser.email || '';
          const avatarUrl =
            typeof userMeta.avatar_url === 'string' && userMeta.avatar_url
              ? userMeta.avatar_url
              : typeof userMeta.picture === 'string' && userMeta.picture
              ? userMeta.picture
              : undefined;
          const userId = authenticatedUser.id;
          const targetReturn =
            customerIntent?.returnPath ||
            (onTenantSubdomain
              ? '/?portal=account'
              : customerIntent?.subdomain
              ? `/s/${encodeURIComponent(customerIntent.subdomain)}?portal=account`
              : '/');

          setCustomerPortalSessionActive(userId, customerIntent?.subdomain || '');
          setAuthenticatedUser(
            {
              id: userId,
              name: fullName,
              email,
              avatar: avatarUrl,
              role: 'merchant',
              storeId: '',
            },
            { scope: 'customer' }
          );

          const resolvedCustomerSubdomain =
            customerIntent?.subdomain ||
            (onTenantSubdomain && typeof window !== 'undefined'
              ? window.location.hostname.split('.')[0].trim().toLowerCase()
              : '');
          if (resolvedCustomerSubdomain && session?.access_token) {
            void fetchCustomerProfileFromPortal(
              resolvedCustomerSubdomain,
              session.access_token
            ).catch(() => {});
          }

          setStatus('success');
          showToast(`Signed in as ${fullName}`, 'success');
          setTimeout(() => {
            navigate(targetReturn, { replace: true });
          }, 250);
          return;
        }

        // Fallback recovery when browser/PWA storage boundary cleared OAuth intent during admin sign-in:
        // If no explicit merchant/customer intent was set and the Google account matches the authorized admin email,
        // enforce the full server-side admin verification (including reporting missing_admin_role separately).
        if (
          !nextFromQuery &&
          !isCustomerAuthFlow &&
          oauthFlowSource !== 'merchant' &&
          isAuthorizedAdminEmail(authenticatedUser.email)
        ) {
          clearCustomerPortalSessionActive();
          setIsAdminFlowState(true);
          await handleVerifiedAdminFlow('/admin');
          return;
        }

        // Standard Merchant OAuth Flow
        clearCustomerPortalSessionActive();
        const userMeta = authenticatedUser.user_metadata || {};
        const fullName =
          userMeta.full_name ||
          userMeta.name ||
          authenticatedUser.email?.split('@')[0] ||
          'Merchant';
        const email = authenticatedUser.email || '';
        const avatarUrl =
          typeof userMeta.avatar_url === 'string' && userMeta.avatar_url
            ? userMeta.avatar_url
            : typeof userMeta.picture === 'string' && userMeta.picture
            ? userMeta.picture
            : undefined;
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

        setAuthenticatedUser(
          {
            id: userId,
            name: fullName,
            email,
            avatar: avatarUrl || profile?.avatar_url || undefined,
            role: verifiedRole,
            storeId: resolvedStoreId,
          },
          { scope: verifiedRole === 'admin' ? 'admin' : 'merchant' }
        );

        setStatus('success');
        showToast(`Welcome, ${fullName}!`, 'success');

        setTimeout(() => {
          if (onboardingCompleted) {
            if (
              merchantNextIntent &&
              isSafeInternalRedirectPath(merchantNextIntent) &&
              (merchantNextIntent !== '/onboarding' || !resolvedStoreId)
            ) {
              navigate(merchantNextIntent, { replace: true });
            } else {
              navigate('/dashboard', { replace: true });
            }
          } else {
            navigate('/onboarding', { replace: true });
          }
        }, 400);
      } catch (err: unknown) {
        const errCode =
          err && typeof err === 'object' && 'code' in err && typeof (err as any).code === 'string'
            ? (err as any).code
            : null;
        const errText = err instanceof Error ? err.message : '';
        const reason = classifyAdminOAuthFailureReason(null, errCode, errText);
        try {
          if ((import.meta as any).env?.DEV) {
            console.warn('[GoAMAAS Auth Callback] Session establishment failed:', reason);
          }
        } catch {}

        if (isAdminAuthFlow) {
          clearAdminSessionEvents();
          notifyAdminServiceWorkerSignOut();
          await signOutFromSupabase().catch(() => {});
          await logout({ silent: true }).catch(() => {});
          navigate(`/admin/login?oauth_error=1&reason=${encodeURIComponent(reason)}`, {
            replace: true,
          });
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
                : isCustomerFlowState
                ? 'Verifying your customer session and returning you to the storefront.'
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
                to={
                  isAdminFlowState
                    ? '/admin/login'
                    : customerReturnTarget || (isCustomerFlowState ? '/' : '/login')
                }
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
              >
                <span>
                  {customerReturnTarget || isCustomerFlowState
                    ? 'Return to Storefront'
                    : 'Return to Sign In'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured, getUserProfile, upsertUserProfile } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { Loader2, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthenticatedUser, showToast } = useApp();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      setStatus('error');
      if (errorParam === 'access_denied') {
        setErrorMessage('Google authentication was cancelled. You can try again or use your email and password.');
      } else {
        setErrorMessage(errorDescription || errorParam || 'Authentication was cancelled or encountered an error.');
      }
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setStatus('error');
      setErrorMessage('Supabase credentials are not configured in this environment. Unable to verify authentication session.');
      return;
    }

    const processAuth = async () => {
      if (!supabase) {
        setStatus('error');
        setErrorMessage('Supabase client is not available.');
        return;
      }
      try {
        const code = searchParams.get('code');
        if (code) {
          // PKCE flow code exchange
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        let authenticatedUser = session?.user;

        if (!authenticatedUser) {
          // If implicit flow token in hash, allow Supabase client to parse it
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

        const userMeta = authenticatedUser.user_metadata || {};
        const fullName = userMeta.full_name || userMeta.name || authenticatedUser.email?.split('@')[0] || 'Merchant';
        const email = authenticatedUser.email || '';
        const userId = authenticatedUser.id;

        // Check or create profile in Supabase PostgreSQL
        const { profile, error: getProfileError } = await getUserProfile(userId);
        if (getProfileError) {
          console.warn('Could not retrieve existing profile:', getProfileError.message);
        }

        let onboardingCompleted = false;

        if (!profile) {
          // Auto-provision profile record
          const { error: upsertErr } = await upsertUserProfile({
            id: userId,
            full_name: fullName,
            email: email,
            role: 'merchant',
            onboarding_completed: Boolean(userMeta.onboarding_completed),
          });
          if (upsertErr) {
            console.error('Failed to auto-provision profile on OAuth callback:', upsertErr);
            throw new Error("Profile setup failed: " + upsertErr.message);
          }
          onboardingCompleted = Boolean(userMeta.onboarding_completed);
        } else {
          onboardingCompleted = Boolean(profile.onboarding_completed);
        }

        // Sync into AppContext
        setAuthenticatedUser({
          id: userId,
          name: fullName,
          email: email,
          role: (profile?.role || 'merchant'),
          storeId: profile?.store_id || userMeta.store_id || `store-${userId.substring(0, 8)}`,
        });

        setStatus('success');
        showToast(`Welcome, ${fullName}!`, 'success');

        // Redirect: existing users -> /dashboard, new users -> /onboarding
        setTimeout(() => {
          if (onboardingCompleted) {
            navigate('/dashboard', { replace: true });
          } else {
            navigate('/onboarding', { replace: true });
          }
        }, 500);
      } catch (err: unknown) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Failed to finalize authentication session.');
      }
    };

    processAuth();
  }, [navigate, searchParams, setAuthenticatedUser, showToast]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-6 text-center">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl space-y-6">
        {status === 'loading' && (
          <div className="space-y-4">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Authenticating with Google...
            </h2>
            <p className="text-xs text-slate-500">
              Verifying your session and synchronizing your merchant workspace.
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
              Session established. Redirecting to your workspace...
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
                to="/login"
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

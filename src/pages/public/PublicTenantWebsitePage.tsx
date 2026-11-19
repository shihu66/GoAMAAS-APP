import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { SubscribedWebsite } from '../../types';
import {
  supabase,
  isSupabaseConfigured,
  validateSubdomainFormat,
  isTenantSubdomainHost,
  getMainAppOrigin,
} from '../../lib/supabase';
import {
  isWebsiteSubscriptionExpired,
  isWebsiteTrulyLive,
} from '../../lib/paymentWorkflow';
import { WebsitePreviewRenderer } from '../../components/website/WebsitePreviewRenderer';
import { CustomerPortalTab } from '../../components/website/CustomerPortalModal';
import { ToastContainer } from '../../components/ui/Toast';
import { Globe, ArrowLeft, Loader2, Sparkles } from 'lucide-react';

export const PublicTenantWebsitePage: React.FC = () => {
  const { subdomain: paramSubdomain } = useParams<{ subdomain?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    user,
    subscribedWebsites,
    resolvePublicWebsite,
    submitPublicCustomerOrder,
    submitPublicCustomerInquiry,
    loginAsCustomerWithGoogle,
    transitionCustomerToMerchantOnboarding,
    logout,
  } = useApp();
  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState<SubscribedWebsite | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const initialPortalParam = searchParams.get('portal');
  const initialOrderParam = searchParams.get('order');

  // Determine subdomain from URL param or actual window hostname (e.g. businessname.amaas.xyz or businessname.localhost)
  const resolvedSubdomain = (() => {
    if (paramSubdomain) return paramSubdomain.trim().toLowerCase();
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      let candidate = '';
      if (host.endsWith('.amaas.xyz') && host !== 'amaas.xyz') {
        candidate = host.slice(0, -'.amaas.xyz'.length);
      } else if (host.endsWith('.localhost') && host !== 'localhost') {
        candidate = host.slice(0, -'.localhost'.length);
      }
      if (candidate && !candidate.includes('.') && validateSubdomainFormat(candidate).valid) {
        return candidate;
      }
    }
    return null;
  })();

  // Track current Supabase JWT access token for authenticated customer portal API calls
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user?.id) {
      setAccessToken(null);
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setAccessToken(data.session?.access_token || null);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!cancelled) {
        setAccessToken(session?.access_token || null);
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [user?.id]);

  const resolvePublicWebsiteRef = React.useRef(resolvePublicWebsite);
  resolvePublicWebsiteRef.current = resolvePublicWebsite;

  const refreshResolvedSite = React.useCallback(async () => {
    if (!resolvedSubdomain) return;
    const res = await resolvePublicWebsiteRef.current(resolvedSubdomain);
    const validLiveSite = res.site && isWebsiteTrulyLive(res.site) ? res.site : null;
    if (validLiveSite) {
      setSite(validLiveSite);
    }
  }, [resolvedSubdomain]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (!resolvedSubdomain) {
      setSite(null);
      setLoading(false);
      return;
    }

    const loadSite = async () => {
      const res = await resolvePublicWebsiteRef.current(resolvedSubdomain);
      if (cancelled) return;
      const validLiveSite =
        res.site && isWebsiteTrulyLive(res.site) ? res.site : null;
      setSite(validLiveSite);
      setLoading(false);
      if (typeof document !== 'undefined') {
        document.title = validLiveSite?.businessName
          ? `${validLiveSite.businessName} — Official Storefront`
          : 'Storefront Unavailable — GoAMAAS';
      }
    };
    void loadSite();

    return () => {
      cancelled = true;
    };
  }, [resolvedSubdomain, subscribedWebsites]);

  const handleCustomerGoogleSignIn = async (tab?: CustomerPortalTab | 'cart') => {
    const sub = site?.subdomain || resolvedSubdomain || '';
    const targetTab = tab || 'account';
    const isTenantHost =
      typeof window !== 'undefined' &&
      ((window.location.hostname.toLowerCase().endsWith('.amaas.xyz') &&
        window.location.hostname.toLowerCase() !== 'amaas.xyz') ||
        (window.location.hostname.toLowerCase().endsWith('.localhost') &&
          window.location.hostname.toLowerCase() !== 'localhost'));
    const returnPath = isTenantHost
      ? `/?portal=${encodeURIComponent(targetTab)}`
      : `/s/${encodeURIComponent(sub)}?portal=${encodeURIComponent(targetTab)}`;
    const result = await loginAsCustomerWithGoogle(sub, returnPath);
    if (result.error) {
      throw result.error;
    }
  };

  const handleStartBusinessFromCustomerPortal = async () => {
    if (!user || !accessToken) {
      if (isTenantSubdomainHost()) {
        window.location.assign(`${getMainAppOrigin()}/login?redirect=%2Fonboarding`);
      } else {
        navigate('/login?redirect=%2Fonboarding');
      }
      return;
    }

    const result = await transitionCustomerToMerchantOnboarding();
    if (result.status === 'cross_origin' && result.redirectUrl) {
      window.location.assign(result.redirectUrl);
      return;
    }
    navigate(result.targetPath);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
          Loading Storefront...
        </h2>
        {resolvedSubdomain && (
          <p className="text-xs text-slate-500 font-mono mt-1">
            https://{resolvedSubdomain}.amaas.xyz
          </p>
        )}
      </div>
    );
  }

  // Enforce strict public access control (Issues 6 & 9):
  // Never render pending, rejected, unpaid, expired, grace_period, suspended, cancelled, or draft sites,
  // and never leak private customer/business PII on unavailable pages.
  if (!site || !isWebsiteTrulyLive(site) || isWebsiteSubscriptionExpired(site)) {
    const safeSubdomainLabel = resolvedSubdomain
      ? `https://${resolvedSubdomain}.amaas.xyz`
      : 'https://amaas.xyz';

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center mx-auto">
            <Globe className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Website Currently Unavailable
            </h1>
            <p className="text-xs text-slate-500 font-mono">{safeSubdomainLabel}</p>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            This GoAMAAS storefront is not currently published, is awaiting subscription verification, or its 30-day subscription period has expired.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Owner Sign In</span>
            </Link>
            <Link
              to="/create-website"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Create a Website</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <WebsitePreviewRenderer
        site={site}
        viewMode="desktop"
        isPublicView={true}
        showGraceBanner={false}
        customerUser={user}
        customerAccessToken={accessToken}
        initialPortalParam={initialPortalParam}
        initialOrderParam={initialOrderParam}
        onCustomerGoogleSignIn={handleCustomerGoogleSignIn}
        onCustomerSignOut={async () => {
          await logout();
          if (searchParams.has('portal') || searchParams.has('order')) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('portal');
            nextParams.delete('order');
            setSearchParams(nextParams, { replace: true });
          }
        }}
        onStartCustomerBusiness={handleStartBusinessFromCustomerPortal}
        onSubmitOrder={submitPublicCustomerOrder}
        onSubmitInquiry={submitPublicCustomerInquiry}
        onOrderPlaced={() => void refreshResolvedSite()}
      />
      <ToastContainer />
    </div>
  );
};

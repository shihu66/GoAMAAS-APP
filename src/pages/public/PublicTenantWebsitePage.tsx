import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { SubscribedWebsite } from '../../types';
import { validateSubdomainFormat } from '../../lib/supabase';
import { WebsitePreviewRenderer } from '../../components/website/WebsitePreviewRenderer';
import { Globe, ArrowLeft, Lock, Loader2, Sparkles, AlertCircle } from 'lucide-react';

export const PublicTenantWebsitePage: React.FC = () => {
  const { subdomain: paramSubdomain } = useParams<{ subdomain?: string }>();
  const { subscribedWebsites, resolvePublicWebsite } = useApp();
  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState<SubscribedWebsite | null>(null);

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

  useEffect(() => {
    setLoading(true);
    if (!resolvedSubdomain) {
      setSite(null);
      setLoading(false);
      return;
    }

    const loadSite = async () => {
      const res = await resolvePublicWebsite(resolvedSubdomain);
      setSite(res.site);
      setLoading(false);
      if (res.site?.businessName && typeof document !== 'undefined') {
        document.title = `${res.site.businessName} — Official Storefront`;
      }
    };
    loadSite();
  }, [resolvedSubdomain, resolvePublicWebsite]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
          Loading Storefront...
        </h2>
        <p className="text-xs text-slate-500 font-mono mt-1">https://{resolvedSubdomain}.amaas.xyz</p>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Globe className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Website Not Found</h1>
            <p className="text-xs text-slate-500 font-mono">
              https://{resolvedSubdomain || 'unknown'}.amaas.xyz
            </p>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            This GoAMAAS subdomain has not been published yet or is currently awaiting payment approval by our operations team.
          </p>
          <div className="pt-2">
            <Link
              to="/create-website"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Build Your Business Website</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // If website is draft or payment is pending, only authenticated owner or admin can view
  const isPaid = site.paymentStatus === 'paid';
  const isUnavailable =
    site.subscriptionStatus === 'suspended' ||
    site.subscriptionStatus === 'cancelled' ||
    site.subscriptionStatus === 'draft' ||
    site.deploymentStatus !== 'live';

  if (!isPaid) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{site.businessName}</h1>
            <p className="text-xs text-slate-500 font-mono">
              https://{site.fullDomainUrl}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs">
            Website publication is pending manual payment verification. Public visitors cannot view draft sites until approved.
          </div>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-xs"
            >
              <span>Merchant Sign In to Manage</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isUnavailable) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{site.businessName}</h1>
            <p className="text-xs text-slate-500 font-mono">
              https://{site.fullDomainUrl}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs">
            This storefront is currently offline or undergoing scheduled maintenance.
          </div>
        </div>
      </div>
    );
  }

  // Full-Screen Public Website View
  return (
    <div className="min-h-screen bg-white">
      <WebsitePreviewRenderer
        site={site}
        viewMode="desktop"
        isPublicView={true}
        showGraceBanner={site.subscriptionStatus === 'grace_period'}
      />
    </div>
  );
};

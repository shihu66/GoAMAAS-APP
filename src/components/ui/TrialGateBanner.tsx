import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ServiceTrialCategory, ServiceAccessStatus } from '../../types';
import { Sparkles, Lock, ArrowRight, Loader2, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

interface TrialGateBannerProps {
  serviceId: string;
  serviceName: string;
  category: ServiceTrialCategory;
  serviceDescription: string;
  features: string[];
  subscribePath?: string;
  subscribePriceLabel?: string;
}

export const TrialGateBanner: React.FC<TrialGateBannerProps> = ({
  serviceId,
  serviceName,
  category,
  serviceDescription,
  features,
  subscribePath = '/dashboard/billing',
  subscribePriceLabel,
}) => {
  const { getServiceAccess, activateServiceTrial } = useApp();
  const access: ServiceAccessStatus = getServiceAccess(serviceId, serviceName, category);
  const [loading, setLoading] = useState(false);

  const handleActivate = async () => {
    setLoading(true);
    await activateServiceTrial(serviceId, serviceName, category);
    setLoading(false);
  };

  const isExpired = access.status === 'trial_expired';

  return (
    <div className="p-8 sm:p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl max-w-3xl mx-auto my-8 text-center space-y-6">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-md">
        {isExpired ? <Lock className="w-7 h-7" /> : <Sparkles className="w-7 h-7" />}
      </div>

      <div className="space-y-2 max-w-xl mx-auto">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
          <span>{category.replace('_', ' ').toUpperCase()}</span>
          <span>·</span>
          <span>{isExpired ? 'Trial Expired' : 'Independent 7-Day Free Trial'}</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          {isExpired ? `Reactivate ${serviceName}` : `Activate 7-Day Free Trial for ${serviceName}`}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          {isExpired
            ? `Your 7-day free trial for ${serviceName} ended on ${access.formattedExpiresAt}. All of your configured data and settings are safely preserved. Upgrade to a paid subscription to continue.`
            : serviceDescription}
        </p>
      </div>

      {/* Feature list */}
      <div className="p-4 sm:p-6 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-left max-w-lg mx-auto">
        <div className="text-xs font-semibold text-slate-900 dark:text-white mb-3">
          {isExpired ? 'Features awaiting reactivation:' : 'What is included in this 7-day trial:'}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
          {features.map((f, i) => (
            <div key={i} className="flex items-start gap-2">
              <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        {!isExpired ? (
          <button
            type="button"
            onClick={handleActivate}
            disabled={loading}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>Start 7-Day Free Trial (No Card Required)</span>
          </button>
        ) : (
          <Link
            to={subscribePath}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all shadow-md flex items-center justify-center gap-2"
          >
            <span>Upgrade Subscription {subscribePriceLabel ? `(${subscribePriceLabel})` : ''}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}

        <Link
          to="/dashboard/billing"
          className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors"
        >
          View All Services & Plans
        </Link>
      </div>

      <p className="text-[11px] text-slate-400">
        Activating this trial does not affect or consume any other service trial in your account.
      </p>
    </div>
  );
};

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ServiceTrialCategory, ServiceAccessStatus } from '../../types';
import { Clock, Sparkles, CheckCircle2, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface TrialStatusBadgeProps {
  serviceId: string;
  serviceName: string;
  category: ServiceTrialCategory;
  showActivateButton?: boolean;
  onActivated?: () => void;
  className?: string;
}

export const TrialStatusBadge: React.FC<TrialStatusBadgeProps> = ({
  serviceId,
  serviceName,
  category,
  showActivateButton = true,
  onActivated,
  className = '',
}) => {
  const { getServiceAccess, activateServiceTrial } = useApp();
  const access: ServiceAccessStatus = getServiceAccess(serviceId, serviceName, category);
  const [loading, setLoading] = useState(false);

  const handleActivate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    const res = await activateServiceTrial(serviceId, serviceName, category);
    setLoading(false);
    if (res.success && onActivated) {
      onActivated();
    }
  };

  if (access.status === 'subscribed') {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium ${className}`}>
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Subscribed Plan Active</span>
      </div>
    );
  }

  if (access.status === 'trial_active') {
    return (
      <div className={`inline-flex items-center gap-2 p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-700 dark:text-blue-300 ${className}`}>
        <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="font-semibold tabular-nums">
          7-Day Free Trial Active · {access.daysRemaining}d remaining
        </span>
        <span className="text-[11px] text-blue-500 dark:text-blue-400 hidden sm:inline">
          (Expires {access.formattedExpiresAt})
        </span>
      </div>
    );
  }

  if (access.status === 'trial_expired') {
    return (
      <div className={`inline-flex items-center gap-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 ${className}`}>
        <div className="flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span className="font-semibold">7-Day Free Trial Expired</span>
        </div>
        <Link
          to="/dashboard/billing"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-[11px] transition-colors"
        >
          <span>Subscribe to Unlock</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  // Available to start trial
  if (!showActivateButton) {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 ${className}`}>
        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
        <span>7-Day Free Trial Available</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleActivate}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs transition-all shadow-xs disabled:opacity-60 cursor-pointer ${className}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Sparkles className="w-3.5 h-3.5" />
      )}
      <span>Start 7-Day Free Trial</span>
    </button>
  );
};

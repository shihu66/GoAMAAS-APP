import React from 'react';
import {
  CheckCircle2,
  Clock,
  FileEdit,
  AlertCircle,
  PauseCircle,
  Truck,
  PackageCheck,
  XCircle,
  Sparkles,
} from 'lucide-react';

export type SemanticTone =
  | 'live'
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'neutral'
  | 'info';

interface StatusBadgeProps {
  tone: SemanticTone;
  label: string;
  className?: string;
}

const TONE_STYLES: Record<
  SemanticTone,
  { wrapper: string; Icon: React.FC<{ className?: string }> }
> = {
  live: {
    wrapper:
      'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/70',
    Icon: CheckCircle2,
  },
  approved: {
    wrapper:
      'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/70',
    Icon: CheckCircle2,
  },
  delivered: {
    wrapper:
      'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/70',
    Icon: PackageCheck,
  },
  draft: {
    wrapper:
      'bg-slate-100 text-slate-700 border-slate-200/90 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700',
    Icon: FileEdit,
  },
  neutral: {
    wrapper:
      'bg-slate-100 text-slate-700 border-slate-200/90 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700',
    Icon: Sparkles,
  },
  pending: {
    wrapper:
      'bg-amber-50 text-amber-800 border-amber-200/80 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/70',
    Icon: Clock,
  },
  processing: {
    wrapper:
      'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/70',
    Icon: Clock,
  },
  info: {
    wrapper:
      'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/70',
    Icon: Sparkles,
  },
  shipped: {
    wrapper:
      'bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/70',
    Icon: Truck,
  },
  rejected: {
    wrapper:
      'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/70',
    Icon: AlertCircle,
  },
  cancelled: {
    wrapper:
      'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/70',
    Icon: XCircle,
  },
  suspended: {
    wrapper:
      'bg-orange-50 text-orange-800 border-orange-200/80 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800/70',
    Icon: PauseCircle,
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  tone,
  label,
  className = '',
}) => {
  const { wrapper, Icon } = TONE_STYLES[tone] || TONE_STYLES.neutral;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium leading-none whitespace-nowrap ${wrapper} ${className}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};

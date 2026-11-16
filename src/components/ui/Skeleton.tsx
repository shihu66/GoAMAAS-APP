import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const SkeletonBlock: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div
    aria-hidden="true"
    className={`animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-800/80 ${className}`}
  />
);

export const KpiCardSkeleton: React.FC = () => (
  <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-3">
    <div className="flex items-center justify-between">
      <SkeletonBlock className="h-3.5 w-24" />
      <SkeletonBlock className="h-8 w-8 rounded-lg" />
    </div>
    <SkeletonBlock className="h-7 w-28" />
    <SkeletonBlock className="h-3 w-36" />
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
    <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4">
      <SkeletonBlock className="h-4 w-32" />
      <SkeletonBlock className="h-4 w-24 ml-auto" />
    </div>
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-4 flex items-center gap-4">
          <SkeletonBlock className="h-10 w-10 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-3.5 w-48 max-w-full" />
            <SkeletonBlock className="h-3 w-32 max-w-full" />
          </div>
          <SkeletonBlock className="h-6 w-20 rounded-md" />
        </div>
      ))}
    </div>
  </div>
);

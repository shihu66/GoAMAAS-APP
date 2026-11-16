import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import type { ThemePreference } from '../../lib/theme';

interface ThemeSelectorProps {
  compact?: boolean;
  className?: string;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  compact = false,
  className = '',
}) => {
  const { themePreference, setThemePreference } = useApp();
  const { lang } = useLanguage();
  const isBn = lang === 'bn';

  const options: Array<{
    value: ThemePreference;
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { value: 'light', label: isBn ? 'লাইট' : 'Light', icon: Sun },
    { value: 'dark', label: isBn ? 'ডার্ক' : 'Dark', icon: Moon },
    { value: 'system', label: isBn ? 'সিস্টেম' : 'System', icon: Monitor },
  ];

  return (
    <div
      role="group"
      aria-label={isBn ? 'থিম নির্বাচন করুন' : 'Select theme'}
      className={`inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 ${className}`}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = themePreference === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setThemePreference(opt.value)}
            aria-pressed={active}
            title={opt.label}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors ${
              compact ? 'min-h-[36px] min-w-[36px] px-2 text-xs' : 'min-h-[34px] px-2.5 py-1 text-xs'
            } ${
              active
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200/70 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {!compact && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
};

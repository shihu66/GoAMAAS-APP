import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface LanguageSwitcherProps {
  size?: 'xs' | 'sm' | 'md';
  fullWidth?: boolean;
  compactLabels?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  size = 'sm',
  fullWidth = false,
  compactLabels = false,
}) => {
  const { lang, setLang, t } = useLanguage();

  const btnPadding =
    size === 'md'
      ? 'min-h-[44px] px-3.5 py-2 text-xs'
      : size === 'xs'
      ? 'min-h-[34px] px-2 py-1 text-[11px]'
      : 'min-h-[36px] px-2.5 py-1 text-xs';

  return (
    <div
      role="group"
      aria-label={t.nav.languageAria}
      className={`inline-flex items-center p-0.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 ${
        fullWidth ? 'w-full' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        className={`${btnPadding} ${
          fullWidth ? 'flex-1' : ''
        } rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap ${
          lang === 'en'
            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        {compactLabels ? 'EN' : 'English'}
      </button>
      <button
        type="button"
        onClick={() => setLang('bn')}
        aria-pressed={lang === 'bn'}
        className={`${btnPadding} ${
          fullWidth ? 'flex-1' : ''
        } rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap ${
          lang === 'bn'
            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        বাংলা
      </button>
    </div>
  );
};

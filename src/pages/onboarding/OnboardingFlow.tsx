import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { UUID_REGEX } from '../../lib/supabase';
import { GuidedWebsiteWizard } from '../../components/onboarding/GuidedWebsiteWizard';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { ThemeSelector } from '../../components/ui/ThemeSelector';
import { Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';

export const OnboardingFlow: React.FC = () => {
  const { completeOnboarding, activeStore, stores, onboarding, updateOnboarding } = useApp();
  const { t } = useLanguage();
  const ob = t.workspace.onboarding;
  const navigate = useNavigate();

  const [mode, setMode] = useState<'welcome' | 'wizard'>('welcome');
  const [isSkipping, setIsSkipping] = useState(false);

  const hasEstablishedStore = stores.some((s) => UUID_REGEX.test(s.id));

  const handleSkipForLater = async () => {
    if (isSkipping) return;
    setIsSkipping(true);
    try {
      await completeOnboarding({
        businessName: (hasEstablishedStore ? activeStore?.name : onboarding.businessName) || 'My Business',
        completed: true,
      });
      navigate('/dashboard');
    } finally {
      setIsSkipping(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* Clean Minimal Onboarding Header */}
      <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
            GA
          </span>
          <span className="font-bold text-base text-slate-950 dark:text-white tracking-tight">
            GoAMAAS
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onboarding.completed && hasEstablishedStore && (
            <Link
              to="/dashboard"
              className="min-h-[34px] inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
            >
              <span>Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
          <LanguageSwitcher size="sm" />
          <ThemeSelector compact />
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center px-4 sm:px-6 py-8 sm:py-12">
        {mode === 'welcome' ? (
          <div className="max-w-xl mx-auto w-full bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-7 sm:p-10 shadow-sm text-center space-y-6">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Sparkles className="w-7 h-7" />
            </div>

            <div className="space-y-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
                {ob.welcomeTitle}
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-md mx-auto">
                {ob.welcomeSubtitle}
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setMode('wizard')}
                className="min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <span>{ob.welcomeStartBtn}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={isSkipping}
                onClick={() => void handleSkipForLater()}
                className="min-h-[48px] inline-flex items-center justify-center px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/70 text-slate-700 dark:text-slate-200 text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer"
              >
                {ob.welcomeSkipBtn}
              </button>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{ob.welcomeReassurance}</span>
            </div>
          </div>
        ) : (
          <GuidedWebsiteWizard
            onCancel={() => setMode('welcome')}
            onSuccess={async (created) => {
              updateOnboarding({
                businessName: created.businessName,
                category: created.nicheLabel,
                phone: created.phone,
                completed: true,
              });
              await completeOnboarding({
                businessName: created.businessName,
                category: created.nicheLabel,
                phone: created.phone,
                completed: true,
              });
              navigate('/dashboard/subscribed-website');
            }}
          />
        )}
      </main>
    </div>
  );
};

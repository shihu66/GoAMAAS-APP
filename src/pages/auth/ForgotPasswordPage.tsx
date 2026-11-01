import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useLanguage, usePageSeo } from '../../context/LanguageContext';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { isSupabaseConfigured, getSupabaseConfigStatus } from '../../lib/supabase';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle, Loader2, Info, X, Sun, Moon } from 'lucide-react';

export const ForgotPasswordPage: React.FC = () => {
  const { requestPasswordReset, theme, toggleTheme } = useApp();
  const { t } = useLanguage();
  const a = t.auth;
  const fg = t.auth.forgot;

  usePageSeo({ title: fg.seoTitle });

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const configStatus = getSupabaseConfigStatus();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email) {
      setErrorMessage(fg.errEmailRequired);
      return;
    }

    if (!isSupabaseConfigured) {
      setShowConfigModal(true);
      return;
    }

    setLoading(true);
    const { error } = await requestPasswordReset(email);
    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* Minimal Auth Top Utility Bar */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="min-h-[38px] inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{a.backToHome}</span>
        </Link>

        <div className="flex items-center gap-2">
          <LanguageSwitcher size="sm" />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t.nav.toggleTheme}
            title={t.nav.toggleTheme}
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2.5">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm tracking-wider shadow-xs">
              GA
            </span>
            <span className="text-2xl font-extrabold text-slate-950 dark:text-white tracking-tight">
              GoAMAAS
            </span>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-950 dark:text-white tracking-tight pt-1">
            {fg.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            {fg.subtitle}
          </p>
        </div>

        <div className="mt-7 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-slate-50/70 dark:bg-slate-900/80 py-8 px-6 sm:px-9 border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-6">
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {!isSupabaseConfigured && (
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{fg.supabaseResetBanner} </span>
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(true)}
                    className="font-semibold underline hover:text-amber-900 dark:hover:text-amber-200 cursor-pointer"
                  >
                    {fg.viewSetupDetails}
                  </button>
                </div>
              </div>
            )}

            {sent ? (
              <div className="text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-950 dark:text-white">
                  {fg.sentTitle}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {fg.sentBody(email)}
                </p>
                <div className="pt-2">
                  <Link
                    to="/login"
                    className="w-full min-h-[44px] inline-flex items-center justify-center py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                  >
                    {fg.returnSignIn}
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {fg.emailLabel}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="merchant@yourbrand.com"
                      className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[46px] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{loading ? fg.sendingLink : fg.sendInstructionsBtn}</span>
                </button>
              </form>
            )}

            <div className="text-center pt-3 border-t border-slate-200/80 dark:border-slate-800">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{fg.backToLogin}</span>
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Supabase Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Info className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {a.oauthModalTitle}
                  </h3>
                  <p className="text-[11px] text-slate-500">{a.oauthModalSubtitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-600 dark:text-slate-300">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 space-y-1.5">
                <div className="font-semibold text-amber-900 dark:text-amber-300">
                  {a.missingEnvVars}
                </div>
                <ul className="list-disc pl-5 text-[11px] text-amber-800 dark:text-amber-400 space-y-0.5">
                  {configStatus.missingVariables.map((v) => (
                    <li key={v} className="font-mono">
                      {v}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-slate-900 dark:text-white">
                  {a.setupInstructions}
                </div>
                <ol className="list-decimal pl-5 space-y-1.5 text-[11px] leading-relaxed">
                  <li>
                    In Supabase Dashboard, obtain your <strong>Project URL</strong> and{' '}
                    <strong>anon key</strong>.
                  </li>
                  <li>
                    Configure them in your environment variables:
                    <pre className="mt-1 p-2 bg-slate-100 dark:bg-slate-800 rounded font-mono text-[10px] text-slate-800 dark:text-slate-200">
                      VITE_SUPABASE_URL=&quot;https://your-project.supabase.co&quot;&#10;VITE_SUPABASE_ANON_KEY=&quot;your-anon-key&quot;
                    </pre>
                  </li>
                  <li>
                    Under <strong>Authentication -&gt; URL Configuration</strong>, ensure{' '}
                    <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-blue-600 dark:text-blue-400 font-mono">
                      {window.location.origin}/reset-password
                    </code>{' '}
                    is listed in Redirect URLs.
                  </li>
                </ol>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                {a.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

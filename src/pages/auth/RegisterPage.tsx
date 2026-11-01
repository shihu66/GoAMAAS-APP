import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useLanguage, usePageSeo } from '../../context/LanguageContext';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { isSupabaseConfigured, getSupabaseConfigStatus } from '../../lib/supabase';
import {
  Lock,
  Mail,
  User,
  Store,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Loader2,
  Info,
  X,
  Sun,
  Moon,
} from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const { registerWithEmail, loginWithGoogle, resendVerification, theme, toggleTheme } = useApp();
  const { t } = useLanguage();
  const a = t.auth;
  const rg = t.auth.register;

  usePageSeo({ title: rg.seoTitle });

  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [storeName, setStoreName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const configStatus = getSupabaseConfigStatus();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name || !email || !storeName || !password) {
      setErrorMessage(rg.errRequired);
      return;
    }

    if (password.length < 6) {
      setErrorMessage(rg.errPasswordLength);
      return;
    }

    setLoading(true);
    const { needsEmailConfirmation, error } = await registerWithEmail(name, email, password, storeName);
    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
    } else if (needsEmailConfirmation) {
      setEmailSent(true);
    } else {
      navigate('/onboarding');
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    await resendVerification(email);
    setResendLoading(false);
  };

  const handleGoogleSignUp = async () => {
    setErrorMessage(null);

    if (!isSupabaseConfigured) {
      setShowConfigModal(true);
      return;
    }

    setGoogleLoading(true);
    const { error } = await loginWithGoogle();
    if (error) {
      setGoogleLoading(false);
      setErrorMessage(error.message);
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

      {/* Main Centered Auth Card */}
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
            {rg.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            {rg.subtitle}
          </p>
        </div>

        <div className="mt-7 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-slate-50/70 dark:bg-slate-900/80 py-8 px-6 sm:px-9 border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-6">
            {emailSent ? (
              <div className="text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                  <Mail className="w-6 h-6" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-950 dark:text-white">
                  {rg.verifyTitle}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {rg.verifyBody(email)}
                </p>
                <div className="pt-3 space-y-2.5">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendLoading}
                    className="w-full min-h-[44px] py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {resendLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{resendLoading ? rg.sending : rg.resendEmail}</span>
                  </button>
                  <Link
                    to="/login"
                    className="w-full min-h-[44px] inline-flex items-center justify-center py-2 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors"
                  >
                    {rg.returnSignIn}
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {errorMessage && (
                  <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <div className="flex-1 leading-relaxed">{errorMessage}</div>
                  </div>
                )}

                {/* Google Sign Up Button */}
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleGoogleSignUp}
                    disabled={googleLoading}
                    className="w-full min-h-[46px] flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    {googleLoading ? (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    ) : (
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    )}
                    <span>{googleLoading ? a.connectingGoogle : a.continueWithGoogle}</span>
                  </button>

                  {!isSupabaseConfigured && (
                    <button
                      type="button"
                      onClick={() => setShowConfigModal(true)}
                      className="w-full text-center text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Info className="w-3 h-3" />
                      <span>{a.supabaseNeededOAuth}</span>
                    </button>
                  )}
                </div>

                <div className="relative flex items-center justify-center">
                  <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
                  <span className="bg-slate-50 dark:bg-slate-900 px-3 text-[11px] text-slate-500 dark:text-slate-400 absolute">
                    {rg.orEmail}
                  </span>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {rg.fullNameLabel}
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={rg.fullNamePlaceholder}
                        className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {rg.storeNameLabel}
                    </label>
                    <div className="relative">
                      <Store className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        placeholder={rg.storeNamePlaceholder}
                        className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {rg.emailLabel}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="arif@rahmantraders.com"
                        className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {rg.passwordLabel}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={rg.passwordPlaceholder}
                        className="w-full min-h-[44px] pl-10 pr-10 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full min-h-[46px] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>{loading ? rg.creatingWorkspace : rg.launchTrialBtn}</span>
                      {!loading && <ArrowRight className="w-4 h-4" />}
                    </button>
                  </div>
                </form>

                <div className="space-y-2 pt-3 border-t border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>{rg.perk1}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>{rg.perk2}</span>
                  </div>
                </div>

                <div className="text-center text-xs text-slate-600 dark:text-slate-400">
                  {rg.haveAccount}{' '}
                  <Link to="/login" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                    {rg.loginLink}
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Supabase OAuth Configuration Instructions Modal */}
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
              <p>{a.oauthModalIntro}</p>

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
                    In Supabase Dashboard, create a project and go to{' '}
                    <strong>Project Settings -&gt; API</strong>.
                  </li>
                  <li>
                    Configure <strong>Project URL</strong> and <strong>anon key</strong>:
                    <pre className="mt-1 p-2 bg-slate-100 dark:bg-slate-800 rounded font-mono text-[10px] text-slate-800 dark:text-slate-200">
                      VITE_SUPABASE_URL=&quot;https://your-project.supabase.co&quot;&#10;VITE_SUPABASE_ANON_KEY=&quot;your-anon-key&quot;
                    </pre>
                  </li>
                  <li>
                    Enable Google Provider under{' '}
                    <strong>Authentication -&gt; Providers -&gt; Google</strong>.
                  </li>
                  <li>
                    Add{' '}
                    <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-blue-600 dark:text-blue-400 font-mono">
                      {configStatus.redirectUrl}
                    </code>{' '}
                    to Authorized Redirect URLs in Supabase.
                  </li>
                </ol>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                {a.understood}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

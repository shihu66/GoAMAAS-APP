import React, { useState } from 'react';
import { Download, Smartphone, CheckCircle2, X, Share, Info } from 'lucide-react';
import { useAdminPWA } from '../../hooks/useAdminPWA';

export const ADMIN_INSTALL_PROMPT_COPY = {
  title: 'Install GoAMAAS Admin',
  description: 'Install the Admin App for quick and convenient access.',
  primaryButton: 'Install App',
  secondaryButton: 'Not Now',
} as const;

interface AdminPWAInstallPromptProps {
  theme?: 'light' | 'dark';
}

/**
 * Automatic PWA Installation Prompt for https://app.amaas.xyz/admin.
 * Automatically appears as soon as `beforeinstallprompt` fires on Android Chrome / Desktop
 * Chromium, or on iOS Safari with concise Share -> Add to Home Screen guidance.
 * Never re-interrupts users after dismissal and hides automatically when already installed.
 */
export const AdminPWAInstallPrompt: React.FC<AdminPWAInstallPromptProps> = ({
  theme = 'dark',
}) => {
  const {
    canPromptInstall,
    shouldAutoPrompt,
    isInstalled,
    isIOS,
    installApp,
    dismissPrompt,
  } = useAdminPWA(theme);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  if (isInstalled || !shouldAutoPrompt) {
    return null;
  }

  const handlePrimaryInstall = async () => {
    if (canPromptInstall) {
      setIsInstalling(true);
      try {
        await installApp();
      } finally {
        setIsInstalling(false);
      }
      return;
    }
    if (isIOS) {
      setShowIosSteps(true);
    }
  };

  return (
    <div
      role="region"
      aria-label={ADMIN_INSTALL_PROMPT_COPY.title}
      className="fixed bottom-16 lg:bottom-5 inset-x-3 sm:inset-x-auto sm:right-5 sm:w-full sm:max-w-sm z-40 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-5 space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <img
            src="/admin-pwa-192x192.png"
            alt="GoAMAAS Admin app icon"
            referrerPolicy="no-referrer"
            className="w-11 h-11 rounded-xl shrink-0 border border-slate-200/60 dark:border-slate-800"
          />
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              {ADMIN_INSTALL_PROMPT_COPY.title}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {ADMIN_INSTALL_PROMPT_COPY.description}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={dismissPrompt}
          className="min-h-[36px] min-w-[36px] -mt-1 -mr-1 inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Dismiss installation prompt"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {isIOS && (showIosSteps || !canPromptInstall) && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-1.5 leading-relaxed">
          <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Share className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>iOS Safari installation:</span>
          </p>
          <p>
            Tap <strong>Share</strong> in Safari, then choose <strong>Add to Home Screen</strong>.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2.5">
        {canPromptInstall ? (
          <button
            type="button"
            disabled={isInstalling}
            onClick={() => void handlePrimaryInstall()}
            className="flex-1 min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>{ADMIN_INSTALL_PROMPT_COPY.primaryButton}</span>
          </button>
        ) : (
          !showIosSteps && (
            <button
              type="button"
              onClick={() => void handlePrimaryInstall()}
              className="flex-1 min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Share className="w-3.5 h-3.5 shrink-0" />
              <span>{ADMIN_INSTALL_PROMPT_COPY.primaryButton}</span>
            </button>
          )
        )}

        <button
          type="button"
          onClick={dismissPrompt}
          className={`${
            !canPromptInstall && showIosSteps ? 'w-full' : 'px-4'
          } min-h-[42px] py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs inline-flex items-center justify-center transition-colors cursor-pointer whitespace-nowrap`}
        >
          {ADMIN_INSTALL_PROMPT_COPY.secondaryButton}
        </button>
      </div>
    </div>
  );
};

interface AdminPWAInstallButtonProps {
  theme?: 'light' | 'dark';
  variant?: 'compact' | 'card';
}

export const AdminPWAInstallButton: React.FC<AdminPWAInstallButtonProps> = ({
  theme = 'dark',
  variant = 'compact',
}) => {
  const {
    canPromptInstall,
    isInstalled,
    isAndroid,
    isIOS,
    isEmbeddedIframe,
    installApp,
  } = useAdminPWA(theme);
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Automatically hide install controls when already running as an installed standalone PWA
  if (isInstalled) {
    if (variant === 'card') {
      return (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 flex items-center gap-3 text-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-900 dark:text-emerald-200">
              GoAMAAS Admin App Installed
            </p>
            <p className="text-emerald-700 dark:text-emerald-400/90 mt-0.5">
              Running in standalone app mode with direct /admin access.
            </p>
          </div>
        </div>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    if (canPromptInstall) {
      const outcome = await installApp();
      if (outcome === 'unavailable') {
        setShowGuideModal(true);
      }
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      {variant === 'compact' ? (
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          className="min-h-[40px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          title={
            canPromptInstall
              ? ADMIN_INSTALL_PROMPT_COPY.title
              : 'View GoAMAAS Admin installation instructions'
          }
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">
            {canPromptInstall ? ADMIN_INSTALL_PROMPT_COPY.primaryButton : 'Install Guide'}
          </span>
          <span className="sm:hidden">Install</span>
        </button>
      ) : (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                {ADMIN_INSTALL_PROMPT_COPY.title}
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                {canPromptInstall
                  ? ADMIN_INSTALL_PROMPT_COPY.description
                  : isIOS
                  ? 'Install on iPhone or iPad via Safari Share → Add to Home Screen.'
                  : 'Open in Chrome, Edge, or Safari to add GoAMAAS Admin to your Home Screen or desktop.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleInstallClick()}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>
              {canPromptInstall ? ADMIN_INSTALL_PROMPT_COPY.primaryButton : 'Installation Steps'}
            </span>
          </button>
        </div>
      )}

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-pwa-install-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <img
                  src="/admin-pwa-192x192.png"
                  alt="GoAMAAS Admin app icon"
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-xl shrink-0"
                />
                <div>
                  <h3
                    id="admin-pwa-install-title"
                    className="text-sm font-bold text-slate-900 dark:text-white"
                  >
                    {ADMIN_INSTALL_PROMPT_COPY.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {ADMIN_INSTALL_PROMPT_COPY.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close installation guide"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isEmbeddedIframe && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/70 text-amber-800 dark:text-amber-200 flex items-start gap-2.5 leading-relaxed">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>
                  Direct one-click installation is disabled inside embedded preview frames. Open{' '}
                  <strong>https://app.amaas.xyz/admin</strong> directly in a full browser tab to
                  install the app.
                </span>
              </div>
            )}

            {isIOS ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-slate-700 dark:text-slate-300 leading-relaxed">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Share className="w-3.5 h-3.5 text-blue-500" />
                  <span>Install on iPhone or iPad (Safari):</span>
                </p>
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>
                    Open <strong>https://app.amaas.xyz/admin</strong> in Safari.
                  </li>
                  <li>
                    Tap the <strong>Share</strong> button in the Safari toolbar.
                  </li>
                  <li>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </li>
                  <li>
                    Tap <strong>Add</strong> to place <strong>AMAAS Admin</strong> on your Home
                    Screen.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-slate-700 dark:text-slate-300 leading-relaxed">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {isAndroid
                    ? 'Install on Android Phone (Google Chrome):'
                    : 'Automatic prompt unavailable in this browser view:'}
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  {isAndroid
                    ? 'If the native prompt has not appeared yet, install manually from Chrome:'
                    : 'Your current browser does not expose a native one-click install prompt (or the app is already installed in another profile). You can install manually:'}
                </p>
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>
                    Open <strong>https://app.amaas.xyz/admin</strong> in Google Chrome or Microsoft
                    Edge.
                  </li>
                  <li>
                    Select the browser menu <strong>(⋮)</strong> or address-bar install icon.
                  </li>
                  <li>
                    Choose <strong>Install GoAMAAS Admin</strong> or{' '}
                    <strong>Add to Home screen</strong>.
                  </li>
                </ol>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              {ADMIN_INSTALL_PROMPT_COPY.secondaryButton}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

import React, { useState } from 'react';
import { Download, Smartphone, CheckCircle2, X, Share } from 'lucide-react';
import { useAdminPWA } from '../../hooks/useAdminPWA';

interface AdminPWAInstallButtonProps {
  theme?: 'light' | 'dark';
  variant?: 'compact' | 'card';
}

export const AdminPWAInstallButton: React.FC<AdminPWAInstallButtonProps> = ({
  theme = 'dark',
  variant = 'compact',
}) => {
  const { canPromptInstall, isInstalled, isAndroid, isIOS, installApp } = useAdminPWA(theme);
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Automatically hide install controls when already running as an installed standalone PWA
  if (isInstalled) {
    if (variant === 'card') {
      return (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 flex items-center gap-3 text-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-900 dark:text-emerald-200">
              Installed as GoAMAAS Admin App
            </p>
            <p className="text-emerald-700 dark:text-emerald-400/90 mt-0.5">
              Running in standalone mobile app mode with direct /admin launch.
            </p>
          </div>
        </div>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    if (canPromptInstall) {
      await installApp();
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
          title="Install GoAMAAS Admin on your phone"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Install App</span>
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
                Install GoAMAAS Admin on Your Phone
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                Add a dedicated AMAAS Admin icon to your Android or iOS Home Screen. Opens directly into /admin in standalone full-screen mode.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleInstallClick()}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{canPromptInstall ? 'Install GoAMAAS Admin' : 'How to Install App'}</span>
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
                    Install GoAMAAS Admin
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    AMAAS Technologies · Standalone Mobile App
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

            {isIOS ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-slate-700 dark:text-slate-300 leading-relaxed">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Share className="w-3.5 h-3.5 text-blue-500" />
                  <span>Install on iPhone or iPad (Safari):</span>
                </p>
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>Open <strong>https://app.amaas.xyz/admin</strong> in Safari.</li>
                  <li>Tap the <strong>Share</strong> icon in the bottom browser toolbar.</li>
                  <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                  <li>Tap <strong>Add</strong> to place <strong>AMAAS Admin</strong> on your Home Screen.</li>
                </ol>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-slate-700 dark:text-slate-300 leading-relaxed">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {isAndroid
                    ? 'Install on Android Phone (Google Chrome):'
                    : 'Install on Android Chrome or Desktop Browser:'}
                </p>
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>Open <strong>https://app.amaas.xyz/admin</strong> in Google Chrome.</li>
                  <li>Tap the <strong>three-dot menu (⋮)</strong> in the top-right corner of Chrome.</li>
                  <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                  <li>Confirm <strong>Install</strong> — launch <strong>GoAMAAS Admin</strong> anytime from your Home Screen.</li>
                </ol>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};

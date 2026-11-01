import { useCallback, useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const ADMIN_PWA_DISMISS_STORAGE_KEY = 'goamaas_admin_pwa_prompt_dismissed_v1';
export const ADMIN_PWA_INSTALLED_SESSION_KEY = 'goamaas_admin_pwa_installed_session_v1';
export const ADMIN_PWA_DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// Module-level singleton capture so if beforeinstallprompt fires before a component mounts, it is never missed
let capturedInstallPrompt: BeforeInstallPromptEvent | null = null;
let memoryDismissedAt: number | null = null;
let memoryInstalledFlag = false;
const promptSubscribers = new Set<() => void>();

function notifySubscribers(): void {
  promptSubscribers.forEach((cb) => cb());
}

export function isAdminInstallPromptDismissed(nowMs = Date.now()): boolean {
  if (memoryDismissedAt !== null && nowMs - memoryDismissedAt < ADMIN_PWA_DISMISS_COOLDOWN_MS) {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const raw =
      window.sessionStorage.getItem(ADMIN_PWA_DISMISS_STORAGE_KEY) ||
      window.localStorage.getItem(ADMIN_PWA_DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { dismissedAt?: number };
    if (
      typeof parsed.dismissedAt === 'number' &&
      nowMs - parsed.dismissedAt < ADMIN_PWA_DISMISS_COOLDOWN_MS
    ) {
      memoryDismissedAt = parsed.dismissedAt;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function dismissAdminInstallPrompt(nowMs = Date.now()): void {
  memoryDismissedAt = nowMs;
  if (typeof window !== 'undefined') {
    try {
      const payload = JSON.stringify({ dismissedAt: nowMs });
      window.sessionStorage.setItem(ADMIN_PWA_DISMISS_STORAGE_KEY, payload);
      window.localStorage.setItem(ADMIN_PWA_DISMISS_STORAGE_KEY, payload);
    } catch {
      // Ignore storage quota exceptions; memoryDismissedAt stays active
    }
  }
  notifySubscribers();
}

export function resetAdminInstallPromptDismissal(): void {
  memoryDismissedAt = null;
  memoryInstalledFlag = false;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(ADMIN_PWA_DISMISS_STORAGE_KEY);
      window.localStorage.removeItem(ADMIN_PWA_DISMISS_STORAGE_KEY);
      window.sessionStorage.removeItem(ADMIN_PWA_INSTALLED_SESSION_KEY);
    } catch {
      // Ignore
    }
  }
  notifySubscribers();
}

export function detectStandaloneInstalled(): boolean {
  if (memoryInstalledFlag) return true;
  if (typeof window === 'undefined') return false;
  try {
    if (window.sessionStorage.getItem(ADMIN_PWA_INSTALLED_SESSION_KEY) === '1') {
      return true;
    }
  } catch {
    // Ignore
  }
  const mediaStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(mediaStandalone || iosStandalone);
}

export function detectAdminPlatform(userAgentRaw?: string): {
  isIOS: boolean;
  isSafari: boolean;
  isAndroid: boolean;
} {
  const ua = (
    userAgentRaw ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  ).toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isSafari =
    /safari/.test(ua) && !/crios|fxios|edgios|opios|chrome|chromium|android/.test(ua);
  return { isIOS, isSafari, isAndroid };
}

export function shouldShowAutoAdminInstallPrompt(params: {
  canPromptInstall: boolean;
  isIOS: boolean;
  isInstalled: boolean;
  isDismissed: boolean;
  isEmbeddedIframe?: boolean;
}): boolean {
  if (params.isInstalled || params.isDismissed) {
    return false;
  }
  if (params.canPromptInstall) {
    return true;
  }
  if (params.isIOS && !params.isEmbeddedIframe) {
    return true;
  }
  return false;
}

/**
 * Allows automated tests to inject/clear a simulated beforeinstallprompt event safely.
 */
export function setCapturedAdminInstallPromptForTesting(
  promptEvent: BeforeInstallPromptEvent | null
): void {
  capturedInstallPrompt = promptEvent;
  notifySubscribers();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    if (
      window.location.pathname === '/admin' ||
      window.location.pathname.startsWith('/admin/')
    ) {
      event.preventDefault();
      capturedInstallPrompt = event as BeforeInstallPromptEvent;
      notifySubscribers();
    }
  });

  window.addEventListener('appinstalled', () => {
    capturedInstallPrompt = null;
    memoryInstalledFlag = true;
    try {
      window.sessionStorage.setItem(ADMIN_PWA_INSTALLED_SESSION_KEY, '1');
    } catch {
      // Ignore
    }
    notifySubscribers();
  });
}

function upsertHeadMeta(name: string, content: string): HTMLMetaElement {
  let el = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    el.setAttribute('data-admin-managed', 'true');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return el;
}

function upsertHeadLink(rel: string, href: string, type?: string): HTMLLinkElement {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.setAttribute('data-admin-managed', 'true');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
  if (type) {
    el.setAttribute('type', type);
  }
  return el;
}

export function applyAdminDocumentHead(theme: 'light' | 'dark' = 'dark'): void {
  if (typeof document === 'undefined') return;
  document.title = 'GoAMAAS Admin — AMAAS Technologies';
  upsertHeadMeta('robots', 'noindex, nofollow, noarchive');
  upsertHeadMeta('googlebot', 'noindex, nofollow, noarchive');
  upsertHeadMeta('theme-color', theme === 'dark' ? '#090D16' : '#F8FAFC');
  upsertHeadMeta('mobile-web-app-capable', 'yes');
  upsertHeadMeta('apple-mobile-web-app-capable', 'yes');
  upsertHeadMeta(
    'apple-mobile-web-app-status-bar-style',
    theme === 'dark' ? 'black-translucent' : 'default'
  );
  upsertHeadMeta('apple-mobile-web-app-title', 'AMAAS Admin');
  upsertHeadLink('manifest', '/admin-manifest.webmanifest');
  upsertHeadLink('apple-touch-icon', '/admin-apple-touch-icon.png');
  upsertHeadLink('icon', '/admin-icon.svg', 'image/svg+xml');
}

export function restorePublicDocumentHead(): void {
  if (typeof document === 'undefined') return;
  if (
    window.location.pathname === '/admin' ||
    window.location.pathname.startsWith('/admin/')
  ) {
    return;
  }
  document.title = 'GoAMAAS — All-in-One Business Growth Platform';
  document.head
    .querySelectorAll('[data-admin-managed="true"]')
    .forEach((node) => node.parentNode?.removeChild(node));
}

export async function registerAdminServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  if (
    window.location.pathname !== '/admin' &&
    !window.location.pathname.startsWith('/admin/')
  ) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register('/admin-sw.js', {
      scope: '/admin',
      updateViaCache: 'none',
    });
    return registration;
  } catch {
    return null;
  }
}

export function notifyAdminServiceWorkerSignOut(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    navigator.serviceWorker.controller?.postMessage({ type: 'ADMIN_SIGN_OUT' });
  } catch {
    // Ignore
  }
}

export function useAdminPWA(theme: 'light' | 'dark' = 'dark') {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => capturedInstallPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => detectStandaloneInstalled());
  const [isDismissed, setIsDismissed] = useState<boolean>(() => isAdminInstallPromptDismissed());
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [swReady, setSwReady] = useState<boolean>(false);

  const { isIOS, isSafari, isAndroid } = detectAdminPlatform();
  const isEmbeddedIframe = (() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  useEffect(() => {
    applyAdminDocumentHead(theme);
    void registerAdminServiceWorker().then((reg) => {
      if (reg) setSwReady(true);
    });
    return () => {
      restorePublicDocumentHead();
    };
  }, [theme]);

  useEffect(() => {
    const syncState = () => {
      setDeferredPrompt(capturedInstallPrompt);
      setIsInstalled(detectStandaloneInstalled());
      setIsDismissed(isAdminInstallPromptDismissed());
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        memoryInstalledFlag = true;
      }
      setIsInstalled(e.matches || detectStandaloneInstalled());
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    promptSubscribers.add(syncState);
    syncState();

    mediaQuery.addEventListener('change', handleDisplayModeChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      promptSubscribers.delete(syncState);
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const installApp = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!capturedInstallPrompt) {
      return 'unavailable';
    }
    const promptRef = capturedInstallPrompt;
    await promptRef.prompt();
    const { outcome } = await promptRef.userChoice;
    capturedInstallPrompt = null;
    setDeferredPrompt(null);

    if (outcome === 'accepted') {
      memoryInstalledFlag = true;
      setIsInstalled(true);
      notifySubscribers();
      return 'accepted';
    }

    dismissAdminInstallPrompt();
    setIsDismissed(true);
    return 'dismissed';
  }, []);

  const dismissPrompt = useCallback(() => {
    dismissAdminInstallPrompt();
    setIsDismissed(true);
  }, []);

  const canPromptInstall = Boolean(deferredPrompt) && !isInstalled;
  const shouldAutoPrompt = shouldShowAutoAdminInstallPrompt({
    canPromptInstall,
    isIOS,
    isInstalled,
    isDismissed,
    isEmbeddedIframe,
  });

  return {
    canPromptInstall,
    shouldAutoPrompt,
    isInstalled,
    isDismissed,
    isOnline,
    isAndroid,
    isIOS,
    isSafari,
    isEmbeddedIframe,
    swReady,
    installApp,
    dismissPrompt,
  };
}

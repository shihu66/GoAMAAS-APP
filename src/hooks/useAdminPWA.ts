import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Module-level singleton capture so if beforeinstallprompt fires before a component mounts, it is never missed
let capturedInstallPrompt: BeforeInstallPromptEvent | null = null;
const promptSubscribers = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    if (
      window.location.pathname === '/admin' ||
      window.location.pathname.startsWith('/admin/')
    ) {
      event.preventDefault();
      capturedInstallPrompt = event as BeforeInstallPromptEvent;
      promptSubscribers.forEach((cb) => cb());
    }
  });

  window.addEventListener('appinstalled', () => {
    capturedInstallPrompt = null;
    promptSubscribers.forEach((cb) => cb());
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
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [swReady, setSwReady] = useState<boolean>(false);

  const userAgent =
    typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isAndroid = /android/.test(userAgent);

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
    const syncPrompt = () => {
      setDeferredPrompt(capturedInstallPrompt);
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(standalone);
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    promptSubscribers.add(syncPrompt);
    syncPrompt();

    mediaQuery.addEventListener('change', handleDisplayModeChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      promptSubscribers.delete(syncPrompt);
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const installApp = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!capturedInstallPrompt) {
      return 'unavailable';
    }
    await capturedInstallPrompt.prompt();
    const { outcome } = await capturedInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      capturedInstallPrompt = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
      return 'accepted';
    }
    return 'dismissed';
  }, []);

  return {
    canPromptInstall: Boolean(deferredPrompt) && !isInstalled,
    isInstalled,
    isOnline,
    isAndroid,
    isIOS,
    swReady,
    installApp,
  };
}

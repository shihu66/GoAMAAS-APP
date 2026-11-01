/* GoAMAAS Admin — Strictly Scoped Service Worker (/admin)
 * Security Invariants:
 * 1. NEVER intercepts or caches Supabase REST, Auth, Storage, Realtime, Functions, or /api/* requests.
 * 2. NEVER caches authenticated responses, admin HTML documents, auth tokens, customer data, or payment records.
 * 3. Precaches ONLY the static offline shell (/admin-offline.html) and static brand icons.
 * 4. Purges all dynamic admin caches immediately on ADMIN_SIGN_OUT.
 */

const SHELL_CACHE = 'goamaas-admin-shell-v2';
const SAFE_STATIC_ASSETS = [
  '/admin-offline.html',
  '/admin-manifest.webmanifest',
  '/admin-icon.svg',
  '/admin-pwa-192x192.png',
  '/admin-pwa-512x512.png',
  '/admin-pwa-maskable-512x512.png',
  '/admin-apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SAFE_STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('goamaas-admin-') && key !== SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const payload = event && event.data ? event.data : {};
  if (payload.type === 'ADMIN_SIGN_OUT') {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('goamaas-admin-') && key !== SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
    );
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') {
    return;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Strictly ignore cross-origin traffic (Supabase Auth/REST/Storage/Realtime, Google OAuth, CDNs)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never intercept API routes, OAuth callbacks, Supabase proxy paths, or any request carrying credentials/API headers
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/storage/v1/') ||
    url.pathname.includes('/realtime/v1/') ||
    url.pathname.includes('/functions/v1/') ||
    request.headers.has('authorization') ||
    request.headers.has('apikey')
  ) {
    return;
  }

  // Navigation requests inside /admin: always fetch live from network with no-store; fall back to static offline notice on network failure
  if (
    request.mode === 'navigate' &&
    (url.pathname === '/admin' || url.pathname.startsWith('/admin/'))
  ) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(async () => {
        const cachedOffline = await caches.match('/admin-offline.html');
        if (cachedOffline) {
          return cachedOffline;
        }
        return new Response('Offline — Please reconnect to access GoAMAAS Admin.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
    );
    return;
  }

  // Serve only allowlisted static PWA icon/manifest assets from shell cache
  if (SAFE_STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});

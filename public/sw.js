// Natai's service worker (DESIGN.md 8.1): on install it caches every file of the build, listed in
// precache-manifest.json by the Vite build, so the game plays offline after one visit. Requests are
// served cache-first; a new deployment brings a new manifest version and a fresh cache.
const MANIFEST = './precache-manifest.json';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(MANIFEST, { cache: 'no-store' });
      const { version, files } = await response.json();
      const cache = await caches.open(`natai-${version}`);
      await cache.addAll(files.map((f) => new URL(f, self.registration.scope).toString()));
      await cache.put('version', new Response(version));
      self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Keep only the newest cache: the one holding the version this worker installed.
      const current = await Promise.all(
        keys.map(async (k) => {
          const c = await caches.open(k);
          const v = await c.match('version');
          return { k, v: v ? await v.text() : '' };
        }),
      );
      const newest = current.sort((a, b) => (a.v < b.v ? 1 : -1))[0];
      await Promise.all(current.filter((c) => c !== newest).map((c) => caches.delete(c.k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      // ignoreVary: the bundle is requested with crossorigin, so it carries an Origin header the
      // precache request did not, and a server answering `Vary: Origin` would otherwise never match.
      const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate', ignoreVary: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const keys = await caches.keys();
          if (keys[0]) (await caches.open(keys[0])).put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (request.mode === 'navigate') {
          const index = await caches.match(new URL('./index.html', self.registration.scope).toString());
          if (index) return index;
        }
        throw error;
      }
    })(),
  );
});

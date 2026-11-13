// Service Worker helper to guarantee JavaScript MIME type for extensionless ESM modules (+esm)
// regardless of origin server MIME configuration or static host limitations.
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('+esm')) {
    event.respondWith(
      (async () => {
        try {
          const cached = await caches.match(event.request, { ignoreSearch: true });
          if (cached) {
            const headers = new Headers(cached.headers);
            headers.set('Content-Type', 'text/javascript; charset=utf-8');
            return new Response(cached.body, {
              status: cached.status,
              statusText: cached.statusText,
              headers,
            });
          }
          const response = await fetch(event.request);
          if (!response) return response;
          const headers = new Headers(response.headers);
          headers.set('Content-Type', 'text/javascript; charset=utf-8');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        } catch {
          const fallback = await caches.match(event.request, { ignoreSearch: true });
          if (fallback) {
            const headers = new Headers(fallback.headers);
            headers.set('Content-Type', 'text/javascript; charset=utf-8');
            return new Response(fallback.body, {
              status: fallback.status,
              statusText: fallback.statusText,
              headers,
            });
          }
          return new Response('/* offline esm unavailable */', {
            status: 503,
            headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
          });
        }
      })()
    );
  }
});

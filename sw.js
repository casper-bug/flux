const CACHE_NAME = 'flux-cache-v27';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon.svg',
  './logo.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  const cacheAllowlist = [CACHE_NAME, 'flux-share-target'];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheAllowlist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Handle Web Share Target POST requests
  if (event.request.method === 'POST' && event.request.url.includes('share_target=1')) {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData();
        const sharedData = {
          title: formData.get('title') || '',
          text: formData.get('text') || '',
          url: formData.get('url') || '',
          files: formData.getAll('files')
        };
        
        // Store in a temporary cache that the main page can read
        const cache = await caches.open('flux-share-target');
        
        // Map files to an index-based storage to avoid collisions
        const fileManifest = sharedData.files.map((file, index) => ({
          name: file.name,
          type: file.type,
          index: index
        }));

        await cache.put('/shared-data', new Response(JSON.stringify({
          ...sharedData,
          files: fileManifest
        })));
        
        // Store the actual file blobs using the index
        for (let i = 0; i < sharedData.files.length; i++) {
          await cache.put(`/shared-files/${i}`, new Response(sharedData.files[i]));
        }

        return Response.redirect('./index.html?share=1', 303);
      })()
    );
    return;
  }

  // Only intercept same-origin requests to avoid breaking API calls
  if (!event.request.url.startsWith(self.location.origin)) return;
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request).then(fetchRes => {
          if (event.request.method === 'GET' && fetchRes && fetchRes.status === 200) {
            const resClone = fetchRes.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
          }
          return fetchRes;
        });
      })
  );
});

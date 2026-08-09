const CACHE_NAME = 'unoworship-pro-shell-v4';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/ulju-icon-192.png',
  '/icons/ulju-icon-512.png',
  '/icons/ulju-icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('/')) ?? Response.error()),
    );
    return;
  }

  /* 파일명에 빌드 해시가 붙는 것들 — 내용이 바뀌면 이름도 바뀌므로 캐시에서 꺼내 써도 안전하다 */
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (!response.ok) return response;
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })),
    );
    return;
  }

  /* 아이콘·매니페스트는 이름이 고정이다. 캐시 우선으로 두면 내용을 바꿔도 영영 안 바뀌어,
     배포할 때마다 CACHE_NAME 을 올려야 한다 — 언젠가 빠뜨린다.
     네트워크를 먼저 보고 실패할 때만 캐시로 떨어뜨린다. 오프라인 대비는 그대로다. */
  const isNamedAsset = url.pathname.startsWith('/icons/')
    || url.pathname === '/manifest.webmanifest';
  if (!isNamedAsset) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response.ok) return response;
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(async () => (await caches.match(request)) ?? Response.error()),
  );
});

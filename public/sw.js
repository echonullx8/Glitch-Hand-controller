const CACHE_NAME = 'mediapipe-v1';
const MODEL_URLS = [
  '/models/hands_solution_simd_wasm.bin',
  '/models/hands_solution_simd.wasm'
  // 加你的所有 .wasm/.bin 路径
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(MODEL_URLS);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

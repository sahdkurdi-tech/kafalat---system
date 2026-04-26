/* sw.js */
const CACHE_NAME = 'aid-system-v4'; // ڤێرژنەکە گۆڕدرا بۆ ئەوەی خێرا ئەپدەیت بێت
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './print.html',
  './archive.html',
  './css/style.css',
  './css/print.css',
  './css/archive.css',
  './js/firebase-config.js',
  './js/main-logic.js',
  './js/settings.js',
  './js/beneficiary-service.js',
  './js/excel-service.js',
  './js/print-service.js',
  './js/print-logic.js',
  './js/archive.js',
  './js/backup.js',
  './js/voice-service.js',
  './js/auth-nav.js',
  './logo.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // بۆ ئەوەی ڕاستەوخۆ کار بکات بێ چاوەڕوانی
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ڕێگریکردنی تەواوەتی لە دەستکاریکردنی پەیوەندییەکانی فایەربەیس بۆ ڕێگریکردن لە ئیرۆری کۆنسۆل
  if (url.origin.includes('firestore.googleapis.com') ||
      url.origin.includes('securetoken.googleapis.com') ||
      url.origin.includes('identitytoolkit.googleapis.com') ||
      url.protocol === 'chrome-extension:') {
      return; 
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => {
          console.log('Network error caught by SW (Offline Mode)');
      });
    })
  );
});
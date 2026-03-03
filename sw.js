/* sw.js */

const CACHE_NAME = 'aid-system-v3';
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
  './js/voice-service.js', // <--- ئەمە زیادکراوە
  './js/auth-nav.js',
  './logo.png',
  './icon-192.png',
  './icon-512.png'
];

// 1. Install Service Worker & Cache Files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Cashing app shell...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Activate & Clean Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Removing old cache...', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// 3. Fetch (Network First, then Cache)
// ئێمە Network First بەکاردێنین چونکە داتابەیسەکەمان ئۆنلاینە
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

/* sw.js - ئەم بەشە زیاد بکە بۆ کۆتایی فایلەکە */

// ئەمە گوێ دەگرێت بۆ نامەی "SKIP_WAITING"
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
const CACHE_NAME = "radio-monde-as-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// INSTALLATION

self.addEventListener("install", event => {

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );

});

// ACTIVATION

self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys().then(keys =>

      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )

    ).then(() => self.clients.claim())

  );

});

// GESTION DES REQUÊTES

self.addEventListener("fetch", event => {

  const url = new URL(event.request.url);

  if (event.request.method !== "GET") {
    return;
  }

  // Ne pas mettre les flux radio en cache.
  if (url.hostname.includes("radio-browser.info")) {
    return;
  }

  if (url.origin === self.location.origin) {

    event.respondWith(

      caches.match(event.request).then(cached => {

        if (cached) {
          return cached;
        }

        return fetch(event.request).then(response => {

          if (response.ok) {

            const copy = response.clone();

            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, copy);
            });

          }

          return response;

        }).catch(() => {

          return caches.match("./index.html");

        });

      })

    );

  }

});

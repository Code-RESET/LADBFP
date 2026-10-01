# Code-Reset Boilerplate

Esqueleto base para arrancar cualquier proyecto nuevo de Code-Reset: PWA en HTML/JS puro (ES6 modules), sin build, con Firebase Auth + Firestore, login con firma de desarrollador, router por hash y estructura modular.

## Cómo usar este repo

1. Sube esta carpeta a GitHub como repo nuevo (ej. `code-reset-boilerplate`).
2. En **Settings → Template repository**, activa la casilla. Esto habilita el botón "Use this template".
3. Para cada proyecto nuevo: "Use this template" → nombra el repo del cliente → clona.
4. Edita `js/firebase-config.js` con el `firebaseConfig` real del proyecto (Firebase Console → Configuración del proyecto → Tus apps → SDK config).
5. Cambia `<p id="app-name-slot">` en `index.html` por el nombre real de la app.
6. Reemplaza `assets/logo.svg`, `icon-192.png` e `icon-512.png` si el cliente pide su propia marca (por default se usa la identidad Code-Reset).
7. Activa GitHub Pages (Settings → Pages → rama `main`, carpeta `/root`).
8. Sube el cambio de `CACHE_VERSION` en `service-worker.js` cada vez que actualices archivos base, para que los teléfonos ya instalados jalen la versión nueva.

## Cómo agregar un módulo nuevo

1. Copia `js/modules/dashboard.js` y renómbralo (ej. `clientes.js`).
2. Escribe su lógica y su propio `render(container, user)`.
3. Regístralo en `js/router.js` dentro del arreglo `MODULES`.
4. Listo — aparece solo en el menú y en el routing, sin tocar nada más.

## Reglas de Firestore (pendiente por proyecto)

Este boilerplate no trae `firestore.rules` porque los permisos dependen de los roles de cada cliente. Escribirlas antes de entregar — recordar el bug real detectado en NEXORA: la función `puede()` de permisos existía pero nunca se llamaba, y todos los usuarios terminaban con acceso de admin.

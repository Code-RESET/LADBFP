# Publicación — Firebase + GitHub Pages

## 1. Firebase (una sola vez)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Agregar proyecto** (p. ej. `finanzas-reset`). Analytics no es necesario.
2. **Authentication → Comenzar → Correo electrónico/contraseña → Habilitar.**
3. **Authentication → Usuarios → Agregar usuario**: tu correo y contraseña. (La app no tiene registro público a propósito.)
4. **Firestore Database → Crear base de datos** → modo **producción** → región `nam5` o `us-central1`.
5. **Configuración del proyecto → Tus apps → Web (`</>`)** → registrar la app → copiar el objeto `firebaseConfig` y pegarlo en `js/firebase-config.js` (`DEFAULT_FB_CONFIG`).
6. **Authentication → Configuración → Dominios autorizados** → agregar `code-reset.github.io` (o tu dominio).

## 2. Reglas e índices de Firestore

Opción A — Consola (sin instalar nada):
- **Firestore → Reglas** → pegar el contenido de `firestore.rules` → Publicar.
- **Firestore → Índices → Compuestos** → crear los 6 índices de `firestore.indexes.json` (colección `movimientos`). Si falta uno, la consola del navegador muestra un enlace para crearlo con un clic.

Opción B — CLI (si tienes Node):
```bash
npx firebase-tools login
npx firebase-tools use --add          # elegir el proyecto
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

⚠️ Nunca dejar Firestore en "modo de prueba": eso lo deja público.

## 3. Restringir la API key (recomendado)

Google Cloud Console → **APIs y servicios → Credenciales** → la "Browser key" del proyecto → **Restricciones de aplicaciones: Sitios web** → `https://code-reset.github.io/*` y `http://localhost:*`. La key de Firebase es pública por diseño; la seguridad real está en las reglas, pero esto evita abuso de cuota.

## 4. GitHub Pages

1. Repo → **Settings → Pages** → Source: *Deploy from a branch* → rama `main`, carpeta `/ (root)`.
2. La app queda en `https://code-reset.github.io/LADBFP/`.
3. En cada actualización: subir `CACHE_VERSION` en `service-worker.js`. Los teléfonos instalados verán "Hay una versión nueva — Actualizar".

## 5. Primer uso

Iniciar sesión → **Crear cajas y cuentas** → capturar **saldos iniciales** (lo que hay hoy en cada cuenta). Desde ahí, todo saldo se calcula con los movimientos.

## 6. Checklist en dispositivos reales (antes de dar por cerrada la Fase 1)

| Prueba | Chrome Android | Samsung Internet | Safari iOS | Desktop |
|---|---|---|---|---|
| Login / cerrar sesión | ☐ | ☐ | ☐ | ☐ |
| Registrar gasto en 3 toques (teclado numérico abre solo) | ☐ | ☐ | ☐ | ☐ |
| Transferencia entre cajas | ☐ | ☐ | ☐ | ☐ |
| Paginación 10/25/50/100 | ☐ | ☐ | ☐ | ☐ |
| Claro / Oscuro / Sistema | ☐ | ☐ | ☐ | ☐ |
| Botón "atrás" cierra la hoja abierta | ☐ | ☐ | — | — |
| Instalar como app (Android: menú → Instalar; iOS: Compartir → Agregar a inicio) | ☐ | ☐ | ☐ | ☐ |
| Modo avión: abrir la app, registrar, volver a conectar → sin duplicados | ☐ | ☐ | ☐ | — |

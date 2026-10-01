# Finanzas Reset

Centro de control financiero personal y de negocios. PWA en HTML + CSS + JS puro (ES modules), sin build ni npm para correr, con Firebase Auth + Firestore. Basada en el boilerplate Code-Reset.

Desarrollado por: **Ing. Luis Ángel Díaz Bernal** · Compañía: **CODE-RESET**

- Arquitectura y decisiones: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- Publicar en Firebase + GitHub Pages: [`docs/PUBLICACION.md`](docs/PUBLICACION.md)

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Login, arquitectura modular, navegación, claro/oscuro/sistema, cajas, cuentas, movimientos, transferencias, saldos, Dashboard, paginación, PWA offline, reglas de seguridad | ✅ |
| 2 | Obligaciones, deudas, presupuesto, alertas, próximos pagos, flujo proyectado, disponible real | Pendiente |
| 3 | Metas, escenarios, reportes, Excel, CSV, PDF, backup e importación | Pendiente |

## Estructura

```
index.html            shell + login obligatorio
service-worker.js     precache de todo (incluido el SDK de Firebase) → abre sin conexión
firestore.rules       seguridad y validación en el servidor
firestore.indexes.json
css/                  themes (tokens claro/oscuro) · base · components · responsive
js/
  app.js              arranque
  firebase-config.js  ← pegar aquí la config del proyecto Firebase
  router.js           ← registro MODULES (rutas + menús)
  core/               dinero (centavos), fechas, DOM seguro, tema, estado, errores, paginación
  domain/             LÓGICA FINANCIERA PURA (sin Firebase ni DOM) — probada en tests/
  data/               ÚNICO acceso a Firestore (repositorios, paginador, siembra inicial)
  components/         hoja inferior, confirmación, toast, paginación, formulario de movimiento…
  modules/            una carpeta por pantalla: dashboard, movimientos, cajas, cuentas, plan, mas, configuracion
tests/
  index.html          pruebas de lógica en el navegador (sin instalar nada)
  run.mjs             las mismas pruebas en Node + chequeo del service worker
  rules/              (dev) pruebas de firestore.rules con el emulador
  e2e/                (dev) prueba de punta a punta con Chromium + emuladores
```

## Cómo agregar un módulo

1. Crear `js/modules/<nombre>/index.js` con `export function render(container, ctx)` que devuelva una función de limpieza (cancelar listeners). Usar `js/modules/plan/index.js` como plantilla mínima.
2. Lógica financiera → `js/domain/` (funciones puras + prueba en `tests/`). Acceso a Firestore → un repositorio en `js/data/`.
3. Registrarlo en `MODULES` de `js/router.js` (`nav.movil: 'tab' | 'mas'`, `nav.desktop`).
4. Agregar sus archivos a `CORE_ASSETS` en `service-worker.js` y subir `CACHE_VERSION` (`node tests/run.mjs` avisa si falta alguno).
5. Si crea una colección nueva, agregar su `match` en `firestore.rules` (todo lo no declarado está cerrado) y su prueba en `tests/rules/`.

## Pruebas

| Qué | Cómo | Resultado actual |
|---|---|---|
| Lógica financiera, fechas, dinero, paginación | Abrir `tests/index.html` con un servidor local, o `node tests/run.mjs` | 40/40 |
| Reglas de Firestore (incluye "otro usuario no ve nada") | `cd tests/rules && npm install && npm test` (requiere Java) | 40/40 |
| Punta a punta (login, asistente, saldos, transferencias, anular, editar, paginación 10/25/50/100 con 320+ movimientos, offline, modo oscuro, desktop) | ver encabezado de `tests/e2e/e2e.mjs` | 34/34 |

Pendiente de prueba manual en dispositivos reales: Safari iOS, Samsung Internet e instalación PWA en Android e iOS (checklist en `docs/PUBLICACION.md`).

## Desarrollo local

```bash
python3 -m http.server 5173        # desde la raíz
# http://localhost:5173/            → Firebase real (requiere config)
# http://localhost:5173/?emulador   → emuladores locales de Firebase
# agrega &nosw para desactivar el service worker mientras desarrollas
```

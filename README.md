# Finanzas Reset

Centro de control financiero personal y de negocios. PWA en HTML + CSS + JS puro (ES modules), sin build ni npm para correr, con Firebase Auth + Firestore. Basada en el boilerplate Code-Reset.

Desarrollado por: **Ing. Luis Ángel Díaz Bernal** · Compañía: **CODE-RESET**

- Arquitectura y decisiones: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- Publicar en Firebase + GitHub Pages: [`docs/PUBLICACION.md`](docs/PUBLICACION.md)

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Login, arquitectura modular, navegación, claro/oscuro/sistema, cajas, cuentas, movimientos, transferencias, saldos, Dashboard, paginación, PWA offline, reglas de seguridad | ✅ |
| 2 | Obligaciones, deudas, presupuesto, ingresos esperados y transferencias programadas, alertas, próximos pagos, flujo proyectado (7/30/90 días, 12 meses), disponible real | ✅ |
| 3 | Metas, escenarios, reportes, CSV, PDF, backup e importación (Excel del mes ya disponible) | Pendiente |

## Cómo se usa (v1.6 «Mi mes» estilo Clima)

Toda la app cabe en una pantalla, como la plantilla de Excel del usuario:

| Parte | Qué hace |
|---|---|
| **Te quedan** | Ingresos del mes − todos los gastos del mes (pagados y pendientes), en grande sobre un cielo que cambia de color según cómo vas (azul: bien · atardecer: justo · rojo: mes en rojo). Debajo: ↑ Entró / ↓ Gastos y cuánto falta por pagar. |
| **Próximos 7 días** | Como el pronóstico del clima: qué vence cada día y cómo queda tu dinero. Abajo, una tarjeta con el consejo más útil (vencidos, errores, si no alcanza, el pago grande que viene). |
| **Gastos** | Fijos (↻) y de una vez, ordenados por día y con su caja. Tocar ☐ = pagado (con «Deshacer»); tocar el renglón = editar. |
| **Ingresos** | Igual: ☐ = recibido. |
| **Mis cajas** | Cuánto tiene cada caja hoy; «Mover dinero» entre cajas. |
| **＋** | Registrar: ¿Qué es? + ¿Cuánto? (la caja ya viene elegida; opcional «Se repite cada mes el día __»). La categoría, la cuenta y la fecha se ponen solas. |
| **Más** | Cajas, todos los movimientos, **Descargar Excel**, **Revisar mis datos**, configuración y, como opcional: deudas, ¿cuánto puedo gastar?, presupuesto y bancos. |
| **Excel** | Botón al final de Mi mes: balance del mes + dinero real (al empezar + entró − salió = al cerrar), gastos, ingresos, cajas, movimientos y 12 meses. |
| **Nueva caja** | Nombre + en qué banco está (o «＋ Otro» para crearlo) + cuánto tiene hoy. |

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
  modules/            una carpeta por pantalla: dashboard (Mi mes), movimientos, cajas, cuentas, plan, mas, configuracion
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

## Publicar una mejora

1. Hacer los cambios y subir `CACHE_VERSION` en `service-worker.js` (p. ej. `finanzas-reset-v1.0.3` → `v1.0.4`). **Sin este paso los teléfonos siguen usando la versión guardada.**
2. Fusionar a `main`: GitHub Pages publica en 1–2 minutos.
3. En el teléfono la versión nueva llega sola (aviso "Hay una versión nueva → Actualizar"), o al momento con **Configuración → Aplicación → Buscar actualizaciones**.
4. Si algo se ve raro: **Reinstalar archivos de la app** (borra solo la caché de archivos; los datos están en Firestore).

## Pruebas

| Qué | Cómo | Resultado actual |
|---|---|---|
| Lógica financiera, fechas, dinero, paginación, plan, balance del mes (plantilla), categoría automática, revisión de datos, Excel del mes | Abrir `tests/index.html` con un servidor local, o `node tests/run.mjs` | 77/77 |
| Reglas de Firestore (incluye "otro usuario no ve nada") | `cd tests/rules && npm install && npm test` (requiere Java) | 57/57 |
| Punta a punta (login, asistente, saldos, transferencias, anular, editar, paginación 10/25/50/100 con 320+ movimientos, offline, modo oscuro, desktop) | ver encabezado de `tests/e2e/e2e.mjs` | 34/34 |
| Punta a punta Fase 2 (presupuesto −$521, deuda 5 pagos, pagar, disponible real, cobertura, proyección) | `tests/e2e/plan.e2e.mjs` | 12/12 |
| Punta a punta «Mi mes» (registro nombre + monto, casillas ☐/☑ con deshacer, editar, «ya no se repite», cambiar de mes, Más, revisar datos, nueva caja con banco, Excel con números verificados) | `tests/e2e/simple.e2e.mjs` (con `EXCELJS_FILE`) | 23/23 |

Pendiente de prueba manual en dispositivos reales: Safari iOS, Samsung Internet e instalación PWA en Android e iOS (checklist en `docs/PUBLICACION.md`).

## Desarrollo local

```bash
python3 -m http.server 5173        # desde la raíz
# http://localhost:5173/            → Firebase real (requiere config)
# http://localhost:5173/?emulador   → emuladores locales de Firebase
# agrega &nosw para desactivar el service worker mientras desarrollas
```

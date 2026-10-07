# FINANZAS RESET — Arquitectura (v1.0, aprobada)

> Aprobada por Angel el 2026-10-01 con todas las propuestas por defecto del anexo
> (decisiones 1–6). **Fase 1 implementada** — ver estado y pruebas en el README.
> Pendiente: datos de la decisión 7 (montos de deudas y gastos IMSS) para la Fase 2.

**Ajustes durante la implementación de la Fase 1** (no cambian la arquitectura):
- Paginación de movimientos con filtro por mes: se usa rango sobre `fecha` en vez del campo `mes`, así bastan 6 índices compuestos en lugar de 12.
- Agregados mensuales incluyen `porCajaCuenta` (desglose "BBVA como hub") y conteos `n`, que dan el total de la paginación sin consultar al servidor.
- `historial` de cada movimiento guarda solo los campos que cambiaron, con `ts` del cliente (funciona offline).
- "Verificar saldos" se adelantó a la Fase 1 (recalcula desde movimientos y repara).

Fecha: 2026-10-01 · Repo: `Code-RESET/LADBFP` (parte del boilerplate Code-Reset)

---

## Excel, revisar datos y cajas simples (v1.4.0)

- **Descargar Excel** (Mi mes → botón al final, o Más): `Finanzas_Reset_AAAA-MM.xlsx` con hojas Balance · Gastos · Ingresos · Cajas · Movimientos · 12 meses. La hoja Balance trae el balance como la plantilla (Ingresos − Gastos pagados y pendientes = Te quedan) y el **dinero real**: al empezar + entró − salió ± saldos iniciales/ajustes = al cerrar (cuadra con Mis cajas). Datos: `domain/reporte.js` (puro, probado); archivo: `services/exportExcel.js` con ExcelJS 4.4.0 de jsDelivr, cargado solo al exportar y guardado por el service worker. Montos numéricos con formato de moneda, fechas reales, filtros, encabezado fijo, totales `SUBTOTAL` con su resultado. En la app instalada se usa la hoja de compartir del teléfono (iOS no descarga con `<a download>`).
- **Revisar mis datos** (Más o Configuración): `domain/diagnostico.js` busca saldos negativos (caja y banco), gastos/ingresos fijos con caja, banco o categoría desactivada, cajas sin banco, falta de saldos iniciales, vencidos sin marcar y cajas sin usar; cada hallazgo dice cómo arreglarlo. Después recalcula los saldos con todos los movimientos (lo que antes era "Verificar saldos").
- **Crear caja** = nombre + «¿En qué banco está?» (chips; «＋ Otro» crea el banco ahí mismo) + «¿Cuánto tiene hoy?» (saldo inicial) + casilla «no es para gastar». Color automático; color y descripción en «Más opciones». En una caja existente: «＋ Agregar dinero que ya tenía». Las cuentas se llaman **Bancos** en la interfaz y solo piden el nombre.
- Colores: acento **verde esmeralda** (#047857 claro / #34D399 oscuro).
- **Actualizar la app**: el service worker se revisa solo cada 30 min y al volver a la app; si hay versión nueva aparece arriba el botón **⟳ Actualizar app** (se queda hasta tocarlo). También en Más → Ajustes → Actualizar la app.

## Mi mes (v1.3.0)

Angel: «la app aún es muy complicada». Eligió «igual a mi Excel + mis cajas» y registrar solo «nombre + monto»:
- **Una sola pantalla, "Mi mes"** (`modules/dashboard`): Te quedan (Ingresos − Gastos del mes) · lista de **Gastos** · lista de **Ingresos** · **Mis cajas**. Selector de mes arriba. Barra inferior: Mi mes · ＋ · Más.
- Cada gasto/ingreso fijo tiene una **casilla ☐/☑** (`components/marcarPagado.js`): marcarla crea el movimiento vinculado (obligación/deuda/ingreso programado + periodo) con su caja y cuenta; trae «Deshacer». Desmarcarla anula ese pago (queda en el historial). Los registros de una vez aparecen en la misma lista, por día, ya con ✓.
- **Registro rápido** (`components/registroSimple.js`): ¿Qué es? · ¿Cuánto? · caja (chips, ya elegida) · ☐ «Se repite cada mes el día __». La categoría se elige sola por el nombre (`categoriaSugerida` en `domain/mes.js`, probada), la cuenta es la predeterminada de la caja y la fecha es hoy (o el día 1 si se ve otro mes). Si se repite, se guarda como obligación (gasto) o ingreso programado mensual.
- Tocar un renglón lo edita con el mismo formulario; «Ya no se repite» pone `regla.hasta` (lo pagado se conserva) o lo elimina si nunca llegó a aparecer. Deudas, quincenales y montos variables abren su formulario completo.
- Las pantallas Gastos e Ingresos de v1.2 se quitaron (sus rutas viejas llevan a Mi mes). Deudas, proyección, presupuesto y cuentas siguen en **Más → Avanzado (opcional)**; «Mover dinero» está en Mis cajas. No cambia el modelo de datos ni las reglas de Firestore.

## Modo simple (v1.2.0)

A pedido de Angel («la app es muy complicada»; lo que más confundía eran los números del Inicio) y tomando como base su plantilla de Excel:
- **Inicio = Balance del mes** (hoja "Balance"): Ingresos − todos los gastos del mes (pagados + pendientes). Un solo número grande, tres cifras y «¿Cómo se calcula?».
- **Gastos** (hoja "Gastos del Mes") e **Ingresos** (hoja "Ingresos") por mes, con selector de mes. Los gastos fijos son las obligaciones/deudas de la Fase 2 vistas mes por mes (`domain/mes.js`).
- Campo **forma de pago** (Efectivo, Transferencia, Tarjeta, Domiciliado, Depósito) en movimientos y gastos fijos; categorías Vivienda y Honorarios (se agregan solas a usuarios existentes).
- La cuenta se elige sola según la caja; cuenta, fecha, nota, saldo inicial y ajuste quedan en «Más detalles».
- «Puedes gastar» (disponible real), deudas y presupuesto siguen existiendo en Más → Planeación. No se perdió ninguna función ni dato.

## Fase 2 — implementada (v1.1.0)

- **Datos:** colecciones `obligaciones`, `deudas`, `recurrentes` (ingresos esperados y transferencias programadas) y `presupuestos`, con reglas de validación en servidor (sin caja → rechazado).
- **Pagos vinculados:** "Pagar" abre el formulario prellenado y guarda en el movimiento `obligacionId + obligacionPeriodo`, `deudaId + deudaPeriodo` o `recurrenteId + recurrentePeriodo`. Los agregados mensuales suman lo pagado en `porVinculo` y `porDeuda`: el estado de cada ocurrencia, el saldo de cada deuda y el comprometido se calculan **sin leer movimientos**, también sin conexión.
- **Dominio puro:** `periodos.js` (frecuencias/calendario), `compromisos.js` (estados, deudas, eventos), `presupuesto.js` (déficit y sostenibilidad, decisión A4), `proyeccion.js` (comprometido, disponible real, simulación diaria), `alertas.js`. Reunidos en `services/planCalculado.js` para que Inicio y Plan muestren los mismos números.
- **Datos pendientes (sección 42):** no se asumen. Los datos conocidos se ofrecen como *sugerencias* que abren el formulario prellenado para confirmar día, frecuencia y montos.
- **Presupuesto en la proyección:** cuenta el gasto (prorrateado por día) solo si es sostenible; el campo "ingreso" sirve para evaluar el déficit y el dinero que entra viene de los ingresos/transferencias programados (evita doble conteo).

## Índice

- [A. Problemas detectados](#a-problemas-detectados)
- [B. Arquitectura propuesta](#b-arquitectura-propuesta)
- [C. Estructura de carpetas y módulos](#c-estructura-de-carpetas-y-módulos)
- [D. Modelo Firestore](#d-modelo-firestore)
- [E. Reglas financieras](#e-reglas-financieras)
- [F. Navegación](#f-sistema-de-navegación)
- [G. Paginación](#g-sistema-de-paginación)
- [H. Temas claro / oscuro / sistema](#h-sistema-de-temas)
- [I. Exportación Excel (y CSV / PDF)](#i-sistema-de-exportación)
- [J. Plan de implementación](#j-plan-de-implementación)
- [Anexo: decisiones pendientes](#anexo-decisiones-pendientes)

---

## A. Problemas detectados

Formato: **problema → impacto → solución propuesta**. Ordenados por la prioridad de la sección 45 (precisión financiera primero).

### A1. "No almacenar saldos" vs. "no cargar todos los movimientos" (contradicción)
- **Problema:** la sección 17 pide calcular saldos a partir de movimientos; las secciones 5 y 7 prohíben leer todos los movimientos. Con miles de movimientos, calcular el saldo leyendo todo es lento, caro (lecturas Firestore) e imposible offline.
- **Impacto:** o el Dashboard tarda y consume miles de lecturas, o los saldos se vuelven un número tecleado a mano (lo que la regla quiere evitar).
- **Solución:** la **fuente de verdad son los movimientos**. Además se mantiene un **agregado mensual derivado** (`agregados/{YYYY-MM}`) con totales en centavos por caja, cuenta y categoría. Se actualiza **en el mismo `writeBatch`** que crea/edita/anula el movimiento (con `increment()`), así que nunca queda desincronizado ni se edita a mano. El saldo de una caja = suma de sus agregados (≈12 documentos por año). Se incluye una herramienta **"Verificar saldos"** que recalcula desde los movimientos (paginando) y compara. Interpretación: lo que se prohíbe es el saldo *manual*, no un caché derivado y verificable.

### A2. Saldos iniciales: la app arranca con dinero que ya existe
- **Problema:** si no hay saldos manuales, ¿cómo se registra que hoy Mercado Pago ya tiene $X? Registrarlo como "ingreso" inflaría los reportes de ingresos del mes.
- **Impacto:** reportes falsos o imposibilidad de empezar.
- **Solución:** dos tipos de movimiento adicionales, excluidos de reportes de ingreso/gasto:
  - `apertura` — saldo inicial de una caja+cuenta (uno por par, al configurar).
  - `ajuste` — conciliación contra el banco (entrada o salida), siempre con nota obligatoria y visible en auditoría.

### A3. Caja ≠ cuenta, y "transferencia a la misma caja" (contradicción)
- **Problema:** la sección 37 prohíbe transferir a la misma caja, pero hay movimientos legítimos dentro de una caja: mover dinero de Reset Alarmas de Mercado Pago a BBVA, o pagar una tarjeta de crédito desde débito (sección 35). Además la sección 15 dice que BBVA es un *hub* con dinero de varias cajas, pero la 36 habla de "cuentas sin caja", como si cada cuenta perteneciera a una caja.
- **Impacto:** si se aplica la regla literal, no se puede reflejar el dinero real por cuenta ni pagar tarjetas sin registrar un gasto doble.
- **Solución:** el modelo es de **dos dimensiones**: cada peso está en una *caja* (para qué es) **y** en una *cuenta* (dónde está físicamente). La regla se redefine como: **una transferencia no puede tener el mismo par (caja, cuenta) en origen y destino**. Se puede cambiar de caja, de cuenta o de ambas. Una cuenta tiene una `cajaPredeterminada` *opcional* (para prellenar formularios); la alerta "cuenta sin caja" pasa a ser "cuenta sin caja predeterminada" (informativa).

### A4. Presupuesto real deficitario: prohibido y a la vez dato inicial (contradicción)
- **Problema:** la sección 37 prohíbe un presupuesto real deficitario, pero los datos iniciales (secciones 21 y 41) son exactamente un presupuesto con déficit de $521 que la app debe mostrar.
- **Impacto:** o no se pueden cargar los datos iniciales, o se viola la regla de integridad.
- **Solución propuesta:** el presupuesto real puede guardarse en estado **`deficitario`** (🔴 en Dashboard), pero **no se marca como `sostenible` (activo para proyecciones y "disponible real") hasta que el déficit esté cubierto** con una línea explícita de *cobertura* (p. ej. "Transferencia desde Reset Alarmas $521/sem") o se reduzcan gastos. Los datos iniciales se cargan así: presupuesto real deficitario + alerta. **❓ DECISIÓN 1.**

### A5. Meta sin caja vs. caja del ahorro desconocida (contradicción)
- **Problema:** la sección 20/37 prohíbe metas sin caja de origen; la sección 42 dice que la caja del ahorro de $20,000/mes aún no está definida.
- **Solución:** la meta "Remodelación" se crea en estado **`borrador`**: visible, con objetivo y aportación, pero **no participa en proyecciones ni compromete dinero** hasta que se le asigne caja de origen. No se puede pasar a `activa` sin caja (la regla se mantiene).

### A6. Riesgo financiero: la meta de $20,000/mes parece inalcanzable con los datos actuales
- Ingresos declarados: 18,044 + 15,155 + ~3,490 ≈ **$36,689/mes**.
- Comprometidos conocidos: sueldo personal ≈ $15,167/mes, trabajadora hasta $8,000, destinos IMSS ≈ $3,490 → quedan **≈ $10,032/mes antes de** pagar préstamo Dra. Marcela, deuda esposa y electrodomésticos (montos aún no proporcionados). Code-Reset no cuenta (capital de crecimiento).
- **Impacto:** a $20,000/mes, la meta de $300,000 se cumple en 15 aportaciones (enero 2028 si inicia en noviembre 2026); con el flujo libre real (≤ $10,000) serían ≥ 30 meses. La app debe marcarla como **meta inviable** (sección 36), no esconderlo.
- **Solución:** el módulo de inteligencia compara la aportación con el flujo libre proyectado de la caja de origen y la marca 🟠 si no alcanza. Faltan los montos de las 3 deudas para cerrar el cálculo.

### A7. Riesgo financiero: HD Crédit queda en déficit leve
- $3,500/semana × 52 / 12 = **$15,166.67/mes** de sueldo vs. **$15,155/mes** de ingreso HD Crédit → **−$11.67/mes**. Pequeño, pero es exactamente lo que la app debe detectar. Se reportará como alerta de "caja con flujo negativo".

### A8. Semanas vs. meses
- **Problema:** hay datos semanales ($3,500), quincenales (cobranza HD) y mensuales. Un mes no son 4 semanas.
- **Solución:** conversión única en `domain/periodos.js`: semanal → mensual = ×52/12; quincenal → mensual = ×2 (quincenas fijas: día 15 y último día). Redondeo **al centavo, mitad hacia arriba**, solo al final del cálculo.

### A9. Proyección: faltan "ingresos esperados" y "transferencias programadas"
- **Problema:** la fórmula del flujo proyectado (sección 23) suma "ingresos esperados", pero el modelo de la sección 30 no tiene dónde guardarlos. Tampoco la transferencia recurrente HD Crédit → Nu.
- **Solución:** nueva colección `recurrentes` (ingresos esperados y transferencias programadas, con frecuencia). Esto además resuelve el pendiente 42.1 ("ruta definitiva del sueldo"): la ruta es un `recurrente` editable, no código.

### A10. Doble conteo en proyecciones
- **Problema:** la fórmula "− gastos − obligaciones − deudas − metas" cuenta dos veces si, por ejemplo, el pago a la Dra. Marcela existe como obligación **y** como deuda, o si "casa" está en el presupuesto **y** como obligación.
- **Solución (regla):** cada salida futura viene de **una sola fuente**:
  - Deudas → generan su propio calendario de pagos. Una obligación no puede apuntar a una deuda.
  - Obligaciones → compromisos fijos no-deuda (trabajadora, colegiatura, celular, cuota casa IMSS).
  - Presupuesto → gasto discrecional por sobre (casa semanal, salidas, comida).
  - Metas → aportaciones (transferencias a ahorro).
  La validación impide crear una obligación con la misma categoría+caja+monto que una línea de presupuesto activa (advierte).

### A11. Offline + duplicados + `await` que nunca termina
- **Problemas técnicos reales con Firestore offline:**
  1. `firebase-config.js` usa `getFirestore()` → **no hay persistencia offline** hoy.
  2. Una escritura offline **no resuelve su `await`** hasta reconectar: si la UI espera, se congela.
  3. `runTransaction()` **falla sin conexión**.
  4. Reintentar un `addDoc` crea duplicados.
- **Solución:** `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`; IDs generados en el cliente (`doc(collection(...)).id`) + `writeBatch` (funciona offline y es idempotente: reintentar escribe el mismo documento); la UI no espera al servidor (muestra "pendiente de sincronizar" con `hasPendingWrites`); **no se usan transacciones** en el flujo de movimientos.

### A12. Service worker actual no permite abrir la app offline
- **Problema:** el SDK de Firebase se importa desde `gstatic.com` y el SW solo responde desde caché lo que precargó; los módulos de Firebase no están en `CORE_ASSETS` → sin red, `import` falla y la app no abre.
- **Solución:** precachear las URLs exactas (versión fijada) del SDK y de las librerías de exportación; estrategia *cache-first* para shell y librerías versionadas, *network-only* para Firestore/Auth (Firestore ya tiene su propia caché en IndexedDB).

### A13. Paginación numerada en Firestore
- **Problema:** Firestore pagina por cursores (`startAfter`), no por número de página. Saltar a la página 10 obliga a usar `offset`, que **cobra todas las lecturas saltadas**. Además "de 327 movimientos" requiere un conteo (`getCountFromServer`), que **no funciona offline**.
- **Solución:** ver [G](#g-sistema-de-paginación): cursores cacheados por página, números solo para páginas alcanzables, total desde el agregado mensual cuando aplica, o del servidor cuando hay red; offline se oculta el total.

### A14. Fechas y zona horaria
- **Problema:** un movimiento capturado el 31-oct a las 23:00 en México es 1-nov en UTC. Si se guarda como `Timestamp`, el reporte de octubre lo pierde. Exportar fechas a Excel tiene el mismo problema.
- **Solución:** la fecha contable se guarda como texto **`'YYYY-MM-DD'`** (fecha local) + campo `mes: 'YYYY-MM'`. `createdAt/updatedAt` sí son `serverTimestamp()`. Zona fija `America/Mexico_City`.

### A15. Excel profesional sin build ni npm
- **Problema:** generar `.xlsx` con formato (moneda, filtros, encabezados congelados, anchos) requiere una librería. SheetJS Community **no escribe estilos**. Ninguna librería de navegador gratuita genera **gráficas nativas** de Excel.
- **Solución:** **ExcelJS** (UMD desde jsDelivr, versión fijada, carga perezosa solo al exportar, precacheada para offline). La "gráfica" mensual se resuelve con **barras de datos** (formato condicional) en la hoja Resumen. Gráfica nativa: fuera de alcance salvo que Angel lo pida (requiere escribir DrawingML a mano). **❓ DECISIÓN 5.**
- **iOS:** en PWA instalada, `<a download>` abre una vista previa en lugar de descargar; se usa `navigator.share({ files })` cuando exista y descarga normal como respaldo.

### A16. Identidad visual Code-Reset vs. estilo iOS
- **Problema:** el boilerplate usa negro puro + verde lima neón + Orbitron/JetBrains Mono. La sección 9–10 pide estilo iOS, sin negros puros, con modo claro. El lima `#9ACD32` sobre blanco tiene contraste ≈ 2:1 (ilegible).
- **Solución:** login y logo conservan la identidad Code-Reset (obligatorio). Dentro de la app: tipografía del sistema (`-apple-system, system-ui`), números tabulares, acento lima ajustado por tema (más oscuro en claro, p. ej. `#4D7C0F`). **❓ DECISIÓN 3.**

### A17. Reglas de seguridad: pruebas automáticas
- **Problema:** probar `firestore.rules` de verdad requiere el emulador de Firebase (Node + Java), y el stack dice "sin npm".
- **Solución:** la app sigue sin npm. Las pruebas de reglas viven en `/tests/rules/` como **herramienta de desarrollo opcional** (no se publica). Las pruebas financieras corren en el navegador (`tests/index.html`), sin instalar nada. Lección NEXORA aplicada: cada `match` llama explícitamente a `esDueno(uid)` y hay una prueba que verifica que **otro usuario no puede leer nada**.

### A18. Fases: el Dashboard de Fase 1 no puede calcular "disponible real"
- **Problema:** "comprometido" depende de obligaciones/deudas/metas, que son Fase 2–3.
- **Solución:** en Fase 1 el Dashboard muestra **Saldo** por caja y total (exacto); la tarjeta "Disponible real" aparece en Fase 2. No se muestra un número inventado.

### A19. Otros puntos menores
- **Préstamos recibidos** (si alguien te presta): no son ingreso. Se registran como `ingreso` con categoría marcada `esFinanciamiento` → se excluyen del ingreso en reportes y crean/aumentan una deuda.
- **Deudas sin interés:** la especificación no menciona tasas. El modelo deja `tasaAnual` opcional (0 por defecto).
- **Obligación variable (trabajadora $3,200–$8,000):** para "comprometido" se usa `monto` (=$8,000, el presupuesto) — criterio conservador.
- **Usuario único:** se asume un solo usuario. `users/{uid}` permite multiusuario después. **❓ DECISIÓN 6.**
- **Siembra de datos iniciales:** IDs fijos (`reset-alarmas`, `hd-credit`, …) para que ejecutar el asistente dos veces no duplique nada.
- **API key pública en GitHub Pages:** es normal en Firebase; la seguridad está en las reglas. Se restringe la API key al dominio de GitHub Pages y se configuran dominios autorizados en Auth.

---

## B. Arquitectura propuesta

Capas, de abajo hacia arriba. **Una capa solo importa de las capas inferiores.**

```
┌──────────────────────────────────────────────────────────┐
│ modules/      Pantallas (render(container, ctx) → cleanup)│  UI de cada sección
├──────────────────────────────────────────────────────────┤
│ components/   modal, bottomSheet, pagination, toast...    │  UI reutilizable, sin lógica financiera
├──────────────────────────────────────────────────────────┤
│ services/     export*, backup, notifications              │  Casos de uso que combinan datos + dominio
├──────────────────────────────────────────────────────────┤
│ data/         repositorios por entidad (Firestore)        │  ÚNICO lugar que habla con Firestore
├──────────────────────────────────────────────────────────┤
│ domain/       saldos, proyección, deudas, metas, alertas  │  Funciones puras: sin DOM, sin Firebase
├──────────────────────────────────────────────────────────┤
│ core/         money, dates, validation, state, router... │  Utilidades base
└──────────────────────────────────────────────────────────┘
```

Principios:

1. **Dominio puro.** Toda regla financiera vive en `js/domain/` como funciones puras (`entrada → salida`, en centavos). Se prueban en el navegador sin Firebase. Los módulos visuales nunca suman dinero por su cuenta.
2. **Repositorios.** `js/data/movimientosRepo.js`, `cajasRepo.js`, etc. Encapsulan rutas, conversiones y consultas. Un módulo nunca escribe `collection(db, ...)`.
3. **Estado mínimo.** `core/state.js` es un pequeño *store* con suscripción. Solo guarda catálogos pequeños (cajas, cuentas, categorías, agregados, configuración) escuchados con `onSnapshot` una vez al iniciar sesión. Los movimientos **nunca** se cargan completos en estado.
4. **Módulos con ciclo de vida.** `render(container, ctx)` devuelve una función `cleanup()` que el router llama al salir (cancela listeners → sin fugas ni lecturas fantasma).
5. **Carga perezosa.** El router usa `import()` dinámico: abrir "Reportes" no descarga "Deudas". ExcelJS/jsPDF se cargan solo al exportar.
6. **Errores.** Los repositorios traducen errores de Firebase a mensajes en español (`core/errors.js`); la UI solo muestra esos mensajes vía toast/estado de error.

Stack (sin cambios respecto al boilerplate Code-Reset): HTML + CSS + JS ES modules, Firebase JS SDK 10.x por CDN (`gstatic`), GitHub Pages, sin build. Dependencias externas nuevas (solo bajo demanda, versión fijada, precacheadas): ExcelJS, jsPDF + jspdf-autotable.

---

## C. Estructura de carpetas y módulos

Se adapta el árbol propuesto en la sección 3 al boilerplate existente. Se mantienen las convenciones de Code-Reset: `js/firebase-config.js` sigue siendo el archivo donde se pega la configuración, y `js/router.js` sigue teniendo el arreglo `MODULES`.

```
/                                   (raíz servida por GitHub Pages)
├── index.html                      shell + pantalla de login obligatoria
├── manifest.json
├── service-worker.js               CACHE_VERSION, precache shell + SDK + libs
├── firestore.rules                 reglas de seguridad
├── firestore.indexes.json          índices compuestos
├── assets/                         logo.svg, icon-192.png, icon-512.png, icon-maskable-512.png
├── css/
│   ├── base.css                    reset, tipografía, layout
│   ├── themes.css                  tokens claro/oscuro
│   ├── components.css              tarjetas, listas iOS, botones, sheets
│   └── responsive.css              tabbar ↔ sidebar, tablas desktop
├── js/
│   ├── app.js                      arranque: tema, auth, router, SW
│   ├── firebase-config.js          config + Firestore con caché offline
│   ├── router.js                   MODULES + motor de rutas hash
│   ├── core/
│   │   ├── auth.js                 login/logout/estado de sesión
│   │   ├── state.js                store con suscripción
│   │   ├── money.js                centavos ↔ texto, formato MXN, redondeo
│   │   ├── dates.js                'YYYY-MM-DD', periodos, zona MX
│   │   ├── validation.js           validadores reutilizables
│   │   ├── theme.js                claro/oscuro/sistema
│   │   ├── errors.js               traducción de errores
│   │   └── dom.js                  helpers html``, escape (anti-XSS)
│   ├── domain/                     ← LÓGICA FINANCIERA PURA
│   │   ├── movimientos.js          reglas de integridad, deltas para agregados
│   │   ├── saldos.js               saldo por caja/cuenta, patrimonio
│   │   ├── periodos.js             frecuencias, ocurrencias, normalización
│   │   ├── obligaciones.js         calendario y estado de cada ocurrencia
│   │   ├── deudas.js               saldo restante, % pagado, fecha liquidación
│   │   ├── metas.js                faltante, %, fecha estimada, viabilidad
│   │   ├── presupuesto.js          déficit/superávit, sostenibilidad
│   │   ├── proyeccion.js           flujo 7/30/90 días, 12 meses
│   │   ├── comprometido.js         comprometido y disponible real
│   │   ├── escenarios.js           aplica cambios hipotéticos sin tocar datos
│   │   └── alertas.js              inteligencia financiera (sección 36)
│   ├── data/                       ← ÚNICO ACCESO A FIRESTORE
│   │   ├── firestore.js            rutas users/{uid}/..., batch, paginador genérico
│   │   ├── cajasRepo.js  cuentasRepo.js  categoriasRepo.js
│   │   ├── movimientosRepo.js      crear/editar/anular + agregados en el mismo batch
│   │   ├── agregadosRepo.js
│   │   ├── obligacionesRepo.js  deudasRepo.js  metasRepo.js
│   │   ├── presupuestosRepo.js  recurrentesRepo.js  escenariosRepo.js
│   │   ├── configRepo.js
│   │   └── seed.js                 datos iniciales idempotentes
│   ├── services/
│   │   ├── exportExcel.js  exportCsv.js  exportPdf.js
│   │   ├── reportData.js           arma el dataset de un periodo (lo usan los 3 export)
│   │   ├── backup.js               exportar/importar JSON con validación
│   │   ├── libLoader.js            carga perezosa de librerías CDN
│   │   └── notifications.js
│   ├── components/
│   │   ├── modal.js  bottomSheet.js  confirmation.js  toast.js
│   │   ├── card.js  table.js  list.js  pagination.js
│   │   ├── emptyState.js  loading.js (skeletons)  errorState.js
│   │   ├── moneyInput.js           teclado numérico, centavos
│   │   └── movimientoForm.js       formulario rápido (3 acciones)
│   └── modules/
│       ├── dashboard/      index.js + widgets (saldos, próximos pagos, alertas, metas, flujo)
│       ├── movimientos/    index.js, lista.js, detalle.js
│       ├── cajas/          cuentas/      obligaciones/   deudas/
│       ├── metas/          presupuesto/  escenarios/     reportes/
│       ├── plan/           contenedor móvil (presupuesto/obligaciones/metas/escenarios/flujo)
│       ├── mas/            menú "Más" en móvil
│       └── configuracion/  apariencia, categorías, respaldo, verificar saldos
├── tests/
│   ├── index.html                  corre pruebas de domain/ en el navegador
│   ├── *.test.js
│   └── rules/                      (dev opcional) pruebas de reglas con emulador
└── docs/
    ├── ARQUITECTURA.md             este documento
    └── PUBLICACION.md              guía GitHub Pages + Firebase (Fase 1)
```

Registro de un módulo (extiende la convención actual de `MODULES`):

```js
{ path: "movimientos", label: "Movimientos", icon: "list",
  nav: { mobile: "tab", desktop: true },          // tab | more | hidden
  load: () => import("./modules/movimientos/index.js") }
```

---

## D. Modelo Firestore

Todo cuelga de `users/{uid}`. Dinero **siempre** en enteros de centavos (`...Centavos`). Fechas contables como `'YYYY-MM-DD'`. Todos los documentos llevan `createdAt`, `updatedAt` (`serverTimestamp()`) y `schemaVersion`.

```
users/{uid}                                  perfil + config
  config: { tema, pageSize, zonaHoraria, monedaBase:'MXN', horizonteComprometidoDias }
  │
  ├─ cajas/{cajaId}
  │    nombre, color, icono, orden, activa,
  │    tipo: 'operativa' | 'ahorro' | 'crecimiento',
  │    disponibleParaGasto: bool      // Code-Reset = false (capital de crecimiento)
  │    cuentaPredeterminadaId?
  │
  ├─ cuentas/{cuentaId}
  │    nombre ('BBVA HD', 'Nu', 'Mercado Pago', 'HSBC', 'Klar'), institucion,
  │    tipo: 'debito' | 'efectivo' | 'monedero' | 'credito',
  │    cajaPredeterminadaId?, activa,
  │    credito?: { limiteCentavos, diaCorte, diaLimite }   // sección 35, Fase futura
  │
  ├─ categorias/{categoriaId}
  │    nombre, tipo: 'ingreso' | 'gasto', icono, activa, sistema: bool,
  │    esFinanciamiento?: bool        // préstamo recibido → no cuenta como ingreso
  │
  ├─ movimientos/{movId}               (ID generado en el cliente)
  │    tipo: 'ingreso' | 'gasto' | 'transferencia' | 'apertura' | 'ajuste'
  │    fecha: '2026-10-01', mes: '2026-10'
  │    montoCentavos: int > 0
  │    cajaId, cuentaId                       // origen en transferencias
  │    cajaDestinoId?, cuentaDestinoId?       // solo transferencia
  │    direccion?: 'entrada' | 'salida'       // solo ajuste
  │    cajaIds: [..], cuentaIds: [..]         // para filtrar con array-contains
  │    categoriaId?                           // obligatoria en ingreso/gasto
  │    nota
  │    obligacionId?, obligacionPeriodo?: '2026-10-15'
  │    deudaId?, metaId?, recurrenteId?
  │    estado: 'activo' | 'anulado'
  │    anulacion?: { motivo, en }
  │    origen: 'manual' | 'recurrente' | 'importado'
  │    └─ historial/{cambioId}   { accion: 'crear'|'editar'|'anular', antes, despues, en }
  │                               (solo creación; las reglas prohíben editar/borrar)
  │
  ├─ agregados/{YYYY-MM}             DERIVADO — solo lo escribe movimientosRepo en el batch
  │    porCaja:   { [cajaId]:   { ing, gas, tin, tout, ape, ajE, ajS, n } }
  │    porCuenta: { [cuentaId]: { ...igual } }
  │    porCategoria: { [categoriaId]: total }
  │    n: total de movimientos activos del mes
  │
  ├─ recurrentes/{id}                ingresos esperados y transferencias programadas
  │    tipo: 'ingreso' | 'transferencia', nombre, montoCentavos,
  │    frecuencia, regla (ver periodos), cajaId, cuentaId, cajaDestinoId?, cuentaDestinoId?,
  │    categoriaId?, activo, desde, hasta?
  │
  ├─ obligaciones/{id}
  │    nombre, montoCentavos, minimoCentavos?, maximoCentavos?, variable: bool,
  │    frecuencia: 'semanal'|'quincenal'|'mensual'|'anual'|'personalizada',
  │    regla: { diaSemana? | dias?: [15,'ultimo'] | diaMes? | mesDia? | cadaNDias?, desde },
  │    cajaId, cuentaId, categoriaId, activa
  │    (el estado de cada ocurrencia se CALCULA con los movimientos que traen obligacionId)
  │
  ├─ deudas/{id}
  │    acreedor, descripcion, saldoInicialCentavos, pagoPeriodoCentavos,
  │    frecuencia, regla, fechaInicial, fechaFinal?, cajaId, cuentaId?, tasaAnual: 0, activa
  │    (saldo actual, pagos restantes, % e historial se CALCULAN de movimientos con deudaId)
  │
  ├─ metas/{id}
  │    nombre, objetivoCentavos, aportacionCentavos, frecuencia,
  │    cajaOrigenId?  (obligatorio para estado 'activa'), cajaAhorroId?, cuentaAhorroId?,
  │    estado: 'borrador' | 'activa' | 'pausada' | 'cumplida'
  │    (acumulado = transferencias con metaId; se CALCULA)
  │
  ├─ presupuestos/{id}
  │    nombre, periodo: 'semanal'|'quincenal'|'mensual', cajaId,
  │    ingresoCentavos, lineas: [{ categoriaId, montoCentavos }],
  │    coberturas: [{ desdeCajaId, montoCentavos, nota }],
  │    estado: 'sostenible' | 'deficitario'   (calculado al guardar, validado en reglas)
  │
  └─ escenarios/{id}
       nombre ('Reducir salidas', 'Trabajadora $8,000'…), basadoEn: 'actual',
       cambios: [{ entidad, id, campo, valor }]   // nunca toca datos reales
```

**Por qué una transferencia es un solo documento:** se escribe atómicamente (no puede existir "la mitad" de una transferencia), resta en origen y suma en destino en el mismo agregado, y nunca puede contarse como ingreso.

**Índices compuestos** (`firestore.indexes.json`): `estado+fecha desc+createdAt desc`; `cajaIds (array-contains)+fecha desc`; `cuentaIds (array-contains)+fecha desc`; `tipo+fecha desc`; `categoriaId+fecha desc`; `deudaId+fecha`; `obligacionId+fecha`; `metaId+fecha`; `mes+fecha`.

**Reglas de seguridad (esqueleto):**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function esDueno(uid) { return request.auth != null && request.auth.uid == uid; }
    function entero(x)    { return x is int && x > 0; }

    match /users/{uid} {
      allow read, write: if esDueno(uid);

      match /movimientos/{id} {
        allow read: if esDueno(uid);
        allow create, update: if esDueno(uid) && movimientoValido(request.resource.data);
        allow delete: if false;                          // nunca borrar: se anula
        match /historial/{h} {
          allow read, create: if esDueno(uid);
          allow update, delete: if false;                // auditoría inmutable
        }
      }
      match /{coleccion}/{id} {                          // resto de colecciones
        allow read, write: if esDueno(uid) && validoPara(coleccion, request.resource.data);
      }
    }
    match /{document=**} { allow read, write: if false; } // todo lo demás cerrado
  }
}
```

`movimientoValido()` verifica en el servidor: tipo permitido, `montoCentavos` entero > 0, `cajaId` y `cuentaId` presentes, transferencia con destino y par (caja, cuenta) distinto, `fecha` con formato `YYYY-MM-DD`, `cajaIds` consistente. Así la integridad no depende solo del JavaScript (sección 31).

---

## E. Reglas financieras

Todas implementadas en `js/domain/`, todas en centavos, todas con prueba.

**E1. Dinero.** Entero de centavos. Entrada `"3,500.00"` → `350000`. Prohibido `parseFloat` para sumar. Divisiones (conversión de periodos, porcentajes, prorrateos) redondean al centavo, mitad hacia arriba, una sola vez al final. Formato: `Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' })`.

**E2. Saldo de una caja (o cuenta).**
```
saldo = aperturas + ingresos − gastos + transferencias entrantes − transferencias salientes + ajustes entrada − ajustes salida
```
Solo movimientos `activos`. Calculado como suma de `agregados/*`. Verificable recalculando desde movimientos.

**E3. Patrimonio** = Σ saldos de todas las cajas. Una transferencia no lo cambia (prueba obligatoria).

**E4. Comprometido (por caja)** = suma de lo que vence entre hoy y el horizonte (por defecto: **30 días**, configurable; **❓ DECISIÓN 4**):
- ocurrencias de obligaciones no pagadas (monto pendiente; variables usan `monto`),
- pagos de deudas programados,
- aportaciones de metas `activas`,
- líneas del presupuesto real por el resto del periodo actual,
- transferencias programadas *salientes*.

**E5. Disponible real (por caja)** = saldo − comprometido. Puede ser negativo → 🔴 déficit de caja.
**Disponible total** = Σ disponibles de cajas con `disponibleParaGasto = true` (Code-Reset y cajas de ahorro quedan fuera, aunque sí cuentan en patrimonio). Un déficit en una caja **resta** del total: no se esconde detrás del dinero de otra.

**E6. Estado de una ocurrencia de obligación.** pagado = Σ movimientos con ese `obligacionId` + `obligacionPeriodo`.
`pagada` si pagado ≥ monto · `parcialmente pagada` si 0 < pagado < monto · `vencida` si fecha < hoy y no pagada · `pendiente` en otro caso.

**E7. Deudas.** saldo actual = saldo inicial − Σ pagos (movimientos `gasto` con `deudaId`). pagos restantes = ⌈saldo actual / pago por periodo⌉. % pagado = pagado / inicial. Fecha estimada = fecha del último pago según la frecuencia. *Prueba: $30,000 / $6,000 → 5 pagos.*

**E8. Metas.** acumulado = Σ transferencias con `metaId` (− retiros). faltante = objetivo − acumulado. aportaciones restantes = ⌈faltante / aportación⌉. *Prueba: $300,000 a $20,000/mes → 15 aportaciones; iniciando 2026-11 → enero 2028.* **Inviable** si la aportación > flujo libre proyectado de la caja origen.

**E9. Presupuesto.** resultado = ingreso − Σ líneas + Σ coberturas. `< 0` → `deficitario` 🔴. *Prueba: 3,500 − (2,500 + 831 + 690) = −521.*

**E10. Proyección.** Simulación día por día por caja: saldo inicial + recurrentes de ingreso ± transferencias programadas − obligaciones − pagos de deuda − aportaciones a metas − presupuesto prorrateado. Horizontes 7/30/90 días y 12 meses (este último agregado por mes). Detecta el **primer día en que una caja queda negativa**.

**E11. Integridad (sección 37), aplicada en `domain/movimientos.js` y repetida en `firestore.rules`:**
movimiento sin caja ✗ · transferencia sin origen o sin destino ✗ · transferencia con mismo (caja, cuenta) ✗ · monto ≤ 0 o no entero ✗ · meta activa sin caja ✗ · obligación/deuda sin caja ✗ · borrar movimiento ✗ (se **anula** con motivo y queda en historial) · ingreso en categoría de transferencia ✗.

**E12. Posibles duplicados.** Al guardar, si existe un movimiento con mismo tipo + caja + monto + fecha registrado en los últimos 10 minutos → aviso "¿Ya lo registraste?". Offline, el ID generado en cliente evita duplicados por reintento.

**E13. Alertas (sección 36).** `domain/alertas.js` recibe saldos, comprometido, calendario, presupuesto, metas y deudas, y devuelve una lista `{ nivel: 'rojo'|'naranja'|'info', tipo, mensaje, accion }`. El Dashboard solo la pinta.

---

## F. Sistema de navegación

Router por hash (convención Code-Reset), con parámetros: `#/movimientos?caja=hd-credit&p=2`, `#/deudas/marcela`.

**Móvil (< 768 px):** barra inferior fija, respetando `safe-area-inset-bottom`:

| Inicio | Movimientos | **＋** | Plan | Más |
|---|---|---|---|---|

- **＋ (botón central):** abre el bottom sheet de movimiento rápido. Común = **3 acciones**: (1) tocar ＋, (2) escribir monto (teclado numérico; caja, cuenta y categoría vienen prellenadas con la última usada), (3) Guardar. Tipo y caja se cambian con un toque si hace falta.
- **Plan:** segmentos *Presupuesto · Obligaciones · Metas · Flujo · Escenarios*.
- **Deudas:** el prompt la pone en la barra; propongo **Deudas dentro de Plan** y usar ese espacio para el botón ＋, que es la acción más frecuente. Si Angel prefiere el orden literal (Inicio | Movimientos | Plan | Deudas | Más), el ＋ pasa a botón flotante. **❓ DECISIÓN 2.**
- **Más:** Cajas, Cuentas, Deudas, Reportes, Configuración, Cerrar sesión (estilo lista de iOS Settings).

**Tablet/desktop (≥ 768 px / ≥ 1024 px):** sidebar con las 11 secciones de la sección 11 + botón "Nuevo movimiento". En ≥ 1024 px el Dashboard pasa a rejilla de 2–3 columnas y las listas a tabla.

Comportamiento: cambio de ruta sin recarga; foco y scroll al inicio; el botón "atrás" del teléfono cierra primero el sheet/modal abierto (estado en el hash, `#…&sheet=nuevo`).

---

## G. Sistema de paginación

Componente único `components/pagination.js` + paginador genérico en `data/firestore.js`. Se usa en movimientos, historial de pagos, transferencias, reportes y auditoría.

**Consulta:** `query(ref, ...filtros, orderBy('fecha','desc'), orderBy('createdAt','desc'), limit(pageSize + 1))`.
El registro extra indica si hay página siguiente sin hacer otra consulta.

**Cursores:** se guarda el último documento de cada página visitada (`cursores[n]`). Siguiente = `startAfter(cursores[n])`. Anterior = página ya visitada → se reconsulta con su cursor (o se sirve de la caché local de Firestore).

**Números de página:** se muestran como enlaces solo las páginas **ya visitadas** y la siguiente; las demás aparecen como texto (`… 14`). Saltar a una página lejana requeriría `offset`, que cobra todas las lecturas saltadas — se evita a propósito. Cambiar filtros o tamaño reinicia en página 1.

**Total ("Mostrando 26–50 de 327 movimientos"):**
- Filtro por mes y/o caja → total del `agregados` (gratis, funciona offline).
- Otros filtros con red → `getCountFromServer()` (1 lectura por cada 1,000 registros), cacheado mientras no cambie el filtro.
- Offline sin agregado → "Mostrando 26–50" sin total.

**Tamaño:** 10 / 25 / 50 / 100; por defecto 25; se recuerda en `config.pageSize`.

**Desktop:** `‹ Anterior | 1 | 2 | 3 | Siguiente ›` + "Mostrando 26–50 de 327 movimientos".
**Móvil:** `‹ 25 anteriores` · *Página 2 de 14* · `25 siguientes ›` (botones de ≥ 44 px).

---

## H. Sistema de temas

- Preferencia: `'light' | 'dark' | 'system'` en `localStorage` (`fr.theme`), con copia en `users/{uid}.config.tema` porque en HD Crédit se vio que el `localStorage` puede perderse con actualizaciones del sistema.
- Un `<script>` mínimo **en el `<head>`** aplica `data-theme` en `<html>` antes de pintar (sin parpadeo blanco al abrir en modo oscuro).
- `system` sigue `matchMedia('(prefers-color-scheme: dark)')` y escucha cambios en vivo. Se actualiza también `<meta name="theme-color">` (barra de estado en Android/iOS).
- UI en **Configuración → Apariencia**: control segmentado ☀️ Claro · 🌙 Oscuro · ⚙️ Sistema.

Tokens (`css/themes.css`); ningún componente usa colores literales:

| Token | Claro | Oscuro |
|---|---|---|
| `--bg-primary` | `#F2F2F7` | `#0B0B0D` |
| `--bg-secondary` | `#FFFFFF` | `#151518` |
| `--surface` | `#FFFFFF` | `#1C1C1F` |
| `--surface-elevated` | `#FFFFFF` + sombra | `#26262A` |
| `--text-primary` | `#111114` | `#F2F2F5` |
| `--text-secondary` | `#6B6B73` | `#A1A1AA` |
| `--border` | `#E3E3E8` | `#2E2E33` |
| `--success` | `#1E8E3E` | `#34C759` |
| `--warning` | `#B26A00` | `#FFB340` |
| `--danger` | `#D70015` | `#FF6961` |
| `--accent` | `#4D7C0F` (lima oscuro) | `#9ACD32` (lima Code-Reset) |

En oscuro la jerarquía se da por **elevación** (superficies progresivamente más claras), no por sombras; nada de `#000` puro salvo la pantalla de login (marca). Los montos usan `font-variant-numeric: tabular-nums`; positivos/negativos se distinguen por signo **y** color (accesible para daltonismo). Contraste objetivo: AA (4.5:1 texto, 3:1 elementos grandes). Se verificarán todas las pantallas en ambos temas.

---

## I. Sistema de exportación

Flujo único para Excel, CSV y PDF:

```
Reportes / Dashboard  →  services/reportData.js  →  { resumen, movimientos, cajas, obligaciones, deudas, metas }
                                                      ├→ exportExcel.js  (ExcelJS)
                                                      ├→ exportCsv.js    (sin librería)
                                                      └→ exportPdf.js    (jsPDF + autotable)
```

Las pantallas solo llaman `exportarExcel({ mes: '2026-09' })`. Los cálculos vienen de `domain/`, nunca se recalculan en el exportador.

**Excel (`Finanzas_Reset_2026-09.xlsx`):**

| Hoja | Contenido | Formato |
|---|---|---|
| Resumen | periodo, saldo inicial, ingresos, gastos, transferencias, ahorro, deuda pagada, saldo final, flujo neto; mini-tabla por caja con barras de datos | título, moneda |
| Movimientos | Fecha · Tipo · Caja · Cuenta · Categoría · Monto · Nota | filtros, encabezado congelado, fila de totales `SUBTOTAL()` |
| Cajas | Caja · Saldo inicial · Ingresos · Gastos · Transferencias · Saldo final | totales `SUM()` |
| Obligaciones | Obligación · Caja · Fecha · Monto · Estado | filtros, estado con color |
| Deudas | Acreedor · Saldo inicial · Pagos · Saldo final · Fecha estimada | totales |
| Metas | Meta · Objetivo · Acumulado · Faltante · Aportación · Fecha estimada | % con formato |

- Moneda: `numFmt '"$"#,##0.00;[Red]-"$"#,##0.00'`; los montos se escriben como número (centavos / 100), no como texto.
- Fechas: celdas de fecha reales (`dd/mm/yyyy`) construidas a partir de `'YYYY-MM-DD'` sin desfase de zona horaria.
- Anchos de columna, encabezados con fondo, `autoFilter`, `views: [{ state: 'frozen', ySplit: 1 }]`.
- Las fórmulas de totales llevan además su valor calculado, para que se vea correcto aunque el visor no recalcule (vista previa de iOS).
- Descarga: Blob → `<a download>`; en PWA de iOS se ofrece `navigator.share({ files })`.

**CSV:** un archivo por tabla (movimientos por defecto), UTF-8 con BOM (para que Excel respete acentos), separador coma, montos con punto decimal.
**PDF:** reporte mensual (resumen + movimientos) con jsPDF + autotable; misma fuente de datos.
**Backup JSON:** `{ app:'finanzas-reset', schemaVersion, exportadoEn, uid, data:{ cajas, cuentas, categorias, movimientos(+historial), obligaciones, deudas, metas, presupuestos, recurrentes, escenarios, config } }`. Importación: validar estructura y versión → vista previa (conteos, conflictos de ID) → confirmación → escritura en lotes de ≤ 500 → recálculo de agregados. Nunca sobrescribe sin confirmar; por defecto *fusiona* (no toca IDs existentes).

---

## J. Plan de implementación

Cada fase termina con sus pruebas en verde, revisión de Angel, `CACHE_VERSION` actualizado y despliegue a GitHub Pages. No se avanza con errores críticos abiertos.

### Fase 0 — Preparación (Angel)
- Crear proyecto Firebase "finanzas-reset" (o indicar uno existente), activar Auth email/contraseña y Firestore, crear el usuario, pasar la `firebaseConfig`.
- Activar GitHub Pages en `Code-RESET/LADBFP`.

### Fase 1 — Base + movimientos
1. Reorganizar el boilerplate a la estructura de la sección C (login Code-Reset intacto).
2. `core/`: money, dates, validation, state, theme, errors, dom + **pruebas** (`tests/index.html`).
3. Firestore con caché offline; service worker con precache del SDK; manifest con ícono *maskable* propio.
4. Router con `import()` dinámico, cleanup, tabbar móvil / sidebar desktop.
5. Temas claro/oscuro/sistema + Configuración → Apariencia.
6. Componentes: toast, modal, confirmation, bottomSheet, loading/skeleton, emptyState, errorState, pagination, moneyInput.
7. Cajas y Cuentas (CRUD, desactivar en lugar de borrar si tienen movimientos).
8. Movimientos: ingreso, gasto, transferencia, apertura, ajuste; anular con motivo; historial; agregados en batch; aviso de duplicado; lista paginada con filtros.
9. Asistente de datos iniciales (cajas, cuentas, categorías, aperturas).
10. Dashboard v1: saldo total, saldo por caja (y por cuenta).
11. `firestore.rules` + índices + pruebas de reglas (emulador, opcional para dev).
12. Pruebas obligatorias de Fase 1: saldo (10,000 − 2,000 = 8,000), transferencia (A 7,000 / B 3,000 / patrimonio 10,000), paginación 10/25/50/100 con 300+ movimientos de prueba, modo oscuro en todas las pantallas, offline (registrar sin red → reconectar → sin duplicados), PWA instalable en Android e iOS.
13. `docs/PUBLICACION.md`.

### Fase 2 — Plan y flujo
Obligaciones (calendario, estados, pagar desde la ocurrencia) · Deudas · Recurrentes (ingresos esperados, ruta del sueldo) · Presupuesto real con déficit/cobertura · Comprometido y **Disponible real** en Dashboard · Próximos pagos (7 días) · Alertas · Flujo proyectado 7/30/90 días y 12 meses. Pruebas: déficit −521, deuda 5 pagos, comprometido/disponible (20,000 − 8,000 = 12,000).

### Fase 3 — Metas, análisis y exportación
Metas (con viabilidad) · Escenarios · Reportes con filtros · Excel (botón en Reportes y acción rápida en Dashboard) · CSV · PDF · Backup/Importación · Verificar saldos. Pruebas: meta 300,000 / 20,000 = 15 aportaciones con fecha, Excel (hojas, totales, formatos, fechas, montos, descarga en Android/iOS/desktop), restaurar backup en una cuenta vacía y comparar saldos.

### Fase futura (diseñado, no implementado)
Tarjetas de crédito (la cuenta tipo `credito` ya existe en el modelo: compra = gasto con cuenta tarjeta; pago al banco = transferencia débito → tarjeta, **no** gasto), notificaciones push, multiusuario.

---

## Anexo: decisiones pendientes

| # | Decisión | Propuesta por defecto |
|---|---|---|
| 1 | Presupuesto real deficitario (A4) | Se guarda como `deficitario` 🔴; solo cuenta como `sostenible` si el déficit está cubierto por una línea de cobertura explícita |
| 2 | Barra inferior móvil (F) | Inicio · Movimientos · **＋** · Plan · Más (Deudas dentro de Plan/Más) |
| 3 | Identidad visual (A16) | Login Code-Reset intacto; app estilo iOS con fuente del sistema y acento lima ajustado por tema |
| 4 | Horizonte de "comprometido" (E4) | 30 días, configurable |
| 5 | Gráfica en Excel (A15) | Barras de datos (formato condicional); sin gráfica nativa |
| 6 | Usuarios (A19) | Un solo usuario (Angel) |
| 7 | Datos faltantes | Montos y calendario de: préstamo Dra. Marcela, deuda esposa, electrodomésticos; montos de colegiatura, celular, cuota de casa; saldos actuales de cada cuenta |
| 8 | Firebase | ¿Proyecto nuevo "finanzas-reset" o uno existente? |

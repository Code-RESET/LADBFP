// ============================================================
// core/state.js
// Store mínimo con suscripción. Solo guarda catálogos pequeños
// (cajas, cuentas, categorías, agregados, config). Los
// movimientos NUNCA se cargan completos aquí: se paginan.
// ============================================================

const estadoInicial = () => ({
  user: null,
  cajas: [],
  cajasDesdeCache: true,  // true mientras el listado de cajas venga solo de la caché local
  cuentas: [],
  categorias: [],
  agregados: {},        // { 'YYYY-MM': doc } (en modo cuentas: vistos por cuenta, ver domain/saldos.js)
  agregadosCrudos: {},  // tal como están en Firestore (verificación y «Simplificar mi app»)
  obligaciones: [],
  deudas: [],
  recurrentes: [],
  presupuestos: [],
  metas: [],
  metasError: null,     // p. ej. si aún no se publican las reglas de Firebase con "metas"
  perfil: null,         // users/{uid}
  listo: { cajas: false, cuentas: false, categorias: false, agregados: false, perfil: false,
    obligaciones: false, deudas: false, recurrentes: false, presupuestos: false, metas: false },
  pendientesSync: false,
});

let estado = estadoInicial();
const oyentes = new Set();

export function getState() {
  return estado;
}

export function setState(parcial) {
  estado = { ...estado, ...parcial };
  oyentes.forEach((fn) => fn(estado));
}

export function marcarListo(clave) {
  setState({ listo: { ...estado.listo, [clave]: true } });
}

export function resetState() {
  estado = estadoInicial();
  oyentes.forEach((fn) => fn(estado));
}

/** Suscribe una función; devuelve la función para cancelar. */
export function subscribe(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export function catalogosListos() {
  const l = estado.listo;
  return l.cajas && l.cuentas && l.categorias && l.agregados && l.perfil;
}

export function planListo() {
  const l = estado.listo;
  return catalogosListos() && l.obligaciones && l.deudas && l.recurrentes && l.presupuestos;
}

// ---- Selectores ----
export const cajaPorId = (id) => estado.cajas.find((c) => c.id === id);
export const cuentaPorId = (id) => estado.cuentas.find((c) => c.id === id);
export const categoriaPorId = (id) => estado.categorias.find((c) => c.id === id);
export const cajasActivas = () => estado.cajas.filter((c) => c.activa !== false);
export const cuentasActivas = () => estado.cuentas.filter((c) => c.activa !== false);
/** Dónde hay dinero (débito, monedero, efectivo): sin las tarjetas de crédito. */
export const bancosActivos = () => cuentasActivas().filter((c) => c.tipo !== "credito");
export const tarjetasActivas = () => cuentasActivas().filter((c) => c.tipo === "credito");
/** v2.0: la app usa solo cuentas (cada cuenta es su propia caja; ver domain/convertir.js). */
export const modoCuentas = () => estado.perfil?.config?.modo === "cuentas";
/** En modo cuentas: ¿la cuenta es para gastar? (su caja no está marcada «No es para gastar»). */
export const cuentaParaGastar = (cuentaId) => (estado.cajas.find((c) => c.id === cuentaId)?.tipo || "operativa") === "operativa";
/** En modo cuentas, las cajas que se eligen en metas y presupuestos: las de los bancos (no las de las tarjetas). */
export const cajasElegibles = () => (modoCuentas()
  ? cajasActivas().filter((c) => !estado.cuentas.some((k) => k.id === c.id && k.tipo === "credito"))
  : cajasActivas());
export const categoriasActivas = (tipo) =>
  estado.categorias.filter((c) => c.activa !== false && (!tipo || c.tipo === tipo));

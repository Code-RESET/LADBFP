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
  agregados: {},        // { 'YYYY-MM': doc }
  obligaciones: [],
  deudas: [],
  recurrentes: [],
  presupuestos: [],
  perfil: null,         // users/{uid}
  listo: { cajas: false, cuentas: false, categorias: false, agregados: false, perfil: false,
    obligaciones: false, deudas: false, recurrentes: false, presupuestos: false },
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
export const categoriasActivas = (tipo) =>
  estado.categorias.filter((c) => c.activa !== false && (!tipo || c.tipo === tipo));

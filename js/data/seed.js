// ============================================================
// data/seed.js
// Datos iniciales (secciones 14, 34 y 41 del prompt maestro).
// IDs fijos: ejecutar la siembra dos veces no duplica nada.
// Los montos de ingreso/obligaciones se cargan en Fase 2
// (recurrentes, obligaciones, presupuesto); aquí solo catálogos.
// ============================================================

import { db, doc, writeBatch, serverTimestamp, rutaUsuario } from "./firestore.js";

export const SEED_VERSION = 1;

export const CUENTAS_INICIALES = [
  { id: "mercado-pago", nombre: "Mercado Pago", institucion: "Mercado Pago", tipo: "monedero", cajaPredeterminadaId: "reset-alarmas" },
  { id: "bbva-hd", nombre: "BBVA HD", institucion: "BBVA", tipo: "debito", cajaPredeterminadaId: "hd-credit" },
  { id: "hsbc", nombre: "HSBC", institucion: "HSBC", tipo: "debito", cajaPredeterminadaId: "personal-imss" },
  { id: "klar", nombre: "Klar", institucion: "Klar", tipo: "debito", cajaPredeterminadaId: "code-reset" },
  { id: "nu", nombre: "Nu", institucion: "Nu", tipo: "debito", cajaPredeterminadaId: "sueldo-personal" },
];

export const CAJAS_INICIALES = [
  { id: "reset-alarmas", nombre: "Reset Alarmas", tipo: "operativa", color: "#34C759", cuentaPredeterminadaId: "mercado-pago",
    descripcion: "Instalaciones, venta de equipo, alarmas, GPS, accesorios y servicios." },
  { id: "hd-credit", nombre: "HD Crédit", tipo: "operativa", color: "#0A84FF", cuentaPredeterminadaId: "bbva-hd",
    descripcion: "Cobranza quincenal. Destino: sueldo personal." },
  { id: "personal-imss", nombre: "Personal / IMSS", tipo: "operativa", color: "#FF9F0A", cuentaPredeterminadaId: "hsbc",
    descripcion: "Nómina IMSS: colegiatura, celular, cuota de casa y ahorro." },
  { id: "code-reset", nombre: "Code-Reset", tipo: "crecimiento", color: "#BF5AF2", cuentaPredeterminadaId: "klar",
    disponibleParaGasto: false, descripcion: "Venta de aplicaciones. Capital de crecimiento: no paga sueldo automáticamente." },
  { id: "sueldo-personal", nombre: "Sueldo personal", tipo: "operativa", color: "#FF375F", cuentaPredeterminadaId: "nu",
    descripcion: "Transferencias desde HD Crédit. Casa, salidas, comida y gastos personales." },
];

const cat = (tipo, id, nombre, extra = {}) => ({ id: `${tipo === "ingreso" ? "in" : "ga"}-${id}`, tipo, nombre, sistema: true, ...extra });

export const CATEGORIAS_INICIALES = [
  cat("ingreso", "sueldo", "Sueldo"),
  cat("ingreso", "instalaciones", "Instalaciones"),
  cat("ingreso", "venta-equipo", "Venta de equipo"),
  cat("ingreso", "cobranza", "Cobranza"),
  cat("ingreso", "software", "Software"),
  cat("ingreso", "prestamo-recibido", "Préstamo recibido", { esFinanciamiento: true }),
  cat("ingreso", "otros", "Otros ingresos"),
  cat("gasto", "casa", "Casa"),
  cat("gasto", "comida", "Comida"),
  cat("gasto", "transporte", "Transporte"),
  cat("gasto", "combustible", "Combustible"),
  cat("gasto", "entretenimiento", "Salidas / entretenimiento"),
  cat("gasto", "servicios", "Servicios"),
  cat("gasto", "educacion", "Educación"),
  cat("gasto", "negocio", "Negocio"),
  cat("gasto", "deudas", "Pago de deudas"),
  cat("gasto", "electrodomesticos", "Electrodomésticos"),
  cat("gasto", "otros", "Otros gastos"),
];

/** Crea cajas, cuentas y categorías iniciales en un solo batch (funciona offline). */
export function sembrarCatalogos(uid) {
  const batch = writeBatch(db);
  const base = { activa: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 1 };
  // El id va en la ruta del documento, no como campo.
  CUENTAS_INICIALES.forEach(({ id, ...c }, i) =>
    batch.set(doc(db, rutaUsuario(uid, "cuentas"), id), { ...base, orden: i, ...c }));
  CAJAS_INICIALES.forEach(({ id, ...c }, i) =>
    batch.set(doc(db, rutaUsuario(uid, "cajas"), id), { disponibleParaGasto: true, ...base, orden: i, ...c }));
  CATEGORIAS_INICIALES.forEach(({ id, ...c }, i) =>
    batch.set(doc(db, rutaUsuario(uid, "categorias"), id), { esFinanciamiento: false, ...base, orden: i, ...c }));
  batch.set(doc(db, "users", uid), { config: { seedVersion: SEED_VERSION }, updatedAt: serverTimestamp() }, { merge: true });
  return batch.commit();
}

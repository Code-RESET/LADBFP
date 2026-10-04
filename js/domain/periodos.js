// ============================================================
// domain/periodos.js
// Frecuencias y calendario: cuándo toca un pago, un ingreso o
// una transferencia programada. Funciones puras (sin Firebase).
//
// Regla de una frecuencia ({ frecuencia, ... }):
//   semanal        → diaSemana (0 = domingo … 6 = sábado)
//   quincenal      → los días 15 y último de cada mes
//   mensual        → diaMes (1–31; si el mes es más corto, el último día)
//   anual          → mes (1–12) + diaMes
//   personalizada  → cadaNDias, contando desde `desde`
// Todas aceptan `desde` (inicio) y `hasta` (fin, opcional).
// ============================================================

import { esFechaValida, sumarDias } from "../core/dates.js";

export const FRECUENCIAS = {
  semanal: "Semanal",
  quincenal: "Quincenal (15 y fin de mes)",
  mensual: "Mensual",
  anual: "Anual",
  personalizada: "Cada N días",
};

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const partes = (f) => f.split("-").map(Number);
const ultimoDiaDelMes = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const diaSemana = (f) => { const [a, m, d] = partes(f); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };
export const diasEntre = (desde, hasta) => {
  const [a1, m1, d1] = partes(desde);
  const [a2, m2, d2] = partes(hasta);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
};

/** ¿La fecha cae en una ocurrencia de la regla? */
export function tocaEn(regla, fecha) {
  if (!regla || !esFechaValida(fecha)) return false;
  if (regla.desde && fecha < regla.desde) return false;
  if (regla.hasta && fecha > regla.hasta) return false;
  const [a, m, d] = partes(fecha);
  const ultimo = ultimoDiaDelMes(a, m);
  switch (regla.frecuencia) {
    case "semanal": return diaSemana(fecha) === Number(regla.diaSemana);
    case "quincenal": return d === 15 || d === ultimo;
    case "mensual": return d === Math.min(Number(regla.diaMes), ultimo);
    case "anual": return m === Number(regla.mes) && d === Math.min(Number(regla.diaMes), ultimo);
    case "personalizada": {
      const n = Number(regla.cadaNDias);
      if (!(n > 0) || !regla.desde) return false;
      return diasEntre(regla.desde, fecha) % n === 0;
    }
    default: return false;
  }
}

/** Fechas ('YYYY-MM-DD') en que toca la regla entre `desde` y `hasta` (inclusive). */
export function ocurrencias(regla, desde, hasta) {
  const out = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    if (tocaEn(regla, f)) out.push(f);
  }
  return out;
}

/** Las próximas `n` fechas a partir de `desde` (busca hasta ~10 años). */
export function proximas(regla, desde, n = 1) {
  const out = [];
  let f = desde;
  for (let i = 0; i < 3700 && out.length < n; i++, f = sumarDias(f, 1)) {
    if (regla.hasta && f > regla.hasta) break;
    if (tocaEn(regla, f)) out.push(f);
  }
  return out;
}

/** Cuántas veces al mes ocurre en promedio (para comparar frecuencias). */
export function vecesAlMes(regla) {
  switch (regla?.frecuencia) {
    case "semanal": return 52 / 12;
    case "quincenal": return 2;
    case "mensual": return 1;
    case "anual": return 1 / 12;
    case "personalizada": return Number(regla.cadaNDias) > 0 ? 365 / 12 / Number(regla.cadaNDias) : 0;
    default: return 0;
  }
}

/** Monto mensual equivalente, redondeado al centavo (mitad hacia arriba). */
export function equivalenteMensual(montoCentavos, regla) {
  return Math.round(montoCentavos * vecesAlMes(regla));
}

/** Descripción legible: "Cada lunes", "El día 15 de cada mes"… */
export function describirRegla(regla) {
  switch (regla?.frecuencia) {
    case "semanal": return `Cada ${DIAS_SEMANA[Number(regla.diaSemana)]?.toLowerCase() ?? "semana"}`;
    case "quincenal": return "Los días 15 y último de cada mes";
    case "mensual": return `El día ${regla.diaMes} de cada mes`;
    case "anual": return `Cada año, el ${regla.diaMes}/${String(regla.mes).padStart(2, "0")}`;
    case "personalizada": return `Cada ${regla.cadaNDias} días`;
    default: return "";
  }
}

/** Valida los campos de una regla. Devuelve { campo: mensaje } (vacío si es válida). */
export function erroresRegla(regla) {
  const e = {};
  if (!FRECUENCIAS[regla?.frecuencia]) e.frecuencia = "Elige una frecuencia.";
  const entero = (v, min, max) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;
  if (regla?.frecuencia === "semanal" && !entero(regla.diaSemana, 0, 6)) e.diaSemana = "Elige el día de la semana.";
  if ((regla?.frecuencia === "mensual" || regla?.frecuencia === "anual") && !entero(regla.diaMes, 1, 31)) e.diaMes = "Día del 1 al 31.";
  if (regla?.frecuencia === "anual" && !entero(regla.mes, 1, 12)) e.mes = "Elige el mes.";
  if (regla?.frecuencia === "personalizada" && !entero(regla.cadaNDias, 1, 3650)) e.cadaNDias = "Escribe cada cuántos días.";
  if (!esFechaValida(regla?.desde)) e.desde = "Fecha de inicio inválida.";
  if (regla?.hasta && (!esFechaValida(regla.hasta) || regla.hasta < regla.desde)) e.hasta = "La fecha final debe ser posterior al inicio.";
  return e;
}

/** Periodo de presupuesto que contiene `fecha`: { inicio, fin, dias }. Semana de lunes a domingo. */
export function periodoDe(tipo, fecha) {
  const [a, m, d] = partes(fecha);
  if (tipo === "semanal") {
    const offset = (diaSemana(fecha) + 6) % 7; // lunes = 0
    const inicio = sumarDias(fecha, -offset);
    return { inicio, fin: sumarDias(inicio, 6), dias: 7 };
  }
  const ultimo = ultimoDiaDelMes(a, m);
  const mm = String(m).padStart(2, "0");
  if (tipo === "quincenal") {
    return d <= 15
      ? { inicio: `${a}-${mm}-01`, fin: `${a}-${mm}-15`, dias: 15 }
      : { inicio: `${a}-${mm}-16`, fin: `${a}-${mm}-${ultimo}`, dias: ultimo - 15 };
  }
  return { inicio: `${a}-${mm}-01`, fin: `${a}-${mm}-${String(ultimo).padStart(2, "0")}`, dias: ultimo };
}

// ============================================================
// core/dates.js
// La fecha contable se guarda como texto 'YYYY-MM-DD' en hora
// de México. Así un gasto del 31-oct a las 23:00 nunca "salta"
// a noviembre por la conversión a UTC.
// ============================================================

export const ZONA = "America/Mexico_City";

const partesHoy = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit",
});

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Fecha de hoy en México: '2026-10-01'. */
export function hoy(ahora = new Date()) {
  return partesHoy.format(ahora); // en-CA produce YYYY-MM-DD
}

/** '2026-10-01' -> '2026-10' */
export function mesDe(fecha) {
  return fecha.slice(0, 7);
}

export function esFechaValida(fecha) {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [a, m, d] = fecha.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function esMesValido(mes) {
  return typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

/** '2026-10' -> '2026-11' (para rangos: fecha >= inicio && fecha < siguiente). */
export function mesSiguiente(mes) {
  let [a, m] = mes.split("-").map(Number);
  m += 1;
  if (m === 13) { m = 1; a += 1; }
  return `${a}-${String(m).padStart(2, "0")}`;
}

/** '2026-01' -> '2025-12' */
export function mesAnterior(mes) {
  let [a, m] = mes.split("-").map(Number);
  m -= 1;
  if (m === 0) { m = 12; a -= 1; }
  return `${a}-${String(m).padStart(2, "0")}`;
}

/** Los últimos n meses terminando en `hasta` (inclusive), del más antiguo al más reciente. */
export function ultimosMeses(hasta, n) {
  const out = [hasta];
  while (out.length < n) out.unshift(mesAnterior(out[0]));
  return out;
}

/** '2026-10' -> 'oct' */
export function mesCorto(mes) {
  return MESES_CORTOS[Number(mes.slice(5, 7)) - 1];
}

export function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** '2026-10-01' -> '1 oct 2026' */
export function formatFecha(fecha) {
  if (!esFechaValida(fecha)) return "";
  const [a, m, d] = fecha.split("-").map(Number);
  return `${d} ${MESES_CORTOS[m - 1]} ${a}`;
}

/** Encabezado de grupo en listas: 'Hoy', 'Ayer' o 'jueves 1 de octubre'. */
export function etiquetaDia(fecha, referencia = hoy()) {
  if (fecha === referencia) return "Hoy";
  if (fecha === sumarDias(referencia, -1)) return "Ayer";
  const [a, m, d] = fecha.split("-").map(Number);
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  const anio = a === Number(referencia.slice(0, 4)) ? "" : ` ${a}`;
  return `${dia} ${d} de ${MESES[m - 1]}${anio}`;
}

/** '2026-10' -> 'octubre 2026' */
export function nombreMes(mes) {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

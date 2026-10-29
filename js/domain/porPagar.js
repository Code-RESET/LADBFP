// ============================================================
// domain/porPagar.js
// "Por pagar": lo vencido y lo que vence en los próximos días, para
// el aviso grande de Mi mes, el globo de la barra de arriba y el
// número en el ícono de la app. Junta:
//  - gastos fijos y deudas (y mensualidades a meses) sin pagar
//  - tarjetas de crédito con pago para no generar intereses
// Lo que se carga a una tarjeta (un gasto fijo con la tarjeta, la
// mensualidad de una compra a meses) no se repite: va dentro del
// pago de esa tarjeta.
// Urgencia: vencido · hoy · pronto (1 a 3 días) · semana (4 a 7).
// Funciones puras, probadas en tests/.
// ============================================================

import { sumarDias, nombreDia, formatFecha } from "../core/dates.js";
import { eventos } from "./compromisos.js";
import { diasEntre } from "./periodos.js";

export const DIAS_AVISO = 7;
const PESO = { vencido: 0, hoy: 1, pronto: 2, semana: 3 };

export const urgenciaDe = (dias) => (dias < 0 ? "vencido" : dias === 0 ? "hoy" : dias <= 3 ? "pronto" : "semana");

/**
 * [{ clave, tipo: 'fijo' | 'tarjeta', nombre, monto, fecha, dias, urgencia, evento?, cuenta?, estado? }]
 * ordenado de lo más urgente a lo menos. `tarjetas` = [{ cuenta, estado }] (services/tarjetas.js).
 */
export function porPagar({ obligaciones = [], deudas = [], agregados = {}, cuentas = [], tarjetas = [], hoy, dias = DIAS_AVISO }) {
  const esTarjeta = new Set(cuentas.filter((c) => c.tipo === "credito").map((c) => c.id));
  const conEstado = new Set(tarjetas.filter((t) => t.estado?.configurada).map((t) => t.cuenta.id));
  const hasta = sumarDias(hoy, dias);

  // Vencidos de hasta un mes atrás (lo más viejo ya no es un aviso útil).
  const fijos = eventos({ obligaciones, deudas, agregados, hoy, hasta, vencidasDesde: sumarDias(hoy, -31) })
    .filter((e) => e.clase === "obligacion" || e.clase === "deuda")
    .filter((e) => !(e.clase === "obligacion" && esTarjeta.has(e.ref.cuentaId)))
    .filter((e) => !(e.clase === "deuda" && e.ref.tarjetaId && conEstado.has(e.ref.tarjetaId)))
    .map((e) => {
      const d = diasEntre(hoy, e.fecha);
      const nombre = e.clase === "deuda" && e.ref.tarjetaId ? `${e.ref.descripcion || e.ref.acreedor} (a meses)` : e.nombre;
      return { clave: `${e.clase}:${e.ref.id}:${e.periodo}`, tipo: "fijo", nombre, monto: e.monto, fecha: e.fecha, dias: d, urgencia: urgenciaDe(d), evento: e };
    });

  const deTarjetas = tarjetas
    .filter((t) => t.estado?.configurada && t.estado.paraNoGenerarIntereses > 0)
    .map(({ cuenta, estado }) => {
      // Vencida: desde el pago que no se hizo (el corte anterior, este, o una mensualidad a meses).
      const fecha = estado.vencidaDesde || estado.fechaLimite;
      const d = diasEntre(hoy, fecha);
      return { clave: `tarjeta:${cuenta.id}:${estado.fechaLimite}`, tipo: "tarjeta", nombre: `Tarjeta ${cuenta.nombre}`, monto: estado.paraNoGenerarIntereses,
        fecha, dias: d, urgencia: urgenciaDe(d), cuenta, estado };
    })
    .filter((x) => x.dias <= dias);

  return [...fijos, ...deTarjetas].sort((a, b) => PESO[a.urgencia] - PESO[b.urgencia] || a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre, "es"));
}

/** { total, urgentes (vencido, hoy y pronto), vencidos, nivel: 'rojo' | 'naranja' | 'amarillo' | null } */
export function resumenPorPagar(lista = []) {
  const cuenta = (u) => lista.filter((x) => x.urgencia === u).length;
  const vencidos = cuenta("vencido");
  const hoy = cuenta("hoy");
  const pronto = cuenta("pronto");
  return {
    total: lista.reduce((a, x) => a + x.monto, 0),
    urgentes: vencidos + hoy + pronto,
    vencidos,
    nivel: !lista.length ? null : vencidos || hoy ? "rojo" : pronto ? "naranja" : "amarillo",
  };
}

const sinAnio = (f) => formatFecha(f).replace(/ \d{4}$/, "");

/** "Se venció hace 5 días (3 nov)" · "Vence HOY" · "Vence mañana" · "Vence el lunes 3" */
export function cuandoVence({ dias, fecha }) {
  if (dias < -1) return `Se venció hace ${-dias} días (${sinAnio(fecha)})`;
  if (dias === -1) return "Se venció ayer";
  if (dias === 0) return "Vence HOY";
  if (dias === 1) return "Vence mañana";
  return `Vence el ${nombreDia(fecha)} ${Number(fecha.slice(8))}`;
}

/** Título del aviso según lo más urgente. */
export function tituloPorPagar(lista = []) {
  const r = resumenPorPagar(lista);
  if (r.vencidos) return r.vencidos === 1 ? "¡Tienes un pago vencido!" : `¡Tienes ${r.vencidos} pagos vencidos!`;
  if (lista.some((x) => x.urgencia === "hoy")) return "Hoy tienes que pagar";
  if (r.urgentes) return r.urgentes === 1 ? "Se viene un pago" : `Se vienen ${r.urgentes} pagos`;
  return "Esta semana vence";
}

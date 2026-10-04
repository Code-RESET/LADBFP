// ============================================================
// domain/alertas.js
// Inteligencia financiera (sección 36): interpreta los datos y
// devuelve alertas ordenadas por gravedad. El Dashboard y Plan
// solo las pintan.
//   nivel: 'rojo' (actuar ya) | 'naranja' (atención) | 'info'
// ============================================================

import { formatMonto } from "../core/money.js";
import { formatFecha, sumarDias } from "../core/dates.js";
import { evaluarPresupuesto, PERIODOS_PRESUPUESTO } from "./presupuesto.js";
import { resumenDeuda } from "./compromisos.js";
import { equivalenteMensual } from "./periodos.js";

const ORDEN = { rojo: 0, naranja: 1, info: 2 };

export function generarAlertas({ hoy, cajas, cuentas = [], presupuestos = [], deudas = [], eventos = [],
  disponible, proyeccion, agregados }) {
  const out = [];
  const nombreCaja = (id) => cajas.find((c) => c.id === id)?.nombre || "una caja";

  // Presupuestos deficitarios
  for (const p of presupuestos.filter((x) => x.activa !== false)) {
    const ev = evaluarPresupuesto(p);
    if (ev.estado === "deficitario") {
      out.push({ nivel: "rojo", tipo: "deficit", ruta: "plan?tab=presupuesto",
        titulo: `Déficit ${PERIODOS_PRESUPUESTO[p.periodo].toLowerCase()}: -${formatMonto(ev.deficit)}`,
        texto: `«${p.nombre}» gasta más de lo que recibe. No cuenta en el disponible real hasta cubrirlo.` });
    }
  }

  // Pagos vencidos
  const vencidas = eventos.filter((e) => e.estado === "vencida");
  for (const e of vencidas) {
    out.push({ nivel: "rojo", tipo: "vencida", ruta: "plan?tab=pagos",
      titulo: `Vencido: ${e.nombre} ${formatMonto(e.monto)}`, texto: `Tocaba el ${formatFecha(e.fecha)} · ${nombreCaja(e.cajaId)}` });
  }

  // Cajas con disponible negativo
  for (const c of cajas.filter((x) => x.activa !== false)) {
    const d = disponible?.porCaja?.[c.id];
    if (d < 0) {
      out.push({ nivel: "rojo", tipo: "caja-deficit", ruta: "plan",
        titulo: `${c.nombre}: faltan ${formatMonto(-d)}`, texto: "Su saldo no alcanza para lo comprometido en los próximos 30 días." });
    }
  }

  // Cajas que quedarán en negativo según la proyección
  for (const [cajaId, fecha] of Object.entries(proyeccion?.primerNegativo || {})) {
    if (disponible?.porCaja?.[cajaId] < 0) continue; // ya avisado arriba
    out.push({ nivel: "naranja", tipo: "flujo-negativo", ruta: "plan",
      titulo: `${nombreCaja(cajaId)} quedará en negativo el ${formatFecha(fecha)}`, texto: "Según los ingresos y pagos programados." });
  }

  // Pagos próximos (7 días)
  const semana = sumarDias(hoy, 7);
  const proximos = eventos.filter((e) => (e.clase === "obligacion" || e.clase === "deuda") && e.estado !== "vencida" && e.fecha <= semana);
  if (proximos.length) {
    const total = proximos.reduce((a, e) => a + e.monto, 0);
    out.push({ nivel: "info", tipo: "proximos", ruta: "plan?tab=pagos",
      titulo: `${proximos.length} ${proximos.length === 1 ? "pago" : "pagos"} esta semana: ${formatMonto(total)}`, texto: "Revisa que cada caja tenga el dinero." });
  }

  // Deudas por terminar → dinero que se libera
  for (const dd of deudas.filter((x) => x.activa !== false)) {
    const r = resumenDeuda(dd, agregados, hoy);
    if (r.liquidada) continue;
    if (r.pagosRestantes > 0 && r.pagosRestantes <= 2) {
      out.push({ nivel: "info", tipo: "deuda-termina", ruta: "plan?tab=deudas",
        titulo: `${dd.acreedor}: ${r.pagosRestantes === 1 ? "último pago" : "quedan 2 pagos"}`,
        texto: `Al terminar se liberan ~${formatMonto(equivalenteMensual(dd.pagoCentavos, dd.regla))} al mes.` });
    }
  }

  // Cuentas sin caja predeterminada (informativo, decisión A3)
  const sinCaja = cuentas.filter((c) => c.activa !== false && !c.cajaPredeterminadaId);
  if (sinCaja.length) {
    out.push({ nivel: "info", tipo: "cuenta-sin-caja", ruta: "cuentas",
      titulo: `${sinCaja.length === 1 ? "1 cuenta" : `${sinCaja.length} cuentas`} sin caja predeterminada`,
      texto: sinCaja.map((c) => c.nombre).join(", ") });
  }

  return out.sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel]);
}

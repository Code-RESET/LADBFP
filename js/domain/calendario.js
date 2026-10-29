// ============================================================
// domain/calendario.js
// Avisos en el calendario del teléfono: un archivo .ics (RFC 5545)
// con un evento de todo el día que se repite por cada gasto fijo,
// deuda (hasta que se termina), compra a meses y tarjeta de crédito
// (en su fecha límite de pago). Cada uno trae dos alarmas: el día
// anterior y el mismo día, a las 9 de la mañana. Así el teléfono
// avisa aunque no abras la app.
// El UID es fijo por cada cosa: si vuelves a importar el archivo,
// el calendario actualiza los eventos en lugar de duplicarlos.
// Funciones puras, probadas en tests/.
// ============================================================

import { sumarDias, mesDe } from "../core/dates.js";
import { formatMonto } from "../core/money.js";
import { proximas } from "./periodos.js";
import { resumenDeuda } from "./compromisos.js";
import { tarjetaConfigurada, corteAnterior, corteSiguiente, fechaLimiteDe } from "./tarjetas.js";

const DIAS_ICS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Texto seguro para un valor del .ics. */
export const escaparTexto = (t) => String(t ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Parte una línea en renglones de máximo 75 bytes (los siguientes empiezan con un espacio), sin cortar acentos ni emojis. */
export function plegar(linea) {
  const bytes = (c) => new TextEncoder().encode(c).length;
  const partes = [];
  let actual = "";
  let largo = 0;
  for (const c of linea) {
    const b = bytes(c);
    const limite = partes.length ? 74 : 75; // los renglones de continuación llevan un espacio al inicio
    if (largo + b > limite) { partes.push(actual); actual = ""; largo = 0; }
    actual += c;
    largo += b;
  }
  partes.push(actual);
  return partes.join("\r\n ");
}

const fechaIcs = (f) => f.replace(/-/g, "");

/** "Día d de cada mes; si el mes es más corto, el último" (igual que la app). */
const porDiaDelMes = (d) => (d <= 28 ? `BYMONTHDAY=${d}` : `BYMONTHDAY=${Array.from({ length: d - 27 }, (_, i) => 28 + i).join(",")};BYSETPOS=-1`);

/** Regla de repetición del .ics para una regla de la app (o null si no se puede repetir). */
export function rruleDe(regla, { hasta = regla?.hasta, veces = null } = {}) {
  let r;
  switch (regla?.frecuencia) {
    case "mensual": r = `FREQ=MONTHLY;${porDiaDelMes(Number(regla.diaMes))}`; break;
    case "semanal": r = `FREQ=WEEKLY;BYDAY=${DIAS_ICS[Number(regla.diaSemana)]}`; break;
    case "quincenal": r = "FREQ=MONTHLY;BYMONTHDAY=15,-1"; break;
    case "anual": r = `FREQ=YEARLY;BYMONTH=${Number(regla.mes)};${porDiaDelMes(Number(regla.diaMes))}`; break;
    case "personalizada": r = `FREQ=DAILY;INTERVAL=${Number(regla.cadaNDias)}`; break;
    default: return null;
  }
  if (veces) return `${r};COUNT=${veces}`;
  if (hasta) return `${r};UNTIL=${fechaIcs(hasta)}`;
  return r;
}

const marcaUtc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function evento({ uid, inicio, rrule, resumen, descripcion, sello }) {
  const alarma = (trigger, texto) => ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escaparTexto(texto)}`, `TRIGGER:${trigger}`, "END:VALARM"];
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${sello}`,
    `DTSTART;VALUE=DATE:${fechaIcs(inicio)}`,
    `DTEND;VALUE=DATE:${fechaIcs(sumarDias(inicio, 1))}`,
    ...(rrule ? [`RRULE:${rrule}`] : []),
    `SUMMARY:${escaparTexto(resumen)}`,
    `DESCRIPTION:${escaparTexto(descripcion)}`,
    "TRANSP:TRANSPARENT",
    ...alarma("-PT15H", `Mañana vence: ${resumen}`), // 9:00 del día anterior
    ...alarma("PT9H", `Hoy vence: ${resumen}`),      // 9:00 del mismo día
    "END:VEVENT",
  ];
}

/** Próxima fecha límite de pago de una tarjeta, en o después de hoy. */
export function proximoPagoTarjeta(credito, hoy) {
  const actual = fechaLimiteDe(corteAnterior(credito, hoy), credito);
  return actual >= hoy ? actual : fechaLimiteDe(corteSiguiente(credito, hoy), credito);
}

/**
 * El archivo .ics con los avisos de pago. `ahora` (Date) para la marca de tiempo.
 * → { texto, cuantos, nombres: [...] }
 */
export function icsRecordatorios({ obligaciones = [], deudas = [], cuentas = [], agregados = {}, hoy, ahora = new Date() }) {
  const sello = marcaUtc(ahora);
  const tarjetas = cuentas.filter((c) => c.tipo === "credito" && c.activa !== false && tarjetaConfigurada(c));
  const conDias = new Set(tarjetas.map((t) => t.id));
  const credito = new Set(cuentas.filter((c) => c.tipo === "credito").map((c) => c.id));
  const eventos = [];

  // Gastos fijos (lo cargado a una tarjeta va dentro del pago de la tarjeta).
  for (const o of obligaciones.filter((x) => x.activa !== false && !credito.has(x.cuentaId))) {
    const inicio = proximas(o.regla, o.regla?.desde > hoy ? o.regla.desde : hoy, 1)[0];
    const rrule = inicio && rruleDe(o.regla);
    if (!rrule) continue;
    const monto = o.variable ? `hasta ${formatMonto(o.maximoCentavos || o.montoCentavos)}` : formatMonto(o.montoCentavos);
    eventos.push({ uid: `obligacion-${o.id}@finanzas-reset`, inicio, rrule, resumen: `💸 Pagar ${o.nombre} · ${monto}`,
      descripcion: "Gasto fijo de Finanzas Reset. Márcalo ☑ en Mi mes cuando lo pagues." });
  }

  // Deudas y compras a meses: hasta el último pago. Las de una tarjeta con fechas van en el pago de la tarjeta.
  for (const d of deudas.filter((x) => x.activa !== false && !(x.tarjetaId && conDias.has(x.tarjetaId)))) {
    const r = resumenDeuda(d, agregados, hoy);
    if (!r.saldoActual || !r.proximaFecha) continue;
    const rrule = rruleDe(d.regla, { veces: r.pagosRestantes });
    if (!rrule) continue;
    const nombre = d.tarjetaId ? `${d.descripcion || d.acreedor} (a meses)` : d.acreedor;
    eventos.push({ uid: `deuda-${d.id}@finanzas-reset`, inicio: r.proximaFecha, rrule, resumen: `💸 Pagar ${nombre} · ${formatMonto(d.pagoCentavos)}`,
      descripcion: `Te faltan ${r.pagosRestantes} ${r.pagosRestantes === 1 ? "pago" : "pagos"}. Márcalo ☑ en Mi mes cuando lo pagues.` });
  }

  // Tarjetas: cada mes en su fecha límite de pago.
  for (const t of tarjetas) {
    const inicio = proximoPagoTarjeta(t.credito, hoy);
    eventos.push({ uid: `tarjeta-${t.id}@finanzas-reset`, inicio, rrule: rruleDe({ frecuencia: "mensual", diaMes: t.credito.diaLimite }),
      resumen: `💳 Pagar tarjeta ${t.nombre}`,
      descripcion: "Paga lo que diga «Para no generar intereses» (Finanzas Reset → Tarjetas, o la app de tu banco) para no pagar intereses ni recargos." });
  }

  const lineas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CODE-RESET//Finanzas Reset//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Pagos · Finanzas Reset", "X-WR-TIMEZONE:America/Mexico_City",
    ...eventos.flatMap((e) => evento({ ...e, sello })),
    "END:VCALENDAR",
  ];
  return { texto: `${lineas.map(plegar).join("\r\n")}\r\n`, cuantos: eventos.length, nombres: eventos.map((e) => e.resumen), mes: mesDe(hoy) };
}

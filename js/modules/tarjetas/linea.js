// ============================================================
// modules/tarjetas/linea.js
// Qué hacer con una tarjeta ahora, en una línea (Tarjetas y Mi mes):
// "Paga $3,450 antes del 5 nov para no generar intereses".
// ============================================================

import { formatMonto } from "../../core/money.js";
import { formatFecha } from "../../core/dates.js";

const corto = (c) => formatMonto(c).replace(/\.00$/, "");

/**
 * Renglón de estado: qué hacer con la tarjeta ahora. { corto: true } para
 * un renglón de lista (Mi mes): sin año y sin la explicación.
 */
export function lineaEstado(e, { corto: breve = false } = {}) {
  const fecha = (f) => (breve ? formatFecha(f).replace(/ \d{4}$/, "") : formatFecha(f));
  if (!e) return { clase: "", texto: "Calculando…" };
  if (!e.configurada) {
    if (breve) return { clase: "", texto: "Falta su día de corte y de pago" };
    return { clase: "", texto: e.todo ? `Debes ${corto(e.todo)}. Agrega su día de corte y de pago para saber cuándo pagar.` : "Agrega su día de corte y de pago." };
  }
  if (e.estado === "vencida") {
    return { clase: "texto-peligro", texto: breve ? `Venció el ${fecha(e.fechaLimite)} · paga ${corto(e.paraNoGenerarIntereses)}`
      : `Venció el ${fecha(e.fechaLimite)}: paga ${corto(e.paraNoGenerarIntereses)} cuanto antes para no pagar intereses.` };
  }
  if (e.estado === "por-pagar") {
    const cuando = e.dias === 0 ? "hoy" : e.dias === 1 ? "mañana" : `antes del ${fecha(e.fechaLimite)}`;
    return { clase: e.dias <= 3 ? "texto-aviso" : "", texto: breve ? `Paga ${corto(e.paraNoGenerarIntereses)} ${cuando}` : `Paga ${corto(e.paraNoGenerarIntereses)} ${cuando} para no generar intereses.` };
  }
  if (e.estado === "al-corriente") {
    return { clase: "monto--positivo", texto: breve ? `✓ Al corriente · corte el ${fecha(e.proximoCorte)}`
      : `✓ Al corriente. Lo que compres hasta el ${fecha(e.proximoCorte)} lo pagas hasta el ${fecha(e.siguienteLimite)}.` };
  }
  if (e.msiPendiente) {
    return { clase: "monto--positivo", texto: breve ? "✓ Al corriente · solo compras a meses" : `✓ Al corriente. Solo te faltan tus compras a meses (${corto(e.msiPendiente)}).` };
  }
  return { clase: "monto--positivo", texto: breve ? "✓ No debes nada" : "✓ No debes nada." };
}

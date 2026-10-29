// ============================================================
// services/avisos.js
// El aviso de pagos que se ve en TODAS las pantallas: un globo rojo
// o naranja en la barra de arriba ("⚠ 2 por pagar") cuando algo ya
// venció o vence en 3 días o menos; al tocarlo lleva al aviso grande
// de Mi mes. También pone el número en el ícono de la app instalada
// (donde el teléfono lo permite: iPhone, computadora).
// Cálculo en domain/porPagar.js.
// ============================================================

import { getState, subscribe, catalogosListos, planListo } from "../core/state.js";
import { hoy } from "../core/dates.js";
import { porPagar, resumenPorPagar } from "../domain/porPagar.js";
import { estadosTarjetas } from "./tarjetas.js";

let cancelar = null;
let pedido = 0;

function ponerNumeroEnIcono(n) {
  try {
    if (n > 0) navigator.setAppBadge?.(n)?.catch?.(() => {});
    else navigator.clearAppBadge?.()?.catch?.(() => {});
  } catch { /* el navegador no lo permite */ }
}

/** `boton` = el globo de la barra de arriba; `irAPagos` lo lleva a Mi mes. */
export function iniciarAvisos(boton, irAPagos) {
  detenerAvisos();
  boton.onclick = irAPagos;

  async function actualizar() {
    const s = getState();
    if (!catalogosListos() || !planListo()) return;
    const n = ++pedido;
    let tarjetas = [];
    if (s.cuentas.some((c) => c.tipo === "credito")) {
      try { tarjetas = (await estadosTarjetas(s)).filter((x) => x.cuenta.activa !== false || x.estado.deudaTotal > 0); } catch { tarjetas = []; }
    }
    if (n !== pedido) return; // llegó un cálculo más nuevo
    const lista = porPagar({ obligaciones: s.obligaciones, deudas: s.deudas, agregados: s.agregados, cuentas: s.cuentas, tarjetas, hoy: hoy() });
    const r = resumenPorPagar(lista);
    if (!r.urgentes) {
      boton.hidden = true;
    } else {
      boton.hidden = false;
      boton.className = `aviso-pagos aviso-pagos--${r.nivel === "rojo" ? "rojo" : "naranja"}`;
      boton.textContent = `⚠ ${r.urgentes} por pagar`;
      boton.setAttribute("aria-label", r.vencidos ? `${r.vencidos} ${r.vencidos === 1 ? "pago vencido" : "pagos vencidos"}: ver qué pagar`
        : `${r.urgentes} ${r.urgentes === 1 ? "pago vence" : "pagos vencen"} pronto: ver qué pagar`);
    }
    ponerNumeroEnIcono(r.urgentes);
  }

  cancelar = subscribe(() => { actualizar(); });
  actualizar();
}

export function detenerAvisos() {
  cancelar?.();
  cancelar = null;
  pedido++;
  ponerNumeroEnIcono(0);
}

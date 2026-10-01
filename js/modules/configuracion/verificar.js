// ============================================================
// modules/configuracion/verificar.js
// "Verificar saldos": recalcula los agregados leyendo TODOS los
// movimientos (en lotes de 500) y los compara con los guardados.
// Si hay diferencias, permite repararlos. Es la red de seguridad
// de la regla "los saldos se calculan desde los movimientos".
// ============================================================

import { html, render } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { nombreMes } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, cajaPorId, cuentaPorId } from "../../core/state.js";
import { agregadosDesdeMovimientos } from "../../domain/movimientos.js";
import { diferenciasAgregados } from "../../domain/saldos.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { agregadosRepo } from "../../data/perfilRepo.js";
import { abrirCapa } from "../../components/modal.js";
import { confirmar } from "../../components/confirmation.js";
import { toast, toastError } from "../../components/toast.js";

export async function verificarSaldos(uid) {
  if (!navigator.onLine) {
    toastError("Conéctate a internet para verificar con todos tus movimientos.");
    return;
  }
  const capa = abrirCapa({ titulo: "Verificar saldos", contenido: html`<div data-v><p class="texto-sec">Leyendo movimientos…</p></div>` });
  const slot = capa.cuerpo.querySelector("[data-v]");

  try {
    const movs = [];
    await movimientosRepo.recorrerTodos(uid, (lote) => {
      movs.push(...lote);
      render(slot, html`<p class="texto-sec">Leyendo movimientos… ${movs.length}</p>`);
    });
    const calculados = agregadosDesdeMovimientos(movs);
    const guardados = getState().agregados;
    const difs = diferenciasAgregados(guardados, calculados);
    const activos = movs.filter((m) => m.estado !== "anulado").length;

    if (difs.length === 0) {
      render(slot, html`<p class="aviso aviso--ok">✓ Todo cuadra. ${activos} movimientos activos revisados; los saldos coinciden.</p>`);
      return;
    }
    const nombre = (d) => (d.dimension === "porCaja" ? cajaPorId(d.id) : cuentaPorId(d.id))?.nombre || d.id;
    render(slot, html`
      <p class="aviso aviso--error">Se encontraron ${difs.length} diferencias. Pueden deberse a ediciones simultáneas en dos dispositivos sin conexión.</p>
      <ul class="sublista">${difs.slice(0, 30).map((d) => html`<li>
        <span>${nombreMes(d.mes)} · ${nombre(d)}</span>
        <span>${formatMonto(d.guardado)} → <strong>${formatMonto(d.calculado)}</strong></span></li>`)}</ul>
      <button type="button" class="btn btn--primario btn--bloque" data-reparar>Reparar con los movimientos</button>`);
    slot.querySelector("[data-reparar]").addEventListener("click", async () => {
      const ok = await confirmar({
        titulo: "Reparar saldos",
        mensaje: "Se reemplazarán los totales guardados por los calculados desde tus movimientos. Los movimientos no se modifican.",
        botonConfirmar: "Reparar",
      });
      if (!ok) return;
      agregadosRepo.reemplazar(uid, calculados, Object.keys(guardados), {
        onError: (err) => toastError(mensajeDeError(err, "No se pudo reparar.")),
      });
      capa.cerrar();
      toast("✓ Saldos reparados");
    });
  } catch (err) {
    render(slot, html`<p class="aviso aviso--error">${mensajeDeError(err, "No se pudo completar la verificación.")}</p>`);
  }
}

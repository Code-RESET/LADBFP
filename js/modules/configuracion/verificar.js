// ============================================================
// modules/configuracion/verificar.js
// "Revisar mis datos": 1) diagnóstico de los datos (domain/
// diagnostico.js): cajas sin banco, saldos negativos, gastos fijos
// con cajas desactivadas…; 2) verificación de saldos: recalcula los agregados leyendo TODOS los
// movimientos (en lotes de 500) y los compara con los guardados.
// Si hay diferencias, permite repararlos. Es la red de seguridad
// de la regla "los saldos se calculan desde los movimientos".
// ============================================================

import { html, render } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { nombreMes } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { hoy } from "../../core/dates.js";
import { getState, cajaPorId, cuentaPorId } from "../../core/state.js";
import { diagnosticar } from "../../domain/diagnostico.js";
import { agregadosDesdeMovimientos } from "../../domain/movimientos.js";
import { diferenciasAgregados } from "../../domain/saldos.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { agregadosRepo } from "../../data/perfilRepo.js";
import { abrirCapa } from "../../components/modal.js";
import { confirmar } from "../../components/confirmation.js";
import { toast, toastError } from "../../components/toast.js";

const ICONO = { error: "✕", aviso: "!", info: "i" };

/** Hallazgos del diagnóstico (no necesita internet). */
function hallazgosHtml(hallazgos) {
  if (!hallazgos.length) return html`<p class="aviso aviso--ok">✓ Tus cajas, bancos y gastos fijos están bien configurados.</p>`;
  return html`<ul class="hallazgos">${hallazgos.map((h) => html`<li class="hallazgo hallazgo--${h.nivel}">
    <span class="hallazgo__icono" aria-hidden="true">${ICONO[h.nivel]}</span>
    <span class="hallazgo__texto"><strong>${h.titulo}</strong><span>${h.detalle}</span>
      ${h.ruta ? html`<a href="#/${h.ruta}" class="link">Ir a arreglarlo</a>` : ""}</span>
  </li>`)}</ul>`;
}

/** "Revisar mis datos": diagnóstico + verificación de saldos, en una sola hoja. */
export async function revisarDatos(uid) {
  const s = getState();
  const hallazgos = diagnosticar({ ...s, hoy: hoy() });
  const graves = hallazgos.filter((h) => h.nivel !== "info").length;
  const capa = abrirCapa({ titulo: "Revisar mis datos", contenido: html`<div class="revision">
    <p class="texto-sec">${graves ? `Encontré ${graves} ${graves === 1 ? "cosa" : "cosas"} por revisar.` : "Revisé tus cajas, bancos, gastos fijos y saldos."}</p>
    ${hallazgosHtml(hallazgos)}
    <h3 class="seccion__titulo">Saldos contra movimientos</h3>
    <div data-v></div>
  </div>` });
  await verificarSaldos(uid, capa.cuerpo.querySelector("[data-v]"), capa);
}

/** Recalcula los saldos con todos los movimientos y los compara. Se pinta en `slot`. */
export async function verificarSaldos(uid, slot, capa) {
  if (!navigator.onLine) {
    render(slot, html`<p class="texto-sec">Conéctate a internet para comparar con todos tus movimientos.</p>`);
    return;
  }
  render(slot, html`<p class="texto-sec">Leyendo movimientos…</p>`);

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
      render(slot, html`<p class="aviso aviso--ok">✓ Los saldos cuadran: revisé ${activos} movimientos.</p>`);
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

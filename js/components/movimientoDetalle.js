// ============================================================
// components/movimientoDetalle.js
// Detalle de un movimiento: datos, historial de auditoría y
// acciones (editar / anular). Nunca hay "eliminar": anular deja
// rastro con motivo y revierte su efecto en los saldos.
// ============================================================

import { html, render } from "../core/dom.js";
import { formatMonto } from "../core/money.js";
import { formatFecha } from "../core/dates.js";
import { mensajeDeError } from "../core/errors.js";
import { getState, cajaPorId, cuentaPorId, categoriaPorId } from "../core/state.js";
import { ETIQUETA_TIPO } from "../domain/movimientos.js";
import { movimientosRepo } from "../data/movimientosRepo.js";
import { abrirCapa } from "./modal.js";
import { confirmar } from "./confirmation.js";
import { toast, toastError } from "./toast.js";
import { abrirFormularioMovimiento } from "./movimientoForm.js";
import { conceptoMovimiento, signoMovimiento } from "./movimientoItem.js";
import { icon } from "./icons.js";

const nombre = (x) => x?.nombre ?? "—";

const ETIQUETA_CAMPO = {
  tipo: "Tipo", fecha: "Fecha", montoCentavos: "Monto", cajaId: "Caja", cuentaId: "Cuenta",
  cajaDestinoId: "Caja destino", cuentaDestinoId: "Cuenta destino", categoriaId: "Categoría",
  direccion: "Dirección", nota: "Nota", estado: "Estado",
};

function valorLegible(campo, v) {
  if (v == null || v === "") return "—";
  if (campo === "montoCentavos") return formatMonto(v);
  if (campo === "fecha") return formatFecha(v);
  if (campo === "cajaId" || campo === "cajaDestinoId") return nombre(cajaPorId(v));
  if (campo === "cuentaId" || campo === "cuentaDestinoId") return nombre(cuentaPorId(v));
  if (campo === "categoriaId") return nombre(categoriaPorId(v));
  if (campo === "tipo") return ETIQUETA_TIPO[v] || v;
  return String(v);
}

function filas(m) {
  const f = [
    ["Tipo", ETIQUETA_TIPO[m.tipo]],
    ["Fecha", formatFecha(m.fecha)],
  ];
  if (m.tipo === "transferencia") {
    f.push(["Desde", `${nombre(cajaPorId(m.cajaId))} · ${nombre(cuentaPorId(m.cuentaId))}`]);
    f.push(["Hacia", `${nombre(cajaPorId(m.cajaDestinoId))} · ${nombre(cuentaPorId(m.cuentaDestinoId))}`]);
  } else {
    f.push(["Caja", nombre(cajaPorId(m.cajaId))], ["Cuenta", nombre(cuentaPorId(m.cuentaId))]);
  }
  if (m.categoriaId) f.push(["Categoría", nombre(categoriaPorId(m.categoriaId))]);
  if (m.tipo === "ajuste") f.push(["Efecto", m.direccion === "salida" ? "Resta al saldo" : "Suma al saldo"]);
  if (m.nota) f.push(["Nota", m.nota]);
  if (m.estado === "anulado") f.push(["Anulado", m.anulacion?.motivo || "Sí"]);
  return f;
}

function historialHtml(items) {
  if (!items.length) return html`<p class="texto-sec">Sin cambios registrados.</p>`;
  const accion = { crear: "Creado", editar: "Editado", anular: "Anulado" };
  return html`<ol class="historial">${items.map((h) => html`<li>
    <strong>${accion[h.accion] || h.accion}</strong>
    <span class="texto-sec"> · ${new Date(h.ts).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</span>
    ${h.motivo ? html`<div class="texto-sec">Motivo: ${h.motivo}</div>` : ""}
    ${h.accion === "editar" ? html`<ul class="historial__cambios">${Object.entries(h.cambios || {}).map(([c, d]) => html`
      <li>${ETIQUETA_CAMPO[c] || c}: ${valorLegible(c, d.antes)} → ${valorLegible(c, d.despues)}</li>`)}</ul>` : ""}
  </li>`)}</ol>`;
}

export function abrirDetalleMovimiento(m) {
  const uid = getState().user?.uid;
  const signo = signoMovimiento(m);
  const anulado = m.estado === "anulado";
  const capa = abrirCapa({
    titulo: conceptoMovimiento(m),
    contenido: html`<div class="detalle-mov">
      <p class="detalle-mov__monto ${anulado ? "tachado" : ""}">${signo === 0 ? formatMonto(m.montoCentavos) : formatMonto(signo * m.montoCentavos, { signo: true })}</p>
      ${m._pendiente ? html`<p class="aviso">Pendiente de sincronizar con la nube.</p>` : ""}
      <dl class="lista-datos">${filas(m).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
      ${anulado ? "" : html`<div class="acciones">
        <button type="button" class="btn btn--secundario" data-accion="editar">${icon("editar", { size: 18 })} Editar</button>
        <button type="button" class="btn btn--peligro-suave" data-accion="anular">${icon("anular", { size: 18 })} Anular</button>
      </div>`}
      <details class="detalle-mov__historial">
        <summary>${icon("historial", { size: 18 })} Historial de cambios</summary>
        <div data-historial><p class="texto-sec">Cargando…</p></div>
      </details>
    </div>`,
  });

  const cuerpo = capa.cuerpo;
  cuerpo.querySelector("details").addEventListener("toggle", async (e) => {
    if (!e.target.open || e.target.dataset.cargado) return;
    e.target.dataset.cargado = "1";
    const slot = cuerpo.querySelector("[data-historial]");
    try {
      render(slot, historialHtml(await movimientosRepo.historial(uid, m.id)));
    } catch (err) {
      render(slot, html`<p class="texto-sec">${mensajeDeError(err, "No se pudo cargar el historial.")}</p>`);
    }
  });

  cuerpo.addEventListener("click", async (e) => {
    const accion = e.target.closest("[data-accion]")?.dataset.accion;
    if (accion === "editar") {
      capa.cerrar();
      // Esperar a que el historial procese el cierre antes de abrir la siguiente hoja.
      setTimeout(() => abrirFormularioMovimiento({ movimiento: m }), 60);
    } else if (accion === "anular") {
      const r = await confirmar({
        titulo: "Anular movimiento",
        mensaje: `Se revertirá su efecto en los saldos (${formatMonto(m.montoCentavos)}). Quedará visible en "Anulados" con el motivo.`,
        botonConfirmar: "Anular",
        peligro: true,
        pedirMotivo: true,
        etiquetaMotivo: "Motivo de la anulación",
      });
      if (!r) return;
      movimientosRepo.anular(uid, m, r.motivo, {
        onError: (err) => toastError(mensajeDeError(err, "No se pudo anular el movimiento.")),
      });
      capa.cerrar();
      toast("✓ Movimiento anulado");
    }
  });
  return capa;
}

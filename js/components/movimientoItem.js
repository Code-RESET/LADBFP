// ============================================================
// components/movimientoItem.js
// Fila de movimiento reutilizable (Dashboard, Movimientos).
// Móvil: fila tipo iOS. Desktop (≥1024px): columnas de tabla.
// ============================================================

import { html } from "../core/dom.js";
import { formatMonto } from "../core/money.js";
import { formatFecha, etiquetaDia } from "../core/dates.js";
import { cajaPorId, cuentaPorId, categoriaPorId } from "../core/state.js";
import { ETIQUETA_TIPO } from "../domain/movimientos.js";
import { icon } from "./icons.js";

const nombre = (x, alt = "—") => x?.nombre ?? alt;

/** Signo con el que se muestra el monto (efecto sobre el patrimonio). */
export function signoMovimiento(m) {
  if (m.tipo === "ingreso" || m.tipo === "apertura") return 1;
  if (m.tipo === "gasto") return -1;
  if (m.tipo === "ajuste") return m.direccion === "salida" ? -1 : 1;
  return 0; // transferencia: no cambia el patrimonio
}

export function conceptoMovimiento(m) {
  if (m.tipo === "ingreso" || m.tipo === "gasto") return nombre(categoriaPorId(m.categoriaId), ETIQUETA_TIPO[m.tipo]);
  return ETIQUETA_TIPO[m.tipo];
}

export function ubicacionMovimiento(m) {
  const caja = nombre(cajaPorId(m.cajaId));
  const cuenta = nombre(cuentaPorId(m.cuentaId));
  if (m.tipo !== "transferencia") return `${caja} · ${cuenta}`;
  const cajaD = nombre(cajaPorId(m.cajaDestinoId));
  const cuentaD = nombre(cuentaPorId(m.cuentaDestinoId));
  return m.cajaId === m.cajaDestinoId
    ? `${caja}: ${cuenta} → ${cuentaD}`
    : `${caja} → ${cajaD}`;
}

export function filaMovimiento(m) {
  const signo = signoMovimiento(m);
  const monto = signo === 0 ? formatMonto(m.montoCentavos) : formatMonto(signo * m.montoCentavos, { signo: true });
  const clase = signo > 0 ? "monto--positivo" : signo < 0 ? "monto--negativo" : "monto--neutro";
  const iconoTipo = m.tipo === "ajuste" ? "ajuste" : m.tipo;
  return html`<li>
    <button type="button" class="fila-mov ${m.estado === "anulado" ? "fila-mov--anulada" : ""}" data-mov="${m.id}">
      <span class="fila-mov__icono fila-mov__icono--${m.tipo}">${icon(iconoTipo, { size: 18 })}</span>
      <span class="fila-mov__texto">
        <span class="fila-mov__titulo">${conceptoMovimiento(m)}${m._pendiente ? html` <span class="badge badge--pendiente" title="Pendiente de sincronizar">Pendiente</span>` : ""}</span>
        <span class="fila-mov__sub">${ubicacionMovimiento(m)}${m.nota ? ` · ${m.nota}` : ""}</span>
      </span>
      <span class="fila-mov__fecha">${formatFecha(m.fecha)}</span>
      <span class="fila-mov__monto ${clase}">${monto}</span>
    </button>
  </li>`;
}

/** Lista agrupada por día: "Hoy", "Ayer", "jueves 1 de octubre". */
export function listaAgrupada(movs) {
  const grupos = [];
  for (const m of movs) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.fecha === m.fecha) ultimo.items.push(m);
    else grupos.push({ fecha: m.fecha, items: [m] });
  }
  return html`${grupos.map((g) => html`<section class="grupo-dia">
    <h3 class="grupo-dia__titulo">${etiquetaDia(g.fecha)}</h3>
    <ul class="lista">${g.items.map(filaMovimiento)}</ul>
  </section>`)}`;
}

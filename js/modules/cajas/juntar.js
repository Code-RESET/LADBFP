// ============================================================
// modules/cajas/juntar.js
// Hoja «Juntar con otra caja» (v1.13.0): eliges la caja buena (se
// sugiere la de nombre parecido), ves cómo quedará y con un toque
// todo lo de esta caja pasa a la otra; esta queda en $0 y
// desactivada. Movimientos en un solo batch y Deshacer.
// Cálculos en domain/juntar.js.
// ============================================================

import { html, render as renderHtml } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { hoy } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, cajaPorId, cuentaPorId, cajasActivas } from "../../core/state.js";
import { saldosPor, desgloseCaja } from "../../domain/saldos.js";
import { movimientosParaJuntar, cambiosParaJuntar, cajaParecida } from "../../domain/juntar.js";
import { esTarjeta } from "../../domain/tarjetas.js";
import { construirMovimiento } from "../../domain/movimientos.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { cajasRepo, cuentasRepo } from "../../data/catalogosRepo.js";
import { obligacionesRepo, deudasRepo, recurrentesRepo, metasRepo, presupuestosRepo } from "../../data/planRepo.js";
import { abrirCapa } from "../../components/modal.js";
import { toast, toastError } from "../../components/toast.js";
import { mostrarErrores } from "../../components/fields.js";
import { cuentaDeCaja } from "../../components/registroSimple.js";
import { olvidarEstados } from "../../services/tarjetas.js";

const onError = (err) => toastError(mensajeDeError(err, "No se pudo juntar las cajas."));
const REPOS = { obligaciones: obligacionesRepo, deudas: deudasRepo, recurrentes: recurrentesRepo, metas: metasRepo, presupuestos: presupuestosRepo };
const QUE = {
  obligaciones: ["gasto fijo", "gastos fijos"], deudas: ["deuda o compra a meses", "deudas o compras a meses"],
  recurrentes: ["ingreso o transferencia programada", "ingresos o transferencias programadas"], metas: ["meta", "metas"],
  presupuestos: ["presupuesto", "presupuestos"], cuentas: ["banco o tarjeta", "bancos o tarjetas"],
};

function guardar(uid, coleccion, datos, anterior) {
  if (coleccion === "cuentas") cuentasRepo.guardar(uid, datos, { onError });
  else REPOS[coleccion].guardar(uid, datos, { anterior, onError });
}

/** "Mercado Pago −$8,190.62" · "💳 Azul: debe $2,643.09" */
function renglon(d) {
  const cuenta = cuentaPorId(d.cuentaId);
  if (esTarjeta(cuenta)) return html`<li><span>💳 ${cuenta.nombre}</span><span>${d.saldo < 0 ? `debe ${formatMonto(-d.saldo)}` : `${formatMonto(d.saldo)} a favor`}</span></li>`;
  return html`<li><span>${cuenta?.nombre || "Banco borrado"}</span><span class="${d.saldo < 0 ? "monto--negativo" : ""}">${formatMonto(d.saldo)}</span></li>`;
}

/** "3 gastos fijos · 1 banco o tarjeta" */
const textoUsos = (cambios) => Object.entries(cambios.reduce((a, c) => ({ ...a, [c.coleccion]: (a[c.coleccion] || 0) + 1 }), {}))
  .map(([col, n]) => `${n} ${QUE[col][n === 1 ? 0 : 1]}`).join(" · ");

/** `alTerminar` se llama al juntar (p. ej. para cerrar la hoja de la caja que quedó debajo). */
export function abrirJuntar(caja, { alTerminar } = {}) {
  const uid = getState().user?.uid;
  if (!uid || !caja?.id) return null;
  const otras = cajasActivas().filter((c) => c.id !== caja.id);
  if (!otras.length) { toastError("No hay otra caja activa con cuál juntarla."); return null; }
  const s0 = getState();
  const porTamano = (a, b) => Math.abs(b.saldo) - Math.abs(a.saldo);
  const partes = desgloseCaja(s0.agregados, caja.id).sort(porTamano);
  const usos = cambiosParaJuntar({ deId: caja.id, aId: "_", ...s0 }).cambios;
  const sugerida = cajaParecida(caja, otras);

  const capa = abrirCapa({
    titulo: `Juntar «${caja.nombre}»`,
    contenido: html`<form class="form registro juntar" novalidate>
      <p class="campo__ayuda">Úsalo cuando tienes dos cajas para lo mismo. Todo lo de «${caja.nombre}» pasa a la caja que elijas y «${caja.nombre}» queda en $0 y desactivada. No cambia el dinero de tus bancos ni lo que debes, y no cuenta como gasto.</p>
      <div class="card card--suave">
        <p class="campo__label">Lo que tiene «${caja.nombre}»</p>
        ${partes.length ? html`<ul class="sublista">${partes.map(renglon)}</ul>` : html`<p class="texto-sec">Nada: está en $0 en todos sus bancos.</p>`}
        ${usos.length ? html`<p class="campo__ayuda">También la usan: ${textoUsos(usos)}.</p>` : ""}
      </div>
      <div class="campo"><span class="campo__label">¿Con cuál caja la juntas?</span>
        <div class="chips" role="radiogroup">${otras.map((c) => html`<label class="chip">
          <input type="radio" name="aId" value="${c.id}" ${c.id === sugerida ? "checked" : ""} />
          <span><i class="punto" style="background:${c.color || "var(--accent)"}"></i>${c.nombre}</span></label>`)}</div>
        <span class="campo__error" data-error="aId"></span></div>
      <div class="card juntar__resultado" data-resultado></div>
      <p class="campo__error" data-error="general"></p>
      <button type="submit" class="btn btn--primario btn--bloque" data-boton>Juntar</button>
    </form>`,
  });
  const form = capa.cuerpo.querySelector("form");
  const destino = () => form.querySelector('input[name="aId"]:checked')?.value || "";

  function plan(aId) {
    const s = getState();
    const bancoDeA = cuentaDeCaja(aId);
    return {
      bancoDeA,
      movs: movimientosParaJuntar({ agregados: s.agregados, deId: caja.id, aId, fecha: hoy(), nota: `Juntar «${caja.nombre}» con «${cajaPorId(aId)?.nombre}»` }),
      ...cambiosParaJuntar({ deId: caja.id, aId, bancoDeA, ...s }),
    };
  }

  // Así quedará la otra caja: sus bancos y tarjetas con lo de esta sumado.
  function pintarResultado() {
    const slot = form.querySelector("[data-resultado]");
    const aId = destino();
    form.querySelector("[data-boton]").textContent = aId ? `Juntar con ${cajaPorId(aId)?.nombre}` : "Juntar";
    if (!aId) { renderHtml(slot, html`<p class="texto-sec">Elige la caja que se queda.</p>`); return; }
    const s = getState();
    const suma = {};
    for (const d of [...desgloseCaja(s.agregados, aId), ...partes]) suma[d.cuentaId] = (suma[d.cuentaId] || 0) + d.saldo;
    const quedan = Object.entries(suma).filter(([, v]) => v !== 0).map(([cuentaId, saldo]) => ({ cuentaId, saldo })).sort(porTamano);
    const saldos = saldosPor(s.agregados, "porCaja");
    const total = (saldos[aId] || 0) + (saldos[caja.id] || 0);
    const p = plan(aId);
    const cambiaBanco = p.cambios.some((c) => ["obligaciones", "deudas", "recurrentes"].includes(c.coleccion)
      && (c.antes.cuentaId !== c.despues.cuentaId || c.antes.cuentaDestinoId !== c.despues.cuentaDestinoId));
    renderHtml(slot, html`<p class="campo__label">Así queda «${cajaPorId(aId)?.nombre}»</p>
      ${quedan.length ? html`<ul class="sublista">${quedan.map(renglon)}</ul>` : ""}
      <p class="juntar__total">Total <strong class="${total < 0 ? "monto--negativo" : ""}">${formatMonto(total)}</strong></p>
      ${cambiaBanco ? html`<p class="campo__ayuda">Sus gastos fijos y deudas se pagarán desde ${cuentaPorId(p.bancoDeA)?.nombre || "su banco"}.</p>` : ""}
      ${p.conflictos.length ? html`<p class="campo__ayuda texto-aviso">No se cambian (irían de una caja a la misma): ${p.conflictos.map((c) => c.item.nombre).join(", ")}. Revísalos después.</p>` : ""}`);
  }
  form.addEventListener("change", pintarResultado);
  pintarResultado();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const aId = destino();
    if (!aId) { mostrarErrores(form, { aId: "Elige la caja que se queda." }); return; }
    const destinoNombre = cajaPorId(aId)?.nombre || "la otra caja";
    const { movs, cambios } = plan(aId);
    const ids = movs.length ? movimientosRepo.crearVarios(uid, movs, { onError }) : [];
    for (const c of cambios) guardar(uid, c.coleccion, c.despues, c.antes);
    const estabaActiva = caja.activa !== false;
    if (estabaActiva) cajasRepo.activar(uid, caja.id, false, { onError });
    olvidarEstados();
    capa.cerrar();
    alTerminar?.();
    toast(`✓ «${caja.nombre}» quedó junto con «${destinoNombre}»`, {
      duracion: 8000,
      accion: {
        label: "Deshacer",
        onClick: () => {
          if (ids.length) movimientosRepo.anularVarios(uid, ids.map((id, i) => ({ id, ...construirMovimiento(movs[i]) })), "Deshecho: juntar cajas", { onError });
          for (const c of cambios) guardar(uid, c.coleccion, c.antes, c.despues);
          if (estabaActiva) cajasRepo.activar(uid, caja.id, true, { onError });
          olvidarEstados();
        },
      },
    });
  });
  return capa;
}

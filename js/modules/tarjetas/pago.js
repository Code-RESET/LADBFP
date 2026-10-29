// ============================================================
// modules/tarjetas/pago.js
// Pagar la tarjeta: eliges cuánto (para no generar intereses,
// todo o otra cantidad) y desde qué banco. Se guarda en un solo
// batch: las mensualidades a meses como gasto (la caja baja hoy) y
// el resto como transferencia banco → tarjeta en cada caja que
// debe (no es gasto: tus compras ya se restaron al hacerlas).
// También: pagar de una vez lo que falta de una compra a meses.
// ============================================================

import { html } from "../../core/dom.js";
import { parseMonto, centavosATexto, formatMonto } from "../../core/money.js";
import { hoy, formatFecha } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, cuentaPorId, bancosActivos } from "../../core/state.js";
import { repartirPago, movimientosDePago, etiquetaMsi } from "../../domain/tarjetas.js";
import { resumenDeuda } from "../../domain/compromisos.js";
import { validarMovimiento, construirMovimiento } from "../../domain/movimientos.js";
import { saldosPor } from "../../domain/saldos.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { abrirCapa } from "../../components/modal.js";
import { toast, toastError } from "../../components/toast.js";
import { mostrarErrores, leerLocal, guardarLocal } from "../../components/fields.js";
import { olvidarEstados } from "../../services/tarjetas.js";

const onError = (err) => toastError(mensajeDeError(err, "No se pudo registrar el pago."));
const uid = () => getState().user?.uid;
const CLAVE_BANCO = (id) => `fr.tarjeta.banco.${id}`;
const valorRadio = (form, nombre) => form.querySelector(`input[name="${nombre}"]:checked`)?.value || "";

/** Banco sugerido: el último con que pagaste esta tarjeta; si no, el que tiene más dinero. */
function bancoSugerido(tarjetaId) {
  const bancos = bancosActivos();
  const ultimo = leerLocal(CLAVE_BANCO(tarjetaId), "");
  if (bancos.some((b) => b.id === ultimo)) return ultimo;
  const saldos = saldosPor(getState().agregados, "porCuenta");
  return [...bancos].sort((a, b) => (saldos[b.id] || 0) - (saldos[a.id] || 0))[0]?.id || "";
}

const chipsBancos = (seleccion) => html`<div class="chips" role="radiogroup">${bancosActivos().map((b) => html`<label class="chip">
  <input type="radio" name="bancoId" value="${b.id}" ${b.id === seleccion ? "checked" : ""} /><span>${b.nombre}</span></label>`)}</div>`;

/** Guarda varios movimientos juntos con "Deshacer". */
function registrar(movs, mensaje) {
  const ids = movimientosRepo.crearVarios(uid(), movs, { onError });
  olvidarEstados();
  toast(mensaje, {
    duracion: 6000,
    accion: { label: "Deshacer", onClick: () => movimientosRepo.anularVarios(uid(), ids.map((id, i) => ({ id, ...construirMovimiento(movs[i]) })), "Deshecho al pagar la tarjeta", { onError }) },
  });
}

/** `e` = estado de la tarjeta (domain/tarjetas.js → estadoTarjeta). */
export function abrirPagoTarjeta(tarjeta, e) {
  if (!bancosActivos().length) { toastError("Primero agrega el banco desde el que pagas (Más → Bancos)."); return null; }
  const sugerido = e.paraNoGenerarIntereses || e.todo;
  const opciones = [
    e.paraNoGenerarIntereses && e.paraNoGenerarIntereses !== e.todo ? { id: "intereses", label: "Para no generar intereses", monto: e.paraNoGenerarIntereses } : null,
    e.todo ? { id: "todo", label: "Todo lo que debes", monto: e.todo } : null,
  ].filter(Boolean);
  const capa = abrirCapa({
    titulo: `Pagar ${tarjeta.nombre}`,
    contenido: html`<form class="form registro pago-tarjeta" novalidate>
      ${e.configurada && e.paraNoGenerarIntereses ? html`<div class="card card--suave">
        <p class="pago-tarjeta__titulo">Para no generar intereses: <strong>${formatMonto(e.paraNoGenerarIntereses)}</strong></p>
        <p class="campo__ayuda">${e.estado === "vencida" ? `Venció el ${formatFecha(e.vencidaDesde || e.fechaLimite)}: págalo cuanto antes.` : `Antes del ${formatFecha(e.fechaLimite)}.`}</p>
        <ul class="sublista">
          ${e.pendienteCorte ? html`<li><span>Lo que debías al corte del ${formatFecha(e.corte)}</span><span>${formatMonto(e.pendienteCorte)}</span></li>` : ""}
          ${e.cuotas.map((c) => html`<li><span>${c.deuda.descripcion || c.deuda.acreedor} · ${etiquetaMsi(c.deuda, c.periodo)}</span><span>${formatMonto(c.monto)}</span></li>`)}
        </ul>
        ${e.paraElSiguiente ? html`<p class="campo__ayuda">Lo que compraste después del corte (${formatMonto(e.paraElSiguiente)}) lo pagas hasta el siguiente.</p>` : ""}
      </div>` : ""}

      <label class="monto-grande"><span class="monto-grande__signo">$</span>
        <input name="monto" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${sugerido ? centavosATexto(sugerido) : ""}" aria-label="¿Cuánto pagas?" /></label>
      <span class="campo__error campo__error--centro" data-error="montoCentavos"></span>
      ${opciones.length > 1 ? html`<div class="chips chips--centro">${opciones.map((o) => html`<button type="button" class="chip-boton" data-monto="${o.monto}">
        ${o.label} · ${formatMonto(o.monto)}</button>`)}</div>` : ""}

      <div class="campo"><span class="campo__label">¿Desde qué banco pagas?</span>
        ${chipsBancos(bancoSugerido(tarjeta.id))}
        <span class="campo__error" data-error="bancoId"></span></div>
      <p class="campo__ayuda">No cuenta como gasto: tus compras ya se restaron de cada caja cuando las hiciste. Solo baja el dinero del banco y lo que debes${e.cuotas.length ? " (las mensualidades a meses sí cuentan como gasto de este mes)" : ""}.</p>

      <p class="campo__error" data-error="general"></p>
      <button type="submit" class="btn btn--primario btn--bloque">Registrar pago</button>
    </form>`,
  });
  const form = capa.cuerpo.querySelector("form");
  form.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-monto]");
    if (b) form.monto.value = centavosATexto(Number(b.dataset.monto));
  });
  form.monto.addEventListener("blur", () => { const v = parseMonto(form.monto.value); if (v != null) form.monto.value = centavosATexto(v); });

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const monto = parseMonto(form.monto.value);
    const bancoId = valorRadio(form, "bancoId");
    const errores = {};
    if (!(monto > 0)) errores.montoCentavos = "Escribe cuánto pagas.";
    else if (monto > e.todo) errores.montoCentavos = e.todo ? `Lo más que debes ahora es ${formatMonto(e.todo)}.` : "No debes nada en esta tarjeta.";
    if (!bancoId) errores.bancoId = "Elige el banco.";
    if (Object.keys(errores).length) { mostrarErrores(form, errores); return; }
    const reparto = repartirPago({ monto, cuotas: e.cuotas, porCaja: e.porCaja });
    const movs = movimientosDePago({ tarjeta, bancoId, fecha: hoy(), reparto });
    const malo = movs.map((m) => validarMovimiento(m)).find((v) => !v.ok);
    if (malo || reparto.sobrante) { mostrarErrores(form, { general: malo ? Object.values(malo.errores)[0] : "Revisa el monto." }); return; }
    guardarLocal(CLAVE_BANCO(tarjeta.id), bancoId);
    registrar(movs, `✓ Pagaste ${formatMonto(monto)} a ${tarjeta.nombre} desde ${cuentaPorId(bancoId)?.nombre || "tu banco"}`);
    capa.cerrar();
  });
  return capa;
}

/** Pagar de una vez todo lo que falta de una compra a meses (gasto vinculado a su deuda, sin periodo). */
export function abrirLiquidarMsi(plan) {
  const r = resumenDeuda(plan, getState().agregados, hoy());
  if (!(r.saldoActual > 0)) return null;
  if (!bancosActivos().length) { toastError("Primero agrega el banco desde el que pagas (Más → Bancos)."); return null; }
  const capa = abrirCapa({
    titulo: `Terminar de pagar «${plan.descripcion}»`,
    contenido: html`<form class="form registro" novalidate>
      <p class="pago-tarjeta__titulo">Falta: <strong>${formatMonto(r.saldoActual)}</strong> (${r.pagosRestantes} ${r.pagosRestantes === 1 ? "mensualidad" : "mensualidades"})</p>
      <div class="campo"><span class="campo__label">¿Desde qué banco pagas?</span>
        ${chipsBancos(bancoSugerido(plan.tarjetaId))}
        <span class="campo__error" data-error="bancoId"></span></div>
      <p class="campo__ayuda">Cuenta como gasto de hoy en la caja que la paga, y la compra queda liquidada.</p>
      <p class="campo__error" data-error="general"></p>
      <button type="submit" class="btn btn--primario btn--bloque">Pagar ${formatMonto(r.saldoActual)}</button>
    </form>`,
  });
  const form = capa.cuerpo.querySelector("form");
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const bancoId = valorRadio(form, "bancoId");
    if (!bancoId) { mostrarErrores(form, { bancoId: "Elige el banco." }); return; }
    const mov = {
      tipo: "gasto", fecha: hoy(), montoCentavos: r.saldoActual, cajaId: plan.cajaId, cuentaId: bancoId,
      categoriaId: plan.categoriaId || "ga-deudas", nota: `${plan.descripcion} (liquidación)`, deudaId: plan.id,
    };
    const v = validarMovimiento(mov);
    if (!v.ok) { mostrarErrores(form, { general: Object.values(v.errores)[0] }); return; }
    guardarLocal(CLAVE_BANCO(plan.tarjetaId), bancoId);
    registrar([mov], `✓ «${plan.descripcion}» liquidada`);
    capa.cerrar();
  });
  return capa;
}

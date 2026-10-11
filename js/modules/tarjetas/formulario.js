// ============================================================
// modules/tarjetas/formulario.js
// Hojas de Tarjetas de crédito:
//   abrirTarjeta    crear / editar (nombre, día de corte, día
//                   límite de pago, límite de crédito y, al crearla,
//                   cuánto debes hoy y qué caja lo paga)
//   abrirCompraMsi  compra a meses sin intereses (nueva o una que
//                   ya tenías): se guarda como deuda de la tarjeta
// ============================================================

import { html } from "../../core/dom.js";
import { parseMonto, centavosATexto, formatMonto } from "../../core/money.js";
import { hoy, formatFecha, nombreMes } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, cajaPorId, cuentaPorId, cajasActivas, tarjetasActivas, categoriasActivas } from "../../core/state.js";
import {
  validarTarjeta, validarMsi, deudaDeMsi, planMsi, ajusteDeudaInicial, etiquetaMsi, fechaConDia, sumarMeses, MESES_MSI,
} from "../../domain/tarjetas.js";
import { pagadoDeuda, resumenDeuda } from "../../domain/compromisos.js";
import { categoriaSugerida } from "../../domain/mes.js";
import { tieneMovimientos } from "../../domain/saldos.js";
import { cuentasRepo } from "../../data/catalogosRepo.js";
import { deudasRepo } from "../../data/planRepo.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { abrirCapa } from "../../components/modal.js";
import { confirmar } from "../../components/confirmation.js";
import { toast, toastError } from "../../components/toast.js";
import { segmentado, mostrarErrores } from "../../components/fields.js";
import { cuentaDeCaja } from "../../components/registroSimple.js";

const onError = (err) => toastError(mensajeDeError(err, "No se pudo guardar."));
const uid = () => getState().user?.uid;
const valorRadio = (form, nombre) => form.querySelector(`input[name="${nombre}"]:checked`)?.value || "";
const montoTxt = (c) => (c ? centavosATexto(c) : "");
const cajaInicial = () => (cajasActivas().find((c) => c.tipo === "operativa") || cajasActivas()[0])?.id || "";

/** Chips de caja (con el banco donde tiene su dinero), como en el registro rápido. */
export const chipsCajas = (nombre, seleccion) => html`<div class="chips" role="radiogroup">${cajasActivas().map((c) => html`<label class="chip">
  <input type="radio" name="${nombre}" value="${c.id}" ${c.id === seleccion ? "checked" : ""} />
  <span><i class="punto" style="background:${c.color || "var(--accent)"}"></i>${c.nombre}${cuentaPorId(cuentaDeCaja(c.id))
    ? html`<small class="chip__banco"> · ${cuentaPorId(cuentaDeCaja(c.id)).nombre}</small>` : ""}</span></label>`)}</div>`;

// ---------------- Tarjeta ----------------

export function abrirTarjeta(tarjeta = {}) {
  const editando = !!tarjeta.id;
  const c = tarjeta.credito || {};
  const capa = abrirCapa({
    titulo: editando ? tarjeta.nombre : "Nueva tarjeta de crédito",
    contenido: html`<form class="form registro" data-deuda="no" novalidate>
      <label class="campo"><span class="campo__label">Nombre de la tarjeta</span>
        <input name="nombre" maxlength="40" value="${tarjeta.nombre || ""}" placeholder="Ej. Liverpool, Nu, BBVA Azul" autocomplete="off" />
        <span class="campo__error" data-error="nombre"></span></label>

      <div class="fila-2">
        <label class="campo"><span class="campo__label">Día de corte</span>
          <input name="diaCorte" type="number" inputmode="numeric" min="1" max="31" value="${c.diaCorte || ""}" placeholder="Ej. 15" />
          <span class="campo__error" data-error="diaCorte"></span></label>
        <label class="campo"><span class="campo__label">Día límite de pago</span>
          <input name="diaLimite" type="number" inputmode="numeric" min="1" max="31" value="${c.diaLimite || ""}" placeholder="Ej. 5" />
          <span class="campo__error" data-error="diaLimite"></span></label>
      </div>
      <p class="campo__ayuda">Vienen en tu estado de cuenta. Con ellos la app sabe cuánto pagar para no generar intereses.</p>

      <label class="campo"><span class="campo__label">Límite de crédito (opcional)</span>
        <input name="limite" inputmode="decimal" autocomplete="off" value="${montoTxt(c.limiteCentavos)}" placeholder="$0.00" />
        <span class="campo__error" data-error="limiteCentavos"></span></label>

      ${editando ? "" : html`<label class="campo"><span class="campo__label">¿Cuánto debes hoy? (opcional)</span>
          <input name="deuda" inputmode="decimal" autocomplete="off" placeholder="$0.00" />
          <span class="campo__ayuda">Sin contar tus compras a meses: esas se agregan después, una por una.</span>
          <span class="campo__error" data-error="deudaCentavos"></span></label>
        <div class="campo solo-deuda"><span class="campo__label">¿Qué caja va a pagar esa deuda?</span>
          ${chipsCajas("cajaDeudaId", cajaInicial())}
          <span class="campo__error" data-error="cajaDeudaId"></span></div>`}

      <p class="campo__error" data-error="general"></p>
      <button type="submit" class="btn btn--primario btn--bloque">${editando ? "Guardar cambios" : "Agregar tarjeta"}</button>
      ${editando ? html`<div class="registro__extra">
        <button type="button" class="btn-texto" data-accion="activar">${tarjeta.activa === false ? "Activar tarjeta" : "Desactivar tarjeta"}</button>
        <button type="button" class="btn-texto texto-peligro" data-accion="eliminar">Eliminar</button>
      </div>` : ""}
    </form>`,
  });
  const form = capa.cuerpo.querySelector("form");
  const montoDe = (input) => (input?.value.trim() ? parseMonto(input.value) : null);
  for (const n of ["limite", "deuda"]) {
    form[n]?.addEventListener("blur", () => { const v = parseMonto(form[n].value); if (v != null) form[n].value = centavosATexto(v); });
  }
  form.deuda?.addEventListener("input", () => { form.dataset.deuda = montoDe(form.deuda) > 0 ? "si" : "no"; });

  form.addEventListener("click", async (e) => {
    const accion = e.target.closest("[data-accion]")?.dataset.accion;
    if (accion === "activar") {
      const activar = tarjeta.activa === false;
      if (!activar && !(await confirmar({ titulo: `¿Desactivar ${tarjeta.nombre}?`,
        mensaje: "Ya no aparecerá al registrar gastos. Lo que debes y su historial se conservan.", botonConfirmar: "Desactivar" }))) return;
      cuentasRepo.activar(uid(), tarjeta.id, activar, { onError });
      capa.cerrar();
      toast(activar ? `✓ ${tarjeta.nombre} activada` : `✓ ${tarjeta.nombre} desactivada`);
    } else if (accion === "eliminar") {
      const s = getState();
      if (tieneMovimientos(s.agregados, "porCuenta", tarjeta.id) || s.deudas.some((d) => d.tarjetaId === tarjeta.id)) {
        await confirmar({ titulo: "No se puede eliminar", botonConfirmar: "Entendido",
          mensaje: "Esta tarjeta tiene compras o pagos registrados. Para que tus saldos sigan cuadrando, desactívala en lugar de eliminarla." });
        return;
      }
      if (!(await confirmar({ titulo: `¿Eliminar ${tarjeta.nombre}?`, mensaje: "No tiene movimientos.", botonConfirmar: "Eliminar", peligro: true }))) return;
      cuentasRepo.eliminar(uid(), tarjeta.id, { onError });
      capa.cerrar();
      toast("✓ Tarjeta eliminada");
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const s = getState();
    const limiteCentavos = montoDe(form.limite);
    const datos = {
      id: tarjeta.id,
      nombre: form.nombre.value.trim(),
      limiteCentavos: form.limite.value.trim() ? limiteCentavos ?? -1 : null,
      diaCorte: Number(form.diaCorte.value),
      diaLimite: Number(form.diaLimite.value),
      deudaCentavos: form.deuda?.value.trim() ? montoDe(form.deuda) ?? -1 : 0,
      cajaDeudaId: form.cajaDeudaId ? valorRadio(form, "cajaDeudaId") : "",
    };
    const { ok, errores } = validarTarjeta(datos, s.cuentas);
    if (!ok) { mostrarErrores(form, errores); return; }
    const credito = { limiteCentavos: datos.limiteCentavos, diaCorte: datos.diaCorte, diaLimite: datos.diaLimite };
    const id = cuentasRepo.guardar(uid(), {
      id: tarjeta.id, nombre: datos.nombre, institucion: tarjeta.institucion || datos.nombre, tipo: "credito", credito,
      ...(editando ? {} : { activa: true, orden: s.cuentas.length }),
    }, { onError });
    if (datos.deudaCentavos > 0) {
      movimientosRepo.crear(uid(), ajusteDeudaInicial({ tarjeta: { id, nombre: datos.nombre, credito }, cajaId: datos.cajaDeudaId,
        montoCentavos: datos.deudaCentavos, hoy: hoy() }), { onError, origen: "inicial" });
    }
    capa.cerrar();
    toast(editando ? "✓ Tarjeta actualizada" : `✓ Tarjeta ${datos.nombre} agregada${datos.deudaCentavos ? ` · debes ${formatMonto(datos.deudaCentavos)}` : ""}`);
  });
  if (!editando) form.nombre.focus();
  return capa;
}

// ---------------- Compra a meses ----------------

/** Texto "12 pagos de $1,000 · el primero el 5 dic 2026 · terminas en nov 2027". */
export function resumenPlan({ montoCentavos, meses, pagadas = 0, fechaCompra, credito }) {
  if (!(montoCentavos > 0) || !(meses >= 2) || !(pagadas >= 0) || pagadas >= meses || !fechaCompra) return "";
  const p = planMsi({ montoCentavos, meses, credito, fechaCompra, pagadas });
  const faltan = meses - pagadas;
  const ultima = fechaConDia(sumarMeses(p.regla.desde.slice(0, 7), faltan - 1), p.regla.diaMes);
  const pagos = faltan === meses ? `${meses} pagos` : `Faltan ${faltan} pagos`;
  return `${pagos} de ${formatMonto(p.pagoCentavos)} · el ${pagadas ? "siguiente" : "primero"} el ${formatFecha(p.regla.desde)} · terminas en ${nombreMes(ultima.slice(0, 7))}`;
}

/**
 * Nueva compra a meses (`plan` sin id; puede traer tarjetaId) o editar una.
 * Con pagos registrados ya no se cambia el precio ni los meses.
 */
export function abrirCompraMsi(plan = {}) {
  const editando = !!plan.id;
  const s = getState();
  const tarjetas = tarjetasActivas();
  if (!editando && !tarjetas.length) { toastError("Primero agrega una tarjeta de crédito."); return null; }
  const pagado = editando ? pagadoDeuda(s.agregados, plan.id) : 0;
  const resumen = editando ? resumenDeuda(plan, s.agregados, hoy()) : null;
  const fijo = editando && pagado > 0;
  const tarjetaId = plan.tarjetaId || tarjetas[0]?.id;
  const meses = plan.meses || 12;
  const capa = abrirCapa({
    titulo: editando ? plan.descripcion || "Compra a meses" : "Compra a meses sin intereses",
    contenido: html`<form class="form registro" novalidate>
      <label class="campo"><span class="campo__label">¿Qué compraste?</span>
        <input name="descripcion" maxlength="60" value="${plan.descripcion || ""}" placeholder="Ej. Pantalla, Refrigerador, Celular" autocomplete="off" />
        <span class="campo__error" data-error="descripcion"></span></label>

      ${fijo ? html`<div class="card card--suave">
          ${resumen.saldoActual ? html`<p><strong>${formatMonto(resumen.saldoActual)}</strong> por pagar · ${resumen.pagosRestantes} ${resumen.pagosRestantes === 1 ? "mensualidad" : "mensualidades"} de ${formatMonto(plan.pagoCentavos)}</p>`
            : html`<p><strong>✓ Ya la terminaste de pagar.</strong></p>`}
          <p class="campo__ayuda">Ya pagaste ${formatMonto(pagado)} en la app${resumen.proximaFecha ? ` · la siguiente (${etiquetaMsi(plan, resumen.proximaFecha)}) el ${formatFecha(resumen.proximaFecha)}` : ""}.</p>
        </div>`
        : html`<label class="monto-grande"><span class="monto-grande__signo">$</span>
            <input name="monto" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="Precio total"
              value="${editando ? montoTxt(plan.saldoInicialCentavos + (plan.meses - Math.ceil(plan.saldoInicialCentavos / plan.pagoCentavos)) * plan.pagoCentavos) : ""}" /></label>
          <span class="campo__error campo__error--centro" data-error="montoCentavos"></span>
          <div class="campo"><span class="campo__label">¿A cuántos meses?</span>
            ${segmentado("meses", MESES_MSI.map((m) => ({ valor: String(m), label: String(m) })), String(MESES_MSI.includes(meses) ? meses : 12))}
            <span class="campo__error" data-error="meses"></span></div>
          ${tarjetas.length > 1 || !tarjetas.some((t) => t.id === tarjetaId) ? html`<div class="campo"><span class="campo__label">¿Con qué tarjeta?</span>
            <div class="chips" role="radiogroup">${tarjetas.map((t) => html`<label class="chip"><input type="radio" name="tarjetaId" value="${t.id}" ${t.id === tarjetaId ? "checked" : ""} /><span>${t.nombre}</span></label>`)}</div>
            <span class="campo__error" data-error="tarjetaId"></span></div>` : ""}`}

      <div class="campo"><span class="campo__label">¿De qué caja sale cada mes?</span>
        ${chipsCajas("cajaId", plan.cajaId || cajaInicial())}
        <span class="campo__error" data-error="cajaId"></span></div>

      ${fijo ? "" : html`<details class="mas-detalles" ${editando ? "open" : ""}>
        <summary>¿Ya la venías pagando? <span class="texto-sec">(fecha de compra, mensualidades pagadas)</span></summary>
        <div class="grupo fila-2">
          <label class="campo"><span class="campo__label">Fecha de compra</span>
            <input name="fechaCompra" type="date" value="${plan.fechaCompra || hoy()}" />
            <span class="campo__error" data-error="fechaCompra"></span></label>
          <label class="campo"><span class="campo__label">Mensualidades ya pagadas</span>
            <input name="pagadas" type="number" inputmode="numeric" min="0" max="47" value="${editando ? plan.meses - Math.ceil(plan.saldoInicialCentavos / plan.pagoCentavos) : 0}" />
            <span class="campo__error" data-error="pagadas"></span></label>
        </div>
      </details>
      <p class="campo__ayuda msi__resumen" data-resumen></p>`}

      <p class="campo__error" data-error="general"></p>
      <button type="submit" class="btn btn--primario btn--bloque">${editando ? "Guardar cambios" : "Guardar compra"}</button>
      ${editando ? html`<div class="registro__extra">
        ${resumen?.saldoActual > 0 ? html`<button type="button" class="btn-texto" data-accion="liquidar">Pagar todo lo que falta</button>` : ""}
        <button type="button" class="btn-texto texto-peligro" data-accion="quitar">${pagado > 0 ? "Ya no la estoy pagando" : "Eliminar"}</button>
      </div>` : ""}
    </form>`,
  });
  const form = capa.cuerpo.querySelector("form");
  const tarjetaElegida = () => (form.tarjetaId ? valorRadio(form, "tarjetaId") : tarjetaId);
  const leer = () => ({
    descripcion: form.descripcion.value.trim(),
    montoCentavos: form.monto ? parseMonto(form.monto.value) : null,
    meses: Number(valorRadio(form, "meses")),
    pagadas: Number(form.pagadas?.value || 0),
    fechaCompra: form.fechaCompra?.value || hoy(),
    cajaId: valorRadio(form, "cajaId"),
    tarjetaId: tarjetaElegida(),
  });
  const pintarResumen = () => {
    const slot = form.querySelector("[data-resumen]");
    if (!slot) return;
    const x = leer();
    slot.textContent = resumenPlan({ ...x, credito: cuentaPorId(x.tarjetaId)?.credito });
  };
  form.addEventListener("input", pintarResumen);
  form.addEventListener("change", pintarResumen);
  form.monto?.addEventListener("blur", () => { const v = parseMonto(form.monto.value); if (v != null) form.monto.value = centavosATexto(v); });
  pintarResumen();

  form.addEventListener("click", async (e) => {
    const accion = e.target.closest("[data-accion]")?.dataset.accion;
    if (accion === "liquidar") {
      capa.cerrar();
      const { abrirLiquidarMsi } = await import("./pago.js");
      return abrirLiquidarMsi(plan);
    }
    if (accion !== "quitar") return;
    if (pagado > 0) {
      if (!(await confirmar({ titulo: `¿Ya no pagas «${plan.descripcion}»?`, botonConfirmar: "Ya no la pago",
        mensaje: "Deja de aparecer en Mi mes y en la tarjeta. Lo que ya pagaste se queda en tu historial." }))) return;
      deudasRepo.activar(uid(), plan.id, false, { onError });
    } else {
      if (!(await confirmar({ titulo: `¿Eliminar «${plan.descripcion}»?`, mensaje: "No tiene pagos registrados.", botonConfirmar: "Eliminar", peligro: true }))) return;
      deudasRepo.eliminar(uid(), plan.id, { onError });
    }
    capa.cerrar();
    toast(pagado > 0 ? `✓ «${plan.descripcion}» ya no se cobra` : "✓ Compra eliminada");
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const x = leer();
    const cuentaPagoId = cuentaDeCaja(x.cajaId);
    if (fijo) {
      // Con pagos: solo se cambia el nombre y la caja que la paga.
      if (!x.descripcion) { mostrarErrores(form, { descripcion: "Escribe qué compraste." }); return; }
      if (!x.cajaId) { mostrarErrores(form, { cajaId: "Elige la caja que la paga." }); return; }
      deudasRepo.guardar(uid(), { ...plan, descripcion: x.descripcion, cajaId: x.cajaId, cuentaId: cuentaPagoId }, { anterior: plan, onError });
      capa.cerrar();
      toast("✓ Cambios guardados");
      return;
    }
    const { ok, errores } = validarMsi(x);
    if (!ok) { mostrarErrores(form, errores); return; }
    const tarjeta = cuentaPorId(x.tarjetaId);
    const categoriaId = plan.categoriaId || categoriaSugerida(x.descripcion, "gasto", categoriasActivas("gasto"));
    const datos = { ...(editando ? { id: plan.id } : {}), ...deudaDeMsi(x, tarjeta, { cuentaPagoId, categoriaId }) };
    deudasRepo.guardar(uid(), datos, { anterior: editando ? plan : null, onError });
    capa.cerrar();
    toast(`✓ ${x.descripcion} a ${x.meses} meses: ${formatMonto(datos.pagoCentavos)} al mes desde el ${formatFecha(datos.regla.desde)}`, { duracion: 6000 });
  });
  if (!editando) form.descripcion.focus();
  return capa;
}

export const nombreTarjeta = (id) => cuentaPorId(id)?.nombre || "una tarjeta borrada";
export const nombreCaja = (id) => cajaPorId(id)?.nombre || "una caja borrada";

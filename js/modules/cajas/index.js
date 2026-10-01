// ============================================================
// modules/cajas/index.js
// Cajas = para qué es el dinero (Reset Alarmas, HD Crédit…).
// Saldo calculado desde movimientos. Una caja con movimientos
// no se borra: se desactiva (sus saldos siguen existiendo).
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, subscribe, catalogosListos, cajaPorId, cuentaPorId, cuentasActivas } from "../../core/state.js";
import { saldosPor, desgloseCaja, tieneMovimientos } from "../../domain/saldos.js";
import { validarCaja, TIPOS_CAJA, COLORES } from "../../domain/catalogos.js";
import { cajasRepo } from "../../data/catalogosRepo.js";
import { skeletonLista, estadoVacio } from "../../components/states.js";
import { abrirCapa } from "../../components/modal.js";
import { confirmar } from "../../components/confirmation.js";
import { toast, toastError } from "../../components/toast.js";
import { campo, opciones, mostrarErrores } from "../../components/fields.js";
import { icon } from "../../components/icons.js";

function tarjeta(c, saldo, agregados) {
  const desglose = desgloseCaja(agregados, c.id);
  return html`<li>
    <button type="button" class="fila" data-caja="${c.id}">
      <span class="punto punto--grande" style="background:${c.color || "var(--accent)"}"></span>
      <span class="fila__texto">
        <span class="fila__titulo">${c.nombre}</span>
        <span class="fila__sub">${TIPOS_CAJA[c.tipo] || ""}${desglose.length ? ` · ${desglose.map((d) => cuentaPorId(d.cuentaId)?.nombre || "—").join(", ")}` : ""}</span>
      </span>
      <span class="fila__monto ${saldo < 0 ? "monto--negativo" : ""}">${formatMonto(saldo)}</span>
      ${icon("chevron", { size: 16, clase: "fila__chevron" })}
    </button>
  </li>`;
}

function formulario(c) {
  const cuentas = cuentasActivas();
  return html`<form class="form" novalidate>
    ${campo({ label: "Nombre", nombre: "nombre", control: html`<input name="nombre" maxlength="40" value="${c.nombre || ""}" required />` })}
    ${campo({ label: "Tipo", nombre: "tipo", control: html`<select name="tipo">${Object.entries(TIPOS_CAJA).map(([k, v]) => html`<option value="${k}" ${k === (c.tipo || "operativa") ? "selected" : ""}>${v}</option>`)}</select>`,
      ayuda: "Capital de crecimiento y ahorro no cuentan como dinero para gastar." })}
    ${campo({ label: "Cuenta predeterminada", nombre: "cuentaPredeterminadaId", control: html`<select name="cuentaPredeterminadaId">${opciones(cuentas, c.cuentaPredeterminadaId, { vacio: "Ninguna" })}</select>`,
      ayuda: "Se prellena al registrar movimientos de esta caja." })}
    <fieldset class="campo">
      <legend class="campo__label">Color</legend>
      <div class="colores">${COLORES.map((col) => html`<label class="color"><input type="radio" name="color" value="${col}" ${col === (c.color || COLORES[0]) ? "checked" : ""} /><span style="background:${col}"></span></label>`)}</div>
    </fieldset>
    ${campo({ label: "Descripción", nombre: "descripcion", control: html`<textarea name="descripcion" rows="2" maxlength="200">${c.descripcion || ""}</textarea>` })}
    <button type="submit" class="btn btn--primario btn--bloque">${c.id ? "Guardar cambios" : "Crear caja"}</button>
    ${c.id ? html`<div class="acciones acciones--secundarias">
      <a class="btn btn--secundario" href="#/movimientos?caja=${c.id}">Ver movimientos</a>
      <button type="button" class="btn btn--secundario" data-accion="activar">${c.activa === false ? "Activar" : "Desactivar"}</button>
      <button type="button" class="btn btn--peligro-suave" data-accion="eliminar">Eliminar</button>
    </div>` : ""}
  </form>`;
}

function abrirEditor(uid, caja = {}) {
  const capa = abrirCapa({ titulo: caja.id ? caja.nombre : "Nueva caja", contenido: formulario(caja) });
  const form = capa.cuerpo.querySelector("form");
  const onError = (err) => toastError(mensajeDeError(err, "No se pudo guardar la caja."));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const datos = {
      id: caja.id,
      nombre: form.nombre.value.trim(),
      tipo: form.tipo.value,
      cuentaPredeterminadaId: form.cuentaPredeterminadaId.value || null,
      color: form.color.value,
      descripcion: form.descripcion.value.trim(),
    };
    const { ok, errores } = validarCaja(datos, getState().cajas);
    if (!ok) { mostrarErrores(form, errores); return; }
    datos.disponibleParaGasto = datos.tipo === "operativa";
    if (!caja.id) { datos.activa = true; datos.orden = getState().cajas.length; }
    cajasRepo.guardar(uid, datos, { onError });
    capa.cerrar();
    toast(caja.id ? "✓ Caja actualizada" : "✓ Caja creada");
  });

  form.addEventListener("click", async (e) => {
    const accion = e.target.closest("[data-accion]")?.dataset.accion;
    if (accion === "activar") {
      const activar = caja.activa === false;
      if (!activar) {
        const ok = await confirmar({
          titulo: "Desactivar caja",
          mensaje: "Ya no aparecerá al registrar movimientos. Su saldo y su historial se conservan.",
          botonConfirmar: "Desactivar",
        });
        if (!ok) return;
      }
      cajasRepo.activar(uid, caja.id, activar, { onError });
      capa.cerrar();
      toast(activar ? "✓ Caja activada" : "✓ Caja desactivada");
    } else if (accion === "eliminar") {
      if (tieneMovimientos(getState().agregados, "porCaja", caja.id)) {
        await confirmar({
          titulo: "No se puede eliminar",
          mensaje: "Esta caja tiene movimientos. Para conservar la integridad de tus saldos, desactívala en lugar de eliminarla.",
          botonConfirmar: "Entendido",
        });
        return;
      }
      const ok = await confirmar({ titulo: "Eliminar caja", mensaje: `¿Eliminar «${caja.nombre}»? No tiene movimientos.`, botonConfirmar: "Eliminar", peligro: true });
      if (!ok) return;
      cajasRepo.eliminar(uid, caja.id, { onError });
      capa.cerrar();
      toast("✓ Caja eliminada");
    }
  });
}

export function render(container, ctx) {
  const uid = ctx.user.uid;

  function pintar() {
    const s = getState();
    if (!catalogosListos()) { renderHtml(container, skeletonLista(5)); return; }
    const saldos = saldosPor(s.agregados, "porCaja");
    const activas = s.cajas.filter((c) => c.activa !== false);
    const inactivas = s.cajas.filter((c) => c.activa === false);
    renderHtml(container, html`
      <div class="barra-acciones"><button type="button" class="btn btn--primario" data-accion="nueva">+ Nueva caja</button></div>
      ${activas.length === 0 ? estadoVacio({ icono: "cajas", titulo: "Todavía no tienes cajas.", texto: "Una caja agrupa el dinero según su propósito." })
        : html`<ul class="lista card card--lista">${activas.map((c) => tarjeta(c, saldos[c.id] || 0, s.agregados))}</ul>`}
      ${inactivas.length ? html`<h2 class="seccion__titulo">Desactivadas</h2>
        <ul class="lista card card--lista atenuada">${inactivas.map((c) => tarjeta(c, saldos[c.id] || 0, s.agregados))}</ul>` : ""}`);
  }

  const quitar = on(container, "click", "[data-caja], [data-accion='nueva']", (e, el) => {
    if (el.dataset.accion === "nueva") abrirEditor(uid);
    else abrirEditor(uid, cajaPorId(el.dataset.caja));
  });
  const cancelar = subscribe(pintar);
  pintar();
  return () => { cancelar(); quitar(); };
}

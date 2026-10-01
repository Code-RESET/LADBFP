// ============================================================
// modules/cuentas/index.js
// Cuentas = dónde está físicamente el dinero (BBVA, Nu, Klar…).
// Una cuenta puede guardar dinero de varias cajas (BBVA como
// hub): aquí se ve el desglose por caja.
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, subscribe, catalogosListos, cajaPorId, cuentaPorId, cajasActivas } from "../../core/state.js";
import { saldosPor, desgloseCuenta, tieneMovimientos } from "../../domain/saldos.js";
import { validarCuenta, TIPOS_CUENTA } from "../../domain/catalogos.js";
import { cuentasRepo } from "../../data/catalogosRepo.js";
import { skeletonLista, estadoVacio } from "../../components/states.js";
import { abrirCapa } from "../../components/modal.js";
import { confirmar } from "../../components/confirmation.js";
import { toast, toastError } from "../../components/toast.js";
import { campo, opciones, mostrarErrores } from "../../components/fields.js";
import { icon } from "../../components/icons.js";

function fila(c, saldo, agregados) {
  const desglose = desgloseCuenta(agregados, c.id);
  return html`<li>
    <button type="button" class="fila" data-cuenta="${c.id}">
      <span class="fila__icono">${icon("cuentas", { size: 18 })}</span>
      <span class="fila__texto">
        <span class="fila__titulo">${c.nombre}</span>
        <span class="fila__sub">${TIPOS_CUENTA[c.tipo] || ""}${desglose.length > 1 ? ` · ${desglose.length} cajas` : ""}</span>
      </span>
      <span class="fila__monto ${saldo < 0 ? "monto--negativo" : ""}">${formatMonto(saldo)}</span>
      ${icon("chevron", { size: 16, clase: "fila__chevron" })}
    </button>
  </li>`;
}

function formulario(c, agregados) {
  const desglose = c.id ? desgloseCuenta(agregados, c.id) : [];
  return html`<form class="form" novalidate>
    ${desglose.length ? html`<div class="card card--suave">
      <p class="campo__label">Dinero en esta cuenta por caja</p>
      <ul class="sublista">${desglose.map((d) => html`<li><span>${cajaPorId(d.cajaId)?.nombre || "—"}</span><span>${formatMonto(d.saldo)}</span></li>`)}</ul>
    </div>` : ""}
    ${campo({ label: "Nombre", nombre: "nombre", control: html`<input name="nombre" maxlength="40" value="${c.nombre || ""}" required />` })}
    ${campo({ label: "Institución", nombre: "institucion", control: html`<input name="institucion" maxlength="40" value="${c.institucion || ""}" placeholder="Banco o app" />` })}
    ${campo({ label: "Tipo", nombre: "tipo", control: html`<select name="tipo">${Object.entries(TIPOS_CUENTA).map(([k, v]) => html`<option value="${k}" ${k === (c.tipo || "debito") ? "selected" : ""}>${v}</option>`)}</select>`,
      ayuda: "Tarjeta de crédito: el control de límite y fecha de corte llega en una fase futura." })}
    ${campo({ label: "Caja predeterminada", nombre: "cajaPredeterminadaId", control: html`<select name="cajaPredeterminadaId">${opciones(cajasActivas(), c.cajaPredeterminadaId, { vacio: "Ninguna" })}</select>`,
      ayuda: "Una cuenta puede tener dinero de varias cajas; esta solo es la sugerencia." })}
    <button type="submit" class="btn btn--primario btn--bloque">${c.id ? "Guardar cambios" : "Crear cuenta"}</button>
    ${c.id ? html`<div class="acciones acciones--secundarias">
      <a class="btn btn--secundario" href="#/movimientos?cuenta=${c.id}">Ver movimientos</a>
      <button type="button" class="btn btn--secundario" data-accion="activar">${c.activa === false ? "Activar" : "Desactivar"}</button>
      <button type="button" class="btn btn--peligro-suave" data-accion="eliminar">Eliminar</button>
    </div>` : ""}
  </form>`;
}

function abrirEditor(uid, cuenta = {}) {
  const capa = abrirCapa({ titulo: cuenta.id ? cuenta.nombre : "Nueva cuenta", contenido: formulario(cuenta, getState().agregados) });
  const form = capa.cuerpo.querySelector("form");
  const onError = (err) => toastError(mensajeDeError(err, "No se pudo guardar la cuenta."));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const datos = {
      id: cuenta.id,
      nombre: form.nombre.value.trim(),
      institucion: form.institucion.value.trim(),
      tipo: form.tipo.value,
      cajaPredeterminadaId: form.cajaPredeterminadaId.value || null,
    };
    const { ok, errores } = validarCuenta(datos, getState().cuentas);
    if (!ok) { mostrarErrores(form, errores); return; }
    if (!cuenta.id) { datos.activa = true; datos.orden = getState().cuentas.length; }
    cuentasRepo.guardar(uid, datos, { onError });
    capa.cerrar();
    toast(cuenta.id ? "✓ Cuenta actualizada" : "✓ Cuenta creada");
  });

  form.addEventListener("click", async (e) => {
    const accion = e.target.closest("[data-accion]")?.dataset.accion;
    if (accion === "activar") {
      const activar = cuenta.activa === false;
      if (!activar) {
        const ok = await confirmar({
          titulo: "Desactivar cuenta",
          mensaje: "Ya no aparecerá al registrar movimientos. Su saldo y su historial se conservan.",
          botonConfirmar: "Desactivar",
        });
        if (!ok) return;
      }
      cuentasRepo.activar(uid, cuenta.id, activar, { onError });
      capa.cerrar();
      toast(activar ? "✓ Cuenta activada" : "✓ Cuenta desactivada");
    } else if (accion === "eliminar") {
      if (tieneMovimientos(getState().agregados, "porCuenta", cuenta.id)) {
        await confirmar({
          titulo: "No se puede eliminar",
          mensaje: "Esta cuenta tiene movimientos. Para conservar la integridad de tus saldos, desactívala en lugar de eliminarla.",
          botonConfirmar: "Entendido",
        });
        return;
      }
      const ok = await confirmar({ titulo: "Eliminar cuenta", mensaje: `¿Eliminar «${cuenta.nombre}»? No tiene movimientos.`, botonConfirmar: "Eliminar", peligro: true });
      if (!ok) return;
      cuentasRepo.eliminar(uid, cuenta.id, { onError });
      capa.cerrar();
      toast("✓ Cuenta eliminada");
    }
  });
}

export function render(container, ctx) {
  const uid = ctx.user.uid;

  function pintar() {
    const s = getState();
    if (!catalogosListos()) { renderHtml(container, skeletonLista(5)); return; }
    const saldos = saldosPor(s.agregados, "porCuenta");
    const activas = s.cuentas.filter((c) => c.activa !== false);
    const inactivas = s.cuentas.filter((c) => c.activa === false);
    renderHtml(container, html`
      <div class="barra-acciones"><button type="button" class="btn btn--primario" data-accion="nueva">+ Nueva cuenta</button></div>
      ${activas.length === 0 ? estadoVacio({ icono: "cuentas", titulo: "Todavía no tienes cuentas.", texto: "Una cuenta es donde está el dinero: banco, app o efectivo." })
        : html`<ul class="lista card card--lista">${activas.map((c) => fila(c, saldos[c.id] || 0, s.agregados))}</ul>`}
      ${inactivas.length ? html`<h2 class="seccion__titulo">Desactivadas</h2>
        <ul class="lista card card--lista atenuada">${inactivas.map((c) => fila(c, saldos[c.id] || 0, s.agregados))}</ul>` : ""}`);
  }

  const quitar = on(container, "click", "[data-cuenta], [data-accion='nueva']", (e, el) => {
    if (el.dataset.accion === "nueva") abrirEditor(uid);
    else abrirEditor(uid, cuentaPorId(el.dataset.cuenta));
  });
  const cancelar = subscribe(pintar);
  pintar();
  return () => { cancelar(); quitar(); };
}

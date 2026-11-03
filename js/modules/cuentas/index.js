// ============================================================
// modules/cuentas/index.js
// Cuentas = dónde está físicamente el dinero (BBVA, Nu, Klar…).
// Crear una = solo su nombre; tipo, institución y caja sugerida
// quedan en "Más opciones". (También se crean desde Nueva caja.)
// Una cuenta puede guardar dinero de varias cajas (BBVA como
// hub): aquí se ve el desglose por caja.
// Las tarjetas de crédito viven en su propia pantalla (Tarjetas).
// En modo cuentas (v2.0) es «Mis cuentas»: cada cuenta es su propia
// caja (mismo id); se marca si es para gastar o de ahorro, inversión
// o negocio, y al crearla se escribe cuánto tiene hoy.
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { formatMonto, parseMonto } from "../../core/money.js";
import { hoy } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, subscribe, catalogosListos, cajaPorId, cuentaPorId, cajasActivas, modoCuentas, cuentaParaGastar } from "../../core/state.js";
import { saldosPor, desgloseCuenta, tieneMovimientos } from "../../domain/saldos.js";
import { validarCuenta, TIPOS_CUENTA } from "../../domain/catalogos.js";
import { cuentasRepo, cajasRepo } from "../../data/catalogosRepo.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { skeletonLista, estadoVacio } from "../../components/states.js";
import { abrirCapa } from "../../components/modal.js";
import { confirmar } from "../../components/confirmation.js";
import { toast, toastError } from "../../components/toast.js";
import { campo, opciones, mostrarErrores } from "../../components/fields.js";
import { icon } from "../../components/icons.js";

function fila(c, saldo, agregados) {
  if (modoCuentas()) {
    const antes = cajaPorId(c.id)?.descripcion || "";
    return html`<li>
      <button type="button" class="fila" data-cuenta="${c.id}">
        <span class="fila__icono">${icon("cuentas", { size: 18 })}</span>
        <span class="fila__texto"><span class="fila__titulo">${c.nombre}</span>${antes ? html`<span class="fila__sub">${antes}</span>` : ""}</span>
        <span class="fila__monto ${saldo < 0 ? "monto--negativo" : ""}">${formatMonto(saldo)}</span>
        ${icon("chevron", { size: 16, clase: "fila__chevron" })}
      </button>
    </li>`;
  }
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
  const soloCuentas = modoCuentas();
  const desglose = c.id && !soloCuentas ? desgloseCuenta(agregados, c.id) : [];
  return html`<form class="form" novalidate>
    ${desglose.length ? html`<div class="card card--suave">
      <p class="campo__label">Dinero en esta cuenta por caja</p>
      <ul class="sublista">${desglose.map((d) => html`<li><span>${cajaPorId(d.cajaId)?.nombre || "—"}</span><span>${formatMonto(d.saldo)}</span></li>`)}</ul>
    </div>` : ""}
    ${campo({ label: "Nombre del banco o lugar", nombre: "nombre", control: html`<input name="nombre" maxlength="40" value="${c.nombre || ""}" placeholder="Ej. BanCoppel, Efectivo, Caja de ahorro" required />` })}
    ${soloCuentas ? html`<label class="otro-tipo"><input type="checkbox" name="noGastar" ${c.id && !cuentaParaGastar(c.id) ? "checked" : ""} />
        <span><strong>No es para gastar</strong><small>Ahorro, inversión o negocio (por ejemplo tus préstamos). Aparece aparte en Mis cuentas.</small></span></label>
      ${c.id ? "" : campo({ label: "¿Cuánto tiene hoy? (opcional)", nombre: "saldo",
        control: html`<input name="saldo" inputmode="decimal" autocomplete="off" placeholder="$0.00" />`, ayuda: "Lo que dice hoy la app de tu banco (o lo que hay en tu app de préstamos)." })}` : ""}
    <details class="mas-detalles">
      <summary>Más opciones <span class="texto-sec">(tipo, institución)</span></summary>
      <div class="grupo">
        ${campo({ label: "Tipo", nombre: "tipo", control: html`<select name="tipo">${Object.entries(TIPOS_CUENTA).filter(([k]) => k !== "credito" || c.tipo === "credito")
          .map(([k, v]) => html`<option value="${k}" ${k === (c.tipo || "debito") ? "selected" : ""}>${v}</option>`)}</select>` })}
        ${campo({ label: "Institución", nombre: "institucion", control: html`<input name="institucion" maxlength="40" value="${c.institucion || ""}" placeholder="Igual que el nombre" />` })}
        ${soloCuentas ? "" : campo({ label: "Caja sugerida", nombre: "cajaPredeterminadaId", control: html`<select name="cajaPredeterminadaId">${opciones(cajasActivas(), c.cajaPredeterminadaId, { vacio: "Ninguna" })}</select>`,
          ayuda: "Un banco puede guardar dinero de varias cajas." })}
      </div>
    </details>
    <button type="submit" class="btn btn--primario btn--bloque">${c.id ? "Guardar cambios" : "Crear cuenta"}</button>
    ${c.id ? html`<div class="acciones acciones--secundarias">
      <a class="btn btn--secundario" href="#/movimientos?cuenta=${c.id}">Ver movimientos</a>
      <button type="button" class="btn btn--secundario" data-accion="activar">${c.activa === false ? "Activar" : "Desactivar"}</button>
      <button type="button" class="btn btn--peligro-suave" data-accion="eliminar">Eliminar</button>
    </div>` : ""}
  </form>`;
}

/** Abre el formulario desde otras pantallas (p. ej. Cuadrar con mis bancos). */
export function abrirBanco(cuenta = {}) {
  const uid = getState().user?.uid;
  if (uid) abrirEditor(uid, cuenta);
}

function abrirEditor(uid, cuenta = {}) {
  const soloCuentas = modoCuentas();
  const capa = abrirCapa({ titulo: cuenta.id ? cuenta.nombre : soloCuentas ? "Nueva cuenta" : "Nuevo banco", contenido: formulario(cuenta, getState().agregados) });
  const form = capa.cuerpo.querySelector("form");
  const onError = (err) => toastError(mensajeDeError(err, "No se pudo guardar la cuenta."));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const datos = {
      id: cuenta.id,
      nombre: form.nombre.value.trim(),
      institucion: form.institucion.value.trim() || form.nombre.value.trim(),
      tipo: form.tipo.value,
      cajaPredeterminadaId: soloCuentas ? cuenta.id || null : form.cajaPredeterminadaId.value || null,
    };
    const { ok, errores } = validarCuenta(datos, getState().cuentas);
    const saldo = form.saldo?.value.trim() ? parseMonto(form.saldo.value) : 0;
    if (form.saldo?.value.trim() && !(saldo > 0)) errores.saldo = "Escribe un monto válido o déjalo vacío.";
    if (!ok || errores.saldo) { mostrarErrores(form, errores); return; }
    if (!cuenta.id) { datos.activa = true; datos.orden = getState().cuentas.length; }
    const id = cuentasRepo.guardar(uid, datos, { onError });
    if (soloCuentas) {
      // La cuenta es su propia caja: mismo id y nombre; «No es para gastar» va en la caja.
      const noGastar = form.noGastar.checked;
      const previa = cajaPorId(id);
      if (!cuenta.id) cuentasRepo.guardar(uid, { id, cajaPredeterminadaId: id }, { onError });
      cajasRepo.guardar(uid, {
        id, nombre: datos.nombre, tipo: noGastar ? (previa?.tipo && previa.tipo !== "operativa" ? previa.tipo : "ahorro") : "operativa",
        disponibleParaGasto: !noGastar, cuentaPredeterminadaId: id, color: previa?.color || "#2563EB",
        ...(previa ? {} : { activa: true, orden: getState().cajas.length }),
      }, { onError });
      if (saldo > 0) movimientosRepo.crear(uid, { tipo: "apertura", fecha: hoy(), montoCentavos: saldo, cajaId: id, cuentaId: id, nota: "Saldo inicial" }, { onError, origen: "inicial" });
    }
    capa.cerrar();
    toast(cuenta.id ? "✓ Cuenta actualizada" : `✓ Cuenta creada${saldo ? ` · ${formatMonto(saldo)}` : ""}`);
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
      if (soloCuentas && cajaPorId(cuenta.id)) cajasRepo.activar(uid, cuenta.id, activar, { onError });
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
      // Modo cuentas: su caja (mismo id) tampoco tiene movimientos; se va con ella.
      if (soloCuentas && cajaPorId(cuenta.id) && !tieneMovimientos(getState().agregados, "porCaja", cuenta.id)) cajasRepo.eliminar(uid, cuenta.id, { onError });
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
    const bancos = s.cuentas.filter((c) => c.tipo !== "credito");
    const tarjetas = s.cuentas.filter((c) => c.tipo === "credito" && c.activa !== false);
    const activas = bancos.filter((c) => c.activa !== false);
    const inactivas = bancos.filter((c) => c.activa === false);
    const soloCuentas = modoCuentas();
    const lista = (cuentas) => html`<ul class="lista card card--lista">${cuentas.map((c) => fila(c, saldos[c.id] || 0, s.agregados))}</ul>`;
    // Modo cuentas: para gastar y, aparte, ahorro, inversión y negocio.
    const grupos = soloCuentas
      ? [["Para gastar", activas.filter((c) => cuentaParaGastar(c.id))], ["Ahorro, inversión y negocio", activas.filter((c) => !cuentaParaGastar(c.id))]]
        .filter(([, l]) => l.length).map(([t, l]) => html`<p class="cuentas__grupo">${t}</p>${lista(l)}`)
      : lista(activas);
    renderHtml(container, html`
      <div class="barra-acciones"><a class="btn btn--secundario" href="#/cuadrar">Cuadrar con mi banco</a>
        <button type="button" class="btn btn--primario" data-accion="nueva">${soloCuentas ? "+ Nueva cuenta" : "+ Nuevo banco"}</button></div>
      ${activas.length === 0 ? estadoVacio({ icono: "cuentas", titulo: "Todavía no tienes bancos.", texto: "Es donde está el dinero: un banco, una app o efectivo." })
        : grupos}
      <ul class="lista card card--lista"><li><a class="fila" href="#/tarjetas">
        <span class="fila__icono">${icon("tarjeta", { size: 18 })}</span>
        <span class="fila__texto"><span class="fila__titulo">Tarjetas de crédito</span>
          <span class="fila__sub">${tarjetas.length ? tarjetas.map((t) => t.nombre).join(", ") : "Agrega tus tarjetas para saber cuánto pagar"}</span></span>
        ${icon("chevron", { size: 16, clase: "fila__chevron" })}</a></li></ul>
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

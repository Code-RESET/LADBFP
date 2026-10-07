// ============================================================
// modules/cajas/index.js
// Cajas = para qué es el dinero (Reset Alarmas, HD Crédit…).
// Crear una caja = nombre + en qué banco está (+ cuánto tiene
// hoy). Si el banco no existe se crea ahí mismo; el color se
// elige solo. Saldo calculado desde movimientos. Una caja con
// movimientos no se borra: se desactiva.
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { formatMonto, parseMonto } from "../../core/money.js";
import { hoy } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, subscribe, catalogosListos, cajaPorId, cuentaPorId, cuentasActivas } from "../../core/state.js";
import { saldosPor, desgloseCaja, tieneMovimientos } from "../../domain/saldos.js";
import { validarCaja, validarCuenta, COLORES } from "../../domain/catalogos.js";
import { validarMovimiento } from "../../domain/movimientos.js";
import { cajasRepo, cuentasRepo } from "../../data/catalogosRepo.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { abrirFormularioMovimiento } from "../../components/movimientoForm.js";
import { skeletonLista, estadoVacio } from "../../components/states.js";
import { abrirCapa } from "../../components/modal.js";
import { confirmar } from "../../components/confirmation.js";
import { toast, toastError } from "../../components/toast.js";
import { campo, mostrarErrores } from "../../components/fields.js";
import { icon } from "../../components/icons.js";

function tarjeta(c, saldo, agregados) {
  const desglose = desgloseCaja(agregados, c.id);
  return html`<li>
    <button type="button" class="fila" data-caja="${c.id}">
      <span class="punto punto--grande" style="background:${c.color || "var(--accent)"}"></span>
      <span class="fila__texto">
        <span class="fila__titulo">${c.nombre}</span>
        <span class="fila__sub">${[
          c.tipo !== "operativa" ? "No es para gastar" : "",
          [...new Set([c.cuentaPredeterminadaId, ...desglose.map((d) => d.cuentaId)])].map((id) => cuentaPorId(id)?.nombre).filter(Boolean).join(", ") || "Sin banco",
        ].filter(Boolean).join(" · ")}</span>
      </span>
      <span class="fila__monto ${saldo < 0 ? "monto--negativo" : ""}">${formatMonto(saldo)}</span>
      ${icon("chevron", { size: 16, clase: "fila__chevron" })}
    </button>
  </li>`;
}

/** Tipo de banco según su nombre (solo una sugerencia; se cambia en Cuentas). */
function tipoDeBanco(nombre) {
  const t = nombre.toLowerCase();
  if (/efectivo|cartera|cash/.test(t)) return "efectivo";
  if (/tarjeta de cr[eé]dito|credito$|crédito$/.test(t)) return "credito";
  return "debito";
}

function colorLibre() {
  const usados = new Set(getState().cajas.filter((c) => c.activa !== false).map((c) => c.color));
  return COLORES.find((c) => !usados.has(c)) || COLORES[getState().cajas.length % COLORES.length];
}

function formulario(c) {
  const nueva = !c.id;
  const cuentas = cuentasActivas();
  const actual = c.cuentaPredeterminadaId && !cuentas.some((x) => x.id === c.cuentaPredeterminadaId) ? cuentaPorId(c.cuentaPredeterminadaId) : null;
  const bancos = actual ? [...cuentas, { ...actual, nombre: `${actual.nombre} (desactivado)` }] : cuentas;
  return html`<form class="form registro" data-banco="${c.cuentaPredeterminadaId ? "lista" : ""}" novalidate>
    ${campo({ label: "Nombre de la caja", nombre: "nombre", control: html`<input name="nombre" maxlength="40" value="${c.nombre || ""}" placeholder="Ej. Ahorro casa, Negocio, Gastos de la semana" required />` })}

    <div class="campo">
      <span class="campo__label">¿En qué banco o lugar está el dinero?</span>
      <div class="chips" role="radiogroup">
        ${bancos.map((x) => html`<label class="chip"><input type="radio" name="banco" value="${x.id}" ${x.id === c.cuentaPredeterminadaId ? "checked" : ""} /><span>${x.nombre}</span></label>`)}
        <label class="chip"><input type="radio" name="banco" value="__nuevo" ${bancos.length ? "" : "checked"} /><span>＋ Otro</span></label>
      </div>
      <input class="solo-banco-nuevo" name="nuevoBanco" maxlength="40" placeholder="Nombre del banco o lugar (ej. BanCoppel, Efectivo)" aria-label="Nombre del banco nuevo" />
      <span class="campo__error" data-error="banco"></span>
    </div>

    ${nueva ? campo({ label: "¿Cuánto tiene hoy?", nombre: "saldo", ayuda: "Lo que hay hoy en ese banco para esta caja. Puedes dejarlo vacío.",
      control: html`<input name="saldo" inputmode="decimal" placeholder="$0.00" />` }) : ""}

    <label class="otro-tipo"><input type="checkbox" name="reservada" ${c.id && c.tipo !== "operativa" ? "checked" : ""} />
      <span>Es ahorro o capital: <strong>no</strong> es dinero para gastar</span></label>

    <details class="mas-detalles">
      <summary>Más opciones <span class="texto-sec">(color, descripción)</span></summary>
      <div class="grupo">
        <fieldset class="campo">
          <legend class="campo__label">Color</legend>
          <div class="colores">${COLORES.map((col) => html`<label class="color"><input type="radio" name="color" value="${col}" ${col === (c.color || colorLibre()) ? "checked" : ""} /><span style="background:${col}"></span></label>`)}</div>
        </fieldset>
        ${campo({ label: "Descripción", nombre: "descripcion", control: html`<textarea name="descripcion" rows="2" maxlength="200">${c.descripcion || ""}</textarea>` })}
      </div>
    </details>

    <button type="submit" class="btn btn--primario btn--bloque">${nueva ? "Crear caja" : "Guardar cambios"}</button>
    ${nueva ? "" : html`<button type="button" class="btn btn--secundario btn--bloque" data-accion="agregar-dinero">＋ Agregar dinero que ya tenía</button>
    <div class="acciones acciones--secundarias">
      <a class="btn btn--secundario" href="#/movimientos?caja=${c.id}">Ver movimientos</a>
      <button type="button" class="btn btn--secundario" data-accion="activar">${c.activa === false ? "Activar" : "Desactivar"}</button>
      <button type="button" class="btn btn--peligro-suave" data-accion="eliminar">Eliminar</button>
    </div>`}
  </form>`;
}

function abrirEditor(uid, caja = {}) {
  const capa = abrirCapa({ titulo: caja.id ? caja.nombre : "Nueva caja", contenido: formulario(caja) });
  const form = capa.cuerpo.querySelector("form");
  const onError = (err) => toastError(mensajeDeError(err, "No se pudo guardar la caja."));
  const sincronizarBanco = () => {
    form.dataset.banco = form.querySelector('input[name="banco"]:checked')?.value === "__nuevo" ? "nuevo" : "lista";
  };
  sincronizarBanco();
  form.addEventListener("change", (e) => {
    if (e.target.name !== "banco") return;
    sincronizarBanco();
    if (form.dataset.banco === "nuevo") form.nuevoBanco.focus();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const s = getState();
    const banco = form.querySelector('input[name="banco"]:checked')?.value || "";
    const reservada = form.reservada.checked;
    const datos = {
      id: caja.id,
      nombre: form.nombre.value.trim(),
      // "No es para gastar": conserva "Capital de crecimiento" si ya lo era; si no, Ahorro.
      tipo: reservada ? (caja.tipo && caja.tipo !== "operativa" ? caja.tipo : "ahorro") : "operativa",
      color: form.color.value,
      descripcion: form.descripcion.value.trim(),
    };
    const errores = { ...validarCaja(datos, s.cajas).errores };
    let nuevoBanco = null;
    if (!banco) errores.banco = "Elige dónde está el dinero (o «＋ Otro»).";
    if (banco === "__nuevo") {
      nuevoBanco = { nombre: form.nuevoBanco.value.trim(), tipo: "debito" };
      nuevoBanco.tipo = tipoDeBanco(nuevoBanco.nombre);
      const v = validarCuenta(nuevoBanco, s.cuentas);
      if (!v.ok) errores.banco = v.errores.nombre || "Escribe el nombre del banco.";
    }
    const saldo = form.saldo?.value.trim() ? parseMonto(form.saldo.value) : 0;
    if (form.saldo?.value.trim() && !(saldo > 0)) errores.saldo = "Escribe un monto válido o déjalo vacío.";
    if (Object.values(errores).some(Boolean)) { mostrarErrores(form, errores); return; }

    const cuentaId = nuevoBanco
      ? cuentasRepo.guardar(uid, { ...nuevoBanco, institucion: nuevoBanco.nombre, activa: true, orden: s.cuentas.length }, { onError })
      : banco;
    datos.cuentaPredeterminadaId = cuentaId;
    datos.disponibleParaGasto = datos.tipo === "operativa";
    if (!caja.id) { datos.activa = true; datos.orden = s.cajas.length; }
    const cajaId = cajasRepo.guardar(uid, datos, { onError });
    if (saldo > 0) {
      const m = { tipo: "apertura", fecha: hoy(), montoCentavos: saldo, cajaId, cuentaId, nota: "Saldo inicial" };
      if (validarMovimiento(m).ok) movimientosRepo.crear(uid, m, { onError, origen: "inicial" });
    }
    capa.cerrar();
    toast(caja.id ? "✓ Caja actualizada" : `✓ Caja creada${nuevoBanco ? ` con el banco ${nuevoBanco.nombre}` : ""}${saldo ? ` · ${formatMonto(saldo)}` : ""}`);
  });

  form.addEventListener("click", async (e) => {
    const accion = e.target.closest("[data-accion]")?.dataset.accion;
    if (accion === "agregar-dinero") {
      capa.cerrar();
      abrirFormularioMovimiento({ tipo: "apertura", cajaId: caja.id, cuentaId: caja.cuentaPredeterminadaId, titulo: `Dinero que ya tenía · ${caja.nombre}` });
    } else if (accion === "activar") {
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

// ============================================================
// modules/plan/formularios.js
// Hojas de alta/edición: obligación, deuda, ingreso o
// transferencia programada y presupuesto. Las validaciones
// viven en domain/ (compromisos.js, presupuesto.js).
// Se pueden abrir prellenadas (sugerencias con tus datos).
// ============================================================

import { html, render as renderHtml } from "../../core/dom.js";
import { parseMonto, centavosATexto, formatMonto } from "../../core/money.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, cajaPorId, cajasActivas, cuentasActivas, categoriasActivas } from "../../core/state.js";
import { validarObligacion, validarDeuda, validarRecurrente, pagadoDeuda } from "../../domain/compromisos.js";
import { validarPresupuesto, evaluarPresupuesto, PERIODOS_PRESUPUESTO } from "../../domain/presupuesto.js";
import { obligacionesRepo, deudasRepo, recurrentesRepo, presupuestosRepo } from "../../data/planRepo.js";
import { abrirCapa } from "../../components/modal.js";
import { confirmar } from "../../components/confirmation.js";
import { toast, toastError } from "../../components/toast.js";
import { campo, opciones, mostrarErrores, segmentado } from "../../components/fields.js";
import { camposRegla, leerRegla, activarRegla } from "../../components/reglaFields.js";

const uid = () => getState().user.uid;
const onError = (err) => toastError(mensajeDeError(err, "No se pudo guardar."));
const montoTxt = (c) => (c ? centavosATexto(c) : "");
const inputMonto = (nombre, valor, placeholder = "0.00") =>
  html`<input name="${nombre}" inputmode="decimal" autocomplete="off" value="${montoTxt(valor)}" placeholder="${placeholder}" />`;

/** Caja + cuenta (la cuenta se sugiere al elegir caja). */
function camposCajaCuenta(item) {
  return html`<div class="fila-2">
    ${campo({ label: "Caja", nombre: "cajaId", control: html`<select name="cajaId">${opciones(cajasActivas(), item.cajaId, { vacio: "Elige…" })}</select>` })}
    ${campo({ label: "Cuenta", nombre: "cuentaId", control: html`<select name="cuentaId">${opciones(cuentasActivas(), item.cuentaId, { vacio: "Elige…" })}</select>` })}
  </div>`;
}

function sugerirCuenta(form) {
  form.addEventListener("change", (e) => {
    const pares = { cajaId: "cuentaId", cajaDestinoId: "cuentaDestinoId" };
    if (!pares[e.target.name]) return;
    const caja = cajaPorId(e.target.value);
    const sel = form.elements[pares[e.target.name]];
    if (caja?.cuentaPredeterminadaId && sel && [...sel.options].some((o) => o.value === caja.cuentaPredeterminadaId)) sel.value = caja.cuentaPredeterminadaId;
  });
}

/** Botones de pie: guardar + (si existe) desactivar y eliminar. */
function pie(item, textoGuardar) {
  return html`<button type="submit" class="btn btn--primario btn--bloque">${textoGuardar}</button>
    ${item.id ? html`<div class="acciones acciones--secundarias">
      <button type="button" class="btn btn--secundario" data-accion="activar">${item.activa === false ? "Activar" : "Desactivar"}</button>
      <button type="button" class="btn btn--peligro-suave" data-accion="eliminar">Eliminar</button>
    </div>` : ""}`;
}

function accionesSecundarias(form, capa, item, repo, { nombre, puedeEliminar = () => true, motivoNoEliminar = "" }) {
  form.addEventListener("click", async (e) => {
    const accion = e.target.closest("[data-accion]")?.dataset.accion;
    if (accion === "activar") {
      repo.activar(uid(), item.id, item.activa === false, { onError });
      capa.cerrar();
      toast(item.activa === false ? `✓ ${nombre} activada` : `✓ ${nombre} desactivada`);
    } else if (accion === "eliminar") {
      if (!puedeEliminar()) {
        await confirmar({ titulo: "No se puede eliminar", mensaje: motivoNoEliminar, botonConfirmar: "Entendido" });
        return;
      }
      const ok = await confirmar({ titulo: `Eliminar ${nombre.toLowerCase()}`, mensaje: "Esta acción no se puede deshacer.", botonConfirmar: "Eliminar", peligro: true });
      if (!ok) return;
      repo.eliminar(uid(), item.id, { onError });
      capa.cerrar();
      toast(`✓ ${nombre} eliminada`);
    }
  });
}

// ---------------- Obligación ----------------

export function abrirObligacion(item = {}) {
  const editando = !!item.id;
  const o = { variable: false, activa: true, ...item };
  const capa = abrirCapa({
    titulo: editando ? o.nombre : "Nueva obligación",
    contenido: html`<form class="form" novalidate data-variable="${o.variable ? "si" : "no"}">
      <p class="campo__ayuda">Pagos fijos que no son deuda: trabajadora, colegiatura, celular, cuota de casa…</p>
      ${campo({ label: "Nombre", nombre: "nombre", control: html`<input name="nombre" maxlength="60" value="${o.nombre || ""}" />` })}
      ${campo({ label: "Monto presupuestado", nombre: "montoCentavos", control: inputMonto("monto", o.montoCentavos) })}
      <label class="interruptor"><input type="checkbox" name="variable" ${o.variable ? "checked" : ""} /> <span>El monto varía (mínimo / máximo)</span></label>
      <div class="fila-2 solo-variable">
        ${campo({ label: "Mínimo", nombre: "minimoCentavos", control: inputMonto("minimo", o.minimoCentavos) })}
        ${campo({ label: "Máximo", nombre: "maximoCentavos", control: inputMonto("maximo", o.maximoCentavos) })}
      </div>
      ${camposRegla(o.regla, { etiquetaDesde: "Primer pago desde" })}
      ${camposCajaCuenta(o)}
      ${campo({ label: "Categoría", nombre: "categoriaId", control: html`<select name="categoriaId">${opciones(categoriasActivas("gasto"), o.categoriaId, { vacio: "Elige…" })}</select>` })}
      ${pie(o, editando ? "Guardar cambios" : "Crear obligación")}
    </form>`,
  });
  const form = capa.cuerpo.querySelector("form");
  activarRegla(form);
  sugerirCuenta(form);
  form.variable.addEventListener("change", () => { form.dataset.variable = form.variable.checked ? "si" : "no"; });
  accionesSecundarias(form, capa, o, obligacionesRepo, { nombre: "Obligación" });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const variable = form.variable.checked;
    const datos = {
      id: o.id, nombre: form.nombre.value.trim(), montoCentavos: parseMonto(form.monto.value), variable,
      regla: leerRegla(form), cajaId: form.cajaId.value, cuentaId: form.cuentaId.value, categoriaId: form.categoriaId.value,
      activa: o.activa !== false,
    };
    if (variable) { datos.minimoCentavos = parseMonto(form.minimo.value); datos.maximoCentavos = parseMonto(form.maximo.value); }
    const { ok, errores } = validarObligacion(datos);
    if (!ok) { mostrarErrores(form, errores); return; }
    obligacionesRepo.guardar(uid(), datos, { anterior: editando ? o : null, onError });
    capa.cerrar();
    toast(editando ? "✓ Obligación actualizada" : "✓ Obligación creada");
  });
}

// ---------------- Deuda ----------------

export function abrirDeuda(item = {}) {
  const editando = !!item.id;
  const dd = { activa: true, tasaAnual: 0, ...item };
  const pagado = editando ? pagadoDeuda(getState().agregados, dd.id) : 0;
  const capa = abrirCapa({
    titulo: editando ? dd.acreedor : "Nueva deuda",
    contenido: html`<form class="form" novalidate>
      ${campo({ label: "Acreedor", nombre: "acreedor", control: html`<input name="acreedor" maxlength="60" value="${dd.acreedor || ""}" placeholder="¿A quién le debes?" />` })}
      ${campo({ label: "Descripción", nombre: "descripcion", control: html`<input name="descripcion" maxlength="200" value="${dd.descripcion || ""}" placeholder="Opcional" />` })}
      <div class="fila-2">
        ${campo({ label: "Saldo al inicio", nombre: "saldoInicialCentavos", control: inputMonto("saldoInicial", dd.saldoInicialCentavos),
          ayuda: editando && pagado ? `Ya pagado en la app: ${formatMonto(pagado)}` : "Lo que se debe hoy, si apenas empiezas a registrarla." })}
        ${campo({ label: "Pago por periodo", nombre: "pagoCentavos", control: inputMonto("pago", dd.pagoCentavos) })}
      </div>
      ${camposRegla(dd.regla, { etiquetaDesde: "Primer pago desde" })}
      ${camposCajaCuenta(dd)}
      ${pie(dd, editando ? "Guardar cambios" : "Crear deuda")}
    </form>`,
  });
  const form = capa.cuerpo.querySelector("form");
  activarRegla(form);
  sugerirCuenta(form);
  accionesSecundarias(form, capa, dd, deudasRepo, {
    nombre: "Deuda",
    puedeEliminar: () => pagado === 0,
    motivoNoEliminar: "Esta deuda tiene pagos registrados. Desactívala para conservar su historial.",
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const datos = {
      id: dd.id, acreedor: form.acreedor.value.trim(), descripcion: form.descripcion.value.trim(),
      saldoInicialCentavos: parseMonto(form.saldoInicial.value), pagoCentavos: parseMonto(form.pago.value),
      regla: leerRegla(form), cajaId: form.cajaId.value, cuentaId: form.cuentaId.value,
      categoriaId: dd.categoriaId || "ga-deudas", tasaAnual: dd.tasaAnual || 0, activa: dd.activa !== false,
    };
    const { ok, errores } = validarDeuda(datos);
    if (!ok) { mostrarErrores(form, errores); return; }
    deudasRepo.guardar(uid(), datos, { anterior: editando ? dd : null, onError });
    capa.cerrar();
    toast(editando ? "✓ Deuda actualizada" : "✓ Deuda creada");
  });
}

// ---------------- Ingreso esperado / transferencia programada ----------------

export function abrirRecurrente(item = {}) {
  const editando = !!item.id;
  const r = { tipo: "ingreso", activa: true, ...item };
  const capa = abrirCapa({
    titulo: editando ? r.nombre : "Nuevo ingreso o transferencia",
    contenido: html`<form class="form" novalidate data-tipo="${r.tipo}">
      ${segmentado("tipo", [{ valor: "ingreso", label: "Ingreso esperado" }, { valor: "transferencia", label: "Transferencia programada" }], r.tipo)}
      <p class="campo__ayuda solo-transfer">Mover dinero entre cajas en fechas fijas (p. ej. el sueldo de HD Crédit a Nu). No es ingreso nuevo.</p>
      ${campo({ label: "Nombre", nombre: "nombre", control: html`<input name="nombre" maxlength="60" value="${r.nombre || ""}" />` })}
      ${campo({ label: "Monto", nombre: "montoCentavos", control: inputMonto("monto", r.montoCentavos) })}
      ${camposRegla(r.regla)}
      <p class="grupo__titulo solo-transfer">Desde</p>
      ${camposCajaCuenta(r)}
      <div class="solo-transfer">
        <p class="grupo__titulo">Hacia</p>
        ${camposDestino(r)}
      </div>
      <div class="solo-ingreso">
        ${campo({ label: "Categoría", nombre: "categoriaId", control: html`<select name="categoriaId">${opciones(categoriasActivas("ingreso").filter((c) => !c.esFinanciamiento), r.categoriaId, { vacio: "Elige…" })}</select>` })}
      </div>
      ${pie(r, editando ? "Guardar cambios" : "Crear")}
    </form>`,
  });
  const form = capa.cuerpo.querySelector("form");
  activarRegla(form);
  sugerirCuenta(form);
  form.addEventListener("change", (e) => { if (e.target.name === "tipo") form.dataset.tipo = e.target.value; });
  accionesSecundarias(form, capa, r, recurrentesRepo, { nombre: r.tipo === "ingreso" ? "Ingreso" : "Transferencia" });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const tipo = form.tipo.value;
    const datos = {
      id: r.id, nombre: form.nombre.value.trim(), tipo, montoCentavos: parseMonto(form.monto.value), regla: leerRegla(form),
      cajaId: form.cajaId.value, cuentaId: form.cuentaId.value, activa: r.activa !== false,
    };
    if (tipo === "ingreso") datos.categoriaId = form.categoriaId.value;
    else { datos.cajaDestinoId = form.cajaDestinoId.value; datos.cuentaDestinoId = form.cuentaDestinoId.value; }
    const { ok, errores } = validarRecurrente(datos);
    if (!ok) { mostrarErrores(form, errores); return; }
    recurrentesRepo.guardar(uid(), datos, { anterior: editando ? r : null, onError });
    capa.cerrar();
    toast(editando ? "✓ Cambios guardados" : "✓ Creado");
  });
}

function camposDestino(r) {
  return html`<div class="fila-2">
    ${campo({ label: "Caja destino", nombre: "cajaDestinoId", control: html`<select name="cajaDestinoId">${opciones(cajasActivas(), r.cajaDestinoId, { vacio: "Elige…" })}</select>` })}
    ${campo({ label: "Cuenta destino", nombre: "cuentaDestinoId", control: html`<select name="cuentaDestinoId">${opciones(cuentasActivas(), r.cuentaDestinoId, { vacio: "Elige…" })}</select>` })}
  </div>`;
}

// ---------------- Presupuesto ----------------

function filaLinea(l = {}) {
  return html`<div class="fila-linea" data-linea>
    <select name="lineaCategoria" aria-label="Categoría">${opciones(categoriasActivas("gasto"), l.categoriaId, { vacio: "Categoría…" })}</select>
    <input name="lineaMonto" inputmode="decimal" placeholder="0.00" aria-label="Monto" value="${montoTxt(l.montoCentavos)}" />
    <button type="button" class="btn-icono" data-quitar aria-label="Quitar">−</button>
  </div>`;
}

function filaCobertura(c = {}) {
  return html`<div class="fila-linea" data-cobertura>
    <select name="coberturaCaja" aria-label="Desde la caja">${opciones(cajasActivas(), c.desdeCajaId, { vacio: "Desde caja…" })}</select>
    <input name="coberturaMonto" inputmode="decimal" placeholder="0.00" aria-label="Monto" value="${montoTxt(c.montoCentavos)}" />
    <button type="button" class="btn-icono" data-quitar aria-label="Quitar">−</button>
  </div>`;
}

export function abrirPresupuesto(item = {}) {
  const editando = !!item.id;
  const p = { periodo: "semanal", activa: true, lineas: [{}], coberturas: [], ...item };
  const capa = abrirCapa({
    titulo: editando ? p.nombre : "Nuevo presupuesto",
    contenido: html`<form class="form" novalidate>
      ${campo({ label: "Nombre", nombre: "nombre", control: html`<input name="nombre" maxlength="60" value="${p.nombre || ""}" />` })}
      <div class="fila-2">
        ${campo({ label: "Periodo", nombre: "periodo", control: html`<select name="periodo">${Object.entries(PERIODOS_PRESUPUESTO).map(([k, v]) => html`<option value="${k}" ${k === p.periodo ? "selected" : ""}>${v}</option>`)}</select>` })}
        ${campo({ label: "Caja", nombre: "cajaId", control: html`<select name="cajaId">${opciones(cajasActivas(), p.cajaId, { vacio: "Elige…" })}</select>` })}
      </div>
      ${campo({ label: "Ingreso del periodo", nombre: "ingresoCentavos", control: inputMonto("ingreso", p.ingresoCentavos), ayuda: "Lo que recibe esta caja en cada periodo." })}
      <div class="grupo">
        <p class="grupo__titulo">Gastos presupuestados</p>
        <div data-lineas>${p.lineas.map(filaLinea)}</div>
        <button type="button" class="btn-texto" data-agregar="linea">+ Agregar gasto</button>
        <span class="campo__error" data-error="lineas"></span>
      </div>
      <div class="grupo">
        <p class="grupo__titulo">Cobertura del déficit (opcional)</p>
        <p class="campo__ayuda">Si falta dinero, indica de qué caja saldrá. Registra también esa transferencia en Ingresos → Transferencia programada.</p>
        <div data-coberturas>${p.coberturas.map(filaCobertura)}</div>
        <button type="button" class="btn-texto" data-agregar="cobertura">+ Agregar cobertura</button>
        <span class="campo__error" data-error="coberturas"></span>
      </div>
      <div class="resumen-presupuesto" data-resumen></div>
      ${pie(p, editando ? "Guardar cambios" : "Crear presupuesto")}
    </form>`,
  });
  const form = capa.cuerpo.querySelector("form");
  accionesSecundarias(form, capa, p, presupuestosRepo, { nombre: "Presupuesto" });

  const leer = () => ({
    id: p.id, nombre: form.nombre.value.trim(), periodo: form.periodo.value, cajaId: form.cajaId.value,
    ingresoCentavos: parseMonto(form.ingreso.value || "0") ?? NaN,
    lineas: [...form.querySelectorAll("[data-linea]")].map((f) => ({
      categoriaId: f.querySelector('[name="lineaCategoria"]').value, montoCentavos: parseMonto(f.querySelector('[name="lineaMonto"]').value),
    })).filter((l) => l.categoriaId || l.montoCentavos),
    coberturas: [...form.querySelectorAll("[data-cobertura]")].map((f) => ({
      desdeCajaId: f.querySelector('[name="coberturaCaja"]').value, montoCentavos: parseMonto(f.querySelector('[name="coberturaMonto"]').value),
    })).filter((c) => c.desdeCajaId || c.montoCentavos),
    activa: p.activa !== false,
  });

  const resumen = () => {
    const ev = evaluarPresupuesto({ ...leer(), lineas: leer().lineas.filter((l) => l.montoCentavos), coberturas: leer().coberturas.filter((c) => c.montoCentavos) });
    renderHtml(form.querySelector("[data-resumen]"), html`
      <div><span>Gastos</span><strong>${formatMonto(ev.gastos)}</strong></div>
      <div><span>Resultado</span><strong class="${ev.resultado < 0 ? "monto--negativo" : "monto--positivo"}">${formatMonto(ev.resultado, { signo: true })}</strong></div>
      <p class="${ev.estado === "deficitario" ? "aviso aviso--error" : "aviso aviso--ok"}">${ev.estado === "deficitario"
        ? `🔴 Deficitario: faltan ${formatMonto(ev.deficit)}. Se guarda, pero no cuenta en el disponible real hasta cubrirlo.`
        : "✓ Sostenible"}</p>`);
  };
  form.addEventListener("input", resumen);
  form.addEventListener("change", resumen);
  form.addEventListener("click", (e) => {
    const agregar = e.target.closest("[data-agregar]")?.dataset.agregar;
    if (agregar === "linea") form.querySelector("[data-lineas]").insertAdjacentHTML("beforeend", filaLinea().value);
    if (agregar === "cobertura") form.querySelector("[data-coberturas]").insertAdjacentHTML("beforeend", filaCobertura().value);
    if (e.target.closest("[data-quitar]")) { e.target.closest("[data-linea], [data-cobertura]").remove(); resumen(); }
  });
  resumen();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const datos = leer();
    const { ok, errores } = validarPresupuesto(datos);
    if (!ok) { mostrarErrores(form, errores); return; }
    presupuestosRepo.guardar(uid(), datos, { anterior: editando ? p : null, onError });
    capa.cerrar();
    const estado = evaluarPresupuesto(datos).estado;
    toast(estado === "deficitario" ? "Presupuesto guardado · 🔴 deficitario" : "✓ Presupuesto guardado");
  });
}

// ============================================================
// components/registroSimple.js
// Registro rápido "nombre + monto" (lo único que hay que llenar):
//   ¿Qué es?  ·  ¿Cuánto?  ·  caja (ya elegida, un toque cambia)
//   ☐ Se repite  [Cada mes | Cada semana]  el día __ / el lunes
// La categoría se elige sola por el nombre (Gasolina → Combustible),
// la cuenta es la de la caja y la fecha es hoy.
// Sirve también para editar un gasto/ingreso fijo o uno de una vez.
// ============================================================

import { html } from "../core/dom.js";
import { parseMonto, centavosATexto, formatMonto } from "../core/money.js";
import { hoy, mesDe, sumarDias, mesSiguiente, nombreMes } from "../core/dates.js";
import { mensajeDeError } from "../core/errors.js";
import { getState, cajaPorId, cuentaPorId, cajasActivas, cuentasActivas, categoriasActivas } from "../core/state.js";
import { validarMovimiento, buscarDuplicado } from "../domain/movimientos.js";
import { validarObligacion, validarRecurrente } from "../domain/compromisos.js";
import { categoriaSugerida, fechaParaMes } from "../domain/mes.js";
import { DIAS_SEMANA } from "../domain/periodos.js";
import { cuentaParaCaja } from "../domain/saldos.js";
import { movimientosRepo } from "../data/movimientosRepo.js";
import { obligacionesRepo, recurrentesRepo } from "../data/planRepo.js";
import { abrirCapa } from "./modal.js";
import { confirmar } from "./confirmation.js";
import { toast, toastError } from "./toast.js";
import { segmentado, mostrarErrores, leerLocal, guardarLocal } from "./fields.js";

const onError = (err) => toastError(mensajeDeError(err, "No se pudo guardar."));
const CLAVE_CAJA = (tipo) => `fr.simple.caja.${tipo}`;
const CLAVE_NOMBRES = "fr.simple.nombres";

/** Banco con que se mueve el dinero de una caja: donde la caja tiene más dinero (domain/saldos.js). */
export function cuentaDeCaja(cajaId) {
  return cuentaParaCaja(getState().agregados, cajaPorId(cajaId), cuentasActivas().map((c) => c.id));
}

function cajaInicial(tipo, preferida) {
  const activas = cajasActivas();
  const ids = activas.map((c) => c.id);
  if (ids.includes(preferida)) return preferida;
  const ultima = leerLocal(CLAVE_CAJA(tipo), "");
  if (ids.includes(ultima)) return ultima;
  return (activas.find((c) => c.tipo === "operativa") || activas[0])?.id || "";
}

function nombresConocidos() {
  const s = getState();
  return [...new Set([...leerLocal(CLAVE_NOMBRES, []), ...s.obligaciones.map((o) => o.nombre), ...s.recurrentes.map((r) => r.nombre)])].slice(0, 60);
}

function recordarNombre(nombre) {
  guardarLocal(CLAVE_NOMBRES, [nombre, ...leerLocal(CLAVE_NOMBRES, []).filter((n) => n !== nombre)].slice(0, 30));
}

const ultimoDiaDe = (mes) => sumarDias(`${mesSiguiente(mes)}-01`, -1);

/**
 * abrirRegistro({ tipo, mes })                    → nuevo gasto/ingreso
 * abrirRegistro({ movimiento, mes })              → editar uno de una vez
 * abrirRegistro({ fijo: fila de Mi mes, mes })    → editar un gasto/ingreso fijo
 * `mes` es el mes que se está viendo (para la fecha y el "desde").
 */
export function abrirRegistro({ tipo = "gasto", mes = mesDe(hoy()), movimiento = null, fijo = null, cajaId = null } = {}) {
  const uid = getState().user?.uid;
  if (!uid) return;
  const cajas = cajasActivas();
  if (!cajas.length) { toastError("Primero crea al menos una caja (Más → Cajas)."); return; }

  const ref = fijo?.ref || null;
  if (fijo) tipo = fijo.clase === "ingreso" ? "ingreso" : "gasto";
  if (movimiento) tipo = movimiento.tipo;
  const nuevo = !movimiento && !fijo;

  const v = {
    nombre: ref?.nombre || movimiento?.nota || "",
    monto: ref ? centavosATexto(ref.montoCentavos) : movimiento ? centavosATexto(movimiento.montoCentavos) : "",
    cajaId: ref?.cajaId || movimiento?.cajaId || cajaInicial(tipo, cajaId),
    dia: ref?.regla?.diaMes || (mes === mesDe(hoy()) ? Number(hoy().slice(8)) : 1),
    frecuencia: ref?.regla?.frecuencia === "semanal" ? "semanal" : "mensual",
    diaSemana: ref?.regla?.diaSemana ?? new Date(`${hoy()}T12:00:00Z`).getUTCDay(),
  };
  // Si la caja del registro ya no está activa, se muestra igual para no perderla.
  const listaCajas = cajas.some((c) => c.id === v.cajaId) ? cajas : [...cajas, cajaPorId(v.cajaId)].filter(Boolean);

  const titulo = nuevo ? "Nuevo" : fijo ? (tipo === "ingreso" ? "Ingreso fijo" : "Gasto fijo") : (tipo === "ingreso" ? "Ingreso" : "Gasto");
  const capa = abrirCapa({
    titulo,
    contenido: html`<form class="form registro" data-tipo="${tipo}" data-repite="${fijo ? "si" : "no"}" data-cada="${v.frecuencia}" novalidate>
      ${nuevo ? segmentado("tipo", [{ valor: "gasto", label: "Gasto" }, { valor: "ingreso", label: "Ingreso" }], tipo) : ""}

      <label class="campo">
        <span class="campo__label">¿Qué es?</span>
        <input name="nombre" maxlength="60" value="${v.nombre}" autocomplete="off" list="registro-nombres"
          placeholder="${tipo === "ingreso" ? "Ej. Honorarios, Nómina" : "Ej. Gasolina, Hipoteca"}" enterkeyhint="next" />
        <datalist id="registro-nombres">${nombresConocidos().map((n) => html`<option value="${n}"></option>`)}</datalist>
        <span class="campo__error" data-error="nombre"></span>
      </label>

      <label class="monto-grande">
        <span class="monto-grande__signo">$</span>
        <input name="monto" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${v.monto}" enterkeyhint="done" aria-label="¿Cuánto?" />
      </label>
      <span class="campo__error campo__error--centro" data-error="montoCentavos"></span>

      <div class="campo">
        <span class="campo__label"><span class="solo-gasto">Sale de</span><span class="solo-ingreso">Entra a</span></span>
        <div class="chips" role="radiogroup">${listaCajas.map((c) => html`<label class="chip">
          <input type="radio" name="cajaId" value="${c.id}" ${c.id === v.cajaId ? "checked" : ""} />
          <span><i class="punto" style="background:${c.color || "var(--accent)"}"></i>${c.nombre}${cuentaPorId(cuentaDeCaja(c.id))
            ? html`<small class="chip__banco"> · ${cuentaPorId(cuentaDeCaja(c.id)).nombre}</small>` : ""}</span></label>`)}</div>
        <span class="campo__error" data-error="cajaId"></span>
      </div>

      ${movimiento ? "" : html`<div class="repite">
        ${fijo ? "" : html`<label class="repite__check"><input type="checkbox" name="repite" /> <span>Se repite</span></label>`}
        <div class="solo-repite repite__cuando">
          ${segmentado("cada", [{ valor: "mensual", label: "Cada mes" }, { valor: "semanal", label: "Cada semana" }], v.frecuencia)}
          <span class="solo-cada-mes">el día</span>
          <input class="solo-cada-mes repite__dia" name="dia" type="number" inputmode="numeric" min="1" max="31" value="${v.dia}" aria-label="Día del mes" />
          <span class="solo-cada-semana">el</span>
          <select class="solo-cada-semana repite__semana" name="diaSemana" aria-label="Día de la semana">
            ${[1, 2, 3, 4, 5, 6, 0].map((d) => html`<option value="${d}" ${d === Number(v.diaSemana) ? "selected" : ""}>${DIAS_SEMANA[d].toLowerCase()}</option>`)}
          </select>
        </div>
      </div>
      <span class="campo__error" data-error="diaMes"></span>`}

      <p class="campo__error" data-error="general"></p>
      <button type="submit" class="btn btn--primario btn--bloque">Guardar</button>
      ${nuevo ? "" : html`<div class="registro__extra">
        <button type="button" class="btn-texto texto-peligro" data-accion="quitar">${fijo ? "Ya no se repite" : "Borrar"}</button>
        ${fijo ? html`<button type="button" class="btn-texto" data-accion="avanzado">Más opciones</button>` : ""}
      </div>`}
    </form>`,
  });

  const form = capa.cuerpo.querySelector("form");
  const tipoActual = () => (nuevo ? form.tipo.value : tipo);

  form.addEventListener("change", (e) => {
    if (e.target.name === "tipo") form.dataset.tipo = form.tipo.value;
    if (e.target.name === "cada") form.dataset.cada = form.cada.value;
    if (e.target.name === "repite") {
      form.dataset.repite = form.repite.checked ? "si" : "no";
    }
  });
  form.monto.addEventListener("blur", () => {
    const c = parseMonto(form.monto.value);
    if (c != null) form.monto.value = centavosATexto(c);
  });

  form.addEventListener("click", async (e) => {
    const accion = e.target.closest("[data-accion]")?.dataset.accion;
    if (accion === "avanzado") {
      capa.cerrar();
      const { abrirObligacion, abrirRecurrente } = await import("../modules/plan/formularios.js");
      return fijo.clase === "ingreso" ? abrirRecurrente(ref) : abrirObligacion(ref);
    }
    if (accion !== "quitar") return;
    if (movimiento) {
      const ok = await confirmar({ titulo: `¿Borrar ${movimiento.nota || "este registro"}?`, mensaje: `Se quita ${formatMonto(movimiento.montoCentavos)} de tus cuentas del mes. Queda en el historial.`, botonConfirmar: "Borrar", peligro: true });
      if (!ok) return;
      movimientosRepo.anular(uid, movimiento, "Borrado desde Mi mes", { onError });
      capa.cerrar();
      toast("✓ Borrado");
    } else {
      await dejarDeRepetir(uid, fijo, mes, capa);
    }
  });

  let enviando = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (enviando) return;
    const t = tipoActual();
    const nombre = form.nombre.value.trim();
    const montoCentavos = parseMonto(form.monto.value);
    const caja = form.querySelector('input[name="cajaId"]:checked')?.value || "";
    const repite = fijo || form.repite?.checked;
    const errores = {};
    if (!nombre) errores.nombre = t === "ingreso" ? "Escribe de dónde viene (ej. Honorarios)." : "Escribe qué es (ej. Gasolina).";
    if (!(montoCentavos > 0)) errores.montoCentavos = "Escribe cuánto.";
    if (!caja) errores.cajaId = "Elige una caja.";
    const dia = Number(form.dia?.value);
    const cada = form.cada?.value || "mensual";
    const diaSemana = Number(form.diaSemana?.value);
    if (repite && cada === "mensual" && !(Number.isInteger(dia) && dia >= 1 && dia <= 31)) errores.diaMes = "Escribe un día del 1 al 31.";
    if (Object.keys(errores).length) { mostrarErrores(form, errores); return; }

    // El banco es siempre el que se muestra junto a la caja (donde la caja tiene su dinero),
    // también al editar: así se corrigen gastos que se habían anotado en otro banco.
    const cuentaId = cuentaDeCaja(caja);
    const nombreCambio = nombre !== v.nombre;
    const categoriaId = !nombreCambio && (ref?.categoriaId || movimiento?.categoriaId)
      ? (ref?.categoriaId || movimiento?.categoriaId)
      : categoriaSugerida(nombre, t, categoriasActivas(t));

    enviando = true;
    try {
      if (repite) guardarFijo({ uid, t, ref, nombre, montoCentavos, cajaId: caja, cuentaId, categoriaId, dia, cada, diaSemana, mes });
      else if (movimiento) guardarEdicion({ uid, movimiento, nombre, montoCentavos, cajaId: caja, cuentaId, categoriaId });
      else if (!(await guardarNuevo({ uid, t, nombre, montoCentavos, cajaId: caja, cuentaId, categoriaId, mes }))) return;
    } catch (err) {
      mostrarErrores(form, { general: err.message });
      return;
    } finally {
      enviando = false;
    }
    recordarNombre(nombre);
    guardarLocal(CLAVE_CAJA(t), caja);
    capa.cerrar();
  });

  if (nuevo) form.nombre.focus();
  return capa;
}

function primerError(errores) {
  return Object.values(errores).find(Boolean) || "Revisa los datos.";
}

function guardarFijo({ uid, t, ref, nombre, montoCentavos, cajaId, cuentaId, categoriaId, dia, cada, diaSemana, mes }) {
  // Regla nueva y limpia (sin campos de la otra frecuencia); se conservan "desde" y "hasta".
  const regla = cada === "semanal" ? { frecuencia: "semanal", diaSemana } : { frecuencia: "mensual", diaMes: dia };
  regla.desde = ref?.regla?.desde || `${mes}-01`;
  if (ref?.regla?.hasta) regla.hasta = ref.regla.hasta;
  if (t === "ingreso") {
    const datos = { ...(ref || {}), nombre, tipo: "ingreso", montoCentavos, regla, cajaId, cuentaId, categoriaId, activa: ref?.activa !== false };
    const { ok, errores } = validarRecurrente(datos);
    if (!ok) throw new Error(primerError(errores));
    recurrentesRepo.guardar(uid, datos, { anterior: ref, onError });
  } else {
    const datos = { variable: false, ...(ref || {}), nombre, montoCentavos, regla, cajaId, cuentaId, categoriaId, activa: ref?.activa !== false };
    const { ok, errores } = validarObligacion(datos);
    if (!ok) throw new Error(primerError(errores));
    obligacionesRepo.guardar(uid, datos, { anterior: ref, onError });
  }
  // Un gasto/ingreso fijo nuevo queda pendiente (☐): el dinero se mueve hasta marcarlo.
  const cuando = cada === "semanal" ? `cada ${DIAS_SEMANA[diaSemana].toLowerCase()}` : `cada mes el día ${dia}`;
  toast(ref ? "✓ Cambios guardados" : `✓ ${nombre} anotado ${cuando}. Márcalo ☑ cuando ${t === "ingreso" ? "lo recibas" : "lo pagues"}.`, { duracion: 6000 });
}

function guardarEdicion({ uid, movimiento, nombre, montoCentavos, cajaId, cuentaId, categoriaId }) {
  const entrada = { ...movimiento, nota: nombre, montoCentavos, cajaId, cuentaId, categoriaId };
  const s = getState();
  const { ok, errores } = validarMovimiento(entrada, { cajas: s.cajas, cuentas: s.cuentas, categorias: s.categorias });
  if (!ok) throw new Error(primerError(errores));
  const cambio = movimientosRepo.editar(uid, movimiento, entrada, { onError });
  toast(cambio ? "✓ Cambios guardados" : "Sin cambios");
}

async function guardarNuevo({ uid, t, nombre, montoCentavos, cajaId, cuentaId, categoriaId, mes }) {
  const entrada = { tipo: t, montoCentavos, fecha: fechaParaMes(mes, hoy()), cajaId, cuentaId, categoriaId, nota: nombre };
  const s = getState();
  const { ok, errores } = validarMovimiento(entrada, { cajas: s.cajas, cuentas: s.cuentas, categorias: s.categorias });
  if (!ok) throw new Error(primerError(errores));
  const dup = buscarDuplicado(entrada, await movimientosRepo.similares(uid, entrada).catch(() => []));
  if (dup && !(await confirmar({ titulo: "¿Ya lo registraste?", mensaje: `Hace unos minutos registraste ${dup.nota || "uno igual"} por ${formatMonto(dup.montoCentavos)}.`, botonConfirmar: "Registrar de todos modos" }))) {
    return false;
  }
  movimientosRepo.crear(uid, entrada, { onError });
  toast(navigator.onLine ? `✓ ${nombre} registrado` : `✓ ${nombre} registrado · se sincronizará al reconectar`);
  return true;
}

/**
 * "Ya no se repite": deja de aparecer desde el mes que se ve (o desde el
 * siguiente si ya se pagó en este). Lo pagado se conserva. Si nunca llegó
 * a aparecer en un mes anterior, se elimina.
 */
async function dejarDeRepetir(uid, fijo, mes, capa) {
  const ref = fijo.ref;
  const repo = fijo.clase === "ingreso" ? recurrentesRepo : obligacionesRepo;
  const hasta = fijo.pagado > 0 ? ultimoDiaDe(mes) : sumarDias(`${mes}-01`, -1);
  const desdeMes = fijo.pagado > 0 ? mesSiguiente(mes) : mes;
  const ok = await confirmar({
    titulo: `¿${ref.nombre} ya no se repite?`,
    mensaje: `Deja de aparecer desde ${nombreMes(desdeMes)}. Lo que ya registraste se queda.`,
    botonConfirmar: "Ya no se repite",
    peligro: true,
  });
  if (!ok) return;
  if (ref.regla?.desde && hasta < ref.regla.desde) repo.eliminar(uid, ref.id, { onError });
  else repo.guardar(uid, { ...ref, regla: { ...ref.regla, hasta } }, { anterior: ref, onError });
  capa.cerrar();
  toast(`✓ ${ref.nombre} ya no se repite`);
}

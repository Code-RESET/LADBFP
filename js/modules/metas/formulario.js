// ============================================================
// modules/metas/formulario.js
// Hojas de Metas de ahorro:
//   abrirMeta     crear / editar (nombre, cuánto necesitas, cuánto
//                 apartas y cada cuándo, de qué caja sale y dónde se
//                 guarda; "＋ Caja nueva" la crea ahí mismo)
//   abrirAportar  apartar dinero (o sacarlo) = transferencia entre la
//                 caja de origen y la de ahorro, vinculada a la meta
// ============================================================

import { html } from "../../core/dom.js";
import { parseMonto, centavosATexto, formatMonto } from "../../core/money.js";
import { hoy, mesDe } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, cajaPorId, cuentaPorId, cajasActivas, cuentasActivas } from "../../core/state.js";
import { validarMeta, aportacionesDelMes } from "../../domain/metas.js";
import { validarCaja, COLORES } from "../../domain/catalogos.js";
import { DIAS_SEMANA } from "../../domain/periodos.js";
import { validarMovimiento } from "../../domain/movimientos.js";
import { metasRepo } from "../../data/planRepo.js";
import { cajasRepo } from "../../data/catalogosRepo.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { abrirCapa } from "../../components/modal.js";
import { confirmar } from "../../components/confirmation.js";
import { toast, toastError } from "../../components/toast.js";
import { segmentado, mostrarErrores } from "../../components/fields.js";
import { cuentaDeCaja } from "../../components/registroSimple.js";

const onError = (err) => toastError(mensajeDeError(err, "No se pudo guardar la meta."));
const uid = () => getState().user?.uid;
const NUEVA = "__nueva";

const chipsCajas = (nombre, seleccion, { excluir = null, nueva = false } = {}) => html`<div class="chips" role="radiogroup">
  ${cajasActivas().filter((c) => c.id !== excluir).map((c) => html`<label class="chip">
    <input type="radio" name="${nombre}" value="${c.id}" ${c.id === seleccion ? "checked" : ""} />
    <span><i class="punto" style="background:${c.color || "var(--accent)"}"></i>${c.nombre}${cuentaPorId(cuentaDeCaja(c.id))
      ? html`<small class="chip__banco"> · ${cuentaPorId(cuentaDeCaja(c.id)).nombre}</small>` : ""}</span></label>`)}
  ${nueva ? html`<label class="chip"><input type="radio" name="${nombre}" value="${NUEVA}" ${seleccion === NUEVA ? "checked" : ""} /><span>＋ Caja nueva</span></label>` : ""}
</div>`;

const valorRadio = (form, nombre) => form.querySelector(`input[name="${nombre}"]:checked`)?.value || "";

function colorLibre() {
  const usados = new Set(getState().cajas.filter((c) => c.activa !== false).map((c) => c.color));
  return COLORES.find((c) => !usados.has(c)) || COLORES[getState().cajas.length % COLORES.length];
}

/** Crear o editar una meta. `meta` puede traer valores sugeridos (sin id). */
export function abrirMeta(meta = {}) {
  const editando = !!meta.id;
  const r = meta.regla || {};
  const cada = r.frecuencia || "mensual";
  const hoyF = hoy();
  const origen = meta.cajaOrigenId || (cajasActivas().find((c) => c.tipo === "operativa") || cajasActivas()[0])?.id || "";
  const ahorro = meta.cajaAhorroId || NUEVA;
  const capa = abrirCapa({
    titulo: editando ? meta.nombre : "Nueva meta de ahorro",
    contenido: html`<form class="form registro" data-cada="${cada}" data-ahorro="${ahorro === NUEVA ? "nueva" : "lista"}" novalidate>
      <label class="campo"><span class="campo__label">¿Para qué ahorras?</span>
        <input name="nombre" maxlength="60" value="${meta.nombre || ""}" placeholder="Ej. Remodelación, Viaje, Fondo de emergencia" />
        <span class="campo__error" data-error="nombre"></span></label>

      <div class="fila-2">
        <label class="campo"><span class="campo__label">¿Cuánto necesitas?</span>
          <input name="objetivo" inputmode="decimal" placeholder="$0.00" value="${meta.objetivoCentavos ? centavosATexto(meta.objetivoCentavos) : ""}" />
          <span class="campo__error" data-error="objetivoCentavos"></span></label>
        <label class="campo"><span class="campo__label">¿Cuánto vas a apartar?</span>
          <input name="aportacion" inputmode="decimal" placeholder="$0.00" value="${meta.aportacionCentavos ? centavosATexto(meta.aportacionCentavos) : ""}" />
          <span class="campo__error" data-error="aportacionCentavos"></span></label>
      </div>

      <div class="repite">
        <div class="repite__cuando">
          ${segmentado("cada", [{ valor: "mensual", label: "Cada mes" }, { valor: "quincenal", label: "Cada quincena" }, { valor: "semanal", label: "Cada semana" }], cada)}
          <span class="solo-cada-mes">el día</span>
          <input class="solo-cada-mes repite__dia" name="dia" type="number" inputmode="numeric" min="1" max="31" value="${r.diaMes || Number(hoyF.slice(8))}" aria-label="Día del mes" />
          <span class="solo-cada-semana">el</span>
          <select class="solo-cada-semana repite__semana" name="diaSemana" aria-label="Día de la semana">
            ${[1, 2, 3, 4, 5, 6, 0].map((d) => html`<option value="${d}" ${d === Number(r.diaSemana ?? new Date(`${hoyF}T12:00:00Z`).getUTCDay()) ? "selected" : ""}>${DIAS_SEMANA[d].toLowerCase()}</option>`)}
          </select>
          <span class="solo-cada-quincena campo__ayuda">Los días 15 y último de cada mes.</span>
        </div>
      </div>
      <span class="campo__error" data-error="diaMes"></span>

      <div class="campo"><span class="campo__label">¿De qué caja sale?</span>
        ${chipsCajas("cajaOrigenId", origen)}
        <span class="campo__error" data-error="cajaOrigenId"></span></div>

      <div class="campo"><span class="campo__label">¿Dónde se guarda el ahorro?</span>
        ${chipsCajas("cajaAhorroId", ahorro, { nueva: true })}
        <div class="solo-ahorro-nueva grupo">
          <input name="nombreCaja" maxlength="40" placeholder="Nombre de la caja (ej. Ahorro remodelación)" value="${meta.nombre ? `Ahorro ${meta.nombre}`.slice(0, 40) : ""}" aria-label="Nombre de la caja nueva" />
          <span class="campo__label">¿En qué banco estará?</span>
          <div class="chips" role="radiogroup">${cuentasActivas().map((c, i) => html`<label class="chip">
            <input type="radio" name="bancoCaja" value="${c.id}" ${i === 0 ? "checked" : ""} /><span>${c.nombre}</span></label>`)}</div>
        </div>
        <p class="campo__ayuda">Lo que tenga esa caja cuenta como lo que llevas juntado.</p>
        <span class="campo__error" data-error="cajaAhorroId"></span></div>

      <p class="campo__error" data-error="general"></p>
      <button type="submit" class="btn btn--primario btn--bloque">${editando ? "Guardar cambios" : "Crear meta"}</button>
      ${editando ? html`<div class="registro__extra">
        <button type="button" class="btn-texto" data-accion="pausar">${meta.activa === false ? "Reanudar meta" : "Pausar meta"}</button>
        <button type="button" class="btn-texto texto-peligro" data-accion="eliminar">Eliminar meta</button>
      </div>` : ""}
    </form>`,
  });
  const form = capa.cuerpo.querySelector("form");
  form.addEventListener("change", (e) => {
    if (e.target.name === "cada") form.dataset.cada = form.cada.value;
    if (e.target.name === "cajaAhorroId") form.dataset.ahorro = form.cajaAhorroId.value === NUEVA ? "nueva" : "lista";
  });
  form.nombre.addEventListener("input", () => {
    if (!editando && !form.nombreCaja.dataset.tocado) form.nombreCaja.value = form.nombre.value.trim() ? `Ahorro ${form.nombre.value.trim()}`.slice(0, 40) : "";
  });
  form.nombreCaja.addEventListener("input", () => { form.nombreCaja.dataset.tocado = "1"; });
  for (const n of ["objetivo", "aportacion"]) {
    form[n].addEventListener("blur", () => { const c = parseMonto(form[n].value); if (c != null) form[n].value = centavosATexto(c); });
  }

  form.addEventListener("click", async (e) => {
    const accion = e.target.closest("[data-accion]")?.dataset.accion;
    if (accion === "pausar") {
      metasRepo.activar(uid(), meta.id, meta.activa === false, { onError });
      capa.cerrar();
      toast(meta.activa === false ? `✓ ${meta.nombre} reanudada` : `✓ ${meta.nombre} en pausa`);
    } else if (accion === "eliminar") {
      const ok = await confirmar({ titulo: `¿Eliminar la meta «${meta.nombre}»?`,
        mensaje: `El dinero se queda en la caja «${cajaPorId(meta.cajaAhorroId)?.nombre || ""}» y los movimientos en tu historial.`,
        botonConfirmar: "Eliminar meta", peligro: true });
      if (!ok) return;
      metasRepo.eliminar(uid(), meta.id, { onError });
      capa.cerrar();
      toast("✓ Meta eliminada");
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const s = getState();
    const cadaV = form.cada.value;
    const regla = cadaV === "semanal" ? { frecuencia: "semanal", diaSemana: Number(form.diaSemana.value) }
      : cadaV === "quincenal" ? { frecuencia: "quincenal" }
      : { frecuencia: "mensual", diaMes: Number(form.dia.value) };
    regla.desde = r.desde || `${mesDe(hoyF)}-01`;
    if (r.hasta) regla.hasta = r.hasta;
    const ahorroSel = valorRadio(form, "cajaAhorroId");
    const datos = {
      id: meta.id,
      nombre: form.nombre.value.trim(),
      objetivoCentavos: parseMonto(form.objetivo.value),
      aportacionCentavos: parseMonto(form.aportacion.value),
      regla,
      cajaOrigenId: valorRadio(form, "cajaOrigenId"),
      cajaAhorroId: ahorroSel === NUEVA ? "nueva" : ahorroSel,
      activa: meta.activa !== false,
    };
    const errores = { ...validarMeta(datos, s.metas).errores };
    let cajaNueva = null;
    if (ahorroSel === NUEVA) {
      delete errores.cajaAhorroId;
      cajaNueva = { nombre: form.nombreCaja.value.trim(), tipo: "ahorro" };
      const v = validarCaja(cajaNueva, s.cajas);
      if (!v.ok) errores.cajaAhorroId = v.errores.nombre || "Escribe el nombre de la caja nueva.";
      if (!valorRadio(form, "bancoCaja")) errores.cajaAhorroId = "Elige en qué banco estará la caja nueva.";
    }
    if (Object.keys(errores).length) { mostrarErrores(form, errores); return; }

    if (cajaNueva) {
      datos.cajaAhorroId = cajasRepo.guardar(uid(), {
        ...cajaNueva, color: colorLibre(), cuentaPredeterminadaId: valorRadio(form, "bancoCaja"),
        disponibleParaGasto: false, activa: true, orden: s.cajas.length, descripcion: `Ahorro para «${datos.nombre}»`,
      }, { onError });
    }
    metasRepo.guardar(uid(), datos, { anterior: editando ? meta : null, onError });
    capa.cerrar();
    toast(editando ? "✓ Meta actualizada" : `✓ Meta «${datos.nombre}» creada${cajaNueva ? ` con la caja «${cajaNueva.nombre}»` : ""}`);
  });
  if (!editando) form.nombre.focus();
  return capa;
}

/**
 * Apartar dinero para la meta (o sacarlo, con `retiro`). La aportación
 * se vincula a la primera aportación pendiente del mes, así Mi mes la
 * marca ☑.
 */
export function abrirAportar(meta, { retiro = false } = {}) {
  const s = getState();
  const hoyF = hoy();
  const pendiente = aportacionesDelMes({ mes: mesDe(hoyF), metas: [meta], agregados: s.agregados, hoy: hoyF }).find((a) => a.pendiente > 0);
  const de = retiro ? meta.cajaAhorroId : meta.cajaOrigenId;
  const a = retiro ? meta.cajaOrigenId : meta.cajaAhorroId;
  const nombreCon = (id) => `${cajaPorId(id)?.nombre || "—"}${cuentaPorId(cuentaDeCaja(id)) ? ` · ${cuentaPorId(cuentaDeCaja(id)).nombre}` : ""}`;
  const capa = abrirCapa({
    titulo: retiro ? `Sacar dinero de «${meta.nombre}»` : `Aportar a «${meta.nombre}»`,
    contenido: html`<form class="form registro" novalidate>
      <label class="monto-grande"><span class="monto-grande__signo">$</span>
        <input name="monto" inputmode="decimal" placeholder="0.00" aria-label="¿Cuánto?"
          value="${retiro ? "" : centavosATexto(pendiente?.pendiente || meta.aportacionCentavos)}" /></label>
      <span class="campo__error campo__error--centro" data-error="montoCentavos"></span>
      <p class="aportar__ruta">De <strong>${nombreCon(de)}</strong><br />a <strong>${nombreCon(a)}</strong></p>
      ${!retiro && pendiente ? html`<p class="campo__ayuda">Cuenta como la aportación del ${Number(pendiente.periodo.slice(8))} de este mes.</p>` : ""}
      <p class="campo__error" data-error="general"></p>
      <button type="submit" class="btn btn--primario btn--bloque">${retiro ? "Sacar dinero" : "Aportar"}</button>
    </form>`,
  });
  const form = capa.cuerpo.querySelector("form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const montoCentavos = parseMonto(form.monto.value);
    if (!(montoCentavos > 0)) { mostrarErrores(form, { montoCentavos: "Escribe cuánto." }); return; }
    const entrada = {
      tipo: "transferencia", montoCentavos, fecha: hoyF,
      cajaId: de, cuentaId: cuentaDeCaja(de), cajaDestinoId: a, cuentaDestinoId: cuentaDeCaja(a),
      nota: `${retiro ? "Retiro" : "Ahorro"}: ${meta.nombre}`, metaId: meta.id,
      ...(!retiro && pendiente ? { metaPeriodo: pendiente.periodo } : {}),
    };
    const v = validarMovimiento(entrada, { cajas: s.cajas, cuentas: s.cuentas });
    if (!v.ok) { mostrarErrores(form, { general: Object.values(v.errores)[0] }); return; }
    movimientosRepo.crear(uid(), entrada, { onError });
    capa.cerrar();
    toast(retiro ? `✓ Sacaste ${formatMonto(montoCentavos)} de «${meta.nombre}»` : `✓ Aportaste ${formatMonto(montoCentavos)} a «${meta.nombre}»`);
  });
  form.monto.focus();
  return capa;
}

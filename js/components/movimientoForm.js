// ============================================================
// components/movimientoForm.js
// Hoja de "Nuevo movimiento". Flujo común en 3 acciones:
//   1) tocar ＋   2) escribir el monto   3) Guardar
// Caja, cuenta y categoría se prellenan con las últimas usadas
// para cada tipo. También sirve para editar.
// ============================================================

import { html, render } from "../core/dom.js";
import { parseMonto, centavosATexto, formatMonto } from "../core/money.js";
import { hoy } from "../core/dates.js";
import { mensajeDeError } from "../core/errors.js";
import { getState, cajaPorId, cajasActivas, cuentasActivas, categoriasActivas } from "../core/state.js";
import { validarMovimiento, buscarDuplicado, ETIQUETA_TIPO } from "../domain/movimientos.js";
import { FORMAS_PAGO } from "../domain/mes.js";
import { movimientosRepo } from "../data/movimientosRepo.js";
import { abrirCapa } from "./modal.js";
import { confirmar } from "./confirmation.js";
import { toast, toastError } from "./toast.js";
import { opciones, campo, mostrarErrores, segmentado, leerLocal, guardarLocal } from "./fields.js";

const CLAVE_ULTIMO = (tipo) => `fr.ultimo.${tipo}`;

/** Listas para los selects. Al editar, incluye elementos ya desactivados que el movimiento usa. */
function catalogos(mov) {
  const s = getState();
  const conUsados = (activas, todas, ids) => {
    const extra = todas.filter((x) => ids.includes(x.id) && !activas.some((a) => a.id === x.id));
    return [...activas, ...extra.map((x) => ({ ...x, activa: true, nombre: `${x.nombre} (desactivada)` }))];
  };
  const ids = mov ? [mov.cajaId, mov.cajaDestinoId, mov.cuentaId, mov.cuentaDestinoId, mov.categoriaId] : [];
  return {
    cajas: conUsados(cajasActivas(), s.cajas, ids),
    cuentas: conUsados(cuentasActivas(), s.cuentas, ids),
    categorias: conUsados(categoriasActivas(), s.categorias, ids),
  };
}

function valoresIniciales(mov, preset) {
  if (mov) return { ...mov, monto: centavosATexto(mov.montoCentavos) };
  const tipo = preset.tipo || leerLocal("fr.ultimoTipo", "gasto");
  const ultimo = leerLocal(CLAVE_ULTIMO(tipo), {});
  const cajaId = preset.cajaId || ultimo.cajaId || cajasActivas()[0]?.id || "";
  const caja = cajaPorId(cajaId);
  return {
    tipo,
    fecha: hoy(),
    cajaId,
    cuentaId: preset.cuentaId || ultimo.cuentaId || caja?.cuentaPredeterminadaId || "",
    cajaDestinoId: preset.cajaDestinoId || ultimo.cajaDestinoId || "",
    cuentaDestinoId: preset.cuentaDestinoId || ultimo.cuentaDestinoId || "",
    categoriaId: preset.categoriaId || ultimo.categoriaId || "",
    formaPago: preset.formaPago ?? ultimo.formaPago ?? "",
    direccion: "entrada",
    nota: preset.nota || "",
    monto: preset.montoCentavos ? centavosATexto(preset.montoCentavos) : "",
  };
}

// Campos que vinculan el movimiento con una obligación, deuda o ingreso programado.
const CAMPOS_VINCULO = ["obligacionId", "obligacionPeriodo", "deudaId", "deudaPeriodo", "recurrenteId", "recurrentePeriodo"];
const vinculoDe = (obj) => Object.fromEntries(CAMPOS_VINCULO.filter((k) => obj?.[k]).map((k) => [k, obj[k]]));

function plantilla(v, cat, editando) {
  const tipoGrupo = ["apertura", "ajuste"].includes(v.tipo) ? "otro" : v.tipo;
  const detallesAbiertos = editando || tipoGrupo === "otro";
  return html`<form class="form-mov" data-tipo="${v.tipo}" novalidate>
    ${segmentado("tipoGrupo", [
      { valor: "gasto", label: "Gasto" },
      { valor: "ingreso", label: "Ingreso" },
      { valor: "transferencia", label: "Mover dinero" },
    ], tipoGrupo)}

    <div class="solo-otro">
      ${segmentado("tipoOtro", [
        { valor: "apertura", label: "Saldo inicial" },
        { valor: "ajuste", label: "Ajuste" },
      ], v.tipo === "ajuste" ? "ajuste" : "apertura")}
      <p class="campo__ayuda solo-apertura">Dinero que ya tenías antes de usar la app. No cuenta como ingreso.</p>
      <div class="solo-ajuste">
        ${segmentado("direccion", [
          { valor: "entrada", label: "Suma al saldo" },
          { valor: "salida", label: "Resta al saldo" },
        ], v.direccion || "entrada")}
        <p class="campo__ayuda">Para cuadrar contra el banco. Queda registrado en la auditoría.</p>
      </div>
    </div>

    <label class="monto-grande">
      <span class="visually-hidden">¿Cuánto?</span>
      <span class="monto-grande__signo">$</span>
      <input name="monto" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${v.monto}" enterkeyhint="done" aria-label="¿Cuánto?" />
    </label>
    <span class="campo__error campo__error--centro" data-error="montoCentavos"></span>

    <div class="grupo">
      ${campo({ label: html`<span class="solo-no-transfer">¿De qué caja?</span><span class="solo-transfer">De la caja</span>`, nombre: "cajaId",
        control: html`<select name="cajaId">${opciones(cat.cajas, v.cajaId, { vacio: "Elige…" })}</select>` })}
      <div class="solo-transfer">
        ${campo({ label: "A la caja", nombre: "cajaDestinoId", control: html`<select name="cajaDestinoId">${opciones(cat.cajas, v.cajaDestinoId, { vacio: "Elige…" })}</select>` })}
      </div>
      <div class="solo-categoria fila-2">
        ${campo({ label: html`<span class="solo-gasto">¿En qué?</span><span class="solo-ingreso">¿De qué?</span>`, nombre: "categoriaId", control: html`<select name="categoriaId"></select>` })}
        ${campo({ label: html`<span class="solo-gasto">Forma de pago</span><span class="solo-ingreso">Forma de recepción</span>`, nombre: "formaPago",
          control: html`<select name="formaPago"><option value="">—</option>${FORMAS_PAGO.map((f) => html`<option value="${f}" ${f === v.formaPago ? "selected" : ""}>${f}</option>`)}</select>` })}
      </div>
    </div>

    <details class="mas-detalles" ${detallesAbiertos ? "open" : ""}>
      <summary>Más detalles <span class="texto-sec">(fecha, nota, cuenta)</span></summary>
      <div class="grupo">
        <div class="fila-2">
          ${campo({ label: "Fecha", nombre: "fecha", control: html`<input type="date" name="fecha" value="${v.fecha}" required />` })}
          ${campo({ label: "Nota", nombre: "nota", control: html`<input name="nota" maxlength="500" value="${v.nota || ""}" placeholder="Opcional" />` })}
        </div>
        <div class="fila-2">
          ${campo({ label: html`<span class="solo-no-transfer">Cuenta</span><span class="solo-transfer">Cuenta de origen</span>`, nombre: "cuentaId",
            control: html`<select name="cuentaId">${opciones(cat.cuentas, v.cuentaId, { vacio: "Elige…" })}</select>` })}
          <div class="solo-transfer">${campo({ label: "Cuenta de destino", nombre: "cuentaDestinoId",
            control: html`<select name="cuentaDestinoId">${opciones(cat.cuentas, v.cuentaDestinoId, { vacio: "Elige…" })}</select>` })}</div>
        </div>
        <p class="campo__ayuda">La cuenta se elige sola según la caja; cámbiala solo si el dinero está en otra.</p>
        ${editando && tipoGrupo !== "otro" ? "" : html`<label class="otro-tipo"><input type="radio" name="tipoGrupo" value="otro" ${tipoGrupo === "otro" ? "checked" : ""} />
          <span>Registrar un <strong>saldo inicial</strong> o un <strong>ajuste</strong> de saldo</span></label>`}
      </div>
    </details>

    <button type="submit" class="btn btn--primario btn--bloque">${editando ? "Guardar cambios" : "Guardar"}</button>
  </form>`;
}

function tipoActual(form) {
  const grupo = form.tipoGrupo.value;
  return grupo === "otro" ? form.tipoOtro.value : grupo;
}

const etiquetaCategoria = (c) => c.esFinanciamiento ? `${c.nombre} (no cuenta como ingreso)` : c.nombre;

/** Ajusta qué secciones se ven y las categorías según el tipo. */
function sincronizarTipo(form, cat, categoriaPreferida) {
  const tipo = tipoActual(form);
  form.dataset.tipo = tipo;
  const sel = form.categoriaId;
  if (tipo === "gasto" || tipo === "ingreso") {
    const previo = categoriaPreferida ?? sel.value;
    render(sel, opciones(cat.categorias.filter((c) => c.tipo === tipo), null, { vacio: "Elige…", etiqueta: etiquetaCategoria }));
    if ([...sel.options].some((o) => o.value === previo)) sel.value = previo;
    else sel.value = leerLocal(CLAVE_ULTIMO(tipo), {}).categoriaId || "";
  }
}

function leerEntrada(form) {
  const tipo = tipoActual(form);
  return {
    tipo,
    montoCentavos: parseMonto(form.monto.value),
    fecha: form.fecha.value,
    cajaId: form.cajaId.value,
    cuentaId: form.cuentaId.value,
    cajaDestinoId: tipo === "transferencia" ? form.cajaDestinoId.value : null,
    cuentaDestinoId: tipo === "transferencia" ? form.cuentaDestinoId.value : null,
    categoriaId: tipo === "gasto" || tipo === "ingreso" ? form.categoriaId.value : null,
    direccion: tipo === "ajuste" ? form.direccion.value : null,
    formaPago: tipo === "gasto" || tipo === "ingreso" ? form.formaPago.value : null,
    nota: form.nota.value,
  };
}

/**
 * Abre el formulario. opciones: { movimiento } para editar,
 * { tipo, cajaId, cuentaId } para prellenar uno nuevo.
 */
export function abrirFormularioMovimiento({ movimiento = null, ...preset } = {}) {
  const uid = getState().user?.uid;
  if (!uid) return;
  if (!movimiento && cajasActivas().length === 0) {
    toastError("Primero crea al menos una caja.");
    return;
  }
  const editando = !!movimiento;
  const cat = catalogos(movimiento);
  const v = valoresIniciales(movimiento, preset);

  // Al pagar desde Plan llega { vinculo, titulo }; al editar se conserva el vínculo existente.
  const vinculo = editando ? vinculoDe(movimiento) : vinculoDe(preset.vinculo);
  const capa = abrirCapa({
    titulo: preset.titulo || (editando ? `Editar ${ETIQUETA_TIPO[movimiento.tipo].toLowerCase()}` : "Nuevo movimiento"),
    contenido: plantilla(v, cat, editando),
  });
  const form = capa.cuerpo.querySelector("form");
  if (Object.keys(vinculo).length) {
    // El tipo queda fijo: un pago de obligación/deuda es un gasto.
    form.querySelector(".segmentado").classList.add("segmentado--bloqueado");
    form.querySelectorAll('input[name="tipoGrupo"]').forEach((r) => { r.disabled = !r.checked; });
    if (preset.aviso) {
      const p = document.createElement("p");
      p.className = "aviso aviso--ok";
      p.textContent = preset.aviso;
      form.prepend(p);
    }
  }
  sincronizarTipo(form, cat, v.categoriaId);

  form.addEventListener("change", (e) => {
    if (["tipoGrupo", "tipoOtro"].includes(e.target.name)) sincronizarTipo(form, cat);
    // Al cambiar de caja, sugerir su cuenta predeterminada.
    if (e.target.name === "cajaId" || e.target.name === "cajaDestinoId") {
      const caja = cajaPorId(e.target.value);
      const cuentaSel = e.target.name === "cajaId" ? form.cuentaId : form.cuentaDestinoId;
      if (caja?.cuentaPredeterminadaId && [...cuentaSel.options].some((o) => o.value === caja.cuentaPredeterminadaId)) {
        cuentaSel.value = caja.cuentaPredeterminadaId;
      }
    }
  });

  form.monto.addEventListener("blur", () => {
    const c = parseMonto(form.monto.value);
    if (c != null) form.monto.value = centavosATexto(c);
  });

  let enviando = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (enviando) return;
    const entrada = { ...leerEntrada(form), ...vinculo };
    const { ok, errores } = validarMovimiento(entrada, cat);
    if (!ok) {
      if (["cuentaId", "cuentaDestinoId", "fecha", "nota"].some((k) => errores[k])) form.querySelector(".mas-detalles").open = true;
      mostrarErrores(form, errores);
      return;
    }
    mostrarErrores(form, {});

    enviando = true;
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      if (!editando) {
        const dup = buscarDuplicado(entrada, await movimientosRepo.similares(uid, entrada));
        if (dup) {
          const seguir = await confirmar({
            titulo: "¿Ya lo registraste?",
            mensaje: `Hace unos minutos se registró un ${ETIQUETA_TIPO[dup.tipo].toLowerCase()} igual de ${formatMonto(dup.montoCentavos)} en la misma caja y cuenta.`,
            botonConfirmar: "Registrar de todos modos",
          });
          if (!seguir) return;
        }
      }

      const onError = (err) => toastError(mensajeDeError(err, "No se pudo guardar el movimiento."));
      if (editando) {
        const cambio = movimientosRepo.editar(uid, movimiento, entrada, { onError });
        capa.cerrar();
        toast(cambio ? "✓ Cambios guardados" : "Sin cambios");
      } else {
        movimientosRepo.crear(uid, entrada, { onError });
        guardarLocal("fr.ultimoTipo", entrada.tipo);
        guardarLocal(CLAVE_ULTIMO(entrada.tipo), {
          cajaId: entrada.cajaId, cuentaId: entrada.cuentaId, categoriaId: entrada.categoriaId,
          cajaDestinoId: entrada.cajaDestinoId, cuentaDestinoId: entrada.cuentaDestinoId, formaPago: entrada.formaPago,
        });
        capa.cerrar();
        toast(navigator.onLine ? "✓ Movimiento registrado" : "✓ Movimiento registrado · se sincronizará al reconectar");
      }
    } catch (err) {
      toastError(mensajeDeError(err, "No se pudo guardar el movimiento."));
    } finally {
      enviando = false;
      boton.disabled = false;
    }
  });

  // El foco dentro del mismo toque abre el teclado numérico en iOS.
  if (!editando) form.monto.focus();
  if (!editando && preset.montoCentavos) form.monto.select();
  return capa;
}


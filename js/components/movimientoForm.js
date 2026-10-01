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
    cajaDestinoId: ultimo.cajaDestinoId || "",
    cuentaDestinoId: ultimo.cuentaDestinoId || "",
    categoriaId: ultimo.categoriaId || "",
    direccion: "entrada",
    nota: "",
    monto: "",
  };
}

function plantilla(v, cat, editando) {
  const tipoGrupo = ["apertura", "ajuste"].includes(v.tipo) ? "otro" : v.tipo;
  return html`<form class="form-mov" data-tipo="${v.tipo}" novalidate>
    ${segmentado("tipoGrupo", [
      { valor: "gasto", label: "Gasto" },
      { valor: "ingreso", label: "Ingreso" },
      { valor: "transferencia", label: "Transferir" },
      { valor: "otro", label: "Otro" },
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
      <span class="visually-hidden">Monto</span>
      <span class="monto-grande__signo">$</span>
      <input name="monto" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${v.monto}" enterkeyhint="done" />
    </label>
    <span class="campo__error campo__error--centro" data-error="montoCentavos"></span>

    <div class="grupo">
      <p class="grupo__titulo solo-transfer">Desde</p>
      <div class="fila-2">
        ${campo({ label: "Caja", nombre: "cajaId", control: html`<select name="cajaId">${opciones(cat.cajas, v.cajaId, { vacio: "Elige…" })}</select>` })}
        ${campo({ label: "Cuenta", nombre: "cuentaId", control: html`<select name="cuentaId">${opciones(cat.cuentas, v.cuentaId, { vacio: "Elige…" })}</select>` })}
      </div>
      <div class="solo-transfer">
        <p class="grupo__titulo">Hacia</p>
        <div class="fila-2">
          ${campo({ label: "Caja", nombre: "cajaDestinoId", control: html`<select name="cajaDestinoId">${opciones(cat.cajas, v.cajaDestinoId, { vacio: "Elige…" })}</select>` })}
          ${campo({ label: "Cuenta", nombre: "cuentaDestinoId", control: html`<select name="cuentaDestinoId">${opciones(cat.cuentas, v.cuentaDestinoId, { vacio: "Elige…" })}</select>` })}
        </div>
      </div>
      <div class="solo-categoria">
        ${campo({ label: "Categoría", nombre: "categoriaId", control: html`
<select name="categoriaId"></select>` })}
      </div>
      <div class="fila-2">
        ${campo({ label: "Fecha", nombre: "fecha", control: html`<input type="date" name="fecha" value="${v.fecha}" required />` })}
        ${campo({ label: "Nota", nombre: "nota", control: html`<input name="nota" maxlength="500" value="${v.nota || ""}" placeholder="Opcional" />` })}
      </div>
    </div>

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

  const capa = abrirCapa({
    titulo: editando ? `Editar ${ETIQUETA_TIPO[movimiento.tipo].toLowerCase()}` : "Nuevo movimiento",
    contenido: plantilla(v, cat, editando),
  });
  const form = capa.cuerpo.querySelector("form");
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
    const entrada = leerEntrada(form);
    const { ok, errores } = validarMovimiento(entrada, cat);
    if (!ok) { mostrarErrores(form, errores); return; }
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
          cajaDestinoId: entrada.cajaDestinoId, cuentaDestinoId: entrada.cuentaDestinoId,
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
  return capa;
}


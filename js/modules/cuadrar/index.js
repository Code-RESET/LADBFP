// ============================================================
// modules/cuadrar/index.js
// "Cuadrar con mis bancos": una tarjeta por banco y por tarjeta
// de crédito con lo que dice la app. Escribes lo que dice tu banco
// hoy (con apartados y cajitas) y la app muestra la diferencia y a
// qué caja va. «Cuadrar» guarda todos los ajustes juntos (un solo
// batch, con Deshacer). Cálculos en domain/cuadre.js.
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { parseMonto, centavosATexto, formatMonto } from "../../core/money.js";
import { hoy } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, subscribe, catalogosListos, planListo, cajaPorId, cajasActivas } from "../../core/state.js";
import { cuadreDe, cajaSugerida, enApp, patrimonioReal } from "../../domain/cuadre.js";
import { esTarjeta } from "../../domain/tarjetas.js";
import { saldosPor } from "../../domain/saldos.js";
import { validarMovimiento, construirMovimiento } from "../../domain/movimientos.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { skeletonLista } from "../../components/states.js";
import { confirmar } from "../../components/confirmation.js";
import { toast, toastError } from "../../components/toast.js";
import { icon } from "../../components/icons.js";
import { abrirBanco } from "../cuentas/index.js";
import { abrirCaja } from "../cajas/index.js";

const onError = (err) => toastError(mensajeDeError(err, "No se pudo cuadrar."));

export function render(container) {
  const valores = new Map(); // cuentaId → { texto, cajaId }
  let firma = null;

  const visibles = (s, hoyF) => s.cuentas.filter((c) => c.activa !== false || enApp({ cuenta: c, agregados: s.agregados, deudas: s.deudas, hoy: hoyF }) !== 0);

  /** Cuadre de una cuenta con lo escrito (o null si no se ha escrito nada válido). */
  function calcular(c, s, hoyF) {
    const v = valores.get(c.id);
    const real = v?.texto?.trim() ? parseMonto(v.texto) : null;
    if (real == null) return v?.texto?.trim() ? { invalido: true } : null;
    const cajaId = v.cajaId || cajaSugerida({ cuenta: c, agregados: s.agregados, cajas: s.cajas });
    return { ...cuadreDe({ cuenta: c, real, cajaId, agregados: s.agregados, deudas: s.deudas, hoy: hoyF }), cajaId };
  }

  function resultado(c, s, hoyF) {
    const r = calcular(c, s, hoyF);
    if (!r) return "";
    if (r.invalido) return html`<span class="texto-peligro">Escribe una cantidad (ej. 8000.50).</span>`;
    if (!r.diferencia) return html`<span class="monto--positivo">✓ Cuadra</span>`;
    const tarjeta = esTarjeta(c);
    const monto = formatMonto(Math.abs(r.diferencia));
    const texto = tarjeta ? (r.diferencia > 0 ? `Debes ${monto} más que en la app` : `Debes ${monto} menos que en la app`)
      : (r.diferencia > 0 ? `Faltan ${monto} en la app` : `Sobran ${monto} en la app`);
    const saldoCaja = (saldosPor(s.agregados, "porCaja")[r.cajaId] || 0) + r.efectoCaja;
    return html`<span class="cuadre__diferencia">${texto}${r.movimiento?.tipo === "apertura" ? " (saldo inicial)" : ""}</span>
      <label class="cuadre__caja"><span>${r.efectoCaja > 0 ? "Se suman a" : "Se restan de"}</span>
        <select data-caja aria-label="Caja para ${c.nombre}">${cajasActivas().map((x) => html`<option value="${x.id}" ${x.id === r.cajaId ? "selected" : ""}>${x.nombre}</option>`)}</select></label>
      ${saldoCaja < 0 ? html`<span class="texto-aviso cuadre__aviso">«${cajaPorId(r.cajaId)?.nombre || "Esa caja"}» quedaría en ${formatMonto(saldoCaja)}: elige otra caja si ese dinero era de otra.</span>` : ""}`;
  }

  function fila(c, s, hoyF) {
    const tarjeta = esTarjeta(c);
    const app = enApp({ cuenta: c, agregados: s.agregados, deudas: s.deudas, hoy: hoyF });
    return html`<li class="card cuadre" data-cuenta="${c.id}">
      <div class="cuadre__cabecera">
        <span class="fila__icono">${icon(tarjeta ? "tarjeta" : "cuentas", { size: 18 })}</span>
        <span class="cuadre__nombre">${c.nombre}${c.activa === false ? " (desactivado)" : ""}</span>
        <span class="cuadre__app">${tarjeta ? "Debes en la app" : "En la app"}<strong>${formatMonto(app)}</strong></span>
      </div>
      <label class="cuadre__real"><span>${tarjeta ? "Saldo actual de tu tarjeta" : "En tu banco hoy"}</span>
        <input data-real inputmode="decimal" autocomplete="off" placeholder="$0.00" value="${valores.get(c.id)?.texto || ""}"
          aria-label="${tarjeta ? `Lo que debes en ${c.nombre}` : `Lo que tienes en ${c.nombre}`}" /></label>
      <div class="cuadre__resultado" data-resultado>${resultado(c, s, hoyF)}</div>
    </li>`;
  }

  /** Cuántas cuentas cambian y si se puede cuadrar. */
  function pendientes(s, hoyF) {
    return visibles(s, hoyF).map((c) => ({ cuenta: c, r: calcular(c, s, hoyF) })).filter((x) => x.r && !x.r.invalido && x.r.movimiento);
  }

  function pintarBoton() {
    const s = getState();
    const n = pendientes(s, hoy()).length;
    const boton = container.querySelector('[data-accion="cuadrar"]');
    if (!boton) return;
    boton.disabled = n === 0;
    boton.textContent = n ? `Cuadrar ${n === 1 ? "1 cuenta" : `${n} cuentas`}` : "Cuadrar";
  }

  function pintar() {
    const s = getState();
    if (!catalogosListos() || !planListo()) { renderHtml(container, skeletonLista(5)); firma = null; return; }
    const hoyF = hoy();
    const cuentas = visibles(s, hoyF);
    // No repintar mientras escribes si nada de lo que se muestra cambió (se perdería el foco).
    const nueva = JSON.stringify([cuentas.map((c) => [c.id, c.nombre, c.activa, c.tipo, enApp({ cuenta: c, agregados: s.agregados, deudas: s.deudas, hoy: hoyF })]),
      s.cajas.map((c) => [c.id, c.nombre, c.activa])]);
    if (nueva === firma) return;
    firma = nueva;
    const p = patrimonioReal({ cuentas: s.cuentas, agregados: s.agregados, deudas: s.deudas, hoy: hoyF });
    const bancos = cuentas.filter((c) => !esTarjeta(c));
    const tarjetas = cuentas.filter(esTarjeta);
    renderHtml(container, html`
      <p class="texto-sec intro">Abre la app de cada banco y escribe cuánto tienes hoy, <strong>sumando apartados y cajitas</strong>.
        En cada tarjeta escribe su saldo actual (lo que debes). La app ajusta la diferencia en la caja que elijas.</p>
      <div class="card cuadre__resumen" aria-label="Según la app">
        <div><span class="kpi__etiqueta">Tienes</span><strong>${formatMonto(p.tienes)}</strong></div>
        <div><span class="kpi__etiqueta">Debes</span><strong class="${p.debes ? "monto--negativo" : ""}">${formatMonto(p.debes)}</strong></div>
        <div><span class="kpi__etiqueta">Te queda</span><strong>${formatMonto(p.neto)}</strong></div>
      </div>

      <h2 class="seccion__titulo">Bancos y ahorros</h2>
      ${bancos.length ? html`<ul class="lista-cuadre">${bancos.map((c) => fila(c, s, hoyF))}</ul>` : html`<p class="texto-sec">Aún no tienes bancos en la app.</p>`}
      <div class="cuadre__agregar">
        <button type="button" class="btn-texto" data-accion="banco">+ Banco que falta</button>
        <button type="button" class="btn-texto" data-accion="caja">+ Dinero en una caja nueva</button>
      </div>

      <h2 class="seccion__titulo">Tarjetas de crédito</h2>
      ${tarjetas.length ? html`<ul class="lista-cuadre">${tarjetas.map((c) => fila(c, s, hoyF))}</ul>` : html`<p class="texto-sec">Aún no tienes tarjetas en la app.</p>`}
      <div class="cuadre__agregar"><a class="btn-texto" href="#/tarjetas">+ Tarjeta que falta</a></div>

      <button type="button" class="btn btn--primario btn--bloque" data-accion="cuadrar" disabled>Cuadrar</button>
      <p class="campo__ayuda">Los ajustes no cuentan como ingreso ni gasto: son para rendimientos, descuentos automáticos o algo que no registraste.
        Quedan en Todos los movimientos y se pueden anular.</p>`);
    pintarBoton();
  }

  function actualizarFila(li) {
    const s = getState();
    const c = s.cuentas.find((x) => x.id === li.dataset.cuenta);
    if (!c) return;
    renderHtml(li.querySelector("[data-resultado]"), resultado(c, s, hoy()));
    pintarBoton();
  }

  const alEscribir = (e) => {
    const li = e.target.closest("[data-cuenta]");
    if (!li) return;
    const id = li.dataset.cuenta;
    if (e.target.matches("[data-real]")) valores.set(id, { ...valores.get(id), texto: e.target.value });
    else if (e.target.matches("[data-caja]")) valores.set(id, { ...valores.get(id), cajaId: e.target.value });
    else return;
    actualizarFila(li);
  };
  container.addEventListener("input", alEscribir);
  container.addEventListener("change", alEscribir);

  async function cuadrar() {
    const s = getState();
    const hoyF = hoy();
    const lista = pendientes(s, hoyF);
    if (!lista.length) return;
    const movs = lista.map((x) => x.r.movimiento);
    const malo = movs.map((m) => validarMovimiento(m)).find((v) => !v.ok);
    if (malo) { toastError(Object.values(malo.errores)[0]); return; }
    const detalle = lista.map(({ cuenta, r }) => `${cuenta.nombre}: ${r.efectoCaja > 0 ? "+" : "−"}${formatMonto(Math.abs(r.diferencia))} en ${cajaPorId(r.cajaId)?.nombre || "—"}`).join(" · ");
    const ok = await confirmar({
      titulo: lista.length === 1 ? "¿Cuadrar 1 cuenta?" : `¿Cuadrar ${lista.length} cuentas?`,
      mensaje: `${detalle}. No cuentan como ingreso ni gasto.`,
      botonConfirmar: "Cuadrar",
    });
    if (!ok) return;
    const uid = s.user?.uid;
    if (!uid) return;
    const ids = movimientosRepo.crearVarios(uid, movs, { onError, origen: "cuadre" });
    valores.clear(); // empezar de cero: lo que escribas después se compara con lo nuevo
    firma = null;
    pintar();
    toast("✓ Listo: la app ya dice lo mismo que tus bancos", {
      duracion: 6000,
      accion: { label: "Deshacer", onClick: () => movimientosRepo.anularVarios(uid, ids.map((id, i) => ({ id, ...construirMovimiento(movs[i]) })), "Deshecho al cuadrar", { onError }) },
    });
  }

  const quitar = on(container, "click", "[data-accion]", (e, el) => {
    const accion = el.dataset.accion;
    if (accion === "cuadrar") return cuadrar();
    if (accion === "banco") return abrirBanco();
    if (accion === "caja") return abrirCaja();
  });
  const cancelar = subscribe(pintar);
  pintar();
  return () => {
    cancelar();
    quitar();
    container.removeEventListener("input", alEscribir);
    container.removeEventListener("change", alEscribir);
  };
}

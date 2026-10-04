// ============================================================
// modules/dashboard/index.js
// Inicio = hoja "Balance" de la plantilla del usuario:
//   Balance del mes = Ingresos − Gastos (pagados y pendientes).
//   Tres cifras: Ingresos · Pagado · Pendiente.
//   Debajo: lo que falta pagar este mes (con botón Pagar),
//   la gráfica de los últimos meses (plegada), cajas y
//   últimos movimientos. "¿Cómo se calcula?" lo explica.
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { mesDe, hoy, nombreMes, formatFecha } from "../../core/dates.js";
import { subscribe, getState, catalogosListos } from "../../core/state.js";
import { mensajeDeError } from "../../core/errors.js";
import { saldosPor, patrimonio } from "../../domain/saldos.js";
import { cuentaParaGasto } from "../../domain/catalogos.js";
import { balanceDelMes } from "../../domain/mes.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { perfilRepo } from "../../data/perfilRepo.js";
import { skeletonTarjeta, skeletonLista, estadoVacio } from "../../components/states.js";
import { filaMovimiento } from "../../components/movimientoItem.js";
import { abrirDetalleMovimiento } from "../../components/movimientoDetalle.js";
import { abrirCapa } from "../../components/modal.js";
import { activarTooltips } from "../../components/charts.js";
import { icon } from "../../components/icons.js";
import { pagarEvento } from "../plan/acciones.js";
import { pasoCatalogos, pasoSaldosIniciales } from "./bienvenida.js";
import { calcularSerie, graficaMeses, tooltipMetricas } from "./metricas.js";

export function render(container, ctx) {
  const uid = ctx.user.uid;
  let ultimos = null;
  let errorUltimos = null;
  let serie = [];
  let graficaAbierta = false;

  const cancelarUltimos = movimientosRepo.escucharUltimos(uid, 3,
    (items) => { ultimos = items; pintar(); },
    (err) => { errorUltimos = mensajeDeError(err); pintar(); });

  let modo = null; // 'cargando' | 'conectando' | 'catalogos' | 'saldos:…' | 'vista'

  function pintar() {
    const s = getState();
    const nuevoModo = !catalogosListos() ? "cargando"
      : s.cajas.length === 0 ? (s.cajasDesdeCache ? "conectando" : "catalogos")
      : (Object.values(s.agregados).every((a) => !a?.n) && !s.perfil?.config?.saldosIniciales) ? "saldos"
      : "vista";
    // El asistente tiene formularios: no repintarlo mientras no cambie (se perdería lo escrito).
    const clave = nuevoModo === "saldos" ? `saldos:${s.cajas.map((c) => c.id)}:${s.cuentas.map((c) => c.id)}` : nuevoModo;
    if (clave === modo && nuevoModo !== "vista") return;
    modo = clave;

    if (nuevoModo === "cargando") renderHtml(container, html`${skeletonTarjeta()}${skeletonLista(4)}`);
    else if (nuevoModo === "conectando") renderHtml(container, estadoVacio({ icono: "nube", titulo: "Conectando…", texto: "Descargando tus datos por primera vez en este dispositivo." }));
    else if (nuevoModo === "catalogos") pasoCatalogos(container);
    else if (nuevoModo === "saldos") pasoSaldosIniciales(container, { onListo: () => perfilRepo.guardarConfig(uid, { saldosIniciales: "listo" }) });
    else renderHtml(container, vista(s));
  }

  let pendientes = [];

  function vista(s) {
    serie = calcularSerie(s.agregados, s.categorias);
    const cs = getComputedStyle(container);
    const anchoCard = Math.max(0, container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 32);
    const mes = mesDe(hoy());
    const b = balanceDelMes({ mes, obligaciones: s.obligaciones, deudas: s.deudas, recurrentes: s.recurrentes,
      agregados: s.agregados, categorias: s.categorias, hoy: hoy() });
    pendientes = b.fijos.filter((g) => g.estado !== "Pagado");
    const porCaja = saldosPor(s.agregados, "porCaja");
    const cajas = s.cajas.filter((c) => c.activa !== false || porCaja[c.id]);
    const enCajas = patrimonio(s.agregados);
    const soloMes = nombreMes(mes).split(" ")[0];

    return html`
      <section class="hero card">
        <p class="hero__etiqueta">Balance de ${soloMes}</p>
        <p class="hero__monto ${b.balance < 0 ? "monto--negativo" : ""}">${formatMonto(b.balance)}</p>
        <p class="hero__frase">${b.balance < 0
          ? html`Tus gastos del mes superan lo que entró por <strong>${formatMonto(-b.balance)}</strong>.`
          : html`Es lo que te queda si pagas todos tus gastos del mes.`}</p>
        <div class="tres-cifras">
          <a href="#/ingresos"><span>Ingresos</span><strong class="monto--positivo">${formatMonto(b.ingresos)}</strong></a>
          <a href="#/gastos"><span>Pagado</span><strong>${formatMonto(b.pagado)}</strong></a>
          <a href="#/gastos"><span>Pendiente</span><strong class="${b.vencido ? "monto--negativo" : ""}">${formatMonto(b.pendiente)}</strong></a>
        </div>
        <button type="button" class="btn-texto hero__ayuda" data-accion="explicar">¿Cómo se calcula?</button>
      </section>

      <div class="acciones-rapidas">
        <button type="button" class="accion-rapida" data-accion="nuevo-movimiento" data-tipo="gasto">${icon("gasto")}<span>Gasto</span></button>
        <button type="button" class="accion-rapida" data-accion="nuevo-movimiento" data-tipo="ingreso">${icon("ingreso")}<span>Ingreso</span></button>
        <button type="button" class="accion-rapida" data-accion="nuevo-movimiento" data-tipo="transferencia">${icon("transferencia")}<span>Mover dinero</span></button>
      </div>

      <section class="seccion">
        <div class="seccion__cabecera"><h2 class="seccion__titulo">Falta pagar en ${soloMes}</h2><a href="#/gastos" class="link">Gastos del mes</a></div>
        ${pendientes.length ? html`<ul class="lista card card--lista">${pendientes.slice(0, 5).map((g, i) => html`<li>
          <div class="fila fila--gasto">
            <span class="dia ${g.estado === "Vencido" ? "dia--vencido" : ""}">${g.dia}</span>
            <span class="fila__texto"><span class="fila__titulo">${g.nombre}</span>
              <span class="fila__sub ${g.estado === "Vencido" ? "texto-peligro" : ""}">${g.estado === "Vencido" ? "Vencido" : `Vence el ${formatFecha(g.fecha).split(" ").slice(0, 2).join(" ")}`}${g.formaPago ? ` · ${g.formaPago}` : ""}</span></span>
            <span class="fila__monto-doble">
              <span class="fila__monto">${formatMonto(g.pendiente)}</span>
              <button type="button" class="btn btn--chico ${g.estado === "Vencido" ? "btn--chico-peligro" : ""}" data-pagar-fijo="${i}">Pagar</button>
            </span>
          </div></li>`)}</ul>
          ${pendientes.length > 5 ? html`<p class="campo__ayuda"><a href="#/gastos">y ${pendientes.length - 5} más…</a></p>` : ""}`
          : b.fijos.length ? html`<p class="aviso aviso--ok">✓ Ya pagaste todos tus gastos fijos de ${soloMes}.</p>`
          : html`<p class="texto-sec intro">Agrega tus gastos fijos en <a href="#/gastos">Gastos</a> para ver aquí lo que falta pagar.</p>`}
      </section>

      ${graficaMeses(serie, anchoCard, { abierta: graficaAbierta })}

      <section class="seccion">
        <div class="seccion__cabecera"><h2 class="seccion__titulo">Dinero en tus cajas · <span class="total-cajas">${formatMonto(enCajas)}</span></h2><a href="#/cajas" class="link">Editar</a></div>
        <ul class="lista card card--lista">${cajas.map((c) => html`<li><a class="fila" href="#/movimientos?caja=${c.id}">
          <span class="punto" style="background:${c.color || "var(--accent)"}"></span>
          <span class="fila__texto"><span class="fila__titulo">${c.nombre}</span>
            ${!cuentaParaGasto(c) ? html`<span class="fila__sub">${c.tipo === "ahorro" ? "Ahorro" : "Capital"}</span>` : ""}</span>
          <span class="fila__monto ${porCaja[c.id] < 0 ? "monto--negativo" : ""}">${formatMonto(porCaja[c.id] || 0)}</span>
          ${icon("chevron", { size: 16, clase: "fila__chevron" })}
        </a></li>`)}</ul>
      </section>

      <section class="seccion">
        <div class="seccion__cabecera"><h2 class="seccion__titulo">Últimos movimientos</h2><a href="#/movimientos" class="link">Ver todos</a></div>
        ${errorUltimos ? html`<p class="texto-sec">${errorUltimos}</p>`
          : ultimos == null ? skeletonLista(3)
          : ultimos.length === 0 ? estadoVacio({ titulo: "Todavía no tienes movimientos.", accion: { label: "+ Registrar movimiento", accion: "nuevo-movimiento" } })
          : html`<ul class="lista card card--lista">${ultimos.map(filaMovimiento)}</ul>`}
      </section>`;
  }

  const quitarPagar = on(container, "click", "[data-pagar-fijo]", (e, el) => {
    const g = pendientes[Number(el.dataset.pagarFijo)];
    if (g) pagarEvento({ ...g, cajaId: g.ref.cajaId, cuentaId: g.ref.cuentaId, monto: g.pendiente });
  });
  const quitarExplicar = on(container, "click", "[data-accion='explicar']", () => explicar(getState()));
  const quitarClick = on(container, "click", "[data-mov]", (e, el) => {
    const m = ultimos?.find((x) => x.id === el.dataset.mov);
    if (m) abrirDetalleMovimiento(m);
  });
  // Recordar si la gráfica está abierta para no cerrarla al repintar.
  const alAbrir = (e) => { if (e.target.matches?.(".mes-grafica")) graficaAbierta = e.target.open; };
  container.addEventListener("toggle", alAbrir, true);

  const quitarTooltips = activarTooltips(container, (grafica, i) => tooltipMetricas(serie, grafica, i));

  // La gráfica se dibuja al ancho real: repintar si cambia (girar el teléfono, ventana).
  let anchoPrevio = container.clientWidth;
  const observador = new ResizeObserver(() => {
    if (Math.abs(container.clientWidth - anchoPrevio) > 8) { anchoPrevio = container.clientWidth; pintar(); }
  });
  observador.observe(container);

  const cancelarState = subscribe(pintar);
  pintar();

  return () => {
    cancelarUltimos();
    cancelarState();
    quitarClick();
    quitarPagar();
    quitarExplicar();
    quitarTooltips();
    container.removeEventListener("toggle", alAbrir, true);
    observador.disconnect();
  };
}

/** Hoja "¿Cómo se calcula?": el balance explicado con tus datos reales. */
function explicar(s) {
  const mes = mesDe(hoy());
  const b = balanceDelMes({ mes, obligaciones: s.obligaciones, deudas: s.deudas, recurrentes: s.recurrentes,
    agregados: s.agregados, categorias: s.categorias, hoy: hoy() });
  const pend = b.fijos.filter((g) => g.pendiente > 0);
  abrirCapa({
    titulo: "¿Cómo se calcula?",
    contenido: html`<div class="explicacion">
      <p>Igual que en tu hoja de Excel: <strong>Balance = Ingresos − todos los gastos del mes</strong> (los que ya pagaste y los que faltan).</p>
      <dl class="lista-datos">
        <div><dt>Ingresos del mes</dt><dd>${formatMonto(b.ingresos)}</dd></div>
        <div><dt>Gastos ya pagados</dt><dd>-${formatMonto(b.pagado)}</dd></div>
        <div><dt>Gastos que faltan</dt><dd>-${formatMonto(b.pendiente)}</dd></div>
        <div class="lista-datos__total"><dt>Balance</dt><dd class="${b.balance < 0 ? "monto--negativo" : ""}">${formatMonto(b.balance)}</dd></div>
      </dl>
      ${pend.length ? html`<p class="grupo__titulo">Lo que falta</p><dl class="lista-datos lista-datos--compacta">
        ${pend.map((g) => html`<div><dt>${g.nombre} · día ${g.dia}${g.estado === "Vencido" ? " (vencido)" : ""}</dt><dd>-${formatMonto(g.pendiente)}</dd></div>`)}</dl>` : ""}
      ${b.porCobrar ? html`<p class="campo__ayuda">Aún esperas ${formatMonto(b.porCobrar)} de ingresos fijos este mes; se suman cuando los registres.</p>` : ""}
      <p class="campo__ayuda">No cuentan los préstamos que te hicieron ni el dinero que pasas de una caja a otra.</p>
      <p class="campo__ayuda">¿Quieres saber cuánto puedes gastar hoy considerando los próximos 30 días? <a href="#/plan">Ver en Más → Proyección</a>.</p>
    </div>`,
  });
}

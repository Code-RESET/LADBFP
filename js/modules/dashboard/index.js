// ============================================================
// modules/dashboard/index.js
// "Mi mes": la app entera en una pantalla, como la hoja de Excel.
//   Te quedan = Ingresos − Gastos del mes (pagados y pendientes)
//   GASTOS    fijos y de una vez, por día; ☐ → ☑ = pagado
//   INGRESOS  igual; ☐ → ☑ = recibido
//   MIS CAJAS cuánto tiene cada caja hoy
// Tocar un renglón lo edita. ＋ registra (nombre + monto).
// Arriba, estilo Clima de Samsung (cielo.js): el cielo cambia según
// cómo vas (bien / justo / mal), número gigante, paisaje, los
// próximos 7 días y una tarjeta de consejo.
// Lo avanzado (deudas, presupuesto, proyección, cuentas) vive en Más.
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { mesDe, hoy, nombreMes } from "../../core/dates.js";
import { subscribe, getState, catalogosListos, planListo, cajaPorId, categoriaPorId } from "../../core/state.js";
import { sincronizarBarraEstado } from "../../core/theme.js";
import { mensajeDeError } from "../../core/errors.js";
import { saldosPor, patrimonio } from "../../domain/saldos.js";
import { balanceDelMes, ingresosFijosDelMes } from "../../domain/mes.js";
import { estadoDelMes, pronosticoDias, consejo } from "../../domain/pronostico.js";
import { diagnosticar } from "../../domain/diagnostico.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { perfilRepo } from "../../data/perfilRepo.js";
import { reemplazarParams } from "../../router.js";
import { skeletonTarjeta, skeletonLista, estadoVacio } from "../../components/states.js";
import { moverMes } from "../../components/selectorMes.js";
import { leerLocal, guardarLocal } from "../../components/fields.js";
import { toast } from "../../components/toast.js";
import { activarTooltips } from "../../components/charts.js";
import { icon } from "../../components/icons.js";
import { abrirRegistro } from "../../components/registroSimple.js";
import { marcarPagado, desmarcarPagado } from "../../components/marcarPagado.js";
import { pasoCatalogos, pasoSaldosIniciales } from "./bienvenida.js";
import { calcularSerie, graficaMeses, tooltipMetricas } from "./metricas.js";
import { heroCielo, tarjetaPronostico, tarjetaConsejo, detalleDia } from "./cielo.js";

const CLAVE_CONSEJOS = "fr.consejos.cerrados";

/** El "clima" del mes pinta el cielo de toda la pantalla (themes.css: [data-estado]). */
function ponerEstado(estado) {
  const root = document.documentElement;
  if ((root.dataset.estado || null) === (estado || null)) return;
  if (estado) root.dataset.estado = estado;
  else delete root.dataset.estado;
  sincronizarBarraEstado();
}

/** Renglones de la hoja: fijos (marcables) + registrados de una vez, ordenados por día. */
function renglones(fijos, sueltos, hechoSi) {
  return [
    ...fijos.map((f) => ({ fijo: f, dia: f.dia, nombre: f.nombre, monto: f.monto, cajaId: f.ref.cajaId,
      hecho: f.estado === hechoSi, vencido: f.estado === "Vencido", falta: f.pagado > 0 && f.pendiente > 0 ? f.pendiente : 0 })),
    ...sueltos.map((m) => ({ mov: m, dia: Number(m.fecha.slice(8)), nombre: m.nota || categoriaPorId(m.categoriaId)?.nombre || "Sin nombre",
      monto: m.montoCentavos, cajaId: m.cajaId, hecho: true, prestamo: !!categoriaPorId(m.categoriaId)?.esFinanciamiento })),
  ].sort((a, b) => a.dia - b.dia || a.nombre.localeCompare(b.nombre, "es"));
}

function filaHoja(r, i, lista, ingreso) {
  const etiqueta = ingreso ? (r.hecho ? "Recibido" : "Marcar como recibido") : (r.hecho ? "Pagado" : "Marcar como pagado");
  const sub = [
    cajaPorId(r.cajaId)?.nombre,
    r.vencido ? "Vencido" : "",
    r.falta ? `faltan ${formatMonto(r.falta)}` : "",
    r.prestamo ? "préstamo, no cuenta" : "",
  ].filter(Boolean).join(" · ");
  return html`<li><div class="fila fila--hoja ${r.hecho ? "fila--hecha" : ""}">
    ${r.fijo
      ? html`<button type="button" class="casilla ${r.hecho ? "casilla--on" : ""} ${r.vencido ? "casilla--vencida" : ""}" role="checkbox"
          aria-checked="${r.hecho ? "true" : "false"}" aria-label="${r.nombre}: ${etiqueta}" data-marcar="${lista}:${i}">${r.hecho ? "✓" : ""}</button>`
      : html`<span class="casilla casilla--on casilla--fija" aria-hidden="true">✓</span>`}
    <span class="dia ${r.vencido ? "dia--vencido" : ""}">${r.dia}</span>
    <button type="button" class="fila__texto fila__texto--boton" data-abrir="${lista}:${i}">
      <span class="fila__titulo">${r.nombre}${r.fijo ? html` <span class="fijo" title="Se repite cada mes">↻</span>` : ""}</span>
      ${sub ? html`<span class="fila__sub ${r.vencido ? "texto-peligro" : ""}">${sub}</span>` : ""}
    </button>
    <span class="fila__monto ${r.vencido ? "monto--negativo" : ""}">${formatMonto(r.monto)}</span>
  </div></li>`;
}

export function render(container, ctx) {
  const uid = ctx.user.uid;
  let mes = /^\d{4}-\d{2}$/.test(ctx.params.get("mes") || "") ? ctx.params.get("mes") : mesDe(hoy());
  let sueltos = { gasto: null, ingreso: null };
  let errorSueltos = null;
  let filas = { gastos: [], ingresos: [] };
  let serie = [];
  let graficaAbierta = false;
  let modo = null; // 'cargando' | 'conectando' | 'catalogos' | 'saldos:…' | 'vista'
  let dias = null;  // próximos 7 días (solo en el mes actual)
  let viva = true;  // false al salir de la pantalla: una carga que llegue tarde no debe pintar encima de otra

  async function cargarSueltos() {
    const pedido = mes;
    try {
      const [g, i] = await Promise.all([movimientosRepo.delMes(uid, mes, "gasto"), movimientosRepo.delMes(uid, mes, "ingreso")]);
      if (pedido !== mes || !viva) return;
      // Los pagos de gastos/ingresos fijos ya aparecen en su renglón (☑).
      sueltos = { gasto: g.filter((m) => !m.obligacionId && !m.deudaId), ingreso: i.filter((m) => !m.recurrenteId) };
      errorSueltos = null;
    } catch (err) {
      if (!viva) return;
      errorSueltos = mensajeDeError(err, "No se pudieron cargar los registros del mes.");
    }
    pintar();
  }

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

    if (nuevoModo !== "vista") ponerEstado(null);
    if (nuevoModo === "cargando") renderHtml(container, html`${skeletonTarjeta()}${skeletonLista(4)}`);
    else if (nuevoModo === "conectando") renderHtml(container, estadoVacio({ icono: "nube", titulo: "Conectando…", texto: "Descargando tus datos por primera vez en este dispositivo." }));
    else if (nuevoModo === "catalogos") pasoCatalogos(container);
    else if (nuevoModo === "saldos") pasoSaldosIniciales(container, { onListo: () => perfilRepo.guardarConfig(uid, { saldosIniciales: "listo" }) });
    else renderHtml(container, vista(s));
  }

  function seccion({ titulo, total, lista, tipo, filasLista, vacio, ingreso }) {
    return html`<section class="seccion" id="seccion-${lista}">
      <div class="seccion__cabecera">
        <h2 class="seccion__titulo">${titulo} · <span class="${ingreso ? "monto--positivo" : ""}">${formatMonto(total)}</span></h2>
        <button type="button" class="btn-texto" data-nuevo="${tipo}">+ Nuevo</button>
      </div>
      ${errorSueltos ? html`<p class="texto-sec">${errorSueltos}</p>` : ""}
      ${filasLista.length ? html`<ul class="lista card card--lista hoja">${filasLista.map((r, i) => filaHoja(r, i, lista, ingreso))}</ul>`
        : sueltos[tipo] == null && !errorSueltos ? skeletonLista(2)
        : html`<button type="button" class="card hoja-vacia" data-nuevo="${tipo}">${vacio}</button>`}
    </section>`;
  }

  function vista(s) {
    if (!planListo()) return html`${skeletonTarjeta()}${skeletonLista(4)}`;
    const b = balanceDelMes({ mes, obligaciones: s.obligaciones, deudas: s.deudas, recurrentes: s.recurrentes,
      agregados: s.agregados, categorias: s.categorias, hoy: hoy() });
    const ingFijos = ingresosFijosDelMes({ mes, recurrentes: s.recurrentes, agregados: s.agregados });
    filas = {
      gastos: renglones(b.fijos, sueltos.gasto || [], "Pagado"),
      ingresos: renglones(ingFijos, sueltos.ingreso || [], "Recibido"),
    };
    const porCaja = saldosPor(s.agregados, "porCaja");
    const cajas = s.cajas.filter((c) => c.activa !== false || porCaja[c.id]);
    const soloMes = nombreMes(mes).split(" ")[0];
    serie = calcularSerie(s.agregados, s.categorias);
    const cs = getComputedStyle(container);
    const anchoCard = Math.max(0, container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 32);

    const clima = estadoDelMes(b);
    ponerEstado(clima.estado);
    // Pronóstico y consejo solo tienen sentido para el mes que estás viviendo.
    const hoyF = hoy();
    const esActual = mes === mesDe(hoyF);
    dias = esActual ? pronosticoDias({ hoy: hoyF, obligaciones: s.obligaciones, deudas: s.deudas, recurrentes: s.recurrentes, agregados: s.agregados }) : null;
    const aviso = esActual ? consejo({ balance: b, pronostico: dias, hallazgos: diagnosticar({ ...s, hoy: hoyF }), hoy: hoyF }) : null;
    const avisoVisible = aviso && leerLocal(CLAVE_CONSEJOS, {})[aviso.clave] !== hoyF ? aviso : null;

    return html`
      ${heroCielo({ b, mes, clima })}
      ${dias ? tarjetaPronostico({ dias, hoy: hoyF }) : ""}
      ${avisoVisible ? tarjetaConsejo(avisoVisible) : ""}

      ${seccion({ titulo: "Gastos", total: b.totalGastos, lista: "gastos", tipo: "gasto", filasLista: filas.gastos,
        vacio: html`<strong>+ Agrega tu primer gasto</strong><span>Los fijos (hipoteca, internet) y los del día (gasolina, comida).</span>` })}

      ${seccion({ titulo: "Ingresos", total: b.ingresos, lista: "ingresos", tipo: "ingreso", filasLista: filas.ingresos, ingreso: true,
        vacio: html`<strong>+ Agrega tu primer ingreso</strong><span>Nómina, honorarios, cobranza…</span>` })}

      <section class="seccion">
        <div class="seccion__cabecera">
          <h2 class="seccion__titulo">Mis cajas · <span class="total-cajas">${formatMonto(patrimonio(s.agregados))}</span></h2>
          <button type="button" class="btn-texto" data-accion="nuevo-movimiento" data-tipo="transferencia">Mover dinero</button>
        </div>
        <ul class="lista card card--lista">${cajas.map((c) => html`<li><a class="fila" href="#/movimientos?caja=${c.id}">
          <span class="punto" style="background:${c.color || "var(--accent)"}"></span>
          <span class="fila__texto"><span class="fila__titulo">${c.nombre}</span></span>
          <span class="fila__monto ${porCaja[c.id] < 0 ? "monto--negativo" : ""}">${formatMonto(porCaja[c.id] || 0)}</span>
          ${icon("chevron", { size: 16, clase: "fila__chevron" })}
        </a></li>`)}</ul>
        <p class="campo__ayuda">Lo que tiene cada caja hoy. Toca una para ver sus movimientos · <a href="#/cajas">Agregar o editar cajas</a></p>
      </section>

      ${graficaMeses(serie, anchoCard, { abierta: graficaAbierta })}

      <button type="button" class="btn btn--secundario btn--bloque" data-accion="descargar-excel" data-mes="${mes}">⬇ Descargar Excel de ${soloMes}</button>`;
  }

  function cambiarMes(nuevo) {
    mes = nuevo;
    reemplazarParams({ mes: mes === mesDe(hoy()) ? "" : mes });
    sueltos = { gasto: null, ingreso: null };
    firma = firmaMes();
    pintar();
    cargarSueltos();
  }

  async function abrir(r) {
    if (r.mov) return abrirRegistro({ movimiento: r.mov, mes });
    const f = r.fijo;
    // Lo que no cabe en "nombre + monto + día" (deudas, quincenales, montos variables) usa su formulario completo.
    const simple = f.clase !== "deuda" && f.ref.regla?.frecuencia === "mensual" && !f.ref.variable;
    if (simple) return abrirRegistro({ fijo: f, mes });
    const { abrirObligacion, abrirDeuda, abrirRecurrente } = await import("../plan/formularios.js");
    if (f.clase === "deuda") return abrirDeuda(f.ref);
    return f.clase === "ingreso" ? abrirRecurrente(f.ref) : abrirObligacion(f.ref);
  }

  const quitarClick = on(container, "click", "[data-mes-nav], [data-marcar], [data-abrir], [data-nuevo], [data-consejo], [data-dia]", (e, el) => {
    if (el.dataset.mesNav) return cambiarMes(moverMes(mes, el.dataset.mesNav));
    if (el.dataset.dia) {
      const d = dias?.[Number(el.dataset.dia)];
      return d && toast(detalleDia(d, hoy()), { duracion: 4500 });
    }
    if (el.dataset.consejo === "ver-gastos") {
      return document.getElementById("seccion-gastos")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (el.dataset.consejo === "cerrar") {
      // "No, gracias": no volver a mostrar ese mismo aviso hoy (solo en este dispositivo).
      const clave = el.closest(".consejo")?.dataset.clave;
      if (!clave) return;
      const cerrados = Object.fromEntries(Object.entries(leerLocal(CLAVE_CONSEJOS, {})).filter(([, f]) => f === hoy()));
      cerrados[clave] = hoy();
      guardarLocal(CLAVE_CONSEJOS, cerrados);
      return pintar();
    }
    if (el.dataset.nuevo) return abrirRegistro({ tipo: el.dataset.nuevo, mes });
    const [lista, i] = (el.dataset.marcar || el.dataset.abrir).split(":");
    const r = filas[lista]?.[Number(i)];
    if (!r) return;
    if (el.dataset.abrir) return abrir(r);
    return r.hecho ? desmarcarPagado(r.fijo) : marcarPagado(r.fijo, mes);
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

  // Cada registro cambia los agregados del mes: recargar la lista de lo registrado.
  const firmaMes = () => JSON.stringify(getState().agregados?.[mes] || {});
  let firma = firmaMes();
  const cancelarState = subscribe(() => {
    const nueva = firmaMes();
    if (nueva !== firma) { firma = nueva; cargarSueltos(); }
    pintar();
  });
  pintar();
  cargarSueltos();

  return () => {
    viva = false;
    ponerEstado(null);
    cancelarState();
    quitarClick();
    quitarTooltips();
    container.removeEventListener("toggle", alAbrir, true);
    observador.disconnect();
  };
}

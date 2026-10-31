// ============================================================
// modules/dashboard/index.js
// "Mi mes": la app entera en una pantalla, como la hoja de Excel.
//   Te quedan = Ingresos − Gastos del mes (pagados y pendientes)
//   GASTOS    fijos y de una vez, por día; ☐ → ☑ = pagado
//   INGRESOS  igual; ☐ → ☑ = recibido
//   TARJETAS  cuánto pagar de cada tarjeta y antes de qué día
//   MIS CAJAS cuánto tiene cada caja hoy
// Tocar un renglón lo edita. ＋ registra (nombre + monto).
// Arriba, estilo Clima de Samsung (cielo.js): el cielo cambia según
// cómo vas (bien / justo / mal), número gigante, paisaje, los
// próximos 7 días y una tarjeta de consejo.
// Hasta arriba, si algo venció o vence en 7 días: el aviso grande
// "Por pagar" (porPagar.js), que no se puede cerrar.
// Lo avanzado (deudas, presupuesto, proyección, cuentas) vive en Más.
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { mesDe, hoy, nombreMes } from "../../core/dates.js";
import { subscribe, getState, catalogosListos, planListo, cajaPorId, cuentaPorId, categoriaPorId } from "../../core/state.js";
import { sincronizarBarraEstado } from "../../core/theme.js";
import { mensajeDeError } from "../../core/errors.js";
import { saldosPor, patrimonio, desgloseCaja } from "../../domain/saldos.js";
import { balanceDelMes, ingresosFijosDelMes } from "../../domain/mes.js";
import { aportacionesDelMes } from "../../domain/metas.js";
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
import { estadosTarjetas } from "../../services/tarjetas.js";
import { lineaEstado } from "../tarjetas/linea.js";
import { esTarjeta } from "../../domain/tarjetas.js";
import { icon } from "../../components/icons.js";
import { abrirRegistro } from "../../components/registroSimple.js";
import { marcarPagado, desmarcarPagado } from "../../components/marcarPagado.js";
import { pasoCatalogos, pasoSaldosIniciales } from "./bienvenida.js";
import { calcularSerie, graficaMeses, tooltipMetricas } from "./metricas.js";
import { heroCielo, tarjetaPronostico, tarjetaConsejo, detalleDia } from "./cielo.js";
import { avisoPorPagar } from "./porPagar.js";
import { porPagar } from "../../domain/porPagar.js";

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
    ...fijos.map((f) => ({ fijo: f, dia: f.dia, nombre: f.nombre, monto: f.monto, cajaId: f.cajaId || f.ref.cajaId, cajaDestinoId: f.cajaDestinoId,
      hecho: f.estado === hechoSi, vencido: f.estado === "Vencido", falta: f.pagado > 0 && f.pendiente > 0 ? f.pendiente : 0 })),
    ...sueltos.map((m) => ({ mov: m, dia: Number(m.fecha.slice(8)), nombre: m.nota || categoriaPorId(m.categoriaId)?.nombre || "Sin nombre",
      monto: m.montoCentavos, cajaId: m.cajaId, hecho: true, prestamo: !!categoriaPorId(m.categoriaId)?.esFinanciamiento })),
  ].sort((a, b) => a.dia - b.dia || a.nombre.localeCompare(b.nombre, "es"));
}

/** "💳 Liverpool" si el renglón se paga con tarjeta de crédito (compra, gasto fijo o mensualidad a meses). */
function conTarjeta(r) {
  if (r.fijo?.msi) return `💳 ${cuentaPorId(r.fijo.ref.tarjetaId)?.nombre || r.fijo.ref.acreedor}`;
  const cuenta = cuentaPorId(r.mov?.cuentaId || (r.fijo?.clase === "obligacion" ? r.fijo.ref.cuentaId : null));
  return cuenta?.tipo === "credito" ? `💳 ${cuenta.nombre}` : "";
}

function filaHoja(r, i, lista, ingreso) {
  const ahorro = lista === "ahorro";
  const etiqueta = ahorro ? (r.hecho ? "Aportado" : "Marcar como aportado")
    : ingreso ? (r.hecho ? "Recibido" : "Marcar como recibido") : (r.hecho ? "Pagado" : "Marcar como pagado");
  const sub = [
    ahorro ? `${cajaPorId(r.cajaId)?.nombre || "—"} → ${cajaPorId(r.cajaDestinoId)?.nombre || "—"}` : cajaPorId(r.cajaId)?.nombre,
    ingreso || ahorro ? "" : conTarjeta(r),
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
      <span class="fila__titulo">${r.nombre}${r.fijo?.msi ? html` <span class="fijo" title="Mensualidad de una compra a meses">${r.fijo.msi}</span>`
        : r.fijo ? html` <span class="fijo" title="Se repite cada mes">↻</span>` : ""}</span>
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
  let filas = { gastos: [], ingresos: [], ahorro: [] };
  let serie = [];
  let graficaAbierta = false;
  let modo = null; // 'cargando' | 'conectando' | 'catalogos' | 'saldos:…' | 'vista'
  let dias = null;  // próximos 7 días (solo en el mes actual)
  let tarjetas = null; // [{ cuenta, estado }] (services/tarjetas.js)
  let pagos = [];      // lo que vence pronto o ya venció (domain/porPagar.js)
  let pedidoTarjetas = 0;
  let viva = true;  // false al salir de la pantalla: una carga que llegue tarde no debe pintar encima de otra

  /** Estado de las tarjetas (lee solo lo de después de su corte; se recuerda si nada cambió). */
  async function cargarTarjetas() {
    const s = getState();
    if (!catalogosListos() || !planListo() || !s.cuentas.some((c) => c.tipo === "credito")) {
      if (tarjetas?.length) { tarjetas = null; pintar(); }
      return;
    }
    const n = ++pedidoTarjetas;
    try {
      const lista = await estadosTarjetas(s);
      if (!viva || n !== pedidoTarjetas) return;
      const antes = JSON.stringify(tarjetas?.map((x) => [x.cuenta, x.estado]));
      tarjetas = lista;
      if (JSON.stringify(lista.map((x) => [x.cuenta, x.estado])) !== antes) pintar();
    } catch {
      /* sin tarjetas en Mi mes; la pantalla Tarjetas muestra el error */
    }
  }

  async function cargarSueltos() {
    const pedido = mes;
    try {
      const [g, i] = await Promise.all([movimientosRepo.delMes(uid, mes, "gasto"), movimientosRepo.delMes(uid, mes, "ingreso")]);
      if (pedido !== mes || !viva) return;
      // Los pagos de gastos/ingresos fijos ya aparecen en su renglón (☑). Un pago a una deuda sin
      // mensualidad (p. ej. liquidar una compra a meses) sí va como renglón propio.
      sueltos = { gasto: g.filter((m) => !m.obligacionId && !(m.deudaId && m.deudaPeriodo)), ingreso: i.filter((m) => !m.recurrenteId) };
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
      ahorro: renglones(aportacionesDelMes({ mes, metas: s.metas, agregados: s.agregados, hoy: hoy() }), [], "Aportado"),
    };
    const porCaja = saldosPor(s.agregados, "porCaja");
    // En qué banco(s) está el dinero de cada caja (si no tiene, su banco predeterminado) y lo que debe de tarjetas.
    const bancosDe = (c) => {
      const partes = desgloseCaja(s.agregados, c.id);
      const deTarjeta = (d) => esTarjeta(cuentaPorId(d.cuentaId));
      const con = partes.filter((d) => !deTarjeta(d)).map((d) => cuentaPorId(d.cuentaId)?.nombre).filter(Boolean);
      return {
        bancos: (con.length ? con : [cuentaPorId(c.cuentaPredeterminadaId)?.nombre].filter(Boolean)).join(", "),
        debe: -partes.filter(deTarjeta).reduce((a, d) => a + d.saldo, 0),
      };
    };
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
    // Tarjetas activas, o desactivadas que aún deben algo.
    const visibles = (tarjetas || []).filter((x) => x.cuenta.activa !== false || x.estado.deudaTotal > 0);
    // El aviso grande ya dice qué pagar: el consejo solo avisa lo demás (errores, si no alcanza).
    pagos = porPagar({ obligaciones: s.obligaciones, deudas: s.deudas, agregados: s.agregados, cuentas: s.cuentas, tarjetas: visibles, hoy: hoyF });
    const aviso = esActual ? consejo({ balance: b, pronostico: dias, hallazgos: diagnosticar({ ...s, hoy: hoyF }), hoy: hoyF, omitirPagos: true }) : null;
    const avisoVisible = aviso && leerLocal(CLAVE_CONSEJOS, {})[aviso.clave] !== hoyF ? aviso : null;

    return html`
      ${avisoPorPagar(pagos)}
      ${heroCielo({ b, mes, clima })}
      ${dias ? tarjetaPronostico({ dias, hoy: hoyF }) : ""}
      ${avisoVisible ? tarjetaConsejo(avisoVisible) : ""}

      ${seccion({ titulo: "Gastos", total: b.totalGastos, lista: "gastos", tipo: "gasto", filasLista: filas.gastos,
        vacio: html`<strong>+ Agrega tu primer gasto</strong><span>Los fijos (hipoteca, internet) y los del día (gasolina, comida).</span>` })}

      ${seccion({ titulo: "Ingresos", total: b.ingresos, lista: "ingresos", tipo: "ingreso", filasLista: filas.ingresos, ingreso: true,
        vacio: html`<strong>+ Agrega tu primer ingreso</strong><span>Nómina, honorarios, cobranza…</span>` })}

      ${filas.ahorro.length ? html`<section class="seccion" id="seccion-ahorro">
        <div class="seccion__cabecera">
          <h2 class="seccion__titulo">Ahorro · ${formatMonto(filas.ahorro.reduce((a, r) => a + r.monto, 0))}</h2>
          <a class="btn-texto" href="#/metas">Mis metas</a>
        </div>
        <ul class="lista card card--lista hoja">${filas.ahorro.map((r, i) => filaHoja(r, i, "ahorro", false))}</ul>
        <p class="campo__ayuda">Toca ☐ cuando apartes el dinero: pasa de una caja a la otra (no cuenta como gasto).</p>
      </section>` : ""}

      ${visibles.length ? html`<section class="seccion" id="seccion-tarjetas">
        <div class="seccion__cabecera">
          <h2 class="seccion__titulo">Tarjetas · Debes ${formatMonto(visibles.reduce((a, x) => a + x.estado.deudaTotal, 0))}</h2>
          <a class="btn-texto" href="#/tarjetas">Ver tarjetas</a>
        </div>
        <ul class="lista card card--lista">${visibles.map((x) => {
          const linea = lineaEstado(x.estado, { corto: true });
          return html`<li><div class="fila">
            <span class="fila__icono">${icon("tarjeta", { size: 18 })}</span>
            <a class="fila__texto fila__texto--boton" href="#/tarjetas"><span class="fila__titulo">${x.cuenta.nombre}</span>
              <span class="fila__sub ${linea.clase}">${linea.texto}</span></a>
            ${x.estado.paraNoGenerarIntereses > 0 && x.cuenta.activa !== false
              ? html`<button type="button" class="btn btn--pastilla" data-pagar-tarjeta="${x.cuenta.id}">Pagar</button>`
              : html`<span class="fila__monto">${formatMonto(x.estado.deudaTotal)}</span>`}
          </div></li>`;
        })}</ul>
        <p class="campo__ayuda">Lo que compras con tarjeta ya está en tus gastos: pagarla no es otro gasto, solo baja el dinero del banco.</p>
      </section>` : ""}

      <section class="seccion">
        <div class="seccion__cabecera">
          <h2 class="seccion__titulo">Mis cajas · <span class="total-cajas">${formatMonto(patrimonio(s.agregados))}</span></h2>
          <button type="button" class="btn-texto" data-accion="nuevo-movimiento" data-tipo="transferencia">Mover dinero</button>
        </div>
        <ul class="lista card card--lista">${cajas.map((c) => ({ c, ...bancosDe(c) })).map(({ c, bancos, debe }) => html`<li><a class="fila" href="#/movimientos?caja=${c.id}">
          <span class="punto" style="background:${c.color || "var(--accent)"}"></span>
          <span class="fila__texto"><span class="fila__titulo">${c.nombre}</span>${bancos ? html`<span class="fila__sub">${bancos}</span>` : ""}${debe > 0
            ? html`<span class="fila__sub">💳 debes ${formatMonto(debe)}</span>` : ""}</span>
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
    if (f.clase === "meta") { location.hash = "#/metas"; return; }
    if (f.clase === "deuda" && f.ref.tarjetaId) {
      const { abrirCompraMsi } = await import("../tarjetas/formulario.js");
      return abrirCompraMsi(f.ref);
    }
    // Lo que no cabe en "nombre + monto + día" (deudas, quincenales, montos variables) usa su formulario completo.
    const simple = f.clase !== "deuda" && ["mensual", "semanal"].includes(f.ref.regla?.frecuencia) && !f.ref.variable;
    if (simple) return abrirRegistro({ fijo: f, mes });
    const { abrirObligacion, abrirDeuda, abrirRecurrente } = await import("../plan/formularios.js");
    if (f.clase === "deuda") return abrirDeuda(f.ref);
    return f.clase === "ingreso" ? abrirRecurrente(f.ref) : abrirObligacion(f.ref);
  }

  const quitarClick = on(container, "click", "[data-mes-nav], [data-marcar], [data-abrir], [data-nuevo], [data-consejo], [data-dia], [data-pagar-tarjeta], [data-por-pagar]", (e, el) => {
    if (el.dataset.porPagar) {
      const x = pagos[Number(el.dataset.porPagar)];
      if (!x) return;
      if (x.tipo === "tarjeta") {
        import("../tarjetas/pago.js").then(({ abrirPagoTarjeta }) => abrirPagoTarjeta(cuentaPorId(x.cuenta.id) || x.cuenta, x.estado));
        return;
      }
      // Gasto fijo o deuda: se marca ☑ igual que en la lista (con «Deshacer»).
      const e = x.evento;
      marcarPagado({ ...e, nombre: e.ref.tarjetaId ? e.ref.descripcion || e.ref.acreedor : e.nombre, pendiente: e.monto }, mesDe(e.periodo));
      return;
    }
    if (el.dataset.mesNav) return cambiarMes(moverMes(mes, el.dataset.mesNav));
    if (el.dataset.pagarTarjeta) {
      const x = tarjetas?.find((t) => t.cuenta.id === el.dataset.pagarTarjeta);
      if (x) import("../tarjetas/pago.js").then(({ abrirPagoTarjeta }) => abrirPagoTarjeta(cuentaPorId(x.cuenta.id) || x.cuenta, x.estado));
      return;
    }
    if (el.dataset.consejo === "ver-tarjetas") {
      return document.getElementById("seccion-tarjetas")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
    cargarTarjetas();
  });
  pintar();
  cargarSueltos();
  cargarTarjetas();

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

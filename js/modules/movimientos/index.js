// ============================================================
// modules/movimientos/index.js
// Lista paginada con filtros (caja o cuenta, tipo, mes, estado).
// Paginación real con cursores de Firestore: nunca se descargan
// todos los movimientos. Los filtros se reflejan en la URL.
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { nombreMes, mesDe, hoy } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, subscribe } from "../../core/state.js";
import { tamanoValido } from "../../core/paginacion.js";
import { TIPOS, ETIQUETA_TIPO } from "../../domain/movimientos.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { perfilRepo } from "../../data/perfilRepo.js";
import { reemplazarParams } from "../../router.js";
import { skeletonLista, estadoVacio, estadoError } from "../../components/states.js";
import { paginacion } from "../../components/pagination.js";
import { listaAgrupada } from "../../components/movimientoItem.js";
import { abrirDetalleMovimiento } from "../../components/movimientoDetalle.js";
import { opciones, leerLocal, guardarLocal } from "../../components/fields.js";

const CLAVE_TAMANO = "fr.pageSize";

function mesesDisponibles(agregados) {
  const set = new Set(Object.keys(agregados || {}).filter((m) => agregados[m]?.n));
  set.add(mesDe(hoy()));
  return [...set].sort().reverse();
}

export function render(container, ctx) {
  const uid = ctx.user.uid;
  const p = ctx.params;
  const filtros = {
    cajaId: p.get("caja") || "",
    cuentaId: p.get("caja") ? "" : (p.get("cuenta") || ""),
    tipo: TIPOS.includes(p.get("tipo")) ? p.get("tipo") : "",
    mes: /^\d{4}-\d{2}$/.test(p.get("mes") || "") ? p.get("mes") : "",
    estado: p.get("estado") === "anulado" ? "anulado" : "activo",
  };
  let tamano = tamanoValido(p.get("n") || leerLocal(CLAVE_TAMANO) || getState().perfil?.config?.pageSize);
  let paginador = null;
  let pagina = 1;
  let datos = null;       // { items, hayMas }
  let total = null;
  let error = null;
  let cargando = false;

  renderHtml(container, html`
    <form class="filtros" aria-label="Filtros">
      <select name="caja" aria-label="Caja"></select>
      <select name="cuenta" aria-label="Cuenta"></select>
      <select name="tipo" aria-label="Tipo">
        <option value="">Todos los tipos</option>
        ${TIPOS.map((t) => html`<option value="${t}" ${t === filtros.tipo ? "selected" : ""}>${ETIQUETA_TIPO[t]}</option>`)}
      </select>
      <select name="mes" aria-label="Mes"></select>
      <select name="estado" aria-label="Estado">
        <option value="activo">Activos</option>
        <option value="anulado" ${filtros.estado === "anulado" ? "selected" : ""}>Anulados</option>
      </select>
    </form>
    <div data-lista></div>
    <div data-paginacion></div>`);

  const form = container.querySelector(".filtros");
  const lista = container.querySelector("[data-lista]");
  const pag = container.querySelector("[data-paginacion]");

  function pintarFiltros() {
    const s = getState();
    renderHtml(form.caja, opciones(s.cajas, filtros.cajaId, { vacio: "Todas las cajas" }));
    renderHtml(form.cuenta, opciones(s.cuentas, filtros.cuentaId, { vacio: "Todas las cuentas" }));
    renderHtml(form.mes, html`<option value="">Todos los meses</option>${mesesDisponibles(s.agregados).map((m) =>
      html`<option value="${m}" ${m === filtros.mes ? "selected" : ""}>${nombreMes(m)}</option>`)}`);
  }

  let viva = true; // al salir de la pantalla, una carga que llegue tarde no pinta encima de otra
  function pintar() {
    if (!viva) return;
    if (error) {
      renderHtml(lista, estadoError(error));
      renderHtml(pag, "");
      return;
    }
    if (!datos) {
      renderHtml(lista, skeletonLista(6));
      renderHtml(pag, "");
      return;
    }
    const hayFiltro = filtros.cajaId || filtros.cuentaId || filtros.tipo || filtros.mes || filtros.estado !== "activo";
    if (datos.items.length === 0 && pagina === 1) {
      renderHtml(lista, hayFiltro
        ? estadoVacio({ icono: "filtro", titulo: "No hay movimientos con estos filtros." })
        : estadoVacio({ titulo: "Todavía no tienes movimientos.", accion: { label: "+ Registrar movimiento", accion: "nuevo-movimiento" } }));
      renderHtml(pag, "");
      return;
    }
    renderHtml(lista, html`<div class="lista-movs card ${cargando ? "cargando" : ""}">${listaAgrupada(datos.items)}</div>`);
    renderHtml(pag, paginacion({
      pagina, tamano, enPagina: datos.items.length, hayMas: datos.hayMas,
      total, maxVisitada: paginador.maxVisitada,
    }));
  }

  async function cargar(n) {
    if (!paginador.puedeIr(n)) return;
    cargando = true;
    pintar();
    try {
      const r = await paginador.pagina(n);
      pagina = n;
      datos = r;
      error = null;
    } catch (err) {
      error = mensajeDeError(err, "No se pudieron cargar los movimientos.");
    }
    cargando = false;
    pintar();
  }

  async function contar() {
    total = await movimientosRepo.contar(uid, filtros, getState().agregados);
    pintar();
  }

  function reiniciar() {
    reemplazarParams({
      caja: filtros.cajaId, cuenta: filtros.cuentaId, tipo: filtros.tipo, mes: filtros.mes,
      estado: filtros.estado === "anulado" ? "anulado" : "", n: tamano !== 25 ? tamano : "",
    });
    paginador = movimientosRepo.paginador(uid, filtros, tamano);
    datos = null;
    total = null;
    pagina = 1;
    cargar(1);
    contar();
  }

  form.addEventListener("change", (e) => {
    const v = e.target.value;
    if (e.target.name === "caja") { filtros.cajaId = v; if (v) { filtros.cuentaId = ""; form.cuenta.value = ""; } }
    if (e.target.name === "cuenta") { filtros.cuentaId = v; if (v) { filtros.cajaId = ""; form.caja.value = ""; } }
    if (e.target.name === "tipo") filtros.tipo = v;
    if (e.target.name === "mes") filtros.mes = v;
    if (e.target.name === "estado") filtros.estado = v;
    reiniciar();
  });

  const quitarPag = on(pag, "click", "[data-pag]", (e, el) => {
    const v = el.dataset.pag;
    const destino = v === "prev" ? pagina - 1 : v === "next" ? pagina + 1 : Number(v);
    cargar(destino).then(() => lista.scrollIntoView({ block: "start", behavior: "smooth" }));
  });
  const quitarTamano = on(pag, "change", "[data-tamano]", (e, el) => {
    tamano = tamanoValido(el.value);
    guardarLocal(CLAVE_TAMANO, tamano);
    perfilRepo.guardarConfig(uid, { pageSize: tamano });
    reiniciar();
  });
  const quitarDetalle = on(lista, "click", "[data-mov]", (e, el) => {
    const m = datos?.items.find((x) => x.id === el.dataset.mov);
    if (m) abrirDetalleMovimiento(m);
  });

  // Cada escritura cambia los agregados: recargar la página actual (y el total).
  let firmaAgregados = JSON.stringify(getState().agregados);
  let timer = null;
  const cancelarState = subscribe((s) => {
    pintarFiltros();
    const firma = JSON.stringify(s.agregados);
    if (firma === firmaAgregados) return;
    firmaAgregados = firma;
    clearTimeout(timer);
    timer = setTimeout(() => {
      // Las páginas posteriores pueden haberse recorrido: se vuelven a calcular al avanzar.
      paginador.cursores.length = pagina;
      paginador.maxVisitada = pagina;
      cargar(pagina);
      contar();
    }, 250);
  });

  pintarFiltros();
  reiniciar();

  return () => {
    viva = false;
    clearTimeout(timer);
    cancelarState();
    quitarPag();
    quitarTamano();
    quitarDetalle();
  };
}

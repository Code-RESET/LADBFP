// ============================================================
// modules/metas/index.js
// Metas de ahorro (Fase 3): una tarjeta por meta con cuánto
// llevas, cuánto falta, cuándo terminas y si te alcanza.
// Cálculos en domain/metas.js; hojas en ./formulario.js.
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { hoy, nombreMes } from "../../core/dates.js";
import { getState, subscribe, catalogosListos, cajaPorId } from "../../core/state.js";
import { resumenMeta, viabilidadMeta, mesConAporte } from "../../domain/metas.js";
import { describirRegla } from "../../domain/periodos.js";
import { skeletonLista } from "../../components/states.js";
import { icon } from "../../components/icons.js";
import { abrirMeta, abrirAportar } from "./formulario.js";

const nombreCaja = (id) => cajaPorId(id)?.nombre || "una caja borrada";
const corto = (c) => formatMonto(c).replace(/\.00$/, "");
const mesLargo = (fecha) => (fecha ? nombreMes(fecha.slice(0, 7)) : "");
const cadaCuando = (regla) => ({ mensual: "cada mes", quincenal: "cada quincena", semanal: "cada semana" }[regla?.frecuencia] || describirRegla(regla).toLowerCase());

// Sugerencia del plan original de Angel (sección 42 del prompt maestro).
const SUGERENCIA = { nombre: "Remodelación", objetivoCentavos: 30000000, aportacionCentavos: 2000000 };

function lineaViabilidad(meta, v) {
  const origen = nombreCaja(meta.cajaOrigenId);
  if (v.estado === "viable") {
    return html`<p class="meta__viabilidad meta__viabilidad--ok">${icon("check", { size: 16 })} Te alcanza: a «${origen}» le sobran ${corto(v.flujoLibre)} al mes en promedio.</p>`;
  }
  if (v.estado === "inviable") {
    const r = resumenMeta({ meta, agregados: getState().agregados, hoy: hoy() });
    const conLoQueSobra = v.flujoLibre > 0 ? mesConAporte(r.faltante, v.flujoLibre, hoy()) : null;
    return html`<p class="meta__viabilidad meta__viabilidad--mal">${icon("alerta", { size: 16 })} No alcanza: a «${origen}» le
      ${v.flujoLibre > 0 ? `sobran ${corto(v.flujoLibre)}` : "no le sobra dinero"} al mes y esta meta pide ${corto(v.aportacionMensual)}.
      ${conLoQueSobra ? `Con ${corto(v.flujoLibre)} al mes terminarías en ${nombreMes(conLoQueSobra)}.` : ""}</p>`;
  }
  return html`<p class="meta__viabilidad">${icon("reportes", { size: 16 })} Aún no hay meses completos en «${origen}» para saber si te alcanza.</p>`;
}

function tarjeta(meta, s) {
  const hoyF = hoy();
  const r = resumenMeta({ meta, agregados: s.agregados, hoy: hoyF });
  const v = viabilidadMeta({ meta, metas: s.metas, agregados: s.agregados, hoy: hoyF });
  const pausada = meta.activa === false;
  return html`<li class="card meta ${pausada ? "atenuada" : ""}" data-meta="${meta.id}">
    <div class="meta__cabecera">
      <h3 class="meta__nombre">${meta.nombre}</h3>
      <span class="meta__pct">${r.cumplida ? "🎉" : `${r.pct}%`}</span>
    </div>
    <div class="barra-meta" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${r.pct}" aria-label="Avance de ${meta.nombre}">
      <span style="width:${r.pct}%"></span></div>
    <p class="meta__montos"><strong>${corto(r.acumulado)}</strong> de ${corto(meta.objetivoCentavos)}</p>
    ${r.cumplida
      ? html`<p class="meta__texto meta__viabilidad--ok">¡Meta cumplida! Ya juntaste todo en «${nombreCaja(meta.cajaAhorroId)}».</p>`
      : html`<p class="meta__texto">Te faltan <strong>${corto(r.faltante)}</strong> · ${r.restantes} ${r.restantes === 1 ? "aportación" : "aportaciones"} de ${corto(meta.aportacionCentavos)} ${cadaCuando(meta.regla)}</p>
        ${pausada ? html`<p class="meta__texto">En pausa: no pide aportaciones.</p>`
          : html`${r.fechaEstimada ? html`<p class="meta__fecha">Terminas en <strong>${mesLargo(r.fechaEstimada)}</strong></p>` : ""}
            ${lineaViabilidad(meta, v)}`}`}
    <p class="campo__ayuda">Se guarda en «${nombreCaja(meta.cajaAhorroId)}» · sale de «${nombreCaja(meta.cajaOrigenId)}»</p>
    <div class="meta__acciones">
      ${r.cumplida || pausada ? "" : html`<button type="button" class="btn btn--pastilla" data-aportar="${meta.id}">Aportar</button>`}
      <button type="button" class="btn btn--pastilla" data-editar="${meta.id}">Editar</button>
      ${r.acumulado > 0 ? html`<button type="button" class="btn-texto" data-retirar="${meta.id}">Sacar dinero</button>` : ""}
    </div>
  </li>`;
}

export function render(container) {
  function pintar() {
    const s = getState();
    if (!catalogosListos() || !s.listo.metas) { renderHtml(container, skeletonLista(3)); return; }
    const activas = s.metas.filter((m) => m.activa !== false);
    const pausadas = s.metas.filter((m) => m.activa === false);
    renderHtml(container, html`
      <p class="texto-sec intro">Junta dinero para algo: la app te dice cuánto llevas, cuándo terminas y si te alcanza con lo que te sobra cada mes.</p>
      ${s.metasError ? html`<p class="aviso aviso--error">${icon("alerta", { size: 16 })} No se pudieron cargar tus metas. Si acabas de actualizar la app, falta publicar las reglas nuevas en Firebase (Firestore → Reglas).</p>` : ""}
      <div class="barra-acciones"><button type="button" class="btn btn--primario" data-accion="nueva-meta">+ Nueva meta</button></div>
      ${activas.length ? html`<ul class="lista-metas">${activas.map((m) => tarjeta(m, s))}</ul>`
        : html`<button type="button" class="card hoja-vacia" data-accion="sugerencia-meta">
            <strong>+ Ejemplo: ${SUGERENCIA.nombre} ${corto(SUGERENCIA.objetivoCentavos)}</strong>
            <span>Apartando ${corto(SUGERENCIA.aportacionCentavos)} cada mes. Toca para usarlo y ajústalo a tu gusto.</span></button>`}
      ${pausadas.length ? html`<h2 class="seccion__titulo">En pausa</h2><ul class="lista-metas">${pausadas.map((m) => tarjeta(m, s))}</ul>` : ""}`);
  }

  const meta = (id) => getState().metas.find((m) => m.id === id);
  const quitar = on(container, "click", "[data-accion='nueva-meta'], [data-accion='sugerencia-meta'], [data-aportar], [data-editar], [data-retirar]", (e, el) => {
    if (el.dataset.accion === "nueva-meta") return abrirMeta();
    if (el.dataset.accion === "sugerencia-meta") return abrirMeta({ ...SUGERENCIA });
    if (el.dataset.aportar) return abrirAportar(meta(el.dataset.aportar));
    if (el.dataset.retirar) return abrirAportar(meta(el.dataset.retirar), { retiro: true });
    if (el.dataset.editar) return abrirMeta(meta(el.dataset.editar));
  });
  const cancelar = subscribe(pintar);
  pintar();
  return () => { cancelar(); quitar(); };
}

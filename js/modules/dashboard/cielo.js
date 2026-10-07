// ============================================================
// modules/dashboard/cielo.js
// Piezas de "Mi mes" estilo Clima de Samsung:
//   heroCielo          número gigante, el "clima" del mes y el paisaje
//   tarjetaPronostico  próximos 7 días (como el pronóstico por hora)
//   tarjetaConsejo     aviso útil con dos botones (como "¿Añadir widget?")
// Los cálculos vienen de domain/mes.js y domain/pronostico.js.
// ============================================================

import { html } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { nombreMes, nombreDia, diaCorto } from "../../core/dates.js";
import { selectorMes } from "../../components/selectorMes.js";
import { montoCompacto } from "../../components/charts.js";
import { paisaje } from "../../components/paisaje.js";
import { icon } from "../../components/icons.js";

const menos = (texto) => texto.replace(/^-/, "−");
/** $15,000.00 → $15,000 (los centavos solo si hay). */
const corto = (centavos) => formatMonto(centavos).replace(/\.00$/, "");

/** Encabezado: mes, "Te quedan", número gigante, estado, Entró / Gastos y el paisaje. */
export function heroCielo({ b, mes, clima }) {
  const soloMes = nombreMes(mes).split(" ")[0];
  const texto = formatMonto(Math.abs(b.balance));
  const punto = texto.lastIndexOf(".");
  const [entero, centavos] = punto > 0 ? [texto.slice(0, punto), texto.slice(punto)] : [texto, ""];
  const frase = b.pendiente
    ? html`<p class="hero__frase"><span>Falta por pagar ${corto(b.pendiente)}</span>${b.vencido ? html` <span class="cielo__alerta">${corto(b.vencido)} ya vencido</span>` : ""}</p>`
    : b.fijos.length ? html`<p class="hero__frase">✓ Gastos fijos de ${soloMes} pagados</p>` : "";
  return html`<section class="hero cielo" aria-label="Resumen de ${soloMes}">
    ${selectorMes(mes)}
    <p class="hero__etiqueta">${b.balance < 0 ? `Te faltan en ${soloMes}` : `Te quedan en ${soloMes}`}</p>
    <p class="hero__monto">${entero}<span class="hero__centavos">${centavos}</span></p>
    <p class="cielo__estado">${clima.frase}</p>
    <div class="cielo__datos">
      <p class="hero__linea"><span>↑ Entró ${corto(b.ingresos)}</span> <span>↓ Gastos ${corto(b.totalGastos)}</span></p>
      ${frase}
    </div>
    <div class="cielo__paisaje">${paisaje()}</div>
  </section>`;
}

/** Texto de un día para el aviso al tocarlo y para lectores de pantalla. */
export function detalleDia(d, hoyF) {
  const que = d.eventos.length
    ? d.eventos.map((e) => `${e.nombre} ${e.clase === "ingreso" ? "+" : "−"}${formatMonto(e.monto)}${e.vencido ? " (vencido)" : ""}`).join(", ")
    : "sin pagos ni cobros";
  return `${diaCorto(d.fecha, hoyF)}: ${que}. Te quedarían ${formatMonto(d.saldo)} en tus cajas.`;
}

const COL = 64;    // ancho mínimo de cada día (px); en pantallas anchas se reparten todo el ancho
const ALTO = 44;   // alto de la línea
const MARGEN = 9;

/** Próximos 7 días: qué vence, cuánto entra y cómo queda tu dinero (línea). */
export function tarjetaPronostico({ dias, hoy: hoyF }) {
  const saldos = dias.map((d) => d.saldo);
  const min = Math.min(...saldos);
  const max = Math.max(...saldos);
  const y = (v) => (max === min ? ALTO / 2 : MARGEN + (1 - (v - min) / (max - min)) * (ALTO - 2 * MARGEN));
  const puntos = dias.map((d, i) => [100 * i + 50, Math.round(y(d.saldo) * 10) / 10]);
  const pagos = dias.flatMap((d) => d.eventos.filter((e) => e.clase !== "ingreso"));
  const totalPagos = pagos.reduce((a, e) => a + e.monto, 0);
  const masBajo = dias.reduce((a, d) => (d.saldo < a.saldo ? d : a), dias[0]);
  const resumen = pagos.length
    ? `Esta semana ${pagos.length === 1 ? "vence 1 pago" : `vencen ${pagos.length} pagos`} por ${formatMonto(totalPagos)}. `
      + (masBajo.saldo < 0 ? `El ${nombreDia(masBajo.fecha)} tu dinero quedaría en ${formatMonto(masBajo.saldo)}.` : `Lo menos que tendrás: ${formatMonto(masBajo.saldo)}.`)
    : "Semana tranquila: no vence nada en los próximos 7 días.";

  const iconoDe = (d) => {
    const sale = d.eventos.some((e) => e.clase !== "ingreso");
    const entra = d.eventos.some((e) => e.clase === "ingreso");
    if (sale && entra) return html`<span class="pronostico__icono pronostico__icono--doble">${icon("ingreso", { size: 18, clase: "pronostico__entra" })}${icon("gasto", { size: 18, clase: "pronostico__sale" })}</span>`;
    if (sale) return html`<span class="pronostico__icono">${icon("gasto", { size: 26, clase: "pronostico__sale" })}</span>`;
    if (entra) return html`<span class="pronostico__icono">${icon("ingreso", { size: 26, clase: "pronostico__entra" })}</span>`;
    return html`<span class="pronostico__icono pronostico__icono--calma">${icon("sol", { size: 26, clase: "solo-dia" })}${icon("luna", { size: 24, clase: "solo-noche" })}</span>`;
  };
  const movDe = (d) => {
    if (!d.eventos.length) return html`<span class="pronostico__mov pronostico__mov--nada">—</span>`;
    const neto = d.entradas - d.salidas;
    return html`<span class="pronostico__mov ${neto < 0 ? "pronostico__mov--sale" : "pronostico__mov--entra"}">${neto > 0 ? "+" : ""}${menos(montoCompacto(neto))}</span>`;
  };

  return html`<section class="card pronostico" aria-label="Próximos 7 días">
    <p class="pronostico__resumen">${resumen}</p>
    <div class="pronostico__franja" tabindex="0">
      <div class="pronostico__tabla" style="--n:${dias.length}; --col:${COL}px">
        <div class="pronostico__fila">${dias.map((d, i) => html`<button type="button" class="pronostico__fecha" data-dia="${i}" aria-label="${detalleDia(d, hoyF)}">${diaCorto(d.fecha, hoyF)}</button>`)}</div>
        <div class="pronostico__fila" aria-hidden="true">${dias.map(iconoDe)}</div>
        <div class="pronostico__fila" aria-hidden="true">${dias.map((d) => html`<span class="pronostico__saldo ${d.saldo < 0 ? "pronostico__saldo--negativo" : ""}">${menos(montoCompacto(d.saldo))}</span>`)}</div>
        <div class="pronostico__grafica" aria-hidden="true">
          <svg viewBox="0 0 ${100 * dias.length} ${ALTO}" preserveAspectRatio="none">
            <polyline vector-effect="non-scaling-stroke" points="${puntos.map(([px, py]) => `${px},${py}`).join(" ")}"/>
          </svg>
          ${puntos.map(([, py], i) => html`<span class="pronostico__punto ${i === 0 ? "pronostico__punto--hoy" : ""} ${dias[i].saldo < 0 ? "pronostico__punto--negativo" : ""}"
            style="left:${((i + 0.5) / dias.length) * 100}%; top:${py}px"></span>`)}
        </div>
        <div class="pronostico__fila" aria-hidden="true">${dias.map(movDe)}</div>
      </div>
    </div>
    <a class="pronostico__mas" href="#/plan">Ver más días ${icon("chevron", { size: 16 })}</a>
  </section>`;
}

/** Tarjeta de consejo (o nada). */
export function tarjetaConsejo(c) {
  const cerrar = html`<button type="button" class="btn btn--pastilla" data-consejo="cerrar">${c.accion.tipo === "cerrar" ? c.accion.label : "No, gracias"}</button>`;
  const accion = c.accion.tipo === "revisar-datos"
    ? html`<button type="button" class="btn btn--pastilla" data-accion="revisar-datos">${c.accion.label}</button>`
    : c.accion.tipo === "ver-gastos" ? html`<button type="button" class="btn btn--pastilla" data-consejo="ver-gastos">${c.accion.label}</button>` : "";
  return html`<section class="card consejo" data-clave="${c.clave}" aria-label="Consejo">
    <p class="consejo__etiqueta">${icon(c.accion.tipo === "cerrar" ? "plan" : "alerta", { size: 16 })} ${c.accion.tipo === "cerrar" ? "Para esta semana" : "Revisa esto"}</p>
    <p class="consejo__titulo">${c.titulo}${c.monto ? ` · ${formatMonto(c.monto)}` : ""}</p>
    <p class="consejo__texto">${c.texto}</p>
    <div class="consejo__acciones">${cerrar}${accion}</div>
  </section>`;
}

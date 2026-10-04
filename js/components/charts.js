// ============================================================
// components/charts.js
// Gráficas SVG ligeras, sin librerías (stack sin npm).
// Especificación visual (guía dataviz):
// - Columnas ≤ 24 px, punta redondeada 4 px, base recta, 2 px de
//   separación entre columnas vecinas.
// - Líneas de 2 px; área con lavado al ~10 %; punto final r = 4 px
//   con anillo de 2 px del color de superficie.
// - Rejilla de 1 px, sólida y discreta. Un solo eje Y.
// - El texto nunca usa el color de la serie (usa tokens de texto).
// - Tooltip al pasar/tocar/enfocar; nunca es la única vía: cada
//   gráfica tiene vista en tabla.
// ============================================================

import { html, raw } from "../core/dom.js";

const NS = 'xmlns="http://www.w3.org/2000/svg"';

/** Monto compacto para ejes: $850, $12.5k, $1.2M (de centavos). */
export function montoCompacto(centavos) {
  const v = Math.abs(centavos) / 100;
  const signo = centavos < 0 ? "-" : "";
  // Un decimal como máximo (12.5k), sin ".0": las marcas del eje nunca se redondean de más.
  if (v >= 1_000_000) return `${signo}$${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${signo}$${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${signo}$${Math.round(v)}`;
}

/** Máximo "limpio" y marcas del eje: 0, 5k, 10k, 15k, 20k… (en centavos). */
export function escalaLimpia(maximo, marcas = 4) {
  if (!(maximo > 0)) return { max: 100_00, ticks: [0, 50_00, 100_00] };
  const crudo = maximo / marcas;
  const pot = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= crudo);
  const max = Math.ceil(maximo / paso) * paso;
  const ticks = [];
  for (let t = 0; t <= max + 1e-9; t += paso) ticks.push(Math.round(t));
  return { max, ticks };
}

/** Path de columna: base recta en y0, punta redondeada (r ≤ 4). */
function columna(x, y0, ancho, alto) {
  if (alto <= 0) return "";
  const r = Math.min(4, alto, ancho / 2);
  const top = y0 - alto;
  return `M${x},${y0}V${top + r}Q${x},${top} ${x + r},${top}H${x + ancho - r}Q${x + ancho},${top} ${x + ancho},${top + r}V${y0}Z`;
}

/**
 * Columnas agrupadas (p. ej. Ingresos vs Gastos por mes).
 * datos: [{ etiqueta, destacado, valores: { clave: centavos } }]
 * series: [{ clave, nombre, color: 'var(--serie-1)' }]
 */
export function graficaColumnas({ datos, series, ancho, alto = 200, titulo }) {
  const m = { izq: 44, der: 8, arr: 10, aba: 24 };
  const w = Math.max(240, Math.round(ancho));
  const plotW = w - m.izq - m.der;
  const plotH = alto - m.arr - m.aba;
  const y0 = m.arr + plotH;
  const maxDato = Math.max(0, ...datos.flatMap((d) => series.map((s) => d.valores[s.clave] || 0)));
  const { max, ticks } = escalaLimpia(maxDato);
  const banda = plotW / datos.length;
  const anchoCol = Math.max(6, Math.min(24, (banda * 0.62 - 2 * (series.length - 1)) / series.length));
  const grupo = anchoCol * series.length + 2 * (series.length - 1);
  const yDe = (v) => (v / max) * plotH;

  const rejilla = ticks.map((t) => {
    const y = y0 - yDe(t);
    return `<line x1="${m.izq}" x2="${w - m.der}" y1="${y}" y2="${y}" class="viz-rejilla"/>
      <text x="${m.izq - 6}" y="${y}" class="viz-eje" text-anchor="end" dominant-baseline="middle">${montoCompacto(t)}</text>`;
  }).join("");

  const columnas = datos.map((d, i) => {
    const x0 = m.izq + banda * i + (banda - grupo) / 2;
    const barras = series.map((s, j) => {
      const v = Math.max(0, d.valores[s.clave] || 0);
      return `<path d="${columna(x0 + j * (anchoCol + 2), y0, anchoCol, yDe(v))}" fill="${s.color}"/>`;
    }).join("");
    const cx = m.izq + banda * i + banda / 2;
    return `<g class="viz-banda" data-i="${i}" tabindex="0" role="img" aria-label="${d.etiqueta}">
      <rect x="${m.izq + banda * i}" y="${m.arr}" width="${banda}" height="${plotH}" class="viz-hit"/>
      ${barras}
      <text x="${cx}" y="${alto - 6}" class="viz-eje ${d.destacado ? "viz-eje--fuerte" : ""}" text-anchor="middle">${d.etiqueta}</text>
    </g>`;
  }).join("");

  return raw(`<svg ${NS} class="viz-svg" width="${w}" height="${alto}" viewBox="0 0 ${w} ${alto}" role="group" aria-label="${titulo || ""}">
    ${rejilla}<line x1="${m.izq}" x2="${w - m.der}" y1="${y0}" y2="${y0}" class="viz-base"/>${columnas}</svg>`);
}

/**
 * Línea con área (una sola serie), p. ej. saldo al cierre de cada mes.
 * puntos: [{ etiqueta, valor }]
 */
export function graficaLinea({ puntos, ancho, alto = 64, color = "var(--accent)", titulo }) {
  const w = Math.max(200, Math.round(ancho));
  const pad = { x: 6, arr: 8, aba: 8 };
  const vals = puntos.map((p) => p.valor);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const xDe = (i) => pad.x + (puntos.length === 1 ? (w - 2 * pad.x) : (i * (w - 2 * pad.x)) / (puntos.length - 1));
  const yDe = (v) => pad.arr + (1 - (v - min) / (max - min)) * (alto - pad.arr - pad.aba);
  const coords = puntos.map((p, i) => [xDe(i), yDe(p.valor)]);
  const linea = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const area = `${linea}L${coords.at(-1)[0].toFixed(1)},${alto}L${coords[0][0].toFixed(1)},${alto}Z`;
  const [ux, uy] = coords.at(-1);
  const banda = (w - 2 * pad.x) / Math.max(1, puntos.length - 1);
  const hits = puntos.map((p, i) => `<g class="viz-banda" data-i="${i}" tabindex="0" role="img" aria-label="${p.etiqueta}">
      <rect x="${xDe(i) - banda / 2}" y="0" width="${banda}" height="${alto}" class="viz-hit"/>
      <line x1="${xDe(i)}" x2="${xDe(i)}" y1="0" y2="${alto}" class="viz-cursor"/>
    </g>`).join("");

  return raw(`<svg ${NS} class="viz-svg" width="${w}" height="${alto}" viewBox="0 0 ${w} ${alto}" role="group" aria-label="${titulo || ""}">
    <path d="${area}" fill="${color}" class="viz-area"/>
    <path d="${linea}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${hits}
    <circle cx="${ux}" cy="${uy}" r="4" fill="${color}" class="viz-punto"/>
  </svg>`);
}

/** Leyenda (≥ 2 series): muestra del color + nombre en color de texto. */
export function leyenda(series) {
  return html`<ul class="viz-leyenda">${series.map((s) => html`<li><span class="viz-muestra" style="background:${s.color}"></span>${s.nombre}</li>`)}</ul>`;
}

/**
 * Tooltip delegado para cualquier gráfica dentro de `raiz`.
 * obtener(grafica, i) -> { titulo, filas: [{ color, nombre, valor }] }
 * El contenido se escribe con textContent (los nombres vienen de datos del usuario).
 */
export function activarTooltips(raiz, obtener) {
  const tip = document.createElement("div");
  tip.className = "viz-tooltip";
  tip.setAttribute("role", "status");
  tip.hidden = true;

  function mostrar(banda) {
    const grafica = banda.closest("[data-grafica]");
    if (!grafica) return;
    const info = obtener(grafica.dataset.grafica, Number(banda.dataset.i));
    if (!info) return;
    tip.replaceChildren();
    const t = document.createElement("p");
    t.className = "viz-tooltip__titulo";
    t.textContent = info.titulo;
    tip.appendChild(t);
    for (const f of info.filas) {
      const fila = document.createElement("p");
      fila.className = "viz-tooltip__fila";
      if (f.color) {
        const k = document.createElement("span");
        k.className = "viz-tooltip__clave";
        k.style.background = f.color;
        fila.appendChild(k);
      }
      const v = document.createElement("strong");
      v.textContent = f.valor;
      const n = document.createElement("span");
      n.textContent = f.nombre;
      fila.append(v, n);
      tip.appendChild(fila);
    }
    grafica.appendChild(tip);
    tip.hidden = false;
    raiz.querySelectorAll(".viz-banda--activa").forEach((b) => b.classList.remove("viz-banda--activa"));
    banda.classList.add("viz-banda--activa");
    // Posición: centrado sobre la banda, sin salirse de la tarjeta.
    const gr = grafica.getBoundingClientRect();
    const br = banda.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const x = Math.min(Math.max(br.left - gr.left + br.width / 2 - tw / 2, 0), gr.width - tw);
    tip.style.left = `${x}px`;
  }

  function ocultar() {
    tip.hidden = true;
    raiz.querySelectorAll(".viz-banda--activa").forEach((b) => b.classList.remove("viz-banda--activa"));
  }

  const mover = (e) => {
    const banda = e.target.closest?.(".viz-banda");
    if (banda && raiz.contains(banda)) mostrar(banda);
  };
  const salir = (e) => {
    if (!e.relatedTarget || !e.relatedTarget.closest?.("[data-grafica]")) ocultar();
  };
  raiz.addEventListener("pointerover", mover);
  raiz.addEventListener("pointerdown", mover);
  raiz.addEventListener("focusin", mover);
  raiz.addEventListener("pointerout", salir);
  raiz.addEventListener("focusout", salir);
  return () => {
    raiz.removeEventListener("pointerover", mover);
    raiz.removeEventListener("pointerdown", mover);
    raiz.removeEventListener("focusin", mover);
    raiz.removeEventListener("pointerout", salir);
    raiz.removeEventListener("focusout", salir);
    tip.remove();
  };
}

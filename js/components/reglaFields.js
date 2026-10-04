// ============================================================
// components/reglaFields.js
// Campos de frecuencia (semanal, quincenal, mensual, anual,
// cada N días) reutilizados en obligaciones, deudas e ingresos
// programados. Solo muestra los campos de la frecuencia elegida.
// ============================================================

import { html } from "../core/dom.js";
import { hoy } from "../core/dates.js";
import { FRECUENCIAS, DIAS_SEMANA, describirRegla } from "../domain/periodos.js";
import { campo } from "./fields.js";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const opcion = (valor, etiqueta, actual) => html`<option value="${valor}" ${String(valor) === String(actual) ? "selected" : ""}>${etiqueta}</option>`;

export function camposRegla(regla = {}, { etiquetaDesde = "Desde" } = {}) {
  const r = { frecuencia: "mensual", diaMes: Number(hoy().slice(8, 10)), diaSemana: 1, mes: Number(hoy().slice(5, 7)), cadaNDias: 30, desde: hoy(), ...regla };
  return html`<div class="regla" data-frecuencia="${r.frecuencia}">
    ${campo({ label: "Frecuencia", nombre: "frecuencia", control: html`<select name="frecuencia">
      ${Object.entries(FRECUENCIAS).map(([k, v]) => opcion(k, v, r.frecuencia))}</select>` })}
    <div class="fila-2">
      <div class="regla__semanal">${campo({ label: "Día", nombre: "diaSemana", control: html`<select name="diaSemana">
        ${DIAS_SEMANA.map((d, i) => opcion(i, d, r.diaSemana))}</select>` })}</div>
      <div class="regla__dia">${campo({ label: "Día del mes", nombre: "diaMes", control: html`<input name="diaMes" type="number" inputmode="numeric" min="1" max="31" value="${r.diaMes}" />` })}</div>
      <div class="regla__anual">${campo({ label: "Mes", nombre: "mes", control: html`<select name="mes">
        ${MESES.map((m, i) => opcion(i + 1, m, r.mes))}</select>` })}</div>
      <div class="regla__n">${campo({ label: "Cada cuántos días", nombre: "cadaNDias", control: html`<input name="cadaNDias" type="number" inputmode="numeric" min="1" value="${r.cadaNDias}" />` })}</div>
    </div>
    <div class="fila-2">
      ${campo({ label: etiquetaDesde, nombre: "desde", control: html`<input type="date" name="desde" value="${r.desde}" />` })}
      ${campo({ label: "Hasta (opcional)", nombre: "hasta", control: html`<input type="date" name="hasta" value="${r.hasta || ""}" />` })}
    </div>
    <p class="campo__ayuda" data-regla-resumen>${describirRegla(r)}</p>
  </div>`;
}

/** Lee la regla del formulario: solo los campos que aplican a la frecuencia. */
export function leerRegla(form) {
  const frecuencia = form.frecuencia.value;
  const regla = { frecuencia, desde: form.desde.value };
  if (form.hasta.value) regla.hasta = form.hasta.value;
  if (frecuencia === "semanal") regla.diaSemana = Number(form.diaSemana.value);
  if (frecuencia === "mensual" || frecuencia === "anual") regla.diaMes = Number(form.diaMes.value);
  if (frecuencia === "anual") regla.mes = Number(form.mes.value);
  if (frecuencia === "personalizada") regla.cadaNDias = Number(form.cadaNDias.value);
  return regla;
}

/** Muestra/oculta campos según la frecuencia y actualiza la descripción. */
export function activarRegla(form) {
  const cont = form.querySelector(".regla");
  const sync = () => {
    cont.dataset.frecuencia = form.frecuencia.value;
    const r = leerRegla(form);
    form.querySelector("[data-regla-resumen]").textContent = describirRegla(r);
  };
  cont.addEventListener("change", sync);
  cont.addEventListener("input", sync);
  sync();
}

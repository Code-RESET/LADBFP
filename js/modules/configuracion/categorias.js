// ============================================================
// modules/configuracion/categorias.js
// Categorías de ingreso y gasto: crear, renombrar, desactivar.
// No se borran: los movimientos antiguos siguen apuntándolas.
// ============================================================

import { html, render } from "../../core/dom.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, subscribe, categoriaPorId } from "../../core/state.js";
import { validarCategoria } from "../../domain/catalogos.js";
import { categoriasRepo } from "../../data/catalogosRepo.js";
import { abrirCapa } from "../../components/modal.js";
import { toast, toastError } from "../../components/toast.js";
import { campo, mostrarErrores, segmentado } from "../../components/fields.js";

function lista(tipo, categorias) {
  const items = categorias.filter((c) => c.tipo === tipo);
  return html`<ul class="lista card card--lista">${items.map((c) => html`<li>
    <div class="fila ${c.activa === false ? "atenuada" : ""}">
      <span class="fila__texto"><span class="fila__titulo">${c.nombre}</span>
        ${c.esFinanciamiento ? html`<span class="fila__sub">No cuenta como ingreso</span>` : ""}</span>
      <button type="button" class="btn-texto" data-editar="${c.id}">Editar</button>
      <button type="button" class="btn-texto" data-activar="${c.id}">${c.activa === false ? "Activar" : "Desactivar"}</button>
    </div></li>`)}</ul>`;
}

export function abrirCategorias(uid) {
  let tipo = "gasto";
  let editandoId = null;
  const capa = abrirCapa({ titulo: "Categorías", contenido: html`<div data-cat></div>`, onClose: () => cancelar() });
  const raiz = capa.cuerpo.querySelector("[data-cat]");
  const onError = (err) => toastError(mensajeDeError(err, "No se pudo guardar la categoría."));

  function pintar() {
    const s = getState();
    const editando = editandoId ? categoriaPorId(editandoId) : null;
    render(raiz, html`
      ${segmentado("tipoCat", [{ valor: "gasto", label: "Gastos" }, { valor: "ingreso", label: "Ingresos" }], tipo)}
      <form class="form form--linea" novalidate>
        ${campo({ label: editando ? `Renombrar «${editando.nombre}»` : "Nueva categoría", nombre: "nombre",
          control: html`<input name="nombre" maxlength="40" value="${editando?.nombre || ""}" placeholder="Nombre" />` })}
        <div class="acciones">
          ${editando ? html`<button type="button" class="btn btn--secundario" data-cancelar>Cancelar</button>` : ""}
          <button type="submit" class="btn btn--primario">${editando ? "Guardar" : "Agregar"}</button>
        </div>
      </form>
      ${lista(tipo, s.categorias)}`);
  }

  raiz.addEventListener("change", (e) => {
    if (e.target.name === "tipoCat") { tipo = e.target.value; editandoId = null; pintar(); }
  });
  raiz.addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.editar) { editandoId = t.dataset.editar; pintar(); raiz.querySelector("input[name='nombre']").focus(); }
    if (t.dataset.activar) {
      const c = categoriaPorId(t.dataset.activar);
      categoriasRepo.activar(uid, c.id, c.activa === false, { onError });
    }
    if (t.matches("[data-cancelar]")) { editandoId = null; pintar(); }
  });
  raiz.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const datos = { id: editandoId || undefined, nombre: form.nombre.value.trim(), tipo };
    const { ok, errores } = validarCategoria(datos, getState().categorias);
    if (!ok) { mostrarErrores(form, errores); return; }
    if (!editandoId) Object.assign(datos, { activa: true, esFinanciamiento: false, sistema: false, orden: getState().categorias.length });
    categoriasRepo.guardar(uid, datos, { onError });
    toast(editandoId ? "✓ Categoría actualizada" : "✓ Categoría agregada");
    editandoId = null;
  });

  const cancelar = subscribe(pintar);
  pintar();
}

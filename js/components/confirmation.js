// ============================================================
// components/confirmation.js
// Confirmación para acciones importantes (sección 40): anular,
// eliminar, importar... Puede pedir un motivo obligatorio.
// ============================================================

import { html } from "../core/dom.js";
import { abrirCapa } from "./modal.js";

/**
 * const r = await confirmar({ titulo, mensaje, botonConfirmar, peligro, pedirMotivo })
 * Devuelve false si se cancela; true, o { motivo } si se pidió motivo.
 */
export function confirmar({
  titulo = "¿Confirmar?",
  mensaje = "",
  botonConfirmar = "Confirmar",
  botonCancelar = "Cancelar",
  peligro = false,
  pedirMotivo = false,
  etiquetaMotivo = "Motivo",
} = {}) {
  return new Promise((resolve) => {
    let resultado = false;
    const capa = abrirCapa({
      titulo,
      variante: "dialog",
      onClose: () => resolve(resultado),
      contenido: html`<form class="confirmacion" novalidate>
        ${mensaje ? html`<p class="confirmacion__mensaje">${mensaje}</p>` : ""}
        ${pedirMotivo ? html`<label class="campo">
          <span class="campo__label">${etiquetaMotivo}</span>
          <textarea name="motivo" rows="2" maxlength="300" required></textarea>
          <span class="campo__error" data-error="motivo"></span>
        </label>` : ""}
        <div class="acciones">
          <button type="button" class="btn btn--secundario" data-cancelar>${botonCancelar}</button>
          <button type="submit" class="btn ${peligro ? "btn--peligro" : "btn--primario"}">${botonConfirmar}</button>
        </div>
      </form>`,
    });
    const form = capa.cuerpo.querySelector("form");
    form.querySelector("[data-cancelar]").addEventListener("click", () => capa.cerrar());
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (pedirMotivo) {
        const motivo = form.motivo.value.trim();
        if (!motivo) {
          form.querySelector('[data-error="motivo"]').textContent = "Escribe el motivo.";
          form.motivo.focus();
          return;
        }
        resultado = { motivo };
      } else {
        resultado = true;
      }
      capa.cerrar();
    });
    (pedirMotivo ? form.motivo : form.querySelector('button[type="submit"]')).focus();
  });
}

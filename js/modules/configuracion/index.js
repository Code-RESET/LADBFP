// ============================================================
// modules/configuracion/index.js
// Apariencia (claro/oscuro/sistema), registros por página,
// categorías, verificación de saldos, sesión y "acerca de".
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { getTema, setTema } from "../../core/theme.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, subscribe } from "../../core/state.js";
import { TAMANOS_PAGINA, tamanoValido } from "../../core/paginacion.js";
import { perfilRepo } from "../../data/perfilRepo.js";
import { icon } from "../../components/icons.js";
import { segmentado, guardarLocal, leerLocal } from "../../components/fields.js";
import { abrirCategorias } from "./categorias.js";
import { verificarSaldos } from "./verificar.js";

export const VERSION_APP = "1.0.0 · Fase 1";

export function render(container, ctx) {
  const uid = ctx.user.uid;

  function pintar() {
    const tamano = tamanoValido(leerLocal("fr.pageSize") || getState().perfil?.config?.pageSize);
    renderHtml(container, html`
      <section class="seccion">
        <h2 class="seccion__titulo">Apariencia</h2>
        <div class="card">
          ${segmentado("tema", [
            { valor: "light", label: "☀️ Claro" },
            { valor: "dark", label: "🌙 Oscuro" },
            { valor: "system", label: "⚙️ Sistema" },
          ], getTema())}
          <p class="campo__ayuda">«Sistema» sigue la preferencia de tu teléfono o computadora.</p>
        </div>
      </section>

      <section class="seccion">
        <h2 class="seccion__titulo">Listas</h2>
        <ul class="lista card card--lista">
          <li><label class="fila">
            <span class="fila__texto"><span class="fila__titulo">Registros por página</span></span>
            <select name="pageSize" class="select-compacto">${TAMANOS_PAGINA.map((n) => html`<option value="${n}" ${n === tamano ? "selected" : ""}>${n}</option>`)}</select>
          </label></li>
          <li><button type="button" class="fila" data-accion="categorias">
            <span class="fila__icono">${icon("etiqueta", { size: 18 })}</span>
            <span class="fila__texto"><span class="fila__titulo">Categorías</span><span class="fila__sub">Crear, editar o desactivar</span></span>
            ${icon("chevron", { size: 16, clase: "fila__chevron" })}
          </button></li>
        </ul>
      </section>

      <section class="seccion">
        <h2 class="seccion__titulo">Mantenimiento</h2>
        <ul class="lista card card--lista">
          <li><button type="button" class="fila" data-accion="verificar">
            <span class="fila__icono">${icon("escudo", { size: 18 })}</span>
            <span class="fila__texto"><span class="fila__titulo">Verificar saldos</span><span class="fila__sub">Recalcula todos los saldos desde los movimientos</span></span>
            ${icon("chevron", { size: 16, clase: "fila__chevron" })}
          </button></li>
        </ul>
      </section>

      <section class="seccion">
        <h2 class="seccion__titulo">Cuenta</h2>
        <ul class="lista card card--lista">
          <li><div class="fila"><span class="fila__texto"><span class="fila__titulo">${ctx.user.email}</span><span class="fila__sub">Sesión activa</span></span></div></li>
          <li><button type="button" class="fila fila--peligro" data-accion="cerrar-sesion">
            <span class="fila__icono">${icon("salir", { size: 18 })}</span><span class="fila__texto"><span class="fila__titulo">Cerrar sesión</span></span>
          </button></li>
        </ul>
      </section>

      <footer class="acerca">
        <img src="assets/logo.svg" alt="" class="acerca__logo" />
        <p><strong>Finanzas Reset</strong> · versión ${VERSION_APP}</p>
        <p>Desarrollado por: <strong>Ing. Luis Ángel Díaz Bernal</strong></p>
        <p>Compañía: <strong>CODE-RESET</strong></p>
      </footer>`);
  }

  const quitarChange = on(container, "change", "input[name='tema'], select[name='pageSize']", (e, el) => {
    if (el.name === "tema") {
      if (setTema(el.value)) perfilRepo.guardarConfig(uid, { tema: el.value });
    } else {
      const n = tamanoValido(el.value);
      guardarLocal("fr.pageSize", n);
      perfilRepo.guardarConfig(uid, { pageSize: n });
    }
  });
  const quitarClick = on(container, "click", "[data-accion='categorias'], [data-accion='verificar']", (e, el) => {
    if (el.dataset.accion === "categorias") abrirCategorias(uid);
    else verificarSaldos(uid).catch((err) => console.error(mensajeDeError(err)));
  });

  // Repintar solo si cambia algo que se muestra (tema remoto, pageSize).
  let firma = "";
  const cancelar = subscribe((s) => {
    const f = JSON.stringify(s.perfil?.config || {});
    if (f !== firma) { firma = f; pintar(); }
  });
  pintar();
  return () => { cancelar(); quitarChange(); quitarClick(); };
}

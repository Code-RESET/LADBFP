// ============================================================
// modules/configuracion/index.js
// Apariencia (claro/oscuro/sistema), registros por página,
// categorías, verificación de saldos, actualizar la app, sesión
// y "acerca de".
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
import { versionInstalada, buscarActualizacion, reinstalarArchivos } from "../../services/actualizacion.js";
import { toast, toastError } from "../../components/toast.js";
import { confirmar } from "../../components/confirmation.js";

export const FASE_APP = "Fase 1";

const MENSAJE_ACTUALIZACION = {
  "al-dia": "✓ Ya tienes la versión más reciente",
  "sin-conexion": "Conéctate a internet para buscar actualizaciones",
  "no-disponible": "Actualización automática no disponible en este navegador. Recarga la página.",
};

export function render(container, ctx) {
  const uid = ctx.user.uid;

  let version = null;
  versionInstalada().then((v) => { version = v; pintar(); });

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
        <h2 class="seccion__titulo">Aplicación</h2>
        <ul class="lista card card--lista">
          <li><button type="button" class="fila" data-accion="actualizar">
            <span class="fila__icono">${icon("historial", { size: 18 })}</span>
            <span class="fila__texto"><span class="fila__titulo">Buscar actualizaciones</span>
              <span class="fila__sub">Versión instalada: ${version || "—"}</span></span>
            ${icon("chevron", { size: 16, clase: "fila__chevron" })}
          </button></li>
          <li><button type="button" class="fila" data-accion="reinstalar">
            <span class="fila__icono">${icon("ajuste", { size: 18 })}</span>
            <span class="fila__texto"><span class="fila__titulo">Reinstalar archivos de la app</span>
              <span class="fila__sub">Solo si algo se ve mal. Tus datos no se borran.</span></span>
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
        <p><strong>Finanzas Reset</strong> · ${FASE_APP}${version ? ` · v${version.replace(/^v/, "")}` : ""}</p>
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
  const quitarClick = on(container, "click", "[data-accion='categorias'], [data-accion='verificar'], [data-accion='actualizar'], [data-accion='reinstalar']", async (e, el) => {
    const accion = el.dataset.accion;
    if (accion === "categorias") abrirCategorias(uid);
    else if (accion === "verificar") verificarSaldos(uid).catch((err) => console.error(mensajeDeError(err)));
    else if (accion === "actualizar") {
      el.disabled = true;
      try {
        const r = await buscarActualizacion();
        if (r === "actualizando") toast("Descargando la versión nueva… la app se reiniciará", { duracion: 0 });
        else if (r === "al-dia") toast(MENSAJE_ACTUALIZACION[r]);
        else toastError(MENSAJE_ACTUALIZACION[r]);
      } catch (err) {
        toastError(mensajeDeError(err, "No se pudo buscar la actualización."));
      } finally {
        el.disabled = false;
      }
    } else if (accion === "reinstalar") {
      const ok = await confirmar({
        titulo: "Reinstalar archivos",
        mensaje: "Se descargarán de nuevo todos los archivos de la app y se reiniciará. Tus movimientos, cajas y cuentas NO se borran: están en la nube.",
        botonConfirmar: "Reinstalar",
      });
      if (!ok) return;
      const r = await reinstalarArchivos();
      if (r === "sin-conexion") toastError(MENSAJE_ACTUALIZACION[r]);
    }
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

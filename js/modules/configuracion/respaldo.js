// ============================================================
// modules/configuracion/respaldo.js
// Hoja "Respaldo de mis datos" (Fase 3):
//   ⬇ Descargar respaldo  → archivo .json con todo
//   ⬆ Restaurar           → elegir el archivo, ver qué se va a
//                           agregar y confirmar. Nunca borra ni
//                           cambia lo que ya existe.
// ============================================================

import { html, render } from "../../core/dom.js";
import { hoy, formatFecha } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState } from "../../core/state.js";
import { construirRespaldo, validarRespaldo, planImportacion, nombreArchivo, etiqueta, COLECCIONES } from "../../domain/respaldo.js";
import { respaldoRepo } from "../../data/respaldoRepo.js";
import { perfilRepo } from "../../data/perfilRepo.js";
import { versionInstalada } from "../../services/actualizacion.js";
import { entregarArchivo } from "../../services/descarga.js";
import { abrirCapa } from "../../components/modal.js";
import { toast, toastError } from "../../components/toast.js";

const sinConexion = () => !navigator.onLine;

export function abrirRespaldo(uid) {
  const ultimo = getState().perfil?.config?.ultimoRespaldo;
  const capa = abrirCapa({
    titulo: "Respaldo de mis datos",
    contenido: html`<div class="respaldo">
      <p>Un respaldo es un archivo con <strong>todos</strong> tus datos: cajas, bancos, gastos fijos, metas y todos tus movimientos.
        Guárdalo en tu correo, Drive o en tu computadora.</p>
      <p class="campo__ayuda">${ultimo ? `Último respaldo: ${formatFecha(ultimo)}.` : "Aún no has descargado ningún respaldo."}</p>
      <button type="button" class="btn btn--primario btn--bloque" data-respaldo="descargar">⬇ Descargar respaldo</button>
      <label class="btn btn--secundario btn--bloque respaldo__restaurar">⬆ Restaurar desde un archivo
        <input type="file" name="archivo" accept=".json,application/json" hidden /></label>
      <p class="campo__ayuda">Restaurar solo agrega lo que falta: no borra ni cambia nada de lo que ya tienes. Sirve para pasar tus datos a otra cuenta o recuperarlos.</p>
      <div class="respaldo__estado" data-estado aria-live="polite"></div>
    </div>`,
  });
  const raiz = capa.cuerpo.querySelector(".respaldo");
  const estado = raiz.querySelector("[data-estado]");
  const pintarEstado = (contenido) => render(estado, contenido);
  let ocupado = false;

  raiz.querySelector('[data-respaldo="descargar"]').addEventListener("click", async (e) => {
    const boton = e.currentTarget;
    if (ocupado) return;
    if (sinConexion()) return toastError("Conéctate a internet para descargar el respaldo completo.");
    ocupado = true;
    boton.disabled = true;
    try {
      pintarEstado(html`<p class="texto-sec">Leyendo tus datos…</p>`);
      const datos = await respaldoRepo.leerTodo(uid, ({ fase, n, total }) => pintarEstado(html`<p class="texto-sec">
        ${fase === "historial" ? `Leyendo el historial… ${n} de ${total}` : `Leyendo movimientos… ${n}`}</p>`));
      const respaldo = construirRespaldo({ uid, version: await versionInstalada(), exportadoEn: new Date().toISOString(), ...datos });
      const archivo = new File([JSON.stringify(respaldo)], nombreArchivo(hoy()), { type: "application/json" });
      const r = await entregarArchivo(archivo);
      if (r !== "cancelado") perfilRepo.guardarConfig(uid, { ultimoRespaldo: hoy() });
      pintarEstado(html`<p class="aviso aviso--ok">✓ Respaldo listo: ${etiqueta("movimientos", respaldo.conteos.movimientos)},
        ${etiqueta("cajas", respaldo.conteos.cajas)}, ${etiqueta("metas", respaldo.conteos.metas)}.</p>`);
      if (r === "descargado") toast("✓ Respaldo descargado");
    } catch (err) {
      pintarEstado(html`<p class="aviso aviso--error">${mensajeDeError(err, "No se pudo crear el respaldo.")}</p>`);
    } finally {
      ocupado = false;
      boton.disabled = false;
    }
  });

  raiz.querySelector('input[name="archivo"]').addEventListener("change", async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo || ocupado) return;
    if (sinConexion()) return toastError("Conéctate a internet para restaurar.");
    ocupado = true;
    try {
      let respaldo;
      try { respaldo = JSON.parse(await archivo.text()); } catch { respaldo = null; }
      const v = validarRespaldo(respaldo);
      if (!v.ok) { pintarEstado(html`<p class="aviso aviso--error">${v.error}</p>`); return; }
      pintarEstado(html`<p class="texto-sec">Revisando qué te falta…</p>`);
      const plan = planImportacion(respaldo, await respaldoRepo.idsExistentes(uid));
      pintarVistaPrevia(respaldo, plan, v);
    } catch (err) {
      pintarEstado(html`<p class="aviso aviso--error">${mensajeDeError(err, "No se pudo leer el respaldo.")}</p>`);
    } finally {
      ocupado = false;
    }
  });

  function pintarVistaPrevia(respaldo, plan, v) {
    const filas = [...COLECCIONES.map((c) => [c, plan.porColeccion[c].nuevos.length, plan.porColeccion[c].existentes]),
      ["movimientos", plan.movimientos.nuevos.length, plan.movimientos.existentes]].filter(([, nuevos, ya]) => nuevos || ya);
    const fecha = respaldo.exportadoEn ? formatFecha(respaldo.exportadoEn.slice(0, 10)) : "";
    if (!plan.totalNuevos) {
      pintarEstado(html`<p class="aviso aviso--ok">✓ Ya tienes todo lo que trae este respaldo${fecha ? ` (del ${fecha})` : ""}. No hay nada que agregar.</p>`);
      return;
    }
    pintarEstado(html`<div class="card card--suave respaldo__previa">
      <p><strong>Respaldo${fecha ? ` del ${fecha}` : ""}</strong>. Se agregarán:</p>
      <ul class="sublista">${filas.map(([c, nuevos, ya]) => html`<li><span>${etiqueta(c, nuevos)}</span>
        <span class="texto-sec">${ya ? `${ya} ya ${ya === 1 ? "existe" : "existen"}` : ""}</span></li>`)}</ul>
      ${plan.movimientos.anulados ? html`<p class="campo__ayuda">${plan.movimientos.anulados === 1 ? "1 movimiento se restaura como anulado" : `${plan.movimientos.anulados} movimientos se restauran como anulados`} (con su motivo).</p>` : ""}
      ${v.invalidos?.movimientos ? html`<p class="campo__ayuda">${etiqueta("movimientos", v.invalidos.movimientos)} con datos dañados se omitirán.</p>` : ""}
      <p class="campo__ayuda">Lo que ya tienes no se borra ni se cambia. Al terminar se recalculan tus saldos.</p>
      <button type="button" class="btn btn--primario btn--bloque" data-respaldo="restaurar">Restaurar</button>
    </div>`);
    estado.querySelector('[data-respaldo="restaurar"]').addEventListener("click", async (e) => {
      if (ocupado) return;
      ocupado = true;
      e.currentTarget.disabled = true; // la vista se reemplaza al terminar
      try {
        const r = await respaldoRepo.importar(uid, plan, {
          config: respaldo.data.config,
          onProgreso: ({ fase, n, total }) => pintarEstado(html`<p class="texto-sec">${fase === "movimientos" ? `Restaurando movimientos… ${n} de ${total}`
            : fase === "saldos" ? "Recalculando tus saldos…" : "Restaurando cajas, bancos y plan…"}</p>`),
        });
        pintarEstado(html`<p class="aviso aviso--ok">✓ Restaurado: se agregaron ${r.creados} registros${r.omitidos ? ` (${r.omitidos} no se pudieron agregar)` : ""}. Tus saldos ya están recalculados.</p>`);
        toast("✓ Respaldo restaurado");
      } catch (err) {
        pintarEstado(html`<p class="aviso aviso--error">${mensajeDeError(err, "No se pudo restaurar el respaldo.")} Lo que ya se agregó se queda; puedes volver a intentarlo.</p>`);
      } finally {
        ocupado = false;
      }
    });
  }
  return capa;
}

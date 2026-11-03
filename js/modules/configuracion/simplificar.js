// ============================================================
// modules/configuracion/simplificar.js
// Hoja «Simplificar mi app» (v2.0.0): muestra cómo quedarán tus
// cuentas (cada una con lo que dice tu banco y lo que debes en cada
// tarjeta), descarga un respaldo y convierte todo de un toque, con
// Deshacer. Cálculos en domain/convertir.js; escritura en
// data/conversionRepo.js.
// ============================================================

import { html } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { hoy } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState } from "../../core/state.js";
import { planConversion } from "../../domain/convertir.js";
import { conversionRepo } from "../../data/conversionRepo.js";
import { abrirCapa } from "../../components/modal.js";
import { toast, toastError } from "../../components/toast.js";
import { descargarRespaldo } from "./respaldo.js";

const onError = (err) => toastError(mensajeDeError(err, "No se pudo simplificar la app."));
const TEXTO_BOTON = "Descargar respaldo y simplificar";

function renglon(x) {
  const tarjeta = x.cuenta.tipo === "credito";
  const monto = tarjeta && x.saldo < 0 ? `debes ${formatMonto(-x.saldo)}` : formatMonto(x.saldo);
  return html`<li><span>${tarjeta ? "💳 " : ""}${x.cuenta.nombre}${x.antes ? html`<small class="simplificar__antes">antes «${x.antes}»</small>` : ""}</span>
    <span class="${x.saldo < 0 ? "monto--negativo" : ""}">${monto}</span></li>`;
}

export function abrirSimplificar() {
  const s = getState();
  const uid = s.user?.uid;
  if (!uid) return null;
  const plan = planConversion({ ...s, agregados: s.agregadosCrudos || s.agregados, hoy: hoy() });
  const grupos = [
    ["Para gastar", plan.cuentas.filter((x) => x.cuenta.tipo !== "credito" && !x.ahorro)],
    ["Ahorro e inversión", plan.cuentas.filter((x) => x.ahorro)],
    ["Tarjetas", plan.cuentas.filter((x) => x.cuenta.tipo === "credito")],
  ].filter(([, lista]) => lista.length);
  const capa = abrirCapa({
    titulo: "Simplificar mi app",
    contenido: html`<div class="simplificar">
      <p>Tus cajas se vuelven tus <strong>cuentas</strong>: cada una dice lo mismo que tu banco y lo que debes se queda en cada tarjeta. Ya no eliges caja al anotar.</p>
      <p class="texto-sec">No se pierde nada: tus movimientos, gastos fijos, deudas y metas se quedan, ahora con su cuenta.</p>
      <div class="card card--suave">
        <p class="campo__label">Así quedan tus cuentas</p>
        ${grupos.map(([titulo, lista]) => html`<p class="simplificar__grupo">${titulo}</p><ul class="sublista">${lista.map(renglon)}</ul>`)}
      </div>
      ${plan.conflictos.length ? html`<p class="campo__ayuda">Ya no aplican: ${plan.conflictos.map((c) => `«${c.item.nombre || c.item.acreedor}» (${c.motivo})`).join(", ")}.</p>` : ""}
      <p class="campo__ayuda">Antes de cambiar nada se descarga un respaldo con todos tus datos. Guárdalo.</p>
      <p class="campo__error" data-estado></p>
      <button type="button" class="btn btn--primario btn--bloque" data-simplificar>${TEXTO_BOTON}</button>
    </div>`,
  });
  const estado = capa.cuerpo.querySelector("[data-estado]");
  const boton = capa.cuerpo.querySelector("[data-simplificar]");
  boton.addEventListener("click", async () => {
    if (!navigator.onLine) { estado.textContent = "Conéctate a internet: primero se descarga el respaldo."; return; }
    boton.disabled = true;
    estado.textContent = "";
    boton.textContent = "Descargando respaldo…";
    try {
      const { r } = await descargarRespaldo(uid);
      if (r === "cancelado") { estado.textContent = "Guarda el respaldo para continuar. No se cambió nada."; return; }
      // Con los datos de este momento (algo pudo cambiar mientras se descargaba).
      const ahora = getState();
      const final = planConversion({ ...ahora, agregados: ahora.agregadosCrudos || ahora.agregados, hoy: hoy() });
      const ids = conversionRepo.aplicar(uid, final, { hoy: hoy(), onError });
      capa.cerrar();
      toast("✓ Listo: tu app ahora usa solo cuentas", {
        duracion: 10000,
        accion: { label: "Deshacer", onClick: () => conversionRepo.deshacer(uid, final, ids, { onError }) },
      });
    } catch (err) {
      estado.textContent = mensajeDeError(err, "No se pudo descargar el respaldo. No se cambió nada.");
    } finally {
      boton.disabled = false;
      boton.textContent = TEXTO_BOTON;
    }
  });
  return capa;
}

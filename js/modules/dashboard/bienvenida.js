// ============================================================
// modules/dashboard/bienvenida.js
// Asistente de primera vez: 1) crear cajas, cuentas y
// categorías iniciales; 2) capturar saldos iniciales (apertura).
// ============================================================

import { html, render } from "../../core/dom.js";
import { parseMonto, formatMonto } from "../../core/money.js";
import { hoy } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, cajasActivas, cuentasActivas } from "../../core/state.js";
import { validarMovimiento } from "../../domain/movimientos.js";
import { sembrarCatalogos, CAJAS_INICIALES, CUENTAS_INICIALES } from "../../data/seed.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { toast, toastError } from "../../components/toast.js";
import { opciones } from "../../components/fields.js";

export function pasoCatalogos(container) {
  render(container, html`<section class="card bienvenida">
    <h2 class="card__titulo-grande">Bienvenido a Finanzas Reset</h2>
    <p class="texto-sec">Vamos a crear tus cajas y cuentas iniciales. Después podrás editarlas, desactivarlas o agregar más.</p>
    <div class="bienvenida__cols">
      <div>
        <h3 class="seccion__titulo">Cajas</h3>
        <ul class="lista-simple">${CAJAS_INICIALES.map((c) => html`<li><span class="punto" style="background:${c.color}"></span>${c.nombre}</li>`)}</ul>
      </div>
      <div>
        <h3 class="seccion__titulo">Cuentas</h3>
        <ul class="lista-simple">${CUENTAS_INICIALES.map((c) => html`<li>${c.nombre}</li>`)}</ul>
      </div>
    </div>
    <button type="button" class="btn btn--primario btn--bloque" data-accion="sembrar">Crear cajas y cuentas</button>
  </section>`);

  container.querySelector('[data-accion="sembrar"]').addEventListener("click", (e) => {
    e.currentTarget.disabled = true;
    sembrarCatalogos(getState().user.uid).catch((err) => {
      toastError(mensajeDeError(err, "No se pudieron crear los datos iniciales."));
    });
    toast("✓ Cajas y cuentas creadas");
  });
}

/** Captura de saldos iniciales: una fila por caja (con su cuenta predeterminada). */
export function pasoSaldosIniciales(container, { onListo }) {
  const cajas = cajasActivas();
  const cuentas = cuentasActivas();
  render(container, html`<section class="card bienvenida">
    <h2 class="card__titulo-grande">Saldos iniciales</h2>
    <p class="texto-sec">¿Cuánto dinero tiene hoy cada caja? Se registra como <strong>saldo inicial</strong>: no cuenta como ingreso en los reportes. Deja en blanco lo que no quieras capturar ahora.</p>
    <form class="form-saldos" novalidate>
      ${cajas.map((c) => html`<div class="fila-saldo">
        <span class="fila-saldo__caja"><span class="punto" style="background:${c.color || "var(--accent)"}"></span>${c.nombre}</span>
        <select name="cuenta-${c.id}" aria-label="Cuenta de ${c.nombre}">${opciones(cuentas, c.cuentaPredeterminadaId)}</select>
        <input name="monto-${c.id}" inputmode="decimal" placeholder="$0.00" aria-label="Saldo de ${c.nombre}" />
      </div>`)}
      <p class="campo__error" data-error="general"></p>
      <div class="acciones">
        <button type="button" class="btn btn--secundario" data-accion="omitir">Omitir por ahora</button>
        <button type="submit" class="btn btn--primario">Guardar saldos</button>
      </div>
    </form>
  </section>`);

  const form = container.querySelector("form");
  form.querySelector('[data-accion="omitir"]').addEventListener("click", onListo);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const uid = getState().user.uid;
    const capturas = [];
    for (const c of cajas) {
      const texto = form[`monto-${c.id}`].value.trim();
      if (!texto) continue;
      const montoCentavos = parseMonto(texto);
      if (montoCentavos == null || montoCentavos <= 0) {
        form.querySelector('[data-error="general"]').textContent = `Monto inválido en ${c.nombre}.`;
        form[`monto-${c.id}`].focus();
        return;
      }
      const m = { tipo: "apertura", fecha: hoy(), montoCentavos, cajaId: c.id, cuentaId: form[`cuenta-${c.id}`].value, nota: "Saldo inicial" };
      const v = validarMovimiento(m, { cajas, cuentas });
      if (!v.ok) {
        form.querySelector('[data-error="general"]').textContent = `${c.nombre}: ${Object.values(v.errores)[0]}`;
        return;
      }
      capturas.push(m);
    }
    const onError = (err) => toastError(mensajeDeError(err, "No se pudo guardar un saldo inicial."));
    capturas.forEach((m) => movimientosRepo.crear(uid, m, { onError, origen: "inicial" }));
    const total = capturas.reduce((a, m) => a + m.montoCentavos, 0);
    if (capturas.length) toast(`✓ ${capturas.length} saldos iniciales · ${formatMonto(total)}`);
    onListo();
  });
}


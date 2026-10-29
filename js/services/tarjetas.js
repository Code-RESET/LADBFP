// ============================================================
// services/tarjetas.js
// Estado de cada tarjeta de crédito (para Mi mes y Tarjetas).
// Solo lee los movimientos de la tarjeta de sus dos últimos cortes
// (pocos); lo demás sale de los agregados. El cálculo vive
// en domain/tarjetas.js. El resultado se recuerda mientras no
// cambie nada de las tarjetas (ni sus compras a meses).
// Si la consulta falla, se calcula igual sin separar lo de antes
// y después del corte (`aproximado`: pedir de más nunca genera
// intereses).
// ============================================================

import { getState } from "../core/state.js";
import { hoy as hoyMexico } from "../core/dates.js";
import { estadoTarjeta, inicioMovimientos, tarjetaConfigurada, esTarjeta } from "../domain/tarjetas.js";
import { movimientosRepo } from "../data/movimientosRepo.js";
import { diasEntre as diasHasta } from "../domain/periodos.js";

let memo = { clave: null, promesa: null };

export const tarjetasDe = (s = getState()) => s.cuentas.filter(esTarjeta);

/** Todo lo que cambia el estado de las tarjetas: la tarjeta, sus totales por mes y sus compras a meses. */
function firma(s, hoy) {
  const tarjetas = tarjetasDe(s);
  const ids = new Set(tarjetas.map((t) => t.id));
  const msi = s.deudas.filter((d) => ids.has(d.tarjetaId));
  return JSON.stringify([
    hoy,
    tarjetas.map((t) => [t.id, t.nombre, t.activa, t.credito]),
    msi.map((d) => [d.id, d.saldoInicialCentavos, d.pagoCentavos, d.regla, d.activa, d.cajaId, d.descripcion, d.meses]),
    Object.entries(s.agregados).sort(([a], [b]) => a.localeCompare(b)).map(([mes, a]) => [mes,
      tarjetas.map((t) => a?.porCuenta?.[t.id] || null),
      msi.map((d) => a?.porDeuda?.[d.id] || 0),
      Object.entries(a?.porVinculo || {}).filter(([k]) => msi.some((d) => k.startsWith(`d:${d.id}__`)))]),
  ]);
}

/** [{ cuenta, estado, aproximado }] de todas las tarjetas (activas e inactivas). */
export function estadosTarjetas(s = getState(), hoy = hoyMexico()) {
  const uid = s.user?.uid;
  if (!uid) return Promise.resolve([]);
  const clave = firma(s, hoy);
  if (memo.clave === clave && memo.promesa) return memo.promesa;
  const promesa = Promise.all(tarjetasDe(s).map(async (cuenta) => {
    let movimientos = [];
    let aproximado = false;
    if (tarjetaConfigurada(cuenta)) {
      try {
        movimientos = await movimientosRepo.deCuentaDespuesDe(uid, cuenta.id, inicioMovimientos(cuenta.credito, hoy));
      } catch {
        aproximado = true;
      }
    }
    const estado = estadoTarjeta({ cuenta, agregados: s.agregados, deudas: s.deudas, movimientos, hoy });
    if (aproximado) {
      // Sin los movimientos de después del corte: todo lo que debes cuenta para no generar intereses.
      // No se sabe si ya pagaste el corte: nunca se marca "vencida" con datos incompletos.
      estado.pendienteCorte = estado.deudaRegular;
      estado.paraNoGenerarIntereses = estado.deudaRegular + estado.pendienteMsi;
      estado.estado = estado.paraNoGenerarIntereses ? "por-pagar" : "sin-deuda";
      estado.vencidaDesde = null;
      estado.dias = estado.fechaLimite ? diasHasta(hoy, estado.fechaLimite) : null;
    }
    return { cuenta, estado, aproximado };
  }));
  memo = { clave, promesa };
  return promesa;
}

/** Olvida el cálculo guardado (p. ej. después de registrar un pago, para no esperar a la firma). */
export function olvidarEstados() {
  memo = { clave: null, promesa: null };
}

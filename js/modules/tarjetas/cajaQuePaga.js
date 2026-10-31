// ============================================================
// modules/tarjetas/cajaQuePaga.js
// "La caja que paga la tarjeta" (v1.12.0): lo que compras con una
// tarjeta se resta de la caja con la que la pagas, no de la que
// estabas usando (p. ej. tu efectivo). Si parte de la tarjeta quedó
// en otras cajas (compras anotadas antes, la deuda inicial, compras
// a meses o gastos fijos), «Pasar todo» la mueve a esa caja de un
// toque: una transferencia dentro de la tarjeta por caja (no mueve
// dinero de tus bancos ni cambia lo que debes), con Deshacer.
// Cálculos en domain/tarjetas.js.
// ============================================================

import { formatMonto } from "../../core/money.js";
import { hoy } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, cajaPorId } from "../../core/state.js";
import { cajaDeTarjeta, enOtrasCajas, movimientosParaPasar } from "../../domain/tarjetas.js";
import { construirMovimiento } from "../../domain/movimientos.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { deudasRepo, obligacionesRepo } from "../../data/planRepo.js";
import { confirmar } from "../../components/confirmation.js";
import { toast, toastError } from "../../components/toast.js";
import { cuentaDeCaja } from "../../components/registroSimple.js";
import { olvidarEstados } from "../../services/tarjetas.js";

const onError = (err) => toastError(mensajeDeError(err, "No se pudo pasar a la caja que paga la tarjeta."));
const nombre = (id) => cajaPorId(id)?.nombre || "otra caja";

/** Lo de la tarjeta que está en otras cajas; null si todo está en la caja que la paga (o aún no tiene caja). */
export function otrasCajasDe(tarjeta, s = getState(), cajaId = cajaDeTarjeta(tarjeta, s.cajas)) {
  if (!cajaId) return null;
  const r = enOtrasCajas({ tarjeta, cajaId, agregados: s.agregados, deudas: s.deudas, obligaciones: s.obligaciones, hoy: hoy() });
  return r.vacio ? null : r;
}

/** "EFECTIVO debe $1,462.08 · 1 compra a meses · 2 gastos fijos" */
export function textoOtrasCajas(r) {
  return [
    ...r.saldos.map((d) => (d.saldo < 0 ? `${nombre(d.cajaId)} debe ${formatMonto(-d.saldo)}` : `${nombre(d.cajaId)} tiene ${formatMonto(d.saldo)} a favor`)),
    r.msi.length ? `${r.msi.length} ${r.msi.length === 1 ? "compra" : "compras"} a meses` : "",
    r.fijos.length ? `${r.fijos.length} ${r.fijos.length === 1 ? "gasto fijo" : "gastos fijos"}` : "",
  ].filter(Boolean).join(" · ");
}

/** Pasa todo lo de la tarjeta a `cajaId`: movimientos en un solo batch y las compras a meses y gastos fijos, con Deshacer. */
export function pasarACajaQuePaga(tarjeta, cajaId, r) {
  const uid = getState().user?.uid;
  if (!uid || !cajaId || !r) return;
  const movs = movimientosParaPasar({ tarjeta, cajaId, saldos: r.saldos, fecha: hoy(), nota: `${tarjeta.nombre}: ahora la paga ${nombre(cajaId)}` });
  const ids = movs.length ? movimientosRepo.crearVarios(uid, movs, { onError }) : [];
  // Las mensualidades se pagan desde el banco de la caja que paga.
  const bancoId = cuentaDeCaja(cajaId);
  const msi = r.msi.map((d) => [d, { ...d, cajaId, cuentaId: bancoId || d.cuentaId }]);
  const fijos = r.fijos.map((o) => [o, { ...o, cajaId }]);
  for (const [antes, despues] of msi) deudasRepo.guardar(uid, despues, { anterior: antes, onError });
  for (const [antes, despues] of fijos) obligacionesRepo.guardar(uid, despues, { anterior: antes, onError });
  olvidarEstados();
  toast(`✓ Todo lo de ${tarjeta.nombre} lo paga ahora ${nombre(cajaId)}`, {
    duracion: 7000,
    accion: {
      label: "Deshacer",
      onClick: () => {
        if (ids.length) movimientosRepo.anularVarios(uid, ids.map((id, i) => ({ id, ...construirMovimiento(movs[i]) })), "Deshecho: caja que paga la tarjeta", { onError });
        for (const [antes, despues] of msi) deudasRepo.guardar(uid, antes, { anterior: despues, onError });
        for (const [antes, despues] of fijos) obligacionesRepo.guardar(uid, antes, { anterior: despues, onError });
        olvidarEstados();
      },
    },
  });
}

/** Después de elegir la caja de una tarjeta: si parte quedó en otras cajas, ofrece pasarla. → true si la pasó. */
export async function ofrecerPasar(tarjeta, cajaId) {
  const r = otrasCajasDe(tarjeta, getState(), cajaId);
  if (!r) return false;
  const ok = await confirmar({
    titulo: `¿Pasar todo a ${nombre(cajaId)}?`,
    mensaje: `Parte de ${tarjeta.nombre} está en otra caja: ${textoOtrasCajas(r)}. Al pasarla, esas cajas recuperan su dinero y la paga ${nombre(cajaId)}. No cambia lo que debes ni el dinero de tus bancos.`,
    botonConfirmar: "Pasar todo",
  });
  if (ok) pasarACajaQuePaga(tarjeta, cajaId, r);
  return ok;
}

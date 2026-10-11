// ============================================================
// components/marcarPagado.js
// La casilla ☐/☑ de "Mi mes", como en la hoja de Excel:
//   ☐ → ☑  registra el pago (o el ingreso recibido) vinculado a
//          ese gasto fijo y a ese mes, con su caja y su cuenta.
//          El aviso trae "Deshacer".
//   ☑ → ☐  quita (anula) el pago de ese mes. Queda en el historial.
// También sirve para las aportaciones a metas (transferencia a la
// caja de ahorro con metaId + metaPeriodo) y para las mensualidades
// de compras a meses (gasto desde el banco donde la caja tiene su
// dinero, vinculado a la compra).
// ============================================================

import { hoy, mesDe } from "../core/dates.js";
import { mensajeDeError } from "../core/errors.js";
import { getState } from "../core/state.js";
import { validarMovimiento, construirMovimiento } from "../domain/movimientos.js";
import { etiquetaMsi } from "../domain/tarjetas.js";
import { movimientosRepo } from "../data/movimientosRepo.js";
import { confirmar } from "./confirmation.js";
import { toast, toastError } from "./toast.js";
import { cuentaDeCaja } from "./registroSimple.js";

const onError = (err) => toastError(mensajeDeError(err, "No se pudo guardar."));

const VINCULO = {
  obligacion: ["obligacionId", "obligacionPeriodo"],
  deuda: ["deudaId", "deudaPeriodo"],
  ingreso: ["recurrenteId", "recurrentePeriodo"],
  meta: ["metaId", "metaPeriodo"],
};

/** Movimiento que marca `item` (fila de gasto/ingreso fijo o aportación a meta) como pagado/recibido/aportado en `mes`. */
export function entradaDePago(item, mes, hoyF = hoy()) {
  const [campoId, campoPeriodo] = VINCULO[item.clase];
  // Aportación a una meta: transferencia de la caja de origen a la caja de ahorro.
  if (item.clase === "meta") {
    return {
      tipo: "transferencia",
      montoCentavos: item.pendiente,
      fecha: mes === mesDe(hoyF) ? hoyF : item.periodo,
      cajaId: item.ref.cajaOrigenId,
      cuentaId: cuentaDeCaja(item.ref.cajaOrigenId),
      cajaDestinoId: item.ref.cajaAhorroId,
      cuentaDestinoId: cuentaDeCaja(item.ref.cajaAhorroId),
      nota: `Ahorro: ${item.nombre}`,
      [campoId]: item.ref.id,
      [campoPeriodo]: item.periodo,
    };
  }
  const tipo = item.clase === "ingreso" ? "ingreso" : "gasto";
  // Mensualidad de una compra a meses: se paga desde el banco donde la caja tiene su dinero.
  const msi = item.clase === "deuda" && item.ref.tarjetaId;
  return {
    tipo,
    montoCentavos: item.pendiente,
    // En el mes actual el pago es de hoy; en otro mes, del día en que tocaba.
    fecha: mes === mesDe(hoyF) ? hoyF : item.periodo,
    cajaId: item.ref.cajaId,
    cuentaId: msi ? cuentaDeCaja(item.ref.cajaId) : item.ref.cuentaId,
    categoriaId: item.categoriaId || (item.clase === "deuda" ? "ga-deudas" : ""),
    nota: msi ? `${item.nombre} (${etiquetaMsi(item.ref, item.periodo)})` : item.nombre,
    formaPago: item.ref.formaPago || "",
    [campoId]: item.ref.id,
    [campoPeriodo]: item.periodo,
  };
}

/** ☐ → ☑. Si falta algo (caja desactivada…), abre el formulario completo para elegirlo. */
export async function marcarPagado(item, mes) {
  const s = getState();
  const uid = s.user?.uid;
  if (!uid || !(item.pendiente > 0)) return;
  const entrada = entradaDePago(item, mes);
  const { ok } = validarMovimiento(entrada, { cajas: s.cajas, cuentas: s.cuentas, categorias: s.categorias });
  if (!ok && item.clase === "meta") {
    toastError("Revisa la meta: su caja de origen o de ahorro está desactivada.");
    return;
  }
  if (!ok) {
    const { pagarEvento } = await import("../modules/plan/acciones.js");
    return pagarEvento({ ...item, cajaId: item.ref.cajaId, cuentaId: item.ref.cuentaId, monto: item.pendiente });
  }
  const id = movimientosRepo.crear(uid, entrada, { onError });
  const verbo = item.clase === "meta" ? "aportado" : entrada.tipo === "ingreso" ? "recibido" : "pagado";
  toast(`✓ ${item.nombre} ${verbo}`, {
    duracion: 6000,
    accion: { label: "Deshacer", onClick: () => movimientosRepo.anular(uid, { id, ...construirMovimiento(entrada) }, "Deshecho al marcar", { onError }) },
  });
}

/** ☑ → ☐: anula los pagos de ese gasto fijo en ese periodo. */
export async function desmarcarPagado(item) {
  const uid = getState().user?.uid;
  if (!uid) return;
  const [campoId, campoPeriodo] = VINCULO[item.clase];
  const ingreso = item.clase === "ingreso";
  const ok = await confirmar({
    titulo: item.clase === "meta" ? `¿No has aportado a ${item.nombre}?` : ingreso ? `¿${item.nombre} no se ha recibido?` : `¿${item.nombre} no está pagado?`,
    mensaje: "Se quita el registro de este mes y vuelve a quedar pendiente. Queda en el historial.",
    botonConfirmar: "Marcar pendiente",
  });
  if (!ok) return;
  try {
    const pagos = (await movimientosRepo.pagosDe(uid, campoId, item.ref.id)).filter((m) => m[campoPeriodo] === item.periodo);
    for (const m of pagos) movimientosRepo.anular(uid, m, "Desmarcado en Mi mes", { onError });
    toast(`${item.nombre} quedó pendiente`);
  } catch (err) {
    onError(err);
  }
}

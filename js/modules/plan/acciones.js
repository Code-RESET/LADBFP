// ============================================================
// modules/plan/acciones.js
// "Pagar" / "Registrar" una ocurrencia: abre el formulario de
// movimiento prellenado y vinculado a su obligación, deuda o
// ingreso programado. Lo usan Plan e Inicio.
// ============================================================

import { formatFecha } from "../../core/dates.js";
import { abrirFormularioMovimiento } from "../../components/movimientoForm.js";

export const claveEvento = (e) => `${e.clase}:${e.ref.id}:${e.periodo}`;

export function pagarEvento(e) {
  const cuando = formatFecha(e.periodo);
  if (e.clase === "obligacion") {
    return abrirFormularioMovimiento({
      tipo: "gasto", cajaId: e.cajaId, cuentaId: e.cuentaId, categoriaId: e.categoriaId, montoCentavos: e.monto,
      nota: e.nombre, titulo: `Pagar ${e.nombre}`, aviso: `Pago de ${e.nombre} · ${cuando}`,
      vinculo: { obligacionId: e.ref.id, obligacionPeriodo: e.periodo },
    });
  }
  if (e.clase === "deuda") {
    return abrirFormularioMovimiento({
      tipo: "gasto", cajaId: e.cajaId, cuentaId: e.cuentaId, categoriaId: e.categoriaId || "ga-deudas", montoCentavos: e.monto,
      nota: `Pago ${e.nombre}`, titulo: `Pagar a ${e.nombre}`, aviso: `Pago de deuda · ${cuando}`,
      vinculo: { deudaId: e.ref.id, deudaPeriodo: e.periodo },
    });
  }
  return abrirFormularioMovimiento({
    tipo: e.clase, cajaId: e.cajaId, cuentaId: e.cuentaId, categoriaId: e.categoriaId,
    cajaDestinoId: e.cajaDestinoId, cuentaDestinoId: e.cuentaDestinoId, montoCentavos: e.monto, nota: e.nombre,
    titulo: e.clase === "ingreso" ? `Registrar ${e.nombre}` : `Transferir: ${e.nombre}`,
    aviso: `${e.nombre} · ${cuando}`,
    vinculo: { recurrenteId: e.ref.id, recurrentePeriodo: e.periodo },
  });
}

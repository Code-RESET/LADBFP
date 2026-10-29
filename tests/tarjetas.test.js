import { test, assert } from "./lib.js";
import {
  corteAnterior, corteSiguiente, fechaLimiteDe, primeraMensualidad, planMsi, deudaDeMsi, numeroMensualidad, etiquetaMsi,
  efectoEnCuenta, estadoTarjeta, repartirPago, movimientosDePago, validarTarjeta, validarMsi, ajusteDeudaInicial, sumarMeses,
} from "../js/domain/tarjetas.js";
import { construirMovimiento, deltasAgregados, validarMovimiento } from "../js/domain/movimientos.js";
import { ocurrencias } from "../js/domain/periodos.js";
import { saldosPor } from "../js/domain/saldos.js";

function sumar(dest, delta) { for (const [k, v] of Object.entries(delta)) { if (typeof v === "number") dest[k] = (dest[k] || 0) + v; else sumar(dest[k] ??= {}, v); } }
function agregadosDe(movs, ag = {}) {
  for (const m of movs) for (const [mes, d] of Object.entries(deltasAgregados(null, construirMovimiento(m)))) sumar(ag[mes] ??= {}, d);
  return ag;
}
const conId = (movs) => movs.map((m, i) => ({ id: `m${i}`, ...construirMovimiento(m) }));

const LIVERPOOL = { id: "liv", nombre: "Liverpool", tipo: "credito", activa: true, credito: { limiteCentavos: 3000000, diaCorte: 15, diaLimite: 5 } };
const NU = { diaCorte: 1, diaLimite: 21 };

test("tarjetas: corte y fecha límite (corte 15 → paga el 5 del mes siguiente; corte 1 → el 21 del mismo mes)", () => {
  const c = LIVERPOOL.credito;
  assert.eq([corteAnterior(c, "2026-10-25"), corteSiguiente(c, "2026-10-25"), fechaLimiteDe("2026-10-15", c)], ["2026-10-15", "2026-11-15", "2026-11-05"]);
  assert.eq([corteAnterior(c, "2026-10-15"), corteAnterior(c, "2026-10-14"), corteSiguiente(c, "2026-10-15")], ["2026-10-15", "2026-09-15", "2026-11-15"]);
  assert.eq([corteAnterior(NU, "2026-10-25"), fechaLimiteDe("2026-10-01", NU)], ["2026-10-01", "2026-10-21"]);
  // Día 31 en febrero → el último día del mes.
  assert.eq(corteAnterior({ diaCorte: 31, diaLimite: 20 }, "2027-03-05"), "2027-02-28");
  assert.eq([sumarMeses("2026-11", 2), sumarMeses("2026-01", -1), sumarMeses("2026-12", 13)], ["2027-01", "2025-12", "2028-01"]);
});

test("tarjetas MSI: la primera mensualidad se paga después del corte en que entra la compra", () => {
  const c = LIVERPOOL.credito;
  assert.eq([primeraMensualidad(c, "2026-10-20"), primeraMensualidad(c, "2026-10-10"), primeraMensualidad(c, "2026-10-15")],
    ["2026-12-05", "2026-11-05", "2026-11-05"]);
  assert.eq(primeraMensualidad(NU, "2026-10-20"), "2026-11-21");
  assert.eq(primeraMensualidad({}, "2026-10-20"), "2026-11-20"); // sin días configurados: el mismo día del mes siguiente
});

test("tarjetas MSI: $12,000 a 12 meses → 12 pagos de $1,000; $10,000 a 3 → la última ajusta centavos", () => {
  const tv = planMsi({ montoCentavos: 1200000, meses: 12, credito: LIVERPOOL.credito, fechaCompra: "2026-10-20" });
  assert.eq(tv, { saldoInicialCentavos: 1200000, pagoCentavos: 100000, regla: { frecuencia: "mensual", diaMes: 5, desde: "2026-12-05" } });
  const fechas = ocurrencias(tv.regla, "2026-10-01", "2028-12-31").slice(0, 12);
  assert.eq([fechas[0], fechas[11]], ["2026-12-05", "2027-11-05"]);
  const tres = planMsi({ montoCentavos: 1000000, meses: 3, credito: LIVERPOOL.credito, fechaCompra: "2026-10-20" });
  assert.eq([tres.pagoCentavos, tres.saldoInicialCentavos - 2 * tres.pagoCentavos], [333334, 333332]);
  // Compra que ya tenía: llevaba 3 de 12 pagadas → faltan $9,000 y la siguiente es la 4.ª (5 mar 2027).
  const ya = deudaDeMsi({ descripcion: "Refri", montoCentavos: 1200000, meses: 12, pagadas: 3, fechaCompra: "2026-10-20", cajaId: "casa" },
    LIVERPOOL, { cuentaPagoId: "bbva", categoriaId: "ga-electrodomesticos" });
  assert.eq([ya.saldoInicialCentavos, ya.pagoCentavos, ya.regla.desde, ya.tarjetaId, ya.meses, ya.acreedor, ya.cuentaId],
    [900000, 100000, "2027-03-05", "liv", 12, "Liverpool", "bbva"]);
  assert.eq([etiquetaMsi(ya, "2027-03-05"), etiquetaMsi(ya, "2027-11-05"), numeroMensualidad({ ...tv, meses: 12 }, "2026-12-05")], ["4 de 12", "12 de 12", 1]);
});

test("tarjetas: efecto de cada movimiento en la tarjeta", () => {
  const m = (x) => ({ montoCentavos: 500, estado: "activo", ...x });
  assert.eq([
    efectoEnCuenta(m({ tipo: "gasto", cuentaId: "liv" }), "liv"),
    efectoEnCuenta(m({ tipo: "transferencia", cuentaId: "bbva", cuentaDestinoId: "liv" }), "liv"),
    efectoEnCuenta(m({ tipo: "transferencia", cuentaId: "liv", cuentaDestinoId: "liv" }), "liv"),
    efectoEnCuenta(m({ tipo: "ajuste", direccion: "salida", cuentaId: "liv" }), "liv"),
    efectoEnCuenta(m({ tipo: "ingreso", cuentaId: "liv" }), "liv"),
    efectoEnCuenta(m({ tipo: "gasto", cuentaId: "bbva" }), "liv"),
    efectoEnCuenta(m({ tipo: "gasto", cuentaId: "liv", estado: "anulado" }), "liv"),
  ], [-500, 500, 0, -500, 500, 0, 0]);
});

// Escenario: Casa tiene $10,000 en BBVA; compras con Liverpool antes y después del corte; una TV a 12 MSI.
const MOVS = [
  { tipo: "apertura", fecha: "2026-10-01", montoCentavos: 1000000, cajaId: "casa", cuentaId: "bbva" },
  { tipo: "gasto", fecha: "2026-10-03", montoCentavos: 200000, cajaId: "casa", cuentaId: "liv", categoriaId: "ga-casa" },
  { tipo: "gasto", fecha: "2026-10-10", montoCentavos: 45000, cajaId: "comida", cuentaId: "liv", categoriaId: "ga-comida" },
  { tipo: "gasto", fecha: "2026-10-20", montoCentavos: 75000, cajaId: "casa", cuentaId: "liv", categoriaId: "ga-casa" },
];
const TV = { id: "tv", ...deudaDeMsi({ descripcion: "TV", montoCentavos: 1200000, meses: 12, fechaCompra: "2026-09-20", cajaId: "casa" },
  LIVERPOOL, { cuentaPagoId: "bbva", categoriaId: "ga-electrodomesticos" }) };

test("tarjetas: pago para no generar intereses = deuda al corte + mensualidad; lo de después del corte va al siguiente", () => {
  const ag = agregadosDe(MOVS);
  const movsTarjeta = conId(MOVS).filter((m) => m.cuentaIds.includes("liv"));
  const e = estadoTarjeta({ cuenta: LIVERPOOL, agregados: ag, deudas: [TV], movimientos: movsTarjeta, hoy: "2026-10-25" });
  assert.eq([e.corte, e.fechaLimite, e.proximoCorte, e.dias], ["2026-10-15", "2026-11-05", "2026-11-15", 11]);
  assert.eq([e.deudaRegular, e.deudaAlCorte, e.comprasDespues, e.pendienteCorte, e.paraElSiguiente], [320000, 245000, 75000, 245000, 75000]);
  assert.eq([e.cuotas.length, e.cuotas[0].periodo, e.pendienteMsi, e.paraNoGenerarIntereses, e.todo], [1, "2026-11-05", 100000, 345000, 420000]);
  assert.eq([e.msiPendiente, e.deudaTotal, e.disponible, e.estado], [1200000, 1520000, 1480000, "por-pagar"]);
  assert.eq(e.porCaja, [{ cajaId: "casa", deuda: 275000 }, { cajaId: "comida", deuda: 45000 }]);
  assert.eq([e.msi[0].numero, e.msi[0].resumen.proximaFecha], [1, "2026-11-05"]);
  // Sin pagar al 8 de noviembre: vencida.
  const tarde = estadoTarjeta({ cuenta: LIVERPOOL, agregados: ag, deudas: [TV], movimientos: movsTarjeta, hoy: "2026-11-08" });
  assert.eq([tarde.estado, tarde.paraNoGenerarIntereses, tarde.vencidaDesde, tarde.dias], ["vencida", 345000, "2026-11-05", -3]);
  // Ya pasó el siguiente corte (15 nov) y no pagó el de octubre: sigue vencida (antes decía «paga antes del 5 dic»).
  const otroCorte = estadoTarjeta({ cuenta: LIVERPOOL, agregados: ag, deudas: [TV], movimientos: movsTarjeta, hoy: "2026-11-16" });
  assert.eq([otroCorte.estado, otroCorte.vencidaDesde, otroCorte.fechaLimite, otroCorte.paraNoGenerarIntereses], ["vencida", "2026-11-05", "2026-12-05", 520000]);
});

test("tarjetas: pagar $3,450 → mensualidad como gasto y el resto proporcional por caja; queda al corriente", () => {
  const ag = agregadosDe(MOVS);
  const despues = (movs) => conId(movs).filter((m) => m.cuentaIds.includes("liv"));
  const e = estadoTarjeta({ cuenta: LIVERPOOL, agregados: ag, deudas: [TV], movimientos: despues(MOVS), hoy: "2026-10-25" });
  const reparto = repartirPago({ monto: e.paraNoGenerarIntereses, cuotas: e.cuotas, porCaja: e.porCaja });
  assert.eq([reparto.cuotas.map((c) => [c.periodo, c.monto]), reparto.cajas, reparto.sobrante],
    [[["2026-11-05", 100000]], [{ cajaId: "casa", monto: 210547 }, { cajaId: "comida", monto: 34453 }], 0]);
  const pago = movimientosDePago({ tarjeta: LIVERPOOL, bancoId: "bbva", fecha: "2026-10-25", reparto });
  assert.eq(pago.map((m) => [m.tipo, m.cajaId, m.cuentaId, m.cajaDestinoId || "", m.cuentaDestinoId || "", m.montoCentavos]), [
    ["gasto", "casa", "bbva", "", "", 100000],
    ["transferencia", "casa", "bbva", "casa", "liv", 210547],
    ["transferencia", "comida", "bbva", "comida", "liv", 34453],
  ]);
  // La mensualidad es de noviembre: lleva la fecha de su vencimiento (cuenta en el mes de su renglón en Mi mes).
  assert.eq([pago[0].nota, pago[0].deudaId, pago[0].deudaPeriodo, pago[0].categoriaId, pago[0].fecha, pago[1].fecha],
    ["TV (1 de 12)", "tv", "2026-11-05", "ga-electrodomesticos", "2026-11-05", "2026-10-25"]);
  assert.ok(pago.every((m) => validarMovimiento(m).ok), "los movimientos del pago son válidos");

  const todos = [...MOVS, ...pago];
  const ag2 = agregadosDe(todos);
  const e2 = estadoTarjeta({ cuenta: LIVERPOOL, agregados: ag2, deudas: [TV], movimientos: despues(todos), hoy: "2026-10-25" });
  assert.eq([e2.deudaRegular, e2.pendienteCorte, e2.pendienteMsi, e2.paraNoGenerarIntereses, e2.msiPendiente, e2.estado], [75000, 0, 0, 0, 1100000, "al-corriente"]);
  // Si además paga lo de después del corte, ya no queda nada "para el siguiente".
  const e3 = estadoTarjeta({ cuenta: LIVERPOOL, agregados: agregadosDe([{ tipo: "transferencia", fecha: "2026-10-26", montoCentavos: 75000, cajaId: "casa", cuentaId: "bbva", cajaDestinoId: "casa", cuentaDestinoId: "liv" }], agregadosDe(todos)),
    deudas: [TV], movimientos: despues([...todos, { tipo: "transferencia", fecha: "2026-10-26", montoCentavos: 75000, cajaId: "casa", cuentaId: "bbva", cajaDestinoId: "casa", cuentaDestinoId: "liv" }]), hoy: "2026-10-26" });
  assert.eq([e3.comprasDespues, e3.paraElSiguiente, e3.deudaRegular, e3.estado], [75000, 0, 0, "sin-deuda"]);
  // Pagar la tarjeta no es gasto: la caja solo baja por la mensualidad ($10,000 − $2,750 de compras − $1,000).
  const cajas = saldosPor(ag2, "porCaja");
  const cuentas = saldosPor(ag2, "porCuenta");
  assert.eq([cajas.casa, cuentas.bbva, cuentas.liv], [625000, 655000, -75000]);
});

test("tarjetas: repartir respeta lo que debe cada caja y avisa si sobra", () => {
  const r = repartirPago({ monto: 100, porCaja: [{ cajaId: "a", deuda: 1 }, { cajaId: "b", deuda: 1 }, { cajaId: "c", deuda: 1 }] });
  assert.eq([r.cajas, r.sobrante], [[{ cajaId: "a", monto: 1 }, { cajaId: "b", monto: 1 }, { cajaId: "c", monto: 1 }], 97]);
  const p = repartirPago({ monto: 100, porCaja: [{ cajaId: "a", deuda: 100 }, { cajaId: "b", deuda: 100 }, { cajaId: "c", deuda: 100 }] });
  assert.eq(p.cajas.map((c) => c.monto), [34, 33, 33]);
  // Montos grandes: exacto al centavo.
  const g = repartirPago({ monto: 99999999999, porCaja: [{ cajaId: "a", deuda: 70000000000 }, { cajaId: "b", deuda: 30000000001 }] });
  assert.eq(g.cajas.reduce((a, c) => a + c.monto, 0), 99999999999);
});

test("tarjetas: sin día de corte se muestra lo que debes; deuda inicial con fecha del último corte", () => {
  const sinDias = { id: "x", nombre: "Vieja", tipo: "credito" };
  const ag = agregadosDe([{ tipo: "gasto", fecha: "2026-10-03", montoCentavos: 5000, cajaId: "casa", cuentaId: "x", categoriaId: "ga-casa" }]);
  const e = estadoTarjeta({ cuenta: sinDias, agregados: ag, hoy: "2026-10-25" });
  assert.eq([e.configurada, e.paraNoGenerarIntereses, e.estado, e.disponible], [false, 5000, "por-pagar", null]);
  const aj = ajusteDeudaInicial({ tarjeta: LIVERPOOL, cajaId: "casa", montoCentavos: 400000, hoy: "2026-10-25" });
  assert.eq([aj.tipo, aj.direccion, aj.fecha, aj.cuentaId], ["ajuste", "salida", "2026-10-15", "liv"]);
  assert.ok(validarMovimiento(aj).ok, "ajuste válido");
  const e2 = estadoTarjeta({ cuenta: LIVERPOOL, agregados: agregadosDe([aj]), movimientos: conId([aj]), hoy: "2026-10-25" });
  assert.eq([e2.deudaAlCorte, e2.paraNoGenerarIntereses, e2.estado], [400000, 400000, "por-pagar"]);
});

test("tarjetas: validaciones de tarjeta y de compra a meses", () => {
  assert.eq(validarTarjeta({ nombre: "Liverpool", diaCorte: 15, diaLimite: 5 }, []).ok, true);
  assert.eq(Object.keys(validarTarjeta({ nombre: "BBVA", diaCorte: 0, diaLimite: 32, deudaCentavos: 1000 }, [{ id: "b", nombre: "bbva" }]).errores),
    ["nombre", "diaCorte", "diaLimite", "cajaDeudaId"]);
  const ok = { descripcion: "TV", montoCentavos: 1200000, meses: 12, pagadas: 0, fechaCompra: "2026-10-20", cajaId: "casa", tarjetaId: "liv" };
  assert.eq(validarMsi(ok).ok, true);
  assert.eq(Object.keys(validarMsi({ ...ok, meses: 1, descripcion: "" }).errores), ["descripcion", "meses"]);
  assert.eq(Object.keys(validarMsi({ ...ok, pagadas: 12 }).errores), ["pagadas"]);
  assert.eq(Object.keys(validarMsi({ ...ok, montoCentavos: 500 }).errores), ["montoCentavos"]);
});

test("tarjetas: fecha límite el mismo día del corte (Cimaco: corte 3, paga el 3) — ese día vence el anterior; al otro, vencida", () => {
  const CIMACO = { id: "cim", nombre: "Cimaco", tipo: "credito", credito: { limiteCentavos: 2500000, diaCorte: 3, diaLimite: 3 } };
  const movs = [
    { tipo: "gasto", fecha: "2026-09-20", montoCentavos: 289227, cajaId: "casa", cuentaId: "cim", categoriaId: "ga-casa" },
    { tipo: "gasto", fecha: "2026-10-20", montoCentavos: 50000, cajaId: "casa", cuentaId: "cim", categoriaId: "ga-casa" },
  ];
  const ag = agregadosDe(movs);
  const todos = conId(movs);
  const el3 = estadoTarjeta({ cuenta: CIMACO, agregados: ag, movimientos: todos, hoy: "2026-11-03" });
  assert.eq([el3.estado, el3.fechaLimite, el3.paraNoGenerarIntereses, el3.dias, el3.paraElSiguiente], ["por-pagar", "2026-11-03", 289227, 0, 50000]);
  const el4 = estadoTarjeta({ cuenta: CIMACO, agregados: ag, movimientos: todos, hoy: "2026-11-04" });
  assert.eq([el4.estado, el4.vencidaDesde, el4.dias, el4.fechaLimite, el4.paraNoGenerarIntereses], ["vencida", "2026-11-03", -1, "2026-12-03", 339227]);
  // Paga lo vencido el 5: ya no está vencida; lo de octubre se paga hasta el 3 dic.
  const pago = { tipo: "transferencia", fecha: "2026-11-05", montoCentavos: 289227, cajaId: "casa", cuentaId: "bbva", cajaDestinoId: "casa", cuentaDestinoId: "cim" };
  const el5 = estadoTarjeta({ cuenta: CIMACO, agregados: agregadosDe([pago], agregadosDe(movs)), movimientos: conId([...movs, pago]), hoy: "2026-11-05" });
  assert.eq([el5.estado, el5.vencidaDesde, el5.fechaLimite, el5.paraNoGenerarIntereses], ["por-pagar", null, "2026-12-03", 50000]);
});

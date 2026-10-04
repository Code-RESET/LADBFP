import { test, assert } from "./lib.js";
import { ocurrencias, proximas, tocaEn, equivalenteMensual, periodoDe, erroresRegla, describirRegla } from "../js/domain/periodos.js";
import { evaluarPresupuesto, validarPresupuesto, restanteDelPeriodo, esSostenible } from "../js/domain/presupuesto.js";
import {
  resumenDeuda, eventos, claveVinculo, estadoOcurrencia, validarObligacion, validarRecurrente, proximosPagos,
} from "../js/domain/compromisos.js";
import { comprometidoPorCaja, disponibleReal, proyectar, porMes } from "../js/domain/proyeccion.js";
import { generarAlertas } from "../js/domain/alertas.js";
import { construirMovimiento, deltasAgregados } from "../js/domain/movimientos.js";
import { cuentaParaGasto } from "../js/domain/catalogos.js";

const HOY = "2026-10-07"; // miércoles

function sumarProfundo(dest, delta) {
  for (const [k, v] of Object.entries(delta)) {
    if (typeof v === "number") dest[k] = (dest[k] || 0) + v;
    else sumarProfundo(dest[k] ??= {}, v);
  }
}
function registrar(ag, m) {
  for (const [mes, d] of Object.entries(deltasAgregados(null, construirMovimiento({ cuentaId: "nu", ...m })))) sumarProfundo(ag[mes] ??= {}, d);
  return ag;
}

// ---------- Frecuencias ----------
test("frecuencias: semanal, quincenal, mensual (día 31 en meses cortos), anual y cada N días", () => {
  assert.eq(ocurrencias({ frecuencia: "semanal", diaSemana: 5, desde: "2026-10-01" }, "2026-10-01", "2026-10-31"),
    ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"]);
  assert.eq(ocurrencias({ frecuencia: "quincenal", desde: "2026-01-01" }, "2026-02-01", "2026-02-28"), ["2026-02-15", "2026-02-28"]);
  assert.eq(ocurrencias({ frecuencia: "mensual", diaMes: 31, desde: "2026-01-01" }, "2026-02-01", "2026-04-30"),
    ["2026-02-28", "2026-03-31", "2026-04-30"]);
  assert.ok(tocaEn({ frecuencia: "anual", mes: 12, diaMes: 24, desde: "2020-01-01" }, "2026-12-24"));
  assert.eq(proximas({ frecuencia: "personalizada", cadaNDias: 10, desde: "2026-10-01" }, "2026-10-05", 2), ["2026-10-11", "2026-10-21"]);
  assert.eq(ocurrencias({ frecuencia: "mensual", diaMes: 5, desde: "2026-10-01", hasta: "2026-11-30" }, "2026-10-01", "2027-01-31"),
    ["2026-10-05", "2026-11-05"]);
});

test("frecuencias: equivalente mensual ($3,500/semana = $15,166.67/mes)", () => {
  assert.eq(equivalenteMensual(350000, { frecuencia: "semanal" }), 1516667);
  assert.eq(equivalenteMensual(757750, { frecuencia: "quincenal" }), 1515500);
  assert.eq(describirRegla({ frecuencia: "semanal", diaSemana: 1 }), "Cada lunes");
  assert.ok(erroresRegla({ frecuencia: "mensual", diaMes: 40, desde: HOY }).diaMes);
  assert.eq(erroresRegla({ frecuencia: "quincenal", desde: HOY }), {});
});

test("periodos de presupuesto: semana de lunes a domingo, quincenas y mes", () => {
  assert.eq(periodoDe("semanal", HOY), { inicio: "2026-10-05", fin: "2026-10-11", dias: 7 });
  assert.eq(periodoDe("quincenal", "2026-02-20"), { inicio: "2026-02-16", fin: "2026-02-28", dias: 13 });
  assert.eq(periodoDe("mensual", HOY), { inicio: "2026-10-01", fin: "2026-10-31", dias: 31 });
});

// ---------- PRUEBA OBLIGATORIA: DÉFICIT ----------
const semanal = {
  id: "p1", nombre: "Sueldo personal", periodo: "semanal", cajaId: "sueldo", ingresoCentavos: 350000,
  lineas: [{ categoriaId: "casa", montoCentavos: 250000 }, { categoriaId: "salidas", montoCentavos: 83100 }, { categoriaId: "comida", montoCentavos: 69000 }],
  coberturas: [], activa: true,
};

test("DÉFICIT: $3,500 ingreso − $4,021 gastos = −$521 (deficitario)", () => {
  const ev = evaluarPresupuesto(semanal);
  assert.eq(ev.gastos, 402100);
  assert.eq(ev.resultado, -52100);
  assert.eq(ev.deficit, 52100);
  assert.eq(ev.estado, "deficitario");
  assert.no(esSostenible(semanal));
});

test("presupuesto: una cobertura explícita de $521 lo vuelve sostenible", () => {
  const cubierto = { ...semanal, coberturas: [{ desdeCajaId: "reset", montoCentavos: 52100, nota: "Transferencia semanal" }] };
  assert.eq(evaluarPresupuesto(cubierto).estado, "sostenible");
  assert.ok(esSostenible(cubierto));
  // Restante del periodo: miércoles → quedan 5 de 7 días
  assert.eq(restanteDelPeriodo(cubierto, HOY), Math.round(402100 * 5 / 7));
});

test("presupuesto: validación (sin líneas, categorías repetidas)", () => {
  assert.ok(validarPresupuesto({ ...semanal, lineas: [] }).errores.lineas);
  assert.ok(validarPresupuesto({ ...semanal, lineas: [semanal.lineas[0], semanal.lineas[0]] }).errores.lineas);
  assert.ok(validarPresupuesto(semanal).ok);
});

// ---------- PRUEBA OBLIGATORIA: DEUDA ----------
const deuda = { id: "d1", acreedor: "Dra. Marcela", saldoInicialCentavos: 3000000, pagoCentavos: 600000,
  regla: { frecuencia: "mensual", diaMes: 15, desde: "2026-10-01" }, cajaId: "reset", cuentaId: "mp", activa: true };

test("DEUDA: $30,000 con pagos de $6,000 = 5 pagos", () => {
  const r = resumenDeuda(deuda, {}, HOY);
  assert.eq(r.pagosRestantes, 5);
  assert.eq(r.saldoActual, 3000000);
  assert.eq(r.proximaFecha, "2026-10-15");
  assert.eq(r.fechaLiquidacion, "2027-02-15");
  assert.eq(r.pct, 0);
});

test("deuda: un pago vinculado baja el saldo, sube el % y recorre las fechas", () => {
  const ag = registrar({}, { tipo: "gasto", fecha: "2026-10-14", montoCentavos: 600000, cajaId: "reset", categoriaId: "deudas",
    deudaId: "d1", deudaPeriodo: "2026-10-15" });
  const r = resumenDeuda(deuda, ag, HOY);
  assert.eq(r.saldoActual, 2400000);
  assert.eq(r.pct, 20);
  assert.eq(r.pagosRestantes, 4);
  assert.eq(r.proximaFecha, "2026-11-15");
  assert.eq(r.fechaLiquidacion, "2027-02-15");
});

// ---------- Obligaciones ----------
const trabajadora = { id: "o1", nombre: "Trabajadora", montoCentavos: 800000, variable: true, minimoCentavos: 320000, maximoCentavos: 800000,
  regla: { frecuencia: "mensual", diaMes: 30, desde: "2026-09-01" }, cajaId: "reset", cuentaId: "mp", categoriaId: "negocio", activa: true };

test("obligaciones: estados pendiente / parcial / pagada / vencida", () => {
  assert.eq(estadoOcurrencia({ monto: 100, pagado: 0, fecha: "2026-10-10", hoy: HOY }), "pendiente");
  assert.eq(estadoOcurrencia({ monto: 100, pagado: 40, fecha: "2026-10-10", hoy: HOY }), "parcial");
  assert.eq(estadoOcurrencia({ monto: 100, pagado: 100, fecha: "2026-09-10", hoy: HOY }), "pagada");
  assert.eq(estadoOcurrencia({ monto: 100, pagado: 0, fecha: "2026-10-01", hoy: HOY }), "vencida");
});

test("obligaciones: validación de variable (mín ≤ monto ≤ máx) y caja obligatoria", () => {
  assert.ok(validarObligacion(trabajadora).ok);
  assert.ok(validarObligacion({ ...trabajadora, montoCentavos: 900000 }).errores.montoCentavos);
  assert.ok(validarObligacion({ ...trabajadora, cajaId: "" }).errores.cajaId);
  assert.ok(validarRecurrente({ nombre: "x", tipo: "transferencia", montoCentavos: 1, cajaId: "a", cuentaId: "c", cajaDestinoId: "a", cuentaDestinoId: "c",
    regla: { frecuencia: "quincenal", desde: HOY } }).errores.cajaDestinoId);
});

test("eventos: vencida de septiembre sin pagar + pendiente de octubre; pagada no aparece", () => {
  let ev = eventos({ obligaciones: [trabajadora], agregados: {}, hoy: HOY, hasta: "2026-10-31" });
  assert.eq(ev.map((e) => [e.fecha, e.estado]), [["2026-09-30", "vencida"], ["2026-10-30", "pendiente"]]);
  const ag = registrar({}, { tipo: "gasto", fecha: "2026-10-02", montoCentavos: 800000, cajaId: "reset", categoriaId: "negocio",
    obligacionId: "o1", obligacionPeriodo: "2026-09-30" });
  ev = eventos({ obligaciones: [trabajadora], agregados: ag, hoy: HOY, hasta: "2026-10-31" });
  assert.eq(ev.map((e) => e.fecha), ["2026-10-30"]);
  assert.eq(proximosPagos(ev, "2026-10-14").length, 0);
});

// ---------- PRUEBA OBLIGATORIA: COMPROMETIDO / DISPONIBLE ----------
test("DISPONIBLE REAL: saldo $20,000 − comprometido $8,000 = $12,000", () => {
  const ev = eventos({ obligaciones: [{ ...trabajadora, regla: { frecuencia: "mensual", diaMes: 20, desde: "2026-10-01" } }], agregados: {}, hoy: HOY, hasta: "2026-11-06" });
  const comp = comprometidoPorCaja({ eventos: ev, hoy: HOY });
  assert.eq(comp.reset, 800000);
  const cajas = [{ id: "reset", tipo: "operativa" }, { id: "code", tipo: "crecimiento", disponibleParaGasto: false }];
  const d = disponibleReal({ cajas, saldos: { reset: 2000000, code: 500000 }, comprometido: comp, cuentaParaGasto });
  assert.eq(d.porCaja.reset, 1200000);
  assert.eq(d.total, 1200000, "Code-Reset (crecimiento) no cuenta para gastar");
});

test("comprometido: transferencia programada saliente cuenta en el origen; ingresos esperados no se suman", () => {
  const recs = [
    { id: "r1", nombre: "Sueldo", tipo: "transferencia", montoCentavos: 350000, cajaId: "hd", cuentaId: "bbva", cajaDestinoId: "sueldo", cuentaDestinoId: "nu",
      regla: { frecuencia: "semanal", diaSemana: 5, desde: "2026-10-01" } },
    { id: "r2", nombre: "Cobranza", tipo: "ingreso", montoCentavos: 757750, cajaId: "hd", cuentaId: "bbva", categoriaId: "cob",
      regla: { frecuencia: "quincenal", desde: "2026-10-01" } },
  ];
  const ev = eventos({ recurrentes: recs, agregados: {}, hoy: HOY, hasta: "2026-11-06" });
  const comp = comprometidoPorCaja({ eventos: ev, hoy: HOY });
  assert.eq(comp.hd, 5 * 350000); // viernes 9, 16, 23, 30 oct y 6 nov
  assert.eq(comp.sueldo, undefined);
});

test("PROYECCIÓN: ingresos, transferencias, pagos y presupuesto; detecta el primer día negativo", () => {
  const recs = [{ id: "r2", nombre: "Cobranza", tipo: "ingreso", montoCentavos: 757750, cajaId: "hd", cuentaId: "bbva", categoriaId: "cob",
    regla: { frecuencia: "quincenal", desde: "2026-10-01" } }];
  const ev = eventos({ recurrentes: recs, deudas: [{ ...deuda, cajaId: "hd" }], agregados: {}, hoy: HOY, hasta: "2026-11-06" });
  const p = proyectar({ saldos: { hd: 100000 }, eventos: ev, hoy: HOY, dias: 30 });
  const dia = (f) => p.dias.find((d) => d.fecha === f);
  assert.eq(dia("2026-10-14").total, 100000);
  assert.eq(dia("2026-10-15").total, 100000 + 757750 - 600000);
  assert.eq(dia("2026-10-31").total, 100000 + 757750 * 2 - 600000);
  assert.eq(p.entradas, 757750 * 2);
  assert.eq(p.primerNegativo, {});
  const p2 = proyectar({ saldos: { hd: 0 }, eventos: eventos({ deudas: [{ ...deuda, cajaId: "hd" }], agregados: {}, hoy: HOY, hasta: "2026-11-06" }), hoy: HOY, dias: 30 });
  assert.eq(p2.primerNegativo.hd, "2026-10-15");
  assert.eq(porMes(p2.dias).map((m) => m.mes), ["2026-10", "2026-11"]);
});

test("proyección: el presupuesto deficitario NO se descuenta; el sostenible sí, por día", () => {
  const sinCubrir = proyectar({ saldos: { sueldo: 1000000 }, eventos: [], presupuestos: [semanal], hoy: HOY, dias: 6 });
  assert.eq(sinCubrir.dias.at(-1).total, 1000000);
  const cubierto = { ...semanal, coberturas: [{ desdeCajaId: "reset", montoCentavos: 52100 }] };
  const conGasto = proyectar({ saldos: { sueldo: 1000000 }, eventos: [], presupuestos: [cubierto], hoy: HOY, dias: 6 });
  assert.eq(conGasto.dias.at(-1).total, 1000000 - 7 * Math.round(402100 / 7));
});

test("alertas: déficit, vencidos, caja en negativo y pagos de la semana, ordenadas por gravedad", () => {
  const ev = eventos({ obligaciones: [trabajadora], agregados: {}, hoy: HOY, hasta: "2026-11-06" });
  const comp = comprometidoPorCaja({ eventos: ev, hoy: HOY });
  const cajas = [{ id: "reset", nombre: "Reset Alarmas", tipo: "operativa" }];
  const disponible = disponibleReal({ cajas, saldos: { reset: 500000 }, comprometido: comp, cuentaParaGasto });
  const a = generarAlertas({ hoy: HOY, cajas, presupuestos: [semanal], eventos: ev, disponible, proyeccion: { primerNegativo: {} }, agregados: {} });
  assert.eq(a[0].nivel, "rojo");
  assert.ok(a.some((x) => x.tipo === "deficit" && x.titulo.includes("-$521.00")));
  assert.ok(a.some((x) => x.tipo === "vencida"));
  assert.ok(a.some((x) => x.tipo === "caja-deficit" && x.titulo.includes("Reset Alarmas")));
});

test("vínculos: el agregado registra lo pagado por ocurrencia", () => {
  const ag = registrar({}, { tipo: "gasto", fecha: "2026-10-02", montoCentavos: 300000, cajaId: "reset", categoriaId: "negocio",
    obligacionId: "o1", obligacionPeriodo: "2026-09-30" });
  assert.eq(ag["2026-10"].porVinculo[claveVinculo("obligacion", "o1", "2026-09-30")], 300000);
  const t = construirMovimiento({ tipo: "transferencia", fecha: HOY, montoCentavos: 1, cajaId: "a", cuentaId: "x", cajaDestinoId: "b", cuentaDestinoId: "y",
    obligacionId: "o1", recurrenteId: "r1", recurrentePeriodo: HOY });
  assert.no("obligacionId" in t, "una transferencia no paga obligaciones");
  assert.eq(t.recurrenteId, "r1");
});

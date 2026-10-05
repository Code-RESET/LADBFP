import { test, assert } from "./lib.js";
import { gastosFijosDelMes, balanceDelMes, ingresosPorCobrar, estadoGasto } from "../js/domain/mes.js";
import { construirMovimiento, deltasAgregados } from "../js/domain/movimientos.js";

const HOY = "2026-09-20";
function sumarProfundo(dest, delta) {
  for (const [k, v] of Object.entries(delta)) {
    if (typeof v === "number") dest[k] = (dest[k] || 0) + v;
    else sumarProfundo(dest[k] ??= {}, v);
  }
}
const registrar = (ag, m) => {
  for (const [mes, d] of Object.entries(deltasAgregados(null, construirMovimiento({ cuentaId: "c", cajaId: "a", ...m })))) sumarProfundo(ag[mes] ??= {}, d);
  return ag;
};
const fijo = (id, nombre, monto, dia) => ({ id, nombre, montoCentavos: monto, categoriaId: "ga-vivienda", formaPago: "Domiciliado",
  regla: { frecuencia: "mensual", diaMes: dia, desde: "2026-01-01" }, cajaId: "a", cuentaId: "c", activa: true });

// Plantilla: Hipoteca (día 3, pagado), Internet (día 8, pagado), Infonavit (día 15, vencido), Fovissste (día 30, pendiente)
const obligaciones = [fijo("h", "Hipoteca casa", 1000000, 3), fijo("i", "Internet casa", 60000, 8), fijo("inf", "Infonavit", 400000, 15), fijo("f", "Crédito Fovissste", 200000, 30)];

function agregadosEjemplo() {
  const ag = {};
  registrar(ag, { tipo: "gasto", fecha: "2026-09-03", montoCentavos: 1000000, categoriaId: "ga-vivienda", obligacionId: "h", obligacionPeriodo: "2026-09-03" });
  registrar(ag, { tipo: "gasto", fecha: "2026-09-08", montoCentavos: 60000, categoriaId: "ga-vivienda", obligacionId: "i", obligacionPeriodo: "2026-09-08" });
  registrar(ag, { tipo: "gasto", fecha: "2026-09-12", montoCentavos: 35000, categoriaId: "ga-comida" }); // gasto de una vez
  registrar(ag, { tipo: "ingreso", fecha: "2026-09-15", montoCentavos: 1500000, categoriaId: "in-honorarios" });
  registrar(ag, { tipo: "ingreso", fecha: "2026-09-09", montoCentavos: 300000, categoriaId: "in-sueldo" });
  return ag;
}

test("plantilla · Gastos del Mes: ordenados por vencimiento con estado Pagado / Vencido / Pendiente", () => {
  const g = gastosFijosDelMes({ mes: "2026-09", obligaciones, agregados: agregadosEjemplo(), hoy: HOY });
  assert.eq(g.map((x) => [x.dia, x.nombre, x.estado]), [
    [3, "Hipoteca casa", "Pagado"], [8, "Internet casa", "Pagado"], [15, "Infonavit", "Vencido"], [30, "Crédito Fovissste", "Pendiente"]]);
  assert.eq(g[0].formaPago, "Domiciliado");
});

test("plantilla · Balance: ingresos − TODOS los gastos (pagados y pendientes)", () => {
  const b = balanceDelMes({ mes: "2026-09", obligaciones, agregados: agregadosEjemplo(), categorias: [], hoy: HOY });
  assert.eq(b.ingresos, 1800000);
  assert.eq(b.pagado, 1095000);          // hipoteca + internet + gasto de una vez
  assert.eq(b.pendiente, 600000);        // infonavit (vencido) + fovissste
  assert.eq(b.vencido, 400000);
  assert.eq(b.totalGastos, 1695000);
  assert.eq(b.balance, 105000);
  assert.eq(b.cuentasPagadas, 2);
});

test("plantilla · un pago parcial deja el resto pendiente", () => {
  const ag = registrar({}, { tipo: "gasto", fecha: "2026-09-16", montoCentavos: 150000, categoriaId: "ga-vivienda", obligacionId: "inf", obligacionPeriodo: "2026-09-15" });
  const g = gastosFijosDelMes({ mes: "2026-09", obligaciones, agregados: ag, hoy: HOY }).find((x) => x.nombre === "Infonavit");
  assert.eq(g.pendiente, 250000);
  assert.eq(g.estado, "Vencido");
  assert.eq(estadoGasto({ monto: 100, pagado: 100, fecha: "2026-09-01", hoy: HOY }), "Pagado");
});

test("plantilla · cuotas de deuda aparecen como gasto del mes y desaparecen al liquidarse", () => {
  const deuda = { id: "tc", acreedor: "Tarjeta Santander", saldoInicialCentavos: 300000, pagoCentavos: 190000,
    regla: { frecuencia: "mensual", diaMes: 30, desde: "2026-09-01" }, cajaId: "a", cuentaId: "c", activa: true };
  let g = gastosFijosDelMes({ mes: "2026-09", deudas: [deuda], agregados: {}, hoy: HOY });
  assert.eq(g.map((x) => [x.nombre, x.monto, x.estado]), [["Tarjeta Santander", 190000, "Pendiente"]]);
  const ag = registrar({}, { tipo: "gasto", fecha: "2026-09-29", montoCentavos: 190000, categoriaId: "ga-deudas", deudaId: "tc", deudaPeriodo: "2026-09-30" });
  g = gastosFijosDelMes({ mes: "2026-10", deudas: [deuda], agregados: ag, hoy: HOY });
  assert.eq(g[0].monto, 110000, "la última cuota es solo lo que falta");
  const ag2 = registrar(ag, { tipo: "gasto", fecha: "2026-10-30", montoCentavos: 110000, categoriaId: "ga-deudas", deudaId: "tc", deudaPeriodo: "2026-10-30" });
  assert.eq(gastosFijosDelMes({ mes: "2026-11", deudas: [deuda], agregados: ag2, hoy: HOY }).length, 0);
});

test("plantilla · ingresos por cobrar (fijos esperados que aún no llegan)", () => {
  const r = [{ id: "n", nombre: "Nómina ISSSTE", tipo: "ingreso", montoCentavos: 500000, regla: { frecuencia: "quincenal", desde: "2026-01-01" }, cajaId: "a", cuentaId: "c", activa: true }];
  const ag = registrar({}, { tipo: "ingreso", fecha: "2026-09-15", montoCentavos: 500000, categoriaId: "in-sueldo", recurrenteId: "n", recurrentePeriodo: "2026-09-15" });
  assert.eq(ingresosPorCobrar({ mes: "2026-09", recurrentes: r, agregados: ag }).map((i) => i.fecha), ["2026-09-30"]);
});

// ---------- v1.3: Mi mes (hoja con casillas, registro nombre + monto) ----------
import { ingresosFijosDelMes, categoriaSugerida, fechaParaMes } from "../js/domain/mes.js";

test("mes: ingresos fijos del mes incluyen recibidos y pendientes", () => {
  const r = [{ id: "n", nombre: "Nómina IMSS", tipo: "ingreso", montoCentavos: 300000, categoriaId: "in-sueldo", cajaId: "a", cuentaId: "c",
    regla: { frecuencia: "mensual", diaMes: 9, desde: "2026-01-01" }, activa: true }];
  let lista = ingresosFijosDelMes({ mes: "2026-09", recurrentes: r, agregados: {} });
  assert.eq(lista.map((i) => [i.dia, i.estado, i.pendiente]), [[9, "Pendiente", 300000]]);
  const ag = registrar({}, { tipo: "ingreso", fecha: "2026-09-09", montoCentavos: 300000, categoriaId: "in-sueldo", recurrenteId: "n", recurrentePeriodo: "2026-09-09" });
  lista = ingresosFijosDelMes({ mes: "2026-09", recurrentes: r, agregados: ag });
  assert.eq(lista.map((i) => [i.estado, i.pendiente, i.pagado]), [["Recibido", 0, 300000]]);
  assert.eq(ingresosPorCobrar({ mes: "2026-09", recurrentes: r, agregados: ag }).length, 0);
});

test("mes: la categoría se elige sola por el nombre", () => {
  const cats = [
    ...["combustible", "vivienda", "servicios", "educacion", "deudas", "comida", "otros"].map((x) => ({ id: `ga-${x}`, tipo: "gasto", nombre: x })),
    { id: "ga-veterinario", tipo: "gasto", nombre: "Veterinario" },
    { id: "ga-casa", tipo: "gasto", nombre: "Casa", activa: false },
    ...["sueldo", "honorarios", "otros"].map((x) => ({ id: `in-${x}`, tipo: "ingreso", nombre: x })),
  ];
  assert.eq(categoriaSugerida("Gasolina", "gasto", cats), "ga-combustible");
  assert.eq(categoriaSugerida("Hipoteca casa", "gasto", cats), "ga-vivienda");
  assert.eq(categoriaSugerida("Internet casa", "gasto", cats), "ga-servicios");
  assert.eq(categoriaSugerida("Gas natural", "gasto", cats), "ga-servicios");
  assert.eq(categoriaSugerida("COLEGIATURA", "gasto", cats), "ga-educacion");
  assert.eq(categoriaSugerida("Tarjeta BBVA", "gasto", cats), "ga-deudas");
  assert.eq(categoriaSugerida("Veterinario Firulais", "gasto", cats), "ga-veterinario");
  assert.eq(categoriaSugerida("Aguacates", "gasto", cats), "ga-otros"); // "agua" solo como palabra completa
  assert.eq(categoriaSugerida("Muebles", "gasto", cats), "ga-otros"); // Casa está desactivada
  assert.eq(categoriaSugerida("Nómina IMSS", "ingreso", cats), "in-sueldo");
  assert.eq(categoriaSugerida("Honorarios Dra.", "ingreso", cats), "in-honorarios");
  assert.eq(categoriaSugerida("Algo raro", "ingreso", cats), "in-otros");
  assert.eq(categoriaSugerida("x", "gasto", []), "");
});

test("mes: fecha de un registro según el mes que se ve", () => {
  assert.eq(fechaParaMes("2026-09", "2026-09-20"), "2026-09-20");
  assert.eq(fechaParaMes("2026-08", "2026-09-20"), "2026-08-01");
});

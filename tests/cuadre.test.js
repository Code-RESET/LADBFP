import { test, assert } from "./lib.js";
import { enApp, cajaSugerida, cuadreDe, patrimonioReal } from "../js/domain/cuadre.js";
import { deudaDeMsi } from "../js/domain/tarjetas.js";
import { construirMovimiento, deltasAgregados, validarMovimiento } from "../js/domain/movimientos.js";
import { saldosPor } from "../js/domain/saldos.js";

function sumar(dest, delta) { for (const [k, v] of Object.entries(delta)) { if (typeof v === "number") dest[k] = (dest[k] || 0) + v; else sumar(dest[k] ??= {}, v); } }
function agregadosDe(movs, ag = {}) {
  for (const m of movs) for (const [mes, d] of Object.entries(deltasAgregados(null, construirMovimiento(m)))) sumar(ag[mes] ??= {}, d);
  return ag;
}

const HOY = "2026-10-27";
const CAJAS = [
  { id: "hd", nombre: "HD Crédit", tipo: "operativa", cuentaPredeterminadaId: "bbva" },
  { id: "sp", nombre: "Sueldo personal", tipo: "operativa", cuentaPredeterminadaId: "nu" },
  { id: "vieja", nombre: "Vieja", tipo: "operativa", activa: false },
];
const BBVA = { id: "bbva", nombre: "BBVA HD", tipo: "debito" };
const NU = { id: "nu", nombre: "Nu", tipo: "debito" };
const BANCOPPEL = { id: "bc", nombre: "BanCoppel", tipo: "debito" };
const LIV = { id: "liv", nombre: "Liverpool", tipo: "credito", credito: { diaCorte: 15, diaLimite: 5 } };
const MOVS = [
  { tipo: "apertura", fecha: "2026-10-01", montoCentavos: 5000000, cajaId: "hd", cuentaId: "bbva" },
  { tipo: "apertura", fecha: "2026-10-01", montoCentavos: 600000, cajaId: "sp", cuentaId: "nu" },
  { tipo: "apertura", fecha: "2026-10-01", montoCentavos: 400000, cajaId: "hd", cuentaId: "nu" },
  { tipo: "gasto", fecha: "2026-10-03", montoCentavos: 300000, cajaId: "sp", cuentaId: "liv", categoriaId: "ga-casa" },
];
const TV = { id: "tv", ...deudaDeMsi({ descripcion: "TV", montoCentavos: 1200000, meses: 12, fechaCompra: "2026-09-20", cajaId: "sp" },
  LIV, { cuentaPagoId: "nu", categoriaId: "ga-electrodomesticos" }) };

test("cuadre: lo que dice la app (banco = saldo; tarjeta = lo que debes, con compras a meses)", () => {
  const ag = agregadosDe(MOVS);
  assert.eq([enApp({ cuenta: BBVA, agregados: ag, hoy: HOY }), enApp({ cuenta: NU, agregados: ag, hoy: HOY }), enApp({ cuenta: BANCOPPEL, agregados: ag, hoy: HOY })],
    [5000000, 1000000, 0]);
  assert.eq([enApp({ cuenta: LIV, agregados: ag, hoy: HOY }), enApp({ cuenta: LIV, agregados: ag, deudas: [TV], hoy: HOY })], [300000, 1500000]);
});

test("cuadre: la diferencia va a la caja con más dinero en ese banco (o la que más debe en la tarjeta)", () => {
  const ag = agregadosDe(MOVS);
  assert.eq(cajaSugerida({ cuenta: NU, agregados: ag, cajas: CAJAS }), "sp");             // Sueldo personal $6,000 > HD $4,000
  assert.eq(cajaSugerida({ cuenta: BBVA, agregados: ag, cajas: CAJAS }), "hd");
  assert.eq(cajaSugerida({ cuenta: LIV, agregados: ag, cajas: CAJAS }), "sp");             // la que debe en la tarjeta
  assert.eq(cajaSugerida({ cuenta: { ...BANCOPPEL, cajaPredeterminadaId: "hd" }, agregados: ag, cajas: CAJAS }), "hd");
  assert.eq(cajaSugerida({ cuenta: BANCOPPEL, agregados: ag, cajas: [...CAJAS, { id: "ahorro", nombre: "Ahorro", tipo: "ahorro", cuentaPredeterminadaId: "bc" }] }), "ahorro");
  assert.eq(cajaSugerida({ cuenta: BANCOPPEL, agregados: ag, cajas: CAJAS }), "hd");       // sin pistas: la primera operativa
});

test("cuadre: faltan → entrada; sobran → salida; cuadra → nada; banco nuevo → saldo inicial", () => {
  const ag = agregadosDe(MOVS);
  const faltan = cuadreDe({ cuenta: BBVA, real: 5300000, cajaId: "hd", agregados: ag, hoy: HOY });
  assert.eq([faltan.diferencia, faltan.efectoCaja, faltan.movimiento.tipo, faltan.movimiento.direccion, faltan.movimiento.montoCentavos],
    [300000, 300000, "ajuste", "entrada", 300000]);
  assert.eq(faltan.movimiento.nota, "Cuadre con BBVA HD del 27 oct 2026");
  const sobran = cuadreDe({ cuenta: NU, real: 800001, cajaId: "sp", agregados: ag, hoy: HOY });
  assert.eq([sobran.diferencia, sobran.movimiento.direccion, sobran.movimiento.montoCentavos], [-199999, "salida", 199999]);
  assert.eq(cuadreDe({ cuenta: BBVA, real: 5000000, cajaId: "hd", agregados: ag, hoy: HOY }).movimiento, null);
  const nuevo = cuadreDe({ cuenta: BANCOPPEL, real: 6427600, cajaId: "hd", agregados: ag, hoy: HOY });
  assert.eq([nuevo.movimiento.tipo, nuevo.movimiento.montoCentavos, nuevo.movimiento.nota], ["apertura", 6427600, "Saldo inicial (cuadre con BanCoppel)"]);
});

test("cuadre: tarjeta — debes más → salida de la caja; debes menos → entrada; respeta las compras a meses", () => {
  const ag = agregadosDe(MOVS);
  const mas = cuadreDe({ cuenta: LIV, real: 3700000, cajaId: "sp", agregados: ag, deudas: [TV], hoy: HOY });
  assert.eq([mas.enApp, mas.diferencia, mas.efectoCaja, mas.movimiento.direccion, mas.movimiento.montoCentavos], [1500000, 2200000, -2200000, "salida", 2200000]);
  const menos = cuadreDe({ cuenta: LIV, real: 1400000, cajaId: "sp", agregados: ag, deudas: [TV], hoy: HOY });
  assert.eq([menos.diferencia, menos.movimiento.direccion, menos.movimiento.montoCentavos], [-100000, "entrada", 100000]);
});

test("cuadre: después de guardar los movimientos, la app dice exactamente lo que tus bancos", () => {
  const ag = agregadosDe(MOVS);
  const reales = [[BBVA, 5300000, "hd"], [NU, 800001, "sp"], [BANCOPPEL, 6427600, "hd"], [LIV, 3700000, "sp"]];
  const movs = reales.map(([cuenta, real, cajaId]) => cuadreDe({ cuenta, real, cajaId, agregados: ag, deudas: [TV], hoy: HOY }).movimiento);
  assert.ok(movs.every((m) => validarMovimiento(m).ok), "los movimientos del cuadre son válidos");
  const despues = agregadosDe(movs, agregadosDe(MOVS));
  assert.eq(reales.map(([cuenta]) => enApp({ cuenta, agregados: despues, deudas: [TV], hoy: HOY })), [5300000, 800001, 6427600, 3700000]);
  // Las cajas absorben la diferencia y los ajustes no cuentan como ingreso ni gasto.
  const cajas = saldosPor(despues, "porCaja");
  assert.eq([cajas.hd, cajas.sp], [5000000 + 400000 + 300000 + 6427600, 600000 - 300000 - 199999 - 2200000]);
  assert.eq([despues["2026-10"].porCaja.hd.ing || 0, despues["2026-10"].porCaja.sp.gas], [0, 300000]);
});

test("cuadre: lo que tienes, lo que debes y lo que te queda", () => {
  const ag = agregadosDe(MOVS);
  const p = patrimonioReal({ cuentas: [BBVA, NU, BANCOPPEL, LIV], agregados: ag, deudas: [TV], hoy: HOY });
  assert.eq([p.tienes, p.debes, p.neto], [6000000, 1500000, 4500000]);
});

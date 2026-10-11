import { test, assert } from "./lib.js";
import { validarMeta, resumenMeta, viabilidadMeta, aportacionesDelMes, eventosMetas, mesConAporte } from "../js/domain/metas.js";
import { construirMovimiento, deltasAgregados } from "../js/domain/movimientos.js";

function sumar(dest, delta) { for (const [k, v] of Object.entries(delta)) { if (typeof v === "number") dest[k] = (dest[k] || 0) + v; else sumar(dest[k] ??= {}, v); } }
function agregadosDe(movs) {
  const ag = {};
  for (const m of movs) for (const [mes, d] of Object.entries(deltasAgregados(null, construirMovimiento({ cuentaId: "c", cuentaDestinoId: "c2", ...m })))) sumar(ag[mes] ??= {}, d);
  return ag;
}
const remodelacion = (extra = {}) => ({ id: "r", nombre: "Remodelación", objetivoCentavos: 30000000, aportacionCentavos: 2000000,
  regla: { frecuencia: "mensual", diaMes: 1, desde: "2026-11-01" }, cajaOrigenId: "hd", cajaAhorroId: "ahorro", activa: true, ...extra });

test("metas: $300,000 a $20,000/mes → 15 aportaciones; iniciando nov-2026 termina en enero 2028 (E8)", () => {
  const r = resumenMeta({ meta: remodelacion(), agregados: {}, hoy: "2026-10-11" });
  assert.eq([r.acumulado, r.faltante, r.pct, r.restantes, r.proxima, r.fechaEstimada], [0, 30000000, 0, 15, "2026-11-01", "2028-01-01"]);
});

test("metas: el acumulado es el saldo de su caja de ahorro; las aportaciones hechas se saltan", () => {
  const ag = agregadosDe([
    { tipo: "apertura", fecha: "2026-10-01", montoCentavos: 6000000, cajaId: "ahorro" },                       // ya tenía $60,000
    { tipo: "transferencia", fecha: "2026-11-01", montoCentavos: 2000000, cajaId: "hd", cajaDestinoId: "ahorro", metaId: "r", metaPeriodo: "2026-11-01" },
  ]);
  const r = resumenMeta({ meta: remodelacion(), agregados: ag, hoy: "2026-11-02" });
  assert.eq([r.acumulado, r.faltante, r.pct, r.restantes, r.proxima, r.fechaEstimada], [8000000, 22000000, 26, 11, "2026-12-01", "2027-10-01"]);
  const cumplida = resumenMeta({ meta: remodelacion({ objetivoCentavos: 8000000 }), agregados: ag, hoy: "2026-11-02" });
  assert.eq([cumplida.cumplida, cumplida.restantes, cumplida.pct, cumplida.fechaEstimada], [true, 0, 100, null]);
});

test("metas: validación (cajas distintas, una meta por caja, aportación ≤ meta)", () => {
  assert.ok(validarMeta(remodelacion()).ok);
  assert.eq(Object.keys(validarMeta(remodelacion({ cajaAhorroId: "hd" })).errores), ["cajaAhorroId"]);
  assert.eq(Object.keys(validarMeta(remodelacion({ aportacionCentavos: 40000000 })).errores), ["aportacionCentavos"]);
  const otra = { id: "x", nombre: "Viaje", cajaAhorroId: "ahorro", activa: true };
  assert.eq(validarMeta(remodelacion(), [otra]).errores.cajaAhorroId, "Esa caja ya guarda la meta «Viaje».");
  assert.ok(validarMeta(remodelacion(), [{ ...otra, activa: false }]).ok);
  assert.eq(Object.keys(validarMeta({ ...remodelacion(), nombre: "", regla: { frecuencia: "mensual", diaMes: 40, desde: "2026-11-01" } }).errores).sort(), ["diaMes", "nombre"]);
});

test("metas: viabilidad con lo que le sobra a la caja de origen (sin contar lo ya aportado)", () => {
  const meses = ["2026-07", "2026-08", "2026-09"];
  // HD Crédit: entran $30,000 y salen $18,000 al mes → le sobran $12,000
  const movs = meses.flatMap((m) => [
    { tipo: "ingreso", fecha: `${m}-05`, montoCentavos: 3000000, cajaId: "hd", categoriaId: "in-x" },
    { tipo: "gasto", fecha: `${m}-10`, montoCentavos: 1800000, cajaId: "hd", categoriaId: "ga-x" },
  ]);
  // en septiembre ya aportó $10,000 a la meta: no debe "comerse" el sobrante
  movs.push({ tipo: "transferencia", fecha: "2026-09-01", montoCentavos: 1000000, cajaId: "hd", cajaDestinoId: "ahorro", metaId: "r", metaPeriodo: "2026-09-01" });
  const ag = agregadosDe(movs);
  const v = viabilidadMeta({ meta: remodelacion(), metas: [remodelacion()], agregados: ag, hoy: "2026-10-11" });
  assert.eq([v.estado, v.flujoLibre, v.aportacionMensual, v.meses], ["inviable", 1200000, 2000000, 3]);
  assert.eq(viabilidadMeta({ meta: remodelacion({ aportacionCentavos: 1000000 }), metas: [], agregados: ag, hoy: "2026-10-11" }).estado, "viable");
  // otra meta de $5,000/mes desde la misma caja deja $7,000 libres
  const otra = { id: "v", nombre: "Viaje", aportacionCentavos: 500000, regla: { frecuencia: "mensual", diaMes: 15, desde: "2026-01-01" }, cajaOrigenId: "hd", cajaAhorroId: "viaje", activa: true };
  const v2 = viabilidadMeta({ meta: remodelacion({ aportacionCentavos: 1000000 }), metas: [otra], agregados: ag, hoy: "2026-10-11" });
  assert.eq([v2.estado, v2.flujoLibre], ["inviable", 700000]);
  assert.eq(viabilidadMeta({ meta: remodelacion(), metas: [], agregados: {}, hoy: "2026-10-11" }).estado, "sin-datos");
  assert.eq(mesConAporte(22000000, 1200000, "2026-10-11"), "2028-04"); // 19 aportaciones empezando este mes (oct-2026)
});

test("metas: aportaciones del mes (para Mi mes) y eventos para la proyección", () => {
  const semanal = remodelacion({ aportacionCentavos: 50000, regla: { frecuencia: "semanal", diaSemana: 5, desde: "2026-10-01" } });
  const ag = agregadosDe([{ tipo: "transferencia", fecha: "2026-10-02", montoCentavos: 50000, cajaId: "hd", cajaDestinoId: "ahorro", metaId: "r", metaPeriodo: "2026-10-02" }]);
  const filas = aportacionesDelMes({ mes: "2026-10", metas: [semanal], agregados: ag, hoy: "2026-10-11" });
  assert.eq(filas.map((f) => [f.dia, f.estado]), [[2, "Aportado"], [9, "Pendiente"], [16, "Pendiente"], [23, "Pendiente"], [30, "Pendiente"]]);
  const ev = eventosMetas({ metas: [remodelacion()], agregados: {}, hoy: "2026-10-11", hasta: "2027-01-31" });
  assert.eq(ev.map((e) => [e.fecha, e.cajaId, e.cajaDestinoId, e.monto]), [["2026-11-01", "hd", "ahorro", 2000000], ["2026-12-01", "hd", "ahorro", 2000000], ["2027-01-01", "hd", "ahorro", 2000000]]);
  assert.eq(eventosMetas({ metas: [remodelacion({ activa: false })], agregados: {}, hoy: "2026-10-11", hasta: "2027-01-31" }), []);
});

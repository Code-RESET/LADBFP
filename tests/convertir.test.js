import { test, assert } from "./lib.js";
import { planConversion, cuentaDeCajaVieja } from "../js/domain/convertir.js";
import { construirMovimiento, deltasAgregados, validarMovimiento, enCuentas } from "../js/domain/movimientos.js";
import { saldosPor, desgloseCuenta, patrimonio, agregadosEnCuentas } from "../js/domain/saldos.js";
import { diagnosticar } from "../js/domain/diagnostico.js";
import { generarAlertas } from "../js/domain/alertas.js";
import { estadoTarjeta, repartirPago, movimientosDePago } from "../js/domain/tarjetas.js";

function sumar(dest, delta) { for (const [k, v] of Object.entries(delta)) { if (typeof v === "number") dest[k] = (dest[k] || 0) + v; else sumar(dest[k] ??= {}, v); } }
function agregadosDe(movs, ag = {}) {
  for (const m of movs) for (const [mes, d] of Object.entries(deltasAgregados(null, construirMovimiento(m)))) sumar(ag[mes] ??= {}, d);
  return ag;
}

const HOY = "2026-11-02";
// Los datos de Angel (ya juntadas las cajas repetidas, salvo «Alarmas RST» que sigue con la tarjeta).
const CAJAS = [
  { id: "rest", nombre: "Alarmas REST", tipo: "operativa", color: "#34C759", cuentaPredeterminadaId: "mp" },
  { id: "rst", nombre: "Alarmas RST", tipo: "operativa", cuentaPredeterminadaId: "bbva", activa: false },
  { id: "hd", nombre: "HD Crédit", tipo: "operativa", cuentaPredeterminadaId: "bancoppel" },
  { id: "inv", nombre: "HSBC-INVERCIONES", tipo: "ahorro", color: "#0EA5E9", cuentaPredeterminadaId: "hsbc" },
  { id: "efe", nombre: "EFECTIVO-", tipo: "operativa", cuentaPredeterminadaId: "efectivo" },
];
const CUENTAS = [
  { id: "mp", nombre: "Mercado Pago", tipo: "monedero" }, { id: "bancoppel", nombre: "Bancoppel", tipo: "debito" },
  { id: "hsbc", nombre: "HSBC", tipo: "debito" }, { id: "efectivo", nombre: "Efectivo", tipo: "efectivo" },
  { id: "azul", nombre: "BBVA Azul", tipo: "credito", credito: { diaCorte: 3, diaLimite: 23 }, cajaPredeterminadaId: "rst" },
];
const MOVS = [
  { tipo: "apertura", fecha: "2026-10-01", montoCentavos: 977946, cajaId: "rest", cuentaId: "mp" },
  { tipo: "gasto", fecha: "2026-10-20", montoCentavos: 1083371, cajaId: "rst", cuentaId: "azul", categoriaId: "ga-casa" },
  { tipo: "transferencia", fecha: "2026-10-30", montoCentavos: 819062, cajaId: "rst", cuentaId: "mp", cajaDestinoId: "rst", cuentaDestinoId: "azul" },
  { tipo: "apertura", fecha: "2026-10-01", montoCentavos: 5000000, cajaId: "hd", cuentaId: "bancoppel" },
  { tipo: "apertura", fecha: "2026-10-01", montoCentavos: 8000000, cajaId: "inv", cuentaId: "hsbc" },
  { tipo: "apertura", fecha: "2026-10-01", montoCentavos: 150000, cajaId: "efe", cuentaId: "efectivo" },
];
const PLAN = {
  obligaciones: [{ id: "marcela", nombre: "Dra. Marcela", cajaId: "rst", cuentaId: "mp" }, { id: "netflix", nombre: "Netflix", cajaId: "efe", cuentaId: "azul" },
    { id: "ok", nombre: "Ya bien", cajaId: "mp", cuentaId: "mp" }],
  deudas: [{ id: "tv", acreedor: "TV", cajaId: "efe", cuentaId: "efectivo", tarjetaId: "azul" }],
  recurrentes: [{ id: "sueldo", nombre: "Sueldo", tipo: "transferencia", cajaId: "hd", cuentaId: "bancoppel", cajaDestinoId: "efe", cuentaDestinoId: "efectivo" },
    { id: "apartar", nombre: "Apartar", tipo: "transferencia", cajaId: "rest", cuentaId: "mp", cajaDestinoId: "inv", cuentaDestinoId: "mp" }],
  metas: [{ id: "viaje", nombre: "Viaje", cajaOrigenId: "efe", cajaAhorroId: "inv" }],
  presupuestos: [{ id: "semana", nombre: "Semana", cajaId: "efe", coberturas: [{ desdeCajaId: "hd", montoCentavos: 1000 }] }],
};

test("convertir a cuentas: una caja por cuenta y cada saldo pasa a su cuenta; ningún banco ni tarjeta cambia", () => {
  const ag = agregadosDe(MOVS);
  const p = planConversion({ cajas: CAJAS, cuentas: CUENTAS, agregados: ag, ...PLAN, hoy: HOY });
  assert.eq(p.cajasNuevas.map((c) => [c.id, c.nombre, c.tipo, c.descripcion]), [
    ["mp", "Mercado Pago", "operativa", "Antes: Alarmas REST"], ["bancoppel", "Bancoppel", "operativa", "Antes: HD Crédit"],
    ["hsbc", "HSBC", "ahorro", "Antes: HSBC-INVERCIONES"], ["efectivo", "Efectivo", "operativa", "Antes: EFECTIVO-"],
    ["azul", "BBVA Azul", "operativa", "Antes: Alarmas RST"]]);
  assert.ok(p.movimientos.every((m) => validarMovimiento(m).ok && m.cuentaId === m.cuentaDestinoId), "transferencias dentro de la misma cuenta");
  const ag2 = agregadosDe(p.movimientos, structuredClone(ag));
  const cajas = saldosPor(ag2, "porCaja");
  const cuentas = saldosPor(ag2, "porCuenta");
  assert.eq(cuentas, saldosPor(ag, "porCuenta"));
  assert.eq(patrimonio(ag2), patrimonio(ag));
  // Cada cuenta dice lo mismo que su banco (y la tarjeta lo que debes); las cajas viejas quedan en $0.
  for (const k of CUENTAS) assert.eq([k.id, cajas[k.id] || 0], [k.id, cuentas[k.id] || 0]);
  assert.eq([cajas.mp, cajas.azul], [158884, -264309]);
  for (const c of CAJAS) assert.eq([c.id, cajas[c.id] || 0], [c.id, 0]);
  assert.eq(desgloseCuenta(ag2, "azul"), [{ cajaId: "azul", saldo: -264309 }]);
  assert.eq(p.desactivar, ["rest", "hd", "inv", "efe"]);
  assert.eq(p.cuentas.map((x) => [x.cuenta.id, x.saldo, x.ahorro]), [["mp", 158884, false], ["bancoppel", 5000000, false], ["hsbc", 8000000, true],
    ["efectivo", 150000, false], ["azul", -264309, false]]);
});

test("convertir a cuentas: gastos fijos, deudas, programados, metas y presupuestos usan su cuenta", () => {
  const ag = agregadosDe(MOVS);
  const p = planConversion({ cajas: CAJAS, cuentas: CUENTAS, agregados: ag, ...PLAN, hoy: HOY });
  const de = (col, id) => p.cambios.find((c) => c.coleccion === col && c.antes.id === id)?.despues;
  assert.eq([de("obligaciones", "marcela").cajaId, de("obligaciones", "netflix").cajaId, de("obligaciones", "ok")], ["mp", "azul", undefined]);
  assert.eq([de("deudas", "tv").cajaId, de("deudas", "tv").tarjetaId], ["efectivo", "azul"]);
  assert.eq([de("recurrentes", "sueldo").cajaId, de("recurrentes", "sueldo").cajaDestinoId], ["bancoppel", "efectivo"]);
  // «Apartar» pasaba dinero entre cajas dentro de Mercado Pago: ya no aplica y se apaga.
  assert.eq([de("recurrentes", "apartar").activa, p.conflictos.map((c) => c.item.id)], [false, ["apartar"]]);
  assert.eq([de("metas", "viaje").cajaOrigenId, de("metas", "viaje").cajaAhorroId], ["efectivo", "hsbc"]);
  assert.eq([de("presupuestos", "semana").cajaId, de("presupuestos", "semana").coberturas[0].desdeCajaId], ["efectivo", "bancoppel"]);
  assert.eq(p.cambios.filter((c) => c.coleccion === "cuentas").map((c) => [c.despues.id, c.despues.cajaPredeterminadaId]),
    [["mp", "mp"], ["bancoppel", "bancoppel"], ["hsbc", "hsbc"], ["efectivo", "efectivo"], ["azul", "azul"]]);
  assert.eq(cuentaDeCajaVieja(ag, CAJAS[0], new Set(["mp", "bancoppel"])), "mp");
});

test("convertir a cuentas: si ya se convirtió, no vuelve a hacer nada", () => {
  const ag = agregadosDe(MOVS);
  const p = planConversion({ cajas: CAJAS, cuentas: CUENTAS, agregados: ag, ...PLAN, hoy: HOY });
  const ag2 = agregadosDe(p.movimientos, structuredClone(ag));
  const cajas2 = [...CAJAS.map((c) => ({ ...c, activa: false })), ...p.cajasNuevas];
  const nuevo = (col) => PLAN[col].map((x) => p.cambios.find((c) => c.coleccion === col && c.antes.id === x.id)?.despues || x);
  const cuentas2 = CUENTAS.map((k) => ({ ...k, cajaPredeterminadaId: k.id }));
  const otra = planConversion({ cajas: cajas2, cuentas: cuentas2, agregados: ag2, obligaciones: nuevo("obligaciones"), deudas: nuevo("deudas"),
    recurrentes: nuevo("recurrentes"), metas: nuevo("metas"), presupuestos: nuevo("presupuestos"), hoy: HOY });
  assert.eq([otra.cajasNuevas.length, otra.movimientos.length, otra.cambios.length, otra.desactivar.length], [0, 0, 0, 0]);
});

test("modo cuentas: comprar con tarjeta no toca ningún banco; pagarla baja el banco y no es gasto", () => {
  const ag = agregadosDe(MOVS);
  const p = planConversion({ cajas: CAJAS, cuentas: CUENTAS, agregados: ag, ...PLAN, hoy: HOY });
  let ag2 = agregadosDe(p.movimientos, structuredClone(ag));
  const compra = enCuentas({ tipo: "gasto", fecha: HOY, montoCentavos: 59908, cajaId: "efe", cuentaId: "azul", categoriaId: "ga-casa" });
  assert.eq([compra.cajaId, compra.cuentaId], ["azul", "azul"]);
  ag2 = agregadosDe([compra], ag2);
  assert.eq([saldosPor(ag2, "porCaja").efectivo, saldosPor(ag2, "porCuenta").efectivo, saldosPor(ag2, "porCaja").azul], [150000, 150000, -324217]);
  // Pagar $3,242.17 desde Mercado Pago: una sola transferencia Mercado Pago → tarjeta.
  const azul = CUENTAS[4];
  const e = estadoTarjeta({ cuenta: azul, agregados: ag2, hoy: HOY });
  const reparto = repartirPago({ monto: 324217, cuotas: [], porCaja: e.porCaja });
  const pago = movimientosDePago({ tarjeta: azul, bancoId: "mp", fecha: HOY, reparto }).map(enCuentas);
  assert.eq(pago.map((m) => [m.tipo, m.cajaId, m.cuentaId, m.cajaDestinoId, m.cuentaDestinoId]), [["transferencia", "mp", "mp", "azul", "azul"]]);
  assert.ok(validarMovimiento(pago[0]).ok, "pago válido");
  ag2 = agregadosDe(pago, ag2);
  assert.eq([saldosPor(ag2, "porCaja").mp, saldosPor(ag2, "porCuenta").mp, saldosPor(ag2, "porCaja").azul], [158884 - 324217, 158884 - 324217, 0]);
  // Sin cuenta no se toca (p. ej. un movimiento incompleto que la validación rechazará).
  assert.eq(enCuentas({ tipo: "gasto", cajaId: "x" }), { tipo: "gasto", cajaId: "x" });
});

test("modo cuentas: los saldos se ven por cuenta aunque edites un movimiento de antes de simplificar", () => {
  const ag = agregadosDe(MOVS);
  const p = planConversion({ cajas: CAJAS, cuentas: CUENTAS, agregados: ag, ...PLAN, hoy: HOY });
  const ag2 = agregadosDe(p.movimientos, structuredClone(ag));
  // Editar la compra vieja de la tarjeta (estaba en la caja «Alarmas RST»): al guardarla queda en la tarjeta.
  const vieja = construirMovimiento(MOVS[1]);
  const editada = construirMovimiento(enCuentas({ ...MOVS[1], montoCentavos: 1000000 }));
  for (const [mes, d] of Object.entries(deltasAgregados(vieja, editada))) sumar(ag2[mes] ??= {}, d);
  const cuentas = saldosPor(ag2, "porCuenta");
  assert.eq([cuentas.azul, saldosPor(ag2, "porCaja").rst], [-180938, 1083371]); // en lo guardado queda un resto en la caja vieja…
  // …pero en modo cuentas cada cuenta es su propia caja: cada una dice lo de su banco y las cajas viejas no aparecen.
  const vista = agregadosEnCuentas(ag2);
  const cajas = saldosPor(vista, "porCaja");
  for (const k of CUENTAS) assert.eq([k.id, cajas[k.id] || 0], [k.id, cuentas[k.id] || 0]);
  assert.eq([cajas.rst, cajas.rest, cajas.azul], [undefined, undefined, -180938]);
  assert.eq(desgloseCuenta(vista, "azul"), [{ cajaId: "azul", saldo: -180938 }]);
  assert.eq(patrimonio(vista), patrimonio(ag2));
  assert.eq(agregadosEnCuentas({}), {});
});

test("modo cuentas: «Revisar mis datos» revisa cuentas, no cajas", () => {
  const ag = agregadosDe(MOVS);
  const p = planConversion({ cajas: CAJAS, cuentas: CUENTAS, agregados: ag, ...PLAN, hoy: HOY });
  const ag2 = agregadosDe(p.movimientos, structuredClone(ag));
  const cajas = [...CAJAS.map((c) => ({ ...c, activa: false })), ...p.cajasNuevas];
  const cuentas = CUENTAS.map((k) => ({ ...k, cajaPredeterminadaId: k.id }));
  const nuevo = (col) => PLAN[col].map((x) => p.cambios.find((c) => c.coleccion === col && c.antes.id === x.id)?.despues || x);
  const datos = { cajas, cuentas, categorias: [{ id: "ga-casa", tipo: "gasto", nombre: "Casa" }], obligaciones: [], deudas: [], recurrentes: [],
    metas: nuevo("metas"), agregados: agregadosEnCuentas(ag2), perfil: { config: { modo: "cuentas", ultimoRespaldo: HOY } }, hoy: HOY };
  // La tarjeta en negativo es lo que debes (no un error) y no hay cajas viejas «desactivadas con dinero».
  assert.eq(diagnosticar(datos).map((h) => h.titulo), []);
  // Una cuenta de débito en negativo sí es un error, y se arregla cuadrando.
  const menos = agregadosDe([{ tipo: "gasto", fecha: HOY, montoCentavos: 200000, cajaId: "efectivo", cuentaId: "efectivo", categoriaId: "ga-casa" }], structuredClone(ag2));
  const h = diagnosticar({ ...datos, agregados: agregadosEnCuentas(menos) });
  assert.eq(h.map((x) => [x.nivel, x.titulo, x.ruta]), [["error", "Efectivo quedó en negativo", "cuadrar"]]);
  // Una meta que sigue en una caja vieja se nombra como cuenta.
  const meta = diagnosticar({ ...datos, metas: [{ id: "m", nombre: "Viaje", cajaOrigenId: "efe", cajaAhorroId: "hsbc" }] });
  assert.eq(meta.map((x) => x.titulo), ["La meta «Viaje» usa su cuenta de origen desactivada o borrada"]);
});

test("modo cuentas: lo que debes en una tarjeta no avisa como «caja en negativo»", () => {
  const cajas = [{ id: "mp", nombre: "Mercado Pago", tipo: "operativa" }, { id: "azul", nombre: "BBVA Azul", tipo: "operativa" }];
  const disponible = { porCaja: { mp: -5000, azul: -264309 } };
  const proyeccion = { primerNegativo: { mp: "2026-11-20", azul: HOY } };
  const tipos = (soloCuentas) => generarAlertas({ hoy: HOY, cajas, cuentas: CUENTAS, disponible, proyeccion, agregados: {}, soloCuentas })
    .map((a) => `${a.tipo}:${a.titulo}`);
  assert.eq(tipos(true), ["caja-deficit:Mercado Pago: faltan $50.00"]);
  assert.ok(tipos(false).includes("caja-deficit:BBVA Azul: faltan $2,643.09"), "en modo cajas sí avisa");
});

test("convertir a cuentas: después de Deshacer se puede volver a simplificar (las cajas de las cuentas se vuelven a activar)", () => {
  const ag = agregadosDe(MOVS);
  const p = planConversion({ cajas: CAJAS, cuentas: CUENTAS, agregados: ag, ...PLAN, hoy: HOY });
  // Deshacer: las transferencias se anulan (los saldos regresan) y las cajas de las cuentas quedan desactivadas.
  const cajas = [...CAJAS, ...p.cajasNuevas.map((c) => ({ ...c, activa: false }))];
  const otra = planConversion({ cajas, cuentas: CUENTAS, agregados: ag, ...PLAN, hoy: HOY });
  assert.eq(otra.cajasNuevas.map((c) => [c.id, c.activa]), p.cajasNuevas.map((c) => [c.id, true]));
  assert.eq(otra.movimientos, p.movimientos);
  assert.eq(otra.desactivar, p.desactivar);
});

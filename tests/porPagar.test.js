import { test, assert } from "./lib.js";
import { porPagar, resumenPorPagar, cuandoVence, tituloPorPagar, urgenciaDe } from "../js/domain/porPagar.js";
import { estadoTarjeta, deudaDeMsi } from "../js/domain/tarjetas.js";
import { construirMovimiento, deltasAgregados } from "../js/domain/movimientos.js";

function sumar(dest, delta) { for (const [k, v] of Object.entries(delta)) { if (typeof v === "number") dest[k] = (dest[k] || 0) + v; else sumar(dest[k] ??= {}, v); } }
function agregadosDe(movs, ag = {}) {
  for (const m of movs) for (const [mes, d] of Object.entries(deltasAgregados(null, construirMovimiento(m)))) sumar(ag[mes] ??= {}, d);
  return ag;
}

const HOY = "2026-10-29"; // jueves
const ob = (id, nombre, diaMes, monto, extra = {}) => ({ id, nombre, montoCentavos: monto, regla: { frecuencia: "mensual", diaMes, desde: "2026-10-01" },
  cajaId: "casa", cuentaId: "bbva", categoriaId: "ga-casa", activa: true, ...extra });
const CUENTAS = [{ id: "bbva", nombre: "BBVA", tipo: "debito" }, { id: "cimaco", nombre: "Cimaco", tipo: "credito", credito: { diaCorte: 3, diaLimite: 3 } }];

test("por pagar: lo vencido primero, luego hoy, pronto (≤ 3 días) y la semana; lo pagado no sale", () => {
  const obligaciones = [ob("luz", "Luz", 29, 80000), ob("renta", "Renta", 31, 500000), ob("cel", "Celular", 25, 40000), ob("agua", "Agua", 5, 20000), ob("gym", "Gym", 20, 30000)];
  const pago = (id, f, monto) => ({ tipo: "gasto", fecha: f, montoCentavos: monto, cajaId: "casa", cuentaId: "bbva", categoriaId: "ga-casa", obligacionId: id, obligacionPeriodo: f });
  const ag = agregadosDe([pago("gym", "2026-10-20", 30000), pago("agua", "2026-10-05", 20000)]);
  const lista = porPagar({ obligaciones, agregados: ag, cuentas: CUENTAS, hoy: HOY });
  assert.eq(lista.map((x) => [x.nombre, x.urgencia, x.dias, x.monto]), [
    ["Celular", "vencido", -4, 40000], ["Luz", "hoy", 0, 80000], ["Renta", "pronto", 2, 500000], ["Agua", "semana", 7, 20000]]);
  assert.eq(resumenPorPagar(lista), { total: 640000, urgentes: 3, vencidos: 1, nivel: "rojo" });
  assert.eq(tituloPorPagar(lista), "¡Tienes un pago vencido!");
  assert.eq(lista.map((x) => cuandoVence(x)), ["Se venció hace 4 días (25 oct)", "Vence HOY", "Vence el sábado 31", "Vence el jueves 5"]);
});

test("por pagar: la tarjeta con su fecha límite; lo cargado a la tarjeta no se repite", () => {
  const cimaco = CUENTAS[1];
  const deudaInicial = { tipo: "ajuste", direccion: "salida", fecha: "2026-10-03", montoCentavos: 289227, cajaId: "casa", cuentaId: "cimaco", nota: "Deuda" };
  const ag = agregadosDe([deudaInicial]);
  const movsCimaco = [{ id: "d1", ...construirMovimiento(deudaInicial) }];
  const tv = { id: "tv", ...deudaDeMsi({ descripcion: "TV", montoCentavos: 1200000, meses: 12, fechaCompra: "2026-09-10", cajaId: "casa" }, cimaco,
    { cuentaPagoId: "bbva", categoriaId: "ga-electrodomesticos" }) };
  const netflix = ob("netflix", "Netflix", 30, 29900, { cuentaId: "cimaco" });
  const estado = estadoTarjeta({ cuenta: cimaco, agregados: ag, deudas: [tv], movimientos: movsCimaco, hoy: HOY });
  const lista = porPagar({ obligaciones: [netflix], deudas: [tv], agregados: ag, cuentas: CUENTAS, tarjetas: [{ cuenta: cimaco, estado }], hoy: HOY });
  assert.eq(lista.map((x) => [x.tipo, x.nombre, x.fecha, x.urgencia, x.monto]), [["tarjeta", "Tarjeta Cimaco", "2026-11-03", "semana", 389227]]);
  // Sin el estado de la tarjeta (aún cargando), la mensualidad sale sola y Netflix no (se paga con la tarjeta).
  const sinEstado = porPagar({ obligaciones: [netflix], deudas: [tv], agregados: ag, cuentas: CUENTAS, hoy: HOY });
  assert.eq(sinEstado.map((x) => [x.nombre, x.fecha]), [["TV (a meses)", "2026-11-03"]]);
  // El 5 de noviembre, sin pagar: vencida hace 2 días.
  const tarde = estadoTarjeta({ cuenta: cimaco, agregados: ag, deudas: [tv], movimientos: movsCimaco, hoy: "2026-11-05" });
  const l2 = porPagar({ deudas: [tv], agregados: ag, cuentas: CUENTAS, tarjetas: [{ cuenta: cimaco, estado: tarde }], hoy: "2026-11-05" });
  assert.eq(l2.map((x) => [x.urgencia, x.dias, cuandoVence(x)]), [["vencido", -2, "Se venció hace 2 días (3 nov)"]]);
  assert.eq(tituloPorPagar(l2), "¡Tienes un pago vencido!");
});

test("por pagar: más de 7 días no sale; sin pendientes no hay aviso", () => {
  assert.eq(porPagar({ obligaciones: [ob("x", "Lejano", 15, 1000, { regla: { frecuencia: "mensual", diaMes: 15, desde: "2026-10-16" } })], cuentas: CUENTAS, hoy: HOY }), []);
  // Un vencido de hace más de un mes ya no sale; el de este mes sí.
  const viejo = porPagar({ obligaciones: [ob("v", "Viejo", 15, 1000, { regla: { frecuencia: "mensual", diaMes: 15, desde: "2026-08-01" } })], cuentas: CUENTAS, hoy: HOY });
  assert.eq(viejo.map((x) => x.fecha), ["2026-10-15"]);
  assert.eq(resumenPorPagar([]), { total: 0, urgentes: 0, vencidos: 0, nivel: null });
  assert.eq([urgenciaDe(-1), urgenciaDe(0), urgenciaDe(3), urgenciaDe(4)], ["vencido", "hoy", "pronto", "semana"]);
  const nuevo = { regla: { frecuencia: "mensual", diaMes: 5, desde: "2026-10-30" } }; // dado de alta hoy: sin meses anteriores
  const semana = porPagar({ obligaciones: [ob("a", "Agua", 5, 20000, nuevo)], cuentas: CUENTAS, hoy: HOY });
  assert.eq([resumenPorPagar(semana).nivel, tituloPorPagar(semana)], ["amarillo", "Esta semana vence"]);
  const pronto = porPagar({ obligaciones: [ob("a", "Agua", 31, 20000, { regla: { ...nuevo.regla, diaMes: 31 } }), ob("b", "Luz", 1, 1000, { regla: { ...nuevo.regla, diaMes: 1 } })], cuentas: CUENTAS, hoy: HOY });
  assert.eq([resumenPorPagar(pronto).nivel, tituloPorPagar(pronto)], ["naranja", "Se vienen 2 pagos"]);
});

test("por pagar: tarjeta que no se pagó y ya pasó su corte siguiente (Cimaco) — vencida desde su fecha límite", () => {
  const cimaco = { id: "cimaco", nombre: "Cimaco", tipo: "credito", credito: { diaCorte: 3, diaLimite: 3 } };
  const compra = { id: "c1", ...construirMovimiento({ tipo: "gasto", fecha: "2026-09-20", montoCentavos: 289227, cajaId: "casa", cuentaId: "cimaco", categoriaId: "ga-casa" }) };
  const ag = agregadosDe([compra]);
  const estado = estadoTarjeta({ cuenta: cimaco, agregados: ag, movimientos: [compra], hoy: "2026-11-06" });
  const lista = porPagar({ agregados: ag, cuentas: [cimaco], tarjetas: [{ cuenta: cimaco, estado }], hoy: "2026-11-06" });
  assert.eq(lista.map((x) => [x.nombre, x.fecha, x.urgencia, cuandoVence(x), x.monto]), [["Tarjeta Cimaco", "2026-11-03", "vencido", "Se venció hace 3 días (3 nov)", 289227]]);
});

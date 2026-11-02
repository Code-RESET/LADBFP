import { test, assert } from "./lib.js";
import { movimientosParaJuntar, cambiosParaJuntar, cajaParecida } from "../js/domain/juntar.js";
import { construirMovimiento, deltasAgregados, validarMovimiento } from "../js/domain/movimientos.js";
import { saldosPor, desgloseCaja, patrimonio } from "../js/domain/saldos.js";
import { efectoEnCuenta } from "../js/domain/tarjetas.js";
import { diagnosticar } from "../js/domain/diagnostico.js";

function sumar(dest, delta) { for (const [k, v] of Object.entries(delta)) { if (typeof v === "number") dest[k] = (dest[k] || 0) + v; else sumar(dest[k] ??= {}, v); } }
function agregadosDe(movs, ag = {}) {
  for (const m of movs) for (const [mes, d] of Object.entries(deltasAgregados(null, construirMovimiento(m)))) sumar(ag[mes] ??= {}, d);
  return ag;
}

const HOY = "2026-11-02";
// El caso de Angel: «Alarmas RST» (vieja, desactivada) tiene la deuda de la tarjeta y el pago que salió de Mercado Pago;
// «Alarmas REST» tiene el dinero de Mercado Pago.
const movsAngel = [
  { tipo: "apertura", fecha: "2026-10-20", montoCentavos: 977946, cajaId: "rest", cuentaId: "mp" },
  { tipo: "gasto", fecha: "2026-10-25", montoCentavos: 1083371, cajaId: "rst", cuentaId: "azul", categoriaId: "ga-casa" },
  { tipo: "transferencia", fecha: "2026-11-01", montoCentavos: 819062, cajaId: "rst", cuentaId: "mp", cajaDestinoId: "rst", cuentaDestinoId: "azul" },
  { tipo: "apertura", fecha: "2026-10-01", montoCentavos: 500000, cajaId: "rst", cuentaId: "bbva" },
];

test("juntar: lo de la caja vieja pasa a la otra (dinero, negativo y deuda de tarjeta) sin cambiar ningún banco", () => {
  const ag = agregadosDe(movsAngel);
  assert.eq(saldosPor(ag, "porCuenta").mp, 158884); // Mercado Pago tiene $1,588.84 (bien)
  assert.eq([saldosPor(ag, "porCaja").rest, saldosPor(ag, "porCaja").rst], [977946, -583371]);
  const movs = movimientosParaJuntar({ agregados: ag, deId: "rst", aId: "rest", fecha: HOY, nota: "Juntar" });
  assert.eq(movs.length, 3);
  assert.ok(movs.every((m) => validarMovimiento(m).ok && m.cuentaId === m.cuentaDestinoId), "transferencias dentro de la misma cuenta");
  const ag2 = agregadosDe(movs, structuredClone(ag));
  assert.eq(desgloseCaja(ag2, "rst"), []);
  assert.eq(saldosPor(ag2, "porCuenta"), saldosPor(ag, "porCuenta"));
  assert.eq(patrimonio(ag2), patrimonio(ag));
  const rest = Object.fromEntries(desgloseCaja(ag2, "rest").map((d) => [d.cuentaId, d.saldo]));
  assert.eq(rest, { mp: 158884, azul: -264309, bbva: 500000 });
  assert.eq(saldosPor(ag2, "porCaja").rest, 394575);
  // No cuenta como pago de la tarjeta.
  assert.eq(movs.map((m) => efectoEnCuenta(construirMovimiento(m), "azul")), [0, 0, 0]);
});

test("juntar: lo que usa la caja vieja pasa a la otra (con el banco de la otra; la tarjeta se queda)", () => {
  const cuentas = [{ id: "mp", tipo: "monedero", cajaPredeterminadaId: "rst" }, { id: "bbva", tipo: "debito" },
    { id: "azul", tipo: "credito", cajaPredeterminadaId: "rst" }, { id: "nu", tipo: "debito", cajaPredeterminadaId: "personal" }];
  const r = cambiosParaJuntar({
    deId: "rst", aId: "rest", bancoDeA: "mp", cuentas,
    obligaciones: [{ id: "o1", nombre: "Dra. Marcela", cajaId: "rst", cuentaId: "bbva" }, { id: "o2", nombre: "Netflix", cajaId: "rst", cuentaId: "azul" },
      { id: "o3", nombre: "Luz", cajaId: "personal", cuentaId: "nu" }],
    deudas: [{ id: "d1", acreedor: "TV", cajaId: "rst", cuentaId: "bbva", tarjetaId: "azul" }],
    recurrentes: [{ id: "r1", nombre: "Cobranza", tipo: "ingreso", cajaId: "rst", cuentaId: "bbva" },
      { id: "r2", nombre: "Pasar a RST", tipo: "transferencia", cajaId: "rest", cuentaId: "mp", cajaDestinoId: "rst", cuentaDestinoId: "bbva" },
      { id: "r3", nombre: "Sueldo", tipo: "transferencia", cajaId: "rst", cuentaId: "bbva", cajaDestinoId: "personal", cuentaDestinoId: "nu" }],
    metas: [{ id: "m1", nombre: "Equipo", cajaOrigenId: "rst", cajaAhorroId: "ahorro" }, { id: "m2", nombre: "Raro", cajaOrigenId: "rest", cajaAhorroId: "rst" }],
    presupuestos: [{ id: "p1", nombre: "Semana", cajaId: "personal", coberturas: [{ desdeCajaId: "rst", montoCentavos: 1000 }, { desdeCajaId: "x", montoCentavos: 5 }] }],
  });
  const de = (col, id) => r.cambios.find((c) => c.coleccion === col && c.antes.id === id)?.despues;
  assert.eq([de("obligaciones", "o1").cajaId, de("obligaciones", "o1").cuentaId], ["rest", "mp"]);
  assert.eq([de("obligaciones", "o2").cajaId, de("obligaciones", "o2").cuentaId], ["rest", "azul"]);
  assert.eq(de("obligaciones", "o3"), undefined);
  assert.eq([de("deudas", "d1").cajaId, de("deudas", "d1").cuentaId, de("deudas", "d1").tarjetaId], ["rest", "mp", "azul"]);
  assert.eq([de("recurrentes", "r1").cajaId, de("recurrentes", "r1").cuentaId], ["rest", "mp"]);
  assert.eq([de("recurrentes", "r3").cajaId, de("recurrentes", "r3").cajaDestinoId, de("recurrentes", "r3").cuentaDestinoId], ["rest", "personal", "nu"]);
  assert.eq([de("metas", "m1").cajaOrigenId, de("metas", "m1").cajaAhorroId], ["rest", "ahorro"]);
  assert.eq(de("presupuestos", "p1").coberturas.map((c) => c.desdeCajaId), ["rest", "x"]);
  assert.eq([de("cuentas", "mp").cajaPredeterminadaId, de("cuentas", "azul").cajaPredeterminadaId, de("cuentas", "nu")], ["rest", "rest", undefined]);
  // Quedarían de una caja a la misma: no se cambian.
  assert.eq(r.conflictos.map((c) => c.item.id), ["r2", "m2"]);
});

test("juntar: sugiere la caja de nombre parecido", () => {
  const cajas = [{ id: "efe", nombre: "EFECTIVO-" }, { id: "rest", nombre: "Alarmas REST" }, { id: "hd", nombre: "HD Crédit" }, { id: "off", nombre: "Alarmas", activa: false }];
  assert.eq(cajaParecida({ id: "rst", nombre: "Alarmas RST" }, cajas), "rest");
  assert.eq(cajaParecida({ id: "inv", nombre: "Inversión HD credit" }, cajas), "hd");
  assert.eq(cajaParecida({ id: "g", nombre: "Gasolina" }, cajas), "");
});

test("diagnóstico: caja desactivada que no quedó en $0 → juntarla con otra", () => {
  const ag = agregadosDe(movsAngel);
  const base = {
    cajas: [{ id: "rest", nombre: "Alarmas REST", tipo: "operativa", cuentaPredeterminadaId: "mp" }, { id: "rst", nombre: "Alarmas RST", activa: false, cuentaPredeterminadaId: "bbva" }],
    cuentas: [{ id: "mp", nombre: "Mercado Pago", tipo: "monedero" }, { id: "bbva", nombre: "BBVA", tipo: "debito" }, { id: "azul", nombre: "Azul", tipo: "credito", credito: { diaCorte: 3, diaLimite: 23 } }],
    agregados: ag, perfil: { config: { ultimoRespaldo: HOY } }, hoy: HOY,
  };
  const h = diagnosticar(base).filter((x) => x.titulo.includes("Alarmas RST"));
  assert.eq(h.map((x) => [x.nivel, x.titulo, x.ruta]), [["error", "«Alarmas RST» está desactivada pero tiene -$5,833.71", "cajas"]]);
  assert.ok(h[0].detalle.startsWith("Mercado Pago -$8,190.62, BBVA $5,000.00, Azul -$2,643.09") && h[0].detalle.includes("Juntar con otra caja"), h[0].detalle);
  // Después de juntar, ya no sale.
  const ag2 = agregadosDe(movimientosParaJuntar({ agregados: ag, deId: "rst", aId: "rest", fecha: HOY }), structuredClone(ag));
  assert.eq(diagnosticar({ ...base, agregados: ag2 }).filter((x) => x.titulo.includes("Alarmas RST")), []);
});

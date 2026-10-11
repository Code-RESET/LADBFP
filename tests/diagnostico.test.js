import { test, assert } from "./lib.js";
import { diagnosticar } from "../js/domain/diagnostico.js";

const HOY = "2026-10-07";
const base = () => ({
  cajas: [{ id: "a", nombre: "Personal", tipo: "operativa", cuentaPredeterminadaId: "c1" }],
  cuentas: [{ id: "c1", nombre: "HSBC", tipo: "debito" }],
  categorias: [{ id: "ga-vivienda", tipo: "gasto", nombre: "Vivienda" }],
  obligaciones: [], deudas: [], recurrentes: [],
  agregados: { "2026-10": { n: 1, porCaja: { a: { ape: 500000, n: 1 } }, porCuenta: { c1: { ape: 500000, n: 1 } } } },
  perfil: { config: { ultimoRespaldo: "2026-10-01" } },
  hoy: HOY,
});
const titulos = (d) => d.map((h) => `${h.nivel}:${h.titulo}`);

test("diagnóstico: datos sanos → sin hallazgos", () => {
  assert.eq(diagnosticar(base()), []);
});

test("diagnóstico: recuerda descargar el respaldo (nunca o hace más de 30 días)", () => {
  assert.eq(titulos(diagnosticar({ ...base(), perfil: null })), ["info:Aún no tienes un respaldo de tus datos"]);
  assert.eq(titulos(diagnosticar({ ...base(), perfil: { config: { ultimoRespaldo: "2026-08-01" } } })), ["info:Tu último respaldo es de hace 67 días"]);
});

test("diagnóstico: saldo negativo, caja sin banco y sin saldos iniciales", () => {
  const d = base();
  d.cajas.push({ id: "b", nombre: "Negocio", tipo: "operativa" });
  d.agregados = { "2026-10": { n: 1, porCaja: { a: { gas: 1000, n: 1 } }, porCuenta: { c1: { gas: 1000, n: 1 } } } };
  const t = titulos(diagnosticar(d));
  assert.ok(t[0].startsWith("error:Personal tiene saldo negativo"), t.join(" | "));
  assert.ok(t.includes("aviso:El banco HSBC quedó en negativo"), t.join(" | "));
  assert.ok(t.includes("aviso:Negocio no tiene banco asignado"), t.join(" | "));
  assert.ok(t.includes("aviso:No has capturado el dinero que ya tenías"), t.join(" | "));
  assert.ok(t.includes("info:Negocio no se ha usado"), t.join(" | "));
});

test("diagnóstico: gasto fijo con caja desactivada y vencidos sin marcar", () => {
  const d = base();
  d.cajas.push({ id: "z", nombre: "Vieja", activa: false, cuentaPredeterminadaId: "c1" });
  d.obligaciones = [
    { id: "o1", nombre: "Hipoteca", montoCentavos: 100000, cajaId: "z", cuentaId: "c1", categoriaId: "ga-vivienda", regla: { frecuencia: "mensual", diaMes: 3, desde: "2026-01-01" } },
  ];
  const t = titulos(diagnosticar(d));
  assert.ok(t.includes("error:«Hipoteca» usa su caja desactivada o borrada"), t.join(" | "));
  assert.ok(t.includes("aviso:1 gasto vencido sin marcar"), t.join(" | "));
});

// ---------- Excel del mes (domain/reporte.js) ----------
import { reporteMes, montoConSigno } from "../js/domain/reporte.js";
import { construirMovimiento, deltasAgregados } from "../js/domain/movimientos.js";

function conAgregados(movs) {
  const ag = {};
  const sumar = (dest, delta) => { for (const [k, v] of Object.entries(delta)) { if (typeof v === "number") dest[k] = (dest[k] || 0) + v; else sumar(dest[k] ??= {}, v); } };
  const docs = movs.map((m, i) => ({ id: `m${i}`, cuentaId: "c1", ...construirMovimiento({ cuentaId: "c1", ...m }), ts: i }));
  for (const d of docs) for (const [mes, delta] of Object.entries(deltasAgregados(null, d))) sumar(ag[mes] ??= {}, delta);
  return { ag, docs };
}

test("reporte: balance real cuadra (al empezar + entró − salió + otros = al cerrar)", () => {
  const { ag, docs } = conAgregados([
    { tipo: "apertura", fecha: "2026-09-01", montoCentavos: 500000, cajaId: "a" },
    { tipo: "ingreso", fecha: "2026-10-02", montoCentavos: 1500000, cajaId: "a", categoriaId: "in-h", nota: "Honorarios" },
    { tipo: "gasto", fecha: "2026-10-03", montoCentavos: 100000, cajaId: "a", categoriaId: "ga-vivienda", obligacionId: "o1", obligacionPeriodo: "2026-10-03", nota: "Hipoteca" },
    { tipo: "gasto", fecha: "2026-10-05", montoCentavos: 50000, cajaId: "a", categoriaId: "ga-vivienda", nota: "Gasolina" },
    { tipo: "transferencia", fecha: "2026-10-06", montoCentavos: 200000, cajaId: "a", cajaDestinoId: "b", cuentaDestinoId: "c1" },
    { tipo: "ajuste", fecha: "2026-10-06", montoCentavos: 1000, cajaId: "b", direccion: "salida", nota: "cuadre" },
  ]);
  const r = reporteMes({
    mes: "2026-10", hoy: "2026-10-07",
    cajas: [{ id: "a", nombre: "Personal", cuentaPredeterminadaId: "c1" }, { id: "b", nombre: "Ahorro" }],
    cuentas: [{ id: "c1", nombre: "HSBC" }],
    categorias: [{ id: "ga-vivienda", tipo: "gasto", nombre: "Vivienda" }, { id: "in-h", tipo: "ingreso", nombre: "Honorarios" }],
    obligaciones: [{ id: "o1", nombre: "Hipoteca", montoCentavos: 100000, cajaId: "a", cuentaId: "c1", categoriaId: "ga-vivienda", regla: { frecuencia: "mensual", diaMes: 3, desde: "2026-01-01" } },
      { id: "o2", nombre: "Internet", montoCentavos: 60000, cajaId: "a", cuentaId: "c1", categoriaId: "ga-vivienda", regla: { frecuencia: "mensual", diaMes: 20, desde: "2026-01-01" } }],
    agregados: ag, movimientos: docs.filter((d) => d.mes === "2026-10"),
  });
  const d = r.dineroReal;
  assert.eq([d.inicio, d.entro, d.salio, d.otros, d.cierre], [500000, 1500000, 150000, -1000, 1849000]);
  assert.eq(d.inicio + d.entro - d.salio + d.otros, d.cierre);
  assert.eq([r.balance.ingresos, r.balance.pagado, r.balance.pendiente, r.balance.balance], [1500000, 150000, 60000, 1290000]);
  assert.eq(r.gastos.map((g) => [g.concepto, g.estado, g.fijo]), [["Hipoteca", "Pagado", "Sí"], ["Gasolina", "Pagado", "No"], ["Internet", "Pendiente", "Sí"]]);
  assert.eq(r.cajas.map((c) => [c.caja, c.inicio, c.transferencias, c.cierre]), [["Personal", 500000, -200000, 1650000], ["Ahorro", 0, 200000, 199000]]);
  assert.eq(r.movimientos.length, 5);
  assert.eq(r.meses.map((m) => m.mes), ["2026-09", "2026-10"]);
  assert.eq([montoConSigno({ tipo: "gasto", montoCentavos: 5 }), montoConSigno({ tipo: "transferencia", montoCentavos: 5 })], [-5, 0]);
});

test("reporte: compras con tarjeta dicen con cuál; mensualidad a meses con su número; liquidación como gasto de una vez", () => {
  const tv = { id: "tv", acreedor: "Liverpool", descripcion: "TV", tarjetaId: "liv", meses: 12, saldoInicialCentavos: 1200000, pagoCentavos: 100000,
    regla: { frecuencia: "mensual", diaMes: 5, desde: "2026-10-05" }, cajaId: "a", cuentaId: "c1", categoriaId: "ga-vivienda", activa: true };
  const { ag, docs } = conAgregados([
    { tipo: "gasto", fecha: "2026-10-03", montoCentavos: 80000, cajaId: "a", cuentaId: "liv", categoriaId: "ga-vivienda", nota: "Gasolina" },
    { tipo: "gasto", fecha: "2026-10-05", montoCentavos: 100000, cajaId: "a", categoriaId: "ga-vivienda", deudaId: "tv", deudaPeriodo: "2026-10-05", nota: "TV (1 de 12)" },
    { tipo: "gasto", fecha: "2026-10-06", montoCentavos: 1100000, cajaId: "a", categoriaId: "ga-vivienda", deudaId: "tv", nota: "TV (liquidación)" },
  ]);
  const r = reporteMes({
    mes: "2026-10", hoy: "2026-10-07", cajas: [{ id: "a", nombre: "Personal" }],
    cuentas: [{ id: "c1", nombre: "HSBC" }, { id: "liv", nombre: "Liverpool", tipo: "credito" }],
    categorias: [{ id: "ga-vivienda", tipo: "gasto", nombre: "Vivienda" }], deudas: [tv],
    agregados: ag, movimientos: docs.filter((d) => d.mes === "2026-10"),
  });
  assert.eq(r.gastos.map((g) => [g.concepto, g.formaPago, g.monto]), [
    ["Gasolina", "Tarjeta Liverpool", 80000], ["TV (1 de 12)", "Tarjeta Liverpool (a meses)", 100000], ["TV (liquidación)", "", 1100000]]);
  assert.eq(r.balance.pagado, 1280000);
});

// ---------- Banco del que sale el dinero de una caja ----------
import { cuentaParaCaja } from "../js/domain/saldos.js";
test("saldos: el gasto sale del banco donde la caja tiene dinero", () => {
  const caja = { id: "alarmas", cuentaPredeterminadaId: "mercado-pago" };
  const ag = { "2026-10": { porCajaCuenta: { "alarmas__bbva": { ape: 2417700 } } } };
  assert.eq(cuentaParaCaja(ag, caja, ["mercado-pago", "bbva"]), "bbva");             // saldo inicial en BBVA
  assert.eq(cuentaParaCaja({}, caja, ["mercado-pago", "bbva"]), "mercado-pago");     // sin dinero: el predeterminado
  assert.eq(cuentaParaCaja(ag, caja, ["mercado-pago"]), "mercado-pago");             // BBVA desactivado
  assert.eq(cuentaParaCaja({}, { id: "x" }, ["nu"]), "nu");
});

test("diagnóstico: tarjetas de crédito (sin día de corte, compra a meses de tarjeta desactivada, caja que gastó de más con tarjeta)", () => {
  const d = base();
  d.cuentas.push({ id: "liv", nombre: "Liverpool", tipo: "credito", credito: { diaCorte: 15 } }, { id: "nu", nombre: "Nu", tipo: "credito", activa: false });
  d.deudas = [{ id: "tv", acreedor: "Nu", descripcion: "TV", tarjetaId: "nu", saldoInicialCentavos: 100000, pagoCentavos: 10000, meses: 10,
    regla: { frecuencia: "mensual", diaMes: 5, desde: "2026-11-05" }, cajaId: "a", cuentaId: "c1", activa: true }];
  // Personal tenía $5,000 y gastó $6,000 con Liverpool.
  d.agregados = { "2026-10": { n: 2, porCaja: { a: { ape: 500000, gas: 600000, n: 2 } }, porCuenta: { c1: { ape: 500000, n: 1 }, liv: { gas: 600000, n: 1 } },
    porCajaCuenta: { a__c1: { ape: 500000 }, a__liv: { gas: 600000 } } } };
  const h = diagnosticar(d);
  const t = titulos(h);
  assert.ok(t[0] === "error:Personal tiene saldo negativo" && h[0].detalle.startsWith("Gastaste con tarjeta de crédito"), t.join(" | "));
  assert.ok(t.includes("aviso:A la tarjeta Liverpool le falta su día de corte o de pago"), t.join(" | "));
  assert.ok(t.includes("aviso:La compra a meses «TV» es de una tarjeta desactivada o borrada"), t.join(" | "));
  assert.no(t.some((x) => x.includes("Liverpool quedó en negativo")), "una tarjeta en negativo es normal (es lo que debes)");
});

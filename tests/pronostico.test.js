import { test, assert } from "./lib.js";
import { estadoDelMes, pronosticoDias, consejo } from "../js/domain/pronostico.js";
import { diaCorto } from "../js/core/dates.js";

test("pronóstico: estado del mes (el 'clima')", () => {
  assert.eq(estadoDelMes({ ingresos: 0, totalGastos: 0, balance: 0 }).estado, "bien");
  assert.eq(estadoDelMes({ ingresos: 1500000, totalGastos: 210000, balance: 1290000 }), { estado: "bien", frase: "Vas bien" });
  assert.eq(estadoDelMes({ ingresos: 1000000, totalGastos: 950000, balance: 50000 }), { estado: "justo", frase: "Vas justo" });
  assert.eq(estadoDelMes({ ingresos: 0, totalGastos: 210000, balance: -210000 }), { estado: "mal", frase: "Mes en rojo" });
});

test("pronóstico: 7 días con pagos, cobros y cómo queda el dinero", () => {
  const HOY = "2026-10-07";
  const agregados = { "2026-10": { n: 1, porCaja: { a: { ape: 500000, n: 1 } } } };
  const regla = (dia) => ({ frecuencia: "mensual", diaMes: dia, desde: "2026-01-01" });
  const dias = pronosticoDias({
    hoy: HOY, agregados,
    obligaciones: [
      { id: "h", nombre: "Hipoteca", montoCentavos: 100000, cajaId: "a", cuentaId: "c", regla: regla(3) },   // vencida → hoy
      { id: "i", nombre: "Internet", montoCentavos: 60000, cajaId: "a", cuentaId: "c", regla: regla(9) },
    ],
    recurrentes: [
      { id: "n", nombre: "Nómina", tipo: "ingreso", montoCentavos: 300000, cajaId: "a", cuentaId: "c", regla: regla(10) },
      { id: "t", nombre: "Pase", tipo: "transferencia", montoCentavos: 50000, cajaId: "a", cuentaId: "c", cajaDestinoId: "b", cuentaDestinoId: "c", regla: regla(8) },
    ],
  });
  assert.eq(dias.length, 7);
  assert.eq(dias.map((d) => d.fecha.slice(8)), ["07", "08", "09", "10", "11", "12", "13"]);
  assert.eq(dias.map((d) => d.saldo), [400000, 400000, 340000, 640000, 640000, 640000, 640000]);
  assert.eq(dias[0].eventos, [{ nombre: "Hipoteca", clase: "obligacion", monto: 100000, vencido: true }]);
  assert.eq(dias[1].eventos, []); // la transferencia no se muestra: no cambia el total
  assert.eq([dias[2].salidas, dias[3].entradas], [60000, 300000]);
  assert.eq([diaCorto("2026-10-07", HOY), diaCorto("2026-10-08", HOY), diaCorto("2026-10-09", HOY)], ["Hoy", "Mañana", "vie 9"]);
});

test("pronóstico: consejo según prioridad", () => {
  const HOY = "2026-10-07";
  const dia = (fecha, saldo, eventos = []) => ({ fecha, saldo, entradas: 0, salidas: 0, eventos });
  const vencido = { nombre: "Hipoteca", estado: "Vencido" };
  assert.eq(consejo({ balance: { fijos: [vencido] }, hoy: HOY }).titulo, "Hipoteca está vencido");
  assert.eq(consejo({ balance: { fijos: [] }, hallazgos: [{ nivel: "error", titulo: "X tiene saldo negativo", detalle: "d" }], hoy: HOY }).accion.tipo, "revisar-datos");
  const semana = [dia("2026-10-07", 1000), dia("2026-10-09", -500, [{ nombre: "Renta", clase: "obligacion", monto: 1500 }])];
  assert.eq(consejo({ balance: { fijos: [] }, pronostico: semana, hoy: HOY }).texto.includes("el viernes"), true);
  const ok = [dia("2026-10-07", 9000), dia("2026-10-08", 8000, [{ nombre: "Internet", clase: "obligacion", monto: 600 }, { nombre: "Nómina", clase: "ingreso", monto: 3000 }]),
    dia("2026-10-09", 7000, [{ nombre: "Tarjeta", clase: "deuda", monto: 2300 }])];
  const c = consejo({ balance: { fijos: [] }, pronostico: ok, hoy: HOY });
  assert.eq([c.titulo, c.texto.startsWith("Vence el viernes")], ["Se viene Tarjeta", true]);
  assert.eq(consejo({ balance: { fijos: [] }, pronostico: [dia("2026-10-07", 10)], hoy: HOY }), null);
});

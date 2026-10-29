import { test, assert } from "./lib.js";
import { icsRecordatorios, rruleDe, plegar, escaparTexto, proximoPagoTarjeta } from "../js/domain/calendario.js";
import { deudaDeMsi } from "../js/domain/tarjetas.js";

const HOY = "2026-10-29";
const AHORA = new Date("2026-10-29T18:00:00Z");

test("calendario: reglas de repetición (día 31 = último día del mes, quincena, semana, año, cada N días)", () => {
  assert.eq(rruleDe({ frecuencia: "mensual", diaMes: 15 }), "FREQ=MONTHLY;BYMONTHDAY=15");
  assert.eq(rruleDe({ frecuencia: "mensual", diaMes: 31 }), "FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1");
  assert.eq(rruleDe({ frecuencia: "mensual", diaMes: 30, hasta: "2027-06-30" }), "FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1;UNTIL=20270630");
  assert.eq(rruleDe({ frecuencia: "quincenal" }), "FREQ=MONTHLY;BYMONTHDAY=15,-1");
  assert.eq(rruleDe({ frecuencia: "semanal", diaSemana: 3 }), "FREQ=WEEKLY;BYDAY=WE");
  assert.eq(rruleDe({ frecuencia: "anual", mes: 12, diaMes: 24 }), "FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=24");
  assert.eq(rruleDe({ frecuencia: "personalizada", cadaNDias: 10 }), "FREQ=DAILY;INTERVAL=10");
  assert.eq(rruleDe({ frecuencia: "mensual", diaMes: 5 }, { veces: 9 }), "FREQ=MONTHLY;BYMONTHDAY=5;COUNT=9");
});

test("calendario: texto escapado y renglones de máximo 75 bytes sin cortar acentos", () => {
  assert.eq(escaparTexto("Casa, comida; luz\\agua\nfin"), "Casa\\, comida\\; luz\\\\agua\\nfin");
  const largo = `SUMMARY:${"Pagó ñandú 💳 ".repeat(10)}`;
  const plegado = plegar(largo);
  const renglones = plegado.split("\r\n");
  assert.ok(renglones.length > 1, "debería partirse");
  assert.ok(renglones.every((r) => new TextEncoder().encode(r).length <= 75), "cada renglón ≤ 75 bytes");
  assert.eq(renglones.map((r, i) => (i ? r.slice(1) : r)).join(""), largo);
  assert.ok(renglones.slice(1).every((r) => r.startsWith(" ")), "los de continuación empiezan con espacio");
});

test("calendario: gastos fijos, deudas hasta su último pago y tarjetas en su fecha límite, con 2 alarmas", () => {
  const cuentas = [{ id: "bbva", nombre: "BBVA", tipo: "debito" },
    { id: "cimaco", nombre: "Cimaco", tipo: "credito", activa: true, credito: { diaCorte: 3, diaLimite: 3 } },
    { id: "vieja", nombre: "Vieja", tipo: "credito", activa: true }]; // sin fechas: no se puede avisar
  const obligaciones = [
    { id: "renta", nombre: "Renta, casa", montoCentavos: 500000, regla: { frecuencia: "mensual", diaMes: 31, desde: "2026-01-01" }, cuentaId: "bbva", activa: true },
    { id: "netflix", nombre: "Netflix", montoCentavos: 29900, regla: { frecuencia: "mensual", diaMes: 30, desde: "2026-01-01" }, cuentaId: "cimaco", activa: true },
    { id: "vieja", nombre: "Ya no", montoCentavos: 100, regla: { frecuencia: "mensual", diaMes: 1, desde: "2026-01-01", hasta: "2026-09-30" }, cuentaId: "bbva", activa: true },
  ];
  const marcela = { id: "marcela", acreedor: "Dra. Marcela", saldoInicialCentavos: 900000, pagoCentavos: 300000,
    regla: { frecuencia: "quincenal", desde: "2026-10-01" }, cajaId: "casa", cuentaId: "bbva", activa: true };
  const tv = { id: "tv", ...deudaDeMsi({ descripcion: "TV", montoCentavos: 1200000, meses: 12, fechaCompra: "2026-09-10", cajaId: "casa" },
    cuentas[1], { cuentaPagoId: "bbva", categoriaId: "ga-electrodomesticos" }) };
  const { texto, cuantos, nombres } = icsRecordatorios({ obligaciones, deudas: [marcela, tv], cuentas, agregados: {}, hoy: HOY, ahora: AHORA });
  assert.eq(cuantos, 3);
  assert.eq(nombres, ["💸 Pagar Renta, casa · $5,000.00", "💸 Pagar Dra. Marcela · $3,000.00", "💳 Pagar tarjeta Cimaco"]);
  assert.ok(texto.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n") && texto.endsWith("END:VCALENDAR\r\n"), "estructura");
  assert.ok(!/[^\r]\n/.test(texto), "todas las líneas terminan en CRLF");
  const desplegado = texto.replace(/\r\n /g, "");
  const evento = (uid) => desplegado.split("BEGIN:VEVENT").find((b) => b.includes(`UID:${uid}@finanzas-reset`));
  const renta = evento("obligacion-renta");
  assert.ok(renta.includes("DTSTART;VALUE=DATE:20261031") && renta.includes("DTEND;VALUE=DATE:20261101"), renta);
  assert.ok(renta.includes("RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1") && renta.includes("SUMMARY:💸 Pagar Renta\\, casa · $5\\,000.00"), renta);
  assert.ok(renta.includes("TRIGGER:-PT15H") && renta.includes("TRIGGER:PT9H") && renta.includes("DTSTAMP:20261029T180000Z"), renta);
  // Dra. Marcela: le faltan 3 pagos (quincenas) desde el 31 de octubre.
  const m = evento("deuda-marcela");
  assert.ok(m.includes("DTSTART;VALUE=DATE:20261031") && m.includes("RRULE:FREQ=MONTHLY;BYMONTHDAY=15,-1;COUNT=3"), m);
  // La TV a meses va dentro del pago de Cimaco; Netflix también (se carga a la tarjeta).
  assert.ok(!desplegado.includes("deuda-tv") && !desplegado.includes("Netflix") && !desplegado.includes("Ya no"), "no se repiten");
  const c = evento("tarjeta-cimaco");
  assert.ok(c.includes("DTSTART;VALUE=DATE:20261103") && c.includes("RRULE:FREQ=MONTHLY;BYMONTHDAY=3"), c);
});

test("calendario: próximo pago de la tarjeta (si ya pasó la fecha de este corte, el siguiente)", () => {
  const c = { diaCorte: 15, diaLimite: 5 };
  assert.eq([proximoPagoTarjeta(c, "2026-10-29"), proximoPagoTarjeta(c, "2026-11-05"), proximoPagoTarjeta(c, "2026-11-10")], ["2026-11-05", "2026-11-05", "2026-12-05"]);
});

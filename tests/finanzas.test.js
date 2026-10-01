import { test, assert } from "./lib.js";
import {
  validarMovimiento, construirMovimiento, deltasAgregados, agregadosDesdeMovimientos,
  buscarDuplicado, cambiosRelevantes,
} from "../js/domain/movimientos.js";
import {
  saldosPor, patrimonio, saldoDeTotales, desgloseCuenta, contarDesdeAgregados,
  diferenciasAgregados, tieneMovimientos,
} from "../js/domain/saldos.js";
import { validarCaja, validarCategoria, cuentaParaGasto } from "../js/domain/catalogos.js";

// ---------- Utilidades de prueba ----------
const ctx = {
  cajas: [{ id: "A" }, { id: "B" }, { id: "X", activa: false }],
  cuentas: [{ id: "bbva" }, { id: "nu" }],
  categorias: [{ id: "g-casa", tipo: "gasto" }, { id: "i-cobranza", tipo: "ingreso" }],
};

function mov(datos) {
  return construirMovimiento({ fecha: "2026-10-01", cuentaId: "bbva", ...datos });
}

/** Simula el repositorio: aplica deltas igual que increment() en Firestore. */
function sumarProfundo(dest, delta) {
  for (const [k, v] of Object.entries(delta)) {
    if (typeof v === "number") dest[k] = (dest[k] || 0) + v;
    else sumarProfundo(dest[k] ??= {}, v);
  }
}
function aplicar(agregados, anterior, nuevo) {
  for (const [mes, d] of Object.entries(deltasAgregados(anterior, nuevo))) sumarProfundo(agregados[mes] ??= {}, d);
  return agregados;
}

// ---------- PRUEBAS OBLIGATORIAS (sección 44) ----------
test("SALDOS: $10,000 ingreso − $2,000 gasto = $8,000", () => {
  const ag = {};
  aplicar(ag, null, mov({ tipo: "ingreso", montoCentavos: 1000000, cajaId: "A", categoriaId: "i-cobranza" }));
  aplicar(ag, null, mov({ tipo: "gasto", montoCentavos: 200000, cajaId: "A", categoriaId: "g-casa" }));
  assert.eq(saldosPor(ag, "porCaja").A, 800000);
  assert.eq(patrimonio(ag), 800000);
});

test("TRANSFERENCIA: A $10,000 → B $3,000 ⇒ A $7,000, B $3,000, patrimonio $10,000", () => {
  const ag = {};
  aplicar(ag, null, mov({ tipo: "apertura", montoCentavos: 1000000, cajaId: "A" }));
  aplicar(ag, null, mov({ tipo: "transferencia", montoCentavos: 300000, cajaId: "A", cajaDestinoId: "B", cuentaDestinoId: "nu" }));
  const s = saldosPor(ag, "porCaja");
  assert.eq(s.A, 700000);
  assert.eq(s.B, 300000);
  assert.eq(patrimonio(ag), 1000000, "una transferencia no cambia el patrimonio");
  assert.no(ag["2026-10"].porCaja.B.ing, "la transferencia nunca se cuenta como ingreso");
});

test("TRANSFERENCIA: HD Crédit → Nu $3,500 (ejemplo de la sección 15)", () => {
  const ag = {};
  aplicar(ag, null, mov({ tipo: "apertura", montoCentavos: 1515500, cajaId: "hd", cuentaId: "bbva" }));
  aplicar(ag, null, mov({ tipo: "transferencia", montoCentavos: 350000, cajaId: "hd", cuentaId: "bbva", cajaDestinoId: "sueldo", cuentaDestinoId: "nu" }));
  const s = saldosPor(ag, "porCaja");
  assert.eq(s.hd, 1515500 - 350000);
  assert.eq(s.sueldo, 350000);
  assert.eq(patrimonio(ag), 1515500);
});

// ---------- Integridad (sección 37) ----------
test("integridad: movimiento sin caja no se permite", () => {
  const r = validarMovimiento({ tipo: "gasto", montoCentavos: 100, fecha: "2026-10-01", cuentaId: "bbva", categoriaId: "g-casa" }, ctx);
  assert.no(r.ok);
  assert.ok(r.errores.cajaId);
});

test("integridad: transferencia sin origen o sin destino no se permite", () => {
  const base = { tipo: "transferencia", montoCentavos: 100, fecha: "2026-10-01" };
  const sinOrigen = validarMovimiento({ ...base, cajaDestinoId: "B", cuentaDestinoId: "nu", cuentaId: "bbva" }, ctx);
  assert.ok(sinOrigen.errores.cajaId);
  const sinDestino = validarMovimiento({ ...base, cajaId: "A", cuentaId: "bbva" }, ctx);
  assert.ok(sinDestino.errores.cajaDestinoId);
  assert.ok(sinDestino.errores.cuentaDestinoId);
});

test("integridad: transferencia al mismo par (caja, cuenta) no se permite", () => {
  const r = validarMovimiento({ tipo: "transferencia", montoCentavos: 100, fecha: "2026-10-01",
    cajaId: "A", cuentaId: "bbva", cajaDestinoId: "A", cuentaDestinoId: "bbva" }, ctx);
  assert.no(r.ok);
  assert.ok(r.errores.cajaDestinoId);
});

test("integridad: misma caja, distinta cuenta SÍ se permite (decisión A3)", () => {
  const m = { tipo: "transferencia", montoCentavos: 500000, fecha: "2026-10-01",
    cajaId: "A", cuentaId: "bbva", cajaDestinoId: "A", cuentaDestinoId: "nu" };
  assert.ok(validarMovimiento(m, ctx).ok);
  const ag = aplicar({}, null, construirMovimiento(m));
  assert.eq(saldosPor(ag, "porCaja").A, 0, "la caja no cambia");
  assert.eq(saldosPor(ag, "porCuenta"), { bbva: -500000, nu: 500000 });
  assert.eq(construirMovimiento(m).cajaIds, ["A"]);
  assert.eq(ag["2026-10"].porCaja.A.n, 1, "se cuenta una sola vez en la caja");
});

test("integridad: montos inválidos (0, negativo, decimal, texto)", () => {
  for (const monto of [0, -100, 10.5, "100", null]) {
    const r = validarMovimiento({ tipo: "gasto", montoCentavos: monto, fecha: "2026-10-01", cajaId: "A", cuentaId: "bbva", categoriaId: "g-casa" }, ctx);
    assert.ok(r.errores.montoCentavos, `monto ${monto}`);
  }
});

test("integridad: categoría obligatoria y del tipo correcto", () => {
  const sin = validarMovimiento({ tipo: "gasto", montoCentavos: 100, fecha: "2026-10-01", cajaId: "A", cuentaId: "bbva" }, ctx);
  assert.ok(sin.errores.categoriaId);
  const cruzada = validarMovimiento({ tipo: "ingreso", montoCentavos: 100, fecha: "2026-10-01", cajaId: "A", cuentaId: "bbva", categoriaId: "g-casa" }, ctx);
  assert.ok(cruzada.errores.categoriaId);
});

test("integridad: caja desactivada no acepta movimientos nuevos", () => {
  const r = validarMovimiento({ tipo: "apertura", montoCentavos: 100, fecha: "2026-10-01", cajaId: "X", cuentaId: "bbva" }, ctx);
  assert.ok(r.errores.cajaId);
});

test("integridad: ajuste exige dirección y motivo", () => {
  const r = validarMovimiento({ tipo: "ajuste", montoCentavos: 100, fecha: "2026-10-01", cajaId: "A", cuentaId: "bbva", nota: "  " }, ctx);
  assert.ok(r.errores.direccion);
  assert.ok(r.errores.nota);
});

test("construirMovimiento: quita campos que no aplican al tipo", () => {
  const m = construirMovimiento({ tipo: "apertura", fecha: "2026-10-05", montoCentavos: 100, cajaId: "A", cuentaId: "bbva",
    categoriaId: "g-casa", cajaDestinoId: "B", cuentaDestinoId: "nu", direccion: "salida", nota: " hola " });
  assert.eq(m.mes, "2026-10");
  assert.no("categoriaId" in m);
  assert.no("cajaDestinoId" in m);
  assert.no("direccion" in m);
  assert.eq(m.nota, "hola");
});

// ---------- Saldos y agregados ----------
test("apertura y ajustes: no cuentan como ingreso pero sí en el saldo", () => {
  const ag = {};
  aplicar(ag, null, mov({ tipo: "apertura", montoCentavos: 500000, cajaId: "A" }));
  aplicar(ag, null, mov({ tipo: "ajuste", direccion: "salida", montoCentavos: 1000, cajaId: "A", nota: "comisión" }));
  aplicar(ag, null, mov({ tipo: "ajuste", direccion: "entrada", montoCentavos: 300, cajaId: "A", nota: "intereses" }));
  const t = ag["2026-10"].porCaja.A;
  assert.eq(t.ing, undefined);
  assert.eq(saldoDeTotales(t), 500000 - 1000 + 300);
});

test("editar: los saldos reflejan el cambio de monto, caja y mes", () => {
  const ag = {};
  const original = mov({ tipo: "gasto", montoCentavos: 10000, cajaId: "A", categoriaId: "g-casa" });
  aplicar(ag, null, original);
  const editado = construirMovimiento({ ...original, montoCentavos: 25000, cajaId: "B", fecha: "2026-11-02" });
  aplicar(ag, original, editado);
  const s = saldosPor(ag, "porCaja");
  assert.eq(s.A, 0);
  assert.eq(s.B, -25000);
  assert.eq(ag["2026-10"].n, 0);
  assert.eq(ag["2026-11"].n, 1);
});

test("anular: revierte el efecto y descuenta el conteo", () => {
  const ag = {};
  const m = mov({ tipo: "ingreso", montoCentavos: 77700, cajaId: "A", categoriaId: "i-cobranza" });
  aplicar(ag, null, m);
  aplicar(ag, m, { ...m, estado: "anulado" });
  assert.eq(patrimonio(ag), 0);
  assert.eq(ag["2026-10"].n, 0);
  assert.eq(contarDesdeAgregados(ag, {}), 0);
});

test("agregados incrementales = recalculados desde movimientos", () => {
  const ag = {};
  const lista = [];
  const crear = (m) => { const c = { ...construirMovimiento(m), estado: "activo" }; aplicar(ag, null, c); lista.push(c); return c; };
  crear({ tipo: "apertura", fecha: "2026-09-30", montoCentavos: 900000, cajaId: "A", cuentaId: "bbva" });
  const g = crear({ tipo: "gasto", fecha: "2026-10-03", montoCentavos: 12345, cajaId: "A", cuentaId: "bbva", categoriaId: "g-casa" });
  crear({ tipo: "transferencia", fecha: "2026-10-04", montoCentavos: 350000, cajaId: "A", cuentaId: "bbva", cajaDestinoId: "B", cuentaDestinoId: "nu" });
  aplicar(ag, g, { ...g, estado: "anulado" });
  lista[1] = { ...g, estado: "anulado" };
  const recalculado = agregadosDesdeMovimientos(lista);
  assert.eq(diferenciasAgregados(ag, recalculado), []);
  assert.eq(saldosPor(recalculado, "porCaja"), { A: 550000, B: 350000 });
});

test("verificación: detecta un agregado desincronizado", () => {
  const lista = [mov({ tipo: "apertura", montoCentavos: 1000, cajaId: "A" })];
  const guardado = agregadosDesdeMovimientos(lista);
  guardado["2026-10"].porCaja.A.ape = 999;
  const difs = diferenciasAgregados(guardado, agregadosDesdeMovimientos(lista));
  assert.eq(difs.length, 1);
  assert.eq(difs[0].calculado, 1000);
});

test("BBVA como hub: desglose de una cuenta por caja", () => {
  const ag = {};
  aplicar(ag, null, mov({ tipo: "apertura", montoCentavos: 100000, cajaId: "hd", cuentaId: "bbva" }));
  aplicar(ag, null, mov({ tipo: "apertura", montoCentavos: 50000, cajaId: "reset", cuentaId: "bbva" }));
  const d = desgloseCuenta(ag, "bbva").sort((a, b) => a.cajaId.localeCompare(b.cajaId));
  assert.eq(d, [{ cajaId: "hd", saldo: 100000 }, { cajaId: "reset", saldo: 50000 }]);
  assert.eq(saldosPor(ag, "porCuenta").bbva, 150000);
});

test("conteo desde agregados por caja, cuenta y mes (para el total de la paginación)", () => {
  const ag = {};
  aplicar(ag, null, mov({ tipo: "apertura", montoCentavos: 1, cajaId: "A" }));
  aplicar(ag, null, mov({ tipo: "apertura", montoCentavos: 1, cajaId: "B", cuentaId: "nu", fecha: "2026-11-01" }));
  aplicar(ag, null, mov({ tipo: "transferencia", montoCentavos: 1, cajaId: "A", cajaDestinoId: "B", cuentaDestinoId: "nu" }));
  assert.eq(contarDesdeAgregados(ag, {}), 3);
  assert.eq(contarDesdeAgregados(ag, { cajaId: "B" }), 2);
  assert.eq(contarDesdeAgregados(ag, { cajaId: "A", mes: "2026-10" }), 2);
  assert.eq(contarDesdeAgregados(ag, { cuentaId: "nu" }), 2);
  assert.eq(contarDesdeAgregados(ag, { tipo: "gasto" }), null, "por tipo no se puede: se pide al servidor");
  assert.ok(tieneMovimientos(ag, "porCaja", "A"));
  assert.no(tieneMovimientos(ag, "porCaja", "Z"));
});

test("posible duplicado: mismo movimiento en menos de 10 minutos", () => {
  const ahora = 1_800_000_000_000;
  const nuevo = mov({ tipo: "gasto", montoCentavos: 69000, cajaId: "A", categoriaId: "g-casa" });
  const previo = { ...nuevo, id: "x", ts: ahora - 60_000 };
  assert.ok(buscarDuplicado(nuevo, [previo], { ahora }));
  assert.no(buscarDuplicado(nuevo, [{ ...previo, ts: ahora - 3_600_000 }], { ahora }), "una hora después no es duplicado");
  assert.no(buscarDuplicado(nuevo, [{ ...previo, estado: "anulado" }], { ahora }));
  assert.no(buscarDuplicado(nuevo, [{ ...previo, cajaId: "B" }], { ahora }));
});

test("auditoría: cambiosRelevantes solo lista lo que cambió", () => {
  const a = mov({ tipo: "gasto", montoCentavos: 100, cajaId: "A", categoriaId: "g-casa" });
  const b = { ...a, montoCentavos: 150 };
  assert.eq(cambiosRelevantes(a, b), { montoCentavos: { antes: 100, despues: 150 } });
});

// ---------- Catálogos ----------
test("cajas: nombre obligatorio y sin duplicados", () => {
  assert.no(validarCaja({ nombre: "", tipo: "operativa" }).ok);
  assert.no(validarCaja({ nombre: "hd crédit", tipo: "operativa" }, [{ id: "1", nombre: "HD Credit" }]).ok);
  assert.ok(validarCaja({ id: "1", nombre: "HD Crédit", tipo: "operativa" }, [{ id: "1", nombre: "HD Crédit" }]).ok);
  assert.no(validarCaja({ nombre: "Z", tipo: "rara" }).ok);
});

test("Code-Reset (capital de crecimiento) no cuenta como dinero para gastar", () => {
  assert.no(cuentaParaGasto({ tipo: "crecimiento", disponibleParaGasto: false }));
  assert.ok(cuentaParaGasto({ tipo: "operativa" }));
  assert.no(cuentaParaGasto({ tipo: "operativa", activa: false }));
});

test("categorías: el nombre puede repetirse entre ingreso y gasto, no dentro del mismo tipo", () => {
  const existentes = [{ id: "1", nombre: "Otros", tipo: "gasto" }];
  assert.ok(validarCategoria({ nombre: "Otros", tipo: "ingreso" }, existentes).ok);
  assert.no(validarCategoria({ nombre: "otros", tipo: "gasto" }, existentes).ok);
});

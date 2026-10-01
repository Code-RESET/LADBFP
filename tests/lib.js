// ============================================================
// tests/lib.js — Mini corredor de pruebas sin dependencias.
// Funciona igual en el navegador (tests/index.html) y en Node
// (node tests/run.mjs).
// ============================================================

const pruebas = [];

export function test(nombre, fn) {
  pruebas.push({ nombre, fn });
}

function igualProfundo(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const assert = {
  eq(real, esperado, msg = "") {
    if (!igualProfundo(real, esperado)) {
      throw new Error(`${msg}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
    }
  },
  ok(valor, msg = "se esperaba verdadero") {
    if (!valor) throw new Error(msg);
  },
  no(valor, msg = "se esperaba falso") {
    if (valor) throw new Error(msg);
  },
};

export async function ejecutar(reportar = console.log) {
  let ok = 0;
  const fallas = [];
  for (const p of pruebas) {
    try {
      await p.fn();
      ok++;
      reportar({ nombre: p.nombre, ok: true });
    } catch (err) {
      fallas.push(p.nombre);
      reportar({ nombre: p.nombre, ok: false, error: err.message });
    }
  }
  return { total: pruebas.length, ok, fallas };
}

// ============================================================
// tests/run.mjs — Corre las mismas pruebas en Node (opcional,
// útil para CI): node tests/run.mjs
// Además verifica que el service worker precachee todos los
// archivos de la app (si falta uno, la app no abre offline).
// ============================================================

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, assert, ejecutar } from "./lib.js";
import "./core.test.js";
import "./finanzas.test.js";
import "./plan.test.js";
import "./mes.test.js";
import "./diagnostico.test.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

function archivos(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? archivos(p) : [p];
  });
}

test("service worker: CORE_ASSETS incluye todos los .js, .css y assets de la app", () => {
  const sw = readFileSync(join(raiz, "service-worker.js"), "utf8");
  const listados = new Set([...sw.matchAll(/"\.\/([^"]+)"/g)].map((m) => m[1]));
  const propios = [...archivos(join(raiz, "js")), ...archivos(join(raiz, "css")), ...archivos(join(raiz, "assets"))]
    .map((p) => relative(raiz, p).split("\\").join("/"));
  const faltan = propios.filter((p) => !listados.has(p));
  assert.eq(faltan, [], "archivos sin precachear");
  const inexistentes = [...listados].filter((p) => !existsSync(join(raiz, p)));
  assert.eq(inexistentes, [], "CORE_ASSETS apunta a archivos que no existen");
});

test("versión del SDK de Firebase consistente en todos los archivos", () => {
  const versiones = new Set();
  for (const f of [...archivos(join(raiz, "js")), join(raiz, "service-worker.js")]) {
    for (const m of readFileSync(f, "utf8").matchAll(/firebasejs\/(\d+\.\d+\.\d+)/g)) versiones.add(m[1]);
  }
  assert.eq(versiones.size, 1, `versiones encontradas: ${[...versiones].join(", ")}`);
});

const r = await ejecutar(({ nombre, ok, error }) => {
  console.log(`${ok ? "✓" : "✗"} ${nombre}${error ? `\n${error}` : ""}`);
});
console.log(`\n${r.ok} de ${r.total} pruebas correctas`);
process.exit(r.fallas.length ? 1 : 0);

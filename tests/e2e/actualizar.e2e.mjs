// ============================================================
// tests/e2e/actualizar.e2e.mjs — v2.0.2: actualizar la app.
// Caso de Angel en la computadora: la versión nueva se instaló sola
// (service worker nuevo), pero la pantalla seguía con los archivos de
// antes, y «Actualizar la app» decía «Ya tienes la versión más reciente».
// Esta prueba levanta su propio servidor con una copia de la app cuyos
// archivos parecen viejos (Last-Modified de hace meses: el navegador
// los guarda en su caché HTTP) y no necesita emuladores:
//  1) instala la app (service worker activo);
//  2) publica una «versión nueva» (CACHE_VERSION y un archivo cambiado);
//  3) la versión nueva se instala sola: su caché debe tener el archivo
//     NUEVO (no la copia vieja de la caché HTTP);
//  4) «Actualizar la app» recarga la pantalla (no «al día»), y después
//     la pantalla usa el archivo nuevo.
//   FIREBASE_SDK_DIR=… node tests/e2e/actualizar.e2e.mjs
// ============================================================
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, statSync, readdirSync, utimesSync, rmSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const SDK_DIR = process.env.FIREBASE_SDK_DIR;
const raiz = join(dirname(fileURLToPath(import.meta.url)), "../..");
let ok = 0; const fallas = [];
async function paso(nombre, fn) {
  try { await fn(); ok++; console.log(`✓ ${nombre}`); }
  catch (e) { fallas.push(nombre); console.log(`✗ ${nombre}\n  ${e.message.split("\n")[0]}`); }
}
const esperar = (c, m) => { if (!c) throw new Error(m); };

// Copia de la app con fechas de hace meses (el navegador la considera «fresca» en su caché HTTP).
const dir = mkdtempSync(join(tmpdir(), "fr-actualizar-"));
for (const x of ["index.html", "manifest.json", "service-worker.js", "js", "css", "assets"]) cpSync(join(raiz, x), join(dir, x), { recursive: true });
const viejo = new Date("2026-01-01T12:00:00Z");
const envejecer = (p) => { for (const f of readdirSync(p)) { const q = join(p, f); if (statSync(q).isDirectory()) envejecer(q); utimesSync(q, viejo, viejo); } };
envejecer(dir);
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const servidor = createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const archivo = join(dir, ruta === "/" ? "index.html" : ruta);
  try {
    const st = statSync(archivo);
    res.writeHead(200, { "Content-Type": TIPOS[extname(archivo)] || "application/octet-stream", "Last-Modified": st.mtime.toUTCString() });
    res.end(readFileSync(archivo));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const URL_APP = `http://localhost:${servidor.address().port}/index.html?emulador`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ serviceWorkers: "allow" });
if (SDK_DIR) await ctx.route(/www\.gstatic\.com\/firebasejs\/[\d.]+\/(.+\.js)$/, (r) => r.fulfill({ contentType: "text/javascript", body: readFileSync(join(SDK_DIR, r.request().url().split("/").pop())) }));
await ctx.route(/fonts\.|identitytoolkit|securetoken|firestore\.googleapis/, (r) => r.abort());
const page = await ctx.newPage();
const MARCA = "// versión nueva de prueba";
const ARCHIVO = "js/modules/configuracion/simplificar.js";
const cacheTiene = (version) => page.evaluate(async ([v, a]) => (await (await caches.open(v)).match(`./${a}`))?.text() ?? null, [version, ARCHIVO]);

await paso("instalar la app: service worker activo y controlando la pantalla", async () => {
  await page.goto(URL_APP);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  await page.reload(); // ya controlada desde el inicio (como al abrir la app otro día)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  const actual = readFileSync(join(raiz, "service-worker.js"), "utf8").match(/finanzas-reset-v[\d.]+/)[0];
  esperar((await cacheTiene(actual))?.includes("abrirSimplificar"), "la caché no tiene la app");
});

await paso("versión nueva publicada: se instala sola y su caché guarda el archivo NUEVO (no la copia vieja)", async () => {
  await page.evaluate(() => { window.__antes = true; });
  writeFileSync(join(dir, ARCHIVO), `${readFileSync(join(dir, ARCHIVO), "utf8")}\n${MARCA}\n`);
  const sw = join(dir, "service-worker.js");
  writeFileSync(sw, readFileSync(sw, "utf8").replace(/finanzas-reset-v[\d.]+/, "finanzas-reset-v9.9.9"));
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL && caches.has("finanzas-reset-v9.9.9"), null, { timeout: 30000 });
  await page.waitForSelector(".toast", { hasText: "Hay una versión nueva" });
  const copia = await cacheTiene("finanzas-reset-v9.9.9");
  esperar(copia?.includes(MARCA), "la caché nueva guardó la copia vieja del archivo");
  esperar(await page.evaluate(() => window.__antes === true), "la pantalla se recargó sola (debía ofrecerlo)");
});

await paso("«Actualizar la app» recarga y la pantalla usa la versión nueva (antes decía «al día»)", async () => {
  const r = await page.evaluate(async () => (await import("/js/services/actualizacion.js")).buscarActualizacion());
  esperar(r === "actualizando", `devolvió «${r}»`);
  await page.waitForFunction(() => window.__antes === undefined, null, { timeout: 15000 });
  const usa = await page.evaluate(async (a) => (await (await fetch(`/${a}`)).text()), ARCHIVO);
  esperar(usa.includes(MARCA), "después de recargar sigue el archivo viejo");
});

await browser.close();
servidor.close();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${ok} de ${ok + fallas.length} pasos correctos`);
process.exit(fallas.length ? 1 : 0);

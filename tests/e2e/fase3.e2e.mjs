// ============================================================
// tests/e2e/fase3.e2e.mjs — Fase 3, entrega 1: Metas de ahorro y
// Respaldo. Dev: emuladores + servidor local (ver e2e.mjs).
//   Meta $300,000 a $20,000/mes → 15 aportaciones, ¿te alcanza?,
//   aportar con ☐ en Mi mes, aportar/sacar desde Metas, y
//   respaldo descargado y restaurado en una cuenta vacía con
//   los mismos saldos.
// ============================================================
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const URL_APP = process.env.E2E_URL || "http://localhost:5178/?emulador&nosw";
const SDK_DIR = process.env.FIREBASE_SDK_DIR;
const SHOTS = process.env.E2E_SHOTS || "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

let ok = 0; const fallas = [];
async function paso(nombre, fn) {
  try { await fn(); ok++; console.log(`✓ ${nombre}`); }
  catch (e) { fallas.push(nombre); console.log(`✗ ${nombre}\n  ${e.message.split("\n")[0]}`); }
}
const esperar = (c, m) => { if (!c) throw new Error(m); };
const hoyMx = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
const DIA = Math.min(28, Number(hoyMx.slice(8)));
const mesAntes = (n) => { const [a, m] = hoyMx.split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 - n, 10)); return d.toISOString().slice(0, 7); };

async function crearUsuario(email) {
  await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "secreto123", returnSecureToken: true }),
  }).catch(() => {});
}
await crearUsuario("metas@code-reset.mx");
await crearUsuario("vacia@code-reset.mx");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Mexico_City", acceptDownloads: true });
if (SDK_DIR) await ctx.route(/www\.gstatic\.com\/firebasejs\/[\d.]+\/(.+\.js)$/, (r) => r.fulfill({ contentType: "text/javascript", body: readFileSync(join(SDK_DIR, r.request().url().split("/").pop())) }));
await ctx.route(/fonts\./, (r) => r.fulfill({ contentType: "text/css", body: "" }));
const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
const texto = (sel) => page.locator(sel).first().innerText();
async function hojaLista() { await page.waitForSelector(".capa--visible"); await page.waitForTimeout(300); }
async function sinHojas() { await page.waitForFunction(() => !document.querySelector(".capa")); }
const ir = (ruta) => page.goto(URL_APP.replace(/#.*/, "") + `#/${ruta}`);
const tarjeta = () => texto('.meta:has-text("Remodelación")');
const saldos = () => page.evaluate(async () => {
  const { getState } = await import("/js/core/state.js");
  const { saldosPor } = await import("/js/domain/saldos.js");
  const s = getState();
  const por = saldosPor(s.agregados, "porCaja");
  return Object.fromEntries(s.cajas.map((c) => [c.nombre, por[c.id] || 0]));
});
async function entrar(email) {
  await page.goto(URL_APP);
  await page.fill("#login-email", email); await page.fill("#login-password", "secreto123"); await page.click("#login-btn");
}

await entrar("metas@code-reset.mx");

await paso("preparación: cajas, saldo inicial y 3 meses de historia en HD Crédit", async () => {
  await page.click('[data-accion="sembrar"]', { timeout: 15000 });
  await page.waitForSelector(".form-saldos");
  await page.waitForFunction(() => document.querySelectorAll(".form-saldos select option").length > 5);
  await page.fill('input[name="monto-hd-credit"]', "50000");
  await page.click('.form-saldos button[type="submit"]');
  await page.waitForSelector(".hero");
  // HD Crédit: entran $30,000 y salen $18,000 cada mes → le sobran $12,000
  await page.evaluate(async (meses) => {
    const { movimientosRepo } = await import("/js/data/movimientosRepo.js");
    const { getState } = await import("/js/core/state.js");
    const uid = getState().user.uid;
    for (const m of meses) {
      movimientosRepo.crear(uid, { tipo: "ingreso", fecha: `${m}-05`, montoCentavos: 3000000, cajaId: "hd-credit", cuentaId: "bbva-hd", categoriaId: "in-cobranza", nota: "Cobranza" });
      movimientosRepo.crear(uid, { tipo: "gasto", fecha: `${m}-12`, montoCentavos: 1800000, cajaId: "hd-credit", cuentaId: "bbva-hd", categoriaId: "ga-negocio", nota: "Gastos negocio" });
    }
    const id = movimientosRepo.crear(uid, { tipo: "gasto", fecha: `${meses[2]}-20`, montoCentavos: 99900, cajaId: "hd-credit", cuentaId: "bbva-hd", categoriaId: "ga-otros", nota: "Duplicado" });
    const { construirMovimiento } = await import("/js/domain/movimientos.js");
    movimientosRepo.anular(uid, { id, ...construirMovimiento({ tipo: "gasto", fecha: `${meses[2]}-20`, montoCentavos: 99900, cajaId: "hd-credit", cuentaId: "bbva-hd", categoriaId: "ga-otros", nota: "Duplicado" }) }, "Lo registré dos veces");
  }, [mesAntes(3), mesAntes(2), mesAntes(1)]);
  await page.waitForFunction(() => document.querySelector("#sync-estado")?.hidden !== false, null, { timeout: 15000 });
});

await paso("Metas: vacío con ejemplo; crear Remodelación $300,000 a $20,000/mes con caja nueva", async () => {
  await page.click('.tabbar a[href="#/mas"]');
  await page.click('#app-content a[href="#/metas"]');
  await page.waitForSelector('[data-accion="sugerencia-meta"]');
  await page.click('[data-accion="sugerencia-meta"]');
  await hojaLista();
  esperar((await page.locator('.capa input[name="nombre"]').inputValue()) === "Remodelación", "sugerencia sin nombre");
  await page.fill('.capa input[name="dia"]', String(DIA));
  await page.click('.capa .chip:has(input[name="cajaOrigenId"]):has-text("HD Crédit")');
  esperar(await page.locator('.capa input[name="nombreCaja"]').isVisible(), "debería pedir el nombre de la caja nueva");
  esperar((await page.locator('.capa input[name="nombreCaja"]').inputValue()) === "Ahorro Remodelación", "nombre de caja sugerido");
  await page.click('.capa .chip:has(input[name="bancoCaja"]):has-text("Nu")');
  await page.screenshot({ path: `${SHOTS}/f3-nueva-meta.png` });
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector('.meta:has-text("Remodelación")');
  const t = await tarjeta();
  esperar(t.includes("$0 de $300,000") && t.includes("Te faltan $300,000") && t.includes("15 aportaciones de $20,000 cada mes"), t);
  esperar(t.includes("No alcanza") && t.includes("le sobran $12,000 al mes") && t.includes("pide $20,000"), t);
  esperar(t.includes("Terminas en"), t);
  await page.screenshot({ path: `${SHOTS}/f3-metas.png`, fullPage: true });
});

await paso("Mi mes: Ahorro ☐ → ☑ pasa $20,000 a la caja de la meta (no cuenta como gasto)", async () => {
  await ir("dashboard");
  await page.waitForSelector("#seccion-ahorro");
  const antes = await saldos();
  const quedan = await texto(".hero__monto");
  const fila = page.locator('#seccion-ahorro .fila--hoja:has-text("Remodelación")');
  esperar((await fila.innerText()).includes("HD Crédit → Ahorro Remodelación"), await fila.innerText());
  await fila.locator("button.casilla").click();
  await page.waitForSelector('#seccion-ahorro button.casilla[aria-checked="true"]');
  await page.waitForFunction((n) => document.querySelector(".seccion:has(.total-cajas)")?.innerText.includes("Ahorro Remodelación") && true, null);
  await page.waitForTimeout(500);
  const despues = await saldos();
  esperar(despues["HD Crédit"] === antes["HD Crédit"] - 2000000 && despues["Ahorro Remodelación"] === 2000000, JSON.stringify(despues));
  esperar((await texto(".hero__monto")) === quedan, "Te quedan no debe cambiar por ahorrar");
  await page.screenshot({ path: `${SHOTS}/f3-mi-mes-ahorro.png`, fullPage: true });
});

await paso("Metas: avance 6% y 14 aportaciones; Aportar $10,000 y sacar $5,000", async () => {
  await ir("metas");
  await page.waitForFunction(() => document.querySelector(".meta")?.innerText.includes("$20,000 de $300,000"));
  esperar((await tarjeta()).includes("6%") && (await tarjeta()).includes("14 aportaciones"), await tarjeta());
  await page.click('[data-aportar]');
  await hojaLista();
  await page.fill('.capa input[name="monto"]', "10000");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForFunction(() => document.querySelector(".meta")?.innerText.includes("$30,000 de $300,000"));
  await page.click('[data-retirar]');
  await hojaLista();
  await page.fill('.capa input[name="monto"]', "5000");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForFunction(() => document.querySelector(".meta")?.innerText.includes("$25,000 de $300,000"));
});

await paso("editar la meta a $10,000 al mes → «Te alcanza»", async () => {
  await page.click('[data-editar]');
  await hojaLista();
  await page.fill('.capa input[name="aportacion"]', "10000");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForFunction(() => document.querySelector(".meta")?.innerText.includes("Te alcanza"));
  esperar((await tarjeta()).includes("28 aportaciones de $10,000"), await tarjeta()); // faltan $275,000
});

let respaldo = null;
let saldosOriginales = null;
await paso("Respaldo: descargar un archivo con todo (cajas, metas, movimientos, anulados)", async () => {
  saldosOriginales = await saldos();
  await page.click('.tabbar a[href="#/mas"]');
  await page.click('#app-content [data-accion="respaldo"]');
  await hojaLista();
  const [descarga] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click('[data-respaldo="descargar"]')]);
  const ruta = join(SHOTS, descarga.suggestedFilename());
  await descarga.saveAs(ruta);
  esperar(/^Finanzas_Reset_respaldo_\d{4}-\d{2}-\d{2}\.json$/.test(descarga.suggestedFilename()), descarga.suggestedFilename());
  respaldo = JSON.parse(readFileSync(ruta, "utf8"));
  esperar(respaldo.app === "finanzas-reset" && respaldo.conteos.metas === 1 && respaldo.conteos.cajas === 6, JSON.stringify(respaldo.conteos));
  esperar(respaldo.data.movimientos.some((m) => m.estado === "anulado" && m.anulacion?.motivo === "Lo registré dos veces"), "falta el anulado");
  esperar(respaldo.data.movimientos.every((m) => Array.isArray(m.historial) && m.historial.length >= 1), "falta historial");
  await page.waitForSelector(".respaldo .aviso--ok");
  await page.screenshot({ path: `${SHOTS}/f3-respaldo.png` });
  await page.keyboard.press("Escape");
  await sinHojas();
});

await paso("Restaurar el respaldo en una cuenta vacía: mismos saldos, metas y movimientos", async () => {
  await page.click('.tabbar a[href="#/mas"]');
  await page.click('#app-content [data-accion="cerrar-sesion"]');
  await hojaLista();
  await page.click('.capa button[type="submit"]');
  await page.waitForSelector("#login-email");
  await entrar("vacia@code-reset.mx");
  await page.waitForSelector('[data-accion="sembrar"]', { timeout: 15000 });
  await page.click('#app-content [data-accion="respaldo"]');
  await hojaLista();
  await page.setInputFiles('.respaldo input[name="archivo"]', { name: "respaldo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(respaldo)) });
  await page.waitForSelector('[data-respaldo="restaurar"]', { timeout: 20000 });
  const previa = await texto(".respaldo__previa");
  esperar(previa.includes("6 cajas") && previa.includes("1 meta") && previa.includes(`${respaldo.conteos.movimientos} movimientos`), previa);
  await page.screenshot({ path: `${SHOTS}/f3-restaurar.png` });
  await page.click('[data-respaldo="restaurar"]');
  await page.waitForSelector(".respaldo .aviso--ok", { timeout: 60000 });
  await page.keyboard.press("Escape");
  await sinHojas();
  await ir("dashboard");
  await page.waitForSelector(".hero", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector(".seccion:has(.total-cajas)")?.innerText.includes("Ahorro Remodelación"), null, { timeout: 20000 });
  const restaurados = await saldos();
  esperar(JSON.stringify(restaurados) === JSON.stringify(saldosOriginales), `${JSON.stringify(restaurados)} ≠ ${JSON.stringify(saldosOriginales)}`);
  const anulados = await page.evaluate(async () => {
    const fs = await import("/js/data/firestore.js");
    const { getState } = await import("/js/core/state.js");
    const snap = await fs.getDocs(fs.col(getState().user.uid, "movimientos"));
    return snap.docs.map((d) => d.data()).filter((m) => m.estado === "anulado").map((m) => m.anulacion?.motivo);
  });
  esperar(JSON.stringify(anulados) === JSON.stringify(["Lo registré dos veces"]), JSON.stringify(anulados));
  await ir("metas");
  await page.waitForFunction(() => document.querySelector(".meta")?.innerText.includes("$25,000 de $300,000"));
});

await paso("restaurar el mismo respaldo otra vez no duplica nada", async () => {
  await page.click('.tabbar a[href="#/mas"]');
  await page.click('#app-content [data-accion="respaldo"]');
  await hojaLista();
  await page.setInputFiles('.respaldo input[name="archivo"]', { name: "respaldo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(respaldo)) });
  await page.waitForFunction(() => document.querySelector(".respaldo__estado")?.innerText.includes("Ya tienes todo"), null, { timeout: 20000 });
  await page.keyboard.press("Escape");
  await sinHojas();
  esperar(JSON.stringify(await saldos()) === JSON.stringify(saldosOriginales), "los saldos cambiaron");
});

await paso("un archivo que no es respaldo se rechaza con un mensaje claro", async () => {
  await page.click('#app-content [data-accion="respaldo"]');
  await hojaLista();
  await page.setInputFiles('.respaldo input[name="archivo"]', { name: "otro.json", mimeType: "application/json", buffer: Buffer.from('{"hola":1}') });
  await page.waitForFunction(() => document.querySelector(".respaldo__estado")?.innerText.includes("no es un respaldo"));
  await page.keyboard.press("Escape");
  await sinHojas();
});

await paso("modo oscuro: Metas", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await ir("metas");
  await page.waitForSelector(".meta");
  await page.screenshot({ path: `${SHOTS}/f3-metas-oscuro.png`, fullPage: true });
});

await paso("sin errores de JavaScript", async () => esperar(errores.length === 0, errores.join(" | ")));
await browser.close();
console.log(`\n${ok} de ${ok + fallas.length} pasos correctos`);
process.exit(fallas.length ? 1 : 0);

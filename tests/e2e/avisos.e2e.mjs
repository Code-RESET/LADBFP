// ============================================================
// tests/e2e/avisos.e2e.mjs — v1.11.0: aviso grande «Por pagar».
// Dev: emuladores + servidor local (ver e2e.mjs).
//   Un gasto fijo vencido ayer, una tarjeta tipo Cimaco (corte y
//   pago el mismo día) que no se pagó, algo que vence en 2 días y
//   algo en 6: el aviso grande en rojo hasta arriba de Mi mes, el
//   globo «⚠ N por pagar» en todas las pantallas, «Ya lo pagué»,
//   «Pagar» la tarjeta, y el archivo de calendario con alarmas.
// ============================================================
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { corteAnterior, fechaLimiteDe } from "../../js/domain/tarjetas.js";
import { sumarDias } from "../../js/core/dates.js";

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
const HOY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
const dia = (f) => Number(f.slice(8));
const primeroDe = (f) => `${f.slice(0, 7)}-01`;

// Tarjeta como Cimaco: corte y pago el mismo día (hace 2 días); la compra fue antes del corte anterior y no se pagó.
const CREDITO = { limiteCentavos: 2500000, diaCorte: dia(sumarDias(HOY, -2)), diaLimite: dia(sumarDias(HOY, -2)) };
const CORTE_PREVIO = corteAnterior(CREDITO, sumarDias(corteAnterior(CREDITO, HOY), -1));
const VENCIO = fechaLimiteDe(CORTE_PREVIO, CREDITO);
const COMPRA = sumarDias(CORTE_PREVIO, -3);

await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "avisos@code-reset.mx", password: "secreto123", returnSecureToken: true }),
}).catch(() => {});

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
async function esperarTexto(sel, fragmento, timeout = 10000) {
  await page.waitForFunction(([s, f]) => document.querySelector(s)?.innerText.includes(f), [sel, fragmento], { timeout })
    .catch(async () => { throw new Error(`«${fragmento}» no aparece en ${sel}: ${await page.locator(sel).first().innerText().catch(() => "(no existe)")}`); });
}
const renglones = () => page.locator(".por-pagar__item").evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));

await page.goto(URL_APP);
await page.fill("#login-email", "avisos@code-reset.mx"); await page.fill("#login-password", "secreto123"); await page.click("#login-btn");

await paso("preparación: Luz venció ayer, Internet vence en 2 días, Colegiatura en 6 y Cimaco sin pagar", async () => {
  await page.click('[data-accion="sembrar"]', { timeout: 15000 });
  await page.waitForSelector(".form-saldos");
  await page.waitForFunction(() => document.querySelectorAll(".form-saldos select option").length > 5);
  await page.fill('input[name="monto-sueldo-personal"]', "20000");
  await page.click('.form-saldos button[type="submit"]');
  await page.waitForSelector(".hero");
  esperar(!(await page.locator(".por-pagar").count()), "sin pagos pendientes no hay aviso");
  esperar(await page.locator("#aviso-pagos").isHidden(), "sin pagos pendientes no hay globo");
  const fijos = [["luz", "Luz", sumarDias(HOY, -1), 85000], ["internet", "Internet", sumarDias(HOY, 2), 59900], ["cole", "Colegiatura", sumarDias(HOY, 6), 350000]];
  await page.evaluate(async ({ fijos, credito, compra }) => {
    const { getState } = await import("/js/core/state.js");
    const { obligacionesRepo } = await import("/js/data/planRepo.js");
    const { cuentasRepo } = await import("/js/data/catalogosRepo.js");
    const { movimientosRepo } = await import("/js/data/movimientosRepo.js");
    const uid = getState().user.uid;
    for (const [id, nombre, fecha, monto] of fijos) {
      obligacionesRepo.guardar(uid, { id, nombre, montoCentavos: monto, variable: false, regla: { frecuencia: "mensual", diaMes: Number(fecha.slice(8)), desde: `${fecha.slice(0, 7)}-01` },
        cajaId: "sueldo-personal", cuentaId: "nu", categoriaId: "ga-servicios", activa: true });
    }
    cuentasRepo.guardar(uid, { id: "cimaco", nombre: "Cimaco", institucion: "Cimaco", tipo: "credito", credito, activa: true, orden: 9 });
    movimientosRepo.crear(uid, { tipo: "gasto", fecha: compra, montoCentavos: 289227, cajaId: "sueldo-personal", cuentaId: "cimaco", categoriaId: "ga-casa", nota: "Compras Cimaco" });
  }, { fijos: fijos.map(([id, n, f, m]) => [id, n, f, m]), credito: CREDITO, compra: COMPRA });
  void primeroDe;
});

await paso("Mi mes: aviso ROJO hasta arriba con lo vencido primero, luego lo que vence pronto", async () => {
  await page.waitForSelector(".por-pagar.por-pagar--rojo");
  // La tarjeta se calcula aparte (lee sus movimientos): esperar a que aparezca.
  await page.waitForFunction(() => document.querySelectorAll(".por-pagar__item").length === 4, null, { timeout: 15000 });
  esperar(await page.evaluate(() => document.querySelector("#app-content").firstElementChild?.matches(".por-pagar")), "el aviso debe ser lo primero de Mi mes");
  esperar((await texto(".por-pagar__titulo")) === "¡Tienes 2 pagos vencidos!", await texto(".por-pagar__titulo"));
  const r = await renglones();
  esperar(r.length === 4, r.join(" | "));
  esperar(r[0].startsWith("Tarjeta Cimaco") && r[0].includes("$2,892.27") && r[0].includes("Pagar"), r[0]);
  esperar(r[0].toLowerCase().includes(VENCIO === sumarDias(HOY, -1) ? "se venció ayer" : "se venció hace"), r[0]);
  esperar(r[1].startsWith("Luz") && r[1].toLowerCase().includes("se venció ayer") && r[1].includes("$850.00") && r[1].includes("Ya lo pagué"), r[1]);
  esperar(r[2].startsWith("Internet") && r[2].includes("$599.00"), r[2]);
  esperar(r[3].startsWith("Colegiatura") && r[3].includes("$3,500.00"), r[3]);
  esperar((await texto(".por-pagar__sub")).includes("4 pagos · $7,841.27 en total"), await texto(".por-pagar__sub"));
  // El consejo ya no repite los pagos.
  esperar(!(await page.locator(".consejo").filter({ hasText: /vencid|Paga tu tarjeta/ }).count()), "el consejo no debe repetir los pagos");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/avisos-rojo.png` });
});

await paso("globo arriba en todas las pantallas: «⚠ 3 por pagar» (vencidos y lo de 3 días); lleva a Mi mes", async () => {
  await page.waitForFunction(() => document.querySelector("#aviso-pagos")?.textContent === "⚠ 3 por pagar");
  esperar(await page.locator("#aviso-pagos.aviso-pagos--rojo").isVisible(), "globo rojo");
  await ir("mas");
  await page.waitForSelector('#app-content a[href="#/tarjetas"]');
  esperar(await page.locator("#aviso-pagos").isVisible(), "el globo también en Más");
  await page.click("#aviso-pagos", { force: true }); // late (animación): Playwright no lo ve "quieto"
  await page.waitForSelector(".por-pagar");
  esperar(await page.evaluate(() => location.hash.startsWith("#/dashboard")), "debe ir a Mi mes");
});

await paso("«Ya lo pagué» en Luz: se marca ☑ y sale del aviso", async () => {
  await page.locator('.por-pagar__item:has-text("Luz") .por-pagar__boton').click();
  await page.waitForSelector(".toast", { hasText: "Luz pagado" });
  await page.waitForFunction(() => ![...document.querySelectorAll(".por-pagar__item")].some((e) => e.innerText.includes("Luz")));
  esperar((await texto(".por-pagar__titulo")) === "¡Tienes un pago vencido!", await texto(".por-pagar__titulo"));
  await page.waitForFunction(() => document.querySelector("#aviso-pagos")?.textContent === "⚠ 2 por pagar");
});

await paso("«Pagar» Cimaco: se paga lo vencido y el aviso pasa a naranja (solo lo que viene)", async () => {
  await page.locator('.por-pagar__item:has-text("Cimaco") .por-pagar__boton').click();
  await hojaLista();
  esperar((await texto(".capa__titulo")) === "Pagar Cimaco", await texto(".capa__titulo"));
  esperar((await page.locator('.capa input[name="monto"]').inputValue()) === "2892.27", "monto sugerido");
  esperar((await texto(".capa")).includes("Venció el"), await texto(".capa"));
  await page.click('.capa .chip:has(input[name="bancoId"]):has-text("Nu")');
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForFunction(() => ![...document.querySelectorAll(".por-pagar__item")].some((e) => e.innerText.includes("Cimaco")));
  await page.waitForSelector(".por-pagar.por-pagar--naranja");
  esperar((await texto(".por-pagar__titulo")) === "Se viene un pago", await texto(".por-pagar__titulo"));
  await page.waitForFunction(() => document.querySelector("#aviso-pagos")?.textContent === "⚠ 1 por pagar");
  esperar(await page.locator("#aviso-pagos.aviso-pagos--naranja").isVisible(), "globo naranja");
  await page.screenshot({ path: `${SHOTS}/avisos-naranja.png` });
});

await paso("«Que mi teléfono me avise»: archivo de calendario con cada pago y sus 2 alarmas", async () => {
  const [descarga] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.click(".por-pagar__calendario")]);
  esperar(descarga.suggestedFilename() === "Finanzas_Reset_pagos.ics", descarga.suggestedFilename());
  const ruta = join(SHOTS, descarga.suggestedFilename());
  await descarga.saveAs(ruta);
  const ics = readFileSync(ruta, "utf8").replace(/\r\n /g, "");
  esperar(ics.startsWith("BEGIN:VCALENDAR") && ics.trim().endsWith("END:VCALENDAR"), "formato");
  for (const t of ["SUMMARY:💸 Pagar Luz · $850.00", "SUMMARY:💸 Pagar Internet · $599.00", "SUMMARY:💸 Pagar Colegiatura · $3\\,500.00", "SUMMARY:💳 Pagar tarjeta Cimaco"]) {
    esperar(ics.includes(t), `falta ${t}`);
  }
  esperar((ics.match(/BEGIN:VEVENT/g) || []).length === 4 && (ics.match(/TRIGGER:-PT15H/g) || []).length === 4 && (ics.match(/TRIGGER:PT9H/g) || []).length === 4, "4 eventos con 2 alarmas");
  await page.waitForSelector(".toast", { hasText: "4 avisos listos" });
});

await paso("Más → Avisos de pago en mi calendario", async () => {
  await ir("mas");
  const [descarga] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.click('#app-content [data-accion="recordatorios"]')]);
  esperar(descarga.suggestedFilename() === "Finanzas_Reset_pagos.ics", descarga.suggestedFilename());
});

await paso("modo oscuro: el aviso se ve igual de fuerte", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await ir("dashboard");
  await page.waitForSelector(".por-pagar");
  await page.screenshot({ path: `${SHOTS}/avisos-oscuro.png` });
});

await paso("sin errores de JavaScript", async () => esperar(errores.length === 0, errores.join(" | ")));
await browser.close();
console.log(`\n${ok} de ${ok + fallas.length} pasos correctos`);
process.exit(fallas.length ? 1 : 0);

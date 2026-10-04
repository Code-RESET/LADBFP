// ============================================================
// tests/e2e/plan.e2e.mjs — Punta a punta de la Fase 2 (dev).
// Mismo arranque que e2e.mjs (emuladores + servidor local).
// Usuario: fase2@code-reset.mx / secreto123 (crearlo antes).
// ============================================================
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const URL_APP = process.env.E2E_URL || "http://localhost:5177/?emulador&nosw";
const SDK_DIR = process.env.FIREBASE_SDK_DIR;
const SHOTS = process.env.E2E_SHOTS || "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

let ok = 0; const fallas = [];
async function paso(nombre, fn) {
  try { await fn(); ok++; console.log(`✓ ${nombre}`); }
  catch (e) { fallas.push(nombre); console.log(`✗ ${nombre}\n  ${e.message.split("\n")[0]}`); }
}
const esperar = (c, m) => { if (!c) throw new Error(m); };

// Día del mes dentro de 5 días (hora de México), para que el pago caiga en el horizonte de 30 días.
const hoyMx = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
const en5 = new Date(`${hoyMx}T12:00:00Z`); en5.setUTCDate(en5.getUTCDate() + 5);
const DIA = Math.min(en5.getUTCDate(), 28);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Mexico_City" });
if (SDK_DIR) await ctx.route(/www\.gstatic\.com\/firebasejs\/[\d.]+\/(.+\.js)$/, (r) => r.fulfill({ contentType: "text/javascript", body: readFileSync(join(SDK_DIR, r.request().url().split("/").pop())) }));
await ctx.route(/fonts\./, (r) => r.fulfill({ contentType: "text/css", body: "" }));
const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
const texto = (sel) => page.locator(sel).first().innerText();
async function hojaLista() { await page.waitForSelector(".capa--visible"); await page.waitForTimeout(300); }
async function sinHojas() { await page.waitForFunction(() => !document.querySelector(".capa")); }

await page.goto(URL_APP);
await page.fill("#login-email", "fase2@code-reset.mx"); await page.fill("#login-password", "secreto123"); await page.click("#login-btn");

await paso("preparación: cajas y saldos iniciales (Reset $20,000 · Sueldo $3,000)", async () => {
  await page.click('[data-accion="sembrar"]', { timeout: 15000 });
  await page.waitForSelector(".form-saldos");
  await page.waitForFunction(() => document.querySelectorAll('.form-saldos select option').length > 5);
  await page.fill('input[name="monto-reset-alarmas"]', "20000");
  await page.fill('input[name="monto-sueldo-personal"]', "3000");
  await page.click('.form-saldos button[type="submit"]');
  await page.waitForSelector(".hero");
  esperar((await texto(".hero__etiqueta")).toLowerCase().startsWith("balance de"), "Inicio muestra el balance del mes");
});

await paso("DÉFICIT: presupuesto semanal sugerido → 🔴 −$521", async () => {
  await page.goto(URL_APP.replace(/#.*/, "") + "#/plan?tab=presupuesto");
  await page.click('[data-sugerencia^="presupuesto:"]');
  await hojaLista();
  esperar((await texto(".resumen-presupuesto")).includes("-$521.00"), await texto(".resumen-presupuesto"));
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector(".tarjeta-presupuesto");
  const t = await texto(".tarjeta-presupuesto");
  esperar(t.includes("Deficitario") && t.includes("-$521.00"), t);
});

await paso("gasto fijo sugerido: Trabajadora $8,000 (variable $3,200–$8,000)", async () => {
  await page.goto(URL_APP.replace(/#.*/, "") + "#/gastos");
  await page.click('[data-sugerencia^="obligacion:0"]');
  await hojaLista();
  await page.fill('.capa input[name="diaVence"]', String(DIA));
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector('.fila--gasto:has-text("Trabajadora")');
  esperar((await texto('.fila--gasto:has-text("Trabajadora")')).includes("$8,000.00"), "monto");
});

await paso("validación: gasto fijo con monto fuera del rango mín/máx se bloquea", async () => {
  await page.click('[data-editar-fijo]');
  await hojaLista();
  await page.fill('.capa input[name="monto"]', "9000");
  await page.click('.capa button[type="submit"]');
  esperar((await texto('.capa [data-error="montoCentavos"]')).includes("entre el mínimo y el máximo"), "sin error");
  await page.keyboard.press("Escape");
  await sinHojas();
});

await paso("DEUDA: Dra. Marcela $30,000 con pagos de $6,000 → 5 pagos", async () => {
  await page.goto(URL_APP.replace(/#.*/, "") + "#/plan?tab=deudas");
  await page.click('[data-sugerencia^="deuda:0"]');
  await hojaLista();
  await page.fill('.capa input[name="saldoInicial"]', "30000");
  await page.fill('.capa input[name="pago"]', "6000");
  await page.fill('.capa input[name="diaMes"]', String(DIA));
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector(".tarjeta-deuda");
  const t = await texto(".tarjeta-deuda");
  esperar(t.includes("$30,000.00") && t.includes("0%") && /Pagos restantes\s*5/.test(t), t);
});

await paso("pagar la deuda desde Plan: saldo $24,000 · 20% · 4 pagos", async () => {
  await page.click('.tarjeta-deuda [data-pagar]');
  await hojaLista();
  esperar((await page.locator('.capa input[name="monto"]').inputValue()) === "6000.00", "monto prellenado");
  esperar((await texto(".capa .aviso")).includes("Pago de deuda"), "aviso de vínculo");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForFunction(() => document.querySelector(".tarjeta-deuda")?.innerText.includes("$24,000.00"));
  const t = await texto(".tarjeta-deuda");
  esperar(t.includes("20%") && /Pagos restantes\s*4/.test(t), t);
  await page.click("[data-historial-deuda]");
  await page.waitForSelector(".capa .lista-datos");
  esperar((await texto(".capa .lista-datos")).includes("$6,000.00"), "historial");
  await page.keyboard.press("Escape");
  await sinHojas();
});

await paso("PUEDES GASTAR (Más → ¿Cuánto puedo gastar?): $14,000 − $8,000 apartado = $6,000 (Reset) + $3,000 (Sueldo) = $9,000", async () => {
  await page.goto(URL_APP.replace(/#.*/, "") + "#/plan");
  await page.waitForSelector(".tabla-plan tfoot");
  const pie = await texto(".tabla-plan tfoot");
  esperar(pie.includes("$17,000.00") && pie.includes("-$8,000.00") && pie.includes("$9,000.00"), pie);
  esperar((await texto(".lista-alertas")).includes("-$521.00"), "aviso de déficit");
  await page.goto(URL_APP.replace(/#.*/, "") + "#/dashboard");
  await page.waitForSelector(".hero");
  esperar((await page.locator('.fila--gasto:has-text("Trabajadora")').count()) === 1, "Trabajadora en 'Falta pagar'");
  await page.screenshot({ path: `${SHOTS}/f2-inicio.png`, fullPage: true });
});

await paso("cobertura de $521 vuelve sostenible el presupuesto y entra al disponible", async () => {
  await page.goto(URL_APP.replace(/#.*/, "") + "#/plan?tab=presupuesto");
  await page.click("[data-editar^='presupuesto:']");
  await hojaLista();
  await page.click('[data-agregar="cobertura"]');
  await page.selectOption('.capa select[name="coberturaCaja"]', "reset-alarmas");
  await page.fill('.capa input[name="coberturaMonto"]', "521");
  esperar((await texto(".resumen-presupuesto")).includes("Sostenible"), "sostenible");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForFunction(() => document.querySelector(".tarjeta-presupuesto")?.innerText.includes("Sostenible"));
});

await paso("Resumen: tabla de disponible, proyección 7/30/90 días y 12 meses", async () => {
  await page.click('.pestana[data-tab="resumen"]');
  await page.waitForSelector(".tabla-plan");
  for (const h of ["7", "90", "365", "30"]) {
    await page.locator(`.segmentado__opcion:has(input[value="${h}"])`).click();
    await page.waitForSelector('[data-grafica="proyeccion"] svg');
  }
  await page.locator('[data-grafica="proyeccion"] .viz-banda').nth(10).hover();
  await page.waitForSelector(".viz-tooltip:not([hidden])");
  await page.screenshot({ path: `${SHOTS}/f2-resumen.png`, fullPage: true });
});

await paso("ingreso esperado sugerido (cobranza quincenal) y registrarlo", async () => {
  await page.goto(URL_APP.replace(/#.*/, "") + "#/ingresos");
  await page.click('[data-sugerencia^="recurrente:1"]');
  await hojaLista();
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector('.fila--evento:has-text("Cobranza HD Crédit")');
  const antes = await page.locator('.fila--evento:has-text("Cobranza HD Crédit")').count();
  await page.locator('.fila--evento:has-text("Cobranza HD Crédit") [data-pagar]').first().click();
  await hojaLista();
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForFunction((n) => document.querySelectorAll('.fila--evento').length >= 0 &&
    [...document.querySelectorAll(".fila--evento")].filter((f) => f.innerText.includes("Cobranza HD Crédit")).length === n - 1, antes);
  await page.screenshot({ path: `${SHOTS}/f2-ingresos.png`, fullPage: true });
});

await paso("capturas: pestañas en oscuro", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(URL_APP.replace(/#.*/, "") + "#/plan");
  for (const t of ["resumen", "presupuesto", "deudas"]) {
    await page.click(`.pestana[data-tab="${t}"]`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/f2-${t}-oscuro.png`, fullPage: true });
  }
  await page.emulateMedia({ colorScheme: "light" });
});

await paso("sin errores de JavaScript", async () => esperar(errores.length === 0, errores.join(" | ")));
await browser.close();
console.log(`\n${ok} de ${ok + fallas.length} pasos correctos`);
process.exit(fallas.length ? 1 : 0);

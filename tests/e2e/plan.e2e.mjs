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
// La cuota de la deuda sale en Mi mes solo si dentro de 5 días sigue siendo este mes.
const MISMO_MES = en5.toISOString().slice(0, 7) === hoyMx.slice(0, 7);

// Usuario de prueba en el emulador de Auth (si ya existe, no pasa nada).
await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "fase2@code-reset.mx", password: "secreto123", returnSecureToken: true }),
}).catch(() => {});

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
  esperar((await page.locator(".hero__etiqueta").textContent()).trim().startsWith("Te quedan"), "Mi mes muestra lo que queda del mes");
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

/** v1.3: registro rápido de Mi mes (nombre + monto + caja + "se repite cada mes el día N"). */
async function registrar({ boton = ".tabbar__nuevo", tipo, nombre, monto, caja, dia }) {
  await page.click(boton);
  await hojaLista();
  if (tipo) await page.click(`.capa .segmentado__opcion:has(input[value="${tipo}"])`);
  await page.fill('.capa input[name="nombre"]', nombre);
  await page.fill('.capa input[name="monto"]', monto);
  if (caja) await page.click(`.capa .chip:has-text("${caja}")`);
  if (dia) { await page.check('.capa input[name="repite"]'); await page.fill('.capa input[name="dia"]', String(dia)); }
  await page.click('.capa button[type="submit"]');
  await sinHojas();
}

await paso("gasto fijo desde Mi mes: Trabajadora $8,000 (Reset Alarmas)", async () => {
  await page.goto(URL_APP.replace(/#.*/, "") + "#/dashboard");
  await page.waitForSelector(".hero");
  await registrar({ nombre: "Trabajadora", monto: "8000", caja: "Reset Alarmas", dia: DIA });
  await page.waitForSelector('.fila--hoja:has-text("Trabajadora")');
  esperar((await texto('.fila--hoja:has-text("Trabajadora")')).includes("$8,000.00"), "monto");
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
  esperar((await page.locator('.fila--hoja:has-text("Trabajadora") button.casilla[aria-checked="false"]').count()) === 1, "Trabajadora pendiente en Mi mes");
  if (MISMO_MES) esperar((await page.locator('.fila--hoja:has-text("Dra. Marcela") button.casilla[aria-checked="true"]').count()) >= 1, "pago de la deuda ☑ en Mi mes");
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

await paso("ingreso fijo (cobranza) desde Mi mes y marcarlo recibido", async () => {
  await page.goto(URL_APP.replace(/#.*/, "") + "#/dashboard");
  await page.waitForSelector(".hero");
  await registrar({ tipo: "ingreso", nombre: "Cobranza HD Crédit", monto: "5000", caja: "HD Crédit", dia: DIA });
  await page.locator('.fila--hoja:has-text("Cobranza HD Crédit") button.casilla').click();
  await page.waitForSelector('.fila--hoja:has-text("Cobranza HD Crédit") button.casilla[aria-checked="true"]');
  await page.waitForFunction(() => document.querySelector(".hero__linea")?.innerText.includes("$5,000.00"));
  await page.screenshot({ path: `${SHOTS}/f2-mi-mes.png`, fullPage: true });
});

await paso("un renglón de deuda en Mi mes abre su formulario completo", async () => {
  if (!MISMO_MES) return;
  await page.locator('.fila--hoja:has-text("Dra. Marcela") [data-abrir]').first().click();
  await hojaLista();
  await page.waitForSelector('.capa input[name="saldoInicial"]');
  await page.keyboard.press("Escape");
  await sinHojas();
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

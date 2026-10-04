// ============================================================
// tests/e2e/simple.e2e.mjs — Modo simple basado en la plantilla
// de Excel del usuario (Gastos del Mes · Ingresos · Balance).
// Dev: emuladores + servidor local; usuario simple@code-reset.mx.
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
const DIA_HOY = Number(hoyMx.slice(8));
const diaAntes = Math.max(1, DIA_HOY - 1);              // ya vencido (si hoy no es día 1)
const diaDespues = Math.min(28, DIA_HOY + 3);            // pendiente

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
const ir = (ruta) => page.goto(URL_APP.replace(/#.*/, "") + `#/${ruta}`);

async function gastoFijo({ nombre, monto, dia, categoria, forma }) {
  await page.click('[data-accion="nuevo-fijo"]');
  await hojaLista();
  await page.fill('.capa input[name="nombre"]', nombre);
  await page.fill('.capa input[name="monto"]', monto);
  await page.fill('.capa input[name="diaVence"]', String(dia));
  await page.selectOption('.capa select[name="categoriaId"]', { label: categoria });
  await page.selectOption('.capa select[name="formaPago"]', forma);
  await page.click('.capa button[type="submit"]');
  await sinHojas();
}

await page.goto(URL_APP);
await page.fill("#login-email", "simple@code-reset.mx"); await page.fill("#login-password", "secreto123"); await page.click("#login-btn");

await paso("preparación: cajas y saldo inicial", async () => {
  await page.click('[data-accion="sembrar"]', { timeout: 15000 });
  await page.waitForSelector(".form-saldos");
  await page.waitForFunction(() => document.querySelectorAll(".form-saldos select option").length > 5);
  await page.fill('input[name="monto-personal-imss"]', "5000");
  await page.click('.form-saldos button[type="submit"]');
  await page.waitForSelector(".hero");
});

await paso("navegación simple: Inicio · Gastos · ＋ · Ingresos · Más", async () => {
  const t = (await texto(".tabbar")).replace(/\s+/g, " ").trim();
  esperar(t === "Inicio Gastos Ingresos Más", t);
});

await paso("Inicio = Balance del mes (sin gastos ni ingresos: $0)", async () => {
  esperar((await texto(".hero__etiqueta")).toLowerCase().startsWith("balance de"), await texto(".hero__etiqueta"));
  esperar((await texto(".hero__monto")) === "$0.00", await texto(".hero__monto"));
});

await paso("Gastos del Mes: agregar 3 gastos fijos como en la plantilla", async () => {
  await ir("gastos");
  await page.waitForSelector(".selector-mes");
  await gastoFijo({ nombre: "Hipoteca casa (Santander)", monto: "1000", dia: diaAntes, categoria: "Vivienda (hipoteca, renta, créditos)", forma: "Domiciliado" });
  await gastoFijo({ nombre: "Internet casa (Starlink)", monto: "600", dia: diaDespues, categoria: "Servicios", forma: "Transferencia" });
  await gastoFijo({ nombre: "Tarjeta Crédito (BBVA)", monto: "2300", dia: diaDespues, categoria: "Pago de deudas", forma: "Tarjeta" });
  await page.waitForFunction(() => document.querySelectorAll(".fila--gasto").length === 3);
  const filas = await page.locator(".fila--gasto").allInnerTexts();
  esperar(filas[0].includes("Hipoteca") && filas[0].includes(String(diaAntes)), "ordenado por día de vencimiento");
  esperar(filas.some((f) => f.includes("Domiciliado")), "forma de pago visible");
  if (DIA_HOY > 1) esperar(filas[0].includes("Vencido"), `estado vencido: ${filas[0]}`);
  esperar((await texto(".resumen-mes")).includes("$3,900.00"), await texto(".resumen-mes"));
});

await paso("Pagar un gasto fijo: queda ✓ Pagado y pasa de Pendiente a Pagado", async () => {
  await page.locator('.fila--gasto:has-text("Hipoteca") [data-pagar-fijo]').click();
  await hojaLista();
  esperar((await page.locator('.capa input[name="monto"]').inputValue()) === "1000.00", "monto prellenado");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector('.fila--gasto:has-text("Hipoteca") .badge--ok');
  const r = await texto(".resumen-mes");
  esperar(r.includes("Total pagado") && r.includes("$1,000.00") && r.includes("$2,900.00"), r);
  esperar((await texto(".resumen-mes")).includes("1 de 3 gastos fijos pagados"), "progreso");
});

await paso("Otros gastos del mes: gasto de una vez con forma de pago", async () => {
  await page.click('[data-accion="nuevo-gasto"]');
  await hojaLista();
  await page.fill('.capa input[name="monto"]', "350");
  await page.selectOption('.capa select[name="categoriaId"]', { label: "Comida" });
  await page.selectOption('.capa select[name="formaPago"]', "Efectivo");
  esperar(!(await page.locator('.capa select[name="cuentaId"]').isVisible()), "la cuenta va escondida en Más detalles");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForFunction(() => [...document.querySelectorAll(".fila-mov")].some((f) => f.innerText.includes("Comida")));
});

await paso("Ingresos: registrar 2 ingresos (honorarios y nómina)", async () => {
  await ir("ingresos");
  for (const [monto, cat] of [["15000", "Honorarios"], ["3000", "Sueldo"]]) {
    await page.click('[data-accion="nuevo-ingreso"]');
    await hojaLista();
    await page.fill('.capa input[name="monto"]', monto);
    await page.selectOption('.capa select[name="categoriaId"]', { label: cat });
    await page.selectOption('.capa select[name="formaPago"]', "Depósito");
    await page.click('.capa button[type="submit"]');
    await sinHojas();
  }
  await page.waitForFunction(() => document.querySelector(".resumen-mes")?.innerText.includes("$18,000.00"));
  esperar((await page.locator(".fila-mov").count()) === 2, "2 recibidos");
});

await paso("BALANCE (como la hoja 3): $18,000 − ($1,350 pagado + $2,900 pendiente) = $13,750", async () => {
  await ir("dashboard");
  await page.waitForSelector(".hero");
  esperar((await texto(".hero__monto")) === "$13,750.00", await texto(".hero__monto"));
  const t = await texto(".tres-cifras");
  esperar(t.includes("$18,000.00") && t.includes("$1,350.00") && t.includes("$2,900.00"), t);
  esperar((await page.locator(".fila--gasto").count()) === 2, "falta pagar: 2");
  await page.screenshot({ path: `${SHOTS}/s-inicio.png`, fullPage: true });
  await page.click('[data-accion="explicar"]');
  await hojaLista();
  esperar((await texto(".explicacion")).includes("Ingresos − todos los gastos del mes"), "explicación");
  await page.screenshot({ path: `${SHOTS}/s-explicacion.png` });
  await page.keyboard.press("Escape");
  await sinHojas();
});

await paso("Pagar desde Inicio actualiza el balance sin cambiarlo (pendiente → pagado)", async () => {
  await page.locator('.fila--gasto:has-text("Internet") [data-pagar-fijo]').click();
  await hojaLista();
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForFunction(() => document.querySelectorAll(".fila--gasto").length === 1);
  esperar((await texto(".hero__monto")) === "$13,750.00", "el balance no cambia al pagar");
  esperar((await texto(".tres-cifras")).includes("$1,950.00"), await texto(".tres-cifras"));
});

await paso("selector de mes: mes anterior vacío y regresar a este mes", async () => {
  await ir("gastos");
  await page.waitForSelector(".selector-mes");
  await page.click('[data-mes-nav="-1"]');
  await page.waitForSelector('[data-mes-nav="hoy"]');
  await page.click('[data-mes-nav="hoy"]');
  await page.waitForFunction(() => !document.querySelector('[data-mes-nav="hoy"]'));
  await page.screenshot({ path: `${SHOTS}/s-gastos.png`, fullPage: true });
});

await paso("Más: planeación, registros y ajustes; ¿Cuánto puedo gastar? abre la proyección", async () => {
  await ir("mas");
  await page.waitForSelector('#app-content a[href="#/plan"]');
  const t = await texto("#app-content");
  esperar(t.includes("¿Cuánto puedo gastar?") && t.includes("Deudas") && t.includes("Cajas"), t);
  await page.click('#app-content a[href="#/plan"]');
  await page.waitForSelector(".tabla-plan");
  await page.screenshot({ path: `${SHOTS}/s-plan.png`, fullPage: true });
});

await paso("formulario simple en oscuro", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await ir("dashboard");
  await page.waitForSelector(".hero");
  await page.click(".tabbar__nuevo");
  await hojaLista();
  await page.screenshot({ path: `${SHOTS}/s-form-oscuro.png` });
  await page.keyboard.press("Escape");
  await sinHojas();
  await page.screenshot({ path: `${SHOTS}/s-inicio-oscuro.png`, fullPage: true });
});

await paso("sin errores de JavaScript", async () => esperar(errores.length === 0, errores.join(" | ")));
await browser.close();
console.log(`\n${ok} de ${ok + fallas.length} pasos correctos`);
process.exit(fallas.length ? 1 : 0);

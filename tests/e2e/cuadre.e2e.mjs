// ============================================================
// tests/e2e/cuadre.e2e.mjs — v1.10.0: Cuadrar con mis bancos.
// Dev: emuladores + servidor local (ver e2e.mjs).
//   Escribir lo que dice cada banco (faltan / sobran / cuadra),
//   un banco que faltaba (saldo inicial), una tarjeta con más
//   deuda, elegir la caja, Cuadrar en un solo paso, Deshacer, y
//   que al final la app diga exactamente lo mismo que los bancos.
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

await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "cuadre@code-reset.mx", password: "secreto123", returnSecureToken: true }),
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
const ir = (ruta) => page.goto(URL_APP.replace(/#.*/, "") + `#/${ruta}`);
const fila = (nombre) => page.locator(`.cuadre:has(.cuadre__nombre:text-is("${nombre}"))`);
const saldos = () => page.evaluate(async () => {
  const { getState } = await import("/js/core/state.js");
  const { saldosPor } = await import("/js/domain/saldos.js");
  const s = getState();
  const cajas = saldosPor(s.agregados, "porCaja");
  const cuentas = saldosPor(s.agregados, "porCuenta");
  return { ...Object.fromEntries(s.cajas.map((c) => [c.nombre, cajas[c.id] || 0])), ...Object.fromEntries(s.cuentas.map((c) => [`banco:${c.nombre}`, cuentas[c.id] || 0])) };
});
/** Espera un texto en el resultado de la tarjeta de un banco (selector de Playwright). */
async function resultadoDe(nombre, fragmento, timeout = 10000) {
  await fila(nombre).locator("[data-resultado]", { hasText: fragmento }).waitFor({ timeout })
    .catch(async () => { throw new Error(`«${fragmento}» no aparece en ${nombre}: ${await fila(nombre).innerText().catch(() => "(no existe)")}`); });
}
async function esperarTexto(sel, fragmento, timeout = 10000) {
  await page.waitForFunction(([s, f]) => document.querySelector(s)?.innerText.includes(f), [sel, fragmento], { timeout })
    .catch(async () => { throw new Error(`«${fragmento}» no aparece en ${sel}: ${await page.locator(sel).first().innerText().catch(() => "(no existe)")}`); });
}

await page.goto(URL_APP);
await page.fill("#login-email", "cuadre@code-reset.mx"); await page.fill("#login-password", "secreto123"); await page.click("#login-btn");

await paso("preparación: HD Crédit $50,000 en BBVA, Sueldo personal $10,000 en Nu y tarjeta Liverpool que debía $4,000", async () => {
  await page.click('[data-accion="sembrar"]', { timeout: 15000 });
  await page.waitForSelector(".form-saldos");
  await page.waitForFunction(() => document.querySelectorAll(".form-saldos select option").length > 5);
  await page.fill('input[name="monto-hd-credit"]', "50000");
  await page.fill('input[name="monto-sueldo-personal"]', "10000");
  await page.click('.form-saldos button[type="submit"]');
  await page.waitForSelector(".hero");
  await ir("tarjetas");
  await page.click('.hoja-vacia[data-accion="nueva-tarjeta"]');
  await hojaLista();
  await page.fill('.capa input[name="nombre"]', "Liverpool");
  await page.fill('.capa input[name="diaCorte"]', "15");
  await page.fill('.capa input[name="diaLimite"]', "5");
  await page.fill('.capa input[name="deuda"]', "4000");
  await page.click('.capa .chip:has(input[name="cajaDeudaId"]):has-text("Sueldo personal")');
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector(".tarjeta-credito");
});

await paso("Más → Cuadrar con mis bancos: lo que tienes, lo que debes y una tarjeta por banco", async () => {
  await page.click('.tabbar a[href="#/mas"]');
  await page.click('#app-content a[href="#/cuadrar"]');
  await page.waitForSelector(".cuadre__resumen");
  const r = await texto(".cuadre__resumen");
  esperar(r.includes("$60,000.00") && r.includes("$4,000.00") && r.includes("$56,000.00"), r);
  esperar((await fila("BBVA HD").innerText()).includes("$50,000.00"), await fila("BBVA HD").innerText());
  esperar((await fila("Liverpool").innerText()).includes("Debes en la app"), await fila("Liverpool").innerText());
  esperar(await page.locator('[data-accion="cuadrar"]').isDisabled(), "sin cambios no se puede cuadrar");
});

await paso("escribir lo del banco: BBVA faltan $3,000 (HD Crédit), Nu sobran $1,999.99 (Sueldo personal), HSBC cuadra", async () => {
  await fila("BBVA HD").locator("[data-real]").fill("53000");
  await resultadoDe("BBVA HD", "Faltan $3,000.00 en la app");
  esperar((await fila("BBVA HD").locator("[data-caja]").inputValue()) === "hd-credit", "caja sugerida HD Crédit");
  await fila("Nu").locator("[data-real]").fill("8000.01");
  await resultadoDe("Nu", "Sobran $1,999.99 en la app");
  esperar((await fila("Nu").locator("[data-caja]").inputValue()) === "sueldo-personal", "caja sugerida Sueldo personal");
  await fila("HSBC").locator("[data-real]").fill("0");
  await resultadoDe("HSBC", "✓ Cuadra");
  await fila("Klar").locator("[data-real]").fill("abc");
  await resultadoDe("Klar", "Escribe una cantidad");
  await fila("Klar").locator("[data-real]").fill("");
  esperar((await texto('[data-accion="cuadrar"]')) === "Cuadrar 2 cuentas", await texto('[data-accion="cuadrar"]'));
});

await paso("banco que faltaba: BanCoppel con su apartado ($64,276) entra como saldo inicial de HD Crédit", async () => {
  await page.click('[data-accion="banco"]');
  await hojaLista();
  await page.fill('.capa input[name="nombre"]', "BanCoppel");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector('.cuadre:has(.cuadre__nombre:text-is("BanCoppel"))');
  // Lo escrito antes sigue ahí.
  esperar((await fila("BBVA HD").locator("[data-real]").inputValue()) === "53000", "se perdió lo escrito en BBVA");
  await fila("BanCoppel").locator("[data-real]").fill("64276");
  await resultadoDe("BanCoppel", "Faltan $64,276.00 en la app (saldo inicial)");
  await fila("BanCoppel").locator("[data-caja]").selectOption("hd-credit");
  await resultadoDe("BanCoppel", "Se suman a");
});

await paso("tarjeta: Liverpool dice $37,000 → debes $33,000 más; avisa si la caja quedaría en negativo", async () => {
  await fila("Liverpool").locator("[data-real]").fill("37000");
  await resultadoDe("Liverpool", "Debes $33,000.00 más que en la app");
  esperar((await fila("Liverpool").innerText()).includes("quedaría en"), "Sueldo personal quedaría en negativo");
  await fila("Liverpool").locator("[data-caja]").selectOption("hd-credit");
  await page.waitForFunction(() => !document.querySelector('.cuadre:has([data-caja]) .cuadre__aviso'));
  await page.screenshot({ path: `${SHOTS}/cuadre-antes.png`, fullPage: true });
});

await paso("Cuadrar 4 cuentas en un paso → la app dice lo mismo que los bancos; Deshacer lo regresa", async () => {
  esperar((await texto('[data-accion="cuadrar"]')) === "Cuadrar 4 cuentas", await texto('[data-accion="cuadrar"]'));
  await page.click('[data-accion="cuadrar"]');
  await hojaLista();
  const m = await texto(".confirmacion__mensaje");
  esperar(m.includes("BBVA HD: +$3,000.00 en HD Crédit") && m.includes("Nu: −$1,999.99 en Sueldo personal") && m.includes("Liverpool: −$33,000.00 en HD Crédit"), m);
  await page.click('.confirmacion button[type="submit"]');
  await sinHojas();
  await page.waitForSelector(".toast", { hasText: "la app ya dice lo mismo que tus bancos" });
  await esperarTexto(".cuadre__resumen", "$125,276.01");
  let s = await saldos();
  esperar(s["banco:BBVA HD"] === 5300000 && s["banco:Nu"] === 800001 && s["banco:BanCoppel"] === 6427600 && s["banco:Liverpool"] === -3700000, JSON.stringify(s));
  esperar(s["HD Crédit"] === 5000000 + 300000 + 6427600 - 3300000 && s["Sueldo personal"] === 1000000 - 400000 - 199999, JSON.stringify(s));
  esperar(!(await page.locator(".cuadre [data-real]").evaluateAll((els) => els.some((e) => e.value))), "los campos deberían quedar vacíos");
  await page.click(".toast__accion"); // Deshacer
  await page.waitForFunction(() => document.querySelector(".cuadre__resumen")?.innerText.includes("$60,000.00"));
  s = await saldos();
  esperar(s["banco:BBVA HD"] === 5000000 && s["banco:Liverpool"] === -400000 && s["banco:BanCoppel"] === 0, JSON.stringify(s));
});

await paso("otra vez y ahora sí: los ajustes no son ingresos ni gastos de Mi mes", async () => {
  const gastosAntes = await page.evaluate(async () => {
    const { getState } = await import("/js/core/state.js");
    const a = Object.values(getState().agregados);
    return a.reduce((t, m) => t + Object.values(m.porCaja || {}).reduce((x, c) => x + (c.gas || 0) + (c.ing || 0), 0), 0);
  });
  await fila("BBVA HD").locator("[data-real]").fill("53000");
  await fila("Liverpool").locator("[data-real]").fill("37000");
  await fila("Liverpool").locator("[data-caja]").selectOption("hd-credit");
  await page.click('[data-accion="cuadrar"]');
  await hojaLista();
  await page.click('.confirmacion button[type="submit"]');
  await sinHojas();
  await page.waitForFunction(() => document.querySelector(".cuadre__resumen")?.innerText.includes("$63,000.00"));
  const gastosDespues = await page.evaluate(async () => {
    const { getState } = await import("/js/core/state.js");
    const a = Object.values(getState().agregados);
    return a.reduce((t, m) => t + Object.values(m.porCaja || {}).reduce((x, c) => x + (c.gas || 0) + (c.ing || 0), 0), 0);
  });
  esperar(gastosAntes === gastosDespues, `${gastosAntes} → ${gastosDespues}`);
  await fila("BBVA HD").locator("[data-real]").fill("53000");
  await resultadoDe("BBVA HD", "✓ Cuadra");
  await ir("movimientos");
  await page.waitForFunction(() => document.querySelector("#app-content")?.innerText.includes("Cuadre con BBVA HD"));
});

await paso("Bancos y Revisar mis datos llevan a Cuadrar", async () => {
  await ir("cuentas");
  await page.waitForSelector('#app-content a[href="#/cuadrar"]');
  await page.click('.tabbar a[href="#/mas"]');
  await page.click('#app-content [data-accion="revisar-datos"]');
  await hojaLista();
  await page.click('.capa a[href="#/cuadrar"]');
  await page.waitForSelector(".cuadre__resumen");
});

await paso("modo oscuro: Cuadrar", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await ir("cuadrar");
  await page.waitForSelector(".cuadre");
  await fila("Nu").locator("[data-real]").fill("7500");
  await page.screenshot({ path: `${SHOTS}/cuadre-oscuro.png`, fullPage: true });
});

await paso("sin errores de JavaScript", async () => esperar(errores.length === 0, errores.join(" | ")));
await browser.close();
console.log(`\n${ok} de ${ok + fallas.length} pasos correctos`);
process.exit(fallas.length ? 1 : 0);

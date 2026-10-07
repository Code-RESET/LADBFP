// ============================================================
// tests/e2e/simple.e2e.mjs — "Mi mes" (v1.3): la app en una
// pantalla como la hoja de Excel del usuario. Gastos e ingresos
// con casillas ☐/☑, registro "nombre + monto", Mis cajas.
// Dev: emuladores + servidor local (ver encabezado de e2e.mjs).
// ============================================================
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const URL_APP = process.env.E2E_URL || "http://localhost:5178/?emulador&nosw";
const SDK_DIR = process.env.FIREBASE_SDK_DIR;
const SHOTS = process.env.E2E_SHOTS || "e2e-shots";
const EMAIL = "simple@code-reset.mx";
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

// Usuario de prueba en el emulador de Auth (si ya existe, no pasa nada).
await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: "secreto123", returnSecureToken: true }),
}).catch(() => {});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Mexico_City" });
if (SDK_DIR) await ctx.route(/www\.gstatic\.com\/firebasejs\/[\d.]+\/(.+\.js)$/, (r) => r.fulfill({ contentType: "text/javascript", body: readFileSync(join(SDK_DIR, r.request().url().split("/").pop())) }));
await ctx.route(/fonts\./, (r) => r.fulfill({ contentType: "text/css", body: "" }));
// ExcelJS: en el teléfono viene de jsDelivr; aquí desde node_modules (EXCELJS_FILE).
const EXCELJS_FILE = process.env.EXCELJS_FILE;
if (EXCELJS_FILE) await ctx.route(/cdn\.jsdelivr\.net\/npm\/exceljs@/, (r) => r.fulfill({ contentType: "text/javascript", body: readFileSync(EXCELJS_FILE) }));
const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
const texto = (sel) => page.locator(sel).first().innerText();
const etiqueta = async () => (await page.locator(".hero__etiqueta").textContent()).trim();
async function hojaLista() { await page.waitForSelector(".capa--visible"); await page.waitForTimeout(300); }
async function sinHojas() { await page.waitForFunction(() => !document.querySelector(".capa")); }
const ir = (ruta) => page.goto(URL_APP.replace(/#.*/, "") + `#/${ruta}`);
const filas = (lista) => page.locator(`.hoja [data-abrir^="${lista}:"]`).allInnerTexts();
const fila = (lista, nombre) => page.locator(".fila--hoja", { has: page.locator(`[data-abrir^="${lista}:"]`, { hasText: nombre }) });
const esperarTexto = (sel, t) => page.waitForFunction(([s, x]) => document.querySelector(s)?.innerText.includes(x), [sel, t], { timeout: 8000 });

/** Registro rápido: nombre + monto (+ caja, + "se repite cada mes el día N"). */
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

await page.goto(URL_APP);
await page.fill("#login-email", EMAIL); await page.fill("#login-password", "secreto123"); await page.click("#login-btn");

await paso("preparación: cajas y saldo inicial", async () => {
  await page.click('[data-accion="sembrar"]', { timeout: 15000 });
  await page.waitForSelector(".form-saldos");
  await page.waitForFunction(() => document.querySelectorAll(".form-saldos select option").length > 5);
  await page.fill('input[name="monto-personal-imss"]', "5000");
  await page.click('.form-saldos button[type="submit"]');
  await page.waitForSelector(".hero");
});

await paso("navegación mínima: Mi mes · ＋ · Más", async () => {
  const t = (await texto(".tabbar")).replace(/\s+/g, " ").trim();
  esperar(t === "Mi mes Más", t);
  esperar(await page.locator(".tabbar > *").nth(1).evaluate((el) => el.classList.contains("tabbar__nuevo")), "＋ no está en medio");
});

await paso("mes vacío: Te quedan $0 y botones para empezar", async () => {
  esperar((await etiqueta()).startsWith("Te quedan en"), await etiqueta());
  esperar((await texto(".hero__monto")) === "$0.00", await texto(".hero__monto"));
  await page.waitForSelector(".hoja-vacia[data-nuevo='gasto']");
  await page.waitForSelector(".hoja-vacia[data-nuevo='ingreso']");
  const cajas = await texto(".seccion:has(.total-cajas)");
  esperar(cajas.includes("Personal / IMSS") && cajas.includes("$5,000.00"), cajas);
});

await paso("registro = solo nombre + monto (caja ya elegida, sin categoría ni cuenta)", async () => {
  await page.click(".tabbar__nuevo");
  await hojaLista();
  const visibles = await page.locator(".capa input:visible, .capa select:visible").evaluateAll((els) => els.map((e) => e.name));
  esperar(!visibles.includes("categoriaId") && !visibles.includes("cuentaId") && !visibles.includes("fecha"), visibles.join(","));
  esperar(await page.locator(".capa .chip input:checked").count() === 1, "sin caja preseleccionada");
  esperar(!(await page.locator('.capa input[name="dia"]').isVisible()), "el día se ve sin marcar 'se repite'");
  await page.screenshot({ path: `${SHOTS}/m-registro.png` });
  await page.keyboard.press("Escape");
  await sinHojas();
});

await paso("gastos fijos y de una vez en la misma lista, por día", async () => {
  await registrar({ nombre: "Hipoteca casa", monto: "1000", caja: "Personal / IMSS", dia: diaAntes });
  await registrar({ nombre: "Internet casa", monto: "600", dia: diaDespues });
  await registrar({ nombre: "Gasolina", monto: "500", caja: "Personal / IMSS" });
  await page.waitForFunction(() => document.querySelectorAll(".hoja [data-abrir^='gastos:']").length === 3);
  const t = await filas("gastos");
  esperar(t.some((x) => x.includes("Hipoteca casa") && x.includes("↻") && x.includes("Personal / IMSS")), t.join(" | "));
  esperar(await fila("gastos", "Gasolina").locator(".casilla--fija").count() === 1, "Gasolina debería verse ✓ (ya se gastó)");
  esperar(await fila("gastos", "Hipoteca casa").locator('button.casilla[aria-checked="false"]').count() === 1, "Hipoteca debería estar ☐");
  const dias = await page.locator(".hoja .dia").allInnerTexts();
  const nums = dias.slice(0, 3).map(Number);
  esperar(nums.every((n, i) => i === 0 || nums[i - 1] <= n), `no ordenado por día: ${dias}`);
});

await paso("Te faltan = gastos del mes (pagados y pendientes) sin ingresos", async () => {
  await esperarTexto(".hero__monto", "$2,100.00");
  esperar((await etiqueta()).startsWith("Te faltan"), await etiqueta());
  esperar((await texto(".hero__linea")).includes("Gastos $2,100"), await texto(".hero__linea"));
  esperar((await texto(".hero__frase")).includes("$1,600"), await texto(".hero__frase"));
});

await paso("estilo Clima: cielo rojo, 7 días y consejo de vencido con «No, gracias»", async () => {
  const estado = () => page.evaluate(() => document.documentElement.dataset.estado);
  esperar((await estado()) === "mal", `estado ${await estado()}`);
  esperar((await texto(".cielo__estado")) === "Mes en rojo", await texto(".cielo__estado"));
  esperar(await page.locator(".pronostico__fecha").count() === 7, "deberían verse 7 días");
  esperar((await page.locator(".pronostico__fecha").first().innerText()) === "Hoy", "el primer día es Hoy");
  await page.locator(".pronostico__fecha").first().click();
  await page.waitForSelector(".toast", { hasText: "Hoy:" });
  if (diaAntes < DIA_HOY) { // Hipoteca vence ayer → aviso de vencido
    await page.waitForSelector('.consejo[data-clave^="vencidos:"]');
    esperar((await texto(".consejo")).includes("Hipoteca casa está vencido"), await texto(".consejo"));
    await page.click('.consejo [data-consejo="cerrar"]');
    await page.waitForFunction(() => !document.querySelector('.consejo[data-clave^="vencidos:"]'));
  }
  await page.screenshot({ path: `${SHOTS}/m-clima-rojo.png` });
});

await paso("☐ → ☑ marca pagado: descuenta de la caja y se puede deshacer", async () => {
  await fila("gastos", "Hipoteca casa").locator("button.casilla").click();
  await page.waitForSelector('.fila--hoja.fila--hecha button.casilla[aria-checked="true"]');
  await esperarTexto(".seccion:has(.total-cajas)", "$3,500.00"); // 5000 − 500 gasolina − 1000 hipoteca
  esperar((await texto(".hero__frase")).includes("$600"), await texto(".hero__frase"));
  await page.click(".toast__accion"); // Deshacer
  await page.waitForFunction(() => !document.querySelector('button.casilla[aria-checked="true"]'));
  await esperarTexto(".seccion:has(.total-cajas)", "$4,500.00");
  await fila("gastos", "Hipoteca casa").locator("button.casilla").click();
  await page.waitForSelector('button.casilla[aria-checked="true"]');
});

await paso("☑ → ☐ (desmarcar) pregunta y lo deja pendiente", async () => {
  await fila("gastos", "Hipoteca casa").locator("button.casilla").click();
  await hojaLista();
  await page.click('.capa button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('button.casilla[aria-checked="true"]'));
  await esperarTexto(".seccion:has(.total-cajas)", "$4,500.00");
  await fila("gastos", "Hipoteca casa").locator("button.casilla").click();
  await page.waitForSelector('button.casilla[aria-checked="true"]');
});

await paso("ingreso fijo desde Ingresos → + Nuevo; ☑ recibido; Te quedan", async () => {
  await registrar({ boton: ".seccion:has([data-nuevo='ingreso']) .seccion__cabecera [data-nuevo='ingreso']", nombre: "Honorarios", monto: "15000", caja: "Personal / IMSS", dia: diaDespues });
  await page.waitForSelector(".hoja [data-abrir^='ingresos:']");
  await fila("ingresos", "Honorarios").locator("button.casilla").click();
  await page.waitForSelector('.hoja [data-marcar^="ingresos:"][aria-checked="true"]');
  await esperarTexto(".hero__monto", "$12,900.00"); // 15000 − 2100
  esperar((await etiqueta()).startsWith("Te quedan"), await etiqueta());
  esperar((await texto(".hero__linea")).includes("Entró $15,000"), await texto(".hero__linea"));
  esperar((await page.evaluate(() => document.documentElement.dataset.estado)) === "bien", "el cielo debería volver a 'bien'");
  await page.screenshot({ path: `${SHOTS}/m-mes.png`, fullPage: true });
});

await paso("tocar un gasto de una vez lo edita (nombre + monto) y se puede borrar", async () => {
  await fila("gastos", "Gasolina").locator("[data-abrir]").click();
  await hojaLista();
  await page.fill('.capa input[name="monto"]', "450");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await esperarTexto(".hero__linea", "Gastos $2,050");
  await fila("gastos", "Gasolina").locator("[data-abrir]").click();
  await hojaLista();
  await page.click('.capa [data-accion="quitar"]');
  await page.waitForFunction(() => document.querySelectorAll(".capa").length === 2);
  await page.waitForTimeout(300);
  await page.locator(".capa").last().locator('button[type="submit"]').click();
  await sinHojas();
  await esperarTexto(".hero__linea", "Gastos $1,600");
});

await paso("gasto fijo: editar el monto y 'Ya no se repite'", async () => {
  await fila("gastos", "Internet casa").locator("[data-abrir]").click();
  await hojaLista();
  esperar(await page.locator('.capa input[name="dia"]').inputValue() === String(diaDespues), "día no precargado");
  await page.fill('.capa input[name="monto"]', "650");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await esperarTexto(".hero__linea", "Gastos $1,650");
  await fila("gastos", "Internet casa").locator("[data-abrir]").click();
  await hojaLista();
  await page.click('.capa [data-accion="quitar"]');
  await page.waitForFunction(() => document.querySelectorAll(".capa").length === 2);
  await page.waitForTimeout(300);
  await page.locator(".capa").last().locator('button[type="submit"]').click();
  await sinHojas();
  await page.waitForFunction(() => ![...document.querySelectorAll(".hoja [data-abrir]")].some((b) => b.innerText.includes("Internet")));
  await esperarTexto(".hero__linea", "Gastos $1,000");
});

await paso("cambiar de mes: el anterior no tiene los fijos nuevos; 'Este mes' regresa", async () => {
  await page.click('[data-mes-nav="-1"]');
  await page.waitForSelector(".hoja-vacia[data-nuevo='gasto']");
  esperar((await page.evaluate(() => location.hash)).includes("mes="), "sin ?mes en la URL");
  await page.click('[data-mes-nav="hoy"]');
  await page.waitForSelector(".hoja [data-abrir^='gastos:']");
});

await paso("Más: lo de todos los días arriba y lo avanzado marcado como opcional", async () => {
  await page.click('.tabbar a[href="#/mas"]');
  await page.waitForFunction(() => !document.documentElement.dataset.estado); // fuera de Mi mes, cielo normal
  await page.waitForSelector("#app-content a.fila[href='#/cajas']", { timeout: 8000 }).catch(async (e) => {
    await page.screenshot({ path: `${SHOTS}/debug-mas.png` });
    throw new Error(`${e.message.split("\n")[0]} hash=${await page.evaluate(() => location.hash)} capas=${await page.locator(".capa").count()}`);
  });
  const t = await texto("#app-content");
  const tt = (await page.locator("#app-content").textContent()).toLowerCase();
  esperar(tt.includes("cajas") && tt.includes("avanzado (opcional)") && tt.includes("deudas") && !tt.includes("próximamente"), t);
  await page.screenshot({ path: `${SHOTS}/m-mas.png`, fullPage: true });
});

await paso("Revisar mis datos (desde Más): saldos cuadran y avisa cajas sin usar", async () => {
  await page.click('.tabbar a[href="#/mas"]');
  await page.click('#app-content [data-accion="revisar-datos"]');
  await hojaLista();
  await page.waitForFunction(() => document.querySelector(".capa [data-v]")?.innerText.includes("cuadran"), null, { timeout: 15000 });
  const t = await texto(".capa .revision");
  esperar(/no se han? usado/.test(t) && !t.includes("saldo negativo"), t);
  await page.screenshot({ path: `${SHOTS}/m-revisar.png` });
  await page.keyboard.press("Escape");
  await sinHojas();
});

await paso("crear caja = nombre + banco nuevo + cuánto tiene hoy", async () => {
  await ir("cajas");
  await page.click('[data-accion="nueva"]');
  await hojaLista();
  esperar(!(await page.locator('.capa select').count()), "el formulario de caja no debería tener listas desplegables");
  await page.fill('.capa input[name="nombre"]', "Ahorro casa");
  await page.click('.capa .chip:has-text("＋ Otro")');
  await page.fill('.capa input[name="nuevoBanco"]', "BanCoppel");
  await page.fill('.capa input[name="saldo"]', "2000");
  await page.screenshot({ path: `${SHOTS}/m-nueva-caja.png` });
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForFunction(() => [...document.querySelectorAll("#app-content .fila")].some((f) => f.innerText.includes("Ahorro casa") && f.innerText.includes("BanCoppel") && f.innerText.includes("$2,000.00")));
  await ir("cuentas");
  await page.waitForSelector('#app-content .fila:has-text("BanCoppel")');
  await ir("dashboard");
  await page.waitForFunction(() => document.querySelector(".seccion:has(.total-cajas)")?.innerText.includes("Ahorro casa"));
});

await paso("Descargar Excel: archivo con Balance, Gastos, Ingresos, Cajas, Movimientos y números que cuadran", async () => {
  await page.waitForSelector('[data-accion="descargar-excel"]');
  const [descarga] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click('#app-content [data-accion="descargar-excel"]')]);
  const ruta = join(SHOTS, descarga.suggestedFilename());
  await descarga.saveAs(ruta);
  esperar(/^Finanzas_Reset_\d{4}-\d{2}\.xlsx$/.test(descarga.suggestedFilename()), descarga.suggestedFilename());
  const ExcelJS = createRequire(EXCELJS_FILE)("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);
  const hojas = wb.worksheets.map((w) => w.name);
  esperar(["Balance", "Gastos", "Ingresos", "Cajas", "Movimientos", "12 meses"].every((h) => hojas.includes(h)), hojas.join(","));
  const valor = (texto) => { let v; wb.getWorksheet("Balance").eachRow((r) => { if (String(r.getCell(1).value).startsWith(texto)) v = r.getCell(2).value; }); return typeof v === "object" ? v?.result : v; };
  // Ingresos 15,000 · gastos: Hipoteca 1,000 (Internet ya no se repite, Gasolina borrada)
  esperar(valor("Ingresos del mes") === 15000 && valor("Total de gastos") === 1000 && valor("Te quedan") === 14000, `balance ${valor("Ingresos del mes")} ${valor("Total de gastos")} ${valor("Te quedan")}`);
  // Dinero real: 5,000 inicial + 2,000 BanCoppel (saldos iniciales este mes) + 15,000 − 1,000 = 21,000
  esperar(valor("= Dinero al cerrar") === 21000, `cierre ${valor("= Dinero al cerrar")}`);
  esperar(valor("Dinero al empezar") + valor("+ Entró") - valor("− Salió") + valor("± Saldos") === valor("= Dinero al cerrar"), "no cuadra");
  const gastos = wb.getWorksheet("Gastos").getColumn(2).values.filter(Boolean);
  esperar(gastos.includes("Hipoteca casa"), gastos.join(","));
});

await paso("Actualizar la app: está en Más y responde (botón de arriba oculto si no hay versión nueva)", async () => {
  esperar(await page.locator("#btn-actualizar").isHidden(), "el botón Actualizar no debería verse sin versión nueva");
  await page.click('.tabbar a[href="#/mas"]');
  await page.click('#app-content [data-accion="actualizar-app"]');
  await page.waitForSelector(".toast", { hasText: /versión|actualizaci/i });
});

await paso("enlaces viejos (#/gastos) llevan a Mi mes", async () => {
  await ir("gastos");
  await page.waitForSelector(".hero");
  esperar((await page.evaluate(() => location.hash)).startsWith("#/dashboard"), await page.evaluate(() => location.hash));
});

await paso("modo oscuro y escritorio", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForSelector(".hoja");
  await page.screenshot({ path: `${SHOTS}/m-mes-oscuro.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/m-desktop.png` });
  await page.emulateMedia({ colorScheme: "light" });
});

await paso("sin errores de JavaScript", async () => esperar(errores.length === 0, errores.join(" | ")));
await browser.close();
console.log(`\n${ok} de ${ok + fallas.length} pasos correctos`);
process.exit(fallas.length ? 1 : 0);

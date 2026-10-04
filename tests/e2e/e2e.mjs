// ============================================================
// tests/e2e/e2e.mjs — Prueba de punta a punta (HERRAMIENTA DE
// DESARROLLO, opcional). Maneja la app real en Chromium contra
// los emuladores de Firebase:
//
//   1) firebase emulators:start --only firestore,auth --project demo-finanzas-reset
//   2) python3 -m http.server 5173     (desde la raíz del repo)
//   3) node tests/e2e/e2e.mjs
//
// Variables: E2E_URL, CHROMIUM_PATH, FIREBASE_SDK_DIR (carpeta con
// firebase-app.js etc. para servir el SDK sin salir a internet),
// E2E_SHOTS (carpeta para capturas).
// ============================================================

import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const URL_APP = process.env.E2E_URL || "http://localhost:5173/?emulador&nosw";
const SDK_DIR = process.env.FIREBASE_SDK_DIR;
const SHOTS = process.env.E2E_SHOTS || "e2e-shots";
const EMAIL = "angel@code-reset.mx";
const PASS = "secreto123";
mkdirSync(SHOTS, { recursive: true });

let ok = 0;
const fallas = [];
async function paso(nombre, fn) {
  try { await fn(); ok++; console.log(`✓ ${nombre}`); }
  catch (e) { fallas.push(nombre); console.log(`✗ ${nombre}\n  ${e.message.split("\n")[0]}`); }
}
const esperar = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function nuevoContexto(viewport) {
  const ctx = await browser.newContext({ viewport, locale: "es-MX", timezoneId: "America/Mexico_City" });
  if (SDK_DIR) {
    await ctx.route(/www\.gstatic\.com\/firebasejs\/[\d.]+\/(.+\.js)$/, (route) => {
      const archivo = route.request().url().split("/").pop();
      route.fulfill({ contentType: "text/javascript", body: readFileSync(join(SDK_DIR, archivo)) });
    });
  }
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ contentType: "text/css", body: "" }));
  return ctx;
}

const ctx = await nuevoContexto({ width: 390, height: 844 });
const page = await ctx.newPage();
const erroresConsola = [];
page.on("console", (m) => { if (m.type() === "error") erroresConsola.push(m.text()); });
page.on("pageerror", (e) => erroresConsola.push(e.message));

const texto = (sel) => page.locator(sel).first().innerText();
const montoDeCaja = async (nombre) =>
  (await page.locator(".fila", { hasText: nombre }).first().locator(".fila__monto").innerText()).trim();
async function cerrarHojas() {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".capa"));
}
async function nuevoMovimiento({ tipo = "gasto", monto, caja, cuenta, categoria, cajaDestino, cuentaDestino, nota }) {
  await page.waitForFunction(() => !document.querySelector(".capa"));
  await page.click(".tabbar__nuevo");
  const f = page.locator(".form-mov");
  await f.waitFor();
  await page.waitForSelector(".capa--visible");
  await page.waitForTimeout(300); // animación de entrada de la hoja
  const grupo = ["apertura", "ajuste"].includes(tipo) ? "otro" : tipo;
  // Modo simple: cuenta, fecha, nota y "saldo inicial / ajuste" viven en "Más detalles".
  const abrirDetalles = async () => { if (!(await f.locator(".mas-detalles").evaluate((d) => d.open))) await f.locator(".mas-detalles > summary").click(); };
  if (grupo === "otro") { await abrirDetalles(); await f.locator(".otro-tipo").click(); await f.locator(`.segmentado__opcion:has(input[name="tipoOtro"][value="${tipo}"])`).click(); }
  else await f.locator(`.segmentado__opcion:has(input[name="tipoGrupo"][value="${grupo}"])`).click();
  if (cuenta || cuentaDestino || nota) await abrirDetalles();
  await f.locator('input[name="monto"]').fill(monto);
  if (caja) await f.locator('select[name="cajaId"]').selectOption({ label: caja });
  if (cuenta) await f.locator('select[name="cuentaId"]').selectOption({ label: cuenta });
  if (categoria) await f.locator('select[name="categoriaId"]').selectOption({ label: categoria });
  if (cajaDestino) await f.locator('select[name="cajaDestinoId"]').selectOption({ label: cajaDestino });
  if (cuentaDestino) await f.locator('select[name="cuentaDestinoId"]').selectOption({ label: cuentaDestino });
  if (nota) await f.locator('input[name="nota"]').fill(nota);
  await f.locator('button[type="submit"]').click();
}

// ---------------- Login ----------------
await page.goto(URL_APP);
await paso("pantalla de login con firma Code-Reset", async () => {
  await page.waitForSelector("#login-screen:not([hidden])");
  const t = await texto("#login-screen");
  esperar(t.includes("Desarrollado por: Ing. Luis Ángel Díaz Bernal") && t.includes("Compañía: CODE-RESET"), "falta la firma");
  await page.screenshot({ path: `${SHOTS}/01-login.png` });
});
await paso("credenciales incorrectas muestran mensaje entendible", async () => {
  await page.fill("#login-email", EMAIL);
  await page.fill("#login-password", "mala");
  await page.click("#login-btn");
  await page.waitForSelector("#login-error:not([hidden])");
  esperar((await texto("#login-error")).includes("incorrect"), await texto("#login-error"));
});
await paso("login correcto abre el Dashboard", async () => {
  await page.fill("#login-password", PASS);
  await page.click("#login-btn");
  await page.waitForSelector("#app-shell:not([hidden])");
});

// ---------------- Asistente inicial ----------------
await paso("asistente: crear cajas y cuentas iniciales", async () => {
  await page.click('[data-accion="sembrar"]', { timeout: 10000 });
  await page.waitForSelector(".form-saldos");
  const t = await texto(".form-saldos");
  for (const n of ["Reset Alarmas", "HD Crédit", "Personal / IMSS", "Code-Reset", "Sueldo personal"]) esperar(t.includes(n), `falta ${n}`);
  await page.screenshot({ path: `${SHOTS}/02-saldos-iniciales.png`, fullPage: true });
});
await paso("asistente: saldo inicial de $10,000 en HD Crédit", async () => {
  await page.fill('input[name="monto-hd-credit"]', "10,000");
  await page.click('.form-saldos button[type="submit"]');
  await page.waitForSelector(".hero");
  esperar((await texto(".total-cajas")) === "$10,000.00", await texto(".total-cajas"));
  esperar((await montoDeCaja("HD Crédit")) === "$10,000.00", "saldo HD");
});

// ---------------- Pruebas obligatorias ----------------
await paso("SALDOS: $10,000 − gasto $2,000 = $8,000", async () => {
  await nuevoMovimiento({ tipo: "gasto", monto: "2000", caja: "HD Crédit", cuenta: "BBVA HD", categoria: "Casa" });
  await page.waitForFunction(() => document.querySelector(".total-cajas")?.textContent === "$8,000.00");
  esperar((await montoDeCaja("HD Crédit")) === "$8,000.00", "saldo HD");
});
await paso("TRANSFERENCIA: HD Crédit → Sueldo personal $3,000; patrimonio sin cambio", async () => {
  await nuevoMovimiento({ tipo: "transferencia", monto: "3000", caja: "HD Crédit", cuenta: "BBVA HD", cajaDestino: "Sueldo personal", cuentaDestino: "Nu" });
  await page.waitForFunction(() => [...document.querySelectorAll(".fila")].some((f) => f.textContent.includes("Sueldo personal") && f.textContent.includes("$3,000.00")));
  esperar((await montoDeCaja("HD Crédit")) === "$5,000.00", `HD ${await montoDeCaja("HD Crédit")}`);
  esperar((await texto(".total-cajas")) === "$8,000.00", "patrimonio cambió");
  await page.screenshot({ path: `${SHOTS}/03-dashboard-claro.png`, fullPage: true });
});
await paso("integridad en UI: transferencia al mismo par (caja, cuenta) se bloquea", async () => {
  await nuevoMovimiento({ tipo: "transferencia", monto: "100", caja: "HD Crédit", cuenta: "BBVA HD", cajaDestino: "HD Crédit", cuentaDestino: "BBVA HD" });
  const err = await page.locator('[data-error="cajaDestinoId"]').innerText();
  esperar(err.includes("misma caja"), err);
  await cerrarHojas();
});
await paso("integridad en UI: monto vacío se bloquea", async () => {
  await nuevoMovimiento({ tipo: "gasto", monto: "", categoria: "Comida" });
  esperar((await page.locator('[data-error="montoCentavos"]').innerText()).includes("monto"), "sin error de monto");
  await cerrarHojas();
});
await paso("posible duplicado: se pregunta antes de registrar", async () => {
  await nuevoMovimiento({ tipo: "gasto", monto: "2000", caja: "HD Crédit", cuenta: "BBVA HD", categoria: "Casa" });
  await page.waitForSelector(".capa--dialog .capa__titulo");
  esperar((await texto(".capa--dialog .capa__titulo")).includes("Ya lo registraste"), "sin aviso");
  await page.click(".capa--dialog [data-cancelar]");
  await page.waitForFunction(() => !document.querySelector(".capa--dialog"));
  await cerrarHojas();
});

// ---------------- Anular ----------------
await paso("anular un movimiento con motivo revierte el saldo", async () => {
  await page.click('.fila-mov:has-text("Casa")');
  await page.click('[data-accion="anular"]');
  await page.fill('textarea[name="motivo"]', "Prueba de anulación");
  await page.click('.capa--dialog button[type="submit"]');
  await page.waitForFunction(() => document.querySelector(".total-cajas")?.textContent === "$10,000.00");
});

// ---------------- Paginación ----------------
await paso("cargar 320 movimientos de prueba (código real del repositorio)", async () => {
  await page.evaluate(async () => {
    const { movimientosRepo } = await import("/js/data/movimientosRepo.js");
    const { getState } = await import("/js/core/state.js");
    const uid = getState().user.uid;
    for (let i = 0; i < 320; i++) {
      const dia = String(1 + (i % 28)).padStart(2, "0");
      movimientosRepo.crear(uid, { tipo: "gasto", fecha: `2026-09-${dia}`, montoCentavos: 100 + i, cajaId: "sueldo-personal", cuentaId: "nu", categoriaId: "ga-comida", nota: `prueba ${i}` });
    }
  });
  // 320 gastos de $1.00 a $4.19 = $830.40. Esperar a que todo se sincronice antes de recargar.
  await page.waitForFunction(() => document.querySelector(".total-cajas")?.textContent === "$9,169.60", null, { timeout: 30000 });
  await page.waitForSelector("#sync-estado[hidden]", { state: "attached", timeout: 60000 });
});
let totalMovs = 0;
await paso("paginación 25: 'Mostrando 1–25 de N' y página siguiente 26–50", async () => {
  await page.goto(URL_APP.replace(/#.*/, "") + "#/movimientos");
  await page.waitForSelector(".paginacion__rango");
  const r1 = await texto(".paginacion__rango");
  const m = r1.match(/Mostrando 1–25 de ([\d,]+) movimientos/);
  esperar(m, r1);
  totalMovs = Number(m[1].replace(/,/g, ""));
  esperar(totalMovs === 322, `total ${totalMovs}`); // apertura + transferencia + 320 (el gasto anulado no cuenta)
  esperar((await texto(".paginacion__movil .pag-texto")) === "Página 1 de 13", await texto(".paginacion__movil .pag-texto"));
  await page.click('.paginacion__movil [data-pag="next"]');
  await page.waitForFunction(() => document.querySelector(".paginacion__rango")?.textContent.startsWith("Mostrando 26–50"));
  esperar((await page.locator(".fila-mov").count()) === 25, "25 filas");
  await page.screenshot({ path: `${SHOTS}/04-movimientos-movil.png`, fullPage: true });
});
for (const n of [10, 50, 100]) {
  await paso(`paginación ${n} por página`, async () => {
    await page.selectOption(".paginacion [data-tamano]", String(n));
    await page.waitForFunction((n) => document.querySelector(".paginacion__rango")?.textContent.startsWith(`Mostrando 1–${n} `), n);
    esperar((await page.locator(".fila-mov").count()) === n, `filas ${await page.locator(".fila-mov").count()}`);
    const paginas = Math.ceil(totalMovs / n);
    esperar((await texto(".paginacion__movil .pag-texto")) === `Página 1 de ${paginas}`, await texto(".paginacion__movil .pag-texto"));
  });
}
await paso("paginación 100: llegar a la última página (22 registros)", async () => {
  for (let p = 2; p <= 4; p++) {
    await page.click('.paginacion__movil [data-pag="next"]');
    await page.waitForFunction((p) => document.querySelector(".pag-texto")?.textContent === `Página ${p} de 4`, p);
  }
  esperar((await texto(".paginacion__rango")) === "Mostrando 301–322 de 322 movimientos", await texto(".paginacion__rango"));
  esperar(await page.locator('.paginacion__movil [data-pag="next"]').isDisabled(), "siguiente debería estar deshabilitado");
  await page.selectOption(".paginacion [data-tamano]", "25");
});
await paso("filtro por caja: total desde agregados", async () => {
  await page.selectOption('.filtros select[name="caja"]', { label: "HD Crédit" });
  await page.waitForFunction(() => document.querySelector(".paginacion__rango")?.textContent === "Mostrando 1–2 de 2 movimientos");
});
await paso("filtro Anulados muestra el movimiento anulado", async () => {
  await page.selectOption('.filtros select[name="caja"]', "");
  await page.selectOption('.filtros select[name="estado"]', "anulado");
  await page.waitForSelector(".fila-mov--anulada");
  await page.selectOption('.filtros select[name="estado"]', "activo");
});

// ---------------- Editar + historial ----------------
await paso("editar monto deja historial y actualiza saldo", async () => {
  await page.goto(URL_APP.replace(/#.*/, "") + "#/movimientos?caja=hd-credit");
  await page.click('.fila-mov:has-text("Transferencia")');
  await page.click('[data-accion="editar"]');
  await page.locator('.form-mov input[name="monto"]').fill("3500");
  await page.click('.form-mov button[type="submit"]');
  await page.waitForFunction(() => document.querySelector(".fila-mov__monto")?.textContent.includes("3,500.00"));
  await page.click('.fila-mov:has-text("Transferencia")');
  await page.click(".detalle-mov__historial summary");
  await page.waitForSelector(".historial li");
  const h = await texto(".historial");
  esperar(h.includes("Editado") && h.includes("$3,000.00 → $3,500.00"), h);
  await page.keyboard.press("Escape");
});

// ---------------- Offline ----------------
await paso("OFFLINE: registrar sin conexión y sincronizar sin duplicados", async () => {
  await page.goto(URL_APP.replace(/#.*/, "") + "#/dashboard");
  await page.waitForSelector(".hero");
  await ctx.setOffline(true);
  await page.waitForSelector("#sync-estado:not([hidden])");
  esperar((await texto("#sync-estado")) === "Sin conexión", await texto("#sync-estado"));
  await nuevoMovimiento({ tipo: "ingreso", monto: "1234.56", caja: "Reset Alarmas", cuenta: "Mercado Pago", categoria: "Instalaciones", nota: "offline" });
  await page.waitForSelector(".toast", { hasText: "se sincronizará" });
  await page.waitForSelector('.fila-mov:has-text("Instalaciones") .badge--pendiente');
  esperar((await montoDeCaja("Reset Alarmas")) === "$1,234.56", "saldo local offline");
  await page.screenshot({ path: `${SHOTS}/05-offline.png`, fullPage: true });
  await ctx.setOffline(false);
  await page.waitForFunction(() => !document.querySelector(".badge--pendiente"), null, { timeout: 20000 });
  // Verificar en el servidor (otra pestaña, sin caché compartida de esta sesión)
  const n = await page.evaluate(async () => {
    const fs = await import("/js/data/firestore.js");
    const { getState } = await import("/js/core/state.js");
    const snap = await fs.getDocs(fs.query(fs.col(getState().user.uid, "movimientos"), fs.where("nota", "==", "offline")));
    return snap.size;
  });
  esperar(n === 1, `en servidor hay ${n}`);
});

// ---------------- Verificar saldos ----------------
await paso("Verificar saldos: todo cuadra con los movimientos", async () => {
  await page.goto(URL_APP.replace(/#.*/, "") + "#/configuracion");
  await page.click('[data-accion="verificar"]');
  await page.waitForSelector(".aviso--ok", { timeout: 20000 });
  await page.keyboard.press("Escape");
});

// ---------------- Tema oscuro + capturas ----------------
await paso("modo oscuro: se aplica y se recuerda", async () => {
  await page.locator('.segmentado__opcion:has(input[value="dark"])').click();
  esperar((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "sin data-theme");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  esperar(bg === "rgb(11, 11, 13)", bg);
  await page.reload();
  await page.waitForSelector("#app-shell:not([hidden])");
  esperar((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "no se recordó");
});
for (const ruta of ["dashboard", "movimientos", "cajas", "cuentas", "plan", "mas", "configuracion"]) {
  await paso(`modo oscuro: pantalla ${ruta} sin errores`, async () => {
    await page.goto(URL_APP.replace(/#.*/, "") + `#/${ruta}`);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/oscuro-${ruta}.png`, fullPage: true });
  });
}
await paso("modo oscuro: hoja de nuevo movimiento", async () => {
  await page.click(".tabbar__nuevo");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/oscuro-nuevo-movimiento.png` });
  await page.keyboard.press("Escape");
});
await paso("tema 'Sistema' sigue al sistema operativo", async () => {
  await page.goto(URL_APP.replace(/#.*/, "") + "#/configuracion");
  await page.locator('.segmentado__opcion:has(input[value="system"])').click();
  await page.emulateMedia({ colorScheme: "dark" });
  esperar((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(11, 11, 13)", "no oscuro");
  await page.emulateMedia({ colorScheme: "light" });
  esperar((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(242, 242, 247)", "no claro");
});

// ---------------- Desktop ----------------
await paso("desktop: sidebar, tabla y paginación numerada", async () => {
  const d = await (await nuevoContexto({ width: 1366, height: 900 })).newPage();
  d.on("pageerror", (e) => erroresConsola.push(e.message));
  await d.goto(URL_APP.replace(/#.*/, "") + "#/dashboard");
  await d.fill("#login-email", EMAIL);
  await d.fill("#login-password", PASS);
  await d.click("#login-btn");
  await d.waitForSelector(".hero");
  esperar(await d.locator(".sidebar").isVisible(), "sin sidebar");
  esperar(!(await d.locator(".tabbar").isVisible()), "tabbar visible en desktop");
  await d.screenshot({ path: `${SHOTS}/06-dashboard-desktop.png`, fullPage: true });
  await d.click('.sidebar__item:has-text("Movimientos")');
  await d.waitForSelector(".paginacion__desktop .pag-num--actual");
  await d.click('.paginacion__desktop [data-pag="next"]');
  await d.waitForFunction(() => document.querySelector(".pag-num--actual")?.textContent === "2");
  await d.click('.paginacion__desktop [data-pag="1"]');
  await d.waitForFunction(() => document.querySelector(".pag-num--actual")?.textContent === "1");
  await d.screenshot({ path: `${SHOTS}/07-movimientos-desktop.png`, fullPage: false });
});

await paso("sin errores de JavaScript en consola", async () => {
  // Se excluyen los errores provocados a propósito (contraseña incorrecta, red cortada).
  const reales = erroresConsola.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource|net::ERR|auth\/(wrong-password|invalid-credential)/.test(e));
  esperar(reales.length === 0, reales.join(" | "));
});

await browser.close();
console.log(`\n${ok} de ${ok + fallas.length} pasos correctos`);
process.exit(fallas.length ? 1 : 0);

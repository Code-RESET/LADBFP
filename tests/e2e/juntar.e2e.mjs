// ============================================================
// tests/e2e/juntar.e2e.mjs — v1.13.0: Juntar con otra caja.
// Dev: emuladores + servidor local (ver e2e.mjs).
//   Caso de Angel: «Alarmas RST» (vieja, desactivada) se quedó con
//   la deuda de la tarjeta y el pago que salió de Mercado Pago
//   (−$8,190.62 ahí), y «Alarmas REST» tiene los $9,779.46 de
//   Mercado Pago, que en el banco son $1,588.84. Avisos en Mis
//   cajas, Cajas y Revisar mis datos; «Juntar» deja la vieja en $0
//   sin tocar ningún banco, pasa su gasto fijo y su tarjeta, y
//   Deshacer regresa todo; también desde la hoja de la caja.
// ============================================================
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
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
const CREDITO = { diaCorte: dia(sumarDias(HOY, -5)), diaLimite: dia(sumarDias(HOY, 15)) };

await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "juntar@code-reset.mx", password: "secreto123", returnSecureToken: true }),
}).catch(() => {});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
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
async function esperarTexto(sel, fragmento, timeout = 10000) {
  await page.waitForFunction(([s, f]) => document.querySelector(s)?.innerText.includes(f), [sel, fragmento], { timeout })
    .catch(async () => { throw new Error(`«${fragmento}» no aparece en ${sel}: ${await page.locator(sel).first().innerText().catch(() => "(no existe)")}`); });
}
const estado = () => page.evaluate(async () => {
  const { getState } = await import("/js/core/state.js");
  const { saldosPor } = await import("/js/domain/saldos.js");
  const s = getState();
  const cajas = saldosPor(s.agregados, "porCaja");
  const cuentas = saldosPor(s.agregados, "porCuenta");
  const marcela = s.obligaciones.find((o) => o.id === "marcela");
  return {
    rst: cajas["alarmas-rst"] || 0, rest: cajas["reset-alarmas"] || 0, mp: cuentas["mercado-pago"] || 0, azul: cuentas.azul || 0,
    rstActiva: s.cajas.find((c) => c.id === "alarmas-rst")?.activa !== false,
    marcela: `${marcela?.cajaId}/${marcela?.cuentaId}`, cajaAzul: s.cuentas.find((c) => c.id === "azul")?.cajaPredeterminadaId,
  };
});
const esperarEstado = async (f, timeout = 8000) => {
  const fin = Date.now() + timeout;
  let e;
  while (Date.now() < fin) { e = await estado(); if (f(e)) return e; await page.waitForTimeout(200); }
  throw new Error(JSON.stringify(e));
};
const hallazgos = () => page.evaluate(async () => {
  const { getState } = await import("/js/core/state.js");
  const { diagnosticar } = await import("/js/domain/diagnostico.js");
  const { hoy } = await import("/js/core/dates.js");
  return diagnosticar({ ...getState(), hoy: hoy() }).map((x) => x.titulo);
});
const filaCaja = (nombre) => page.locator(`.seccion:has(.total-cajas) .fila:has(.fila__titulo:text-is("${nombre}"))`);

await page.goto(URL_APP);
await page.fill("#login-email", "juntar@code-reset.mx"); await page.fill("#login-password", "secreto123"); await page.click("#login-btn");

await paso("preparación: «Alarmas REST» con $9,779.46 en Mercado Pago y «Alarmas RST» (vieja) con la tarjeta Azul y el pago desde Mercado Pago; luego se desactiva", async () => {
  await page.click('[data-accion="sembrar"]', { timeout: 15000 });
  await page.waitForSelector(".form-saldos");
  await page.click('.form-saldos button[type="submit"]');
  await page.waitForSelector(".hero");
  await page.evaluate(async ({ credito, hoy }) => {
    const { getState } = await import("/js/core/state.js");
    const { cajasRepo, cuentasRepo } = await import("/js/data/catalogosRepo.js");
    const { movimientosRepo } = await import("/js/data/movimientosRepo.js");
    const { obligacionesRepo } = await import("/js/data/planRepo.js");
    const uid = getState().user.uid;
    cajasRepo.guardar(uid, { id: "reset-alarmas", nombre: "Alarmas REST" });
    cajasRepo.guardar(uid, { id: "alarmas-rst", nombre: "Alarmas RST", tipo: "operativa", color: "#22C55E", cuentaPredeterminadaId: "bbva-hd", disponibleParaGasto: true, activa: true, orden: 9 });
    cuentasRepo.guardar(uid, { id: "azul", nombre: "Azul", institucion: "BBVA", tipo: "credito", credito, cajaPredeterminadaId: "alarmas-rst", activa: true, orden: 9 });
    movimientosRepo.crearVarios(uid, [
      { tipo: "apertura", fecha: hoy, montoCentavos: 977946, cajaId: "reset-alarmas", cuentaId: "mercado-pago", nota: "Saldo inicial" },
      { tipo: "gasto", fecha: hoy, montoCentavos: 1083371, cajaId: "alarmas-rst", cuentaId: "azul", categoriaId: "ga-casa", nota: "Compras con Azul" },
      { tipo: "transferencia", fecha: hoy, montoCentavos: 819062, cajaId: "alarmas-rst", cuentaId: "mercado-pago", cajaDestinoId: "alarmas-rst", cuentaDestinoId: "azul", nota: "Pago tarjeta Azul" },
    ]);
    obligacionesRepo.guardar(uid, { id: "marcela", nombre: "Dra. Marcela", montoCentavos: 300000, variable: false, regla: { frecuencia: "mensual", diaMes: 28, desde: `${hoy.slice(0, 7)}-01` },
      cajaId: "alarmas-rst", cuentaId: "bbva-hd", categoriaId: "ga-casa", activa: true });
    cajasRepo.activar(uid, "alarmas-rst", false);
  }, { credito: CREDITO, hoy: HOY });
  const e = await esperarEstado((x) => !x.rstActiva && x.azul === -264309);
  esperar(e.rst === -1083371 && e.rest === 977946 && e.mp === 158884, JSON.stringify(e));
});

await paso("avisos: Mis cajas marca «desactivada», Cajas ofrece juntarla y Revisar mis datos lo dice", async () => {
  await esperarTexto(".seccion:has(.total-cajas)", "desactivada");
  const f = await filaCaja("Alarmas RST").innerText();
  esperar(f.includes("Mercado Pago, BBVA HD · desactivada") || f.includes("desactivada"), f);
  esperar(f.includes("-$10,833.71") && f.includes("💳 debes $2,643.09"), f);
  await ir("cajas");
  await esperarTexto(".juntar__aviso", "«Alarmas RST» está desactivada pero no quedó en $0: tiene -$10,833.71");
  const h = await hallazgos();
  esperar(h.includes("«Alarmas RST» está desactivada pero tiene -$10,833.71"), h.join(" | "));
});

await paso("hoja «Juntar»: lo que tiene, sugiere «Alarmas REST» y muestra cómo queda (Mercado Pago $1,588.84, debe $2,643.09)", async () => {
  await page.click(".juntar__aviso [data-juntar]");
  await hojaLista();
  const t = await texto(".capa");
  esperar(t.includes("Lo que tiene «Alarmas RST»") && t.includes("Mercado Pago") && t.includes("-$8,190.62") && t.includes("💳 Azul") && t.includes("debe $2,643.09"), t);
  esperar(t.includes("También la usan: 1 gasto fijo · 1 banco o tarjeta"), t);
  const marcada = await page.locator('.capa input[name="aId"]:checked').evaluateAll((els) => els.map((e) => e.value));
  esperar(JSON.stringify(marcada) === '["reset-alarmas"]', `sugerida: ${marcada}`);
  const r = await texto(".juntar__resultado");
  esperar(r.includes("Así queda «Alarmas REST»") && r.includes("$1,588.84") && r.includes("debe $2,643.09") && r.includes("-$1,054.25"), r);
  esperar(r.includes("se pagarán desde Mercado Pago"), r);
  esperar((await texto('.capa [data-boton]')) === "Juntar con Alarmas REST", await texto('.capa [data-boton]'));
  await page.screenshot({ path: `${SHOTS}/jn-hoja.png` });
});

await paso("Juntar: «Alarmas RST» en $0, todo en «Alarmas REST»; Mercado Pago y la tarjeta igual; pasan su gasto fijo y la tarjeta", async () => {
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector('.toast:has-text("«Alarmas RST» quedó junto con «Alarmas REST»")');
  const e = await esperarEstado((x) => x.rst === 0);
  esperar(e.rest === -105425 && e.mp === 158884 && e.azul === -264309 && !e.rstActiva, JSON.stringify(e));
  esperar(e.marcela === "reset-alarmas/mercado-pago" && e.cajaAzul === "reset-alarmas", JSON.stringify(e));
  await page.waitForFunction(() => !document.querySelector(".juntar__aviso"));
  esperar(!(await hallazgos()).some((x) => x.includes("Alarmas RST")), (await hallazgos()).join(" | "));
});

await paso("Deshacer regresa todo (saldos, gasto fijo y tarjeta)", async () => {
  await page.click('.toast:has-text("quedó junto") .toast__accion');
  const e = await esperarEstado((x) => x.rst === -1083371 && x.marcela === "alarmas-rst/bbva-hd");
  esperar(e.rest === 977946 && e.mp === 158884 && e.cajaAzul === "alarmas-rst" && !e.rstActiva, JSON.stringify(e));
  await esperarTexto(".juntar__aviso", "Alarmas RST");
});

await paso("desde la hoja de la caja (Desactivadas → Alarmas RST → Juntar con otra caja): se cierran las dos hojas y sigue en Cajas", async () => {
  await page.click('.lista.atenuada [data-caja="alarmas-rst"]');
  await hojaLista();
  await page.click('.capa [data-accion="juntar"]');
  await page.waitForFunction(() => document.querySelectorAll(".capa").length === 2 && document.querySelector(".capa:last-of-type .juntar"));
  await page.waitForTimeout(300);
  await page.click('.capa:last-of-type button[type="submit"]');
  await sinHojas();
  await page.waitForSelector('.toast:has-text("quedó junto")');
  esperar(page.url().endsWith("#/cajas"), page.url());
  const e = await esperarEstado((x) => x.rst === 0);
  esperar(e.rest === -105425 && e.marcela === "reset-alarmas/mercado-pago", JSON.stringify(e));
});

await paso("Bancos → Mercado Pago: todo el dinero es de «Alarmas REST» ($1,588.84); Mis cajas ya no muestra la vieja", async () => {
  await ir("cuentas");
  await page.click('[data-cuenta="mercado-pago"]');
  await hojaLista();
  const t = await texto(".capa .sublista");
  esperar(t.includes("Alarmas REST") && t.includes("$1,588.84") && !t.includes("Alarmas RST"), t);
  await page.keyboard.press("Escape");
  await sinHojas();
  await ir("dashboard");
  await page.waitForSelector(".seccion .total-cajas");
  esperar(!(await filaCaja("Alarmas RST").count()), "la caja vieja ya quedó en $0");
  const f = await filaCaja("Alarmas REST").innerText();
  esperar(f.includes("Mercado Pago") && f.includes("💳 debes $2,643.09") && f.includes("-$1,054.25"), f);
});

await paso("sin errores de JavaScript", async () => esperar(errores.length === 0, errores.join(" | ")));
await browser.close();
console.log(`\n${ok} de ${ok + fallas.length} pasos correctos`);
process.exit(fallas.length ? 1 : 0);

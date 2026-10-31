// ============================================================
// tests/e2e/tarjetas.e2e.mjs — v1.9.0: Tarjetas de crédito y
// meses sin intereses. Dev: emuladores + servidor local (ver e2e.mjs).
//   Alta de tarjeta con deuda inicial · compra con tarjeta desde el
//   registro rápido (la caja baja, el banco no) · compra a 12 MSI
//   (no cuenta hoy; la mensualidad sale en Mi mes) · pagar la
//   tarjeta (no es gasto; Deshacer) · ☐ de la mensualidad · compra
//   a meses que ya tenía · liquidar · Bancos sin tarjetas.
// ============================================================
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { primeraMensualidad, fechaLimiteDe, corteAnterior } from "../../js/domain/tarjetas.js";
import { formatFecha, sumarDias, mesDe } from "../../js/core/dates.js";

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

// Corte hace 5 días y fecha límite 20 días después del corte (en 15 días): la deuda inicial está "por pagar".
const CORTE = sumarDias(hoyMx, -5);
const CREDITO = { diaCorte: Number(CORTE.slice(8)), diaLimite: Number(sumarDias(CORTE, 20).slice(8)) };
const LIMITE_PAGO = fechaLimiteDe(corteAnterior(CREDITO, hoyMx), CREDITO);
const PRIMERA_MSI = primeraMensualidad(CREDITO, hoyMx); // la pantalla comprada hoy

async function crearUsuario(email) {
  await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "secreto123", returnSecureToken: true }),
  }).catch(() => {});
}
await crearUsuario("tarjetas@code-reset.mx");

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
const saldos = () => page.evaluate(async () => {
  const { getState } = await import("/js/core/state.js");
  const { saldosPor } = await import("/js/domain/saldos.js");
  const s = getState();
  const cajas = saldosPor(s.agregados, "porCaja");
  const cuentas = saldosPor(s.agregados, "porCuenta");
  return { ...Object.fromEntries(s.cajas.map((c) => [c.nombre, cajas[c.id] || 0])), ...Object.fromEntries(s.cuentas.map((c) => [`banco:${c.nombre}`, cuentas[c.id] || 0])) };
});
const tarjetaTexto = () => texto('.tarjeta-credito:has-text("Liverpool")');
async function esperarTexto(sel, fragmento, timeout = 10000) {
  await page.waitForFunction(([s, f]) => document.querySelector(s)?.innerText.includes(f), [sel, fragmento], { timeout })
    .catch(async () => { throw new Error(`«${fragmento}» no aparece en ${sel}: ${await page.locator(sel).first().innerText().catch(() => "(no existe)")}`); });
}
async function nuevoGasto({ nombre, monto, caja, tarjeta = null, meses = null }) {
  await page.click('#seccion-gastos [data-nuevo="gasto"]');
  await hojaLista();
  await page.fill('.capa input[name="nombre"]', nombre);
  await page.fill('.capa input[name="monto"]', monto);
  if (tarjeta) await page.click(`.capa .chip:has(input[name="pagoCon"]):has-text("${tarjeta}")`);
  await page.click(`.capa .chip:has(input[name="cajaId"]):has-text("${caja}")`);
  if (meses) {
    await page.check('.capa input[name="msi"]');
    await page.click(`.capa .segmentado__opcion:has(input[name="meses"][value="${meses}"])`);
  }
  await page.click('.capa button[type="submit"]');
  await sinHojas();
}

await page.goto(URL_APP);
await page.fill("#login-email", "tarjetas@code-reset.mx"); await page.fill("#login-password", "secreto123"); await page.click("#login-btn");

await paso("preparación: cajas y saldos iniciales (HD Crédit $50,000 en BBVA, Sueldo personal $10,000 en Nu)", async () => {
  await page.click('[data-accion="sembrar"]', { timeout: 15000 });
  await page.waitForSelector(".form-saldos");
  await page.waitForFunction(() => document.querySelectorAll(".form-saldos select option").length > 5);
  await page.fill('input[name="monto-hd-credit"]', "50000");
  await page.fill('input[name="monto-sueldo-personal"]', "10000");
  await page.click('.form-saldos button[type="submit"]');
  await page.waitForSelector(".hero");
  esperar(!(await page.locator("#seccion-tarjetas").count()), "sin tarjetas no hay sección Tarjetas en Mi mes");
  esperar(!(await page.locator('.capa input[name="pagoCon"]').count()), "sin tarjetas no se pregunta con qué pagaste");
});

await paso("Tarjetas: vacío → alta de Liverpool (corte, límite de pago, límite $30,000) que ya debía $4,000", async () => {
  await page.click('.tabbar a[href="#/mas"]');
  await page.click('#app-content a[href="#/tarjetas"]');
  await page.waitForSelector('.hoja-vacia[data-accion="nueva-tarjeta"]');
  await page.click('.hoja-vacia[data-accion="nueva-tarjeta"]');
  await hojaLista();
  await page.fill('.capa input[name="nombre"]', "Liverpool");
  await page.fill('.capa input[name="diaCorte"]', String(CREDITO.diaCorte));
  await page.fill('.capa input[name="diaLimite"]', String(CREDITO.diaLimite));
  await page.fill('.capa input[name="limite"]', "30000");
  await page.fill('.capa input[name="deuda"]', "4000");
  await page.click('.capa button[type="submit"]');
  await esperarTexto('.capa [data-error="cajaId"]', "Elige con qué caja la pagas");
  await page.click('.capa .chip:has(input[name="cajaId"]):has-text("Sueldo personal")');
  await page.screenshot({ path: `${SHOTS}/tc-nueva.png` });
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await esperarTexto('.tarjeta-credito', "Paga $4,000");
  const t = await tarjetaTexto();
  esperar(t.includes("Debes $4,000") && t.includes("Disponible $26,000 de $30,000") && t.includes(formatFecha(LIMITE_PAGO)), t);
  esperar(t.includes("La pagas con Sueldo personal"), t);
  const s = await saldos();
  esperar(s["Sueldo personal"] === 600000 && s["banco:Nu"] === 1000000 && s["banco:Liverpool"] === -400000, JSON.stringify(s));
});

await paso("Bancos: Liverpool no aparece como banco; hay acceso a Tarjetas de crédito", async () => {
  await ir("cuentas");
  await page.waitForSelector('#app-content a[href="#/tarjetas"]');
  const t = await texto("#app-content");
  esperar(t.includes("BBVA HD") && t.includes("Tarjetas de crédito") && !(await page.locator('[data-cuenta]:has-text("Liverpool")').count()), t);
  esperar((await texto('#app-content a[href="#/tarjetas"]')).includes("Liverpool"), "el acceso debería nombrar la tarjeta");
});

await paso("registro rápido: Gasolina $800 pagada con Liverpool → la caja baja, el banco no", async () => {
  await ir("dashboard");
  await page.waitForSelector("#seccion-tarjetas");
  await page.click('#seccion-gastos [data-nuevo="gasto"]');
  await hojaLista();
  esperar(await page.locator('.capa .pago-con').isVisible(), "debería preguntar con qué pagaste");
  esperar(!(await page.locator('.capa input[name="msi"]').isVisible()), "meses sin intereses solo con tarjeta");
  await page.keyboard.press("Escape");
  await sinHojas();
  await nuevoGasto({ nombre: "Gasolina", monto: "800", caja: "Sueldo personal", tarjeta: "Liverpool" });
  await esperarTexto("#seccion-gastos", "Gasolina");
  const fila = await texto('#seccion-gastos .fila--hoja:has-text("Gasolina")');
  esperar(fila.includes("💳 Liverpool") && fila.includes("$800"), fila);
  const s = await saldos();
  esperar(s["Sueldo personal"] === 520000 && s["banco:Nu"] === 1000000 && s["banco:Liverpool"] === -480000, JSON.stringify(s));
});

await paso("compra a 12 meses sin intereses: Pantalla $12,000 → no cuenta hoy; la mensualidad sale en su mes", async () => {
  const gastosAntes = await texto("#seccion-gastos .seccion__titulo");
  await nuevoGasto({ nombre: "Pantalla", monto: "12000", caja: "Sueldo personal", tarjeta: "Liverpool", meses: 12 });
  await page.waitForSelector(".toast", { hasText: "a 12 meses" });
  esperar((await texto("#seccion-gastos .seccion__titulo")) === gastosAntes, "la compra a meses no debe sumar a los gastos de hoy");
  esperar(!(await page.locator('#seccion-gastos .fila--hoja:has-text("Pantalla")').count()) || mesDe(PRIMERA_MSI) === mesDe(hoyMx), "no debería salir este mes");
  const s = await saldos();
  esperar(s["Sueldo personal"] === 520000 && s["banco:Liverpool"] === -480000, JSON.stringify(s));
  await ir(`dashboard?mes=${mesDe(PRIMERA_MSI)}`);
  await esperarTexto("#seccion-gastos", "Pantalla");
  const fila = await texto('#seccion-gastos .fila--hoja:has-text("Pantalla")');
  esperar(fila.includes("Pantalla 1 de 12") && fila.includes("Sueldo personal · 💳 Liverpool") && fila.includes("$1,000.00"), fila);
  await page.screenshot({ path: `${SHOTS}/tc-mi-mes-msi.png`, fullPage: true });
});

await paso("Tarjetas: deuda total con la compra a meses; disponible baja $12,000", async () => {
  await ir("tarjetas");
  await esperarTexto(".tarjeta-credito", "Compras a meses");
  const t = await tarjetaTexto();
  esperar(t.includes("Debes $16,800") && t.includes("Disponible $13,200 de $30,000"), t);
  esperar(t.includes("Pantalla") && t.includes("1 de 12") && t.includes("$12,000.00"), t);
  esperar(t.includes("Paga $4,000") && t.includes("Compras después del corte"), t);
  await page.screenshot({ path: `${SHOTS}/tc-tarjetas.png`, fullPage: true });
});

await paso("pagar desde Mi mes $4,000 (para no generar intereses) desde Nu: no es gasto; Deshacer lo regresa", async () => {
  await ir("dashboard");
  await esperarTexto("#seccion-tarjetas", "Paga $4,000");
  const gastos = await texto("#seccion-gastos .seccion__titulo");
  await page.click('#seccion-tarjetas [data-pagar-tarjeta]');
  await hojaLista();
  const hoja = await texto(".capa");
  esperar(hoja.includes("Para no generar intereses: $4,000.00") && hoja.includes("Todo lo que debes · $4,800.00"), hoja);
  esperar((await page.locator('.capa input[name="monto"]').inputValue()) === "4000.00", "monto sugerido");
  await page.click('.capa .chip:has(input[name="bancoId"]):has-text("Nu")');
  await page.screenshot({ path: `${SHOTS}/tc-pagar.png` });
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector(".toast", { hasText: "Pagaste $4,000.00 a Liverpool" });
  await esperarTexto("#seccion-tarjetas", "Al corriente");
  let s = await saldos();
  esperar(s["Sueldo personal"] === 520000 && s["banco:Nu"] === 600000 && s["banco:Liverpool"] === -80000, JSON.stringify(s));
  esperar((await texto("#seccion-gastos .seccion__titulo")) === gastos, "pagar la tarjeta no es gasto");
  await page.click(".toast__accion"); // Deshacer
  await esperarTexto("#seccion-tarjetas", "Paga $4,000");
  s = await saldos();
  esperar(s["banco:Nu"] === 1000000 && s["banco:Liverpool"] === -480000, JSON.stringify(s));
});

await paso("pagar todo lo que debes ($4,800) desde Tarjetas → solo quedan las compras a meses", async () => {
  await ir("tarjetas");
  await esperarTexto(".tarjeta-credito", "Paga $4,000");
  await page.click('.tarjeta-credito [data-pagar]');
  await hojaLista();
  await page.click('.capa .chip-boton:has-text("Todo lo que debes")');
  esperar((await page.locator('.capa input[name="monto"]').inputValue()) === "4800.00", "monto de todo");
  await page.click('.capa .chip:has(input[name="bancoId"]):has-text("Nu")');
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await esperarTexto(".tarjeta-credito", "Solo te faltan tus compras a meses");
  const s = await saldos();
  esperar(s["Sueldo personal"] === 520000 && s["banco:Nu"] === 520000 && s["banco:Liverpool"] === 0, JSON.stringify(s));
});

await paso("mensualidad ☐ → ☑ en Mi mes: sale del banco de la caja y la tarjeta muestra la 2 de 12", async () => {
  await ir(`dashboard?mes=${mesDe(PRIMERA_MSI)}`);
  await esperarTexto("#seccion-gastos", "Pantalla");
  await page.locator('#seccion-gastos .fila--hoja:has-text("Pantalla") button.casilla').click();
  await page.waitForSelector('#seccion-gastos .fila--hoja:has-text("Pantalla") button.casilla[aria-checked="true"]');
  await page.waitForTimeout(400);
  const s = await saldos();
  esperar(s["Sueldo personal"] === 420000 && s["banco:Nu"] === 420000 && s["banco:Liverpool"] === 0, JSON.stringify(s));
  await ir("tarjetas");
  await esperarTexto(".tarjeta-credito", "2 de 12");
  esperar((await tarjetaTexto()).includes("Debes $11,000"), await tarjetaTexto());
});

await paso("compra a meses que ya tenía: Refri $9,000 a 6 meses con 2 pagadas → faltan 4 de $1,500", async () => {
  await page.click('.tarjeta-credito [data-nueva-msi]');
  await hojaLista();
  await page.fill('.capa input[name="descripcion"]', "Refri");
  await page.fill('.capa input[name="monto"]', "9000");
  await page.click('.capa .segmentado__opcion:has(input[name="meses"][value="6"])');
  await page.click('.capa .chip:has(input[name="cajaId"]):has-text("HD Crédit")');
  await page.click(".capa details.mas-detalles summary");
  await page.fill('.capa input[name="pagadas"]', "2");
  await esperarTexto(".capa [data-resumen]", "Faltan 4 pagos de $1,500.00");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await esperarTexto(".tarjeta-credito", "Refri");
  const t = await tarjetaTexto();
  esperar(t.includes("3 de 6") && t.includes("$6,000.00") && t.includes("Debes $17,000"), t);
});

await paso("compra con pagos: solo se cambia nombre y caja; liquidar el Refri ($6,000) desde BBVA como gasto de hoy", async () => {
  await page.click('.tarjeta-credito [data-msi]:has-text("Pantalla")');
  await hojaLista();
  esperar((await texto(".capa")).includes("Ya pagaste $1,000.00"), await texto(".capa"));
  esperar(!(await page.locator('.capa input[name="monto"]').count()), "con pagos ya no se cambia el precio");
  await page.keyboard.press("Escape");
  await sinHojas();
  await page.click('.tarjeta-credito [data-msi]:has-text("Refri")');
  await hojaLista();
  await page.click('.capa [data-accion="liquidar"]');
  await page.waitForFunction(() => document.querySelector(".capa--visible .capa__titulo")?.innerText.includes("Terminar de pagar"));
  await page.waitForTimeout(300);
  esperar((await texto(".capa")).includes("Falta: $6,000.00 (4 mensualidades)"), await texto(".capa"));
  await page.click('.capa .chip:has(input[name="bancoId"]):has-text("BBVA HD")');
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForFunction(() => ![...document.querySelectorAll('.tarjeta-credito [data-msi]')].some((b) => b.innerText.includes("Refri")));
  const s = await saldos();
  esperar(s["HD Crédit"] === 4400000 && s["banco:BBVA HD"] === 4400000, JSON.stringify(s));
  esperar((await tarjetaTexto()).includes("Debes $11,000"), await tarjetaTexto());
  await ir("dashboard");
  await esperarTexto("#seccion-gastos", "Refri (liquidación)");
});

await paso("Revisar mis datos: nada que corregir en tarjetas ni cajas", async () => {
  const h = await page.evaluate(async () => {
    const { getState } = await import("/js/core/state.js");
    const { diagnosticar } = await import("/js/domain/diagnostico.js");
    const { hoy } = await import("/js/core/dates.js");
    return diagnosticar({ ...getState(), hoy: hoy() }).map((x) => x.titulo);
  });
  esperar(!h.some((t) => t.includes("Liverpool") || t.includes("negativo") || t.includes("compra a meses")), h.join(" | "));
});

await paso("modo oscuro: Tarjetas y Mi mes", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await ir("tarjetas");
  await page.waitForSelector(".tarjeta-credito");
  await page.screenshot({ path: `${SHOTS}/tc-tarjetas-oscuro.png`, fullPage: true });
  await ir("dashboard");
  await page.waitForSelector("#seccion-tarjetas");
  await page.screenshot({ path: `${SHOTS}/tc-mi-mes-oscuro.png`, fullPage: true });
});

await paso("sin errores de JavaScript", async () => esperar(errores.length === 0, errores.join(" | ")));
await browser.close();
console.log(`\n${ok} de ${ok + fallas.length} pasos correctos`);
process.exit(fallas.length ? 1 : 0);

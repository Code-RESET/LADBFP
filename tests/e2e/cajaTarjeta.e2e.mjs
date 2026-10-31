// ============================================================
// tests/e2e/cajaTarjeta.e2e.mjs — v1.12.0: la caja que paga la
// tarjeta. Dev: emuladores + servidor local (ver e2e.mjs).
//   Caso de Angel: compras con la tarjeta anotadas en la caja del
//   efectivo («se suma a efectivo»). Mis cajas lo dice; la tarjeta
//   sin caja pide elegirla y la recuerda; con tarjeta la caja se
//   elige sola (y regresa con «Débito / efectivo»); «Pasar todo»
//   deja el efectivo completo sin cambiar lo que debes (Deshacer);
//   cambiar la caja de la tarjeta ofrece pasar lo de antes; el pago
//   y las compras a meses usan la caja de la tarjeta.
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
// Corte hace 5 días y pago en 15: nada vencido (el aviso «Por pagar» no estorba).
const CREDITO = { diaCorte: dia(sumarDias(HOY, -5)), diaLimite: dia(sumarDias(HOY, 15)) };
const AYER = sumarDias(HOY, -1);

await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "cajatarjeta@code-reset.mx", password: "secreto123", returnSecureToken: true }),
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
async function esperarTexto(sel, fragmento, timeout = 10000) {
  await page.waitForFunction(([s, f]) => document.querySelector(s)?.innerText.includes(f), [sel, fragmento], { timeout })
    .catch(async () => { throw new Error(`«${fragmento}» no aparece en ${sel}: ${await page.locator(sel).first().innerText().catch(() => "(no existe)")}`); });
}
const saldos = () => page.evaluate(async () => {
  const { getState } = await import("/js/core/state.js");
  const { saldosPor } = await import("/js/domain/saldos.js");
  const s = getState();
  const cajas = saldosPor(s.agregados, "porCaja");
  const cuentas = saldosPor(s.agregados, "porCuenta");
  return { ...Object.fromEntries(s.cajas.map((c) => [c.nombre, cajas[c.id] || 0])), ...Object.fromEntries(s.cuentas.map((c) => [`banco:${c.nombre}`, cuentas[c.id] || 0])) };
});
const esperarSaldos = async (f, timeout = 8000) => {
  const fin = Date.now() + timeout;
  let s;
  while (Date.now() < fin) { s = await saldos(); if (f(s)) return s; await page.waitForTimeout(200); }
  throw new Error(JSON.stringify(s));
};
const cajaDeAzul = () => page.evaluate(async () => (await import("/js/core/state.js")).cuentaPorId("azul")?.cajaPredeterminadaId || "");
const cajaMarcada = () => page.locator('.capa input[name="cajaId"]:checked').evaluateAll((els) => els.map((e) => e.value));
const filaCaja = (nombre) => page.locator(`.seccion:has(.total-cajas) .fila:has(.fila__titulo:text-is("${nombre}"))`);
const tarjetaAzul = () => texto('.tarjeta-credito:has-text("Azul")');
const elegir = (nombre, valor) => page.click(`.capa .chip:has(input[name="${nombre}"]):has-text("${valor}")`);

await page.goto(URL_APP);
await page.fill("#login-email", "cajatarjeta@code-reset.mx"); await page.fill("#login-password", "secreto123"); await page.click("#login-btn");

await paso("preparación: Sueldo personal $10,000 (Nu), HD Crédit $50,000 (BBVA HD) y tarjeta Azul SIN caja con 3 compras anotadas en Sueldo personal ($1,462.08)", async () => {
  await page.click('[data-accion="sembrar"]', { timeout: 15000 });
  await page.waitForSelector(".form-saldos");
  await page.waitForFunction(() => document.querySelectorAll(".form-saldos select option").length > 5);
  await page.fill('input[name="monto-hd-credit"]', "50000");
  await page.fill('input[name="monto-sueldo-personal"]', "10000");
  await page.click('.form-saldos button[type="submit"]');
  await page.waitForSelector(".hero");
  await page.evaluate(async ({ credito, fecha }) => {
    const { getState } = await import("/js/core/state.js");
    const { cuentasRepo } = await import("/js/data/catalogosRepo.js");
    const { movimientosRepo } = await import("/js/data/movimientosRepo.js");
    const uid = getState().user.uid;
    cuentasRepo.guardar(uid, { id: "azul", nombre: "Azul", institucion: "BBVA", tipo: "credito", credito, activa: true, orden: 9 });
    const compra = (nota, monto) => ({ tipo: "gasto", fecha, montoCentavos: monto, cajaId: "sueldo-personal", cuentaId: "azul", categoriaId: "ga-casa", nota });
    movimientosRepo.crearVarios(uid, [compra("Gasolina", 59908), compra("Cafenio", 11500), compra("Anualidad", 74800)]);
  }, { credito: CREDITO, fecha: AYER });
  await esperarSaldos((s) => s["banco:Azul"] === -146208);
});

await paso("Mis cajas: Sueldo personal dice que debe $1,462.08 de tarjeta (por eso tiene menos que lo que hay en Nu)", async () => {
  await esperarTexto(".seccion:has(.total-cajas)", "💳 debes $1,462.08");
  const f = await filaCaja("Sueldo personal").innerText();
  esperar(f.includes("Nu\n💳 debes $1,462.08") && f.includes("$8,537.92"), f);
  esperar(!(await filaCaja("HD Crédit").innerText()).includes("💳"), await filaCaja("HD Crédit").innerText());
});

await paso("Tarjetas: Azul sin caja → «Elige con qué caja la pagas» y aún no ofrece pasar nada", async () => {
  await ir("tarjetas");
  await esperarTexto(".tarjeta-credito", "Elige con qué caja la pagas");
  esperar(!(await page.locator(".tarjeta-credito [data-pasar]").count()), "sin caja no hay a dónde pasar");
});

await paso("registro con 💳 Azul (sin caja): la caja queda sin elegir, la pide, y la que eliges se recuerda en la tarjeta", async () => {
  await ir("dashboard");
  await page.click('#seccion-gastos [data-nuevo="gasto"]');
  await hojaLista();
  await page.fill('.capa input[name="nombre"]', "Café");
  await page.fill('.capa input[name="monto"]', "50");
  esperar((await cajaMarcada()).length === 1, "al abrir hay una caja elegida");
  const etiqueta = async () => [await page.locator(".capa .campo__label .solo-pago-banco").isVisible(), await page.locator(".capa .campo__label .solo-pago-tarjeta").isVisible()];
  esperar(JSON.stringify(await etiqueta()) === "[true,false]", `con débito dice «Sale de»: ${await etiqueta()}`);
  await elegir("pagoCon", "Azul");
  esperar((await cajaMarcada()).length === 0, `con una tarjeta sin caja no se elige ninguna: ${await cajaMarcada()}`);
  esperar(JSON.stringify(await etiqueta()) === "[false,true]", `con tarjeta pregunta con qué caja la pagas: ${await etiqueta()}`);
  esperar((await texto(".capa .campo__label .solo-pago-tarjeta")) === "¿Con qué caja vas a pagar la tarjeta?", await texto(".capa .campo__label .solo-pago-tarjeta"));
  esperar(await page.locator('.capa .pago-con .solo-pago-tarjeta').isVisible(), "debe explicar que no baja el efectivo");
  await page.screenshot({ path: `${SHOTS}/ct-registro-sin-caja.png` });
  await page.click('.capa button[type="submit"]');
  await esperarTexto('.capa [data-error="cajaId"]', "Elige con qué caja vas a pagar la tarjeta");
  await elegir("cajaId", "HD Crédit");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector('.toast:has-text("Azul se paga con HD Crédit")');
  esperar((await cajaDeAzul()) === "hd-credit", await cajaDeAzul());
  const s = await esperarSaldos((x) => x["HD Crédit"] === 4995000);
  esperar(s["Sueldo personal"] === 853792 && s["banco:Azul"] === -151208 && s["banco:BBVA HD"] === 5000000 && s["banco:Nu"] === 1000000, JSON.stringify(s));
});

await paso("registro: al elegir 💳 Azul la caja cambia sola a HD Crédit; con «Débito / efectivo» regresa la que tenías", async () => {
  await page.click('#seccion-gastos [data-nuevo="gasto"]');
  await hojaLista();
  await page.fill('.capa input[name="nombre"]', "Gasolina");
  await page.fill('.capa input[name="monto"]', "600");
  await elegir("cajaId", "Sueldo personal");
  await elegir("pagoCon", "Azul");
  esperar(JSON.stringify(await cajaMarcada()) === '["hd-credit"]', `con Azul: ${await cajaMarcada()}`);
  await elegir("pagoCon", "Débito / efectivo");
  esperar(JSON.stringify(await cajaMarcada()) === '["sueldo-personal"]', `de regreso a débito: ${await cajaMarcada()}`);
  // Un ingreso no se paga con tarjeta: al cambiar a Ingreso regresa a débito y a la caja de antes.
  await elegir("pagoCon", "Azul");
  await page.click('.capa .segmentado__opcion:has(input[name="tipo"][value="ingreso"])');
  const pago = await page.locator('.capa input[name="pagoCon"]:checked').inputValue();
  esperar(pago === "" && JSON.stringify(await cajaMarcada()) === '["sueldo-personal"]', `ingreso: pago «${pago}», caja ${await cajaMarcada()}`);
  await page.click('.capa .segmentado__opcion:has(input[name="tipo"][value="gasto"])');
  await elegir("pagoCon", "Azul");
  await page.screenshot({ path: `${SHOTS}/ct-registro-con-caja.png` });
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await esperarTexto("#seccion-gastos", "Gasolina");
  const fila = await texto('#seccion-gastos .fila--hoja:has-text("$600.00")');
  esperar(fila.includes("HD Crédit · 💳 Azul"), fila);
  const s = await esperarSaldos((x) => x["HD Crédit"] === 4935000);
  esperar(s["Sueldo personal"] === 853792 && s["banco:Azul"] === -211208, JSON.stringify(s));
});

await paso("Tarjetas: «La pagas con HD Crédit» y avisa que Sueldo personal debe $1,462.08 → «Pasar todo»: el efectivo queda completo, lo que debes igual", async () => {
  await ir("tarjetas");
  await esperarTexto(".tarjeta-credito", "La pagas con HD Crédit");
  await esperarTexto(".tarjeta-credito__otras", "Sueldo personal debe $1,462.08");
  await page.screenshot({ path: `${SHOTS}/ct-tarjetas-pasar.png`, fullPage: true });
  await page.click('.tarjeta-credito [data-pasar]');
  await page.waitForSelector('.toast:has-text("Todo lo de Azul lo paga ahora HD Crédit")');
  const s = await esperarSaldos((x) => x["Sueldo personal"] === 1000000);
  esperar(s["HD Crédit"] === 4788792 && s["banco:Azul"] === -211208 && s["banco:Nu"] === 1000000 && s["banco:BBVA HD"] === 5000000, JSON.stringify(s));
  await page.waitForFunction(() => !document.querySelector(".tarjeta-credito__otras"));
  esperar((await tarjetaAzul()).includes("Debes $2,112.08"), await tarjetaAzul());
});

await paso("Deshacer regresa todo; se vuelve a pasar con el botón", async () => {
  await page.click('.toast:has-text("Todo lo de Azul") .toast__accion');
  await esperarSaldos((x) => x["Sueldo personal"] === 853792 && x["HD Crédit"] === 4935000);
  await esperarTexto(".tarjeta-credito__otras", "Sueldo personal debe $1,462.08");
  await page.click('.tarjeta-credito [data-pasar]');
  await esperarSaldos((x) => x["Sueldo personal"] === 1000000 && x["HD Crédit"] === 4788792);
});

await paso("Editar la tarjeta: otra caja → ofrece pasar lo de antes (Cancelar no mueve nada); de regreso no pregunta", async () => {
  await page.click('.tarjeta-credito [data-editar]');
  await hojaLista();
  esperar(JSON.stringify(await cajaMarcada()) === '["hd-credit"]', `la caja de la tarjeta: ${await cajaMarcada()}`);
  await elegir("cajaId", "Sueldo personal");
  await page.click('.capa button[type="submit"]');
  await page.waitForSelector(".confirmacion");
  await page.waitForTimeout(300);
  const msg = await texto(".capa:has(.confirmacion)");
  esperar(msg.includes("¿Pasar todo a Sueldo personal?") && msg.includes("HD Crédit debe $2,112.08"), msg);
  await page.click(".confirmacion [data-cancelar]");
  await sinHojas();
  await esperarTexto(".tarjeta-credito", "La pagas con Sueldo personal");
  await esperarTexto(".tarjeta-credito__otras", "HD Crédit debe $2,112.08");
  const s = await saldos();
  esperar(s["Sueldo personal"] === 1000000 && s["HD Crédit"] === 4788792, JSON.stringify(s));
  await page.click('.tarjeta-credito [data-editar]');
  await hojaLista();
  await elegir("cajaId", "HD Crédit");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await esperarTexto(".tarjeta-credito", "La pagas con HD Crédit");
  await page.waitForTimeout(400);
  esperar(!(await page.locator(".confirmacion").count()) && !(await page.locator(".tarjeta-credito__otras").count()), "todo está en HD Crédit: no hay nada que pasar");
});

await paso("Editar y aceptar «Pasar todo»: sigue en Tarjetas y todo pasa a la caja nueva (y de regreso)", async () => {
  const cambiarA = async (caja, saldoSueldo) => {
    await page.click('.tarjeta-credito [data-editar]');
    await hojaLista();
    await elegir("cajaId", caja);
    await page.click('.capa button[type="submit"]');
    await page.waitForSelector(".confirmacion");
    await page.waitForTimeout(300);
    await page.click('.confirmacion button[type="submit"]');
    await sinHojas();
    await page.waitForSelector(`.toast:has-text("Todo lo de Azul lo paga ahora ${caja}")`);
    await esperarTexto(".tarjeta-credito", `La pagas con ${caja}`);
    esperar(page.url().endsWith("#/tarjetas"), page.url());
    const s = await esperarSaldos((x) => x["Sueldo personal"] === saldoSueldo);
    esperar(s["Sueldo personal"] + s["HD Crédit"] === 5788792 && s["banco:Azul"] === -211208, JSON.stringify(s));
  };
  await cambiarA("Sueldo personal", 788792);
  await cambiarA("HD Crédit", 1000000);
  await page.waitForTimeout(300);
  esperar(!(await page.locator(".tarjeta-credito__otras").count()), "todo quedó en HD Crédit");
});

await paso("Pagar: sugiere el banco de la caja que la paga (BBVA HD); compra a meses: sale de esa caja", async () => {
  await page.click('.tarjeta-credito [data-pagar]');
  await hojaLista();
  const banco = await page.locator('.capa input[name="bancoId"]:checked').evaluate((e) => e.closest(".chip").innerText);
  esperar(banco.includes("BBVA HD"), banco);
  await page.keyboard.press("Escape");
  await sinHojas();
  await page.click('.tarjeta-credito [data-nueva-msi]');
  await hojaLista();
  esperar(JSON.stringify(await cajaMarcada()) === '["hd-credit"]', `compra a meses: ${await cajaMarcada()}`);
  await page.keyboard.press("Escape");
  await sinHojas();
});

await paso("Mis cajas: el efectivo (Sueldo personal) completo; HD Crédit dice lo que debe de la tarjeta", async () => {
  await ir("dashboard");
  await esperarTexto(".seccion:has(.total-cajas)", "💳 debes $2,112.08");
  const sueldo = await filaCaja("Sueldo personal").innerText();
  const hd = await filaCaja("HD Crédit").innerText();
  esperar(!sueldo.includes("💳") && sueldo.includes("$10,000.00"), sueldo);
  esperar(hd.includes("BBVA HD\n💳 debes $2,112.08") && hd.includes("$47,887.92"), hd);
  await filaCaja("HD Crédit").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/ct-mis-cajas.png` });
});

await paso("modo oscuro: Tarjetas", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await ir("tarjetas");
  await page.waitForSelector(".tarjeta-credito__caja");
  await page.screenshot({ path: `${SHOTS}/ct-tarjetas-oscuro.png`, fullPage: true });
});

await paso("sin errores de JavaScript", async () => esperar(errores.length === 0, errores.join(" | ")));
await browser.close();
console.log(`\n${ok} de ${ok + fallas.length} pasos correctos`);
process.exit(fallas.length ? 1 : 0);

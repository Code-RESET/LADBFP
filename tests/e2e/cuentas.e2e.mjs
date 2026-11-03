// ============================================================
// tests/e2e/cuentas.e2e.mjs — v2.0.0: «Simplificar mi app» (solo cuentas).
// Dev: emuladores + servidor local (ver e2e.mjs).
//   Datos como los de Angel en modo cajas: «Alarmas REST» con los
//   $9,779.46 de Mercado Pago, «Alarmas RST» (vieja, desactivada)
//   con la tarjeta Azul y el pago que salió de Mercado Pago, HD Crédit
//   en BBVA HD y Code-Reset (no es para gastar) en Klar.
//   Simplificar descarga el respaldo y convierte todo: cada cuenta
//   dice lo de su banco, lo que debes queda en la tarjeta; Deshacer
//   regresa todo. Después: anotar con tarjeta (no baja ninguna cuenta),
//   pagarla, mover dinero, «Préstamos HD Crédit» (no es para gastar),
//   cuadrar sin cajas y editar un movimiento de antes sin descuadrar.
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
const EMAIL = "cuentas@code-reset.mx";

await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: "secreto123", returnSecureToken: true }),
}).catch(() => {});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
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
/** cajas = lo que ve la app (en modo cuentas, por cuenta); crudas = lo guardado en Firestore. */
const estado = () => page.evaluate(async () => {
  const { getState } = await import("/js/core/state.js");
  const { saldosPor } = await import("/js/domain/saldos.js");
  const s = getState();
  const marcela = s.obligaciones.find((o) => o.id === "marcela");
  return {
    modo: s.perfil?.config?.modo || "",
    cajas: saldosPor(s.agregados, "porCaja"), crudas: saldosPor(s.agregadosCrudos, "porCaja"), cuentas: saldosPor(s.agregados, "porCuenta"),
    activas: s.cajas.filter((c) => c.activa !== false).map((c) => c.id).sort(),
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
/** Lo que lista un grupo (el título se ve en mayúsculas: se busca por su texto y se lee la lista que le sigue). */
const listaDe = (selTitulo, titulo) => page.evaluate(([sel, t]) => {
  const p = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim() === t);
  return p?.nextElementSibling?.innerText ?? `(no hay grupo «${t}»)`;
}, [selTitulo, titulo]);
const grupo = (titulo) => listaDe("#seccion-cuentas .cuentas__grupo", titulo);
const grupoHoja = (titulo) => listaDe(".capa .simplificar__grupo", titulo);
const CUENTAS_ACTIVAS = JSON.stringify(["azul", "bbva-hd", "hsbc", "klar", "mercado-pago", "nu"]);

await page.goto(URL_APP);
await page.fill("#login-email", EMAIL); await page.fill("#login-password", "secreto123"); await page.click("#login-btn");

await paso("preparación (modo cajas): Alarmas REST en Mercado Pago, Alarmas RST vieja con la tarjeta Azul, HD Crédit y Code-Reset", async () => {
  await page.click('[data-accion="sembrar"]', { timeout: 15000 });
  await page.waitForSelector(".form-saldos");
  await page.waitForFunction(() => document.querySelectorAll(".form-saldos select option").length > 5);
  await page.fill('input[name="monto-personal-imss"]', "5000");
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
      { tipo: "apertura", fecha: hoy, montoCentavos: 5000000, cajaId: "hd-credit", cuentaId: "bbva-hd", nota: "Saldo inicial" },
      { tipo: "apertura", fecha: hoy, montoCentavos: 300000, cajaId: "code-reset", cuentaId: "klar", nota: "Saldo inicial" },
      { tipo: "gasto", fecha: hoy, montoCentavos: 1083371, cajaId: "alarmas-rst", cuentaId: "azul", categoriaId: "ga-casa", nota: "Compras con Azul" },
      { tipo: "transferencia", fecha: hoy, montoCentavos: 819062, cajaId: "alarmas-rst", cuentaId: "mercado-pago", cajaDestinoId: "alarmas-rst", cuentaDestinoId: "azul", nota: "Pago tarjeta Azul" },
    ]);
    obligacionesRepo.guardar(uid, { id: "marcela", nombre: "Dra. Marcela", montoCentavos: 300000, variable: false, regla: { frecuencia: "mensual", diaMes: 28, desde: `${hoy.slice(0, 7)}-01` },
      cajaId: "alarmas-rst", cuentaId: "bbva-hd", categoriaId: "ga-casa", activa: true });
    cajasRepo.activar(uid, "alarmas-rst", false);
  }, { credito: CREDITO, hoy: HOY });
  const e = await esperarEstado((x) => !x.activas.includes("alarmas-rst") && x.cuentas.azul === -264309 && x.cuentas.klar === 300000);
  esperar(e.modo === "" && e.cajas["alarmas-rst"] === -1083371 && e.cajas["reset-alarmas"] === 977946 && e.cuentas["mercado-pago"] === 158884, JSON.stringify(e));
});

await paso("Mi mes ofrece «Tu app puede ser más simple»; la hoja muestra cómo quedan tus cuentas", async () => {
  await ir("dashboard");
  await page.click(".simplificar-aviso", { timeout: 10000 });
  await hojaLista();
  esperar((await page.locator(".capa .simplificar").textContent()).includes("Así quedan tus cuentas"), "falta «Así quedan tus cuentas»");
  const gastar = await grupoHoja("Para gastar");
  esperar(gastar.includes("Mercado Pago") && gastar.includes("antes «Alarmas REST»") && gastar.includes("$1,588.84"), gastar);
  esperar(gastar.includes("BBVA HD") && gastar.includes("$50,000.00") && !gastar.includes("Klar"), gastar);
  const ahorro = await grupoHoja("Ahorro e inversión");
  esperar(ahorro.includes("Klar") && ahorro.includes("$3,000.00"), `Klar (Code-Reset) no es para gastar: ${ahorro}`);
  const tarjetas = await grupoHoja("Tarjetas");
  esperar(tarjetas.includes("💳 Azul") && tarjetas.includes("antes «Alarmas RST»") && tarjetas.includes("debes $2,643.09"), tarjetas);
  await page.screenshot({ path: `${SHOTS}/cu-hoja.png` });
});

await paso("«Descargar respaldo y simplificar»: primero el respaldo; luego cada cuenta = su banco y las cajas viejas en $0", async () => {
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.click(".capa [data-simplificar]")]);
  esperar(descarga.suggestedFilename() === `Finanzas_Reset_respaldo_${HOY}.json`, descarga.suggestedFilename());
  const respaldo = JSON.parse(readFileSync(await descarga.path(), "utf8"));
  esperar(respaldo.data.cajas.some((c) => c.nombre === "Alarmas RST") && respaldo.data.movimientos.length === 6, JSON.stringify(respaldo.conteos || {}));
  await sinHojas();
  await page.waitForSelector('.toast:has-text("tu app ahora usa solo cuentas")');
  const e = await esperarEstado((x) => x.modo === "cuentas" && x.crudas["reset-alarmas"] === 0 && x.crudas["alarmas-rst"] === 0);
  for (const k of ["mercado-pago", "bbva-hd", "hsbc", "klar", "azul"]) esperar(e.cajas[k] === e.cuentas[k] && e.crudas[k] === e.cuentas[k], `${k}: ${JSON.stringify(e)}`);
  esperar(e.cuentas["mercado-pago"] === 158884 && e.cuentas.azul === -264309 && e.cuentas["bbva-hd"] === 5000000, JSON.stringify(e));
  esperar(JSON.stringify(e.activas) === CUENTAS_ACTIVAS, JSON.stringify(e.activas));
  esperar(e.marcela === "bbva-hd/bbva-hd" && e.cajaAzul === "azul", JSON.stringify(e));
});

await paso("Deshacer regresa todo como estaba (cajas, gasto fijo y tarjeta)", async () => {
  await page.click('.toast:has-text("solo cuentas") .toast__accion');
  const e = await esperarEstado((x) => x.modo === "cajas" && x.cajas["reset-alarmas"] === 977946);
  esperar(e.cajas["alarmas-rst"] === -1083371 && e.marcela === "alarmas-rst/bbva-hd" && e.cajaAzul === "alarmas-rst", JSON.stringify(e));
  esperar(e.activas.includes("reset-alarmas") && !e.activas.includes("mercado-pago") && !e.activas.includes("alarmas-rst"), JSON.stringify(e.activas));
  await page.waitForSelector(".simplificar-aviso");
});

await paso("otra vez desde Más → «Simplificar mi app»: las cuentas se vuelven a activar", async () => {
  await ir("mas");
  await page.click('.fila[data-accion="simplificar"]');
  await hojaLista();
  await Promise.all([page.waitForEvent("download"), page.click(".capa [data-simplificar]")]);
  await sinHojas();
  const e = await esperarEstado((x) => x.modo === "cuentas" && x.crudas["reset-alarmas"] === 0);
  esperar(JSON.stringify(e.activas) === CUENTAS_ACTIVAS && e.cajas["mercado-pago"] === 158884 && e.cajas.azul === -264309, JSON.stringify(e));
});

await paso("Más: «Mis cuentas» en lugar de Cajas y Bancos; #/cajas lleva a Mis cuentas", async () => {
  await ir("mas");
  await page.waitForSelector('.fila__titulo:text-is("Mis cuentas")');
  for (const fuera of ["Cajas", "Bancos", "Simplificar mi app"]) esperar(!(await page.locator(`.fila__titulo:text-is("${fuera}")`).count()), `sigue «${fuera}»`);
  await ir("cajas");
  await esperarTexto(".hoja-vacia", "Tu app ya usa solo cuentas");
});

await paso("Mi mes: Mis cuentas (para gastar · ahorro, inversión y negocio · tarjetas) igual que el banco, sin cajas", async () => {
  await ir("dashboard");
  await page.waitForSelector("#seccion-cuentas");
  esperar(!(await page.locator(".simplificar-aviso").count()) && !(await page.locator(".total-cajas").count()), "aún se ven cajas");
  await esperarTexto("#seccion-cuentas", "Debes $2,643.09");
  const gastar = await grupo("Para gastar");
  esperar(gastar.includes("Mercado Pago") && gastar.includes("Antes: Alarmas REST") && gastar.includes("$1,588.84") && gastar.includes("BBVA HD") && !gastar.includes("Klar"), gastar);
  esperar((await grupo("Ahorro, inversión y negocio")).includes("Klar"), await grupo("Ahorro, inversión y negocio"));
  esperar((await grupo("Tarjetas")).includes("Azul"), await grupo("Tarjetas"));
  const r = await texto(".cuentas__resumen");
  esperar(r.includes("$59,588.84") && r.includes("$2,643.09") && r.includes("$56,945.75"), r);
  esperar(await page.locator(".mas-del-mes:not([open])").count() === 1, "el pronóstico y el Excel van plegados");
  await page.screenshot({ path: `${SHOTS}/cu-mi-mes.png`, fullPage: true });
});

await paso("«Anotar gasto» = qué, cuánto y con qué pagaste; con tarjeta no baja ninguna cuenta, sube lo que debes", async () => {
  await page.click(".tabbar__nuevo");
  await hojaLista();
  esperar(await page.locator(".capa .cuentas-con").count() === 1 && !(await page.locator(".capa .pago-con").count()), "faltan «¿Con qué pagaste?» o sobran cajas");
  const chips = await page.locator(".capa .cuentas-con .chip").allInnerTexts();
  esperar(chips.some((x) => x.includes("💳 Azul")) && chips.some((x) => x.includes("Mercado Pago")) && !chips.some((x) => x.includes("Alarmas")), chips.join(","));
  await page.fill('.capa input[name="nombre"]', "Gasolina");
  await page.fill('.capa input[name="monto"]', "599.08");
  await page.click('.capa .chip:has(input[name="cuentaId"][value="azul"])');
  esperar(await page.locator(".capa .solo-pago-tarjeta").isVisible(), "no dice que se suma a lo que debes");
  await page.screenshot({ path: `${SHOTS}/cu-anotar.png` });
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  const e = await esperarEstado((x) => x.cuentas.azul === -324217);
  esperar(e.cuentas["mercado-pago"] === 158884 && e.cuentas["bbva-hd"] === 5000000 && e.cajas.azul === -324217 && e.crudas.azul === -324217, JSON.stringify(e));
  await esperarTexto("#seccion-gastos", "Gasolina");
});

await paso("gasto con Mercado Pago (viene elegida la última, la tarjeta): baja esa cuenta", async () => {
  await page.click(".tabbar__nuevo");
  await hojaLista();
  // Se recuerda con qué pagaste la última vez (la tarjeta), ya con sus opciones de tarjeta.
  esperar(await page.locator('.capa input[name="cuentaId"][value="azul"]').isChecked() && await page.locator(".capa .solo-pago-tarjeta").isVisible(), "la última tarjeta no queda lista");
  await page.fill('.capa input[name="nombre"]', "Comida");
  await page.fill('.capa input[name="monto"]', "100");
  await page.click('.capa .chip:has(input[name="cuentaId"][value="mercado-pago"])');
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  const e = await esperarEstado((x) => x.cuentas["mercado-pago"] === 148884);
  esperar(e.cajas["mercado-pago"] === 148884 && e.cuentas.azul === -324217, JSON.stringify(e));
});

await paso("Tarjetas: sin «La pagas con…»; pagar $1,000 desde BBVA HD baja esa cuenta y lo que debes, y no es gasto", async () => {
  const gastos = await texto("#seccion-gastos .seccion__titulo");
  await ir("tarjetas");
  await esperarTexto(".tarjeta-credito", "Debes");
  esperar(!(await page.locator(".tarjeta-credito__caja, .tarjeta-credito__otras").count()), "aún habla de cajas");
  await page.click(".tarjeta-credito [data-pagar]");
  await hojaLista();
  const hoja = await texto(".capa");
  esperar(hoja.includes("¿Desde qué cuenta pagas?") && hoja.includes("Solo baja el dinero de tu cuenta"), hoja);
  await page.fill('.capa input[name="monto"]', "1000");
  await page.click('.capa .chip:has(input[name="bancoId"]):has-text("BBVA HD")');
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector(".toast", { hasText: "Pagaste $1,000.00 a Azul desde BBVA HD" });
  const e = await esperarEstado((x) => x.cuentas.azul === -224217);
  esperar(e.cuentas["bbva-hd"] === 4900000 && e.crudas.azul === -224217 && e.crudas["bbva-hd"] === 4900000, JSON.stringify(e));
  await ir("dashboard");
  await esperarTexto("#seccion-cuentas", "Debes $2,242.17");
  esperar((await texto("#seccion-gastos .seccion__titulo")) === gastos, "pagar la tarjeta no es gasto");
});

await paso("Mover dinero de BBVA HD a Nu: elige cuentas (no cajas); a la misma cuenta lo dice", async () => {
  await page.click('#seccion-cuentas [data-accion="nuevo-movimiento"][data-tipo="transferencia"]');
  await hojaLista();
  esperar(!(await page.locator('.capa select[name="cajaId"], .capa select[name="cajaDestinoId"]').count()), "aún pide caja");
  await page.fill('.capa input[name="monto"]', "5000");
  await page.selectOption('.capa select[name="cuentaId"]', "bbva-hd");
  await page.selectOption('.capa select[name="cuentaDestinoId"]', "bbva-hd");
  await page.click('.capa button[type="submit"]');
  await esperarTexto('.capa [data-error="cuentaDestinoId"]', "Elige otra cuenta: es la misma de donde sale.");
  await page.selectOption('.capa select[name="cuentaDestinoId"]', "nu");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  const e = await esperarEstado((x) => x.cuentas.nu === 500000);
  esperar(e.cuentas["bbva-hd"] === 4400000 && e.crudas.nu === 500000 && e.crudas["bbva-hd"] === 4400000, JSON.stringify(e));
});

await paso("Mis cuentas → «Préstamos HD Crédit», no es para gastar, con $50,000: va en Ahorro, inversión y negocio", async () => {
  await ir("cuentas");
  await page.click('[data-accion="nueva"]');
  await hojaLista();
  await page.fill('.capa input[name="nombre"]', "Préstamos HD Crédit");
  await page.check('.capa input[name="noGastar"]');
  await page.fill('.capa input[name="saldo"]', "50000");
  await page.screenshot({ path: `${SHOTS}/cu-nueva-cuenta.png` });
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector(".toast", { hasText: "Cuenta creada · $50,000.00" });
  const info = await page.evaluate(async () => {
    const { getState } = await import("/js/core/state.js");
    const s = getState();
    const k = s.cuentas.find((c) => c.nombre === "Préstamos HD Crédit");
    const c = s.cajas.find((x) => x.id === k?.id);
    return { id: k?.id, pred: k?.cajaPredeterminadaId, tipo: c?.tipo, gastar: c?.disponibleParaGasto, activa: c?.activa };
  });
  esperar(info.id && info.pred === info.id && info.tipo === "ahorro" && info.gastar === false && info.activa === true, JSON.stringify(info));
  const e = await esperarEstado((x) => x.cuentas[info.id] === 5000000);
  esperar(e.cajas[info.id] === 5000000, JSON.stringify(e));
  await page.waitForSelector('.fila:has-text("Préstamos HD Crédit")');
  await ir("dashboard");
  await esperarTexto("#seccion-cuentas", "Préstamos HD Crédit");
  const negocio = await grupo("Ahorro, inversión y negocio");
  esperar(negocio.includes("Préstamos HD Crédit") && negocio.includes("$50,000.00") && negocio.includes("Klar"), negocio);
  esperar(!(await grupo("Para gastar")).includes("Préstamos"), await grupo("Para gastar"));
});

await paso("Cuadrar: sin elegir caja; la diferencia queda en la misma cuenta", async () => {
  await ir("cuadrar");
  await page.waitForSelector('[data-cuenta="mercado-pago"] [data-real]');
  esperar(!(await page.locator('[data-accion="caja"]').count()), "sigue «Dinero en una caja nueva»");
  await page.fill('[data-cuenta="mercado-pago"] [data-real]', "1500");
  await esperarTexto('[data-cuenta="mercado-pago"] [data-resultado]', "Faltan $11.16 en la app");
  esperar(!(await page.locator("[data-caja]").count()), "pide caja");
  await page.click('[data-accion="cuadrar"]');
  await hojaLista();
  const m = await texto(".confirmacion__mensaje");
  esperar(m.includes("Mercado Pago: +$11.16.") && !m.includes("+$11.16 en"), m);
  await page.click('.confirmacion button[type="submit"]');
  await sinHojas();
  await page.waitForSelector(".toast", { hasText: "la app ya dice lo mismo que tus bancos" });
  const e = await esperarEstado((x) => x.cuentas["mercado-pago"] === 150000);
  esperar(e.crudas["mercado-pago"] === 150000, JSON.stringify(e));
});

await paso("Metas: «¿De qué cuenta sale?» (sin tarjetas) y «＋ Cuenta nueva»; ☐ en Mi mes pasa el ahorro de cuenta a cuenta", async () => {
  await ir("metas");
  await page.click('[data-accion="sugerencia-meta"]', { timeout: 10000 });
  await hojaLista();
  esperar((await texto(".capa")).includes("¿De qué cuenta sale?"), await texto(".capa"));
  const origen = await page.locator('.capa .chip:has(input[name="cajaOrigenId"])').allInnerTexts();
  esperar(origen.some((x) => x.includes("BBVA HD")) && !origen.some((x) => x.includes("Azul") || x.includes("·")), origen.join(" | "));
  await page.fill('.capa input[name="dia"]', String(dia(HOY)));
  await page.click('.capa .chip:has(input[name="cajaOrigenId"]):has-text("BBVA HD")');
  esperar(await page.locator('.capa input[name="nombreCaja"]').isVisible() && !(await page.locator('.capa input[name="bancoCaja"]').count()), "pide banco o no pide la cuenta nueva");
  await page.fill('.capa input[name="nombreCaja"]', "Apartado viaje");
  await page.click('.capa button[type="submit"]');
  await sinHojas();
  await page.waitForSelector(".toast", { hasText: "con la cuenta «Apartado viaje»" });
  const id = await page.evaluate(async () => (await import("/js/core/state.js")).getState().cuentas.find((c) => c.nombre === "Apartado viaje")?.id);
  esperar(id, "no se creó la cuenta");
  const antes = (await estado()).cuentas["bbva-hd"];
  await ir("dashboard");
  const fila = page.locator('#seccion-ahorro .fila--hoja:has-text("Remodelación")');
  await fila.waitFor({ timeout: 10000 });
  esperar((await fila.innerText()).includes("BBVA HD → Apartado viaje"), await fila.innerText());
  await fila.locator("button.casilla").click();
  const e = await esperarEstado((x) => x.cuentas[id] === 2000000);
  esperar(e.cuentas["bbva-hd"] === antes - 2000000 && e.crudas[id] === 2000000 && e.crudas["bbva-hd"] === antes - 2000000, JSON.stringify(e));
  await esperarTexto("#seccion-cuentas", "Apartado viaje");
  esperar((await grupo("Ahorro, inversión y negocio")).includes("Apartado viaje"), await grupo("Ahorro, inversión y negocio"));
});

await paso("editar una compra de antes de simplificar: la tarjeta dice lo correcto y no aparece ninguna caja vieja", async () => {
  await ir("movimientos?cuenta=azul");
  esperar(!(await page.locator('.filtros select[name="caja"]').isVisible()), "sigue el filtro por caja");
  await page.click('.fila-mov:has-text("Compras con Azul")');
  await page.click('[data-accion="editar"]');
  esperar(!(await page.locator('.form-mov select[name="cajaId"]').count()), "el formulario pide caja");
  await page.locator('.form-mov input[name="monto"]').fill("10000");
  await page.click('.form-mov button[type="submit"]');
  const e = await esperarEstado((x) => x.cuentas.azul === -140846);
  esperar(e.cajas.azul === -140846 && e.crudas["alarmas-rst"] === 1083371 && e.cajas["alarmas-rst"] === undefined, JSON.stringify(e));
  await ir("dashboard");
  await esperarTexto("#seccion-cuentas", "Debes $1,408.46");
  const h = await hallazgos();
  esperar(!h.some((x) => /caja|Alarmas/i.test(x)), h.join(" | "));
});

await paso("sin errores de JavaScript", async () => esperar(errores.length === 0, errores.join(" | ")));
await browser.close();
console.log(`\n${ok} de ${ok + fallas.length} pasos correctos`);
process.exit(fallas.length ? 1 : 0);

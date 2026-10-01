import { test, assert } from "./lib.js";
import { parseMonto, formatMonto, centavosATexto, esMontoValido, redondear } from "../js/core/money.js";
import { hoy, esFechaValida, mesSiguiente, sumarDias, etiquetaDia, nombreMes } from "../js/core/dates.js";
import { rango, textoRango, totalPaginas, paginasVisibles, tamanoValido, TAMANOS_PAGINA } from "../js/core/paginacion.js";
import { html, escapeHtml } from "../js/core/dom.js";

// ---------- Dinero ----------
test("parseMonto: $3,500.00 = 350000 centavos", () => {
  assert.eq(parseMonto("3,500.00"), 350000);
  assert.eq(parseMonto("$3,500"), 350000);
  assert.eq(parseMonto("3500"), 350000);
  assert.eq(parseMonto("3500.5"), 350050);
  assert.eq(parseMonto("0.05"), 5);
  assert.eq(parseMonto(" 1 200.10 "), 120010);
});

test("parseMonto: rechaza texto inválido y más de 2 decimales", () => {
  assert.eq(parseMonto(""), null);
  assert.eq(parseMonto("abc"), null);
  assert.eq(parseMonto("-50"), null);
  assert.eq(parseMonto("1.234"), null);
  assert.eq(parseMonto("1.2.3"), null);
});

test("parseMonto: sin errores de punto flotante (0.1 + 0.2)", () => {
  assert.eq(parseMonto("0.10") + parseMonto("0.20"), parseMonto("0.30"));
  assert.eq(parseMonto("1.15"), 115); // parseFloat("1.15")*100 = 114.99999…
});

test("esMontoValido: entero positivo", () => {
  assert.ok(esMontoValido(1));
  assert.no(esMontoValido(0));
  assert.no(esMontoValido(-100));
  assert.no(esMontoValido(10.5));
  assert.no(esMontoValido("100"));
});

test("formatMonto / centavosATexto", () => {
  assert.eq(formatMonto(350000), "$3,500.00");
  assert.eq(formatMonto(-52100), "-$521.00");
  assert.eq(formatMonto(500, { signo: true }), "+$5.00");
  assert.eq(centavosATexto(350005), "3500.05");
  assert.eq(centavosATexto(-5), "-0.05");
});

test("redondear: mitad hacia arriba, simétrico", () => {
  assert.eq(redondear(2.5), 3);
  assert.eq(redondear(-2.5), -3);
  assert.eq(redondear(2.4), 2);
});

// ---------- Fechas ----------
test("hoy(): usa la hora de México, no UTC", () => {
  // 1-nov 03:00 UTC = 31-oct 21:00 en Ciudad de México
  assert.eq(hoy(new Date("2026-11-01T03:00:00Z")), "2026-10-31");
  assert.eq(hoy(new Date("2026-11-01T12:00:00Z")), "2026-11-01");
});

test("fechas: validez, mes siguiente, suma de días", () => {
  assert.ok(esFechaValida("2026-02-28"));
  assert.no(esFechaValida("2026-02-30"));
  assert.no(esFechaValida("2026-2-3"));
  assert.eq(mesSiguiente("2026-12"), "2027-01");
  assert.eq(mesSiguiente("2026-09"), "2026-10");
  assert.eq(sumarDias("2026-10-31", 1), "2026-11-01");
  assert.eq(sumarDias("2026-03-01", -1), "2026-02-28");
  assert.eq(nombreMes("2026-09"), "septiembre 2026");
});

test("etiquetaDia: Hoy / Ayer / día con nombre", () => {
  assert.eq(etiquetaDia("2026-10-01", "2026-10-01"), "Hoy");
  assert.eq(etiquetaDia("2026-09-30", "2026-10-01"), "Ayer");
  assert.eq(etiquetaDia("2026-09-28", "2026-10-01"), "lunes 28 de septiembre");
  assert.eq(etiquetaDia("2025-12-31", "2026-10-01"), "miércoles 31 de diciembre 2025");
});

// ---------- Paginación (prueba obligatoria: 10 / 25 / 50 / 100) ----------
test("paginación: 'Mostrando 26–50 de 327 movimientos'", () => {
  assert.eq(textoRango(rango(2, 25, 25, 327)), "Mostrando 26–50 de 327 movimientos");
  assert.eq(totalPaginas(327, 25), 14);
  assert.eq(textoRango(rango(14, 25, 2, 327)), "Mostrando 326–327 de 327 movimientos");
});

test("paginación: tamaños 10, 25, 50 y 100 con 327 registros", () => {
  const esperado = { 10: 33, 25: 14, 50: 7, 100: 4 };
  for (const n of TAMANOS_PAGINA) {
    assert.eq(totalPaginas(327, n), esperado[n], `tamaño ${n}`);
    const ultima = esperado[n];
    const enUltima = 327 - (ultima - 1) * n;
    const r = rango(ultima, n, enUltima, 327);
    assert.eq(r.hasta, 327, `último registro con tamaño ${n}`);
  }
  assert.eq(tamanoValido(37), 25);
  assert.eq(tamanoValido("50"), 50);
});

test("paginación: sin total (offline) no inventa número", () => {
  assert.eq(textoRango(rango(3, 10, 10, null)), "Mostrando 21–30");
  assert.eq(textoRango(rango(1, 25, 0, 0)), "Sin movimientos");
});

test("paginación: solo se puede saltar a páginas visitadas o a la siguiente", () => {
  const p = paginasVisibles({ pagina: 2, maxVisitada: 2, hayMas: true, total: 327, tamano: 25 });
  const nav = p.filter((x) => x.navegable).map((x) => x.n);
  assert.eq(nav, [1, 3]);
  assert.ok(p.some((x) => x.n === 14 && !x.navegable), "la última se muestra pero no es navegable");
  assert.ok(p.some((x) => x.n === "…"));
});

// ---------- HTML seguro ----------
test("html``: escapa lo interpolado (anti-XSS en notas)", () => {
  const nota = '<img src=x onerror="alert(1)">';
  assert.eq(html`<p>${nota}</p>`.value, `<p>${escapeHtml(nota)}</p>`);
  assert.no(html`<p>${nota}</p>`.value.includes("<img"));
  assert.eq(html`<ul>${[1, 2].map((n) => html`<li>${n}</li>`)}</ul>`.value, "<ul><li>1</li><li>2</li></ul>");
});

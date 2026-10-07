// ============================================================
// services/exportExcel.js
// "Descargar Excel" del mes: Finanzas_Reset_2026-10.xlsx
//   Balance      Te quedan (como tu plantilla) + dinero real
//                (al empezar + entró − salió = al cerrar)
//   Gastos       fijos y de una vez, con estado
//   Ingresos     fijos y de una vez, con estado
//   Cajas        al empezar · entró · salió · transferencias · al cerrar
//   Movimientos  todo lo registrado en el mes
//   12 meses     entró · salió · quedó
// Los datos salen de domain/reporte.js. ExcelJS (versión fijada) se
// descarga solo la primera vez que se exporta y queda en caché.
// Montos como número con formato de moneda; totales con fórmula
// y su resultado (se ven bien aunque el visor no recalcule).
// ============================================================

import { getState } from "../core/state.js";
import { hoy, nombreMes, mesCorto } from "../core/dates.js";
import { reporteMes } from "../domain/reporte.js";
import { movimientosRepo } from "../data/movimientosRepo.js";

const EXCELJS_URL = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
const MONEDA = '"$"#,##0.00;[Red]-"$"#,##0.00';
const VERDE = "FF047857";
const VERDE_SUAVE = "FFE6F4EE";
const TIPOS = ["ingreso", "gasto", "transferencia", "apertura", "ajuste"];

let cargando = null;
function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  cargando ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = EXCELJS_URL;
    s.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error("No se pudo cargar el generador de Excel.")));
    s.onerror = () => { cargando = null; reject(new Error("No se pudo descargar el generador de Excel. Revisa tu conexión (solo la primera vez).")); };
    document.head.appendChild(s);
  });
  return cargando;
}

const pesos = (centavos) => Math.round(centavos) / 100;
const fecha = (f) => { const [a, m, d] = f.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d)); };

/** Tabla con encabezado verde, filtros, encabezado fijo y fila de totales opcional. */
function tabla(ws, { columnas, filas, totales = [] }) {
  ws.columns = columnas.map((c) => ({ header: c.titulo, key: c.clave, width: c.ancho || 14 }));
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  cab.alignment = { vertical: "middle" };
  cab.height = 20;
  for (const f of filas) {
    ws.addRow(Object.fromEntries(columnas.map((c) => {
      const v = f[c.clave];
      if (c.tipo === "moneda") return [c.clave, pesos(v || 0)];
      if (c.tipo === "fecha") return [c.clave, v ? fecha(v) : null];
      return [c.clave, v ?? ""];
    })));
  }
  columnas.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.tipo === "moneda") col.numFmt = MONEDA;
    if (c.tipo === "fecha") col.numFmt = "dd/mm/yyyy";
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  if (filas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + filas.length, column: columnas.length } };
  if (totales.length && filas.length) {
    const r = ws.addRow([]);
    r.getCell(1).value = "Total";
    for (const clave of totales) {
      const i = columnas.findIndex((c) => c.clave === clave) + 1;
      const letra = ws.getColumn(i).letter;
      const resultado = filas.reduce((a, f) => a + pesos(f[clave] || 0), 0);
      r.getCell(i).value = { formula: `SUBTOTAL(9,${letra}2:${letra}${filas.length + 1})`, result: Math.round(resultado * 100) / 100 };
    }
    r.font = { bold: true };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_SUAVE } };
  }
  return ws;
}

function colorEstado(ws, columna) {
  ws.getColumn(columna).eachCell((cell, n) => {
    if (n === 1) return;
    if (cell.value === "Vencido") cell.font = { color: { argb: "FFD70015" }, bold: true };
    else if (cell.value === "Pagado" || cell.value === "Recibido") cell.font = { color: { argb: VERDE } };
  });
}

function hojaBalance(wb, r) {
  const ws = wb.addWorksheet("Balance", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 42 }, { width: 18 }];
  const titulo = ws.addRow([`Finanzas Reset · ${nombreMes(r.mes)}`]);
  titulo.font = { bold: true, size: 16, color: { argb: VERDE } };
  ws.addRow([`Generado el ${hoy().split("-").reverse().join("/")}`]).font = { color: { argb: "FF6B6B73" } };
  ws.addRow([]);

  const seccion = (texto) => {
    const fila = ws.addRow([texto]);
    fila.font = { bold: true, color: { argb: "FFFFFFFF" } };
    fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    ws.mergeCells(`A${fila.number}:B${fila.number}`);
  };
  const dato = (texto, centavos, { negrita = false, formula = null } = {}) => {
    const fila = ws.addRow([texto, formula ? { formula, result: pesos(centavos) } : pesos(centavos)]);
    fila.getCell(2).numFmt = MONEDA;
    if (negrita) { fila.font = { bold: true }; fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_SUAVE } }; }
    return fila.number;
  };

  const b = r.balance;
  seccion("Balance del mes (como tu plantilla)");
  const fIng = dato("Ingresos del mes", b.ingresos);
  const fPag = dato("Gastos pagados", b.pagado);
  const fPen = dato("Gastos pendientes", b.pendiente);
  const fTot = dato("Total de gastos del mes", b.totalGastos, { formula: `B${fPag}+B${fPen}` });
  dato(b.balance < 0 ? "Te faltan" : "Te quedan", b.balance, { negrita: true, formula: `B${fIng}-B${fTot}` });
  if (b.vencido) dato("De lo pendiente, ya vencido", b.vencido);
  if (b.porCobrar) dato("Ingresos fijos que aún no llegan (no se suman)", b.porCobrar);
  ws.addRow([]);

  const d = r.dineroReal;
  seccion("Dinero real (lo que pasó en tus cajas)");
  const fIni = dato("Dinero al empezar el mes", d.inicio);
  const fEnt = dato("+ Entró (ingresos)", d.entro);
  const fSal = dato("− Salió (gastos pagados)", d.salio);
  const fOtr = dato("± Saldos iniciales y ajustes", d.otros);
  dato("= Dinero al cerrar el mes", d.cierre, { negrita: true, formula: `B${fIni}+B${fEnt}-B${fSal}+B${fOtr}` });
  dato("Lo que realmente te quedó este mes (entró − salió)", d.entro - d.salio, { formula: `B${fEnt}-B${fSal}` });
  ws.addRow([]);
  ws.addRow(["Las transferencias entre cajas no cambian el total: solo mueven el dinero de lugar."]).font = { italic: true, color: { argb: "FF6B6B73" } };
  ws.addRow(["Los préstamos que te hicieron no cuentan como ingreso en el balance."]).font = { italic: true, color: { argb: "FF6B6B73" } };
}

/** Arma el libro de `mes` con los datos actuales de la app. */
export async function construirLibro(mes) {
  const s = getState();
  const [ExcelJS, ...listas] = await Promise.all([
    cargarExcelJS(),
    ...TIPOS.map((t) => movimientosRepo.delMes(s.user.uid, mes, t)),
  ]);
  const r = reporteMes({ ...s, mes, hoy: hoy(), movimientos: listas.flat() });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Finanzas Reset · CODE-RESET";
  wb.created = new Date();
  hojaBalance(wb, r);

  colorEstado(tabla(wb.addWorksheet("Gastos"), {
    columnas: [
      { titulo: "Fecha", clave: "fecha", tipo: "fecha", ancho: 12 }, { titulo: "Gasto", clave: "concepto", ancho: 28 },
      { titulo: "Caja", clave: "caja", ancho: 18 }, { titulo: "Categoría", clave: "categoria", ancho: 22 },
      { titulo: "Monto", clave: "monto", tipo: "moneda" }, { titulo: "Pagado", clave: "pagado", tipo: "moneda" },
      { titulo: "Estado", clave: "estado", ancho: 12 }, { titulo: "Fijo", clave: "fijo", ancho: 7 }, { titulo: "Forma de pago", clave: "formaPago" },
    ],
    filas: r.gastos, totales: ["monto", "pagado"],
  }), 7);

  colorEstado(tabla(wb.addWorksheet("Ingresos"), {
    columnas: [
      { titulo: "Fecha", clave: "fecha", tipo: "fecha", ancho: 12 }, { titulo: "Ingreso", clave: "concepto", ancho: 28 },
      { titulo: "Caja", clave: "caja", ancho: 18 }, { titulo: "Categoría", clave: "categoria", ancho: 22 },
      { titulo: "Monto", clave: "monto", tipo: "moneda" }, { titulo: "Recibido", clave: "recibido", tipo: "moneda" },
      { titulo: "Estado", clave: "estado", ancho: 20 }, { titulo: "Fijo", clave: "fijo", ancho: 7 },
    ],
    filas: r.ingresos, totales: ["monto", "recibido"],
  }), 7);

  tabla(wb.addWorksheet("Cajas"), {
    columnas: [
      { titulo: "Caja", clave: "caja", ancho: 20 }, { titulo: "Banco", clave: "banco", ancho: 16 },
      { titulo: "Al empezar", clave: "inicio", tipo: "moneda" }, { titulo: "Entró", clave: "entro", tipo: "moneda" },
      { titulo: "Salió", clave: "salio", tipo: "moneda" }, { titulo: "Transferencias", clave: "transferencias", tipo: "moneda", ancho: 16 },
      { titulo: "Saldo inicial / ajustes", clave: "otros", tipo: "moneda", ancho: 20 }, { titulo: "Al cerrar", clave: "cierre", tipo: "moneda" },
    ],
    filas: r.cajas, totales: ["inicio", "entro", "salio", "transferencias", "otros", "cierre"],
  });

  tabla(wb.addWorksheet("Movimientos"), {
    columnas: [
      { titulo: "Fecha", clave: "fecha", tipo: "fecha", ancho: 12 }, { titulo: "Tipo", clave: "tipo", ancho: 14 },
      { titulo: "Concepto", clave: "concepto", ancho: 28 }, { titulo: "Caja", clave: "caja", ancho: 24 },
      { titulo: "Banco", clave: "banco", ancho: 20 }, { titulo: "Categoría", clave: "categoria", ancho: 22 },
      { titulo: "Efecto en tu dinero", clave: "monto", tipo: "moneda", ancho: 18 }, { titulo: "Importe", clave: "importe", tipo: "moneda" },
      { titulo: "Forma de pago", clave: "formaPago" },
    ],
    filas: r.movimientos, totales: ["monto"],
  });

  tabla(wb.addWorksheet("12 meses"), {
    columnas: [
      { titulo: "Mes", clave: "nombre", ancho: 12 }, { titulo: "Entró", clave: "ingresos", tipo: "moneda" },
      { titulo: "Salió", clave: "gastos", tipo: "moneda" }, { titulo: "Quedó", clave: "neto", tipo: "moneda" },
      { titulo: "Dinero al cerrar", clave: "saldo", tipo: "moneda", ancho: 18 },
    ],
    filas: r.meses.map((m) => ({ ...m, nombre: mesCorto(m.mes) })), totales: ["ingresos", "gastos", "neto"],
  });

  return { wb, reporte: r };
}

/** Genera y entrega el archivo: compartir (iPhone/Android instalada) o descarga normal. */
export async function descargarExcel(mes) {
  const { wb } = await construirLibro(mes);
  const buffer = await wb.xlsx.writeBuffer();
  const nombre = `Finanzas_Reset_${mes}.xlsx`;
  const tipo = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const archivo = new File([buffer], nombre, { type: tipo });
  // En la app instalada de iOS un <a download> solo abre una vista previa: mejor la hoja de compartir.
  const instalada = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
  if (instalada && navigator.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: nombre }); return "compartido"; }
    catch (err) { if (err?.name === "AbortError") return "cancelado"; }
  }
  const url = URL.createObjectURL(archivo);
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "descargado";
}

// ============================================================
// services/recordatorios.js
// "Que mi teléfono me avise": arma el archivo de calendario (.ics)
// con todos tus pagos (domain/calendario.js) y lo entrega para
// abrirlo con el calendario del teléfono o la computadora.
// ============================================================

import { getState } from "../core/state.js";
import { hoy } from "../core/dates.js";
import { icsRecordatorios } from "../domain/calendario.js";
import { entregarArchivo } from "./descarga.js";

/** Devuelve { cuantos, resultado: 'compartido' | 'cancelado' | 'descargado' | null } */
export async function descargarRecordatorios() {
  const s = getState();
  const { texto, cuantos } = icsRecordatorios({ obligaciones: s.obligaciones, deudas: s.deudas, cuentas: s.cuentas, agregados: s.agregados, hoy: hoy() });
  if (!cuantos) return { cuantos, resultado: null };
  const archivo = new File([texto], "Finanzas_Reset_pagos.ics", { type: "text/calendar" });
  return { cuantos, resultado: await entregarArchivo(archivo) };
}

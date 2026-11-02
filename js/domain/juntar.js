// ============================================================
// domain/juntar.js
// "Juntar con otra caja" (v1.13.0): cuando hay dos cajas para lo
// mismo (p. ej. «Alarmas RST», la vieja, y «Alarmas REST»), todo lo
// de la vieja pasa a la otra y la vieja queda en $0:
//  - su dinero y sus deudas de tarjeta: una transferencia dentro de
//    cada banco o tarjeta (no cambia el dinero de ningún banco ni lo
//    que debes, y no cuenta como gasto ni ingreso);
//  - lo que la usa: gastos fijos, deudas y compras a meses, ingresos
//    y transferencias programadas, metas, presupuestos y la caja
//    sugerida de bancos y tarjetas. Si pagaban desde un banco, ahora
//    desde el de la otra caja (con tarjeta se queda la tarjeta).
// Funciones puras, probadas en tests/.
// ============================================================

import { desgloseCaja } from "./saldos.js";

/** Transferencias (dentro de la misma cuenta) que dejan `deId` en $0 en cada banco y tarjeta y lo pasan a `aId`. */
export function movimientosParaJuntar({ agregados = {}, deId, aId, fecha, nota }) {
  return desgloseCaja(agregados, deId).map((d) => {
    const tiene = d.saldo > 0;
    return {
      tipo: "transferencia", fecha, montoCentavos: Math.abs(d.saldo),
      cajaId: tiene ? deId : aId, cuentaId: d.cuentaId,
      cajaDestinoId: tiene ? aId : deId, cuentaDestinoId: d.cuentaId, nota,
    };
  });
}

/**
 * Lo que usa la caja `deId` y pasa a `aId`: { cambios: [{ coleccion, antes, despues }], conflictos: [{ coleccion, item }] }.
 * `bancoDeA` = el banco de la caja `aId` (donde tiene su dinero). Lo que quedaría de una caja a la
 * misma caja (una transferencia programada o una meta entre las dos) no se cambia: va en conflictos.
 */
export function cambiosParaJuntar({ deId, aId, bancoDeA = "", cuentas = [], obligaciones = [], deudas = [], recurrentes = [], metas = [], presupuestos = [] }) {
  const tarjetas = new Set(cuentas.filter((c) => c.tipo === "credito").map((c) => c.id));
  const banco = (id) => (!bancoDeA || tarjetas.has(id) ? id : bancoDeA);
  const cambios = [];
  const conflictos = [];
  const agregar = (coleccion, antes, despues) => cambios.push({ coleccion, antes, despues });

  for (const o of obligaciones.filter((x) => x.cajaId === deId)) agregar("obligaciones", o, { ...o, cajaId: aId, cuentaId: banco(o.cuentaId) });
  for (const d of deudas.filter((x) => x.cajaId === deId)) agregar("deudas", d, { ...d, cajaId: aId, cuentaId: banco(d.cuentaId) });
  for (const r of recurrentes.filter((x) => x.cajaId === deId || x.cajaDestinoId === deId)) {
    const despues = { ...r };
    if (r.cajaId === deId) Object.assign(despues, { cajaId: aId, cuentaId: banco(r.cuentaId) });
    if (r.cajaDestinoId === deId) Object.assign(despues, { cajaDestinoId: aId, cuentaDestinoId: banco(r.cuentaDestinoId) });
    if (despues.cajaDestinoId && despues.cajaDestinoId === despues.cajaId) conflictos.push({ coleccion: "recurrentes", item: r });
    else agregar("recurrentes", r, despues);
  }
  for (const m of metas.filter((x) => x.cajaOrigenId === deId || x.cajaAhorroId === deId)) {
    const despues = { ...m, cajaOrigenId: m.cajaOrigenId === deId ? aId : m.cajaOrigenId, cajaAhorroId: m.cajaAhorroId === deId ? aId : m.cajaAhorroId };
    if (despues.cajaOrigenId === despues.cajaAhorroId) conflictos.push({ coleccion: "metas", item: m });
    else agregar("metas", m, despues);
  }
  for (const p of presupuestos.filter((x) => x.cajaId === deId || (x.coberturas || []).some((c) => c.desdeCajaId === deId))) {
    agregar("presupuestos", p, {
      ...p, cajaId: p.cajaId === deId ? aId : p.cajaId,
      ...(p.coberturas ? { coberturas: p.coberturas.map((c) => (c.desdeCajaId === deId ? { ...c, desdeCajaId: aId } : c)) } : {}),
    });
  }
  for (const c of cuentas.filter((x) => x.cajaPredeterminadaId === deId)) agregar("cuentas", c, { ...c, cajaPredeterminadaId: aId });
  return { cambios, conflictos };
}

const normal = (s = "") => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const prefijo = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };

/** La caja con el nombre más parecido (para sugerirla al juntar): «Alarmas RST» → «Alarmas REST»; «Inversión HD credit» → «HD Crédit». */
export function cajaParecida(caja, cajas = []) {
  const n = normal(caja?.nombre);
  const puntos = (c) => {
    const m = normal(c.nombre);
    return Math.max(prefijo(n, m), n.includes(m) ? m.length : 0, m.includes(n) ? n.length : 0);
  };
  const mejor = cajas.filter((c) => c.id !== caja?.id && c.activa !== false)
    .map((c) => ({ c, p: puntos(c) })).sort((a, b) => b.p - a.p)[0];
  return mejor && mejor.p >= 5 ? mejor.c.id : "";
}

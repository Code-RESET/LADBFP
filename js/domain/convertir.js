// ============================================================
// domain/convertir.js
// «Simplificar mi app» (v2.0.0): de cajas + bancos a solo cuentas.
// Cada cuenta (banco o tarjeta) pasa a ser su propia caja, con el
// mismo id y nombre. Así lo que dice cada cuenta es lo que dice tu
// banco, y lo que debes queda en cada tarjeta:
//  - se crea una caja por cuenta; si el dinero de esa cuenta era de
//    una caja «No es para gastar», la cuenta queda como ahorro o
//    inversión;
//  - cada saldo de una caja vieja en una cuenta pasa a la caja de esa
//    cuenta con una transferencia dentro de la misma cuenta (no
//    cambia el dinero de ningún banco ni lo que debes, y no cuenta
//    como gasto ni ingreso);
//  - gastos fijos, deudas, compras a meses e ingresos programados
//    usan su cuenta como caja; metas y presupuestos, la cuenta donde
//    estaba el dinero de su caja; una transferencia programada que
//    quedaría dentro de la misma cuenta ya no aplica y se apaga;
//  - las cajas viejas quedan en $0 y desactivadas.
// Funciones puras, probadas en tests/.
// ============================================================

import { saldosPor, desgloseCaja, desgloseCuenta } from "./saldos.js";
import { enCuentas } from "./movimientos.js";

const COLOR = "#2563EB";

/** Cuenta (banco, no tarjeta) que representa a una caja vieja: donde tenía más dinero; si no, su banco. '' si ninguna. */
export function cuentaDeCajaVieja(agregados, caja, bancos) {
  if (!caja) return "";
  const conDinero = desgloseCaja(agregados, caja.id).filter((d) => d.saldo > 0 && bancos.has(d.cuentaId)).sort((a, b) => b.saldo - a.saldo);
  return conDinero[0]?.cuentaId || (bancos.has(caja.cuentaPredeterminadaId) ? caja.cuentaPredeterminadaId : "");
}

/**
 * Plan de la conversión (no escribe nada):
 * → { cajasNuevas, movimientos, cambios: [{ coleccion, antes, despues }], desactivar: [cajaId],
 *     conflictos: [{ coleccion, item, motivo }], cuentas: [{ cuenta, saldo, antes, ahorro }] }
 */
export function planConversion({ cajas = [], cuentas = [], agregados = {}, obligaciones = [], deudas = [], recurrentes = [], metas = [], presupuestos = [], hoy }) {
  const idsCuenta = new Set(cuentas.map((c) => c.id));
  const bancos = new Set(cuentas.filter((c) => c.tipo !== "credito").map((c) => c.id));
  const saldoCuenta = saldosPor(agregados, "porCuenta");
  const viejas = cajas.filter((c) => !idsCuenta.has(c.id));
  const porId = new Map(cajas.map((c) => [c.id, c]));

  // La caja vieja que tenía más de esa cuenta (o la que la tenía de banco): de ahí el tipo, el color y el «Antes».
  const dominante = (cuentaId) => {
    const d = desgloseCuenta(agregados, cuentaId).filter((x) => !idsCuenta.has(x.cajaId))
      .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo))[0];
    return porId.get(d?.cajaId) || viejas.find((c) => c.cuentaPredeterminadaId === cuentaId && c.activa !== false) || null;
  };

  // Cuentas que reciben su caja. Si ya la tienen activa, se respeta (p. ej. si la marcaste «No es para gastar»);
  // si quedó desactivada (se simplificó y luego se tocó Deshacer), se vuelve a armar y a activar.
  const conCaja = cuentas.filter((c) => (c.activa !== false || saldoCuenta[c.id])
    && (!porId.has(c.id) || (porId.get(c.id).activa === false && c.activa !== false)));
  const cajasNuevas = conCaja.map((k, i) => {
    const vieja = dominante(k.id);
    const ahorro = k.tipo !== "credito" && !!vieja && vieja.tipo !== "operativa";
    return {
      id: k.id, nombre: k.nombre, tipo: ahorro ? vieja.tipo : "operativa", color: vieja?.color || COLOR,
      descripcion: vieja && vieja.nombre !== k.nombre ? `Antes: ${vieja.nombre}`.slice(0, 200) : "",
      cuentaPredeterminadaId: k.id, disponibleParaGasto: !ahorro, activa: k.activa !== false, orden: i,
    };
  });

  // Cada saldo de una caja vieja pasa a la caja de su cuenta (dentro de la misma cuenta).
  const movimientos = [];
  const conflictos = [];
  for (const c of viejas) {
    for (const d of desgloseCaja(agregados, c.id)) {
      if (!idsCuenta.has(d.cuentaId)) { conflictos.push({ coleccion: "cajas", item: c, motivo: "tiene dinero en una cuenta borrada" }); continue; }
      const tiene = d.saldo > 0;
      movimientos.push({
        tipo: "transferencia", fecha: hoy, montoCentavos: Math.abs(d.saldo),
        cajaId: tiene ? c.id : d.cuentaId, cuentaId: d.cuentaId,
        cajaDestinoId: tiene ? d.cuentaId : c.id, cuentaDestinoId: d.cuentaId,
        nota: `Simplificar: lo de «${c.nombre}» pasa a la cuenta`,
      });
    }
  }

  const cambios = [];
  const agregar = (coleccion, antes, despues) => cambios.push({ coleccion, antes, despues });
  for (const o of obligaciones) if (o.cuentaId && o.cajaId !== o.cuentaId) agregar("obligaciones", o, enCuentas(o));
  for (const d of deudas) if (d.cuentaId && d.cajaId !== d.cuentaId) agregar("deudas", d, enCuentas(d));
  for (const r of recurrentes) {
    const despues = enCuentas(r);
    if (despues.cajaId === r.cajaId && despues.cajaDestinoId === r.cajaDestinoId) continue;
    if (r.tipo === "transferencia" && despues.cuentaId === despues.cuentaDestinoId) {
      // Pasaba dinero entre cajas del mismo banco: con solo cuentas ya no aplica.
      conflictos.push({ coleccion: "recurrentes", item: r, motivo: "pasaba dinero dentro del mismo banco" });
      if (r.activa !== false) agregar("recurrentes", r, { ...r, activa: false });
      continue;
    }
    agregar("recurrentes", r, despues);
  }
  const cuentaDe = (cajaId) => (idsCuenta.has(cajaId) ? cajaId : cuentaDeCajaVieja(agregados, porId.get(cajaId), bancos));
  for (const m of metas) {
    const origen = cuentaDe(m.cajaOrigenId);
    const ahorro = cuentaDe(m.cajaAhorroId);
    if (origen === m.cajaOrigenId && ahorro === m.cajaAhorroId) continue;
    if (!origen || !ahorro || origen === ahorro) { conflictos.push({ coleccion: "metas", item: m, motivo: "su dinero y su ahorro están en la misma cuenta" }); continue; }
    agregar("metas", m, { ...m, cajaOrigenId: origen, cajaAhorroId: ahorro });
  }
  for (const p of presupuestos) {
    const caja = cuentaDe(p.cajaId);
    const coberturas = (p.coberturas || []).map((c) => ({ ...c, desdeCajaId: cuentaDe(c.desdeCajaId) || c.desdeCajaId }));
    if (!caja) { conflictos.push({ coleccion: "presupuestos", item: p, motivo: "su caja no tenía banco" }); continue; }
    if (caja === p.cajaId && coberturas.every((c, i) => c.desdeCajaId === p.coberturas[i].desdeCajaId)) continue;
    agregar("presupuestos", p, { ...p, cajaId: caja, ...(p.coberturas ? { coberturas } : {}) });
  }
  for (const k of cuentas) if (k.cajaPredeterminadaId !== k.id) agregar("cuentas", k, { ...k, cajaPredeterminadaId: k.id });

  return {
    cajasNuevas, movimientos, cambios, conflictos,
    desactivar: viejas.filter((c) => c.activa !== false).map((c) => c.id),
    cuentas: cajasNuevas.map((c) => ({ cuenta: cuentas.find((k) => k.id === c.id), saldo: saldoCuenta[c.id] || 0,
      antes: c.descripcion.replace(/^Antes: /, ""), ahorro: c.tipo !== "operativa" })),
  };
}

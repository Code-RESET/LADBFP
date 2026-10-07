// ============================================================
// domain/diagnostico.js
// "Revisar mis datos": busca problemas en los datos del usuario
// que harían que los números no cuadren o que algo no funcione
// directo (cajas sin banco, saldos negativos, gastos fijos con una
// caja desactivada…). Cada hallazgo dice cómo arreglarlo.
// Funciones puras, probadas en tests/.
// ============================================================

import { saldosPor } from "./saldos.js";
import { gastosFijosDelMes } from "./mes.js";

const activo = (lista, id) => lista.some((x) => x.id === id && x.activa !== false);

/**
 * Devuelve [{ nivel: 'error' | 'aviso' | 'info', titulo, detalle, ruta }]
 * ordenados de más a menos grave. Lista vacía = todo bien.
 */
export function diagnosticar({ cajas = [], cuentas = [], categorias = [], obligaciones = [], deudas = [], recurrentes = [], agregados = {}, hoy }) {
  const out = [];
  const cajasActivas = cajas.filter((c) => c.activa !== false);
  const cuentasActivas = cuentas.filter((c) => c.activa !== false);
  const saldoCaja = saldosPor(agregados, "porCaja");
  const saldoCuenta = saldosPor(agregados, "porCuenta");

  if (!cajasActivas.length) out.push({ nivel: "error", titulo: "No tienes cajas activas", detalle: "Crea al menos una caja para registrar dinero.", ruta: "cajas" });
  if (!cuentasActivas.length) out.push({ nivel: "error", titulo: "No tienes bancos/cuentas activos", detalle: "Crea al menos una (por ejemplo «Efectivo»).", ruta: "cuentas" });

  // Saldos negativos: casi siempre falta el saldo inicial o hay un gasto de más.
  for (const c of cajas) {
    if ((saldoCaja[c.id] || 0) < 0) {
      out.push({ nivel: "error", titulo: `${c.nombre} tiene saldo negativo`, ruta: "cajas",
        detalle: "Salió más dinero del que entró. Si ya tenía dinero antes de usar la app, agrégalo en Cajas → la caja → «Agregar dinero que ya tenía». Si no, revisa sus movimientos." });
    }
  }
  for (const c of cuentas) {
    if (c.tipo !== "credito" && (saldoCuenta[c.id] || 0) < 0) {
      out.push({ nivel: "aviso", titulo: `El banco ${c.nombre} quedó en negativo`, ruta: "cuentas",
        detalle: "Un banco de débito o efectivo no puede tener menos de $0. Puede que algún movimiento se registró en el banco equivocado." });
    }
  }

  // Gastos e ingresos fijos que apuntan a algo desactivado: la casilla ☐ no podría registrar el pago directo.
  const fijos = [
    ...obligaciones.filter((o) => o.activa !== false).map((o) => ({ nombre: o.nombre, ...o })),
    ...deudas.filter((d) => d.activa !== false).map((d) => ({ nombre: d.acreedor, ...d })),
    ...recurrentes.filter((r) => r.activa !== false).map((r) => ({ ...r })),
  ];
  for (const f of fijos) {
    const malCaja = !activo(cajas, f.cajaId) || (f.cajaDestinoId && !activo(cajas, f.cajaDestinoId));
    const malCuenta = !activo(cuentas, f.cuentaId) || (f.cuentaDestinoId && !activo(cuentas, f.cuentaDestinoId));
    const malCategoria = f.categoriaId && !activo(categorias, f.categoriaId);
    if (malCaja || malCuenta || malCategoria) {
      const que = [malCaja && "su caja", malCuenta && "su banco", malCategoria && "su categoría"].filter(Boolean).join(" y ");
      out.push({ nivel: "error", titulo: `«${f.nombre}» usa ${que} desactivada o borrada`, ruta: "dashboard",
        detalle: "Tócalo en Mi mes y elige otra caja, o vuelve a activar la que tenía." });
    }
  }

  // Cajas sin banco asignado: se usaría el primer banco de la lista, que puede no ser el correcto.
  for (const c of cajasActivas) {
    if (!activo(cuentas, c.cuentaPredeterminadaId)) {
      out.push({ nivel: "aviso", titulo: `${c.nombre} no tiene banco asignado`, ruta: "cajas",
        detalle: cuentasActivas[0] ? `Lo que registres ahí se anotará en ${cuentasActivas[0].nombre}. Ábrela en Cajas y elige su banco.` : "Ábrela en Cajas y elige su banco." });
    }
  }

  // Sin ningún saldo inicial: las cajas empiezan en $0 aunque en el banco haya dinero.
  const hayApertura = Object.values(agregados).some((m) => Object.values(m?.porCaja || {}).some((t) => t?.ape));
  const hayMovimientos = Object.values(agregados).some((m) => m?.n);
  if (cajasActivas.length && !hayApertura) {
    out.push({ nivel: "aviso", titulo: "No has capturado el dinero que ya tenías", ruta: "cajas",
      detalle: "Tus cajas empiezan en $0. En Cajas → cada caja → «Agregar dinero que ya tenía», escribe lo que hay hoy en el banco." });
  }

  // Vencidos sin marcar este mes.
  if (hoy) {
    const mes = hoy.slice(0, 7);
    const vencidos = gastosFijosDelMes({ mes, obligaciones, deudas, agregados, hoy }).filter((g) => g.estado === "Vencido");
    if (vencidos.length) {
      out.push({ nivel: "aviso", titulo: `${vencidos.length} ${vencidos.length === 1 ? "gasto vencido" : "gastos vencidos"} sin marcar`, ruta: "dashboard",
        detalle: `${vencidos.map((g) => g.nombre).join(", ")}. Si ya los pagaste, márcalos ☑ en Mi mes.` });
    }
  }

  // Cajas que nunca se usan: desactivarlas simplifica las listas.
  if (hayMovimientos) {
    const usadas = new Set(fijos.flatMap((f) => [f.cajaId, f.cajaDestinoId]));
    const sinUsar = cajasActivas.filter((c) => !usadas.has(c.id) && !Object.values(agregados).some((m) => m?.porCaja?.[c.id]?.n));
    if (sinUsar.length) {
      out.push({ nivel: "info", titulo: sinUsar.length === 1 ? `${sinUsar[0].nombre} no se ha usado` : `${sinUsar.length} cajas no se han usado`, ruta: "cajas",
        detalle: `${sinUsar.length === 1 ? "" : `${sinUsar.map((c) => c.nombre).join(", ")}. `}Si no las necesitas, desactívalas en Cajas para que no aparezcan al registrar.` });
    }
  }

  const peso = { error: 0, aviso: 1, info: 2 };
  return out.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}

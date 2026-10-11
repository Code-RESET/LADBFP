// ============================================================
// domain/pronostico.js
// "Mi mes" estilo Clima de Samsung:
//  - estadoDelMes: el "clima" del mes (cambia el color del cielo):
//      bien  → te queda dinero          ("Vas bien")
//      justo → te queda menos del 10 %  ("Vas justo")
//      mal   → gastos > ingresos        ("Mes en rojo")
//  - pronosticoDias: los próximos 7 días como el pronóstico por
//    hora: qué vence cada día y cómo queda tu dinero (todas las
//    cajas) si pagas y cobras lo programado. Lo vencido de este mes
//    se cuenta hoy (igual que en la lista de Mi mes).
//  - consejo: la tarjeta de aviso más útil en este momento.
// Funciones puras, probadas en tests/.
// ============================================================

import { sumarDias, nombreDia, formatFecha } from "../core/dates.js";
import { formatMonto } from "../core/money.js";
import { eventos as calcularEventos } from "./compromisos.js";
import { proyectar } from "./proyeccion.js";
import { saldosPor } from "./saldos.js";

/** { estado: 'bien' | 'justo' | 'mal', frase } a partir de balanceDelMes(). */
export function estadoDelMes({ ingresos = 0, totalGastos = 0, balance = 0 }) {
  if (!ingresos && !totalGastos) return { estado: "bien", frase: "Mes sin movimientos" };
  if (balance < 0) return { estado: "mal", frase: "Mes en rojo" };
  if (balance < ingresos * 0.1) return { estado: "justo", frase: "Vas justo" };
  return { estado: "bien", frase: "Vas bien" };
}

/**
 * [{ fecha, saldo, entradas, salidas, eventos: [{ nombre, clase, monto, vencido }] }]
 * `saldo` = dinero total en tus cajas al terminar ese día.
 * Las transferencias programadas no cambian el total (solo mueven dinero).
 */
export function pronosticoDias({ hoy, obligaciones = [], deudas = [], recurrentes = [], agregados = {}, dias = 7 }) {
  const hasta = sumarDias(hoy, dias - 1);
  const ev = calcularEventos({ obligaciones, deudas, recurrentes, agregados, hoy, hasta, vencidasDesde: `${hoy.slice(0, 7)}-01` });
  const { dias: proyeccion } = proyectar({ saldos: saldosPor(agregados, "porCaja"), eventos: ev, hoy, dias: dias - 1 });
  return proyeccion.map((d) => ({
    fecha: d.fecha,
    saldo: d.total,
    entradas: d.entradas,
    salidas: d.salidas,
    eventos: ev
      .filter((e) => e.clase !== "transferencia" && (e.fecha < hoy ? hoy : e.fecha) === d.fecha)
      .map((e) => ({ nombre: e.nombre, clase: e.clase, monto: e.monto, vencido: e.fecha < hoy })),
  }));
}

/**
 * La tarjeta de consejo (o null). Prioridad: vencidos → una tarjeta de
 * crédito vencida o que vence en 3 días o menos → un error en tus datos →
 * el dinero no alcanza esta semana → el pago grande que se viene.
 * `tarjetas` = [{ nombre, estado, paraNoGenerarIntereses, fechaLimite, dias }] (domain/tarjetas.js).
 * { clave, titulo, texto, accion: { label, tipo: 'ver-gastos' | 'ver-tarjetas' | 'revisar-datos' | 'cerrar' } }
 */
export function consejo({ balance, pronostico = [], hallazgos = [], hoy, tarjetas = [] }) {
  const vencidos = (balance?.fijos || []).filter((g) => g.estado === "Vencido");
  if (vencidos.length) {
    const nombres = vencidos.map((g) => g.nombre);
    return {
      clave: `vencidos:${nombres.join("|")}`,
      titulo: vencidos.length === 1 ? `${nombres[0]} está vencido` : `Tienes ${vencidos.length} gastos vencidos`,
      texto: vencidos.length === 1 ? "¿Ya lo pagaste? Márcalo ☑ en tu lista de gastos." : `${nombres.join(", ")}. ¿Ya los pagaste? Márcalos ☑ en tu lista.`,
      accion: { label: "Ver gastos", tipo: "ver-gastos" },
    };
  }

  const tarjeta = tarjetas
    .filter((t) => t.paraNoGenerarIntereses > 0 && (t.estado === "vencida" || (t.estado === "por-pagar" && t.dias != null && t.dias <= 3)))
    .sort((a, b) => (a.estado === "vencida" ? 0 : 1) - (b.estado === "vencida" ? 0 : 1) || a.dias - b.dias)[0];
  if (tarjeta) {
    const monto = formatMonto(tarjeta.paraNoGenerarIntereses);
    const cuando = tarjeta.dias === 0 ? "hoy" : tarjeta.dias === 1 ? "mañana" : `el ${nombreDia(tarjeta.fechaLimite)}`;
    return {
      clave: `tarjeta:${tarjeta.nombre}:${tarjeta.fechaLimite}:${tarjeta.estado}`,
      titulo: tarjeta.estado === "vencida" ? `Tu tarjeta ${tarjeta.nombre} está vencida` : `Paga tu tarjeta ${tarjeta.nombre}`,
      texto: tarjeta.estado === "vencida"
        ? `Venció el ${formatFecha(tarjeta.fechaLimite)}. Paga ${monto} cuanto antes para no pagar intereses.`
        : `Vence ${cuando}: paga ${monto} para no generar intereses.`,
      accion: { label: "Pagar", tipo: "ver-tarjetas" },
    };
  }

  const error = hallazgos.find((h) => h.nivel === "error");
  if (error) {
    return { clave: `error:${error.titulo}`, titulo: error.titulo, texto: error.detalle, accion: { label: "Revisar mis datos", tipo: "revisar-datos" } };
  }

  const negativo = pronostico.find((d) => d.saldo < 0);
  if (negativo) {
    const cuando = negativo.fecha === hoy ? "hoy" : `el ${nombreDia(negativo.fecha)}`;
    return {
      clave: `negativo:${negativo.fecha}`,
      titulo: "Tu dinero no alcanza esta semana",
      texto: `Con lo que tienes en tus cajas y lo que vence, ${cuando} quedarías en negativo. Revisa qué puedes mover o posponer.`,
      accion: { label: "Entendido", tipo: "cerrar" },
    };
  }

  const pagos = pronostico.flatMap((d) => d.eventos.filter((e) => e.clase !== "ingreso").map((e) => ({ ...e, fecha: d.fecha })));
  const mayor = pagos.sort((a, b) => b.monto - a.monto)[0];
  if (mayor) {
    const cuando = mayor.fecha === hoy ? "hoy" : mayor.fecha === sumarDias(hoy, 1) ? "mañana" : `el ${nombreDia(mayor.fecha)}`;
    return {
      clave: `proximo:${mayor.nombre}:${mayor.fecha}`,
      titulo: `Se viene ${mayor.nombre}`,
      texto: `Vence ${cuando}. Con lo que tienes en tus cajas, sí te alcanza.`,
      accion: { label: "Entendido", tipo: "cerrar" },
      monto: mayor.monto,
    };
  }
  return null;
}

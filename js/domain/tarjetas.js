// ============================================================
// domain/tarjetas.js
// Tarjetas de crédito (v1.9.0). La tarjeta es una cuenta tipo
// 'credito' con credito: { limiteCentavos?, diaCorte, diaLimite }.
//
//  - Comprar con la tarjeta = gasto con la cuenta de la tarjeta:
//    la caja baja en ese momento (ese dinero ya se gastó) y la
//    tarjeta queda en negativo (lo que debes). El banco no se mueve.
//  - Pagar la tarjeta = transferencia (caja, banco) → (caja, tarjeta)
//    por cada caja que debe. NO es gasto: ya se contó al comprar.
//  - Compra a meses sin intereses (MSI) = una deuda con tarjetaId y
//    meses. Cada mensualidad sale en Mi mes y se paga como gasto
//    desde el banco: la caja baja mes a mes, no todo de golpe.
//
// Pago para no generar intereses = lo que debías al último corte
// menos lo que has pagado después + las mensualidades MSI que
// vencen hasta el próximo corte.
// Funciones puras, probadas en tests/.
// ============================================================

import { mesDe, esFechaValida, sumarDias } from "../core/dates.js";
import { esMontoValido } from "../core/money.js";
import { textoRequerido, resultado, nombreRepetido } from "../core/validation.js";
import { saldosPor, desgloseCuenta } from "./saldos.js";
import { eventos, resumenDeuda } from "./compromisos.js";
import { diasEntre } from "./periodos.js";

export const MESES_MSI = [3, 6, 9, 12, 18, 24];

export const esTarjeta = (cuenta) => cuenta?.tipo === "credito";

const ultimoDia = (mes) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};

/** '2026-02' + 31 → '2026-02-28' (si el mes es más corto, el último día). */
export const fechaConDia = (mes, dia) => `${mes}-${String(Math.min(Number(dia), ultimoDia(mes))).padStart(2, "0")}`;

/** '2026-11' + 2 → '2027-01' (n puede ser negativo). */
export function sumarMeses(mes, n) {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const mesesEntre = (desde, hasta) => {
  const [a1, m1] = desde.split("-").map(Number);
  const [a2, m2] = hasta.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
};

const diaValido = (d) => d != null && d !== "" && Number.isInteger(Number(d)) && Number(d) >= 1 && Number(d) <= 31;

/** ¿Tiene día de corte y día límite de pago? */
export const tarjetaConfigurada = (cuenta) => diaValido(cuenta?.credito?.diaCorte) && diaValido(cuenta?.credito?.diaLimite);

// ---------- Fechas del ciclo ----------

/** Último corte en o antes de `hoy` (el día del corte ya cuenta como cerrado). */
export function corteAnterior(credito, hoy) {
  const f = fechaConDia(mesDe(hoy), credito.diaCorte);
  return f <= hoy ? f : fechaConDia(sumarMeses(mesDe(hoy), -1), credito.diaCorte);
}

/** Primer corte después de `hoy`. */
export function corteSiguiente(credito, hoy) {
  const f = fechaConDia(mesDe(hoy), credito.diaCorte);
  return f > hoy ? f : fechaConDia(sumarMeses(mesDe(hoy), 1), credito.diaCorte);
}

/** Fecha límite de pago del estado de cuenta que cierra en `corte` (corte 15 + límite 5 → el 5 del mes siguiente). */
export function fechaLimiteDe(corte, credito) {
  const f = fechaConDia(mesDe(corte), credito.diaLimite);
  return f > corte ? f : fechaConDia(sumarMeses(mesDe(corte), 1), credito.diaLimite);
}

/**
 * Cuándo vence la primera mensualidad de una compra a meses: entra en el
 * primer corte en o después de la compra y se paga en su fecha límite.
 * (Corte 15, límite 5: compra el 20 oct → corte 15 nov → paga el 5 dic.)
 * Sin días configurados: el mismo día del mes siguiente.
 */
export function primeraMensualidad(credito, fechaCompra) {
  if (!diaValido(credito?.diaCorte) || !diaValido(credito?.diaLimite)) {
    return fechaConDia(sumarMeses(mesDe(fechaCompra), 1), Number(fechaCompra.slice(8)));
  }
  let corte = fechaConDia(mesDe(fechaCompra), credito.diaCorte);
  if (corte < fechaCompra) corte = fechaConDia(sumarMeses(mesDe(fechaCompra), 1), credito.diaCorte);
  return fechaLimiteDe(corte, credito);
}

// ---------- Validaciones ----------

/**
 * Tarjeta nueva o editada: { nombre, limiteCentavos?, diaCorte, diaLimite,
 * deudaCentavos?, cajaDeudaId? } (la deuda inicial solo al crearla).
 */
export function validarTarjeta(t, cuentas = []) {
  const deuda = t.deudaCentavos || 0;
  return resultado({
    nombre: textoRequerido(t.nombre, { max: 40 })
      || (nombreRepetido(t.nombre, cuentas, t.id) ? "Ya tienes un banco o tarjeta con ese nombre." : null),
    limiteCentavos: t.limiteCentavos == null || esMontoValido(t.limiteCentavos) ? null : "Escribe el límite o déjalo vacío.",
    diaCorte: diaValido(t.diaCorte) ? null : "Día del 1 al 31.",
    diaLimite: diaValido(t.diaLimite) ? null : "Día del 1 al 31.",
    deudaCentavos: deuda === 0 || esMontoValido(deuda) ? null : "Escribe cuánto debes o déjalo vacío.",
    cajaDeudaId: deuda > 0 && !t.cajaDeudaId ? "Elige qué caja va a pagar esa deuda." : null,
  });
}

/** Compra a meses: { descripcion, montoCentavos, meses, pagadas, fechaCompra, cajaId, tarjetaId }. */
export function validarMsi(x) {
  const meses = Number(x.meses);
  const pagadas = Number(x.pagadas || 0);
  const errores = {
    descripcion: textoRequerido(x.descripcion, { max: 60 }),
    montoCentavos: esMontoValido(x.montoCentavos) ? null : "Escribe el precio total.",
    meses: Number.isInteger(meses) && meses >= 2 && meses <= 48 ? null : "Elige a cuántos meses (de 2 a 48).",
    pagadas: Number.isInteger(pagadas) && pagadas >= 0 && pagadas < meses ? null : "Deben ser menos que los meses.",
    fechaCompra: esFechaValida(x.fechaCompra) ? null : "Fecha inválida.",
    cajaId: x.cajaId ? null : "Elige la caja que la paga.",
    tarjetaId: x.tarjetaId ? null : "Elige la tarjeta.",
  };
  // Al menos $1 por mes: así la mensualidad redondeada siempre da exactamente `meses` pagos.
  if (!errores.montoCentavos && !errores.meses && x.montoCentavos < meses * 100) {
    errores.montoCentavos = "Para tantos meses, el precio debe ser de al menos $1 por mes.";
  }
  if (!errores.montoCentavos && !errores.meses && !errores.pagadas
    && x.montoCentavos - pagadas * Math.ceil(x.montoCentavos / meses) <= 0) {
    errores.pagadas = "Con esas mensualidades ya estaría pagada.";
  }
  return resultado(errores);
}

// ---------- Compras a meses (MSI) ----------

/**
 * Calendario de una compra a meses como deuda: mensualidad = total / meses
 * (redondeada hacia arriba; la última ajusta los centavos). `pagadas` =
 * mensualidades que ya pagaste antes de registrarla en la app.
 * → { saldoInicialCentavos, pagoCentavos, regla }
 */
export function planMsi({ montoCentavos, meses, credito, fechaCompra, pagadas = 0 }) {
  const pago = Math.ceil(montoCentavos / meses);
  const primera = primeraMensualidad(credito, fechaCompra);
  const dia = diaValido(credito?.diaLimite) ? Number(credito.diaLimite) : Number(primera.slice(8));
  return {
    saldoInicialCentavos: montoCentavos - pagadas * pago,
    pagoCentavos: pago,
    regla: { frecuencia: "mensual", diaMes: dia, desde: fechaConDia(sumarMeses(mesDe(primera), pagadas), dia) },
  };
}

/** La deuda (colección deudas) que representa una compra a meses. */
export function deudaDeMsi(x, tarjeta, { cuentaPagoId, categoriaId }) {
  return {
    acreedor: tarjeta.nombre,
    descripcion: x.descripcion.trim(),
    ...planMsi({ montoCentavos: x.montoCentavos, meses: Number(x.meses), credito: tarjeta.credito, fechaCompra: x.fechaCompra, pagadas: Number(x.pagadas || 0) }),
    cajaId: x.cajaId,
    cuentaId: cuentaPagoId,
    categoriaId: categoriaId || "ga-otros",
    tarjetaId: tarjeta.id,
    meses: Number(x.meses),
    fechaCompra: x.fechaCompra,
    tasaAnual: 0,
    activa: true,
  };
}

/** Mensualidades que ya estaban pagadas cuando se registró en la app. */
export const previasMsi = (d) => Math.max(0, (d.meses || 0) - Math.ceil(d.saldoInicialCentavos / d.pagoCentavos));

/** Número de la mensualidad que vence en `fecha` (3 de 12), según el calendario de la compra. */
export function numeroMensualidad(d, fecha) {
  if (!d?.meses || !d.regla?.desde || !fecha) return null;
  const n = previasMsi(d) + mesesEntre(mesDe(d.regla.desde), mesDe(fecha)) + 1;
  return Math.min(Math.max(n, 1), d.meses);
}

export const etiquetaMsi = (d, fecha) => {
  const n = numeroMensualidad(d, fecha);
  return n ? `${n} de ${d.meses}` : "";
};

// ---------- Estado de la tarjeta ----------

/** Efecto neto de un movimiento activo en el saldo de una cuenta (negativo = sale / aumenta la deuda). */
export function efectoEnCuenta(m, cuentaId) {
  if (!m || m.estado === "anulado") return 0;
  const monto = m.montoCentavos || 0;
  switch (m.tipo) {
    case "ingreso": case "apertura": return m.cuentaId === cuentaId ? monto : 0;
    case "gasto": return m.cuentaId === cuentaId ? -monto : 0;
    case "ajuste": return m.cuentaId === cuentaId ? (m.direccion === "salida" ? -monto : monto) : 0;
    case "transferencia": return (m.cuentaId === cuentaId ? -monto : 0) + (m.cuentaDestinoId === cuentaId ? monto : 0);
    default: return 0;
  }
}

const suma = (lista, f = (x) => x) => lista.reduce((a, x) => a + f(x), 0);

/**
 * Todo lo de una tarjeta. `movimientos` = los movimientos de la tarjeta
 * con fecha posterior a su penúltimo corte (`inicioMovimientos`; los demás
 * no hacen falta: el saldo total sale de los agregados).
 * → { deudaRegular, aFavor, porCaja: [{ cajaId, deuda }], msi: [{ deuda, resumen, numero }],
 *     msiPendiente, deudaTotal, limite, disponible, configurada,
 *     corte, fechaLimite, proximoCorte, siguienteLimite, deudaAlCorte, pagosDespues, comprasDespues,
 *     pendienteCorte, paraElSiguiente, cuotas: [{ deuda, periodo, fecha, monto, vencida }], pendienteMsi,
 *     paraNoGenerarIntereses, todo, estado: 'sin-deuda'|'al-corriente'|'por-pagar'|'vencida', vencidaDesde, dias }
 */
export function estadoTarjeta({ cuenta, agregados = {}, deudas = [], movimientos = [], hoy }) {
  const credito = cuenta.credito || {};
  const saldo = saldosPor(agregados, "porCuenta")[cuenta.id] || 0;
  const deudaRegular = Math.max(0, -saldo);
  const porCaja = desgloseCuenta(agregados, cuenta.id).filter((d) => d.saldo < 0)
    .map((d) => ({ cajaId: d.cajaId, deuda: -d.saldo }))
    .sort((a, b) => b.deuda - a.deuda);

  const planes = deudas.filter((d) => d.tarjetaId === cuenta.id && d.activa !== false);
  const msi = planes.map((d) => {
    const resumen = resumenDeuda(d, agregados, hoy);
    return { deuda: d, resumen, numero: resumen.proximaFecha ? numeroMensualidad(d, resumen.proximaFecha) : d.meses };
  }).filter((x) => x.resumen.saldoActual > 0);
  const msiPendiente = suma(msi, (x) => x.resumen.saldoActual);
  const limite = credito.limiteCentavos || null;
  const base = {
    saldo, deudaRegular, aFavor: Math.max(0, saldo), porCaja, msi, msiPendiente,
    deudaTotal: deudaRegular + msiPendiente,
    limite, disponible: limite ? limite + saldo - msiPendiente : null,
    configurada: tarjetaConfigurada(cuenta),
  };
  if (!base.configurada) {
    return { ...base, cuotas: [], pendienteMsi: 0, pendienteCorte: deudaRegular, paraNoGenerarIntereses: deudaRegular,
      todo: deudaRegular, estado: deudaRegular ? "por-pagar" : "sin-deuda", dias: null };
  }

  const corte = corteAnterior(credito, hoy);
  const proximoCorte = corteSiguiente(credito, hoy);
  // El estado de cuenta anterior: si no se pagó a tiempo, la tarjeta está vencida aunque ya haya un corte nuevo.
  const cortePrevio = corteAnterior(credito, sumarDias(corte, -1));
  const limitePrevio = fechaLimiteDe(cortePrevio, credito);
  const vivos = movimientos.filter((m) => m.estado !== "anulado");
  const efectosDesde = (f) => vivos.filter((m) => m.fecha > f).map((m) => efectoEnCuenta(m, cuenta.id));
  const deudaAl = (f) => Math.max(0, -(saldo - suma(efectosDesde(f))));
  const pagosDesde = (f) => suma(efectosDesde(f), (e) => Math.max(0, e));
  // Los pagos se aplican primero a lo más viejo (como hacen los bancos).
  const restantePrevio = Math.max(0, deudaAl(cortePrevio) - pagosDesde(cortePrevio));
  const previoVencido = restantePrevio > 0 && limitePrevio < hoy;
  // Tarjetas cuya fecha límite cae el mismo día del corte siguiente (corte 3, paga el 3): ese día aún se paga el anterior.
  const previoHoy = restantePrevio > 0 && limitePrevio >= hoy;
  const ciclo = previoHoy ? cortePrevio : corte;
  const fechaLimite = previoHoy ? limitePrevio : fechaLimiteDe(corte, credito);
  const efectos = efectosDesde(ciclo);
  const deudaAlCorte = deudaAl(ciclo);
  const pagosDespues = suma(efectos, (e) => Math.max(0, e));
  const comprasDespues = suma(efectos, (e) => Math.max(0, -e));
  const pendienteCorte = previoHoy ? restantePrevio : Math.max(0, deudaAlCorte - pagosDespues);

  // Mensualidades que vencen hasta el próximo corte (y las atrasadas de los dos cortes anteriores).
  const cuotas = eventos({ deudas: planes, agregados, hoy, hasta: proximoCorte, vencidasDesde: sumarDias(corte, -62) })
    .map((e) => ({ deuda: e.ref, periodo: e.periodo, fecha: e.fecha, monto: e.monto, vencida: e.fecha < hoy }));
  const pendienteMsi = suma(cuotas, (c) => c.monto);
  const paraNoGenerarIntereses = pendienteCorte + pendienteMsi;
  // Desde cuándo está vencida: el estado de cuenta anterior sin pagar, este ya pasado, o una mensualidad atrasada.
  const vencidaDesde = paraNoGenerarIntereses === 0 ? null
    : [previoVencido ? limitePrevio : null, hoy > fechaLimite && pendienteCorte > 0 ? fechaLimite : null,
      ...cuotas.filter((c) => c.vencida).map((c) => c.fecha)].filter(Boolean).sort()[0] || null;
  const estado = paraNoGenerarIntereses === 0 ? (deudaRegular ? "al-corriente" : "sin-deuda") : vencidaDesde ? "vencida" : "por-pagar";
  return {
    ...base, corte: ciclo, fechaLimite, proximoCorte, siguienteLimite: fechaLimiteDe(proximoCorte, credito),
    deudaAlCorte, pagosDespues, comprasDespues, pendienteCorte,
    // Lo que debes que no entra en este pago (compras después del corte que aún no pagas).
    paraElSiguiente: Math.max(0, deudaRegular - pendienteCorte),
    cuotas, pendienteMsi, paraNoGenerarIntereses, todo: deudaRegular + pendienteMsi, estado, vencidaDesde,
    dias: diasEntre(hoy, vencidaDesde || fechaLimite),
  };
}

/** Desde qué fecha hacen falta los movimientos de la tarjeta (el corte anterior al último). */
export function inicioMovimientos(credito, hoy) {
  return corteAnterior(credito, sumarDias(corteAnterior(credito, hoy), -1));
}

// ---------- Pagar la tarjeta ----------

/**
 * Reparte un pago: primero las mensualidades (en orden de fecha), luego la
 * deuda normal, proporcional a lo que debe cada caja (al centavo).
 * → { cuotas: [{ …cuota, monto }], cajas: [{ cajaId, monto }], sobrante }
 */
export function repartirPago({ monto, cuotas = [], porCaja = [] }) {
  let resto = monto;
  const pagosCuotas = [];
  for (const c of [...cuotas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (resto <= 0) break;
    const p = Math.min(c.monto, resto);
    pagosCuotas.push({ ...c, monto: p });
    resto -= p;
  }
  const total = suma(porCaja, (d) => d.deuda);
  const aRepartir = Math.min(resto, total);
  if (!aRepartir) return { cuotas: pagosCuotas, cajas: [], sobrante: resto };
  // Residuo mayor con BigInt: exacto aunque los montos sean grandes.
  const T = BigInt(total);
  const partes = porCaja.map((d, i) => {
    const prod = BigInt(aRepartir) * BigInt(d.deuda);
    return { i, cajaId: d.cajaId, monto: Number(prod / T), residuo: prod % T };
  });
  let faltan = aRepartir - suma(partes, (p) => p.monto);
  [...partes].sort((a, b) => (b.residuo > a.residuo ? 1 : b.residuo < a.residuo ? -1 : a.i - b.i))
    .forEach((p) => { if (faltan > 0 && p.residuo > 0n) { p.monto++; faltan--; } });
  return { cuotas: pagosCuotas, cajas: partes.filter((p) => p.monto > 0).map(({ cajaId, monto: m }) => ({ cajaId, monto: m })), sobrante: resto - aRepartir };
}

/**
 * Movimientos del pago (se guardan juntos en un solo batch):
 *  - cada mensualidad: gasto desde el banco, vinculado a su compra (deudaId + periodo).
 *    Si la mensualidad es de otro mes, lleva la fecha de su vencimiento (como al
 *    marcarla ☑ en Mi mes): así cuenta en el mes donde aparece su renglón;
 *  - la deuda normal: transferencia (caja, banco) → (caja, tarjeta) por caja, con fecha de hoy.
 */
export function movimientosDePago({ tarjeta, bancoId, fecha, reparto }) {
  return [
    ...reparto.cuotas.map((c) => ({
      tipo: "gasto", fecha: mesDe(c.periodo) === mesDe(fecha) ? fecha : c.periodo,
      montoCentavos: c.monto, cajaId: c.deuda.cajaId, cuentaId: bancoId,
      categoriaId: c.deuda.categoriaId || "ga-deudas",
      nota: `${c.deuda.descripcion || c.deuda.acreedor} (${etiquetaMsi(c.deuda, c.periodo)})`.replace(" ()", ""),
      deudaId: c.deuda.id, deudaPeriodo: c.periodo,
    })),
    ...reparto.cajas.map((c) => ({
      tipo: "transferencia", fecha, montoCentavos: c.monto, cajaId: c.cajaId, cuentaId: bancoId,
      cajaDestinoId: c.cajaId, cuentaDestinoId: tarjeta.id, nota: `Pago tarjeta ${tarjeta.nombre}`,
    })),
  ];
}

/** Deuda que ya traía la tarjeta al registrarla: ajuste en (caja, tarjeta), con fecha del último corte. */
export function ajusteDeudaInicial({ tarjeta, cajaId, montoCentavos, hoy }) {
  return {
    tipo: "ajuste", direccion: "salida", montoCentavos, cajaId, cuentaId: tarjeta.id,
    fecha: tarjetaConfigurada(tarjeta) ? corteAnterior(tarjeta.credito, hoy) : hoy,
    nota: `Deuda que ya tenía la tarjeta ${tarjeta.nombre}`,
  };
}

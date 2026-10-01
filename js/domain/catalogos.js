// ============================================================
// domain/catalogos.js
// Reglas de cajas, cuentas y categorías.
// ============================================================

import { textoRequerido, textoOpcional, unoDe, resultado, nombreRepetido } from "../core/validation.js";

export const TIPOS_CAJA = {
  operativa: "Operativa",
  ahorro: "Ahorro",
  crecimiento: "Capital de crecimiento",
};

export const TIPOS_CUENTA = {
  debito: "Débito",
  monedero: "Monedero digital",
  efectivo: "Efectivo",
  credito: "Tarjeta de crédito",
};

export const COLORES = ["#34C759", "#0A84FF", "#FF9F0A", "#BF5AF2", "#FF375F", "#64D2FF", "#FFD60A", "#8E8E93"];

export function validarCaja(c, existentes = []) {
  return resultado({
    nombre: textoRequerido(c.nombre, { max: 40 })
      || (nombreRepetido(c.nombre, existentes, c.id) ? "Ya existe una caja con ese nombre." : null),
    tipo: unoDe(c.tipo, Object.keys(TIPOS_CAJA)),
    descripcion: textoOpcional(c.descripcion, { max: 200 }),
  });
}

export function validarCuenta(c, existentes = []) {
  return resultado({
    nombre: textoRequerido(c.nombre, { max: 40 })
      || (nombreRepetido(c.nombre, existentes, c.id) ? "Ya existe una cuenta con ese nombre." : null),
    tipo: unoDe(c.tipo, Object.keys(TIPOS_CUENTA)),
    institucion: textoOpcional(c.institucion, { max: 40 }),
  });
}

export function validarCategoria(c, existentes = []) {
  const mismoTipo = existentes.filter((x) => x.tipo === c.tipo);
  return resultado({
    nombre: textoRequerido(c.nombre, { max: 40 })
      || (nombreRepetido(c.nombre, mismoTipo, c.id) ? "Ya existe una categoría con ese nombre." : null),
    tipo: unoDe(c.tipo, ["ingreso", "gasto"]),
  });
}

/** Una caja cuenta para "dinero para gastar" solo si es operativa y no está marcada como reservada. */
export function cuentaParaGasto(caja) {
  return caja.activa !== false && caja.tipo === "operativa" && caja.disponibleParaGasto !== false;
}

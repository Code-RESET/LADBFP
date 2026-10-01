// ============================================================
// core/validation.js
// Validadores genéricos reutilizables. Las reglas financieras
// específicas viven en js/domain/ y usan estas piezas.
// ============================================================

export function textoRequerido(valor, { max = 100 } = {}) {
  const t = typeof valor === "string" ? valor.trim() : "";
  if (!t) return "Este campo es obligatorio.";
  if (t.length > max) return `Máximo ${max} caracteres.`;
  return null;
}

export function textoOpcional(valor, { max = 500 } = {}) {
  if (valor == null || valor === "") return null;
  if (typeof valor !== "string") return "Texto inválido.";
  if (valor.length > max) return `Máximo ${max} caracteres.`;
  return null;
}

export function unoDe(valor, opciones, mensaje = "Opción inválida.") {
  return opciones.includes(valor) ? null : mensaje;
}

/**
 * Ejecuta un mapa { campo: errorONull } y devuelve
 * { ok, errores } con solo los campos que fallaron.
 */
export function resultado(mapa) {
  const errores = {};
  for (const [campo, error] of Object.entries(mapa)) {
    if (error) errores[campo] = error;
  }
  return { ok: Object.keys(errores).length === 0, errores };
}

/** Nombre duplicado (sin distinguir mayúsculas/acentos) dentro de una lista. */
export function nombreRepetido(nombre, lista, idPropio = null) {
  const norm = (s) => String(s || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  const n = norm(nombre);
  return lista.some((x) => x.id !== idPropio && norm(x.nombre) === n);
}

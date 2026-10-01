// ============================================================
// core/money.js
// Todo el dinero de la app vive como ENTEROS DE CENTAVOS.
// $3,500.00 -> 350000. Nunca se suman floats: el texto que
// escribe el usuario se convierte a centavos sin pasar por
// parseFloat, y la división a pesos solo ocurre al mostrar.
// ============================================================

export const MAX_CENTAVOS = 100_000_000_000; // $1,000 millones: tope de cordura

const formatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Convierte texto del usuario a centavos.
 * Acepta "3500", "3,500", "$3,500.5", "3500.05". Devuelve null si no es válido.
 * Solo admite punto decimal (formato mexicano) y máximo 2 decimales.
 */
export function parseMonto(texto) {
  if (typeof texto === "number") texto = String(texto);
  if (typeof texto !== "string") return null;
  const limpio = texto.replace(/[\s$]/g, "").replace(/,/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(limpio)) return null;
  const [entero, dec = ""] = limpio.split(".");
  const centavos = Number(entero) * 100 + Number((dec + "00").slice(0, 2));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/** Monto válido para un movimiento: entero, positivo y razonable. */
export function esMontoValido(centavos) {
  return Number.isSafeInteger(centavos) && centavos > 0 && centavos <= MAX_CENTAVOS;
}

/** 350000 -> "$3,500.00". Con { signo: true } agrega "+" a positivos. */
export function formatMonto(centavos, { signo = false } = {}) {
  const n = Number(centavos) || 0;
  const texto = formatter.format(Math.abs(n) / 100);
  if (n < 0) return `-${texto}`;
  if (signo && n > 0) return `+${texto}`;
  return texto;
}

/** 350000 -> "3500.00" (para inputs y CSV). */
export function centavosATexto(centavos) {
  const n = Math.abs(Number(centavos) || 0);
  const signo = centavos < 0 ? "-" : "";
  return `${signo}${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`;
}

/** Redondeo al centavo, mitad hacia arriba (simétrico). Usar solo al final de un cálculo. */
export function redondear(valor) {
  return Math.sign(valor) * Math.round(Math.abs(valor));
}

/** Suma segura de una lista de centavos. */
export function sumar(lista) {
  return lista.reduce((acc, n) => acc + (Number(n) || 0), 0);
}

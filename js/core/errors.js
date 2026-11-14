// ============================================================
// core/errors.js
// Traduce errores técnicos (Firebase, red) a mensajes que el
// usuario entiende. El detalle técnico va solo a la consola.
// ============================================================

const MENSAJES = {
  "auth/invalid-email": "Correo inválido.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/user-not-found": "Ese usuario no existe.",
  "auth/wrong-password": "Contraseña incorrecta.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
  "auth/network-request-failed": "Sin conexión. Revisa tu internet e intenta de nuevo.",
  "auth/missing-email": "Escribe tu correo primero.",
  "permission-denied": "No tienes permiso para esta operación o los datos no son válidos.",
  "unavailable": "Sin conexión con el servidor. Los cambios se guardarán al reconectar.",
  "failed-precondition": "La consulta necesita un índice que aún no está creado en Firebase.",
  "resource-exhausted": "Se alcanzó el límite de uso de Firebase. Intenta más tarde.",
  "deadline-exceeded": "El servidor tardó demasiado en responder.",
};

// Qué se estaba leyendo cuando Firebase lo rechazó (data/respaldoRepo.js → err.lectura).
const LECTURAS = {
  cajas: "tus cajas", cuentas: "tus cuentas", categorias: "tus categorías", obligaciones: "tus gastos fijos",
  deudas: "tus deudas", recurrentes: "tus ingresos programados", presupuestos: "tus presupuestos", metas: "tus metas",
  movimientos: "tus movimientos", historial: "el historial de tus movimientos", perfil: "tu configuración",
};

/**
 * Error al leer todos tus datos (respaldo, «Simplificar mi app»): dice qué no se pudo leer y qué hacer.
 * Metas llegó en la v1.8: si Firebase no deja leerlas, sus reglas son de antes y falta publicar las nuevas.
 * Si no deja leer lo demás, casi siempre es la sesión (o reglas mucho más viejas).
 */
export function mensajeDeLectura(err, porDefecto = "No se pudieron leer tus datos.") {
  const code = String(err?.code || "").replace(/^firestore\//, "");
  if (code !== "permission-denied" || !LECTURAS[err?.lectura]) return mensajeDeError(err, porDefecto);
  console.error(err);
  return err.lectura === "metas"
    ? "Firebase no deja leer tus metas: tiene reglas de una versión anterior de la app. En la consola de Firebase → Firestore Database → Reglas, pega el archivo firestore.rules de la app y toca Publicar."
    : `Firebase no deja leer ${LECTURAS[err.lectura]}. Cierra sesión y vuelve a entrar; si sigue igual, publica las reglas de la app en la consola de Firebase (Firestore Database → Reglas).`;
}

/** Error de validación propio: su mensaje sí es apto para el usuario. */
export class ErrorUsuario extends Error {
  constructor(mensaje, campos = {}) {
    super(mensaje);
    this.name = "ErrorUsuario";
    this.campos = campos;
  }
}

export function mensajeDeError(err, porDefecto = "Algo salió mal. Intenta de nuevo.") {
  if (!err) return porDefecto;
  if (err instanceof ErrorUsuario) return err.message;
  const code = String(err.code || "").replace(/^firestore\//, "");
  if (code === "failed-precondition" && /index/i.test(err.message || "")) {
    // El enlace para crear el índice solo le sirve al desarrollador.
    console.warn("Índice faltante:", err.message);
  } else {
    console.error(err);
  }
  return MENSAJES[code] || porDefecto;
}

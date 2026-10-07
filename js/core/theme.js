// ============================================================
// core/theme.js
// Tema claro / oscuro / sistema. La preferencia se guarda en
// localStorage y además en Firestore (users/{uid}.config.tema)
// porque en HD Crédit se vio que iOS/Android pueden borrar el
// localStorage. El <head> de index.html aplica el tema antes de
// pintar para evitar el destello blanco.
// ============================================================

export const TEMAS = ["light", "dark", "system"];
const CLAVE = "fr.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

function leerLocal() {
  try {
    const v = localStorage.getItem(CLAVE);
    return TEMAS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function getTema() {
  return leerLocal() || "system";
}

/** Tema efectivo: 'light' | 'dark'. */
export function temaEfectivo(pref = getTema()) {
  if (pref === "system") return media.matches ? "dark" : "light";
  return pref;
}

function aplicar() {
  const pref = getTema();
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  // Color de la barra de estado del teléfono = parte de arriba del cielo.
  const color = getComputedStyle(root).getPropertyValue("--barra-estado").trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (color) m.setAttribute("content", color);
  });
}

/** Cambia la preferencia. Devuelve true si cambió. */
export function setTema(pref) {
  if (!TEMAS.includes(pref)) return false;
  const cambio = pref !== getTema();
  try { localStorage.setItem(CLAVE, pref); } catch { /* sin storage: solo esta sesión */ }
  aplicar();
  return cambio;
}

/** Si el dispositivo perdió el localStorage, recupera la preferencia guardada en la nube. */
export function sincronizarDesdeNube(prefRemota) {
  if (!leerLocal() && TEMAS.includes(prefRemota)) setTema(prefRemota);
}

export function initTheme() {
  aplicar();
  media.addEventListener("change", () => {
    if (getTema() === "system") aplicar();
  });
}

// ============================================================
// core/dom.js
// html`...` escapa automáticamente todo lo interpolado (notas,
// nombres de cajas...) para evitar inyección de HTML. Para
// insertar HTML ya construido se envuelve con raw().
// ============================================================

const RAW = Symbol("raw");

export function raw(str) {
  return { [RAW]: true, value: String(str ?? "") };
}

export function escapeHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function convertir(valor) {
  if (valor == null || valor === false) return "";
  if (Array.isArray(valor)) return valor.map(convertir).join("");
  if (typeof valor === "object" && valor[RAW]) return valor.value;
  return escapeHtml(valor);
}

/** Template tag: devuelve un objeto raw para poder anidarse sin doble escape. */
export function html(strings, ...valores) {
  let out = strings[0];
  valores.forEach((v, i) => { out += convertir(v) + strings[i + 1]; });
  return raw(out);
}

/** Pinta un html`` dentro de un elemento. */
export function render(el, contenido) {
  el.innerHTML = convertir(contenido);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Delegación de eventos: on(container, 'click', '[data-accion]', fn) */
export function on(root, evento, selector, handler) {
  const fn = (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  };
  root.addEventListener(evento, fn);
  return () => root.removeEventListener(evento, fn);
}

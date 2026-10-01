// ============================================================
// core/paginacion.js
// Matemática de paginación (pura, probada en tests/). El acceso
// a Firestore con cursores vive en data/firestore.js y la UI en
// components/pagination.js.
// ============================================================

export const TAMANOS_PAGINA = [10, 25, 50, 100];
export const TAMANO_DEFAULT = 25;

export function tamanoValido(n) {
  return TAMANOS_PAGINA.includes(Number(n)) ? Number(n) : TAMANO_DEFAULT;
}

/** Rango visible de una página (1-based). total puede ser null (desconocido). */
export function rango(pagina, tamano, enPagina, total = null) {
  if (!enPagina) return { desde: 0, hasta: 0, total };
  const desde = (pagina - 1) * tamano + 1;
  return { desde, hasta: desde + enPagina - 1, total };
}

export function totalPaginas(total, tamano) {
  if (total == null) return null;
  return Math.max(1, Math.ceil(total / tamano));
}

/** "Mostrando 26–50 de 327 movimientos" */
export function textoRango({ desde, hasta, total }, sustantivo = "movimientos") {
  if (!desde) return `Sin ${sustantivo}`;
  const base = `Mostrando ${desde.toLocaleString("es-MX")}–${hasta.toLocaleString("es-MX")}`;
  return total == null ? base : `${base} de ${total.toLocaleString("es-MX")} ${sustantivo}`;
}

/**
 * Números de página a mostrar. Con cursores de Firestore solo se puede
 * saltar a páginas ya visitadas o a la siguiente; el resto se muestra
 * como texto (sin enlace) para no usar offset (cobra lecturas saltadas).
 * Devuelve [{ n, actual, navegable }] o { n: '…' } para huecos.
 */
export function paginasVisibles({ pagina, maxVisitada, hayMas, total, tamano }) {
  const ultimaConocida = totalPaginas(total, tamano);
  const alcanzable = Math.max(maxVisitada, hayMas ? pagina + 1 : pagina);
  const ultima = ultimaConocida ?? alcanzable;
  const set = new Set([1, ultima]);
  for (let n = pagina - 2; n <= pagina + 2; n++) if (n >= 1 && n <= ultima) set.add(n);
  const nums = [...set].sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push({ n: "…" });
    out.push({ n, actual: n === pagina, navegable: n !== pagina && n <= alcanzable });
  });
  return out;
}

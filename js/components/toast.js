// ============================================================
// components/toast.js
// Mensajes breves: "✓ Movimiento registrado". Accesibles para
// lectores de pantalla (role=status / alert).
// ============================================================

let contenedor = null;

function asegurarContenedor() {
  if (contenedor && document.body.contains(contenedor)) return contenedor;
  contenedor = document.createElement("div");
  contenedor.className = "toasts";
  document.body.appendChild(contenedor);
  return contenedor;
}

/**
 * toast('✓ Movimiento registrado')
 * toast('No se pudo guardar', { tipo: 'error' })
 * toast('Nueva versión', { accion: { label: 'Actualizar', onClick } , duracion: 0 })
 */
export function toast(mensaje, { tipo = "ok", duracion = 2800, accion = null } = {}) {
  const el = document.createElement("div");
  el.className = `toast toast--${tipo}`;
  el.setAttribute("role", tipo === "error" ? "alert" : "status");
  const texto = document.createElement("span");
  texto.textContent = mensaje;
  el.appendChild(texto);

  const cerrar = () => {
    el.classList.remove("toast--visible");
    setTimeout(() => el.remove(), 250);
  };

  if (accion) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast__accion";
    btn.textContent = accion.label;
    btn.addEventListener("click", () => { cerrar(); accion.onClick(); });
    el.appendChild(btn);
  }

  const cont = asegurarContenedor();
  // Máximo 3 avisos a la vez: el más antiguo se va.
  while (cont.children.length >= 3) cont.firstElementChild.remove();
  cont.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast--visible"));
  if (duracion > 0) setTimeout(cerrar, tipo === "error" ? Math.max(duracion, 4500) : duracion);
  return cerrar;
}

export const toastError = (mensaje) => toast(mensaje, { tipo: "error" });

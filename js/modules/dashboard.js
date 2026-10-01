// ============================================================
// modules/dashboard.js
// PLANTILLA de módulo. Copiar este archivo por cada sección nueva
// (clientes.js, cobros.js, reportes.js...) y registrarlo en
// router.js. Cada módulo es dueño de su propio HTML y su propia
// lógica de Firestore — no debe tocar el de otros módulos.
// ============================================================

import { db } from "../firebase-config.js";
// import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function renderDashboard(container, user) {
  container.innerHTML = `
    <h2 style="font-family:var(--font-display); color:var(--accent);">Inicio</h2>
    <p style="color:var(--text-dim); font-size:0.85rem;">
      Sesión activa: ${user?.email || ""}
    </p>
    <p>Este es el módulo de ejemplo. Duplícalo para cada sección real del proyecto.</p>
  `;
}

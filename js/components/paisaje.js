// ============================================================
// components/paisaje.js
// Ilustración del encabezado de "Mi mes" (estilo Clima de Samsung):
// montañas, lago, sol (de día) o luna (de noche) y una alcancía
// mirando al cielo con una moneda. Es una sola imagen vectorial:
// las siluetas son sombras del color del cielo, así combina con
// cualquier estado (bien / justo / mal) y tema (claro / oscuro).
// Panorama de 1200×170: en el teléfono se ve el centro; en
// pantallas anchas se ve completo.
// ============================================================

import { raw } from "../core/dom.js";

const SVG = `<svg class="paisaje" viewBox="0 0 1200 170" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="paisaje-halo">
      <stop offset="0" style="stop-color: var(--astro-halo); stop-opacity: 0.55"/>
      <stop offset="1" style="stop-color: var(--astro-halo); stop-opacity: 0"/>
    </radialGradient>
  </defs>
  <circle class="paisaje__halo" cx="708" cy="34" r="46" fill="url(#paisaje-halo)"/>
  <circle class="paisaje__astro paisaje__sol" cx="708" cy="34" r="15"/>
  <g class="paisaje__luna">
    <circle class="paisaje__astro" cx="708" cy="34" r="13"/>
    <circle class="paisaje__crater" cx="703" cy="30" r="2.6"/>
    <circle class="paisaje__crater" cx="713" cy="39" r="1.8"/>
  </g>
  <path class="paisaje__lejos" d="M0 118 C60 104 110 96 170 100 C230 104 270 84 340 80 C410 76 450 98 520 96 C590 94 620 70 690 72 C760 74 790 92 860 90 C930 88 970 78 1040 82 C1110 86 1150 100 1200 98 L1200 170 L0 170 Z"/>
  <path class="paisaje__medio" d="M0 134 C80 122 150 116 230 122 C310 128 360 110 440 112 C520 114 560 128 640 126 C720 124 760 110 840 114 C920 118 980 130 1060 126 C1120 123 1160 118 1200 120 L1200 170 L0 170 Z"/>
  <rect class="paisaje__agua" x="0" y="132" width="1200" height="38"/>
  <g class="paisaje__reflejo">
    <path d="M640 140 h40 M648 146 h26 M654 152 h14"/>
  </g>
  <path class="paisaje__cerca" d="M0 160 C120 152 240 148 360 152 C480 156 560 154 640 148 C700 143 760 142 820 146 C900 152 1000 158 1200 154 L1200 170 L0 170 Z"/>
  <g transform="translate(-28 0)">
  <g class="paisaje__alcancia">
    <path class="paisaje__cola" d="M712 126 c-6 -1 -7 -7 -2 -8 c4 -1 4 4 0 5"/>
    <ellipse cx="733" cy="128" rx="21" ry="14.5"/>
    <rect x="750" y="122" width="8.5" height="10" rx="3.5"/>
    <path d="M740 116.5 q1.5 -8.5 8.5 -7 q-0.5 6 -5 9.5 z"/>
    <rect x="719" y="136" width="5.5" height="9" rx="2"/>
    <rect x="727" y="138" width="5.5" height="7.5" rx="2"/>
    <rect x="736" y="138" width="5.5" height="7.5" rx="2"/>
    <rect x="744" y="136" width="5.5" height="9" rx="2"/>
    <rect class="paisaje__ranura" x="726" y="115.4" width="11" height="2.2" rx="1.1"/>
    <circle class="paisaje__ojo" cx="746" cy="123" r="1.3"/>
    <circle class="paisaje__nariz" cx="755.5" cy="125.5" r="0.9"/>
    <circle class="paisaje__nariz" cx="755.5" cy="129" r="0.9"/>
  </g>
  <g class="paisaje__moneda">
    <circle cx="731.5" cy="100" r="6"/>
    <path d="M731.5 96.6 v6.8"/>
  </g>
  </g>
</svg>`;

/** La ilustración (sin texto: es decorativa). */
export function paisaje() {
  return raw(SVG);
}

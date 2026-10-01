// ============================================================
// firebase-config.js
// Reemplazar DEFAULT_FB_CONFIG con las credenciales del proyecto
// Firebase de este cliente específico. Se deja embebido directo
// en el código (no solo en localStorage) porque en HD Crédit se
// detectó que localStorage se puede perder con actualizaciones
// del sistema operativo del teléfono.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DEFAULT_FB_CONFIG = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxx"
};

const app = initializeApp(DEFAULT_FB_CONFIG);

// Persistencia de almacenamiento local (evita que iOS/Android
// limpien datos en bajo almacenamiento).
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

export const auth = getAuth(app);
export const db = getFirestore(app);

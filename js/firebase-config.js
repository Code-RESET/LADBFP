// ============================================================
// firebase-config.js
// Reemplazar DEFAULT_FB_CONFIG con las credenciales del proyecto
// Firebase de este cliente específico. Se deja embebido directo
// en el código (no solo en localStorage) porque en HD Crédit se
// detectó que localStorage se puede perder con actualizaciones
// del sistema operativo del teléfono.
//
// Firestore se inicializa CON CACHÉ PERSISTENTE (IndexedDB): la
// app abre y registra movimientos sin conexión y sincroniza al
// reconectar.
//
// Si cambias la versión del SDK (10.12.2), cámbiala también en
// js/core/auth.js, js/data/firestore.js y service-worker.js.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DEFAULT_FB_CONFIG = {
  apiKey: "AIzaSyCTYyrjGrpDc_HCaPeG0s4emgd4rTcHb-c",
  authDomain: "f-p-ladb.firebaseapp.com",
  projectId: "f-p-ladb",
  storageBucket: "f-p-ladb.firebasestorage.app",
  messagingSenderId: "437802758972",
  appId: "1:437802758972:web:d0b66fda5d2571f9fa2439"
};

// Solo para desarrollo: http://localhost:PUERTO/?emulador usa los
// emuladores locales de Firebase. Nunca se activa en GitHub Pages.
export const USA_EMULADOR =
  ["localhost", "127.0.0.1"].includes(location.hostname) &&
  new URLSearchParams(location.search).has("emulador");

const config = USA_EMULADOR ? { ...DEFAULT_FB_CONFIG, apiKey: "demo-key", projectId: "demo-finanzas-reset" } : DEFAULT_FB_CONFIG;
const app = initializeApp(config);

// Persistencia de almacenamiento local (evita que iOS/Android
// limpien datos en bajo almacenamiento).
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (USA_EMULADOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export const CONFIG_PENDIENTE = !USA_EMULADOR && DEFAULT_FB_CONFIG.apiKey === "TU_API_KEY";

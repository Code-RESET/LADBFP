// ============================================================
// app.js
// Arranque: tema, login/logout, sincronización de datos, router
// y service worker. No contiene lógica de negocio.
// ============================================================

import { initTheme } from "./core/theme.js";
import { login, logout, recuperarContrasena, alCambiarSesion } from "./core/auth.js";
import { mensajeDeError } from "./core/errors.js";
import { subscribe, getState } from "./core/state.js";
import { iniciarSync, detenerSync } from "./data/sync.js";
import { initRouter, detenerRouter } from "./router.js";
import { CONFIG_PENDIENTE } from "./firebase-config.js";
import { toast, toastError } from "./components/toast.js";
import { cerrarTodas } from "./components/modal.js";
import { abrirFormularioMovimiento } from "./components/movimientoForm.js";
import { confirmar } from "./components/confirmation.js";

initTheme();

const $ = (id) => document.getElementById(id);
const splash = $("splash");
const loginScreen = $("login-screen");
const appShell = $("app-shell");
const loginForm = $("login-form");
const loginError = $("login-error");
const loginBtn = $("login-btn");

if (CONFIG_PENDIENTE) {
  loginError.textContent = "Falta configurar Firebase en js/firebase-config.js.";
  loginError.hidden = false;
}

// ---------- Login ----------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = "Entrando…";
  try {
    await login($("login-email").value.trim(), $("login-password").value);
    // alCambiarSesion se encarga de mostrar la app
  } catch (err) {
    loginError.textContent = mensajeDeError(err, "No se pudo iniciar sesión. Intenta de nuevo.");
    loginError.hidden = false;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Entrar";
  }
});

$("login-olvide").addEventListener("click", async () => {
  const email = $("login-email").value.trim();
  if (!email) {
    loginError.textContent = "Escribe tu correo y vuelve a tocar «¿Olvidaste tu contraseña?».";
    loginError.hidden = false;
    return;
  }
  try {
    await recuperarContrasena(email);
    toast("✓ Te enviamos un correo para restablecer la contraseña");
  } catch (err) {
    loginError.textContent = mensajeDeError(err);
    loginError.hidden = false;
  }
});

// ---------- Acciones globales del shell ----------
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-accion]");
  if (!el) return;
  const accion = el.dataset.accion;
  if (accion === "nuevo-movimiento") {
    abrirFormularioMovimiento({ tipo: el.dataset.tipo, cajaId: el.dataset.caja });
  } else if (accion === "cerrar-sesion") {
    const ok = await confirmar({ titulo: "Cerrar sesión", mensaje: "¿Seguro que quieres salir?", botonConfirmar: "Salir" });
    if (ok) logout();
  }
});

// ---------- Indicador de conexión / sincronización ----------
function pintarSync() {
  const el = $("sync-estado");
  const offline = !navigator.onLine;
  const pendiente = getState().pendientesSync;
  el.hidden = !offline && !pendiente;
  el.textContent = offline ? "Sin conexión" : "Sincronizando…";
  el.classList.toggle("sync--offline", offline);
}
window.addEventListener("online", pintarSync);
window.addEventListener("offline", pintarSync);
subscribe(pintarSync);

// ---------- Sesión ----------
alCambiarSesion((user) => {
  splash.hidden = true;
  if (user) {
    loginScreen.hidden = true;
    appShell.hidden = false;
    $("usuario-email").textContent = user.email || "";
    iniciarSync(user, { onError: toastError });
    initRouter({ user });
    pintarSync();
  } else {
    cerrarTodas({ mantenerHistorial: true });
    detenerRouter();
    detenerSync();
    appShell.hidden = true;
    loginScreen.hidden = false;
    $("app-content").innerHTML = "";
  }
});

// ---------- Service worker ----------
// En desarrollo se puede desactivar con ?nosw en la URL.
if ("serviceWorker" in navigator && !new URLSearchParams(location.search).has("nosw")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((err) => {
      console.warn("Service worker no registrado:", err);
    });
  });
  // Cuando una versión nueva toma el control, ofrecer recargar.
  let recargando = false;
  const habiaControlador = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!habiaControlador || recargando) return;
    toast("Hay una versión nueva de la app", {
      duracion: 0,
      accion: { label: "Actualizar", onClick: () => { recargando = true; location.reload(); } },
    });
  });
}

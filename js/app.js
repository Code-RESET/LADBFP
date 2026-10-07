// ============================================================
// app.js
// Arranque: tema, login/logout, sincronización de datos, router
// y service worker. No contiene lógica de negocio.
// ============================================================

import { initTheme } from "./core/theme.js";
import { login, logout, recuperarContrasena, alCambiarSesion } from "./core/auth.js";
import { mensajeDeError } from "./core/errors.js";
import { hoy } from "./core/dates.js";
import { subscribe, getState } from "./core/state.js";
import { iniciarSync, detenerSync } from "./data/sync.js";
import { initRouter, detenerRouter, parseHash } from "./router.js";
import { CONFIG_PENDIENTE } from "./firebase-config.js";
import { toast, toastError } from "./components/toast.js";
import { cerrarTodas } from "./components/modal.js";
import { abrirFormularioMovimiento } from "./components/movimientoForm.js";
import { abrirRegistro } from "./components/registroSimple.js";
import { confirmar } from "./components/confirmation.js";
import { registrarServiceWorker, buscarActualizacion, MENSAJE_ACTUALIZACION } from "./services/actualizacion.js";

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
    // Gasto/ingreso: registro rápido (nombre + monto). Mover dinero: formulario completo.
    const tipo = el.dataset.tipo;
    if (tipo && !["gasto", "ingreso"].includes(tipo)) abrirFormularioMovimiento({ tipo, cajaId: el.dataset.caja });
    else {
      const { params } = parseHash();
      const mes = /^\d{4}-\d{2}$/.test(params.get("mes") || "") ? params.get("mes") : undefined;
      abrirRegistro({ tipo: tipo || "gasto", cajaId: el.dataset.caja, mes });
    }
  } else if (accion === "descargar-excel") {
    if (el.disabled) return;
    el.disabled = true;
    const cerrarAviso = toast("Preparando tu Excel…", { duracion: 0 });
    try {
      const { descargarExcel } = await import("./services/exportExcel.js");
      const mes = /^\d{4}-\d{2}$/.test(el.dataset.mes || "") ? el.dataset.mes : hoy().slice(0, 7);
      const r = await descargarExcel(mes);
      cerrarAviso();
      if (r === "descargado") toast("✓ Excel descargado");
    } catch (err) {
      cerrarAviso();
      toastError(mensajeDeError(err, "No se pudo crear el Excel."));
    } finally {
      el.disabled = false;
    }
  } else if (accion === "actualizar-app") {
    if (el.disabled) return;
    el.disabled = true;
    try {
      const r = await buscarActualizacion();
      if (r === "actualizando") toast("Descargando la versión nueva… la app se reiniciará", { duracion: 0 });
      else if (r === "al-dia") toast(MENSAJE_ACTUALIZACION[r]);
      else toastError(MENSAJE_ACTUALIZACION[r]);
    } catch (err) {
      toastError(mensajeDeError(err, "No se pudo buscar la actualización."));
    } finally {
      el.disabled = false;
    }
  } else if (accion === "revisar-datos") {
    const { revisarDatos } = await import("./modules/configuracion/verificar.js");
    revisarDatos(getState().user.uid).catch((err) => toastError(mensajeDeError(err)));
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

// ---------- Service worker y actualizaciones ----------
// En desarrollo se puede desactivar con ?nosw en la URL.
// Cuando llega una versión nueva aparece el botón "Actualizar" arriba (se queda hasta tocarlo).
registrarServiceWorker({
  onNuevaVersion: (recargar) => {
    const btn = $("btn-actualizar");
    btn.hidden = false;
    btn.onclick = recargar;
    toast("Hay una versión nueva de la app", { duracion: 6000, accion: { label: "Actualizar", onClick: recargar } });
  },
});

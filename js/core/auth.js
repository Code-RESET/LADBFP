// ============================================================
// core/auth.js
// Solo autenticación: login, logout, recuperar contraseña y
// aviso de cambios de sesión. Sin lógica de negocio.
// ============================================================

import { auth } from "../firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);
export const recuperarContrasena = (email) => sendPasswordResetEmail(auth, email);
export const alCambiarSesion = (fn) => onAuthStateChanged(auth, fn);

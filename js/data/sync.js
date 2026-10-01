// ============================================================
// data/sync.js
// Al iniciar sesión, escucha los catálogos pequeños y los deja
// en core/state. Al cerrar sesión, cancela todos los listeners.
// ============================================================

import { setState, marcarListo, resetState, getState } from "../core/state.js";
import { cajasRepo, cuentasRepo, categoriasRepo } from "./catalogosRepo.js";
import { perfilRepo, agregadosRepo } from "./perfilRepo.js";
import { sincronizarDesdeNube } from "../core/theme.js";
import { mensajeDeError } from "../core/errors.js";

let cancelaciones = [];
const pendientes = {};

function marcarPendiente(clave, meta) {
  pendientes[clave] = !!meta?.hasPendingWrites;
  const hay = Object.values(pendientes).some(Boolean);
  if (hay !== getState().pendientesSync) setState({ pendientesSync: hay });
}

export function iniciarSync(user, { onError } = {}) {
  detenerSync();
  setState({ user });
  const uid = user.uid;
  const error = (err) => onError?.(mensajeDeError(err, "No se pudieron cargar tus datos."));

  cancelaciones = [
    cajasRepo.escuchar(uid, (cajas, meta) => { setState({ cajas, cajasDesdeCache: meta.fromCache }); marcarListo("cajas"); marcarPendiente("cajas", meta); }, error),
    cuentasRepo.escuchar(uid, (cuentas, meta) => { setState({ cuentas }); marcarListo("cuentas"); marcarPendiente("cuentas", meta); }, error),
    categoriasRepo.escuchar(uid, (categorias, meta) => { setState({ categorias }); marcarListo("categorias"); marcarPendiente("categorias", meta); }, error),
    agregadosRepo.escuchar(uid, (agregados, meta) => { setState({ agregados }); marcarListo("agregados"); marcarPendiente("agregados", meta); }, error),
    perfilRepo.escuchar(uid, (perfil) => {
      setState({ perfil });
      marcarListo("perfil");
      sincronizarDesdeNube(perfil?.config?.tema);
    }, error),
  ];
}

export function detenerSync() {
  cancelaciones.forEach((fn) => fn());
  cancelaciones = [];
  resetState();
}

// ============================================================
// services/descarga.js
// Entrega un archivo generado en el teléfono o la computadora
// (Excel, respaldo). En la app instalada de iOS un <a download>
// solo abre una vista previa: ahí se usa la hoja de compartir
// (Guardar en Archivos, Drive, correo…).
// Devuelve 'compartido' | 'cancelado' | 'descargado'.
// ============================================================

export async function entregarArchivo(archivo) {
  const instalada = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
  if (instalada && navigator.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: archivo.name }); return "compartido"; }
    catch (err) { if (err?.name === "AbortError") return "cancelado"; }
  }
  const url = URL.createObjectURL(archivo);
  const a = Object.assign(document.createElement("a"), { href: url, download: archivo.name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "descargado";
}

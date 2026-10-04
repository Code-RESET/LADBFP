// ============================================================
// modules/plan/sugerencias.js
// Datos conocidos del prompt maestro (secciones 14, 21 y 41),
// ofrecidos como "sugerencias": abren el formulario PRELLENADO
// para que confirmes o completes antes de guardar. Nada se crea
// solo, porque varios datos están pendientes (días de pago,
// montos de deudas) y no se deben asumir (sección 42).
// ============================================================

import { hoy } from "../../core/dates.js";
import { nombreRepetido } from "../../core/validation.js";

const desde = () => hoy();

export const SUGERENCIAS = {
  recurrente: [
    { etiqueta: "Ingresos Reset Alarmas · $18,044/mes", confirmar: "Confirma el día en que suele entrar.",
      datos: { tipo: "ingreso", nombre: "Ingresos Reset Alarmas", montoCentavos: 1804400, regla: { frecuencia: "mensual", diaMes: 30, desde: desde() },
        cajaId: "reset-alarmas", cuentaId: "mercado-pago", categoriaId: "in-instalaciones" } },
    { etiqueta: "Cobranza HD Crédit · $7,577.50 quincenal ($15,155/mes)", confirmar: "",
      datos: { tipo: "ingreso", nombre: "Cobranza HD Crédit", montoCentavos: 757750, regla: { frecuencia: "quincenal", desde: desde() },
        cajaId: "hd-credit", cuentaId: "bbva-hd", categoriaId: "in-cobranza" } },
    { etiqueta: "Nómina IMSS · ~$3,490", confirmar: "Confirma si es mensual o quincenal y el monto exacto.",
      datos: { tipo: "ingreso", nombre: "Nómina IMSS", montoCentavos: 349000, regla: { frecuencia: "mensual", diaMes: 30, desde: desde() },
        cajaId: "personal-imss", cuentaId: "hsbc", categoriaId: "in-sueldo" } },
    { etiqueta: "Sueldo personal · HD Crédit → Nu · $3,500/semana", confirmar: "Es la ruta del sueldo (pendiente 42.1): confirma día y cuentas.",
      datos: { tipo: "transferencia", nombre: "Sueldo personal", montoCentavos: 350000, regla: { frecuencia: "semanal", diaSemana: 5, desde: desde() },
        cajaId: "hd-credit", cuentaId: "bbva-hd", cajaDestinoId: "sueldo-personal", cuentaDestinoId: "nu" } },
  ],
  obligacion: [
    { etiqueta: "Trabajadora · $3,200–$8,000 (presupuesto $8,000)", confirmar: "Confirma la frecuencia y el día de pago.",
      datos: { nombre: "Trabajadora", montoCentavos: 800000, variable: true, minimoCentavos: 320000, maximoCentavos: 800000,
        regla: { frecuencia: "mensual", diaMes: 30, desde: desde() }, cajaId: "reset-alarmas", cuentaId: "mercado-pago", categoriaId: "ga-negocio" } },
    { etiqueta: "Colegiatura (Personal / IMSS)", confirmar: "Escribe el monto y el día.",
      datos: { nombre: "Colegiatura", regla: { frecuencia: "mensual", diaMes: 5, desde: desde() }, cajaId: "personal-imss", cuentaId: "hsbc", categoriaId: "ga-educacion" } },
    { etiqueta: "Celular (Personal / IMSS)", confirmar: "Escribe el monto y el día.",
      datos: { nombre: "Celular", regla: { frecuencia: "mensual", diaMes: 10, desde: desde() }, cajaId: "personal-imss", cuentaId: "hsbc", categoriaId: "ga-servicios" } },
    { etiqueta: "Cuota de casa (Personal / IMSS)", confirmar: "Escribe el monto y el día.",
      datos: { nombre: "Cuota de casa", regla: { frecuencia: "mensual", diaMes: 1, desde: desde() }, cajaId: "personal-imss", cuentaId: "hsbc", categoriaId: "ga-casa" } },
  ],
  deuda: [
    { etiqueta: "Préstamo Dra. Marcela (Reset Alarmas)", confirmar: "Escribe saldo, pago y frecuencia.",
      datos: { acreedor: "Dra. Marcela", descripcion: "Préstamo", regla: { frecuencia: "mensual", diaMes: 15, desde: desde() }, cajaId: "reset-alarmas", cuentaId: "mercado-pago" } },
    { etiqueta: "Deuda con mi esposa (Reset Alarmas)", confirmar: "Escribe saldo, pago y frecuencia.",
      datos: { acreedor: "Esposa", descripcion: "Deuda personal", regla: { frecuencia: "mensual", diaMes: 15, desde: desde() }, cajaId: "reset-alarmas", cuentaId: "mercado-pago" } },
    { etiqueta: "Electrodomésticos (Reset Alarmas)", confirmar: "Escribe saldo, pago y frecuencia.",
      datos: { acreedor: "Electrodomésticos", descripcion: "Compra a plazos", categoriaId: "ga-electrodomesticos",
        regla: { frecuencia: "mensual", diaMes: 15, desde: desde() }, cajaId: "reset-alarmas", cuentaId: "mercado-pago" } },
  ],
  presupuesto: [
    { etiqueta: "Sueldo personal semanal · $3,500 vs $4,021 (déficit $521)", confirmar: "",
      datos: { nombre: "Sueldo personal semanal", periodo: "semanal", cajaId: "sueldo-personal", ingresoCentavos: 350000,
        lineas: [{ categoriaId: "ga-casa", montoCentavos: 250000 }, { categoriaId: "ga-entretenimiento", montoCentavos: 83100 }, { categoriaId: "ga-comida", montoCentavos: 69000 }],
        coberturas: [] } },
  ],
};

/** Sugerencias de un tipo que todavía no existen (por nombre / acreedor). */
export function sugerenciasPendientes(tipo, existentes) {
  const campo = tipo === "deuda" ? "acreedor" : "nombre";
  const lista = existentes.map((x) => ({ id: x.id, nombre: x[campo] }));
  return SUGERENCIAS[tipo]
    .map((s, i) => ({ ...s, i }))
    .filter((s) => !nombreRepetido(s.datos[campo], lista));
}

# Code-Reset — Contexto del proyecto

Desarrollador: Ing. Luis Ángel Díaz Bernal. Empresa: CODE-RESET.

## Stack fijo (no cambiar sin que Angel lo pida)
- HTML + CSS + JS puro, ES6 modules. Sin build step, sin npm install para correr.
- Debe correr sin instalar nada en Chrome, Safari (iOS), Samsung Internet, Firefox.
- PWA: manifest.json + service-worker.js + ícono personalizado.
- Backend: Firebase (Auth + Firestore).
- Arquitectura modular: un archivo por función en /js y /js/modules.
- Navegación por routing (hash), sin recargar la página.
- Responsive: PC, tablet, iPhone, Android.

## Pantalla de login obligatoria
Logo pequeño + "Desarrollado por: Ing. Luis Ángel Díaz Bernal" + "Compañía: CODE-RESET".

## Cómo agregar un módulo nuevo (Finanzas Reset)
1. Crear js/modules/<nombre>/index.js (plantilla mínima: js/modules/plan/index.js).
2. Escribir su render(container, ctx) — ctx.user es el usuario — y devolver una función de limpieza.
3. Lógica financiera en js/domain/ (pura, con prueba en tests/); acceso a Firestore solo en js/data/.
4. Registrarlo en el arreglo MODULES de js/router.js.
5. Agregarlo a CORE_ASSETS de service-worker.js (node tests/run.mjs lo verifica) y subir CACHE_VERSION.

## Antes de dar por terminado un proyecto
- Probar en Chrome, Safari iOS, Samsung Internet.
- Escribir y probar Firestore security rules (cuidado: en NEXORA hubo un bug donde puede()
  existía pero nunca se llamaba, y todos terminaban con acceso admin).
- Confirmar que la app es instalable como PWA en Android e iOS.
- Actualizar CACHE_VERSION en service-worker.js si se tocó el shell base.

## Estilo de trabajo con Angel
Angel es el arquitecto/product owner: revisa, prueba y despliega, pero no escribe todo
el código a mano. Explica brevemente el "por qué" de las decisiones técnicas.

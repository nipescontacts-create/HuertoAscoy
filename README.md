# HuertoAscoy

Aplicacion web (adaptable a movil) para gestionar un huerto domestico:

- Registro/Login con codigo secreto (`gimoya`)
- Sesion persistente y cierre de sesion
- Panel de control protegido (codigo `2803`)
- Mensajeria entre dispositivos/usuarios
- Dashboard con numero de plantas, riegos pendientes y ultima actividad
- Clima de Ascoy - Cieza (OpenWeatherMap)
- Gestion de plantas
- Riego manual y riego automatico programable
- Historial de riegos (fecha, hora, tipo)
- Seguimiento visual con fotos por planta
- Diario por planta (notas, fertilizantes, problemas, observaciones)
- Integracion activa con Firebase Realtime Database

## Ejecutar

Como no requiere build:

1. Abre la carpeta `HuertoAscoy`.
2. Abre `index.html` en tu navegador.

Opcional: servir con un servidor local para mejor compatibilidad.

## Instalar en movil (PWA)

La app ya incluye:

- `manifest.webmanifest`
- `sw.js` (service worker)
- Boton `Instalar app` cuando el navegador lo permita

Para poder buscarla en Google y abrirla desde cualquier movil, debes publicarla en un hosting HTTPS (Firebase Hosting, Netlify, Vercel, etc.).

## Configurar OpenWeatherMap

Edita `app.js` y rellena:

```js
const OPENWEATHER_API_KEY = "TU_API_KEY";
```

## Firebase incluido

La app ya incluye tu proyecto Firebase:

- `huertoascoy.firebaseapp.com`
- `https://huertoascoy-default-rtdb.firebaseio.com/`

Se sincronizan usuarios, plantas y mensajes.

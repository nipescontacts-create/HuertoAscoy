# HuertoAscoy

Aplicacion web (adaptable a movil) para gestionar un huerto domestico:

- Registro/Login con codigo secreto (`gimoya`)
- Sesion persistente y cierre de sesion
- Dashboard con numero de plantas, riegos pendientes y ultima actividad
- Clima de Ascoy - Cieza (OpenWeatherMap)
- Gestion de plantas
- Riego manual y riego automatico programable
- Historial de riegos (fecha, hora, tipo)
- Seguimiento visual con fotos por planta
- Diario por planta (notas, fertilizantes, problemas, observaciones)
- Integracion opcional con Firebase

## Ejecutar

Como no requiere build:

1. Abre la carpeta `HuertoAscoy`.
2. Abre `index.html` en tu navegador.

Opcional: servir con un servidor local para mejor compatibilidad.

## Configurar OpenWeatherMap

Edita `app.js` y rellena:

```js
const OPENWEATHER_API_KEY = "TU_API_KEY";
```

## Configurar Firebase

Edita `app.js` y rellena `FIREBASE_CONFIG`:

```js
const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
```

Si no se configura Firebase, la app guarda datos en `localStorage`.

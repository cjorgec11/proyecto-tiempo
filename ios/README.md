# RideCast iOS

App nativa para iPhone y iPad que carga la web de RideCast en un `WKWebView`.
Empaqueta directamente `index.html`, `styles.css`, `app.js` y `js/` de la raíz
del repositorio, así que no hay una copia de la web que mantener: cada build
lleva la versión actual.

## Requisitos

- Un Mac con Xcode 15 o posterior.
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`.
- Para instalarla en tu iPhone, una cuenta de Apple (vale la gratuita).

## Abrir y ejecutar

```
cd ios
xcodegen generate
open RideCast.xcodeproj
```

En Xcode:

1. Selecciona el target **RideCast** → *Signing & Capabilities* y elige tu
   equipo (*Team*). Si el identificador `com.ridecast.app` ya está cogido,
   cámbialo por otro, por ejemplo `com.tunombre.ridecast`.
2. Conecta el iPhone, elígelo como destino y pulsa ▶︎.
3. La primera vez, en el iPhone: *Ajustes → General → VPN y gestión de
   dispositivos* → confía en tu certificado de desarrollador.

Con una cuenta gratuita la app caduca a los 7 días y hay que volver a
instalarla desde Xcode. Para TestFlight o la App Store hace falta el Apple
Developer Program.

`RideCast.xcodeproj` no se sube al repositorio: se genera desde `project.yml`.
Si añades ficheros, vuelve a ejecutar `xcodegen generate`.

## Cómo funciona

- **Esquema propio:** la web se sirve como `ridecast://localhost/` desde el
  bundle (`AppSchemeHandler.swift`). Con `file://` WebKit no carga los módulos
  ES de la app ni da un origen estable para `localStorage`. Solo se sirven
  ficheros `.html`, `.css` y `.js`.
- **Exportar GPX:** la descarga se guarda en un fichero temporal y se abre la
  hoja de compartir de iOS para guardarla en Archivos, enviarla o abrirla en
  otra app.
- **Importar GPX/TCX:** usa el selector de archivos de iOS; la app declara los
  tipos `.gpx` y `.tcx` para que aparezcan seleccionables.
- **Enlaces externos** (como la atribución de OpenStreetMap) se abren en Safari.
- **Permisos:** no pide ubicación, cámara ni micrófono; cualquier petición de
  cámara o micrófono desde la web se rechaza.

## Integración continua

`.github/workflows/ios.yml` genera el proyecto y compila la app para el
simulador (sin firmar) en cada cambio de `ios/` o de la web.

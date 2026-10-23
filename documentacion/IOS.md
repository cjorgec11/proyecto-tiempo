# App de iOS

La app de iPhone y iPad usa Capacitor, igual que la de Android: empaqueta el
cliente web de `www/` y lo muestra en una vista web nativa. No hay una copia del
código web que mantener; cada sincronización lleva la versión actual.

## Requisitos

- Un Mac con Xcode actualizado.
- Node.js y las dependencias del proyecto (`npm ci`).
- Para instalarla en un iPhone, una cuenta de Apple (vale la gratuita).

## Compilar e instalar

```sh
npm ci
npm run sincronizar:ios
open ios/App/App.xcodeproj
```

En Xcode:

1. Selecciona el target **App** → *Signing & Capabilities* y elige tu equipo
   (*Team*). Si `com.jorge.ridecast` no está disponible para tu cuenta, cambia el
   *Bundle Identifier*.
2. Conecta el iPhone, elígelo como destino y pulsa ▶︎.
3. La primera vez, en el iPhone: *Ajustes → General → VPN y gestión de
   dispositivos* → confía en tu certificado de desarrollador.

Con una cuenta gratuita la app caduca a los 7 días y hay que volver a instalarla
desde Xcode. TestFlight y la App Store requieren el Apple Developer Program.

Repetir `npm run sincronizar:ios` después de cambiar el cliente web.

## Instalar sin Mac (Windows)

Cada cambio en GitHub genera `RideCast.ipa` sin firmar: en la pestaña
*Actions*, abrir la última ejecución de **iOS** y descargar el artefacto
**RideCast-ipa-sin-firmar** (un .zip que contiene el .ipa).

Para instalarlo, [Sideloadly](https://sideloadly.io) lo firma con tu Apple ID:

1. Instalar iTunes e iCloud descargados desde la web de Apple (no la versión
   de Microsoft Store) y después Sideloadly.
2. Conectar el iPhone por cable y aceptar «Confiar en este ordenador».
3. Arrastrar `RideCast.ipa` a Sideloadly, escribir tu Apple ID y pulsar *Start*.
4. En el iPhone: *Ajustes → General → VPN y gestión de dispositivos* → confiar
   en tu Apple ID. En iOS 16 o posterior, activar además *Ajustes → Privacidad y
   seguridad → Modo de desarrollador* y reiniciar.

Con un Apple ID gratuito la app caduca a los 7 días: repetir el paso 3 para
renovarla (los datos de la app se conservan).

## Diferencias con la web

- **Exportar GPX** abre la hoja de compartir de iOS (guardar en Archivos,
  Garmin Connect, AirDrop…), porque la vista web de iOS no descarga archivos.
  Lo hace `ios/App/App/ArchivoGpxPlugin.swift`; la web lo usa solo cuando está
  disponible, así que el resto de plataformas no cambia.
- **Importar GPX/TCX** usa el selector de archivos de iOS; la app declara esos
  tipos para que se puedan elegir.
- Como en Android, las cuentas, sugerencias y el historial necesitan el
  servidor y no están disponibles dentro de la app.

## Integración continua

`.github/workflows/ios.yml` compila la app para el simulador en un Mac de
GitHub, la abre y guarda una captura, y genera el `.ipa` sin firmar descrito
arriba. Ambos quedan como artefactos de la ejecución durante 90 días.

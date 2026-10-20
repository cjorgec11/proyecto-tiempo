# RideCast Android

Wrapper nativo (WebView) que empaqueta la app web RideCast como APK Android.

## Compilar

Requisitos: JDK 17+, Gradle 8.7+, Android SDK 34, build-tools 34.0.0.

```
export ANDROID_HOME=/ruta/al/android-sdk
cd android
gradle :app:assembleRelease
```

La APK resultante queda en `app/build/outputs/apk/release/ridecast-1.0-release.apk`.

## Notas

- `app/src/main/assets/` contiene una copia de los archivos web (`index.html`,
  `styles.css`, `app.js`, `js/`). Si actualizas la web, copia los ficheros de
  nuevo antes de compilar.
- Para firmar el release con un keystore propio, crea `android/keystore.properties`
  (está en `.gitignore`, no lo subas) con `storeFile`, `storePassword`, `keyAlias`
  y `keyPassword`. Si no existe, el release se firma con la clave de debug, que
  solo vale para pruebas internas.

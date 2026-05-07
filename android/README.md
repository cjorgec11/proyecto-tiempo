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
- El build de release está firmado con la clave de debug por defecto, suficiente
  para distribución interna y pruebas. Para Play Store hay que crear un
  keystore propio y configurar `signingConfigs.release` en `app/build.gradle`.

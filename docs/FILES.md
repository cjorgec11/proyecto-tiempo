# Qué es cada archivo

Las rutas son relativas a la raíz del proyecto. Este inventario distingue
código fuente, herramientas, documentación y datos generados. No todo archivo
que no se importa desde JavaScript es sobrante: también lo utilizan Android,
Gradle, Drizzle o los procesos de publicación.

## Flujo de la aplicación

`index.html` carga `app.js` y los módulos de `js/`. El navegador utiliza mapas,
servicios de rutas y meteorología, almacenamiento local y las API del proyecto.
`admin.html` carga la administración. `server.mjs` es la entrada Node y
`server/worker.mjs` la de Sites; ambas comparten los módulos del backend.
Node utiliza SQLite y Sites el enlace D1 `DB`. Electron y Capacitor empaquetan
el cliente web para escritorio y Android.

## Archivos de la raíz y configuración

| Archivo | Función |
| --- | --- |
| `README.md` | Presentación, instalación, comandos y enlaces a las guías. |
| `index.html` | Estructura del planificador, biblioteca, previsión y novedades. |
| `admin.html` | Estructura del panel administrativo; el servidor comprueba los permisos. |
| `app.js` | Inicia los módulos del navegador. |
| `workspace.css` | Estilos actuales y adaptación a móvil. |
| `server.mjs` | Servidor HTTP Node: recursos públicos, API y configuración del entorno. |
| `package.json` | Dependencias, comandos npm y configuración de empaquetado Electron. |
| `package-lock.json` | Versiones exactas para instalaciones reproducibles con `npm ci`. |
| `.env.example` | Plantilla de configuración sin credenciales reales. |
| `.gitignore` | Exclusiones de datos privados, dependencias y resultados generados. |
| `capacitor.config.json` | Identificador de la app Android y carpeta web `www/`. |
| `drizzle.config.ts` | Configuración para generar migraciones del esquema. |
| `.openai/hosting.json` | Identificador del proyecto Sites y enlaces de almacenamiento; no contiene contraseñas. |
| `.claude/launch.json` | Atajo compartido para iniciar el servidor desde la herramienta de desarrollo. |

Las entradas web permanecen en la raíz para conservar sus URL y compatibilidad
con los empaquetados. Solo se mantiene la hoja de estilos que utiliza la app.

## Cliente: `js/`

| Archivo | Función |
| --- | --- |
| `model.js` | Geometría, generación de rutas, formatos GPX/TCX, meteorología y almacenamiento local. |
| `view.js` | Mapas, marcadores y presentación de resultados. |
| `controller.js` | Conecta acciones del usuario con el modelo y la vista. |
| `account.js` | Interfaz de cuenta, autenticación y biblioteca por usuario. |
| `feedback.js` | Sugerencias y votos comunitarios. |
| `route-history.js` | Consentimiento y envío del historial de rutas/previsiones. |
| `admin.js` | Sesión administrativa y gestión de sugerencias. |
| `admin-routes.js` | Consulta y gestión del historial del servidor. |
| `admin-library.js` | Administración de bibliotecas de rutas y usuarios. |
| `admin-editor.js` | Diálogo compartido de edición de rutas. |

## Backend: `server/`

| Archivo | Función |
| --- | --- |
| `worker.mjs` | Entrada de Sites: dirige peticiones a API o recursos públicos. |
| `accounts.mjs` | Cuentas, sesiones, verificación, recuperación y acceso con Google. |
| `admin-auth.mjs` | Autenticación administrativa, caducidad y límites de intentos. |
| `library.mjs` | Biblioteca de rutas por cuenta y operaciones administrativas relacionadas. |
| `routes.mjs` | Historial consentido de rutas/previsiones y su administración. |
| `feedback.mjs` | Sugerencias privadas/públicas, votos y cambios de estado. |
| `security.mjs` | Política de identidad, cabeceras y configuración de seguridad. |
| `crypto.mjs` | Contraseñas, hashes y tokens compartidos. |
| `http.mjs` | Utilidades HTTP compartidas por las API. |
| `local-db.mjs` | Abre SQLite, aplica migraciones y adapta consultas; no se incluye en el Worker. |

## Base de datos

`db/schema.ts` describe las tablas actuales. Los SQL de `drizzle/` son pasos
históricos ordenados, no copias innecesarias del esquema.

| Archivo de `drizzle/` | Cambio principal |
| --- | --- |
| `0000_tearful_sunset_bain.sql` | Sugerencias e índices iniciales. |
| `0001_harsh_moonstone.sql` | Votos y visibilidad pública. |
| `0002_classy_blue_marvel.sql` | Sesiones/límites administrativos y retirada del campo de notificación. |
| `0003_melted_emma_frost.sql` | Historial de rutas/previsiones. |
| `0004_bent_wrecker.sql` | Usuarios y bibliotecas por cuenta. |
| `0005_vengeful_nocturne.sql` | Tokens, sesiones, contraseña, verificación y vinculación Google. |
| `0006_charming_spirit.sql` | Unicidad del correo de las cuentas. |
| `meta/0000_snapshot.json` a `meta/0006_snapshot.json` | Estado del esquema tras cada migración; utilizado por Drizzle para generar las siguientes. |
| `meta/_journal.json` | Orden y registro de migraciones. |

No borrar ni reescribir migraciones aplicadas, aunque la tabla o columna haya
cambiado después. Son necesarias para actualizar instalaciones antiguas.

## Scripts: `scripts/`

| Archivo | Función |
| --- | --- |
| `assets.mjs` | Lista de recursos públicos, copias y limpieza restringida a salidas conocidas. |
| `build.mjs` | Genera `dist/client/`, `dist/server/` y `dist/.openai/` para Sites. |
| `build-mobile.mjs` | Genera los recursos públicos de Capacitor en `www/`. |
| `clean.mjs` | Vacía únicamente `dist/` y `www/`. |
| `prepare-release.mjs` | Prepara fuentes seleccionadas en `.site-release/`, sin configuración personal ni datos. |
| `push-site.mjs` | Publicación de fuentes en Sites; recibe la credencial por terminal sin eco. No es código del navegador. |
| `setup-admin.mjs` | Genera el acceso administrativo local, si no existe, dentro de `.data/`. |

## Pruebas: `tests/`

| Archivo | Qué verifica |
| --- | --- |
| `account-ui.test.mjs` | Interfaz de cuenta y limpieza al cerrar sesión. |
| `accounts.test.mjs` | Registro, sesiones, aislamiento, recuperación y Google. |
| `admin-auth.test.mjs` | Permisos administrativos, cookies, caducidad, CSRF y límites. |
| `admin-routes-ui.test.mjs` | Presentación y gestión del historial administrativo. |
| `app.test.mjs` | Comportamiento general del planificador y la interfaz. |
| `build.test.mjs` | Separación cliente/backend y exclusión de archivos privados. |
| `feedback-ui.test.mjs` | Interfaz y reintentos de sugerencias. |
| `feedback.test.mjs` | Sugerencias, privacidad, votos y persistencia. |
| `model.test.mjs` | Geometría, formatos de rutas, meteorología y almacenamiento. |
| `route-history-ui.test.mjs` | Consentimiento, instantáneas y reintentos. |
| `routes.test.mjs` | Validación y permisos del historial. |
| `standalone-security.test.mjs` | Configuración, suplantación, proxy HTTPS y protección de archivos. |
| `generator-live.mjs` | Prueba manual de servicios reales con coordenadas públicas. Ejecutar `node tests/generator-live.mjs`; requiere Internet y no se ejecuta con `npm test`. |
| `fixtures/mobile-route.gpx` | Ejemplo pequeño para probar manualmente la importación desde el selector de archivos del móvil. |

## Bibliotecas: `vendor/`

| Archivo o grupo | Función |
| --- | --- |
| `lucide.js` | Iconos de la interfaz. |
| `LUCIDE-LICENSE` | Licencia que acompaña a Lucide. |
| `leaflet/leaflet.js` | Distribución de Leaflet que cargan las páginas. |
| `leaflet/leaflet.css` | Estilos del mapa y sus controles. |
| `leaflet/leaflet.js.map` | Mapa de depuración referenciado por la distribución activa. |
| `leaflet/LICENSE` | Licencia de Leaflet. |
| `leaflet/images/layers.png`, `layers-2x.png` | Iconos de capas y versión de alta densidad. |
| `leaflet/images/marker-icon.png`, `marker-icon-2x.png`, `marker-shadow.png` | Marcadores estándar y sombra. |

Se han eliminado `leaflet-src.js`, `leaflet-src.esm.js` y sus dos mapas: ninguna
entrada, módulo o script de la aplicación los cargaba. Se conservan la versión
utilizada, sus recursos y las licencias. No editar código de bibliotecas a mano.

## Escritorio y Android

`electron/main.cjs` crea la ventana de escritorio, carga el cliente local y
gestiona enlaces externos. `package.json` determina los archivos empaquetados.

| Archivo o grupo dentro de `android/` | Función |
| --- | --- |
| `build.gradle`, `settings.gradle` | Configuración general y módulos de Gradle. |
| `variables.gradle` | Versiones de SDK y bibliotecas Android. |
| `gradle.properties` | Opciones de compilación. |
| `capacitor.settings.gradle` | Conexión de módulos nativos de Capacitor. |
| `gradlew`, `gradlew.bat` | Lanzadores de Gradle para Unix y Windows. |
| `gradle/wrapper/gradle-wrapper.jar`, `gradle-wrapper.properties` | Herramienta de arranque y versión reproducible de Gradle; el JAR no es un ejecutable sobrante de la app. |
| `app/build.gradle` | Identificador, SDK, dependencias y modos de compilación. |
| `app/capacitor.build.gradle` | Integración de plugins nativos; puede regenerarse al sincronizar. |
| `app/proguard-rules.pro` | Reglas de conservación para reducción/obfuscación de código. |
| `.gitignore`, `app/.gitignore` | Exclusiones de resultados locales Android. |
| `app/src/main/AndroidManifest.xml` | Actividad inicial, permisos y proveedor de archivos. |
| `app/src/main/java/com/jorge/ridecast/MainActivity.java` | Actividad que inicia Capacitor. |
| `app/src/main/res/layout/activity_main.xml` | Diseño de la actividad nativa. |
| `app/src/main/res/values/strings.xml` | Nombres y textos nativos. |
| `app/src/main/res/values/styles.xml` | Temas Android. |
| `app/src/main/res/values/ic_launcher_background.xml` | Fondo del icono. |
| `app/src/main/res/xml/file_paths.xml` | Rutas autorizadas para compartir archivos. |
| `app/src/main/res/drawable*/` | Pantallas de inicio por orientación/densidad y componentes gráficos del icono. |
| `app/src/main/res/mipmap-*/` | Iconos normales, redondos, adaptativos y versiones por densidad de pantalla. |

Las variantes de imágenes Android no son duplicados intercambiables: el sistema
elige la apropiada para cada dispositivo. Se conservan las plataformas activas.

## Documentos: `docs/`

| Archivo | Tema |
| --- | --- |
| `FILES.md` | Este inventario detallado. |
| `STRUCTURE.md` | Resumen de arquitectura y mantenimiento. |
| `DEPLOYMENT.md` | Servidor, publicación, proxy HTTPS y seguridad. |
| `ACCOUNTS.md` | Cuentas, correo, Google y autenticación. |
| `FEEDBACK.md` | Sugerencias, votos, administración e historial consentido. |

## Carpetas y archivos locales excluidos de Git

| Ruta | Contenido y tratamiento |
| --- | --- |
| `.git/` | Historial y configuración del repositorio. No borrar. |
| `.data/` | SQLite, credenciales y datos privados. No borrar ni publicar. |
| `.env` | Variables privadas del entorno. No publicar. |
| `node_modules/` | Dependencias instaladas; regenerables con `npm ci`. |
| `dist/`, `www/` | Builds regenerables con los scripts web/móvil; `npm run clean` los vacía. |
| `dist-electron/` | Ejecutables y entregas previas de escritorio; conservar si se necesitan esas versiones. |
| `.site-release/` | Fuentes y repositorio Git separado de publicación; no vaciar indiscriminadamente. |
| `.site-artifacts/` | Informes de auditoría, resultados y entregas anteriores. No forman parte del código publicado. |
| `.claude/settings.local.json`, `.claude/worktrees/` | Configuración personal y trabajo local; ignorados por Git. |
| `android/.gradle/`, `android/build/`, `android/app/build/` | Cachés/resultados regenerables por Gradle. |
| `android/local.properties` | Ruta del SDK en ese equipo. |
| `android/app/src/main/assets/` y módulos generados de Capacitor | Copias regeneradas por `npm run cap:sync`; no editar allí el cliente web. |

Se ha retirado el comprimido temporal `.site-release.tar.gz` de la raíz.
Los datos, informes y entregas históricas se conservan. No usar `git clean -fdx`
como limpieza rutinaria: también eliminaría archivos privados y trabajo ignorado.

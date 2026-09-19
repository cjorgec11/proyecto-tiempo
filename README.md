# RideCast

Planificador de rutas ciclistas con previsión meteorológica por tramo,
importación/exportación GPX y bibliotecas local y por cuenta. Incluye una versión web y
envoltorios para Windows (Electron) y Android (Capacitor).

## Empezar

Requiere Node.js 24 y npm. Desde la raíz del repositorio:

```sh
npm ci
npm start
```

Abrir http://127.0.0.1:5173. La biblioteca del navegador funciona sin cuenta.
Las cuentas usan la base del proyecto; Google y los correos de verificación
requieren [configuración](docs/ACCOUNTS.md).
Consultar la [guía de despliegue](docs/DEPLOYMENT.md) antes de exponer el servidor.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm start` | Servidor Node en loopback |
| `npm test` | Pruebas automatizadas con datos aislados |
| `npm run clean` | Vaciar solo `dist/` y `www/`; conserva datos y publicaciones |
| `npm run build` | Web y Worker para Sites en `dist/` |
| `npm run build:mobile` | Recursos públicos de Capacitor en `www/` |
| `npm run setup:admin` | Generar acceso administrativo local |
| `npm run electron` | Abrir la aplicación de escritorio |
| `npm run build:win` | Empaquetar Windows en `dist-electron/` |
| `npm run cap:sync` | Preparar recursos y sincronizar Android |
| `npm run cap:build:apk` | Compilar APK de depuración en Windows |
| `npm run prepare:release` | Preparar fuentes de Sites en `.site-release/` |

Android necesita su SDK y Java/Gradle compatibles con el proyecto. En otros
sistemas, ejecutar `npm run cap:sync` y después `./gradlew assembleDebug` dentro
de `android/`. Las tareas de compilación web y móvil regeneran sus directorios
de salida; no colocar archivos propios dentro de `dist/` o `www/`.

## Organización

| Ruta | Contenido |
| --- | --- |
| `index.html`, `admin.html`, `app.js`, `workspace.css` | Entradas e interfaz web |
| `js/` | Lógica y presentación del navegador |
| `server.mjs`, `server/` | Servidor Node, Worker y API |
| `db/`, `drizzle/` | Esquema y migraciones; conservar su historial |
| `scripts/` | Compilación, empaquetado y configuración |
| `tests/` | Pruebas y datos de ejemplo |
| `docs/` | Administración, privacidad y despliegue |
| `electron/`, `android/` | Aplicaciones nativas |
| `vendor/` | Bibliotecas del navegador y sus licencias |

Las carpetas `.data/`, `node_modules/`, `dist/`, `dist-electron/`, `www/`,
`.site-release/` y `.site-artifacts/` son privadas o generadas y no se versionan.
La configuración personal de herramientas y sus worktrees tampoco se publica.
Los archivos de Gradle Wrapper, migraciones y licencias sí forman parte del
repositorio y son necesarios.

## Documentación

- [Servidor independiente y controles de seguridad](docs/DEPLOYMENT.md)
- [Sugerencias, administración e historial de rutas](docs/FEEDBACK.md)
- [Cuentas, Google y contraseñas](docs/ACCOUNTS.md)
- [Mapa del código y mantenimiento](docs/STRUCTURE.md)
- [Qué es cada archivo y cuáles se pueden regenerar](docs/FILES.md)

El build de Sites requiere `.openai/hosting.json`; los secretos se configuran
en el servidor, nunca en recursos públicos. `AUTH_MODE=sites` solo es válido
detrás del dispatcher de Sites. No publicar la raíz del repositorio como web.

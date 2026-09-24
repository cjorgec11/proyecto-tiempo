# RideCast

Planificador de rutas ciclistas con previsión meteorológica por tramo,
importación/exportación GPX y bibliotecas local y por cuenta. Incluye una versión web y
envoltorios para Windows (Electron) y Android (Capacitor).

## Empezar

Requiere Node.js 24 y npm. Desde la raíz del repositorio:

```sh
npm ci
npm run iniciar
```

Abrir http://127.0.0.1:5173. La biblioteca del navegador funciona sin cuenta.
Las cuentas usan la base del proyecto; Google y los correos de verificación
requieren [configuración](documentacion/CUENTAS.md).
Consultar la [guía de despliegue](documentacion/DESPLIEGUE.md) antes de exponer el servidor.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run iniciar` | Servidor Node en loopback |
| `npm run probar` | Pruebas automatizadas con datos aislados |
| `npm run limpiar` | Vaciar solo `dist/` y `www/`; conserva datos y publicaciones |
| `npm run compilar` | Web y Worker para Sites en `dist/` |
| `npm run compilar:movil` | Recursos públicos de Capacitor en `www/` |
| `npm run configurar:administracion` | Generar acceso administrativo local |
| `npm run escritorio` | Abrir la aplicación de escritorio |
| `npm run compilar:windows` | Empaquetar Windows en `dist-electron/` |
| `npm run sincronizar:android` | Preparar recursos y sincronizar Android |
| `npm run compilar:apk` | Compilar APK de depuración en Windows |
| `npm run preparar:publicacion` | Preparar fuentes de Sites en `.site-release/` |

Android necesita su SDK y Java/Gradle compatibles con el proyecto. En otros
sistemas, ejecutar `npm run sincronizar:android` y después `./gradlew assembleDebug` dentro
de `android/`. Las tareas de compilación web y móvil regeneran sus directorios
de salida; no colocar archivos propios dentro de `dist/` o `www/`.

## Organización

| Ruta | Contenido |
| --- | --- |
| `index.html`, `administracion.html`, `aplicacion.js`, `interfaz.css` | Entradas e interfaz web |
| `cliente/` | Lógica y presentación del navegador |
| `servidor.mjs`, `servidor/` | Servidor Node, Worker y API |
| `datos/`, `drizzle/` | Esquema y migraciones; conservar su historial |
| `herramientas/` | Compilación, empaquetado y configuración |
| `pruebas/` | Pruebas y datos de ejemplo |
| `documentacion/` | Administración, privacidad y despliegue |
| `electron/`, `android/` | Aplicaciones nativas |
| `vendor/` | Bibliotecas del navegador y sus licencias |

Las carpetas `.data/`, `node_modules/`, `dist/`, `dist-electron/`, `www/`,
`.site-release/` y `.site-artifacts/` son privadas o generadas y no se versionan.
La configuración personal de herramientas y sus worktrees tampoco se publica.
Los archivos de Gradle Wrapper, migraciones y licencias sí forman parte del
repositorio y son necesarios.

## Documentación

- [Firme verificado y biblioteca de tramos revisados](documentacion/FIRME-VERIFICADO.md)
- [Servidor independiente y controles de seguridad](documentacion/DESPLIEGUE.md)
- [Sugerencias, administración e historial de rutas](documentacion/SUGERENCIAS.md)
- [Cuentas, Google y contraseñas](documentacion/CUENTAS.md)
- [Mapa del código y mantenimiento](documentacion/ESTRUCTURA.md)
- [Qué es cada archivo y cuáles se pueden regenerar](documentacion/ARCHIVOS.md)

El build de Sites requiere `.openai/hosting.json`; los secretos se configuran
en el servidor, nunca en recursos públicos. `AUTH_MODE=sites` solo es válido
detrás del dispatcher de Sites. No publicar la raíz del repositorio como web.

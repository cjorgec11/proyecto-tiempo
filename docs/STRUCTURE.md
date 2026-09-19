# Mapa del repositorio

Inventario detallado: [qué es cada archivo](FILES.md).

## Interfaz

Las entradas `index.html`, `admin.html`, `app.js` y `workspace.css` permanecen
en la raiz para conservar las URL, el servidor local y los empaquetados nativos.

- `js/model.js`: calculos de rutas, meteorologia, importacion y almacenamiento local.
- `js/view.js`: mapas y presentacion.
- `js/controller.js`: acciones del planificador y biblioteca.
- `js/account.js`: interfaz de cuenta y cliente de las API personales.
- `js/feedback.js`, `js/route-history.js`: sugerencias e historial consentido.
- `js/admin*.js`: panel, edicion y colecciones del administrador.

## Servidor

- `server.mjs`: adaptador HTTP local/Node y archivos publicos.
- `server/worker.mjs`: adaptador de Sites.
- `server/accounts.mjs`, `server/admin-auth.mjs`: cuentas y autorizacion administrativa.
- `server/library.mjs`, `server/routes.mjs`, `server/feedback.mjs`: API por funcionalidad.
- `server/crypto.mjs`, `server/http.mjs`: primitivas compartidas, sin dependencias de las API.
- `server/security.mjs`: cabeceras y validacion del entorno.
- `server/local-db.mjs`: adaptador SQLite local; no se incluye en el Worker.
- `db/schema.ts`, `drizzle/`: esquema y migraciones. No borrar ni reescribir migraciones aplicadas.

## Compilacion y pruebas

`scripts/assets.mjs` define los recursos publicos y limita la limpieza a salidas
conocidas. `build.mjs` genera `dist/client`, `dist/server` y `dist/.openai`;
no duplica los recursos del cliente en la raiz de `dist`. `build-mobile.mjs`
genera `www`. `tests/` cubre interfaz, API, seguridad y estructura de ambos builds.

Ejecutar `npm test` tras cambios y `npm run build` antes de publicar.
`npm run clean` vacia solamente `dist` y `www`; se pueden regenerar.

## Archivos que se conservan

- `.data/` y `.env`: informacion privada local, nunca en Git ni en el cliente.
- `.site-release/`: repositorio separado de publicacion; no es una carpeta temporal descartable.
- `.site-artifacts/`, `dist-electron/`: entregas anteriores; no se borran automaticamente.
- `node_modules/`: dependencias instaladas, excluidas de Git.
- `vendor/`: bibliotecas usadas por la aplicación, mapa de depuración de la distribución activa y licencias. Se retiraron las variantes `leaflet-src.js` y `leaflet-src.esm.js` y sus mapas porque no se cargaban.
- `android/`, `electron/`: plataformas funcionales, no codigo sobrante.
- `.claude/`: configuracion y tareas ajenas a la aplicacion; no mover ni eliminar durante la limpieza.

Los documentos estan centralizados en `docs/`. No introducir copias de esos
documentos en la raiz ni guardar archivos propios dentro de las salidas de build.

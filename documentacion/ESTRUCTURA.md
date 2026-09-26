# Mapa del repositorio

Inventario detallado: [qué es cada archivo](ARCHIVOS.md).

## Interfaz

Las entradas `index.html`, `administracion.html`, `aplicacion.js` y `interfaz.css` permanecen
en la raiz para conservar las URL, el servidor local y los empaquetados nativos.

- `cliente/modelo.js`: calculos de rutas, meteorologia, importacion y almacenamiento local.
- `cliente/vista.js`: mapas y presentacion.
- `cliente/controlador.js`: acciones del planificador y biblioteca.
- `cliente/cuenta.js`: interfaz de cuenta y cliente de las API personales.
- `cliente/sugerencias.js`, `cliente/historial-rutas.js`: sugerencias e historial automático de rutas.
- `cliente/localidades.js`: nombres de rutas a partir de las localidades del recorrido.
- `cliente/rutas-verificadas.js`, `cliente/red-verificada.js`: generación y catálogo de tramos revisados.
- `cliente/verificar-exportacion.js`: comprobación del sentido ciclista antes de exportar.
- `cliente/administracion.js`, `cliente/*-administracion.js`: panel, edición y colecciones del administrador.

## Servidor

- `servidor.mjs`: adaptador HTTP local/Node y archivos publicos.
- `servidor/entrada-sites.mjs`: adaptador de Sites.
- `servidor/cuentas.mjs`, `servidor/autenticacion-administracion.mjs`: cuentas y autorizacion administrativa.
- `servidor/biblioteca.mjs`, `servidor/rutas.mjs`, `servidor/sugerencias.mjs`: API por funcionalidad.
- `servidor/criptografia.mjs`, `servidor/utilidades-http.mjs`: primitivas compartidas, sin dependencias de las API.
- `servidor/seguridad.mjs`: cabeceras y validacion del entorno.
- `servidor/base-local.mjs`: adaptador SQLite local; no se incluye en el Worker.
- `datos/esquema.ts`, `drizzle/`: esquema y migraciones. No borrar ni reescribir migraciones aplicadas.

## Compilacion y pruebas

`herramientas/recursos.mjs` define los recursos publicos y limita la limpieza a salidas
conocidas. `compilar.mjs` genera `dist/client`, `dist/server` y `dist/.openai`;
no duplica los recursos del cliente en la raiz de `dist`. `compilar-movil.mjs`
genera `www`. `pruebas/` cubre interfaz, API, seguridad y estructura de ambos builds.

Ejecutar `npm run probar` tras cambios y `npm run compilar` antes de publicar.
`npm run limpiar` vacia solamente `dist` y `www`; se pueden regenerar.

## Archivos que se conservan

- `.data/` y `.env`: informacion privada local, nunca en Git ni en el cliente.
- `.site-release/`: repositorio separado de publicacion; no es una carpeta temporal descartable.
- `.site-artifacts/`, `dist-electron/`: entregas anteriores; no se borran automaticamente.
- `node_modules/`: dependencias instaladas, excluidas de Git.
- `vendor/`: bibliotecas usadas por la aplicación, mapa de depuración de la distribución activa y licencias. Se retiraron las variantes `leaflet-src.js` y `leaflet-src.esm.js` y sus mapas porque no se cargaban.
- `android/`, `electron/`: plataformas funcionales, no codigo sobrante.
- `.claude/`: configuracion y tareas ajenas a la aplicacion; no mover ni eliminar durante la limpieza.

Los documentos estan centralizados en `documentacion/`. No introducir copias de esos
documentos en la raiz ni guardar archivos propios dentro de las salidas de build.

# Sugerencias y administracion

## Comunidad

Las nuevas sugerencias publicadas aparecen en Novedades > Sugerencias de la comunidad. Los visitantes con acceso al Site pueden leerlas; publicar y votar requiere una cuenta ChatGPT. Se permite un voto por cuenta, reversible. No se muestran identidades.
El historial local y los envios privados anteriores se mantienen privados. No hay avisos por correo ni dependencia de servicios de correo.

## Administrador

La pagina `/admin.html` no aparece en el menu. Ocultar el enlace no constituye la proteccion: todas las lecturas y cambios administrativos requieren una sesion validada en servidor.
El panel permite consultar todas las sugerencias, sus votos y visibilidad, y cambiar su estado entre nueva, revisada y resuelta.
La sesion dura ocho horas, utiliza una cookie HttpOnly y SameSite=Strict (Secure con HTTPS), y se revoca en servidor al cerrar sesion. Cambiar el hash de contraseña invalida todas las sesiones previas.
El acceso esta limitado a diez intentos cada quince minutos por direccion de origen. Sites debe ser el unico punto de entrada al Worker para garantizar la integridad de los encabezados de identidad e IP.

## Configuracion local

`node scripts/setup-admin.mjs` genera una contraseña aleatoria de 192 bits solo si no existe configuracion. Guarda la contraseña para el propietario en `.data/admin-access.txt` y su hash PBKDF2-SHA256 con sal aleatoria en `.data/admin.env`. Ambos archivos estan excluidos de Git y de los archivos servidos.
No se imprime la contraseña en los registros. El script no sobrescribe una contraseña existente.
`node server.mjs` lee el hash y usa SQLite en `.data/feedback.sqlite`. Simula una identidad normal para las funciones comunitarias, pero nunca concede acceso administrativo sin contraseña.

## Publicacion

Antes de publicar en Sites, configurar `ADMIN_PASSWORD_HASH` como valor privado del servidor utilizando el valor de `.data/admin.env`. No incluir la contraseña ni su hash en archivos publicos o en Git.
El build incluye Worker, recursos publicos y migraciones D1. La migracion 0002 elimina el estado de los antiguos avisos por correo y agrega sesiones y limites de acceso. No modifica los textos ni los votos.
Se conserva la audiencia del Site; esta pagina no lo convierte en publico. Si el Site exige iniciar sesion con ChatGPT, ese control sigue siendo necesario ademas de la contraseña administrativa.
La base SQLite local no se copia a produccion. Estos cambios aun no estan publicados.

## Comprobaciones

## Historial de rutas y previsiones

El planificador incluye una autorizacion desactivada inicialmente. Al activarla, las nuevas rutas completadas (dibujadas, generadas o importadas) y las previsiones se envian al servidor con un identificador estable de usuario. No sube el historial antiguo. Desactivarla detiene nuevos guardados; los registros existentes permanecen hasta que el administrador los elimine.
El panel privado permite listar registros, consultar el mapa, salida, velocidad, distancia y meteorologia por tramo, y eliminarlos definitivamente con confirmacion. Los registros no aparecen en la comunidad y requieren sesion de administrador para leerlos o borrarlos.
Se conserva la geometria completa dentro del limite de 50000 puntos y 1,8 MB por peticion. Se limita a 120 guardados por hora y cuenta. Un fallo muestra registros pendientes y un boton de reintento. Los pendientes permanecen solo en la pestaña abierta, no se consideran guardados hasta recibir confirmacion del servidor.
La eliminacion borra el registro y su carga de datos de la base activa; no borra las copias locales del usuario ni controla las copias de seguridad del proveedor.

`node --test tests/admin-auth.test.mjs tests/feedback.test.mjs tests/feedback-ui.test.mjs tests/app.test.mjs`
Las pruebas usan bases aisladas y contraseñas de prueba, nunca la contraseña local real.

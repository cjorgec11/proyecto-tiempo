# Cuentas en la base de datos de RideCast

No se utiliza Supabase. Usuarios, hashes de contrasena, sesiones, enlaces de verificacion y rutas se almacenan en la base existente: SQLite en local y D1 en Sites. No se almacenan contrasenas en texto plano. El navegador recibe una cookie HttpOnly, no un token guardado en localStorage.

## Variables del servidor

```env
ADMIN_EMAIL=jorgecalvocaminero@gmail.com
AUTH_MODE=disabled
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AUTH_MAIL_API_KEY=
AUTH_MAIL_FROM=
```

En local se configuran en `.env`, excluido de Git, y se reinicia el servidor. En Sites se configuran en las variables del sitio antes de publicar. Client Secret y la clave de correo se guardan como secretos. Conserva ADMIN_PASSWORD_HASH para el acceso de emergencia existente a `/admin.html`.

## Google

1. En Google Cloud Console configura la pantalla de consentimiento y crea un cliente OAuth de tipo **aplicacion web**.
2. Anade esta URI de redireccion autorizada exacta: `https://ridecast-jorge.jorgecalvocaminero.chatgpt.site/api/account/google/callback`.
3. Para pruebas locales anade tambien el callback del puerto local elegido, por ejemplo `http://127.0.0.1:5173/api/account/google/callback`.
4. Copia Client ID y Client Secret a las variables indicadas. No los pegues en codigo ni publiques el secreto.
5. En modo pruebas, anade las cuentas de prueba a Google; para acceso general publica la pantalla de consentimiento cuando corresponda.

Se piden unicamente nombre y correo (openid, email, profile). La app intercambia el codigo en el servidor, comprueba la identidad con Google y crea la cuenta en su propia base. Usa estado aleatorio, PKCE y un codigo de un solo uso ligado al navegador. Solo se aceptan cuentas Gmail verificadas.

## Correo y contrasena

La base de datos no puede enviar mensajes por si sola. El registro y la recuperacion requieren un servicio de correo transaccional. El adaptador incluido utiliza la API de Resend; no almacena usuarios alli y no envia avisos de sugerencias.

1. Configura en Resend un dominio remitente verificado.
2. Guarda una clave restringida a envio en AUTH_MAIL_API_KEY y el remitente autorizado en AUTH_MAIL_FROM.
3. Al registrarse, el usuario introduce Gmail, nombre y contrasena. Recibe un enlace de confirmacion de una hora. Al abrirlo, confirma una contrasena para evitar que alguien que hubiera registrado su correo antes conserve acceso.
4. Recuperar contrasena envia otro enlace de un solo uso; cambiarla invalida las sesiones anteriores.

Sin correo configurado, el registro y la recuperacion muestran que no estan disponibles. El login con una cuenta existente funciona. Google funciona de forma independiente cuando tiene sus credenciales.

## Privacidad y administracion

- Invitado: planificador, generacion, importacion, prevision y exportacion; las rutas locales existentes siguen en el dispositivo.
- Usuario: coleccion propia de rutas, sugerencias enviadas y votos. Copiar rutas locales a la cuenta requiere una accion explicita.
- El historial automatico requiere consentimiento y se desactiva al cambiar de cuenta.
- Solo un correo verificado igual a ADMIN_EMAIL obtiene administracion. El nombre, los datos del navegador y los encabezados enviados por el visitante no asignan roles.
- El administrador edita y elimina sugerencias, rutas guardadas e historial/previsiones. No puede ver las contrasenas originales.
- Mantener AUTH_MODE=disabled desactiva el acceso personal heredado de ChatGPT. Las sesiones propias funcionan tanto en Node como en Sites.
- Antes de hacer publico Sites, revisar las sugerencias publicas existentes. La barrera privada de Sites es independiente de la pantalla de cuenta de RideCast.

## Verificacion pendiente antes de publicar

Probar Google con sus credenciales reales; registro, correo recibido, confirmacion, login, recuperacion y logout; aislamiento entre dos usuarios y recuperacion de una ruta desde otro dispositivo. Abrir Sites al publico solo despues de completar esa configuracion. Los tests locales usan cuentas y servicios simulados, no confirman la entrega real de correo ni el consentimiento de Google.

Referencias: https://developers.google.com/identity/protocols/oauth2/web-server y https://resend.com/docs/api-reference/emails/send-email

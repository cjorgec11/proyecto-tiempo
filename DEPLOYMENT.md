# Servidor independiente

El servidor Node mantiene el planificador público y el panel administrativo con
contraseña. Las API personales (historial enviado, sugerencias propias y votos)
se deniegan por defecto: este proyecto no incorpora un proveedor de identidad
para usuarios de un servidor independiente. La lectura de sugerencias marcadas
como públicas sigue disponible. Integrar autenticación real antes de habilitar
funciones personales; una cabecera enviada por el navegador no autentica a nadie.

## Producción

Usar Node compatible con `node:sqlite` y `process.loadEnvFile` (las pruebas usan
Node 24). Ejecutar `node scripts/setup-admin.mjs` una vez para generar la
contraseña local, y configurar el entorno del servicio:

```ini
NODE_ENV=production
PUBLIC_ORIGIN=https://ridecast.example.com
AUTH_MODE=disabled
LOCAL_PREVIEW_AUTH=false
PORT=5173
```

PUBLIC_ORIGIN no admite barra final, ruta ni HTTP. El servidor escucha solo en
127.0.0.1. Un proxy HTTPS debe ser la única entrada y conservar el Host público;
el servidor compara Origin con PUBLIC_ORIGIN e ignora las cabeceras de identidad,
IP y protocolo del cliente. Las cookies administrativas llevan Secure.

Ejemplo del bloque de proxy Nginx dentro de un servidor HTTPS configurado con
certificados para ese dominio:

```nginx
location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_set_header Host ridecast.example.com;
    proxy_set_header OAI-Authenticated-User-Id "";
    proxy_set_header OAI-Authenticated-User-Email "";
    proxy_set_header CF-Connecting-IP "";
    proxy_set_header X-Forwarded-For "";
    proxy_set_header X-Forwarded-Proto "";
    client_max_body_size 2m;
    proxy_read_timeout 30s;
}
```

Redirigir HTTP a HTTPS en el proxy. Aplicar límites de peticiones en el proxy
usando su IP de conexión real. Node usa la IP del socket: detrás de un proxy,
los intentos administrativos comparten el límite conservador de 10/15 minutos.
No aceptar X-Forwarded-For para sortear esa limitación. Ejecutar con un usuario
sin privilegios y restringir `.data` a ese usuario. Las copias de seguridad deben
estar protegidas fuera de la raíz pública.

No servir el repositorio o `dist` como directorio estático. Si se separan los
recursos públicos, usar únicamente una copia limpia de `dist/client`. Las API
deben dirigirse a Node. No publicar `.data`, `.env`, `.git`, archivos de backend,
archivos comprimidos ni este entorno de trabajo.

El sitio público y su código cliente no son secretos. Si toda la web debe ser
privada, añadir control de acceso en el proxy; la contraseña administrativa
protege solo las operaciones administrativas.

## Desarrollo

Sin configuración no existe identidad simulada. Para usarla solo en una
previsualización local: `LOCAL_PREVIEW_AUTH=true`, sin PUBLIC_ORIGIN ni modo
producción. El arranque rechaza la simulación en producción. No exponer ese
modo por túneles o proxies: todos sus visitantes comparten identidad.

## Worker alojado en Sites

Configurar explícitamente `AUTH_MODE=sites` como variable del servidor solo
cuando el dispatcher de Sites sea la única entrada y controle las cabeceras de
identidad e IP. Sin esa variable, las funciones personales quedan bloqueadas.
No usar ese modo al exponer un Worker directamente o con un proxy genérico.
El servidor Node rechaza ese modo para impedir activarlo accidentalmente.

## Validación antes de abrir al público

Ejecutar `node --test tests/*.test.mjs`. En el dominio final comprobar que las
peticiones anónimas y con cabeceras falsas no leen sugerencias privadas, que el
panel exige contraseña, que un origen ajeno no puede modificar datos y que los
archivos privados devuelven 404. Verificar HTTPS y Secure en la cookie real.
No es suficiente que las pruebas de loopback pasen para validar el proxy final.

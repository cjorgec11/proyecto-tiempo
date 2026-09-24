import { createReadStream, existsSync, mkdirSync, statSync, realpathSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { Readable } from "node:stream";
import { abrirBaseDatos } from "./servidor/base-local.mjs";
import { gestionarSugerencias } from "./servidor/sugerencias.mjs";
import { gestionarAutenticacionAdministracion } from "./servidor/autenticacion-administracion.mjs";
import { gestionarRutas } from "./servidor/rutas.mjs";
import { gestionarCuenta } from "./servidor/cuentas.mjs";
import { gestionarBiblioteca } from "./servidor/biblioteca.mjs";
import { configuracionNode, cabecerasSeguridad } from "./servidor/seguridad.mjs";

const root = realpathSync(process.cwd());
process.loadEnvFile && existsSync(resolve(root, ".env")) && process.loadEnvFile(resolve(root, ".env"));
if (existsSync(resolve(root, ".data/admin.env"))) process.loadEnvFile(resolve(root, ".data/admin.env"));
const config = configuracionNode(process.env);
const port = config.port;
mkdirSync(resolve(root, ".data"), { recursive: true });
const DB = abrirBaseDatos(resolve(root, ".data/feedback.sqlite"), resolve(root, "drizzle"));

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

createServer(async (request, response) => {
  for (const [key, value] of Object.entries(cabecerasSeguridad(Boolean(config.origin)))) response.setHeader(key, value);
  let url;
  try {
    if (!request.url?.startsWith("/") || request.url.startsWith("//")) throw new Error();
    const host = new URL(`http://${request.headers.host}`);
    if (host.host !== request.headers.host || (config.origin
      ? host.host !== new URL(config.origin).host
      : !["127.0.0.1", "localhost"].includes(host.hostname))) {
      response.writeHead(403); response.end(); return;
    }
    url = new URL(request.url, config.origin || host.origin);
  }
  catch { response.writeHead(400); response.end(); return; }
  if (/^\/api\/(feedback|admin|routes|account|library)(\/|$)/.test(url.pathname)) {
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (!key.startsWith("oai-authenticated-user-") && !["cf-connecting-ip", "forwarded", "x-forwarded-for", "x-forwarded-proto"].includes(key) && value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
      }
      const webRequest = new Request(url, { method: request.method, headers,
        ...(["GET", "HEAD"].includes(request.method) ? {} : { body: Readable.toWeb(request), duplex: "half" }) });
      const handler = url.pathname.startsWith("/api/account/") ? gestionarCuenta : url.pathname.startsWith("/api/library") ? gestionarBiblioteca : url.pathname.startsWith("/api/routes") ? gestionarRutas : url.pathname.startsWith("/api/admin/") ? gestionarAutenticacionAdministracion : gestionarSugerencias;
      const result = await handler(webRequest, { ...process.env, DB, AUTH_MODE: "disabled",
        PREVIEW_USER_ID: config.preview ? "local-preview-owner" : null,
        CLIENT_IP: request.socket.remoteAddress || "unknown" });
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(503); response.end("Buzón no disponible"); }
    return;
  }
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  let decoded;
  try { decoded = decodeURIComponent(requested); } catch { response.writeHead(400); response.end(); return; }
  // Solo recursos públicos; nunca credenciales, bases de datos ni archivos de Git.
  if (!/^\/(?:index\.html|administracion\.html|interfaz\.css|aplicacion\.js|(?:cliente|vendor)\/[^\\]+)$/.test(decoded) || decoded.split("/").some(part => part.startsWith("."))) {
    response.writeHead(404); response.end("No encontrado"); return;
  }
  const path = resolve(root, `.${decoded}`);
  try {
    // Rechazar también enlaces hacia directorios privados del propio proyecto.
    if ((!path.startsWith(root + "/") && !path.startsWith(root + "\\")) || realpathSync(path) !== path || !statSync(path).isFile()) throw new Error();
  } catch {
    response.writeHead(404);
    response.end("No encontrado");
    return;
  }

  response.writeHead(200, {
    "Content-Type": types[extname(path)] || "application/octet-stream",
  });
  createReadStream(path).on("error", () => response.destroy()).pipe(response);
}).listen(port, "127.0.0.1", function () {
  console.log(`RideCast disponible en http://127.0.0.1:${this.address().port}`);
});

import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { Readable } from "node:stream";
import { openDatabase } from "./server/local-db.mjs";
import { handleFeedback } from "./server/feedback.mjs";
import { handleAdminAuth } from "./server/admin-auth.mjs";
import { handleRoutes } from "./server/routes.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 5173);
process.loadEnvFile && existsSync(resolve(root, ".env")) && process.loadEnvFile(resolve(root, ".env"));
if (existsSync(resolve(root, ".data/admin.env"))) process.loadEnvFile(resolve(root, ".data/admin.env"));
mkdirSync(resolve(root, ".data"), { recursive: true });
const DB = openDatabase(resolve(root, ".data/feedback.sqlite"), resolve(root, "drizzle"));

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

createServer(async (request, response) => {
  let url;
  try { url = new URL(request.url || "/", `http://${request.headers.host}`); }
  catch { response.writeHead(400); response.end(); return; }
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) { response.writeHead(403); response.end(); return; }
  if (url.pathname.startsWith("/api/feedback") || url.pathname.startsWith("/api/admin/") || url.pathname.startsWith("/api/routes")) {
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (!key.startsWith("oai-authenticated-user-") && value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
      }
      // Preview identity exists only on this loopback server, never in the hosted Worker.
      headers.set("oai-authenticated-user-id", "local-preview-owner");
      headers.set("cf-connecting-ip", "127.0.0.1");
      const webRequest = new Request(url, { method: request.method, headers,
        ...(["GET", "HEAD"].includes(request.method) ? {} : { body: Readable.toWeb(request), duplex: "half" }) });
      const handler = url.pathname.startsWith("/api/routes") ? handleRoutes : url.pathname.startsWith("/api/admin/") ? handleAdminAuth : handleFeedback;
      const result = await handler(webRequest, { ...process.env, DB });
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(503); response.end("Buzón no disponible"); }
    return;
  }
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  let decoded;
  try { decoded = decodeURIComponent(requested); } catch { response.writeHead(400); response.end(); return; }
  // Serve only public application assets, never credentials, databases or source-control files.
  if (!/^\/(?:index\.html|admin\.html|workspace\.css|app\.js|(?:js|vendor)\/[^\\]+)$/.test(decoded) || decoded.split("/").some(part => part.startsWith("."))) {
    response.writeHead(404); response.end("Not found"); return;
  }
  const path = resolve(root, `.${decoded}`);

  if (!path.startsWith(root + "/") && !path.startsWith(root + "\\") || !existsSync(path) || !statSync(path).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": types[extname(path)] || "application/octet-stream",
  });
  createReadStream(path).on("error", () => response.destroy()).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`RideCast running at http://127.0.0.1:${port}`);
});

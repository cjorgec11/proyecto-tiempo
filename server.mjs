import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 5173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function notFound(response) {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

function resolveRequest(rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl || "/", "http://localhost").pathname);
  } catch {
    return null;
  }
  if (pathname === "/") pathname = "/index.html";
  // Solo ficheros estaticos del frontend: nada de rutas ocultas (.git, .claude...)
  if (pathname.includes("\0") || pathname.split(/[\\/]/).some((part) => part.startsWith("."))) return null;
  const path = resolve(root, `.${pathname}`);
  if (!path.startsWith(root + sep) || !types[extname(path)]) return null;
  try {
    return statSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

createServer((request, response) => {
  const path = resolveRequest(request.url);
  if (!path) {
    notFound(response);
    return;
  }

  const stream = createReadStream(path);
  stream.on("error", () => {
    if (!response.headersSent) notFound(response);
    else response.destroy();
  });
  stream.once("open", () => {
    response.writeHead(200, {
      "Content-Type": types[extname(path)],
      "X-Content-Type-Options": "nosniff",
    });
    stream.pipe(response);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`RideCast running at http://127.0.0.1:${port}`);
});

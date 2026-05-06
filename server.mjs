import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 5173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const path = resolve(root, `.${decodeURIComponent(requested)}`);

  if (!path.startsWith(root) || !existsSync(path)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": types[extname(path)] || "application/octet-stream",
  });
  createReadStream(path).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`RideCast running at http://127.0.0.1:${port}`);
});

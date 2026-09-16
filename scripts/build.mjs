import { cp, mkdir, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "dist");
const assets = ["index.html", "admin.html", "workspace.css", "app.js", "js", "vendor"];
await mkdir(output, { recursive: true });
for (const asset of assets) await cp(join(root, asset), join(output, asset), { recursive: true });
const manifest = JSON.parse(await readFile(join(root, ".openai/hosting.json"), "utf8"));
if (manifest.d1 !== "DB" || manifest.static) throw new Error("El buzón requiere el Worker y la base de datos DB.");
await mkdir(join(output, "client"), { recursive: true });
for (const asset of assets) await cp(join(root, asset), join(output, "client", asset), { recursive: true });
await mkdir(join(output, "server"), { recursive: true });
await cp(join(root, "server/worker.mjs"), join(output, "server/index.js"));
await cp(join(root, "server/feedback.mjs"), join(output, "server/feedback.mjs"));
await cp(join(root, "server/admin-auth.mjs"), join(output, "server/admin-auth.mjs"));
await cp(join(root, "server/routes.mjs"), join(output, "server/routes.mjs"));
await cp(join(root, "server/security.mjs"), join(output, "server/security.mjs"));
await mkdir(join(output, ".openai"), { recursive: true });
await cp(join(root, ".openai/hosting.json"), join(output, ".openai/hosting.json"));
await cp(join(root, "drizzle"), join(output, ".openai/drizzle"), { recursive: true });
for (const file of ["index.html", "js/controller.js", "js/model.js", "js/view.js", "vendor/lucide.js", "vendor/leaflet/leaflet.js"]) {
  if (!(await stat(join(output, file))).isFile()) throw new Error(`Falta ${file}`);
}
console.log("RideCast: versión web preparada en dist.");

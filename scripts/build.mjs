import { cp, mkdir, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "dist");
const assets = ["index.html", "workspace.css", "app.js", "js", "vendor"];
await mkdir(output, { recursive: true });
for (const asset of assets) await cp(join(root, asset), join(output, asset), { recursive: true });
const manifest = JSON.parse(await readFile(join(root, ".openai/hosting.json"), "utf8"));
if (manifest.static?.directory !== "dist") throw new Error("La salida estática debe ser dist.");
for (const file of ["index.html", "js/controller.js", "js/model.js", "js/view.js", "vendor/lucide.js", "vendor/leaflet/leaflet.js"]) {
  if (!(await stat(join(output, file))).isFile()) throw new Error(`Falta ${file}`);
}
console.log("RideCast: versión web preparada en dist.");

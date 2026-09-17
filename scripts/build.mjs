import { cp, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { root, copyPublicAssets, resetBuildDirectory } from "./assets.mjs";

const manifest = JSON.parse(await readFile(join(root, ".openai/hosting.json"), "utf8"));
if (manifest.d1 !== "DB" || manifest.static) throw new Error("El buzón requiere el Worker y la base de datos DB.");
const output = await resetBuildDirectory("dist");
await copyPublicAssets(join(output, "client"));
await mkdir(join(output, "server"), { recursive: true });
await cp(join(root, "server/worker.mjs"), join(output, "server/index.js"));
for (const name of ["feedback", "admin-auth", "routes", "security", "accounts", "library", "crypto", "http"]) {
  await cp(join(root, `server/${name}.mjs`), join(output, `server/${name}.mjs`));
}
await mkdir(join(output, ".openai"), { recursive: true });
await cp(join(root, ".openai/hosting.json"), join(output, ".openai/hosting.json"));
await cp(join(root, "drizzle"), join(output, ".openai/drizzle"), { recursive: true });
for (const file of ["index.html", "js/controller.js", "js/model.js", "js/view.js", "vendor/lucide.js", "vendor/leaflet/leaflet.js"]) {
  if (!(await stat(join(output, "client", file))).isFile()) throw new Error(`Falta ${file}`);
}
console.log("RideCast: versión web preparada en dist.");

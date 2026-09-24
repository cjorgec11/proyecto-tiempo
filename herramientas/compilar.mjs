import { cp, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { root, copiarRecursosPublicos, vaciarDirectorioCompilacion } from "./recursos.mjs";

const manifest = JSON.parse(await readFile(join(root, ".openai/hosting.json"), "utf8"));
if (manifest.d1 !== "DB" || manifest.static) throw new Error("El buzón requiere el Worker y la base de datos DB.");
const output = await vaciarDirectorioCompilacion("dist");
await copiarRecursosPublicos(join(output, "client"));
await mkdir(join(output, "server"), { recursive: true });
await cp(join(root, "servidor/entrada-sites.mjs"), join(output, "server/index.js"));
for (const name of ["sugerencias", "autenticacion-administracion", "rutas", "seguridad", "cuentas", "biblioteca", "criptografia", "utilidades-http"]) {
  await cp(join(root, `servidor/${name}.mjs`), join(output, `server/${name}.mjs`));
}
await mkdir(join(output, ".openai"), { recursive: true });
await cp(join(root, ".openai/hosting.json"), join(output, ".openai/hosting.json"));
await cp(join(root, "drizzle"), join(output, ".openai/drizzle"), { recursive: true });
for (const file of ["index.html", "cliente/controlador.js", "cliente/modelo.js", "cliente/vista.js", "vendor/lucide.js", "vendor/leaflet/leaflet.js"]) {
  if (!(await stat(join(output, "client", file))).isFile()) throw new Error(`Falta ${file}`);
}
console.log("RideCast: versión web preparada en dist.");

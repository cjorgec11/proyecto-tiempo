import { cp, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
const release = join(root, ".site-release");
await mkdir(join(release, "herramientas"), { recursive: true });
await mkdir(join(release, ".openai"), { recursive: true });
// Solo el código de la aplicación; nunca configuraciones personales ni salidas nativas.
for (const asset of ["index.html", "administracion.html", "interfaz.css", "aplicacion.js", "cliente", "vendor", "pruebas", "electron", "servidor.mjs", "servidor", "datos", "drizzle", "drizzle.config.ts", "README.md", "documentacion", ".env.example", "package.json", "package-lock.json", ".gitignore"]) {
  await cp(join(root, asset), join(release, asset), { recursive: true });
}
await cp(join(root, ".openai/hosting.json"), join(release, ".openai/hosting.json"));
await cp(join(root, "herramientas/compilar.mjs"), join(release, "herramientas/compilar.mjs"));
await cp(join(root, "herramientas/recursos.mjs"), join(release, "herramientas/recursos.mjs"));
await cp(join(root, "herramientas/limpiar.mjs"), join(release, "herramientas/limpiar.mjs"));
await cp(join(root, "herramientas/compilar-movil.mjs"), join(release, "herramientas/compilar-movil.mjs"));
await cp(join(root, "herramientas/configurar-administracion.mjs"), join(release, "herramientas/configurar-administracion.mjs"));
console.log("Fuente web preparada para Sitios.");

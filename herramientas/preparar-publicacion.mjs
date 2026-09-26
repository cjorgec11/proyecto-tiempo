import { cp, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { recursosPublicos } from "./recursos.mjs";

const root = resolve(import.meta.dirname, "..");
const release = join(root, ".site-release");
await mkdir(join(release, "herramientas"), { recursive: true });
await mkdir(join(release, ".openai"), { recursive: true });
// Solo el código de la aplicación; nunca configuraciones personales ni salidas nativas.
for (const asset of [...recursosPublicos, "pruebas", "electron", "servidor.mjs", "servidor", "datos", "drizzle", "drizzle.config.ts", "README.md", "documentacion", ".env.example", "package.json", "package-lock.json", ".gitignore"]) {
  await cp(join(root, asset), join(release, asset), { recursive: true });
}
await cp(join(root, ".openai/hosting.json"), join(release, ".openai/hosting.json"));
for (const name of ["compilar", "recursos", "limpiar", "compilar-movil", "configurar-administracion"]) {
  const file = `herramientas/${name}.mjs`;
  await cp(join(root, file), join(release, file));
}
console.log("Fuente web preparada para Sitios.");

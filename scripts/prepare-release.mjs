import { cp, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
const release = join(root, ".site-release");
await mkdir(join(release, "scripts"), { recursive: true });
await mkdir(join(release, ".openai"), { recursive: true });
// Solo el código de la aplicación; nunca configuraciones personales ni salidas nativas.
for (const asset of ["index.html", "admin.html", "workspace.css", "app.js", "js", "vendor", "tests", "electron", "server.mjs", "server", "db", "drizzle", "drizzle.config.ts", "README.md", "docs", ".env.example", "package.json", "package-lock.json", ".gitignore"]) {
  await cp(join(root, asset), join(release, asset), { recursive: true });
}
await cp(join(root, ".openai/hosting.json"), join(release, ".openai/hosting.json"));
await cp(join(root, "scripts/build.mjs"), join(release, "scripts/build.mjs"));
await cp(join(root, "scripts/assets.mjs"), join(release, "scripts/assets.mjs"));
await cp(join(root, "scripts/clean.mjs"), join(release, "scripts/clean.mjs"));
await cp(join(root, "scripts/build-mobile.mjs"), join(release, "scripts/build-mobile.mjs"));
await cp(join(root, "scripts/setup-admin.mjs"), join(release, "scripts/setup-admin.mjs"));
console.log("Fuente web preparada para Sitios.");

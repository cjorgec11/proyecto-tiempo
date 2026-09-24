import { cp, lstat, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";

export const root = resolve(import.meta.dirname, "..");
export const recursosPublicos = ["index.html", "administracion.html", "interfaz.css", "aplicacion.js", "cliente", "vendor"];

export async function copiarRecursosPublicos(destination) {
  await mkdir(destination, { recursive: true });
  for (const asset of recursosPublicos) await cp(join(root, asset), join(destination, asset), { recursive: true });
}

// Solo se vacían las salidas regenerables; nunca las fuentes ni el repositorio de publicación.
export async function vaciarDirectorioCompilacion(name) {
  if (!["dist", "www"].includes(name)) throw new Error("Directorio de compilación no permitido");
  const target = resolve(root, name);
  if (target !== join(root, name)) throw new Error("El directorio de compilación está fuera del proyecto");
  const entry = await lstat(target).catch(error => { if (error.code !== "ENOENT") throw error; });
  if (entry?.isSymbolicLink()) throw new Error("No se permite limpiar un directorio de compilación enlazado");
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  return target;
}

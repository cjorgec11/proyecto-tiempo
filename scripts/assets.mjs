import { cp, lstat, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";

export const root = resolve(import.meta.dirname, "..");
export const publicAssets = ["index.html", "admin.html", "workspace.css", "app.js", "js", "vendor"];

export async function copyPublicAssets(destination) {
  await mkdir(destination, { recursive: true });
  for (const asset of publicAssets) await cp(join(root, asset), join(destination, asset), { recursive: true });
}

// Only disposable build directories are eligible; never source or release Git state.
export async function resetBuildDirectory(name) {
  if (!["dist", "www"].includes(name)) throw new Error("Unexpected build directory");
  const target = resolve(root, name);
  if (target !== join(root, name)) throw new Error("Build directory escaped project");
  const entry = await lstat(target).catch(error => { if (error.code !== "ENOENT") throw error; });
  if (entry?.isSymbolicLink()) throw new Error("Refusing to clean a linked build directory");
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  return target;
}

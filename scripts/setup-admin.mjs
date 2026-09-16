import { mkdir, writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { passwordHash } from "../server/admin-auth.mjs";
const directory = new URL("../.data/", import.meta.url);
await mkdir(directory, { recursive: true });
const config = new URL("admin.env", directory);
try { await access(config); console.log("El acceso local ya está configurado; no se ha modificado."); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  const password = randomBytes(24).toString("base64url");
  await writeFile(config, `ADMIN_PASSWORD_HASH='${await passwordHash(password)}'\n`, { flag: "wx", mode: 0o600 });
  await writeFile(new URL("admin-access.txt", directory), `RideCast - acceso local de administrador\nhttp://127.0.0.1:5174/admin.html\n\nContrasena: ${password}\n\nEste archivo es privado y no se publica con la web.\n`, { flag: "wx", mode: 0o600 });
  console.log("Acceso generado. Contraseña en .data/admin-access.txt; no se muestra en los registros.");
}

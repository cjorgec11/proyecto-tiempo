import { resetBuildDirectory } from "./assets.mjs";

for (const directory of ["dist", "www"]) await resetBuildDirectory(directory);
console.log("Salidas web y móvil vaciadas. Código, datos y publicaciones conservados.");

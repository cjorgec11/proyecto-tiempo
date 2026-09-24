import { vaciarDirectorioCompilacion } from "./recursos.mjs";

for (const directory of ["dist", "www"]) await vaciarDirectorioCompilacion(directory);
console.log("Salidas web y móvil vaciadas. Código, datos y publicaciones conservados.");

import { copiarRecursosPublicos, vaciarDirectorioCompilacion } from "./recursos.mjs";

await copiarRecursosPublicos(await vaciarDirectorioCompilacion("www"));
console.log("RideCast: recursos de Capacitor preparados en www.");

import { copyPublicAssets, resetBuildDirectory } from "./assets.mjs";

await copyPublicAssets(await resetBuildDirectory("www"));
console.log("RideCast: recursos de Capacitor preparados en www.");

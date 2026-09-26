// Prueba manual: envía la salida compartida para esta prueba a los proveedores de rutas.
// No forma parte de npm test: el resultado depende de sus datos y disponibilidad.
import assert from "node:assert/strict";
import { generarRutaCircular, haversine } from "../cliente/modelo.js";

const origin = {lat:42.22603,lon:-2.10086};
const memory = new Map();
globalThis.localStorage = {getItem:key=>memory.get(key) ?? null,setItem:(key,value)=>memory.set(key,String(value))};

const route = await generarRutaCircular(origin,30,90,{
  surface:"asphalt",signal:AbortSignal.timeout(45000),
  onProgress:(step,total,shape)=>console.log(`Comprobando ${shape || "circuito"}: ${step}/${total}`),
});
assert.ok(haversine(origin,route.coords[0]) < 0.3, "La ruta debe partir de la salida indicada");
assert.ok(route.coords.length > 2, "El trazado debe tener geometría real");
assert.ok(route.distance >= 24 && route.distance <= 36, "La distancia debe aproximarse a 30 km");
if (route.generation.shape === "circular") {
  assert.ok(haversine(route.coords[0],route.coords.at(-1)) < 0.05, "El circuito debe cerrarse");
  assert.ok(route.generation.repeated <= 0.2, "El circuito no debe repetir demasiada carretera");
} else assert.ok(haversine(route.coords[0],route.coords.at(-1)) > 5, "La ruta lineal debe avanzar");
if (!route.generation.pavedRoadVerified) {
  assert.equal(route.generation.needsReview,true,"El firme desconocido debe figurar pendiente de revisar");
  assert.ok(route.generation.surfaces.unknown > 0,"El firme desconocido no debe presentarse como asfalto");
}
console.log(JSON.stringify({km:route.distance,forma:route.generation.shape,
  firmePorRevisar:route.generation.needsReview,pavimentoConfirmado:route.generation.pavedRoadVerified}));

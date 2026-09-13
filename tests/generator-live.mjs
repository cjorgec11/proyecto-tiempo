import assert from "node:assert/strict";
import { generateRoundTrip, haversine, buildGpx, matchesSurface } from "../js/model.js";

// Prueba manual del servicio real con una salida pública en Madrid, no la ubicación del usuario.
const city = { lat: 40.4168, lon: -3.7038 };
const park = { lat: 40.419, lon: -3.752 };
for (const [start, target, surface, heading] of [[park, 10, 'dirt', 270]]) {
  const route = await generateRoundTrip(start, target, heading, {
    surface,
    onProgress: attempt => console.log(`${target} km: intento ${attempt}`),
  });
  assert.ok(Math.abs(route.distance - target) / target <= 0.05);
  assert.ok(route.generation.repeated <= 0.2);
  assert.ok(matchesSurface(route.generation.surfaces, surface, route.generation.pavedRoadVerified));
  assert.ok(haversine(route.coords[0], route.coords.at(-1)) < 0.05);
  assert.ok(haversine(start, route.coords[0]) <= 0.25);
  assert.ok(route.coords.length > 20);
  assert.equal((buildGpx("Prueba circular", route.coords).match(/<trkpt /g) || []).length, route.coords.length);
  console.log(JSON.stringify({ targetKm: target, actualKm: route.distance, points: route.coords.length, closed: true, ...route.generation }));
  await new Promise(resolve => setTimeout(resolve, 1100));
}
await assert.rejects(generateRoundTrip(city, 10, 90, {surface:'dirt'}), /60 %/);
console.log('El circuito urbano no se presenta como ruta de tierra.');
await assert.rejects(generateRoundTrip(city, 10, 90, {surface:'asphalt'}), /100 %/);
console.log('No se etiqueta como 100 % carretera un circuito urbano con senderos o datos incompletos.');

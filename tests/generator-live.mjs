import assert from "node:assert/strict";
import { generateRoundTrip, haversine, buildGpx } from "../js/model.js";

// Prueba manual del servicio real con una salida pública en Madrid, no la ubicación del usuario.
const start = { lat: 40.4168, lon: -3.7038 };
for (const [target, surface] of [[10, 'asphalt'], [30, 'asphalt'], [10, 'dirt'], [30, 'dirt']]) {
  const route = await generateRoundTrip(start, target, 90, {
    surface,
    onProgress: attempt => console.log(`${target} km: intento ${attempt}`),
  });
  assert.ok(Math.abs(route.distance - target) / target <= 0.05);
  assert.ok(route.generation.repeated <= 0.2);
  assert.ok(haversine(route.coords[0], route.coords.at(-1)) < 0.05);
  assert.ok(haversine(start, route.coords[0]) <= 0.25);
  assert.ok(route.coords.length > 20);
  assert.equal((buildGpx("Prueba circular", route.coords).match(/<trkpt /g) || []).length, route.coords.length);
  console.log(JSON.stringify({ targetKm: target, actualKm: route.distance, points: route.coords.length, closed: true, ...route.generation }));
  await new Promise(resolve => setTimeout(resolve, 1100));
}

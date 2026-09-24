import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { generarRutaCircular, haversine, crearGpx, cumpleSuperficie,
  desgloseSuperficies, esCarreteraAsfaltadaCompleta, proporcionRutaRepetida } from "../cliente/modelo.js";

// Prueba manual con BRouter real: no forma parte de la suite sin conexión.
const start = { lat: 42.22815991, lon: -2.09983984 };
const source = "https://www.aemet.es/es/eltiempo/prediccion/municipios/arnedo-id26018";
const selectedSurface = process.argv[2];
if (selectedSurface && !["asphalt", "dirt"].includes(selectedSurface)) throw new Error("Usa asphalt o dirt.");
const output = resolve(".data", "pruebas-arnedo", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(output, { recursive: true });
const report = { date: new Date().toISOString(), start, source, cases: [] };
const originalFetch = globalThis.fetch;
let active;
let servicePaused = false;
let controller;
globalThis.fetch = async (url, options) => {
  const began = Date.now();
  const attempt = {};
  active.attempts.push(attempt);
  try {
    const response = await originalFetch(url, options);
    attempt.status = response.status;
    if (response.ok) {
      const data = await response.clone().json();
      const feature = data.features?.find(item => item.geometry?.type === "LineString");
      if (feature) {
        const meters = Number(feature.properties["track-length"]);
        const coords = feature.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
        const surfaces = desgloseSuperficies(feature.properties.messages, meters);
        const pavedRoadVerified = esCarreteraAsfaltadaCompleta(feature.properties.messages, meters);
        Object.assign(attempt, { distanceKm: meters / 1000, surfaces, pavedRoadVerified,
          suitable: cumpleSuperficie(surfaces, active.surface, pavedRoadVerified),
          error: Math.abs(meters / 1000 - active.targetKm) / active.targetKm,
          repeated: proporcionRutaRepetida(coords),
          closureMeters: haversine(coords[0], coords.at(-1)) * 1000,
          startOffsetMeters: haversine(start, coords[0]) * 1000 });
        await writeFile(join(output, `${active.id}-intento-${active.attempts.length}.json`), JSON.stringify(data));
      }
    } else {
      attempt.error = (await response.clone().text()).slice(0, 500);
      if ([403, 429].includes(response.status)) {
        servicePaused = true;
        controller.abort(new Error("El servicio pide reintentar más tarde; se detienen las consultas."));
      }
    }
    return response;
  } catch (error) { attempt.error = `${error.message}: ${error.cause?.code || ""}`; throw error; }
  finally { attempt.seconds = (Date.now() - began) / 1000; }
};

console.log(`Resultados: ${output}`);
try {
  cases: for (const surface of selectedSurface ? [selectedSurface] : ["asphalt", "dirt"]) {
    for (const [targetKm, heading] of [[20, 0], [30, 180], [50, 270]]) {
      active = { id: `${surface}-${targetKm}km-${heading}`, surface, targetKm, heading, attempts: [] };
      report.cases.push(active);
      const began = Date.now();
      controller = new AbortController();
      try {
        const route = await generarRutaCircular(start, targetKm, heading, {
          surface, allowUncertain: true, signal: controller.signal,
          onProgress: (attempt, total) => console.log(`${active.id}: intento ${attempt}/${total}`),
        });
        assert.ok(Math.abs(route.distance - targetKm) / targetKm <= 0.05);
        assert.ok(route.generation.repeated <= 0.2);
        if (!route.generation.needsReview) assert.ok(cumpleSuperficie(route.generation.surfaces, surface, route.generation.pavedRoadVerified));
        else {
          const surfaces = route.generation.surfaces;
          assert.ok(!surfaces || surfaces.unknown > 0);
          assert.ok(!surfaces || (surface === "asphalt" ? surfaces.unpaved === 0 : surfaces.paved <= 0.25));
        }
        assert.ok(haversine(route.coords[0], route.coords.at(-1)) < 0.05);
        assert.ok(haversine(start, route.coords[0]) <= 0.25);
        const gpx = crearGpx(`${route.generation.needsReview ? "Candidato sin firme confirmado " : ""}Arnedo ${surface} ${targetKm} km`, route.coords);
        assert.equal((gpx.match(/<trkpt /g) || []).length, route.coords.length);
        active.result = "accepted";
        active.route = { distanceKm: route.distance, points: route.coords.length, ...route.generation };
        active.gpx = `${active.id}.gpx`;
        await writeFile(join(output, active.gpx), gpx);
      } catch (error) {
        active.result = error.code === "ERR_ASSERTION" ? "validation-failed"
          : servicePaused || !active.attempts.some(attempt => attempt.distanceKm) ? "service-unavailable" : "rejected";
        active.error = error.message;
      }
      active.seconds = (Date.now() - began) / 1000;
      await writeFile(join(output, "resultados.json"), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ id: active.id, result: active.result, route: active.route, error: active.error, seconds: active.seconds }));
      if (servicePaused) break cases;
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
} finally { globalThis.fetch = originalFetch; }
console.log(`Completadas ${report.cases.length} pruebas; aceptadas: ${report.cases.filter(item => item.result === "accepted").length}.`);
if (report.cases.some(item => item.result === "validation-failed")) process.exitCode = 1;

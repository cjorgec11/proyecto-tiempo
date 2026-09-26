// Modelo: estado de la aplicación, llamadas a APIs externas (rutas y tiempo)
// y funciones de cálculo geográfico. Sin dependencias del DOM.
import { rutasCuenta } from "./cuenta.js";

export const state = {
  currentSegments: [],
  currentMode: "wind",
  currentRouteCoords: [],
  currentStartName: "Salida",
  currentEndName: "Llegada",
  currentRideBearing: 0,
  importedRoute: null,
  currentDistance: 0,
  currentDuration: 0,
  waypoints: [],
};

export const etiquetasTiempo = {
  0: ["Despejado", "Sol"],
  1: ["Claro", "Sol"],
  2: ["Nubes", "Nub"],
  3: ["Cubierto", "Nub"],
  45: ["Niebla", "Nie"],
  48: ["Niebla", "Nie"],
  51: ["Llovizna", "Llv"],
  53: ["Llovizna", "Llv"],
  55: ["Llovizna", "Llv"],
  61: ["Lluvia", "Llu"],
  63: ["Lluvia", "Llu"],
  65: ["Lluvia", "Llu"],
  71: ["Nieve", "Niv"],
  73: ["Nieve", "Niv"],
  75: ["Nieve", "Niv"],
  80: ["Chubascos", "Chu"],
  81: ["Chubascos", "Chu"],
  82: ["Chubascos", "Chu"],
  95: ["Tormenta", "Tor"],
};

const STORAGE_KEY = "ridecast.savedRoutes";

export const categoriasSugerencias = {routes:"Rutas",weather:"Previsión",interface:"Interfaz",other:"Otra idea"};
export function leerSugerencias() {
  const entries = JSON.parse(localStorage.getItem("ridecast.suggestions") || "[]");
  if (!Array.isArray(entries) || entries.some(item => !item || typeof item.text !== "string" || typeof item.id !== "string" || !Object.hasOwn(categoriasSugerencias,item.category))) {
    throw new Error("No se pueden leer las sugerencias guardadas. Los datos se han conservado.");
  }
  return entries;
}
export function guardarSugerencia(text, category) {
  text = text.trim();
  if (!text || text.length > 2000 || !Object.hasOwn(categoriasSugerencias,category)) throw new Error("Escribe una sugerencia de entre 1 y 2000 caracteres.");
  const entries = leerSugerencias();
  const entry = {id:crypto.randomUUID(),text,category,createdAt:new Date().toISOString()};
  try { localStorage.setItem("ridecast.suggestions", JSON.stringify([entry,...entries])); }
  catch { throw new Error("No se pudo guardar. Comprueba el espacio o los permisos del navegador."); }
  return [entry,...entries];
}

export function fijarSalidaPredeterminada(input) {
  const date = new Date();
  date.setHours(date.getHours() + 2, 0, 0, 0);
  input.value = fechaParaEntradaLocal(date);
}

function fechaParaEntradaLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function haversine(a, b) {
  const r = 6371;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function bearing(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const toDeg = (v) => (v * 180) / Math.PI;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const lonDelta = toRad(b.lon - a.lon);
  const y = Math.sin(lonDelta) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lonDelta);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const BIKE_SERVICE = "https://routing.openstreetmap.de/routed-bike";
const BROUTER_SERVICE = "https://brouter.de/brouter";
const BROUTER_PAUSE_KEY = "ridecast.brouterRetryAfter";

function referenciaRegional(texto) {
  // Las referencias nacionales y de autovía no identifican una regional/comarcal.
  const references = String(texto || "").toUpperCase().match(/\b([A-Z]{1,3})[-\s](\d{2,4})\b/g) || [];
  return references.some(reference => {
    const [, prefix, number] = reference.match(/^([A-Z]{1,3})[-\s](\d{2,4})$/) || [];
    return prefix && !["N", "E", "AP"].includes(prefix) && (prefix !== "A" || number.length >= 3);
  });
}

function pausarBRouter(response) {
  const retry = response.headers?.get?.("Retry-After");
  const seconds = /^\d+$/.test(retry || "") ? Number(retry) : (Date.parse(retry || "") - Date.now()) / 1000;
  const pause = Number.isFinite(seconds) ? Math.min(600, Math.max(90, seconds)) : 120;
  try { localStorage.setItem(BROUTER_PAUSE_KEY, String(Date.now() + pause * 1000)); } catch {}
}

async function obtenerJson(url, signal) {
  const brouter = url.startsWith(BROUTER_SERVICE);
  if (brouter) {
    try {
      if (Number(localStorage.getItem(BROUTER_PAUSE_KEY)) > Date.now()) {
        const error = new Error("El servicio de rutas pide esperar antes de volver a intentarlo. Tu ruta anterior se conserva.");
        error.status = 429;
        throw error;
      }
    } catch (error) { if (error.status === 429) throw error; }
  }
  const timeout = AbortSignal.timeout(brouter ? 10000 : 12000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) {
    if (brouter && [403,429].includes(response.status)) pausarBRouter(response);
    const error = new Error([403, 429].includes(response.status)
      ? "El servicio de rutas pide esperar antes de volver a intentarlo. Tu ruta anterior se conserva."
      : "El servicio no está disponible. Inténtalo de nuevo.");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function ajustarACarretera(lat, lon) {
  try {
    const data = await obtenerJson(`${BIKE_SERVICE}/nearest/v1/cycling/${lon},${lat}?number=1`);
    const location = data.waypoints?.[0]?.location;
    if (!location) return null;
    const [snLon, snLat] = location;
    const snapped = { lat: snLat, lon: snLon };
    return coordenadaValida(snapped) && haversine({ lat, lon }, snapped) < 2 ? snapped : null;
  } catch {
    return null;
  }
}

export async function trazarRutaPorPuntos(points, { signal, radiuses, bearings } = {}) {
  if (points.length < 2) throw new Error("Marca al menos dos puntos en el mapa.");
  if (points.length > 25) throw new Error("El máximo es de 25 puntos por recorrido.");
  if (!points.every(coordenadaValida)) throw new Error("Las coordenadas de la ruta no son válidas.");
  try {
    const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
    const params = new URLSearchParams({ alternatives: "false", steps: "false", overview: "full", geometries: "geojson" });
    if (radiuses) params.set("radiuses", radiuses.join(";"));
    if (bearings) params.set("bearings", bearings.map(([angle, range]) => `${Math.round(angle)},${range}`).join(";"));
    const data = await obtenerJson(`${BIKE_SERVICE}/route/v1/cycling/${coords}?${params}`, signal);
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route?.geometry?.coordinates?.length || !(route.distance > 0)) {
      throw new Error("Sin recorrido");
    }
    const geometry = route.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
    if (!geometry.every(coordenadaValida)) throw new Error("Coordenadas no válidas");
    return { coords: geometry, distance: route.distance / 1000, routed: true };
  } catch {
    signal?.throwIfAborted();
    throw new Error("No se pudo trazar una ruta ciclista. Prueba con puntos más cercanos o importa un GPX.");
  }
}

// Alternativa con otro proveedor cuando BRouter limita las consultas.
// OSRM no informa del firme: nunca se presenta como pavimento confirmado.
async function rutaRegionalCiclista(start, targetKm, heading, { signal, waypoints, enforceHeading }) {
  const radius = targetKm / 6;
  const circuit = [start, ...waypoints, destination(start, radius, heading - 45),
    destination(start, radius * 1.7, heading), destination(start, radius, heading + 45), start];
  const linear = [start, ...waypoints, destination(start, targetKm * 0.85, heading)];
  const params = new URLSearchParams({ alternatives: "false", steps: "true", overview: "full", geometries: "geojson" });
  for (const [shape, points] of [["circular", circuit], ["linear", linear]]) {
    if (points.length > 25) continue;
    const path = points.map(p => `${p.lon},${p.lat}`).join(";");
    try {
      const data = await obtenerJson(`${BIKE_SERVICE}/route/v1/cycling/${path}?${params}`, signal);
      const route = data.code === "Ok" && data.routes?.[0];
      const coords = route?.geometry?.coordinates?.map(([lon, lat]) => ({ lat, lon }));
      const distance = route?.distance / 1000;
      const steps = route?.legs?.flatMap(leg => leg.steps || []) || [];
      const regionalKm = steps.reduce((sum, step) => sum + (referenciaRegional(`${step.ref || ""} ${step.name || ""}`) ? Number(step.distance) || 0 : 0), 0) / 1000;
      if (!coords || coords.length < 2 || !coords.every(coordenadaValida) || !Number.isFinite(distance)
        || Math.abs(distance - targetKm) / targetKm > (shape === "circular" ? 0.15 : 0.25)
        || regionalKm < distance * 0.5 || !pasaPorPuntos(coords, [start, ...waypoints])
        || (enforceHeading && (!inicioCompatible(coords, heading)
          || (shape === "linear" && !rumboCompatible(start, coords.at(-1), heading))))
        || (shape === "circular" ? haversine(coords[0], coords.at(-1)) >= 0.05 || proporcionRutaRepetida(coords) > 0.2
          : haversine(coords[0], coords.at(-1)) < targetKm * 0.3)) continue;
      return { coords, distance, routed: true, generation: { surface: "asphalt", shape, comarcal: true,
        needsReview: true, pavedRoadVerified: false, surfaces: { paved: 0, unpaved: 0, unknown: 1 },
        targetKm, error: Math.abs(distance - targetKm) / targetKm, repeated: proporcionRutaRepetida(coords) } };
    } catch { signal?.throwIfAborted(); return null; }
  }
  return null;
}

function destination(origin, km, heading) {
  const rad = Math.PI / 180;
  const lat = origin.lat * rad, lon = origin.lon * rad, angle = heading * rad, distance = km / 6371;
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(angle));
  const nextLon = lon + Math.atan2(Math.sin(angle) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat));
  return { lat: nextLat / rad, lon: ((nextLon / rad + 540) % 360) - 180 };
}

export function desgloseSuperficies(messages, routeMeters = 0) {
  const totals = { paved: 0, unpaved: 0, unknown: 0 };
  let inferredUnpaved = 0;
  let unknownOffroad = 0;
  if (!Array.isArray(messages) || !Array.isArray(messages[0])) return null;
  const distanceIndex = messages[0].indexOf("Distance"), tagsIndex = messages[0].indexOf("WayTags");
  if (distanceIndex < 0 || tagsIndex < 0) return null;
  for (const row of messages.slice(1)) {
    if (!Array.isArray(row)) continue;
    const distance = Number(row[distanceIndex]);
    if (!Number.isFinite(distance) || distance <= 0) continue;
    const tags = Object.fromEntries(String(row[tagsIndex] || "").split(/\s+/).filter(tag => tag.includes("=")).map(tag => tag.split("=")));
    const surface = tags.surface;
    const paved = ["asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes", "paving_stones", "sett", "cobblestone"].includes(surface);
    const unpaved = ["unpaved", "ground", "dirt", "earth", "gravel", "fine_gravel", "compacted", "grass", "sand", "mud", "clay", "pebblestone"].includes(surface);
    // tracktype permite estimar tierra/grava; nunca deduce asfalto de highway.
    const inferred = !surface && tags.highway === "track" && /^grade[2-5]$/.test(tags.tracktype || "");
    if (inferred) inferredUnpaved += distance;
    if (!paved && !unpaved && !inferred && ["track", "path"].includes(tags.highway)) unknownOffroad += distance;
    totals[paved ? "paved" : unpaved || inferred ? "unpaved" : "unknown"] += distance;
  }
  const described = totals.paved + totals.unpaved + totals.unknown;
  if (Number.isFinite(routeMeters) && routeMeters > described) totals.unknown += routeMeters - described;
  const total = totals.paved + totals.unpaved + totals.unknown;
  return total ? { ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / total])),
    ...(inferredUnpaved ? { inferredUnpaved: inferredUnpaved / total } : {}),
    ...(unknownOffroad ? { unknownOffroad: unknownOffroad / total } : {}) } : null;
}

export function esCarreteraAsfaltadaCompleta(messages, routeMeters) {
  if (!Array.isArray(messages) || !Array.isArray(messages[0]) || !(routeMeters > 0)) return false;
  const distanceIndex = messages[0].indexOf("Distance"), tagsIndex = messages[0].indexOf("WayTags");
  if (distanceIndex < 0 || tagsIndex < 0) return false;
  const roads = new Set(["primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified", "residential", "living_street", "service"]);
  const pavement = new Set(["asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes"]);
  let covered = 0;
  for (const row of messages.slice(1)) {
    if (!Array.isArray(row)) return false;
    const distance = Number(row[distanceIndex]);
    if (!Number.isFinite(distance) || distance < 0) return false;
    if (distance === 0) continue;
    const tags = Object.fromEntries(String(row[tagsIndex] || "").split(/\s+/).filter(tag => tag.includes("=")).map(tag => tag.split("=")));
    if (!roads.has(tags.highway) || !pavement.has(tags.surface)) return false;
    covered += distance;
  }
  // Sin cobertura completa no se puede afirmar que todo el circuito sea carretera.
  return covered >= routeMeters;
}

export function esRutaComarcalCompatible(messages, routeMeters) {
  if (!Array.isArray(messages?.[0]) || !(routeMeters > 0)) return false;
  const distanceIndex = messages[0].indexOf("Distance"), tagsIndex = messages[0].indexOf("WayTags");
  if (distanceIndex < 0 || tagsIndex < 0) return false;
  const roads = new Set(["primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified", "residential", "living_street", "service"]);
  const comarcal = new Set(["secondary", "secondary_link", "tertiary", "tertiary_link"]);
  const pavement = new Set(["asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes"]);
  let covered = 0, onComarcal = 0;
  for (const row of messages.slice(1)) {
    const length = Number(row?.[distanceIndex]);
    if (!Array.isArray(row) || !Number.isFinite(length) || length < 0) return false;
    if (!length) continue;
    const tags = Object.fromEntries(String(row[tagsIndex] || "").split(/\s+/).filter(tag => tag.includes("=")).map(tag => tag.split("=")));
    if (!roads.has(tags.highway) || (tags.surface && !pavement.has(tags.surface))) return false;
    covered += length;
    if (comarcal.has(tags.highway) || referenciaRegional(tags.ref)) onComarcal += length;
  }
  // La clase de carretera no demuestra el firme. El resultado se señalará para revisión.
  return covered >= routeMeters * 0.995 && onComarcal >= routeMeters * 0.5;
}

export function cumpleSuperficie(surfaces, surface, pavedRoadVerified = false) {
  if (!surfaces) return false;
  if (surface === "asphalt") return pavedRoadVerified && surfaces.paved === 1 && surfaces.unpaved === 0 && surfaces.unknown === 0;
  if (surface === "dirt") return surfaces.unpaved + (surfaces.unknownOffroad || 0) >= 0.60 && surfaces.paved <= 0.25;
  return false;
}

export async function rutaPorSuperficie(points, surface, { signal } = {}) {
  if (!["asphalt", "dirt"].includes(surface)) throw new Error("Selecciona asfalto o caminos de tierra.");
  const params = new URLSearchParams({
    lonlats: points.map(p => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join("|"),
    nogos: "", profile: surface === "asphalt" ? "fastbike" : "mtb", alternativeidx: "0", format: "geojson",
    "profile:allow_steps": "0", "profile:allow_ferries": "0",
    "profile:correctMisplacedViaPoints": "1", "profile:correctMisplacedViaPointsDistance": "400",
  });
  if (surface === "dirt") params.set("profile:StrictNOBicycleaccess", "1");
  const data = await obtenerJson(`${BROUTER_SERVICE}?${params}`, signal);
  const feature = data.features?.find(item => item.geometry?.type === "LineString");
  const coords = feature?.geometry.coordinates?.map(([lon, lat]) => ({ lat, lon }));
  const distance = Number(feature?.properties?.["track-length"]) / 1000;
  if (!coords || coords.length < 3 || !coords.every(coordenadaValida) || !Number.isFinite(distance) || distance <= 0) {
    throw new Error("El servicio no ha devuelto un recorrido válido para ese firme.");
  }
  return { coords, distance, routed: true, surface, messages: feature.properties.messages,
    surfaces: desgloseSuperficies(feature.properties.messages, distance * 1000),
    pavedRoadVerified: esCarreteraAsfaltadaCompleta(feature.properties.messages, distance * 1000) };
}

export function proporcionRutaRepetida(coords) {
  const seen = new Set();
  let total = 0, repeated = 0;
  const key = p => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
  for (let i = 1; i < coords.length; i++) {
    const a = key(coords[i - 1]), b = key(coords[i]);
    if (a === b) continue;
    const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
    const length = haversine(coords[i - 1], coords[i]);
    total += length;
    if (seen.has(edge)) repeated += length;
    seen.add(edge);
  }
  return total ? repeated / total : 1;
}

export function pasaPorPuntos(coords, points, tolerance = 0.25) {
  let index = 0, fraction = 0;
  for (const point of points) {
    while (index < coords.length - 1) {
      const position = posicionEnSegmento(point, coords[index], coords[index+1]);
      if (position.distance <= tolerance && position.fraction >= fraction) {
        fraction = position.fraction;
        break;
      }
      index++;
      fraction = 0;
    }
    if (index === coords.length - 1 && haversine(coords[index], point) > tolerance) return false;
  }
  return true;
}

function posicionEnSegmento(point, a, b) {
  const scale = Math.cos(point.lat * Math.PI / 180) * 111.2;
  const ax = (a.lon-point.lon)*scale, ay = (a.lat-point.lat)*111.2;
  const bx = (b.lon-point.lon)*scale, by = (b.lat-point.lat)*111.2;
  const dx = bx-ax, dy = by-ay;
  const projection = dx*dx+dy*dy ? Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy))) : 0;
  return {distance:Math.hypot(ax+projection*dx,ay+projection*dy), fraction:projection};
}

function cercaDelTrazado(point, coords, maxKm = 0.1) {
  for (let i = 1; i < coords.length; i++) {
    if (posicionEnSegmento(point,coords[i-1],coords[i]).distance <= maxKm) return true;
  }
  return false;
}

function rumboCompatible(start, end, heading) {
  const difference = Math.abs(((bearing(start, end) - heading + 540) % 360) - 180);
  return difference <= 65;
}

function inicioCompatible(coords, heading) {
  const first = coords[0];
  const next = coords.find(point => haversine(first, point) >= 0.3);
  return next ? rumboCompatible(first, next, heading) : false;
}

async function buscarRutaLinealPavimentada(start, targetKm, heading, {signal, onProgress, waypoints, enforceHeading}) {
  let best = null, comarcal = null;
  const directions = [heading, heading + 35, heading - 35];
  for (let attempt = 0; attempt < directions.length; attempt++) {
    signal?.throwIfAborted();
    onProgress(attempt + 1, directions.length, "lineal");
    const direction = directions[attempt];
    const radius = targetKm * [0.75, 0.85, 0.95][attempt];
    try {
      const route = await rutaPorSuperficie([start, ...waypoints, destination(start, radius, direction)], "asphalt", {signal});
      const verified = cumpleSuperficie(route.surfaces, "asphalt", route.pavedRoadVerified);
      const compatible = !verified && esRutaComarcalCompatible(route.messages, route.distance * 1000);
      if (!verified && !compatible) continue;
      const error = Math.abs(route.distance - targetKm) / targetKm;
      const repeated = proporcionRutaRepetida(route.coords);
      if (error > (verified ? 0.05 : 0.15) || repeated > 0.2 || !pasaPorPuntos(route.coords, [start, ...waypoints])
        || (enforceHeading && (!rumboCompatible(start, route.coords.at(-1), heading) || !inicioCompatible(route.coords, heading)))
        || haversine(route.coords[0], route.coords.at(-1)) < targetKm * 0.45) continue;
      if (verified) {
        if (!best || error + repeated < best.error + best.repeated) best = {...route, error, repeated};
        if (error <= 0.02 && repeated <= 0.08) break;
      } else if (!comarcal || error + repeated < comarcal.error + comarcal.repeated) comarcal = {...route, error, repeated};
    } catch (error) {
      signal?.throwIfAborted();
      if ([403, 429].includes(error.status) || error.name === "TimeoutError") throw error;
    }
  }
  return {best, comarcal};
}

async function buscarIdaVueltaPavimentada(start, targetKm, heading, {signal, onProgress, waypoints, enforceHeading}) {
  let best = null;
  const offset = Math.random() * 20 - 10;
  const directions = [heading + offset, heading + 30 + offset, heading - 30 + offset];
  for (let attempt = 0; attempt < 2; attempt++) {
    signal?.throwIfAborted();
    onProgress(attempt + 1, 2, "ida y vuelta");
    const direction = directions[attempt];
    const radius = targetKm * [0.42, 0.5][attempt];
    try {
      const outbound = await rutaPorSuperficie([start, ...waypoints, destination(start, radius, direction)], "asphalt", {signal});
      if (!cumpleSuperficie(outbound.surfaces, "asphalt", outbound.pavedRoadVerified)
        || !pasaPorPuntos(outbound.coords, [start, ...waypoints])
        || (enforceHeading && (!rumboCompatible(start, outbound.coords.at(-1), heading) || !inicioCompatible(outbound.coords, heading)))) continue;
      if (Math.abs(2 * outbound.distance - targetKm) / targetKm > 0.05
        || haversine(start, outbound.coords.at(-1)) < 0.25) continue;
      const reverse = await rutaPorSuperficie([outbound.coords.at(-1), ...waypoints.slice().reverse(), start], "asphalt", {signal});
      const reversedPoints = outbound.coords.slice().reverse().filter((_,i) => i % Math.max(1,Math.floor(outbound.coords.length / 12)) === 0);
      if (!cumpleSuperficie(reverse.surfaces, "asphalt", reverse.pavedRoadVerified)
        || !pasaPorPuntos(reverse.coords, [outbound.coords.at(-1), ...waypoints.slice().reverse(), start])
        || !reversedPoints.every(point => cercaDelTrazado(point, reverse.coords))) continue;
      const distance = outbound.distance + reverse.distance;
      const error = Math.abs(distance - targetKm) / targetKm;
      if (error > 0.05) continue;
      const route = {coords:[...outbound.coords, ...reverse.coords.slice(1)], distance,
        surfaces:outbound.surfaces, error, repeated:proporcionRutaRepetida([...outbound.coords, ...reverse.coords.slice(1)])};
      if (!best || error < best.error) best = route;
      if (error <= 0.02) break;
    } catch (error) {
      signal?.throwIfAborted();
      if ([403, 429].includes(error.status) || error.name === "TimeoutError") throw error;
    }
  }
  return best;
}

export async function generarRutaCircular(start, targetKm, heading, { surface = "asphalt", allowUncertain = false, signal, onProgress = () => {}, waypoints = [], enforceHeading = true } = {}) {
  if (!coordenadaValida(start)) throw new Error("Elige primero un punto de salida en el mapa o utiliza tu ubicación.");
  if (!Number.isFinite(targetKm) || targetKm < 5 || targetKm > 150) throw new Error("Elige una distancia entre 5 y 150 km.");
  if (!Number.isFinite(heading)) throw new Error("Selecciona una orientación válida.");
  if (!["asphalt", "dirt"].includes(surface)) throw new Error("Selecciona asfalto o caminos de tierra.");
  if (!Array.isArray(waypoints) || waypoints.length > 24 || !waypoints.every(coordenadaValida)) throw new Error("Revisa los puntos marcados.");
  let radius = targetKm / 6, best = null, received = false, matchingFirme = false;
  let lower = null, upper = null;
  let candidate = null;
  const attempts = surface === "asphalt" ? 3 : 6;
  let paused = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    signal?.throwIfAborted();
    if (attempt) await new Promise(resolve => setTimeout(resolve, surface === "asphalt" ? 250 : 1100));
    signal?.throwIfAborted();
    onProgress(attempt + 1, attempts);
    // Cada orientación empieza de nuevo: sus radios no son intercambiables.
    if (attempt === 3) { radius = targetKm / 6; lower = null; upper = null; }
    const direction = heading + (attempt < 3 ? 0 : 35);
    const points = [start, ...waypoints, destination(start, radius, direction - 45),
      destination(start, radius * 1.7, direction), destination(start, radius, direction + 45), start];
    try {
      const route = await rutaPorSuperficie(points, surface, { signal });
      received = true;
      const closed = haversine(route.coords[0], route.coords.at(-1)) < 0.05;
      const nearStart = pasaPorPuntos(route.coords, [start, ...waypoints]);
      const error = Math.abs(route.distance - targetKm) / targetKm;
      const repeated = proporcionRutaRepetida(route.coords);
      const suitable = cumpleSuperficie(route.surfaces, surface, route.pavedRoadVerified);
      matchingFirme ||= suitable;
      const preferred = route.surfaces?.[surface === "asphalt" ? "paved" : "unpaved"] ?? 0;
      const score = (1 - preferred) + error + repeated * 0.25;
      // En MTB, minimizar primero el pavimento conocido; los empates favorecen datos completos.
      const better = !best || (surface === "dirt" && suitable
        ? route.surfaces.paved < best.surfaces.paved
          || (route.surfaces.paved === best.surfaces.paved && (route.surfaces.unknown < best.surfaces.unknown
            || (route.surfaces.unknown === best.surfaces.unknown && score < best.score)))
        : score < best.score);
      if (suitable && closed && nearStart && (surface !== "asphalt" || !enforceHeading || inicioCompatible(route.coords, heading))
        && error <= 0.05 && repeated <= 0.2 && better) best = { ...route, error, repeated, score, preferred };
      // Un candidato incompleto nunca desplaza una ruta compatible ni ignora
      // superficies conocidas que contradigan la preferencia solicitada.
      const incomplete = !route.surfaces || route.surfaces.unknown > 0;
      const compatibleKnown = !route.surfaces || (surface === "asphalt" ? route.surfaces.unpaved === 0 : route.surfaces.paved <= 0.25);
      if (surface === "asphalt" && !suitable && incomplete && compatibleKnown
        && esRutaComarcalCompatible(route.messages, route.distance * 1000)
        && closed && nearStart && (!enforceHeading || inicioCompatible(route.coords, heading))
        && error <= 0.05 && repeated <= 0.2
        && (!candidate || error + repeated < candidate.error + candidate.repeated)) {
        candidate = { ...route, error, repeated, comarcal: true };
      }
      if (surface === "dirt" && allowUncertain && !suitable && incomplete && compatibleKnown && closed && nearStart && error <= 0.05 && repeated <= 0.2
        && (!candidate || score < candidate.score)) candidate = { ...route, error, repeated, score, preferred };
      const surfaceComplete = surface === "dirt" ? best?.preferred === 1 : best?.preferred >= 0.95;
      if (best?.error <= 0.02 && best.repeated <= 0.08 && surfaceComplete) break;
      if (route.distance < targetKm) lower = radius;
      else upper = radius;
      radius = lower !== null && upper !== null && lower < upper
        ? (lower + upper) / 2
        : radius * Math.max(0.6, Math.min(1.5, targetKm / route.distance));
    } catch (error) {
      signal?.throwIfAborted();
      if ([403, 429].includes(error.status) || error.name === "TimeoutError") {
        if (surface !== "asphalt") throw error;
        paused = error;
        break;
      }
    }
  }
  // Un circuito por carreteras regionales/comarcales tiene prioridad sobre una línea.
  // Si falta surface, se entrega como candidato con el firme por revisar.
  if (surface === "asphalt" && (best || candidate)) {
    const chosen = best || candidate;
    return { coords: chosen.coords, distance: chosen.distance, routed: true,
      generation: { surface, shape: "circular", surfaces: chosen.surfaces,
        pavedRoadVerified: Boolean(best?.pavedRoadVerified), needsReview: !best,
        comarcal: Boolean(chosen.comarcal), targetKm, error: chosen.error, repeated: chosen.repeated } };
  }
  if (paused && !best) {
    const regional = await rutaRegionalCiclista(start, targetKm, heading, {signal, waypoints, enforceHeading});
    if (regional) return regional;
    throw paused;
  }
  if (!best && received && surface === "asphalt") {
    let linear;
    try { linear = await buscarRutaLinealPavimentada(start, targetKm, heading, {signal, onProgress, waypoints, enforceHeading}); }
    catch (error) {
      if ([403,429].includes(error.status) || error.name === "TimeoutError") {
        const regional = await rutaRegionalCiclista(start, targetKm, heading, {signal, waypoints, enforceHeading});
        if (regional) return regional;
      }
      throw error;
    }
    if (linear.best) return {coords:linear.best.coords, distance:linear.best.distance, routed:true,
      generation:{surface, shape:"linear", surfaces:linear.best.surfaces, pavedRoadVerified:true,
        needsReview:false, targetKm, error:linear.best.error, repeated:linear.best.repeated}};
    if (linear.comarcal) return {coords:linear.comarcal.coords, distance:linear.comarcal.distance, routed:true,
      generation:{surface, shape:"linear", surfaces:linear.comarcal.surfaces, pavedRoadVerified:false,
        needsReview:true, comarcal:true, targetKm, error:linear.comarcal.error, repeated:linear.comarcal.repeated}};
    let returnRoute;
    try { returnRoute = await buscarIdaVueltaPavimentada(start, targetKm, heading, {signal, onProgress, waypoints, enforceHeading}); }
    catch (error) {
      if ([403,429].includes(error.status) || error.name === "TimeoutError") {
        const regional = await rutaRegionalCiclista(start, targetKm, heading, {signal, waypoints, enforceHeading});
        if (regional) return regional;
      }
      throw error;
    }
    if (returnRoute) return {coords:returnRoute.coords, distance:returnRoute.distance, routed:true,
      generation:{surface, shape:"out-and-back", surfaces:returnRoute.surfaces, pavedRoadVerified:true,
        needsReview:false, targetKm, error:returnRoute.error, repeated:returnRoute.repeated}};
  }
  if (!best && surface === "asphalt") {
    const regional = await rutaRegionalCiclista(start, targetKm, heading, {signal, waypoints, enforceHeading});
    if (regional) return regional;
  }
  const needsReview = !best && Boolean(candidate);
  best ||= candidate;
  if (!best && received && !matchingFirme) throw new Error(surface === "dirt"
    ? "No se encontró un circuito con al menos un 60 % de tierra/grava o caminos y como máximo un 25 % pavimentado conocido. Puede faltar información del mapa. Prueba otra salida, orientación o distancia. Tu ruta anterior se conserva."
    : "No hay una ruta pavimentada compatible. Marca otro punto en el mapa o cambia la salida, orientación o distancia.");
  if (!best) throw new Error(received
    ? `No se encontró ${surface === "asphalt" ? "una ruta pavimentada" : "un circuito"} dentro del 5 % de la distancia. Marca otro punto o cambia la orientación.`
    : "El servicio de rutas por firme no ha podido responder. Inténtalo de nuevo. Tu ruta anterior se conserva.");
  return { coords: best.coords, distance: best.distance, routed: true,
    generation: { surface, surfaces: best.surfaces, pavedRoadVerified: best.pavedRoadVerified, needsReview, targetKm, error: best.error, repeated: best.repeated } };
}

export function coordenadaValida(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
}

export function distanciaRecorrido(points) {
  return points.slice(1).reduce((total, point, index) => total + haversine(points[index], point), 0);
}

export function muestrearRuta(points, count) {
  if (points.length <= 1) return points.map((point) => ({ ...point, progress: 0 }));
  const distances = distanciasAcumuladas(points);
  const total = distances[distances.length - 1];
  return Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? 0 : index / (count - 1);
    const target = total * progress;
    let nextIndex = distances.findIndex((distance) => distance >= target);
    if (nextIndex <= 0) nextIndex = 1;
    const prevDistance = distances[nextIndex - 1];
    const nextDistance = distances[nextIndex];
    const local = (target - prevDistance) / (nextDistance - prevDistance || 1);
    const a = points[nextIndex - 1];
    const b = points[nextIndex];
    return {
      lat: a.lat + (b.lat - a.lat) * local,
      lon: a.lon + (b.lon - a.lon) * local,
      progress,
    };
  });
}

export function distanciasAcumuladas(points) {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances[index] = distances[index - 1] + haversine(points[index - 1], points[index]);
  }
  return distances;
}

function puntoADistancia(points, distances, target) {
  let nextIndex = distances.findIndex((distance) => distance >= target);
  if (nextIndex <= 0) return points[0];
  const prevDistance = distances[nextIndex - 1];
  const nextDistance = distances[nextIndex];
  const local = (target - prevDistance) / (nextDistance - prevDistance || 1);
  const a = points[nextIndex - 1];
  const b = points[nextIndex];
  return {
    lat: a.lat + (b.lat - a.lat) * local,
    lon: a.lon + (b.lon - a.lon) * local,
  };
}

export function tramoRuta(points, startProgress, endProgress) {
  const distances = distanciasAcumuladas(points);
  const total = distances[distances.length - 1];
  const startDistance = total * startProgress;
  const endDistance = total * endProgress;
  const slice = [puntoADistancia(points, distances, startDistance)];
  points.forEach((point, index) => {
    if (distances[index] > startDistance && distances[index] < endDistance) slice.push(point);
  });
  slice.push(puntoADistancia(points, distances, endDistance));
  return slice.map((point) => [point.lat, point.lon]);
}

export function crearGpx(name, coords) {
  const safeName = (name || "Ruta").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
  const points = coords
    .map((c) => `      <trkpt lat="${c.lat.toFixed(6)}" lon="${c.lon.toFixed(6)}"></trkpt>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RideCast" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${safeName}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
}

export function interpretarArchivoRuta(text) {
  if (text.length > 10 * 1024 * 1024) throw new Error("El fichero supera los 10 MB.");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("El fichero no es un GPX o TCX válido.");
  const number = (value) => value == null || value.trim() === "" ? NaN : Number(value);
  const tracks = [...doc.querySelectorAll("trkpt")];
  const gpxNodes = tracks.length ? tracks : [...doc.querySelectorAll("rtept")];
  const gpx = gpxNodes.map((node) => ({
    lat: number(node.getAttribute("lat")), lon: number(node.getAttribute("lon")),
  }));
  const tcx = [...doc.querySelectorAll("Trackpoint Position")].map((node) => ({
    lat: number(node.querySelector("LatitudeDegrees")?.textContent),
    lon: number(node.querySelector("LongitudeDegrees")?.textContent),
  }));
  const points = gpx.length ? gpx : tcx;
  if (points.length < 2) throw new Error("La ruta necesita al menos dos puntos.");
  if (points.length > 50000) throw new Error("La ruta supera los 50.000 puntos.");
  if (!points.every(coordenadaValida)) throw new Error("El fichero contiene coordenadas incompletas o no válidas.");
  if (distanciaRecorrido(points) < 0.01) throw new Error("El recorrido es demasiado corto.");
  return {
    coords: points,
    name: (doc.querySelector("trk > name, rte > name, Course > Name")?.textContent?.trim() || "Ruta importada").slice(0, 100),
  };
}

export async function consultarTiempo(points, departure, totalDistance, speed) {
  if (!Number.isFinite(departure.getTime()) || departure.getTime() < Date.now() - 3600000) {
    throw new Error("Elige una fecha de salida actual o futura.");
  }
  if (!(speed >= 8 && speed <= 45) || !(totalDistance > 0)) throw new Error("Revisa la distancia y la velocidad.");
  if (!points.length) throw new Error("La ruta no contiene puntos de previsión.");
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(","),
    longitude: points.map((p) => p.lon.toFixed(4)).join(","),
    hourly: [
      "temperature_2m",
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
    ].join(","),
    wind_speed_unit: "kmh",
    timezone: "UTC",
    timeformat: "unixtime",
    forecast_days: "7",
  });
  const data = await obtenerJson(`https://api.open-meteo.com/v1/forecast?${params}`);
  const blocks = Array.isArray(data) ? data : [data];
  return points.map((point, index) => {
    const arrival = new Date(departure.getTime() + ((totalDistance * point.progress) / speed) * 3600000);
    const block = blocks[index];
    const hourly = block?.hourly;
    if (!hourly?.time?.length) throw new Error("No hay datos para todos los puntos de esta ruta.");
    const weatherIndex = indiceHoraCercana(hourly.time, arrival);
    const required = ["temperature_2m", "precipitation_probability", "precipitation", "weather_code", "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m"];
    if (required.some((key) => !Number.isFinite(hourly[key]?.[weatherIndex]))) {
      throw new Error("La previsión está incompleta para este recorrido. Prueba con otra fecha.");
    }
    return {
      ...point,
      heading: index < points.length - 1 ? bearing(point, points[index + 1]) : bearing(points[Math.max(0, index - 1)], point),
      km: totalDistance * point.progress,
      arrival,
      temperature: hourly.temperature_2m[weatherIndex],
      rainChance: hourly.precipitation_probability[weatherIndex] ?? 0,
      precipitation: hourly.precipitation[weatherIndex] ?? 0,
      code: hourly.weather_code[weatherIndex],
      wind: hourly.wind_speed_10m[weatherIndex],
      gust: hourly.wind_gusts_10m[weatherIndex],
      windDirection: hourly.wind_direction_10m[weatherIndex],
    };
  });
}

export function indiceHoraCercana(times, date) {
  const target = date.getTime();
  if (!times.length || target < times[0] * 1000 || target > times[times.length - 1] * 1000) {
    throw new Error("La salida o llegada queda fuera de los 7 días de previsión disponibles.");
  }
  let best = 0;
  let diff = Infinity;
  times.forEach((time, index) => {
    const nextDiff = Math.abs(time * 1000 - target);
    if (nextDiff < diff) {
      best = index;
      diff = nextDiff;
    }
  });
  return best;
}

export function riesgoTramo(segment, rideBearing) {
  const angle = Math.abs((((segment.windDirection - (segment.heading ?? rideBearing) + 540) % 360) - 180));
  const headwind = Math.max(0, segment.wind * Math.cos((angle * Math.PI) / 180));
  const score =
    headwind * 1.25 +
    segment.gust * 0.35 +
    segment.rainChance * 0.18 +
    segment.precipitation * 6 +
    (segment.temperature < 6 ? 10 : 0) +
    (segment.temperature > 33 ? 8 : 0);
  if (score >= 48) return "bad";
  if (score >= 28) return "watch";
  return "good";
}

export function valorMetrica(segment, mode) {
  if (mode === "rain") return Math.min(100, segment.rainChance);
  if (mode === "temp") return Math.min(100, Math.max(0, ((segment.temperature + 5) / 45) * 100));
  return Math.min(100, segment.gust * 1.4);
}

export function direccionViento(degrees) {
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round((degrees % 360) / 45) % 8];
}

export function leerRutasGuardadas() {
  if (rutasCuenta() !== null) return rutasCuenta();
  return leerRutasLocales();
}

export function leerRutasLocales() {
  try {
    const routes = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(routes) || routes.some((route) =>
      !route || typeof route.id !== "string" || typeof route.name !== "string"
      || !Array.isArray(route.coords) || route.coords.length < 2 || !route.coords.every(coordenadaValida))) {
      throw new Error("Datos no válidos");
    }
    return routes;
  } catch {
    throw new Error("No se puede leer la colección guardada en este navegador. No se han modificado tus datos.");
  }
}

export function escribirRutasGuardadas(routes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  } catch {
    throw new Error("No se pudo guardar: almacenamiento lleno o bloqueado. Exporta la ruta como GPX.");
  }
}

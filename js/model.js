// Modelo: estado de la aplicación, llamadas a APIs externas (rutas y tiempo)
// y funciones de cálculo geográfico. Sin dependencias del DOM.

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
  routeMode: "mixto",
  currentRoadRatio: null,
};

export const weatherLabels = {
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

export const suggestionCategories = {routes:"Rutas",weather:"Previsión",interface:"Interfaz",other:"Otra idea"};
export function readSuggestions() {
  const entries = JSON.parse(localStorage.getItem("ridecast.suggestions") || "[]");
  if (!Array.isArray(entries) || entries.some(item => !item || typeof item.text !== "string" || typeof item.id !== "string" || !Object.hasOwn(suggestionCategories,item.category))) {
    throw new Error("No se pueden leer las sugerencias guardadas. Los datos se han conservado.");
  }
  return entries;
}
export function saveSuggestion(text, category) {
  text = text.trim();
  if (!text || text.length > 2000 || !Object.hasOwn(suggestionCategories,category)) throw new Error("Escribe una sugerencia de entre 1 y 2000 caracteres.");
  const entries = readSuggestions();
  const entry = {id:crypto.randomUUID(),text,category,createdAt:new Date().toISOString()};
  try { localStorage.setItem("ridecast.suggestions", JSON.stringify([entry,...entries])); }
  catch { throw new Error("No se pudo guardar. Comprueba el espacio o los permisos del navegador."); }
  return [entry,...entries];
}

export function setDefaultDeparture(input) {
  const date = new Date();
  date.setHours(date.getHours() + 2, 0, 0, 0);
  input.value = toLocalInput(date);
}

function toLocalInput(date) {
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

async function fetchJson(url, signal) {
  const timeout = AbortSignal.timeout(25000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error("El servicio no está disponible. Inténtalo de nuevo.");
  return response.json();
}

export async function snapToRoad(lat, lon) {
  try {
    const data = await fetchJson(`${BIKE_SERVICE}/nearest/v1/cycling/${lon},${lat}?number=1`);
    const location = data.waypoints?.[0]?.location;
    if (!location) return null;
    const [snLon, snLat] = location;
    const snapped = { lat: snLat, lon: snLon };
    return validCoordinate(snapped) && haversine({ lat, lon }, snapped) < 2 ? snapped : null;
  } catch {
    return null;
  }
}

export async function routeAcross(points, { signal, radiuses } = {}) {
  if (points.length < 2) throw new Error("Marca al menos dos puntos en el mapa.");
  if (points.length > 25) throw new Error("El máximo es de 25 puntos por recorrido.");
  if (!points.every(validCoordinate)) throw new Error("Las coordenadas de la ruta no son válidas.");
  try {
    const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
    const params = new URLSearchParams({ alternatives: "false", steps: "false", overview: "full", geometries: "geojson" });
    if (radiuses) params.set("radiuses", radiuses.join(";"));
    const data = await fetchJson(`${BIKE_SERVICE}/route/v1/cycling/${coords}?${params}`, signal);
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route?.geometry?.coordinates?.length || !(route.distance > 0)) {
      throw new Error("Sin recorrido");
    }
    const geometry = route.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
    if (!geometry.every(validCoordinate)) throw new Error("Coordenadas no válidas");
    return { coords: geometry, distance: route.distance / 1000, routed: true };
  } catch {
    signal?.throwIfAborted();
    throw new Error("No se pudo trazar una ruta ciclista. Prueba con puntos más cercanos o importa un GPX.");
  }
}

function destination(origin, km, heading) {
  const rad = Math.PI / 180;
  const lat = origin.lat * rad, lon = origin.lon * rad, angle = heading * rad, distance = km / 6371;
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(angle));
  const nextLon = lon + Math.atan2(Math.sin(angle) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat));
  return { lat: nextLat / rad, lon: ((nextLon / rad + 540) % 360) - 180 };
}

export function surfaceBreakdown(messages, routeMeters = 0) {
  const totals = { paved: 0, unpaved: 0, unknown: 0 };
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
    totals[paved ? "paved" : unpaved ? "unpaved" : "unknown"] += distance;
  }
  const described = totals.paved + totals.unpaved + totals.unknown;
  if (Number.isFinite(routeMeters) && routeMeters > described) totals.unknown += routeMeters - described;
  const total = totals.paved + totals.unpaved + totals.unknown;
  return total ? Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / total])) : null;
}

export function isEntirelyPavedRoad(messages, routeMeters) {
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

export function matchesSurface(surfaces, surface, pavedRoadVerified = false) {
  if (!surfaces) return false;
  if (surface === "asphalt") return pavedRoadVerified && surfaces.paved === 1 && surfaces.unpaved === 0 && surfaces.unknown === 0;
  if (surface === "dirt") return surfaces.unpaved >= 0.60 && surfaces.paved <= 0.25;
  return false;
}

export async function routeForSurface(points, surface, { signal } = {}) {
  if (!["asphalt", "dirt"].includes(surface)) throw new Error("Selecciona asfalto o caminos de tierra.");
  const params = new URLSearchParams({
    lonlats: points.map(p => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join("|"),
    nogos: "", profile: surface === "asphalt" ? "fastbike" : "mtb", alternativeidx: "0", format: "geojson",
    "profile:allow_steps": "0", "profile:allow_ferries": "0",
    "profile:correctMisplacedViaPoints": "1", "profile:correctMisplacedViaPointsDistance": "400",
  });
  if (surface === "dirt") params.set("profile:StrictNOBicycleaccess", "1");
  const data = await fetchJson(`https://brouter.de/brouter?${params}`, signal);
  const feature = data.features?.find(item => item.geometry?.type === "LineString");
  const coords = feature?.geometry.coordinates?.map(([lon, lat]) => ({ lat, lon }));
  const distance = Number(feature?.properties?.["track-length"]) / 1000;
  if (!coords || coords.length < 3 || !coords.every(validCoordinate) || !Number.isFinite(distance) || distance <= 0) {
    throw new Error("El servicio no ha devuelto un recorrido válido para ese firme.");
  }
  return { coords, distance, routed: true, surface, surfaces: surfaceBreakdown(feature.properties.messages, distance * 1000),
    pavedRoadVerified: isEntirelyPavedRoad(feature.properties.messages, distance * 1000) };
}

export function repeatedRouteRatio(coords) {
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

export async function generateRoundTrip(start, targetKm, heading, { surface = "asphalt", signal, onProgress = () => {} } = {}) {
  if (!validCoordinate(start)) throw new Error("Elige primero un punto de salida en el mapa o utiliza tu ubicación.");
  if (!Number.isFinite(targetKm) || targetKm < 5 || targetKm > 150) throw new Error("Elige una distancia entre 5 y 150 km.");
  if (!Number.isFinite(heading)) throw new Error("Selecciona una orientación válida.");
  if (!["asphalt", "dirt"].includes(surface)) throw new Error("Selecciona asfalto o caminos de tierra.");
  let radius = targetKm / 6, best = null, received = false, matchingFirme = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    signal?.throwIfAborted();
    if (attempt) await new Promise(resolve => setTimeout(resolve, 1100));
    signal?.throwIfAborted();
    onProgress(attempt + 1, 6);
    // Refinar dos veces cada orientación antes de explorar otro trazado.
    const direction = heading + [0, 0, 35, 35, -35, -35][attempt];
    const points = [start, destination(start, radius, direction - 45),
      destination(start, radius * 1.7, direction), destination(start, radius, direction + 45), start];
    try {
      const route = await routeForSurface(points, surface, { signal });
      received = true;
      const closed = haversine(route.coords[0], route.coords.at(-1)) < 0.05;
      const nearStart = haversine(start, route.coords[0]) <= 0.25;
      const error = Math.abs(route.distance - targetKm) / targetKm;
      const repeated = repeatedRouteRatio(route.coords);
      const suitable = matchesSurface(route.surfaces, surface, route.pavedRoadVerified);
      matchingFirme ||= suitable;
      const preferred = route.surfaces?.[surface === "asphalt" ? "paved" : "unpaved"] ?? 0;
      const score = (1 - preferred) + error + repeated * 0.25;
      // En MTB, minimizar primero el pavimento conocido; los empates favorecen datos completos.
      const better = !best || (surface === "dirt" && suitable
        ? route.surfaces.paved < best.surfaces.paved
          || (route.surfaces.paved === best.surfaces.paved && (route.surfaces.unknown < best.surfaces.unknown
            || (route.surfaces.unknown === best.surfaces.unknown && score < best.score)))
        : score < best.score);
      if (suitable && closed && nearStart && error <= 0.05 && repeated <= 0.2 && better) best = { ...route, error, repeated, score, preferred };
      const surfaceComplete = surface === "dirt" ? best?.preferred === 1 : best?.preferred >= 0.95;
      if (best?.error <= 0.02 && best.repeated <= 0.08 && surfaceComplete) break;
      radius *= Math.max(0.6, Math.min(1.5, targetKm / route.distance));
    } catch {
      signal?.throwIfAborted();
    }
  }
  if (!best && received && !matchingFirme) throw new Error(surface === "dirt"
    ? "No se encontró un circuito con al menos un 60 % de tierra/grava y como máximo un 25 % pavimentado. Puede faltar información del firme. Prueba otra salida, orientación o distancia. Tu ruta anterior se conserva."
    : "No se pudo verificar un circuito 100 % por carretera pavimentada: hay caminos, senderos o tramos sin datos suficientes. Prueba otra salida, orientación o distancia. Tu ruta anterior se conserva.");
  if (!best) throw new Error(received
    ? "No se encontró un circuito dentro del 5 % de la distancia y con pocos tramos repetidos. Prueba otra orientación o distancia. Tu ruta anterior se conserva."
    : "El servicio de rutas por firme no ha podido responder. Inténtalo de nuevo. Tu ruta anterior se conserva.");
  return { coords: best.coords, distance: best.distance, routed: true,
    generation: { surface, surfaces: best.surfaces, pavedRoadVerified: best.pavedRoadVerified, targetKm, error: best.error, repeated: best.repeated } };
}

export function validCoordinate(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
}

export function pathDistance(points) {
  return points.slice(1).reduce((total, point, index) => total + haversine(points[index], point), 0);
}

export function sampleRoute(points, count) {
  if (points.length <= 1) return points.map((point) => ({ ...point, progress: 0 }));
  const distances = cumulativeDistances(points);
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

export function cumulativeDistances(points) {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances[index] = distances[index - 1] + haversine(points[index - 1], points[index]);
  }
  return distances;
}

function pointAtDistance(points, distances, target) {
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

export function routeSlice(points, startProgress, endProgress) {
  const distances = cumulativeDistances(points);
  const total = distances[distances.length - 1];
  const startDistance = total * startProgress;
  const endDistance = total * endProgress;
  const slice = [pointAtDistance(points, distances, startDistance)];
  points.forEach((point, index) => {
    if (distances[index] > startDistance && distances[index] < endDistance) slice.push(point);
  });
  slice.push(pointAtDistance(points, distances, endDistance));
  return slice.map((point) => [point.lat, point.lon]);
}

export function buildGpx(name, coords) {
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

export function parseRouteFile(text) {
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
  if (!points.every(validCoordinate)) throw new Error("El fichero contiene coordenadas incompletas o no válidas.");
  if (pathDistance(points) < 0.01) throw new Error("El recorrido es demasiado corto.");
  return {
    coords: points,
    name: (doc.querySelector("trk > name, rte > name, Course > Name")?.textContent?.trim() || "Ruta importada").slice(0, 100),
  };
}

export async function weatherFor(points, departure, totalDistance, speed) {
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
  const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`);
  const blocks = Array.isArray(data) ? data : [data];
  return points.map((point, index) => {
    const arrival = new Date(departure.getTime() + ((totalDistance * point.progress) / speed) * 3600000);
    const block = blocks[index];
    const hourly = block?.hourly;
    if (!hourly?.time?.length) throw new Error("No hay datos para todos los puntos de esta ruta.");
    const weatherIndex = nearestHourIndex(hourly.time, arrival);
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

export function nearestHourIndex(times, date) {
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

export function riskFor(segment, rideBearing) {
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

export function metricValue(segment, mode) {
  if (mode === "rain") return Math.min(100, segment.rainChance);
  if (mode === "temp") return Math.min(100, Math.max(0, ((segment.temperature + 5) / 45) * 100));
  return Math.min(100, segment.gust * 1.4);
}

export function weatherEmoji(code) {
  if ([0, 1].includes(code)) return "☀️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55].includes(code)) return "🌦️";
  if ([61, 63, 65].includes(code)) return "🌧️";
  if ([71, 73, 75].includes(code)) return "❄️";
  if ([80, 81, 82].includes(code)) return "⛈️";
  if (code === 95) return "⛈️";
  return "🌡️";
}

export function windCompass(degrees) {
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round((degrees % 360) / 45) % 8];
}

export function isNighttime(date) {
  const h = date.getHours();
  return h < 6 || h >= 21;
}

export function readSavedRoutes() {
  try {
    const routes = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(routes) || routes.some((route) =>
      !route || typeof route.id !== "string" || typeof route.name !== "string"
      || !Array.isArray(route.coords) || route.coords.length < 2 || !route.coords.every(validCoordinate))) {
      throw new Error("Datos no válidos");
    }
    return routes;
  } catch {
    throw new Error("No se puede leer la colección guardada en este navegador. No se han modificado tus datos.");
  }
}

export function writeSavedRoutes(routes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  } catch {
    throw new Error("No se pudo guardar: almacenamiento lleno o bloqueado. Exporta la ruta como GPX.");
  }
}

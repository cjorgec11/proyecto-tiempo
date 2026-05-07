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

function interpolate(a, b, count) {
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0 : index / (count - 1);
    return {
      lat: a.lat + (b.lat - a.lat) * t,
      lon: a.lon + (b.lon - a.lon) * t,
      progress: t,
    };
  });
}

// Servidores OSRM públicos: uno por modo de ruta. Cada uno usa un perfil de calle distinto.
const ROUTE_PROFILES = {
  mixto: { base: "https://routing.openstreetmap.de/routed-bike", profile: "cycling" },
  carretera: { base: "https://routing.openstreetmap.de/routed-car", profile: "driving" },
  caminos: { base: "https://routing.openstreetmap.de/routed-foot", profile: "walking" },
};

const PATH_NAME_RX = /camino|senda|vereda|pista|cañada|ca[nñ]ada|vía pecuaria|via pecuaria|track|trail|sendero|footway|path/i;

function classifyStep(step) {
  if (step.ref) return "road";
  const name = (step.name || "").trim();
  if (!name) return "path";
  if (PATH_NAME_RX.test(name)) return "path";
  return "road";
}

export async function snapToRoad(lat, lon) {
  try {
    const response = await fetch(
      `https://routing.openstreetmap.de/routed-bike/nearest/v1/cycling/${lon},${lat}?number=1`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    const wp = data.waypoints?.[0];
    if (!wp?.location) return null;
    const [snLon, snLat] = wp.location;
    return { lat: snLat, lon: snLon };
  } catch {
    return null;
  }
}

export async function routeAcross(points, mode = "mixto") {
  if (points.length < 2) throw new Error("Marca al menos dos puntos en el mapa");
  const fallbackCoords = points.slice(1).reduce(
    (acc, point, index) => acc.concat(interpolate(points[index], point, 16).slice(index === 0 ? 0 : 1)),
    []
  );
  const cfg = ROUTE_PROFILES[mode] || ROUTE_PROFILES.mixto;
  try {
    const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
    const params = new URLSearchParams({
      alternatives: "false",
      steps: "true",
      overview: "full",
      geometries: "geojson",
    });
    const response = await fetch(`${cfg.base}/route/v1/${cfg.profile}/${coords}?${params}`);
    if (!response.ok) throw new Error("Ruta no disponible");
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates?.length) throw new Error("Ruta sin geometria");
    let roadDist = 0;
    let pathDist = 0;
    (route.legs || []).forEach((leg) => {
      (leg.steps || []).forEach((step) => {
        const kind = classifyStep(step);
        if (kind === "road") roadDist += step.distance || 0;
        else pathDist += step.distance || 0;
      });
    });
    const total = roadDist + pathDist;
    const roadRatio = total > 0 ? roadDist / total : null;
    return {
      coords: route.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
      distance: route.distance / 1000,
      routed: true,
      mode,
      roadRatio,
    };
  } catch {
    return {
      coords: fallbackCoords,
      distance: pathDistance(fallbackCoords),
      routed: false,
      mode,
      roadRatio: null,
    };
  }
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
  const safeName = (name || "Ruta").replace(/[<>&]/g, "");
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

export function downloadGpx(name, coords) {
  const xml = buildGpx(name, coords);
  const blob = new Blob([xml], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const filename = `${(name || "ruta").replace(/[^a-z0-9-_]+/gi, "_")}.gpx`;
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseRouteFile(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("El fichero no parece GPX o TCX valido");
  const gpxPoints = [...doc.querySelectorAll("trkpt, rtept")].map((node) => ({
    lat: Number(node.getAttribute("lat")),
    lon: Number(node.getAttribute("lon")),
  }));
  const tcxPoints = [...doc.querySelectorAll("Trackpoint Position")].map((node) => ({
    lat: Number(node.querySelector("LatitudeDegrees")?.textContent),
    lon: Number(node.querySelector("LongitudeDegrees")?.textContent),
  }));
  const points = [...gpxPoints, ...tcxPoints].filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lon)
  );
  if (points.length < 2) throw new Error("La ruta necesita al menos dos puntos");
  return {
    coords: simplifyRoute(points, 600),
    name: doc.querySelector("trk > name, rte > name, Course > Name")?.textContent?.trim() || "Ruta importada",
  };
}

function simplifyRoute(points, limit) {
  if (points.length <= limit) return points;
  const step = Math.ceil(points.length / limit);
  const simplified = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (simplified[simplified.length - 1] !== last) simplified.push(last);
  return simplified;
}

export async function weatherFor(points, departure, totalDistance, speed) {
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
    timezone: "auto",
    forecast_days: "7",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("No se pudo cargar el tiempo");
  const data = await response.json();
  const blocks = Array.isArray(data) ? data : [data];
  return points.map((point, index) => {
    const arrival = new Date(departure.getTime() + ((totalDistance * point.progress) / speed) * 3600000);
    const block = blocks[index];
    const weatherIndex = nearestHourIndex(block.hourly.time, arrival);
    const hourly = block.hourly;
    return {
      ...point,
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

function nearestHourIndex(times, date) {
  const target = date.getTime();
  let best = 0;
  let diff = Infinity;
  times.forEach((time, index) => {
    const nextDiff = Math.abs(new Date(time).getTime() - target);
    if (nextDiff < diff) {
      best = index;
      diff = nextDiff;
    }
  });
  return best;
}

export function riskFor(segment, rideBearing) {
  const angle = Math.abs((((segment.windDirection - rideBearing + 540) % 360) - 180));
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
    return Array.isArray(routes) ? routes : [];
  } catch {
    return [];
  }
}

export function writeSavedRoutes(routes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
}

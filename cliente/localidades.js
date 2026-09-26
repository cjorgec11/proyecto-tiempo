import { haversine, muestrearRuta } from "./modelo.js";

// Photon solo recibe unas pocas muestras del trazado; nunca el recorrido completo.
const placeCache = new Map();
let nextRequestAt = 0;
let queue = Promise.resolve();

async function consultarLocalidad(point, signal) {
  const key = `${point.lat.toFixed(3)},${point.lon.toFixed(3)}`;
  if (placeCache.has(key)) return placeCache.get(key);
  const task = queue.then(async () => {
    if (placeCache.has(key)) return placeCache.get(key);
    signal?.throwIfAborted();
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    signal?.throwIfAborted();
    nextRequestAt = Date.now() + 1000;
    const params = new URLSearchParams({lat:String(point.lat),lon:String(point.lon),radius:"1.5",layer:"city",limit:"1",lang:"es"});
    const timeout = AbortSignal.timeout(3500);
    const response = await fetch(`https://photon.komoot.io/reverse?${params}`, {signal:signal ? AbortSignal.any([signal,timeout]) : timeout});
    if (!response.ok) throw new Error("No se pudieron consultar las localidades.");
    const feature = (await response.json()).features?.[0];
    const [lon, lat] = feature?.geometry?.coordinates || [];
    const name = feature?.properties?.name;
    const place = typeof name === "string" && name.trim().length <= 60 && Number.isFinite(lat) && Number.isFinite(lon)
      && haversine(point,{lat,lon}) <= 1.5 ? name.trim() : null;
    placeCache.set(key, place);
    return place;
  });
  queue = task.catch(() => {});
  return task;
}

export async function localidadesDelRecorrido(coords, {signal, lookup = consultarLocalidad} = {}) {
  if (!Array.isArray(coords) || coords.length < 2) return [];
  const samples = muestrearRuta(coords, 6).map(({lat,lon}) => ({lat,lon}));
  const names = [], seen = new Set();
  for (const point of samples) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
    if (samples.indexOf(point) === samples.length - 1 && haversine(point,samples[0]) < 0.15) continue;
    let name;
    try { name = await lookup(point,signal); }
    catch { signal?.throwIfAborted(); break; }
    const normalized = name?.toLocaleLowerCase("es");
    if (normalized && !seen.has(normalized)) { names.push(name); seen.add(normalized); }
  }
  return names;
}

export function nombreConLocalidades(base, places) {
  if (!places?.length) return base;
  let name = base;
  for (const place of places) {
    if (name.length + place.length + 3 > 100) break;
    name += ` · ${place}`;
  }
  return name;
}

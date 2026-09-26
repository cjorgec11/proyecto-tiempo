import { haversine, bearing, proporcionRutaRepetida } from "./modelo.js";

const fechaValida = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const coordValida = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
const key = p => `${p.lat},${p.lon}`;
const distance = coords => coords.slice(1).reduce((sum, p, i) => sum + haversine(coords[i], p), 0);

export function validarRedVerificada(red) {
  if (red?.version !== 1 || !Array.isArray(red.tramos) || red.tramos.length > 10000) throw new Error("Biblioteca de tramos no válida.");
  const ids = new Set();
  for (const tramo of red.tramos) {
    if (!tramo || typeof tramo.id !== "string" || !tramo.id.trim() || ids.has(tramo.id)
      || !["asphalt", "ground", "dirt", "gravel", "fine_gravel", "compacted", "earth"].includes(tramo.surface)
      || !["both", "forward"].includes(tramo.direction) || tramo.bicycleAllowed !== true
      || typeof tramo.source !== "string" || !tramo.source.trim()
      || typeof tramo.reviewedBy !== "string" || !tramo.reviewedBy.trim()
      || !fechaValida(tramo.checkedAt) || !fechaValida(tramo.validUntil) || tramo.validUntil < tramo.checkedAt
      || !Array.isArray(tramo.coords) || tramo.coords.length < 2 || tramo.coords.length > 50000
      || !tramo.coords.every(coordValida) || !(distance(tramo.coords) > 0)) {
      throw new Error(`Tramo sin geometría, permisos o verificación completa: ${tramo?.id || "sin identificador"}.`);
    }
    ids.add(tramo.id);
  }
  return red;
}

export async function generarCircuitoVerificado(red, start, targetKm, heading, {surface, signal, onProgress = () => {}, now = new Date(), waypoints = [], enforceHeading = true} = {}) {
  validarRedVerificada(red);
  if (!coordValida(start) || !Number.isFinite(targetKm) || targetKm < 5 || targetKm > 150
    || !Number.isFinite(heading) || !["asphalt", "dirt"].includes(surface)
    || !Array.isArray(waypoints) || waypoints.length > 24 || !waypoints.every(coordValida)) throw new Error("Revisa la salida, los puntos, distancia y firme.");
  signal?.throwIfAborted();
  const today = now.toISOString().slice(0,10);
  const usable = red.tramos.filter(t => t.checkedAt <= today && t.validUntil >= today
    && (surface === "asphalt" ? t.surface === "asphalt" : t.surface !== "asphalt"));
  if (!usable.length) throw new Error("No hay tramos de ese firme con revisión vigente en la biblioteca. Añade tramos comprobados o elige Preferencia de terreno; ese modo no garantiza el firme.");
  const graph = new Map();
  const positions = new Map();
  const add = (tramo, coords) => {
    const node = key(coords[0]);
    if (!graph.has(node)) graph.set(node, []);
    positions.set(node, coords[0]);
    positions.set(key(coords.at(-1)), coords.at(-1));
    graph.get(node).push({tramo, coords, end:key(coords.at(-1)), km:distance(coords)});
  };
  for (const tramo of usable) {
    add(tramo, tramo.coords);
    if (tramo.direction === "both") add(tramo, [...tramo.coords].reverse());
  }
  const origins = [...graph.keys()].filter(node => haversine(start, graph.get(node)[0].coords[0]) <= 0.025);
  if (!origins.length) throw new Error("La salida no está en la red verificada. Elige un extremo de tramo a menos de 25 m; no se añadirá un enlace sin verificar.");
  const required = waypoints.map(point => [...positions.keys()].find(node => haversine(point, positions.get(node)) <= 0.025));
  if (required.some(node => !node)) throw new Error("Un punto marcado no está en la red revisada. Marca otro extremo de tramo.");
  let best = null, bestLinear = null, bestReturn = null, explored = 0, truncated = false;
  const stack = origins.map(origin => ({origin, node:origin, edges:[], visited:new Set([origin]), km:0, via:0}));
  while (stack.length && explored < 20000) {
    signal?.throwIfAborted();
    if (++explored % 256 === 0) {
      onProgress(explored, 20000);
      await new Promise(resolve => setTimeout(resolve, 0));
      signal?.throwIfAborted();
    }
    const path = stack.pop();
    for (const edge of graph.get(path.node) || []) {
      if (path.edges.some(previous => previous.tramo.id === edge.tramo.id)) continue;
      const km = path.km + edge.km;
      if (km > targetKm * 1.05) continue;
      const edges = [...path.edges, edge];
      const via = path.via + (required[path.via] === edge.end ? 1 : 0);
      if (surface === "asphalt" && via === required.length && edges.every(item => item.tramo.direction === "both")
        && 2 * km >= targetKm * 0.95 && 2 * km <= targetKm * 1.05 && edge.end !== path.origin) {
        const error = Math.abs(2 * km - targetKm) / targetKm;
        const angle = Math.abs(((bearing(edges[0].coords[0], edges[0].coords[1]) - heading + 540) % 360) - 180);
        const score = error + angle / 1800;
        if ((!enforceHeading || angle <= 65) && (!bestReturn || score < bestReturn.score)) bestReturn = {edges, km:2 * km, error, score, repeated:0.5};
      }
      if (edge.end === path.origin) {
        if (km < targetKm * 0.95 || via !== required.length) continue;
        const coords = edges.flatMap((e,i) => i ? e.coords.slice(1) : e.coords);
        const repeated = proporcionRutaRepetida(coords);
        if (repeated > 0.2) continue;
        const error = Math.abs(km - targetKm) / targetKm;
        const angle = Math.abs(((bearing(edges[0].coords[0], edges[0].coords[1]) - heading + 540) % 360) - 180);
        if (surface === "asphalt" && enforceHeading && angle > 65) continue;
        const score = error + angle / 1800;
        if (!best || score < best.score) best = {edges, km, error, score, repeated};
      } else if (!path.visited.has(edge.end)) {
        if (surface === "asphalt" && via === required.length && km >= targetKm * 0.95 && km <= targetKm * 1.05) {
          const coords = edges.flatMap((e,i) => i ? e.coords.slice(1) : e.coords);
          const repeated = proporcionRutaRepetida(coords);
          const error = Math.abs(km - targetKm) / targetKm;
          const angle = Math.abs(((bearing(edges[0].coords[0], edges[0].coords[1]) - heading + 540) % 360) - 180);
          const score = error + repeated * 0.25 + angle / 1800;
          if ((!enforceHeading || angle <= 65) && repeated <= 0.2 && distance([coords[0], coords.at(-1)]) >= 0.25
            && (!bestLinear || score < bestLinear.score)) bestLinear = {edges, km, error, repeated, score};
        }
        if (edges.length < 100 && stack.length < 1000) stack.push({origin:path.origin, node:edge.end, edges, km, visited:new Set([...path.visited,edge.end]), via});
        else truncated = true;
      }
    }
  }
  const shape = best ? "circular" : bestLinear ? "linear" : "out-and-back";
  best ||= bestLinear || bestReturn;
  if (!best) throw new Error(stack.length || truncated
    ? "Se alcanzó el límite de búsqueda en la red verificada. Prueba otra distancia o salida."
    : "No hay una ruta compatible en la red revisada. Marca otro punto en un extremo de tramo o cambia la distancia.");
  const evidence = best.edges.map(({tramo:t}) => ({id:t.id, surface:t.surface, source:t.source, reviewedBy:t.reviewedBy, checkedAt:t.checkedAt, validUntil:t.validUntil}));
  const outbound = best.edges.flatMap((e,i) => i ? e.coords.slice(1) : e.coords);
  return {coords:shape === "out-and-back" ? [...outbound, ...outbound.slice(0,-1).reverse()] : outbound, distance:best.km, routed:true,
    generation:{surface, shape, targetKm, error:best.error, repeated:best.repeated, verification:{
      checkedAt:evidence.map(t=>t.checkedAt).sort()[0], validUntil:evidence.map(t=>t.validUntil).sort()[0], evidence,
      startOffsetMeters:haversine(start,best.edges[0].coords[0])*1000,
    }, surfaces:{paved:surface === "asphalt" ? 1 : 0, unpaved:surface === "dirt" ? 1 : 0, unknown:0}}};
}

import { bearing, distanciaRecorrido, haversine, pasaPorPuntos, trazarRutaPorPuntos } from "./modelo.js";

const errorSentido = () => new Error("No se ha podido confirmar el sentido ciclista de todo el recorrido. Revisa el trazado antes de exportarlo.");

// El servicio ciclista debe poder recorrer los mismos puntos y calles en el orden del GPX.
// Si cambia de calle, rodea una prohibición o no responde, se cancela la exportación.
export async function verificarSentidoExportacion(coords) {
  if (!Array.isArray(coords) || coords.length < 2) throw errorSentido();
  const anchors = [0];
  let since = 0;
  for (let i = 1; i < coords.length; i++) {
    since += haversine(coords[i - 1], coords[i]);
    if (since >= 0.25) { anchors.push(i); since = 0; }
  }
  if (anchors.at(-1) !== coords.length - 1) anchors.push(coords.length - 1);
  if (anchors.length > 500 || !Number.isFinite(distanciaRecorrido(coords))) throw errorSentido();
  for (let from = 0; from < anchors.length - 1; from += 20) {
    const indexes = anchors.slice(from, from + 21);
    const points = indexes.map(index => coords[index]);
    const original = coords.slice(indexes[0], indexes.at(-1) + 1);
    const bearings = points.map((point, index) => [index < points.length - 1 ? bearing(point, points[index + 1]) : bearing(points[index - 1], point), 35]);
    let routed;
    try { routed = await trazarRutaPorPuntos(points, { radiuses: points.map(() => 20), bearings }); }
    catch { throw errorSentido(); }
    if (haversine(routed.coords[0], original[0]) > 0.02
      || haversine(routed.coords.at(-1), original.at(-1)) > 0.02
      || routed.distance > distanciaRecorrido(original) * 1.08 + 0.05
      || !pasaPorPuntos(original, routed.coords, 0.02)
      || !pasaPorPuntos(routed.coords, original, 0.02)) throw errorSentido();
  }
  return true;
}

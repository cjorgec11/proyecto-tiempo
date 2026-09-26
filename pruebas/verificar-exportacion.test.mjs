import test from "node:test";
import assert from "node:assert/strict";
import { verificarSentidoExportacion } from "../cliente/verificar-exportacion.js";

test("GPX: confirma el sentido ciclista y bloquea desvíos o falta de respuesta", async () => {
  const originalFetch = globalThis.fetch;
  const coords = [{ lat: 40, lon: -3 }, { lat: 40.003, lon: -3 }, { lat: 40.006, lon: -3 }];
  let geometry = coords.map(({ lat, lon }) => [lon, lat]);
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    assert.match(parsed.pathname, /\/routed-bike\/route\/v1\/cycling\//);
    assert.equal(parsed.searchParams.get("bearings").split(";").length, 3);
    assert.equal(parsed.searchParams.get("radiuses"), "20;20;20");
    return Response.json({ code: "Ok", routes: [{ distance: 667, geometry: { coordinates: geometry } }] });
  };
  try {
    assert.equal(await verificarSentidoExportacion(coords), true);
    geometry = [[-3, 40], [-2.999, 40.003], [-3, 40.006]];
    await assert.rejects(verificarSentidoExportacion(coords), /No se ha podido confirmar el sentido/);
    globalThis.fetch = async () => { throw new Error("Sin conexión"); };
    await assert.rejects(verificarSentidoExportacion(coords), /No se ha podido confirmar el sentido/);
  } finally { globalThis.fetch = originalFetch; }
});

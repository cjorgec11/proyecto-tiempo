import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { iniciarHistorialRutas, registrarRuta } from "../cliente/historial-rutas.js";
import { actualizarCuenta, iniciarCuenta, cerrarSesionCuenta } from "../cliente/cuenta.js";

test("guardado automático: visitante manual, cuenta y reintento al reconectar", async () => {
  const page = new JSDOM(await readFile(new URL("../index.html", import.meta.url), "utf8"), { url: "https://ridecast.test" });
  const original = { window: globalThis.window, document: globalThis.document, location: globalThis.location,
    CustomEvent: globalThis.CustomEvent, fetch: globalThis.fetch };
  Object.assign(globalThis, { window: page.window, document: page.window.document, location: page.window.location, CustomEvent: page.window.CustomEvent });
  const $ = id => document.getElementById(id), calls = [];
  const settle = () => new Promise(resolve => setTimeout(resolve, 15));
  let fail = true, signed = false;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/config")) return Response.json({ config: { available: true, google: false, email: false } });
    if (url.endsWith("/session")) return Response.json({ user: signed ? { id: "owner", name: "Jorge", email: "owner@gmail.com" } : null });
    if (url.endsWith("/library")) return Response.json({ entries: [], hasMore: false });
    if (url.endsWith("/logout")) { signed = false; return Response.json({ user: null }); }
    assert.equal(url, "/api/routes"); calls.push(JSON.parse(options.body));
    if (fail) throw Error("Sin conexión"); return Response.json({ saved: true });
  };
  try {
    $("departure").value = "2026-09-15T17:00"; iniciarHistorialRutas(); await iniciarCuenta();
    assert.equal($("routeHistoryConsent"), null);
    assert.doesNotMatch(document.body.textContent, /Guardar automáticamente mis nuevas rutas|El administrador podrá consultar y eliminar/);
    const coords = [{ lat: 40.4, lon: -3.7 }, { lat: 40.41, lon: -3.71 }];
    registrarRuta("planned", coords, 1.25, "Generada"); await settle(); assert.equal(calls.length, 0);
    registrarRuta("planned", coords, 1.25, "Manual", [], { manual: true }); await settle();
    assert.equal(calls.length, 1); assert.equal(calls[0].manual, true);
    signed = true; await actualizarCuenta();
    registrarRuta("planned", coords, 1.25, "Prueba"); coords[0].lat = 41; await settle();
    assert.equal(calls[1].coords[0].lat, 40.4); assert.equal(calls[1].automatic, true);
    assert.equal(calls[1].consent, undefined);
    fail = false; page.window.dispatchEvent(new page.window.Event("online")); await settle();
    assert.equal(calls[1].id, calls[2].id);
    fail = true; registrarRuta("planned", coords, 1.25, "Pendiente"); await settle();
    assert.equal(calls.length, 4);
    await cerrarSesionCuenta();
    fail = false; page.window.dispatchEvent(new page.window.Event("online"));
    registrarRuta("planned", coords, 1.25, "Generada"); await settle(); assert.equal(calls.length, 4);
  } finally { Object.assign(globalThis, original); page.window.close(); }
});

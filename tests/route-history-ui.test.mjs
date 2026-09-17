import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { initRouteHistory, recordRoute } from "../js/route-history.js";

test("guardado automático: requiere permiso, conserva instantánea y reintenta con el mismo ID", async () => {
  const page = new JSDOM(await readFile(new URL("../index.html", import.meta.url), "utf8"), { url: "https://ridecast.test" });
  const original = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  globalThis.window = page.window; globalThis.document = page.window.document; globalThis.localStorage = page.window.localStorage;
  const $ = id => document.getElementById(id), calls = [];
  const settle = () => new Promise(resolve => setTimeout(resolve, 15));
  let fail = true;
  globalThis.fetch = async (url, options) => { calls.push(JSON.parse(options.body)); if (fail) throw Error("Sin conexión"); return Response.json({ saved: true }); };
  try {
    $("departure").value = "2026-09-15T17:00"; initRouteHistory();
    const coords = [{ lat: 40.4, lon: -3.7 }, { lat: 40.41, lon: -3.71 }];
    recordRoute("planned", coords, 1.25, "Prueba"); await settle(); assert.equal(calls.length, 0);
    $("routeHistoryConsent").checked = true; $("routeHistoryConsent").dispatchEvent(new page.window.Event("change"));
    recordRoute("planned", coords, 1.25, "Prueba"); coords[0].lat = 41; await settle();
    assert.equal(calls[0].coords[0].lat, 40.4); assert.equal($("retryRouteHistory").hidden, false);
    fail = false; $("retryRouteHistory").click(); await settle();
    assert.equal(calls[0].id, calls[1].id); assert.equal($("retryRouteHistory").hidden, true);
    $("routeHistoryConsent").checked = false; $("routeHistoryConsent").dispatchEvent(new page.window.Event("change"));
    recordRoute("planned", coords, 1.25, "Otra"); await settle(); assert.equal(calls.length, 2);
  } finally { Object.assign(globalThis, original); page.window.close(); }
});

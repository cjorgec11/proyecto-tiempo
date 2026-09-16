import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { initAdminRoutes } from "../js/admin-routes.js";

test("admin: muestra trazado y datos sin ejecutar texto; confirma borrado y limpia al salir", async () => {
  const page = new JSDOM(await readFile(new URL("../admin.html", import.meta.url), "utf8"), { url: "https://ridecast.test/admin.html" });
  const original = { window: globalThis.window, document: globalThis.document, L: globalThis.L };
  globalThis.window = page.window; globalThis.document = page.window.document;
  page.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  page.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const $ = id => document.getElementById(id), settle = () => new Promise(resolve => setTimeout(resolve, 15));
  const coords = [{ lat: 40.4, lon: -3.7 }, { lat: 40.41, lon: -3.71 }];
  let fitted = 0, removed = false, confirm = false;
  page.window.confirm = () => confirm;
  globalThis.L = { map: () => ({ fitBounds: () => fitted++, remove() {} }), tileLayer: () => ({ addTo() {} }),
    polyline: points => { assert.deepEqual(points, coords.map(p => [p.lat, p.lon])); return { addTo() { return this; }, getBounds: () => points }; } };
  const route = { id: "id", name: "<img src=x onerror=alert(1)>", kind: "forecast", user_id: "test-user", distance: 1.25, created_at: Date.now(),
    payload: { coords, speed: 23, departure: new Date().toISOString(), segments: [{ km: 0, arrival: new Date().toISOString(), temperature: 20, rainChance: 10, precipitation: 0, wind: 8, gust: 12, windDirection: 90 }] } };
  try {
    const controller = initAdminRoutes(async (path, data) => {
      if (data) { assert.equal(data.action, "delete"); removed = true; return { deleted: true }; }
      return path.includes("?id=") ? route : { entries: removed ? [] : [route], hasMore: false };
    });
    $("adminRoutesRefresh").click(); await settle();
    assert.equal($("adminRoutesList").querySelector("img"), null);
    $("adminRoutesList").querySelector("button").click(); await settle();
    assert.equal(fitted, 1); assert.equal($("adminRouteDetail").open, true);
    assert.match($("adminRouteWeather").textContent, /20/);
    $("adminRoutesList").querySelectorAll("button")[1].click(); await settle(); assert.equal(removed, false);
    confirm = true; $("adminRoutesList").querySelectorAll("button")[1].click(); await settle();
    assert.equal(removed, true); assert.equal($("adminRoutesList").children.length, 0);
    controller.reset(); assert.equal($("adminRouteWeather").textContent, ""); assert.equal($("adminRouteDetail").open, false);
  } finally { Object.assign(globalThis, original); page.window.close(); }
});

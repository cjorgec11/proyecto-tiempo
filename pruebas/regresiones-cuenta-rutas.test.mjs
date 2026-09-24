import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const page = new JSDOM(await readFile(new URL("../index.html", import.meta.url), "utf8"), { url: "https://ridecast.test/#plan" });
const { window } = page;
Object.assign(globalThis, { window, document: window.document, location: window.location,
  CustomEvent: window.CustomEvent, localStorage: window.localStorage,
  requestAnimationFrame: fn => fn(), ResizeObserver: class { observe() {} } });
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };
window.confirm = () => true;
const layer = () => ({ addTo() { return this; }, clearLayers() {}, bindTooltip() { return this; }, bindPopup() { return this; }, on() {}, closeTooltip() {} });
globalThis.L = window.L = {
  map() { return { setView() { return this; }, invalidateSize() {}, fitBounds() {}, on() {} }; },
  tileLayer: layer, layerGroup: layer, polyline: layer, marker: layer, latLngBounds: points => points, divIcon: options => options,
};
const user = { id: "account-a", name: "Ana", email: "ana@example.test" };
let sessionUser = user, failure = "", pendingSave;
const saved = new Map();
globalThis.fetch = async (path, options = {}) => {
  if (path.endsWith("/config")) return Response.json({ config: { available: true, email: true } });
  if (failure && path.includes(failure)) return Response.json({ error: "Servicio temporalmente no disponible" }, { status: 503 });
  if (path.endsWith("/session")) return Response.json({ user: sessionUser });
  if (path.endsWith("/logout")) { sessionUser = null; return Response.json({}); }
  if (path.startsWith("/api/library")) {
    if (options.method === "POST") {
      const { route } = JSON.parse(options.body);
      if (pendingSave) await pendingSave;
      saved.set(route.id, route);
      return Response.json({ route });
    }
    return Response.json({ entries: [...saved.values()].map(route => ({ ...route, created_at: Date.parse(route.createdAt), preview: route.coords })), hasMore: false });
  }
  throw new Error(`Petición inesperada: ${path}`);
};
const account = await import("../cliente/cuenta.js");
const { state } = await import("../cliente/modelo.js");
const { iniciarAplicacion } = await import("../cliente/controlador.js");
const ready = account.iniciarCuenta();
iniciarAplicacion();
await ready;
after(() => page.window.close());
const $ = id => document.getElementById(id);
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
const coords = [{ lat: 40, lon: -3 }, { lat: 41, lon: -4 }];
beforeEach(async () => {
  failure = ""; sessionUser = user; pendingSave = null;
  saved.clear(); window.confirm = () => true;
  $("clearWaypoints").click();
  window.dispatchEvent(new window.Event("focus")); await settle();
});

test("un guardado tardío no asigna el identificador de la ruta anterior a una nueva", async () => {
  let release;
  pendingSave = new Promise(resolve => { release = resolve; });
  state.currentRouteCoords = coords;
  $("saveName").value = "Ruta A";
  $("saveRoute").click();
  $("newRoute").click();
  state.currentRouteCoords = [{ lat: 42, lon: -3 }, { lat: 43, lon: -4 }];
  $("saveName").value = "Ruta B";
  release(); pendingSave = null;
  await settle();
  $("saveRoute").click(); await settle();
  assert.deepEqual([...saved.values()].map(route => route.name), ["Ruta A", "Ruta B"]);
  assert.equal(account.rutasCuenta().length, 2);
  // Guardar de nuevo la misma ruta debe seguir actualizándola.
  $("saveName").value = "Ruta B actualizada";
  $("saveRoute").click(); await settle();
  assert.deepEqual([...saved.values()].map(route => route.name), ["Ruta A", "Ruta B actualizada"]);
});

test("los fallos temporales conservan cuenta, biblioteca y destino del guardado", async () => {
  state.currentRouteCoords = coords;
  $("saveName").value = "Ruta conservada";
  $("saveRoute").click(); await settle();
  const before = account.rutasCuenta();
  for (const endpoint of ["/api/library", "/api/account/session"]) {
    failure = endpoint;
    window.dispatchEvent(new window.Event("focus")); await settle();
    assert.equal(account.cuentaActual()?.id, user.id);
    assert.deepEqual(account.rutasCuenta(), before);
    assert.match($("libraryAccountStatus").textContent, /reintentar/i);
  }
  failure = "";
  $("refreshMyRoutes").click(); await settle();
  assert.equal(account.rutasCuenta().length, saved.size);
  assert.equal($("libraryAccountStatus").textContent, "Rutas de Ana");
  sessionUser = null;
  $("refreshMyRoutes").click(); await settle();
  assert.equal(account.cuentaActual(), null);
  assert.equal(state.currentRouteCoords.length, 0);
});

test("cerrar sesión limpia la ruta privada sin confirmación y también el GPX preparado", async () => {
  let confirmations = 0;
  window.confirm = () => { confirmations++; return false; };
  state.currentRouteCoords = coords;
  state.importedRoute = { name: "Ruta privada", coords };
  document.querySelector("[data-garmin]").click(); await settle();
  assert.equal($("garminModal").open, true);
  await account.cerrarSesionCuenta();
  assert.equal(confirmations, 0);
  assert.equal(state.currentRouteCoords.length, 0);
  assert.equal(state.importedRoute, null);
  assert.equal(state.currentSegments.length, 0);
  assert.equal($("garminModal").open, false);
  assert.equal($("garminRouteName").textContent, "");
  assert.equal(account.rutasCuenta(), null);
  // Una sesión caducada detectada al recuperar el foco también limpia la ruta.
  sessionUser = user;
  window.dispatchEvent(new window.Event("focus")); await settle();
  state.currentRouteCoords = coords;
  sessionUser = null;
  window.dispatchEvent(new window.Event("focus")); await settle();
  assert.equal(state.currentRouteCoords.length, 0);
  assert.equal(account.cuentaActual(), null);
  assert.equal(confirmations, 0);
});

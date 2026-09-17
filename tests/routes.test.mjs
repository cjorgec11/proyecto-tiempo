import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../server/local-db.mjs";
import { handleRoutes } from "../server/routes.mjs";
import { handleAdminAuth } from "../server/admin-auth.mjs";
import { passwordHash } from "../server/crypto.mjs";

test("historial: consentimiento, rutas completas, previsión, acceso privado y eliminación", async () => {
  const DB = openDatabase(":memory:", fileURLToPath(new URL("../drizzle", import.meta.url)));
  const env = { DB, AUTH_MODE: "sites", ADMIN_PASSWORD_HASH: await passwordHash("isolated-admin-test-123456") };
  const origin = "https://ridecast.test";
  const request = (path, data, user = "alice", cookie = "") => new Request(origin + path, { method: data ? "POST" : "GET",
    headers: { origin, "content-type": "application/json", ...(user ? { "oai-authenticated-user-id": user } : {}), cookie },
    ...(data ? { body: JSON.stringify(data) } : {}) });
  const departure = new Date().toISOString();
  const route = { id: crypto.randomUUID(), consent: true, kind: "planned", name: "Ruta de prueba", distance: 1.25, speed: 23, departure,
    coords: [{ lat: 40.4, lon: -3.7 }, { lat: 40.41, lon: -3.71 }] };
  try {
    assert.equal((await handleRoutes(request("/api/routes", route, null), env)).status, 401);
    assert.equal((await handleRoutes(request("/api/routes", { ...route, consent: false }), env)).status, 400);
    assert.equal((await handleRoutes(request("/api/routes", { ...route, coords: [{ lat: 100, lon: 0 }] }), env)).status, 400);
    assert.equal((await handleRoutes(request("/api/routes", route), env)).status, 201);
    assert.equal((await handleRoutes(request("/api/routes", route), env)).status, 200);
    assert.equal((await handleRoutes(request("/api/routes", route, "bob"), env)).status, 409);
    const forecast = { ...route, id: crypto.randomUUID(), kind: "forecast", segments: [{ ...route.coords[0], arrival: departure, km: 0, temperature: 20, rainChance: 10, precipitation: 0, code: 0, wind: 8, gust: 12, windDirection: 90 }] };
    assert.equal((await handleRoutes(request("/api/routes", forecast), env)).status, 201);
    assert.equal((await handleRoutes(request("/api/routes/admin"), env)).status, 401);
    assert.equal((await handleRoutes(request("/api/routes/admin", { action: "delete", id: route.id }), env)).status, 401);
    const login = await handleAdminAuth(request("/api/admin/login", { password: "isolated-admin-test-123456" }), env);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const list = await (await handleRoutes(request("/api/routes/admin", null, null, cookie), env)).json();
    assert.equal(list.entries.length, 2); assert.equal(list.entries[0].payload, undefined);
    const detail = await (await handleRoutes(request(`/api/routes/admin?id=${forecast.id}`, null, null, cookie), env)).json();
    assert.equal(detail.distance, 1.25); assert.deepEqual(detail.payload.coords, route.coords);
    assert.equal(detail.payload.segments[0].temperature, 20); assert.equal(detail.user_id, "alice");
    const csrf = request("/api/routes/admin", { action: "delete", id: forecast.id }, null, cookie); csrf.headers.set("origin", "https://other.test");
    assert.equal((await handleRoutes(csrf, env)).status, 403);
    assert.equal((await handleRoutes(request("/api/routes/admin", { action: "delete", id: forecast.id }, null, cookie), env)).status, 200);
    assert.equal((await handleRoutes(request(`/api/routes/admin?id=${forecast.id}`, null, null, cookie), env)).status, 404);
    assert.equal(await DB.prepare("SELECT payload FROM route_history WHERE id = ?").bind(forecast.id).first(), null);
  } finally { DB.close(); }
});

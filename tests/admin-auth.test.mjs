import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../server/local-db.mjs";
import { handleAdminAuth, isAdmin, passwordHash } from "../server/admin-auth.mjs";
import { handleFeedback } from "../server/feedback.mjs";

test("administrador: contraseña, cookies, revocación, caducidad, CSRF y límite de intentos", async () => {
  const DB = openDatabase(":memory:", fileURLToPath(new URL("../drizzle", import.meta.url)));
  const env = { DB, ADMIN_PASSWORD_HASH: await passwordHash("test-only-secret-1234567890") };
  const request = (path, data, cookie = "", origin = "https://ridecast.test") => new Request(`https://ridecast.test${path}`, {
    method: data ? "POST" : "GET", headers: { cookie, origin, "content-type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}),
  });
  try {
    assert.equal(await isAdmin(request("/"), env), false);
    const spoof = request("/api/feedback/admin"); spoof.headers.set("oai-authenticated-user-id", "owner");
    assert.equal((await handleFeedback(spoof, env)).status, 401);
    assert.equal((await handleAdminAuth(request("/api/admin/login", { password: "wrong" }), env)).status, 401);
    assert.equal((await handleAdminAuth(request("/api/admin/login", { password: "test-only-secret-1234567890" }, "", "https://evil.test"), env)).status, 403);
    const login = await handleAdminAuth(request("/api/admin/login", { password: "test-only-secret-1234567890" }), env);
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /Secure/); assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(";")[0];
    assert.equal(await isAdmin(request("/", null, cookie), env), true);
    assert.equal((await handleFeedback(request("/api/feedback/admin", null, cookie), env)).status, 200);
    assert.equal(await isAdmin(request("/", null, cookie + "x"), env), false);
    const rotated = { ...env, ADMIN_PASSWORD_HASH: await passwordHash("another-password-12345678") };
    assert.equal(await isAdmin(request("/", null, cookie), rotated), false);
    await handleAdminAuth(request("/api/admin/logout", {}, cookie), env);
    assert.equal(await isAdmin(request("/", null, cookie), env), false);
    const second = await handleAdminAuth(request("/api/admin/login", { password: "test-only-secret-1234567890" }), env);
    await DB.prepare("UPDATE admin_sessions SET expires = 0").run();
    assert.equal(await isAdmin(request("/", null, second.headers.get("set-cookie").split(";")[0]), env), false);
    for (let i = 0; i < 7; i++) await handleAdminAuth(request("/api/admin/login", { password: "wrong" }), env);
    assert.equal((await handleAdminAuth(request("/api/admin/login", { password: "test-only-secret-1234567890" }), env)).status, 429);
  } finally { DB.close(); }
});

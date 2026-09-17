import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../server/local-db.mjs";
import { account, handleAccount } from "../server/accounts.mjs";
import { digest } from "../server/crypto.mjs";
import { handleLibrary } from "../server/library.mjs";
import { handleRoutes } from "../server/routes.mjs";
import { handleFeedback } from "../server/feedback.mjs";
import { isAdmin } from "../server/admin-auth.mjs";

test("cuentas D1: registro, verificacion, aislamiento, permisos, reset y revocacion", async () => {
  const DB = openDatabase(":memory:", fileURLToPath(new URL("../drizzle", import.meta.url)));
  const env = { DB, AUTH_MODE: "disabled", ADMIN_EMAIL: "jorgecalvocaminero@gmail.com", AUTH_MAIL_API_KEY: "test-only", AUTH_MAIL_FROM: "RideCast <test@example.test>" };
  const originalFetch = globalThis.fetch, messages = [];
  globalThis.fetch = async (url, options) => { assert.equal(url, "https://api.resend.com/emails"); messages.push(JSON.parse(options.body)); return Response.json({ id: "sent" }); };
  const request = (path, data, cookie = "") => new Request("https://ridecast.test" + path, {
    method: data ? "POST" : "GET", headers: { origin: "https://ridecast.test", "content-type": "application/json", cookie }, ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const token = () => messages.at(-1).text.match(/#account-(?:verify|reset)=([a-f0-9]{64})/)[1];
  async function register(email, name) {
    const data = { email, name, password: "test-password-123" };
    assert.equal((await handleAccount(request("/api/account/register", data), env)).status, 200);
    const row = await DB.prepare("SELECT * FROM app_users WHERE email = ?").bind(email).first();
    assert.notEqual(row.password, data.password); assert.equal(row.verified, 0);
    assert.equal((await handleAccount(request("/api/account/login", data), env)).status, 401);
    const link = token();
    assert.equal((await handleAccount(request("/api/account/verify", { token: link, password: data.password }), env)).status, 200);
    assert.equal((await handleAccount(request("/api/account/verify", { token: link, password: data.password }), env)).status, 400);
    const login = await handleAccount(request("/api/account/login", data), env); assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/); assert.match(login.headers.get("set-cookie"), /Secure/);
    return { row, cookie: login.headers.get("set-cookie").split(";")[0], data };
  }
  try {
    const alice = await register("alice@gmail.com", "Alice"), bob = await register("bob@gmail.com", "Bob"), owner = await register(env.ADMIN_EMAIL, "Jorge");
    assert.equal(await isAdmin(request("/", null, alice.cookie), env), false);
    assert.equal(await isAdmin(request("/", null, owner.cookie), env), true);
    const forged = request("/"); forged.headers.set("oai-authenticated-user-id", owner.row.id); assert.equal(await account(forged, env), null);
    const route = { id: crypto.randomUUID(), name: "Mi ruta", coords: [{ lat: 40, lon: -3 }, { lat: 40.1, lon: -3.1 }] };
    assert.equal((await handleLibrary(request("/api/library", { action: "save", route }), env)).status, 401);
    assert.equal((await handleLibrary(request("/api/library", { action: "save", route, user: bob.row.id }, alice.cookie), env)).status, 200);
    const list = await (await handleLibrary(request("/api/library", null, alice.cookie), env)).json(); assert.equal(list.entries.length, 1); assert.deepEqual(list.entries[0].preview, route.coords);
    assert.equal((await (await handleLibrary(request("/api/library", null, bob.cookie), env)).json()).entries.length, 0);
    assert.equal((await handleLibrary(request(`/api/library?id=${route.id}&user=${alice.row.id}`, null, bob.cookie), env)).status, 404);
    await handleLibrary(request("/api/library", { action: "delete", id: route.id, user: alice.row.id }, bob.cookie), env);
    assert.equal((await handleLibrary(request(`/api/library?id=${route.id}`, null, alice.cookie), env)).status, 200);
    assert.equal((await handleLibrary(request("/api/library/admin", null, alice.cookie), env)).status, 401);
    assert.equal((await handleLibrary(request("/api/library/admin", { action: "save", user: alice.row.id, route: { ...route, name: "Corregida" } }, owner.cookie), env)).status, 200);
    const csrf = request("/api/account/login", alice.data); csrf.headers.set("origin", "https://evil.test"); assert.equal((await handleAccount(csrf, env)).status, 403);
    const suggestion = { id: crypto.randomUUID(), category: "routes", text: "Idea", public: true };
    await handleFeedback(request("/api/feedback", suggestion, alice.cookie), env);
    assert.equal((await (await handleFeedback(request("/api/feedback", null, bob.cookie), env)).json()).entries.length, 0);
    assert.equal((await handleFeedback(request("/api/feedback/admin", { action: "edit", id: suggestion.id, message: "Revisada", category: "routes" }, owner.cookie), env)).status, 200);
    assert.equal((await handleFeedback(request("/api/feedback/admin", { action: "delete", id: suggestion.id }, owner.cookie), env)).status, 200);
    const history = { ...route, consent: true, kind: "planned", distance: 1, speed: 20, departure: new Date().toISOString() };
    assert.equal((await handleRoutes(request("/api/routes", history, alice.cookie), env)).status, 201);
    assert.equal((await handleRoutes(request("/api/routes/admin", { action: "update", id: route.id, route: { ...history, name: "Historial editado" } }, owner.cookie), env)).status, 200);
    assert.equal((await handleAccount(request("/api/account/recover", { email: alice.data.email }), env)).status, 200);
    assert.equal((await handleAccount(request("/api/account/reset", { token: token(), password: "new-test-password-123" }), env)).status, 200);
    assert.equal(await account(request("/", null, alice.cookie), env), null);
    await handleAccount(request("/api/account/logout", {}, owner.cookie), env);
    assert.equal(await isAdmin(request("/", null, owner.cookie), env), false);
    await DB.prepare("UPDATE user_sessions SET expires = 0").run(); assert.equal(await account(request("/", null, bob.cookie), env), null);
  } finally { globalThis.fetch = originalFetch; DB.close(); }
});

test("Google: state ligado al navegador, PKCE, correo verificado y sin apropiacion por prerregistro", async () => {
  const DB = openDatabase(":memory:", fileURLToPath(new URL("../drizzle", import.meta.url)));
  const env = { DB, AUTH_MODE: "disabled", GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret", ADMIN_EMAIL: "jorgecalvocaminero@gmail.com" };
  const req = (path, data, cookie = "") => new Request("https://ridecast.test" + path, { method: data ? "POST" : "GET", headers: { origin: "https://ridecast.test", "content-type": "application/json", cookie }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const original = globalThis.fetch;
  try {
    const id = crypto.randomUUID(); await DB.prepare("INSERT INTO app_users (id,email,name,last_seen,password) VALUES (?,?,?,0,?)").bind(id, env.ADMIN_EMAIL, "Jorge", "attacker-password-hash").run();
    const start = await handleAccount(req("/api/account/google", {}), env), body = await start.json();
    const url = new URL(body.url), state = url.searchParams.get("state"), cookie = start.headers.get("set-cookie").split(";")[0];
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal((await handleAccount(req(`/api/account/google/callback?state=${state}&code=test`), env)).status, 400);
    globalThis.fetch = async (url, options) => {
      if (url === "https://oauth2.googleapis.com/token") { assert.equal(options.body.get("client_secret"), "test-secret"); assert.equal(options.body.get("code_verifier").length, 64); return Response.json({ access_token: "verified-code-exchange" }); }
      assert.equal(url, "https://openidconnect.googleapis.com/v1/userinfo"); return Response.json({ sub: "google-sub", email: env.ADMIN_EMAIL, email_verified: true, name: "Jorge" });
    };
    const result = await handleAccount(req(`/api/account/google/callback?state=${state}&code=test`, null, cookie), env);
    assert.equal(result.status, 303); const session = result.headers.get("set-cookie").split(";")[0];
    assert.equal((await account(req("/", null, session), env)).admin, true);
    assert.equal((await DB.prepare("SELECT password FROM app_users WHERE id = ?").bind(id).first()).password, null);
    assert.equal(await DB.prepare("SELECT * FROM account_tokens WHERE token_hash = ?").bind(await digest(state)).first(), null);
    assert.equal((await handleAccount(req(`/api/account/google/callback?state=${state}&code=test`, null, cookie), env)).status, 400);
  } finally { globalThis.fetch = original; DB.close(); }
});

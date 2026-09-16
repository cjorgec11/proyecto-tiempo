import test, { after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/local-db.mjs";
import { handleFeedback } from "../server/feedback.mjs";
import { handleAdminAuth, passwordHash } from "../server/admin-auth.mjs";

const DB = openDatabase(":memory:", fileURLToPath(new URL("../drizzle", import.meta.url)));
const env = { DB, ADMIN_PASSWORD_HASH: await passwordHash("test-only-random-password-123") };
const login = await handleAdminAuth(new Request("https://ridecast.test/api/admin/login", { method: "POST", headers: { origin: "https://ridecast.test", "content-type": "application/json" }, body: JSON.stringify({ password: "test-only-random-password-123" }) }), env);
const adminCookie = login.headers.get("set-cookie").split(";")[0];
after(() => DB.close());
const request = (path, user = "alice", data, origin = "https://ridecast.test") => new Request(`https://ridecast.test/api/feedback${path}`, {
  method: data ? "POST" : "GET", headers: { ...(user ? { "oai-authenticated-user-id": user } : {}), ...(user === "owner" ? { cookie: adminCookie } : {}),
    ...(data ? { origin, "Content-Type": "application/json" } : {}) },
  ...(data ? { body: JSON.stringify(data) } : {}),
});
const suggestion = (text = "Mejorar el mapa") => ({ id: crypto.randomUUID(), category: "interface", text });

test("buzón: autenticación, autorización y origen se comprueban en servidor", async () => {
  assert.equal((await handleFeedback(request("", null), env)).status, 401);
  assert.equal((await handleFeedback(request("/admin"), env)).status, 401);
  assert.equal((await handleFeedback(request("", "alice", suggestion(), "https://other.test"), env)).status, 403);
  assert.equal((await handleFeedback(request("", "alice", suggestion()), {})).status, 503);
  assert.equal((await (await handleFeedback(request("/session", "owner"), env)).json()).admin, undefined);
  assert.equal((await (await handleFeedback(request("/session", "alice"), env)).json()).admin, undefined);
});

test("buzón: envío durable, privacidad entre usuarios e idempotencia", async () => {
  const data = suggestion("<script>texto sin ejecutar</script>");
  assert.equal((await handleFeedback(request("", "alice", data), env)).status, 201);
  assert.equal((await handleFeedback(request("", "alice", data), env)).status, 200);
  const own = await (await handleFeedback(request("", "alice"), env)).json();
  assert.equal(own.entries.length, 1);
  assert.equal(own.entries[0].message, data.text);
  assert.equal(own.entries[0].user_id, undefined);
  const other = await (await handleFeedback(request("", "bob"), env)).json();
  assert.equal(other.entries.length, 0);
  assert.equal((await handleFeedback(request("", "bob", data), env)).status, 409);
  assert.equal((await handleFeedback(request("/admin", "alice", { id: data.id, status: "resolved" }), env)).status, 401);
  assert.equal((await handleFeedback(request("/admin", "owner", { id: data.id, status: "resolved" }), env)).status, 200);
  assert.equal((await (await handleFeedback(request("", "alice"), env)).json()).entries[0].status, "resolved");
});

test("buzón: validación y límite de envíos por cuenta", async () => {
  for (const text of ["", "  ", "x".repeat(2001)]) assert.equal((await handleFeedback(request("", "limits", suggestion(text)), env)).status, 400);
  for (let i = 0; i < 10; i++) assert.equal((await handleFeedback(request("", "limits", suggestion()), env)).status, 201);
  assert.equal((await handleFeedback(request("", "limits", suggestion()), env)).status, 429);
});

test("buzón: no realiza envíos de correo ni peticiones externas", async () => {
  const original = globalThis.fetch;
  const data = suggestion();
  try {
    let sends = 0;
    globalThis.fetch = async () => { sends++; throw new Error("Unexpected outbound request"); };
    assert.equal((await handleFeedback(request("", "mail", data), env)).status, 201);
    assert.equal((await handleFeedback(request("/admin", "owner", { id: data.id, action: "notify" }), env)).status, 400);
    assert.equal(sends, 0);
  } finally { globalThis.fetch = original; }
});

test("comunidad: lectura pública sin identidades y votos únicos, reversibles y autenticados", async () => {
  const data = { ...suggestion("Una idea pública"), public: true };
  assert.equal((await handleFeedback(request("", "public-author", data), env)).status, 201);
  const board = await (await handleFeedback(request("/community", null), env)).json();
  assert.equal(board.entries.length, 1);
  assert.equal(board.entries[0].message, data.text);
  assert.equal(board.entries[0].user_id, undefined);
  assert.equal(board.entries[0].notification, undefined);
  assert.equal((await handleFeedback(request("/vote", null, { id: data.id, voted: true }), env)).status, 401);
  assert.equal((await handleFeedback(request("/vote", "bob", { id: data.id, voted: true }, "https://evil.test"), env)).status, 403);
  for (let i = 0; i < 2; i++) {
    const vote = await (await handleFeedback(request("/vote", "bob", { id: data.id, voted: true }), env)).json();
    assert.equal(vote.votes, 1); assert.equal(vote.voted, 1);
  }
  const second = await (await handleFeedback(request("/vote", "carol", { id: data.id, voted: true }), env)).json();
  assert.equal(second.votes, 2);
  const publicView = await (await handleFeedback(request("/community", null), env)).json();
  assert.equal(publicView.entries[0].votes, 2); assert.equal(publicView.entries[0].voted, 0);
  for (let i = 0; i < 2; i++) {
    const removed = await (await handleFeedback(request("/vote", "bob", { id: data.id, voted: false }), env)).json();
    assert.equal(removed.votes, 1); assert.equal(removed.voted, 0);
  }
  const privateData = suggestion();
  await handleFeedback(request("", "private-author", privateData), env);
  assert.equal((await handleFeedback(request("/vote", "bob", { id: privateData.id, voted: true }), env)).status, 404);
});

test("buzón: conserva envíos al reabrir la base de datos", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ridecast-feedback-test-"));
  const file = join(directory, "feedback.sqlite");
  const migrations = fileURLToPath(new URL("../drizzle", import.meta.url));
  let database = openDatabase(file, migrations);
  try {
    const data = suggestion("Persistencia verificada");
    assert.equal((await handleFeedback(request("", "persist", data), { DB: database })).status, 201);
    database.close(); database = openDatabase(file, migrations);
    const response = await (await handleFeedback(request("", "persist"), { DB: database })).json();
    assert.equal(response.entries[0].id, data.id);
  } finally { database.close(); rmSync(file); rmdirSync(directory); }
});

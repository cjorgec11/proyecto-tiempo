import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import worker from "../server/worker.mjs";
import { openDatabase } from "../server/local-db.mjs";
import { passwordHash } from "../server/admin-auth.mjs";
import { nodeConfiguration } from "../server/security.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const password = "standalone-test-only-password";
const origin = "https://ridecast.example";

test("standalone: production configuration fails closed", () => {
  assert.throws(() => nodeConfiguration({ NODE_ENV: "production" }), /PUBLIC_ORIGIN/);
  assert.throws(() => nodeConfiguration({ NODE_ENV: "production", LOCAL_PREVIEW_AUTH: "true" }), /forbidden/);
  assert.throws(() => nodeConfiguration({ AUTH_MODE: "sites" }), /not trusted/);
  for (const value of ["http://example.com", "https://example.com/", "https://a:b@example.com", "https://example.com/path"]) {
    assert.throws(() => nodeConfiguration({ PUBLIC_ORIGIN: value }));
  }
  assert.equal(nodeConfiguration({}).preview, false);
  assert.equal(nodeConfiguration({ LOCAL_PREVIEW_AUTH: "true" }).preview, true);
  assert.equal(nodeConfiguration({ LOCAL_PREVIEW_AUTH: "true", PUBLIC_ORIGIN: origin }).preview, false);
});

test("Worker: untrusted identities and rotating IP headers cannot bypass protection", async () => {
  const DB = openDatabase(":memory:", join(root, "drizzle"));
  const env = { DB, ADMIN_PASSWORD_HASH: await passwordHash(password), PREVIEW_USER_ID: "victim" };
  const req = (path, ip = "192.0.2.1", data) => new Request(origin + path, {
    method: data ? "POST" : "GET", headers: { origin, "content-type": "application/json", "oai-authenticated-user-id": "victim", "cf-connecting-ip": ip },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  try {
    await DB.prepare("INSERT INTO feedback (id,user_id,category,message,created_at,public) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), "victim", "other", "private fixture", Date.now(), 0).run();
    assert.equal((await worker.fetch(req("/api/feedback"), env)).status, 401);
    assert.equal((await worker.fetch(req("/api/routes", "192.0.2.1", {}), env)).status, 401);
    assert.equal((await worker.fetch(req("/api/routes/admin"), env)).status, 401);
    const enabled = await worker.fetch(req("/api/feedback"), { ...env, AUTH_MODE: "sites" });
    assert.equal((await enabled.json()).entries[0].message, "private fixture");
    for (let i = 0; i < 10; i++) assert.equal((await worker.fetch(req("/api/admin/login", `192.0.2.${i + 1}`, { password: "wrong" }), env)).status, 401);
    assert.equal((await worker.fetch(req("/api/admin/login", "192.0.2.100", { password }), env)).status, 429);
  } finally { DB.close(); }
});

test("Node behind TLS proxy: isolation, Secure cookie, CSRF, host and file protection", async t => {
  const directory = mkdtempSync(join(tmpdir(), "ridecast-security-"));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) { const done = once(child, "exit"); child.kill(); await done; }
    const target = resolve(directory), within = relative(resolve(tmpdir()), target);
    if (!within || within.startsWith("..") || isAbsolute(within) || !within.startsWith("ridecast-security-")) throw new Error("Unsafe cleanup path");
    rmSync(target, { recursive: true, force: true });
  });
  cpSync(join(root, "drizzle"), join(directory, "drizzle"), { recursive: true });
  mkdirSync(join(directory, ".data"));
  writeFileSync(join(directory, ".data/admin.env"), `ADMIN_PASSWORD_HASH='${await passwordHash(password)}'\n`);
  writeFileSync(join(directory, "index.html"), "<!doctype html><title>test fixture</title>");
  mkdirSync(join(directory, "js"));
  symlinkSync(join(directory, ".data"), join(directory, "js", "private-link"), "junction");
  child = spawn(process.execPath, [join(root, "server.mjs")], {
    cwd: directory, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: "0", NODE_ENV: "production", PUBLIC_ORIGIN: origin, AUTH_MODE: "disabled", LOCAL_PREVIEW_AUTH: "false" },
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Startup timed out")), 10000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("Startup failed")); });
    child.stdout.on("data", data => { const match = String(data).match(/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  const base = `http://127.0.0.1:${port}`;
  const req = (path, { data, host = "ridecast.example", from = origin, cookie = "" } = {}) => new Promise((resolve, reject) => {
    const outgoing = httpRequest(base + path, {
    method: data ? "POST" : "GET", headers: { host, origin: from, cookie, "content-type": "application/json",
      "oai-authenticated-user-id": "local-preview-owner", "cf-connecting-ip": "1.2.3.4", "x-forwarded-proto": "http" },
    }, incoming => {
      const chunks = [];
      incoming.on("data", chunk => chunks.push(chunk));
      incoming.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode,
        headers: Object.fromEntries(Object.entries(incoming.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value])) })));
    });
    outgoing.on("error", reject);
    outgoing.end(data ? JSON.stringify(data) : undefined);
  });
  const home = await req("/"); assert.equal(home.status, 200);
  assert.match(home.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(home.headers.get("strict-transport-security"), /max-age/);
  assert.equal((await req("/api/feedback")).status, 401);
  assert.equal((await (await req("/api/feedback/session")).json()).signedIn, false);
  assert.equal((await req("/", { host: "evil.example" })).status, 403);
  assert.equal((await req("/api/admin/login", { from: "https://evil.example", data: { password } })).status, 403);
  const login = await req("/api/admin/login", { data: { password } }); assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /; Secure/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  assert.equal((await req("/api/routes/admin", { cookie: cookie.split(";")[0] })).status, 200);
  assert.equal((await req("/api/routes/admin")).status, 401);
  for (const path of ["/.env", "/.data/admin.env", "/.data/feedback.sqlite", "/.git/config", "/server/admin-auth.mjs", "/.site-release.tar.gz", "/js/%2e%2e%5c.data/admin.env", "/js/private-link/admin.env"]) {
    assert.equal((await req(path)).status, 404, path);
  }
});

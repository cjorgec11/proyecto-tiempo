import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { resetBuildDirectory } from "../scripts/assets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
test("limpieza: rechaza datos, fuentes y repositorios de publicacion", async () => {
  for (const name of [".data", ".git", ".site-release", "server", "..", "dist/../.data"]) {
    await assert.rejects(resetBuildDirectory(name), /Unexpected build directory/);
  }
});
test("build: separa cliente, Worker y migraciones sin duplicados ni archivos privados", async () => {
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: root });
  const output = join(root, "dist");
  assert.deepEqual(readdirSync(output).sort(), [".openai", "client", "server"]);
  assert.ok(existsSync(join(output, "client/admin.html")));
  assert.ok(existsSync(join(output, "client/js/account.js")));
  assert.ok(existsSync(join(output, ".openai/drizzle/meta/_journal.json")));
  assert.equal(existsSync(join(output, "server/local-db.mjs")), false);
  for (const name of [".data", ".env", ".git", "server", "tests"]) assert.equal(existsSync(join(output, "client", name)), false);
  const { default: worker } = await import(new URL("../dist/server/index.js", import.meta.url));
  const response = await worker.fetch(new Request("https://test.local/api/account/config"), {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).config.available, false);
  const manifest = JSON.parse(readFileSync(join(output, ".openai/hosting.json"), "utf8"));
  assert.equal(manifest.d1, "DB");
});

test("build móvil: solo recursos públicos y bibliotecas disponibles", () => {
  execFileSync(process.execPath, ["scripts/build-mobile.mjs"], { cwd: root });
  const output = join(root, "www");
  assert.ok(existsSync(join(output, "index.html")));
  assert.ok(existsSync(join(output, "vendor/leaflet/leaflet.js")));
  for (const name of ["server", ".data", ".env", "drizzle"]) assert.equal(existsSync(join(output, name)), false);
});

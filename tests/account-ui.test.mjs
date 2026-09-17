import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

test("cuenta propia: registro, login, rutas de la cuenta y limpieza al salir", async () => {
  const page = new JSDOM(await readFile(new URL("../index.html", import.meta.url), "utf8"), { url: "https://ridecast.test/#account-verify=" + "a".repeat(64) });
  const original = Object.fromEntries(["window", "document", "location", "CustomEvent", "fetch"].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: page.window, document: page.window.document, location: page.window.location, CustomEvent: page.window.CustomEvent });
  page.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  page.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new page.window.Event("close")); };
  const user = { id: crypto.randomUUID(), name: "Jorge", email: "jorgecalvocaminero@gmail.com", admin: true };
  let signed = false, registration;
  globalThis.fetch = async (path, options) => {
    assert.equal(options.credentials, "same-origin"); assert.equal(options.headers.has("Authorization"), false);
    if (path.endsWith("/config")) return Response.json({ config: { available: true, google: false, email: true } });
    if (path.endsWith("/session")) return Response.json({ user: signed ? user : null });
    if (path.endsWith("/register")) { registration = JSON.parse(options.body); return Response.json({ message: "Confirma tu correo" }); }
    if (path.endsWith("/login")) { signed = true; return Response.json({ user }); }
    if (path.endsWith("/logout")) { signed = false; return Response.json({ user: null }); }
    return Response.json({ entries: [{ id: "route", name: "Privada", distance: 2, created_at: Date.now(), preview: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] }], hasMore: false });
  };
  const $ = id => document.getElementById(id), settle = () => new Promise(resolve => setTimeout(resolve, 20));
  try {
    const auth = await import("../js/account.js?ui-test"); await auth.initAccount();
    assert.equal(auth.currentAccount(), null);
    assert.equal(location.hash, "#plan"); assert.equal($("accountDialog").open, true);
    assert.equal($("accountEmailField").hidden, true); assert.equal($("accountTitle").textContent, "Nueva contraseña");
    assert.equal($("accountGoogle").disabled, true);
    document.querySelector('[data-account-mode="register"]').click();
    $("accountName").value = "Jorge"; $("accountEmail").value = user.email; $("accountPassword").value = "password-test-123";
    $("accountForm").dispatchEvent(new page.window.Event("submit", { cancelable: true })); await settle();
    assert.equal(registration.name, "Jorge"); assert.equal(registration.role, undefined); assert.match($("accountStatus").textContent, /correo/);
    document.querySelector('[data-account-mode="login"]').click(); $("accountPassword").value = "password-test-123";
    $("accountForm").dispatchEvent(new page.window.Event("submit", { cancelable: true })); await settle();
    assert.equal(auth.currentAccount().id, user.id); assert.equal(auth.accountRoutes()[0].name, "Privada"); assert.equal($("accountAdmin").hidden, false);
    assert.equal($("accountDialog").open, false);
    await auth.signOutAccount(); assert.equal(auth.currentAccount(), null); assert.equal(auth.accountRoutes(), null); assert.equal($("accountAdmin").hidden, true);
  } finally { Object.assign(globalThis, original); page.window.close(); }
});

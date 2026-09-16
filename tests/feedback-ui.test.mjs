import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { initFeedback } from "../js/feedback.js";

test("formulario: reintenta sin duplicar, conserva borrador y oculta datos al cerrar sesión", async () => {
  const page = new JSDOM(await readFile(new URL("../index.html", import.meta.url), "utf8"), { url: "https://ridecast.test/#updates" });
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  globalThis.window = page.window; globalThis.document = page.window.document;
  const $ = id => document.getElementById(id);
  const settle = () => new Promise(resolve => setTimeout(resolve, 15));
  let signedIn = true, failed = true;
  const sent = [], entries = [];
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/session")) return Response.json({ signedIn, admin: signedIn, available: true, emailConfigured: false });
    if (url.endsWith("/vote")) { const data = JSON.parse(options.body); return Response.json({ voted: Number(data.voted), votes: Number(data.voted) }); }
    if (options.method === "POST") {
      const data = JSON.parse(options.body); sent.push(data);
      if (failed) { failed = false; throw new Error("Sin conexión"); }
      entries.push({ id: data.id, category: data.category, message: data.text, created_at: Date.now(), status: "new" });
      return Response.json({ saved: true });
    }
    return Response.json({ entries, hasMore: false });
  };
  try {
    initFeedback(); await settle();
    assert.equal($("sendSuggestion").disabled, false);
    $("suggestionText").value = "<img src=x onerror=alert(1)>";
    $("sendSuggestion").click(); await settle();
    assert.match($("feedbackStatus").textContent, /Sin conexión/);
    assert.equal($("suggestionText").value, sent[0].text);
    $("sendSuggestion").click(); await settle();
    assert.equal(sent[0].id, sent[1].id);
    assert.equal($("suggestionText").value, "");
    assert.equal($("sentFeedback").querySelector("img"), null);
    assert.match($("sentFeedback").textContent, /onerror/);
    assert.equal(sent[1].public, true);
    const vote = $("communityEntries").querySelector("button");
    vote.click(); await settle();
    assert.equal(vote.getAttribute("aria-pressed"), "true");
    assert.match(vote.textContent, /Te interesa · 1/);
    vote.click(); await settle();
    assert.equal(vote.getAttribute("aria-pressed"), "false");
    signedIn = false;
    $("refreshFeedback").click(); await settle();
    assert.equal($("sendSuggestion").disabled, true);
    assert.equal($("feedbackInbox"), null);
    assert.equal($("sentFeedback").textContent, "");
    $("communityEntries").querySelector("button").click(); await settle();
    assert.match($("communityStatus").textContent, /Inicia sesión/);
  } finally { Object.assign(globalThis, original); page.window.close(); }
});

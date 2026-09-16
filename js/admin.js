import { initAdminRoutes } from "./admin-routes.js";
const $ = id => document.getElementById(id);
const states = { new: "Nueva", reviewed: "Revisada", resolved: "Resuelta" };
const categories = { routes: "Rutas", weather: "Previsión", interface: "Interfaz", other: "Otra idea" };
let page = 0, busy = false, generation = 0;
function locked() { generation++; $("adminPanel").hidden = true; $("adminLogin").hidden = false; $("adminEntries").replaceChildren(); routeAdmin.reset(); }
async function api(path, data) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000),
    ...(data ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}) });
  if (response.status === 401) locked();
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "No se pudo completar la operación.");
  return result;
}
async function load(more = false) {
  if (busy) return;
  busy = true; const current = generation; $("adminMore").disabled = true;
  try {
    const next = more ? page + 1 : 0;
    const result = await api(`/api/feedback/admin?page=${next}`);
    if (current !== generation) return;
    if (!more) $("adminEntries").replaceChildren();
    for (const entry of result.entries) {
      const article = document.createElement("article"); article.className = "suggestion-item";
      const heading = document.createElement("h3"); heading.textContent = categories[entry.category];
      const info = document.createElement("p"); info.className = "muted";
      info.textContent = `${new Date(entry.created_at).toLocaleString("es-ES")} · ${entry.public ? "Comunidad" : "Privada"} · ${entry.votes} votos`;
      const text = document.createElement("p"); text.textContent = entry.message;
      const label = document.createElement("label"); label.textContent = "Estado";
      const select = document.createElement("select");
      for (const [value, name] of Object.entries(states)) { const option = document.createElement("option"); option.value = value; option.textContent = name; select.append(option); }
      select.value = entry.status; label.append(select);
      select.addEventListener("change", async () => {
        select.disabled = true;
        try { await api("/api/feedback/admin", { id: entry.id, status: select.value }); entry.status = select.value; $("adminStatus").textContent = "Estado actualizado."; }
        catch (error) { select.value = entry.status; $("adminStatus").textContent = error.message; }
        finally { select.disabled = false; }
      });
      article.append(heading, info, text, label); $("adminEntries").append(article);
    }
    page = next; $("adminMore").hidden = !result.hasMore;
    $("adminStatus").textContent = result.entries.length || more ? "" : "No hay sugerencias.";
  } catch (error) { $("adminStatus").textContent = error.message; }
  finally { busy = false; $("adminMore").disabled = false; }
}
$("adminLogin").addEventListener("submit", async event => {
  event.preventDefault(); const button = event.submitter || $("adminLogin").querySelector("button"); button.disabled = true;
  try {
    await api("/api/admin/login", { password: $("adminPassword").value });
    $("adminPassword").value = ""; $("adminLogin").hidden = true; $("adminPanel").hidden = false; await load();
  } catch (error) { $("adminStatus").textContent = error.message; }
  finally { button.disabled = false; }
});
$("adminLogout").addEventListener("click", async () => {
  try { await api("/api/admin/logout", {}); locked(); $("adminStatus").textContent = "Sesión cerrada."; }
  catch (error) { $("adminStatus").textContent = error.message; }
});
$("adminRefresh").addEventListener("click", () => load());
$("adminMore").addEventListener("click", () => load(true));
window.addEventListener("pageshow", async () => {
  try {
    const session = await api("/api/admin/session");
    if (session.authenticated) { $("adminLogin").hidden = true; $("adminPanel").hidden = false; await load(); }
    else { locked(); if (!session.configured) $("adminStatus").textContent = "La contraseña aún no está configurada."; }
  } catch (error) { locked(); $("adminStatus").textContent = error.message; }
});
window.lucide?.createIcons();
const routeAdmin = initAdminRoutes(api);

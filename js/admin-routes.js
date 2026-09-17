import { editRecord } from "./admin-editor.js";
export function initAdminRoutes(api) {
  const $ = id => document.getElementById(id);
  let page = 0, busy = false, version = 0, detailVersion = 0, map;
  const notice = message => { $("adminRoutesStatus").textContent = message; };
  function clearMap() { if (map) { map.remove(); map = null; } }
  function reset() {
    version++; detailVersion++; $("adminRoutesList").replaceChildren();
    $("adminRouteDetail").close(); clearMap(); $("adminRouteWeather").replaceChildren();
    $("adminRouteMeta").textContent = ""; $("adminRouteTitle").textContent = "Ruta";
  }
  async function detail(id) {
    const current = ++detailVersion;
    try {
      const route = await api(`/api/routes/admin?id=${encodeURIComponent(id)}`);
      if (current !== detailVersion) return;
      $("adminRouteTitle").textContent = route.name;
      $("adminRouteMeta").textContent = `${route.distance.toFixed(1)} km · ${route.payload.speed} km/h · Salida: ${new Date(route.payload.departure).toLocaleString("es-ES")} · Usuario: ${route.user_id} · ${route.payload.coords.length} puntos`;
      $("adminRouteDetail").showModal(); clearMap();
      map = L.map("adminRouteMap");
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
      const line = L.polyline(route.payload.coords.map(p => [p.lat, p.lon]), { color: "#2463dc" }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [20, 20], maxZoom: 16 });
      $("adminRouteWeather").replaceChildren();
      if (route.payload.segments.length) {
        const table = document.createElement("table"), head = table.createTHead().insertRow();
        for (const title of ["Km", "Hora", "°C", "Lluvia %", "mm", "Viento km/h", "Rachas", "Dirección °"]) { const th = document.createElement("th"); th.textContent = title; head.append(th); }
        const body = table.createTBody();
        for (const segment of route.payload.segments) {
          const row = body.insertRow();
          for (const value of [segment.km.toFixed(1), new Date(segment.arrival).toLocaleTimeString("es-ES"), segment.temperature, segment.rainChance, segment.precipitation, segment.wind, segment.gust, segment.windDirection]) row.insertCell().textContent = value;
        }
        $("adminRouteWeather").append(table);
      }
    } catch (error) { notice(error.message); }
  }
  async function load(more = false) {
    if (busy) return;
    busy = true; const current = version; $("adminRoutesMore").disabled = true;
    try {
      const next = more ? page + 1 : 0;
      const result = await api(`/api/routes/admin?page=${next}`);
      if (current !== version) return;
      if (!more) $("adminRoutesList").replaceChildren();
      for (const route of result.entries) {
        const article = document.createElement("article"); article.className = "suggestion-item";
        const heading = document.createElement("h3"); heading.textContent = route.name;
        const meta = document.createElement("p"); meta.className = "muted";
        meta.textContent = `${route.kind === "forecast" ? "Previsión" : "Planificada"} · ${route.distance.toFixed(1)} km · ${new Date(route.created_at).toLocaleString("es-ES")} · Usuario: ${route.user_id}`;
        const actions = document.createElement("div"); actions.className = "inline-actions";
        const view = document.createElement("button"); view.type = "button"; view.className = "secondary-button"; view.textContent = "Ver datos y mapa";
        view.addEventListener("click", () => detail(route.id));
        const edit = document.createElement("button"); edit.type = "button"; edit.className = "secondary-button"; edit.textContent = "Editar datos";
        edit.addEventListener("click", async () => {
          try {
            const row = await api(`/api/routes/admin?id=${encodeURIComponent(route.id)}`);
            if (current !== version) return;
            editRecord({ id: row.id, name: row.name, distance: row.distance, ...row.payload }, async updated => {
              await api("/api/routes/admin", { action: "update", id: row.id, route: updated }); await load();
            });
          } catch (error) { notice(error.message); }
        });
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "icon-button danger-button"; remove.title = "Eliminar registro"; remove.setAttribute("aria-label", `Eliminar ${route.name}`);
        const icon = document.createElement("i"); icon.dataset.lucide = "trash-2"; remove.append(icon);
        remove.addEventListener("click", async () => {
          if (!window.confirm(`¿Eliminar definitivamente “${route.name}” del historial del servidor? Esta acción no se puede deshacer.`)) return;
          remove.disabled = true;
          try { await api("/api/routes/admin", { action: "delete", id: route.id }); detailVersion++; $("adminRouteDetail").close(); await load(); notice("Registro eliminado del servidor."); }
          catch (error) { notice(error.message); remove.disabled = false; }
        });
        actions.append(view, edit, remove); article.append(heading, meta, actions); $("adminRoutesList").append(article);
      }
      page = next; $("adminRoutesMore").hidden = !result.hasMore;
      notice(result.entries.length || more ? "" : "Todavía no hay rutas guardadas en el servidor."); window.lucide?.createIcons();
    } catch (error) { notice(error.message); }
    finally { busy = false; $("adminRoutesMore").disabled = false; }
  }
  $("adminRoutesRefresh").addEventListener("click", () => load());
  $("adminRoutesMore").addEventListener("click", () => load(true));
  $("adminRouteHistory").addEventListener("toggle", () => { if ($("adminRouteHistory").open) load(); });
  $("adminRouteClose").addEventListener("click", () => $("adminRouteDetail").close());
  $("adminRouteDetail").addEventListener("close", () => { detailVersion++; clearMap(); });
  return { reset };
}

import { editRecord } from "./admin-editor.js";
export function initAdminLibrary(api) {
  const $ = id => document.getElementById(id);
  let page = 0, version = 0;
  const status = text => { $("adminLibraryStatus").textContent = text; };
  async function load(more = false) {
    const current = ++version;
    try {
      const next = more ? page + 1 : 0;
      const result = await api(`/api/library/admin?page=${next}`);
      if (current !== version) return;
      if (!more) $("adminLibraryList").replaceChildren();
      for (const row of result.entries) {
        const item = document.createElement("article"); item.className = "suggestion-item";
        const heading = document.createElement("h3"); heading.textContent = row.name;
        const meta = document.createElement("p"); meta.className = "muted"; meta.textContent = `${row.distance.toFixed(1)} km · Usuario: ${row.user_id}`;
        const edit = document.createElement("button"); edit.type = "button"; edit.className = "secondary-button"; edit.textContent = "Ver y editar datos";
        edit.onclick = async () => {
          try {
            const { route } = await api(`/api/library/admin?user=${encodeURIComponent(row.user_id)}&id=${encodeURIComponent(row.id)}`);
            if (current !== version) return;
            editRecord(route, async updated => { await api("/api/library/admin", { action: "save", user: row.user_id, route: updated }); await load(); });
          } catch (error) { status(error.message); }
        };
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "secondary-button"; remove.textContent = "Eliminar";
        remove.onclick = async () => {
          if (!confirm(`¿Eliminar definitivamente "${row.name}" de la cuenta del usuario?`)) return;
          try { await api("/api/library/admin", { action: "delete", user: row.user_id, id: row.id }); await load(); } catch (error) { status(error.message); }
        };
        item.append(heading, meta, edit, remove); $("adminLibraryList").append(item);
      }
      page = next; $("adminLibraryMore").hidden = !result.hasMore;
      status(result.entries.length || more ? "" : "Todavía no hay rutas guardadas en las cuentas.");
    } catch (error) { status(error.message); }
  }
  $("adminLibraryRefresh").onclick = () => load();
  $("adminLibraryMore").onclick = () => load(true);
  $("adminSavedLibrary").addEventListener("toggle", () => { if ($("adminSavedLibrary").open) load(); });
  return { reset() { version++; $("adminLibraryList").replaceChildren(); } };
}

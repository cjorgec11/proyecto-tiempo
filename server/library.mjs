import { account } from "./accounts.mjs";
import { isAdmin } from "./admin-auth.mjs";
import { readJson } from "./http.mjs";

const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
function routeData(route) {
  if (!route || !/^[a-f0-9-]{36}$/i.test(route.id || "") || typeof route.name !== "string" || !route.name.trim() || route.name.length > 100 ||
    !Array.isArray(route.coords) || route.coords.length < 2 || route.coords.length > 50000 || route.coords.some(p => !p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)) throw new Error("Ruta no válida.");
  const coords = route.coords.map(({ lat, lon }) => ({ lat, lon }));
  let distance = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i], rad = Math.PI / 180;
    const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
    distance += 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  if (!distance || distance > 50000) throw new Error("Distancia no válida.");
  const preview = Array.from({ length: Math.min(60, coords.length) }, (_, i) => coords[Math.round(i * (coords.length - 1) / (Math.min(60, coords.length) - 1))]);
  return { id: route.id, name: route.name.trim(), coords, distance, preview,
    startName: String(route.startName || "Salida").slice(0, 100), endName: String(route.endName || "Llegada").slice(0, 100),
    ...(route.generation && ["asphalt", "dirt"].includes(route.generation.surface) ? { generation: { surface: route.generation.surface } } : {}) };
}

export async function handleLibrary(request, env) {
  const url = new URL(request.url), admin = url.pathname === "/api/library/admin";
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin) return json({ error: "Origen no permitido." }, 403);
  if (!["/api/library", "/api/library/admin"].includes(url.pathname)) return json({ error: "No encontrado." }, 404);
  try {
    const user = await account(request, env);
    if (admin ? !await isAdmin(request, env) : !user) return json({ error: "Inicia sesión para acceder a tus rutas." }, 401);
    if (!env.DB) return json({ error: "Colección no disponible." }, 503);
    if (request.method === "GET") {
      const page = Math.max(0, Math.min(100000, parseInt(url.searchParams.get("page") || "0", 10) || 0));
      const owner = admin ? url.searchParams.get("user") : user.id;
      const id = url.searchParams.get("id");
      if (id) {
        if (!owner) return json({ error: "Falta el usuario." }, 400);
        const row = await env.DB.prepare("SELECT * FROM saved_routes WHERE user_id = ? AND id = ?").bind(owner, id).first();
        return row ? json({ route: JSON.parse(row.payload), owner: row.user_id }) : json({ error: "Ruta no encontrada." }, 404);
      }
      const statement = admin
        ? env.DB.prepare("SELECT id, user_id, name, distance, created_at FROM saved_routes ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?").bind(page * 50)
        : env.DB.prepare("SELECT id, name, distance, created_at, json_extract(payload, '$.preview') AS preview FROM saved_routes WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?").bind(user.id, page * 50);
      const { results } = await statement.all();
      return json({ entries: results.slice(0, 50).map(row => ({ ...row, ...(row.preview ? { preview: JSON.parse(row.preview) } : {}) })), hasMore: results.length > 50 });
    }
    if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
    let data;
    try { data = await readJson(request, 1800000); } catch { return json({ error: "Datos no válidos o ruta demasiado grande." }, 400); }
    const owner = admin ? data.user : user.id;
    if (typeof owner !== "string" || !owner) return json({ error: "Falta el usuario." }, 400);
    if (data.action === "delete") {
      if (typeof data.id !== "string") return json({ error: "Falta la ruta." }, 400);
      await env.DB.prepare("DELETE FROM saved_routes WHERE user_id = ? AND id = ?").bind(owner, data.id).run();
      return json({ deleted: true });
    }
    if (data.action !== "save") return json({ error: "Operación no válida." }, 400);
    let route;
    try { route = routeData(data.route); } catch { return json({ error: "Revisa el nombre y el trazado de la ruta." }, 400); }
    const previous = await env.DB.prepare("SELECT created_at FROM saved_routes WHERE user_id = ? AND id = ?").bind(owner, route.id).first();
    route.createdAt = new Date(previous?.created_at || Date.now()).toISOString();
    const result = await env.DB.prepare(`INSERT INTO saved_routes (user_id, id, name, distance, created_at, payload)
      SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS(SELECT 1 FROM saved_routes WHERE user_id = ? AND id = ?)
        OR (SELECT COUNT(*) FROM saved_routes WHERE user_id = ?) < 500
      ON CONFLICT(user_id, id) DO UPDATE SET name = excluded.name, distance = excluded.distance, payload = excluded.payload`).bind(owner, route.id, route.name, route.distance, Date.parse(route.createdAt), JSON.stringify(route), owner, route.id, owner).run();
    return result.meta.changes ? json({ route }) : json({ error: "Has alcanzado el límite de 500 rutas. Elimina alguna antes de guardar otra." }, 409);
  } catch { return json({ error: "No se pudo acceder a las rutas. Vuelve a intentarlo." }, 503); }
}

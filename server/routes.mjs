import { isAdmin } from "./admin-auth.mjs";
import { readJson } from "./http.mjs";
import { account } from "./accounts.mjs";
const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const error = (message, status) => json({ error: message }, status);
const validPoint = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

function normalize(data) {
  if (!data || data.consent !== true || !/^[a-f0-9-]{36}$/i.test(data.id || "") || !["planned", "forecast"].includes(data.kind)) throw new Error();
  if (!Array.isArray(data.coords) || data.coords.length < 2 || data.coords.length > 50000 || !data.coords.every(validPoint)) throw new Error();
  if (!Number.isFinite(data.distance) || data.distance <= 0 || data.distance > 50000 || typeof data.name !== "string" || !data.name.trim() || data.name.length > 100) throw new Error();
  if (!Number.isFinite(data.speed) || data.speed < 8 || data.speed > 45 || !Number.isFinite(Date.parse(data.departure))) throw new Error();
  let segments = [];
  if (data.kind === "forecast") {
    if (!Array.isArray(data.segments) || !data.segments.length || data.segments.length > 12) throw new Error();
    segments = data.segments.map(segment => {
      const fields = ["km", "temperature", "rainChance", "precipitation", "code", "wind", "gust", "windDirection"];
      if (!validPoint(segment) || !Number.isFinite(Date.parse(segment.arrival)) || fields.some(key => !Number.isFinite(segment[key]))) throw new Error();
      return { lat: segment.lat, lon: segment.lon, arrival: new Date(segment.arrival).toISOString(), ...Object.fromEntries(fields.map(key => [key, segment[key]])) };
    });
  }
  return { coords: data.coords.map(({ lat, lon }) => ({ lat, lon })), segments, speed: data.speed, departure: new Date(data.departure).toISOString() };
}

export async function handleRoutes(request, env) {
  const url = new URL(request.url), admin = url.pathname === "/api/routes/admin";
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin) return error("Origen no permitido.", 403);
  try {
    if (admin && !await isAdmin(request, env)) return error("Inicia sesión como administrador.", 401);
    const user = (await account(request, env))?.id;
    if (!admin && !user) return error("Inicia sesión para guardar el historial.", 401);
    if (!env.DB) return error("El historial no está disponible.", 503);
    if (admin && request.method === "GET") {
      if (url.searchParams.has("id")) {
        const row = await env.DB.prepare("SELECT * FROM route_history WHERE id = ?").bind(url.searchParams.get("id")).first();
        return row ? json({ ...row, payload: JSON.parse(row.payload) }) : error("Registro no encontrado.", 404);
      }
      const page = Math.max(0, Math.min(100000, Number.parseInt(url.searchParams.get("page") || "0", 10) || 0));
      const { results } = await env.DB.prepare("SELECT id, user_id, kind, name, distance, created_at FROM route_history ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?").bind(page * 50).all();
      return json({ entries: results.slice(0, 50), hasMore: results.length > 50 });
    }
    if (admin && request.method === "POST") {
      const data = await readJson(request, 1800000);
      if (data?.action === "update" && typeof data.id === "string") {
        const existing = await env.DB.prepare("SELECT * FROM route_history WHERE id = ?").bind(data.id).first();
        if (!existing) return error("Registro no encontrado.", 404);
        let payload;
        try { payload = normalize({ ...data.route, id: existing.id, kind: existing.kind, consent: true }); }
        catch { return error("Datos de ruta no válidos.", 400); }
        await env.DB.prepare("UPDATE route_history SET name = ?, distance = ?, payload = ? WHERE id = ?").bind(data.route.name.trim(), data.route.distance, JSON.stringify(payload), existing.id).run();
        return json({ saved: true });
      }
      if (data?.action !== "delete" || typeof data.id !== "string") return error("Operación no válida.", 400);
      await env.DB.prepare("DELETE FROM route_history WHERE id = ?").bind(data.id).run();
      return json({ deleted: true });
    }
    if (url.pathname === "/api/routes" && request.method === "POST") {
      let data, payload;
      try { data = await readJson(request, 1800000); payload = JSON.stringify(normalize(data)); }
      catch { return error("No se pudo guardar: revisa el consentimiento, los datos o el tamaño de la ruta.", 400); }
      const existing = await env.DB.prepare("SELECT user_id FROM route_history WHERE id = ?").bind(data.id).first();
      if (existing) return existing.user_id === user ? json({ saved: true }) : error("Identificador no disponible.", 409);
      const now = Date.now();
      const result = await env.DB.prepare(`INSERT INTO route_history (id, user_id, kind, name, distance, created_at, payload)
        SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM route_history WHERE user_id = ? AND created_at > ?) < 120
        ON CONFLICT(id) DO NOTHING`).bind(data.id, user, data.kind, data.name.trim(), data.distance, now, payload, user, now - 3600000).run();
      return result.meta.changes ? json({ saved: true }, 201) : error("Se ha alcanzado el límite temporal de guardado. Reinténtalo más tarde.", 429);
    }
    return error("No encontrado.", 404);
  } catch { return error("No se puede acceder al historial ahora.", 503); }
}

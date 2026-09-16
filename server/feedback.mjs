import { isAdmin, readJson as body } from "./admin-auth.mjs";
import { userId } from "./security.mjs";
const categories = new Set(["routes", "weather", "interface", "other"]);
const statuses = new Set(["new", "reviewed", "resolved"]);
const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const fail = (message, status) => json({ error: message }, status);

export async function handleFeedback(request, env) {
  const url = new URL(request.url);
  const user = { id: userId(request, env) };
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin) return fail("Origen no permitido.", 403);
  if (url.pathname === "/api/feedback/session" && request.method === "GET") {
    return json({ signedIn: Boolean(user.id), available: Boolean(env.DB) });
  }
  const communityRead = request.method === "GET" && url.pathname === "/api/feedback/community";
  const adminPath = url.pathname.startsWith("/api/feedback/admin");
  if (!user.id && !communityRead && !adminPath) return fail("Inicia sesión con ChatGPT para enviar o votar sugerencias.", 401);
  if (!env.DB) return fail("El buzón aún no está disponible. Tu texto no se ha enviado.", 503);
  try {
    if (adminPath && !await isAdmin(request, env)) return fail("Inicia sesión como administrador.", 401);
    if (communityRead) {
      const page = Math.max(0, Math.min(100000, Number.parseInt(url.searchParams.get("page") || "0", 10) || 0));
      const { results } = await env.DB.prepare(`SELECT f.id, f.category, f.message, f.created_at, f.status,
        (SELECT COUNT(*) FROM feedback_votes v WHERE v.feedback_id = f.id) AS votes,
        EXISTS(SELECT 1 FROM feedback_votes v WHERE v.feedback_id = f.id AND v.user_id = ?) AS voted
        FROM feedback f WHERE f.public = 1 ORDER BY f.created_at DESC, f.id DESC LIMIT 51 OFFSET ?`).bind(user.id || "", page * 50).all();
      return json({ entries: results.slice(0, 50), hasMore: results.length > 50, page });
    }
    if (request.method === "POST" && url.pathname === "/api/feedback/vote") {
      let data;
      try { data = await body(request); } catch { return fail("Voto no válido.", 400); }
      if (!data || typeof data.id !== "string" || typeof data.voted !== "boolean") return fail("Voto no válido.", 400);
      const row = await env.DB.prepare("SELECT id FROM feedback WHERE id = ? AND public = 1").bind(data.id).first();
      if (!row) return fail("Sugerencia no encontrada.", 404);
      if (data.voted) await env.DB.prepare("INSERT INTO feedback_votes (feedback_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING").bind(data.id, user.id).run();
      else await env.DB.prepare("DELETE FROM feedback_votes WHERE feedback_id = ? AND user_id = ?").bind(data.id, user.id).run();
      const result = await env.DB.prepare(`SELECT COUNT(*) AS votes,
        EXISTS(SELECT 1 FROM feedback_votes WHERE feedback_id = ? AND user_id = ?) AS voted
        FROM feedback_votes WHERE feedback_id = ?`).bind(data.id, user.id, data.id).first();
      return json(result);
    }
    if (request.method === "GET" && ["/api/feedback", "/api/feedback/admin"].includes(url.pathname)) {
      const page = Math.max(0, Math.min(100000, Number.parseInt(url.searchParams.get("page") || "0", 10) || 0));
      const statement = adminPath
        ? env.DB.prepare(`SELECT id, category, message, created_at, status, public,
          (SELECT COUNT(*) FROM feedback_votes WHERE feedback_id = feedback.id) AS votes
          FROM feedback ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?`).bind(page * 50)
        : env.DB.prepare("SELECT id, category, message, created_at, status FROM feedback WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?").bind(user.id, page * 50);
      const { results } = await statement.all();
      return json({ entries: results.slice(0, 50), hasMore: results.length > 50, page });
    }
    if (request.method === "POST" && url.pathname === "/api/feedback") {
      let data;
      try { data = await body(request); } catch { return fail("Revisa el texto de la sugerencia.", 400); }
      if (!data || typeof data.text !== "string" || !data.text.trim() || data.text.trim().length > 2000 || !categories.has(data.category) ||
        typeof data.id !== "string" || !/^[0-9a-f-]{36}$/i.test(data.id)) return fail("Revisa el texto y la categoría.", 400);
      const previous = await env.DB.prepare("SELECT * FROM feedback WHERE id = ?").bind(data.id).first();
      if (previous) {
        if (previous.user_id !== user.id || previous.message !== data.text.trim() || previous.category !== data.category || previous.public !== Number(data.public === true)) return fail("Identificador ya utilizado.", 409);
        return json({ id: previous.id, saved: true });
      }
      const now = Date.now();
      // The conditional insert keeps the per-account limit atomic, even for concurrent requests.
      const inserted = await env.DB.prepare(`INSERT INTO feedback (id, user_id, category, message, created_at, public)
        SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM feedback WHERE user_id = ? AND created_at > ?) < 10
        ON CONFLICT(id) DO NOTHING`).bind(data.id, user.id, data.category, data.text.trim(), now, Number(data.public === true), user.id, now - 3600000).run();
      if (!inserted.meta.changes) return fail("Espera un poco antes de enviar más sugerencias.", 429);
      return json({ id: data.id, saved: true }, 201);
    }
    if (request.method === "POST" && url.pathname === "/api/feedback/admin") {
      let data;
      try { data = await body(request); } catch { return fail("Petición no válida.", 400); }
      if (!data || typeof data.id !== "string") return fail("Petición no válida.", 400);
      const row = await env.DB.prepare("SELECT * FROM feedback WHERE id = ?").bind(data.id).first();
      if (!row) return fail("Sugerencia no encontrada.", 404);
      if (statuses.has(data.status)) await env.DB.prepare("UPDATE feedback SET status = ? WHERE id = ?").bind(data.status, data.id).run();
      else return fail("Estado no válido.", 400);
      return json({ saved: true });
    }
    return fail("Ruta no encontrada.", 404);
  } catch {
    return fail("No se puede acceder al buzón ahora. Conserva tu texto y vuelve a intentarlo.", 503);
  }
}

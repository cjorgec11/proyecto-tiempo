import { account } from "./accounts.mjs";
import { digest, unhex, hex, passwordHash } from "./crypto.mjs";
import { readJson } from "./http.mjs";
const cookieName = "ridecast_admin";
const encoder = new TextEncoder();
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });

function configured(env) { return /^pbkdf2\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(env.ADMIN_PASSWORD_HASH || ""); }
function token(request) {
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(value || "") ? value : null;
}
function cookie(request, value, age) {
  return `${cookieName}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

export async function isAdmin(request, env) {
  if ((await account(request, env))?.admin) return true;
  const value = token(request);
  if (!value || !configured(env) || !env.DB) return false;
  const row = await env.DB.prepare("SELECT expires, credential FROM admin_sessions WHERE token_hash = ?").bind(await digest(value)).first();
  return Boolean(row && row.expires > Date.now() && row.credential === await digest(env.ADMIN_PASSWORD_HASH));
}

export async function handleAdminAuth(request, env) {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin) return json({ error: "Origen no permitido." }, 403);
  try {
    if (url.pathname === "/api/admin/session" && request.method === "GET") return json({ authenticated: await isAdmin(request, env), configured: configured(env) });
    if (url.pathname === "/api/admin/logout" && request.method === "POST") {
      const value = token(request);
      if (value && env.DB) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await digest(value)).run();
      return json({ authenticated: false }, 200, { "Set-Cookie": cookie(request, "", 0) });
    }
    if (url.pathname !== "/api/admin/login" || request.method !== "POST") return json({ error: "No encontrado." }, 404);
    if (!configured(env) || !env.DB) return json({ error: "El acceso de administración aún no está configurado." }, 503);
    const now = Date.now();
    // Only a trusted adapter may supply CLIENT_IP. Raw deployments share a
    // conservative bucket rather than trusting an attacker-controlled header.
    const ip = env.CLIENT_IP || (env.AUTH_MODE === "sites" ? request.headers.get("cf-connecting-ip") : null) || "unknown";
    const key = await digest(`${env.ADMIN_PASSWORD_HASH}:${ip}`);
    const attempt = await env.DB.prepare(`INSERT INTO admin_attempts (key, attempts, expires) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN expires <= ? THEN 1 ELSE attempts + 1 END,
      expires = CASE WHEN expires <= ? THEN excluded.expires ELSE expires END
      WHERE expires <= ? OR attempts < 10 RETURNING attempts`).bind(key, now + 900000, now, now, now).first();
    if (!attempt) return json({ error: "Demasiados intentos. Vuelve a intentarlo en 15 minutos." }, 429);
    let data;
    try { data = await readJson(request); } catch { return json({ error: "Contraseña incorrecta." }, 401); }
    if (typeof data?.password !== "string" || data.password.length > 256) return json({ error: "Contraseña incorrecta." }, 401);
    const actual = await passwordHash(data.password, env.ADMIN_PASSWORD_HASH.split("$")[2]);
    // Verify fixed-size digests using WebCrypto rather than a short-circuit string comparison.
    const compareKey = await crypto.subtle.importKey("raw", unhex(env.ADMIN_PASSWORD_HASH.split("$")[3]), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    const signature = await crypto.subtle.sign("HMAC", compareKey, encoder.encode(env.ADMIN_PASSWORD_HASH));
    if (!await crypto.subtle.verify("HMAC", compareKey, signature, encoder.encode(actual))) return json({ error: "Contraseña incorrecta." }, 401);
    const value = hex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare("DELETE FROM admin_sessions WHERE expires <= ?").bind(now).run();
    await env.DB.prepare("DELETE FROM admin_attempts WHERE expires <= ?").bind(now).run();
    await env.DB.prepare("INSERT INTO admin_sessions (token_hash, expires, credential) VALUES (?, ?, ?)").bind(await digest(value), now + 28800000, await digest(env.ADMIN_PASSWORD_HASH)).run();
    return json({ authenticated: true }, 200, { "Set-Cookie": cookie(request, value, 28800) });
  } catch { return json({ error: "No se puede acceder ahora. Vuelve a intentarlo." }, 503); }
}

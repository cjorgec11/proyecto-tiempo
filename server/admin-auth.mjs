const cookieName = "ridecast_admin";
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
const unhex = value => Uint8Array.from(value.match(/../g) || [], byte => Number.parseInt(byte, 16));
const digest = async text => hex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function readJson(request, limit = 12000) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Formato no válido.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Faltan datos.");
  const parts = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error("Petición demasiado larga."); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function passwordHash(password, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations: 100000 }, key, 256);
  return `pbkdf2$100000$${salt}$${hex(hash)}`;
}

function configured(env) { return /^pbkdf2\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(env.ADMIN_PASSWORD_HASH || ""); }
function token(request) {
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(value || "") ? value : null;
}
function cookie(request, value, age) {
  return `${cookieName}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

export async function isAdmin(request, env) {
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
    const key = await digest(`${env.ADMIN_PASSWORD_HASH}:${request.headers.get("cf-connecting-ip") || "local"}`);
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

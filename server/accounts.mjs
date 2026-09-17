import { userId } from "./security.mjs";
import { passwordHash, hex, digest } from "./crypto.mjs";
import { readJson } from "./http.mjs";

const encoder = new TextEncoder();
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
const cookieValue = (request, name) => request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="))?.slice(name.length + 1) || "";
const cookie = (request, name, value, age, sameSite = "Strict") => `${name}=${value}; Path=/api; HttpOnly; SameSite=${sameSite}; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
const emailAddress = value => typeof value === "string" && /^[^\s@]{1,64}@gmail\.com$/i.test(value.trim()) ? value.trim().toLowerCase() : null;
const validPassword = value => typeof value === "string" && value.length >= 12 && value.length <= 128;
const mailReady = env => Boolean(env.AUTH_MAIL_API_KEY && env.AUTH_MAIL_FROM);
const googleReady = env => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const identity = (row, env) => ({ id: row.id, email: row.email, name: row.name, admin: Boolean(row.verified && env.ADMIN_EMAIL && row.email === env.ADMIN_EMAIL.trim().toLowerCase()) });

export async function account(request, env) {
  const value = cookieValue(request, "ridecast_user");
  if (/^[a-f0-9]{64}$/.test(value) && env.DB) {
    const row = await env.DB.prepare(`SELECT u.* FROM app_users u JOIN user_sessions s ON s.user_id = u.id
      WHERE s.token_hash = ? AND s.expires > ? AND u.verified = 1`).bind(await digest(value), Date.now()).first();
    if (row) return identity(row, env);
  }
  const id = userId(request, env);
  return id ? { id, admin: false, legacy: true } : null;
}

async function session(request, env, row, redirect = false) {
  const value = random(), now = Date.now();
  await env.DB.prepare("DELETE FROM user_sessions WHERE expires <= ?").bind(now).run();
  await env.DB.prepare("INSERT INTO user_sessions (token_hash, user_id, expires) VALUES (?, ?, ?)").bind(await digest(value), row.id, now + 7 * 86400000).run();
  await env.DB.prepare("UPDATE app_users SET last_seen = ? WHERE id = ?").bind(now, row.id).run();
  const headers = { "Set-Cookie": cookie(request, "ridecast_user", value, 7 * 86400) };
  return redirect ? new Response(null, { status: 303, headers: { ...headers, Location: "/#plan", "Cache-Control": "no-store" } }) : json({ user: identity(row, env) }, 200, headers);
}

async function limited(env, key, max = 10) {
  const now = Date.now();
  await env.DB.prepare("DELETE FROM admin_attempts WHERE expires <= ?").bind(now).run();
  return Boolean(await env.DB.prepare(`INSERT INTO admin_attempts (key, attempts, expires) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN expires <= ? THEN 1 ELSE attempts + 1 END,
    expires = CASE WHEN expires <= ? THEN excluded.expires ELSE expires END
    WHERE expires <= ? OR attempts < ? RETURNING attempts`).bind(await digest("account:" + key), now + 900000, now, now, now, max).first());
}

async function sendLink(request, env, row, purpose) {
  const token = random();
  await env.DB.prepare("DELETE FROM account_tokens WHERE expires <= ?").bind(Date.now()).run();
  await env.DB.prepare("INSERT INTO account_tokens (token_hash, user_id, purpose, expires) VALUES (?, ?, ?, ?)").bind(await digest(token), row.id, purpose, Date.now() + 3600000).run();
  const url = `${new URL(request.url).origin}/#account-${purpose}=${token}`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.AUTH_MAIL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.AUTH_MAIL_FROM, to: [row.email], subject: purpose === "verify" ? "Confirma tu cuenta de RideCast" : "Recupera tu cuenta de RideCast",
      text: `Abre este enlace para confirmar tu correo y elegir tu contraseña:\n${url}\nCaduca en una hora. Si no lo has solicitado, ignora este correo.` }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    await env.DB.prepare("DELETE FROM account_tokens WHERE token_hash = ?").bind(await digest(token)).run();
    throw new Error("No se pudo enviar el correo.");
  }
}

async function googleCallback(request, env, url) {
  const state = url.searchParams.get("state") || "";
  if (!googleReady(env) || !/^[a-f0-9]{64}$/.test(state) || state !== cookieValue(request, "ridecast_oauth")) return json({ error: "La solicitud de Google ha caducado o no es válida." }, 400);
  const attempt = await env.DB.prepare("DELETE FROM account_tokens WHERE token_hash = ? AND purpose = 'google' AND expires > ? RETURNING verifier").bind(await digest(state), Date.now()).first();
  if (!attempt || !url.searchParams.get("code")) return json({ error: "Acceso con Google cancelado. Vuelve a RideCast para intentarlo de nuevo." }, 400);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ code: url.searchParams.get("code"), client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${url.origin}/api/account/google/callback`, grant_type: "authorization_code", code_verifier: attempt.verifier }), signal: AbortSignal.timeout(10000) });
  if (!tokenResponse.ok) return json({ error: "Google no ha autorizado el acceso." }, 401);
  const tokens = await tokenResponse.json();
  if (typeof tokens.access_token !== "string") return json({ error: "Respuesta no válida de Google." }, 401);
  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10000) });
  if (!userResponse.ok) return json({ error: "No se pudo verificar la cuenta de Google." }, 401);
  const user = await userResponse.json(), email = emailAddress(user.email);
  if (!email || user.email_verified !== true || typeof user.sub !== "string" || !user.sub) return json({ error: "Usa una cuenta de Gmail verificada." }, 403);
  let row = await env.DB.prepare("SELECT * FROM app_users WHERE google_sub = ? OR email = ?").bind(user.sub, email).first();
  if (row?.google_sub && row.google_sub !== user.sub) return json({ error: "No se pudo vincular esa cuenta." }, 409);
  if (!row) {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO app_users (id, email, name, last_seen, verified, google_sub) VALUES (?, ?, ?, ?, 1, ?)").bind(id, email, String(user.name || email).slice(0, 100), Date.now(), user.sub).run();
    row = await env.DB.prepare("SELECT * FROM app_users WHERE id = ?").bind(id).first();
  } else {
    // A pre-registration by another person must never retain their password.
    await env.DB.prepare("UPDATE app_users SET google_sub = ?, verified = 1, password = CASE WHEN verified = 0 THEN NULL ELSE password END WHERE id = ?").bind(user.sub, row.id).run();
    await env.DB.prepare("DELETE FROM account_tokens WHERE user_id = ?").bind(row.id).run();
    row = { ...row, verified: 1 };
  }
  return session(request, env, row, true);
}

export async function handleAccount(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin) return json({ error: "Origen no permitido." }, 403);
  if (path === "/api/account/config" && request.method === "GET") return json({ config: { available: Boolean(env.DB), email: mailReady(env), google: googleReady(env) } });
  if (!env.DB) return json({ error: "Las cuentas no están disponibles." }, 503);
  try {
    if (path === "/api/account/session" && request.method === "GET") return json({ user: await account(request, env) });
    if (path === "/api/account/google/callback" && request.method === "GET") return await googleCallback(request, env, url);
    if (request.method !== "POST") return json({ error: "No encontrado." }, 404);
    if (path === "/api/account/logout") {
      await env.DB.prepare("DELETE FROM user_sessions WHERE token_hash = ?").bind(await digest(cookieValue(request, "ridecast_user"))).run();
      return json({ user: null }, 200, { "Set-Cookie": cookie(request, "ridecast_user", "", 0) });
    }
    if (!await limited(env, `ip:${env.CLIENT_IP || "unknown"}`, 30)) return json({ error: "Demasiados intentos. Espera 15 minutos." }, 429);
    if (path === "/api/account/google") {
      if (!googleReady(env)) return json({ error: "El acceso con Google todavía no está configurado." }, 503);
      const state = random(), verifier = random();
      const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
      await env.DB.prepare("DELETE FROM account_tokens WHERE expires <= ?").bind(Date.now()).run();
      await env.DB.prepare("INSERT INTO account_tokens (token_hash, user_id, purpose, expires, verifier) VALUES (?, '', 'google', ?, ?)").bind(await digest(state), Date.now() + 600000, verifier).run();
      const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      target.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${url.origin}/api/account/google/callback`, response_type: "code", scope: "openid email profile", state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" }).toString();
      return json({ url: target.href }, 200, { "Set-Cookie": cookie(request, "ridecast_oauth", state, 600, "Lax") });
    }
    let data;
    try { data = await readJson(request); } catch { return json({ error: "Revisa los datos." }, 400); }
    if (["/api/account/verify", "/api/account/reset"].includes(path)) {
      if (!/^[a-f0-9]{64}$/.test(data.token || "") || !validPassword(data.password)) return json({ error: "Enlace o contraseña no válidos. Usa al menos 12 caracteres." }, 400);
      const purpose = path.endsWith("/verify") ? "verify" : "reset";
      const password = await passwordHash(data.password);
      const token = await env.DB.prepare("DELETE FROM account_tokens WHERE token_hash = ? AND purpose = ? AND expires > ? RETURNING user_id").bind(await digest(data.token), purpose, Date.now()).first();
      if (!token) return json({ error: "El enlace ha caducado o ya se ha usado." }, 400);
      await env.DB.prepare("UPDATE app_users SET password = ?, verified = 1 WHERE id = ?").bind(password, token.user_id).run();
      await env.DB.prepare("DELETE FROM user_sessions WHERE user_id = ?").bind(token.user_id).run();
      await env.DB.prepare("DELETE FROM account_tokens WHERE user_id = ?").bind(token.user_id).run();
      return json({ message: "Contraseña guardada. Ya puedes iniciar sesión." });
    }
    const email = emailAddress(data.email);
    if (!email) return json({ error: "Escribe una dirección de Gmail válida." }, 400);
    if (!await limited(env, `email:${email}`)) return json({ error: "Demasiados intentos. Espera 15 minutos." }, 429);
    let row = await env.DB.prepare("SELECT * FROM app_users WHERE email = ?").bind(email).first();
    if (path === "/api/account/register" || path === "/api/account/recover") {
      if (!mailReady(env)) return json({ error: "Falta configurar el envío de correos de verificación. Puedes usar Google si está disponible." }, 503);
      if (path.endsWith("register")) {
        if (!validPassword(data.password) || typeof data.name !== "string" || !data.name.trim() || data.name.length > 100) return json({ error: "Indica tu nombre y una contraseña de 12 a 128 caracteres." }, 400);
        if (!row) {
          const id = crypto.randomUUID();
          await env.DB.prepare("INSERT INTO app_users (id, email, name, last_seen, password) VALUES (?, ?, ?, ?, ?)").bind(id, email, data.name.trim(), Date.now(), await passwordHash(data.password)).run();
          row = await env.DB.prepare("SELECT * FROM app_users WHERE id = ?").bind(id).first();
        }
        if (!row.verified) await sendLink(request, env, row, "verify");
      } else if (row) await sendLink(request, env, row, row.verified ? "reset" : "verify");
      return json({ message: "Si la dirección es válida, recibirás un enlace por correo. Revisa también spam." });
    }
    if (path !== "/api/account/login") return json({ error: "No encontrado." }, 404);
    const expected = row?.password || ("pbkdf2$100000$00000000000000000000000000000000$" + "0".repeat(64));
    const actual = await passwordHash(typeof data.password === "string" && data.password.length <= 128 ? data.password : "", expected.split("$")[2]);
    const key = await crypto.subtle.importKey("raw", encoder.encode(expected), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(expected));
    if (!await crypto.subtle.verify("HMAC", key, signature, encoder.encode(actual)) || !row?.verified) return json({ error: "Correo o contraseña incorrectos, o correo sin confirmar." }, 401);
    return session(request, env, row);
  } catch { return json({ error: "No se pudo completar el acceso. Vuelve a intentarlo." }, 503); }
}

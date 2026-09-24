// Confiar en una identidad de cabecera exige una configuración explícita; nunca es el valor predeterminado.
export function identificadorUsuario(request, env) {
  if (env.AUTH_MODE === "sites") return request.headers.get("oai-authenticated-user-id") || null;
  return env.PREVIEW_USER_ID || null;
}

export function cabecerasSeguridad(https = false) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.tile.openstreetmap.org; connect-src 'self' https://routing.openstreetmap.de https://brouter.de https://api.open-meteo.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    ...(https ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
  };
}

export function configuracionNode(env) {
  const production = env.NODE_ENV === "production";
  if (env.AUTH_MODE && env.AUTH_MODE !== "disabled") throw new Error("Node solo admite AUTH_MODE=disabled; aquí no se confía en las cabeceras de identidad de Sites.");
  if (production && env.LOCAL_PREVIEW_AUTH === "true") throw new Error("La autenticación de previsualización está prohibida en producción.");
  if (production && !env.PUBLIC_ORIGIN) throw new Error("Se requiere PUBLIC_ORIGIN=https://tu-dominio en producción.");
  let origin = null;
  if (env.PUBLIC_ORIGIN) {
    const url = new URL(env.PUBLIC_ORIGIN);
    if (url.origin !== env.PUBLIC_ORIGIN || url.username || url.password || url.protocol !== "https:") throw new Error("PUBLIC_ORIGIN debe ser un origen HTTPS sin ruta.");
    origin = url.origin;
  }
  const port = Number(env.PORT || 5173);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Valor de PORT no válido.");
  return { origin, port, preview: !production && !origin && env.LOCAL_PREVIEW_AUTH === "true" };
}

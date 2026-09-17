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

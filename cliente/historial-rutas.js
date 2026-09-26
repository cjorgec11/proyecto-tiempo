import { peticionCuenta, cuentaActual } from "./cuenta.js";

let queue = [], working = false, owner = null, retryTimer = null;
const signedOwner = () => {
  const user = cuentaActual();
  return user && !user.legacy ? user.id : null;
};
const currentOwner = () => signedOwner() || "guest";
function stopRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}
function retryLater() {
  if (!retryTimer && queue.length && currentOwner() === owner) {
    retryTimer = setTimeout(() => { retryTimer = null; flush(); }, 15000);
    retryTimer.unref?.();
  }
}
async function flush() {
  if (working || !owner || currentOwner() !== owner) return;
  working = true;
  try {
    while (queue.length && currentOwner() === owner) {
      const item = queue[0];
      const response = await peticionCuenta("/api/routes", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar el historial.");
      queue = queue.filter(record => record.id !== item.id);
    }
    stopRetry();
  } catch { retryLater(); }
  finally { working = false; if (queue.length && !retryTimer && owner) queueMicrotask(flush); }
}
export function registrarRuta(kind, coords, distance, name, segments = [], settings = {}) {
  if (!owner || currentOwner() !== owner || (owner === "guest" && settings.manual !== true) || coords.length < 2) return;
  const date = new Date(settings.departure || document.getElementById("departure")?.value);
  if (!Number.isFinite(date.getTime())) return;
  const departure = date.toISOString();
  const speed = settings.speed ?? Number(document.getElementById("speed")?.value);
  queue.push(JSON.parse(JSON.stringify({ id: crypto.randomUUID(), automatic: true, ...(owner === "guest" ? { manual: true } : {}), kind, coords, distance,
    name: (name || "Ruta planificada").slice(0, 100), departure, speed, segments })));
  flush();
}
export function iniciarHistorialRutas() {
  owner = currentOwner();
  window.addEventListener("ridecast:account", () => {
    const id = currentOwner();
    if (owner !== id) { queue = []; stopRetry(); owner = id; }
  });
  window.addEventListener("online", flush);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) flush(); });
}

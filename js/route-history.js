let queue = [], working = false;
const consent = () => document.getElementById("routeHistoryConsent")?.checked === true;
function status(text) { const element = document.getElementById("routeHistoryStatus"); if (element) element.textContent = text; }
async function flush() {
  if (working || !consent()) return;
  working = true;
  try {
    while (queue.length && consent()) {
      const item = queue[0];
      const response = await fetch("/api/routes", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar el historial.");
      queue = queue.filter(record => record.id !== item.id);
      status("Ruta guardada en el historial del servidor.");
    }
  } catch (error) { status(`${error.message} Hay ${queue.length} registro(s) pendientes en esta pestaña. No la cierres antes de reintentar.`); }
  finally { working = false; const retry = document.getElementById("retryRouteHistory"); if (retry) retry.hidden = !queue.length; }
}
export function recordRoute(kind, coords, distance, name, segments = [], settings = {}) {
  if (!consent() || coords.length < 2) return;
  const date = new Date(settings.departure || document.getElementById("departure")?.value);
  if (!Number.isFinite(date.getTime())) { status("No se guardó el historial: falta una fecha de salida válida."); return; }
  const departure = date.toISOString();
  const speed = settings.speed ?? Number(document.getElementById("speed")?.value);
  queue.push(JSON.parse(JSON.stringify({ id: crypto.randomUUID(), consent: true, kind, coords, distance,
    name: (name || "Ruta planificada").slice(0, 100), departure, speed, segments })));
  flush();
}
export function initRouteHistory() {
  const input = document.getElementById("routeHistoryConsent");
  try { input.checked = localStorage.getItem("ridecast.routeHistoryConsent.v1") === "yes"; } catch {}
  input.addEventListener("change", () => {
    try { localStorage.setItem("ridecast.routeHistoryConsent.v1", input.checked ? "yes" : "no"); } catch {}
    if (!input.checked) { queue = []; status("Guardado automático desactivado. Los registros ya guardados permanecen en el servidor."); }
    else status("Se guardarán las nuevas rutas y previsiones. No se subirán rutas antiguas.");
    document.getElementById("retryRouteHistory").hidden = true;
  });
  document.getElementById("retryRouteHistory").addEventListener("click", flush);
}

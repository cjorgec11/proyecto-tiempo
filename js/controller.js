// Controlador: coordina el modelo, la vista y las operaciones asíncronas.
import { bearing, parseRouteFile, pathDistance, readSavedRoutes, routeAcross,
  sampleRoute, snapToRoad, setDefaultDeparture, state, weatherFor, writeSavedRoutes } from "./model.js";
import { dom, downloadGpx, drawRoute, fitRoute, initIcons, initPlanMap, initTheme,
  renderSavedRoutes, renderSummary, renderTimeline, renderWaypoints, setPlanRoutePreview,
  setWindow, showStatus, toggleTheme, togglePlanFullscreen, updateSamplesRange } from "./view.js";

let previewTimer, previewToken = 0, calculationToken = 0, importToken = 0, activeSavedId = null;

export function initApp() {
  initIcons();
  initTheme();
  setDefaultDeparture(dom.departure);
  bindEvents();
  renderCollection();
  renderTimeline([], 0, state.currentMode);
  initPlanMap(addWaypoint);
  drawRoute();
  renderWaypoints(state.waypoints);
  updateSamplesRange();
  setWindow(location.hash.slice(1) || "plan");
}

function renderCollection() {
  try { renderSavedRoutes(readSavedRoutes()); }
  catch (error) { showStatus(error.message, "error"); }
}

function busy(active) {
  const button = dom.form.querySelector('button[type="submit"]');
  button.disabled = active;
  button.classList.toggle("loading", active);
  button.querySelector("span").textContent = active ? "Calculando…" : "Calcular previsión";
  dom.form.setAttribute("aria-busy", String(active));
}

function invalidateWeather() {
  ++calculationToken;
  busy(false);
  state.currentSegments = [];
  renderTimeline([], 0, state.currentMode);
  renderSummary(state.currentDistance, state.currentDistance / Number(document.querySelector("#speed").value));
  drawRoute([], state.currentStartName, state.currentEndName, 0, state.currentRouteCoords, state.currentMode);
  document.querySelector("#forecastDate").textContent = "Pendiente de calcular";
}

function invalidateRoute() {
  ++importToken;
  ++previewToken;
  clearTimeout(previewTimer);
  activeSavedId = null;
  state.importedRoute = null;
  state.currentRouteCoords = [];
  state.currentStartName = "Salida";
  state.currentEndName = "Llegada";
  state.currentDistance = 0;
  state.currentDuration = 0;
  dom.routeSource.textContent = state.waypoints.length ? "Recorrido ciclista" : "Sin ruta";
  document.querySelector("#forecastTitle").textContent = "Tiempo en ruta";
  invalidateWeather();
  showStatus("");
}

function schedulePreview() {
  clearTimeout(previewTimer);
  const token = ++previewToken;
  if (state.waypoints.length < 2 || state.waypoints.some((point) => point.snapping)) return;
  const points = state.waypoints.map((point) => ({ ...point }));
  previewTimer = setTimeout(async () => {
    try {
      const route = await routeAcross(points);
      if (token !== previewToken) return;
      setPlanRoutePreview(route.coords);
      dom.routeSource.textContent = `${route.distance.toFixed(1)} km · Bicicleta`;
    } catch (error) {
      if (token === previewToken) showStatus(error.message, "error");
    }
  }, 450);
}

async function addWaypoint(lat, lon) {
  if (state.waypoints.length >= 25) return showStatus("El máximo es de 25 puntos.", "error");
  const point = { lat, lon, snapping: true };
  state.waypoints.push(point);
  invalidateRoute();
  renderWaypoints(state.waypoints);
  const snapped = await snapToRoad(lat, lon);
  const index = state.waypoints.indexOf(point);
  if (index < 0) return;
  state.waypoints[index] = snapped || { lat, lon };
  renderWaypoints(state.waypoints);
  schedulePreview();
}

function removeWaypoint(index) {
  state.waypoints.splice(index, 1);
  invalidateRoute();
  renderWaypoints(state.waypoints);
  schedulePreview();
}

function clearRoute() {
  state.waypoints = [];
  invalidateRoute();
  renderWaypoints([]);
  setPlanRoutePreview(null);
  dom.saveName.value = "";
  dom.importStatus.textContent = "";
}

function bindEvents() {
  dom.menuButtons.forEach((button) => button.addEventListener("click", () => setWindow(button.dataset.window)));
  window.addEventListener("hashchange", () => setWindow(location.hash.slice(1)));
  document.querySelector("#newRoute").addEventListener("click", () => {
    if ((state.currentRouteCoords.length || state.waypoints.length) && !window.confirm("¿Empezar una nueva ruta? Las rutas guardadas se conservarán.")) return;
    clearRoute();
    setWindow("plan");
  });
  document.querySelectorAll(".chip[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".chip[data-mode]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      state.currentMode = button.dataset.mode;
      renderForecast();
    });
  });
  dom.samples.addEventListener("input", () => { updateSamplesRange(); invalidateWeather(); });
  dom.departure.addEventListener("change", invalidateWeather);
  document.querySelector("#speed").addEventListener("change", invalidateWeather);
  dom.form.addEventListener("submit", calculate);
  dom.routeFile.addEventListener("change", handleRouteFile);
  dom.saveRoute.addEventListener("click", saveCurrentRoute);
  dom.exportRoute.addEventListener("click", exportCurrentRoute);
  dom.exportPlanRoute.addEventListener("click", exportPlanRoute);
  dom.savedRoutes.addEventListener("click", savedAction);
  document.querySelector("#routeSearch").addEventListener("input", renderCollection);
  document.querySelector("#routeSort").addEventListener("change", renderCollection);
  document.querySelector("#themeToggle").addEventListener("click", toggleTheme);
  document.querySelector("#fitRoute").addEventListener("click", fitRoute);
  document.querySelector("#saveForecast").addEventListener("click", () => {
    if (!state.currentRouteCoords.length) return showStatus("Primero crea o importa un recorrido.", "error");
    setWindow("library");
    dom.saveName.value = routeName();
    dom.saveName.focus();
  });
  dom.undoWaypoint.addEventListener("click", () => { if (state.waypoints.length) removeWaypoint(state.waypoints.length - 1); });
  dom.clearWaypoints.addEventListener("click", clearRoute);
  dom.planFullscreenBtn.addEventListener("click", togglePlanFullscreen);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dom.planMapWrap.classList.contains("fullscreen")) togglePlanFullscreen();
  });
  dom.waypointList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='remove-waypoint']");
    if (button) removeWaypoint(Number(button.dataset.index));
  });
}

function renderForecast() {
  renderTimeline(state.currentSegments, state.currentRideBearing, state.currentMode);
  drawRoute(state.currentSegments, state.currentStartName, state.currentEndName,
    state.currentRideBearing, state.currentRouteCoords, state.currentMode);
}

function askDepartureDateTime() {
  const dialog = document.querySelector("#importModal");
  const input = document.querySelector("#importDeparture");
  input.value = dom.departure.value;
  dialog.returnValue = "";
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm" ? input.value : null), { once: true });
    dialog.showModal();
    input.focus();
  });
}

function useImportedRoute(route, id = null) {
  clearRoute();
  state.importedRoute = route;
  activeSavedId = id;
  state.currentRouteCoords = route.coords;
  state.currentStartName = route.startName || route.name;
  state.currentEndName = route.endName || "Llegada";
  state.currentDistance = pathDistance(route.coords);
  dom.routeSource.textContent = route.name;
  dom.importStatus.textContent = `${route.name} · ${state.currentDistance.toFixed(1)} km`;
  document.querySelector("#forecastTitle").textContent = route.name;
  renderSummary(state.currentDistance, state.currentDistance / Number(document.querySelector("#speed").value));
  renderForecast();
  setWindow("plan");
  setPlanRoutePreview(route.coords, true);
}

async function handleRouteFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const token = ++importToken;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("El fichero supera los 10 MB.");
    showStatus("Leyendo recorrido…");
    const parsed = parseRouteFile(await file.text());
    if (token !== importToken) return;
    const departure = await askDepartureDateTime();
    if (!departure || token !== importToken) { showStatus(""); return; }
    useImportedRoute(parsed);
    dom.departure.value = departure;
    showStatus("Ruta importada. Revisa la salida y calcula la previsión.");
  } catch (error) {
    if (token === importToken) showStatus(error.message || "No se pudo importar el fichero.", "error");
  } finally {
    event.target.value = "";
  }
}

function routeName() {
  return state.importedRoute?.name || "Ruta " + new Date().toLocaleDateString("es-ES");
}

function saveCurrentRoute() {
  if (!state.currentRouteCoords.length) return showStatus("Calcula o importa una ruta antes de guardarla.", "error");
  try {
    const routes = readSavedRoutes();
    const previous = routes.find((route) => route.id === activeSavedId);
    const saved = {
      id: activeSavedId || crypto.randomUUID(),
      name: dom.saveName.value.trim() || routeName(),
      coords: state.currentRouteCoords,
      startName: state.currentStartName, endName: state.currentEndName,
      distance: pathDistance(state.currentRouteCoords),
      createdAt: previous?.createdAt || new Date().toISOString(),
    };
    writeSavedRoutes([saved, ...routes.filter((route) => route.id !== saved.id)]);
    activeSavedId = saved.id;
    document.querySelector("#routeSearch").value = "";
    renderCollection();
    showStatus(`“${saved.name}” guardada en este navegador.`);
  } catch (error) { showStatus(error.message, "error"); }
}

function savedAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  try {
    const routes = readSavedRoutes();
    const route = routes.find((item) => item.id === button.dataset.id);
    if (!route) return;
    if (button.dataset.action === "load") {
      useImportedRoute(route, route.id);
      showStatus("Ruta cargada. Revisa la fecha y calcula una previsión actualizada.");
    } else if (button.dataset.action === "export") {
      downloadGpx(route.name, route.coords);
    } else if (button.dataset.action === "delete" && window.confirm(`¿Borrar “${route.name}” de tus rutas guardadas?`)) {
      writeSavedRoutes(routes.filter((item) => item.id !== route.id));
      if (activeSavedId === route.id) activeSavedId = null;
      renderCollection();
      showStatus("Ruta eliminada de la colección.");
    }
  } catch (error) { showStatus(error.message, "error"); }
}

function exportCurrentRoute() {
  if (!state.currentRouteCoords.length) return showStatus("Primero calcula o importa una ruta.", "error");
  downloadGpx(dom.saveName.value.trim() || routeName(), state.currentRouteCoords);
}

async function exportPlanRoute() {
  if (state.currentRouteCoords.length) return exportCurrentRoute();
  const token = previewToken;
  dom.exportPlanRoute.disabled = true;
  try {
    if (state.waypoints.some((point) => point.snapping)) throw new Error("Espera a que se ajusten los puntos.");
    showStatus("Preparando GPX…");
    const route = await routeAcross(state.waypoints.map((point) => ({ ...point })));
    if (token !== previewToken) return;
    state.currentRouteCoords = route.coords;
    state.currentDistance = route.distance;
    downloadGpx(routeName(), route.coords);
    showStatus("GPX exportado.");
  } catch (error) {
    if (token === previewToken) showStatus(error.message, "error");
  } finally { dom.exportPlanRoute.disabled = false; }
}

async function calculate(event) {
  event?.preventDefault();
  if (!dom.form.reportValidity()) return;
  const token = ++calculationToken;
  const speed = Number(document.querySelector("#speed").value);
  const count = Number(dom.samples.value);
  const departure = new Date(dom.departure.value);
  const imported = state.importedRoute;
  const points = state.waypoints.map((point) => ({ ...point }));
  try {
    if (!Number.isFinite(departure.getTime()) || departure.getTime() < Date.now() - 3600000) throw new Error("Elige una fecha de salida actual o futura.");
    if (points.some((point) => point.snapping)) throw new Error("Espera a que se ajusten los puntos al mapa.");
    busy(true);
    showStatus("Calculando recorrido ciclista…");
    const route = imported ? { coords: imported.coords, distance: pathDistance(imported.coords) } : await routeAcross(points);
    if (token !== calculationToken) return;
    state.currentRouteCoords = route.coords;
    state.currentDistance = route.distance;
    state.currentDuration = route.distance / speed;
    state.currentStartName = imported?.startName || imported?.name || "Salida";
    state.currentEndName = imported?.endName || "Llegada";
    state.currentSegments = [];
    renderSummary(route.distance, state.currentDuration);
    renderForecast();
    if (!imported) setPlanRoutePreview(route.coords);
    const samples = sampleRoute(route.coords, count);
    showStatus("Consultando el tiempo a la hora de paso por cada punto…");
    const segments = await weatherFor(samples, departure, route.distance, speed);
    if (token !== calculationToken) return;
    state.currentSegments = segments;
    state.currentRideBearing = bearing(route.coords[0], route.coords.at(-1));
    renderSummary(route.distance, state.currentDuration, segments, state.currentRideBearing);
    setWindow("forecast");
    renderForecast();
    document.querySelector("#forecastTitle").textContent = imported?.name || "Tiempo en ruta";
    document.querySelector("#forecastDate").textContent = `Salida: ${departure.toLocaleString("es-ES", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${count} puntos · ${speed} km/h`;
    showStatus("Previsión actualizada.");
  } catch (error) {
    if (token === calculationToken) showStatus(error.name === "TimeoutError" ? "La consulta está tardando demasiado. Inténtalo de nuevo." : error.message || "No se pudo calcular la ruta.", "error");
  } finally {
    if (token === calculationToken) busy(false);
  }
}

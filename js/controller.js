// Controlador: enlaza eventos del usuario (clics, formularios) con el modelo
// (cálculos, APIs) y la vista (pintar). Es la única capa que orquesta ambas.

import {
  bearing,
  downloadGpx,
  haversine,
  parseRouteFile,
  pathDistance,
  readSavedRoutes,
  routeAcross,
  sampleRoute,
  snapToRoad,
  setDefaultDeparture,
  state,
  weatherFor,
  writeSavedRoutes,
} from "./model.js";
import {
  dom,
  drawRoute,
  initPlanMap,
  initTheme,
  refreshPlanMap,
  renderSavedRoutes,
  renderSummary,
  renderTimeline,
  renderWaypoints,
  setPlanRoutePreview,
  setWindow,
  toggleTheme,
  togglePlanFullscreen,
  updateSamplesRange,
} from "./view.js";

// setStatus desapareció: ya no existe la píldora #statusPill en el HTML.
// Se mantiene un noop por compatibilidad para no romper llamadas residuales.
const setStatus = () => {};

let previewTimer = null;
let previewToken = 0;
function schedulePlanPreview() {
  if (previewTimer) clearTimeout(previewTimer);
  if (state.waypoints.length < 2 || state.waypoints.some((w) => w.snapping)) {
    setPlanRoutePreview(null);
    return;
  }
  previewTimer = setTimeout(async () => {
    const token = ++previewToken;
    try {
      const route = await routeAcross(state.waypoints, state.routeMode);
      if (token !== previewToken) return;
      setPlanRoutePreview(route.coords);
    } catch {}
  }, 400);
}

export function initApp() {
  initTheme();
  bindEvents();
  setDefaultDeparture(dom.departure);
  dom.samplesOut.value = dom.samples.value;
  renderSavedRoutes(readSavedRoutes());
  renderTimeline([], 0, state.currentMode);
  drawRoute();
  initPlanMap((lat, lon) => addWaypoint(lat, lon));
  renderWaypoints(state.waypoints);
  refreshPlanMap();
  setStatus("Listo");
}

function waypointDistance(points) {
  let d = 0;
  for (let i = 1; i < points.length; i += 1) d += haversine(points[i - 1], points[i]);
  return d;
}

function refreshSamplesFromWaypoints() {
  updateSamplesRange(state.waypoints.length >= 2 ? waypointDistance(state.waypoints) : 0);
}

async function addWaypoint(lat, lon) {
  const placeholder = { lat, lon, snapping: true };
  state.waypoints.push(placeholder);
  state.importedRoute = null;
  dom.routeSource.textContent = state.waypoints.length >= 2 ? "Puntos en el mapa" : "Marca puntos en el mapa";
  renderWaypoints(state.waypoints);
  refreshSamplesFromWaypoints();
  const snapped = await snapToRoad(lat, lon);
  const index = state.waypoints.indexOf(placeholder);
  if (index === -1) return;
  state.waypoints[index] = snapped ? { lat: snapped.lat, lon: snapped.lon } : { lat, lon };
  renderWaypoints(state.waypoints);
  refreshSamplesFromWaypoints();
  schedulePlanPreview();
}

function undoWaypoint() {
  state.waypoints.pop();
  renderWaypoints(state.waypoints);
  refreshSamplesFromWaypoints();
  schedulePlanPreview();
}

function clearWaypoints() {
  state.waypoints = [];
  renderWaypoints(state.waypoints);
  refreshSamplesFromWaypoints();
  schedulePlanPreview();
}

function removeWaypointAt(index) {
  state.waypoints.splice(index, 1);
  renderWaypoints(state.waypoints);
  refreshSamplesFromWaypoints();
  schedulePlanPreview();
}

function bindEvents() {
  dom.menuButtons.forEach((button) => {
    button.addEventListener("click", () => setWindow(button.dataset.window));
  });

  document.querySelectorAll(".chip[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".chip[data-mode]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.currentMode = button.dataset.mode;
      if (state.currentSegments.length) {
        renderTimeline(state.currentSegments, state.currentRideBearing, state.currentMode);
        drawRoute(state.currentSegments, state.currentStartName, state.currentEndName, state.currentRideBearing, state.currentRouteCoords, state.currentMode);
      }
    });
  });

  document.querySelectorAll(".chip[data-route-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".chip[data-route-mode]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.routeMode = button.dataset.routeMode;
      schedulePlanPreview();
    });
  });

  dom.samples.addEventListener("input", () => {
    dom.samplesOut.value = dom.samples.value;
  });
  dom.routeFile.addEventListener("change", handleRouteFile);
  dom.saveRoute.addEventListener("click", saveCurrentRoute);
  dom.exportRoute?.addEventListener("click", exportCurrentRoute);
  dom.exportPlanRoute?.addEventListener("click", exportPlanRoute);
  dom.savedRoutes.addEventListener("click", handleSavedRouteAction);
  dom.form.addEventListener("submit", calculate);

  document.querySelector("#themeToggle")?.addEventListener("click", toggleTheme);

  dom.undoWaypoint?.addEventListener("click", undoWaypoint);
  dom.clearWaypoints?.addEventListener("click", clearWaypoints);

  // Botón pantalla completa del mapa de planificación + tecla Escape para salir.
  dom.planFullscreenBtn?.addEventListener("click", togglePlanFullscreen);
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && dom.planMapWrap?.classList.contains("fullscreen")) {
      togglePlanFullscreen();
    }
  });
  dom.waypointList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='remove-waypoint']");
    if (!button) return;
    removeWaypointAt(Number(button.dataset.index));
  });
}

async function handleRouteFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    setStatus("Importando");
    const parsed = parseRouteFile(await file.text());
    const departure = await askDepartureDateTime();
    if (!departure) {
      event.target.value = "";
      setStatus("Listo");
      return;
    }
    dom.departure.value = departure;
    state.importedRoute = parsed;
    dom.routeSource.textContent = "Fichero";
    dom.importStatus.textContent = `${parsed.name}: ${parsed.coords.length} puntos`;
    state.currentRouteCoords = parsed.coords;
    state.currentStartName = parsed.name;
    state.currentEndName = "Meta";
    updateSamplesRange(pathDistance(parsed.coords));
    drawRoute([], parsed.name, "Meta", 0, parsed.coords, state.currentMode);
    setWindow("forecast");
    setStatus("Listo");
  } catch (error) {
    state.importedRoute = null;
    dom.importStatus.textContent = error.message || "No se pudo importar la ruta";
    dom.routeSource.textContent = "Origen / destino";
    setStatus("Error");
  }
}

function askDepartureDateTime() {
  return new Promise((resolve) => {
    const modal = document.querySelector("#importModal");
    const input = document.querySelector("#importDeparture");
    const ok = document.querySelector("#importConfirm");
    const cancel = document.querySelector("#importCancel");
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30, 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    input.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    modal.hidden = false;
    const close = (value) => {
      modal.hidden = true;
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      resolve(value);
    };
    const onOk = () => close(input.value || null);
    const onCancel = () => close(null);
    const onBackdrop = (e) => { if (e.target === modal) close(null); };
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    setTimeout(() => input.focus(), 0);
  });
}

function routeDefaultName() {
  if (state.importedRoute?.name) return state.importedRoute.name;
  if (state.currentStartName !== "Salida" || state.currentEndName !== "Llegada") {
    return `${state.currentStartName.split(",")[0]} - ${state.currentEndName.split(",")[0]}`;
  }
  return "Ruta guardada";
}

function saveCurrentRoute() {
  if (!state.currentRouteCoords.length) {
    dom.importStatus.textContent = "Calcula o importa una ruta antes de guardarla.";
    setWindow("library");
    return;
  }
  const name = dom.saveName.value.trim() || routeDefaultName();
  const routes = readSavedRoutes();
  const saved = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name,
    coords: state.currentRouteCoords,
    startName: state.currentStartName,
    endName: state.currentEndName,
    distance: pathDistance(state.currentRouteCoords),
    createdAt: new Date().toISOString(),
  };
  writeSavedRoutes([saved, ...routes].slice(0, 20));
  renderSavedRoutes(readSavedRoutes());
  dom.saveName.value = "";
  dom.importStatus.textContent = `${name}: ruta guardada`;
}

function handleSavedRouteAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "load") loadSavedRoute(button.dataset.id);
  if (button.dataset.action === "delete") {
    writeSavedRoutes(readSavedRoutes().filter((route) => route.id !== button.dataset.id));
    renderSavedRoutes(readSavedRoutes());
  }
  if (button.dataset.action === "export") {
    const route = readSavedRoutes().find((r) => r.id === button.dataset.id);
    if (route) downloadGpx(route.name, route.coords);
  }
}

async function exportPlanRoute() {
  try {
    let coords = state.currentRouteCoords;
    let name = routeDefaultName();
    if (!coords?.length) {
      if (state.waypoints.length < 2) {
        setStatus("Marca al menos dos puntos");
        return;
      }
      setStatus("Calculando ruta");
      const route = await routeAcross(state.waypoints, state.routeMode);
      coords = route.coords;
      state.currentRouteCoords = coords;
      setStatus("Listo");
    }
    downloadGpx(name, coords);
  } catch (error) {
    setStatus(error.message || "No se pudo exportar");
  }
}

function exportCurrentRoute() {
  if (!state.currentRouteCoords.length) {
    dom.importStatus.textContent = "Calcula o importa una ruta antes de exportarla.";
    setWindow("library");
    return;
  }
  const name = dom.saveName.value.trim() || routeDefaultName();
  downloadGpx(name, state.currentRouteCoords);
}

async function loadSavedRoute(id) {
  const route = readSavedRoutes().find((item) => item.id === id);
  if (!route) return;
  state.importedRoute = { name: route.name, coords: route.coords };
  state.currentRouteCoords = route.coords;
  state.currentStartName = route.startName || route.name;
  state.currentEndName = route.endName || "Meta";
  dom.routeSource.textContent = "Guardada";
  dom.importStatus.textContent = `${route.name}: ruta cargada`;
  updateSamplesRange(pathDistance(route.coords));
  drawRoute([], state.currentStartName, state.currentEndName, 0, state.currentRouteCoords, state.currentMode);
  await calculate();
  setWindow("forecast");
}

function autoSaveRoute() {
  if (!state.currentRouteCoords.length) return;
  const name = routeDefaultName();
  const routes = readSavedRoutes();
  if (routes.some((r) => r.name === name)) return;
  const saved = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name,
    coords: state.currentRouteCoords,
    startName: state.currentStartName,
    endName: state.currentEndName,
    distance: pathDistance(state.currentRouteCoords),
    createdAt: new Date().toISOString(),
  };
  writeSavedRoutes([saved, ...routes].slice(0, 20));
  renderSavedRoutes(readSavedRoutes());
}

async function calculate(event) {
  event?.preventDefault();
  const data = new FormData(dom.form);
  const speed = Number(data.get("speed"));
  const count = Number(data.get("samples"));
  const departure = new Date(data.get("departure"));
  const submitBtn = dom.form.querySelector('button[type="submit"]');

  try {
    submitBtn?.classList.add("loading");
    setStatus("Buscando");
    dom.timeline.innerHTML = `<div class="empty">Cargando</div>`;
    setStatus("Ruta");
    let start;
    let end;
    let route;

    if (state.importedRoute) {
      route = {
        coords: state.importedRoute.coords,
        distance: pathDistance(state.importedRoute.coords),
        routed: true,
      };
      start = route.coords[0];
      end = route.coords[route.coords.length - 1];
      state.currentStartName = state.importedRoute.name;
      state.currentEndName = "Meta";
      dom.routeSource.textContent = "Fichero";
    } else {
      if (state.waypoints.length < 2) {
        throw new Error("Marca al menos dos puntos en el mapa");
      }
      route = await routeAcross(state.waypoints, state.routeMode);
      start = state.waypoints[0];
      end = state.waypoints[state.waypoints.length - 1];
      state.currentStartName = `Salida ${start.lat.toFixed(3)}, ${start.lon.toFixed(3)}`;
      state.currentEndName = `Llegada ${end.lat.toFixed(3)}, ${end.lon.toFixed(3)}`;
      dom.routeSource.textContent = route.routed ? "Carretera" : "Linea directa";
    }

    const distance = route.distance;
    updateSamplesRange(distance);
    const duration = distance / speed;
    const points = sampleRoute(route.coords, count);
    const rideBearing = bearing(start, end);

    setStatus("Tiempo");
    state.currentSegments = await weatherFor(points, departure, distance, speed);
    state.currentRouteCoords = route.coords;
    state.currentRideBearing = rideBearing;
    state.currentDistance = distance;
    state.currentDuration = duration;
    state.currentRoadRatio = route.roadRatio ?? null;
    renderTimeline(state.currentSegments, rideBearing, state.currentMode);
    renderSummary(distance, duration, state.currentSegments, rideBearing, state.currentRoadRatio);
    drawRoute(state.currentSegments, state.currentStartName, state.currentEndName, rideBearing, state.currentRouteCoords, state.currentMode);
    if (!state.importedRoute) autoSaveRoute();
    setStatus("Listo");
  } catch (error) {
    dom.timeline.innerHTML = `<div class="error">${error.message || "No se pudo calcular la ruta"}</div>`;
    drawRoute();
  } finally {
    submitBtn?.classList.remove("loading");
  }
}

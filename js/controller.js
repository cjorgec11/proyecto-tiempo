// Controlador: coordina el modelo, la vista y las operaciones asíncronas.
import { bearing, parseRouteFile, pathDistance, readSavedRoutes, routeAcross,
  generateRoundTrip,
  sampleRoute, snapToRoad, setDefaultDeparture, state, weatherFor, writeSavedRoutes } from "./model.js";
import { dom, downloadGpx, drawRoute, fitRoute, initIcons, initPlanMap, initTheme,
  createGpxFile, canShareGpx, shareGpx, downloadGpxFile,
  centerPlanLocation,
  renderSavedRoutes, renderSummary, renderTimeline, renderWaypoints, renderImportedWaypoints, setPlanRoutePreview,
  setWindow, showStatus, toggleTheme, togglePlanFullscreen, updateSamplesRange } from "./view.js";

let previewTimer, previewToken = 0, calculationToken = 0, importToken = 0, activeSavedId = null;
let garminFile = null;
let locationRequest = 0;
let generationController = null;

function stopGeneration() {
  generationController?.abort();
  generationController = null;
  document.querySelector("#generateRoute").disabled = false;
  document.querySelector("#generateRoute span").textContent = "Generar ruta";
  document.querySelector("#cancelGeneration").hidden = true;
  document.querySelector("#generatorForm").setAttribute("aria-busy", "false");
  document.querySelector("#saveGeneratedRoute").disabled = false;
}

async function generateRoute(event) {
  event.preventDefault();
  if (!document.querySelector("#generatorForm").reportValidity()) return;
  const start = state.waypoints[0] || state.currentRouteCoords[0];
  const result = document.querySelector("#generatorResult");
  if (!start) { result.textContent = "Elige una salida en el mapa o pulsa el botón de ubicación."; return; }
  if (state.waypoints.some(point => point.snapping)) { result.textContent = "Espera a que se ajusten los puntos al mapa."; return; }
  stopGeneration();
  ++previewToken;
  clearTimeout(previewTimer);
  const controller = generationController = new AbortController();
  const target = Number(document.querySelector("#targetDistance").value);
  const direction = document.querySelector("#routeDirection").value;
  const heading = direction === "auto" ? Math.random() * 360 : Number(direction);
  document.querySelector("#generateRoute").disabled = true;
  document.querySelector("#generateRoute span").textContent = "Buscando ruta…";
  document.querySelector("#cancelGeneration").hidden = false;
  document.querySelector("#generatorForm").setAttribute("aria-busy", "true");
  document.querySelector("#saveGeneratedRoute").disabled = true;
  try {
    const route = await generateRoundTrip({lat:start.lat, lon:start.lon}, target, heading, {
      surface: document.querySelector("#routeSurface").value,
      signal: controller.signal,
      onProgress: (attempt, total) => { result.textContent = `Ajustando distancia y trazado · Intento ${attempt} de ${total}`; }
    });
    if (controller.signal.aborted) return;
    const name = `Circular ${route.distance.toFixed(1)} km`;
    useImportedRoute({coords:route.coords, name, startName:"Salida", endName:"Regreso", generation:route.generation});
    document.querySelector("#generatedRouteSave").hidden = false;
    document.querySelector("#generatedRouteName").value = name;
    dom.importStatus.textContent = "";
    const info = route.generation;
    const surfaces = info.surfaces;
    const breakdown = surfaces ? `Pavimentado ${Math.round(surfaces.paved * 100)} %, tierra/grava ${Math.round(surfaces.unpaved * 100)} %, sin datos ${Math.round(surfaces.unknown * 100)} %.` : "Firme sin detalle disponible.";
    result.textContent = `${name} · Objetivo ${target} km · Desviación ${(info.error * 100).toFixed(1)} % · Repetición estimada ${(info.repeated * 100).toFixed(0)} %. Preferencia: ${info.surface === "dirt" ? "caminos de tierra" : "asfalto"}. ${breakdown}`;
    showStatus("Ruta circular creada. Ya puedes calcular el tiempo, guardarla o compartirla con Garmin Connect.");
  } catch (error) {
    if (!controller.signal.aborted) result.textContent = error.message;
  } finally {
    if (generationController === controller) stopGeneration();
  }
}

export function initApp() {
  initIcons();
  initTheme();
  setDefaultDeparture(dom.departure);
  bindEvents();
  renderCollection();
  renderTimeline([], 0, state.currentMode);
  renderSummary();
  initPlanMap(addWaypoint);
  drawRoute();
  renderWaypoints(state.waypoints);
  updateSamplesRange();
  setWindow(location.hash.slice(1) || "plan");
  if (window.navigator.geolocation) useDeviceStart();
}

function useDeviceStart() {
  const geolocation = window.navigator.geolocation;
  if (!geolocation) return showStatus("Este navegador no permite localizar el dispositivo. Elige la salida en el mapa.", "error");
  if (state.importedRoute && !window.confirm("¿Crear una nueva ruta desde tu ubicación? El recorrido importado no se modificará en tus rutas guardadas.")) return;
  const token = previewToken;
  const request = ++locationRequest;
  const button = document.querySelector("#useDeviceLocation");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  showStatus("Buscando tu ubicación…");
  const finish = () => {
    if (request !== locationRequest) return;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  };
  const fail = error => {
    finish();
    if (request !== locationRequest || token !== previewToken) return;
    const messages = {
      1: "Permiso de ubicación denegado. Puedes activarlo en el navegador o elegir la salida en el mapa.",
      2: "No se pudo obtener tu ubicación. Elige la salida en el mapa o vuelve a intentarlo.",
      3: "La ubicación ha tardado demasiado. Vuelve a intentarlo o elige la salida en el mapa."
    };
    showStatus(messages[error.code] || "La ubicación no está disponible. Elige la salida en el mapa.", "error");
  };
  try {
    geolocation.getCurrentPosition(position => {
      finish();
      // Una respuesta tardía nunca debe sustituir una ruta elegida por el usuario.
      if (request !== locationRequest || token !== previewToken) return;
      const { latitude: lat, longitude: lon } = position.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return fail({code: 2});
      if (state.importedRoute) clearRoute();
      const point = { lat, lon };
      state.waypoints.splice(0, state.waypoints.length ? 1 : 0, point);
      invalidateRoute();
      renderWaypoints(state.waypoints);
      centerPlanLocation(point);
      schedulePreview();
      showStatus("Tu ubicación es el punto de salida. Añade el siguiente punto en el mapa.");
    }, fail, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  } catch (error) { fail(error); }
}

function renderCollection() {
  try { renderSavedRoutes(readSavedRoutes()); }
  catch (error) { showStatus(error.message, "error"); }
}

function busy(active) {
  document.querySelectorAll('#rideForm button[type="submit"], button[form="rideForm"]').forEach(button => {
    button.disabled = active;
    button.classList.toggle("loading", active);
    button.querySelector("span").textContent = active ? "Calculando…" : "Calcular previsión";
  });
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
  stopGeneration();
  document.querySelector("#generatedRouteSave").hidden = true;
  document.querySelector("#generatedRouteName").value = "";
  document.querySelector("#saveGeneratedRoute span").textContent = "Guardar ruta";
  document.querySelector("#generatedSaveStatus").textContent = "Se guardará en Mis rutas de este navegador.";
  document.querySelector("#generatorResult").textContent = "";
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
  const saveGenerated = () => {
    if (generationController || document.querySelector("#generatedRouteSave").hidden) return;
    dom.saveName.value = document.querySelector("#generatedRouteName").value.trim() || routeName();
    if (saveCurrentRoute()) {
      document.querySelector("#saveGeneratedRoute span").textContent = "Actualizar ruta";
      document.querySelector("#generatedSaveStatus").textContent = `“${dom.saveName.value}” guardada en Mis rutas de este navegador.`;
    } else {
      document.querySelector("#generatedSaveStatus").textContent = "No se ha podido guardar la ruta. Revisa el aviso e inténtalo de nuevo.";
    }
  };
  document.querySelector("#saveGeneratedRoute").addEventListener("click", saveGenerated);
  document.querySelector("#generatedRouteName").addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); saveGenerated(); }
  });
  document.querySelector("#generatorForm").addEventListener("submit", generateRoute);
  document.querySelector("#generateRoute").addEventListener("click", generateRoute);
  document.querySelector("#cancelGeneration").addEventListener("click", () => {
    stopGeneration();
    document.querySelector("#generatorResult").textContent = "Generación cancelada. Tu ruta se conserva.";
  });
  ["targetDistance", "routeDirection", "routeSurface"].forEach(id => document.querySelector("#" + id).addEventListener("change", () => {
    stopGeneration();
    document.querySelector("#generatorResult").textContent = state.currentRouteCoords.length ? "Preferencias cambiadas. Genera otra ruta para aplicarlas; el recorrido actual se conserva." : "";
  }));
  dom.menuButtons.forEach((button) => button.addEventListener("click", () => setWindow(button.dataset.window)));
  window.addEventListener("hashchange", () => setWindow(location.hash.slice(1)));
  document.querySelector("#useDeviceLocation").addEventListener("click", useDeviceStart);
  document.querySelector("#newRoute").addEventListener("click", () => {
    if ((state.currentRouteCoords.length || state.waypoints.length) && !window.confirm("¿Empezar una nueva ruta? Las rutas guardadas se conservarán.")) return;
    clearRoute();
    setWindow("plan");
    if (window.navigator.geolocation) useDeviceStart();
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
  document.querySelectorAll("[data-garmin]").forEach(button => button.addEventListener("click", () => openGarmin()));
  document.querySelector("#garminShare").addEventListener("click", async (event) => {
    if (!garminFile) return;
    const button = event.currentTarget;
    button.disabled = true;
    const result = await shareGpx(garminFile);
    document.querySelector("#garminStatus").textContent = {
      shared: "Archivo compartido. Completa la importación en Garmin Connect; RideCast no puede confirmar la sincronización.",
      cancelled: "Se ha cancelado el uso compartido. Puedes volver a intentarlo.",
      unsupported: "Este navegador no permite compartir este archivo. Descarga el GPX para importarlo en Connect.",
      failed: "No se pudo compartir el archivo. Puedes descargarlo e importarlo en Connect."
    }[result];
    button.disabled = !canShareGpx(garminFile);
  });
  document.querySelector("#garminDownload").addEventListener("click", () => {
    if (!garminFile) return;
    downloadGpxFile(garminFile);
    document.querySelector("#garminStatus").textContent = "Descarga solicitada. Abre el GPX descargado con Garmin Connect o impórtalo en su web.";
  });
  dom.savedRoutes.addEventListener("click", savedAction);
  document.querySelector("#routeSearch").addEventListener("input", renderCollection);
  document.querySelector("#routeSort").addEventListener("change", renderCollection);
  document.querySelector("#themeToggle").addEventListener("click", toggleTheme);
  document.querySelector("#dismissStatus").addEventListener("click", () => showStatus(""));
  const speedInput = document.querySelector("#speed");
  const updateSpeedButtons = () => {
    document.querySelector("#decreaseSpeed").disabled = Number(speedInput.value) <= Number(speedInput.min);
    document.querySelector("#increaseSpeed").disabled = Number(speedInput.value) >= Number(speedInput.max);
  };
  [["decreaseSpeed", -1], ["increaseSpeed", 1]].forEach(([id, step]) => {
    document.querySelector("#" + id).addEventListener("click", () => {
      const current = Number(speedInput.value) || 23;
      speedInput.value = Math.max(Number(speedInput.min), Math.min(Number(speedInput.max), current + step));
      updateSpeedButtons();
      invalidateWeather();
    });
  });
  speedInput.addEventListener("input", updateSpeedButtons);
  updateSpeedButtons();
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
  if (["asphalt", "dirt"].includes(route.generation?.surface)) document.querySelector("#routeSurface").value = route.generation.surface;
  activeSavedId = id;
  state.currentRouteCoords = route.coords;
  state.currentStartName = route.startName || route.name;
  state.currentEndName = route.endName || "Llegada";
  state.currentDistance = pathDistance(route.coords);
  dom.routeSource.textContent = route.name;
  renderImportedWaypoints(route.coords);
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
      ...(state.importedRoute?.generation ? {generation:state.importedRoute.generation} : {}),
      createdAt: previous?.createdAt || new Date().toISOString(),
    };
    writeSavedRoutes([saved, ...routes.filter((route) => route.id !== saved.id)]);
    activeSavedId = saved.id;
    document.querySelector("#routeSearch").value = "";
    renderCollection();
    showStatus(`“${saved.name}” guardada en este navegador.`);
    return true;
  } catch (error) { showStatus(error.message, "error"); return false; }
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
    } else if (button.dataset.action === "garmin") {
      openGarmin(route);
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

async function openGarmin(savedRoute) {
  const token = previewToken;
  const buttons = document.querySelectorAll("[data-garmin], [data-action='garmin']");
  buttons.forEach(button => { button.disabled = true; });
  try {
    let coords = savedRoute?.coords || state.currentRouteCoords;
    const name = savedRoute?.name || dom.saveName.value.trim() || routeName();
    if (coords.length < 2) {
      if (state.waypoints.some(point => point.snapping)) throw new Error("Espera a que se ajusten los puntos al mapa.");
      if (state.waypoints.length < 2) throw new Error("Crea o importa una ruta antes de enviarla a Garmin Connect.");
      showStatus("Preparando ruta para Garmin Connect…");
      const route = await routeAcross(state.waypoints.map(point => ({ ...point })));
      if (token !== previewToken) return;
      coords = route.coords;
    }
    // Preparar antes del segundo clic conserva la activación necesaria para compartir en móvil.
    garminFile = createGpxFile(name, coords);
    document.querySelector("#garminRouteName").textContent = name;
    const supported = canShareGpx(garminFile);
    document.querySelector("#garminShare").disabled = !supported;
    document.querySelector("#garminStatus").textContent = supported ? "" : "Este navegador no permite compartir GPX. Utiliza la descarga.";
    document.querySelector("#garminModal").showModal();
    showStatus("");
  } catch (error) { showStatus(error.message || "No se pudo preparar el GPX.", "error"); }
  finally { buttons.forEach(button => { button.disabled = false; }); }
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

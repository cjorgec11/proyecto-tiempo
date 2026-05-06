import {
  bearing,
  geocode,
  geocodeSuggest,
  parseRouteFile,
  pathDistance,
  readSavedRoutes,
  riskFor,
  routeBetween,
  sampleRoute,
  setDefaultDeparture,
  state,
  weatherFor,
  weatherLabels,
  writeSavedRoutes,
} from "./model.js";
import { dom, drawRoute, hideAutocomplete, initTheme, renderSavedRoutes, renderSummary, renderTimeline, setStatus, setWindow, showAutocomplete, toggleTheme } from "./view.js";

export function initApp() {
  initTheme();
  bindEvents();
  setDefaultDeparture(dom.departure);
  dom.samplesOut.value = dom.samples.value;
  renderSavedRoutes(readSavedRoutes());
  renderTimeline([], 0, state.currentMode);
  drawRoute();
  calculate();
}

function bindEvents() {
  dom.menuButtons.forEach((button) => {
    button.addEventListener("click", () => setWindow(button.dataset.window));
  });

  document.querySelectorAll(".chip").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.currentMode = button.dataset.mode;
      if (state.currentSegments.length) {
        renderTimeline(state.currentSegments, state.currentRideBearing, state.currentMode);
        drawRoute(state.currentSegments, state.currentStartName, state.currentEndName, state.currentRideBearing, state.currentRouteCoords, state.currentMode);
      }
    });
  });

  dom.samples.addEventListener("input", () => {
    dom.samplesOut.value = dom.samples.value;
  });
  dom.routeFile.addEventListener("change", handleRouteFile);
  dom.stravaConnect.addEventListener("click", () => showConnectorNotice("Strava"));
  dom.wikilocConnect.addEventListener("click", () => showConnectorNotice("Wikiloc"));
  dom.saveRoute.addEventListener("click", saveCurrentRoute);
  dom.savedRoutes.addEventListener("click", handleSavedRouteAction);
  dom.form.addEventListener("submit", calculate);

  document.querySelector("#themeToggle")?.addEventListener("click", toggleTheme);
  document.querySelector("#copyBtn")?.addEventListener("click", copySummary);

  bindAutocomplete(document.querySelector("#startCity"), document.querySelector("#startCityList"));
  bindAutocomplete(document.querySelector("#endCity"), document.querySelector("#endCityList"));
}

async function handleRouteFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    setStatus("Importando");
    const parsed = parseRouteFile(await file.text());
    state.importedRoute = parsed;
    dom.routeSource.textContent = "Fichero";
    dom.importStatus.textContent = `${parsed.name}: ${parsed.coords.length} puntos`;
    state.currentRouteCoords = parsed.coords;
    state.currentStartName = parsed.name;
    state.currentEndName = "Meta";
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

function showConnectorNotice(service) {
  dom.importStatus.textContent = `${service}: conexion preparada. Para activar OAuth hacen falta claves/API del servicio.`;
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
}

function loadSavedRoute(id) {
  const route = readSavedRoutes().find((item) => item.id === id);
  if (!route) return;
  state.importedRoute = { name: route.name, coords: route.coords };
  state.currentRouteCoords = route.coords;
  state.currentStartName = route.startName || route.name;
  state.currentEndName = route.endName || "Meta";
  dom.routeSource.textContent = "Guardada";
  dom.importStatus.textContent = `${route.name}: ruta cargada`;
  drawRoute([], state.currentStartName, state.currentEndName, 0, state.currentRouteCoords, state.currentMode);
  calculate();
}

function bindAutocomplete(inputEl, listEl) {
  if (!inputEl || !listEl) return;
  let debounceTimer;
  inputEl.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const suggestions = await geocodeSuggest(inputEl.value.trim());
      showAutocomplete(listEl, suggestions, (label) => {
        inputEl.value = label;
      });
    }, 300);
  });
  inputEl.addEventListener("blur", () => {
    setTimeout(() => hideAutocomplete(listEl), 150);
  });
  inputEl.addEventListener("focus", () => {
    if (inputEl.value.trim().length >= 2) inputEl.dispatchEvent(new Event("input"));
  });
}

function copySummary() {
  if (!state.currentSegments.length) {
    setStatus("Sin datos");
    setTimeout(() => setStatus("Listo"), 1500);
    return;
  }
  const hours = Math.floor(state.currentDuration);
  const mins = Math.round((state.currentDuration - hours) * 60);
  const risks = state.currentSegments.map((s) => riskFor(s, state.currentRideBearing));
  const bad = risks.filter((r) => r === "bad").length;
  const watch = risks.filter((r) => r === "watch").length;
  const riskLabel = bad ? "Duro 🔴" : watch ? "Vigilar 🟡" : "Bueno 🟢";
  const from = state.currentStartName.split(",")[0];
  const to = state.currentEndName.split(",")[0];
  const lines = [
    `🚴 RideCast: ${from} → ${to}`,
    `📏 Distancia: ${Math.round(state.currentDistance)} km`,
    `⏱️ Duración: ${hours}h ${String(mins).padStart(2, "0")}m`,
    `Condiciones: ${riskLabel}`,
    "",
    ...state.currentSegments.map((s) => {
      const [label] = weatherLabels[s.code] || ["Variable"];
      const time = s.arrival.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      return `• km ${Math.round(s.km)} (${time}): ${label}, ${Math.round(s.temperature)}°C, viento ${Math.round(s.wind)} km/h`;
    }),
  ];
  navigator.clipboard.writeText(lines.join("\n"))
    .then(() => { setStatus("¡Copiado!"); setTimeout(() => setStatus("Listo"), 2000); })
    .catch(() => { setStatus("Error"); setTimeout(() => setStatus("Listo"), 1500); });
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
      [start, end] = await Promise.all([
        geocode(data.get("startCity").trim()),
        geocode(data.get("endCity").trim()),
      ]);
      route = await routeBetween(start, end);
      state.currentStartName = start.name;
      state.currentEndName = end.name;
      dom.routeSource.textContent = route.routed ? "Carretera" : "Linea directa";
    }

    const distance = route.distance;
    const duration = distance / speed;
    const points = sampleRoute(route.coords, count);
    const rideBearing = bearing(start, end);

    setStatus("Tiempo");
    state.currentSegments = await weatherFor(points, departure, distance, speed);
    state.currentRouteCoords = route.coords;
    state.currentRideBearing = rideBearing;
    state.currentDistance = distance;
    state.currentDuration = duration;
    renderTimeline(state.currentSegments, rideBearing, state.currentMode);
    renderSummary(distance, duration, state.currentSegments, rideBearing);
    drawRoute(state.currentSegments, state.currentStartName, state.currentEndName, rideBearing, state.currentRouteCoords, state.currentMode);
    setStatus("Listo");
  } catch (error) {
    dom.timeline.innerHTML = `<div class="error">${error.message || "No se pudo calcular la ruta"}</div>`;
    setStatus("Error");
    drawRoute();
  } finally {
    submitBtn?.classList.remove("loading");
  }
}

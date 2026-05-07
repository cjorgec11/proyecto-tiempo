import { isNighttime, metricValue, pathDistance, riskFor, routeSlice, weatherBadge, weatherEmoji, weatherLabels, windCompass } from "./model.js";

export const dom = {
  form: document.querySelector("#rideForm"),
  timeline: document.querySelector("#timeline"),
  template: document.querySelector("#segmentTemplate"),
  statusPill: document.querySelector("#statusPill"),
  samples: document.querySelector("#samples"),
  samplesOut: document.querySelector("#samplesOut"),
  summaryCards: document.querySelector("#summaryCards"),
  routeMapEl: document.querySelector("#routeMap"),
  planMapEl: document.querySelector("#planMap"),
  planHint: document.querySelector("#planHint"),
  waypointList: document.querySelector("#waypointList"),
  waypointCount: document.querySelector("#waypointCount"),
  undoWaypoint: document.querySelector("#undoWaypoint"),
  clearWaypoints: document.querySelector("#clearWaypoints"),
  routeFile: document.querySelector("#routeFile"),
  importStatus: document.querySelector("#importStatus"),
  routeSource: document.querySelector("#routeSource"),
  saveName: document.querySelector("#saveName"),
  saveRoute: document.querySelector("#saveRoute"),
  exportRoute: document.querySelector("#exportRoute"),
  exportPlanRoute: document.querySelector("#exportPlanRoute"),
  savedRoutes: document.querySelector("#savedRoutes"),
  savedCount: document.querySelector("#savedCount"),
  departure: document.querySelector("#departure"),
  menuButtons: document.querySelectorAll(".menu-button"),
  windowPanels: document.querySelectorAll(".window"),
};

let routeMap;
let routeLayer;
let planMap;
let planMarkersLayer;
let planLineLayer;

export function initPlanMap(onClick) {
  if (!window.L || !dom.planMapEl) return null;
  if (planMap) return planMap;
  planMap = L.map(dom.planMapEl, { scrollWheelZoom: true, zoomControl: true }).setView([40.4168, -3.7038], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(planMap);
  planMarkersLayer = L.layerGroup().addTo(planMap);
  planLineLayer = L.layerGroup().addTo(planMap);
  planMap.on("click", (event) => onClick(event.latlng.lat, event.latlng.lng));
  return planMap;
}

export function refreshPlanMap() {
  if (planMap) setTimeout(() => planMap.invalidateSize(), 0);
}

function waypointIcon(label, kind) {
  return L.divIcon({
    className: "",
    html: `<div class="waypoint-marker ${kind}">${label}</div>`,
    iconAnchor: [13, 13],
  });
}

export function renderWaypoints(waypoints) {
  dom.waypointCount.textContent = `${waypoints.length} ${waypoints.length === 1 ? "punto" : "puntos"}`;
  dom.waypointList.textContent = "";
  waypoints.forEach((point, index) => {
    const li = document.createElement("li");
    li.className = "waypoint-item";
    const role = index === 0 ? "Salida" : index === waypoints.length - 1 ? "Llegada" : `Punto ${index}`;
    const label = document.createElement("span");
    label.innerHTML = `<strong>${role}</strong> · ${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "mini-button danger-button";
    remove.textContent = "×";
    remove.dataset.action = "remove-waypoint";
    remove.dataset.index = String(index);
    li.append(label, remove);
    dom.waypointList.append(li);
  });

  if (!planMarkersLayer || !planLineLayer) return;
  planMarkersLayer.clearLayers();
  planLineLayer.clearLayers();
  if (!waypoints.length) return;
  waypoints.forEach((point, index) => {
    const kind = index === 0 ? "start" : index === waypoints.length - 1 && waypoints.length > 1 ? "end" : "via";
    const label = index === 0 ? "S" : index === waypoints.length - 1 && waypoints.length > 1 ? "L" : String(index);
    L.marker([point.lat, point.lon], { icon: waypointIcon(label, kind) }).addTo(planMarkersLayer);
  });
  if (waypoints.length > 1) {
    const latlngs = waypoints.map((p) => [p.lat, p.lon]);
    L.polyline(latlngs, { color: "#0c8f7a", weight: 3, opacity: 0.45, dashArray: "4 6" }).addTo(planLineLayer);
    if (waypoints.length === 2) planMap.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 11 });
  }
}

export function setPlanRoutePreview(coords) {
  if (!planLineLayer) return;
  planLineLayer.clearLayers();
  if (!coords || coords.length < 2) return;
  const latlngs = coords.map((c) => [c.lat, c.lon]);
  L.polyline(latlngs, { color: "#0c8f7a", weight: 4, opacity: 0.85 }).addTo(planLineLayer);
  if (planMap) planMap.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 13 });
}

export function setStatus(text) {
  if (dom.statusPill) dom.statusPill.textContent = text;
}

export function updateSamplesRange(distanceKm) {
  if (!dom.samples) return;
  const min = 4;
  let max;
  if (!distanceKm || distanceKm <= 0) max = 12;
  else max = Math.max(min, Math.min(30, Math.round(distanceKm / 6)));
  dom.samples.min = String(min);
  dom.samples.max = String(max);
  if (Number(dom.samples.value) > max) dom.samples.value = String(max);
  if (Number(dom.samples.value) < min) dom.samples.value = String(min);
  if (dom.samplesOut) dom.samplesOut.value = dom.samples.value;
  const rangeRow = dom.samples.parentElement?.querySelector(".range-row");
  if (rangeRow) {
    const spans = rangeRow.querySelectorAll("span");
    if (spans[0]) spans[0].textContent = String(min);
    if (spans[1]) spans[1].textContent = String(max);
  }
}

export function setWindow(name) {
  dom.menuButtons.forEach((button) => button.classList.toggle("active", button.dataset.window === name));
  dom.windowPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.windowPanel === name));
  if (name === "forecast" && routeMap) setTimeout(() => routeMap.invalidateSize(), 0);
  if (name === "plan" && planMap) setTimeout(() => planMap.invalidateSize(), 0);
}

export function renderTimeline(segments, rideBearing, mode) {
  dom.timeline.textContent = "";
  if (!segments.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Calcula una ruta";
    dom.timeline.append(empty);
    return;
  }

  segments.forEach((segment) => {
    const risk = riskFor(segment, rideBearing);
    const [label] = weatherLabels[segment.code] || ["Variable"];
    const card = dom.template.content.firstElementChild.cloneNode(true);
    card.dataset.risk = risk;
    const night = isNighttime(segment.arrival);
    card.querySelector(".segment-km").textContent = `${Math.round(segment.km)} km`;
    card.querySelector(".segment-name").textContent = label;
    card.querySelector(".weather-icon").textContent = weatherEmoji(segment.code);
    const timeStr = segment.arrival.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const compass = windCompass(segment.windDirection);
    card.querySelector(".segment-meta").textContent = `${night ? "🌙 " : ""}${timeStr} · ${Math.round(segment.wind)} km/h ${compass}`;
    card.querySelector(".temp").textContent = `${Math.round(segment.temperature)}°C`;
    card.querySelector(".wind").textContent = `${Math.round(segment.wind)} km/h`;
    card.querySelector(".gust").textContent = `${Math.round(segment.gust)} km/h`;
    card.querySelector(".rain").textContent = `${segment.rainChance}%`;
    const fill = card.querySelector(".bar-fill");
    fill.style.width = `${metricValue(segment, mode)}%`;
    fill.style.background = risk === "bad" ? "var(--danger)" : risk === "watch" ? "var(--accent-2)" : "var(--accent)";
    dom.timeline.append(card);
  });
}

export function renderSummary(distance, durationHours, segments, rideBearing, roadRatio) {
  const risks = segments.map((s) => riskFor(s, rideBearing));
  const bad = risks.filter((r) => r === "bad").length;
  const watch = risks.filter((r) => r === "watch").length;
  const riskLabel = bad ? "Duro" : watch ? "Vigilar" : "Bueno";
  const hours = Math.floor(durationHours);
  const minutes = Math.round((durationHours - hours) * 60);
  const roadCard = Number.isFinite(roadRatio)
    ? `<article class="metric"><span>Carretera</span><strong>${Math.round(roadRatio * 100)}%</strong></article>`
    : "";
  dom.summaryCards.innerHTML = `
    <article class="metric"><span>Distancia</span><strong>${Math.round(distance)} km</strong></article>
    <article class="metric"><span>Duracion</span><strong>${hours} h ${String(minutes).padStart(2, "0")} m</strong></article>
    <article class="metric"><span>Riesgo</span><strong>${riskLabel}</strong></article>
    ${roadCard}
  `;
}

function initMap() {
  if (!window.L) {
    dom.routeMapEl.innerHTML = '<div class="map-fallback">No se pudo cargar el mapa.</div>';
    return false;
  }
  if (routeMap) return true;
  routeMap = L.map(dom.routeMapEl, { scrollWheelZoom: true, zoomControl: true }).setView([40.4168, -3.7038], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(routeMap);
  routeLayer = L.layerGroup().addTo(routeMap);
  return true;
}

function riskColor(risk) {
  if (risk === "bad") return "#d84f3f";
  if (risk === "watch") return "#f0b429";
  return "#0c8f7a";
}

function markerIcon(className, label) {
  return L.divIcon({ className: "", html: `<div class="${className}">${label}</div>`, iconAnchor: [14, 14], popupAnchor: [0, -14] });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function metricColor(segment, mode) {
  if (mode === "rain") {
    if (segment.rainChance >= 70) return "#2563eb";
    if (segment.rainChance >= 35) return "#38bdf8";
    return "#0c8f7a";
  }
  if (mode === "temp") {
    if (segment.temperature <= 6) return "#2563eb";
    if (segment.temperature >= 32) return "#d84f3f";
    if (segment.temperature >= 24) return "#f0b429";
    return "#0c8f7a";
  }
  if (segment.gust >= 45) return "#d84f3f";
  if (segment.gust >= 28) return "#f0b429";
  return "#0c8f7a";
}

function metricIcon(segment, risk, mode) {
  const scale =
    mode === "rain"
      ? 0.82 + clamp(segment.rainChance, 0, 100) / 190
      : mode === "temp"
        ? 0.9 + clamp(Math.abs(segment.temperature - 18), 0, 22) / 80
        : 0.82 + clamp(segment.gust, 0, 60) / 95;
  const color = metricColor(segment, mode);
  if (mode === "rain") {
    const fill = clamp(segment.rainChance, 8, 100);
    return `<div class="route-marker metric-marker ${risk}" style="--marker-scale:${scale};--marker-bg:${color};--rain-fill:${fill}%"><span class="rain-icon"></span></div>`;
  }
  if (mode === "temp") {
    const fill = clamp(((segment.temperature + 5) / 45) * 100, 8, 100);
    return `<div class="route-marker metric-marker ${risk}" style="--marker-scale:${scale};--marker-bg:${color};--temp-fill:${fill}%"><span class="temp-icon"></span></div>`;
  }
  return `<div class="route-marker metric-marker ${risk}" style="--marker-scale:${scale};--marker-bg:${color}"><span class="wind-icon" style="transform: rotate(${segment.windDirection}deg)"></span></div>`;
}

function metricMarkerIcon(segment, risk, mode) {
  return L.divIcon({ className: "", html: metricIcon(segment, risk, mode), iconAnchor: [14, 14], popupAnchor: [0, -14] });
}

function segmentTooltip(segment, label) {
  const emoji = weatherEmoji(segment.code);
  const compass = windCompass(segment.windDirection);
  const night = isNighttime(segment.arrival) ? "🌙 " : "";
  return `
    <strong>${emoji} ${Math.round(segment.km)} km — ${label}</strong><br>
    ${night}${segment.arrival.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}<br>
    🌡️ ${Math.round(segment.temperature)}°C &nbsp; 💨 ${Math.round(segment.wind)} km/h ${compass}<br>
    🌧️ ${segment.rainChance}%
  `;
}

export function drawRoute(segments = [], startName = "Salida", endName = "Llegada", rideBearing = 0, routeCoords = segments, mode = "wind") {
  if (!initMap()) return;
  routeLayer.clearLayers();
  if (!segments.length) {
    if (routeCoords.length > 1) {
      const previewLatLngs = routeCoords.map((point) => [point.lat, point.lon]);
      L.polyline(previewLatLngs, { color: "#172026", opacity: 0.7, weight: 7 }).addTo(routeLayer);
      routeMap.fitBounds(L.latLngBounds(previewLatLngs), { padding: [36, 36], maxZoom: 12 });
      return;
    }
    routeMap.setView([40.4168, -3.7038], 7);
    return;
  }
  const routeLatLngs = routeCoords.map((point) => [point.lat, point.lon]);
  const segmentLatLngs = segments.map((segment) => [segment.lat, segment.lon]);
  L.polyline(routeLatLngs, { color: "#172026", opacity: 0.25, weight: 13 }).addTo(routeLayer);
  for (let index = 1; index < segments.length; index += 1) {
    const risk = riskFor(segments[index], rideBearing);
    L.polyline(routeSlice(routeCoords, segments[index - 1].progress, segments[index].progress), {
      color: riskColor(risk),
      opacity: 0.94,
      weight: 7,
    }).addTo(routeLayer);
  }
  segments.forEach((segment) => {
    const risk = riskFor(segment, rideBearing);
    const [label] = weatherLabels[segment.code] || ["Variable"];
    L.marker([segment.lat, segment.lon], { icon: metricMarkerIcon(segment, risk, mode) })
      .bindTooltip(segmentTooltip(segment, label), { direction: "top", opacity: 0.96, sticky: true })
      .bindPopup(segmentTooltip(segment, label))
      .addTo(routeLayer);
  });
  L.marker(segmentLatLngs[0], { icon: markerIcon("endpoint-marker", "Salida") }).bindPopup(startName).addTo(routeLayer);
  L.marker(segmentLatLngs[segmentLatLngs.length - 1], { icon: markerIcon("endpoint-marker", "Meta") }).bindPopup(endName).addTo(routeLayer);
  setTimeout(() => {
    routeMap.invalidateSize();
    routeMap.fitBounds(L.latLngBounds(routeLatLngs), { padding: [36, 36], maxZoom: 11 });
  }, 0);
}

export function showAutocomplete(listEl, suggestions, onSelect) {
  listEl.innerHTML = "";
  if (!suggestions.length) {
    listEl.hidden = true;
    return;
  }
  suggestions.forEach((suggestion) => {
    const li = document.createElement("li");
    li.className = "autocomplete-item";
    li.textContent = suggestion.label;
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onSelect(suggestion);
      listEl.hidden = true;
    });
    listEl.append(li);
  });
  listEl.hidden = false;
}

export function hideAutocomplete(listEl) {
  listEl.hidden = true;
}

export function toggleTheme() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const next = isDark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("ridecast.theme", next);
  const btn = document.querySelector("#themeToggle");
  if (btn) btn.textContent = next === "dark" ? "☀️" : "🌙";
}

export function initTheme() {
  const saved = localStorage.getItem("ridecast.theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  const btn = document.querySelector("#themeToggle");
  if (btn) btn.textContent = saved === "dark" ? "☀️" : "🌙";
}

export function renderSavedRoutes(routes) {
  dom.savedCount.textContent = `${routes.length} ${routes.length === 1 ? "ruta" : "rutas"}`;
  dom.savedRoutes.textContent = "";
  if (!routes.length) {
    const empty = document.createElement("div");
    empty.className = "saved-empty";
    empty.textContent = "Sin rutas guardadas";
    dom.savedRoutes.append(empty);
    return;
  }
  routes.forEach((route) => {
    const item = document.createElement("article");
    item.className = "saved-route";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    title.textContent = route.name;
    meta.textContent = `${Math.round(route.distance || pathDistance(route.coords))} km`;
    info.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "saved-actions";
    const load = document.createElement("button");
    load.type = "button";
    load.className = "mini-button";
    load.textContent = "Cargar";
    load.dataset.action = "load";
    load.dataset.id = route.id;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "mini-button danger-button";
    remove.textContent = "Borrar";
    remove.dataset.action = "delete";
    remove.dataset.id = route.id;
    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "mini-button";
    exportBtn.textContent = "GPX";
    exportBtn.dataset.action = "export";
    exportBtn.dataset.id = route.id;
    actions.append(load, exportBtn, remove);
    item.append(info, actions);
    dom.savedRoutes.append(item);
  });
}

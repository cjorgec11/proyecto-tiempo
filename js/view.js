import { metricValue, pathDistance, riskFor, routeSlice, weatherBadge, weatherLabels } from "./model.js";

export const dom = {
  form: document.querySelector("#rideForm"),
  timeline: document.querySelector("#timeline"),
  template: document.querySelector("#segmentTemplate"),
  statusPill: document.querySelector("#statusPill"),
  samples: document.querySelector("#samples"),
  samplesOut: document.querySelector("#samplesOut"),
  summaryCards: document.querySelector("#summaryCards"),
  routeMapEl: document.querySelector("#routeMap"),
  routeFile: document.querySelector("#routeFile"),
  importStatus: document.querySelector("#importStatus"),
  routeSource: document.querySelector("#routeSource"),
  stravaConnect: document.querySelector("#stravaConnect"),
  wikilocConnect: document.querySelector("#wikilocConnect"),
  saveName: document.querySelector("#saveName"),
  saveRoute: document.querySelector("#saveRoute"),
  savedRoutes: document.querySelector("#savedRoutes"),
  savedCount: document.querySelector("#savedCount"),
  departure: document.querySelector("#departure"),
  menuButtons: document.querySelectorAll(".menu-button"),
  windowPanels: document.querySelectorAll(".window"),
};

let routeMap;
let routeLayer;

export function setStatus(text) {
  dom.statusPill.textContent = text;
}

export function setWindow(name) {
  dom.menuButtons.forEach((button) => button.classList.toggle("active", button.dataset.window === name));
  dom.windowPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.windowPanel === name));
  if (name === "forecast" && routeMap) setTimeout(() => routeMap.invalidateSize(), 0);
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
    card.querySelector(".segment-km").textContent = `${Math.round(segment.km)} km`;
    card.querySelector(".segment-name").textContent = label;
    card.querySelector(".weather-icon").textContent = weatherBadge(segment.code);
    card.querySelector(".segment-meta").textContent = segment.arrival.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
    card.querySelector(".temp").textContent = `${Math.round(segment.temperature)} C`;
    card.querySelector(".wind").textContent = `${Math.round(segment.wind)} km/h`;
    card.querySelector(".gust").textContent = `${Math.round(segment.gust)} km/h`;
    card.querySelector(".rain").textContent = `${segment.rainChance}%`;
    const fill = card.querySelector(".bar-fill");
    fill.style.width = `${metricValue(segment, mode)}%`;
    fill.style.background = risk === "bad" ? "var(--danger)" : risk === "watch" ? "var(--accent-2)" : "var(--accent)";
    dom.timeline.append(card);
  });
}

export function renderSummary(distance, durationHours, segments, rideBearing) {
  const risks = segments.map((s) => riskFor(s, rideBearing));
  const bad = risks.filter((r) => r === "bad").length;
  const watch = risks.filter((r) => r === "watch").length;
  const riskLabel = bad ? "Duro" : watch ? "Vigilar" : "Bueno";
  const hours = Math.floor(durationHours);
  const minutes = Math.round((durationHours - hours) * 60);
  dom.summaryCards.innerHTML = `
    <article class="metric"><span>Distancia</span><strong>${Math.round(distance)} km</strong></article>
    <article class="metric"><span>Duracion</span><strong>${hours} h ${String(minutes).padStart(2, "0")} m</strong></article>
    <article class="metric"><span>Riesgo</span><strong>${riskLabel}</strong></article>
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
  return `
    <strong>${Math.round(segment.km)} km - ${label}</strong><br>
    Hora: ${segment.arrival.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}<br>
    Temp: ${Math.round(segment.temperature)} C<br>
    Viento: ${Math.round(segment.wind)} km/h, racha ${Math.round(segment.gust)} km/h<br>
    Lluvia: ${segment.rainChance}%
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
    actions.append(load, remove);
    item.append(info, actions);
    dom.savedRoutes.append(item);
  });
}

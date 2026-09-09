// Vista: DOM, mapas e interacción visual. El controlador coordina los datos.
import { buildGpx, metricValue, pathDistance, riskFor, routeSlice, weatherLabels, windCompass } from "./model.js";

const ids = ["timeline", "samples", "samplesOut", "summaryCards", "planMapWrap", "planFullscreenBtn",
  "waypointList", "waypointCount", "undoWaypoint", "clearWaypoints", "routeFile", "importStatus",
  "routeSource", "saveName", "saveRoute", "exportRoute", "exportPlanRoute", "savedRoutes", "savedCount", "departure"];
export const dom = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
Object.assign(dom, {
  form: document.querySelector("#rideForm"), template: document.querySelector("#segmentTemplate"),
  routeMapEl: document.querySelector("#routeMap"), planMapEl: document.querySelector("#planMap"),
  menuButtons: document.querySelectorAll(".menu-button"), windowPanels: document.querySelectorAll(".window"),
});

export function icon(name) {
  const definition = window.lucide?.icons[name];
  if (!definition) return document.createElement("span");
  const element = window.lucide.createElement(definition);
  element.classList.add("lucide");
  element.setAttribute("aria-hidden", "true");
  return element;
}

export function initIcons() {
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true" } });
}

export function showStatus(message, type = "info") {
  const status = document.querySelector("#appStatus");
  status.hidden = !message;
  status.dataset.type = type;
  status.textContent = message;
}

let mapaRuta, capaRuta, mapaPlan, capaMarcadoresPlan, capaLineaPlan;
let routeBounds = null, pendingFit = false, lastCoords = null;
const tiles = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function makeMap(element, zoom) {
  if (!window.L) {
    element.innerHTML = '<div class="map-fallback">El mapa no está disponible. Revisa la conexión y recarga la página.</div>';
    return null;
  }
  const map = L.map(element, { scrollWheelZoom: true }).setView([40.4168, -3.7038], zoom);
  L.tileLayer(tiles, { attribution, maxZoom: 19 }).addTo(map);
  return map;
}

export function initPlanMap(onClick) {
  if (mapaPlan) return;
  mapaPlan = makeMap(dom.planMapEl, 6);
  if (!mapaPlan) return;
  capaMarcadoresPlan = L.layerGroup().addTo(mapaPlan);
  capaLineaPlan = L.layerGroup().addTo(mapaPlan);
  mapaPlan.on("click", (event) => onClick(event.latlng.lat, event.latlng.lng));
  new ResizeObserver(() => mapaPlan.invalidateSize()).observe(dom.planMapEl);
}

export function refreshPlanMap() {
  requestAnimationFrame(() => mapaPlan?.invalidateSize());
}

export function togglePlanFullscreen() {
  const active = dom.planMapWrap.classList.toggle("fullscreen");
  document.body.classList.toggle("map-fullscreen-open", active);
  const label = active ? "Salir de pantalla completa" : "Pantalla completa";
  dom.planFullscreenBtn.setAttribute("aria-label", label);
  dom.planFullscreenBtn.title = label;
  dom.planFullscreenBtn.replaceChildren(icon(active ? "Minimize" : "Maximize"));
  refreshPlanMap();
}

export function renderWaypoints(points) {
  dom.waypointCount.textContent = `${points.length} ${points.length === 1 ? "punto" : "puntos"}`;
  dom.undoWaypoint.disabled = !points.length;
  dom.waypointList.replaceChildren();
  capaMarcadoresPlan?.clearLayers();
  capaLineaPlan?.clearLayers();
  points.forEach((point, index) => {
    const end = index === points.length - 1 && index > 0;
    const role = index === 0 ? "Salida" : end ? "Llegada" : `Punto ${index}`;
    const item = document.createElement("li");
    item.className = "waypoint-item";
    const label = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = role;
    label.append(name, ` · ${point.snapping ? "Ajustando…" : point.lat.toFixed(4) + ", " + point.lon.toFixed(4)}`);
    const remove = actionButton("Quitar " + role.toLowerCase(), "remove-waypoint", String(index), "X");
    remove.dataset.index = String(index);
    item.append(label, remove);
    dom.waypointList.append(item);
    if (capaMarcadoresPlan) {
      L.marker([point.lat, point.lon], {
        title: role,
        icon: L.divIcon({ className: "", html: `<div class="waypoint-marker ${end ? "end" : ""}">${index === 0 ? "S" : end ? "L" : index}</div>`, iconSize: [28,28], iconAnchor: [14,14] }),
      }).addTo(capaMarcadoresPlan);
    }
  });
  if (points.length > 1 && capaLineaPlan) {
    L.polyline(points.map((p) => [p.lat, p.lon]), { color: "#087e6e", weight: 3, opacity: .5, dashArray: "4 6" }).addTo(capaLineaPlan);
  }
}

export function setPlanRoutePreview(coords, fit = false) {
  if (!capaLineaPlan) return;
  capaLineaPlan.clearLayers();
  if (!coords?.length) return;
  const latLngs = coords.map((p) => [p.lat, p.lon]);
  L.polyline(latLngs, { color: "#087e6e", weight: 4 }).addTo(capaLineaPlan);
  if (fit) requestAnimationFrame(() => {
    mapaPlan.invalidateSize();
    mapaPlan.fitBounds(L.latLngBounds(latLngs), { padding: [35,35], maxZoom: 14 });
  });
}

export function updateSamplesRange() {
  dom.samplesOut.value = dom.samples.value;
}

const pages = { plan: ["Tu próxima salida", "PLANIFICADOR"], library: ["Mis rutas", "COLECCIÓN"], forecast: ["Previsión de la ruta", "TIEMPO"] };
export function setWindow(name) {
  if (!pages[name]) name = "plan";
  dom.menuButtons.forEach((button) => {
    const active = button.dataset.window === name;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  dom.windowPanels.forEach((panel) => {
    const active = panel.dataset.windowPanel === name;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  document.querySelector("#pageTitle").textContent = pages[name][0];
  document.querySelector("#pageEyebrow").textContent = pages[name][1];
  document.title = `RideCast | ${pages[name][0]}`;
  if (location.hash !== "#" + name) location.hash = name;
  if (name === "plan") refreshPlanMap();
  if (name === "forecast") requestAnimationFrame(() => {
    mapaRuta?.invalidateSize();
    if (pendingFit) fitRoute();
  });
}

function weatherIcon(code) {
  if (code === 0 || code === 1) return "Sun";
  if (code === 2) return "CloudSun";
  if (code === 3) return "Cloud";
  if ([45,48].includes(code)) return "CloudFog";
  if (code >= 95) return "CloudLightning";
  if ([71,73,75,77,85,86].includes(code)) return "CloudSnow";
  if ([51,53,55,56,57].includes(code)) return "CloudDrizzle";
  return "CloudRain";
}

export function renderTimeline(segments, heading, mode) {
  dom.timeline.replaceChildren();
  if (!segments.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Todavía no hay una previsión para esta ruta.";
    dom.timeline.append(empty);
    return;
  }
  segments.forEach((segment) => {
    const risk = riskFor(segment, heading);
    const card = dom.template.content.firstElementChild.cloneNode(true);
    card.dataset.risk = risk;
    card.querySelector(".segment-km").textContent = `${segment.km.toFixed(1)} km`;
    card.querySelector(".segment-name").textContent = weatherLabels[segment.code]?.[0] || "Variable";
    card.querySelector(".weather-icon").replaceChildren(icon(weatherIcon(segment.code)));
    card.querySelector(".segment-meta").textContent = segment.arrival.toLocaleString("es-ES", { weekday: "short", hour: "2-digit", minute: "2-digit" });
    card.querySelector(".temp").textContent = `${Math.round(segment.temperature)} °C`;
    card.querySelector(".wind").textContent = `${Math.round(segment.wind)} km/h ${windCompass(segment.windDirection)}`;
    card.querySelector(".gust").textContent = `${Math.round(segment.gust)} km/h`;
    card.querySelector(".rain").textContent = `${Math.round(segment.rainChance)} %`;
    card.querySelector(".bar-fill").style.cssText = `width:${metricValue(segment, mode)}%;background:${riskColor(risk)}`;
    dom.timeline.append(card);
  });
}

export function renderSummary(distance = 0, hours = 0, segments = [], heading = 0) {
  const minutes = Math.round(hours * 60);
  const risks = segments.map((segment) => riskFor(segment, heading));
  const temps = segments.map((segment) => segment.temperature);
  const conditions = risks.includes("bad") ? "Exigentes" : risks.includes("watch") ? "Atención" : "Favorables";
  const values = [
    ["Distancia", distance ? `${distance.toFixed(1)} km` : "—"],
    ["Duración estimada", distance ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : "—"],
    ["Temperatura", temps.length ? `${Math.round(Math.min(...temps))} a ${Math.round(Math.max(...temps))} °C` : "—"],
    ["Condiciones", segments.length ? conditions : "—"],
  ];
  dom.summaryCards.replaceChildren(...values.map(([label, value]) => {
    const article = document.createElement("article");
    article.className = "metric";
    const title = document.createElement("span");
    title.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    article.append(title, strong);
    return article;
  }));
}

function riskColor(risk) {
  return risk === "bad" ? "#ce534b" : risk === "watch" ? "#bd891d" : "#087e6e";
}

function metricPin(segment, mode) {
  let name, color;
  if (mode === "rain") {
    name = segment.rainChance >= 70 ? "CloudRain" : segment.rainChance >= 30 ? "CloudDrizzle" : "Droplet";
    color = segment.rainChance >= 70 ? "#2756ac" : segment.rainChance >= 30 ? "#277fa4" : "#087e6e";
  } else if (mode === "temp") {
    name = segment.temperature <= 6 ? "ThermometerSnowflake" : segment.temperature >= 28 ? "ThermometerSun" : "Thermometer";
    color = segment.temperature <= 6 ? "#2756ac" : segment.temperature >= 32 ? "#ce534b" : segment.temperature >= 24 ? "#aa7611" : "#087e6e";
  } else {
    name = segment.wind < 2 ? "Wind" : "ArrowUp";
    color = segment.gust >= 45 ? "#ce534b" : segment.gust >= 28 ? "#aa7611" : "#087e6e";
  }
  const pin = document.createElement("div");
  pin.className = "weather-pin";
  pin.style.setProperty("--pin-color", color);
  const glyph = icon(name);
  if (mode === "wind" && segment.wind >= 2) glyph.style.transform = `rotate(${(segment.windDirection + 180) % 360}deg)`;
  pin.append(glyph);
  return L.divIcon({ className: "", html: pin, iconSize: [34,34], iconAnchor: [17,17], popupAnchor: [0,-18], tooltipAnchor: [0,-18] });
}

function tooltip(segment, index, count) {
  const box = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = `${index === 0 ? "Salida · " : index === count - 1 ? "Llegada · " : ""}${segment.km.toFixed(1)} km · ${weatherLabels[segment.code]?.[0] || "Variable"}`;
  box.append(strong);
  [
    segment.arrival.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    `Temperatura: ${Math.round(segment.temperature)} °C`,
    `Viento: ${Math.round(segment.wind)} km/h desde ${windCompass(segment.windDirection)}`,
    `Rachas: ${Math.round(segment.gust)} km/h`,
    `Lluvia: ${Math.round(segment.rainChance)} % · ${segment.precipitation} mm`,
  ].forEach((text) => { box.append(document.createElement("br"), text); });
  return box;
}

export function fitRoute() {
  if (!mapaRuta || !routeBounds || !dom.routeMapEl.offsetWidth) return;
  mapaRuta.invalidateSize();
  mapaRuta.fitBounds(routeBounds, { padding: [45,45], maxZoom: 14 });
  pendingFit = false;
}

export function drawRoute(segments = [], startName = "Salida", endName = "Llegada", heading = 0, coords = segments, mode = "wind") {
  if (!mapaRuta) {
    mapaRuta = makeMap(dom.routeMapEl, 6);
    if (!mapaRuta) return;
    capaRuta = L.layerGroup().addTo(mapaRuta);
    new ResizeObserver(() => mapaRuta.invalidateSize()).observe(dom.routeMapEl);
  }
  capaRuta.clearLayers();
  if (coords.length < 2) {
    lastCoords = null; routeBounds = null; pendingFit = false;
    return;
  }
  const latLngs = coords.map((point) => [point.lat, point.lon]);
  routeBounds = L.latLngBounds(latLngs);
  if (lastCoords !== coords) pendingFit = true;
  lastCoords = coords;
  L.polyline(latLngs, { color: "#243a32", opacity: .25, weight: 10 }).addTo(capaRuta);
  if (!segments.length) {
    L.polyline(latLngs, { color: "#087e6e", weight: 5 }).addTo(capaRuta);
  }
  for (let index = 1; index < segments.length; index += 1) {
    L.polyline(routeSlice(coords, segments[index - 1].progress, segments[index].progress), {
      color: riskColor(riskFor(segments[index], heading)), weight: 5, opacity: .95,
    }).addTo(capaRuta);
  }
  segments.forEach((segment, index) => {
    const content = tooltip(segment, index, segments.length);
    L.marker([segment.lat, segment.lon], {
      icon: metricPin(segment, mode),
      title: content.textContent,
      alt: `Previsión en el kilómetro ${segment.km.toFixed(1)}`,
    }).bindTooltip(content, { direction: "top", opacity: .98 })
      .bindPopup(content.cloneNode(true)).addTo(capaRuta);
  });
  if (pendingFit) requestAnimationFrame(fitRoute);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const button = document.querySelector("#themeToggle");
  button.replaceChildren(icon(theme === "dark" ? "Sun" : "Moon"));
  button.title = theme === "dark" ? "Activar tema claro" : "Activar tema oscuro";
  button.setAttribute("aria-label", button.title);
}
export function toggleTheme() {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(theme);
  try { localStorage.setItem("ridecast.theme", theme); } catch { /* El tema también funciona sin almacenamiento. */ }
}
export function initTheme() {
  let theme = "light";
  try { theme = localStorage.getItem("ridecast.theme") === "dark" ? "dark" : "light"; } catch {}
  applyTheme(theme);
}

export function renderSavedRoutes(routes) {
  dom.savedCount.textContent = `${routes.length} ${routes.length === 1 ? "ruta" : "rutas"}`;
  document.querySelector("#navCount").textContent = String(routes.length);
  const query = document.querySelector("#routeSearch").value.trim().toLocaleLowerCase("es");
  const sort = document.querySelector("#routeSort").value;
  const filtered = routes.filter((route) => route.name.toLocaleLowerCase("es").includes(query));
  filtered.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "es")
    : sort === "distance" ? pathDistance(b.coords) - pathDistance(a.coords)
    : (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  dom.savedRoutes.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "saved-empty";
    empty.append(icon("FolderHeart"), routes.length ? "No hay rutas con ese nombre." : "Tu colección todavía está vacía.");
    dom.savedRoutes.append(empty);
    return;
  }
  filtered.forEach((route) => {
    const row = document.createElement("article");
    row.className = "saved-route";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = route.name;
    const meta = document.createElement("span");
    const date = new Date(route.createdAt);
    meta.textContent = `${pathDistance(route.coords).toFixed(1)} km${Number.isFinite(date.getTime()) ? " · " + date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : ""}`;
    info.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "saved-actions";
    actions.append(actionButton("Abrir " + route.name, "load", route.id, "ArrowUpRight"),
      actionButton("Exportar GPX", "export", route.id, "Download"),
      actionButton("Borrar " + route.name, "delete", route.id, "Trash2"));
    row.append(info, actions);
    dom.savedRoutes.append(row);
  });
}

function actionButton(label, action, id, glyph) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mini-button" + (action === "delete" ? " danger-button" : "");
  button.title = label;
  button.setAttribute("aria-label", label);
  button.dataset.action = action;
  button.dataset.id = id;
  button.append(icon(glyph));
  return button;
}

export function downloadGpx(name, coords) {
  const url = URL.createObjectURL(new Blob([buildGpx(name, coords)], { type: "application/gpx+xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(name || "ruta").replace(/[^a-z0-9-_]+/gi, "_")}.gpx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

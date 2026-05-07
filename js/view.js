// Vista: todo lo relacionado con pintar en el DOM y gestionar los mapas Leaflet.
// No contiene lógica de negocio. El controlador (controller.js) la coordina.

import {
  isNighttime,
  metricValue,
  pathDistance,
  riskFor,
  routeSlice,
  weatherEmoji,
  weatherLabels,
  windCompass,
} from "./model.js";

// Referencias rápidas a elementos del DOM que se usan a menudo.
export const dom = {
  form: document.querySelector("#rideForm"),
  timeline: document.querySelector("#timeline"),
  template: document.querySelector("#segmentTemplate"),
  samples: document.querySelector("#samples"),
  samplesOut: document.querySelector("#samplesOut"),
  summaryCards: document.querySelector("#summaryCards"),
  routeMapEl: document.querySelector("#routeMap"),
  planMapEl: document.querySelector("#planMap"),
  planMapWrap: document.querySelector("#planMapWrap"),
  planFullscreenBtn: document.querySelector("#planFullscreenBtn"),
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

// Mapas Leaflet (uno para planificar y otro para ver el resultado).
let mapaRuta;
let capaRuta;
let mapaPlan;
let capaMarcadoresPlan;
let capaLineaPlan;

// URL de los tiles de OpenStreetMap (mismo servidor para ambos mapas).
const TILES_OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATRIBUCION_OSM =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Inicializa el mapa de planificación. Recibe la función a llamar al hacer clic.
export function initPlanMap(alPulsar) {
  if (!window.L || !dom.planMapEl) return null;
  if (mapaPlan) return mapaPlan;
  mapaPlan = L.map(dom.planMapEl, { scrollWheelZoom: true, zoomControl: true })
    .setView([40.4168, -3.7038], 6);
  L.tileLayer(TILES_OSM, { attribution: ATRIBUCION_OSM, maxZoom: 19 }).addTo(mapaPlan);
  capaMarcadoresPlan = L.layerGroup().addTo(mapaPlan);
  capaLineaPlan = L.layerGroup().addTo(mapaPlan);
  mapaPlan.on("click", (evento) => alPulsar(evento.latlng.lat, evento.latlng.lng));
  return mapaPlan;
}

// Tras cambiar de tamaño el contenedor, hay que avisar a Leaflet.
export function refreshPlanMap() {
  if (mapaPlan) setTimeout(() => mapaPlan.invalidateSize(), 0);
}

// Alterna el modo pantalla completa del mapa de planificación.
export function togglePlanFullscreen() {
  if (!dom.planMapWrap) return;
  const activo = dom.planMapWrap.classList.toggle("fullscreen");
  document.body.classList.toggle("map-fullscreen-open", activo);
  if (dom.planFullscreenBtn) {
    dom.planFullscreenBtn.setAttribute(
      "aria-label",
      activo ? "Salir de pantalla completa" : "Pantalla completa",
    );
  }
  // Leaflet necesita recalcular dimensiones al cambiar el contenedor.
  refreshPlanMap();
}

// Crea el icono coloreado de un punto (salida, llegada o intermedio).
function iconoPunto(etiqueta, tipo) {
  return L.divIcon({
    className: "",
    html: `<div class="waypoint-marker ${tipo}">${etiqueta}</div>`,
    iconAnchor: [13, 13],
  });
}

// Pinta la lista de puntos y los marcadores en el mapa.
export function renderWaypoints(puntos) {
  dom.waypointCount.textContent = `${puntos.length} ${puntos.length === 1 ? "punto" : "puntos"}`;
  dom.waypointList.textContent = "";
  puntos.forEach((punto, indice) => {
    const li = document.createElement("li");
    li.className = "waypoint-item";
    const rol =
      indice === 0
        ? "Salida"
        : indice === puntos.length - 1
          ? "Llegada"
          : `Punto ${indice}`;
    const etiqueta = document.createElement("span");
    etiqueta.innerHTML = `<strong>${rol}</strong> · ${punto.lat.toFixed(4)}, ${punto.lon.toFixed(4)}`;
    const botonQuitar = document.createElement("button");
    botonQuitar.type = "button";
    botonQuitar.className = "mini-button danger-button";
    botonQuitar.textContent = "×";
    botonQuitar.dataset.action = "remove-waypoint";
    botonQuitar.dataset.index = String(indice);
    li.append(etiqueta, botonQuitar);
    dom.waypointList.append(li);
  });

  if (!capaMarcadoresPlan || !capaLineaPlan) return;
  capaMarcadoresPlan.clearLayers();
  capaLineaPlan.clearLayers();
  if (!puntos.length) return;
  puntos.forEach((punto, indice) => {
    const esUltimo = indice === puntos.length - 1 && puntos.length > 1;
    const tipo = indice === 0 ? "start" : esUltimo ? "end" : "via";
    const etiqueta = indice === 0 ? "S" : esUltimo ? "L" : String(indice);
    L.marker([punto.lat, punto.lon], { icon: iconoPunto(etiqueta, tipo) }).addTo(
      capaMarcadoresPlan,
    );
  });
  if (puntos.length > 1) {
    const coordenadas = puntos.map((p) => [p.lat, p.lon]);
    L.polyline(coordenadas, {
      color: "#0c8f7a",
      weight: 3,
      opacity: 0.45,
      dashArray: "4 6",
    }).addTo(capaLineaPlan);
    if (puntos.length === 2) {
      mapaPlan.fitBounds(L.latLngBounds(coordenadas), { padding: [40, 40], maxZoom: 11 });
    }
  }
}

// Muestra una previsualización de la ruta calculada por OSRM en el mapa de planificación.
export function setPlanRoutePreview(coordenadas) {
  if (!capaLineaPlan) return;
  capaLineaPlan.clearLayers();
  if (!coordenadas || coordenadas.length < 2) return;
  const latLngs = coordenadas.map((c) => [c.lat, c.lon]);
  L.polyline(latLngs, { color: "#0c8f7a", weight: 4, opacity: 0.85 }).addTo(capaLineaPlan);
  if (mapaPlan) mapaPlan.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 13 });
}

// Ajusta el rango del slider de tramos según la distancia total de la ruta.
export function updateSamplesRange(distanciaKm) {
  if (!dom.samples) return;
  const min = 4;
  let max;
  if (!distanciaKm || distanciaKm <= 0) max = 12;
  else max = Math.max(min, Math.min(30, Math.round(distanciaKm / 6)));
  dom.samples.min = String(min);
  dom.samples.max = String(max);
  if (Number(dom.samples.value) > max) dom.samples.value = String(max);
  if (Number(dom.samples.value) < min) dom.samples.value = String(min);
  if (dom.samplesOut) dom.samplesOut.value = dom.samples.value;
  const filaRango = dom.samples.parentElement?.querySelector(".range-row");
  if (filaRango) {
    const spans = filaRango.querySelectorAll("span");
    if (spans[0]) spans[0].textContent = String(min);
    if (spans[1]) spans[1].textContent = String(max);
  }
}

// Cambia la pestaña visible (planificar, rutas, mapa y tiempo).
export function setWindow(nombre) {
  dom.menuButtons.forEach((boton) =>
    boton.classList.toggle("active", boton.dataset.window === nombre),
  );
  dom.windowPanels.forEach((panel) =>
    panel.classList.toggle("active", panel.dataset.windowPanel === nombre),
  );
  if (nombre === "forecast" && mapaRuta) setTimeout(() => mapaRuta.invalidateSize(), 0);
  if (nombre === "plan" && mapaPlan) setTimeout(() => mapaPlan.invalidateSize(), 0);
}

// Pinta las tarjetas de cada tramo en la línea temporal.
export function renderTimeline(tramos, rumboRuta, modo) {
  dom.timeline.textContent = "";
  if (!tramos.length) {
    const vacio = document.createElement("div");
    vacio.className = "empty";
    vacio.textContent = "Calcula una ruta";
    dom.timeline.append(vacio);
    return;
  }

  tramos.forEach((tramo) => {
    const riesgo = riskFor(tramo, rumboRuta);
    const [titulo] = weatherLabels[tramo.code] || ["Variable"];
    const tarjeta = dom.template.content.firstElementChild.cloneNode(true);
    tarjeta.dataset.risk = riesgo;
    const esNoche = isNighttime(tramo.arrival);
    tarjeta.querySelector(".segment-km").textContent = `${Math.round(tramo.km)} km`;
    tarjeta.querySelector(".segment-name").textContent = titulo;
    tarjeta.querySelector(".weather-icon").textContent = weatherEmoji(tramo.code);
    const hora = tramo.arrival.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const brujula = windCompass(tramo.windDirection);
    tarjeta.querySelector(".segment-meta").textContent =
      `${esNoche ? "🌙 " : ""}${hora} · ${Math.round(tramo.wind)} km/h ${brujula}`;
    tarjeta.querySelector(".temp").textContent = `${Math.round(tramo.temperature)}°C`;
    tarjeta.querySelector(".wind").textContent = `${Math.round(tramo.wind)} km/h`;
    tarjeta.querySelector(".gust").textContent = `${Math.round(tramo.gust)} km/h`;
    tarjeta.querySelector(".rain").textContent = `${tramo.rainChance}%`;
    const barra = tarjeta.querySelector(".bar-fill");
    barra.style.width = `${metricValue(tramo, modo)}%`;
    barra.style.background =
      riesgo === "bad"
        ? "var(--danger)"
        : riesgo === "watch"
          ? "var(--accent-2)"
          : "var(--accent)";
    dom.timeline.append(tarjeta);
  });
}

// Pinta las tarjetas resumen (distancia, duración, riesgo, % carretera).
export function renderSummary(distancia, duracionHoras, tramos, rumboRuta, ratioCarretera) {
  const riesgos = tramos.map((t) => riskFor(t, rumboRuta));
  const malos = riesgos.filter((r) => r === "bad").length;
  const vigilar = riesgos.filter((r) => r === "watch").length;
  const etiquetaRiesgo = malos ? "Duro" : vigilar ? "Vigilar" : "Bueno";
  const horas = Math.floor(duracionHoras);
  const minutos = Math.round((duracionHoras - horas) * 60);
  const tarjetaCarretera = Number.isFinite(ratioCarretera)
    ? `<article class="metric"><span>Carretera</span><strong>${Math.round(ratioCarretera * 100)}%</strong></article>`
    : "";
  dom.summaryCards.innerHTML = `
    <article class="metric"><span>Distancia</span><strong>${Math.round(distancia)} km</strong></article>
    <article class="metric"><span>Duracion</span><strong>${horas} h ${String(minutos).padStart(2, "0")} m</strong></article>
    <article class="metric"><span>Riesgo</span><strong>${etiquetaRiesgo}</strong></article>
    ${tarjetaCarretera}
  `;
}

// Inicializa el mapa de la pestaña "Mapa y tiempo" la primera vez que se necesita.
function initMapaRuta() {
  if (!window.L) {
    dom.routeMapEl.innerHTML = '<div class="map-fallback">No se pudo cargar el mapa.</div>';
    return false;
  }
  if (mapaRuta) return true;
  mapaRuta = L.map(dom.routeMapEl, { scrollWheelZoom: true, zoomControl: true })
    .setView([40.4168, -3.7038], 7);
  L.tileLayer(TILES_OSM, { attribution: ATRIBUCION_OSM, maxZoom: 19 }).addTo(mapaRuta);
  capaRuta = L.layerGroup().addTo(mapaRuta);
  return true;
}

// Devuelve el color asociado al riesgo de un tramo.
function colorRiesgo(riesgo) {
  if (riesgo === "bad") return "#d84f3f";
  if (riesgo === "watch") return "#f0b429";
  return "#0c8f7a";
}

// Crea un icono Leaflet a partir de HTML para usar en el mapa de ruta.
function iconoMarcador(claseCss, etiqueta) {
  return L.divIcon({
    className: "",
    html: `<div class="${claseCss}">${etiqueta}</div>`,
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function limitar(valor, min, max) {
  return Math.max(min, Math.min(max, valor));
}

// Color del marcador según la métrica seleccionada (viento/lluvia/temperatura).
function colorMetrica(tramo, modo) {
  if (modo === "rain") {
    if (tramo.rainChance >= 70) return "#2563eb";
    if (tramo.rainChance >= 35) return "#38bdf8";
    return "#0c8f7a";
  }
  if (modo === "temp") {
    if (tramo.temperature <= 6) return "#2563eb";
    if (tramo.temperature >= 32) return "#d84f3f";
    if (tramo.temperature >= 24) return "#f0b429";
    return "#0c8f7a";
  }
  if (tramo.gust >= 45) return "#d84f3f";
  if (tramo.gust >= 28) return "#f0b429";
  return "#0c8f7a";
}

// HTML del marcador con el icono adecuado a la métrica seleccionada.
function htmlIconoMetrica(tramo, riesgo, modo) {
  const escala =
    modo === "rain"
      ? 0.82 + limitar(tramo.rainChance, 0, 100) / 190
      : modo === "temp"
        ? 0.9 + limitar(Math.abs(tramo.temperature - 18), 0, 22) / 80
        : 0.82 + limitar(tramo.gust, 0, 60) / 95;
  const color = colorMetrica(tramo, modo);
  if (modo === "rain") {
    const relleno = limitar(tramo.rainChance, 8, 100);
    return `<div class="route-marker metric-marker ${riesgo}" style="--marker-scale:${escala};--marker-bg:${color};--rain-fill:${relleno}%"><span class="rain-icon"></span></div>`;
  }
  if (modo === "temp") {
    const relleno = limitar(((tramo.temperature + 5) / 45) * 100, 8, 100);
    return `<div class="route-marker metric-marker ${riesgo}" style="--marker-scale:${escala};--marker-bg:${color};--temp-fill:${relleno}%"><span class="temp-icon"></span></div>`;
  }
  return `<div class="route-marker metric-marker ${riesgo}" style="--marker-scale:${escala};--marker-bg:${color}"><span class="wind-icon" style="transform: rotate(${tramo.windDirection}deg)"></span></div>`;
}

function iconoMetrica(tramo, riesgo, modo) {
  return L.divIcon({
    className: "",
    html: htmlIconoMetrica(tramo, riesgo, modo),
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

// Texto del tooltip que aparece al pasar por encima de un marcador.
function tooltipTramo(tramo, titulo) {
  const emoji = weatherEmoji(tramo.code);
  const brujula = windCompass(tramo.windDirection);
  const noche = isNighttime(tramo.arrival) ? "🌙 " : "";
  return `
    <strong>${emoji} ${Math.round(tramo.km)} km — ${titulo}</strong><br>
    ${noche}${tramo.arrival.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}<br>
    🌡️ ${Math.round(tramo.temperature)}°C &nbsp; 💨 ${Math.round(tramo.wind)} km/h ${brujula}<br>
    🌧️ ${tramo.rainChance}%
  `;
}

// Pinta la ruta en el mapa principal: línea coloreada por riesgo y marcadores en cada tramo.
export function drawRoute(
  tramos = [],
  nombreSalida = "Salida",
  nombreLlegada = "Llegada",
  rumboRuta = 0,
  coordenadasRuta = tramos,
  modo = "wind",
) {
  if (!initMapaRuta()) return;
  capaRuta.clearLayers();
  if (!tramos.length) {
    if (coordenadasRuta.length > 1) {
      const previewLatLngs = coordenadasRuta.map((p) => [p.lat, p.lon]);
      L.polyline(previewLatLngs, { color: "#172026", opacity: 0.7, weight: 7 }).addTo(capaRuta);
      mapaRuta.fitBounds(L.latLngBounds(previewLatLngs), { padding: [36, 36], maxZoom: 12 });
      return;
    }
    mapaRuta.setView([40.4168, -3.7038], 7);
    return;
  }
  const latLngsRuta = coordenadasRuta.map((p) => [p.lat, p.lon]);
  const latLngsTramos = tramos.map((t) => [t.lat, t.lon]);
  // Línea de fondo gris oscuro para dar profundidad.
  L.polyline(latLngsRuta, { color: "#172026", opacity: 0.25, weight: 13 }).addTo(capaRuta);
  // Cada subtramo se pinta del color correspondiente a su riesgo.
  for (let i = 1; i < tramos.length; i += 1) {
    const riesgo = riskFor(tramos[i], rumboRuta);
    L.polyline(routeSlice(coordenadasRuta, tramos[i - 1].progress, tramos[i].progress), {
      color: colorRiesgo(riesgo),
      opacity: 0.94,
      weight: 7,
    }).addTo(capaRuta);
  }
  tramos.forEach((tramo) => {
    const riesgo = riskFor(tramo, rumboRuta);
    const [titulo] = weatherLabels[tramo.code] || ["Variable"];
    L.marker([tramo.lat, tramo.lon], { icon: iconoMetrica(tramo, riesgo, modo) })
      .bindTooltip(tooltipTramo(tramo, titulo), { direction: "top", opacity: 0.96, sticky: true })
      .bindPopup(tooltipTramo(tramo, titulo))
      .addTo(capaRuta);
  });
  L.marker(latLngsTramos[0], { icon: iconoMarcador("endpoint-marker", "Salida") })
    .bindPopup(nombreSalida)
    .addTo(capaRuta);
  L.marker(latLngsTramos[latLngsTramos.length - 1], {
    icon: iconoMarcador("endpoint-marker", "Meta"),
  })
    .bindPopup(nombreLlegada)
    .addTo(capaRuta);
  setTimeout(() => {
    mapaRuta.invalidateSize();
    mapaRuta.fitBounds(L.latLngBounds(latLngsRuta), { padding: [36, 36], maxZoom: 11 });
  }, 0);
}

// Aplica el tema (claro u oscuro) y guarda la preferencia.
export function toggleTheme() {
  const esOscuro = document.documentElement.getAttribute("data-theme") === "dark";
  const siguiente = esOscuro ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", siguiente);
  localStorage.setItem("ridecast.theme", siguiente);
  const boton = document.querySelector("#themeToggle");
  if (boton) boton.textContent = siguiente === "dark" ? "☀️" : "🌙";
}

export function initTheme() {
  const guardado = localStorage.getItem("ridecast.theme") || "light";
  document.documentElement.setAttribute("data-theme", guardado);
  const boton = document.querySelector("#themeToggle");
  if (boton) boton.textContent = guardado === "dark" ? "☀️" : "🌙";
}

// Pinta las rutas guardadas en la pestaña "Rutas".
export function renderSavedRoutes(rutas) {
  dom.savedCount.textContent = `${rutas.length} ${rutas.length === 1 ? "ruta" : "rutas"}`;
  dom.savedRoutes.textContent = "";
  if (!rutas.length) {
    const vacio = document.createElement("div");
    vacio.className = "saved-empty";
    vacio.textContent = "Sin rutas guardadas";
    dom.savedRoutes.append(vacio);
    return;
  }
  rutas.forEach((ruta) => {
    const fila = document.createElement("article");
    fila.className = "saved-route";
    const info = document.createElement("div");
    const titulo = document.createElement("strong");
    const meta = document.createElement("span");
    titulo.textContent = ruta.name;
    meta.textContent = `${Math.round(ruta.distance || pathDistance(ruta.coords))} km`;
    info.append(titulo, meta);
    const acciones = document.createElement("div");
    acciones.className = "saved-actions";
    const cargar = botonAccion("mini-button", "Cargar", "load", ruta.id);
    const exportar = botonAccion("mini-button", "GPX", "export", ruta.id);
    const borrar = botonAccion("mini-button danger-button", "Borrar", "delete", ruta.id);
    acciones.append(cargar, exportar, borrar);
    fila.append(info, acciones);
    dom.savedRoutes.append(fila);
  });
}

function botonAccion(clases, texto, accion, id) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = clases;
  boton.textContent = texto;
  boton.dataset.action = accion;
  boton.dataset.id = id;
  return boton;
}

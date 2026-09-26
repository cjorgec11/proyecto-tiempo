// Controlador: coordina el modelo, la vista y las operaciones asíncronas.
import { registrarRuta } from "./historial-rutas.js";
import { redVerificada } from "./red-verificada.js";
import { verificarSentidoExportacion } from "./verificar-exportacion.js";
import { generarCircuitoVerificado } from "./rutas-verificadas.js";
import { localidadesDelRecorrido, nombreConLocalidades } from "./localidades.js";
import { cuentaActual, rutasCuenta, guardarRutaEnServidor, eliminarRutaEnServidor, rutaEnServidor, actualizarCuenta } from "./cuenta.js";
import { bearing, interpretarArchivoRuta, distanciaRecorrido, leerRutasGuardadas, trazarRutaPorPuntos,
  generarRutaCircular, leerSugerencias, guardarSugerencia, leerRutasLocales,
  muestrearRuta, ajustarACarretera, fijarSalidaPredeterminada, state, consultarTiempo, escribirRutasGuardadas } from "./modelo.js";
import { dom, descargarGpx, dibujarRuta, encuadrarRuta, iniciarIconos, iniciarMapaPlanificador, iniciarTema,
  crearArchivoGpx, puedeCompartirGpx, compartirGpx, descargarArchivoGpx,
  centrarUbicacionPlanificador, mostrarSugerencias, exportarSugerencias,
  mostrarRutasGuardadas, mostrarResumen, mostrarCronologia, mostrarPuntosPaso, mostrarPuntosImportados, fijarVistaPreviaRuta,
  cambiarSeccion, mostrarEstado, alternarTema, alternarPantallaCompletaPlanificador, actualizarIntervaloMuestras } from "./vista.js";

let previewTimer, previewToken = 0, calculationToken = 0, importToken = 0, activeSavedId = null, autoGuestId = null;
let garminFile = null;
let locationRequest = 0;
let generationController = null;
let nameController = null, pendingName = null, currentAutoName = null;

function nombrarRecorrido(coords, base, generated = false) {
  nameController?.abort();
  const controller = nameController = new AbortController();
  const token = previewToken;
  const route = generated ? state.importedRoute : null;
  const promise = localidadesDelRecorrido(coords, {signal:controller.signal}).then(async places => {
    if (controller.signal.aborted || token !== previewToken || (generated && state.importedRoute !== route) || !places.length) return;
    const name = nombreConLocalidades(base, places);
    currentAutoName = name;
    if (generated) {
      const input = document.querySelector("#generatedRouteName");
      if (input.value === base) {
        route.name = name;
        input.value = name;
        dom.routeSource.textContent = name;
        document.querySelector("#forecastTitle").textContent = name;
        if (dom.importStatus.textContent.startsWith(`${base} · `)) dom.importStatus.textContent = dom.importStatus.textContent.replace(base, name);
        const result = document.querySelector("#generatorResult");
        if (result.textContent.startsWith(`${base} · `)) result.textContent = result.textContent.replace(base, name);
      }
    }
    if (!generated) {
      if (dom.routeSource.textContent.startsWith(`${state.currentDistance.toFixed(1)} km`)) dom.routeSource.textContent += ` · ${places.join(" · ")}`;
    }
    state.currentStartName = places[0];
    state.currentEndName = coords.length > 1 && Math.abs(coords[0].lat - coords.at(-1).lat) < 0.001
      && Math.abs(coords[0].lon - coords.at(-1).lon) < 0.001 ? places[0] : places.at(-1);
    if (dom.saveName.value === base) dom.saveName.value = name;
    if (!generated && activeSavedId && rutasCuenta() === null) {
      const routes = leerRutasLocales();
      const saved = routes.find(item => item.id === activeSavedId);
      if (saved?.name === base) {
        saved.name = name;
        saved.startName = state.currentStartName;
        saved.endName = state.currentEndName;
        escribirRutasGuardadas(routes);
        mostrarColeccion();
      }
    }
  }).catch(() => {});
  pendingName = {base,promise};
  promise.finally(() => { if (pendingName?.promise === promise) pendingName = null; });
}

function detenerGeneracion() {
  generationController?.abort();
  generationController = null;
  document.querySelector("#generarRuta").disabled = false;
  document.querySelector("#generarRuta span").textContent = "Generar ruta";
  document.querySelector("#cancelGeneration").hidden = true;
  document.querySelector("#generatorForm").setAttribute("aria-busy", "false");
  document.querySelector("#saveGeneratedRoute").disabled = false;
}

async function generarRuta(event) {
  event.preventDefault();
  if (!document.querySelector("#generatorForm").reportValidity()) return;
  const start = state.waypoints[0] || state.currentRouteCoords[0];
  const result = document.querySelector("#generatorResult");
  document.querySelector("#generatorDetails").hidden = true;
  if (!start) { result.textContent = "Elige una salida en el mapa o pulsa el botón de ubicación."; return; }
  if (state.waypoints.some(point => point.snapping)) { result.textContent = "Espera a que se ajusten los puntos al mapa."; return; }
  detenerGeneracion();
  ++previewToken;
  clearTimeout(previewTimer);
  const controller = generationController = new AbortController();
  const target = Number(document.querySelector("#targetDistance").value);
  const direction = document.querySelector("#routeDirection").value;
  const heading = direction === "auto" ? Math.random() * 360 : Number(direction);
  document.querySelector("#generarRuta").disabled = true;
  document.querySelector("#generarRuta span").textContent = "Buscando ruta…";
  document.querySelector("#cancelGeneration").hidden = false;
  document.querySelector("#generatorForm").setAttribute("aria-busy", "true");
  document.querySelector("#saveGeneratedRoute").disabled = true;
  try {
    const verified = document.querySelector("#terrainAssurance").value === "verified";
    const generate = verified ? (...args) => generarCircuitoVerificado(redVerificada, ...args) : generarRutaCircular;
    const route = await generate({lat:start.lat, lon:start.lon}, target, heading, {
      surface: document.querySelector("#routeSurface").value,
      waypoints: state.waypoints.slice(1).map(({lat,lon}) => ({lat,lon})),
      enforceHeading: direction !== "auto",
      allowUncertain: !verified,
      signal: controller.signal,
      onProgress: (attempt, total, shape) => { result.textContent = verified ? "Buscando en la red revisada…" : `Buscando ${shape || "circuito"} · ${attempt}/${total}`; }
    });
    if (controller.signal.aborted) return;
    const name = `${route.generation.comarcal ? route.generation.shape === "linear" ? "Regional o comarcal lineal" : "Regional o comarcal circular" : route.generation.shape === "out-and-back" ? "Ida y vuelta" : route.generation.shape === "linear" ? "Lineal" : route.generation.needsReview ? "Candidato circular" : "Circular"} ${route.distance.toFixed(1)} km`;
    usarRutaImportada({coords:route.coords, name, startName:"Salida", endName:route.generation.shape === "linear" ? "Llegada" : "Regreso", generation:route.generation});
    document.querySelector("#generatedRouteSave").hidden = false;
    document.querySelector("#generatedRouteName").value = name;
    nombrarRecorrido(route.coords,name,true);
    dom.importStatus.textContent = "";
    const info = route.generation;
    const surfaces = info.surfaces;
    const details = document.querySelector("#generatorDetails");
    const breakdown = surfaces ? `Pavimentado ${Math.round(surfaces.paved * 100)} %, tierra/grava ${Math.round(surfaces.unpaved * 100)} %, sin datos ${Math.round(surfaces.unknown * 100)} %.${surfaces.inferredUnpaved ? ` Tierra estimada por tipo de camino: ${Math.round(surfaces.inferredUnpaved * 100)} %.` : ""}` : "Firme sin detalle disponible.";
    result.textContent = `${name} · ${info.needsReview ? "Firme por revisar" : info.surface === "asphalt" ? "100 % carretera pavimentada según el mapa" : "Montaña"}`;
    details.hidden = false;
    details.open = false;
    document.querySelector("#generatorMetrics").textContent = `Objetivo ${target} km · Desviación ${(info.error * 100).toFixed(1)} % · Repetición ${(info.repeated * 100).toFixed(0)} %. ${breakdown}${surfaces?.unknownOffroad ? ` Caminos sin firme confirmado: ${Math.round(surfaces.unknownOffroad * 100)} %.` : ""}`;
    if (info.verification) {
      document.querySelector("#generatorMetrics").textContent += ` Revisión desde ${info.verification.checkedAt}, vigente hasta ${info.verification.validUntil}. La red comienza a ${Math.round(info.verification.startOffsetMeters)} m de la salida indicada.`;
      const sources = document.querySelector("#verificationSources");
      for (const entry of info.verification.evidence) {
        const item = document.createElement("li");
        item.textContent = `${entry.id}: ${entry.surface}. Fuente: ${entry.source}. Revisado por ${entry.reviewedBy} el ${entry.checkedAt}; vigencia hasta ${entry.validUntil}.`;
        sources.append(item);
      }
      document.querySelector("#verificationEvidence").hidden = false;
    }
    mostrarEstado(info.needsReview ? "Tramo de firme sin confirmar. Revisa la ruta regional o comarcal antes de usarla." : `${info.shape === "out-and-back" ? "Ida y vuelta" : info.shape === "linear" ? "Ruta lineal" : "Circuito"} creado. Ya puedes guardarlo o calcular el tiempo.`);
  } catch (error) {
    if (!controller.signal.aborted) result.textContent = error.message;
  } finally {
    if (generationController === controller) detenerGeneracion();
  }
}

export function iniciarAplicacion() {
  iniciarIconos();
  iniciarTema();
  fijarSalidaPredeterminada(dom.departure);
  conectarEventos();
  mostrarColeccion();
  let previousAccount = null;
  window.addEventListener("ridecast:account", () => {
    const id = cuentaActual()?.id || null;
    if (previousAccount !== id) {
      limpiarRuta();
      cambiarSeccion("plan");
      previousAccount = id;
    }
    mostrarColeccion();
  });
  mostrarCronologia([], 0, state.currentMode);
  mostrarResumen();
  iniciarMapaPlanificador(anadirPuntoPaso);
  dibujarRuta();
  mostrarPuntosPaso(state.waypoints);
  actualizarIntervaloMuestras();
  cambiarSeccion(location.hash.slice(1) || "plan");
  if (window.navigator.geolocation) usarUbicacionDispositivo();
}

function usarUbicacionDispositivo() {
  const geolocation = window.navigator.geolocation;
  if (!geolocation) return mostrarEstado("Este navegador no permite localizar el dispositivo. Elige la salida en el mapa.", "error");
  if (state.importedRoute && !window.confirm("¿Crear una nueva ruta desde tu ubicación? El recorrido importado no se modificará en tus rutas guardadas.")) return;
  const token = previewToken;
  const request = ++locationRequest;
  const button = document.querySelector("#useDeviceLocation");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  mostrarEstado("Buscando tu ubicación…");
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
    mostrarEstado(messages[error.code] || "La ubicación no está disponible. Elige la salida en el mapa.", "error");
  };
  try {
    geolocation.getCurrentPosition(position => {
      finish();
      // Una respuesta tardía nunca debe sustituir una ruta elegida por el usuario.
      if (request !== locationRequest || token !== previewToken) return;
      const { latitude: lat, longitude: lon } = position.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return fail({code: 2});
      if (state.importedRoute) limpiarRuta();
      const point = { lat, lon };
      state.waypoints.splice(0, state.waypoints.length ? 1 : 0, point);
      invalidarRuta();
      mostrarPuntosPaso(state.waypoints);
      centrarUbicacionPlanificador(point);
      programarVistaPrevia();
      mostrarEstado("Tu ubicación es el punto de salida. Añade el siguiente punto en el mapa.");
    }, fail, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  } catch (error) { fail(error); }
}

function mostrarColeccion() {
  try { mostrarRutasGuardadas(leerRutasGuardadas()); }
  catch (error) { mostrarEstado(error.message, "error"); }
}

function guardarRutaManualVisitante(coords, name) {
  if (rutasCuenta() !== null || coords.length < 2) return;
  try {
    const routes = leerRutasLocales();
    const id = autoGuestId ||= activeSavedId || crypto.randomUUID();
    const previous = routes.find(route => route.id === id);
    const route = { id, name, coords, startName: state.currentStartName, endName: state.currentEndName,
      distance: distanciaRecorrido(coords), createdAt: previous?.createdAt || new Date().toISOString() };
    escribirRutasGuardadas([route, ...routes.filter(item => item.id !== id)]);
    activeSavedId = id;
    mostrarColeccion();
  } catch (error) { mostrarEstado(error.message, "error"); }
}

function busy(active) {
  document.querySelectorAll('#rideForm button[type="submit"], button[form="rideForm"]').forEach(button => {
    button.disabled = active;
    button.classList.toggle("loading", active);
    button.querySelector("span").textContent = active ? "Calculando…" : "Calcular previsión";
  });
  dom.form.setAttribute("aria-busy", String(active));
}

function invalidarPrevision() {
  ++calculationToken;
  busy(false);
  state.currentSegments = [];
  mostrarCronologia([], 0, state.currentMode);
  mostrarResumen(state.currentDistance, state.currentDistance / Number(document.querySelector("#speed").value));
  dibujarRuta([], state.currentStartName, state.currentEndName, 0, state.currentRouteCoords, state.currentMode);
  document.querySelector("#forecastDate").textContent = "Pendiente de calcular";
}

function invalidarRuta() {
  nameController?.abort();
  pendingName = null;
  currentAutoName = null;
  document.querySelector("#verificationSources").replaceChildren();
  document.querySelector("#verificationEvidence").hidden = true;
  detenerGeneracion();
  document.querySelector("#generatedRouteSave").hidden = true;
  document.querySelector("#generatedRouteName").value = "";
  document.querySelector("#saveGeneratedRoute span").textContent = "Guardar ruta";
  document.querySelector("#generatedSaveStatus").textContent = "Se guardará en Mis rutas de este navegador.";
  document.querySelector("#generatorResult").textContent = "";
  document.querySelector("#generatorDetails").hidden = true;
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
  invalidarPrevision();
  mostrarEstado("");
}

function programarVistaPrevia() {
  clearTimeout(previewTimer);
  const token = ++previewToken;
  if (state.waypoints.length < 2 || state.waypoints.some((point) => point.snapping)) return;
  const points = state.waypoints.map((point) => ({ ...point }));
  previewTimer = setTimeout(async () => {
    try {
      const route = await trazarRutaPorPuntos(points);
      if (token !== previewToken) return;
      // El trazado que se ve en el mapa también es la ruta actual guardable.
      state.currentRouteCoords = route.coords;
      state.currentDistance = route.distance;
      state.currentStartName = "Salida";
      state.currentEndName = "Llegada";
      fijarVistaPreviaRuta(route.coords);
      dom.routeSource.textContent = `${route.distance.toFixed(1)} km · Bicicleta`;
      guardarRutaManualVisitante(route.coords, "Ruta dibujada");
      nombrarRecorrido(route.coords, "Ruta dibujada");
      registrarRuta("planned", route.coords, route.distance, "Ruta dibujada", [], { manual: true });
    } catch (error) {
      if (token === previewToken) mostrarEstado(error.message, "error");
    }
  }, 450);
}

async function anadirPuntoPaso(lat, lon) {
  if (state.waypoints.length >= 25) return mostrarEstado("El máximo es de 25 puntos.", "error");
  const point = { lat, lon, snapping: true };
  state.waypoints.push(point);
  invalidarRuta();
  mostrarPuntosPaso(state.waypoints);
  const snapped = await ajustarACarretera(lat, lon);
  const index = state.waypoints.indexOf(point);
  if (index < 0) return;
  state.waypoints[index] = snapped || { lat, lon };
  mostrarPuntosPaso(state.waypoints);
  programarVistaPrevia();
}

function quitarPuntoPaso(index) {
  state.waypoints.splice(index, 1);
  invalidarRuta();
  mostrarPuntosPaso(state.waypoints);
  programarVistaPrevia();
}

function limpiarRuta() {
  autoGuestId = null;
  garminFile = null;
  const garminDialog = document.querySelector("#garminModal");
  if (garminDialog.open) garminDialog.close();
  document.querySelector("#garminRouteName").textContent = "";
  document.querySelector("#garminStatus").textContent = "";
  state.waypoints = [];
  invalidarRuta();
  mostrarPuntosPaso([]);
  fijarVistaPreviaRuta(null);
  dom.saveName.value = "";
  dom.importStatus.textContent = "";
}

function conectarEventos() {
  const updateCoverage = () => {
    const verified = document.querySelector("#terrainAssurance").value === "verified";
    const surface = document.querySelector("#routeSurface").value;
    const today = new Date().toISOString().slice(0,10);
    const count = redVerificada.tramos.filter(t => t.checkedAt <= today && t.validUntil >= today
      && (surface === "asphalt" ? t.surface === "asphalt" : t.surface !== "asphalt")).length;
    document.querySelector("#terrainCoverage").textContent = !verified
      ? surface === "asphalt" ? "Carretera: solo pavimento confirmado en el mapa." : "Montaña: algunos tramos pueden requerir revisión."
      : count ? `${count} tramos revisados disponibles.` : "Sin tramos revisados de este firme.";
  };
  updateCoverage();
  for (const id of ["terrainAssurance", "routeSurface"]) document.querySelector("#" + id).addEventListener("change", updateCoverage);
  const verifiedStart = document.querySelector("#verifiedStart");
  const today = new Date().toISOString().slice(0,10);
  const starts = new Map();
  for (const tramo of redVerificada.tramos) {
    if (tramo.checkedAt > today || tramo.validUntil < today) continue;
    for (const point of tramo.direction === "both" ? [tramo.coords[0],tramo.coords.at(-1)] : [tramo.coords[0]]) {
      const key = `${point.lat},${point.lon}`;
      if (!starts.has(key)) {
        starts.set(key, point);
        const option = document.createElement("option"); option.value = key;
        option.textContent = `${tramo.id} · ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)} · ${tramo.surface}`;
        verifiedStart.append(option);
      }
    }
  }
  document.querySelector("#useVerifiedStart").disabled = !starts.size;
  document.querySelector("#verifiedCoverage").textContent = starts.size
    ? `${redVerificada.tramos.length} tramos registrados; se usan los vigentes.`
    : "Sin tramos vigentes en la biblioteca.";
  document.querySelector("#useVerifiedStart").addEventListener("click", () => {
    const point = starts.get(verifiedStart.value);
    if (!point) return;
    limpiarRuta(); state.waypoints = [{...point}];
    mostrarPuntosPaso(state.waypoints); centrarUbicacionPlanificador(point);
  });
  const focusSection = (id, focusId) => {
    document.getElementById(id).scrollIntoView?.({block:"start",behavior:"smooth"});
    document.getElementById(focusId || id).focus({preventScroll:true});
  };
  document.querySelector("#quickGenerate").addEventListener("click", () => {
    document.querySelector("#automaticOptions").open = true;
    focusSection("automaticOptions","targetDistance");
  });
  document.querySelector("#quickDraw").addEventListener("click", () => {
    document.querySelector("#automaticOptions").open = false;
    dom.planMapEl.setAttribute("tabindex","0"); focusSection("planMap");
    mostrarEstado("Marca los puntos del recorrido en el mapa.");
  });
  for (const id of ["quickImport","libraryImport"]) document.getElementById(id).addEventListener("click", () => dom.routeFile.click());
  document.querySelector("#librarySave").addEventListener("click", async () => {
    if (!state.currentRouteCoords.length) return mostrarEstado("Primero crea o importa una ruta.", "error");
    await guardarRutaActual();
  });
  const suggestionStatus = document.querySelector("#suggestionStatus");
  try { mostrarSugerencias(leerSugerencias()); } catch { suggestionStatus.textContent = "No se pueden leer las sugerencias. Los datos se han conservado."; document.querySelector("#exportarSugerencias").disabled = true; }
  document.querySelector("#suggestionForm").addEventListener("submit", event => {
    event.preventDefault();
    try {
      mostrarSugerencias(guardarSugerencia(document.querySelector("#suggestionText").value, document.querySelector("#suggestionCategory").value));
      event.target.reset(); suggestionStatus.textContent = "Guardada en este navegador. No se ha enviado.";
    } catch (error) { suggestionStatus.textContent = error.message; }
  });
  document.querySelector("#exportarSugerencias").addEventListener("click", () => {
    try { const entries = leerSugerencias(); if (entries.length) exportarSugerencias(entries); }
    catch { suggestionStatus.textContent = "No se pudieron exportar las sugerencias."; }
  });
  const saveGenerated = async () => {
    if (generationController || document.querySelector("#generatedRouteSave").hidden) return;
    const token = previewToken;
    dom.saveName.value = document.querySelector("#generatedRouteName").value.trim() || nombreRuta();
    const saved = await guardarRutaActual();
    if (token !== previewToken) return;
    if (saved) {
      document.querySelector("#saveGeneratedRoute span").textContent = "Actualizar ruta";
      document.querySelector("#generatedSaveStatus").textContent = `“${dom.saveName.value}” guardada ${rutasCuenta() !== null ? "en tu cuenta" : "en este navegador"}.`;
    } else {
      document.querySelector("#generatedSaveStatus").textContent = "No se ha podido guardar la ruta. Revisa el aviso e inténtalo de nuevo.";
    }
  };
  document.querySelector("#saveGeneratedRoute").addEventListener("click", saveGenerated);
  document.querySelector("#generatedRouteName").addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); saveGenerated(); }
  });
  document.querySelector("#generatorForm").addEventListener("submit", generarRuta);
  document.querySelector("#generarRuta").addEventListener("click", generarRuta);
  document.querySelector("#cancelGeneration").addEventListener("click", () => {
    detenerGeneracion();
    document.querySelector("#generatorResult").textContent = "Generación cancelada. Tu ruta se conserva.";
  });
  ["targetDistance", "routeDirection", "routeSurface", "terrainAssurance"].forEach(id => document.querySelector("#" + id).addEventListener("change", () => {
    detenerGeneracion();
    document.querySelector("#generatorResult").textContent = state.currentRouteCoords.length ? "Preferencias cambiadas. Genera otra ruta para aplicarlas; el recorrido actual se conserva." : "";
  }));
  dom.menuButtons.forEach((button) => button.addEventListener("click", () => cambiarSeccion(button.dataset.window)));
  window.addEventListener("hashchange", () => cambiarSeccion(location.hash.slice(1)));
  document.querySelector("#useDeviceLocation").addEventListener("click", usarUbicacionDispositivo);
  document.querySelector("#newRoute").addEventListener("click", () => {
    if ((state.currentRouteCoords.length || state.waypoints.length) && !window.confirm("¿Empezar una nueva ruta? Las rutas guardadas se conservarán.")) return;
    limpiarRuta();
    cambiarSeccion("plan");
    if (window.navigator.geolocation) usarUbicacionDispositivo();
  });
  document.querySelectorAll(".chip[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".chip[data-mode]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      state.currentMode = button.dataset.mode;
      mostrarPrevision();
    });
  });
  dom.samples.addEventListener("input", () => { actualizarIntervaloMuestras(); invalidarPrevision(); });
  dom.departure.addEventListener("change", invalidarPrevision);
  document.querySelector("#speed").addEventListener("change", invalidarPrevision);
  dom.form.addEventListener("submit", calculate);
  dom.routeFile.addEventListener("change", procesarArchivoRuta);
  dom.saveRoute.addEventListener("click", guardarRutaActual);
  dom.exportRoute.addEventListener("click", exportarRutaActual);
  dom.exportarRutaPlanificada.addEventListener("click", exportarRutaPlanificada);
  document.querySelectorAll("[data-garmin]").forEach(button => button.addEventListener("click", () => abrirGarmin()));
  document.querySelector("#garminShare").addEventListener("click", async (event) => {
    if (!garminFile) return;
    const button = event.currentTarget;
    button.disabled = true;
    const result = await compartirGpx(garminFile);
    document.querySelector("#garminStatus").textContent = {
      shared: "Archivo compartido. Completa la importación en Garmin Connect; RideCast no puede confirmar la sincronización.",
      cancelled: "Se ha cancelado el uso compartido. Puedes volver a intentarlo.",
      unsupported: "Este navegador no permite compartir este archivo. Descarga el GPX para importarlo en Connect.",
      failed: "No se pudo compartir el archivo. Puedes descargarlo e importarlo en Connect."
    }[result];
    button.disabled = !puedeCompartirGpx(garminFile);
  });
  document.querySelector("#garminDownload").addEventListener("click", () => {
    if (!garminFile) return;
    descargarArchivoGpx(garminFile);
    document.querySelector("#garminStatus").textContent = "Descarga solicitada. Abre el GPX descargado con Garmin Connect o impórtalo en su web.";
  });
  dom.savedRoutes.addEventListener("click", accionRutaGuardada);
  document.querySelector("#routeSearch").addEventListener("input", mostrarColeccion);
  document.querySelector("#routeSort").addEventListener("change", mostrarColeccion);
  document.getElementById("refreshMyRoutes").addEventListener("click", async () => {
    try { await actualizarCuenta(); mostrarColeccion(); } catch (error) { mostrarEstado(error.message, "error"); }
  });
  document.getElementById("uploadLocalRoutes").addEventListener("click", async event => {
    if (!cuentaActual() || !confirm("¿Copiar las rutas de este dispositivo a tu cuenta? El administrador podrá consultarlas.")) return;
    event.currentTarget.disabled = true;
    try { for (const route of leerRutasLocales()) await guardarRutaEnServidor(route); mostrarEstado("Rutas copiadas a tu cuenta. Los originales siguen en este dispositivo."); }
    catch (error) { mostrarEstado(error.message, "error"); }
    finally { document.getElementById("uploadLocalRoutes").disabled = false; }
  });
  document.querySelector("#themeToggle").addEventListener("click", alternarTema);
  document.querySelector("#dismissStatus").addEventListener("click", () => mostrarEstado(""));
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
      invalidarPrevision();
    });
  });
  speedInput.addEventListener("input", updateSpeedButtons);
  updateSpeedButtons();
  document.querySelector("#encuadrarRuta").addEventListener("click", encuadrarRuta);
  document.querySelector("#saveForecast").addEventListener("click", async () => {
    if (!state.currentRouteCoords.length) return mostrarEstado("Primero crea o importa un recorrido.", "error");
    cambiarSeccion("library");
    if (!dom.saveName.value.trim()) dom.saveName.value = nombreRuta();
    await guardarRutaActual();
  });
  dom.undoWaypoint.addEventListener("click", () => { if (state.waypoints.length) quitarPuntoPaso(state.waypoints.length - 1); });
  dom.clearWaypoints.addEventListener("click", limpiarRuta);
  dom.planFullscreenBtn.addEventListener("click", alternarPantallaCompletaPlanificador);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dom.planMapWrap.classList.contains("fullscreen")) alternarPantallaCompletaPlanificador();
  });
  dom.waypointList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='remove-waypoint']");
    if (button) quitarPuntoPaso(Number(button.dataset.index));
  });
}

function mostrarPrevision() {
  mostrarCronologia(state.currentSegments, state.currentRideBearing, state.currentMode);
  dibujarRuta(state.currentSegments, state.currentStartName, state.currentEndName,
    state.currentRideBearing, state.currentRouteCoords, state.currentMode);
}

function pedirFechaHoraSalida() {
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

function usarRutaImportada(route, id = null) {
  limpiarRuta();
  state.importedRoute = route;
  if (["asphalt", "dirt"].includes(route.generation?.surface)) document.querySelector("#routeSurface").value = route.generation.surface;
  activeSavedId = id;
  state.currentRouteCoords = route.coords;
  state.currentStartName = route.startName || route.name;
  state.currentEndName = route.endName || "Llegada";
  state.currentDistance = distanciaRecorrido(route.coords);
  dom.routeSource.textContent = route.name;
  mostrarPuntosImportados(route.coords);
  dom.importStatus.textContent = `${route.name} · ${state.currentDistance.toFixed(1)} km`;
  if (route.generation?.needsReview) dom.importStatus.textContent += " · Candidato para revisar: firme sin confirmar.";
  document.querySelector("#forecastTitle").textContent = route.name;
  mostrarResumen(state.currentDistance, state.currentDistance / Number(document.querySelector("#speed").value));
  mostrarPrevision();
  cambiarSeccion("plan");
  fijarVistaPreviaRuta(route.coords, true);
  if (!route.generation) guardarRutaManualVisitante(route.coords, route.name);
  registrarRuta("planned", route.coords, state.currentDistance, route.name, [], { manual: !route.generation });
}

async function procesarArchivoRuta(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const token = ++importToken;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("El fichero supera los 10 MB.");
    mostrarEstado("Leyendo recorrido…");
    const parsed = interpretarArchivoRuta(await file.text());
    if (token !== importToken) return;
    const departure = await pedirFechaHoraSalida();
    if (!departure || token !== importToken) { mostrarEstado(""); return; }
    usarRutaImportada(parsed);
    dom.departure.value = departure;
    mostrarEstado("Ruta importada. Revisa la salida y calcula la previsión.");
  } catch (error) {
    if (token === importToken) mostrarEstado(error.message || "No se pudo importar el fichero.", "error");
  } finally {
    event.target.value = "";
  }
}

function nombreRuta() {
  return state.importedRoute?.name || currentAutoName || "Ruta " + new Date().toLocaleDateString("es-ES");
}

async function guardarRutaActual() {
  if (!state.currentRouteCoords.length) return mostrarEstado("Calcula o importa una ruta antes de guardarla.", "error");
  const token = previewToken;
  try {
    if (pendingName && (dom.saveName.value.trim() === pendingName.base || !dom.saveName.value.trim())) {
      const expected = pendingName.base;
      await pendingName.promise;
      if (token !== previewToken) return false;
      if ((!dom.saveName.value.trim() || dom.saveName.value.trim() === expected) && currentAutoName) dom.saveName.value = currentAutoName;
    }
    const routes = leerRutasGuardadas();
    const previous = routes.find((route) => route.id === activeSavedId);
    const saved = {
      id: activeSavedId || crypto.randomUUID(),
      name: dom.saveName.value.trim() || nombreRuta(),
      coords: state.currentRouteCoords,
      startName: state.currentStartName, endName: state.currentEndName,
      distance: distanciaRecorrido(state.currentRouteCoords),
      ...(state.importedRoute?.generation ? {generation:state.importedRoute.generation} : {}),
      createdAt: previous?.createdAt || new Date().toISOString(),
    };
    if (rutasCuenta() !== null) await guardarRutaEnServidor(saved);
    else escribirRutasGuardadas([saved, ...routes.filter((route) => route.id !== saved.id)]);
    // La biblioteca conserva el guardado, pero la ruta activa puede haber cambiado.
    if (token !== previewToken) return false;
    activeSavedId = saved.id;
    document.querySelector("#routeSearch").value = "";
    mostrarColeccion();
    mostrarEstado(`“${saved.name}” guardada ${rutasCuenta() !== null ? "en tu cuenta" : "en este navegador"}.`);
    return true;
  } catch (error) {
    if (token === previewToken) mostrarEstado(error.message, "error");
    return false;
  }
}

async function accionRutaGuardada(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  try {
    const routes = leerRutasGuardadas();
    let route = routes.find((item) => item.id === button.dataset.id);
    if (!route) return;
    if (rutasCuenta() !== null && button.dataset.action !== "delete") route = await rutaEnServidor(route.id);
    if (button.dataset.action === "load") {
      usarRutaImportada(route, route.id);
      mostrarEstado(route.generation?.needsReview ? "Candidato cargado: revisa el firme sin confirmar antes de utilizarlo." : "Ruta cargada. Revisa la fecha y calcula una previsión actualizada.");
    } else if (button.dataset.action === "export") {
      await verificarSentidoExportacion(route.coords);
      descargarGpx(route.name, route.coords);
    } else if (button.dataset.action === "garmin") {
      abrirGarmin(route);
    } else if (button.dataset.action === "delete" && window.confirm(`¿Borrar “${route.name}” de tus rutas guardadas?`)) {
      if (rutasCuenta() !== null) await eliminarRutaEnServidor(route.id);
      else escribirRutasGuardadas(routes.filter((item) => item.id !== route.id));
      if (activeSavedId === route.id) activeSavedId = null;
      mostrarColeccion();
      mostrarEstado("Ruta eliminada de la colección.");
    }
  } catch (error) { mostrarEstado(error.message, "error"); }
}

async function exportarRutaActual() {
  if (!state.currentRouteCoords.length) return mostrarEstado("Primero calcula o importa una ruta.", "error");
  const coords = state.currentRouteCoords, token = previewToken;
  const name = dom.saveName.value.trim() || nombreRuta();
  dom.exportRoute.disabled = true;
  try {
    await verificarSentidoExportacion(coords);
    if (token !== previewToken || coords !== state.currentRouteCoords) return;
    descargarGpx(name, coords);
  } catch (error) { mostrarEstado(error.message, "error"); }
  finally { dom.exportRoute.disabled = false; }
}

async function abrirGarmin(savedRoute) {
  const token = previewToken;
  const buttons = document.querySelectorAll("[data-garmin], [data-action='garmin']");
  buttons.forEach(button => { button.disabled = true; });
  try {
    let coords = savedRoute?.coords || state.currentRouteCoords;
    const name = savedRoute?.name || dom.saveName.value.trim() || nombreRuta();
    if (coords.length < 2) {
      if (state.waypoints.some(point => point.snapping)) throw new Error("Espera a que se ajusten los puntos al mapa.");
      if (state.waypoints.length < 2) throw new Error("Crea o importa una ruta antes de enviarla a Garmin Connect.");
      mostrarEstado("Preparando ruta para Garmin Connect…");
      const route = await trazarRutaPorPuntos(state.waypoints.map(point => ({ ...point })));
      if (token !== previewToken) return;
      coords = route.coords;
    }
    await verificarSentidoExportacion(coords);
    if (token !== previewToken) return;
    // Preparar antes del segundo clic conserva la activación necesaria para compartir en móvil.
    garminFile = crearArchivoGpx(name, coords);
    document.querySelector("#garminRouteName").textContent = name;
    const supported = puedeCompartirGpx(garminFile);
    document.querySelector("#garminShare").disabled = !supported;
    document.querySelector("#garminStatus").textContent = supported ? "" : "Este navegador no permite compartir GPX. Utiliza la descarga.";
    document.querySelector("#garminModal").showModal();
    mostrarEstado("");
  } catch (error) { mostrarEstado(error.message || "No se pudo preparar el GPX.", "error"); }
  finally { buttons.forEach(button => { button.disabled = false; }); }
}

async function exportarRutaPlanificada() {
  if (state.currentRouteCoords.length) return exportarRutaActual();
  const token = previewToken;
  dom.exportarRutaPlanificada.disabled = true;
  try {
    if (state.waypoints.some((point) => point.snapping)) throw new Error("Espera a que se ajusten los puntos.");
    mostrarEstado("Preparando GPX…");
    const route = await trazarRutaPorPuntos(state.waypoints.map((point) => ({ ...point })));
    if (token !== previewToken) return;
    state.currentRouteCoords = route.coords;
    state.currentDistance = route.distance;
    await verificarSentidoExportacion(route.coords);
    if (token !== previewToken) return;
    descargarGpx(nombreRuta(), route.coords);
    guardarRutaManualVisitante(route.coords, nombreRuta());
    registrarRuta("planned", route.coords, route.distance, nombreRuta(), [], { manual: true });
    mostrarEstado("GPX exportado.");
  } catch (error) {
    if (token === previewToken) mostrarEstado(error.message, "error");
  } finally { dom.exportarRutaPlanificada.disabled = false; }
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
    mostrarEstado("Calculando recorrido ciclista…");
    const route = imported ? { coords: imported.coords, distance: distanciaRecorrido(imported.coords) } : await trazarRutaPorPuntos(points);
    if (token !== calculationToken) return;
    state.currentRouteCoords = route.coords;
    state.currentDistance = route.distance;
    state.currentDuration = route.distance / speed;
    state.currentStartName = imported?.startName || imported?.name || "Salida";
    state.currentEndName = imported?.endName || "Llegada";
    state.currentSegments = [];
    mostrarResumen(route.distance, state.currentDuration);
    mostrarPrevision();
    if (!imported) fijarVistaPreviaRuta(route.coords);
    const samples = muestrearRuta(route.coords, count);
    if (!imported?.generation) guardarRutaManualVisitante(route.coords, imported?.name || "Ruta planificada");
    registrarRuta("planned", route.coords, route.distance, imported?.name || "Ruta planificada", [], { departure: departure.toISOString(), speed, manual: !imported?.generation });
    mostrarEstado("Consultando el tiempo a la hora de paso por cada punto…");
    const segments = await consultarTiempo(samples, departure, route.distance, speed);
    if (token !== calculationToken) return;
    state.currentSegments = segments;
    registrarRuta("forecast", route.coords, route.distance, imported?.name || "Previsión de ruta", segments, { departure: departure.toISOString(), speed, manual: !imported?.generation });
    state.currentRideBearing = bearing(route.coords[0], route.coords.at(-1));
    mostrarResumen(route.distance, state.currentDuration, segments, state.currentRideBearing);
    cambiarSeccion("forecast");
    mostrarPrevision();
    document.querySelector("#forecastTitle").textContent = imported?.name || "Tiempo en ruta";
    document.querySelector("#forecastDate").textContent = `Salida: ${departure.toLocaleString("es-ES", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${count} puntos · ${speed} km/h`;
    mostrarEstado("Previsión actualizada.");
  } catch (error) {
    if (token === calculationToken) mostrarEstado(error.name === "TimeoutError" ? "La consulta está tardando demasiado. Inténtalo de nuevo." : error.message || "No se pudo calcular la ruta.", "error");
  } finally {
    if (token === calculationToken) busy(false);
  }
}

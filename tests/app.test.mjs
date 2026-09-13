import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const page = new JSDOM(await readFile(new URL("../index.html", import.meta.url), "utf8"), {url:"https://ridecast.test/#plan",runScripts:"outside-only"});
const { window } = page;
Object.assign(globalThis, { window, document:window.document, location:window.location,
  localStorage:window.localStorage, DOMParser:window.DOMParser, requestAnimationFrame:fn=>fn(), ResizeObserver:class { observe() {} } });
window.eval(await readFile(new URL("../vendor/lucide.js",import.meta.url),"utf8"));
window.confirm = () => true;
const maps = [], markers = [];
const layer = () => ({ addTo(){return this;},clearLayers(){},bindTooltip(){return this;},bindPopup(){return this;},on(){return this;},closeTooltip(){} });
globalThis.L = window.L = {
  map(element) { const map = {element,fits:0,setView(){return this;},invalidateSize(){},fitBounds(){this.fits++;},on(){}}; maps.push(map); return map; },
  tileLayer:layer,layerGroup:layer,polyline:layer,latLngBounds:points=>points,divIcon:options=>options,
  marker(point,options){markers.push(options);return layer();},
};
Object.defineProperty(document.querySelector("#routeMap"),"offsetWidth",{get:()=>document.querySelector('[data-window-panel="forecast"]').hidden ? 0 : 900});
const { state, writeSavedRoutes, readSavedRoutes } = await import("../js/model.js");
const { initApp } = await import("../js/controller.js");
const view = await import("../js/view.js");
const click = selector => document.querySelector(selector).click();
const wait = () => new Promise(resolve=>setTimeout(resolve,10));
const coords = [{lat:40.4,lon:-3.7},{lat:40.42,lon:-3.72}];
const generatedResponse = () => ({ok:true,json:async()=>({type:'FeatureCollection',features:[{properties:{'track-length':'30000',messages:[['Distance','WayTags'],['30000','surface=ground']]},geometry:{type:'LineString',coordinates:[[-3.7,40.4],[-3.6,40.5],[-3.5,40.4],[-3.7,40.4]]}}]})});
initApp();
after(()=>page.window.close());

test("generador: crea una ruta guardable y cancelación no sustituye la ruta anterior", async () => {
  assert.equal(document.querySelectorAll('a[href*="strava"]').length,0);
  const originalFetch = globalThis.fetch;
  try {
    click('#generateRoute');
    assert.match(document.querySelector('#generatorResult').textContent, /salida/);
    state.waypoints = [coords[0]];
    document.querySelector('#routeSurface').value = 'dirt';
    globalThis.fetch = async () => generatedResponse();
    click('#generateRoute');
    assert.equal(document.querySelector('#generateRoute').disabled,true);
    await wait();
    assert.equal(state.importedRoute.name,'Circular 30.0 km');
    assert.match(document.querySelector('#generatorResult').textContent, /Objetivo 30/);
    assert.equal(document.querySelector('#generateRoute').disabled,false);
    assert.equal(document.querySelector('#generatedRouteSave').hidden,false);
    assert.equal(document.querySelector('#generatedRouteName').value,'Circular 30.0 km');
    click('#saveGeneratedRoute');
    assert.equal(readSavedRoutes()[0].name,'Circular 30.0 km');
    document.querySelector('#generatedRouteName').value = 'Circular del domingo';
    click('#saveGeneratedRoute');
    assert.equal(readSavedRoutes().length,1);
    assert.equal(readSavedRoutes()[0].name,'Circular del domingo');
    assert.deepEqual(readSavedRoutes()[0].coords,state.currentRouteCoords);
    assert.equal(readSavedRoutes()[0].generation.surface,'dirt');
    assert.match(document.querySelector('#generatedSaveStatus').textContent,/guardada en Mis rutas/);
    const previous = state.currentRouteCoords;
    let respond;
    globalThis.fetch = () => new Promise(resolve => { respond = resolve; });
    click('#generateRoute');
    assert.equal(document.querySelector('#saveGeneratedRoute').disabled,true);
    click('#cancelGeneration');
    assert.equal(document.querySelector('#saveGeneratedRoute').disabled,false);
    respond(generatedResponse());
    await wait();
    assert.equal(state.currentRouteCoords,previous);
    assert.match(document.querySelector('#generatorResult').textContent, /cancelada/);
    const setItem = window.Storage.prototype.setItem;
    try {
      window.Storage.prototype.setItem = () => { throw new Error('Sin espacio'); };
      click('#saveGeneratedRoute');
      assert.match(document.querySelector('#generatedSaveStatus').textContent,/No se ha podido guardar/);
    } finally { window.Storage.prototype.setItem = setItem; }
    click('[data-action="load"]');
    assert.equal(state.importedRoute.name,'Circular del domingo');
    assert.equal(document.querySelector('#routeSurface').value,'dirt');
    assert.equal(document.querySelector('#generatedRouteSave').hidden,true);
  } finally {
    globalThis.fetch = originalFetch;
    writeSavedRoutes([]);
    click('#clearWaypoints');
  }
});

test("ubicación: crea la salida, controla permisos y descarta respuestas tardías", () => {
  let success, failure, options;
  Object.defineProperty(window.navigator, 'geolocation', { configurable: true, value: {
    getCurrentPosition(ok, fail, config) { success = ok; failure = fail; options = config; }
  }});
  try {
    click('#useDeviceLocation');
    assert.equal(document.querySelector('#useDeviceLocation').disabled, true);
    assert.equal(options.timeout, 15000);
    success({coords: {latitude: 41.2, longitude: -2.3}});
    assert.deepEqual(state.waypoints, [{lat:41.2, lon:-2.3}]);
    assert.equal(document.querySelector('#useDeviceLocation').disabled, false);
    click('#useDeviceLocation');
    failure({code:1});
    assert.match(document.querySelector('#statusMessage').textContent, /denegado/);
    assert.equal(state.waypoints[0].lat, 41.2);
    click('#useDeviceLocation');
    click('#clearWaypoints');
    success({coords: {latitude: 42, longitude: -3}});
    assert.equal(state.waypoints.length, 0);
    click('#newRoute');
    assert.equal(document.querySelector('#useDeviceLocation').disabled, true);
    failure({code:3});
    assert.match(document.querySelector('#statusMessage').textContent, /demasiado/);
  } finally {
    delete window.navigator.geolocation;
    click('#clearWaypoints');
  }
});

test("Garmin prepara el GPX completo y maneja compartir, cancelar y errores", async () => {
  const file = view.createGpxFile('Ruta <Garmin>', coords);
  assert.equal(file.name, 'Ruta_Garmin_.gpx');
  assert.equal(file.type, 'application/gpx+xml');
  const xml = new window.DOMParser().parseFromString(await file.text(), 'application/xml');
  assert.equal(xml.querySelectorAll('trkpt').length, coords.length);
  assert.equal(xml.querySelector('trk > name').textContent, 'Ruta <Garmin>');
  assert.equal(await view.shareGpx(file, {}), 'unsupported');
  assert.equal(view.canShareGpx(file, {share(){}, canShare(){throw Error();}}), false);
  const platform = {canShare: () => true, share: async data => assert.equal(data.files[0], file)};
  assert.equal(await view.shareGpx(file, platform), 'shared');
  platform.share = async () => { throw new DOMException('Cancelado', 'AbortError'); };
  assert.equal(await view.shareGpx(file, platform), 'cancelled');
  platform.share = async () => { throw new DOMException('Bloqueado', 'NotAllowedError'); };
  assert.equal(await view.shareGpx(file, platform), 'failed');
});

test("Garmin impide rutas vacías y abre el diálogo con la ruta actual", () => {
  const dialog = document.querySelector('#garminModal');
  dialog.showModal = () => dialog.setAttribute('open', '');
  state.currentRouteCoords = [];
  click('[data-garmin]');
  assert.equal(dialog.hasAttribute('open'), false);
  assert.match(document.querySelector('#statusMessage').textContent, /Crea o importa/);
  state.currentRouteCoords = coords;
  click('[data-garmin]');
  assert.equal(dialog.hasAttribute('open'), true);
  assert.equal(document.querySelector('#garminShare').disabled, true);
  assert.match(document.querySelector('#garminStatus').textContent, /descarga/);
  dialog.removeAttribute('open');
  state.currentRouteCoords = [];
});

test("menú persistente: las tres ventanas cambian y actualizan el enlace", async()=>{
  for (const name of ["library","forecast","plan"]) {
    click(`[data-window="${name}"]`);
    await wait();
    assert.equal(location.hash,"#"+name);
    assert.equal(document.querySelectorAll(".window:not([hidden])").length,1);
    assert.equal(document.querySelector(`[data-window-panel="${name}"]`).hidden,false);
    assert.equal(document.querySelector(`[data-window="${name}"]`).getAttribute("aria-current"),"page");
  }
});

test("todos los iconos estáticos existen en Lucide",()=>{
  assert.equal(document.querySelectorAll("i[data-lucide]").length,0);
  assert.ok(document.querySelectorAll("svg.lucide").length>20);
});

test("los controles táctiles de velocidad respetan los límites",()=>{
  const input = document.querySelector("#speed");
  input.value = "8";
  input.dispatchEvent(new window.Event("input"));
  assert.equal(document.querySelector("#decreaseSpeed").disabled,true);
  click("#increaseSpeed");
  assert.equal(input.value,"9");
  input.value = "45";
  input.dispatchEvent(new window.Event("input"));
  assert.equal(document.querySelector("#increaseSpeed").disabled,true);
  click("#decreaseSpeed");
  assert.equal(input.value,"44");
  input.value = "23";
});

test("los avisos se cierran sin destruir sus controles",()=>{
  view.showStatus("Error de prueba", "error");
  assert.equal(document.querySelector("#statusMessage").textContent,"Error de prueba");
  click("#dismissStatus");
  assert.equal(document.querySelector("#appStatus").hidden,true);
  view.showStatus("Segundo aviso");
  click("#dismissStatus");
  assert.equal(document.querySelector("#appStatus").hidden,true);
});

test("guardar, buscar, cargar y borrar rutas sin duplicar al actualizar",async()=>{
  state.currentRouteCoords = coords;
  document.querySelector("#saveName").value = "Ruta <prueba>";
  click("#saveRoute");
  click("#saveRoute");
  assert.equal(readSavedRoutes().length,1);
  assert.equal(document.querySelector(".saved-route strong").textContent,"Ruta <prueba>");
  assert.equal(document.querySelector(".saved-route prueba"),null);
  assert.ok(document.querySelector(".route-preview polyline").getAttribute("points").length > 5);
  const search=document.querySelector("#routeSearch");
  search.value="inexistente";search.dispatchEvent(new window.Event("input"));
  assert.equal(document.querySelectorAll(".saved-route").length,0);
  search.value="prueba";search.dispatchEvent(new window.Event("input"));
  click('[data-action="load"]');await wait();
  assert.equal(state.importedRoute.name,"Ruta <prueba>");
  assert.equal(state.currentSegments.length,0);
  click('[data-action="delete"]');
  assert.equal(readSavedRoutes().length,0);
});

test("limpiar invalida la ruta importada y evita exportar un recorrido antiguo",()=>{
  click("#clearWaypoints");
  assert.equal(state.importedRoute,null);
  assert.equal(state.currentRouteCoords.length,0);
  click("#saveRoute");
  assert.equal(document.querySelector("#appStatus").dataset.type,"error");
});

test("calcular abre la previsión; los iconos cambian sin reajustar el zoom",async()=>{
  state.importedRoute = {name:"Sierra",coords};
  state.currentRouteCoords = coords;
  const now=Math.ceil(Date.now()/3600000)*3600;
  const date=new Date(now*1000);
  const pad=n=>String(n).padStart(2,"0");
  document.querySelector("#departure").value=`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const hourly={time:[now,now+3600,now+7200],temperature_2m:[35,35,35],precipitation_probability:[80,80,80],precipitation:[1,1,1],weather_code:[63,63,63],wind_speed_10m:[20,20,20],wind_gusts_10m:[30,30,30],wind_direction_10m:[90,90,90]};
  globalThis.fetch=async()=>({ok:true,json:async()=>Array.from({length:8},()=>({hourly}))});
  document.querySelector("#rideForm").dispatchEvent(new window.Event("submit",{cancelable:true}));
  await wait();
  assert.equal(state.currentSegments.length,8);
  assert.equal(location.hash,"#forecast");
  assert.equal(document.querySelectorAll(".segment-card").length,8);
  assert.equal(document.querySelectorAll(".segment-card i[data-lucide]").length,0);
  const map=maps.find(map=>map.element.id==="routeMap");
  assert.ok(map.fits>0);
  const fits=map.fits;
  click('[data-mode="rain"]');
  assert.equal(map.fits,fits);
  assert.match(markers.at(-1).icon.html.outerHTML,/weather-pin/);
  assert.equal(markers.at(-1).icon.html.style.getPropertyValue("--pin-color"),"#2756ac");
  click('[data-mode="temp"]');
  assert.equal(markers.at(-1).icon.html.style.getPropertyValue("--pin-color"),"#ce534b");
  click('[data-mode="wind"]');
  assert.match(markers.at(-1).icon.html.outerHTML,/rotate\(270deg\)/);
  click("#fitRoute");
  assert.equal(map.fits,fits+1);
});

test("una respuesta tardía no restaura una ruta que se ha borrado",async()=>{
  let finish;
  globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});
  document.querySelector("#rideForm").dispatchEvent(new window.Event("submit",{cancelable:true}));
  await wait();
  assert.equal(document.querySelector('button[form="rideForm"]').disabled,true);
  click("#clearWaypoints");
  finish({ok:true,json:async()=>[]});
  await wait();
  assert.equal(state.currentRouteCoords.length,0);
  assert.equal(state.currentSegments.length,0);
  assert.equal(document.querySelector('#rideForm button[type="submit"]').disabled,false);
  assert.equal(document.querySelector('button[form="rideForm"]').disabled,false);
});

test("las duraciones redondean a horas sin mostrar 60 minutos",()=>{
  view.renderSummary(60,1.999,[]);
  assert.match(document.querySelector("#summaryCards").textContent,/2 h 0 min/);
});

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
  map(element) { const map = {element,fits:0,setView(){return this;},invalidateSize(){},fitBounds(){this.fits++;},on(event,handler){this[event]=handler;}}; maps.push(map); return map; },
  tileLayer:layer,layerGroup:layer,polyline:layer,latLngBounds:points=>points,divIcon:options=>options,
  marker(point,options){markers.push(options);return layer();},
};
Object.defineProperty(document.querySelector("#routeMap"),"offsetWidth",{get:()=>document.querySelector('[data-window-panel="forecast"]').hidden ? 0 : 900});
const { state, escribirRutasGuardadas, leerRutasGuardadas } = await import("../cliente/modelo.js");
const { iniciarAplicacion } = await import("../cliente/controlador.js");
const view = await import("../cliente/vista.js");
const click = selector => document.querySelector(selector).click();
const wait = () => new Promise(resolve=>setTimeout(resolve,10));
const coords = [{lat:40.4,lon:-3.7},{lat:40.42,lon:-3.72}];
const generatedResponse = () => ({ok:true,json:async()=>({type:'FeatureCollection',features:[{properties:{'track-length':'30000',messages:[['Distance','WayTags'],['30000','surface=ground']]},geometry:{type:'LineString',coordinates:[[-3.7,40.4],[-3.6,40.5],[-3.5,40.4],[-3.7,40.4]]}}]})});
iniciarAplicacion();
after(()=>page.window.close());

test("guardar una ruta dibujada sin calcular la previsión", async () => {
  const originalFetch = globalThis.fetch;
  try {
    click("#clearWaypoints");
    globalThis.fetch = async url => Response.json(url.includes("/nearest/")
      ? { waypoints: [{ location: [-3.7, 40.4] }] }
      : { code: "Ok", routes: [{ distance: 3000, geometry: { coordinates: [[-3.7,40.4],[-3.72,40.42]] } }] });
    maps[0].click({ latlng: { lat: 40.4, lng: -3.7 } });
    await wait();
    maps[0].click({ latlng: { lat: 40.42, lng: -3.72 } });
    await new Promise(resolve => setTimeout(resolve, 550));
    assert.equal(state.currentRouteCoords.length, 2);
    assert.equal(leerRutasGuardadas()[0].name, "Ruta dibujada");
    assert.deepEqual(leerRutasGuardadas()[0].coords, state.currentRouteCoords);
    document.querySelector("#saveName").value = "Ruta dibujada";
    click("#saveRoute");
    await wait();
    assert.equal(leerRutasGuardadas()[0].name, "Ruta dibujada");
    assert.deepEqual(leerRutasGuardadas()[0].coords, state.currentRouteCoords);
    escribirRutasGuardadas([]);
    document.querySelector("#saveName").value = "Desde Mis rutas";
    click("#librarySave");
    await wait();
    assert.equal(leerRutasGuardadas()[0].name, "Desde Mis rutas");
    escribirRutasGuardadas([]);
    document.querySelector("#saveName").value = "Desde previsión";
    click("#saveForecast");
    await wait();
    assert.equal(leerRutasGuardadas()[0].name, "Desde previsión");
  } finally {
    globalThis.fetch = originalFetch;
    escribirRutasGuardadas([]);
    click("#clearWaypoints");
  }
});

test("ruta dibujada: incorpora la localidad en el nombre guardado automáticamente", async () => {
  const originalFetch = globalThis.fetch;
  let lookups = 0;
  try {
    click('#clearWaypoints'); escribirRutasGuardadas([]);
    globalThis.fetch = async url => {
      if (url.startsWith('https://photon.komoot.io/')) {
        lookups++;
        if (lookups > 1) return {ok:false};
        const query = new URL(url).searchParams;
        return Response.json({features:[{properties:{name:'Calahorra'},geometry:{coordinates:[Number(query.get('lon')),Number(query.get('lat'))]}}]});
      }
      return Response.json(url.includes('/nearest/') ? {waypoints:[{location:[-3.7,40.4]}]}
        : {code:'Ok',routes:[{distance:3000,geometry:{coordinates:[[-3.7,40.4],[-3.72,40.42]]}}]});
    };
    maps[0].click({latlng:{lat:40.4,lng:-3.7}}); await wait();
    maps[0].click({latlng:{lat:40.42,lng:-3.72}});
    for (let i=0;i<350 && !leerRutasGuardadas()[0]?.name.includes('Calahorra');i++) await wait();
    assert.match(leerRutasGuardadas()[0].name,/Ruta dibujada · Calahorra/);
  } finally { globalThis.fetch = originalFetch; escribirRutasGuardadas([]); click('#clearWaypoints'); }
});

test("planificador: orden de lectura y cinco orientaciones seleccionables", () => {
  assert.equal(document.querySelector('#terrainAssurance').value,'preference');
  const layout = document.querySelector(".planner-layout");
  assert.deepEqual([...layout.children].map(element => element.className),
    ["route-builder", "planner-map-section", "ride-settings"]);
  const direction = document.querySelector("#routeDirection");
  assert.deepEqual([...direction.options].map(option => [option.value, option.textContent]),
    [["auto", "Cualquiera"], ["0", "Norte"], ["90", "Este"], ["180", "Sur"], ["270", "Oeste"]]);
  direction.value = "0";
  assert.equal(direction.selectedOptions[0].textContent, "Norte");
  direction.value = "auto";
});

test("generador: crea una ruta guardable y cancelación no sustituye la ruta anterior", async () => {
  assert.equal(document.querySelectorAll('a[href*="strava"]').length,0);
  const originalFetch = globalThis.fetch;
  try {
    click('#generarRuta');
    assert.match(document.querySelector('#generatorResult').textContent, /salida/);
    state.waypoints = [coords[0]];
    document.querySelector('#routeSurface').value = 'dirt';
    globalThis.fetch = async url => url.startsWith('https://photon.komoot.io/') ? {ok:false} : generatedResponse();
    click('#generarRuta');
    assert.equal(document.querySelector('#generarRuta').disabled,true);
    await wait();
    assert.equal(state.importedRoute.name,'Circular 30.0 km');
    assert.match(document.querySelector('#generatorMetrics').textContent, /Objetivo 30/);
    assert.equal(document.querySelector('#generarRuta').disabled,false);
    assert.equal(document.querySelector('#generatedRouteSave').hidden,false);
    assert.equal(document.querySelector('#generatedRouteName').value,'Circular 30.0 km');
    click('#saveGeneratedRoute');
    for (let i=0;i<300 && !leerRutasGuardadas().length;i++) await wait();
    assert.equal(leerRutasGuardadas()[0].name,'Circular 30.0 km');
    document.querySelector('#generatedRouteName').value = 'Circular del domingo';
    click('#saveGeneratedRoute');
    for (let i=0;i<300 && leerRutasGuardadas()[0]?.name !== 'Circular del domingo';i++) await wait();
    assert.equal(leerRutasGuardadas().length,1);
    assert.equal(leerRutasGuardadas()[0].name,'Circular del domingo');
    assert.deepEqual(leerRutasGuardadas()[0].coords,state.currentRouteCoords);
    assert.equal(leerRutasGuardadas()[0].generation.surface,'dirt');
    await wait();
    assert.match(document.querySelector('#generatedSaveStatus').textContent,/guardada en este navegador/);
    const previous = state.currentRouteCoords;
    let respond;
    globalThis.fetch = () => new Promise(resolve => { respond = resolve; });
    click('#generarRuta');
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
      await wait();
      assert.match(document.querySelector('#generatedSaveStatus').textContent,/No se ha podido guardar/);
    } finally { window.Storage.prototype.setItem = setItem; }
    click('[data-action="load"]');
    assert.equal(state.importedRoute.name,'Circular del domingo');
    assert.equal(document.querySelector('#routeSurface').value,'dirt');
    assert.equal(document.querySelector('#generatedRouteSave').hidden,true);
  } finally {
    globalThis.fetch = originalFetch;
    escribirRutasGuardadas([]);
    click('#clearWaypoints');
  }
});

test("generador: incorpora la localidad detectada en el nombre guardado", async () => {
  const originalFetch = globalThis.fetch;
  let lookups = 0;
  try {
    click('#clearWaypoints'); escribirRutasGuardadas([]);
    state.waypoints = [coords[0]];
    document.querySelector('#routeSurface').value = 'dirt';
    globalThis.fetch = async url => {
      if (!url.startsWith('https://photon.komoot.io/')) return generatedResponse();
      lookups++;
      if (lookups > 1) return {ok:false};
      const query = new URL(url).searchParams;
      return Response.json({features:[{properties:{name:'Arnedo'},geometry:{coordinates:[Number(query.get('lon')),Number(query.get('lat'))]}}]});
    };
    click('#generarRuta');
    for (let i=0;i<300 && !document.querySelector('#generatedRouteName').value.includes('Arnedo');i++) await wait();
    assert.match(document.querySelector('#generatedRouteName').value,/· Arnedo$/);
    click('#saveGeneratedRoute'); await wait();
    assert.match(leerRutasGuardadas()[0].name,/· Arnedo$/);
  } finally { globalThis.fetch = originalFetch; escribirRutasGuardadas([]); click('#clearWaypoints'); }
});

test("generador: incluye los puntos ya marcados en el recorrido final", async () => {
  const previousFetch = globalThis.fetch;
  const via = {lat:40.44,lon:-3.7};
  try {
    click('#clearWaypoints');
    state.waypoints = [coords[0],via];
    document.querySelector('#routeSurface').value='asphalt';
    document.querySelector('#routeDirection').value='0';
    globalThis.fetch = async url => {
      const stops = new URL(url).searchParams.get('lonlats').split('|').map(p=>p.split(',').map(Number));
      return Response.json({features:[{geometry:{type:'LineString',coordinates:stops},properties:{
        'track-length':'30000',messages:[['Distance','WayTags'],['30000','highway=residential surface=asphalt']]
      }}]});
    };
    click('#generarRuta'); await wait();
    assert.ok(state.importedRoute);
    assert.ok(state.importedRoute.coords.some(p => Math.abs(p.lat-via.lat)<0.00001 && Math.abs(p.lon-via.lon)<0.00001));
    assert.match(document.querySelector('#generatorResult').textContent,/100 % carretera pavimentada/);
  } finally {
    globalThis.fetch = previousFetch;
    document.querySelector('#routeDirection').value='auto';
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
    success({coords: {latitude: 42.22603, longitude: -2.10086}});
    assert.deepEqual(state.waypoints, [{lat:42.22603, lon:-2.10086}]);
    assert.equal(document.querySelector('#useDeviceLocation').disabled, false);
    click('#useDeviceLocation');
    failure({code:1});
    assert.match(document.querySelector('#statusMessage').textContent, /denegado/);
    assert.equal(state.waypoints[0].lat, 42.22603);
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
  const file = view.crearArchivoGpx('Ruta <Garmin>', coords);
  assert.equal(file.name, 'Ruta_Garmin_.gpx');
  assert.equal(file.type, 'application/gpx+xml');
  const xml = new window.DOMParser().parseFromString(await file.text(), 'application/xml');
  assert.equal(xml.querySelectorAll('trkpt').length, coords.length);
  assert.equal(xml.querySelector('trk > name').textContent, 'Ruta <Garmin>');
  assert.equal(await view.compartirGpx(file, {}), 'unsupported');
  assert.equal(view.puedeCompartirGpx(file, {share(){}, canShare(){throw Error();}}), false);
  const platform = {canShare: () => true, share: async data => assert.equal(data.files[0], file)};
  assert.equal(await view.compartirGpx(file, platform), 'shared');
  platform.share = async () => { throw new DOMException('Cancelado', 'AbortError'); };
  assert.equal(await view.compartirGpx(file, platform), 'cancelled');
  platform.share = async () => { throw new DOMException('Bloqueado', 'NotAllowedError'); };
  assert.equal(await view.compartirGpx(file, platform), 'failed');
});

test("Garmin impide rutas vacías y abre el diálogo con la ruta actual verificada", async () => {
  const dialog = document.querySelector('#garminModal');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: 'Ok', routes: [{ distance: 2800,
    geometry: { coordinates: coords.map(point => [point.lon, point.lat]) } }] });
  try {
  dialog.showModal = () => dialog.setAttribute('open', '');
  state.currentRouteCoords = [];
  click('[data-garmin]');
  assert.equal(dialog.hasAttribute('open'), false);
  assert.match(document.querySelector('#statusMessage').textContent, /Crea o importa/);
  state.currentRouteCoords = coords;
  click('[data-garmin]');
  await wait();
  assert.equal(dialog.hasAttribute('open'), true);
  assert.equal(document.querySelector('#garminShare').disabled, true);
  assert.match(document.querySelector('#garminStatus').textContent, /descarga/);
  dialog.removeAttribute('open');
  state.currentRouteCoords = [];
  } finally { globalThis.fetch = originalFetch; }
});

test("menú persistente: las cuatro ventanas cambian y actualizan el enlace", async()=>{
  for (const name of ["library","forecast","updates","plan"]) {
    click(`[data-window="${name}"]`);
    await wait();
    assert.equal(location.hash,"#"+name);
    assert.equal(document.querySelectorAll(".window:not([hidden])").length,1);
    assert.equal(document.querySelector(`[data-window-panel="${name}"]`).hidden,false);
    assert.equal(document.querySelector(`[data-window="${name}"]`).getAttribute("aria-current"),"page");
  }
});

test("sugerencias: guarda texto seguro, persiste y conserva el borrador si falla", async()=>{
  const {leerSugerencias} = await import('../cliente/modelo.js');
  const form = document.querySelector('#suggestionForm');
  const input = document.querySelector('#suggestionText');
  const submit = () => form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  input.value = '   '; submit(); assert.equal(leerSugerencias().length,0);
  input.value = '<img src=x onerror=alert(1)> Más rutas'; submit();
  assert.equal(leerSugerencias().length,1);
  assert.equal(document.querySelector('#suggestionList img'),null);
  assert.match(document.querySelector('#suggestionList').textContent,/Más rutas/);
  assert.equal(input.value,'');
  assert.equal(document.querySelector('#exportarSugerencias').disabled,false);
  const original = window.Storage.prototype.setItem;
  try {
    window.Storage.prototype.setItem = () => {throw new Error('Quota');};
    input.value = 'Otra sugerencia'; submit();
    assert.equal(input.value,'Otra sugerencia');
    assert.match(document.querySelector('#suggestionStatus').textContent,/No se pudo guardar/);
    assert.equal(leerSugerencias().length,1);
  } finally {window.Storage.prototype.setItem = original;}
});

test("accesos del planificador: generar y dibujar conservan la ruta",()=>{
  const previous = state.currentRouteCoords;
  click('#quickDraw'); assert.equal(document.querySelector('#automaticOptions').open,false);
  click('#quickGenerate'); assert.equal(document.querySelector('#automaticOptions').open,true);
  assert.equal(document.activeElement.id,'targetDistance');
  assert.equal(state.currentRouteCoords,previous);
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
  view.mostrarEstado("Error de prueba", "error");
  assert.equal(document.querySelector("#statusMessage").textContent,"Error de prueba");
  click("#dismissStatus");
  assert.equal(document.querySelector("#appStatus").hidden,true);
  view.mostrarEstado("Segundo aviso");
  click("#dismissStatus");
  assert.equal(document.querySelector("#appStatus").hidden,true);
});

test("guardar, buscar, cargar y borrar rutas sin duplicar al actualizar",async()=>{
  state.currentRouteCoords = coords;
  document.querySelector("#saveName").value = "Ruta <prueba>";
  click("#saveRoute");
  click("#saveRoute");
  assert.equal(leerRutasGuardadas().length,1);
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
  assert.equal(leerRutasGuardadas().length,0);
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
  click("#encuadrarRuta");
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
  view.mostrarResumen(60,1.999,[]);
  assert.match(document.querySelector("#summaryCards").textContent,/2 h 0 min/);
});

test("modo verificado: falta de cobertura conserva la ruta y no consulta servicios",async()=>{
  const {redVerificada} = await import('../cliente/red-verificada.js');
  const previousCatalog = redVerificada.tramos;
  const previousFetch = globalThis.fetch;
  redVerificada.tramos = [];
  let calls = 0;
  globalThis.fetch = async()=>{calls++;throw new Error('No debe consultar la red');};
  try {
    document.querySelector('#terrainAssurance').value='verified';
    document.querySelector('#terrainAssurance').dispatchEvent(new window.Event('change'));
    assert.match(document.querySelector('#terrainCoverage').textContent,/Sin tramos/);
    state.currentRouteCoords=coords;
    click('#generarRuta'); await wait();
    assert.equal(calls,0);
    assert.equal(state.currentRouteCoords,coords);
    assert.match(document.querySelector('#generatorResult').textContent,/No hay tramos/);
    assert.equal(document.querySelector('#generarRuta').disabled,false);
  } finally {
    redVerificada.tramos=previousCatalog; globalThis.fetch=previousFetch;
    document.querySelector('#terrainAssurance').value='preference';
  }
});

test("modo verificado: muestra las evidencias como texto y las limpia al cambiar ruta",async()=>{
  const {redVerificada} = await import('../cliente/red-verificada.js');
  const previousCatalog=redVerificada.tramos;
  const points=[{lat:40,lon:-3},{lat:40.02,lon:-3},{lat:40.02,lon:-2.98},{lat:40,lon:-2.98}];
  const today=new Date().toISOString().slice(0,10);
  redVerificada.tramos=points.map((point,i)=>({id:`test-${i}`,coords:[point,points[(i+1)%4]],
    surface:'asphalt',direction:'forward',bicycleAllowed:true,source:'<img src=x onerror=alert(1)>',
    reviewedBy:'Prueba sintética',checkedAt:today,validUntil:today}));
  try {
    click('#clearWaypoints'); state.waypoints=[points[0]];
    document.querySelector('#terrainAssurance').value='verified';
    document.querySelector('#routeSurface').value='asphalt';
    document.querySelector('#targetDistance').value='8';
    click('#generarRuta'); await wait();
    assert.ok(state.importedRoute.generation.verification);
    assert.equal(document.querySelectorAll('#verificationSources li').length,4);
    assert.equal(document.querySelector('#verificationSources img'),null);
    assert.equal(document.querySelector('#verificationEvidence').hidden,false);
    assert.match(document.querySelector('#generatorMetrics').textContent,/Revisión desde/);
    click('#clearWaypoints');
    assert.equal(document.querySelector('#verificationEvidence').hidden,true);
    assert.equal(document.querySelector('#verificationSources').textContent,'');
  } finally {
    redVerificada.tramos=previousCatalog;
    document.querySelector('#terrainAssurance').value='preference';
    document.querySelector('#targetDistance').value='30';
  }
});

test("preferencia: candidato visible y advertencia conservada al guardar y cargar",async()=>{
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async url=>url.startsWith('https://photon.komoot.io/') ? {ok:false} : ({ok:true,json:async()=>({features:[{geometry:{type:'LineString',coordinates:new URL(url).searchParams.get('lonlats').split('|').map(p=>p.split(',').map(Number))},properties:{'track-length':'30000',messages:[['Distance','WayTags'],['30000','highway=residential']]}}]})});
  try {
    click('#clearWaypoints'); escribirRutasGuardadas([]); state.waypoints=[coords[0]];
    document.querySelector('#terrainAssurance').value='preference';
    document.querySelector('#routeSurface').value='dirt';
    document.querySelector('#targetDistance').value='30';
    click('#generarRuta');
    for(let i=0;i<800 && document.querySelector('#generarRuta').disabled;i++) await wait();
    assert.equal(document.querySelector('#generarRuta').disabled,false);
    assert.match(document.querySelector('#generatorResult').textContent,/Firme por revisar/);
    assert.match(document.querySelector('#generatorMetrics').textContent,/sin datos 100 %/);
    assert.equal(state.importedRoute.generation.needsReview,true);
    assert.equal(document.querySelector('#verificationEvidence').hidden,true);
    click('#saveGeneratedRoute'); await wait();
    assert.equal(leerRutasGuardadas()[0].generation.needsReview,true);
    click('[data-action="load"]'); await wait();
    assert.match(document.querySelector('#statusMessage').textContent,/firme sin confirmar/);
  } finally { globalThis.fetch=previousFetch; escribirRutasGuardadas([]); click('#clearWaypoints'); }
});

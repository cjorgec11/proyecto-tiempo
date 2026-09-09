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
const layer = () => ({ addTo(){return this;},clearLayers(){},bindTooltip(){return this;},bindPopup(){return this;} });
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
initApp();
after(()=>page.window.close());

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

test("guardar, buscar, cargar y borrar rutas sin duplicar al actualizar",async()=>{
  state.currentRouteCoords = coords;
  document.querySelector("#saveName").value = "Ruta <prueba>";
  click("#saveRoute");
  click("#saveRoute");
  assert.equal(readSavedRoutes().length,1);
  assert.equal(document.querySelector(".saved-route strong").textContent,"Ruta <prueba>");
  assert.equal(document.querySelector(".saved-route prueba"),null);
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
  click("#clearWaypoints");
  finish({ok:true,json:async()=>[]});
  await wait();
  assert.equal(state.currentRouteCoords.length,0);
  assert.equal(state.currentSegments.length,0);
  assert.equal(document.querySelector('#rideForm button[type="submit"]').disabled,false);
});

test("las duraciones redondean a horas sin mostrar 60 minutos",()=>{
  view.renderSummary(60,1.999,[]);
  assert.match(document.querySelector("#summaryCards").textContent,/2 h 0 min/);
});

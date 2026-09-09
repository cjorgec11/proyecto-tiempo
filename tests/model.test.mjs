import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { pathDistance, sampleRoute, routeSlice, parseRouteFile, buildGpx, validCoordinate,
  weatherFor, nearestHourIndex, readSavedRoutes, writeSavedRoutes, routeAcross, riskFor } from "../js/model.js";

const browser = new JSDOM("", { url: "https://ridecast.test/" });
globalThis.DOMParser = browser.window.DOMParser;
globalThis.localStorage = browser.window.localStorage;
const originalFetch = globalThis.fetch;
const coords = [{ lat:40.4, lon:-3.7 }, { lat:40.41, lon:-3.71 }, { lat:40.42, lon:-3.72 }];
beforeEach(() => localStorage.clear());
afterEach(() => { globalThis.fetch = originalFetch; });

test("geometría: muestras y subtramos mantienen salida y llegada", () => {
  const samples = sampleRoute(coords, 8);
  assert.equal(samples.length, 8);
  assert.equal(samples[0].lat, coords[0].lat);
  assert.equal(samples.at(-1).lon, coords.at(-1).lon);
  assert.equal(samples.at(-1).progress, 1);
  assert.ok(pathDistance(coords) > 2);
  assert.equal(routeSlice(coords, 0, 1).length, 3);
});

test("GPX conserva todos los puntos y escapa los nombres", () => {
  const points = Array.from({ length:1201 }, (_, i) => ({ lat:40 + i / 100000, lon:-3 - i / 100000 }));
  const name = 'Ruta <norte> & "sur"';
  const parsed = parseRouteFile(buildGpx(name, points));
  assert.equal(parsed.coords.length, 1201);
  assert.equal(parsed.name, name);
});

test("GPX no concatena una ruta alternativa al track", () => {
  const xml = '<gpx><trk><trkseg><trkpt lat="40" lon="-3"/><trkpt lat="40.1" lon="-3.1"/></trkseg></trk><rte><rtept lat="50" lon="5"/></rte></gpx>';
  assert.equal(parseRouteFile(xml).coords.length, 2);
});

test("TCX importa posiciones y nombre", () => {
  const xml = '<TrainingCenterDatabase><Courses><Course><Name>Puerto</Name><Track><Trackpoint><Position><LatitudeDegrees>40</LatitudeDegrees><LongitudeDegrees>-3</LongitudeDegrees></Position></Trackpoint><Trackpoint><Position><LatitudeDegrees>40.1</LatitudeDegrees><LongitudeDegrees>-3.1</LongitudeDegrees></Position></Trackpoint></Track></Course></Courses></TrainingCenterDatabase>';
  assert.equal(parseRouteFile(xml).name, "Puerto");
});

test("rechaza XML roto, coordenadas ausentes, fuera de rango y recorridos vacíos", () => {
  for (const xml of ['<gpx>', '<gpx/>', '<gpx><trkpt lon="-3"/><trkpt lat="40" lon="-3"/></gpx>', '<gpx><trkpt lat="95" lon="0"/><trkpt lat="40" lon="-3"/></gpx>']) {
    assert.throws(() => parseRouteFile(xml));
  }
  assert.equal(validCoordinate({lat:NaN,lon:0}), false);
});

test("rutas ciclistas: usa el servicio de bicicletas y no inventa líneas si falla", async () => {
  let request;
  globalThis.fetch = async (url) => { request = url; return {ok:true,json:async()=>({code:"Ok",routes:[{distance:2800,geometry:{coordinates:coords.map(p=>[p.lon,p.lat])}}]})}; };
  const result = await routeAcross(coords, "carretera");
  assert.match(request, /routed-bike\/route\/v1\/cycling/);
  assert.equal(result.routed, true);
  globalThis.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(routeAcross(coords), /No se pudo trazar/);
});

test("consulta meteorológica en UTC con hora de paso y rumbo por tramo", async () => {
  const now = Math.ceil(Date.now() / 3600000) * 3600;
  const departure = new Date(now * 1000);
  const times = [now, now + 3600, now + 7200];
  const hourly = { time:times, temperature_2m:[16,17,18], precipitation_probability:[10,20,30], precipitation:[0,0.1,0.2], weather_code:[0,1,2], wind_speed_10m:[10,11,12], wind_gusts_10m:[15,16,17], wind_direction_10m:[90,100,110] };
  let request;
  globalThis.fetch = async (url) => { request = new URL(url); return {ok:true,json:async()=>[{hourly},{hourly}]}; };
  const result = await weatherFor([{...coords[0],progress:0},{...coords[2],progress:1}], departure, 23, 23);
  assert.equal(request.searchParams.get("timeformat"), "unixtime");
  assert.equal(result[1].arrival.getTime(), departure.getTime() + 3600000);
  assert.equal(result[1].temperature, 17);
  assert.ok(Number.isFinite(result[0].heading));
});

test("no reutiliza la última previsión para fechas fuera del intervalo", () => {
  assert.throws(() => nearestHourIndex([100,200], new Date(300000)), /fuera/);
  assert.equal(nearestHourIndex([100,200],new Date(140000)), 0);
});

test("no trata valores meteorológicos nulos como lluvia cero", async () => {
  const time = Math.ceil(Date.now()/3600000)*3600;
  globalThis.fetch = async () => ({ok:true,json:async()=>({hourly:{time:[time,time+3600],temperature_2m:[null,null]}})});
  await assert.rejects(weatherFor([{...coords[0],progress:0}],new Date(time*1000),10,20), /incompleta/);
});

test("el viento de frente se evalúa respecto al rumbo local", () => {
  const segment = {heading:90,windDirection:90,wind:30,gust:35,rainChance:0,precipitation:0,temperature:20};
  assert.equal(riskFor(segment,270), "bad");
  assert.equal(riskFor({...segment,heading:270},90), "good");
});

test("guardar mantiene más de 20 rutas y leer no modifica datos dañados", () => {
  const routes = Array.from({length:25},(_,i)=>({id:String(i),name:`Ruta ${i}`,coords}));
  writeSavedRoutes(routes);
  assert.equal(readSavedRoutes().length,25);
  localStorage.setItem("ridecast.savedRoutes","roto");
  assert.throws(readSavedRoutes,/No se puede leer/);
  assert.equal(localStorage.getItem("ridecast.savedRoutes"),"roto");
});

test("avisa cuando el almacenamiento está lleno", () => {
  globalThis.localStorage = { setItem() { throw new Error("QuotaExceededError"); } };
  assert.throws(()=>writeSavedRoutes([]),/almacenamiento lleno/);
  globalThis.localStorage = browser.window.localStorage;
});

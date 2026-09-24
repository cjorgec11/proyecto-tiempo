import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { distanciaRecorrido, muestrearRuta, tramoRuta, interpretarArchivoRuta, crearGpx, coordenadaValida,
  consultarTiempo, indiceHoraCercana, leerRutasGuardadas, escribirRutasGuardadas, trazarRutaPorPuntos, riesgoTramo, generarRutaCircular,
  desgloseSuperficies, proporcionRutaRepetida, cumpleSuperficie, esCarreteraAsfaltadaCompleta, haversine } from "../cliente/modelo.js";

const browser = new JSDOM("", { url: "https://ridecast.test/" });
globalThis.DOMParser = browser.window.DOMParser;
globalThis.localStorage = browser.window.localStorage;
const originalFetch = globalThis.fetch;
const coords = [{ lat:40.4, lon:-3.7 }, { lat:40.41, lon:-3.71 }, { lat:40.42, lon:-3.72 }];
beforeEach(() => localStorage.clear());
afterEach(() => { globalThis.fetch = originalFetch; });

const surfaceResponse = (points, distance, surface = 'asphalt') => ({ok:true, json:async()=>({type:'FeatureCollection',features:[{
  properties:{'track-length':String(distance),messages:[['Distance','WayTags'],[String(distance),`surface=${surface} highway=residential`]]}, geometry:{type:'LineString',coordinates:points}
}]})});

test("montaña: estima caminos de grado 2 a 5 sin convertir datos desconocidos en asfalto", () => {
  const result = desgloseSuperficies([['Distance','WayTags'],
    ['600','highway=track tracktype=grade2'], ['100','highway=track tracktype=grade3 surface=asphalt'],
    ['100','highway=track tracktype=grade1'], ['100','highway=track'], ['100','highway=residential']], 1000);
  assert.deepEqual(result, {paved:0.1, unpaved:0.6, unknown:0.3, inferredUnpaved:0.6, unknownOffroad:0.2});
  assert.equal(cumpleSuperficie(result, 'dirt'), true);
  assert.equal(cumpleSuperficie(result, 'asphalt', true), false);
  for (const grade of ['grade4','grade5']) assert.equal(desgloseSuperficies([['Distance','WayTags'], ['100',`highway=track tracktype=${grade}`]],100).inferredUnpaved, 1);
});

test("montaña: acepta caminos sin superficie explícita y conserva su incertidumbre", () => {
  const result = desgloseSuperficies([['Distance','WayTags'], ['700','highway=track'], ['200','highway=residential surface=asphalt'], ['100','highway=residential']],1000);
  assert.equal(result.unpaved,0);
  assert.equal(result.unknown,0.8);
  assert.equal(result.unknownOffroad,0.7);
  assert.equal(cumpleSuperficie(result,'dirt'),true);
  assert.equal(cumpleSuperficie(result,'asphalt',true),false);
  assert.equal(cumpleSuperficie(desgloseSuperficies([['Distance','WayTags'],['1000','highway=track surface=asphalt']],1000),'dirt'),false);
});

test("generador: HTTP 403/429 detiene las consultas sin agotar los intentos", async () => {
  for (const status of [403,429]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return {ok:false,status}; };
    await assert.rejects(generarRutaCircular(coords[0],30,0), /pide esperar/);
    assert.equal(calls,1);
  }
});

test("generador: acota el radio cuando sobrepasa la distancia por ambos lados", async () => {
  const radii = [];
  globalThis.fetch = async url => {
    const stops = new URL(url).searchParams.get('lonlats').split('|').map(p=>p.split(',').map(Number));
    radii.push(haversine(coords[0], {lon:stops[1][0],lat:stops[1][1]}));
    return surfaceResponse(stops,[40000,20000,30000][radii.length-1]);
  };
  const route = await generarRutaCircular(coords[0],30,0);
  assert.equal(route.distance,30);
  assert.equal(radii.length,3);
  assert.ok(radii[2] > radii[1] && radii[2] < radii[0]);
  assert.ok(Math.abs(radii[2] - (radii[1]+radii[0])/2) < 0.001);
});

test("generador: refina la distancia con el perfil de asfalto y cierra el circuito", async () => {
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.match(url, /brouter.de\/brouter/);
    const request = new URL(url);
    const stops = request.searchParams.get('lonlats').split('|').map(p=>p.split(',').map(Number));
    assert.deepEqual(stops[0], stops.at(-1));
    assert.equal(stops.length, 5);
    assert.equal(request.searchParams.get('profile'), 'fastbike');
    assert.equal(request.searchParams.get('profile:allow_steps'), '0');
    return surfaceResponse(stops, calls === 1 ? 37000 : 30100);
  };
  const route = await generarRutaCircular(coords[0], 30, 90);
  assert.equal(route.distance, 30.1);
  assert.deepEqual(route.coords[0], route.coords.at(-1));
  assert.equal(calls, 2);
  assert.ok(route.generation.error < 0.01);
});

test("generador: el modo tierra usa MTB y conserva la preferencia", async () => {
  globalThis.fetch = async url => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('profile'),'mtb');
    assert.equal(params.get('profile:StrictNOBicycleaccess'),'1');
    return surfaceResponse(params.get('lonlats').split('|').map(p=>p.split(',').map(Number)), 30000, 'ground');
  };
  const route = await generarRutaCircular(coords[0],30,0,{surface:'dirt'});
  assert.equal(route.generation.surface,'dirt');
  await assert.rejects(generarRutaCircular(coords[0],30,0,{surface:'invalid'}), /Selecciona/);
});

test("firme: no confunde superficies desconocidas con asfalto", () => {
  assert.deepEqual(desgloseSuperficies([['WayTags','Distance'],['surface=asphalt','500'],['surface=ground','300'],['highway=residential','200']]), {paved:0.5, unpaved:0.3, unknown:0.2});
  assert.equal(desgloseSuperficies([]), null);
  assert.equal(desgloseSuperficies([['Distance','WayTags'],['NaN','surface=asphalt']]), null);
});

test("firme: exige predominio confirmado y cuenta los tramos sin describir", () => {
  assert.equal(cumpleSuperficie(null, 'dirt'), false);
  assert.equal(cumpleSuperficie({paved:0.55,unpaved:0.12,unknown:0.33}, 'dirt'), false);
  assert.equal(cumpleSuperficie({paved:0.2,unpaved:0.7,unknown:0.1}, 'dirt'), true);
  assert.equal(cumpleSuperficie({paved:0.9,unpaved:0.1,unknown:0}, 'asphalt'), false);
  assert.equal(cumpleSuperficie({paved:0.9,unpaved:0.01,unknown:0.09}, 'asphalt', true), false);
  assert.deepEqual(desgloseSuperficies([['Distance','WayTags'],['100','surface=ground']],1000), {paved:0,unpaved:0.1,unknown:0.9});
});

test("asfalto: exige carretera en todos los tramos, incluso si el sendero está asfaltado", () => {
  const table = tags => [['Distance','WayTags'],['999','highway=residential surface=asphalt'],['1',tags]];
  for (const highway of ['path','track','footway','steps','cycleway','pedestrian','motorway']) {
    assert.equal(esCarreteraAsfaltadaCompleta(table(`highway=${highway} surface=asphalt`),1000),false);
  }
  for (const tags of ['highway=residential','surface=asphalt','highway=secondary surface=ground']) {
    assert.equal(esCarreteraAsfaltadaCompleta(table(tags),1000),false);
  }
  const valid = table('highway=secondary surface=asphalt');
  assert.equal(esCarreteraAsfaltadaCompleta(valid,1000),true);
  assert.equal(esCarreteraAsfaltadaCompleta(valid,1001),false);
  assert.equal(esCarreteraAsfaltadaCompleta(null,1000),false);
  assert.equal(cumpleSuperficie({paved:1,unpaved:0,unknown:0},'asphalt'),false);
  assert.equal(cumpleSuperficie({paved:1,unpaved:0,unknown:0},'asphalt',true),true);
});

test("generador: descarta asfalto en modo tierra aunque la distancia sea exacta", async () => {
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    const stops = new URL(url).searchParams.get('lonlats').split('|').map(p=>p.split(',').map(Number));
    return surfaceResponse(stops,30000,calls === 1 ? 'asphalt' : 'ground');
  };
  const route = await generarRutaCircular(coords[0],30,0,{surface:'dirt'});
  assert.equal(calls,2);
  assert.equal(route.generation.surfaces.unpaved,1);
});

test("montaña: busca menos asfalto aunque la primera ruta ajuste mejor la distancia", async () => {
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    const distance = calls === 1 ? 30000 : 30900;
    const paved = calls === 1 ? 0.04 : 0.01;
    const stops = new URL(url).searchParams.get('lonlats').split('|').map(p=>p.split(',').map(Number));
    return {ok:true,json:async()=>({features:[{geometry:{type:'LineString',coordinates:stops},properties:{
      'track-length':String(distance), messages:[['Distance','WayTags'],[String(distance*paved),'surface=asphalt'],[String(distance*(1-paved)),'surface=ground']]
    }}]})};
  };
  const route = await generarRutaCircular(coords[0],30,0,{surface:'dirt'});
  assert.equal(calls,6);
  assert.equal(route.distance,30.9);
  assert.equal(route.generation.surfaces.paved,0.01);
});

test("generador: rechaza rutas sin información del firme", async () => {
  globalThis.fetch = async url => surfaceResponse(new URL(url).searchParams.get('lonlats').split('|').map(p=>p.split(',').map(Number)),30000,'unknown');
  await assert.rejects(generarRutaCircular(coords[0],30,0,{surface:'dirt'}), /60 %/);
});

test("preferencia: devuelve un candidato con firme desconocido conservando la incertidumbre", async () => {
  globalThis.fetch = async url => surfaceResponse(new URL(url).searchParams.get('lonlats').split('|').map(p=>p.split(',').map(Number)),30000,'unknown');
  const route = await generarRutaCircular(coords[0],30,0,{surface:'asphalt',allowUncertain:true});
  assert.equal(route.generation.needsReview,true);
  assert.equal(route.generation.surfaces.unknown,1);
  assert.equal(route.generation.pavedRoadVerified,false);
});

test("preferencia: un candidato incierto no desplaza una alternativa compatible", async () => {
  let calls=0;
  globalThis.fetch = async url => surfaceResponse(new URL(url).searchParams.get('lonlats').split('|').map(p=>p.split(',').map(Number)),30000,++calls===1?'unknown':'asphalt');
  const route = await generarRutaCircular(coords[0],30,0,{allowUncertain:true});
  assert.equal(route.generation.needsReview,false);
  assert.equal(route.generation.surfaces.paved,1);
  assert.equal(calls,2);
});

test("preferencia asfalto: no convierte tierra conocida en candidato", async () => {
  globalThis.fetch = async url => {
    const stops=new URL(url).searchParams.get('lonlats').split('|').map(p=>p.split(',').map(Number));
    return {ok:true,json:async()=>({features:[{geometry:{type:'LineString',coordinates:stops},properties:{
      'track-length':'30000',messages:[['Distance','WayTags'],['1000','surface=ground'],['29000','highway=residential']]
    }}]})};
  };
  await assert.rejects(generarRutaCircular(coords[0],30,0,{allowUncertain:true}),/No se pudo verificar/);
});

test("repetición: detecta una vuelta por el mismo tramo y no penaliza un circuito", () => {
  assert.equal(proporcionRutaRepetida([coords[0],coords[1],coords[0]]),0.5);
  assert.equal(proporcionRutaRepetida([coords[0],coords[1],coords[2],coords[0]]),0);
});

test("generador: valida límites y no inventa geometría si el servicio falla", async () => {
  await assert.rejects(generarRutaCircular(null,30,0), /salida/);
  await assert.rejects(generarRutaCircular(coords[0],4,0), /5 y 150/);
  await assert.rejects(generarRutaCircular(coords[0],151,0), /5 y 150/);
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Sin servicio'); };
  await assert.rejects(generarRutaCircular(coords[0],30,0), /servicio de rutas/);
  assert.equal(calls,6);
});

test("generador: rechaza circuitos lejos de la salida o sin cerrar y respeta cancelación", async () => {
  globalThis.fetch = async () => surfaceResponse([[10,50],[10.1,50.1],[10.2,50.2]],30000);
  await assert.rejects(generarRutaCircular(coords[0],30,0), /No se encontró/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(generarRutaCircular(coords[0],30,0,{signal:controller.signal}), {name:'AbortError'});
});

test("generador: no acepta una desviación del 6 % aunque antes se admitiera", async () => {
  globalThis.fetch = async url => surfaceResponse(new URL(url).searchParams.get('lonlats').split('|').map(p=>p.split(',').map(Number)),31800);
  await assert.rejects(generarRutaCircular(coords[0],30,0), /5 %/);
});

test("geometría: muestras y subtramos mantienen salida y llegada", () => {
  const samples = muestrearRuta(coords, 8);
  assert.equal(samples.length, 8);
  assert.equal(samples[0].lat, coords[0].lat);
  assert.equal(samples.at(-1).lon, coords.at(-1).lon);
  assert.equal(samples.at(-1).progress, 1);
  assert.ok(distanciaRecorrido(coords) > 2);
  assert.equal(tramoRuta(coords, 0, 1).length, 3);
});

test("GPX conserva todos los puntos y escapa los nombres", () => {
  const points = Array.from({ length:1201 }, (_, i) => ({ lat:40 + i / 100000, lon:-3 - i / 100000 }));
  const name = 'Ruta <norte> & "sur"';
  const parsed = interpretarArchivoRuta(crearGpx(name, points));
  assert.equal(parsed.coords.length, 1201);
  assert.equal(parsed.name, name);
});

test("GPX no concatena una ruta alternativa al track", () => {
  const xml = '<gpx><trk><trkseg><trkpt lat="40" lon="-3"/><trkpt lat="40.1" lon="-3.1"/></trkseg></trk><rte><rtept lat="50" lon="5"/></rte></gpx>';
  assert.equal(interpretarArchivoRuta(xml).coords.length, 2);
});

test("TCX importa posiciones y nombre", () => {
  const xml = '<TrainingCenterDatabase><Courses><Course><Name>Puerto</Name><Track><Trackpoint><Position><LatitudeDegrees>40</LatitudeDegrees><LongitudeDegrees>-3</LongitudeDegrees></Position></Trackpoint><Trackpoint><Position><LatitudeDegrees>40.1</LatitudeDegrees><LongitudeDegrees>-3.1</LongitudeDegrees></Position></Trackpoint></Track></Course></Courses></TrainingCenterDatabase>';
  assert.equal(interpretarArchivoRuta(xml).name, "Puerto");
});

test("rechaza XML roto, coordenadas ausentes, fuera de rango y recorridos vacíos", () => {
  for (const xml of ['<gpx>', '<gpx/>', '<gpx><trkpt lon="-3"/><trkpt lat="40" lon="-3"/></gpx>', '<gpx><trkpt lat="95" lon="0"/><trkpt lat="40" lon="-3"/></gpx>']) {
    assert.throws(() => interpretarArchivoRuta(xml));
  }
  assert.equal(coordenadaValida({lat:NaN,lon:0}), false);
});

test("rutas ciclistas: usa el servicio de bicicletas y no inventa líneas si falla", async () => {
  let request;
  globalThis.fetch = async (url) => { request = url; return {ok:true,json:async()=>({code:"Ok",routes:[{distance:2800,geometry:{coordinates:coords.map(p=>[p.lon,p.lat])}}]})}; };
  const result = await trazarRutaPorPuntos(coords, "carretera");
  assert.match(request, /routed-bike\/route\/v1\/cycling/);
  assert.equal(result.routed, true);
  globalThis.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(trazarRutaPorPuntos(coords), /No se pudo trazar/);
});

test("consulta meteorológica en UTC con hora de paso y rumbo por tramo", async () => {
  const now = Math.ceil(Date.now() / 3600000) * 3600;
  const departure = new Date(now * 1000);
  const times = [now, now + 3600, now + 7200];
  const hourly = { time:times, temperature_2m:[16,17,18], precipitation_probability:[10,20,30], precipitation:[0,0.1,0.2], weather_code:[0,1,2], wind_speed_10m:[10,11,12], wind_gusts_10m:[15,16,17], wind_direction_10m:[90,100,110] };
  let request;
  globalThis.fetch = async (url) => { request = new URL(url); return {ok:true,json:async()=>[{hourly},{hourly}]}; };
  const result = await consultarTiempo([{...coords[0],progress:0},{...coords[2],progress:1}], departure, 23, 23);
  assert.equal(request.searchParams.get("timeformat"), "unixtime");
  assert.equal(result[1].arrival.getTime(), departure.getTime() + 3600000);
  assert.equal(result[1].temperature, 17);
  assert.ok(Number.isFinite(result[0].heading));
});

test("no reutiliza la última previsión para fechas fuera del intervalo", () => {
  assert.throws(() => indiceHoraCercana([100,200], new Date(300000)), /fuera/);
  assert.equal(indiceHoraCercana([100,200],new Date(140000)), 0);
});

test("no trata valores meteorológicos nulos como lluvia cero", async () => {
  const time = Math.ceil(Date.now()/3600000)*3600;
  globalThis.fetch = async () => ({ok:true,json:async()=>({hourly:{time:[time,time+3600],temperature_2m:[null,null]}})});
  await assert.rejects(consultarTiempo([{...coords[0],progress:0}],new Date(time*1000),10,20), /incompleta/);
});

test("el viento de frente se evalúa respecto al rumbo local", () => {
  const segment = {heading:90,windDirection:90,wind:30,gust:35,rainChance:0,precipitation:0,temperature:20};
  assert.equal(riesgoTramo(segment,270), "bad");
  assert.equal(riesgoTramo({...segment,heading:270},90), "good");
});

test("guardar mantiene más de 20 rutas y leer no modifica datos dañados", () => {
  const routes = Array.from({length:25},(_,i)=>({id:String(i),name:`Ruta ${i}`,coords}));
  escribirRutasGuardadas(routes);
  assert.equal(leerRutasGuardadas().length,25);
  localStorage.setItem("ridecast.savedRoutes","roto");
  assert.throws(leerRutasGuardadas,/No se puede leer/);
  assert.equal(localStorage.getItem("ridecast.savedRoutes"),"roto");
});

test("avisa cuando el almacenamiento está lleno", () => {
  globalThis.localStorage = { setItem() { throw new Error("QuotaExceededError"); } };
  assert.throws(()=>escribirRutasGuardadas([]),/almacenamiento lleno/);
  globalThis.localStorage = browser.window.localStorage;
});

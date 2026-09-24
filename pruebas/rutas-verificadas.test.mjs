import test from "node:test";
import assert from "node:assert/strict";
import { validarRedVerificada, generarCircuitoVerificado } from "../cliente/rutas-verificadas.js";
import { distanciaRecorrido } from "../cliente/modelo.js";
import { redVerificada } from "../cliente/red-verificada.js";

// Geometría sintética para probar el algoritmo; nunca se publica como evidencia.
const points = [{lat:40,lon:-3},{lat:40.02,lon:-3},{lat:40.02,lon:-2.98},{lat:40,lon:-2.98}];
const target = distanciaRecorrido([...points,points[0]]);
const catalog = () => ({version:1, tramos:points.map((p,i) => ({id:`tramo-${i}`, coords:[p,points[(i+1)%4]],
  surface:"asphalt", direction:"forward", bicycleAllowed:true, source:"Datos sintéticos de prueba",
  reviewedBy:"Test", checkedAt:"2026-09-01", validUntil:"2026-12-01"}))});
const options = {surface:"asphalt",now:new Date("2026-09-23")};

test("red verificada: circuito completo con fecha, fuente y sin enlaces inventados", async () => {
  const route = await generarCircuitoVerificado(catalog(),points[0],target,0,options);
  assert.deepEqual(route.coords,[...points,points[0]]);
  assert.equal(route.generation.verification.evidence.length,4);
  assert.equal(route.generation.verification.checkedAt,"2026-09-01");
  assert.equal(route.generation.verification.startOffsetMeters,0);
  assert.equal(route.generation.surfaces.unknown,0);
});

test("red verificada: no supone superficies ni permite revisiones caducadas o futuras", async () => {
  for (const change of [{surface:"concrete"},{surface:"unknown"},{source:""},{reviewedBy:""},{checkedAt:"2026-02-30"},{bicycleAllowed:false}]) {
    const red = catalog(); Object.assign(red.tramos[0],change);
    assert.throws(()=>validarRedVerificada(red));
  }
  for (const change of [{validUntil:"2026-09-22"},{checkedAt:"2026-10-01"}]) {
    const red = catalog(); Object.assign(red.tramos[0],change);
    await assert.rejects(generarCircuitoVerificado(red,points[0],target,0,options),/No existe|salida/);
  }
});

test("red verificada: no cruza huecos, sentidos prohibidos ni tramos de otro firme", async () => {
  const broken = catalog(); broken.tramos[1].coords[0] = {...points[1],lat:40.020001};
  await assert.rejects(generarCircuitoVerificado(broken,points[0],target,0,options),/No existe/);
  const reversed = catalog(); reversed.tramos[1].coords.reverse();
  await assert.rejects(generarCircuitoVerificado(reversed,points[0],target,0,options),/No existe/);
  const mixed = catalog(); mixed.tramos[1].surface = "gravel";
  await assert.rejects(generarCircuitoVerificado(mixed,points[0],target,0,options),/No existe/);
  const mountain = catalog(); mountain.tramos.forEach(t=>t.surface="gravel");
  const route = await generarCircuitoVerificado(mountain,points[0],target,0,{...options,surface:"dirt"});
  assert.equal(route.generation.surfaces.unpaved,1);
  await assert.rejects(generarCircuitoVerificado(mountain,points[0],target,0,options),/No hay tramos/);
});

test("red verificada: conserva límites de salida, distancia y cancelación", async () => {
  await assert.rejects(generarCircuitoVerificado(catalog(),{lat:41,lon:-3},target,0,options),/salida/);
  await assert.rejects(generarCircuitoVerificado(catalog(),points[0],target*1.2,0,options),/No existe/);
  await assert.rejects(generarCircuitoVerificado(catalog(),points[0],target,0,{...options,signal:AbortSignal.abort()}),{name:"AbortError"});
});

test("el catálogo publicado es válido y la falta de cobertura se rechaza sin red", async () => {
  validarRedVerificada(redVerificada);
  await assert.rejects(generarCircuitoVerificado({version:1,tramos:[]},{lat:42.22815991,lon:-2.09983984},30,0,options),/No hay tramos/);
});

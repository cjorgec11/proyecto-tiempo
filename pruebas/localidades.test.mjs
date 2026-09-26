import test from "node:test";
import assert from "node:assert/strict";
import { localidadesDelRecorrido, nombreConLocalidades } from "../cliente/localidades.js";

test("nombra las localidades distintas en orden y evita repetir la salida de un circuito", async () => {
  const coords = [{lat:42.19,lon:-2.10},{lat:42.22,lon:-2.05},{lat:42.24,lon:-2.02},{lat:42.19,lon:-2.10}];
  const looked = [];
  const places = await localidadesDelRecorrido(coords,{lookup:async point => {
    looked.push(point);
    return point.lat < 42.21 ? "Arnedo" : point.lat < 42.23 ? "Quel" : "Autol";
  }});
  assert.deepEqual(places,["Arnedo","Quel","Autol"]);
  assert.equal(looked.length,5);
  assert.equal(nombreConLocalidades("Circular 30.0 km",places),"Circular 30.0 km · Arnedo · Quel · Autol");
});

test("si falla la consulta o un nombre ocupa el límite se mantiene el nombre anterior", async () => {
  const points = [{lat:42.19,lon:-2.10},{lat:42.22,lon:-2.05}];
  const places = await localidadesDelRecorrido(points,{lookup:async () => {throw new Error("Sin geocodificación");}});
  assert.deepEqual(places,[]);
  assert.equal(nombreConLocalidades("X".repeat(98),["Arnedo"]),"X".repeat(98));
});

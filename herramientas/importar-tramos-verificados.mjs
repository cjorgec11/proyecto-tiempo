import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validarRedVerificada } from "../cliente/rutas-verificadas.js";

const input = process.argv[2];
if (!input) throw new Error("Uso: node herramientas/importar-tramos-verificados.mjs archivo.json. Sustituye el catálogo completo; conserva tu fuente original.");
const red = validarRedVerificada(JSON.parse(await readFile(resolve(input), "utf8")));
const target = new URL("../cliente/red-verificada.js", import.meta.url);
await writeFile(target, `// Catálogo revisado. Generado desde una fuente local validada.\nexport const redVerificada = ${JSON.stringify(red, null, 2)};\n`);
console.log(`Biblioteca actualizada: ${red.tramos.length} tramos. La validación del formato no comprueba la veracidad de las evidencias.`);

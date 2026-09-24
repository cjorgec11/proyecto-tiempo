import { iniciarAplicacion } from "./cliente/controlador.js";
import { iniciarSugerencias } from "./cliente/sugerencias.js";
import { iniciarHistorialRutas } from "./cliente/historial-rutas.js";
import { iniciarCuenta } from "./cliente/cuenta.js";

const accountReady = iniciarCuenta();
iniciarAplicacion();
iniciarHistorialRutas();
accountReady.then(iniciarSugerencias);

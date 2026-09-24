import { gestionarSugerencias } from "./sugerencias.mjs";
import { gestionarAutenticacionAdministracion } from "./autenticacion-administracion.mjs";
import { gestionarRutas } from "./rutas.mjs";
import { gestionarCuenta } from "./cuentas.mjs";
import { gestionarBiblioteca } from "./biblioteca.mjs";
export default {
  async fetch(request, env) {
    // El contexto de previsualización local nunca debe activarse en un Worker publicado.
    env = { ...env, PREVIEW_USER_ID: null, CLIENT_IP: null };
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/account/")) return gestionarCuenta(request, env);
    if (path.startsWith("/api/library")) return gestionarBiblioteca(request, env);
    if (path.startsWith("/api/routes")) return gestionarRutas(request, env);
    if (path.startsWith("/api/admin/")) return gestionarAutenticacionAdministracion(request, env);
    if (path.startsWith("/api/feedback")) return gestionarSugerencias(request, env);
    return env.ASSETS.fetch(request);
  },
};

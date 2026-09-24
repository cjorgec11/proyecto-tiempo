let config, current = null, cloud = null, ready, revision = 0, mode = "login", emailToken = "", tokenPurpose = "reset";
export const cuentaActual = () => current;
export const rutasCuenta = () => cloud;
export async function peticionCuenta(path, options = {}) {
  const headers = new Headers(options.headers);
  return fetch(path, { ...options, headers, credentials: "same-origin", cache: "no-store" });
}
export async function apiCuenta(path, data) {
  const response = await peticionCuenta(path, { signal: AbortSignal.timeout(15000),
    ...(data ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "No se pudo completar la operación.");
  return result;
}
const $ = id => document.getElementById(id);
const notice = text => { if ($("accountStatus")) $("accountStatus").textContent = text; };
const emit = () => window.dispatchEvent(new CustomEvent("ridecast:account", { detail: current }));

export function abrirCuenta() { $("accountDialog")?.showModal(); }
function setMode(value) {
  mode = value;
  $("accountTitle").textContent = ({ login: "Iniciar sesión", register: "Crear cuenta", reset: "Recuperar contraseña", password: "Nueva contraseña" })[mode];
  $("accountNameField").hidden = mode !== "register"; $("accountName").required = mode === "register";
  $("accountEmailField").hidden = mode === "password"; $("accountEmail").required = mode !== "password";
  $("accountPasswordField").hidden = mode === "reset"; $("accountPassword").required = mode !== "reset";
  $("accountPassword").minLength = mode === "login" ? 1 : 12;
  $("accountPassword").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("accountSubmit").textContent = ({ login: "Entrar", register: "Crear cuenta", reset: "Enviar enlace", password: "Guardar contraseña" })[mode];
  for (const button of document.querySelectorAll("[data-account-mode]")) button.setAttribute("aria-pressed", String(button.dataset.accountMode === mode));
  notice("");
  $("accountSubmit").disabled = !config?.available || (["register", "reset"].includes(mode) && !config.email);
  if (["register", "reset"].includes(mode) && !config?.email) notice("El envío de correos de verificación todavía no está configurado.");
}
function render() {
  const signed = Boolean(current && !current.legacy);
  $("accountGuest").hidden = signed; $("accountSigned").hidden = !signed;
  $("accountLabel").textContent = signed ? current.name : "Entrar";
  $("accountIdentity").textContent = signed ? `${current.name} · ${current.email}` : "";
  $("accountAdmin").hidden = !current?.admin;
  $("accountGoogle").disabled = !config?.google;
  $("googleAccountNotice").hidden = Boolean(config?.google);
  $("accountSubmit").disabled = !config?.available || (["register", "reset"].includes(mode) && !config.email);
  if (!config?.available) notice("Las cuentas no están disponibles ahora. Puedes seguir planificando como invitado.");
  if ($("libraryAccountStatus")) $("libraryAccountStatus").textContent = signed ? `Rutas de ${current.name}` : "Rutas guardadas en este dispositivo. Inicia sesión para guardarlas en tu cuenta.";
  if ($("uploadLocalRoutes")) $("uploadLocalRoutes").hidden = !signed;
}
export async function actualizarCuenta() {
  const version = ++revision;
  try {
    const { user } = await apiCuenta("/api/account/session");
    if (version !== revision) return;
    const changed = current?.id !== user?.id;
    current = user;
    cloud = user && !user.legacy ? (changed ? [] : cloud || []) : null;
    render(); if (changed) emit();
    if (cloud) await recargarRutasCuenta(version);
    if (version === revision) emit();
  } catch (error) {
    if (version !== revision) return;
    // Un fallo de red no confirma que la sesión haya terminado.
    render(); notice(error.message);
    if ($("libraryAccountStatus")) $("libraryAccountStatus").textContent = "No se pudo actualizar la cuenta o sus rutas. Pulsa Actualizar para reintentar.";
  }
}
export async function recargarRutasCuenta(version = revision) {
  if (!current || current.legacy) return;
  let routes = [], page = 0, more;
  do {
    const result = await apiCuenta(`/api/library?page=${page++}`);
    if (version !== revision) return;
    routes.push(...result.entries.map(row => ({ ...row, createdAt: new Date(row.created_at).toISOString(), coords: row.preview || [] })));
    more = result.hasMore;
  } while (more && page < 10);
  cloud = routes; render(); emit();
}
export async function rutaEnServidor(id) {
  const version = revision;
  const { route } = await apiCuenta(`/api/library?id=${encodeURIComponent(id)}`);
  if (version !== revision) throw new Error("La cuenta ha cambiado. Vuelve a abrir la ruta.");
  return route;
}
export async function guardarRutaEnServidor(route) {
  const version = revision;
  if (!current || current.legacy) throw new Error("Inicia sesión para guardar en tu cuenta.");
  const result = await apiCuenta("/api/library", { action: "save", route });
  if (version !== revision) throw new Error("La cuenta ha cambiado.");
  cloud = [result.route, ...(cloud || []).filter(item => item.id !== route.id)]; emit();
}
export async function eliminarRutaEnServidor(id) {
  const version = revision;
  await apiCuenta("/api/library", { action: "delete", id });
  if (version !== revision) return;
  cloud = cloud.filter(route => route.id !== id); emit();
}
export async function cerrarSesionCuenta() {
  await apiCuenta("/api/account/logout", {});
  revision++; current = null; cloud = null; render(); emit();
}

export function iniciarCuenta() {
  if (ready) return ready;
  const verificationLink = /^#account-(verify|reset)=([a-f0-9]{64})$/.exec(location.hash);
  if (verificationLink) window.history.replaceState(null, "", location.pathname + location.search + "#plan");
  document.body.insertAdjacentHTML("beforeend", `<dialog id="accountDialog" class="account-dialog" aria-labelledby="accountTitle">
    <div class="section-heading"><h2 id="accountTitle">Mi cuenta</h2><button type="button" id="accountClose" class="icon-button" aria-label="Cerrar" title="Cerrar"><i data-lucide="x"></i></button></div>
    <div id="accountSigned" hidden><p id="accountIdentity"></p><a id="accountAdmin" class="secondary-button" href="./administracion.html" hidden><i data-lucide="settings"></i>Administración</a><button id="accountLogout" class="secondary-button" type="button"><i data-lucide="log-out"></i>Cerrar sesión</button></div>
    <div id="accountGuest"><div class="account-tabs"><button type="button" data-account-mode="login" aria-pressed="true">Entrar</button><button type="button" data-account-mode="register" aria-pressed="false">Crear cuenta</button></div>
      <button type="button" id="accountGoogle" class="secondary-button">Continuar con Google</button><p id="googleAccountNotice" class="muted" hidden>El acceso con Google todavía no está configurado.</p>
      <form id="accountForm"><label id="accountNameField" hidden>Nombre<input id="accountName" autocomplete="name" maxlength="100"></label><label id="accountEmailField">Correo electrónico<input id="accountEmail" type="email" autocomplete="email" maxlength="254" required></label><label id="accountPasswordField">Contraseña<input id="accountPassword" type="password" autocomplete="current-password" maxlength="128" required></label><button id="accountSubmit" type="submit" class="primary-button">Entrar</button></form>
      <button type="button" class="text-button" data-account-mode="reset">He olvidado mi contraseña</button><button type="button" id="accountContinue" class="text-button">Continuar sin cuenta</button>
    </div><p id="accountStatus" class="muted" role="status" aria-live="polite"></p></dialog>`);
  if (!$("accountButton")) {
    const button = document.createElement("button"); button.id = "accountButton"; button.className = "secondary-button compact"; button.type = "button";
    button.title = "Mi cuenta"; button.setAttribute("aria-label", "Mi cuenta");
    button.innerHTML = '<i data-lucide="user-round"></i><span id="accountLabel">Entrar</span>';
    document.querySelector(".topbar-right, .topbar")?.append(button);
  }
  $("accountButton").addEventListener("click", abrirCuenta);
  $("accountClose").addEventListener("click", () => $("accountDialog").close());
  $("accountContinue").addEventListener("click", () => $("accountDialog").close());
  $("accountDialog").addEventListener("close", () => { $("accountPassword").value = ""; });
  document.querySelectorAll("[data-account-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.accountMode)));
  $("accountLogout").addEventListener("click", async () => { try { await cerrarSesionCuenta(); $("accountDialog").close(); } catch (error) { notice(error.message); } });
  $("accountGoogle").addEventListener("click", async () => {
    if (!config?.google) return;
    try { const result = await apiCuenta("/api/account/google", {}); const target = new URL(result.url); if (target.origin !== "https://accounts.google.com") throw new Error(); location.assign(target.href); }
    catch { notice("No se pudo abrir Google. Revisa la configuración del proveedor e inténtalo de nuevo."); }
  });
  $("accountForm").addEventListener("submit", async event => {
    event.preventDefault(); if (!config?.available) return;
    $("accountSubmit").disabled = true;
    const email = $("accountEmail").value.trim(), password = $("accountPassword").value;
    try {
      let result;
      if (mode === "register") result = await apiCuenta("/api/account/register", { email, password, name: $("accountName").value.trim() });
      else if (mode === "reset") result = await apiCuenta("/api/account/recover", { email });
      else if (mode === "password") result = await apiCuenta(`/api/account/${tokenPurpose}`, { token: emailToken, password });
      else result = await apiCuenta("/api/account/login", { email, password });
      $("accountPassword").value = "";
      if (mode === "register" || mode === "reset") notice(result.message);
      else if (mode === "password") { emailToken = ""; setMode("login"); notice(result.message); }
      else { await actualizarCuenta(); if (current) $("accountDialog").close(); else notice("Confirma tu correo antes de entrar."); }
    } catch (error) { notice(error.message || "No se pudo completar la operación."); }
    finally { $("accountSubmit").disabled = false; }
  });
  ready = (async () => {
    try {
      config = (await apiCuenta("/api/account/config")).config;
      await actualizarCuenta();
      const link = verificationLink;
      if (link) {
        tokenPurpose = link[1]; emailToken = link[2];
        window.history.replaceState(null, "", location.pathname + location.search + "#plan");
        setMode("password"); $("accountGuest").hidden = false; $("accountSigned").hidden = true; abrirCuenta();
      }
    } catch { render(); notice("No se pudo cargar el acceso a cuentas. Puedes seguir como invitado."); }
    window.lucide?.createIcons();
  })();
  window.addEventListener("focus", () => { if (config?.available) actualizarCuenta(); });
  return ready;
}

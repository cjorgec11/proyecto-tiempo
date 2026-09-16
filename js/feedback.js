const labels = { routes: "Rutas", weather: "Previsión", interface: "Interfaz", other: "Otra idea" };
const states = { new: "Nueva", reviewed: "Revisada", resolved: "Resuelta" };
const $ = id => document.getElementById(id);

async function api(path, data) {
  const response = await fetch(`/api/feedback${path}`, {
    credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000),
    ...(data ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error("El buzón aún no está disponible en esta versión."); }
  if (!response.ok) throw new Error(result.error || "No se pudo completar la operación.");
  return result;
}

function entryView(entry) {
  const article = document.createElement("article"); article.className = "suggestion-item";
  const heading = document.createElement("strong"); heading.textContent = labels[entry.category] || "Otra idea";
  const date = document.createElement("p"); date.className = "muted";
  date.textContent = `${new Date(entry.created_at).toLocaleString("es-ES")} · ${states[entry.status] || entry.status}`;
  const text = document.createElement("p"); text.textContent = entry.message;
  article.append(heading, date, text);
  return article;
}

export function initFeedback() {
  let pending = null, sending = false;
  let signedIn = false, communityPage = 0, communityBusy = false;
  async function community(more = false) {
    if (communityBusy) return;
    communityBusy = true; $("moreCommunity").disabled = true;
    try {
      const page = more ? communityPage + 1 : 0;
      const result = await api(`/community?page=${page}`);
      if (!more) $("communityEntries").replaceChildren();
      $("communityStatus").textContent = result.entries.length || more ? "" : "Todavía no hay sugerencias publicadas.";
      for (const entry of result.entries) {
        const article = entryView(entry, false);
        const vote = document.createElement("button"); vote.type = "button"; vote.className = "secondary-button vote-button";
        const icon = document.createElement("i"); icon.dataset.lucide = "thumbs-up";
        const label = document.createElement("span"); vote.append(icon, label);
        const update = () => {
          vote.setAttribute("aria-pressed", String(Boolean(entry.voted)));
          label.textContent = `${entry.voted ? "Te interesa" : "Me interesa"} · ${entry.votes || 0}`;
          vote.title = entry.voted ? "Retirar mi voto" : "Votar esta sugerencia";
        };
        update();
        vote.addEventListener("click", async () => {
          if (!signedIn) {
            $("communityStatus").textContent = "Inicia sesión con ChatGPT para votar.";
            $("feedbackSignIn").hidden = false; $("feedbackSignIn").focus(); return;
          }
          vote.disabled = true;
          try { Object.assign(entry, await api("/vote", { id: entry.id, voted: !entry.voted })); update(); $("communityStatus").textContent = "Voto actualizado."; }
          catch (error) { $("communityStatus").textContent = error.message; }
          finally { vote.disabled = false; }
        });
        article.append(vote); $("communityEntries").append(article);
      }
      window.lucide?.createIcons();
      communityPage = page; $("moreCommunity").hidden = !result.hasMore;
    } catch (error) { $("communityStatus").textContent = error.message; }
    finally { communityBusy = false; $("moreCommunity").disabled = false; }
  }
  let ownPage = 0, ownBusy = false;
  async function list(more = false) {
    if (ownBusy) return;
    ownBusy = true;
    const target = $("sentFeedback");
    const notice = $("feedbackStatus");
    const button = $("moreFeedback");
    button.disabled = true;
    try {
      const page = more ? ownPage + 1 : 0;
      const result = await api(`?page=${page}`);
      if (!more) target.replaceChildren();
      if (!result.entries.length && !more) { const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "Todavía no hay sugerencias enviadas."; target.append(empty); }
      for (const entry of result.entries) target.append(entryView(entry));
      ownPage = page; button.hidden = !result.hasMore;
    } catch (error) { notice.textContent = error.message; }
    finally { ownBusy = false; button.disabled = false; }
  }
  async function session() {
    try {
      const state = await api("/session");
      signedIn = state.signedIn;
      $("sendSuggestion").disabled = !state.signedIn || !state.available;
      $("feedbackSignIn").hidden = state.signedIn;
      if (!state.signedIn) { $("sentFeedback").replaceChildren(); $("moreFeedback").hidden = true; }
      if (!state.available) $("feedbackStatus").textContent = "El buzón aún no está disponible. Puedes guardar tu sugerencia en este navegador.";
      else if (!state.signedIn) $("feedbackStatus").textContent = "Inicia sesión para enviar tu sugerencia y consultar tus envíos.";
      if (state.signedIn && state.available) await list();
      if (state.available) await community();
    } catch (error) {
      signedIn = false;
      $("sendSuggestion").disabled = true;
      $("sentFeedback").replaceChildren();
      $("moreFeedback").hidden = true;
      $("feedbackStatus").textContent = error.message;
    }
  }
  $("sendSuggestion").addEventListener("click", async () => {
    if (sending || !$("suggestionForm").reportValidity()) return;
    const text = $("suggestionText").value.trim(), category = $("suggestionCategory").value;
    if (!text) { $("feedbackStatus").textContent = "Escribe una sugerencia antes de enviarla."; return; }
    if (!pending || pending.text !== text || pending.category !== category) pending = { id: crypto.randomUUID(), text, category, public: true };
    sending = true; $("sendSuggestion").disabled = true;
    $("feedbackStatus").textContent = "Enviando…";
    try {
      await api("", pending);
      pending = null;
      if ($("suggestionText").value.trim() === text && $("suggestionCategory").value === category) $("suggestionForm").reset();
      $("suggestionStatus").textContent = "";
      $("feedbackStatus").textContent = "Sugerencia publicada para la comunidad.";
      await list();
      await community();
    } catch (error) { $("feedbackStatus").textContent = `${error.message} Tu texto se conserva; puedes reintentar el envío.`; }
    finally { sending = false; $("sendSuggestion").disabled = false; }
  });
  $("refreshFeedback").addEventListener("click", session);
  $("moreFeedback").addEventListener("click", () => list(true));
  $("refreshCommunity").addEventListener("click", () => community());
  $("moreCommunity").addEventListener("click", () => community(true));
  session();
}

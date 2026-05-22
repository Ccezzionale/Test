import { supabase as sb } from "./supabase-config.js";

const sb = HAS_SUPABASE_CONFIG && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let editions = [];
let activeGw = null;

const $ = (id) => document.getElementById(id);

const fields = {
  id: "editionId",
  gw: "gw",
  is_published: "isPublished",
  title: "title",
  deck: "deck",
  editorial_title: "editorialTitle",
  editorial_text: "editorialText",
  pull_quote: "pullQuote",
  hero_image_url: "heroImageUrl",
  teaser_title: "teaserTitle",
  teaser_text: "teaserText",
  teaser_image_url: "teaserImageUrl"
};

function setGate(message, type = ""){
  const gate = $("adminGate");
  if (!gate) return;
  gate.textContent = message;
  gate.className = `gate-card ${type}`.trim();
}

function setSaveStatus(message, type = ""){
  const el = $("saveStatus");
  if (!el) return;
  el.textContent = message || "";
  el.className = type || "";
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formValue(id){
  const el = $(id);
  return String(el?.value ?? "").trim();
}

function fillForm(row = null){
  $("formTitle").textContent = row ? `Modifica GW ${row.gw}` : "Nuova edizione";
  activeGw = row?.gw || null;

  $(fields.id).value = row?.id || "";
  $(fields.gw).value = row?.gw || "";
  $(fields.is_published).checked = Boolean(row?.is_published);
  $(fields.title).value = row?.title || "";
  $(fields.deck).value = row?.deck || "";
  $(fields.editorial_title).value = row?.editorial_title || "Il Punto di Costantino";
  $(fields.editorial_text).value = row?.editorial_text || "";
  $(fields.pull_quote).value = row?.pull_quote || "";
  $(fields.hero_image_url).value = row?.hero_image_url || "";
  $(fields.teaser_title).value = row?.teaser_title || "Nel prossimo episodio";
  $(fields.teaser_text).value = row?.teaser_text || "";
  $(fields.teaser_image_url).value = row?.teaser_image_url || "";
}

function collectPayload(){
  const gw = Number($(fields.gw)?.value || 0);
  if (!Number.isInteger(gw) || gw <= 0) {
    throw new Error("Inserisci una GW valida.");
  }

  return {
    gw,
    is_published: Boolean($(fields.is_published)?.checked),
    title: formValue(fields.title),
    deck: formValue(fields.deck),
    editorial_title: formValue(fields.editorial_title) || "Il Punto di Costantino",
    editorial_text: formValue(fields.editorial_text),
    pull_quote: formValue(fields.pull_quote),
    hero_image_url: formValue(fields.hero_image_url),
    teaser_title: formValue(fields.teaser_title) || "Nel prossimo episodio",
    teaser_text: formValue(fields.teaser_text),
    teaser_image_url: formValue(fields.teaser_image_url)
  };
}

async function requireAdmin(){
  if (!sb) {
    throw new Error("Supabase non configurato. Compila supabase-config.js con URL e anon key.");
  }

  const { data: userData, error: userError } = await sb.auth.getUser();
  if (userError) throw userError;

  const user = userData?.user;
  if (!user) {
    throw new Error("Devi essere loggato per usare l'admin Gazzetta.");
  }

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("role,email")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  if (profile?.role !== "admin") {
    throw new Error("Accesso negato: il tuo profilo non ha ruolo admin.");
  }

  return user;
}

async function loadEditions(){
  const { data, error } = await sb
    .from("gazzetta_editions")
    .select("*")
    .order("gw", { ascending: false });

  if (error) throw error;
  editions = data || [];
  renderEditionsList();
}

function renderEditionsList(){
  const list = $("editionsList");
  if (!list) return;

  if (!editions.length) {
    list.innerHTML = `<div class="edition-item"><div class="title">Nessuna edizione ancora salvata.</div><div class="meta">Clicca “Nuova” e inaugura la redazione.</div></div>`;
    return;
  }

  list.innerHTML = editions.map(row => `
    <button type="button" class="edition-item ${Number(activeGw) === Number(row.gw) ? "active" : ""}" data-gw="${row.gw}">
      <div class="top">
        <span>GW ${row.gw}</span>
        <span class="pub-pill ${row.is_published ? "" : "draft"}">${row.is_published ? "Pubblicata" : "Bozza"}</span>
      </div>
      <div class="title">${escapeHtml(row.title || "Senza titolo")}</div>
      <div class="meta">${row.updated_at ? `Aggiornata ${new Date(row.updated_at).toLocaleString("it-IT")}` : ""}</div>
    </button>
  `).join("");

  list.querySelectorAll(".edition-item[data-gw]").forEach(btn => {
    btn.addEventListener("click", () => {
      const gw = Number(btn.dataset.gw);
      const row = editions.find(e => Number(e.gw) === gw);
      fillForm(row);
      renderEditionsList();
    });
  });
}

async function saveEdition(){
  try {
    setSaveStatus("Salvataggio…");
    const payload = collectPayload();

    const { data, error } = await sb
      .from("gazzetta_editions")
      .upsert(payload, { onConflict: "gw" })
      .select("*")
      .single();

    if (error) throw error;

    setSaveStatus("Salvata ✅", "ok");
    await loadEditions();
    fillForm(data);
    renderEditionsList();
    setTimeout(() => setSaveStatus(""), 1600);
  } catch (e) {
    console.error(e);
    setSaveStatus(e.message || "Errore salvataggio", "error");
  }
}

function wireEvents(){
  $("btnNew")?.addEventListener("click", () => {
    fillForm(null);
    renderEditionsList();
    setSaveStatus("");
  });

  $("btnSave")?.addEventListener("click", saveEdition);
}

document.addEventListener("DOMContentLoaded", async () => {
  wireEvents();

  try {
    await requireAdmin();
    setGate("Accesso admin confermato. La redazione è aperta.", "ok");
    $("adminApp").hidden = false;
    await loadEditions();
    fillForm(editions[0] || null);
  } catch (e) {
    console.error(e);
    setGate(e.message || "Errore controllo admin.", "error");
    $("adminApp").hidden = true;
  }
});

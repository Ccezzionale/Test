import { supabase as sb } from "./supabase-config.js";

let editions = [];
let activeGw = null;

const squadreBase = [
  { nome: "Rubinkebab", logo: "img/Rubinkebab.png" },
  { nome: "Bayern Christiansen", logo: "img/Bayern Christiansen.png" },
  { nome: "Team Bartowski", logo: "img/Team Bartowski.png" },
  { nome: "Golden Knights", logo: "img/Golden Knights.png" },
  { nome: "Ibla", logo: "img/Ibla.png" },
  { nome: "Fantaugusta", logo: "img/Fantaugusta.png" },
  { nome: "Riverfilo", logo: "img/Riverfilo.png" },
  { nome: "Desperados", logo: "img/Desperados.png" },
  { nome: "Wildboys 78", logo: "img/wildboys78.png" },
  { nome: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.png" },
  { nome: "Pokermantra", logo: "img/PokerMantra.png" },
  { nome: "Minnesode Timberland", logo: "img/Minnesode Timberland.png" },
  { nome: "Minnesota Snakes", logo: "img/MinneSota Snakes.png" },
  { nome: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.png" },
  { nome: "FC Disoneste", logo: "img/FC Disoneste.png" },
  { nome: "Athletic Pongao", logo: "img/Athletic Pongao.png" }
];

function getTeamLogo(teamName){
  const found = squadreBase.find(t => t.nome === teamName);
  return found?.logo || "";
}

function populateTeamSelects(){
  document.querySelectorAll(".team-select").forEach(select => {
    const currentValue = select.value;

    select.innerHTML = `<option value="">Scegli squadra</option>`;

    squadreBase.forEach(team => {
      const opt = document.createElement("option");
      opt.value = team.nome;
      opt.textContent = team.nome;
      select.appendChild(opt);
    });

    if (currentValue) select.value = currentValue;
  });
}

const $ = (id) => document.getElementById(id);

const fields = {
  id: "editionId",
  gw: "gw",
  is_published: "isPublished",
  edition_date: "editionDate",
  title: "title",
  deck: "deck",
  hero_image_url: "heroImageUrl",
  hero_image_alt: "heroImageAlt",
  editorial_title: "editorialTitle",
  editorial_text: "editorialText",
  pull_quote: "pullQuote",
  editorial_signature: "editorialSignature",

  rating_1_team: "rating1Team",
  rating_1_vote: "rating1Vote",
  rating_1_label: "rating1Label",
  rating_1_text: "rating1Text",
  rating_1_icon_url: "rating1IconUrl",
  rating_2_team: "rating2Team",
  rating_2_vote: "rating2Vote",
  rating_2_label: "rating2Label",
  rating_2_text: "rating2Text",
  rating_2_icon_url: "rating2IconUrl",
  rating_3_team: "rating3Team",
  rating_3_vote: "rating3Vote",
  rating_3_label: "rating3Label",
  rating_3_text: "rating3Text",
  rating_3_icon_url: "rating3IconUrl",
  rating_4_team: "rating4Team",
  rating_4_vote: "rating4Vote",
  rating_4_label: "rating4Label",
  rating_4_text: "rating4Text",
  rating_4_icon_url: "rating4IconUrl",
  rating_5_team: "rating5Team",
  rating_5_vote: "rating5Vote",
  rating_5_label: "rating5Label",
  rating_5_text: "rating5Text",
  rating_5_icon_url: "rating5IconUrl",

  top_1_title: "top1Title",
  top_1_text: "top1Text",
  top_2_title: "top2Title",
  top_2_text: "top2Text",
  top_3_title: "top3Title",
  top_3_text: "top3Text",

  flop_1_title: "flop1Title",
  flop_1_text: "flop1Text",
  flop_2_title: "flop2Title",
  flop_2_text: "flop2Text",
  flop_3_title: "flop3Title",
  flop_3_text: "flop3Text",

  next_title: "nextTitle",
  next_event_title: "nextEventTitle",
  next_subtitle: "nextSubtitle",
  next_text: "nextText",
  next_image_url: "nextImageUrl",
  next_team_a: "nextTeamA",
  next_team_b: "nextTeamB",
  next_date: "nextDate",
  next_time: "nextTime",
  next_cta_label: "nextCtaLabel",
  next_cta_url: "nextCtaUrl"
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

function setValue(fieldKey, value){
  const id = fields[fieldKey];
  const el = $(id);
  if (!el) return;
  if (el.type === "checkbox") el.checked = Boolean(value);
  else el.value = value || "";
}

function fillForm(row = null){
  $("formTitle").textContent = row ? `Modifica GW ${row.gw}` : "Nuova edizione";
  activeGw = row?.gw || null;

  setValue("id", row?.id || "");
  setValue("gw", row?.gw || "");
  setValue("is_published", Boolean(row?.is_published));
  setValue("edition_date", row?.edition_date || "");
  setValue("title", row?.title || "");
  setValue("deck", row?.deck || "");
  setValue("hero_image_url", row?.hero_image_url || "");
  setValue("hero_image_alt", row?.hero_image_alt || "");
  setValue("editorial_title", row?.editorial_title || "Il Punto di Costantino");
  setValue("editorial_text", row?.editorial_text || "");
  setValue("pull_quote", row?.pull_quote || "");
  setValue("editorial_signature", row?.editorial_signature || "Costantino");

  for (let i = 1; i <= 5; i++){
    setValue(`rating_${i}_team`, row?.[`rating_${i}_team`] || "");
    setValue(`rating_${i}_vote`, row?.[`rating_${i}_vote`] || "");
    setValue(`rating_${i}_label`, row?.[`rating_${i}_label`] || "");
    setValue(`rating_${i}_text`, row?.[`rating_${i}_text`] || "");
    setValue(`rating_${i}_icon_url`, row?.[`rating_${i}_icon_url`] || "");
  }

  for (let i = 1; i <= 3; i++){
    setValue(`top_${i}_title`, row?.[`top_${i}_title`] || "");
    setValue(`top_${i}_text`, row?.[`top_${i}_text`] || "");
    setValue(`flop_${i}_title`, row?.[`flop_${i}_title`] || "");
    setValue(`flop_${i}_text`, row?.[`flop_${i}_text`] || "");
  }

  setValue("next_title", row?.next_title || row?.teaser_title || "Next on Lega degli Eroi");
  setValue("next_event_title", row?.next_event_title || "");
  setValue("next_subtitle", row?.next_subtitle || "");
  setValue("next_text", row?.next_text || row?.teaser_text || "");
  setValue("next_image_url", row?.next_image_url || row?.teaser_image_url || "");
  setValue("next_team_a", row?.next_team_a || "");
  setValue("next_team_b", row?.next_team_b || "");
  setValue("next_date", row?.next_date || "");
  setValue("next_time", row?.next_time || "");
  setValue("next_cta_label", row?.next_cta_label || "");
  setValue("next_cta_url", row?.next_cta_url || "");
}

function collectPayload(){
  const gw = Number($(fields.gw)?.value || 0);
  if (!Number.isInteger(gw) || gw <= 0) {
    throw new Error("Inserisci una GW valida.");
  }

  const payload = {
    gw,
    is_published: Boolean($(fields.is_published)?.checked),
    edition_date: formValue(fields.edition_date),
    title: formValue(fields.title),
    deck: formValue(fields.deck),
    hero_image_url: formValue(fields.hero_image_url),
    hero_image_alt: formValue(fields.hero_image_alt),
    editorial_title: formValue(fields.editorial_title) || "Il Punto di Costantino",
    editorial_text: formValue(fields.editorial_text),
    pull_quote: formValue(fields.pull_quote),
    editorial_signature: formValue(fields.editorial_signature) || "Costantino",
    next_title: formValue(fields.next_title) || "Next on Lega degli Eroi",
    next_event_title: formValue(fields.next_event_title),
    next_subtitle: formValue(fields.next_subtitle),
    next_text: formValue(fields.next_text),
    next_image_url: formValue(fields.next_image_url),
    next_team_a: formValue(fields.next_team_a),
    next_team_b: formValue(fields.next_team_b),
    next_date: formValue(fields.next_date),
    next_time: formValue(fields.next_time),
    next_cta_label: formValue(fields.next_cta_label),
    next_cta_url: formValue(fields.next_cta_url),
    updated_at: new Date().toISOString()
  };

  for (let i = 1; i <= 5; i++){
    payload[`rating_${i}_team`] = formValue(fields[`rating_${i}_team`]);
    payload[`rating_${i}_vote`] = formValue(fields[`rating_${i}_vote`]);
    payload[`rating_${i}_label`] = formValue(fields[`rating_${i}_label`]);
    payload[`rating_${i}_text`] = formValue(fields[`rating_${i}_text`]);
    payload[`rating_${i}_icon_url`] = formValue(fields[`rating_${i}_icon_url`]);
  }

  for (let i = 1; i <= 3; i++){
    payload[`top_${i}_title`] = formValue(fields[`top_${i}_title`]);
    payload[`top_${i}_text`] = formValue(fields[`top_${i}_text`]);
    payload[`flop_${i}_title`] = formValue(fields[`flop_${i}_title`]);
    payload[`flop_${i}_text`] = formValue(fields[`flop_${i}_text`]);
  }

  return payload;
}

async function requireAdmin(){
  if (!sb) {
    throw new Error("Supabase non configurato. Controlla supabase-config.js.");
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
    .order("updated_at", { ascending: false });

  if (error) throw error;
  editions = data || [];
  renderEditionsList();
}

function renderEditionsList(){
  const list = $("editionsList");
  if (!list) return;

  if (!editions.length) {
    list.innerHTML = `<div class="edition-empty"><div class="title">Nessuna edizione ancora salvata.</div><div class="meta">Clicca “Nuova” e inaugura la redazione.</div></div>`;
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

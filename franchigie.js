import { supabase } from "./supabase.js";

const ADMIN_EMAIL = "tringali0511@gmail.com";

const TEAM_ASSETS = [
  { name: "Atlético Leon", logo: "img/Atlético Leon.webp", mascot: "img/maglie/leon-mascotte.webp", coach: "Leo e Anthony" },
  { name: "Bayern Christiansen", logo: "img/Bayern Christiansen.webp", mascot: "img/maglie/bayern-mascotte.webp", coach: "Christian" },
  { name: "Team Bartowski", logo: "img/Team Bartowski.webp", mascot: "img/maglie/bartowski-mascotte.webp", coach: "Marco" },
  { name: "Golden Knights", logo: "img/Golden Knights.webp", mascot: "img/maglie/golden-mascotte.webp", coach: "Mimmo e Francesco" },
  { name: "Ibla", logo: "img/Ibla.webp", mascot: "img/maglie/ibla-mascotte.webp", coach: "Francesco" },
  { name: "Fantaugusta", logo: "img/Fantaugusta.webp", mascot: "img/maglie/fantaugusta-mascotte.webp", coach: "Giancarlo" },
  { name: "Riverfilo", logo: "img/Riverfilo.webp", mascot: "img/maglie/riverfilo-mascotte.webp", coach: "Federico" },
  { name: "Desperados", logo: "img/Desperados.webp", mascot: "img/maglie/desperados-mascotte.webp", coach: "Stefano" },
  { name: "Wildboys 78", logo: "img/wildboys78.webp", mascot: "img/maglie/wildboys-mascotte.webp", coach: "Francesco" },
  { name: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.webp", mascot: "img/maglie/pandini-mascotte.webp", coach: "Davide" },
  { name: "Pokermantra", logo: "img/PokerMantra.webp", mascot: "img/maglie/pokermantra-mascotte.webp", coach: "Omar" },
  { name: "Minnesode Timberland", logo: "img/Minnesode Timberland.webp", mascot: "img/maglie/minnesode-mascotte.webp", coach: "Pierpaolo e Leandro" },
  { name: "Minnesota Snakes", logo: "img/MinneSota Snakes.webp", mascot: "img/maglie/snakes-mascotte.webp", coach: "Alberto" },
  { name: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.webp", mascot: "img/maglie/franco-mascotte.webp", coach: "Lorenzo" },
  { name: "FC Disoneste", logo: "img/FC Disoneste.webp", mascot: "img/maglie/disoneste-mascotte.webp", coach: "Basilio" },
  { name: "Athletic Pongao", logo: "img/Athletic Pongao.webp", mascot: "img/maglie/pongao-mascotte.webp", coach: "Dario e Giorgio" }
];

const STADIUM_ASSETS = {
  wildboys78: "icons/nav/Wildboys.webp",
  minnesodetimberland: "icons/nav/minnesode.webp",
  athleticpongao: "icons/nav/pongao.webp",
  riverfilo: "icons/nav/riverfilo.webp",
  ibla: "icons/nav/ibla.webp",
  pokermantra: "icons/nav/pokermantra.webp",

  fcdisoneste: "icons/nav/disoneste.webp",
  dcdisoneste: "icons/nav/disoneste.webp",

  pandinicoccolosini: "icons/nav/pandini.webp",
  desperados: "icons/nav/desperados.webp",
  bayernchristiansen: "icons/nav/bayern.webp",
  atleticoleon: "icons/nav/leon.webp",
  minnesotasnakes: "icons/nav/snakes.webp",
  eintrachtfranco126: "icons/nav/franco.webp",
  fantaugusta: "icons/nav/fantaugusta.webp",
  goldenknights: "icons/nav/Golden Knights.webp",
  teambartowski: "icons/nav/Team Bartowski.webp"
};

function findStadiumImage(teamName) {
  return STADIUM_ASSETS[normalize(teamName)] || "";
}

let allFranchises = [];
let currentAccess = {
  user: null,
  teamId: null,
  isAdmin: false
};
let activeInlineEditor = null;

const EDITABLE_FIELDS = {
  coach_name: {
    label: "Allenatore",
    property: "coach",
    type: "text",
    maxLength: 80
  },
  assistant_coach: {
    label: "Viceallenatore",
    property: "assistantCoach",
    type: "text",
    maxLength: 80
  },
  city: {
    label: "Città",
    property: "city",
    type: "text",
    maxLength: 80
  },
  league_entry_year: {
    label: "Ingresso nella lega",
    property: "leagueEntryYear",
    type: "number",
    min: 2000,
    max: 2100
  },
  rivalry: {
    label: "Rivalità principale",
    property: "rivalry",
    type: "text",
    maxLength: 120
  },
  founded_year: {
    label: "Anno di fondazione",
    property: "foundedYear",
    type: "number",
    min: 1900,
    max: 2100
  },
  colors: {
    label: "Colori sociali",
    property: "colors",
    type: "text",
    maxLength: 120
  },
  motto: {
    label: "Motto",
    property: "motto",
    type: "text",
    maxLength: 180
  },
  stadium_name: {
    label: "Stadio",
    property: "stadiumName",
    type: "text",
    maxLength: 120
  },
  description: {
    label: "La franchigia",
    property: "description",
    type: "textarea",
    maxLength: 1200
  },
  honours: {
    label: "Palmarès",
    property: "honours",
    type: "honours",
    adminOnly: true
  },
  records: {
    label: "Momento preferito nella lega",
    property: "favoriteMoment",
    type: "textarea",
    maxLength: 700
  },
  seasons_in_league: {
    label: "Stagioni in lega",
    property: "seasons",
    type: "number",
    min: 0,
    max: 100,
    adminOnly: true
  }
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeImageUrl(value, fallback = "") {
  const url = String(value || "").trim();
  if (!url) return fallback;
  if (/^(javascript|data):/i.test(url)) return fallback;
  return url;
}

function displayValue(value, fallback = "Da definire") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function findAsset(teamName) {
  const target = normalize(teamName);

  const exact = TEAM_ASSETS.find((item) => normalize(item.name) === target);
  if (exact) return exact;

  if (target === normalize("Wildboys78")) {
    return TEAM_ASSETS.find((item) => normalize(item.name) === normalize("Wildboys 78"));
  }

  if (target === normalize("PokerMantra")) {
    return TEAM_ASSETS.find((item) => normalize(item.name) === normalize("Pokermantra"));
  }

  if (target === normalize("DC Disoneste")) {
    return TEAM_ASSETS.find((item) => normalize(item.name) === normalize("FC Disoneste"));
  }

  return null;
}

function yearsInLeague(entryYear) {
  const year = Number(entryYear);
  if (!Number.isFinite(year) || year < 2000) return "Da definire";

  const count = Math.max(1, 2026 - year + 1);
  return `${count} stagione${count === 1 ? "" : "i"}`;
}

function stringifyProfileValue(value, fallback = "Da definire") {
  if (Array.isArray(value)) {
    return value.length ? value.join(" · ") : fallback;
  }

  if (value && typeof value === "object") {
    return Object.values(value).filter(Boolean).join(" · ") || fallback;
  }

  return displayValue(value, fallback);
}

function normalizeHonours(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};

  const toCount = (count) => {
    const parsed = Number(count);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  };

  return {
    oro: toCount(source.oro),
    argento: toCount(source.argento),
    bronzo: toCount(source.bronzo)
  };
}

function formatHonours(value) {
  const honours = normalizeHonours(value);
  return `🥇 ${honours.oro} · 🥈 ${honours.argento} · 🥉 ${honours.bronzo}`;
}

async function verifyPageAccess() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;

  if (userError || !user) {
    window.location.replace("login.html");
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("team_id, role, email")
    .eq("id", user.id)
    .maybeSingle();

  const email = String(profile?.email || user.email || "").toLowerCase();
  const isAdmin = profile?.role === "admin" || email === ADMIN_EMAIL;
  const teamId = profile?.team_id || null;

  if (profileError) {
    console.warn("Errore lettura profilo utente:", profileError);
  }

  if (!isAdmin && !teamId) {
    window.location.replace("rose.html");
    return null;
  }

  currentAccess = {
    user,
    teamId,
    isAdmin
  };

  return currentAccess;
}

function unlockPage() {
  document.body.classList.remove("franchigie-access-pending");
  document.body.classList.add("franchigie-access-granted");

  const app = document.getElementById("franchigie-app");
  if (app) app.hidden = false;

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.style.display = "inline-flex";
}

async function loadData() {
  const status = document.getElementById("franchigie-status");
  const warning = document.getElementById("franchigie-setup-warning");

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name, conference")
    .order("conference", { ascending: true })
    .order("name", { ascending: true });

  if (teamsError) {
    throw new Error(`Impossibile caricare le squadre: ${teamsError.message}`);
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("team_profiles")
    .select("*");

  if (profilesError) {
    console.warn("team_profiles non disponibile:", profilesError);
    if (warning) warning.hidden = false;
  }

  const profileByTeam = new Map(
    (profiles || []).map((profile) => [String(profile.team_id), profile])
  );

  allFranchises = (teams || []).map((team) => {
    const asset = findAsset(team.name) || {};
    const profile = profileByTeam.get(String(team.id)) || {};

    const profileValues = {
      coach_name: String(profile.coach_name ?? asset.coach ?? "").trim(),
      assistant_coach: String(profile.assistant_coach ?? "").trim(),
      city: String(profile.city ?? "").trim(),
      founded_year: profile.founded_year ?? "",
      league_entry_year: profile.league_entry_year ?? "",
      colors: String(profile.colors ?? "").trim(),
      motto: String(profile.motto ?? "").trim(),
      description: String(profile.description ?? "").trim(),
      stadium_name: String(profile.stadium_name ?? "").trim(),
      rivalry: String(profile.rivalry ?? "").trim(),
      honours: normalizeHonours(profile.honours),
      records: stringifyProfileValue(profile.records, ""),
      seasons_in_league: profile.seasons_in_league ?? ""
    };

    return {
      id: team.id,
      name: team.name,
      conference: team.conference || "Conference",
      logo: safeImageUrl(profile.logo_image, asset.logo || "icon-192.png"),
      mascot: safeImageUrl(profile.mascot_image, asset.mascot || "icon-192.png"),
      coach: displayValue(profileValues.coach_name, asset.coach || "Allenatore da definire"),
      assistantCoach: displayValue(profileValues.assistant_coach),
      city: displayValue(profileValues.city),
      foundedYear: displayValue(profileValues.founded_year),
      leagueEntryYear: displayValue(profileValues.league_entry_year),
      seasons: profileValues.seasons_in_league === ""
        ? yearsInLeague(profileValues.league_entry_year)
        : `${profileValues.seasons_in_league} stagione${Number(profileValues.seasons_in_league) === 1 ? "" : "i"}`,
      colors: displayValue(profileValues.colors),
      motto: displayValue(profileValues.motto),
      description: displayValue(profileValues.description, "Profilo della franchigia in preparazione."),
      stadiumName: displayValue(profileValues.stadium_name, "Stadio da definire"),
      stadiumImage: safeImageUrl(
        profile.stadium_image,
        findStadiumImage(team.name)
      ),
      rivalry: displayValue(profileValues.rivalry),
      honours: formatHonours(profileValues.honours),
      favoriteMoment: displayValue(profileValues.records),
      published: profile.is_published === true,
      profileValues
    };
  });

  allFranchises.sort((a, b) => {
    const confOrder = {
      "Conference League": 0,
      "Conference Championship": 1
    };

    const confDifference = (confOrder[a.conference] ?? 9) - (confOrder[b.conference] ?? 9);
    return confDifference || a.name.localeCompare(b.name, "it");
  });

  if (status) status.hidden = true;
  renderFranchises(allFranchises);
}

function stadiumMarkup(franchise, detail = false) {
  const stadiumImage = safeImageUrl(franchise.stadiumImage);
  const logo = safeImageUrl(franchise.logo, "icon-192.png");

  if (stadiumImage) {
    return `
      <img class="stadium-image" src="${escapeHTML(stadiumImage)}" alt="${escapeHTML(franchise.stadiumName)}">
      ${detail ? "" : `<span class="stadium-state">Stadio ufficiale</span>`}
    `;
  }

  return `
    <div class="stadium-placeholder">
      <img class="stadium-watermark" src="${escapeHTML(logo)}" alt="">
    </div>
    ${detail ? "" : `<span class="stadium-state">Stadio in preparazione</span>`}
  `;
}


function canEditFranchise(franchise) {
  return currentAccess.isAdmin ||
    String(currentAccess.teamId || "") === String(franchise.id || "");
}

function canEditField(franchise, fieldName) {
  const config = EDITABLE_FIELDS[fieldName];
  if (!config) return false;
  if (config.adminOnly) return currentAccess.isAdmin;
  return canEditFranchise(franchise);
}

function editableInfoMarkup(franchise, fieldName, label, value) {
  if (!canEditField(franchise, fieldName)) {
    return `
      <div class="detail-info">
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(value)}</strong>
      </div>
    `;
  }

  return `
    <button
      type="button"
      class="detail-info detail-edit-trigger"
      data-edit-field="${escapeHTML(fieldName)}"
      aria-label="Modifica ${escapeHTML(label)}"
    >
      <span>${escapeHTML(label)}</span>
      <strong>${escapeHTML(value)}</strong>
      <span class="detail-edit-pencil" aria-hidden="true">✎</span>
    </button>
  `;
}

function editableCityMarkup(franchise) {
  if (!canEditFranchise(franchise)) {
    return escapeHTML(franchise.city);
  }

  return `
    <button
      type="button"
      class="detail-inline-edit"
      data-edit-field="city"
      aria-label="Modifica città"
    >
      ${escapeHTML(franchise.city)}
      <span aria-hidden="true">✎</span>
    </button>
  `;
}

function editableDescriptionMarkup(franchise) {
  if (!canEditFranchise(franchise)) {
    return `
      <section class="detail-panel">
        <h3>La franchigia</h3>
        <p>${escapeHTML(franchise.description)}</p>
      </section>
    `;
  }

  return `
    <button
      type="button"
      class="detail-panel detail-description-edit detail-edit-trigger"
      data-edit-field="description"
      aria-label="Modifica descrizione della franchigia"
    >
      <h3>La franchigia</h3>
      <p>${escapeHTML(franchise.description)}</p>
      <span class="detail-edit-pencil" aria-hidden="true">✎</span>
    </button>
  `;
}

function editableListItemMarkup(franchise, fieldName, label, value) {
  if (!canEditField(franchise, fieldName)) {
    return `
      <div>
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(value)}</strong>
      </div>
    `;
  }

  return `
    <button
      type="button"
      class="detail-list-item-edit detail-edit-trigger"
      data-edit-field="${escapeHTML(fieldName)}"
      aria-label="Modifica ${escapeHTML(label)}"
    >
      <span>${escapeHTML(label)}</span>
      <strong>${escapeHTML(value)}</strong>
      <span class="detail-edit-pencil" aria-hidden="true">✎</span>
    </button>
  `;
}

function editorInputMarkup(fieldName, config, currentValue) {
  if (config.type === "honours") {
    const honours = normalizeHonours(currentValue);

    return `
      <div class="honours-editor-grid">
        <label>
          <span>🥇 Oro</span>
          <input data-editor-input data-honour-key="oro" type="number" min="0" max="999" value="${escapeHTML(honours.oro)}" inputmode="numeric">
        </label>
        <label>
          <span>🥈 Argento</span>
          <input data-editor-input data-honour-key="argento" type="number" min="0" max="999" value="${escapeHTML(honours.argento)}" inputmode="numeric">
        </label>
        <label>
          <span>🥉 Bronzo</span>
          <input data-editor-input data-honour-key="bronzo" type="number" min="0" max="999" value="${escapeHTML(honours.bronzo)}" inputmode="numeric">
        </label>
      </div>
    `;
  }

  const common = `
    data-editor-input
    name="${escapeHTML(fieldName)}"
    maxlength="${escapeHTML(config.maxLength || "")}"
    aria-label="${escapeHTML(config.label)}"
  `;

  if (config.type === "textarea") {
    return `<textarea ${common} rows="5">${escapeHTML(currentValue)}</textarea>`;
  }

  if (config.type === "number") {
    return `
      <input
        ${common}
        type="number"
        value="${escapeHTML(currentValue)}"
        min="${escapeHTML(config.min)}"
        max="${escapeHTML(config.max)}"
        inputmode="numeric"
      >
    `;
  }

  return `<input ${common} type="text" value="${escapeHTML(currentValue)}">`;
}

function validateEditableValue(fieldName, value) {
  const config = EDITABLE_FIELDS[fieldName];
  if (!config) return { valid: false, message: "Campo non valido." };

  if (config.type === "honours") {
    const honours = normalizeHonours(value);
    const values = [honours.oro, honours.argento, honours.bronzo];

    if (values.some((count) => !Number.isInteger(count) || count < 0 || count > 999)) {
      return { valid: false, message: "Palmarès: inserisci valori validi tra 0 e 999." };
    }

    return { valid: true, value: honours };
  }

  const cleanValue = String(value ?? "").trim();

  if (config.type === "number" && cleanValue !== "") {
    const numberValue = Number(cleanValue);

    if (!Number.isInteger(numberValue)) {
      return { valid: false, message: `${config.label}: inserisci un numero valido.` };
    }

    if (numberValue < config.min || numberValue > config.max) {
      return {
        valid: false,
        message: `${config.label}: usa un valore tra ${config.min} e ${config.max}.`
      };
    }

    return { valid: true, value: numberValue };
  }

  if (config.maxLength && cleanValue.length > config.maxLength) {
    return {
      valid: false,
      message: `${config.label}: massimo ${config.maxLength} caratteri.`
    };
  }

  return { valid: true, value: cleanValue || null };
}

function showFranchiseToast(message, isError = false) {
  let toast = document.getElementById("franchigie-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "franchigie-toast";
    toast.className = "franchigie-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");

  window.clearTimeout(showFranchiseToast.timeoutId);
  showFranchiseToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2800);
}

async function saveEditableField(franchise, fieldName, rawValue, editorRoot) {
  const validation = validateEditableValue(fieldName, rawValue);

  if (!validation.valid) {
    showFranchiseToast(validation.message, true);
    return;
  }

  editorRoot.classList.add("is-saving");
  editorRoot.querySelectorAll("button, input, textarea").forEach((element) => {
    element.disabled = true;
  });

  const { error } = await supabase.rpc("update_my_team_profile", {
    p_team_id: franchise.id,
    p_changes: {
      [fieldName]: validation.value
    }
  });

  if (error) {
    console.error("Errore aggiornamento profilo franchigia:", error);
    editorRoot.classList.remove("is-saving");
    editorRoot.querySelectorAll("button, input, textarea").forEach((element) => {
      element.disabled = false;
    });
    showFranchiseToast(error.message || "Modifica non salvata.", true);
    return;
  }

  activeInlineEditor = null;
  await loadData();
  openFranchise(franchise.id);
  showFranchiseToast("Profilo aggiornato.");
}

function startInlineEditor(trigger, franchise, fieldName) {
  if (!canEditField(franchise, fieldName) || activeInlineEditor) return;

  const config = EDITABLE_FIELDS[fieldName];
  if (!config) return;

  activeInlineEditor = trigger;

  const currentValue = franchise.profileValues?.[fieldName] ?? "";
  const editor = document.createElement("div");
  editor.className = `detail-inline-editor ${config.type === "textarea" ? "is-textarea" : ""}`;
  editor.innerHTML = `
    <span class="detail-editor-label">${escapeHTML(config.label)}</span>
    ${editorInputMarkup(fieldName, config, currentValue)}
    <div class="detail-editor-actions">
      <button type="button" class="detail-editor-save">Salva</button>
      <button type="button" class="detail-editor-cancel">Annulla</button>
    </div>
  `;

  trigger.replaceWith(editor);

  const inputs = [...editor.querySelectorAll("[data-editor-input]")];
  const input = inputs[0];
  const saveButton = editor.querySelector(".detail-editor-save");
  const cancelButton = editor.querySelector(".detail-editor-cancel");

  const cancel = () => {
    activeInlineEditor = null;
    openFranchise(franchise.id);
  };

  const getEditorValue = () => {
    if (config.type === "honours") {
      return Object.fromEntries(
        inputs.map((element) => [element.dataset.honourKey, element.value])
      );
    }

    return input?.value ?? "";
  };

  const save = () => saveEditableField(franchise, fieldName, getEditorValue(), editor);

  saveButton?.addEventListener("click", save);
  cancelButton?.addEventListener("click", cancel);

  inputs.forEach((element) => {
    element.addEventListener("keydown", (event) => {
      event.stopPropagation();

      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
        return;
      }

      const saveShortcut = config.type === "textarea"
        ? event.key === "Enter" && (event.ctrlKey || event.metaKey)
        : event.key === "Enter";

      if (saveShortcut) {
        event.preventDefault();
        save();
      }
    });
  });

  input?.focus();

  if (input instanceof HTMLInputElement && input.type !== "number") {
    input.select();
  }
}

function bindEditableFields(container, franchise) {
  if (!canEditFranchise(franchise)) return;

  container.querySelectorAll("[data-edit-field]").forEach((trigger) => {
    const openEditor = (event) => {
      event.preventDefault();
      event.stopPropagation();
      startInlineEditor(trigger, franchise, trigger.dataset.editField);
    };

    trigger.addEventListener("click", openEditor);
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        openEditor(event);
      }
    });
  });
}

function renderFranchises(items) {
  const grid = document.getElementById("franchigie-grid");
  const status = document.getElementById("franchigie-status");

  if (!grid) return;

  if (!items.length) {
    grid.innerHTML = "";
    if (status) {
      status.hidden = false;
      status.textContent = "Nessuna franchigia corrisponde ai filtri.";
    }
    return;
  }

  if (status) status.hidden = true;

  grid.innerHTML = items.map((franchise) => {
    const championship = franchise.conference === "Conference Championship";

    return `
      <article class="franchigia-card ${championship ? "championship" : "league"}" tabindex="0" data-team-id="${escapeHTML(franchise.id)}">
        <div class="franchigia-stadium">
          ${stadiumMarkup(franchise)}
        </div>

        <div class="franchigia-body">
          <div class="franchigia-identities">
            <div class="franchigia-logo-shell">
              <img src="${escapeHTML(franchise.logo)}" alt="Logo ${escapeHTML(franchise.name)}">
            </div>
            <img class="franchigia-mascot" src="${escapeHTML(franchise.mascot)}" alt="Mascotte ${escapeHTML(franchise.name)}">
          </div>

          <h2>${escapeHTML(franchise.name)}</h2>
          <span class="franchigia-conference">${escapeHTML(franchise.conference)}</span>

          <div class="franchigia-meta">
            <div class="meta-box">
              <span>Allenatore</span>
              <strong>${escapeHTML(franchise.coach)}</strong>
            </div>
            <div class="meta-box">
              <span>Città</span>
              <strong>${escapeHTML(franchise.city)}</strong>
            </div>
          </div>

          <p class="franchigia-description">${escapeHTML(franchise.description)}</p>
          <button class="franchigia-open" type="button">Visita la franchigia</button>
        </div>
      </article>
    `;
  }).join("");

  bindCardEvents();
  bindImageFallbacks(grid);
}

function bindCardEvents() {
  document.querySelectorAll(".franchigia-card").forEach((card) => {
    const open = () => openFranchise(card.dataset.teamId);

    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
}

function bindImageFallbacks(container = document) {
  container.querySelectorAll("img.stadium-image").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
      const placeholder = image.parentElement?.querySelector(".stadium-placeholder");
      if (placeholder) placeholder.hidden = false;
    }, { once: true });
  });

  container.querySelectorAll(".franchigia-logo-shell img, .detail-logo img, .franchigia-mascot, .detail-mascot").forEach((image) => {
    image.addEventListener("error", () => {
      image.src = "icon-192.png";
    }, { once: true });
  });
}

function openFranchise(teamId) {
  const franchise = allFranchises.find((item) => String(item.id) === String(teamId));
  if (!franchise) return;

  activeInlineEditor = null;

  const modal = document.getElementById("franchigia-modal");
  const content = document.getElementById("franchigia-modal-content");
  if (!modal || !content) return;

  const editable = canEditFranchise(franchise);

  content.innerHTML = `
    <div class="detail-stadium">
      ${stadiumMarkup(franchise, true)}
      <div class="detail-stadium-caption">
        <span>Stadio ufficiale</span>
        <strong>${escapeHTML(franchise.stadiumName)}</strong>
      </div>
    </div>

    <div class="detail-content">
      <div class="detail-identity">
        <div class="detail-logo">
          <img src="${escapeHTML(franchise.logo)}" alt="Logo ${escapeHTML(franchise.name)}">
        </div>

        <div class="detail-name-box">
          <h2 id="modal-team-name">${escapeHTML(franchise.name)}</h2>
          <p>
            ${escapeHTML(franchise.conference)} ·
            ${editableCityMarkup(franchise)}
          </p>
          ${editable ? `<span class="detail-edit-hint">✎ Tocca un campo per modificarlo</span>` : ""}
        </div>

        <img class="detail-mascot" src="${escapeHTML(franchise.mascot)}" alt="Mascotte ${escapeHTML(franchise.name)}">
      </div>

      <div class="detail-info-grid">
        ${editableInfoMarkup(franchise, "coach_name", "Allenatore", franchise.coach)}
        ${editableInfoMarkup(franchise, "assistant_coach", "Viceallenatore", franchise.assistantCoach)}
        ${editableInfoMarkup(franchise, "league_entry_year", "Ingresso nella lega", franchise.leagueEntryYear)}
        ${editableInfoMarkup(franchise, "rivalry", "Rivalità principale", franchise.rivalry)}
        ${editableInfoMarkup(franchise, "founded_year", "Anno di fondazione", franchise.foundedYear)}
        ${editableInfoMarkup(franchise, "colors", "Colori sociali", franchise.colors)}
        ${editableInfoMarkup(franchise, "motto", "Motto", franchise.motto)}
        ${editableInfoMarkup(franchise, "stadium_name", "Stadio", franchise.stadiumName)}
      </div>

      <div class="detail-sections">
        ${editableDescriptionMarkup(franchise)}

        <section class="detail-panel detail-list">
          ${editableListItemMarkup(franchise, "honours", "Palmarès", franchise.honours)}
          ${editableListItemMarkup(franchise, "records", "Momento preferito nella lega", franchise.favoriteMoment)}
          ${editableListItemMarkup(franchise, "seasons_in_league", "Stagioni in lega", franchise.seasons)}
        </section>
      </div>

      <div class="detail-actions">
        <a class="detail-roster-link" href="rose.html?team=${encodeURIComponent(franchise.id)}">Vedi rosa attuale</a>
      </div>
    </div>
  `;

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  bindImageFallbacks(content);
  bindEditableFields(content, franchise);

  const closeButton = modal.querySelector(".modal-close");
  closeButton?.focus();
}

function closeModal() {
  if (activeInlineEditor) return;

  const modal = document.getElementById("franchigia-modal");
  if (!modal) return;

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function applyFilters() {
  const query = normalize(document.getElementById("franchigie-search")?.value);
  const conference = document.getElementById("franchigie-conference")?.value || "Tutte";

  const filtered = allFranchises.filter((franchise) => {
    const searchable = normalize([
      franchise.name,
      franchise.city,
      franchise.coach,
      franchise.stadiumName
    ].join(" "));

    const matchesQuery = !query || searchable.includes(query);
    const matchesConference = conference === "Tutte" || franchise.conference === conference;

    return matchesQuery && matchesConference;
  });

  renderFranchises(filtered);
}

function bindControls() {
  document.getElementById("franchigie-search")?.addEventListener("input", applyFilters);
  document.getElementById("franchigie-conference")?.addEventListener("change", applyFilters);

  document.querySelectorAll("[data-close-modal]").forEach((element) => {
    element.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}

async function init() {
  const access = await verifyPageAccess();
  if (!access) return;

  unlockPage();
  bindControls();

  try {
    await loadData();
  } catch (error) {
    console.error(error);
    const status = document.getElementById("franchigie-status");
    if (status) {
      status.hidden = false;
      status.textContent = error.message || "Errore nel caricamento delle franchigie.";
    }
  }
}

init();

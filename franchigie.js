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

async function verifyAdminAccess() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;

  if (userError || !user) {
    window.location.replace("login.html");
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .maybeSingle();

  const email = String(profile?.email || user.email || "").toLowerCase();
  const isAdmin = profile?.role === "admin" || email === ADMIN_EMAIL;

  if (profileError) {
    console.warn("Errore lettura profilo admin:", profileError);
  }

  if (!isAdmin) {
    window.location.replace("rose.html");
    return null;
  }

  return user;
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

    return {
      id: team.id,
      name: team.name,
      conference: team.conference || "Conference",
      logo: safeImageUrl(profile.logo_image, asset.logo || "icon-192.png"),
      mascot: safeImageUrl(profile.mascot_image, asset.mascot || "icon-192.png"),
      coach: displayValue(profile.coach_name, asset.coach || "Allenatore da definire"),
      assistantCoach: displayValue(profile.assistant_coach),
      city: displayValue(profile.city),
      foundedYear: displayValue(profile.founded_year),
      leagueEntryYear: displayValue(profile.league_entry_year),
      seasons: yearsInLeague(profile.league_entry_year),
      colors: displayValue(profile.colors),
      motto: displayValue(profile.motto),
      description: displayValue(profile.description, "Profilo della franchigia in preparazione."),
      stadiumName: displayValue(profile.stadium_name, "Stadio da definire"),
      stadiumImage: safeImageUrl(
  profile.stadium_image,
  findStadiumImage(team.name)
),
      rivalry: displayValue(profile.rivalry),
      honours: stringifyProfileValue(profile.honours),
      records: stringifyProfileValue(profile.records),
      published: profile.is_published === true
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

  return `
    ${stadiumImage ? `<img class="stadium-image" src="${escapeHTML(stadiumImage)}" alt="${escapeHTML(franchise.stadiumName)}">` : ""}
    <div class="stadium-placeholder" ${stadiumImage ? "hidden" : ""}>
      <img class="stadium-watermark" src="${escapeHTML(logo)}" alt="">
    </div>
    ${detail ? "" : `<span class="stadium-state">${stadiumImage ? "Stadio ufficiale" : "Stadio in preparazione"}</span>`}
  `;
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

  const modal = document.getElementById("franchigia-modal");
  const content = document.getElementById("franchigia-modal-content");
  if (!modal || !content) return;

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
          <p>${escapeHTML(franchise.conference)} · ${escapeHTML(franchise.city)}</p>
        </div>

        <img class="detail-mascot" src="${escapeHTML(franchise.mascot)}" alt="Mascotte ${escapeHTML(franchise.name)}">
      </div>

      <div class="detail-info-grid">
        <div class="detail-info"><span>Allenatore</span><strong>${escapeHTML(franchise.coach)}</strong></div>
        <div class="detail-info"><span>Viceallenatore</span><strong>${escapeHTML(franchise.assistantCoach)}</strong></div>
        <div class="detail-info"><span>Ingresso nella lega</span><strong>${escapeHTML(franchise.leagueEntryYear)}</strong></div>
        <div class="detail-info"><span>Permanenza</span><strong>${escapeHTML(franchise.seasons)}</strong></div>
        <div class="detail-info"><span>Anno di fondazione</span><strong>${escapeHTML(franchise.foundedYear)}</strong></div>
        <div class="detail-info"><span>Colori sociali</span><strong>${escapeHTML(franchise.colors)}</strong></div>
        <div class="detail-info"><span>Motto</span><strong>${escapeHTML(franchise.motto)}</strong></div>
        <div class="detail-info"><span>Stadio</span><strong>${escapeHTML(franchise.stadiumName)}</strong></div>
      </div>

      <div class="detail-sections">
        <section class="detail-panel">
          <h3>La franchigia</h3>
          <p>${escapeHTML(franchise.description)}</p>
        </section>

        <section class="detail-panel detail-list">
          <div><span>Palmarès</span><strong>${escapeHTML(franchise.honours)}</strong></div>
          <div><span>Record</span><strong>${escapeHTML(franchise.records)}</strong></div>
          <div><span>Rivalità principale</span><strong>${escapeHTML(franchise.rivalry)}</strong></div>
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

  const closeButton = modal.querySelector(".modal-close");
  closeButton?.focus();
}

function closeModal() {
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
  const user = await verifyAdminAccess();
  if (!user) return;

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

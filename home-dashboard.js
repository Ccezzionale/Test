import { supabase } from "./supabase.js";

const squadreBase = [
  {
    nome: "Rubinkebab",
    logo: "img/Rubinkebab.png",
    shirt: "img/maglie/Rubinkebab.png",
    coach: "Coach Rubinkebab"
  },
  {
  nome: "Bayern Christiansen",
  logo: "img/Bayern Christiansen.webp",
  shirt: "img/maglie/bayern-mascotte.webp",
  coach: "Coach Christian"
},
{
  nome: "Team Bartowski",
  logo: "img/Team Bartowski.webp",
  shirt: "img/maglie/bartowski-mascotte.webp",
  coach: "Coach Marco"
},
{
  nome: "Golden Knights",
  logo: "img/Golden Knights.webp",
  shirt: "img/maglie/golden-mascotte.webp",
  coach: "Coach Mimmo&Francesco"
},
{
  nome: "Ibla",
  logo: "img/Ibla.webp",
  shirt: "img/maglie/ibla-mascotte.webp",
  coach: "Coach Francesco"
},
{
  nome: "Fantaugusta",
  logo: "img/Fantaugusta.webp",
  shirt: "img/maglie/fantaugusta-mascotte.webp",
  coach: "Coach Giancarlo"
},
{
  nome: "Riverfilo",
  logo: "img/Riverfilo.webp",
  shirt: "img/maglie/riverfilo-mascotte.webp",
  coach: "Coach Federico"
},
{
  nome: "Desperados",
  logo: "img/Desperados.webp",
  shirt: "img/maglie/desperados-mascotte.webp",
  coach: "Coach Stefano"
},
{
  nome: "Wildboys 78",
  logo: "img/wildboys78.webp",
  shirt: "img/maglie/wildboys-mascotte.webp",
  coach: "Coach Francesco"
},
{
  nome: "Pandinicoccolosini",
  logo: "img/Pandinicoccolosini.webp",
  shirt: "img/maglie/pandini-mascotte.webp",
  coach: "Coach Davide"
},
{
  nome: "Pokermantra",
  logo: "img/PokerMantra.webp",
  shirt: "img/maglie/pokermantra-mascotte.webp",
  coach: "Coach Omar"
},
{
  nome: "Minnesode Timberland",
  logo: "img/Minnesode Timberland.webp",
  shirt: "img/maglie/minnesode-mascotte.webp",
  coach: "Coach Pierpaolo&Leandro"
},
{
  nome: "Minnesota Snakes",
  logo: "img/MinneSota Snakes.webp",
  shirt: "img/maglie/snakes-mascotte.webp",
  coach: "Coach Alberto"
},
{
  nome: "Eintracht Franco 126",
  logo: "img/Eintracht Franco 126.webp",
  shirt: "img/maglie/franco-mascotte.webp",
  coach: "Coach Eintracht"
},
{
  nome: "FC Disoneste",
  logo: "img/FC Disoneste.webp",
  shirt: "img/maglie/disoneste-mascotte.webp",
  coach: "Coach FC Disoneste"
},
{
  nome: "Athletic Pongao",
  logo: "img/Athletic Pongao.webp",
  shirt: "img/maglie/pongao-mascotte.webp",
  coach: "Coach Dario"
}
];

function normalizeTeamName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findTeam(teamName) {
  const normalized = normalizeTeamName(teamName);

  return squadreBase.find(team => {
    return normalizeTeamName(team.nome) === normalized;
  });
}

function findTeamLogo(teamName) {
  return findTeam(teamName)?.logo || "icon-192.png";
}

function findTeamShirt(teamName) {
  return findTeam(teamName)?.shirt || "img/maglie/default-shirt.png";
}

function findTeamCoach(teamName) {
  return findTeam(teamName)?.coach || "Allenatore";
}

function formatRole(role) {
  if (!role) return "Coach";
  if (role === "admin") return "Admin";
  return "Coach";
}

async function loadDashboardTeam() {
  const logoEl = document.getElementById("dashboard-team-logo");
  const bgLogoEl = document.getElementById("dashboard-team-bg-logo");
  const shirtEl = document.getElementById("dashboard-team-shirt");
  const nameEl = document.getElementById("dashboard-team-name");
  const coachEl = document.getElementById("dashboard-team-coach");
  const conferenceEl = document.getElementById("dashboard-team-conference");
  const roleEl = document.getElementById("dashboard-user-role");

  if (!logoEl || !nameEl || !conferenceEl || !roleEl) return;

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      nameEl.textContent = "Lega degli Eroi";
      conferenceEl.textContent = "Accedi per vedere la tua squadra";
      roleEl.textContent = "Guest";
      logoEl.src = "icon-192.png";
      if (bgLogoEl) bgLogoEl.src = "icon-192.png";

      if (shirtEl) shirtEl.src = "img/maglie/default-shirt.png";
      if (coachEl) coachEl.textContent = "Guest";

      return;
    }

    const user = userData.user;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("team_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.team_id) {
      console.warn("Profilo non trovato:", profileError);

      nameEl.textContent = "Lega degli Eroi";
      conferenceEl.textContent = user.email || "Profilo non collegato";
      roleEl.textContent = "Coach";
      logoEl.src = "icon-192.png";
      if (bgLogoEl) bgLogoEl.src = "icon-192.png";

      if (shirtEl) shirtEl.src = "img/maglie/default-shirt.png";
      if (coachEl) coachEl.textContent = "Allenatore";

      return;
    }

    scheduleHomeActionBadgesRefresh(profile.team_id);

    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("name, conference")
      .eq("id", profile.team_id)
      .single();

    if (teamError || !team) {
      console.warn("Squadra non trovata:", teamError);

      nameEl.textContent = "Squadra non trovata";
      conferenceEl.textContent = "Controlla collegamento profilo";
      roleEl.textContent = formatRole(profile.role);
      logoEl.src = "icon-192.png";
      if (bgLogoEl) bgLogoEl.src = "icon-192.png";

      if (shirtEl) shirtEl.src = "img/maglie/default-shirt.png";
      if (coachEl) coachEl.textContent = "Allenatore";

      return;
    }

    const teamName = team.name || "La tua squadra";

    nameEl.textContent = teamName;
    conferenceEl.textContent = team.conference || "Conference";
    roleEl.textContent = formatRole(profile.role);

 const teamLogo = findTeamLogo(teamName);

logoEl.src = teamLogo;
logoEl.alt = teamName || "Logo squadra";

if (bgLogoEl) {
  bgLogoEl.src = teamLogo;
  bgLogoEl.alt = "";
}

    if (shirtEl) {
      shirtEl.src = findTeamShirt(teamName);
      shirtEl.alt = `Maglia ${teamName}`;
    }

    if (coachEl) {
      coachEl.textContent = findTeamCoach(teamName);
    }

  } catch (err) {
    console.error("Errore dashboard home:", err);

    nameEl.textContent = "Lega degli Eroi";
    conferenceEl.textContent = "Dashboard ufficiale";
    roleEl.textContent = "Coach";
    logoEl.src = "icon-192.png";
    if (bgLogoEl) bgLogoEl.src = "icon-192.png";

    if (shirtEl) shirtEl.src = "img/maglie/default-shirt.png";
    if (coachEl) coachEl.textContent = "Allenatore";
  }
}

let currentDashboardTeamId = null;

async function countRows(tableName, filters) {
  let query = supabase
    .from(tableName)
    .select("id", { count: "exact", head: true });

  filters.forEach(filter => {
    query = query.eq(filter.column, filter.value);
  });

  const { count, error } = await query;

  if (error) {
    console.warn(`Errore conteggio ${tableName}:`, error);
    return 0;
  }

  return count || 0;
}

function ensureBadge(target, count, label) {
  if (!target) return;

  target.classList.add("app-alert-anchor");

  let badge = target.querySelector(":scope > .app-alert-badge");

  if (!badge) {
    badge = document.createElement("span");
    badge.className = "app-alert-badge";
    target.appendChild(badge);
  }

  if (count > 0) {
    badge.textContent = count > 9 ? "9+" : String(count);
    badge.setAttribute("aria-label", label || `${count} avvisi`);
    target.classList.add("has-app-alert");
  } else {
    badge.textContent = "";
    badge.removeAttribute("aria-label");
    target.classList.remove("has-app-alert");
  }
}

function findDraftMenuLink() {
  const toggles = [...document.querySelectorAll("#mainMenu .toggle-submenu")];

  return toggles.find(link =>
    String(link.textContent || "").toLowerCase().includes("draft")
  );
}

function updateBadgeTargets({ tradeCount, rfaCount }) {
  // HOME: card Trade
  ensureBadge(
    document.querySelector(".quick-trade"),
    tradeCount,
    `${tradeCount} proposta/e trade da valutare`
  );

  // HOME: card Draft
  ensureBadge(
    document.getElementById("quick-draft-link"),
    rfaCount,
    `${rfaCount} decisione/i RFA da prendere`
  );

  // TOP DESKTOP: bottone Trade Room
  ensureBadge(
    document.getElementById("trade-badge"),
    tradeCount,
    `${tradeCount} proposta/e trade da valutare`
  );

  // BOTTOM NAV: Mercato
  document
    .querySelectorAll('.mobile-bottom-link[href="trade-room.html"]')
    .forEach(el => {
      ensureBadge(
        el,
        tradeCount,
        `${tradeCount} proposta/e trade da valutare`
      );
    });

  // PANNELLO "ALTRO": Trade Room
  document
    .querySelectorAll('.mobile-more-grid a[href="trade-room.html"]')
    .forEach(el => {
      ensureBadge(
        el,
        tradeCount,
        `${tradeCount} proposta/e trade da valutare`
      );
    });

  // MENU HAMBURGER/TITOLO: voce Draft
  ensureBadge(
    findDraftMenuLink(),
    rfaCount,
    `${rfaCount} decisione/i RFA da prendere`
  );

  // BOTTOM NAV: se c'è RFA, segnaliamo anche "Altro"
  ensureBadge(
    document.getElementById("mobile-more-btn"),
    rfaCount,
    `${rfaCount} decisione/i RFA da prendere`
  );
}

async function updateHomeActionBadges(teamId) {
  if (!teamId) return;

  try {
    const [tradeCount, rfaCount] = await Promise.all([
      countRows("trade_proposals", [
        { column: "to_team", value: teamId },
        { column: "status", value: "pending" }
      ]),
      countRows("rfa_draft_claims", [
        { column: "original_team_id", value: teamId },
        { column: "status", value: "pending" }
      ])
    ]);

    updateBadgeTargets({ tradeCount, rfaCount });
  } catch (err) {
    console.warn("Errore aggiornamento badge home:", err);
  }
}

function scheduleHomeActionBadgesRefresh(teamId) {
  currentDashboardTeamId = teamId;

  // Subito
  updateHomeActionBadges(teamId);

  // Dopo che mobile-nav.js ha creato bottom nav e pannello Altro
  setTimeout(() => updateHomeActionBadges(teamId), 350);
  setTimeout(() => updateHomeActionBadges(teamId), 1200);

  // Quando torni sulla home dalla PWA
  window.addEventListener("focus", () => {
    updateHomeActionBadges(teamId);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      updateHomeActionBadges(teamId);
    }
  });
}

document.addEventListener("DOMContentLoaded", async function () {
  await loadDashboardTeam();
});


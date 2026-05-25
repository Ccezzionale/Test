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
    logo: "img/Bayern Christiansen.png",
    shirt: "img/maglie/Bayern Christiansen.png",
    coach: "Coach Bayern"
  },
  {
    nome: "Team Bartowski",
    logo: "img/Team Bartowski.png",
    shirt: "img/maglie/TB-mascotte.webp",
    coach: "Marco"
  },
  {
    nome: "Golden Knights",
    logo: "img/Golden Knights.png",
    shirt: "img/maglie/Golden Knights.png",
    coach: "Coach Golden Knights"
  },
  {
    nome: "Ibla",
    logo: "img/Ibla.png",
    shirt: "img/maglie/Ibla.png",
    coach: "Coach Ibla"
  },
  {
    nome: "Fantaugusta",
    logo: "img/Fantaugusta.png",
    shirt: "img/maglie/Fantaugusta.png",
    coach: "Coach Fantaugusta"
  },
  {
    nome: "Riverfilo",
    logo: "img/Riverfilo.png",
    shirt: "img/maglie/Riverfilo.png",
    coach: "Coach Riverfilo"
  },
  {
    nome: "Desperados",
    logo: "img/Desperados.png",
    shirt: "img/maglie/Desperados.png",
    coach: "Coach Desperados"
  },
  {
    nome: "Wildboys 78",
    logo: "img/wildboys78.png",
    shirt: "img/maglie/Wildboys 78.png",
    coach: "Coach Wildboys"
  },
  {
    nome: "Pandinicoccolosini",
    logo: "img/Pandinicoccolosini.png",
    shirt: "img/maglie/Pandinicoccolosini.png",
    coach: "Coach Pandinicoccolosini"
  },
  {
    nome: "Pokermantra",
    logo: "img/PokerMantra.png",
    shirt: "img/maglie/PokerMantra.png",
    coach: "Coach Pokermantra"
  },
  {
    nome: "Minnesode Timberland",
    logo: "img/Minnesode Timberland.png",
    shirt: "img/maglie/Minnesode Timberland.png",
    coach: "Coach Timberland"
  },
  {
    nome: "Minnesota Snakes",
    logo: "img/MinneSota Snakes.png",
    shirt: "img/maglie/MinneSota Snakes.png",
    coach: "Coach Snakes"
  },
  {
    nome: "Eintracht Franco 126",
    logo: "img/Eintracht Franco 126.png",
    shirt: "img/maglie/Eintracht Franco 126.png",
    coach: "Coach Eintracht"
  },
  {
    nome: "FC Disoneste",
    logo: "img/FC Disoneste.png",
    shirt: "img/maglie/FC Disoneste.png",
    coach: "Coach FC Disoneste"
  },
  {
    nome: "Athletic Pongao",
    logo: "img/Athletic Pongao.png",
    shirt: "img/maglie/Athletic Pongao.png",
    coach: "Coach Athletic Pongao"
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

document.addEventListener("DOMContentLoaded", loadDashboardTeam);

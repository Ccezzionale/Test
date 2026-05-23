import { supabase } from "./supabase.js";

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

function normalizeTeamName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findTeamLogo(teamName) {
  const normalized = normalizeTeamName(teamName);

  const match = squadreBase.find(team => {
    return normalizeTeamName(team.nome) === normalized;
  });

  return match?.logo || "icon-192.png";
}

function formatRole(role) {
  if (!role) return "Coach";
  if (role === "admin") return "Admin";
  return "Coach";
}

async function loadDashboardTeam() {
  const logoEl = document.getElementById("dashboard-team-logo");
  const nameEl = document.getElementById("dashboard-team-name");
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
      return;
    }

    nameEl.textContent = team.name || "La tua squadra";
    conferenceEl.textContent = team.conference || "Conference";
    roleEl.textContent = formatRole(profile.role);
    logoEl.src = findTeamLogo(team.name);
    logoEl.alt = team.name || "Logo squadra";

  } catch (err) {
    console.error("Errore dashboard home:", err);

    nameEl.textContent = "Lega degli Eroi";
    conferenceEl.textContent = "Dashboard ufficiale";
    roleEl.textContent = "Coach";
    logoEl.src = "icon-192.png";
  }
}

document.addEventListener("DOMContentLoaded", loadDashboardTeam);

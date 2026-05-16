const teams = [
  { name: "Golden Knights", logo: "Golden Knights.png", status: "alive" },
  { name: "FC Disoneste", logo: "FC Disoneste.png", status: "eliminated", eliminatedTurn: 15, recent: true },
  { name: "Rubin Kebab", logo: "Rubin Kebab.png", status: "eliminated", eliminatedTurn: 14 },
  { name: "Bayern Christiansen", logo: "Bayern Christiansen.png", status: "eliminated", eliminatedTurn: 13 },
  { name: "Team Bartowski", logo: "Team Bartowski.png", status: "eliminated", eliminatedTurn: 12 },
  { name: "Ibla", logo: "Ibla.png", status: "eliminated", eliminatedTurn: 11 },
  { name: "Fantaquesta", logo: "Fantaquesta.png", status: "eliminated", eliminatedTurn: 10 },
  { name: "Riverfilo", logo: "Riverfilo.png", status: "eliminated", eliminatedTurn: 9 },
  { name: "Esperados", logo: "Esperados.png", status: "eliminated", eliminatedTurn: 8 },
  { name: "Wildboys", logo: "Wildboys.png", status: "eliminated", eliminatedTurn: 7 },
  { name: "Pokermantra", logo: "Pokermantra.png", status: "eliminated", eliminatedTurn: 6 },
  { name: "I Porcini di Riccardo", logo: "I Porcini di Riccardo.png", status: "eliminated", eliminatedTurn: 5 },
  { name: "Panificio FC", logo: "Panificio FC.png", status: "eliminated", eliminatedTurn: 4 },
  { name: "Atletico Fanta", logo: "Atletico Fanta.png", status: "eliminated", eliminatedTurn: 3 },
  { name: "Dolci e Gabbana", logo: "Dolci e Gabbana.png", status: "eliminated", eliminatedTurn: 2 },
  { name: "Controfigura", logo: "Controfigura.png", status: "eliminated", eliminatedTurn: 1 }
];

const ring = document.getElementById("arena-ring");
const recentList = document.getElementById("recent-list");

function logoPath(team){
  return `img/logos/${team.logo}`;
}

function initials(name){
  return name.split(/\s+/).slice(0,2).map(w => w[0]).join("").toUpperCase();
}

function createTeamMedallions(){
  const eliminated = teams.filter(t => t.status !== "alive");
  const radius = 39;
  const start = -92;

  eliminated.forEach((team, index) => {
    const angle = (start + index * (360 / eliminated.length)) * Math.PI / 180;
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);

    const medallion = document.createElement("div");
    medallion.className = `team-medallion ${team.recent ? "recent" : ""}`;
    medallion.style.setProperty("--x", `${x}%`);
    medallion.style.setProperty("--y", `${y}%`);
    medallion.title = team.name;

    const img = document.createElement("img");
    img.src = logoPath(team);
    img.alt = team.name;
    img.onerror = () => {
      img.remove();
      const fallback = document.createElement("div");
      fallback.className = "fallback";
      fallback.textContent = initials(team.name);
      medallion.appendChild(fallback);
    };

    medallion.appendChild(img);
    ring.appendChild(medallion);
  });
}

function createRecentTimeline(){
  const recent = [...teams]
    .filter(t => t.status !== "alive")
    .sort((a,b) => b.eliminatedTurn - a.eliminatedTurn)
    .slice(0, 10);

  recent.forEach(team => {
    const card = document.createElement("article");
    card.className = `recent-card ${team.recent ? "recent" : ""}`;

    const img = document.createElement("img");
    img.src = logoPath(team);
    img.alt = team.name;
    img.onerror = () => {
      img.remove();
      const fallback = document.createElement("div");
      fallback.className = "recent-icon";
      fallback.textContent = initials(team.name);
      card.prepend(fallback);
    };

    const text = document.createElement("div");
    text.innerHTML = `<span>Turno ${team.eliminatedTurn}</span><strong>${team.name}</strong>`;

    card.appendChild(img);
    card.appendChild(text);
    recentList.appendChild(card);
  });
}

function updateCounters(){
  const alive = teams.filter(t => t.status === "alive").length;
  const dead = teams.length - alive;
  document.getElementById("alive-count").textContent = alive;
  document.getElementById("dead-count").textContent = dead;
  document.getElementById("current-turn").textContent = Math.max(...teams.filter(t => t.eliminatedTurn).map(t => t.eliminatedTurn));
}

createTeamMedallions();
createRecentTimeline();
updateCounters();

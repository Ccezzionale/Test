const TEAM = {
  bartowski: {
    logo: "img/Team Bartowski.webp",
    mascot: "img/maglie/bartowski-mascotte.webp"
  },
  golden: {
    logo: "img/Golden Knights.webp",
    mascot: "img/maglie/golden-mascotte.webp"
  },
  desperados: {
    logo: "img/Desperados.webp",
    mascot: "img/maglie/desperados-mascotte.webp"
  },
  snakes: {
    logo: "img/MinneSota Snakes.webp",
    mascot: "img/maglie/snakes-mascotte.webp"
  }
};

const EVENTS = {
  "2026/27": [
    {
      chapter:"preseason",
      date:"14 AGO",
      year:"2026",
      type:"major",
      tag:"Draft",
      extra:"L'inizio di tutto",
      title:"Draft 2026",
      text:"Sedici franchigie costruiscono il proprio destino. Ventitré round e una stagione intera ancora da scrivere.",
      image:"img/maglie/bartowski-mascotte.webp",
      meta:["16 squadre","23 round","Preseason"]
    },
    {
      chapter:"regular",
      date:"30 AGO",
      year:"2026",
      type:"normal",
      tag:"GW 1",
      extra:"Kickoff",
      title:"Si comincia",
      text:"La Regular Season parte ufficialmente. Da qui in poi ogni punto pesa.",
      image:"img/home/competizioni/classifiche.webp",
      meta:["Regular Season","Opening Day"]
    },
    {
      chapter:"regular",
      date:"13 SET",
      year:"2026",
      type:"normal",
      tag:"Record",
      extra:"Nuovo primato",
      title:"Prima prestazione monstre",
      text:"Arriva il primo grande punteggio stagionale e la Lega comincia ad alzare il livello.",
      image:"img/maglie/golden-mascotte-win.webp",
      meta:["Top score","Week in Numbers"]
    },
    {
      chapter:"regular",
      date:"27 SET",
      year:"2026",
      type:"normal",
      tag:"Trade",
      extra:"HERE WE GO!",
      title:"Mercato in movimento",
      text:"Una trade completata cambia gli equilibri e apre ufficialmente la stagione degli scambi.",
      image:"img/home/bottom-nav/mercato.webp",
      meta:["Trade Room","Affare concluso"]
    },
    {
      chapter:"rivalry",
      date:"18 OTT",
      year:"2026",
      type:"major",
      tag:"Crash Out Cup",
      extra:"Rivalry Games",
      title:"Le rivalità si accendono",
      text:"La Crash Out Cup entra in scena. Qui non si gioca soltanto per vincere: si gioca per non sentirne parlare per mesi.",
      image:"img/home/competizioni/crashout-rivalry.webp",
      meta:["Rivalry Games","Crash Out Cup"]
    },
    {
      chapter:"allstar",
      date:"08 NOV",
      year:"2026",
      type:"major",
      tag:"Evento",
      extra:"Showtime",
      title:"All-Star Game",
      text:"Le stelle della Lega si riuniscono. Voti, prestigio e una quantità assolutamente sproporzionata di ego.",
      image:"img/maglie/evidenzaallstar.webp",
      meta:["All-Star","Votazioni","Evento speciale"]
    },
    {
      chapter:"push",
      date:"14 DIC",
      year:"2026",
      type:"normal",
      tag:"Race",
      extra:"Playoff Push",
      title:"La corsa cambia volto",
      text:"Una squadra risale posizioni e irrompe nella zona playoff. Da qui ogni giornata comincia a fare male.",
      image:"img/maglie/snakes-mascotte.webp",
      meta:["Race to Playoffs","Momentum"]
    },
    {
      chapter:"playoff",
      date:"10 GEN",
      year:"2027",
      type:"major",
      tag:"Playoff",
      extra:"Road to Glory",
      title:"Comincia la postseason",
      text:"Le migliori entrano nella fase decisiva. Niente più calcoli: adesso conta soltanto sopravvivere.",
      image:"img/home/competizioni/playoff.webp",
      meta:["Playoff","Dentro o fuori"]
    },
    {
      chapter:"finale",
      date:"29 MAG",
      year:"2027",
      type:"locked",
      tag:"Finale",
      extra:"Bloccato",
      title:"La Finale",
      text:"La storia deve ancora essere scritta.",
      icon:"🔒",
      meta:["Capitolo finale"]
    }
  ]
};

const CHAPTERS = {
  all:"Tutto",
  preseason:"Preseason",
  regular:"Regular",
  rivalry:"Rivalry",
  allstar:"All-Star",
  push:"Playoff Push",
  playoff:"Playoff",
  finale:"Finale"
};

const state = {
  season:"2026/27",
  chapter:"all"
};

const seasonSelect = document.getElementById("seasonSelect");
const filtersEl = document.getElementById("chapterFilters");
const listEl = document.getElementById("timelineList");

function getEvents(){
  return EVENTS[state.season] || [];
}

function visibleEvents(){
  const events = getEvents();
  return state.chapter === "all"
    ? events
    : events.filter(e => e.chapter === state.chapter);
}

function renderSeasonOptions(){
  seasonSelect.innerHTML = Object.keys(EVENTS)
    .map(s => `<option value="${s}">${s}</option>`)
    .join("");
  seasonSelect.value = state.season;
}

function renderFilters(){
  const chapters = ["all", ...new Set(getEvents().map(e => e.chapter))];

  filtersEl.innerHTML = chapters.map(ch => `
    <button type="button"
      class="timeline-filter ${state.chapter === ch ? "is-active" : ""}"
      data-chapter="${ch}">
      ${CHAPTERS[ch] || ch}
    </button>
  `).join("");

  filtersEl.querySelectorAll("[data-chapter]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.chapter = btn.dataset.chapter;
      render();
    });
  });
}

function renderStats(){
  const events = getEvents();
  const done = events.filter(e => e.type !== "locked");

  document.getElementById("eventCount").textContent = done.length;

  const current = [...done].reverse()[0];
  document.getElementById("currentChapter").textContent =
    current ? (CHAPTERS[current.chapter] || "Stagione") : "Preseason";

  const nextMajor = events.find(e => e.type === "major" && events.indexOf(e) > events.indexOf(current));
  document.getElementById("nextBigEvent").textContent =
    nextMajor?.title || "Da scrivere";
}

function imageMarkup(e){
  if (e.image){
    return `<img src="${e.image}" alt="" onerror="this.style.display='none'">`;
  }

  return `<div class="story-icon">${e.icon || "★"}</div>`;
}

function renderTimeline(){
  const events = visibleEvents();

  listEl.innerHTML = events.map(e => `
    <article class="timeline-event ${e.type === "major" ? "is-major" : ""} ${e.type === "locked" ? "is-locked" : ""}">
      <div class="timeline-date">
        <strong>${e.date}</strong>
        <span>${e.year}</span>
        <span class="timeline-node"></span>
      </div>

      <div class="story-card ${e.type === "major" ? "is-major" : ""} ${e.type === "locked" ? "is-locked" : ""}">
        <div class="story-card-inner">
          <div class="story-art">
            ${imageMarkup(e)}
          </div>

          <div class="story-content">
            <div class="story-top">
              <span class="story-tag">${e.tag}</span>
              <span class="story-extra">${e.extra || ""}</span>
            </div>

            <h3>${e.title}</h3>
            <p>${e.text}</p>

            <div class="story-meta">
              ${(e.meta || []).map(m => `<span>${m}</span>`).join("")}
            </div>
          </div>
        </div>
      </div>
    </article>
  `).join("");
}

function render(){
  renderFilters();
  renderStats();
  renderTimeline();
}

seasonSelect.addEventListener("change", () => {
  state.season = seasonSelect.value;
  state.chapter = "all";
  render();
});

renderSeasonOptions();
render();

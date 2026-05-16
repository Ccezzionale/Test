const squadre = [
  { nome: "Rubinkebab", logo: "img/Rubinkebab.png", eliminata: true, ultimaEliminata: false, turno: 15, score: "61.0 - 69.5", x: 18, y: 22 },
  { nome: "Bayern Christiansen", logo: "img/Bayern Christiansen.png", eliminata: true, ultimaEliminata: false, turno: 14, score: "60.0 - 71.5", x: 36, y: 19 },
  { nome: "Team Bartowski", logo: "img/Team Bartowski.png", eliminata: true, ultimaEliminata: false, turno: 14, score: "57.5 - 68.0", x: 55, y: 20 },
  { nome: "Golden Knights", logo: "img/Golden Knights.png", eliminata: false, ultimaEliminata: false, turno: null, score: "", x: 50, y: 50 },
  { nome: "Ibla", logo: "img/Ibla.png", eliminata: true, ultimaEliminata: false, turno: 13, score: "62.0 - 70.5", x: 79, y: 35 },
  { nome: "Fantaugusta", logo: "img/Fantaugusta.png", eliminata: true, ultimaEliminata: true, turno: 15, score: "58.5 - 72.0", x: 78, y: 53 },
  { nome: "Riverfilo", logo: "img/Riverfilo.png", eliminata: true, ultimaEliminata: false, turno: 11, score: "58.0 - 66.0", x: 62, y: 70 },
  { nome: "Desperados", logo: "img/Desperados.png", eliminata: true, ultimaEliminata: false, turno: 9, score: "55.0 - 68.5", x: 82, y: 72 },
  { nome: "Wildboys 78", logo: "img/wildboys78.png", eliminata: true, ultimaEliminata: false, turno: 10, score: "59.5 - 70.0", x: 38, y: 71 },
  { nome: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.png", eliminata: true, ultimaEliminata: false, turno: 8, score: "60.5 - 81.0", x: 19, y: 63 },
  { nome: "Pokermantra", logo: "img/PokerMantra.png", eliminata: true, ultimaEliminata: false, turno: 10, score: "61.0 - 70.0", x: 15, y: 41 },
  { nome: "Minnesode Timberland", logo: "img/Minnesode Timberland.png", eliminata: true, ultimaEliminata: false, turno: 7, score: "59.0 - 67.5", x: 27, y: 50 },
  { nome: "Minnesota Snakes", logo: "img/MinneSota Snakes.png", eliminata: true, ultimaEliminata: false, turno: 6, score: "60.0 - 66.5", x: 70, y: 84 },
  { nome: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.png", eliminata: true, ultimaEliminata: false, turno: 5, score: "54.0 - 65.5", x: 25, y: 86 },
  { nome: "FC Disoneste", logo: "img/FC Disoneste.png", eliminata: true, ultimaEliminata: false, turno: 12, score: "59.5 - 67.0", x: 70, y: 28 },
  { nome: "Athletic Pongao", logo: "img/Athletic Pongao.png", eliminata: true, ultimaEliminata: false, turno: 4, score: "58.0 - 64.0", x: 49, y: 86 }
];

const totaleSquadre = squadre.length;
const inGioco = squadre.filter(s => !s.eliminata);
const eliminate = squadre.filter(s => s.eliminata);
const ultimaEliminata = squadre.find(s => s.ultimaEliminata) || eliminate.toSorted((a,b) => (b.turno || 0) - (a.turno || 0))[0];
const turnoAttuale = eliminate.length || 1;

const $ = (id) => document.getElementById(id);

function setText(id, value){
  const el = $(id);
  if(el) el.textContent = value;
}

function safeName(name){
  return String(name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function imgTag(team, className){
  return `<img src="${team.logo}" class="${className}" alt="${safeName(team.nome)}" loading="lazy">`;
}

function renderStats(){
  setText('vive-attuali', inGioco.length);
  setText('totale-squadre', totaleSquadre);
  setText('turno-attuale', `${turnoAttuale}`);
  setText('turni-totali', `${totaleSquadre - 1}`);
  setText('eliminate-attuali', eliminate.length);
  setText('timeline-count', eliminate.length);
  const status = $('map-status');
  if(status) status.textContent = inGioco.length === 1 ? 'Verdetto finale' : 'Battaglia in corso';
}

function renderLastEliminated(){
  const panel = $('last-eliminated-panel');
  if(!panel) return;
  if(!ultimaEliminata){
    panel.innerHTML = `<h2>Ultima eliminata</h2><p>Nessuna squadra è ancora caduta.</p>`;
    return;
  }
  panel.innerHTML = `
    <h2>Ultima eliminata</h2>
    <div class="last-eliminated-card">
      ${imgTag(ultimaEliminata, 'last-logo')}
      <div>
        <strong>${safeName(ultimaEliminata.nome)}</strong>
        <span>Eliminata al turno ${ultimaEliminata.turno || turnoAttuale}<br>${ultimaEliminata.score ? `per ${ultimaEliminata.score}` : 'Il territorio si è spento.'}</span>
      </div>
    </div>
    <p class="last-quote">“Combattuta fino alla fine.”</p>
    <button class="gold-button" type="button">Vedi dettagli</button>
  `;
}

function renderChampion(){
  const holder = $('champion-core');
  if(!holder) return;
  const champ = inGioco[0];
  if(!champ){
    holder.innerHTML = `
      <div class="champion-badge">⚔️ Battaglia in corso</div>
      <h3>Nessun sopravvissuto</h3>
      <p>Il verdetto non è ancora scritto.</p>
    `;
    return;
  }
  holder.innerHTML = `
    <div class="champion-badge">🏆 Ultimo sopravvissuto</div>
    ${imgTag(champ, 'champion-logo')}
    <h3>${safeName(champ.nome)}</h3>
    <p>La leggenda continua.</p>
  `;
}

function renderTerritories(){
  const map = $('territory-map');
  if(!map) return;

  squadre.forEach(team => {
    if(!team.eliminata) return;
    const node = document.createElement('article');
    node.className = 'territory';
    if(team.ultimaEliminata) node.classList.add('is-recent');
    node.style.left = `${team.x}%`;
    node.style.top = `${team.y}%`;
    node.title = team.nome;
    node.innerHTML = `
      ${imgTag(team, 'territory-logo')}
      <strong class="territory-name">${safeName(team.nome)}</strong>
    `;
    map.appendChild(node);
  });
}

function renderTimeline(){
  const list = $('timeline-list');
  if(!list) return;

  const ordered = [...eliminate].sort((a,b) => {
    const byTurn = (b.turno || 0) - (a.turno || 0);
    if(byTurn) return byTurn;
    return a.nome.localeCompare(b.nome);
  });

  list.innerHTML = ordered.map(team => `
    <div class="timeline-item">
      ${imgTag(team, 'timeline-logo')}
      <div>
        <small>Turno ${team.turno || '-'}</small>
        <strong>${safeName(team.nome)}</strong>
      </div>
      <span class="timeline-score">${team.score || 'Caduta'}</span>
    </div>
  `).join('');
}

function renderLatest(){
  const list = $('latest-list');
  if(!list) return;
  const latest = [...eliminate]
    .sort((a,b) => (b.turno || 0) - (a.turno || 0))
    .slice(0,5);

  list.innerHTML = latest.map(team => `
    <div class="latest-item">
      ${imgTag(team, 'latest-logo')}
      <div>
        <small>T${team.turno || '-'}</small>
        <strong>${safeName(team.nome)}</strong>
        <span>${team.score || 'Caduta'}</span>
      </div>
    </div>
  `).join('');
}

renderStats();
renderLastEliminated();
renderChampion();
renderTerritories();
renderTimeline();
renderLatest();

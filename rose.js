import { supabase } from './supabase.js';

const rose = {};

function slug(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function variantiNomeSquadra(nomeSquadra) {
  const nome = String(nomeSquadra || "").trim();

  return [
    nome,
    nome.toLowerCase(),
    nome.replaceAll(" ", "_"),
    nome.replaceAll(" ", "_").toLowerCase(),
    nome.replaceAll(" ", "-"),
    nome.replaceAll(" ", "-").toLowerCase(),
    slug(nome)
  ];
}

function buildImageCandidates(dir, nomeSquadra) {
  const estensioni = [".png", ".jpg", ".jpeg", ".webp"];
  const varianti = variantiNomeSquadra(nomeSquadra);
  const paths = [];

  for (const base of varianti) {
    for (const ext of estensioni) {
      paths.push(`${dir}${base}${ext}`);
    }
  }

  return [...new Set(paths)];
}

function applyImageFallback(imgEl, candidates, fallback = "") {
  if (!imgEl || !candidates.length) {
    if (fallback) imgEl.src = fallback;
    return;
  }

  let idx = 0;
  imgEl.src = candidates[idx];

  imgEl.onerror = function () {
    idx++;

    if (idx < candidates.length) {
      this.src = candidates[idx];
    } else if (fallback) {
      this.onerror = null;
      this.src = fallback;
    } else {
      this.style.display = "none";
    }
  };
}

function trovaLogo(nomeSquadra) {
  return buildImageCandidates("img/", nomeSquadra);
}

function trovaMaglia(nomeSquadra) {
  return buildImageCandidates("img/maglie/", nomeSquadra);
}

async function caricaRose() {
  const container = document.getElementById("contenitore-rose");

  if (container) {
    container.innerHTML = "Caricamento rose da Supabase...";
  }

  try {
    Object.keys(rose).forEach(k => delete rose[k]);

    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name, conference")
      .order("name", { ascending: true });

    if (teamsError) throw teamsError;

    const teamsMap = {};

    teams.forEach(team => {
      teamsMap[team.id] = team;

      rose[team.name] = {
        logo: trovaLogo(team.name),
        maglia: trovaMaglia(team.name),
        conference: team.conference || "N/A",
        giocatori: []
      };
    });

    const { data: players, error: playersError } = await supabase
      .from("players")
      .select(`
        id,
        name,
        role,
        role_mantra,
        serie_a_team,
        quotation,
        is_u21,
        is_fp,
        owner_team_id,
        status
      `)
      .not("owner_team_id", "is", null)
      .eq("status", "active")
      .order("name", { ascending: true });

    if (playersError) throw playersError;

    players.forEach(p => {
      const team = teamsMap[p.owner_team_id];
      if (!team) return;

      const nomeSquadra = team.name;

      if (!rose[nomeSquadra]) {
        rose[nomeSquadra] = {
          logo: trovaLogo(nomeSquadra),
          maglia: trovaMaglia(nomeSquadra),
          conference: team.conference || "N/A",
          giocatori: []
        };
      }

      rose[nomeSquadra].giocatori.push({
        nome: p.name || "",
        ruolo: p.role || p.role_mantra || "",
        squadra: p.serie_a_team || "",
        quotazione: p.quotation ?? "",
        fp: !!p.is_fp,
        u21: !!p.is_u21
      });
    });

    Object.values(rose).forEach(teamData => {
      teamData.giocatori.sort((a, b) => {
        const ruoloA = String(a.ruolo || "");
        const ruoloB = String(b.ruolo || "");
        const nomeA = String(a.nome || "");
        const nomeB = String(b.nome || "");

        return ruoloA.localeCompare(ruoloB) || nomeA.localeCompare(nomeB);
      });
    });

    mostraRose();
    popolaFiltri();

  } catch (e) {
    console.error("Errore nel caricamento rose da Supabase:", e);

    if (container) {
      container.innerHTML = `
        <p>Errore nel caricamento delle rose da Supabase.</p>
      `;
    }
  }
}

function mostraRose() {
  const container = document.getElementById("contenitore-rose");
  if (!container) return;

  container.innerHTML = "";

  const nomeCercato = document.getElementById("filtro-nome")?.value?.toLowerCase() || "";

  for (const [nome, data] of Object.entries(rose)) {
    const div = document.createElement("div");
    div.className = "box-rosa giocatore";
    div.setAttribute("data-squadra", nome);
    div.setAttribute("data-conference", data.conference || "N/A");

    const header = document.createElement("div");
    header.className = "logo-nome";

    const iconsWrap = document.createElement("div");
    iconsWrap.className = "team-icons";

    const imgLogo = document.createElement("img");
    imgLogo.alt = nome;
    imgLogo.className = "team-logo";
    applyImageFallback(imgLogo, data.logo, "img/default.png");

    const imgMaglia = document.createElement("img");
    imgMaglia.alt = `Maglia ${nome}`;
    imgMaglia.className = "team-shirt";
    applyImageFallback(imgMaglia, data.maglia);

    const name = document.createElement("span");
    name.textContent = nome;

    iconsWrap.appendChild(imgLogo);
    iconsWrap.appendChild(imgMaglia);

    header.appendChild(iconsWrap);
    header.appendChild(name);
    div.appendChild(header);

    const table = document.createElement("table");

    table.innerHTML = `
      <thead>
        <tr>
          <th>Ruolo</th>
          <th>Nome</th>
          <th>Squadra</th>
        </tr>
      </thead>
      <tbody>
        ${data.giocatori.map(g => {
          const nomeBasso = g.nome.toLowerCase();

          const evidenziato = nomeCercato && nomeBasso.includes(nomeCercato)
            ? g.nome.replace(new RegExp(`(${nomeCercato})`, "i"), '<span class="evidenziato">$1</span>')
            : g.nome;

          return `
            <tr>
              <td>${g.ruolo}</td>
              <td class="nome">
                ${g.fp ? `<strong>${evidenziato}</strong>` : evidenziato}
                ${g.fp ? '<span class="badge-fp">⭐</span>' : ''}
                ${g.u21 ? '<span class="badge-u21">U21</span>' : ''}
              </td>
              <td>${g.squadra}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    `;

    div.appendChild(table);
    container.appendChild(div);
  }
}

function popolaFiltri() {
  const selectSquadra = document.getElementById("filtro-squadra");
  const selectConference = document.getElementById("filtro-conference");

  if (!selectSquadra || !selectConference) return;

  selectSquadra.innerHTML = '<option value="Tutte">Tutte le squadre</option>';
  selectConference.innerHTML = '<option value="Tutte">Tutte le Conference</option>';

  const squadreSet = new Set();
  const conferenceSet = new Set();

  for (const squadra in rose) {
    squadreSet.add(squadra);
    conferenceSet.add(rose[squadra]?.conference || "N/A");
  }

  Array.from(squadreSet).sort().forEach(sq => {
    const option = document.createElement("option");
    option.value = sq;
    option.textContent = sq;
    selectSquadra.appendChild(option);
  });

  Array.from(conferenceSet).sort().forEach(conf => {
    const option = document.createElement("option");
    option.value = conf;
    option.textContent = conf;
    selectConference.appendChild(option);
  });
}

function filtraGiocatori() {
  const nome = document.getElementById("filtro-nome")?.value?.toLowerCase() || "";
  const conference = document.getElementById("filtro-conference")?.value || "Tutte";
  const squadra = document.getElementById("filtro-squadra")?.value || "Tutte";

  mostraRose();

  document.querySelectorAll(".giocatore").forEach(card => {
    const nomiGiocatori = [...card.querySelectorAll(".nome")]
      .map(e => e.textContent.toLowerCase());

    const conf = card.getAttribute("data-conference");
    const team = card.getAttribute("data-squadra");

    const matchNome = !nome || nomiGiocatori.some(n => n.includes(nome));
    const matchConf = conference === "Tutte" || conf === conference;
    const matchTeam = squadra === "Tutte" || team === squadra;

    card.style.display = matchNome && matchConf && matchTeam ? "" : "none";
  });
}

function resetFiltri() {
  const filtroNome = document.getElementById("filtro-nome");
  const filtroConference = document.getElementById("filtro-conference");
  const filtroSquadra = document.getElementById("filtro-squadra");

  if (filtroNome) filtroNome.value = "";
  if (filtroConference) filtroConference.value = "Tutte";
  if (filtroSquadra) filtroSquadra.value = "Tutte";

  filtraGiocatori();
}

window.resetFiltri = resetFiltri;

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("filtro-nome")?.addEventListener("input", filtraGiocatori);
  document.getElementById("filtro-conference")?.addEventListener("change", filtraGiocatori);
  document.getElementById("filtro-squadra")?.addEventListener("change", filtraGiocatori);

  caricaRose();
});

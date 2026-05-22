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
        is_u21_slot,
        is_u21_keeper,
        u21_keeper_year,
        is_fp,
        is_fp_keeper,
        is_top6_protected,
        top6_protected_team_id,
        fp_keeper_year,
        is_rfa_matched,
        owner_team_id,
        status
      `)
      .not("owner_team_id", "is", null)
      .eq("status", "active")
      .order("name", { ascending: true });

    console.log("PLAYERS ASSEGNATI ROSE:", players, playersError);

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
        fpKeeper: !!p.is_fp_keeper,
        fpKeeperYear: p.fp_keeper_year,

           u21: !!p.is_u21,
        u21Slot: !!p.is_u21_slot,
        u21Keeper: !!p.is_u21_keeper,
        u21KeeperYear: p.u21_keeper_year,
        top6Protected:
  !!p.is_top6_protected &&
  p.owner_team_id === p.top6_protected_team_id,
          
        rfaMatched: !!p.is_rfa_matched
      });
    });

Object.values(rose).forEach(teamData => {
  teamData.giocatori.sort(sortRoseByMantraLine);
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

function renderPlayerBadges(g) {
  const badges = [];

  /*
    LOGICA BADGE:
    - FP confermato 1° anno       -> img/badges/fp.webp
    - FP confermato 2° anno       -> img/badges/fp-confermato.webp
    - U21 normale                 -> img/badges/u21.webp
    - U21 confermato 1° anno      -> img/badges/u21-confermato.webp
    - U21 confermato 2° anno      -> img/badges/u21-confermato-secondo-anno.webp
    - RFA pareggiato              -> badge testuale giallo RFA
  */

  if (g.fpKeeper) {
    const isSecondYear = Number(g.fpKeeperYear) === 2;
    const src = isSecondYear
      ? "img/badges/fp-confermato.webp"
      : "img/badges/fp.webp";

    badges.push(`
      <img
        class="badge-img badge-img-star"
        src="${src}"
        alt="FP"
        title="${isSecondYear ? "Franchise Player confermato 2° anno" : "Franchise Player confermato 1° anno"}"
      >
    `);
  } else if (g.fp) {
    badges.push(`
      <img
        class="badge-img badge-img-star"
        src="img/badges/fp.webp"
        alt="FP"
        title="Franchise Player"
      >
    `);
  }

  if (g.u21Keeper) {
    const isSecondYear = Number(g.u21KeeperYear) === 2;
    const src = isSecondYear
      ? "img/badges/u21-confermato-secondo-anno.webp"
      : "img/badges/u21-confermato.webp";

    badges.push(`
      <img
        class="badge-img badge-img-star"
        src="${src}"
        alt="U21"
        title="${isSecondYear ? "U21 confermato 2° anno" : "U21 confermato 1° anno"}"
      >
    `);
  } else if (g.u21Slot) {
    badges.push(`
      <img
        class="badge-img badge-img-pill"
        src="img/badges/u21.webp"
        alt="U21"
        title="Under 21"
      >
    `);
  }

if (g.rfaMatched) {
  badges.push(`
    <img
      class="badge-img badge-img-pill"
      src="img/badges/rfa.webp"
      alt="RFA"
      title="RFA pareggiato"
    >
  `);
}
if (g.top6Protected) {
  badges.push(`
    <img
      class="badge-img badge-img-protected"
      src="img/badges/protetto-p6-lucchetto.webp"
      alt="P6"
      title="Giocatore protetto mercato: può generare priorità waiver speciale"
    >
  `);
}

  return badges.join("");
}

function getTeamStats(giocatori = []) {
  return {
    totale: giocatori.length,
    fp: giocatori.filter(g => g.fp || g.fpKeeper).length,
    u21: giocatori.filter(g => g.u21 || g.u21Slot || g.u21Keeper).length,
    rfa: giocatori.filter(g => g.rfaMatched).length,
    protetti: giocatori.filter(g => g.top6Protected).length
  };
}

function aggiornaEmptyState() {
  const container = document.getElementById("contenitore-rose");
  if (!container) return;

  const cards = [...container.querySelectorAll(".box-rosa")];
  const visibleCards = cards.filter(card => card.style.display !== "none");

  let empty = document.getElementById("rose-empty-state");

  if (!empty) {
    empty = document.createElement("div");
    empty.id = "rose-empty-state";
    empty.innerHTML = `
      <div class="rose-empty-icon">🔎</div>
      <strong>Nessun risultato trovato</strong>
      <span>Prova a cambiare giocatore, squadra o conference.</span>
    `;
    container.appendChild(empty);
  }

  empty.style.display = visibleCards.length === 0 ? "flex" : "none";
}

function mostraRose() {
  const container = document.getElementById("contenitore-rose");
  if (!container) return;

  container.innerHTML = "";

  const nomeCercato = document.getElementById("filtro-nome")?.value?.toLowerCase() || "";

  for (const [nome, data] of Object.entries(rose)) {
    const stats = getTeamStats(data.giocatori);

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

    const nameWrap = document.createElement("div");
    nameWrap.className = "team-title-wrap";

    const name = document.createElement("span");
    name.className = "team-name";
    name.textContent = nome;

    const conferenceBadge = document.createElement("small");
    conferenceBadge.className = "team-conference-badge";
    conferenceBadge.textContent = data.conference || "N/A";

    const meta = document.createElement("div");
    meta.className = "team-roster-meta";
    meta.innerHTML = `
      <span>${stats.totale} giocatori</span>
      <span>${stats.fp} FP</span>
      <span>${stats.u21} U21</span>
      <span>${stats.rfa} RFA</span>
      <span>${stats.protetti} protetti</span>
    `;

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "roster-toggle";
    toggleBtn.innerHTML = `
      <span>Mostra rosa</span>
      <strong>+</strong>
    `;

    toggleBtn.addEventListener("click", () => {
      const isOpen = div.classList.toggle("is-open");
      toggleBtn.innerHTML = isOpen
        ? `<span>Chiudi rosa</span><strong>−</strong>`
        : `<span>Mostra rosa</span><strong>+</strong>`;
    });

    iconsWrap.appendChild(imgLogo);
    iconsWrap.appendChild(imgMaglia);

    nameWrap.appendChild(name);
    nameWrap.appendChild(conferenceBadge);
    nameWrap.appendChild(meta);
    nameWrap.appendChild(toggleBtn);

    header.appendChild(iconsWrap);
    header.appendChild(nameWrap);
    div.appendChild(header);

    const rosterBody = document.createElement("div");
    rosterBody.className = "roster-body";

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
                ${g.fpKeeper || g.fp ? `<strong>${evidenziato}</strong>` : evidenziato}
                ${renderPlayerBadges(g)}
              </td>
              <td>${g.squadra}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    `;

    rosterBody.appendChild(table);
    div.appendChild(rosterBody);
    container.appendChild(div);
  }

  aggiornaEmptyState();
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

    const visible = matchNome && matchConf && matchTeam;
    card.style.display = visible ? "" : "none";

    if (visible && nome) {
      card.classList.add("is-open");

      const toggleBtn = card.querySelector(".roster-toggle");
      if (toggleBtn) {
        toggleBtn.innerHTML = `<span>Chiudi rosa</span><strong>−</strong>`;
      }
    }
  });

  aggiornaEmptyState();
}

function sortRoseByMantraLine(a, b) {
  const aRank = getMainRoleRank(a.ruolo || "");
  const bRank = getMainRoleRank(b.ruolo || "");

  if (aRank !== bRank) {
    return aRank - bRank;
  }

  const aRoleDetail = getRoleDetailRank(a.ruolo || "");
  const bRoleDetail = getRoleDetailRank(b.ruolo || "");

  if (aRoleDetail !== bRoleDetail) {
    return aRoleDetail - bRoleDetail;
  }

  const roleCompare = String(a.ruolo || "").localeCompare(String(b.ruolo || ""), "it", {
    sensitivity: "base"
  });

  if (roleCompare !== 0) {
    return roleCompare;
  }

  return String(a.nome || "").localeCompare(String(b.nome || ""), "it", {
    sensitivity: "base"
  });
}

function getMainRoleRank(roleValue) {
  const rawRole = String(roleValue || "").toUpperCase().trim();

  const roles = rawRole
    .split(/[;,/|\s]+/)
    .map(role => role.trim())
    .filter(Boolean);

  // Portieri
  if (
    roles.includes("P") ||
    roles.includes("POR") ||
    roles.includes("PORTIERE") ||
    roles.includes("PORTIERI") ||
    rawRole.startsWith("P ")
  ) {
    return 1;
  }

  // Difesa
  if (
    roles.some(role =>
      ["DD", "DC", "DS", "B", "E"].includes(role)
    )
  ) {
    return 2;
  }

  // Centrocampo
  if (
    roles.some(role =>
      ["M", "C", "T", "W"].includes(role)
    )
  ) {
    return 3;
  }

  // Attacco
  if (
    roles.some(role =>
      ["A", "PC"].includes(role)
    )
  ) {
    return 4;
  }

  return 99;
}

function getRoleDetailRank(roleValue) {
  const rawRole = String(roleValue || "").toUpperCase().trim();

  const roles = rawRole
    .split(/[;,/|\s]+/)
    .map(role => role.trim())
    .filter(Boolean);

  const order = [
    "P",
    "POR",
    "DC",
    "DD",
    "DS",
    "B",
    "E",
    "M",
    "C",
    "T",
    "W",
    "A",
    "PC"
  ];

  for (const role of order) {
    if (roles.includes(role)) {
      return order.indexOf(role) + 1;
    }
  }

  return 999;
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

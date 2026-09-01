import { supabase } from './supabase.js';

const rose = {};
let fpEligibilityByPlayerId = new Map();
let injuryReserveByTeamId = new Map();

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function currentSeasonKey() {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 6
    ? `${year}-${String(year + 1).slice(-2)}`
    : `${year - 1}-${String(year).slice(-2)}`;
}

function formatIrDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
}

function getIrDay(record) {
  if (!record?.activated_on) return 0;
  const start = new Date(`${record.activated_on}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.floor((today - start) / 86400000) + 1);
}

function getIrPhase(record) {
  if (!record || record.status !== "active") {
    const labels = {
      reinstated: "Reintegrato",
      cut: "Tagliato",
      auto_cut: "Taglio automatico"
    };
    return { label: labels[record?.status] || "Conclusa", className: "closed" };
  }

  const day = getIrDay(record);
  if (day <= 60) return { label: "Protetto", className: "protected" };
  if (day <= 90) return { label: "Scelta disponibile", className: "flexible" };
  return { label: "Decisione obbligatoria", className: "final" };
}

function renderInjuryReserveSlot(record) {
  if (!record) return "";

  const phase = getIrPhase(record);
  const day = getIrDay(record);
  const progress = Math.min(100, Math.max(2, (day / 104) * 100));
  const safeUrl = /^https?:\/\//i.test(record.medical_source_url || "")
    ? escapeAttribute(record.medical_source_url)
    : "";

  return `
    <section class="team-ir-slot ${record.status === "active" ? "is-active" : "is-closed"}">
      <div class="team-ir-icon" aria-hidden="true">IR</div>
      <div class="team-ir-copy">
        <span class="team-ir-kicker">Injury Reserve · ${escapeAttribute(record.season_key)}</span>
        <strong class="ir-player-name">${escapeAttribute(record.player_name)}</strong>
        <small>
          ${record.status === "active"
            ? `Giorno ${day} di 104 · scadenza ${formatIrDate(record.expires_on)}`
            : `${phase.label} · ${formatIrDate(record.resolved_at)}`}
        </small>
        ${record.status === "active" ? `<div class="team-ir-progress"><span style="width:${progress}%"></span></div>` : ""}
        ${safeUrl ? `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Fonte medica</a>` : ""}
      </div>
      <span class="team-ir-phase ${phase.className}">${phase.label}</span>
    </section>
  `;
}

async function caricaEleggibilitaFp() {
  const { data, error } = await supabase.rpc("get_fp_eligibility");

  if (error) {
    console.warn("Eleggibilità FP non disponibile:", error);
    fpEligibilityByPlayerId = new Map();
    return;
  }

  fpEligibilityByPlayerId = new Map(
    (data || []).map(row => [String(row.player_id), row])
  );
}

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
  const estensioni = [".webp", ".jpg", ".jpeg", ".png"];
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
  const key = String(nomeSquadra || "").trim().toLowerCase();

  const mascotteMap = {
    "bayern christiansen": "img/maglie/bayern-mascotte.webp",
    "team bartowski": "img/maglie/bartowski-mascotte.webp",
    "golden knights": "img/maglie/golden-mascotte.webp",
    "ibla": "img/maglie/ibla-mascotte.webp",
    "fantaugusta": "img/maglie/fantaugusta-mascotte.webp",
    "riverfilo": "img/maglie/riverfilo-mascotte.webp",
    "desperados": "img/maglie/desperados-mascotte.webp",
    "wildboys 78": "img/maglie/wildboys-mascotte.webp",
    "wildboys78": "img/maglie/wildboys-mascotte.webp",
    "pandinicoccolosini": "img/maglie/pandini-mascotte.webp",
    "pokermantra": "img/maglie/pokermantra-mascotte.webp",
    "poker mantra": "img/maglie/pokermantra-mascotte.webp",
    "minnesode timberland": "img/maglie/minnesode-mascotte.webp",
    "minnesota snakes": "img/maglie/snakes-mascotte.webp",
    "atlético leon": "img/maglie/leon-mascotte.webp",
    "eintracht franco 126": "img/maglie/franco-mascotte.webp",
    "fc disoneste": "img/maglie/disoneste-mascotte.webp",
    "athletic pongao": "img/maglie/pongao-mascotte.webp"
  };

  const mascotte = mascotteMap[key];

  return mascotte
    ? [mascotte, ...buildImageCandidates("img/maglie/", nomeSquadra)]
    : buildImageCandidates("img/maglie/", nomeSquadra);
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
        injuryReserve: null,
        giocatori: []
      };
    });

    const { data: injuryReserveRows, error: injuryReserveError } = await supabase
      .from("injury_reserve")
      .select("*")
      .eq("season_key", currentSeasonKey())
      .order("activated_on", { ascending: false });

    if (injuryReserveError) throw injuryReserveError;

    injuryReserveByTeamId = new Map(
      (injuryReserveRows || []).map(row => [String(row.team_id), row])
    );

    injuryReserveByTeamId.forEach((record, teamId) => {
      const team = teamsMap[teamId];
      if (team && rose[team.name]) {
        rose[team.name].injuryReserve = record;
      }
    });

    const activeIrPlayerIds = new Set(
      (injuryReserveRows || [])
        .filter(row => row.status === "active")
        .map(row => String(row.player_id))
    );

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

    await caricaEleggibilitaFp();

    players.forEach(p => {
      const team = teamsMap[p.owner_team_id];
      if (!team) return;

      const nomeSquadra = team.name;
      const fpEligibility = fpEligibilityByPlayerId.get(String(p.id));

      if (!rose[nomeSquadra]) {
        rose[nomeSquadra] = {
          logo: trovaLogo(nomeSquadra),
          maglia: trovaMaglia(nomeSquadra),
          conference: team.conference || "N/A",
          injuryReserve: injuryReserveByTeamId.get(String(team.id)) || null,
          giocatori: []
        };
      }

      const playerData = {
        id: p.id,
        nome: p.name || "",
        ruolo: p.role || p.role_mantra || "",
        squadra: p.serie_a_team || "",
        quotazione: p.quotation ?? "",

        fp: !!p.is_fp,
        fpKeeper: !!p.is_fp_keeper,
        fpKeeperYear: p.fp_keeper_year,
        fpEligible: fpEligibility?.eligible === true,
        fpEligibilityReason: fpEligibility?.reason || "",
        fpPersonalCallNumber: fpEligibility?.personal_call_number ?? null,
        fpAcquisitionType: fpEligibility?.acquisition_type || null,
        fpEffectiveQuotation: fpEligibility?.effective_quotation ?? null,

           u21: !!p.is_u21,
        u21Slot: !!p.is_u21_slot,
        u21Keeper: !!p.is_u21_keeper,
        u21KeeperYear: p.u21_keeper_year,
        top6Protected:
  !!p.is_top6_protected &&
  p.owner_team_id === p.top6_protected_team_id,
          
        rfaMatched: !!p.is_rfa_matched
      };

      if (activeIrPlayerIds.has(String(p.id))) {
        rose[nomeSquadra].injuryReserve = {
          ...rose[nomeSquadra].injuryReserve,
          player: playerData
        };
        return;
      }

      rose[nomeSquadra].giocatori.push(playerData);
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
    fpEleggibili: giocatori.filter(g => g.fpEligible).length,
    u21: giocatori.filter(g => g.u21Slot).length,
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
    const irRecord = data.injuryReserve;

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
      <span>${stats.fpEleggibili} FP eleggibili</span>
      <span>${stats.u21} U21</span>
      <span>${stats.rfa} RFA</span>
      <span>${stats.protetti} protetti</span>
      <span class="${irRecord ? "has-ir" : ""}">${irRecord ? (irRecord.status === "active" ? "IR attiva" : "IR usata") : "IR 0/1"}</span>
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

    if (irRecord) {
      rosterBody.insertAdjacentHTML("beforeend", renderInjuryReserveSlot(irRecord));
    }

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

          const nomeRenderizzato = g.fpEligible
            ? `<strong class="fp-eligible-next" title="${escapeAttribute(g.fpEligibilityReason || "Eleggibile FP per la prossima stagione")}">${evidenziato}</strong>`
            : evidenziato;

          return `
            <tr>
              <td>${g.ruolo}</td>
              <td class="nome">
                ${nomeRenderizzato}
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
    const nomiGiocatori = [...card.querySelectorAll(".nome, .ir-player-name")]
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

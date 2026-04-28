import { supabase } from './supabase.js';
const FUTURE_PICK_SEASON = 2027;

const conferencePerSquadra = {
  "Team Bartowski": "Conference League",
  "Desperados": "Conference League",
  "Riverfilo": "Conference Championship",
  "Golden Knights": "Conference Championship",
  "Fantaugusta": "Conference Championship",
  "Rubinkebab": "Conference Championship",
  "Eintracht Franco 126": "Conference Championship",
  "Fc Disoneste": "Conference Championship",
  "PokerMantra": "Conference Championship",
  "wildboys78": "Conference Championship",
  "Bayern Christiansen": "Conference League",
  "Minnesode Timberland": "Conference League",
  "MinneSota Snakes": "Conference League",
  "Ibla": "Conference League",
  "Pandinicoccolosini": "Conference League",
  "Athletic Pongao": "Conference League"
};

// Serpentina base
function generaSnakeDraftBase(teams, rounds) {
  let pickCounter = 1;
  return Array.from({ length: rounds }, (_, roundIndex) => {
    const order = (roundIndex + 1) % 2 === 1 ? teams : [...teams].reverse();
    return order.map(team => ({ team, pickNumber: pickCounter++ }));
  });
}

// Applica gli scambi
function applicaScambi(draft, scambi, conference) {
  let scambioIdCounter = 1;

  scambi.forEach(([conf, round1, squadra1, round2, squadra2]) => {
    if (conf !== conference) return;

    const roundPicks1 = draft[round1 - 1];
    const roundPicks2 = draft[round2 - 1];
    if (!roundPicks1 || !roundPicks2) return;

    const squadra1Key = teamKey(squadra1);
    const squadra2Key = teamKey(squadra2);

    const pick1 = roundPicks1.find(p => teamKey(p.team) === squadra1Key);
    const pick2 = roundPicks2.find(p => teamKey(p.team) === squadra2Key);

    if (!pick1 || !pick2) {
      console.warn("Scambio non applicato:", {
        conference,
        round1,
        squadra1,
        round2,
        squadra2
      });
      return;
    }

    [pick1.pickNumber, pick2.pickNumber] = [pick2.pickNumber, pick1.pickNumber];

    pick1.scambioId = scambioIdCounter;
    pick2.scambioId = scambioIdCounter;

    scambioIdCounter++;
  });

  return draft;
}

// 🔹 BONUS KEBA B: sposta la sua ultima pick al numero 73
function applicaBonusRubinkebab(draftChampionship) {
  const squadra = "Rubinkebab";
  const targetNumber = 73;   // prima pick del round 10

  // 1) trova l'ultima pick di Rubinkebab (pickNumber massimo tra le sue)
  let lastPick = null;
  draftChampionship.forEach(round => {
    round.forEach(p => {
     if (teamKey(p.team) === teamKey(squadra)) {
        if (!lastPick || p.pickNumber > lastPick.pickNumber) {
          lastPick = p;
        }
      }
    });
  });
  if (!lastPick) return draftChampionship;

  const oldNumber = lastPick.pickNumber; // es. 179
  if (oldNumber === targetNumber) return draftChampionship; // già a posto

  // 2) rinumera:
  // - le pick tra 73 e oldNumber-1 vanno su di 1
  // - la vecchia oldNumber di Kebab diventa 73
  draftChampionship.forEach(round => {
    round.forEach(p => {
      if (p === lastPick) return;
      if (p.pickNumber >= targetNumber && p.pickNumber < oldNumber) {
        p.pickNumber++;
      }
    });
  });

lastPick.pickNumber = targetNumber;
lastPick.bonusCoppa = true;   // 👈 evidenzia questa pick

return draftChampionship;

}

// Trasforma in formato finale
function formattaDraft(draft) {
  return draft.map((round, i) => ({
    Round: i + 1,
   Picks: round.map(p => ({
  team: p.team,
  pickNumber: p.pickNumber,
  scambioId: p.scambioId || null,
  bonusCoppa: !!p.bonusCoppa
    }))
  }));
}

const STATS_MASTER_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSG3HrTJsfZGhgfJJx8l63QYhooGsyiydLf1OTt2JldOPx5nSZyJz00IplWA5YHGwjymNL9EXIVX5XA/pub?gid=1118969717&single=true&output=csv";

function parseCSV(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else {
      field += c;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift().map(h => String(h || "").trim());

  return rows
    .filter(r => r.some(c => String(c || "").trim() !== ""))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = String(r[i] ?? "").trim();
      });
      return obj;
    });
}

function parseNumber(value) {
  const n = parseFloat(String(value || "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function cleanTeamName(name) {
  return String(name || "")
    .replace(/[👑🎖️💀]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getConferenceForTeam(nomeSquadra) {
  const key = teamKey(nomeSquadra);

  for (const [team, conference] of Object.entries(conferencePerSquadra)) {
    if (teamKey(team) === key) {
      return conference;
    }
  }

  return null;
}

function teamKey(name) {
  return cleanTeamName(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const GOAL_BASE = 66;
const GOAL_STEP = 6;

function pointsToGoals(points) {
  const p = parseNumber(points);
  if (p < GOAL_BASE) return 0;
  return 1 + Math.floor((p - GOAL_BASE) / GOAL_STEP);
}

function removeDuplicateRows(rows) {
  const seen = new Set();

  return rows.filter(r => {
    const key = [
      String(r.GW || "").trim(),
      String(r.GW_Stagionale || "").trim(),
      cleanTeamName(r.Team),
      cleanTeamName(r.Opponent),
      String(r.PointsFor || "").replace(",", ".").trim(),
      String(r.PointsAgainst || "").replace(",", ".").trim(),
      String(r.Conference || "").trim()
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildTotalRankingFromStats(statsCSV) {
  const rawRows = parseCSV(statsCSV);
  const rows = removeDuplicateRows(rawRows);

  const table = new Map();

  rows.forEach(r => {
    const conference = String(r.Conference || "").trim();
    const phase = String(r.Phase || "").trim();

    // Per il draft contano solo Conference + Round Robin
    const competizioneValida = ["Conf A", "Conf B", "Unificata"].includes(conference);
    if (!competizioneValida) return;
    if (phase !== "Regular") return;

    const squadra = cleanTeamName(r.Team);
    const opponent = cleanTeamName(r.Opponent);
    const pf = parseNumber(r.PointsFor);
    const pa = parseNumber(r.PointsAgainst);

    if (!squadra || !opponent) return;
    if (pf === 0 && pa === 0) return;

    const key = teamKey(squadra);

    if (!table.has(key)) {
      table.set(key, {
        squadra,
        g: 0,
        v: 0,
        n: 0,
        p: 0,
        gf: 0,
        gs: 0,
        pt: 0,
        mp: 0
      });
    }

    const rec = table.get(key);

    const gf = pointsToGoals(pf);
    const gs = pointsToGoals(pa);

    rec.g += 1;
    rec.gf += gf;
    rec.gs += gs;
    rec.mp += pf;

    if (gf > gs) {
      rec.v += 1;
      rec.pt += 3;
    } else if (gf === gs) {
      rec.n += 1;
      rec.pt += 1;
    } else {
      rec.p += 1;
    }
  });

  return Array.from(table.values()).sort((a, b) => {
    return (
      b.pt - a.pt ||
      b.mp - a.mp ||
      b.gf - a.gf ||
      (a.gs - b.gs) ||
      a.squadra.localeCompare(b.squadra)
    );
  });
}

async function loadFutureDraftPicks() {
  const { data, error } = await supabase
    .from("future_draft_picks")
    .select(`
      id,
      season,
      draft_name,
      round,
      pick_kind,
      bonus_for_team_id,
      source_trade_id,
      protection_note,
      notes,
      status,
      original:teams!future_draft_picks_original_team_id_fkey(id, name),
      owner:teams!future_draft_picks_owner_team_id_fkey(id, name)
    `)
    .eq("season", FUTURE_PICK_SEASON)
    .in("status", ["active", "converted_interconference"])
    .order("draft_name", { ascending: true })
    .order("round", { ascending: true });

  if (error) {
    console.error("Errore caricamento future_draft_picks:", error);
    throw error;
  }

  return data || [];
}

function generaDraftDaCSV(statsCSV, futurePicks) {
  const classificaTotale = buildTotalRankingFromStats(statsCSV);

  // Ultimo in classifica = prima pick
const squadreTotali = classificaTotale
  .map(r => cleanTeamName(r.squadra))
  .filter(Boolean)
  .reverse();

  const leagueTeams = squadreTotali.filter(
    s => getConferenceForTeam(s) === "Conference League"
  );

  const champTeams = squadreTotali.filter(
    s => getConferenceForTeam(s) === "Conference Championship"
  );

  const leagueDraftBase = generaSnakeDraftBase(leagueTeams, 23);
  const champDraftBase = generaSnakeDraftBase(champTeams, 23);

  const league = applicaProprietariFuturePicks(
    leagueDraftBase,
    futurePicks,
    "Draft Conference"
  );

  const championship = applicaProprietariFuturePicks(
    champDraftBase,
    futurePicks,
    "Draft Championship"
  );

  return {
    league,
    championship,
    leagueTeams,
    champTeams
  };
}

function applicaProprietariFuturePicks(draftBase, futurePicks, draftName) {
  const picksForDraft = futurePicks.filter(fp => fp.draft_name === draftName);

  const normalPicks = picksForDraft.filter(fp =>
    (fp.pick_kind || "normal") === "normal"
  );

  const activeNormalPicks = normalPicks.filter(fp =>
    fp.status === "active"
  );

  const convertedPicks = normalPicks.filter(fp =>
    fp.status === "converted_interconference"
  );

  const bonusPicks = picksForDraft.filter(fp =>
    fp.pick_kind === "bonus" &&
    fp.status === "active"
  );

  // Pick normali convertite in bonus inter-conference da eliminare
  const convertedKeys = new Set(
    convertedPicks.map(fp => {
      const originalName = fp.original?.name || "";
      return `${Number(fp.round)}|${teamKey(originalName)}`;
    })
  );

  /*
    LOGICA DISPLAY ROUND PER SCAMBI NORMALI INTRA-CONFERENCE

    Esempio:
    Bayern perde R2
    Bayern riceve R4 Desperados

    Allora la pick ricevuta da Bayern va mostrata in R2.
  */
  const lostNormalSlotsByTeamId = new Map();

  activeNormalPicks.forEach(fp => {
    const originalId = fp.original?.id;
    const ownerId = fp.owner?.id;

    if (!originalId || !ownerId) return;

    // Se owner diverso da original, la squadra originale ha perso quel round
    if (originalId !== ownerId) {
      if (!lostNormalSlotsByTeamId.has(originalId)) {
        lostNormalSlotsByTeamId.set(originalId, []);
      }

      lostNormalSlotsByTeamId.get(originalId).push({
        round: Number(fp.round),
        source_trade_id: fp.source_trade_id || null
      });
    }
  });

  lostNormalSlotsByTeamId.forEach(slots => {
    slots.sort((a, b) => a.round - b.round);
  });

  const usedLostSlotsByTeamId = new Map();

  function getReplacementRoundForNormalTrade(fp) {
    const ownerId = fp.owner?.id;
    if (!ownerId) return Number(fp.round);

    const slots = lostNormalSlotsByTeamId.get(ownerId) || [];
    if (!slots.length) return Number(fp.round);

    if (!usedLostSlotsByTeamId.has(ownerId)) {
      usedLostSlotsByTeamId.set(ownerId, new Set());
    }

    const used = usedLostSlotsByTeamId.get(ownerId);

    // Prima prova: stesso source_trade_id, se presente
    let slotIndex = -1;

    if (fp.source_trade_id) {
      slotIndex = slots.findIndex((slot, index) =>
        !used.has(index) &&
        slot.source_trade_id === fp.source_trade_id
      );
    }

    // Fallback: primo slot libero
    if (slotIndex === -1) {
      slotIndex = slots.findIndex((slot, index) => !used.has(index));
    }

    if (slotIndex === -1) return Number(fp.round);

    used.add(slotIndex);
    return slots[slotIndex].round;
  }

  /*
    LOGICA DISPLAY ROUND PER BONUS INTER-CONFERENCE

    Esempio:
    Bartowski perde R2/R3
    Bartowski riceve bonus da Rubinkebab

    Le bonus ricevute vanno mostrate in R2/R3.
  */
  const bonusDisplayRoundById = new Map();

  const tradeIds = [
    ...new Set(
      bonusPicks
        .map(fp => fp.source_trade_id)
        .filter(Boolean)
    )
  ];

  tradeIds.forEach(tradeId => {
    const bonusesForTrade = bonusPicks.filter(fp => fp.source_trade_id === tradeId);

    const owners = [
      ...new Set(
        bonusesForTrade
          .map(fp => fp.owner?.id)
          .filter(Boolean)
      )
    ];

    owners.forEach(ownerId => {
      const ownerConvertedSlots = convertedPicks
        .filter(fp =>
          fp.source_trade_id === tradeId &&
          fp.owner?.id === ownerId
        )
        .sort((a, b) => Number(a.round) - Number(b.round));

      const ownerBonuses = bonusesForTrade
        .filter(fp => fp.owner?.id === ownerId)
        .sort((a, b) => Number(a.round) - Number(b.round));

      ownerBonuses.forEach((bonus, index) => {
        const replacementSlot = ownerConvertedSlots[index];

        bonusDisplayRoundById.set(
          bonus.id,
          replacementSlot ? Number(replacementSlot.round) : Number(bonus.round)
        );
      });
    });
  });

  let globalPickNumber = 1;

  return draftBase.map((round, roundIndex) => {
    const roundNumber = roundIndex + 1;

    const normalRoundPicks = [];

    round.forEach(pickBase => {
      const originalKey = teamKey(pickBase.team);
      const convertedKey = `${roundNumber}|${originalKey}`;

      // Pick ceduta fuori conference: non appare più come pick normale
      if (convertedKeys.has(convertedKey)) {
        return;
      }

      const futurePick = normalPicks.find(fp => {
        const fpOriginalKey = teamKey(fp.original?.name || "");
        return (
          Number(fp.round) === roundNumber &&
          fpOriginalKey === originalKey &&
          fp.status === "active"
        );
      });

      const originalTeam = futurePick?.original?.name || pickBase.team;
      const ownerTeam = futurePick?.owner?.name || pickBase.team;

      const isTraded = teamKey(originalTeam) !== teamKey(ownerTeam);

      const displayRound = isTraded && futurePick
        ? getReplacementRoundForNormalTrade(futurePick)
        : roundNumber;

      normalRoundPicks.push({
        team: ownerTeam,
        originalTeam,
        pickNumber: globalPickNumber++,
        traded: isTraded,
        bonus: false,
        round: roundNumber,
        displayRound,
        protection_note: futurePick?.protection_note || "",
        notes: futurePick?.notes || ""
      });
    });

    const bonusRoundPicks = bonusPicks
      .filter(fp => Number(fp.round) === roundNumber)
      .map(fp => {
        const originalTeam = fp.original?.name || "Altra Conference";
        const ownerTeam = fp.owner?.name || "";

        return {
          team: ownerTeam,
          originalTeam,
          pickNumber: globalPickNumber++,
          traded: true,
          bonus: true,
          round: roundNumber,
          displayRound: bonusDisplayRoundById.get(fp.id) || roundNumber,
          protection_note: fp.protection_note || "",
          notes: fp.notes || ""
        };
      });

    return {
      Round: roundNumber,
      Picks: [...normalRoundPicks, ...bonusRoundPicks]
    };
  });
}

function shortTeamName(name) {
  const cleaned = cleanTeamName(name);

  const map = {
    "Bayern Christiansen": "Bayern",
    "Pandinicoccolosini": "Pandinico",
    "Minnesode Timberland": "Minnesode",
    "MinneSota Snakes": "Snakes",
    "Eintracht Franco 126": "Eintracht",
    "Fc Disoneste": "Disoneste"
  };

  return map[cleaned] || cleaned;
}

function getCanonicalTeamName(name, squadre) {
  const key = teamKey(name);
  const found = squadre.find(s => teamKey(s) === key);
  return found || cleanTeamName(name);
}

function generaTabellaVerticale(containerId, draftData, squadreOrdine) {
  const container = document.getElementById(containerId);

  if (!draftData || draftData.length === 0) {
    container.innerHTML = "<p>⚠️ Nessun dato disponibile</p>";
    return;
  }

  const squadre = squadreOrdine && squadreOrdine.length
    ? squadreOrdine.map(s => cleanTeamName(s))
    : draftData[0].Picks.map(p => cleanTeamName(p.team));

  const maxRounds = Math.max(...draftData.map(r => Number(r.Round) || 0));

  const draftPerSquadra = {};

  squadre.forEach(s => {
    draftPerSquadra[s] = {};
    for (let r = 1; r <= maxRounds; r++) {
      draftPerSquadra[s][r] = [];
    }
  });

  draftData.forEach(round => {
    round.Picks.forEach(p => {
      const ownerCanonical = getCanonicalTeamName(p.team, squadre);
      const originalCanonical = getCanonicalTeamName(p.originalTeam, squadre);

      const displayRound = Number(
        p.displayRound || p.round || round.Round
      );

      if (!draftPerSquadra[ownerCanonical]) {
        draftPerSquadra[ownerCanonical] = {};
        for (let r = 1; r <= maxRounds; r++) {
          draftPerSquadra[ownerCanonical][r] = [];
        }
        squadre.push(ownerCanonical);
      }

      if (!draftPerSquadra[ownerCanonical][displayRound]) {
        draftPerSquadra[ownerCanonical][displayRound] = [];
      }

      draftPerSquadra[ownerCanonical][displayRound].push({
        pickNumber: p.pickNumber,
        originalTeam: originalCanonical,
        traded: p.traded,
        bonus: p.bonus,
        round: p.round,
        displayRound,
        protection_note: p.protection_note,
        notes: p.notes
      });
    });
  });

  let html = '<div class="draft-scroll"><div class="draft-columns">';

  squadre.forEach(squadra => {
    html += `<div class="draft-card">
              <div class="draft-header">
                <div class="draft-logo-wrapper">
                  <img src="img/${squadra}.png" alt="${squadra}" class="draft-logo">
                </div>
                <h3>${squadra}</h3>
              </div>
              <div class="draft-picks">`;

    for (let r = 1; r <= maxRounds; r++) {
      const picksInRound = draftPerSquadra[squadra][r] || [];

      if (!picksInRound.length) {
        html += `<div class="pick pick-empty"></div>`;
        continue;
      }

      picksInRound.forEach(pick => {
        const tradedClass = pick.traded ? "pick-traded" : "";
        const bonusClass = pick.bonus ? "pick-bonus" : "";

        const title = pick.traded
          ? `Round visualizzato ${pick.displayRound}. Round originale ${pick.round}. Pick originale di ${pick.originalTeam}. ${pick.notes || ""} ${pick.protection_note || ""}`.trim()
          : `Round ${pick.displayRound}`;

        const label = pick.traded
          ? `Pick #${pick.pickNumber}<br><span class="bonus-source">da ${shortTeamName(pick.originalTeam)}</span>`
          : `Pick #${pick.pickNumber}`;

        html += `<div class="pick ${tradedClass} ${bonusClass}" title="${title}">${label}</div>`;
      });
    }

    html += `</div></div>`;
  });

  html += '</div></div>';
  container.innerHTML = html;
}


function renderRounds(draftContainerId, roundsColId) {
  const container = document.getElementById(draftContainerId);
  const roundsCol = document.getElementById(roundsColId);
  if (!container || !roundsCol) return;

  const cards = container.querySelectorAll(".draft-card");
  if (!cards.length) return;

  // quante pick/righe (prendo il massimo per sicurezza)
  let maxRounds = 0;
  cards.forEach(card => {
    const n = card.querySelectorAll(".draft-picks .pick").length;
    if (n > maxRounds) maxRounds = n;
  });

  // costruisco colonna: spacer (per allinearla sotto header) + Round 1..N
  roundsCol.innerHTML = `<div class="rounds-spacer"></div>`;
  for (let r = 1; r <= maxRounds; r++) {
    const row = document.createElement("div");
    row.className = "round";
    row.textContent = `R${r}`;
    roundsCol.appendChild(row);
  }
}


// Fetch classifica totale + scambi
Promise.all([
  fetch(STATS_MASTER_CSV_URL + "&nocache=" + Date.now(), { cache: "no-store" }).then(r => r.text()),
  loadFutureDraftPicks()
])
.then(([statsCSV, futurePicks]) => {
  console.log("FUTURE PICKS DA SUPABASE:", futurePicks);
  const draft = generaDraftDaCSV(statsCSV, futurePicks);

  generaTabellaVerticale("draft-league", draft.league, draft.leagueTeams);
  generaTabellaVerticale("draft-championship", draft.championship, draft.champTeams);

  renderRounds("draft-league", "rounds-league");
  renderRounds("draft-championship", "rounds-championship");
})
.catch(err => {
  console.error("Errore nel caricamento del draft:", err);

  const league = document.getElementById("draft-league");
  const championship = document.getElementById("draft-championship");

  if (league) league.innerHTML = "<p>⚠️ Errore nel caricamento del draft futuro.</p>";
  if (championship) championship.innerHTML = "<p>⚠️ Errore nel caricamento del draft futuro.</p>";
});

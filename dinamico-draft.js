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
  return cleanTeamName(name);
}

function shortDesktopTeamName(name) {
  const clean = cleanTeamName(name);

  const shortNames = {
    "Golden Knights": "Golden",
    "MinneSota Snakes": "Snakes",
    "Minnesode Timberland": "Minnesode",
    "Team Bartowski": "Bartowski",
    "Athletic Pongao": "Pongao",
    "Bayern Christiansen": "Bayern",
    "Eintracht Franco 126": "Eintracht",
    "Pandinicoccolosini": "Pandini",
    "Fc Disoneste": "Disoneste",
    "PokerMantra": "Poker",
    "Rubinkebab": "Kebab",
    "Fantaugusta": "Fantaugusta",
    "Riverfilo": "River",
    "Desperados": "Desperados",
    "Ibla": "Ibla",
    "wildboys78": "Wildboys"
  };

  return shortNames[clean] || clean;
}

function getCanonicalTeamName(name, squadre) {
  const key = teamKey(name);
  const found = squadre.find(s => teamKey(s) === key);
  return found || cleanTeamName(name);
}

function generaTabellaVerticale(containerId, draftData, squadreOrdine) {
  const container = document.getElementById(containerId);

  if (!draftData || draftData.length === 0) {
    container.innerHTML = `<p class="draft-error">⚠️ Nessun dato disponibile</p>`;
    return;
  }

  const squadre = squadreOrdine && squadreOrdine.length
    ? squadreOrdine.map(s => cleanTeamName(s))
    : draftData[0].Picks.map(p => cleanTeamName(p.team));

  const maxRounds = Math.max(...draftData.map(r => Number(r.Round) || 0));
  const draftPerSquadra = {};

  squadre.forEach(s => {
    draftPerSquadra[s] = {};
    for (let r = 1; r <= maxRounds; r++) draftPerSquadra[s][r] = [];
  });

  draftData.forEach(round => {
    round.Picks.forEach(p => {
      const ownerCanonical = getCanonicalTeamName(p.team, squadre);
      const originalCanonical = getCanonicalTeamName(p.originalTeam, squadre);
      const displayRound = Number(p.displayRound || p.round || round.Round);

      if (!draftPerSquadra[ownerCanonical]) {
        draftPerSquadra[ownerCanonical] = {};
        for (let r = 1; r <= maxRounds; r++) draftPerSquadra[ownerCanonical][r] = [];
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

  let html = '<div class="draft-columns">';

  squadre.forEach(squadra => {
    html += `
      <article class="draft-card" title="${squadra}">
        <div class="draft-header">
          <img src="img/${squadra}.webp" alt="${squadra}" class="draft-logo" onerror="this.style.visibility='hidden'">
        </div>
        <div class="draft-picks">`;

    for (let r = 1; r <= maxRounds; r++) {
      const picksInRound = draftPerSquadra[squadra][r] || [];

      if (!picksInRound.length) {
        html += `<div class="pick pick-empty" aria-hidden="true"></div>`;
        continue;
      }

      picksInRound.forEach(pick => {
        const tradedClass = pick.traded ? "pick-traded" : "";
        const bonusClass = pick.bonus ? "pick-bonus" : "";
        const source = pick.traded || pick.bonus
       ? `<span class="pick-source">da ${shortDesktopTeamName(pick.originalTeam)}</span>`
          : "";

        const title = pick.traded
          ? `Round visualizzato ${pick.displayRound}. Round originale ${pick.round}. Pick originale di ${pick.originalTeam}. ${pick.notes || ""} ${pick.protection_note || ""}`.trim()
          : `Round ${pick.displayRound}`;

        html += `
          <div class="pick ${tradedClass} ${bonusClass}" title="${title}">
            <span class="pick-bubble">${pick.pickNumber}</span>
            <strong>Pick #${pick.pickNumber}</strong>
            ${source}
          </div>`;
      });
    }

    html += `</div></article>`;
  });

  html += '</div>';
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

function escapeDraftHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildDraftPerSquadra(draftData, squadreOrdine) {
  if (!draftData || draftData.length === 0) {
    return {
      squadre: [],
      maxRounds: 0,
      draftPerSquadra: {}
    };
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

  return {
    squadre,
    maxRounds,
    draftPerSquadra
  };
}

function generaMobileDraftCards(containerId, draftData, squadreOrdine) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const { squadre, maxRounds, draftPerSquadra } = buildDraftPerSquadra(
    draftData,
    squadreOrdine
  );

  if (!squadre.length) {
    container.innerHTML = `<p class="draft-error">⚠️ Nessun dato disponibile</p>`;
    return;
  }

  const roundMap = {};

  for (let r = 1; r <= maxRounds; r++) {
    roundMap[r] = [];
  }

  squadre.forEach(squadra => {
    for (let r = 1; r <= maxRounds; r++) {
      const picksInRound = draftPerSquadra[squadra][r] || [];

      picksInRound.forEach(pick => {
        roundMap[r].push({
          ...pick,
          ownerTeam: squadra,
          displayRound: r
        });
      });
    }
  });

  Object.keys(roundMap).forEach(round => {
    roundMap[round].sort((a, b) => Number(a.pickNumber) - Number(b.pickNumber));
  });

  let html = `
    <div class="mobile-draft-view-toggle" aria-label="Vista draft mobile">
      <button type="button" class="active" data-mobile-view="teams">👥 Squadre</button>
      <button type="button" data-mobile-view="rounds">☰ Round</button>
    </div>

    <div class="mobile-draft-view mobile-draft-view-teams active">
      <div class="mobile-team-list">
  `;

  squadre.forEach((squadra, index) => {
    const picks = [];

    for (let r = 1; r <= maxRounds; r++) {
      const picksInRound = draftPerSquadra[squadra][r] || [];

      picksInRound.forEach(pick => {
        picks.push({
          ...pick,
          displayRound: r
        });
      });
    }

   const openClass = "";
    const logoPath = `img/${squadra}.png`;

    html += `
      <article class="mobile-team-card ${openClass}" data-mobile-team="${escapeDraftHtml(squadra)}">
        <button type="button" class="mobile-team-header">
          <span class="mobile-team-main">
            <span class="mobile-team-logo">
              <img src="${logoPath}" alt="${escapeDraftHtml(squadra)}" loading="lazy" onerror="this.style.display='none'">
            </span>

            <span class="mobile-team-text">
              <strong>${escapeDraftHtml(squadra)}</strong>
              <small>${picks.length} pick totali</small>
            </span>
          </span>

          <span class="mobile-team-chevron">⌄</span>
        </button>

        <div class="mobile-team-body">
          <div class="mobile-pick-list">
    `;

    picks.forEach(pick => {
      const isTraded = !!pick.traded;
      const isBonus = !!pick.bonus;
      const originalTeam = pick.originalTeam || squadra;
      const originalLogo = `img/${originalTeam}.png`;

      const rowClass = [
        isTraded ? "is-traded" : "",
        isBonus ? "is-bonus" : ""
      ].join(" ").trim();

      html += `
        <div class="mobile-pick-row ${rowClass}">
          <span class="mobile-pick-code">R${pick.displayRound} · #${pick.pickNumber}</span>

          <span class="mobile-pick-origin">
            <img src="${originalLogo}" alt="${escapeDraftHtml(originalTeam)}" loading="lazy" onerror="this.style.display='none'">
            <span>${isTraded ? `da ${escapeDraftHtml(shortTeamName(originalTeam))}` : escapeDraftHtml(shortTeamName(originalTeam))}</span>
          </span>

          <span class="mobile-pick-badges">
            ${isTraded ? `<span class="mobile-pick-badge trade">↔ Trade</span>` : ""}
            ${isBonus ? `<span class="mobile-pick-badge bonus">★ Bonus</span>` : ""}
          </span>
        </div>
      `;
    });

    html += `
          </div>
        </div>
      </article>
    `;
  });

  html += `
      </div>
    </div>

    <div class="mobile-draft-view mobile-draft-view-rounds">
      <div class="mobile-round-list">
  `;

  for (let r = 1; r <= maxRounds; r++) {
    const picks = roundMap[r] || [];
    const openClass = "";

    html += `
      <article class="mobile-round-card ${openClass}">
        <button type="button" class="mobile-round-header">
          <span>
            <strong>Round ${r}</strong>
            <small>${picks.length} pick</small>
          </span>
          <span class="mobile-team-chevron">⌄</span>
        </button>

        <div class="mobile-round-body">
          <div class="mobile-pick-list">
    `;

    picks.forEach(pick => {
      const ownerTeam = pick.ownerTeam || "";
      const originalTeam = pick.originalTeam || ownerTeam;
      const ownerLogo = `img/${ownerTeam}.png`;
      const isTraded = !!pick.traded;
      const isBonus = !!pick.bonus;

      const rowClass = [
        isTraded ? "is-traded" : "",
        isBonus ? "is-bonus" : ""
      ].join(" ").trim();

      html += `
        <div class="mobile-pick-row mobile-round-pick-row ${rowClass}">
          <span class="mobile-pick-code">#${pick.pickNumber}</span>

          <span class="mobile-pick-origin">
            <img src="${ownerLogo}" alt="${escapeDraftHtml(ownerTeam)}" loading="lazy" onerror="this.style.display='none'">
            <span>${escapeDraftHtml(shortTeamName(ownerTeam))}</span>
          </span>

          <span class="mobile-pick-badges">
            ${isTraded ? `<span class="mobile-pick-badge trade">da ${escapeDraftHtml(shortTeamName(originalTeam))}</span>` : ""}
            ${isBonus ? `<span class="mobile-pick-badge bonus">★ Bonus</span>` : ""}
          </span>
        </div>
      `;
    });

    html += `
          </div>
        </div>
      </article>
    `;
  }

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;

  container.querySelectorAll(".mobile-team-header").forEach(header => {
    header.addEventListener("click", () => {
      const card = header.closest(".mobile-team-card");
      if (!card) return;

      card.classList.toggle("is-open");
    });
  });

  container.querySelectorAll(".mobile-round-header").forEach(header => {
    header.addEventListener("click", () => {
      const card = header.closest(".mobile-round-card");
      if (!card) return;

      card.classList.toggle("is-open");
    });
  });

  const toggleButtons = container.querySelectorAll(".mobile-draft-view-toggle button");
  const views = container.querySelectorAll(".mobile-draft-view");

  toggleButtons.forEach(button => {
    button.addEventListener("click", () => {
      const view = button.dataset.mobileView;

      toggleButtons.forEach(btn => btn.classList.remove("active"));
      views.forEach(viewEl => viewEl.classList.remove("active"));

      button.classList.add("active");

      const targetView = container.querySelector(
        view === "rounds"
          ? ".mobile-draft-view-rounds"
          : ".mobile-draft-view-teams"
      );

      if (targetView) targetView.classList.add("active");
    });
  });
}

async function loadDraftTradeSummary() {
  const containers = [
    document.getElementById("draft-trades-league"),
    document.getElementById("draft-trades-championship")
  ];

  containers.forEach(container => {
    if (container) {
      container.innerHTML = `<div class="draft-trades-loading">Caricamento trade draft...</div>`;
    }
  });

  const { data: teamsData, error: teamsError } = await supabase
    .from("teams")
    .select("id, name, conference");

  if (teamsError) {
    console.error("Errore caricamento teams per trade summary:", teamsError);
    renderDraftTradeError();
    return;
  }

  const teamsById = new Map((teamsData || []).map(team => [team.id, team]));

  const { data: proposals, error: proposalsError } = await supabase
    .from("trade_proposals")
    .select("*")
    .eq("status", "accepted")
    .order("accepted_at", { ascending: false });

  if (proposalsError) {
    console.error("Errore caricamento trade_proposals:", proposalsError);
    renderDraftTradeError();
    return;
  }

  if (!proposals || !proposals.length) {
    renderDraftTrades([], "draft-trades-league", "Conference League");
    renderDraftTrades([], "draft-trades-championship", "Conference Championship");
    return;
  }

  const proposalIds = proposals.map(proposal => proposal.id);

  const { data: assets, error: assetsError } = await supabase
    .from("trade_assets")
    .select("*")
    .in("proposal_id", proposalIds);

  if (assetsError) {
    console.error("Errore caricamento trade_assets:", assetsError);
    renderDraftTradeError();
    return;
  }

  const futurePickAssetIds = [
    ...new Set(
      (assets || [])
        .filter(asset => asset.asset_type === "future_pick")
        .map(asset => asset.asset_id)
        .filter(Boolean)
    )
  ];

  if (!futurePickAssetIds.length) {
    renderDraftTrades([], "draft-trades-league", "Conference League");
    renderDraftTrades([], "draft-trades-championship", "Conference Championship");
    return;
  }

  const { data: futurePicks, error: futurePicksError } = await supabase
    .from("future_draft_picks")
    .select("id, season, draft_name, round, pick_kind, status")
    .eq("season", FUTURE_PICK_SEASON)
    .in("id", futurePickAssetIds);

  if (futurePicksError) {
    console.error("Errore caricamento future_draft_picks trade:", futurePicksError);
    renderDraftTradeError();
    return;
  }

  const validFuturePickIds = new Set(
    (futurePicks || []).map(pick => String(pick.id))
  );

  const draftTrades = proposals
    .map(proposal => {
      const tradeAssets = (assets || []).filter(asset => asset.proposal_id === proposal.id);

      const hasDraft2027Pick = tradeAssets.some(asset =>
        asset.asset_type === "future_pick" &&
        validFuturePickIds.has(String(asset.asset_id))
      );

      if (!hasDraft2027Pick) return null;

      const fromTeam = teamsById.get(proposal.from_team);
      const toTeam = teamsById.get(proposal.to_team);

      if (!fromTeam || !toTeam) return null;

      const futureAssets = tradeAssets.filter(asset =>
        asset.asset_type === "future_pick" &&
        validFuturePickIds.has(String(asset.asset_id))
      );

      const involvedDraftNames = new Set(
        futureAssets
          .map(asset => {
            const futurePick = (futurePicks || []).find(fp => String(fp.id) === String(asset.asset_id));
            return futurePick?.draft_name || "";
          })
          .filter(Boolean)
      );

      return {
        proposal,
        assets: tradeAssets,
        futureAssets,
        fromTeam,
        toTeam,
        type: getDraftTradeType(fromTeam, toTeam),
        involvedDraftNames,
        date: proposal.accepted_at || proposal.created_at
      };
    })
    .filter(Boolean);

  const leagueTrades = draftTrades.filter(trade =>
    trade.involvedDraftNames.has("Draft Conference") ||
    trade.fromTeam.conference === "Conference League" ||
    trade.toTeam.conference === "Conference League" ||
    trade.type === "interconference"
  );

  const championshipTrades = draftTrades.filter(trade =>
    trade.involvedDraftNames.has("Draft Championship") ||
    trade.fromTeam.conference === "Conference Championship" ||
    trade.toTeam.conference === "Conference Championship" ||
    trade.type === "interconference"
  );

  renderDraftTrades(leagueTrades, "draft-trades-league", "Conference League");
  renderDraftTrades(championshipTrades, "draft-trades-championship", "Conference Championship");
}

function getDraftTradeType(fromTeam, toTeam) {
  const fromConference = fromTeam?.conference || "";
  const toConference = toTeam?.conference || "";

  if (fromConference !== toConference) {
    return "interconference";
  }

  if (fromConference === "Conference League") {
    return "league";
  }

  if (fromConference === "Conference Championship") {
    return "championship";
  }

  return "unknown";
}

function getDraftTradeTypeLabel(type) {
  if (type === "league") return "Conference League";
  if (type === "championship") return "Conference Championship";
  if (type === "interconference") return "Inter-conference";
  return "Trade";
}

function renderDraftTradeError() {
  ["draft-trades-league", "draft-trades-championship"].forEach(id => {
    const container = document.getElementById(id);
    if (!container) return;

    container.innerHTML = `
      <div class="draft-trades-empty">
        ⚠️ Errore nel caricamento delle trade draft.
      </div>
    `;
  });
}

function renderDraftTrades(trades, containerId, conferenceTitle) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const safeConferenceTitle = escapeDraftHtml(conferenceTitle);

  if (!trades.length) {
    container.innerHTML = `
      <div class="draft-trades-panel">
        <div class="draft-trades-head">
          <div>
            <span class="draft-trades-kicker">Movimenti ufficiali</span>
            <h3>Trade Draft 2027</h3>
            <p>${safeConferenceTitle}: nessuna trade con pick 2027.</p>
          </div>

          <span class="draft-trades-actions">
            <span class="draft-trades-count">0</span>
          </span>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="draft-trades-panel">
      <button type="button" class="draft-trades-head draft-trades-toggle" aria-expanded="false">
        <div>
          <span class="draft-trades-kicker">Movimenti ufficiali</span>
          <h3>Trade Draft 2027</h3>
          <p>${safeConferenceTitle}: solo trade concluse con almeno una pick futura 2027.</p>
        </div>

        <span class="draft-trades-actions">
          <span class="draft-trades-count">${trades.length}</span>
          <span class="draft-trades-chevron">⌄</span>
        </span>
      </button>

      <div class="draft-trades-list">
        ${trades.map(renderDraftTradeCard).join("")}
      </div>
    </div>
  `;

  const toggle = container.querySelector(".draft-trades-toggle");
  const panel = container.querySelector(".draft-trades-panel");

  toggle?.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

function renderDraftTradeCard(trade) {
  const fromAssets = trade.assets.filter(asset => asset.side === "from");
  const toAssets = trade.assets.filter(asset => asset.side === "to");

  const fromName = trade.fromTeam?.name || "Squadra";
  const toName = trade.toTeam?.name || "Squadra";

  return `
    <article class="draft-trade-card ${escapeDraftHtml(trade.type)}">
      <div class="draft-trade-top">
        <span class="draft-trade-dot"></span>

        <div class="draft-trade-title">
          <strong>${escapeDraftHtml(shortTeamName(fromName))} ↔ ${escapeDraftHtml(shortTeamName(toName))}</strong>
          <small>${escapeDraftHtml(getDraftTradeTypeLabel(trade.type))}</small>
        </div>
      </div>

      <div class="draft-trade-body">
        <div class="draft-trade-side">
          <span>${escapeDraftHtml(shortTeamName(fromName))} offre</span>
          <p>${renderDraftTradeAssets(fromAssets)}</p>
        </div>

        <div class="draft-trade-side">
          <span>${escapeDraftHtml(shortTeamName(toName))} offre</span>
          <p>${renderDraftTradeAssets(toAssets)}</p>
        </div>
      </div>
    </article>
  `;
}

function renderDraftTradeAssets(assets) {
  if (!assets.length) return "Nessun asset";

  return assets
    .map(asset => {
      const isFuturePick = asset.asset_type === "future_pick";
      const label = asset.asset_label || "Asset";

      return isFuturePick
        ? `<strong class="draft-trade-pick">${escapeDraftHtml(label)}</strong>`
        : `<span>${escapeDraftHtml(label)}</span>`;
    })
    .join(`<span class="draft-trade-plus"> + </span>`);
}

function initDraftTabs() {
  const tabs = document.querySelectorAll(".draft-tab");
  const panels = document.querySelectorAll(".draft-tab-panel");

  if (!tabs.length || !panels.length) return;

  tabs.forEach(tabButton => {
    tabButton.addEventListener("click", () => {
      const targetId = tabButton.dataset.target;
      const targetPanel = document.getElementById(targetId);

      if (!targetPanel) return;

      tabs.forEach(btn => btn.classList.remove("active"));
      panels.forEach(panel => panel.classList.remove("active"));

      tabButton.classList.add("active");
      targetPanel.classList.add("active");
    });
  });
}

initDraftTabs();

// Fetch classifica totale + future picks
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

  generaMobileDraftCards("mobile-draft-league", draft.league, draft.leagueTeams);
  generaMobileDraftCards("mobile-draft-championship", draft.championship, draft.champTeams);
  loadDraftTradeSummary();
})
.catch(err => {
  console.error("Errore nel caricamento del draft:", err);

  const league = document.getElementById("draft-league");
  const championship = document.getElementById("draft-championship");
  const mobileLeague = document.getElementById("mobile-draft-league");
  const mobileChampionship = document.getElementById("mobile-draft-championship");
  const tradesLeague = document.getElementById("draft-trades-league");
const tradesChampionship = document.getElementById("draft-trades-championship");

  if (league) league.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (championship) championship.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (mobileLeague) mobileLeague.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (mobileChampionship) mobileChampionship.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (tradesLeague) tradesLeague.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento delle trade draft.</p>`;
if (tradesChampionship) tradesChampionship.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento delle trade draft.</p>`;
});

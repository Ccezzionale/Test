import { supabase } from './supabase.js';
const FUTURE_PICK_SEASON = 2027;

const DYNAMIC_TRADE_BASE_PALETTES = [
  { solid: "#E53935", soft: "#FDE2E1", text: "#7A1512" }, // rosso
  { solid: "#1E88E5", soft: "#DDEEFF", text: "#0B4F8A" }, // blu
  { solid: "#43A047", soft: "#E1F3E3", text: "#1E5F22" }, // verde
  { solid: "#FB8C00", soft: "#FFE9CF", text: "#8A4B00" }, // arancione
  { solid: "#8E24AA", soft: "#F2E0F8", text: "#541268" }, // viola
  { solid: "#00897B", soft: "#DDF3F0", text: "#00584F" }, // turchese
  { solid: "#D81B60", soft: "#FADDE8", text: "#7D1038" }, // fucsia
  { solid: "#6D4C41", soft: "#EDE3DF", text: "#422820" }, // marrone
  { solid: "#00ACC1", soft: "#DDF6F9", text: "#005E6A" }, // ciano
  { solid: "#C0CA33", soft: "#F3F5D9", text: "#5D660B" }, // lime
  { solid: "#3949AB", soft: "#E1E4FA", text: "#1F2B73" }, // indaco
  { solid: "#F4511E", soft: "#FCE1D8", text: "#8C2707" }  // corallo
];

const dynamicTradePaletteById = new Map();
let dynamicTradePaletteCursor = 0;

function adjustDynamicTradeHex(hex, amount = 0) {
  const clean = String(hex || "").replace("#", "");
  const value = Number.parseInt(clean, 16);

  if (!Number.isFinite(value)) return hex;

  const clamp = channel => Math.max(0, Math.min(255, channel));
  const r = clamp((value >> 16) + amount);
  const g = clamp(((value >> 8) & 255) + amount);
  const b = clamp((value & 255) + amount);

  return `#${[r, g, b]
    .map(channel => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function getDynamicTradePaletteByIndex(index) {
  const safeIndex = Math.max(0, Number(index) || 0);
  const base =
    DYNAMIC_TRADE_BASE_PALETTES[
      safeIndex % DYNAMIC_TRADE_BASE_PALETTES.length
    ];

  const cycle = Math.floor(
    safeIndex / DYNAMIC_TRADE_BASE_PALETTES.length
  );

  if (cycle === 0) return base;

  /*
    Dopo i primi dodici colori fortemente distinti iniziano le sfumature:
    prima più chiare, poi più scure, senza cambiare famiglia cromatica.
  */
  const shadeSteps = [18, -18, 30, -30, 10, -10];
  const delta = shadeSteps[(cycle - 1) % shadeSteps.length];

  return {
    solid: adjustDynamicTradeHex(base.solid, delta),
    soft: adjustDynamicTradeHex(base.soft, delta > 0 ? 4 : -8),
    text: adjustDynamicTradeHex(base.text, delta > 0 ? -5 : 7)
  };
}

function registerDynamicTradePalette(tradeKey) {
  const key = String(tradeKey || "").trim();
  if (!key) return null;

  if (!dynamicTradePaletteById.has(key)) {
    dynamicTradePaletteById.set(
      key,
      getDynamicTradePaletteByIndex(dynamicTradePaletteCursor++)
    );
  }

  return dynamicTradePaletteById.get(key);
}

function getDynamicTradeKeyForPick(pick) {
  const sourceTradeId = String(pick?.source_trade_id || "").trim();

  if (sourceTradeId) {
    return sourceTradeId;
  }

  /*
    Fallback per vecchie righe inserite senza source_trade_id.
    Le pick tra le stesse due squadre mantengono almeno lo stesso colore.
  */
  const teams = [
    teamKey(pick?.originalTeam || ""),
    teamKey(pick?.team || pick?.ownerTeam || "")
  ]
    .filter(Boolean)
    .sort();

  return teams.length
    ? `fallback:${teams.join("|")}`
    : `fallback:pick-${pick?.pickNumber || "unknown"}`;
}

function registerDynamicDraftTradePalettes(draftData = []) {
  (draftData || []).forEach(round => {
    (round?.Picks || []).forEach(pick => {
      if (!pick?.traded) return;
      registerDynamicTradePalette(getDynamicTradeKeyForPick(pick));
    });
  });
}


const conferencePerSquadra = {
  "Team Bartowski": "Conference League",
  "Desperados": "Conference League",
  "Riverfilo": "Conference Championship",
  "Golden Knights": "Conference Championship",
  "Fantaugusta": "Conference Championship",
  "Atlético Leon": "Conference Championship",
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
        // Posizione della pick ceduta nella serpentina: serve soltanto
        // nella vista mobile "Round", per mostrare la pick ricevuta nello
        // slot che sostituisce (anziché in fondo al round).
        displayOrder: draftBase[Number(fp.round) - 1]
          ?.find(p => teamKey(p.team) === teamKey(fp.original?.name || ""))
          ?.pickNumber || Number.MAX_SAFE_INTEGER,
        source_trade_id: fp.source_trade_id || null
      });
    }
  });

  lostNormalSlotsByTeamId.forEach(slots => {
    slots.sort((a, b) => a.round - b.round);
  });

  const usedLostSlotsByTeamId = new Map();

  function getReplacementSlotForNormalTrade(fp) {
    const ownerId = fp.owner?.id;
    if (!ownerId) {
      return { round: Number(fp.round), displayOrder: Number.MAX_SAFE_INTEGER };
    }

    const slots = lostNormalSlotsByTeamId.get(ownerId) || [];
    if (!slots.length) {
      return { round: Number(fp.round), displayOrder: Number.MAX_SAFE_INTEGER };
    }

    if (!usedLostSlotsByTeamId.has(ownerId)) {
      usedLostSlotsByTeamId.set(ownerId, new Set());
    }

    const used = usedLostSlotsByTeamId.get(ownerId);

    // Prima prova: stesso source_trade_id, se presente
// Prima prova: abbina la pick alla stessa trade
let slotIndex = -1;

if (fp.source_trade_id) {
  // Trade normale registrata: stesso source_trade_id
  slotIndex = slots.findIndex((slot, index) =>
    !used.has(index) &&
    slot.source_trade_id === fp.source_trade_id
  );
} else {
  // Vecchie trade/manuali senza source_trade_id:
  // abbinale prima a uno slot anch'esso senza source_trade_id
  slotIndex = slots.findIndex((slot, index) =>
    !used.has(index) &&
    !slot.source_trade_id
  );
}

// Ultimo fallback soltanto se non abbiamo trovato nulla
if (slotIndex === -1) {
  slotIndex = slots.findIndex((slot, index) => !used.has(index));
}

    used.add(slotIndex);
    return slots[slotIndex];
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

      const replacementSlot = isTraded && futurePick
        ? getReplacementSlotForNormalTrade(futurePick)
        : null;
      const displayRound = replacementSlot?.round || roundNumber;

      normalRoundPicks.push({
        team: ownerTeam,
        originalTeam,
        pickNumber: globalPickNumber++,
        traded: isTraded,
        bonus: false,
        round: roundNumber,
        displayRound,
        displayOrder: replacementSlot?.displayOrder || pickBase.pickNumber,
        source_trade_id: futurePick?.source_trade_id || null,
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
          displayOrder: globalPickNumber,
          source_trade_id: fp.source_trade_id || null,
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
        displayOrder: p.displayOrder,
        source_trade_id: p.source_trade_id || null,
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
        displayOrder: p.displayOrder,
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

function getDynamicMobileInitials(teamName) {
  return String(teamName || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("") || "?";
}

function getDynamicMobileTradeSlotId(containerId) {
  if (containerId === "draft-trades-league") {
    return "mobile-draft-trades-league";
  }

  if (containerId === "draft-trades-championship") {
    return "mobile-draft-trades-championship";
  }

  return "";
}

function updateDynamicMobileTradeCount(containerId, value) {
  const slotId = getDynamicMobileTradeSlotId(containerId);
  const slot = slotId ? document.getElementById(slotId) : null;
  const mobileRoot = slot?.closest(".mobile-draft-cards");
  const countEl = mobileRoot?.querySelector(".dynamic-mobile-tab-count");

  if (countEl) {
    countEl.textContent = String(value ?? 0);
  }
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

  registerDynamicDraftTradePalettes(draftData);

  const roundMap = {};

  for (let r = 1; r <= maxRounds; r++) {
    roundMap[r] = [];
  }

  /*
    Stessa logica visuale del desktop:
    ogni pick viene collocata nel displayRound corretto e ordinata tramite
    displayOrder, così gli scambi sostituiscono lo slot ceduto senza
    accodarsi in fondo al round.
  */
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
    roundMap[round].sort((a, b) => {
      const aOrder = Number(a.displayOrder || a.pickNumber);
      const bOrder = Number(b.displayOrder || b.pickNumber);

      if (aOrder !== bOrder) return aOrder - bOrder;
      return Number(a.pickNumber || 0) - Number(b.pickNumber || 0);
    });
  });

  const conferenceKey = containerId.includes("championship")
    ? "championship"
    : "league";

  const tradeSlotId = `mobile-draft-trades-${conferenceKey}`;

  /*
    Ordine colonne immutabile:
    prendiamo l'ordine reale del Round 1, che deriva dalla classifica.
    Nei round pari NON invertiamo i loghi. È soltanto il senso di lettura
    a cambiare, indicato dalla freccia.
  */
  const fixedTeamOrder = (draftData[0]?.Picks || [])
    .slice()
    .sort((a, b) => Number(a.pickNumber || 0) - Number(b.pickNumber || 0))
    .map(pick => getCanonicalTeamName(pick.team, squadre))
    .filter((team, index, list) =>
      team && list.findIndex(item => teamKey(item) === teamKey(team)) === index
    );

  squadre.forEach(team => {
    if (!fixedTeamOrder.some(item => teamKey(item) === teamKey(team))) {
      fixedTeamOrder.push(team);
    }
  });

  const roundsHtml = Array.from({ length: maxRounds }, (_, index) => {
    const roundNumber = index + 1;
    const direction = roundNumber % 2 === 1 ? "→" : "←";

    /*
      Slot fissi come desktop:
      per ogni round scorriamo l'ordine colonne delle squadre, non l'ordine
      crescente delle pick. Così le pick scambiate restano nel loro slot
      visuale corretto e i round non si "sminchiano".
    */
    const slotsHtml = fixedTeamOrder.map(squadra => {
      const picksInRound = (draftPerSquadra[squadra]?.[roundNumber] || [])
        .slice()
        .sort((a, b) => {
          const aOrder = Number(a.displayOrder || a.pickNumber || 0);
          const bOrder = Number(b.displayOrder || b.pickNumber || 0);
          if (aOrder !== bOrder) return aOrder - bOrder;
          return Number(a.pickNumber || 0) - Number(b.pickNumber || 0);
        });

      const pick = picksInRound[0] || null;

      if (!pick) {
        return `
          <div
            class="dynamic-mobile-overview-slot is-missing"
            title="${escapeDraftHtml(`Round ${roundNumber} · ${squadra} · Nessuna pick`) }"
            aria-label="${escapeDraftHtml(`Round ${roundNumber} · ${squadra} · Nessuna pick`) }"
          >
            <img
              src="img/${escapeDraftHtml(squadra)}.webp"
              alt=""
              loading="lazy"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
            >
            <span class="dynamic-mobile-overview-fallback">
              ${escapeDraftHtml(getDynamicMobileInitials(squadra))}
            </span>
            <em aria-hidden="true">—</em>
          </div>
        `;
      }

      const ownerTeam = pick.ownerTeam || squadra;
      const originalTeam = pick.originalTeam || ownerTeam;
      const isTraded = !!pick.traded;
      const isBonus = !!pick.bonus;

      const tradeKey = isTraded
        ? getDynamicTradeKeyForPick({
            ...pick,
            team: ownerTeam,
            ownerTeam
          })
        : "";

      const tradePalette = isTraded
        ? registerDynamicTradePalette(tradeKey)
        : null;

      const tradeStyle = tradePalette
        ? [
            `--dynamic-trade-color:${tradePalette.solid}`,
            `--dynamic-trade-soft:${tradePalette.soft}`,
            `--dynamic-trade-text:${tradePalette.text}`
          ].join(";")
        : "";

      const classes = [
        "dynamic-mobile-overview-slot",
        isTraded ? "is-traded" : "",
        isBonus ? "is-bonus" : ""
      ].filter(Boolean).join(" ");

      const titleParts = [
        `Pick #${pick.pickNumber}`,
        ownerTeam,
        `Round visuale ${pick.displayRound}`
      ];

      if (isTraded) {
        titleParts.push(`da ${originalTeam}`);
      }

      if (isBonus) {
        titleParts.push("Pick bonus");
      }

      return `
        <div
          class="${classes}"
          style="${tradeStyle}"
          data-dynamic-trade-key="${escapeDraftHtml(tradeKey)}"
          title="${escapeDraftHtml(titleParts.join(" · "))}"
          aria-label="${escapeDraftHtml(titleParts.join(" · "))}"
        >
          <img
            src="img/${escapeDraftHtml(ownerTeam)}.webp"
            alt=""
            loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          >
          <span class="dynamic-mobile-overview-fallback">
            ${escapeDraftHtml(getDynamicMobileInitials(ownerTeam))}
          </span>

          <em aria-hidden="true">#${pick.pickNumber}</em>

          ${
            isBonus
              ? `<i class="bonus" aria-hidden="true">★</i>`
              : isTraded
                ? `<i class="trade" aria-hidden="true">↔</i>`
                : ""
          }
        </div>
      `;
    }).join("");

    return `
      <div class="dynamic-mobile-overview-round">
        <div class="dynamic-mobile-overview-round-label">
          <strong>R${roundNumber}</strong>
          <span aria-hidden="true">${direction}</span>
        </div>

        <div class="dynamic-mobile-overview-slots">
          ${slotsHtml}
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="dynamic-mobile-view-tabs" aria-label="Vista Draft Dinamico mobile">
      <button type="button" class="active" data-dynamic-mobile-view="rounds">
        <span aria-hidden="true">▦</span>
        Round
      </button>

      <button type="button" data-dynamic-mobile-view="trades">
        <span aria-hidden="true">↔</span>
        Trade
        <em class="dynamic-mobile-tab-count">0</em>
      </button>
    </div>

    <div class="dynamic-mobile-panel dynamic-mobile-panel-rounds active">
      <section class="dynamic-mobile-overview-card" aria-label="Panoramica completa del Draft 2027">
        <header class="dynamic-mobile-overview-header">
          <span class="dynamic-mobile-overview-icon" aria-hidden="true">
            <img src="img/badges/draft.webp" alt="">
          </span>

          <span class="dynamic-mobile-overview-heading">
            <strong>Draft Overview</strong>
            <small>Panoramica completa dei ${maxRounds} round</small>
          </span>

          <span class="dynamic-mobile-overview-total">
            ${draftData.reduce((sum, round) => sum + (round.Picks?.length || 0), 0)}
          </span>
        </header>

        <div class="dynamic-mobile-overview-legend" aria-label="Legenda">
          <span><i class="normal"></i>Normale</span>
          <span><i class="trade">↔</i>Trade</span>
          <span><i class="bonus">★</i>Bonus</span>
        </div>

        <div class="dynamic-mobile-overview-rounds">
          ${roundsHtml}
        </div>
      </section>
    </div>

    <div class="dynamic-mobile-panel dynamic-mobile-panel-trades">
      <div id="${tradeSlotId}" class="dynamic-mobile-trades-slot">
        <div class="draft-trades-loading">Caricamento trade draft...</div>
      </div>
    </div>
  `;

  if (container.dataset.dynamicMobileBound !== "1") {
    container.addEventListener("click", event => {
      const tabButton = event.target.closest("[data-dynamic-mobile-view]");
      if (!tabButton) return;

      const nextView = tabButton.dataset.dynamicMobileView;

      container
        .querySelectorAll("[data-dynamic-mobile-view]")
        .forEach(button => {
          button.classList.toggle(
            "active",
            button.dataset.dynamicMobileView === nextView
          );
        });

      container
        .querySelectorAll(".dynamic-mobile-panel")
        .forEach(panel => panel.classList.remove("active"));

      const targetPanel = container.querySelector(
        nextView === "trades"
          ? ".dynamic-mobile-panel-trades"
          : ".dynamic-mobile-panel-rounds"
      );

      targetPanel?.classList.add("active");
    });

    container.dataset.dynamicMobileBound = "1";
  }
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
  [
    "draft-trades-league",
    "draft-trades-championship",
    "mobile-draft-trades-league",
    "mobile-draft-trades-championship"
  ].forEach(id => {
    const container = document.getElementById(id);
    if (!container) return;

    container.innerHTML = `
      <div class="draft-trades-empty">
        ⚠️ Errore nel caricamento delle trade draft.
      </div>
    `;
  });

  updateDynamicMobileTradeCount("draft-trades-league", "!");
  updateDynamicMobileTradeCount("draft-trades-championship", "!");
}

function buildDraftTradesMarkup(trades, conferenceTitle) {
  const safeConferenceTitle = escapeDraftHtml(conferenceTitle);

  if (!trades.length) {
    return `
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
  }

  return `
    <div class="draft-trades-panel">
      <button type="button" class="draft-trades-head draft-trades-toggle" aria-expanded="false">
        <div>
          <span class="draft-trades-kicker">Movimenti ufficiali</span>
          <h3>Trade Draft 2027</h3>
          <p>${safeConferenceTitle}: trade concluse con almeno una pick futura 2027.</p>
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
}

function bindDraftTradesPanel(container, forceOpen = false) {
  const toggle = container?.querySelector(".draft-trades-toggle");
  const panel = container?.querySelector(".draft-trades-panel");

  if (!panel) return;

  if (forceOpen) {
    panel.classList.add("is-open", "is-mobile-embedded");

    if (toggle) {
      toggle.setAttribute("aria-expanded", "true");
      toggle.tabIndex = -1;
    }

    return;
  }

  toggle?.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

function renderDraftTrades(trades, containerId, conferenceTitle) {
  const desktopContainer = document.getElementById(containerId);
  const mobileSlotId = getDynamicMobileTradeSlotId(containerId);
  const mobileContainer = mobileSlotId
    ? document.getElementById(mobileSlotId)
    : null;

  const markup = buildDraftTradesMarkup(trades, conferenceTitle);

  if (desktopContainer) {
    desktopContainer.innerHTML = markup;
    bindDraftTradesPanel(desktopContainer, false);
  }

  if (mobileContainer) {
    mobileContainer.innerHTML = markup;
    bindDraftTradesPanel(mobileContainer, true);
  }

  updateDynamicMobileTradeCount(containerId, trades.length);
}

function renderDraftTradeCard(trade) {
  const tradePalette = registerDynamicTradePalette(
    trade?.proposal?.id || ""
  ) || getDynamicTradePaletteByIndex(0);

  const tradeStyle = [
    `--dynamic-trade-color:${tradePalette.solid}`,
    `--dynamic-trade-soft:${tradePalette.soft}`,
    `--dynamic-trade-text:${tradePalette.text}`
  ].join(";");

  const fromAssets = trade.assets.filter(asset => asset.side === "from");
  const toAssets = trade.assets.filter(asset => asset.side === "to");

  const fromName = trade.fromTeam?.name || "Squadra";
  const toName = trade.toTeam?.name || "Squadra";

  return `
    <article
      class="draft-trade-card ${escapeDraftHtml(trade.type)} is-color-coded"
      style="${tradeStyle}"
    >
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
  const mobileTradesLeague = document.getElementById("mobile-draft-trades-league");
  const mobileTradesChampionship = document.getElementById("mobile-draft-trades-championship");

  if (league) league.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (championship) championship.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (mobileLeague) mobileLeague.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (mobileChampionship) mobileChampionship.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (tradesLeague) tradesLeague.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento delle trade draft.</p>`;
  if (tradesChampionship) tradesChampionship.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento delle trade draft.</p>`;
  if (mobileTradesLeague) mobileTradesLeague.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento delle trade draft.</p>`;
  if (mobileTradesChampionship) mobileTradesChampionship.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento delle trade draft.</p>`;
});

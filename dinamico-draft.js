import { supabase } from './supabase.js';
import { loadResultsRows } from './results-source.js';
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

function getDynamicDesktopTradeType(originalTeam, ownerTeam) {
  const originalConference = getConferenceForTeam(originalTeam);
  const ownerConference = getConferenceForTeam(ownerTeam);

  if (
    originalConference &&
    ownerConference &&
    originalConference !== ownerConference
  ) {
    return "interconference";
  }

  if (ownerConference === "Conference League") {
    return "league";
  }

  if (ownerConference === "Conference Championship") {
    return "championship";
  }

  return "unknown";
}

function bindDynamicDesktopTradeClicks(container) {
  if (!container || container.dataset.desktopTradeBound === "1") return;

  container.addEventListener("click", event => {
    // Desktop soltanto
    if (window.innerWidth < 769) return;

    const clickedPick = event.target.closest(
      ".pick.pick-traded[data-dynamic-trade-key]"
    );

    if (!clickedPick || !container.contains(clickedPick)) return;

    const tradeKey = clickedPick.dataset.dynamicTradeKey;

    const sameTradePicks = Array.from(
      container.querySelectorAll(
        ".pick.pick-traded[data-dynamic-trade-key]"
      )
    ).filter(pick =>
      pick.dataset.dynamicTradeKey === tradeKey
    );

    const alreadyActive = sameTradePicks.some(pick =>
      pick.classList.contains("trade-focus")
    );

    // Spegne eventuale trade precedentemente selezionata
    document
      .querySelectorAll(".draft-container .pick.trade-focus")
      .forEach(pick => {
        pick.classList.remove("trade-focus");
      });

    // Se non era già attiva, accende tutte le pick di questa trade
    if (!alreadyActive) {
      sameTradePicks.forEach(pick => {
        pick.classList.add("trade-focus");
      });
    }
  });

  container.dataset.desktopTradeBound = "1";
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

function buildTotalRankingFromStats(statsSource) {
  // La classifica ora usa results-source.js (Supabase con fallback CSV).
  // Manteniamo anche la compatibilità con un eventuale CSV testuale.
  const rawRows = Array.isArray(statsSource)
    ? statsSource
    : parseCSV(statsSource);
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
        // Riferimenti stabili per il passaggio di stagione.
        future_pick_id: futurePick?.id || null,
        original_team_id: futurePick?.original?.id || null,
        owner_team_id: futurePick?.owner?.id || null,
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
          future_pick_id: fp.id || null,
          original_team_id: fp.original?.id || null,
          owner_team_id: fp.owner?.id || null,
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


/* SOLO proiezione read-only del Draft: il proprietario reale resta in Supabase
   fino al verdetto ufficiale della condizione. */
async function projectConditionalDraftRights(draft, futurePicks, statsRows=[]) {
  const [rightsResult,offersResult,locksResult,teamsResult]=await Promise.all([
    supabase.from("conditional_trade_rights").select("*").in("status",["active","resolved"]).limit(500),
    supabase.from("conditional_trade_offers").select("*").eq("status","accepted").limit(500),
    supabase.from("conditional_trade_candidates").select("right_id,pick_id,is_locked").eq("is_locked",true),
    supabase.from("teams").select("id,name,conference")
  ]);
  for(const response of [rightsResult,offersResult,locksResult,teamsResult])
    if(response.error)throw response.error;
  const [standingsResult,trophyResult]=await Promise.all([
    supabase.from("conditional_official_standings").select("*").eq("is_final",true)
      .then(x=>x,()=>({data:[]})),
    supabase.from("conditional_official_trophies").select("*")
      .then(x=>x,()=>({data:[]}))
  ]);
  const standings=standingsResult.data||[],trophies=trophyResult.data||[];
  const rights=rightsResult.data||[],offers=offersResult.data||[],
    locks=locksResult.data||[],teams=teamsResult.data||[];
  const teamsById=new Map(teams.map(t=>[String(t.id),t]));
  const futureById=new Map(futurePicks.map(p=>[String(p.id),p]));
  const entries=[],projectedIds=new Set();
  for(const right of rights) {
    const sourceOffer=offers.find(o=>String(o.id)===String(right.source_offer_id));
    if(!sourceOffer)continue;
    const draftName=right.draft_name||futureById.get(String(sourceOffer.counter_pick_id))?.draft_name;
    const candidates=locks.filter(c=>c.is_locked&&String(c.right_id)===String(right.id))
      .map(c=>futureById.get(String(c.pick_id))).filter(Boolean);
    const item={right,offer:sourceOffer,candidates,chosen:null,pickNumber:null,
      draftName,status:right.status==="resolved"?"final":"pending"};
    entries.push(item);
    if(right.status!=="active")continue;
    // Nessuna scelta se i vincoli sono incompleti: non inventare una vincitrice.
    if(candidates.length!==(sourceOffer.candidate_pick_ids||[]).length||!candidates.length)continue;
    const draftRows=draftName==="Draft Conference"?draft.league:
      draftName==="Draft Championship"?draft.championship:null;
    if(!draftRows)continue;
    const ranking=candidates.map(p=>{
      const row=draftRows.find(r=>Number(r.Round)===Number(p.round));
      const cell=row?.Picks.find(x=>String(x.future_pick_id)===String(p.id)&&!x.bonus);
      return {future:p,cell,number:Number(cell?.pickNumber)};
    });
    if(ranking.some(x=>!x.cell||!Number.isInteger(x.number)||x.number<=0))continue;
    const rule=right.rule_spec||{};
    let selected=null;
    if(right.rule_kind==="ranked"){
      if(ranking.length<2)continue;
      ranking.sort((x,y)=>x.number-y.number);
      selected=rule.which==="best"?ranking[0]:
        rule.which==="worst"?ranking[ranking.length-1]:null;
    }else if(right.rule_kind==="standing"){
      const subject=teamsById.get(String(rule.subject_team_id));
      if(!subject)continue;
      const scope=rule.scope;
      const cohort=scope==="round_robin"?teams:
        teams.filter(t=>t.conference===subject.conference);
      const final=standings.find(x=>x.is_final&&Number(x.season)===Number(right.season)
        &&x.scope===scope&&String(x.team_id)===String(subject.id));
      let place=Number(final?.position);
      if(!final){
        const rows=(statsRows||[]).filter(r=>r.Phase==="Regular"&&
          (scope==="round_robin"?r.Conference==="Unificata":
            r.Conference!=="Unificata"&&cohort.some(t=>teamKey(t.name)===teamKey(r.Team))));
        if(!rows.length)continue;
        const ranked=buildTotalRankingFromStats(rows);
        const index=ranked.findIndex(x=>teamKey(x.squadra)===teamKey(subject.name));
        if(index<0)continue;
        place=index+1;
      }
      const top=Number(rule.top_count),bottom=Number(rule.bottom_count);
      const selectedId=place<=top?rule.top_pick_id:
        place>cohort.length-bottom?rule.bottom_pick_id:rule.middle_pick_id;
      selected=ranking.find(x=>String(x.future.id)===String(selectedId));
    }else if(right.rule_kind==="trophy"){
      const relevant=trophies.filter(x=>Number(x.season)===Number(right.season));
      let won=null;
      if(rule.mode==="specific_trophy"){
        const trophy=relevant.find(x=>x.competition_id===rule.competition_id);
        if(trophy?.status==="final")won=String(trophy.winner_team_id)===String(rule.subject_team_id);
      }else if(rule.mode==="any_trophy"){
        const choices=rule.eligible_competition_ids||[];
        const final=relevant.filter(x=>choices.includes(x.competition_id)&&x.status==="final");
        if(final.some(x=>String(x.winner_team_id)===String(rule.subject_team_id)))won=true;
        else if(choices.length&&final.length===choices.length)won=false;
      }
      if(won!==null){
        const selectedId=won?rule.won_pick_id:rule.not_won_pick_id;
        selected=ranking.find(x=>String(x.future.id)===String(selectedId));
      }
    }
    const holder=teamsById.get(String(right.holder_team_id));
    if(!selected||!holder||projectedIds.has(String(selected.future.id)))continue;
    projectedIds.add(String(selected.future.id));
    item.chosen=selected.future;
    item.pickNumber=selected.number;
    item.status="provisional";
    // SOLO modello in RAM, pick reali e vincoli in database non cambiano.
    // La pick resta nello slot originale del Draft, anche se il logo
    // proiettato può appartenere a un'altra franchigia.
    selected.cell.conditionalProjection={
      rightId:right.id,holderTeam:holder.name,sourceTeam:selected.cell.originalTeam
    };
    selected.cell.source_trade_id=selected.cell.source_trade_id||"conditional:"+right.id;
  }
  return {entries,offers,rights,teamsById,futureById};
}
function conditionalPickText(p, teamsById) {
  const original=p?.original?.name||
    teamsById?.get(String(p?.original_team_id))?.name||"franchigia";
  return p?"R"+p.round+" "+p.season+" ("+original+")":"pick futura";
}
function conditionalOfferSummary(o,right,futureById,teamsById) {
  if(!o)return "Diritto condizionato";
  const r=right?.rule_spec||o.rule_spec||{};
  const ids=(o.candidate_pick_ids||[]).map(id=>futureById.get(String(id))).filter(Boolean);
  if((right?.rule_kind||o.rule_kind)==="ranked")
    return "La "+(r.which==="worst"?"peggiore":"migliore")+" tra "+
      ids.map(p=>conditionalPickText(p,teamsById)).join(", ");
  if((right?.rule_kind||o.rule_kind)==="standing")
    return "Condizione sulla classifica: la pick si determinerà a fine stagione";
  if((right?.rule_kind||o.rule_kind)==="trophy")
    return "Condizione legata alla conquista del trofeo";
  return "Rivendita di un diritto condizionato";
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

  registerDynamicDraftTradePalettes(draftData);

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
        conditionalProjection: p.conditionalProjection || null,
        protection_note: p.protection_note,
        notes: p.notes
      });
    });
  });

  const maxPicksByRound={};
  for(let r=1;r<=maxRounds;r++)
    maxPicksByRound[r]=Math.max(1,...squadre.map(team=>(draftPerSquadra[team]?.[r]||[]).length));
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
      const capacity=maxPicksByRound[r];
      html += `<div class="draft-round-slot" data-count="${capacity}" style="min-height:${46*capacity+7*(capacity-1)}px">`;
      if(!picksInRound.length){
        html += '<div class="pick pick-empty" aria-hidden="true"></div></div>';
        continue;
      }
      picksInRound.forEach(pick => {
        const tradedClass = (pick.traded || pick.conditionalProjection) ? "pick-traded" : "";
        const bonusClass = pick.bonus ? "pick-bonus" : "";
        const projectedClass = pick.conditionalProjection ? "is-conditional-projected" : "";
        const source = pick.conditionalProjection
          ? `<span class="pick-source ct-draft-projected-owner">🔐 ${escapeDraftHtml(shortDesktopTeamName(pick.conditionalProjection.holderTeam))} (provv.)</span>`
          : (pick.traded || pick.bonus)
            ? `<span class="pick-source">da ${shortDesktopTeamName(pick.originalTeam)}</span>`
            : "";

        const title = pick.conditionalProjection ? `Proiezione condizionata: ${pick.conditionalProjection.holderTeam} se finisse oggi; pick originale di ${pick.originalTeam}. NON definitiva.` : pick.traded
          ? `Round visualizzato ${pick.displayRound}. Round originale ${pick.round}. Pick originale di ${pick.originalTeam}. ${pick.notes || ""} ${pick.protection_note || ""}`.trim()
          : `Round ${pick.displayRound}`;

const tradeKey = (pick.traded || pick.conditionalProjection)
  ? getDynamicTradeKeyForPick({
      source_trade_id: pick.source_trade_id,
      originalTeam: pick.originalTeam,
      team: squadra,
      ownerTeam: squadra
    })
  : "";

const tradeType = (pick.traded || pick.conditionalProjection)
  ? getDynamicDesktopTradeType(
      pick.originalTeam,
      squadra
    )
  : "";

const tradeTypeClass = tradeType
  ? `trade-${tradeType}`
  : "";

const tradeKeyAttribute = tradeKey
  ? `data-dynamic-trade-key="${escapeDraftHtml(tradeKey)}"`
  : "";

 html += `
  <div
    class="pick ${tradedClass} ${bonusClass} ${tradeTypeClass} ${projectedClass}"
    ${tradeKeyAttribute}
    title="${escapeDraftHtml(title)}"
  >
            <span class="pick-bubble">${pick.pickNumber}</span>
            <strong>Pick #${pick.pickNumber}</strong>
            ${source}
          </div>`;
      });
      html += "</div>";
    }

    html += `</div></article>`;
  });

  html += '</div>';
  container.innerHTML = html;
  bindDynamicDesktopTradeClicks(container);
}


function renderRounds(draftContainerId,roundsColId){
  const container=document.getElementById(draftContainerId);
  const roundsCol=document.getElementById(roundsColId);
  if(!container||!roundsCol)return;
  const slots=container.querySelectorAll(".draft-card:first-child .draft-round-slot");
  roundsCol.innerHTML='<div class="rounds-spacer"></div>';
  slots.forEach((slot,index)=>{
    const row=document.createElement("div");
    row.className="round";
    row.textContent="R"+(index+1);
    row.style.height=slot.style.minHeight;
    row.style.minHeight=slot.style.minHeight;
    roundsCol.appendChild(row);
  });
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
        source_trade_id: p.source_trade_id || null,
        conditionalProjection: p.conditionalProjection || null,
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


function renderMobileRoundPick(pick,ownerTeam) {
  const original=pick.originalTeam||ownerTeam;
  const traded=!!(pick.traded||pick.conditionalProjection),bonus=!!pick.bonus;
  const key=traded?getDynamicTradeKeyForPick({...pick,team:ownerTeam,ownerTeam}):"";
  const palette=traded?registerDynamicTradePalette(key):null;
  const style=palette?[
    `--dynamic-trade-color:${palette.solid}`,
    `--dynamic-trade-soft:${palette.soft}`,
    `--dynamic-trade-text:${palette.text}`
  ].join(";"):"";
  const note=pick.conditionalProjection?" · PROIEZIONE, non definitiva":"";
  const title="Pick #"+pick.pickNumber+" · "+ownerTeam+" · da "+original+note;
  return `<div class="dynamic-mobile-overview-slot ${traded?"is-traded":""}
    ${bonus?"is-bonus":""} ${pick.conditionalProjection?"is-conditional-projected":""}"
    style="${style}" title="${escapeDraftHtml(title)}"
    aria-label="${escapeDraftHtml(title)}">
    <img src="img/${escapeDraftHtml(ownerTeam)}.webp" alt="" loading="lazy"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
    <span class="dynamic-mobile-overview-fallback">${escapeDraftHtml(getDynamicMobileInitials(ownerTeam))}</span>
    <em aria-hidden="true">#${pick.pickNumber}</em>
    ${pick.conditionalProjection?'<i class="ct-projected-pin" aria-hidden="true">🔐</i>':
      bonus?'<i class="bonus" aria-hidden="true">★</i>':
      traded?'<i class="trade" aria-hidden="true">↔</i>':""}
  </div>`;
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
const fixedTeamOrder = squadre.slice();

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
      // Una franchigia può avere più scelte nello stesso round. Non nascondere
      // la pick condizionata (né la pick originale) dietro la prima card.
      if(picksInRound.length>1) {
        return '<div class="dynamic-mobile-overview-stack">'+
          picksInRound.map(p=>renderMobileRoundPick(p,p.conditionalProjection?.holderTeam||squadra)).join("")+
          '</div>';
      }

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

      const ownerTeam = pick.conditionalProjection?.holderTeam || pick.ownerTeam || squadra;
      const originalTeam = pick.originalTeam || ownerTeam;
      const isTraded = !!(pick.traded || pick.conditionalProjection);
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
        isBonus ? "is-bonus" : "",
        pick.conditionalProjection ? "is-conditional-projected" : ""
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
      if(pick.conditionalProjection)titleParts.push("Proiezione condizionata, non definitiva");

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
            pick.conditionalProjection
              ? `<i class="ct-projected-pin" aria-hidden="true">🔐</i>`
              : isBonus
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

async function loadDraftTradeSummary(context={}) {
  const containers=[
    document.getElementById("draft-trades-league"),
    document.getElementById("draft-trades-championship")
  ];
  containers.forEach(c=>{if(c)c.innerHTML='<div class="draft-trades-loading">Caricamento trade draft...</div>';});
  try {
    const [teamResult, proposalResult]=await Promise.all([
      supabase.from("teams").select("id,name,conference"),
      supabase.from("trade_proposals").select("*").eq("status","accepted")
        .order("accepted_at",{ascending:false})
    ]);
    if(teamResult.error||proposalResult.error)throw teamResult.error||proposalResult.error;
    const teamsById=new Map((teamResult.data||[]).map(t=>[String(t.id),t]));
    const proposals=proposalResult.data||[];
    const proposalIds=proposals.map(p=>p.id);
    const assetsResult=proposalIds.length
      ?await supabase.from("trade_assets").select("*").in("proposal_id",proposalIds)
      :{data:[],error:null};
    if(assetsResult.error)throw assetsResult.error;
    const assets=assetsResult.data||[];
    const futurePickAssetIds=[...new Set(assets.filter(x=>x.asset_type==="future_pick")
      .map(x=>String(x.asset_id)).filter(Boolean))];
    const futureResult=futurePickAssetIds.length
      ?await supabase.from("future_draft_picks")
        .select("id,season,draft_name,round,pick_kind,status")
        .eq("season",FUTURE_PICK_SEASON).in("id",futurePickAssetIds)
      :{data:[],error:null};
    if(futureResult.error)throw futureResult.error;
    const validFuturePickIds=new Set((futureResult.data||[]).map(x=>String(x.id)));
    const offers=context.offers||[];
    const linkedLegacyIds=new Set(offers.map(o=>String(o.mixed_legacy_trade_id||"")).filter(Boolean));
    // Gli scambi misti hanno già una rappresentazione completa nella trade
    // condizionata; non mostrare una seconda card per la gamba classica.
    const regularTrades=proposals.filter(p=>!linkedLegacyIds.has(String(p.id)))
      .map(proposal=>{
        const tradeAssets=assets.filter(x=>x.proposal_id===proposal.id);
        const futureAssets=tradeAssets.filter(x=>x.asset_type==="future_pick"&&
          validFuturePickIds.has(String(x.asset_id)));
        if(!futureAssets.length)return null;
        const fromTeam=teamsById.get(String(proposal.from_team));
        const toTeam=teamsById.get(String(proposal.to_team));
        if(!fromTeam||!toTeam)return null;
        const involvedDraftNames=new Set(futureAssets.map(x=>
          (futureResult.data||[]).find(p=>String(p.id)===String(x.asset_id))?.draft_name
        ).filter(Boolean));
        return {proposal,assets:tradeAssets,futureAssets,fromTeam,toTeam,
          type:getDraftTradeType(fromTeam,toTeam),involvedDraftNames,
          date:proposal.accepted_at||proposal.created_at};
      }).filter(Boolean);
    const rights=context.rights||[];
    const futureById=context.futureById||new Map();
    const entries=context.entries||[];
    const conditionalTrades=offers.map(offer=>{
      const fromTeam=teamsById.get(String(offer.from_team_id));
      const toTeam=teamsById.get(String(offer.to_team_id));
      if(!fromTeam||!toTeam)return null;
      const right=rights.find(r=>String(r.source_offer_id)===String(offer.id)||
        (offer.rule_kind==="right_transfer"&&String(r.id)===String(offer.existing_right_id)));
      const projections=entries.find(e=>String(e.right?.id)===String(right?.id));
      const candidatePicks=(offer.candidate_pick_ids||[]).map(id=>futureById.get(String(id))).filter(Boolean);
      const counterPick=futureById.get(String(offer.counter_pick_id));
      const draftName=right?.draft_name||counterPick?.draft_name||candidatePicks[0]?.draft_name;
      if(!draftName||(!candidatePicks.some(p=>Number(p.season)===FUTURE_PICK_SEASON)&&
        Number(counterPick?.season)!==FUTURE_PICK_SEASON))return null;
      return {
        proposal:{id:offer.id,accepted_at:offer.accepted_at,created_at:offer.created_at},
        assets:assets.filter(x=>String(x.proposal_id)===String(offer.mixed_legacy_trade_id)),
        fromTeam,toTeam,type:getDraftTradeType(fromTeam,toTeam),
        involvedDraftNames:new Set([draftName]),
        date:offer.accepted_at||offer.created_at,
        conditional:{offer,right,projection:projections,candidatePicks,counterPick,
          futureById,teamsById}
      };
    }).filter(Boolean);
    const allTrades=[...regularTrades,...conditionalTrades]
      .sort((x,y)=>Date.parse(y.date||0)-Date.parse(x.date||0));
    const byConference=(name)=>allTrades.filter(t=>
      t.involvedDraftNames.has(name)||
      t.fromTeam.conference===(name==="Draft Conference"?"Conference League":"Conference Championship")||
      t.toTeam.conference===(name==="Draft Conference"?"Conference League":"Conference Championship")||
      t.type==="interconference"
    );
    renderDraftTrades(byConference("Draft Conference"),"draft-trades-league","Conference League");
    renderDraftTrades(byConference("Draft Championship"),"draft-trades-championship","Conference Championship");
  }catch(err){
    console.error("Trade Draft: caricamento non riuscito",err);
    renderDraftTradeError();
  }
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

  details.forEach(detail => {
    detail.innerHTML = detailMarkup;
  });
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
  const palette=registerDynamicTradePalette(trade?.proposal?.id||"")||
    getDynamicTradePaletteByIndex(0);
  const tradeStyle=[
    `--dynamic-trade-color:${palette.solid}`,
    `--dynamic-trade-soft:${palette.soft}`,
    `--dynamic-trade-text:${palette.text}`
  ].join(";");
  const fromAssets=trade.assets.filter(x=>x.side==="from").slice();
  const toAssets=trade.assets.filter(x=>x.side==="to").slice();
  const fromName=trade.fromTeam?.name||"Squadra",toName=trade.toTeam?.name||"Squadra";
  const conditional=trade.conditional;
  let conditionalHtml="";
  if(conditional){
    const {offer,right,projection,counterPick,futureById,teamsById}=conditional;
    const grantorFrom=String(offer.grantor_team_id)===String(trade.fromTeam?.id);
    const giving=grantorFrom?fromAssets:toAssets;
    const paying=grantorFrom?toAssets:fromAssets;
    const holderName=teamsById.get(String(right?.holder_team_id||offer.holder_team_id))?.name||"Franchigia";
    giving.push({asset_type:"future_pick",asset_label:"🔐 Diritto condizionato sulla scelta futura"});
    if(counterPick)paying.push({asset_type:"future_pick",
      asset_label:"🎯 "+conditionalPickText(counterPick,teamsById)});
    const clause=conditionalOfferSummary(offer,right,futureById,teamsById);
    const finalPick=right?.status==="resolved"?
      futureById.get(String(right.resolved_pick_id)):null;
    const result=finalPick
      ?"✅ Esito definitivo: "+conditionalPickText(finalPick,teamsById)+" assegnata a "+holderName
      :projection?.status==="provisional"&&projection.chosen
        ?"Se finisse oggi: Pick #"+projection.pickNumber+" · "+
          conditionalPickText(projection.chosen,teamsById)+" → "+holderName
        :"Scelta ancora da determinare · candidate vincolate";
    conditionalHtml=`
      <div class="draft-trade-conditional-box">
        <strong>🔐 Trade con pick condizionata</strong>
        <p>${escapeDraftHtml(clause)}</p>
        <div class="draft-trade-conditional-result">${escapeDraftHtml(result)}</div>
        <small>${finalPick?"Assegnazione ufficiale":"Proiezione non definitiva. La pick reale rimane vincolata fino al verdetto."}</small>
      </div>`;
  }
  return `
    <article class="draft-trade-card ${escapeDraftHtml(trade.type)} is-color-coded ${conditional?"is-conditional-trade":""}"
      style="${tradeStyle}">
      <div class="draft-trade-top">
        <span class="draft-trade-dot"></span>
        <div class="draft-trade-title">
          <strong>${escapeDraftHtml(shortTeamName(fromName))} ↔ ${escapeDraftHtml(shortTeamName(toName))}</strong>
          <small>${escapeDraftHtml(getDraftTradeTypeLabel(trade.type))}${conditional?" · 🔐 Clausola":""}</small>
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
      ${conditionalHtml}
    </article>`;
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


const DRAFT_BY_PICK_PAGE_SIZE = 24;

function renderDraftByPickDetail(container, pickIndex) {
  const picks = container?.__draftByPickPicks || [];
  const pick = picks[Number(pickIndex)];
  const details = [...(container?.querySelectorAll(".draft-pick-board-detail") || [])];

  if (!pick || !details.length) return;

  const ownerTeam = cleanTeamName(pick.conditionalProjection?.holderTeam || pick.team || pick.ownerTeam || "Squadra");
  const originalTeam = cleanTeamName(pick.originalTeam || ownerTeam);
  const isTraded = !!(pick.traded || pick.conditionalProjection);
  const isBonus = !!pick.bonus;
  const round = Number(pick.round || 0);
  const pickNumber = Number(pick.pickNumber || 0);

  const tradeKey = isTraded
    ? getDynamicTradeKeyForPick({ ...pick, team: ownerTeam, ownerTeam })
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

  let originText = pick.conditionalProjection
    ? "🔐 Proiezione condizionata da "+shortDesktopTeamName(originalTeam)+" (non definitiva)"
    : "Pick originale della squadra";
  if (pick.conditionalProjection) {
    // La proiezione prevale sulla dicitura di trade ufficiale.
  } else if (isBonus) {
    originText = `Pick bonus proveniente da ${shortDesktopTeamName(originalTeam)}`;
  } else if (isTraded) {
    originText = `Pick ricevuta da ${shortDesktopTeamName(originalTeam)}`;
  }

  const detailMarkup = `
    <div class="draft-pick-board-detail-copy" style="${tradeStyle}">
      <span class="draft-pick-board-detail-kicker">Pick #${pickNumber} · Round ${round}</span>

      <div class="draft-pick-board-detail-main">
        <span class="draft-pick-board-detail-logo">
          <img
            src="img/${escapeDraftHtml(ownerTeam)}.webp"
            alt="${escapeDraftHtml(ownerTeam)}"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          >
          <span>${escapeDraftHtml(getDynamicMobileInitials(ownerTeam))}</span>
        </span>

        <span class="draft-pick-board-detail-team">
          <strong>${escapeDraftHtml(ownerTeam)}</strong>
          <small>${escapeDraftHtml(originText)}</small>
        </span>

        <span class="draft-pick-board-detail-badges">
          <span class="draft-pick-board-detail-badge">R${round}</span>
          ${
            isBonus
              ? `<span class="draft-pick-board-detail-badge bonus">★ Bonus</span>`
              : isTraded
                ? `<span class="draft-pick-board-detail-badge trade">↔ Trade</span>`
                : `<span class="draft-pick-board-detail-badge original">Originale</span>`
          }
        </span>
      </div>
    </div>
  `;

  details.forEach(detail => {
    detail.innerHTML = detailMarkup;
  });
}

function selectDraftByPickCell(container, cell) {
  if (!container || !cell) return;

  container
    .querySelectorAll(".draft-pick-board-cell.is-selected")
    .forEach(el => el.classList.remove("is-selected"));

  cell.classList.add("is-selected");
  renderDraftByPickDetail(container, cell.dataset.pickIndex);
}

function bindDraftByPickBoard(container) {
  if (!container || container.dataset.draftPickBoardBound === "1") return;

  container.addEventListener("click", event => {
    const pickCell = event.target.closest(".draft-pick-board-cell");
    if (pickCell && container.contains(pickCell)) {
      selectDraftByPickCell(container, pickCell);
    }
  });

  container.dataset.draftPickBoardBound = "1";
}

function generaDraftByPick(containerId, draftData, conferenceTitle) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!draftData || !draftData.length) {
    container.innerHTML = `<p class="draft-error">⚠️ Nessun dato disponibile</p>`;
    return;
  }

  registerDynamicDraftTradePalettes(draftData);

  const picks = draftData
    .flatMap(round =>
      (round.Picks || []).map(pick => ({
        ...pick,
        round: Number(pick.round || round.Round || 0)
      }))
    )
    .sort((a, b) => Number(a.pickNumber || 0) - Number(b.pickNumber || 0));

  container.__draftByPickPicks = picks;

  const desktopCellsHtml = picks.map((pick, absoluteIndex) => {
    const ownerTeam = cleanTeamName(pick.conditionalProjection?.holderTeam || pick.team || pick.ownerTeam || "Squadra");
    const originalTeam = cleanTeamName(pick.originalTeam || ownerTeam);
    const isTraded = !!(pick.traded || pick.conditionalProjection);
    const isBonus = !!pick.bonus;
    const round = Number(pick.round || 0);
    const pickNumber = Number(pick.pickNumber || 0);

    const tradeKey = isTraded
      ? getDynamicTradeKeyForPick({ ...pick, team: ownerTeam, ownerTeam })
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
      "draft-pick-board-cell",
      isTraded ? "is-traded" : "",
      isBonus ? "is-bonus" : "",
      pick.conditionalProjection ? "is-conditional-projected" : "",
      absoluteIndex === 0 ? "is-selected" : ""
    ].filter(Boolean).join(" ");

    const ariaText = isBonus
      ? `Pick ${pickNumber}, ${ownerTeam}, round ${round}, bonus da ${originalTeam}`
      : isTraded
        ? `Pick ${pickNumber}, ${ownerTeam}, round ${round}, da ${originalTeam}`
        : `Pick ${pickNumber}, ${ownerTeam}, round ${round}, originale`;

    return `
      <button
        type="button"
        class="${classes} draft-pick-board-desktop-cell"
        style="${tradeStyle}"
        data-pick-index="${absoluteIndex}"
        aria-label="${escapeDraftHtml(ariaText)}"
      >
        <span class="draft-pick-board-number">#${pickNumber}</span>

        <span class="draft-pick-board-logo">
          <img
            src="img/${escapeDraftHtml(ownerTeam)}.webp"
            alt=""
            loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          >
          <span>${escapeDraftHtml(getDynamicMobileInitials(ownerTeam))}</span>
        </span>
      </button>
    `;
  }).join("");

  const mobileRowsHtml = Array.from(
    { length: Math.ceil(picks.length / 8) },
    (_, rowIndex) => {
      const rowPicks = picks.slice(rowIndex * 8, rowIndex * 8 + 8);

      const slotsHtml = rowPicks.map((pick, localIndex) => {
        const absoluteIndex = rowIndex * 8 + localIndex;
        const ownerTeam = cleanTeamName(pick.conditionalProjection?.holderTeam || pick.team || pick.ownerTeam || "Squadra");
        const originalTeam = cleanTeamName(pick.originalTeam || ownerTeam);
        const isTraded = !!(pick.traded || pick.conditionalProjection);
        const isBonus = !!pick.bonus;
        const round = Number(pick.round || 0);
        const pickNumber = Number(pick.pickNumber || 0);

        const tradeKey = isTraded
          ? getDynamicTradeKeyForPick({ ...pick, team: ownerTeam, ownerTeam })
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
          "draft-pick-board-cell",
          "dynamic-mobile-overview-slot",
          "dynamic-mobile-pick-slot",
          isTraded ? "is-traded" : "",
          isBonus ? "is-bonus" : "",
          pick.conditionalProjection ? "is-conditional-projected" : "",
          absoluteIndex === 0 ? "is-selected" : ""
        ].filter(Boolean).join(" ");

        const ariaText = isBonus
          ? `Pick ${pickNumber}, ${ownerTeam}, round ${round}, bonus da ${originalTeam}`
          : isTraded
            ? `Pick ${pickNumber}, ${ownerTeam}, round ${round}, da ${originalTeam}`
            : `Pick ${pickNumber}, ${ownerTeam}, round ${round}, originale`;

        return `
          <button
            type="button"
            class="${classes}"
            style="${tradeStyle}"
            data-pick-index="${absoluteIndex}"
            aria-label="${escapeDraftHtml(ariaText)}"
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
            <em aria-hidden="true">#${pickNumber}</em>
            ${
              isBonus
                ? `<i class="bonus" aria-hidden="true">★</i>`
                : isTraded
                  ? `<i class="trade" aria-hidden="true">↔</i>`
                  : ""
            }
          </button>
        `;
      }).join("");

      return `
        <div class="dynamic-mobile-overview-round dynamic-mobile-pick-row">
          <div class="dynamic-mobile-overview-slots">
            ${slotsHtml}
          </div>
        </div>
      `;
    }
  ).join("");

  container.innerHTML = `
    <section class="draft-pick-sequence-card draft-pick-board-card draft-pick-board-desktop-wrap" aria-label="Draft ${escapeDraftHtml(conferenceTitle)} ordinato per pick">
      <header class="draft-pick-sequence-head draft-pick-board-head">
        <span>
          <strong>Draft Board</strong>
          <small>${escapeDraftHtml(conferenceTitle)} · ordine assoluto delle chiamate</small>
        </span>
        <span class="draft-pick-sequence-count">${picks.length}</span>
      </header>

      <div class="draft-pick-board-grid draft-pick-board-grid-all">
        ${desktopCellsHtml}
      </div>

      <div class="draft-pick-board-detail" aria-live="polite"></div>

      <div class="draft-pick-board-legend" aria-label="Legenda">
        <span><i class="original"></i>Originale</span>
        <span><i class="trade">↔</i>Trade</span>
        <span><i class="bonus">★</i>Bonus</span>
      </div>
    </section>

    <section class="dynamic-mobile-overview-card draft-pick-mobile-card draft-pick-board-mobile-wrap" aria-label="Draft ${escapeDraftHtml(conferenceTitle)} ordinato per pick mobile">
      <header class="dynamic-mobile-overview-header">
        <span class="dynamic-mobile-overview-icon" aria-hidden="true">
          <img src="img/badges/draft.webp" alt="">
        </span>

        <span class="dynamic-mobile-overview-heading">
          <strong>Draft Board</strong>
          <small>${escapeDraftHtml(conferenceTitle)} · solo pick e loghi</small>
        </span>

        <span class="dynamic-mobile-overview-total">
          ${picks.length}
        </span>
      </header>

      <div class="dynamic-mobile-overview-legend" aria-label="Legenda">
        <span><i class="normal"></i>Originale</span>
        <span><i class="trade">↔</i>Trade</span>
        <span><i class="bonus">★</i>Bonus</span>
      </div>

      <div class="dynamic-mobile-overview-rounds dynamic-mobile-pick-rows">
        ${mobileRowsHtml}
      </div>

      <div class="draft-pick-board-detail draft-pick-board-detail-mobile" aria-live="polite"></div>
    </section>
  `;

  bindDraftByPickBoard(container);
  renderDraftByPickDetail(container, 0);
}


function generaDraftByTeam(containerId, draftData, squadreOrdine, conferenceTitle) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!draftData || !draftData.length) {
    container.innerHTML = `<p class="draft-error">⚠️ Nessun dato disponibile</p>`;
    return;
  }

  registerDynamicDraftTradePalettes(draftData);

  const teams = (squadreOrdine || [])
    .map(team => cleanTeamName(team))
    .filter(Boolean);

  const picks = draftData.flatMap(round =>
    (round.Picks || []).map(pick => ({
      ...pick,
      round: Number(pick.round || round.Round || 0),
      displayRound: Number(pick.displayRound || pick.round || round.Round || 0)
    }))
  );

  const optionsHtml = teams.map(team => `
    <option value="${escapeDraftHtml(team)}">${escapeDraftHtml(team)}</option>
  `).join("");

  container.innerHTML = `
    <section class="draft-team-panel" aria-label="Draft ${escapeDraftHtml(conferenceTitle)} per squadra">
      <div class="draft-team-selector-card">
        <div class="draft-team-selector-copy">
          <span class="draft-team-kicker">Vista per squadra</span>
          <strong>Scegli una franchigia</strong>
          <small>Visualizza tutte le chiamate possedute nel Draft 2027-28.</small>
        </div>

        <label class="draft-team-select-wrap">
          <span>Squadra</span>
          <select class="draft-team-select" aria-label="Scegli squadra">
            <option value="">Seleziona una squadra...</option>
            ${optionsHtml}
          </select>
        </label>
      </div>

      <div class="draft-team-result">
        <div class="draft-team-empty">
          <span class="draft-team-empty-icon">⌄</span>
          <strong>Nessuna squadra selezionata</strong>
          <small>Scegli una squadra dal menu per vedere tutte le sue chiamate.</small>
        </div>
      </div>
    </section>
  `;

  const select = container.querySelector(".draft-team-select");
  const result = container.querySelector(".draft-team-result");

  select?.addEventListener("change", () => {
    const selectedTeam = cleanTeamName(select.value);

    if (!selectedTeam) {
      result.innerHTML = `
        <div class="draft-team-empty">
          <span class="draft-team-empty-icon">⌄</span>
          <strong>Nessuna squadra selezionata</strong>
          <small>Scegli una squadra dal menu per vedere tutte le sue chiamate.</small>
        </div>
      `;
      return;
    }

    const teamPicks = picks
      .filter(pick => teamKey(pick.conditionalProjection?.holderTeam || pick.team || pick.ownerTeam || "") === teamKey(selectedTeam))
      .sort((a, b) => Number(a.pickNumber || 0) - Number(b.pickNumber || 0));

    const rowsHtml = teamPicks.map(pick => {
      const originalTeam = cleanTeamName(pick.originalTeam || selectedTeam);
      const isTraded = !!(pick.traded || pick.conditionalProjection);
      const isBonus = !!pick.bonus;
      const pickNumber = Number(pick.pickNumber || 0);
      const round = Number(pick.round || 0);
      const displayRound = Number(pick.displayRound || round || 0);

      const tradeKey = isTraded
        ? getDynamicTradeKeyForPick({ ...pick, team: selectedTeam, ownerTeam: selectedTeam })
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
        "draft-team-pick",
        isTraded ? "is-traded" : "",
        isBonus ? "is-bonus" : "",
        pick.conditionalProjection ? "is-conditional-projected" : ""
      ].filter(Boolean).join(" ");

      let origin = "Pick originale";
      if (pick.conditionalProjection) origin = `🔐 Proiezione condizionata da ${shortDesktopTeamName(originalTeam)}`;
      else if (isBonus) origin = `Bonus da ${shortDesktopTeamName(originalTeam)}`;
      else if (isTraded) origin = `da ${shortDesktopTeamName(originalTeam)}`;

      return `
        <article class="${classes}" style="${tradeStyle}">
          <span class="draft-team-pick-number">#${pickNumber}</span>

          <span class="draft-team-pick-copy">
            <strong>Pick #${pickNumber}</strong>
            <small>${escapeDraftHtml(origin)}</small>
          </span>

          <span class="draft-team-pick-round">R${displayRound}</span>

          ${
            isBonus
              ? `<span class="draft-team-pick-badge bonus">★ Bonus</span>`
              : pick.conditionalProjection
                ? `<span class="draft-team-pick-badge trade">🔐 Provvisoria</span>`
              : isTraded
                ? `<span class="draft-team-pick-badge trade">↔ Trade</span>`
                : `<span class="draft-team-pick-badge original">Originale</span>`
          }
        </article>
      `;
    }).join("");

    result.innerHTML = `
      <section class="draft-team-result-card">
        <header class="draft-team-result-head">
          <span class="draft-team-result-logo">
            <img
              src="img/${escapeDraftHtml(selectedTeam)}.webp"
              alt="${escapeDraftHtml(selectedTeam)}"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
            >
            <span>${escapeDraftHtml(getDynamicMobileInitials(selectedTeam))}</span>
          </span>

          <span class="draft-team-result-title">
            <strong>${escapeDraftHtml(selectedTeam)}</strong>
            <small>${teamPicks.length} chiamate totali · ordine per numero di pick</small>
          </span>

          <span class="draft-team-result-count">${teamPicks.length}</span>
        </header>

        <div class="draft-team-picks-list">
          ${rowsHtml || `<p class="draft-error">Nessuna chiamata disponibile per questa squadra.</p>`}
        </div>
      </section>
    `;
  });
}

function setDraftOrderView(nextView) {
  const view = ["round", "pick", "team"].includes(nextView)
    ? nextView
    : "round";

  document.querySelectorAll(".draft-order-tab").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.draftOrder === view
    );
  });

  document.querySelectorAll(".draft-tab-panel").forEach(panel => {
    panel.classList.toggle("is-by-pick", view === "pick");
    panel.classList.toggle("is-by-team", view === "team");
  });
}

function initDraftOrderTabs() {
  const buttons = document.querySelectorAll(".draft-order-tab");
  if (!buttons.length) return;

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      setDraftOrderView(button.dataset.draftOrder);
    });
  });

  setDraftOrderView("round");
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
initDraftOrderTabs();

// Carica la proiezione grafica soltanto sulla pagina Draft Dinamico.
// Il Gestore stagioni usa gli stessi calcoli senza creare elementi DOM.
if (document.getElementById('draft-league') && document.getElementById('draft-championship')) {
Promise.all([
  loadResultsRows(),
  loadFutureDraftPicks()
])
.then(async ([statsRows, futurePicks]) => {
  console.log("RISULTATI DRAFT DA RESULTS-SOURCE:", statsRows);
  console.log("FUTURE PICKS DA SUPABASE:", futurePicks);

  const draft = generaDraftDaCSV(statsRows, futurePicks);
  let conditionalContext={entries:[],offers:[],rights:[],teamsById:new Map(),futureById:new Map()};
  try{
    conditionalContext=await projectConditionalDraftRights(draft,futurePicks,statsRows);
  }catch(error){console.warn("Draft: proiezione condizionata non disponibile",error);}

  generaTabellaVerticale("draft-league", draft.league, draft.leagueTeams);
  generaTabellaVerticale("draft-championship", draft.championship, draft.champTeams);

  renderRounds("draft-league", "rounds-league");
  renderRounds("draft-championship", "rounds-championship");

  generaMobileDraftCards("mobile-draft-league", draft.league, draft.leagueTeams);
  generaMobileDraftCards("mobile-draft-championship", draft.championship, draft.champTeams);

  generaDraftByPick(
    "draft-pick-sequence-league",
    draft.league,
    "Conference League"
  );
  generaDraftByPick(
    "draft-pick-sequence-championship",
    draft.championship,
    "Conference Championship"
  );

  generaDraftByTeam(
    "draft-team-view-league",
    draft.league,
    draft.leagueTeams,
    "Conference League"
  );
  generaDraftByTeam(
    "draft-team-view-championship",
    draft.championship,
    draft.champTeams,
    "Conference Championship"
  );

  loadDraftTradeSummary(conditionalContext);
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
  const byPickLeague = document.getElementById("draft-pick-sequence-league");
  const byPickChampionship = document.getElementById("draft-pick-sequence-championship");
  const byTeamLeague = document.getElementById("draft-team-view-league");
  const byTeamChampionship = document.getElementById("draft-team-view-championship");

  if (league) league.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (championship) championship.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (mobileLeague) mobileLeague.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (mobileChampionship) mobileChampionship.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (byPickLeague) byPickLeague.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (byPickChampionship) byPickChampionship.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (byTeamLeague) byTeamLeague.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (byTeamChampionship) byTeamChampionship.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento del draft futuro.</p>`;
  if (tradesLeague) tradesLeague.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento delle trade draft.</p>`;
  if (tradesChampionship) tradesChampionship.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento delle trade draft.</p>`;
  if (mobileTradesLeague) mobileTradesLeague.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento delle trade draft.</p>`;
  if (mobileTradesChampionship) mobileTradesChampionship.innerHTML = `<p class="draft-error">⚠️ Errore nel caricamento delle trade draft.</p>`;
});

}

// Public, read-only helpers shared with conditional-right projections and season manager.
export {buildTotalRankingFromStats,generaDraftDaCSV,loadFutureDraftPicks};

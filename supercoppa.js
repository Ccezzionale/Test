// supercoppa.js
// Supercoppa a 5 partecipanti con play-in, sorteggio semifinali e admin panel.

import { supabase as sb } from "./supabase-config.js";

(function () {
  var SUPERCOPPA_ID = "supercoppa-2026-27";
  var SUPERCOPPA_SEASON = "2026/27";

  var SQUADRE_SUPERCOPPA = [
    { nome: "Rubinkebab", logo: "img/Rubinkebab.png" },
    { nome: "Bayern Christiansen", logo: "img/Bayern Christiansen.png" },
    { nome: "Team Bartowski", logo: "img/Team Bartowski.png" },
    { nome: "Golden Knights", logo: "img/Golden Knights.png" },
    { nome: "Ibla", logo: "img/Ibla.png" },
    { nome: "Fantaugusta", logo: "img/Fantaugusta.png" },
    { nome: "Riverfilo", logo: "img/Riverfilo.png" },
    { nome: "Desperados", logo: "img/Desperados.png" },
    { nome: "Wildboys 78", logo: "img/wildboys78.png" },
    { nome: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.png" },
    { nome: "Pokermantra", logo: "img/PokerMantra.png" },
    { nome: "Minnesode Timberland", logo: "img/Minnesode Timberland.png" },
    { nome: "Minnesota Snakes", logo: "img/MinneSota Snakes.png" },
    { nome: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.png" },
    { nome: "FC Disoneste", logo: "img/FC Disoneste.png" },
    { nome: "Athletic Pongao", logo: "img/Athletic Pongao.png" }
  ];

  var slots = [
    { key: "leagueChampion", icon: "♛", defaultCompetition: "Lega degli Eroi", defaultQualifier: "Campione", placeholder: "Campione Lega degli Eroi" },
    { key: "crashOutChampion", icon: "🏆", defaultCompetition: "Crash Out Cup", defaultQualifier: "Vincitore", placeholder: "Rappresentante Crash Out Cup" },
    { key: "highlanderChampion", icon: "🛡️", defaultCompetition: "Highlander Cup", defaultQualifier: "Vincitore", placeholder: "Rappresentante Highlander Cup" },
    { key: "conferenceLeagueChampion", icon: "🏅", defaultCompetition: "Conference League", defaultQualifier: "Vincitore", placeholder: "Rappresentante Conference League" },
    { key: "conferenceChampionshipChampion", icon: "✦", defaultCompetition: "Conference Championship", defaultQualifier: "Vincitore", placeholder: "Rappresentante Conference Championship" }
  ];

  var defaultData = {
    teams: {
      leagueChampion: null,
      crashOutChampion: null,
      highlanderChampion: null,
      conferenceLeagueChampion: null,
      conferenceChampionshipChampion: null
    },
    competitions: {
      leagueChampion: "Lega degli Eroi",
      crashOutChampion: "Crash Out Cup",
      highlanderChampion: "Highlander Cup",
      conferenceLeagueChampion: "Conference League",
      conferenceChampionshipChampion: "Conference Championship"
    },
    qualifiers: {
      leagueChampion: "Campione",
      crashOutChampion: "Vincitore",
      highlanderChampion: "Vincitore",
      conferenceLeagueChampion: "Vincitore",
      conferenceChampionshipChampion: "Vincitore"
    },
    scores: {
      playin: ["", ""],
      sf1: ["", ""],
      sf2: ["", ""],
      final: ["", ""]
    },
    draw: {
      sf1a: "",
      sf1b: "",
      sf2a: "",
      sf2b: ""
    }
  };

var state = clone(defaultData);

document.addEventListener("DOMContentLoaded", async function () {
  setupNavbar();

  state = await loadState();

  setupAdmin();
  renderAll();
});

  function setupNavbar() {
    var hamburger = document.getElementById("hamburger");
    var mainMenu = document.getElementById("mainMenu");
    var submenuToggles = document.querySelectorAll(".toggle-submenu");

    if (hamburger && mainMenu) {
      hamburger.addEventListener("click", function () {
        mainMenu.classList.toggle("show");
      });
    }

    submenuToggles.forEach(function (toggle) {
      toggle.addEventListener("click", function (e) {
        e.preventDefault();
        var dropdown = this.closest(".dropdown");
        if (dropdown) dropdown.classList.toggle("show");
      });
    });
  }

async function loadState() {
  try {
    var response = await sb
      .from("supercoppa_settings")
      .select("data")
      .eq("id", SUPERCOPPA_ID)
      .single();

    if (response.error) {
      console.warn("Impossibile caricare la Supercoppa da Supabase:", response.error);
      return clone(defaultData);
    }

    return mergeData(
      clone(defaultData),
      response.data && response.data.data ? response.data.data : {}
    );
  } catch (err) {
    console.warn("Errore caricamento Supercoppa:", err);
    return clone(defaultData);
  }
}

async function saveState() {
  try {
    var response = await sb
      .from("supercoppa_settings")
      .upsert({
        id: SUPERCOPPA_ID,
        season: SUPERCOPPA_SEASON,
        data: state,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "id"
      });

    if (response.error) {
      console.error("Errore salvataggio Supercoppa:", response.error);
      alert("Errore nel salvataggio Supercoppa.");
    }
  } catch (err) {
    console.error("Errore salvataggio Supercoppa:", err);
    alert("Errore nel salvataggio Supercoppa.");
  }
}

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function mergeData(base, saved) {
    if (!saved) return base;
    base.teams = Object.assign(base.teams, saved.teams || {});
    base.competitions = Object.assign(base.competitions, saved.competitions || {});
    base.qualifiers = Object.assign(base.qualifiers, saved.qualifiers || {});
    base.scores = Object.assign(base.scores, saved.scores || {});
    base.draw = Object.assign(base.draw, saved.draw || {});
    return base;
  }

  function findSquadra(nome) {
    return SQUADRE_SUPERCOPPA.find(function (squadra) {
      return squadra.nome === nome;
    }) || null;
  }

  function getSlot(key) {
    return slots.find(function (slot) { return slot.key === key; }) || null;
  }

  function getTeam(key) {
    var slot = getSlot(key);
    var selectedName = state.teams[key];
    var squadra = selectedName ? findSquadra(selectedName) : null;
    var qualifier = getQualifier(key);
    var competition = getCompetition(key);

    return {
      key: key,
      name: squadra ? squadra.nome : (slot ? slot.placeholder : "Da definire"),
      logo: squadra ? squadra.logo : "",
      competition: competition,
      qualifier: qualifier,
      role: qualifier + " · " + competition,
      icon: slot ? slot.icon : "?",
      isPlaceholder: !squadra
    };
  }

  function getCompetition(key) {
    var slot = getSlot(key);
    var value = state.competitions && state.competitions[key] ? state.competitions[key] : "";
    return value || (slot ? slot.defaultCompetition : "Da definire");
  }

  function getQualifier(key) {
    var slot = getSlot(key);
    var value = state.qualifiers && state.qualifiers[key] ? state.qualifiers[key] : "";
    return value || (slot ? slot.defaultQualifier : "Rappresentante");
  }

  function scoreValue(matchKey, index) {
    var scores = state.scores[matchKey] || ["", ""];
    var value = scores[index];
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function getWinnerFromTeams(matchKey, teamA, teamB) {
    var rawA = scoreValue(matchKey, 0);
    var rawB = scoreValue(matchKey, 1);
    if (rawA === "" || rawB === "") return null;

    var a = Number(rawA);
    var b = Number(rawB);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    if (a === b) return "tie";
    return a > b ? teamA : teamB;
  }

  function getPlayinTeams() {
    return [getTeam("conferenceLeagueChampion"), getTeam("conferenceChampionshipChampion")];
  }

  function getPlayinWinner() {
    var teams = getPlayinTeams();
    return getWinnerFromTeams("playin", teams[0], teams[1]);
  }

  function getDrawCandidates() {
    var playinWinner = getPlayinWinner();
    var playinCandidate = playinWinner && playinWinner !== "tie"
      ? Object.assign({}, playinWinner, { key: "playinWinner", competition: "Play-in Conference", qualifier: "Vincente", role: "Vincente · Play-in Conference" })
      : { key: "playinWinner", name: "Vincente Play-in", logo: "", competition: "Play-in Conference", qualifier: "Vincente", role: "Vincente · Play-in Conference", icon: "?", isPlaceholder: true };

    return [
      getTeam("leagueChampion"),
      getTeam("crashOutChampion"),
      getTeam("highlanderChampion"),
      playinCandidate
    ];
  }

  function getCandidateByKey(key) {
    return getDrawCandidates().find(function (candidate) {
      return candidate.key === key;
    }) || null;
  }

  function getSemiTeam(slotKey) {
    var key = state.draw[slotKey];
    if (!key) return null;
    return getCandidateByKey(key);
  }

  function getSemiWinner(matchKey) {
    var a = getSemiTeam(matchKey + "a");
    var b = getSemiTeam(matchKey + "b");
    if (!a || !b) return null;
    return getWinnerFromTeams(matchKey, a, b);
  }

  function getFinalTeams() {
    var sf1 = getSemiWinner("sf1");
    var sf2 = getSemiWinner("sf2");
    return [
      sf1 && sf1 !== "tie" ? sf1 : { key: "sf1Winner", name: "Vincente Semifinale 1", logo: "", role: "Finalista", icon: "?", isPlaceholder: true },
      sf2 && sf2 !== "tie" ? sf2 : { key: "sf2Winner", name: "Vincente Semifinale 2", logo: "", role: "Finalista", icon: "?", isPlaceholder: true }
    ];
  }

  function getFinalWinner() {
    var teams = getFinalTeams();
    if (teams[0].isPlaceholder || teams[1].isPlaceholder) return null;
    return getWinnerFromTeams("final", teams[0], teams[1]);
  }

  function renderAll() {
    renderParticipants();
    renderPlayin();
    renderDraw();
    renderSemis();
    renderFinal();
    renderChampion();
    refreshDrawSelects();
    syncAdminInputs();
  }

  function renderParticipants() {
    var grid = document.getElementById("participants-grid");
    if (!grid) return;

    grid.innerHTML = slots.map(function (slot) {
      return renderParticipantCard(getTeam(slot.key));
    }).join("");
  }

  function renderParticipantCard(team) {
    return '<article class="participant-card">' +
      renderMiniLogo(team) +
      '<div class="participant-copy">' +
      '<span class="participant-competition">' + escapeHtml(team.competition || team.role) + '</span>' +
      '<strong>' + escapeHtml(team.isPlaceholder ? "Da definire" : team.name) + '</strong>' +
      '<em>' + escapeHtml(team.qualifier || "Rappresentante") + '</em>' +
      '</div>' +
      '</article>';
  }

  function renderPlayin() {
    var card = document.getElementById("playin-card");
    if (!card) return;
    var teams = getPlayinTeams();
    card.innerHTML = renderMatchRows("playin", teams[0], teams[1]) +
      '<div class="match-note">★ Il vincitore avanza al sorteggio delle semifinali.</div>';
  }

  function renderDraw() {
    var candidates = getDrawCandidates();
    var left = document.getElementById("draw-left");
    var right = document.getElementById("draw-right");
    if (!left || !right) return;

    left.innerHTML = renderDrawItem(candidates[0]) + renderDrawItem(candidates[1]);
    right.innerHTML = renderDrawItem(candidates[2]) + renderDrawItem(candidates[3]);
  }

  function renderDrawItem(team) {
    return '<div class="draw-item">' +
      renderMiniLogo(team) +
      '<div><strong>' + escapeHtml(team.name) + '</strong><span>' + escapeHtml(team.role) + '</span></div>' +
      '</div>';
  }

  function renderSemis() {
    renderSemiCard("sf1", "Semifinale 1");
    renderSemiCard("sf2", "Semifinale 2");
  }

  function renderSemiCard(matchKey, title) {
    var card = document.getElementById(matchKey + "-card");
    if (!card) return;
    var a = getSemiTeam(matchKey + "a") || { name: "Da sorteggio", logo: "", role: "In attesa", icon: "?", isPlaceholder: true };
    var b = getSemiTeam(matchKey + "b") || { name: "Da sorteggio", logo: "", role: "In attesa", icon: "?", isPlaceholder: true };

    card.innerHTML = '<div class="match-kicker">' + title + '</div>' + renderMatchRows(matchKey, a, b);
  }

  function renderFinal() {
    var card = document.getElementById("final-card");
    if (!card) return;
    var teams = getFinalTeams();
    card.innerHTML = renderMatchRows("final", teams[0], teams[1]);
  }

  function renderChampion() {
    var box = document.getElementById("champion-content");
    if (!box) return;
    var winner = getFinalWinner();

    if (!winner || winner === "tie") {
      box.innerHTML = '<div class="champion-placeholder"><span>🏆</span><strong>In attesa del campione</strong></div>';
      return;
    }

    box.innerHTML = renderLargeLogo(winner) +
      '<div class="champion-name">' + escapeHtml(winner.name) + '</div>' +
      '<div class="champion-sub">Detentore della Supercoppa</div>';
  }

  function renderMatchRows(matchKey, teamA, teamB) {
    return '<div class="match-row">' + renderTeamBlock(teamA) + renderScore(matchKey, 0) + '</div>' +
      '<div class="vs-line">VS</div>' +
      '<div class="match-row">' + renderTeamBlock(teamB) + renderScore(matchKey, 1) + '</div>';
  }

  function renderTeamBlock(team) {
    return '<div class="team-block">' + renderLargeLogo(team) +
      '<div class="team-copy"><strong>' + escapeHtml(team.name) + '</strong><span>' + escapeHtml(team.role || "") + '</span></div>' +
      '</div>';
  }

  function renderScore(matchKey, index) {
    var value = scoreValue(matchKey, index);
    return '<div class="score-box">' + (value === "" ? "" : escapeHtml(value)) + '</div>';
  }

  function renderMiniLogo(team) {
    if (team.logo) {
      return '<span class="mini-logo"><img src="' + escapeAttr(team.logo) + '" alt="' + escapeAttr(team.name) + '"></span>';
    }
    return '<span class="mini-logo placeholder-logo">' + escapeHtml(team.icon || "?") + '</span>';
  }

  function renderLargeLogo(team) {
    if (team.logo) {
      return '<span class="logo-wrap"><img src="' + escapeAttr(team.logo) + '" alt="' + escapeAttr(team.name) + '"></span>';
    }
    return '<span class="logo-wrap placeholder-logo">' + escapeHtml(team.icon || "?") + '</span>';
  }

  function setupAdmin() {
    renderAdminTeamSelectors();
    setupScoreInputs();
    setupDrawInputs();

    var reset = document.getElementById("reset-supercoppa");
    if (reset) {
      reset.addEventListener("click", function () {
        state = clone(defaultData);
        saveState();
        renderAll();
      });
    }
  }

  function renderAdminTeamSelectors() {
    var box = document.getElementById("admin-team-selectors");
    if (!box) return;

    box.innerHTML = slots.map(function (slot) {
      return '<div class="admin-participant-field">' +
        '<div class="admin-slot-title">' + escapeHtml(slot.defaultCompetition) + '</div>' +
        '<label>Nome coppa / competizione' +
          '<input type="text" data-competition-slot="' + escapeAttr(slot.key) + '" value="' + escapeAttr(getCompetition(slot.key)) + '" placeholder="Es. Crash Out Cup, Coppa degli Eroi..." />' +
        '</label>' +
        '<label>Squadra' +
          '<select data-team-slot="' + escapeAttr(slot.key) + '">' + teamOptions(state.teams[slot.key]) + '</select>' +
        '</label>' +
        '<label>Qualifica mostrata' +
          '<input type="text" data-qualifier-slot="' + escapeAttr(slot.key) + '" value="' + escapeAttr(getQualifier(slot.key)) + '" placeholder="Es. Vincitore, Finalista, Ripescato..." />' +
        '</label>' +
      '</div>';
    }).join("");

    box.querySelectorAll("input[data-competition-slot]").forEach(function (input) {
      input.addEventListener("input", function () {
        var key = this.getAttribute("data-competition-slot");
        state.competitions[key] = this.value || getSlot(key).defaultCompetition;
        saveState();
        renderAll();
      });
    });

    box.querySelectorAll("select[data-team-slot]").forEach(function (select) {
      select.addEventListener("change", function () {
        var key = this.getAttribute("data-team-slot");
        state.teams[key] = this.value || null;
        cleanInvalidDraw();
        saveState();
        renderAll();
      });
    });

    box.querySelectorAll("input[data-qualifier-slot]").forEach(function (input) {
      input.addEventListener("input", function () {
        var key = this.getAttribute("data-qualifier-slot");
        state.qualifiers[key] = this.value || getSlot(key).defaultQualifier;
        saveState();
        renderAll();
      });
    });
  }

  function teamOptions(selectedName) {
    var html = '<option value="">Seleziona squadra...</option>';
    SQUADRE_SUPERCOPPA.forEach(function (squadra) {
      html += '<option value="' + escapeAttr(squadra.nome) + '"' + (squadra.nome === selectedName ? ' selected' : '') + '>' + escapeHtml(squadra.nome) + '</option>';
    });
    return html;
  }

  function setupScoreInputs() {
    document.querySelectorAll("input[data-score]").forEach(function (input) {
      input.addEventListener("input", function () {
        var parts = this.getAttribute("data-score").split("-");
        var matchKey = parts[0];
        var index = Number(parts[1]);
        state.scores[matchKey][index] = this.value;

        if (matchKey === "playin") cleanInvalidDraw();
        saveState();
        renderAll();
      });
    });
  }

  function setupDrawInputs() {
    document.querySelectorAll("select[data-draw]").forEach(function (select) {
      select.addEventListener("change", function () {
        var key = this.getAttribute("data-draw");
        state.draw[key] = this.value;
        saveState();
        renderAll();
      });
    });
  }

  function refreshDrawSelects() {
    var candidates = getDrawCandidates();
    document.querySelectorAll("select[data-draw]").forEach(function (select) {
      var selected = state.draw[select.getAttribute("data-draw")] || "";
      var html = '<option value="">Da sorteggio...</option>';

      candidates.forEach(function (candidate) {
        html += '<option value="' + escapeAttr(candidate.key) + '"' + (candidate.key === selected ? ' selected' : '') + '>' + escapeHtml(candidate.name) + '</option>';
      });

      select.innerHTML = html;
    });
  }

  function syncAdminInputs() {
    Object.keys(state.scores).forEach(function (matchKey) {
      state.scores[matchKey].forEach(function (value, index) {
        var input = document.querySelector('input[data-score="' + matchKey + '-' + index + '"]');
        if (input && input.value !== String(value || "")) input.value = value || "";
      });
    });

    document.querySelectorAll("select[data-team-slot]").forEach(function (select) {
      var key = select.getAttribute("data-team-slot");
      select.value = state.teams[key] || "";
    });

    document.querySelectorAll("input[data-competition-slot]").forEach(function (input) {
      var key = input.getAttribute("data-competition-slot");
      var value = getCompetition(key);
      if (input.value !== value) input.value = value;
    });

    document.querySelectorAll("input[data-qualifier-slot]").forEach(function (input) {
      var key = input.getAttribute("data-qualifier-slot");
      var value = getQualifier(key);
      if (input.value !== value) input.value = value;
    });
  }

  function cleanInvalidDraw() {
    var validKeys = getDrawCandidates().map(function (candidate) { return candidate.key; });
    Object.keys(state.draw).forEach(function (drawKey) {
      if (state.draw[drawKey] && validKeys.indexOf(state.draw[drawKey]) === -1) {
        state.draw[drawKey] = "";
      }
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();

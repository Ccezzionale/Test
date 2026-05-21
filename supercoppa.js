// supercoppa.js

(function () {
  var STORAGE_KEY = "legaEroiSupercoppaData_v2";

  var slots = [
    {
      key: "leagueChampion",
      icon: "♛",
      role: "Campione Lega degli Eroi",
      defaultName: "Campione Lega degli Eroi",
      logo: ""
    },
    {
      key: "crashOutChampion",
      icon: "🏆",
      role: "Vincitore Crash Out Cup",
      defaultName: "Vincitore Crash Out Cup",
      logo: ""
    },
    {
      key: "highlanderChampion",
      icon: "🛡️",
      role: "Vincitore Highlander Cup",
      defaultName: "Vincitore Highlander Cup",
      logo: ""
    },
    {
      key: "conferenceLeagueChampion",
      icon: "🏅",
      role: "Vincitore Conference League",
      defaultName: "Vincitore Conference League",
      logo: ""
    },
    {
      key: "conferenceChampionshipChampion",
      icon: "✦",
      role: "Vincitore Conference Championship",
      defaultName: "Vincitore Conference Championship",
      logo: ""
    }
  ];

  var defaultData = {
    teams: {
      leagueChampion: { name: "Campione Lega degli Eroi", logo: "" },
      crashOutChampion: { name: "Vincitore Crash Out Cup", logo: "" },
      highlanderChampion: { name: "Vincitore Highlander Cup", logo: "" },
      conferenceLeagueChampion: { name: "Vincitore Conference League", logo: "" },
      conferenceChampionshipChampion: { name: "Vincitore Conference Championship", logo: "" }
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

  var state = loadState();

  document.addEventListener("DOMContentLoaded", function () {
    setupNavbar();
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

  function loadState() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return structuredCloneSafe(defaultData);
      var parsed = JSON.parse(saved);
      return mergeData(structuredCloneSafe(defaultData), parsed);
    } catch (err) {
      console.warn("Impossibile caricare i dati Supercoppa", err);
      return structuredCloneSafe(defaultData);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function structuredCloneSafe(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function mergeData(base, saved) {
    if (!saved) return base;
    base.teams = Object.assign(base.teams, saved.teams || {});
    base.scores = Object.assign(base.scores, saved.scores || {});
    base.draw = Object.assign(base.draw, saved.draw || {});
    return base;
  }

  function getSlotMeta(key) {
    return slots.find(function (slot) { return slot.key === key; }) || null;
  }

  function getTeam(key) {
    var meta = getSlotMeta(key);
    var team = state.teams[key] || {};
    return {
      key: key,
      name: team.name || (meta ? meta.defaultName : "Da definire"),
      logo: team.logo || "",
      role: meta ? meta.role : "Da definire",
      icon: meta ? meta.icon : "?"
    };
  }

  function scoreValue(matchKey, index) {
    var score = state.scores[matchKey] || ["", ""];
    var value = score[index];
    if (value === null || value === undefined || value === "") return "";
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

  function getPlayinWinner() {
    return getWinnerFromTeams(
      "playin",
      getTeam("conferenceLeagueChampion"),
      getTeam("conferenceChampionshipChampion")
    );
  }

  function getDrawCandidates() {
    var playinWinner = getPlayinWinner();
    return [
      getTeam("leagueChampion"),
      getTeam("crashOutChampion"),
      getTeam("highlanderChampion"),
      playinWinner && playinWinner !== "tie" ? playinWinner : {
        key: "playinWinner",
        name: "Vincente Play-in",
        logo: "",
        role: "Vincente Play-in Conference",
        icon: "?"
      }
    ];
  }

  function getCandidateByKey(key) {
    if (!key) return null;
    return getDrawCandidates().find(function (candidate) {
      return candidate.key === key;
    }) || null;
  }

  function getSemiTeam(slotKey) {
    var selectedKey = state.draw[slotKey];
    if (!selectedKey) return null;
    return getCandidateByKey(selectedKey);
  }

  function getSemiWinner(matchKey) {
    var a = getSemiTeam(matchKey + "a");
    var b = getSemiTeam(matchKey + "b");
    if (!a || !b) return null;
    return getWinnerFromTeams(matchKey, a, b);
  }

  function getFinalWinner() {
    var sf1Winner = getSemiWinner("sf1");
    var sf2Winner = getSemiWinner("sf2");
    if (!sf1Winner || !sf2Winner || sf1Winner === "tie" || sf2Winner === "tie") return null;
    return getWinnerFromTeams("final", sf1Winner, sf2Winner);
  }

  function renderAll() {
    renderParticipants();
    renderPlayin();
    renderDraw();
    renderDrawSelects();
    renderSemis();
    renderFinal();
    renderChampion();
    syncAdminInputs();
  }

  function renderParticipants() {
    var grid = document.getElementById("participants-grid");
    if (!grid) return;

    grid.innerHTML = slots.map(function (slot) {
      var team = getTeam(slot.key);
      return "" +
        "<article class=\"participant-card\">" +
          renderLogo(team, "participant-logo") +
          "<div>" +
            "<div class=\"participant-role\">" + escapeHtml(slot.role) + "</div>" +
            "<div class=\"participant-name\">" + escapeHtml(team.name) + "</div>" +
          "</div>" +
        "</article>";
    }).join("");
  }

  function renderPlayin() {
    renderMatchRow(
      document.querySelector("[data-slot='conferenceLeagueChampion']"),
      getTeam("conferenceLeagueChampion"),
      "playin",
      0
    );

    renderMatchRow(
      document.querySelector("[data-slot='conferenceChampionshipChampion']"),
      getTeam("conferenceChampionshipChampion"),
      "playin",
      1
    );

    highlightWinner("playin", getPlayinWinner());
  }

  function renderDraw() {
    var candidates = getDrawCandidates();
    var left = document.getElementById("draw-left");
    var right = document.getElementById("draw-right");
    if (!left || !right) return;

    left.innerHTML = candidates.slice(0, 2).map(renderDrawItem).join("");
    right.innerHTML = candidates.slice(2, 4).map(renderDrawItem).join("");
  }

  function renderDrawItem(team) {
    return "" +
      "<div class=\"draw-item\">" +
        renderLogo(team, "draw-logo") +
        "<div>" +
          "<strong>" + escapeHtml(team.name) + "</strong>" +
          "<span>" + escapeHtml(team.role) + "</span>" +
        "</div>" +
      "</div>";
  }

  function renderSemis() {
    renderMatchRow(
      document.querySelector("[data-semi-slot='sf1a']"),
      getSemiTeam("sf1a"),
      "sf1",
      0,
      "Da sorteggio"
    );
    renderMatchRow(
      document.querySelector("[data-semi-slot='sf1b']"),
      getSemiTeam("sf1b"),
      "sf1",
      1,
      "Da sorteggio"
    );
    renderMatchRow(
      document.querySelector("[data-semi-slot='sf2a']"),
      getSemiTeam("sf2a"),
      "sf2",
      0,
      "Da sorteggio"
    );
    renderMatchRow(
      document.querySelector("[data-semi-slot='sf2b']"),
      getSemiTeam("sf2b"),
      "sf2",
      1,
      "Da sorteggio"
    );

    highlightWinner("sf1", getSemiWinner("sf1"));
    highlightWinner("sf2", getSemiWinner("sf2"));
  }

  function renderFinal() {
    var sf1Winner = getSemiWinner("sf1");
    var sf2Winner = getSemiWinner("sf2");

    renderMatchRow(
      document.querySelector("[data-final-slot='sf1']"),
      sf1Winner && sf1Winner !== "tie" ? sf1Winner : null,
      "final",
      0,
      sf1Winner === "tie" ? "Parità Semifinale 1" : "Vincente Semifinale 1"
    );

    renderMatchRow(
      document.querySelector("[data-final-slot='sf2']"),
      sf2Winner && sf2Winner !== "tie" ? sf2Winner : null,
      "final",
      1,
      sf2Winner === "tie" ? "Parità Semifinale 2" : "Vincente Semifinale 2"
    );

    highlightWinner("final", getFinalWinner());
  }

  function renderChampion() {
    var winner = getFinalWinner();
    var nameEl = document.getElementById("champion-name");
    var subEl = document.getElementById("champion-sub");
    var logoEl = document.getElementById("champion-logo");

    if (!nameEl || !subEl || !logoEl) return;

    if (!winner || winner === "tie") {
      nameEl.textContent = winner === "tie" ? "Finale in parità" : "In attesa del campione";
      subEl.textContent = "Solo una corona. Solo un eroe.";
      logoEl.removeAttribute("src");
      logoEl.alt = "";
      return;
    }

    nameEl.textContent = winner.name;
    subEl.textContent = "Detentore della Supercoppa degli Eroi";

    if (winner.logo) {
      logoEl.src = normaliseLogoPath(winner.logo);
      logoEl.alt = winner.name;
    } else {
      logoEl.removeAttribute("src");
      logoEl.alt = "";
    }
  }

  function renderMatchRow(container, team, matchKey, index, fallbackText) {
    if (!container) return;
    var isPlaceholder = !team;
    var shownTeam = team || {
      name: fallbackText || "Da definire",
      role: "In attesa",
      logo: "",
      icon: "?"
    };

    container.innerHTML = "" +
      renderLogo(shownTeam, "team-logo", isPlaceholder) +
      "<div class=\"team-copy\">" +
        "<strong>" + escapeHtml(shownTeam.name) + "</strong>" +
        "<span>" + escapeHtml(shownTeam.role || "") + "</span>" +
      "</div>" +
      "<div class=\"score-chip\" data-score=\"" + matchKey + "-" + index + "\">" + escapeHtml(scoreValue(matchKey, index)) + "</div>";
  }

  function renderLogo(team, className, forcePlaceholder) {
    if (team && team.logo && !forcePlaceholder) {
      return "<div class=\"logo-shell " + className + "\"><img src=\"" + escapeAttr(normaliseLogoPath(team.logo)) + "\" alt=\"" + escapeAttr(team.name) + "\"></div>";
    }

    return "<div class=\"logo-shell " + className + " is-placeholder\"><span>" + escapeHtml((team && team.icon) || "?") + "</span></div>";
  }

  function normaliseLogoPath(value) {
    if (!value) return "";
    if (value.indexOf("/") >= 0 || value.indexOf("http") === 0) return value;
    return "img/" + value;
  }

  function highlightWinner(matchKey, winner) {
    var card = document.querySelector("[data-match='" + matchKey + "']");
    if (!card) return;
    card.querySelectorAll(".match-row").forEach(function (row) {
      row.classList.remove("is-winner", "is-tie");
      var name = row.querySelector(".team-copy strong");
      if (!name) return;
      if (winner === "tie") {
        row.classList.add("is-tie");
        return;
      }
      if (winner && name.textContent.trim() === winner.name) {
        row.classList.add("is-winner");
      }
    });
  }

  function setupAdmin() {
    var toggle = document.getElementById("admin-toggle");
    var panel = document.getElementById("admin-panel");
    var reset = document.getElementById("admin-reset");

    if (toggle && panel) {
      toggle.addEventListener("click", function () {
        panel.hidden = !panel.hidden;
      });
    }

    if (reset) {
      reset.addEventListener("click", function () {
        state = structuredCloneSafe(defaultData);
        saveState();
        renderAll();
      });
    }

    renderAdminTeamInputs();
    bindScoreInputs();
    bindDrawInputs();
  }

  function renderAdminTeamInputs() {
    var container = document.getElementById("admin-teams");
    if (!container) return;

    container.innerHTML = slots.map(function (slot) {
      return "" +
        "<div class=\"admin-team-card\">" +
          "<div class=\"admin-role\">" + escapeHtml(slot.role) + "</div>" +
          "<label>Squadra<input type=\"text\" data-team-name=\"" + slot.key + "\" placeholder=\"Nome squadra\"></label>" +
          "<label>Logo<input type=\"text\" data-team-logo=\"" + slot.key + "\" placeholder=\"Es. Rubinkebab.png\"></label>" +
        "</div>";
    }).join("");

    container.querySelectorAll("[data-team-name]").forEach(function (input) {
      input.addEventListener("input", function () {
        var key = this.getAttribute("data-team-name");
        state.teams[key].name = this.value.trim();
        saveState();
        renderAll();
      });
    });

    container.querySelectorAll("[data-team-logo]").forEach(function (input) {
      input.addEventListener("input", function () {
        var key = this.getAttribute("data-team-logo");
        state.teams[key].logo = this.value.trim();
        saveState();
        renderAll();
      });
    });
  }

  function bindScoreInputs() {
    [
      ["score-playin-a", "playin", 0],
      ["score-playin-b", "playin", 1],
      ["score-sf1-a", "sf1", 0],
      ["score-sf1-b", "sf1", 1],
      ["score-sf2-a", "sf2", 0],
      ["score-sf2-b", "sf2", 1],
      ["score-final-a", "final", 0],
      ["score-final-b", "final", 1]
    ].forEach(function (item) {
      var input = document.getElementById(item[0]);
      if (!input) return;
      input.addEventListener("input", function () {
        state.scores[item[1]][item[2]] = this.value;
        saveState();
        renderAll();
      });
    });
  }

  function bindDrawInputs() {
    ["draw-sf1a", "draw-sf1b", "draw-sf2a", "draw-sf2b"].forEach(function (id) {
      var select = document.getElementById(id);
      if (!select) return;
      select.addEventListener("change", function () {
        state.draw[id.replace("draw-", "")] = this.value;
        saveState();
        renderAll();
      });
    });
  }

  function renderDrawSelects() {
    var candidates = getDrawCandidates();
    ["draw-sf1a", "draw-sf1b", "draw-sf2a", "draw-sf2b"].forEach(function (id) {
      var select = document.getElementById(id);
      if (!select) return;

      var stateKey = id.replace("draw-", "");
      var current = state.draw[stateKey] || "";
      select.innerHTML = "<option value=\"\">Da sorteggio</option>" + candidates.map(function (candidate) {
        return "<option value=\"" + escapeAttr(candidate.key) + "\">" + escapeHtml(candidate.name) + "</option>";
      }).join("");
      select.value = current;
    });
  }

  function syncAdminInputs() {
    slots.forEach(function (slot) {
      var name = document.querySelector("[data-team-name='" + slot.key + "']");
      var logo = document.querySelector("[data-team-logo='" + slot.key + "']");
      if (name) name.value = state.teams[slot.key].name || "";
      if (logo) logo.value = state.teams[slot.key].logo || "";
    });

    var scoreMap = [
      ["score-playin-a", "playin", 0],
      ["score-playin-b", "playin", 1],
      ["score-sf1-a", "sf1", 0],
      ["score-sf1-b", "sf1", 1],
      ["score-sf2-a", "sf2", 0],
      ["score-sf2-b", "sf2", 1],
      ["score-final-a", "final", 0],
      ["score-final-b", "final", 1]
    ];

    scoreMap.forEach(function (item) {
      var input = document.getElementById(item[0]);
      if (input) input.value = scoreValue(item[1], item[2]);
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
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();

/* Draft Conference League: soli controlli visuali mobile.
   Non intercetta né modifica le chiamate o le query del Draft. */
(() => {
  "use strict";
  const league = document.body.classList.contains("draft-league-modern");
  if (!league) return;
  let overviewMode = "rounds";
  const $ = (selector, root = document) => root.querySelector(selector);

  function button(className, text, attributes = {}) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = className;
    el.textContent = text;
    Object.entries(attributes).forEach(([key, value]) => el.setAttribute(key, value));
    return el;
  }

  function refreshOverviewVisibility(card) {
    const rounds = $(".mobile-overview-rounds", card);
    const picks = $(".draft-overview-picks", card);
    if (!rounds || !picks) return;
    rounds.classList.toggle("is-hidden", overviewMode !== "rounds");
    picks.classList.toggle("is-hidden", overviewMode !== "picks");
    card.querySelectorAll("[data-overview-mode]").forEach(el => {
      el.setAttribute("aria-pressed", String(el.dataset.overviewMode === overviewMode));
    });
  }

  function mountOverview() {
    if (window.innerWidth > 768) return;
    const host = $(".mobile-companion-actions");
    const card = host && $(".mobile-draft-overview-card", host);
    if (!card || $(".draft-overview-switch", card)) return;

    const switcher = document.createElement("div");
    switcher.className = "draft-overview-switch";
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", "Visualizzazione Draft Overview");
    const byRounds = button("", "Per round", { "data-overview-mode": "rounds" });
    const byPicks = button("", "Per pick", { "data-overview-mode": "picks" });
    switcher.append(byRounds, byPicks);
    const legend = $(".mobile-overview-legend", card);
    legend?.insertAdjacentElement("afterend", switcher);

    // Identica griglia grafica del Per round: 8 loghi per riga,
    // ma qui ordinati in modo rigorosamente cronologico per pick.
    const picks = document.createElement("div");
    picks.className = "draft-overview-picks";
    const search = document.createElement("input");
    search.type = "search";
    search.className = "draft-overview-search";
    search.placeholder = "Cerca una pick o un giocatore...";
    search.setAttribute("aria-label", "Cerca le pick in ordine");
    const list = document.createElement("div");
    list.className = "draft-overview-grid-list";
    const draftRows = Array.from(document.querySelectorAll("#tabella-pick tbody tr"));
    const pickRows = draftRows.map(row => {
      const cells = row.querySelectorAll("td");
      const pickNumber = Number(cells[0]?.textContent?.trim() || 0);
      const team = String(cells[1]?.textContent || "").replace(/🔁/g, "").trim();
      const player = String(cells[2]?.textContent || "").trim();
      return { pickNumber, team, player, traded: row.dataset.tradedPick === "true", current: row.classList.contains("next-pick") };
    }).filter(row => row.pickNumber > 0).sort((x,y) => x.pickNumber - y.pickNumber);

    const perLine = 8;
    for (let index = 0; index < pickRows.length; index += perLine) {
      const chunk = pickRows.slice(index, index + perLine);
      const line = document.createElement("div");
      line.className = "mobile-overview-round draft-overview-pick-round";
      if (chunk.some(p => p.current)) line.classList.add("is-current-round");
      const label = document.createElement("div");
      label.className = "mobile-overview-round-label";
      label.title = "Pick da #" + chunk[0].pickNumber + " a #" + chunk[chunk.length - 1].pickNumber;
      const labelNumber = document.createElement("strong");
      labelNumber.textContent = "#" + chunk[0].pickNumber;
      const arrow = document.createElement("span");
      arrow.textContent = "→";
      arrow.setAttribute("aria-hidden", "true");
      label.append(labelNumber,arrow);
      const slots = document.createElement("div");
      slots.className = "mobile-overview-slots";
      chunk.forEach(item => {
        const state = item.current ? "is-current" : item.player ? "is-completed" : "is-future";
        const slot = button(
          "mobile-overview-slot draft-overview-pick-slot " + state + (item.traded ? " is-traded" : ""),
          "", {"data-overview-pick":String(item.pickNumber)}
        );
        const fullLabel = "Pick #" + item.pickNumber + " · " + item.team + " · " +
          (item.player || (item.current ? "In corso" : "Da effettuare")) +
          (item.traded ? " · Scambiata" : "");
        slot.title = fullLabel;
        slot.setAttribute("aria-label",fullLabel);
        // Riutilizza il colore già assegnato alla trade nell'Overview per round.
        const roundSlot = card.querySelector('.mobile-overview-rounds [data-overview-pick="' + item.pickNumber + '"]');
        if (item.traded && roundSlot?.getAttribute("style")) {
          slot.setAttribute("style", roundSlot.getAttribute("style"));
        }
        slot.dataset.searchable = [item.pickNumber,item.team,item.player].join(" ").toLocaleLowerCase("it");
        const img = document.createElement("img");
        img.src = "img/" + item.team + ".webp";
        img.alt = "";
        const fallback = document.createElement("span");
        fallback.className = "mobile-overview-fallback";
        fallback.textContent = item.team.split(/\s+/).slice(0,2).map(x => x[0] || "").join("").toUpperCase() || "?";
        img.addEventListener("error", () => {
          img.style.display = "none";
          fallback.style.display = "flex";
        });
        const number = document.createElement("em");
        number.textContent = "#" + item.pickNumber;
        number.setAttribute("aria-hidden", "true");
        slot.append(img,fallback,number);
        if(item.traded) {
          const trade = document.createElement("i");
          trade.textContent = "↔";
          trade.setAttribute("aria-hidden","true");
          slot.appendChild(trade);
        }
        slots.appendChild(slot);
      });
      line.append(label,slots);
      list.appendChild(line);
    }
    if (!pickRows.length) {
      const empty = document.createElement("p");
      empty.className = "draft-overview-empty";
      empty.textContent = "Pick non ancora disponibili.";
      list.appendChild(empty);
    }
    search.addEventListener("input", () => {
      const term = search.value.trim().toLocaleLowerCase("it").replace(/^#/, "");
      list.querySelectorAll(".draft-overview-pick-round").forEach(line => {
        let matches = 0;
        line.querySelectorAll(".draft-overview-pick-slot").forEach(slot => {
          const found = !term || slot.dataset.searchable.includes(term);
          slot.classList.toggle("is-dimmed",!found);
          if(found) matches++;
        });
        line.hidden = matches === 0;
      });
    });
    picks.append(search,list);
    switcher.addEventListener("click", event => {
      const target = event.target.closest("[data-overview-mode]");
      if (!target) return;
      overviewMode = target.dataset.overviewMode;
      refreshOverviewVisibility(card);
    });
    $(".mobile-overview-rounds", card)?.insertAdjacentElement("afterend", picks);
    refreshOverviewVisibility(card);
  }

  function filterBoard() {
    const input = $("#draft-board-search");
    const status = $("#draft-board-status");
    const term = (input?.value || "").trim().toLocaleLowerCase("it");
    const filter = status?.value || "all";
    document.querySelectorAll("#tabella-pick tbody tr").forEach(row => {
      const cells = row.querySelectorAll("td");
      const picked = !!String(cells[2]?.textContent || "").trim();
      const includes = !term || [...cells].map(c => c.textContent || "").join(" ")
        .toLocaleLowerCase("it").includes(term);
      const statusMatches = filter === "all" || (filter === "done" ? picked : !picked);
      row.classList.toggle("draft-board-filter-hidden", !(includes && statusMatches));
    });
  }

  function setupBoard() {
    const panel = $("#draft-board-panel");
    const table = $("#tabella-pick tbody");
    if (!panel || !table) return;
    if (!$(".draft-board-tools", panel)) {
      const bar = document.createElement("div");
      bar.className = "draft-board-tools";
      const search = document.createElement("input");
      search.id = "draft-board-search";
      search.type = "search";
      search.placeholder = "Cerca pick, squadra, giocatore";
      search.setAttribute("aria-label","Cerca nella Draft Board");
      const status = document.createElement("select");
      status.id = "draft-board-status";
      status.setAttribute("aria-label","Stato delle pick");
      [["all","Tutte"],["done","Effettuate"],["pending","Da effettuare"]].forEach(([value, label]) => {
        const opt = new Option(label,value);
        status.add(opt);
      });
      bar.append(search,status);
      $(".table-shell",panel)?.insertAdjacentElement("beforebegin",bar);
      search.addEventListener("input",filterBoard);
      status.addEventListener("change",filterBoard);
    }
    const observer = new MutationObserver(filterBoard);
    observer.observe(table,{childList:true});
    filterBoard();
  }

  function setupCompactPool() {
    if (window.innerWidth > 768) return;
    const grid = document.querySelector("#pool-section .filters-grid");
    if (!grid || grid.querySelector(".draft-pool-advanced")) return;
    const searchField = grid.querySelector(".filter-field:has(#searchGiocatore)");
    if (!searchField) return;

    const detail = document.createElement("details");
    detail.className = "draft-pool-advanced";
    const summary = document.createElement("summary");
    const label = document.createElement("span");
    label.textContent = "Altri filtri";
    const hint = document.createElement("small");
    hint.textContent = "Squadra · Ruolo · U21";
    summary.append(label,hint);
    const advanced = document.createElement("div");
    advanced.className = "draft-pool-advanced-grid";
    Array.from(grid.children).filter(child => child !== searchField).forEach(child => {
      advanced.appendChild(child);
    });
    detail.append(summary,advanced);
    grid.appendChild(detail);
    // Filtri selezionati restano visibili e funzionanti quando si torna sul mobile.
    const updateMode = () => {
      if (window.innerWidth > 768) detail.open = true;
      else if (detail.dataset.wasDesktop === "1") {
        detail.open = false;
      }
      detail.dataset.wasDesktop = window.innerWidth > 768 ? "1" : "0";
    };
    updateMode();
    window.addEventListener("resize",updateMode);
  }

  function adminTabs() {
    const tab = $('[data-mobile-view="admin"].draft-tab-admin');
    const panel = $("#admin-panel");
    if (!tab || !panel) return;
    const update = () => { tab.hidden = panel.style.display !== "block"; };
    update();
    new MutationObserver(update).observe(panel,{attributes:true,attributeFilter:["style"]});
  }

  function setup() {
    setupBoard();
    setupCompactPool();
    adminTabs();
    const host = $(".mobile-companion-actions");
    if (host) {
      new MutationObserver(mountOverview).observe(host,{childList:true});
      mountOverview();
    }
    window.addEventListener("resize",mountOverview);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",setup,{once:true});
  else setup();
})();
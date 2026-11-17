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

    const picks = document.createElement("div");
    picks.className = "draft-overview-picks";
    const search = document.createElement("input");
    search.type = "search";
    search.className = "draft-overview-search";
    search.placeholder = "Cerca pick, squadra o giocatore...";
    search.setAttribute("aria-label", "Cerca tra le pick");
    const list = document.createElement("div");
    list.className = "draft-overview-pick-list";
    const draftRows = Array.from(document.querySelectorAll("#tabella-pick tbody tr"));
    const pickRows = draftRows.map(row => {
      const cells = row.querySelectorAll("td");
      const pickNumber = Number(cells[0]?.textContent?.trim() || 0);
      const team = String(cells[1]?.textContent || "").replace(/🔁/g, "").trim();
      const player = String(cells[2]?.textContent || "").trim();
      return { pickNumber, team, player, traded: row.dataset.tradedPick === "true", current: row.classList.contains("next-pick") };
    }).filter(row => row.pickNumber > 0).sort((a,b) => a.pickNumber - b.pickNumber);

    pickRows.forEach(item => {
      const row = button("draft-overview-pick" + (item.current ? " is-current" : ""), "", { "data-overview-pick": String(item.pickNumber) });
      row.textContent = "";
      const number = document.createElement("span");
      number.className = "draft-overview-pick-number";
      number.textContent = "#" + item.pickNumber;
      const info = document.createElement("span");
      info.className = "draft-overview-pick-info";
      const name = document.createElement("strong");
      name.textContent = item.player || "Da effettuare";
      const team = document.createElement("small");
      team.textContent = item.team || "Franchigia non disponibile";
      info.append(name,team);
      const status = document.createElement("span");
      status.className = "draft-overview-pick-state" + (item.traded ? " is-traded" : "");
      status.textContent = item.traded ? "↔ Scambiata" : item.current ? "In corso" : item.player ? "✓" : "Futura";
      row.dataset.searchable = [item.pickNumber, item.team, item.player].join(" ").toLocaleLowerCase("it");
      row.append(number,info,status);
      list.appendChild(row);
    });
    if (!pickRows.length) {
      const empty = document.createElement("p");
      empty.className = "draft-overview-empty";
      empty.textContent = "Pick non ancora disponibili.";
      list.appendChild(empty);
    }
    search.addEventListener("input", () => {
      const term = search.value.trim().toLocaleLowerCase("it");
      list.querySelectorAll(".draft-overview-pick").forEach(row => {
        row.hidden = !!term && !row.dataset.searchable.includes(term);
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

  function setupPoolQuickFilters() {
    const filters = $(".filters-wrap", $("#pool-section") || document);
    if (!filters || $(".draft-pool-quick-filters",filters)) return;
    const choices = [
      ["all","Tutti"],["P","P"],["D","D"],["C","C"],["A","A"],["U21","U21"]
    ];
    const wrap = document.createElement("div");
    wrap.className = "draft-pool-quick-filters";
    wrap.setAttribute("role","group");
    wrap.setAttribute("aria-label","Filtra per ruolo o U21");
    choices.forEach(([value,label]) => {
      wrap.appendChild(button("",label,{"data-pool-quick":value,"aria-pressed":value==="all" ? "true":"false"}));
    });
    $(".filters-toolbar",filters)?.insertAdjacentElement("beforebegin",wrap);
    const roleSelect = $("#filtroRuolo"), roleSearch = $("#cercaRuolo"), u21 = $("#filtroU21");
    wrap.addEventListener("click",event=>{
      const el = event.target.closest("[data-pool-quick]");
      if(!el) return;
      const value = el.dataset.poolQuick;
      if (roleSelect) roleSelect.value = "";
      if (roleSearch) roleSearch.value = "";
      if (u21) u21.value = value === "U21" ? "u21" : "";
      if (value !== "all" && value !== "U21") {
        const exactOption = Array.from(roleSelect?.options || []).find(opt =>
          opt.value.toLocaleLowerCase("it") === value.toLocaleLowerCase("it")
        );
        if (exactOption && roleSelect) roleSelect.value=exactOption.value;
        else if (roleSearch) roleSearch.value=value.toLocaleLowerCase("it");
      }
      wrap.querySelectorAll("button").forEach(btn =>
        btn.setAttribute("aria-pressed", String(btn.dataset.poolQuick === value))
      );
      (roleSelect || roleSearch)?.dispatchEvent(new Event("change",{bubbles:true}));
      u21?.dispatchEvent(new Event("change",{bubbles:true}));
    });
    [roleSelect,roleSearch,u21].forEach(element=>element?.addEventListener("change",event=>{
      if (event.isTrusted) wrap.querySelectorAll("button").forEach(btn =>
        btn.setAttribute("aria-pressed",String(btn.dataset.poolQuick === "all" &&
          !roleSelect?.value && !roleSearch?.value && !u21?.value))
      );
    }));
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
    setupPoolQuickFilters();
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
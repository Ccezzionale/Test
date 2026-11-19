/* HOME ARENA V33 - menu laterale isolato dalla Home ufficiale.
 * Navbar condivisa: la logica di login, admin, trade e notifiche resta invariata.
 */
(function () {
  "use strict";

  function initArenaDrawer() {
    const trigger = document.getElementById("arena-menu-toggle");
    const panel = document.getElementById("arena-menu-panel");
    const backdrop = document.getElementById("arena-menu-backdrop");
    const closeButton = document.getElementById("arena-menu-close");
    const mainMenu = document.getElementById("mainMenu");
    if (!trigger || !panel || !backdrop || !closeButton || !mainMenu) return;

    const paths = {
      rose: '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9h8M8 13h6"/>',
      draft: '<path d="M12 3l7 4v10l-7 4-7-4V7l7-4z"/><path d="M9 10h6M9 14h6M12 7v10"/>',
      competitions: '<path d="M8 3h8v4c0 4-2 6-4 6S8 11 8 7V3z"/><path d="M8 5H4v2c0 3 2 4 5 4M16 5h4v2c0 3-2 4-5 4M12 13v4m-4 4h8m-6-4h4v4"/>',
      waiver: '<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/>',
      explore: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3z"/>'
    };

    function svg(icon) {
      return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[icon] + '</svg>';
    }

    // Icone e attributi aggiunti dopo la creazione dinamica di "Esplora".
    Array.from(mainMenu.children).forEach(function (item, index) {
      if (item.tagName !== "LI") return;
      const anchor = Array.from(item.children).find(function (child) { return child.tagName === "A"; });
      if (!anchor) return;
      const name = anchor.textContent.toLowerCase().replace(/\s+/g, " ").trim();
      const iconName = name.includes("rose") ? "rose" :
        name.includes("draft") ? "draft" :
        name.includes("competizioni") ? "competitions" :
        name.includes("waiver") ? "waiver" : "explore";
      const glyph = document.createElement("span");
      glyph.className = "arena-drawer-glyph";
      glyph.innerHTML = svg(iconName);
      anchor.prepend(glyph);

      const submenu = Array.from(item.children).find(function (child) { return child.classList.contains("submenu"); });
      if (submenu) {
        const submenuId = "arena-v33-submenu-" + index;
        submenu.id = submenuId;
        anchor.setAttribute("aria-controls", submenuId);
        anchor.setAttribute("aria-expanded", "false");
        anchor.setAttribute("aria-haspopup", "true");
      }
    });

    panel.inert = true;
    let lastFocus = null;

    function isOpen() {
      return panel.classList.contains("is-open");
    }

    function openDrawer() {
      lastFocus = document.activeElement;
      panel.inert = false;
      panel.classList.add("is-open");
      backdrop.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
      trigger.setAttribute("aria-expanded", "true");
      document.body.classList.add("arena-drawer-open");
      closeButton.focus({ preventScroll: true });
    }

    function closeDrawer() {
      if (!isOpen()) return;
      panel.classList.remove("is-open");
      backdrop.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
      trigger.setAttribute("aria-expanded", "false");
      document.body.classList.remove("arena-drawer-open");
      panel.inert = true;
      if (lastFocus && document.contains(lastFocus) && typeof lastFocus.focus === "function") {
        lastFocus.focus({ preventScroll: true });
      } else {
        trigger.focus({ preventScroll: true });
      }
    }

    trigger.addEventListener("click", function () {
      if (isOpen()) closeDrawer(); else openDrawer();
    });
    closeButton.addEventListener("click", closeDrawer);
    backdrop.addEventListener("click", closeDrawer);

    // Capture: impedisce al vecchio listener mobile di gestire gli accordion
    // in questa sola anteprima, preservandolo in tutte le altre pagine.
    mainMenu.addEventListener("click", function (event) {
      const toggle = event.target.closest("a.toggle-submenu");
      if (!toggle || !mainMenu.contains(toggle)) return;
      event.preventDefault();
      event.stopPropagation();
      const item = toggle.closest("li.dropdown");
      if (!item) return;
      const next = !item.classList.contains("arena-expanded");
      Array.from(mainMenu.children).forEach(function (other) {
        other.classList.remove("arena-expanded");
        const topLink = Array.from(other.children).find(function (c) { return c.tagName === "A"; });
        if (topLink && topLink.classList.contains("toggle-submenu")) {
          topLink.setAttribute("aria-expanded", "false");
        }
      });
      item.classList.toggle("arena-expanded", next);
      toggle.setAttribute("aria-expanded", String(next));
    }, true);

    mainMenu.addEventListener("click", function (event) {
      if (event.target.closest('a[href]:not([href="#"])')) closeDrawer();
    });

    document.addEventListener("keydown", function (event) {
      if (!isOpen()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
      }
      if (event.key === "Tab") {
        const visible = Array.from(panel.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'))
          .filter(function (el) { return el.getClientRects().length && getComputedStyle(el).visibility !== "hidden"; });
        if (!visible.length) return;
        const first = visible[0];
        const last = visible[visible.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    // Rispecchia il profilo già caricato dalla Home, senza ulteriori query.
    const homeTeam = document.getElementById("my-team");
    const homeLogo = document.getElementById("my-logo");
    const homeDetail = document.getElementById("my-details");
    const drawerTeam = document.getElementById("arena-menu-team-name");
    const drawerLogo = document.getElementById("arena-menu-team-logo");
    const drawerDetail = document.getElementById("arena-menu-team-detail");
    function syncTeam() {
      if (homeTeam && drawerTeam) drawerTeam.textContent = homeTeam.textContent || "La tua franchigia";
      if (homeLogo && drawerLogo && homeLogo.getAttribute("src")) drawerLogo.src = homeLogo.getAttribute("src");
      if (homeDetail && drawerDetail) drawerDetail.textContent = homeDetail.textContent || "Il tuo quartier generale";
    }
    syncTeam();
    if (typeof MutationObserver !== "undefined") {
      [homeTeam, homeDetail].filter(Boolean).forEach(function (el) {
        new MutationObserver(syncTeam).observe(el, { childList: true, characterData: true, subtree: true });
      });
      if (homeLogo) new MutationObserver(syncTeam).observe(homeLogo, { attributes: true, attributeFilter: ["src"] });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initArenaDrawer);
  } else {
    initArenaDrawer();
  }
})();

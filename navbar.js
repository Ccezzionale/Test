/*
 * Lega degli Eroi | Navigazione condivisa
 * 14 ottobre 2026: Esplora nella barra desktop e nel menu a tendina mobile.
 * Mantiene gli handler esistenti di login, dropdown e pannello mobile.
 */

/** Riorganizza solo i link della navigazione, senza cambiare le altre pagine. */
function configureExploreNavigation() {
  const mainMenu = document.getElementById("mainMenu");
  if (!mainMenu) return;

  // Alcune pagine hanno una navbar HTML più vecchia: normalizziamo tutte
  // senza dipendere dalla versione del loro codice HTML.
  const topLevelItems = () => Array.from(mainMenu.children).filter(el => el.tagName === "LI");
  const directLink = li => Array.from(li.children).find(el => el.tagName === "A") || null;
  const normalizedHref = a => {
    if (!a) return "";
    return (a.getAttribute("href") || "").split(/[?#]/)[0].replace(/^\.\//, "").toLowerCase();
  };
  const directItemForHref = href => topLevelItems().find(li => normalizedHref(directLink(li)) === href);
  const directItemForText = name => topLevelItems().find(li => {
    const a = directLink(li);
    return a && a.textContent.replace(/▾/g, "").trim().toLowerCase() === name;
  });

  // Statistiche esce soltanto dal menu Competizioni, non dalla Home.
  const competitions = topLevelItems().find(li => li.classList.contains("competizioni")) || directItemForText("competizioni");
  if (competitions) {
    competitions.querySelectorAll(".submenu a").forEach(a => {
      if (normalizedHref(a) === "statistiche.html") a.closest("li")?.remove();
    });
  }

  // Hall of Fame e Regolamento entrano in Esplora. Il loro contenuto
  // continua a vivere nelle pagine originali, non viene cancellato.
  for (const old of [
    directItemForHref("hall-of-fame.html"),
    directItemForText("hall of fame"),
    directItemForHref("regolamento.html"),
    directItemForText("regolamento"),
    directItemForHref("statistiche.html")
  ]) {
    if (old && old.id !== "nav-explore") old.remove();
  }

  let explore = document.getElementById("nav-explore");
  if (!explore) {
    explore = document.createElement("li");
    explore.id = "nav-explore";
    explore.className = "dropdown";
    explore.innerHTML = `
      <a href="#" class="toggle-submenu" aria-haspopup="true" aria-expanded="false">
        Esplora <span class="caret" aria-hidden="true">▾</span>
      </a>
      <ul class="submenu" aria-label="Esplora Lega degli Eroi">
        <li><a href="totoeroi.html"><span class="nav-explore-symbol" aria-hidden="true">🎯</span><span>TotoEroi</span></a></li>
        <li><a href="statistiche.html"><span class="nav-explore-symbol" aria-hidden="true">📊</span><span>Statistiche</span></a></li>
        <li><a href="timeline.html"><span class="nav-explore-symbol" aria-hidden="true">🎬</span><span>Timeline Stagionale</span></a></li>
        <li><a href="hall-of-fame.html"><span class="nav-explore-symbol" aria-hidden="true">🏆</span><span>Hall of Fame</span></a></li>
        <li><a href="regolamento.html"><span class="nav-explore-symbol" aria-hidden="true">📜</span><span>Regolamento</span></a></li>
      </ul>
    `;
  }

  const waiver = directItemForHref("waiver.html") || directItemForText("waiver wire");
  if (waiver) waiver.after(explore);
  else if (competitions) competitions.after(explore);
  else mainMenu.appendChild(explore);

  // Migliora l'accessibilità da tastiera e mantiene le icone allineate.
  if (!document.getElementById("nav-explore-style")) {
    const style = document.createElement("style");
    style.id = "nav-explore-style";
    style.textContent = `
      .site-nav #nav-explore .nav-explore-symbol {
        display:inline-flex; align-items:center; justify-content:center;
        width:24px; min-width:24px; font-size:19px; line-height:1;
      }
      @media (min-width:901px) {
        .site-nav #nav-explore:focus-within > .submenu {
          opacity:1; visibility:visible; transform:translateY(0); pointer-events:auto;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

document.addEventListener("DOMContentLoaded", function () {
  configureExploreNavigation();

  const hamburger = document.getElementById("hamburger");
  const mainMenu = document.getElementById("mainMenu");
  const submenuToggles = document.querySelectorAll(".toggle-submenu");
  const isMobile = () => window.innerWidth <= 900;

  let menuOpenScrollY = 0;

  function closeMainMenu() {
    if (mainMenu) mainMenu.classList.remove("show");

    document.querySelectorAll(".dropdown.show").forEach(function (item) {
      item.classList.remove("show");
    });
  }

  if (hamburger && mainMenu) {
    hamburger.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      mainMenu.classList.toggle("show");

      if (mainMenu.classList.contains("show")) {
        menuOpenScrollY = window.scrollY || window.pageYOffset || 0;
      }
    });
  }

  submenuToggles.forEach(function (toggle) {
    toggle.addEventListener("click", function (e) {
      if (!isMobile()) return;

      e.preventDefault();
      e.stopPropagation();

      const parent = this.closest(".dropdown");
      if (!parent) return;

      const alreadyOpen = parent.classList.contains("show");

      document.querySelectorAll(".dropdown.show").forEach(function (item) {
        item.classList.remove("show");
      });

      if (!alreadyOpen) {
        parent.classList.add("show");
      }
    });
  });

  document.addEventListener("click", function (e) {
    if (!isMobile()) return;
    if (!mainMenu || !mainMenu.classList.contains("show")) return;

    const clickedInsideMenu = mainMenu.contains(e.target);
    const clickedHamburger = hamburger && hamburger.contains(e.target);

    if (!clickedInsideMenu && !clickedHamburger) {
      closeMainMenu();
    }
  });

window.addEventListener("scroll", function () {
  if (!isMobile()) return;
  if (!mainMenu || !mainMenu.classList.contains("show")) return;

  const currentScrollY = window.scrollY || window.pageYOffset || 0;
  const distance = Math.abs(currentScrollY - menuOpenScrollY);

  if (distance > 180) {
    closeMainMenu();
  }
}, { passive: true });

  window.addEventListener("resize", function () {
    if (!isMobile()) {
      closeMainMenu();
    }
  });

  document.querySelectorAll("#mainMenu a").forEach(function (link) {
    link.addEventListener("click", function () {
      if (!isMobile()) return;

      const isSubmenuToggle = link.classList.contains("toggle-submenu");
      if (isSubmenuToggle) return;

      closeMainMenu();
    });
  });

  updateAuthButtons();
});

function ensureAuthStatusStyles() {
  if (document.getElementById("lega-auth-status-styles")) return;

  const style = document.createElement("style");
  style.id = "lega-auth-status-styles";
  style.textContent = `
    #login-btn.auth-state-button,
    #logout-btn.auth-state-button {
      position: relative !important;
      overflow: visible !important;
    }

    .auth-status-badge {
      position: absolute;
      right: -6px;
      bottom: -6px;
      width: 19px;
      height: 19px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      border: 2px solid #071427;
      color: #fff;
      font-size: 11px;
      font-weight: 1000;
      line-height: 1;
      pointer-events: none;
      z-index: 40;
      box-shadow: 0 3px 8px rgba(0,0,0,.28);
    }

    .auth-status-badge.is-online {
      background: #22c55e;
    }

    .auth-status-badge.is-offline {
      background: #ef4444;
    }

    #logout-btn.auth-state-button {
      border-color: rgba(34,197,94,.28);
    }

    #login-btn.auth-state-button {
      border-color: rgba(239,68,68,.24);
    }

    @media (max-width: 900px) {
      .auth-status-badge {
        right: -5px;
        bottom: -5px;
        width: 17px;
        height: 17px;
        font-size: 10px;
        border-width: 2px;
      }
    }
  `;

  document.head.appendChild(style);
}

function setAuthBadge(button, isLoggedIn) {
  if (!button) return;

  button.classList.add("auth-state-button");

  let badge = button.querySelector(".auth-status-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "auth-status-badge";
    badge.setAttribute("aria-hidden", "true");
    button.appendChild(badge);
  }

  badge.classList.toggle("is-online", isLoggedIn);
  badge.classList.toggle("is-offline", !isLoggedIn);
  badge.textContent = isLoggedIn ? "✓" : "×";
}

function getTeamNameFromProfile(profile) {
  const teams = profile?.teams;
  if (!teams) return "";
  if (Array.isArray(teams)) return teams[0]?.name || "";
  return teams.name || "";
}

async function refreshAuthButtons(supabase) {
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");

  if (!loginBtn && !logoutBtn) return;

  ensureAuthStatusStyles();

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const session = data?.session || null;
    const isLoggedIn = Boolean(session?.user);

    if (loginBtn) {
      loginBtn.style.display = isLoggedIn ? "none" : "inline-flex";
      setAuthBadge(loginBtn, false);

      const label = loginBtn.querySelector(".btn-label");
      if (label) label.textContent = "Login";

      loginBtn.title = "Non connesso · Clicca per accedere";
      loginBtn.setAttribute("aria-label", "Non connesso. Clicca per accedere");
    }

    if (logoutBtn) {
      logoutBtn.style.display = isLoggedIn ? "inline-flex" : "none";
      setAuthBadge(logoutBtn, true);

      const label = logoutBtn.querySelector(".btn-label");
      if (label) label.textContent = "Connesso";

      let teamName = "";

      if (isLoggedIn) {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("team_id, teams(name)")
            .eq("id", session.user.id)
            .maybeSingle();

          teamName = getTeamNameFromProfile(profile);
        } catch (profileError) {
          console.warn("Nome squadra non disponibile nella navbar:", profileError);
        }
      }

      const connectedAs = teamName
        ? `Connesso come ${teamName}`
        : "Connesso";

      logoutBtn.title = `${connectedAs} · Clicca per uscire`;
      logoutBtn.setAttribute("aria-label", `${connectedAs}. Clicca per uscire`);

      logoutBtn.onclick = async function () {
        try {
          await supabase.auth.signOut();
        } finally {
          window.location.href = "index.html";
        }
      };
    }
  } catch (err) {
    console.warn("Controllo login non riuscito:", err);

    if (loginBtn) {
      loginBtn.style.display = "inline-flex";
      setAuthBadge(loginBtn, false);
      loginBtn.title = "Stato accesso non disponibile · Clicca per accedere";
      loginBtn.setAttribute("aria-label", "Stato accesso non disponibile. Clicca per accedere");
    }

    if (logoutBtn) {
      logoutBtn.style.display = "none";
    }
  }
}

async function updateAuthButtons() {
  try {
    const { supabase } = await import("./supabase.js");
    await refreshAuthButtons(supabase);

    if (!window.__LEGA_AUTH_STATUS_LISTENER__) {
      window.__LEGA_AUTH_STATUS_LISTENER__ = true;

      supabase.auth.onAuthStateChange(function () {
        window.setTimeout(() => {
          refreshAuthButtons(supabase);
        }, 0);
      });
    }
  } catch (err) {
    console.warn("Inizializzazione stato login non riuscita:", err);
  }
}

document.addEventListener("DOMContentLoaded", function () {
  const moreBtn = document.getElementById("mobile-more-btn");
  const morePanel = document.getElementById("mobile-more-panel");
  const moreBackdrop = document.getElementById("mobile-more-backdrop");
  const moreClose = document.getElementById("mobile-more-close");
  const mobileLogoutBtn = document.getElementById("mobile-logout-btn");

  function openMorePanel() {
    if (!morePanel) return;
    morePanel.classList.add("is-open");
    morePanel.setAttribute("aria-hidden", "false");
    document.body.classList.add("mobile-more-open");
  }

  function closeMorePanel() {
    if (!morePanel) return;
    morePanel.classList.remove("is-open");
    morePanel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("mobile-more-open");
  }

  if (moreBtn) {
    moreBtn.addEventListener("click", openMorePanel);
  }

  if (moreBackdrop) {
    moreBackdrop.addEventListener("click", closeMorePanel);
  }

  if (moreClose) {
    moreClose.addEventListener("click", closeMorePanel);
  }

  if (mobileLogoutBtn) {
    mobileLogoutBtn.addEventListener("click", async function () {
      try {
        const { supabase } = await import("./supabase.js");
        await supabase.auth.signOut();
        window.location.href = "index.html";
      } catch (err) {
        console.warn("Logout mobile non riuscito:", err);
        window.location.href = "login.html";
      }
    });
  }
});
document.addEventListener("DOMContentLoaded", function () {
  const titleBtn = document.getElementById("mobile-nav-title");
  const mainMenu = document.getElementById("mainMenu");

  if (!titleBtn || !mainMenu) return;

  titleBtn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();

    mainMenu.classList.toggle("show");
  });
});
/* =========================================================
   CENTRO NOTIFICHE GLOBALE
   ========================================================= */
document.addEventListener("DOMContentLoaded", function () {
  window.setTimeout(async () => {
    try {
      if (window.__LEGA_NOTIFICATION_CENTER_VERSION !== "20261010-center7-expand") {
        await import("./notifications-center.js?v=20261010-center7-expand");
      }
    } catch (error) {
      console.warn("Centro notifiche globale non disponibile:", error);
    }
  }, 0);
});

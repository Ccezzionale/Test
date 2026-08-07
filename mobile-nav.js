document.addEventListener("DOMContentLoaded", function () {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  function isActive(page) {
    return currentPage === page ? "active" : "";
  }

  const ADMIN_EMAIL = "tringali0511@gmail.com";

  function roseAdminMenuHTML() {
    return `
      <li id="nav-rose-normal">
        <a href="rose.html">Rose</a>
      </li>

      <li id="nav-rose-admin" class="dropdown" style="display:none;">
        <a href="#" class="toggle-submenu">
          Rose <span class="caret">▾</span>
        </a>

        <ul class="submenu">
          <li><a href="rose.html">Rose Squadre</a></li>
          <li><a href="franchigie.html">Franchigie</a></li>
          <li><a href="admin-rose.html">Admin Rose</a></li>
          <li><a href="admin-gazzetta.html">Admin Gazzetta</a></li>
        </ul>
      </li>
    `;
  }

  function ensureRoseNavigationStructure() {
    const mainMenu = document.getElementById("mainMenu");
    if (!mainMenu) return;

    let normalItem = document.getElementById("nav-rose-normal");
    let adminItem = document.getElementById("nav-rose-admin");

    if (!normalItem && !adminItem) {
      const firstRoseItem = [...mainMenu.children].find((item) => {
        const directLink = item.querySelector(":scope > a");
        return directLink && String(directLink.textContent || "").trim().toLowerCase().startsWith("rose");
      });

      if (firstRoseItem) {
        firstRoseItem.insertAdjacentHTML("beforebegin", roseAdminMenuHTML());
        firstRoseItem.remove();
      } else {
        mainMenu.insertAdjacentHTML("afterbegin", roseAdminMenuHTML());
      }

      normalItem = document.getElementById("nav-rose-normal");
      adminItem = document.getElementById("nav-rose-admin");
    }

    if (adminItem) {
      let submenu = adminItem.querySelector(".submenu");

      if (!submenu) {
        submenu = document.createElement("ul");
        submenu.className = "submenu";
        adminItem.appendChild(submenu);
      }

      if (!submenu.querySelector('a[href="rose.html"]')) {
        submenu.insertAdjacentHTML("afterbegin", '<li><a href="rose.html">Rose Squadre</a></li>');
      }

      if (!submenu.querySelector('a[href="franchigie.html"]')) {
        const roseLink = submenu.querySelector('a[href="rose.html"]');
        const roseLi = roseLink?.closest("li");

        if (roseLi) {
          roseLi.insertAdjacentHTML("afterend", '<li><a href="franchigie.html">Franchigie</a></li>');
        } else {
          submenu.insertAdjacentHTML("afterbegin", '<li><a href="franchigie.html">Franchigie</a></li>');
        }
      }
    }
  }

  async function applyRoseNavigationAccess() {
    const normalItem = document.getElementById("nav-rose-normal");
    const adminItem = document.getElementById("nav-rose-admin");

    if (!normalItem || !adminItem) return;

    normalItem.style.display = "";
    adminItem.style.display = "none";

    try {
      const { supabase } = await import("./supabase.js");
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData?.user;

      if (userError || !user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, email")
        .eq("id", user.id)
        .maybeSingle();

      const email = String(profile?.email || user.email || "").toLowerCase();
      const isAdmin = profile?.role === "admin" || email === ADMIN_EMAIL;

      if (isAdmin) {
        normalItem.style.display = "none";
        adminItem.style.display = "";
      }
    } catch (error) {
      console.warn("Impossibile verificare il menu Franchigie:", error);
    }
  }

  function ensureMobileTopNav() {
    let siteNav = document.querySelector(".site-nav");

    if (!siteNav) {
      siteNav = document.createElement("nav");
      siteNav.className = "site-nav";
      siteNav.innerHTML = `
        <div class="nav-inner">
          <div class="nav-left"></div>

          <ul class="navbar" id="mainMenu"></ul>

          <div class="nav-right hero-actions">
            <a id="trade-badge" href="trade-room.html" class="btn-hero trade-badge" aria-label="Trade Room">
              <img src="icons/nav/trade-room.webp" class="action-icon" alt="">
              <span class="btn-label">Trade Room</span>
            </a>

            <a id="login-btn" href="login.html" class="btn-hero" style="display:none;" aria-label="Login">
              <img src="icons/nav/login-logout.webp" class="action-icon" alt="">
              <span class="btn-label">Login</span>
            </a>

            <button id="logout-btn" type="button" class="btn-hero" style="display:none;" aria-label="Logout">
              <img src="icons/nav/login-logout.webp" class="action-icon" alt="">
              <span class="btn-label">Logout</span>
            </button>

            <button id="attiva-notifiche-btn" type="button" class="btn-hero warning" aria-label="Attiva notifiche">
              <img src="icons/nav/notifications.webp" class="action-icon" alt="">
              <span class="btn-label">Attiva notifiche</span>
            </button>
          </div>
        </div>
      `;

      document.body.insertAdjacentElement("afterbegin", siteNav);
    }

    let navInner = siteNav.querySelector(".nav-inner");

    if (!navInner) {
      navInner = document.createElement("div");
      navInner.className = "nav-inner";
      siteNav.appendChild(navInner);
    }

    let navLeft = siteNav.querySelector(".nav-left");

    if (!navLeft) {
      navLeft = document.createElement("div");
      navLeft.className = "nav-left";
      navInner.insertAdjacentElement("afterbegin", navLeft);
    }

    if (!navLeft.querySelector(".mobile-nav-title")) {
      navLeft.innerHTML = `
        <span id="hamburger" class="hamburger" aria-label="Apri menu">☰</span>

        <button type="button" class="mobile-nav-title" id="mobile-nav-title" aria-label="Apri menu">
          <span class="mobile-nav-logo">
            <img src="icon-192.png" alt="">
          </span>
          <span>Lega degli Eroi</span>
          <span class="mobile-nav-caret">▾</span>
        </button>

        <a href="index.html" class="brand-home desktop-home-link" aria-label="Home">
          <img src="icons/nav/home.webp" alt="" class="nav-home-icon">
        </a>
      `;
    }

    let mainMenu = document.getElementById("mainMenu");

    if (!mainMenu) {
      mainMenu = document.createElement("ul");
      mainMenu.className = "navbar";
      mainMenu.id = "mainMenu";

      const navRight = siteNav.querySelector(".nav-right");

      if (navRight) {
        navRight.insertAdjacentElement("beforebegin", mainMenu);
      } else {
        navInner.appendChild(mainMenu);
      }
    }

    if (!mainMenu.children.length) {
      mainMenu.innerHTML = `
        <li id="nav-rose-normal">
          <a href="rose.html">Rose</a>
        </li>

        <li id="nav-rose-admin" class="dropdown" style="display:none;">
          <a href="#" class="toggle-submenu">
            Rose <span class="caret">▾</span>
          </a>

          <ul class="submenu">
            <li><a href="rose.html">Rose Squadre</a></li>
            <li><a href="franchigie.html">Franchigie</a></li>
            <li><a href="admin-rose.html">Admin Rose</a></li>
            <li><a href="admin-gazzetta.html">Admin Gazzetta</a></li>
          </ul>
        </li>

        <li class="dropdown">
          <a href="#" class="toggle-submenu">
            Draft <span class="caret">▾</span>
          </a>

          <ul class="submenu">
            <li>
              <a href="pre-draft.html">
                <img src="icons/nav/pre-draft.webp" class="menu-icon" alt="">
                Pre-Draft
              </a>
            </li>

            <li>
              <a href="draft_championship.html">
                <img src="icons/nav/conf-championship.webp" class="menu-icon" alt="">
                Conf. Championship
              </a>
            </li>

            <li>
              <a href="draft_conference.html">
                <img src="icons/nav/conf-league.webp" class="menu-icon" alt="">
                Conf. League
              </a>
            </li>

            <li>
              <a href="dinamico-draft.html">
                <img src="icons/nav/draft-2026.webp" class="menu-icon" alt="">
                Draft 2027
              </a>
            </li>
          </ul>
        </li>

        <li class="dropdown competizioni">
          <a href="#" class="toggle-submenu">
            Competizioni <span class="caret">▾</span>
          </a>

          <ul class="submenu">
            <li>
              <a href="classifica.html">
                <img src="icons/nav/classifiche.webp" class="menu-icon" alt="">
                Classifiche
              </a>
            </li>

            <li>
              <a href="playoff.html">
                <img src="icons/nav/playoff.webp" class="menu-icon" alt="">
                Playoff
              </a>
            </li>

            <li>
              <a href="arena.html">
                <img src="icons/nav/highlander.webp" class="menu-icon" alt="">
                Highlander
              </a>
            </li>

            <li>
              <a href="crashoutcup.html">
                <img src="icons/nav/crashout-cup.webp" class="menu-icon" alt="">
                Crash Out Cup
              </a>
            </li>

            <li>
              <a href="crashoutplayoff.html">
                <img src="icons/nav/crashout-playoff.webp" class="menu-icon" alt="">
                Crash Out Cup - Playoff
              </a>
            </li>

            <li>
              <a href="supercoppa.html">
                <img src="icons/nav/supercoppa.webp" class="menu-icon" alt="">
                Supercoppa
              </a>
            </li>

            <li>
              <a href="allstar.html">
                <img src="icons/nav/crashout-cup.webp" class="menu-icon" alt="">
                All-Star Game
              </a>
            </li>

            <li>
              <a href="statistiche.html">
                <img src="icons/nav/statistiche.webp" class="menu-icon" alt="">
                Statistiche
              </a>
            </li>
          </ul>
        </li>

        <li><a href="waiver.html">Waiver Wire</a></li>

        <li class="dropdown">
          <a href="#" class="toggle-submenu">
            Hall of Fame <span class="caret">▾</span>
          </a>

          <ul class="submenu">
            <li>
              <a href="medagliere.html">
                <img src="icons/nav/albo-oro.webp" class="menu-icon" alt="">
                Albo d'Oro
              </a>
            </li>

            <li>
              <a href="albo.html">
                <img src="icons/nav/medagliere.webp" class="menu-icon" alt="">
                Medagliere
              </a>
            </li>
          </ul>
        </li>

        <li><a href="regolamento.html">Regolamento</a></li>
      `;
    }
  }

  function ensureMobileBottomNav() {
    if (document.querySelector(".mobile-bottom-nav")) return;

    const navHTML = `
      <nav class="mobile-bottom-nav" aria-label="Navigazione mobile">
        <a href="index.html" class="mobile-bottom-link ${isActive("index.html")}">
          <span class="mobile-bottom-icon">
            <img src="icons/nav/home.webp" alt="">
          </span>
          <span>Home</span>
        </a>

        <a href="rose.html" class="mobile-bottom-link ${isActive("rose.html")}">
          <span class="mobile-bottom-icon">
            <img src="icons/nav/rose.webp" alt="">
          </span>
          <span>Rose</span>
        </a>

        <a href="trade-room.html" class="mobile-bottom-link ${isActive("trade-room.html")}">
          <span class="mobile-bottom-icon">
            <img src="icons/nav/trade-room.webp" alt="">
          </span>
          <span>Mercato</span>
        </a>

        <a href="waiver.html" class="mobile-bottom-link ${isActive("waiver.html")}">
          <span class="mobile-bottom-icon">
            <img src="icons/nav/waiver-room.webp" alt="">
          </span>
          <span>Waiver</span>
        </a>

        <button type="button" class="mobile-bottom-link mobile-more-btn" id="mobile-more-btn">
          <span class="mobile-bottom-icon">
            <img src="icons/nav/more.webp" alt="">
          </span>
          <span>Altro</span>
        </button>
      </nav>

      <div class="mobile-more-panel" id="mobile-more-panel" aria-hidden="true">
        <div class="mobile-more-backdrop" id="mobile-more-backdrop"></div>

        <div class="mobile-more-sheet">
          <div class="mobile-more-handle"></div>

          <div class="mobile-more-head">
            <strong>Altro</strong>
            <button type="button" id="mobile-more-close" aria-label="Chiudi menu">×</button>
          </div>

          <div class="mobile-more-grid">
            <a href="dinamico-draft.html">
              <span>
                <img src="icons/nav/draft-2026.webp" alt="">
              </span>
              <strong>Draft 27-28</strong>
            </a>

            <a href="albo.html">
              <span>
                <img src="icons/nav/albo-oro.webp" alt="">
              </span>
              <strong>Medagliere</strong>
            </a>

            <a href="statistiche.html">
              <span>
                <img src="icons/nav/statistiche.webp" alt="">
              </span>
              <strong>Statistiche</strong>
            </a>

            <a href="regolamento.html">
              <span>
                <img src="icons/nav/regolamento.webp" alt="">
              </span>
              <strong>Regolamento</strong>
            </a>

            <a href="trade-room.html">
              <span>
                <img src="icons/nav/trade-room.webp" alt="">
              </span>
              <strong>Trade Room</strong>
            </a>

            <button type="button" id="mobile-logout-btn">
              <span>
                <img src="icons/nav/login-logout.webp" alt="">
              </span>
              <strong>Logout</strong>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", navHTML);
  }

  function bindMobileMorePanel() {
    const moreBtn = document.getElementById("mobile-more-btn");
    const panel = document.getElementById("mobile-more-panel");
    const closeBtn = document.getElementById("mobile-more-close");
    const backdrop = document.getElementById("mobile-more-backdrop");
    const mobileLogoutBtn = document.getElementById("mobile-logout-btn");

    function openMorePanel() {
      if (!panel) return;
      panel.classList.add("open");
      panel.setAttribute("aria-hidden", "false");
      document.body.classList.add("mobile-more-open");
    }

    function closeMorePanel() {
      if (!panel) return;
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
      document.body.classList.remove("mobile-more-open");
    }

    if (moreBtn) {
      moreBtn.addEventListener("click", openMorePanel);
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", closeMorePanel);
    }

    if (backdrop) {
      backdrop.addEventListener("click", closeMorePanel);
    }

    if (mobileLogoutBtn) {
      mobileLogoutBtn.addEventListener("click", function () {
        const desktopLogout = document.getElementById("logout-btn");

        if (desktopLogout) {
          desktopLogout.click();
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeMorePanel();
      }
    });
  }

  ensureMobileTopNav();
  ensureRoseNavigationStructure();
  applyRoseNavigationAccess();
  ensureMobileBottomNav();
  bindMobileMorePanel();
});

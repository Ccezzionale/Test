// ======================================================
// MOBILE NAV - Lega degli Eroi
// Componente unico per bottom nav mobile + pannello "Altro"
// ======================================================

document.addEventListener("DOMContentLoaded", function () {
  // Evita doppioni se una pagina contiene ancora la navbar scritta a mano.
  if (document.querySelector(".mobile-bottom-nav")) return;

  const currentPage = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

  const morePages = new Set([
    "giornale.html",
    "medagliere.html",
    "albo.html",
    "statistiche.html",
    "regolamento.html",
    "pre-draft.html",
    "draft_championship.html",
    "draft_conference.html",
    "dinamico-draft.html",
    "classifica.html",
    "playoff.html",
    "arena.html",
    "crashoutcup.html",
    "crashoutplayoff.html",
    "supercoppa.html",
    "allstar.html",
    "admin-rose.html",
    "admin-gazzetta.html"
  ]);

  function active(page) {
    return currentPage === page ? "active" : "";
  }

  function moreActive() {
    return morePages.has(currentPage) ? "active" : "";
  }

  const navHTML = `
    <nav class="mobile-bottom-nav" aria-label="Navigazione mobile">
      <a href="index.html" class="mobile-bottom-link ${active("index.html")}">
        <span class="mobile-bottom-icon">
          <img src="icons/nav/home.webp" alt="">
        </span>
        <span>Home</span>
      </a>

      <a href="rose.html" class="mobile-bottom-link ${active("rose.html")}">
        <span class="mobile-bottom-icon">
          <img src="icons/nav/rose.webp" alt="">
        </span>
        <span>Rose</span>
      </a>

      <a href="trade-room.html" class="mobile-bottom-link ${active("trade-room.html")}">
        <span class="mobile-bottom-icon">
          <img src="icons/nav/trade-room.webp" alt="">
        </span>
        <span>Mercato</span>
      </a>

      <a href="waiver.html" class="mobile-bottom-link ${active("waiver.html")}">
        <span class="mobile-bottom-icon">
          <img src="icons/nav/waiver-room.webp" alt="">
        </span>
        <span>Waiver</span>
      </a>

      <button type="button" class="mobile-bottom-link mobile-more-btn ${moreActive()}" id="mobile-more-btn" aria-expanded="false" aria-controls="mobile-more-panel">
        <span class="mobile-bottom-icon">
          <img src="icons/nav/more.webp" alt="">
        </span>
        <span>Altro</span>
      </button>
    </nav>

    <div class="mobile-more-panel" id="mobile-more-panel" aria-hidden="true">
      <div class="mobile-more-backdrop" id="mobile-more-backdrop"></div>

      <div class="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="Menu mobile altro">
        <div class="mobile-more-handle"></div>

        <div class="mobile-more-head">
          <strong>Altro</strong>
          <button type="button" id="mobile-more-close" aria-label="Chiudi menu">×</button>
        </div>

        <div class="mobile-more-grid">
          <a href="giornale.html">
            <span><img src="icons/nav/gazzetta.webp" alt=""></span>
            <strong>Gazzetta</strong>
          </a>

          <a href="classifica.html">
            <span><img src="icons/nav/classifiche.webp" alt=""></span>
            <strong>Classifiche</strong>
          </a>

          <a href="playoff.html">
            <span><img src="icons/nav/playoff.webp" alt=""></span>
            <strong>Playoff</strong>
          </a>

          <a href="allstar.html">
            <span><img src="icons/nav/allstar-banner.webp" alt=""></span>
            <strong>All-Star</strong>
          </a>

          <a href="arena.html">
            <span><img src="icons/nav/highlander.webp" alt=""></span>
            <strong>Highlander</strong>
          </a>

          <a href="crashoutcup.html">
            <span><img src="icons/nav/crashout-cup.webp" alt=""></span>
            <strong>Crash Out Cup</strong>
          </a>

          <a href="crashoutplayoff.html">
            <span><img src="icons/nav/crashout-playoff.webp" alt=""></span>
            <strong>COC Playoff</strong>
          </a>

          <a href="supercoppa.html">
            <span><img src="icons/nav/supercoppa.webp" alt=""></span>
            <strong>Supercoppa</strong>
          </a>

          <a href="medagliere.html">
            <span><img src="icons/nav/albo-oro.webp" alt=""></span>
            <strong>Hall of Fame</strong>
          </a>

          <a href="statistiche.html">
            <span><img src="icons/nav/statistiche.webp" alt=""></span>
            <strong>Statistiche</strong>
          </a>

          <a href="regolamento.html">
            <span><img src="icons/nav/regolamento.webp" alt=""></span>
            <strong>Regolamento</strong>
          </a>

          <button type="button" id="mobile-logout-btn">
            <span><img src="icons/nav/login-logout.webp" alt=""></span>
            <strong>Logout</strong>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", navHTML);

  const moreBtn = document.getElementById("mobile-more-btn");
  const panel = document.getElementById("mobile-more-panel");
  const closeBtn = document.getElementById("mobile-more-close");
  const backdrop = document.getElementById("mobile-more-backdrop");
  const mobileLogoutBtn = document.getElementById("mobile-logout-btn");

  function openMorePanel() {
    if (!panel || !moreBtn) return;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    moreBtn.setAttribute("aria-expanded", "true");
    document.body.classList.add("mobile-more-open");
  }

  function closeMorePanel() {
    if (!panel || !moreBtn) return;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    moreBtn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("mobile-more-open");
  }

  if (moreBtn) moreBtn.addEventListener("click", openMorePanel);
  if (closeBtn) closeBtn.addEventListener("click", closeMorePanel);
  if (backdrop) backdrop.addEventListener("click", closeMorePanel);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeMorePanel();
  });

  if (mobileLogoutBtn) {
    mobileLogoutBtn.addEventListener("click", function () {
      const desktopLogoutBtn = document.getElementById("logout-btn");

      if (desktopLogoutBtn) {
        desktopLogoutBtn.click();
      } else {
        window.location.href = "login.html";
      }
    });
  }
});

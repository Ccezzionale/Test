document.addEventListener("DOMContentLoaded", function () {
  const hamburger = document.getElementById("hamburger");
  const mainMenu = document.getElementById("mainMenu");
  const submenuToggles = document.querySelectorAll(".toggle-submenu");
  const isMobile = () => window.innerWidth <= 900;

  if (hamburger && mainMenu) {
    hamburger.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      mainMenu.classList.toggle("show");
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

    const nav = document.querySelector(".site-nav");
    if (nav && !nav.contains(e.target)) {
      mainMenu && mainMenu.classList.remove("show");
      document.querySelectorAll(".dropdown.show").forEach(function (item) {
        item.classList.remove("show");
      });
    }
  });

  window.addEventListener("resize", function () {
    if (!isMobile()) {
      mainMenu && mainMenu.classList.remove("show");
      document.querySelectorAll(".dropdown.show").forEach(function (item) {
        item.classList.remove("show");
      });
    }
  });

  document.querySelectorAll("#mainMenu a").forEach(function (link) {
  link.addEventListener("click", function () {
    if (!isMobile()) return;

    const isSubmenuToggle = link.classList.contains("toggle-submenu");
    if (isSubmenuToggle) return;

    if (mainMenu) mainMenu.classList.remove("show");

    document.querySelectorAll(".dropdown.show").forEach(function (item) {
      item.classList.remove("show");
    });
  });
});

  updateAuthButtons();
});

async function updateAuthButtons() {
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");

  if (!loginBtn && !logoutBtn) return;

  try {
    const { supabase } = await import("./supabase.js");
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    const isLoggedIn = !!data.session;

    if (loginBtn) loginBtn.style.display = isLoggedIn ? "none" : "inline-flex";
    if (logoutBtn) logoutBtn.style.display = isLoggedIn ? "inline-flex" : "none";

    if (logoutBtn) {
      logoutBtn.onclick = async function () {
        await supabase.auth.signOut();
        window.location.href = "index.html";
      };
    }
  } catch (err) {
    console.warn("Controllo login non riuscito:", err);

    if (loginBtn) loginBtn.style.display = "inline-flex";
    if (logoutBtn) logoutBtn.style.display = "none";
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
    moreBtn.addEventListener("click", function () {
      openMorePanel();
    });
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

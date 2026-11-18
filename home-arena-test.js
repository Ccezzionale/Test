/*
 * Home Arena test only.
 * Preview buttons change CSS atmosphere. They do NOT alter match data,
 * league settings, competition status, permissions or stored preferences.
 */
(() => {
  function init() {
    const root = document.body;
    if (!root?.classList.contains("arena-home-test")) return;
    const controls = [...document.querySelectorAll("[data-arena-choose]")];
    let manualPreview = false;

    function detectedTheme() {
      if (root.classList.contains("home-app-theme-crashout")) return "crashout";
      if (root.classList.contains("home-app-theme-highlander")) return "highlander";
      if (root.classList.contains("home-league-visual-playoff")) return "playoff";
      return "league";
    }

    function chooseTheme(next) {
      const theme = ["league","playoff","crashout","highlander"].includes(next) ? next : "league";
      root.dataset.arenaPreview = theme;
      controls.forEach(button => {
        const pressed = button.dataset.arenaChoose === theme;
        button.setAttribute("aria-pressed", pressed ? "true" : "false");
      });
    }

    controls.forEach(button => {
      button.addEventListener("click", () => {
        manualPreview = true;
        chooseTheme(button.dataset.arenaChoose);
      });
    });

    // A real competition tab restores automatic theme synchronization.
    document.getElementById("dashboard-match-tabs")?.addEventListener("click", event => {
      if (!event.target.closest("[data-match-tab]")) return;
      manualPreview = false;
      queueMicrotask(() => chooseTheme(detectedTheme()));
    });

    const observer = new MutationObserver(() => {
      if (!manualPreview) chooseTheme(detectedTheme());
    });
    observer.observe(root, {attributes:true,attributeFilter:["class"]});
    chooseTheme(detectedTheme());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
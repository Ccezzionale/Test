document.addEventListener("DOMContentLoaded", () => {
  const appContent = document.getElementById("app-content");
  if (!appContent) return;

  const homeHTML = appContent.innerHTML;
  const loadedCss = new Set(
    Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(link => link.getAttribute("href"))
  );

  function closeMobileMenu() {
    const menu = document.getElementById("mainMenu");
    if (menu) menu.classList.remove("active", "open", "show");

    document.querySelectorAll(".dropdown").forEach(drop => {
      drop.classList.remove("active", "open", "show");
    });

    document.querySelectorAll(".submenu").forEach(sub => {
      sub.classList.remove("active", "open", "show");
      sub.style.display = "";
    });
  }

  function loadPageCss(doc) {
    const stylesheets = doc.querySelectorAll('link[rel="stylesheet"]');

    stylesheets.forEach(link => {
      const href = link.getAttribute("href");
      if (!href || loadedCss.has(href)) return;

      const newLink = document.createElement("link");
      newLink.rel = "stylesheet";
      newLink.href = href;
      document.head.appendChild(newLink);

      loadedCss.add(href);
    });
  }

  function loadPageScripts(doc) {
    const scripts = doc.querySelectorAll("script[src]");

    scripts.forEach(oldScript => {
      const src = oldScript.getAttribute("src");
      if (!src) return;
      if (src.includes("spa-router.js")) return;
      if (src.includes("navbar.js")) return;
      if (src.includes("home_auth.js")) return;

      document.querySelectorAll(`script[src="${src}"]`).forEach(s => s.remove());

      const newScript = document.createElement("script");
      newScript.src = src;

      if (oldScript.type) {
        newScript.type = oldScript.type;
      }

      document.body.appendChild(newScript);
    });
  }

  async function loadPage(url, saveHistory = true) {
    try {
      closeMobileMenu();

      if (
        url === "index.html" ||
        url === "./" ||
        url === "/" ||
        url === ""
      ) {
        appContent.innerHTML = homeHTML;

        if (saveHistory) {
          history.pushState({ page: "index.html" }, "", "index.html");
        }

        window.scrollTo(0, 0);

        if (typeof initGazzettaFrame === "function") {
          initGazzettaFrame();
        }

        return;
      }

      appContent.classList.add("page-loading");

      const response = await fetch(url, { cache: "no-store" });
      const html = await response.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      loadPageCss(doc);

      const newContent =
        doc.querySelector("main") ||
        doc.querySelector("#app-content") ||
        doc.body;

      appContent.innerHTML = newContent.innerHTML;

      document.title = doc.title || "Lega degli Eroi";

      if (saveHistory) {
        history.pushState({ page: url }, "", url);
      }

      window.scrollTo(0, 0);

      setTimeout(() => {
        loadPageScripts(doc);
      }, 50);

    } catch (error) {
      console.error("Errore SPA router:", error);
      window.location.href = url;
    } finally {
      appContent.classList.remove("page-loading");
    }
  }

  document.body.addEventListener("click", e => {
    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href) return;

    if (
      href.startsWith("http") ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      return;
    }

    if (!href.endsWith(".html")) return;

    e.preventDefault();
    loadPage(href);
  });

  window.addEventListener("popstate", e => {
    const page = e.state?.page || "index.html";
    loadPage(page, false);
  });
});

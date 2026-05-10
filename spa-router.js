document.addEventListener("DOMContentLoaded", () => {
  const appContent = document.getElementById("app-content");

  if (!appContent) return;

  const homeHTML = appContent.innerHTML;

  async function caricaPagina(url, salvaStoria = true) {
    try {
      if (url === "index.html" || url === "./" || url === "/" || url === "") {
        appContent.innerHTML = homeHTML;
        if (salvaStoria) history.pushState({ page: "home" }, "", "index.html");
        window.scrollTo(0, 0);
        return;
      }

      appContent.classList.add("page-loading");

      const response = await fetch(url);
      const html = await response.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const nuovoContenuto =
        doc.querySelector("main") ||
        doc.querySelector(".page-content") ||
        doc.body;

      appContent.innerHTML = nuovoContenuto.innerHTML;

      document.title = doc.title || "Lega degli Eroi";

      if (salvaStoria) {
        history.pushState({ page: url }, "", url);
      }

      window.scrollTo(0, 0);

      ricaricaScriptPagina(doc);
    } catch (error) {
      console.error("Errore caricamento pagina:", error);
      window.location.href = url;
    } finally {
      appContent.classList.remove("page-loading");
    }
  }

  function ricaricaScriptPagina(doc) {
    const scripts = doc.querySelectorAll("script[src]");

    scripts.forEach(oldScript => {
      const src = oldScript.getAttribute("src");

      if (!src || src.includes("spa-router.js")) return;

      const nuovoScript = document.createElement("script");
      nuovoScript.src = src;
      nuovoScript.defer = true;
      document.body.appendChild(nuovoScript);
    });
  }

  document.body.addEventListener("click", e => {
    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");

    if (
      !href ||
      href.startsWith("http") ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      return;
    }

    if (!href.endsWith(".html") && href !== "index.html") return;

    e.preventDefault();
    caricaPagina(href);
  });

  window.addEventListener("popstate", e => {
    const pagina = e.state?.page || "index.html";
    caricaPagina(pagina, false);
  });
});

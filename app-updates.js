/* LEGA DEGLI EROI - Aggiornamenti condivisi, browser + PWA iOS/Android.
 * Inserire in ogni pagina HTML una sola volta (prepara_sito.py lo fa automaticamente).
 * NON gestisce l'autenticazione e NON modifica dati di gioco.
 */
(function () {
  "use strict";
  if (window.__LEGA_UPDATES_INITIALIZED__) return;
  window.__LEGA_UPDATES_INITIALIZED__ = true;

  const loaderUrl = document.currentScript?.src || new URL("app-updates.js", location.href).href;
  const base = new URL("./", loaderUrl);
  const versionUrl = new URL("app-version.json", base);
  const workerUrl = new URL("sw.js", base);
  const params = new URL(location.href).searchParams;
  const pageBuild = params.get("__appv") || "";
  const htmlBuild = document.querySelector('meta[name="lega-app-build"]')?.getAttribute("content") || "";
  const isInstalled = !!(window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true);
  const clientMode = isInstalled ? "pwa" : "browser";
  const CHECK_INTERVAL_MS = 90 * 1000;
  const SW_UPDATE_INTERVAL_MS = 2 * 60 * 1000;
  const STATUS_PERIOD_MS = 15 * 60 * 1000;
  const VERSION_REGEX = /^[a-zA-Z0-9._-]{1,72}$/;
  let currentServerBuild = "";
  let lastSWUpdate = 0;
  let lastStatus = 0;
  let dirtyForm = false;
  let checking = false;
  let pendingVersion = "";
  let overlay;
  let swRegistration;
  let lastOfflineNotice = 0;

  const hadAuthCallback = params.has("code") || params.has("token_hash") ||
    params.has("access_token") || /(?:^|&)access_token=/.test(location.hash.slice(1));

  function ready(callback) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", callback, { once: true });
    else callback();
  }

  function notice(title, explanation, buttonLabel, onClick, kind) {
    ready(() => {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "lega-update-notice";
        overlay.setAttribute("role", "status");
        overlay.style.cssText = "position:fixed;z-index:2147483646;left:12px;right:12px;bottom:12px;max-width:540px;margin:0 auto;background:#0c213b;color:#fff;border:1px solid #52718f;border-radius:14px;padding:14px 17px;box-shadow:0 10px 30px #0009;font:14px/1.45 system-ui,-apple-system,sans-serif;";
        document.body.appendChild(overlay);
      }
      overlay.replaceChildren();
      const heading = document.createElement("strong");
      heading.textContent = title;
      heading.style.display = "block";
      heading.style.marginBottom = "5px";
      const detail = document.createElement("div");
      detail.textContent = explanation;
      overlay.append(heading, detail);
      if (buttonLabel && onClick) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = buttonLabel;
        b.style.cssText = "margin-top:10px;padding:9px 13px;border-radius:9px;border:0;background:#e8f1ff;color:#10263e;font:600 14px system-ui;cursor:pointer";
        b.addEventListener("click", onClick);
        overlay.appendChild(b);
      }
      overlay.dataset.kind = kind || "info";
    });
  }

  function isDirty() {
    return dirtyForm || !!document.querySelector('[contenteditable="true"][data-dirty="true"]');
  }

  function setDirty(evt) {
    const el = evt.target;
    if (!el || typeof el.matches !== "function") return;
    if (el.matches("input:not([type=hidden]):not([type=button]):not([type=submit]),textarea,select,[contenteditable]")) dirtyForm = true;
  }
  document.addEventListener("input", setDirty, { capture: true, passive: true });
  document.addEventListener("change", setDirty, { capture: true, passive: true });
  document.addEventListener("submit", () => { dirtyForm = false; }, { capture: true });

  function refreshTo(build, forceReload = false) {
    if (!VERSION_REGEX.test(build) || hadAuthCallback) return;
    const newUrl = new URL(location.href);
    if (newUrl.searchParams.get("__appv") === build && !forceReload) return;
    if (forceReload) {
      newUrl.searchParams.set("__fix", "1");
      newUrl.searchParams.set("__fresh", String(Date.now()));
    } else {
      newUrl.searchParams.delete("__fix");
      newUrl.searchParams.delete("__fresh");
    }
    newUrl.searchParams.set("__appv", build);
    location.replace(newUrl.href);
  }

  function offerUpdate(build) {
    if (!VERSION_REGEX.test(build) || hadAuthCallback) return;
    if (pageBuild === build && htmlBuild === build) return;
    if (pageBuild === build && htmlBuild !== build) {
      // Il parametro URL dice "nuova release", ma l'HTML servito e' vecchio.
      // Un SOLO tentativo aggiuntivo, poi avviso: mai loop infinito su CDN guasta.
      if (params.get("__fix") !== "1" && !isDirty()) refreshTo(build, true);
      else notice("Versione non allineata", "Il sito sta ancora consegnando una pagina precedente. La versione corrente non puo' essere confermata.", "Riprova", () => refreshTo(build, true), "update");
      return;
    }
    pendingVersion = build;
    if (isDirty()) {
      notice("Aggiornamento disponibile", "Salva prima le modifiche o completa la votazione, poi aggiorna per usare la stessa versione degli altri.", "Aggiorna adesso", () => refreshTo(build), "update");
    } else {
      refreshTo(build);
    }
  }

  function getDeviceId() {
    const key = "lega-eroi-device-uuid";
    try {
      let value = localStorage.getItem(key);
      if (value && /^[0-9a-f-]{36}$/i.test(value)) return value;
      value = crypto.randomUUID();
      localStorage.setItem(key, value);
      return value;
    } catch (_) {
      if (!window.__LEGA_SESSION_DEVICE_ID__) window.__LEGA_SESSION_DEVICE_ID__ = crypto.randomUUID();
      return window.__LEGA_SESSION_DEVICE_ID__;
    }
  }

  function readSWVersion() {
    return new Promise((resolve) => {
      try {
        const ctrl = navigator.serviceWorker?.controller;
        if (!ctrl || typeof MessageChannel === "undefined") return resolve(null);
        const ch = new MessageChannel();
        let done = false;
        const finish = (val) => { if (done) return; done = true; ch.port1.close(); resolve(val); };
        ch.port1.onmessage = (evt) => finish(evt.data?.version || null);
        ctrl.postMessage({ type: "GET_SW_VERSION" }, [ch.port2]);
        setTimeout(() => finish(null), 1200);
      } catch (_) { resolve(null); }
    });
  }

  async function reportVersion() {
    if (!currentServerBuild || pageBuild !== currentServerBuild || htmlBuild !== currentServerBuild) return;
    if (Date.now() - lastStatus < STATUS_PERIOD_MS) return;
    lastStatus = Date.now();
    try {
      // Import dinamico senza bloccare l'avvio delle pagine o gli altri controlli.
      const { supabase } = await import(new URL("supabase.js", base).href);
      const auth = await Promise.race([
        supabase.auth.getSession(),
        new Promise((resolve) => setTimeout(() => resolve(null), 5000))
      ]);
      const userId = auth?.data?.session?.user?.id;
      if (!userId) return;
      const swVersion = await readSWVersion();
      const row = {
        user_id: userId,
        device_id: getDeviceId(),
        app_build: pageBuild,
        sw_version: swVersion,
        client_mode: clientMode,
        page_path: location.pathname.slice(0, 200),
        last_seen: new Date().toISOString()
      };
      const { error } = await supabase.from("app_client_versions")
        .upsert(row, { onConflict: "user_id,device_id" });
      if (error) console.warn("Lega: versione non registrata", error.code || error.message);
    } catch (error) {
      console.warn("Lega: telemetria versione non disponibile", error?.message || error);
    }
  }

  async function updateSW(force) {
    if (!("serviceWorker" in navigator)) return;
    if (!force && Date.now() - lastSWUpdate < SW_UPDATE_INTERVAL_MS) return;
    lastSWUpdate = Date.now();
    try {
      swRegistration = await navigator.serviceWorker.register(workerUrl.href, {
        scope: base.pathname,
        updateViaCache: "none"
      });
      await swRegistration.update();
    } catch (error) {
      console.warn("Lega: aggiornamento Service Worker non disponibile", error?.message || error);
    }
  }

  async function checkVersion() {
    if (checking || document.visibilityState === "hidden") return;
    checking = true;
    try {
      const url = new URL(versionUrl);
      url.searchParams.set("_check", String(Date.now()));
      const response = await fetch(url.href, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const json = await response.json();
      const version = json?.version;
      if (!VERSION_REGEX.test(version)) throw new Error("Versione server non valida");
      currentServerBuild = version;
      if ((version !== pageBuild || version !== htmlBuild) && !hadAuthCallback) offerUpdate(version);
      else {
        if (overlay?.dataset.kind === "offline") overlay.remove(), overlay = null;
        // Non attendere la diagnostica: un login rallentato non deve bloccare la pagina.
        void reportVersion();
      }
    } catch (error) {
      // Non forzare un refresh cieco quando manca la connessione.
      if (Date.now() - lastOfflineNotice > 30000 && !navigator.onLine) {
        lastOfflineNotice = Date.now();
        notice("Versione non verificabile", "La connessione non è disponibile. I dati potrebbero non essere aggiornati.", null, null, "offline");
      }
      console.warn("Lega: controllo versione non riuscito", error?.message || error);
    } finally { checking = false; }
  }

  async function performCheck() {
    await updateSW(false);
    await checkVersion();
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      void checkVersion();
    });
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_UPDATED") void checkVersion();
    });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void performCheck();
  });
  window.addEventListener("pageshow", () => { void performCheck(); });
  window.addEventListener("online", () => { void performCheck(); });
  setInterval(() => {
    if (document.visibilityState === "visible") void performCheck();
  }, CHECK_INTERVAL_MS);

  void performCheck();
  window.LegaUpdates = Object.freeze({
    check: performCheck,
    status: () => ({
      pageBuild, htmlBuild, serverBuild: currentServerBuild || null,
      mode: clientMode, waitingForUser: !!pendingVersion,
      page: location.pathname
    })
  });
})();

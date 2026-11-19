/* Lega degli Eroi · Global Arena V33 navigation.
 * Runs only on pages which use the shared legacy navbar, never in the Arena Home.
 * Preserves existing menu/controller nodes for authentication, roles and notifications.
 */
(function () {
  "use strict";
  if (window.__LEGA_GLOBAL_ARENA_NAV_INIT__) return;
  window.__LEGA_GLOBAL_ARENA_NAV_INIT__ = true;

  function svgIcon(name) {
    const icons = {
      rose: '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9h8M8 13h6"/>',
      draft: '<path d="M12 3l7 4v10l-7 4-7-4V7l7-4z"/><path d="M9 10h6M9 14h6M12 7v10"/>',
      competitions: '<path d="M8 3h8v4c0 4-2 6-4 6S8 11 8 7V3z"/><path d="M8 5H4v2c0 3 2 4 5 4M16 5h4v2c0 3-2 4-5 4M12 13v4m-4 4h8m-6-4h4v4"/>',
      waiver: '<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/>',
      explore: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3z"/>'
    };
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] || icons.explore) + '</svg>';
  }

  function makeNode(tag, attrs, html) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs || {})) node.setAttribute(name, String(value));
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  const mainMenuFallbackHTML = "<ul class=\"navbar\" id=\"mainMenu\">\n\n<!-- ROSE NORMALE: visibile ai non-admin -->\n<li id=\"nav-rose-normal\" class=\"dropdown\">\n  <a href=\"#\" class=\"toggle-submenu\">\n    Rose <span class=\"caret\">▾</span>\n  </a>\n\n  <ul class=\"submenu\">\n    <li>\n      <a href=\"rose.html\">\n        Rose Squadre\n      </a>\n    </li>\n\n    <li>\n      <a href=\"franchigie.html\">\n        Franchigie\n      </a>\n    </li>\n  </ul>\n</li>\n\n<!-- ROSE ADMIN: visibile solo agli admin -->\n<li id=\"nav-rose-admin\" class=\"dropdown\" style=\"display:none;\">\n  <a href=\"#\" class=\"toggle-submenu\">\n    Rose <span class=\"caret\">▾</span>\n  </a>\n\n  <ul class=\"submenu\">\n    <li>\n      <a href=\"rose.html\">\n        Rose Squadre\n      </a>\n    </li>\n\n    <li>\n      <a href=\"franchigie.html\">\n        Franchigie\n      </a>\n    </li>\n\n    <li>\n      <a href=\"admin-rose.html\">\n        Admin Rose\n      </a>\n    </li>\n\n    <li>\n      <a href=\"admin-gazzetta.html\">\n        Admin Gazzetta\n      </a>\n    </li>\n  </ul>\n</li>\n\n        <li class=\"dropdown\">\n          <a href=\"#\" class=\"toggle-submenu\">\n            Draft <span class=\"caret\">▾</span>\n          </a>\n\n          <ul class=\"submenu\">\n            <li>\n              <a href=\"pre-draft.html\">\n                <img src=\"icons/nav/pre-draft.webp\" class=\"menu-icon\" alt=\"\">\n                Pre-Draft\n              </a>\n            </li>\n\n            <li>\n              <a href=\"draft_championship.html\">\n                <img src=\"icons/nav/conf-championship.webp\" class=\"menu-icon\" alt=\"\">\n                Conf. Championship\n              </a>\n            </li>\n\n            <li>\n              <a href=\"draft_conference.html\">\n                <img src=\"icons/nav/conf-league.webp\" class=\"menu-icon\" alt=\"\">\n                Conf. League\n              </a>\n            </li>\n\n            <li>\n              <a href=\"dinamico-draft.html\">\n                <img src=\"icons/nav/draft-2026.webp\" class=\"menu-icon\" alt=\"\">\n                Draft 2027-28\n              </a>\n            </li>\n          </ul>\n        </li>\n\n        <li class=\"dropdown competizioni\">\n          <a href=\"#\" class=\"toggle-submenu\">\n            Competizioni <span class=\"caret\">▾</span>\n          </a>\n\n          <ul class=\"submenu\">\n            <li>\n              <a href=\"classifica.html\">\n                <img src=\"icons/nav/classifiche.webp\" class=\"menu-icon\" alt=\"\">\n                Classifiche\n              </a>\n            </li>\n\n            <li>\n              <a href=\"playoff.html\">\n                <img src=\"icons/nav/playoff.webp\" class=\"menu-icon\" alt=\"\">\n                Playoff\n              </a>\n            </li>\n\n            <li>\n              <a href=\"arena.html\">\n                <img src=\"icons/nav/highlander.webp\" class=\"menu-icon\" alt=\"\">\n                Highlander\n              </a>\n            </li>\n\n            <li>\n              <a href=\"crashoutcup.html\">\n                <img src=\"icons/nav/crashout-cup.webp\" class=\"menu-icon\" alt=\"\">\n                Crash Out Cup\n              </a>\n            </li>\n\n            <li>\n              <a href=\"crashoutplayoff.html\">\n                <img src=\"icons/nav/crashout-playoff.webp\" class=\"menu-icon\" alt=\"\">\n                Crash Out Cup - Playoff\n              </a>\n            </li>\n\n            <li>\n              <a href=\"supercoppa.html\">\n                <img src=\"icons/nav/supercoppa.webp\" class=\"menu-icon\" alt=\"\">\n                Supercoppa\n              </a>\n            </li>\n\n                        <li>\n              <a href=\"allstar.html\">\n                <img src=\"icons/nav/allstar.webp\" class=\"menu-icon\" alt=\"\">\n                All-Star Game\n              </a>\n            </li>\n\n            <li>\n              <a href=\"statistiche.html\">\n                <img src=\"icons/nav/statistiche.webp\" class=\"menu-icon\" alt=\"\">\n                Statistiche\n              </a>\n            </li>\n          </ul>\n        </li>\n\n        <li><a href=\"waiver.html\">Waiver Wire</a></li>\n\n<li>\n  <a href=\"hall-of-fame.html\">Hall of Fame</a>\n</li>\n\n        <li><a href=\"regolamento.html\">Regolamento</a></li>\n      </ul>";

  function ensureButton(id, tag, attrs, html) {
    let node = document.getElementById(id);
    if (!node) {
      node = makeNode(tag, { id, ...attrs }, html);
    }
    return node;
  }

  function decorateMenu(mainMenu) {
    Array.from(mainMenu.children).forEach(function (item, idx) {
      if (item.tagName !== "LI") return;
      const anchor = Array.from(item.children).find(c => c.tagName === "A");
      if (!anchor) return;
      if (!anchor.querySelector(".arena-drawer-glyph")) {
        const label = anchor.textContent.toLowerCase().trim();
        const type = label.includes("rose") ? "rose" :
          label.includes("draft") ? "draft" :
          label.includes("competizioni") ? "competitions" :
          label.includes("waiver") ? "waiver" : "explore";
        const icon = makeNode("span", { "class":"arena-drawer-glyph" }, svgIcon(type));
        anchor.prepend(icon);
      }
      const submenu = Array.from(item.children).find(c => c.classList.contains("submenu"));
      if (submenu) {
        submenu.id = "arena-v33-global-submenu-" + idx;
        anchor.setAttribute("aria-haspopup", "true");
        anchor.setAttribute("aria-expanded", "false");
        anchor.setAttribute("aria-controls", submenu.id);
      }
    });
  }

  function makeBottomDock() {
    const file = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    const dest = [
      ["index.html","premium3d-home-v31.webp","Home"],
      ["rose.html","premium3d-rose-v31.webp","Rose"],
      ["trade-room.html","premium3d-mercato-v31.webp","Mercato"],
      ["waiver.html","premium3d-waiver-v31.webp","Waiver"]
    ];
    let dock = document.querySelector(".mobile-bottom-nav") || document.querySelector(".arena-global-dock");
    if (!dock) {
      dock = document.createElement("nav");
      document.body.appendChild(dock);
    }
    dock.className = "dock arena-global-dock";
    dock.setAttribute("aria-label","Navigazione rapida");
    dock.innerHTML = dest.map(function ([href,icon,label]) {
      const active = file === href || (file === "" && href === "index.html");
      return '<a href="'+href+'"'+(active?' class="active" aria-current="page"':'')+'><img src="img/home/navbar/'+icon+'" alt=""><span>'+label+'</span></a>';
    }).join("");
    // No additional bars may cover the approved four premium buttons.
    document.querySelectorAll(".mobile-bottom-nav").forEach(el => { if (el !== dock) el.remove(); });
  }

  function init() {
    if (document.body.classList.contains("arena-reboot")) return;
    if (document.body.classList.contains("arena-global-v33")) return;

    const pageNav = document.querySelector("nav.site-nav");
    if (!pageNav) {
      // Most pages are bootstrapped by mobile-nav.js; otherwise install
      // the canonical nav and its full list of destinations.
      const fresh = makeNode("nav", { "class":"site-nav" }, '<div class="nav-inner"><div class="nav-left"></div><div class="nav-right hero-actions"></div></div>');
      document.body.insertAdjacentElement("afterbegin",fresh);
    }
    const nav = document.querySelector("nav.site-nav");
    if (!nav) return;
    let inner = nav.querySelector(".nav-inner");
    if (!inner) { inner=makeNode("div",{class:"nav-inner"}); nav.appendChild(inner); }
    let left = inner.querySelector(".nav-left");
    if (!left) { left=makeNode("div",{class:"nav-left"}); inner.prepend(left); }
    let right = inner.querySelector(".nav-right");
    if (!right) { right=makeNode("div",{class:"nav-right hero-actions"}); inner.append(right); }
    const existingMain = document.getElementById("mainMenu");
    const mainMenu = existingMain || makeNode("ul", { id:"mainMenu", class:"navbar" });
    if (!existingMain || !mainMenu.children.length) mainMenu.innerHTML=mainMenuFallbackHTML;
    mainMenu.classList.remove("show");
    mainMenu.setAttribute("aria-label","Sezioni Lega degli Eroi");

    const notification = ensureButton(
      "attiva-notifiche-btn","button",
      { type:"button", class:"btn-hero warning arena-top-action", "aria-label":"Centro notifiche" },
      '<img src="icons/nav/notifications.webp" class="action-icon" alt=""><span class="btn-label">Notifiche</span>'
    );
    notification.classList.add("arena-top-action");
    const trade = ensureButton("trade-badge","a",{href:"trade-room.html",class:"btn-hero trade-badge","aria-label":"Trade Room"},
      '<img src="icons/nav/trade-room.webp" class="action-icon" alt=""><span class="btn-label">Trade Room</span>');
    const login = ensureButton("login-btn","a",{href:"login.html",class:"btn-hero",style:"display:none;","aria-label":"Login"},
      '<img src="icons/nav/login-logout.webp" class="action-icon" alt=""><span class="btn-label">Login</span>');
    const logout = ensureButton("logout-btn","button",{type:"button",class:"btn-hero",style:"display:none;","aria-label":"Logout"},
      '<img src="icons/nav/login-logout.webp" class="action-icon" alt=""><span class="btn-label">Esci dall&#39;account</span>');

    // Move existing elements. Never clone auth/notification buttons: event
    // handlers and live Supabase badge updates must remain attached.
    left.replaceChildren(makeNode("a",{href:"index.html",class:"arena-top-brand","aria-label":"Home Arena"},
      '<img src="icon-192.png" alt=""><span class="arena-top-brand-copy"><strong>LEGA DEGLI EROI</strong><small>THE ARENA</small></span>'));
    const trigger=makeNode("button", {
      type:"button",id:"arena-menu-toggle",class:"arena-top-action arena-menu-trigger",
      "aria-label":"Apri menu Arena","aria-controls":"arena-menu-panel","aria-expanded":"false"
    },'<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>');
    right.replaceChildren(notification,trigger);
    inner.replaceChildren(left,right);
    nav.classList.add("arena-v33-header");

    const backdrop=makeNode("div",{id:"arena-menu-backdrop",class:"arena-menu-backdrop","aria-hidden":"true"});
    const panel=makeNode("aside",{id:"arena-menu-panel",class:"arena-menu-panel",role:"dialog","aria-modal":"true","aria-label":"Menu Arena","aria-hidden":"true"},String.raw`
      <div class="arena-menu-head">
        <div><small>NAVIGAZIONE</small><strong>MENU ARENA</strong></div>
        <button type="button" id="arena-menu-close" aria-label="Chiudi menu">
          <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>
        </button>
      </div>
      <div class="arena-menu-scroll">
        <div class="arena-menu-profile">
          <img id="arena-menu-team-logo" src="icon-192.png" alt="">
          <div class="arena-menu-profile-copy">
            <span>IL TUO QUARTIER GENERALE</span>
            <strong id="arena-menu-team-name">La tua franchigia</strong>
            <small id="arena-menu-team-detail">Entra per vedere la tua squadra</small>
          </div>
        </div>
        <div class="arena-menu-section-heading">ESPLORA LA LEGA</div>
        <nav class="arena-drawer-nav" aria-label="Sezioni Lega degli Eroi"></nav>
        <div class="arena-menu-section-heading arena-menu-account-heading">ACCOUNT E COLLEGAMENTI</div>
        <div class="arena-menu-account-actions"></div>
      </div>`);
    const account = panel.querySelector(".arena-menu-account-actions");
    account.append(trade,login,logout);
    panel.querySelector(".arena-drawer-nav").appendChild(mainMenu);
    document.body.append(backdrop,panel);
    decorateMenu(mainMenu);
    document.body.classList.add("arena-global-v33");
    panel.inert=true;
    makeBottomDock();

    const closeButton=panel.querySelector("#arena-menu-close");
    let previousFocus=null;
    function close() {
      if(!panel.classList.contains("is-open"))return;
      panel.classList.remove("is-open");
      backdrop.classList.remove("is-open");
      panel.setAttribute("aria-hidden","true");
      trigger.setAttribute("aria-expanded","false");
      document.body.classList.remove("arena-drawer-open");
      panel.inert=true;
      if(previousFocus&&document.contains(previousFocus))previousFocus.focus({preventScroll:true});
      else trigger.focus({preventScroll:true});
    }
    function open() {
      previousFocus=document.activeElement;
      panel.inert=false;
      panel.classList.add("is-open");
      backdrop.classList.add("is-open");
      panel.setAttribute("aria-hidden","false");
      trigger.setAttribute("aria-expanded","true");
      document.body.classList.add("arena-drawer-open");
      closeButton.focus({preventScroll:true});
    }
    trigger.addEventListener("click",()=>panel.classList.contains("is-open")?close():open());
    closeButton.addEventListener("click",close);
    backdrop.addEventListener("click",close);

    // Earlier navbar.js/mobile-nav.js handlers are intentionally bypassed
    // only for these drawer accordion toggles.
    mainMenu.addEventListener("click",function(e){
      const toggle=e.target.closest("a.toggle-submenu");
      if(!toggle||!mainMenu.contains(toggle))return;
      e.preventDefault();
      e.stopPropagation();
      const item=toggle.closest("li.dropdown");
      if(!item)return;
      const active=!item.classList.contains("arena-expanded");
      Array.from(mainMenu.children).forEach(other=>{
        other.classList.remove("arena-expanded");
        const a=Array.from(other.children).find(el=>el.tagName==="A");
        if(a?.classList.contains("toggle-submenu"))a.setAttribute("aria-expanded","false");
      });
      item.classList.toggle("arena-expanded",active);
      toggle.setAttribute("aria-expanded",String(active));
    },true);
    mainMenu.addEventListener("click",function(e){
      if(e.target.closest('a[href]:not([href="#"])'))close();
    });

    document.addEventListener("keydown",function(e){
      if(!panel.classList.contains("is-open"))return;
      if(e.key==="Escape"){e.preventDefault();close();return;}
      if(e.key!=="Tab")return;
      const all=Array.from(panel.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'))
       .filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=="hidden");
      if(!all.length)return;
      if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all[all.length-1].focus();}
      else if(!e.shiftKey&&document.activeElement===all[all.length-1]){e.preventDefault();all[0].focus();}
    });

    // Query same user/team sources as the approved Home. Failure is non-fatal.
    (async function fillProfile(){
      try {
        const {supabase}=await import("./supabase.js");
        const {data:userData}=await supabase.auth.getUser();
        if(!userData?.user)return;
        const {data:profile}=await supabase.from("profiles").select("team_id").eq("id",userData.user.id).maybeSingle();
        if(!profile?.team_id)return;
        const {data:team}=await supabase.from("teams").select("name,conference").eq("id",profile.team_id).maybeSingle();
        if(!team?.name)return;
        panel.querySelector("#arena-menu-team-name").textContent=team.name;
        panel.querySelector("#arena-menu-team-detail").textContent=team.conference||"La tua franchigia";
        const img=panel.querySelector("#arena-menu-team-logo");
        img.onerror=function(){img.onerror=null;img.src="icon-192.png";};
        img.src="img/"+encodeURIComponent(team.name)+".webp";
      }catch(e){console.warn("Profilo nav Arena:",e);}
    })();
  }

  function boot() {
    // Let mobile-nav.js, navbar.js and admin-nav.js register their original
    // controllers before moving the DOM nodes.
    window.setTimeout(init,0);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();

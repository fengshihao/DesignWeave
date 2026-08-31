  /* --- theme: 纸面主题、顶栏偏好、轻量预览 DOM --- */
  const THEMES = ["xuan", "night", "hack", "rose"];
  const THEME_KEY = "molan-theme";
  const THEME_I18N = { xuan: "themeXuan", night: "themeNight", hack: "themeHack", rose: "themeRose" };
  const THEME_TITLE = {
    xuan: "themeXuanTitle",
    night: "themeNightTitle",
    hack: "themeHackTitle",
    rose: "themeRoseTitle",
  };
  const THEME_FONTS = {
    night: "family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500",
    hack: "family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400",
    xuan: "family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500",
    rose: "family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500",
  };

  const headerPrefsState = {
    open: false,
    animToken: 0,
  };

  function isVscodeHost() {
    return document.documentElement.classList.contains("molan-host-vscode")
      || document.body.classList.contains("molan-host-vscode");
  }

  function loadThemeFonts(theme) {
    if (isVscodeHost()) return;
    const query = THEME_FONTS[theme] || THEME_FONTS.night;
    const href = "https://fonts.googleapis.com/css2?" + query + "&display=swap";
    let link = document.getElementById("molan-fonts");
    if (!link) {
      link = document.createElement("link");
      link.id = "molan-fonts";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") === href) return;
    link.href = href;
  }

  function readStoredTheme() {
    try {
      const id = localStorage.getItem(THEME_KEY);
      if (THEMES.includes(id)) return id;
    } catch (_) { /* ignore */ }
    return "night";
  }

  function paintThemeSwitch(theme) {
    document.querySelectorAll(".theme-switch [data-theme]").forEach((btn) => {
      btn.setAttribute("aria-checked", btn.getAttribute("data-theme") === theme ? "true" : "false");
    });
  }

  function applyTheme(theme, persist) {
    const next = THEMES.includes(theme) ? theme : "night";
    document.documentElement.setAttribute("data-theme", next);
    loadThemeFonts(next);
    if (persist !== false) {
      try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* ignore */ }
    }
    paintThemeSwitch(next);
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "theme", theme: next }, window.location.origin);
      }
    } catch (_) { /* ignore */ }
    try {
      scheduleMermaidThemeRefresh();
    } catch (_) { /* ignore */ }
  }

  function bindThemeSwitch(switchEl) {
    if (!switchEl || switchEl.dataset.bound) return;
    switchEl.dataset.bound = "1";
    switchEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-theme]");
      if (!btn) return;
      const id = btn.getAttribute("data-theme");
      applyTheme(id);
      toast(t("themeSwitched", { name: t(THEME_I18N[id] || id) }));
    });
  }

  function applyThemeI18n() {
    const head = document.querySelector("#headerPrefsMenu .type-head");
    if (head) head.textContent = t("prefsTheme");
    const menu = document.getElementById("headerPrefsMenu");
    if (menu) menu.setAttribute("aria-label", t("prefsAria"));
    const prefsBtn = document.getElementById("headerPrefsBtn");
    if (prefsBtn) {
      prefsBtn.title = t("prefsAria");
      prefsBtn.setAttribute("aria-label", t("prefsAria"));
    }
    document.querySelectorAll(".theme-switch").forEach((el) => {
      el.setAttribute("aria-label", t("themeAria"));
    });
    document.querySelectorAll(".theme-switch [data-theme]").forEach((el) => {
      const id = el.getAttribute("data-theme");
      if (!THEME_I18N[id]) return;
      el.title = t(THEME_TITLE[id]);
      el.setAttribute("aria-label", t(THEME_I18N[id]));
    });
  }

  function headerPrefsIsOpen() {
    const menu = document.getElementById("headerPrefsMenu");
    return !!(headerPrefsState.open && menu && !menu.hidden && menu.classList.contains("is-open"));
  }

  function openHeaderPrefs() {
    closeType();
    closeExportMenu();
    initHeaderPrefs();
    const menu = document.getElementById("headerPrefsMenu");
    const btn = document.getElementById("headerPrefsBtn");
    if (!menu || !btn) return;
    headerPrefsState.animToken += 1;
    const already = headerPrefsIsOpen();
    headerPrefsState.open = true;
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    btn.classList.add("is-on");
    if (!already) {
      menu.classList.remove("is-out", "is-open");
      void menu.offsetWidth;
      menu.classList.add("is-open");
    }
  }

  function closeHeaderPrefs() {
    const menu = document.getElementById("headerPrefsMenu");
    const btn = document.getElementById("headerPrefsBtn");
    if (!menu || menu.hidden || menu.classList.contains("is-out")) {
      headerPrefsState.open = false;
      btn?.setAttribute("aria-expanded", "false");
      btn?.classList.remove("is-on");
      return;
    }
    const token = headerPrefsState.animToken + 1;
    headerPrefsState.animToken = token;
    headerPrefsState.open = false;
    menu.classList.remove("is-open");
    menu.classList.add("is-out");
    btn?.setAttribute("aria-expanded", "false");
    btn?.classList.remove("is-on");
    const finish = () => {
      if (token !== headerPrefsState.animToken) return;
      menu.hidden = true;
      menu.classList.remove("is-out");
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    menu.addEventListener("animationend", (e) => {
      if (e.target === menu) finish();
    }, { once: true });
    window.setTimeout(finish, 280);
  }

  function toggleHeaderPrefs() {
    if (headerPrefsIsOpen()) closeHeaderPrefs();
    else openHeaderPrefs();
  }

  function initHeaderPrefs() {
    const wrap = document.getElementById("headerPrefs");
    const btn = document.getElementById("headerPrefsBtn");
    const menu = document.getElementById("headerPrefsMenu");
    if (!wrap || !btn || !menu) return;
    if (initHeaderPrefs.done) {
      applyThemeI18n();
      return;
    }
    initHeaderPrefs.done = true;
    if (!btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleHeaderPrefs();
      });
    }
    menu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("pointerdown", (e) => {
      if (e.target.closest("#headerPrefs")) return;
      closeHeaderPrefs();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeHeaderPrefs();
    });
    applyThemeI18n();
  }

  function initTheme() {
    if (initTheme.done) {
      applyThemeI18n();
      paintThemeSwitch(readStoredTheme());
      return;
    }
    initTheme.done = true;
    applyTheme(readStoredTheme(), false);
    document.querySelectorAll(".theme-switch").forEach(bindThemeSwitch);
    applyThemeI18n();
    paintThemeSwitch(readStoredTheme());
  }

  function revealVditorIcons() {
    const xlink = "http://www.w3.org/1999/xlink";
    document.querySelectorAll("use").forEach((use) => {
      const ref = use.getAttribute("href")
        || use.getAttributeNS(xlink, "href")
        || use.getAttribute("xlink:href");
      if (ref) use.setAttribute("href", ref);
    });
  }

  function ensureLitePreviewDom(vditorEl) {
    const wrap = vditorEl.parentElement;
    let host = document.getElementById("molanPreview");
    if (!host && wrap) {
      host = document.createElement("div");
      host.id = "molanPreview";
      host.className = "molan-preview vditor-preview";
      wrap.insertBefore(host, vditorEl);
    }
    let body = document.getElementById("molanPreviewBody");
    if (!body && host) {
      body = document.createElement("div");
      body.id = "molanPreviewBody";
      body.className = "vditor-reset";
      host.appendChild(body);
    }
    return { wrap, host, body };
  }

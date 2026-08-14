/**
 * 墨览浏览器工作室：选文件夹、侧栏、写回本地文件。
 * 编辑器核心见 molan-editor.js。
 */
(() => {
  const pickBtn = document.getElementById("pickBtn");
  const pickFallbackBtn = document.getElementById("pickFallbackBtn");
  const dirInput = document.getElementById("dirInput");
  const searchInput = document.getElementById("searchInput");
  const fileList = document.getElementById("fileList");
  const folderMeta = document.getElementById("folderMeta");
  const libraryTitle = document.getElementById("libraryTitle");
  const welcome = document.getElementById("welcome");
  const welcomePickBtn = document.getElementById("welcomePickBtn");
  const aphorismText = document.getElementById("aphorismText");
  const aphorismNext = document.getElementById("aphorismNext");
  const editorWrap = document.getElementById("editorWrap");
  const readerBody = document.getElementById("readerBody");
  const readerTitle = document.getElementById("readerTitle");
  const statusLeft = document.getElementById("statusLeft");
  const statusRight = document.getElementById("statusRight");
  const saveBtn = document.getElementById("saveBtn");
  const copyBtn = document.getElementById("copyBtn");

  const toast = (msg) => window.MolanEditor.toast(msg);
  const countWords = (text) => window.MolanEditor.countWords(text);
  const t = (key, vars) => (window.MolanI18n ? window.MolanI18n.t(key, vars) : key);
  const locale = () => (window.MolanI18n ? window.MolanI18n.locale() : "zh-CN");
  const THEME_I18N = { xuan: "themeXuan", night: "themeNight", hack: "themeHack", rose: "themeRose" };

  const THEMES = ["xuan", "night", "hack", "rose"];
  const THEME_KEY = "molan-theme";

  function readStoredTheme() {
    try {
      const t = localStorage.getItem(THEME_KEY);
      if (THEMES.includes(t)) return t;
    } catch (_) { /* ignore */ }
    return "xuan";
  }

  function applyTheme(theme, persist) {
    const next = THEMES.includes(theme) ? theme : "xuan";
    document.documentElement.setAttribute("data-theme", next);
    if (persist !== false) {
      try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* ignore */ }
    }
    document.querySelectorAll("#themeSwitch [data-theme]").forEach((btn) => {
      btn.setAttribute("aria-checked", btn.getAttribute("data-theme") === next ? "true" : "false");
    });
    try {
      const root = document.getElementById("vditor") || document;
      if (window.MolanEditor.refreshMermaidDiagrams) {
        window.MolanEditor.refreshMermaidDiagrams(root);
      } else {
        window.MolanEditor.applyMermaidTheme();
      }
    } catch (_) { /* ignore */ }
  }

  applyTheme(readStoredTheme(), false);
  const themeSwitch = document.getElementById("themeSwitch");
  if (themeSwitch) {
    themeSwitch.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-theme]");
      if (!btn) return;
      const id = btn.getAttribute("data-theme");
      applyTheme(id);
      toast(t("themeSwitched", { name: t(THEME_I18N[id] || id) }));
    });
  }

  function isCursorBrowser() {
    const ua = navigator.userAgent || "";
    if (/Cursor\//i.test(ua) || /\bElectron\b/i.test(ua)) return true;
    if (typeof window.acquireVsCodeApi === "function") return true;
    try {
      const origins = location.ancestorOrigins;
      if (origins) {
        for (let i = 0; i < origins.length; i++) {
          if (/vscode|cursor/i.test(origins[i] || "")) return true;
        }
      }
    } catch (_) { /* ignore */ }
    return false;
  }

  function isDebugMode() {
    try {
      const q = new URLSearchParams(location.search);
      if (q.has("debug") && q.get("debug") !== "0") return true;
    } catch (_) { /* ignore */ }
    try {
      return localStorage.getItem("molan-debug") === "1";
    } catch (_) {
      return false;
    }
  }

  const allowCompatPicker = isCursorBrowser() || isDebugMode();
  if (allowCompatPicker) {
    pickFallbackBtn.hidden = false;
    document.body.classList.add("molan-show-compat");
  }

  let files = [];
  let activePath = null;
  let folderName = "";
  let currentFolderId = null;
  let recentFolders = [];
  let folderSource = null; // "fs-access" | "legacy"
  let dirty = false;
  let baselineText = "";
  let editorApi = null;
  let editorReady = null;
  let pendingOpenPath = null;
  let openSeq = 0;

  const DB_NAME = "molan-viewer";
  const DB_STORE = "folders";
  const MAX_RECENT = 30;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbAllFolders() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPutFolder(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbDeleteFolder(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function formatRelativeTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60_000) return t("justNow");
    if (diff < 3_600_000) return t("minutesAgo", { n: Math.floor(diff / 60_000) });
    if (diff < 86_400_000) return t("hoursAgo", { n: Math.floor(diff / 3_600_000) });
    if (diff < 86_400_000 * 7) return t("daysAgo", { n: Math.floor(diff / 86_400_000) });
    return new Date(ts).toLocaleDateString(locale());
  }

  async function refreshRecentFolders() {
    try {
      const all = await idbAllFolders();
      recentFolders = all.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    } catch (err) {
      console.warn(err);
      recentFolders = [];
    }
  }

  async function rememberDirectoryHandle(handle) {
    const all = await idbAllFolders();
    let record = null;
    for (const rec of all) {
      if (rec.handle && typeof rec.handle.isSameEntry === "function") {
        try {
          if (await rec.handle.isSameEntry(handle)) {
            record = rec;
            break;
          }
        } catch (_) { /* ignore */ }
      }
    }
    if (!record) {
      record = {
        id: crypto.randomUUID(),
        name: handle.name,
        source: "fs-access",
        handle,
        lastUsed: Date.now(),
        fileCount: files.length || 0,
      };
    } else {
      record.name = handle.name;
      record.handle = handle;
      record.source = "fs-access";
      record.lastUsed = Date.now();
      record.fileCount = files.length || record.fileCount || 0;
    }
    await idbPutFolder(record);
    currentFolderId = record.id;
    await pruneRecentFolders();
    await refreshRecentFolders();
    return record;
  }

  async function rememberLegacyFolder(name, fileCount) {
    const id = "legacy:" + name;
    const all = await idbAllFolders();
    const existing = all.find((r) => r.id === id) || {
      id,
      name,
      source: "legacy",
      handle: null,
    };
    existing.lastUsed = Date.now();
    existing.fileCount = fileCount;
    existing.name = name;
    await idbPutFolder(existing);
    currentFolderId = existing.id;
    await pruneRecentFolders();
    await refreshRecentFolders();
  }

  async function pruneRecentFolders() {
    const all = await idbAllFolders();
    if (all.length <= MAX_RECENT) return;
    const sorted = all.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    await Promise.all(sorted.slice(MAX_RECENT).map((r) => idbDeleteFolder(r.id)));
  }

  async function touchCurrentFolder(fileCount) {
    if (!currentFolderId) return;
    try {
      const all = await idbAllFolders();
      const rec = all.find((r) => r.id === currentFolderId);
      if (!rec) return;
      rec.lastUsed = Date.now();
      if (typeof fileCount === "number") rec.fileCount = fileCount;
      await idbPutFolder(rec);
      await refreshRecentFolders();
    } catch (err) {
      console.warn(err);
    }
  }

  async function ensurePermission(handle, mode = "readwrite") {
    let state = "prompt";
    if (typeof handle.queryPermission === "function") {
      state = await handle.queryPermission({ mode });
    }
    if (state !== "granted" && typeof handle.requestPermission === "function") {
      state = await handle.requestPermission({ mode });
    }
    return state === "granted";
  }

  async function reopenRecentFolder(id) {
    const rec = recentFolders.find((r) => r.id === id) || (await idbAllFolders()).find((r) => r.id === id);
    if (!rec) {
      toast(t("recordMissing"));
      return;
    }
    if (rec.handle) {
      try {
        const ok = await ensurePermission(rec.handle, "readwrite");
        if (!ok) {
          toast(t("needPermission"));
          return;
        }
        statusLeft.textContent = t("openingName", { name: rec.name });
        await loadFromDirectoryHandle(rec.handle);
        return;
      } catch (err) {
        console.warn(err);
        toast(t("cannotOpenDirect"));
        return;
      }
    }
    toast(t("needReselect", { name: rec.name }));
    openCompatPicker();
  }

  async function removeRecentFolder(id, e) {
    e?.stopPropagation?.();
    await idbDeleteFolder(id);
    if (currentFolderId === id) currentFolderId = null;
    await refreshRecentFolders();
    renderSidebarList();
    toast(t("removedRecent"));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isMarkdown(name) {
    return /\.(md|markdown|mdx|mdown)$/i.test(name);
  }

  function canWriteActive() {
    const file = files.find((f) => f.path === activePath);
    return !!(file && file.handle);
  }

  function syncActiveDirtyMark() {
    if (!activePath) return;
    const btn = fileList.querySelector(`.file-item[data-path="${CSS.escape(activePath)}"]`);
    const nameEl = btn?.querySelector(".file-name");
    if (!nameEl) return;
    const file = files.find((f) => f.path === activePath);
    if (!file) return;
    const next = dirty ? `${file.name} ·` : file.name;
    if (nameEl.textContent !== next) nameEl.textContent = next;
  }

  function setDirty(next) {
    dirty = !!next;
    saveBtn.disabled = !dirty;
    if (activePath) {
      saveBtn.title = canWriteActive()
        ? t("saveWriteHint")
        : t("saveDownloadHint");
      saveBtn.textContent = canWriteActive() ? t("save") : t("downloadSave");
    }
    syncActiveDirtyMark();
  }

  function paintStatus(text) {
    const modeHint = folderSource === "legacy" ? t("downloadToDisk") : (dirty ? t("unsaved") : t("synced"));
    statusRight.textContent = `${t("wordCount", { n: countWords(text) })} · ${modeHint}`;
  }

  function updateStatusRight() {
    if (!activePath || !editorApi) {
      statusRight.textContent = folderSource === "legacy"
        ? t("compatImport")
        : (folderName || t("localOffline"));
      return;
    }
    try {
      paintStatus(editorApi.getValue());
    } catch (_) {
      statusRight.textContent = dirty ? t("unsaved") : t("localOffline");
    }
  }

  let editorIdleTimer = 0;
  function scheduleEditorIdleWork() {
    clearTimeout(editorIdleTimer);
    editorIdleTimer = setTimeout(() => {
      if (!editorApi || !activePath) return;
      try {
        const text = editorApi.getValue();
        const nextDirty = text !== baselineText;
        if (nextDirty !== dirty) setDirty(nextDirty);
        paintStatus(text);
      } catch (_) { /* ignore */ }
    }, 180);
  }

  function onEditorInput() {
    if (!activePath) return;
    if (!dirty) setDirty(true);
    scheduleEditorIdleWork();
  }

  async function ensureFileText(entry) {
    if (entry.text != null) return entry.text;
    if (entry.handle) {
      const file = await entry.handle.getFile();
      entry.text = await file.text();
      entry.size = file.size;
    } else if (entry.fileRef) {
      entry.text = await entry.fileRef.text();
    } else {
      entry.text = "";
    }
    return entry.text;
  }

  async function collectFromDirectoryHandle(rootHandle, base = "") {
    const out = [];
    for await (const [name, handle] of rootHandle.entries()) {
      const path = base ? `${base}/${name}` : name;
      if (handle.kind === "directory") {
        if (name === "node_modules" || name === ".git" || name === ".pnpm-store" || name === "dist" || name === "build") continue;
        out.push(...(await collectFromDirectoryHandle(handle, path)));
      } else if (handle.kind === "file" && isMarkdown(name)) {
        out.push({ path, name, dir: base || ".", size: 0, handle });
      }
    }
    return out;
  }

  async function loadFromDirectoryHandle(handle) {
    folderName = handle.name;
    folderSource = "fs-access";
    statusLeft.textContent = t("scanning");
    const collected = await collectFromDirectoryHandle(handle);
    setFiles(collected);
    try {
      await rememberDirectoryHandle(handle);
      await touchCurrentFolder(collected.length);
      renderSidebarList();
    } catch (err) {
      console.warn(err);
    }
  }

  function loadFromFileList(fileListObj) {
    const all = Array.from(fileListObj || []);
    const mdFiles = all.filter((f) => {
      const rel = f.webkitRelativePath || f.name || "";
      return isMarkdown(rel.split("/").pop() || f.name);
    });
    if (!mdFiles.length) {
      toast(all.length ? t("noMarkdown") : t("noFilesSelected"));
      statusLeft.textContent = t("noMarkdownRead");
      return;
    }
    const firstRel = mdFiles[0].webkitRelativePath || mdFiles[0].name;
    folderName = firstRel.split("/")[0] || t("folderLabel");
    folderSource = "legacy";
    const list = mdFiles.map((file) => {
      const rel = file.webkitRelativePath || file.name;
      const parts = rel.split("/");
      return {
        path: rel,
        name: parts[parts.length - 1],
        dir: parts.slice(0, -1).join("/") || ".",
        size: file.size,
        fileRef: file,
      };
    });
    setFiles(list);
    rememberLegacyFolder(folderName, list.length)
      .then(() => renderSidebarList())
      .catch((err) => console.warn(err));
    toast(t("compatEditable"));
  }

  function openCompatPicker() {
    dirInput.value = "";
    statusLeft.textContent = t("pickInDialog");
    dirInput.click();
  }

  function setFiles(list) {
    files = list.sort((a, b) => a.path.localeCompare(b.path, locale()));
    searchInput.value = "";
    folderMeta.classList.toggle("visible", !!files.length);
    const writeHint = folderSource === "fs-access" ? t("canWriteBack") : t("willDownload");
    folderMeta.innerHTML = files.length
      ? t("folderMeta", { name: escapeHtml(folderName), n: files.length, hint: writeHint })
      : "";
    statusLeft.textContent = files.length ? t("indexed", { n: files.length }) : t("noMarkdown");
    statusRight.textContent = folderSource === "legacy"
      ? t("compatImport")
      : (folderName || t("localOffline"));
    dirty = false;
    baselineText = "";
    activePath = null;
    renderSidebarList();
    if (files.length) openFile(files[0].path);
    else {
      showWelcome();
      toast(t("noDocsInFolder"));
    }
  }

  function syncLibraryTitle() {
    if (!libraryTitle) return;
    if (files.length) {
      libraryTitle.textContent = folderName || t("recentFolders");
      libraryTitle.classList.add("is-folder");
    } else {
      libraryTitle.textContent = t("recentFolders");
      libraryTitle.classList.remove("is-folder");
    }
  }

  function syncOpenHint() {
    const idle = !files.length && recentFolders.length === 0;
    pickBtn.classList.toggle("is-hint", idle && !allowCompatPicker);
    pickFallbackBtn.classList.toggle("is-hint", idle && allowCompatPicker && !pickFallbackBtn.hidden);
  }

  function renderRecentSection(q) {
    const matched = recentFolders.filter((r) => !q || (r.name || "").toLowerCase().includes(q));
    if (!matched.length) return "";
    let html = files.length ? `<div class="file-group-title">${t("recentFolders")}</div>` : "";
    for (const r of matched) {
      const count = typeof r.fileCount === "number" ? t("docsCount", { n: r.fileCount }) : "";
      const mode = r.handle ? t("canOpenDirect") : t("needSelectAgain");
      html += `<div class="recent-row">
        <button class="recent-item" type="button" data-recent-id="${escapeHtml(r.id)}">
          <span class="file-icon">夹</span>
          <span>
            <div class="recent-name">${escapeHtml(r.name || t("unnamed"))}</div>
            <div class="recent-meta">${count}${formatRelativeTime(r.lastUsed || 0)} · ${mode}</div>
          </span>
        </button>
        <button class="recent-remove" type="button" data-remove-recent="${escapeHtml(r.id)}" title="${escapeHtml(t("removeRecord"))}">×</button>
      </div>`;
    }
    return html;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function renderSidebarList() {
    syncLibraryTitle();
    syncOpenHint();
    const q = searchInput.value.trim().toLowerCase();
    const recentHtml = renderRecentSection(q);
    const filtered = files.filter((f) => !q || f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));

    if (!files.length) {
      if (recentHtml) {
        fileList.innerHTML = recentHtml;
        return;
      }
      const emptyHint = allowCompatPicker ? t("emptyHintCompat") : t("emptyHint");
      fileList.innerHTML = `<div class="empty-side"><span class="glyph">卷</span><p>${emptyHint}</p></div>`;
      return;
    }

    let html = recentHtml;
    if (!filtered.length) {
      html += recentHtml
        ? `<div class="empty-side" style="padding:18px 8px"><p>${t("noMatch", { q: escapeHtml(searchInput.value) })}</p></div>`
        : `<div class="empty-side"><span class="glyph">空</span><p>${t("noMatch", { q: escapeHtml(searchInput.value) })}</p></div>`;
      fileList.innerHTML = html;
      return;
    }

    const groups = new Map();
    for (const f of filtered) {
      const key = f.dir === "." || f.dir === folderName
        ? t("rootDir")
        : f.dir.replace(new RegExp("^" + escapeRegExp(folderName) + "/?"), "") || t("rootDir");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }
    html += `<div class="file-group-title">${t("currentDocs")}</div>`;
    for (const [group, items] of groups) {
      if (group !== t("rootDir")) html += `<div class="file-group-title">${escapeHtml(group)}</div>`;
      for (const f of items) {
        const dirtyMark = f.path === activePath && dirty ? " ·" : "";
        html += `<button class="file-item${f.path === activePath ? " active" : ""}" type="button" data-path="${escapeHtml(f.path)}"><span class="file-icon">文</span><span><div class="file-name">${escapeHtml(f.name)}${dirtyMark}</div><div class="file-path">${escapeHtml(f.path)}</div></span></button>`;
      }
    }
    fileList.innerHTML = html;
  }

  function setActiveFileItem(path) {
    fileList.querySelectorAll(".file-item.active").forEach((el) => el.classList.remove("active"));
    const next = fileList.querySelector(`.file-item[data-path="${CSS.escape(path)}"]`);
    if (next) next.classList.add("active");
  }

  function showWelcome() {
    if (welcome) welcome.hidden = false;
    document.querySelector(".main")?.classList.add("is-idle");
    readerBody?.classList.remove("is-editing");
    editorWrap.classList.remove("visible");
    saveBtn.hidden = true;
    copyBtn.hidden = true;
    readerTitle.textContent = "墨览";
    activePath = null;
    dirty = false;
    baselineText = "";
    clearTimeout(editorIdleTimer);
    syncOpenHint();
  }

  const APHORISM_ORDER_KEY = "molan-aphorism-order";
  const APHORISM_POS_KEY = "molan-aphorism-pos";
  let aphorismTimer = 0;

  function aphorismList() {
    const lang = window.MolanI18n ? window.MolanI18n.getLang() : "zh";
    const list = window.MolanAphorisms ? window.MolanAphorisms.list(lang) : [];
    return list.length ? list : [];
  }

  function shuffleOrder(n, avoidFirst) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (n > 1 && avoidFirst != null && arr[0] === avoidFirst) {
      const k = 1 + Math.floor(Math.random() * (n - 1));
      [arr[0], arr[k]] = [arr[k], arr[0]];
    }
    return arr;
  }

  function readAphorismState(n) {
    let order = [];
    let pos = 0;
    try {
      order = JSON.parse(localStorage.getItem(APHORISM_ORDER_KEY) || "[]");
      pos = Number(localStorage.getItem(APHORISM_POS_KEY) || "0");
    } catch (_) { /* ignore */ }
    const valid = Array.isArray(order) && order.length === n && order.every((i) => i >= 0 && i < n);
    if (!valid) {
      const last = Array.isArray(order) && order.length ? order[Math.min(Math.max(pos, 0), order.length - 1)] : null;
      order = shuffleOrder(n, last);
      pos = 0;
    } else if (!Number.isFinite(pos) || pos < 0 || pos >= order.length) {
      pos = 0;
    }
    return { order, pos };
  }

  function writeAphorismState(order, pos) {
    try {
      localStorage.setItem(APHORISM_ORDER_KEY, JSON.stringify(order));
      localStorage.setItem(APHORISM_POS_KEY, String(pos));
    } catch (_) { /* ignore */ }
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function paintAphorism(animate) {
    const list = aphorismList();
    if (!aphorismText || !list.length) return;
    const { order, pos } = readAphorismState(list.length);
    const idx = order[pos] ?? 0;
    const text = list[idx] || list[0];
    const apply = () => {
      aphorismText.textContent = text;
      aphorismText.classList.remove("is-out");
      if (animate && !prefersReducedMotion()) {
        aphorismText.classList.remove("is-in");
        void aphorismText.offsetWidth;
        aphorismText.classList.add("is-in");
      } else {
        aphorismText.classList.remove("is-in");
      }
    };
    window.clearTimeout(aphorismTimer);
    if (animate && !prefersReducedMotion() && aphorismText.textContent && aphorismText.textContent !== text) {
      aphorismText.classList.remove("is-in");
      aphorismText.classList.add("is-out");
      aphorismTimer = window.setTimeout(apply, 220);
    } else {
      apply();
    }
  }

  function advanceAphorism(animate) {
    const list = aphorismList();
    if (!list.length) return;
    let { order, pos } = readAphorismState(list.length);
    const last = order[pos];
    pos += 1;
    if (pos >= order.length) {
      order = shuffleOrder(list.length, last);
      pos = 0;
    }
    writeAphorismState(order, pos);
    paintAphorism(animate);
  }

  function initAphorism() {
    const list = aphorismList();
    if (!list.length) return;
    let hadPos = false;
    try { hadPos = localStorage.getItem(APHORISM_POS_KEY) != null; } catch (_) { /* ignore */ }
    if (hadPos) advanceAphorism(true);
    else {
      writeAphorismState(shuffleOrder(list.length), 0);
      paintAphorism(true);
    }
  }

  function confirmDiscardIfDirty() {
    if (!dirty) return true;
    return window.confirm(t("confirmDiscard"));
  }

  function ensureVditor() {
    if (editorApi) return Promise.resolve(editorApi);
    if (editorReady) return editorReady;

    editorReady = window.MolanEditor.create({
      elementId: "vditor",
      cdn: window.MolanEditor.DEFAULT_CDN,
      placeholder: t("placeholder"),
      lang: window.MolanI18n ? window.MolanI18n.vditorLang() : "zh_CN",
      onInput: () => onEditorInput(),
      onCounter: () => scheduleEditorIdleWork(),
      onSave: () => { saveActiveFile(); },
      onReady: (api) => {
        editorApi = api;
        if (pendingOpenPath) {
          const path = pendingOpenPath;
          pendingOpenPath = null;
          openFile(path, { force: true });
        }
      },
    }).then((api) => {
      editorApi = api;
      return api;
    });

    return editorReady;
  }

  async function openFile(path, opts = {}) {
    const file = files.find((f) => f.path === path);
    if (!file) return;
    if (!opts.force && path === activePath) return;
    if (!opts.force && !confirmDiscardIfDirty()) return;

    const seq = ++openSeq;
    clearTimeout(editorIdleTimer);
    if (welcome) welcome.hidden = true;
    document.querySelector(".main")?.classList.remove("is-idle");
    readerBody?.classList.add("is-editing");
    editorWrap.classList.add("visible");
    saveBtn.hidden = false;
    copyBtn.hidden = false;
    statusLeft.textContent = t("openingName", { name: file.name });

    await ensureVditor();
    if (seq !== openSeq) return;

    try {
      const text = await ensureFileText(file);
      if (seq !== openSeq) return;

      activePath = path;
      setActiveFileItem(path);
      readerTitle.textContent = file.name.replace(/\.(md|markdown|mdx|mdown)$/i, "");
      baselineText = text;
      editorApi.setValue(text, true);
      setDirty(false);
      statusLeft.textContent = `${file.name} · ${((file.size || text.length) / 1024).toFixed(1)} KB`;
      updateStatusRight();
      renderSidebarList();
      try { editorApi.focus(); } catch (_) { /* ignore */ }
    } catch (err) {
      console.warn(err);
      if (seq !== openSeq) return;
      statusLeft.textContent = t("readFail");
      toast(t("readFailToast"));
    }
  }

  function downloadMarkdown(filename, text) {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "document.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function saveActiveFile() {
    if (!activePath || !editorApi) return;
    const file = files.find((f) => f.path === activePath);
    if (!file) return;

    const text = editorApi.getValue();
    statusLeft.textContent = t("saving");

    try {
      if (file.handle) {
        const ok = await ensurePermission(file.handle, "readwrite");
        if (!ok) {
          toast(t("noWritePermission"));
          downloadMarkdown(file.name, text);
          baselineText = text;
          file.text = text;
          setDirty(false);
          updateStatusRight();
          statusLeft.textContent = `${file.name} · ${t("downloaded")}`;
          return;
        }
        const writable = await file.handle.createWritable();
        await writable.write(text);
        await writable.close();
        file.text = text;
        file.size = new Blob([text]).size;
        baselineText = text;
        setDirty(false);
        updateStatusRight();
        statusLeft.textContent = `${file.name} · ${t("saved")}`;
        toast(t("wroteBack"));
        renderSidebarList();
        return;
      }

      downloadMarkdown(file.name, text);
      file.text = text;
      baselineText = text;
      setDirty(false);
      updateStatusRight();
      statusLeft.textContent = `${file.name} · ${t("downloaded")}`;
      toast(t("compatDownloaded"));
      renderSidebarList();
    } catch (err) {
      console.warn(err);
      statusLeft.textContent = t("saveFail");
      toast(t("saveFail"));
    }
  }

  pickBtn.addEventListener("click", async () => {
    if (!confirmDiscardIfDirty()) return;
    statusLeft.textContent = t("openingPicker");
    if (typeof window.showDirectoryPicker === "function") {
      try {
        await loadFromDirectoryHandle(await showDirectoryPicker({ mode: "readwrite" }));
      } catch (err) {
        if (err && err.name === "AbortError") {
          statusLeft.textContent = t("cancelled");
          return;
        }
        console.warn(err);
        statusLeft.textContent = t("useCompat");
        toast(t("dirApiUnavailable"));
        openCompatPicker();
      }
    } else {
      toast(t("browserCompat"));
      openCompatPicker();
    }
  });

  pickFallbackBtn.addEventListener("click", () => {
    if (!confirmDiscardIfDirty()) return;
    toast(t("compatToast"));
    openCompatPicker();
  });

  welcomePickBtn?.addEventListener("click", () => {
    if (allowCompatPicker && pickFallbackBtn && !pickFallbackBtn.hidden) {
      pickFallbackBtn.click();
    } else {
      pickBtn.click();
    }
  });

  aphorismNext?.addEventListener("click", () => advanceAphorism(true));
  aphorismText?.addEventListener("click", () => advanceAphorism(true));
  aphorismText?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      advanceAphorism(true);
    }
  });

  dirInput.addEventListener("change", () => {
    if (!confirmDiscardIfDirty()) {
      dirInput.value = "";
      return;
    }
    if (dirInput.files && dirInput.files.length) loadFromFileList(dirInput.files);
  });

  let searchTimer = 0;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderSidebarList(), 80);
  });

  fileList.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-recent]");
    if (removeBtn) {
      removeRecentFolder(removeBtn.getAttribute("data-remove-recent"), e);
      return;
    }
    const recentBtn = e.target.closest("[data-recent-id]");
    if (recentBtn) {
      if (!confirmDiscardIfDirty()) return;
      reopenRecentFolder(recentBtn.getAttribute("data-recent-id"));
      return;
    }
    const btn = e.target.closest(".file-item");
    if (!btn) return;
    const path = btn.dataset.path;
    openFile(path);
  });

  saveBtn.addEventListener("click", () => saveActiveFile());

  copyBtn.addEventListener("click", async () => {
    if (!editorApi) return;
    try {
      await navigator.clipboard.writeText(editorApi.getValue());
      toast(t("copiedMd"));
    } catch {
      toast(t("copyFail"));
    }
  });

  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === "s") {
      e.preventDefault();
      saveActiveFile();
    }
    if (welcome && !welcome.hidden && e.key === "ArrowRight") {
      const tag = (e.target && e.target.tagName) || "";
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      e.preventDefault();
      advanceAphorism(true);
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  function fillLangSelect() {
    const sel = document.getElementById("langSelect");
    if (!sel || !window.MolanI18n) return;
    sel.innerHTML = "";
    window.MolanI18n.langs.forEach((lang) => {
      const opt = document.createElement("option");
      opt.value = lang.id;
      opt.textContent = lang.name;
      sel.appendChild(opt);
    });
    sel.value = window.MolanI18n.getLang();
  }

  function refreshUiCopy() {
    window.MolanI18n?.applyDom();
    if (!activePath) {
      readerTitle.textContent = "墨览";
    } else {
      const file = files.find((f) => f.path === activePath);
      if (file) {
        readerTitle.textContent = file.name.replace(/\.(md|markdown|mdx|mdown)$/i, "");
      }
      setDirty(dirty);
    }
    if (files.length) {
      const writeHint = folderSource === "fs-access" ? t("canWriteBack") : t("willDownload");
      folderMeta.innerHTML = t("folderMeta", { name: escapeHtml(folderName), n: files.length, hint: writeHint });
      statusLeft.textContent = t("indexed", { n: files.length });
    } else if (!activePath) {
      statusLeft.textContent = t("waitingFolder");
    }
    updateStatusRight();
    renderSidebarList();
    paintAphorism(false);
    try { window.MolanEditor.refreshI18n?.(); } catch (_) { /* ignore */ }
  }

  fillLangSelect();
  window.MolanI18n?.applyDom();
  showWelcome();
  initAphorism();
  const langSelect = document.getElementById("langSelect");
  if (langSelect) {
    langSelect.addEventListener("change", () => {
      window.MolanI18n.setLang(langSelect.value);
      refreshUiCopy();
      toast(t("langSwitched", { name: window.MolanI18n.meta().name }));
    });
  }

  refreshRecentFolders()
    .then(() => renderSidebarList())
    .catch((err) => console.warn(err));
})();

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
  const welcome = document.getElementById("welcome");
  const editorWrap = document.getElementById("editorWrap");
  const readerTitle = document.getElementById("readerTitle");
  const readerEyebrow = document.getElementById("readerEyebrow");
  const statusLeft = document.getElementById("statusLeft");
  const statusRight = document.getElementById("statusRight");
  const saveBtn = document.getElementById("saveBtn");
  const copyBtn = document.getElementById("copyBtn");

  const toast = (msg) => window.MolanEditor.toast(msg);
  const countWords = (text) => window.MolanEditor.countWords(text);

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
    if (diff < 60_000) return "刚刚";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)} 天前`;
    return new Date(ts).toLocaleDateString("zh-CN");
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
      toast("记录不存在");
      return;
    }
    if (rec.handle) {
      try {
        const ok = await ensurePermission(rec.handle, "readwrite");
        if (!ok) {
          toast("需要读写授权才能重新打开并保存");
          return;
        }
        statusLeft.textContent = `正在打开 ${rec.name}…`;
        await loadFromDirectoryHandle(rec.handle);
        return;
      } catch (err) {
        console.warn(err);
        toast("无法直接打开，请重新选择该文件夹");
        return;
      }
    }
    toast(`「${rec.name}」需再次选择（兼容模式无法直接恢复）`);
    openCompatPicker();
  }

  async function removeRecentFolder(id, e) {
    e?.stopPropagation?.();
    await idbDeleteFolder(id);
    if (currentFolderId === id) currentFolderId = null;
    await refreshRecentFolders();
    renderSidebarList();
    toast("已从最近记录中移除");
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

  function setDirty(next) {
    dirty = !!next;
    readerEyebrow.classList.toggle("dirty", dirty);
    if (activePath) {
      const file = files.find((f) => f.path === activePath);
      if (file) {
        readerEyebrow.textContent = dirty
          ? "未保存"
          : (file.dir === "." ? folderName || "文档" : file.dir);
      }
    }
    saveBtn.disabled = !dirty;
    if (activePath) {
      saveBtn.title = canWriteActive()
        ? "写回本地文件 (Cmd/Ctrl+S)"
        : "兼容模式：将下载 Markdown 文件 (Cmd/Ctrl+S)";
      saveBtn.textContent = canWriteActive() ? "保存" : "下载保存";
    }
    updateStatusRight();
  }

  function updateStatusRight() {
    if (!activePath || !editorApi) {
      statusRight.textContent = folderSource === "legacy"
        ? "兼容导入 · 保存将下载"
        : (folderName || "本地 · 不上云");
      return;
    }
    try {
      const text = editorApi.getValue();
      const modeHint = folderSource === "legacy" ? "下载落盘" : (dirty ? "未保存" : "已同步");
      statusRight.textContent = `${countWords(text)} 字 · ${modeHint}`;
    } catch (_) {
      statusRight.textContent = dirty ? "未保存" : "本地 · 不上云";
    }
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
        const file = await handle.getFile();
        out.push({ path, name, dir: base || ".", size: file.size, handle });
      }
    }
    return out;
  }

  async function loadFromDirectoryHandle(handle) {
    folderName = handle.name;
    folderSource = "fs-access";
    statusLeft.textContent = "正在扫描…";
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
      toast(all.length ? "未找到 Markdown 文件" : "未选择任何文件");
      statusLeft.textContent = "未读到 Markdown";
      return;
    }
    const firstRel = mdFiles[0].webkitRelativePath || mdFiles[0].name;
    folderName = firstRel.split("/")[0] || "文件夹";
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
    toast("兼容模式：可编辑，保存将下载文件");
  }

  function openCompatPicker() {
    dirInput.value = "";
    statusLeft.textContent = "请在系统对话框中选择本地文件夹…";
    dirInput.click();
  }

  function setFiles(list) {
    files = list.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
    searchInput.value = "";
    folderMeta.classList.toggle("visible", !!files.length);
    const writeHint = folderSource === "fs-access" ? "可写回" : "保存将下载";
    folderMeta.innerHTML = files.length
      ? `文件夹 <strong>${escapeHtml(folderName)}</strong> · ${files.length} 篇 · ${writeHint}`
      : "";
    statusLeft.textContent = files.length ? `已索引 ${files.length} 篇 Markdown` : "未找到 Markdown 文件";
    statusRight.textContent = folderSource === "legacy"
      ? "兼容导入 · 保存将下载"
      : (folderName || "本地 · 不上云");
    dirty = false;
    baselineText = "";
    activePath = null;
    renderSidebarList();
    if (files.length) openFile(files[0].path);
    else {
      showWelcome();
      toast("该文件夹中没有 Markdown 文档");
    }
  }

  function renderRecentSection(q) {
    const matched = recentFolders.filter((r) => !q || (r.name || "").toLowerCase().includes(q));
    if (!matched.length) return "";
    let html = `<div class="file-group-title">最近目录</div>`;
    for (const r of matched) {
      const count = typeof r.fileCount === "number" ? `${r.fileCount} 篇 · ` : "";
      const mode = r.handle ? "可直接打开" : "需再次选择";
      html += `<div class="recent-row">
        <button class="recent-item" type="button" data-recent-id="${escapeHtml(r.id)}">
          <span class="file-icon">夹</span>
          <span>
            <div class="recent-name">${escapeHtml(r.name || "未命名")}</div>
            <div class="recent-meta">${count}${formatRelativeTime(r.lastUsed || 0)} · ${mode}</div>
          </span>
        </button>
        <button class="recent-remove" type="button" data-remove-recent="${escapeHtml(r.id)}" title="移除记录">×</button>
      </div>`;
    }
    return html;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function renderSidebarList() {
    const q = searchInput.value.trim().toLowerCase();
    const recentHtml = renderRecentSection(q);
    const filtered = files.filter((f) => !q || f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));

    if (!files.length) {
      if (recentHtml) {
        fileList.innerHTML = recentHtml;
        return;
      }
      fileList.innerHTML = `<div class="empty-side"><span class="glyph">卷</span><p>Cursor 请用「兼容模式选文件夹」；Chrome 可用「选择文件夹」写回。</p></div>`;
      return;
    }

    let html = recentHtml;
    if (!filtered.length) {
      html += recentHtml
        ? `<div class="empty-side" style="padding:18px 8px"><p>当前文件夹没有匹配「${escapeHtml(searchInput.value)}」的文档。</p></div>`
        : `<div class="empty-side"><span class="glyph">空</span><p>没有匹配「${escapeHtml(searchInput.value)}」的文档。</p></div>`;
      fileList.innerHTML = html;
      return;
    }

    const groups = new Map();
    for (const f of filtered) {
      const key = f.dir === "." || f.dir === folderName
        ? "根目录"
        : f.dir.replace(new RegExp("^" + escapeRegExp(folderName) + "/?"), "") || "根目录";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }
    html += `<div class="file-group-title">当前文档</div>`;
    for (const [group, items] of groups) {
      if (group !== "根目录") html += `<div class="file-group-title">${escapeHtml(group)}</div>`;
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
    welcome.hidden = false;
    editorWrap.classList.remove("visible");
    saveBtn.hidden = true;
    copyBtn.hidden = true;
    readerEyebrow.classList.remove("dirty");
    readerEyebrow.textContent = "准备就绪";
    readerTitle.textContent = "打开文件夹，开始编辑";
    activePath = null;
    dirty = false;
    baselineText = "";
    if (editorApi) {
      try { editorApi.setValue("", true); } catch (_) { /* ignore */ }
    }
  }

  function confirmDiscardIfDirty() {
    if (!dirty) return true;
    return window.confirm("当前文档有未保存更改，确定放弃吗？");
  }

  function ensureVditor() {
    if (editorApi) return Promise.resolve(editorApi);
    if (editorReady) return editorReady;

    editorReady = window.MolanEditor.create({
      elementId: "vditor",
      cdn: window.MolanEditor.DEFAULT_CDN,
      onInput: () => {
        if (!activePath) return;
        let nextDirty = true;
        try {
          nextDirty = editorApi.getValue() !== baselineText;
        } catch (_) { /* ignore */ }
        setDirty(nextDirty);
        renderSidebarList();
      },
      onCounter: () => updateStatusRight(),
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
    welcome.hidden = true;
    editorWrap.classList.add("visible");
    saveBtn.hidden = false;
    copyBtn.hidden = false;
    statusLeft.textContent = `正在打开 ${file.name}…`;

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
      statusLeft.textContent = "读取失败";
      toast("读取文件失败");
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
    statusLeft.textContent = "正在保存…";

    try {
      if (file.handle) {
        const ok = await ensurePermission(file.handle, "readwrite");
        if (!ok) {
          toast("没有写权限，已改为下载");
          downloadMarkdown(file.name, text);
          baselineText = text;
          file.text = text;
          setDirty(false);
          statusLeft.textContent = `${file.name} · 已下载`;
          return;
        }
        const writable = await file.handle.createWritable();
        await writable.write(text);
        await writable.close();
        file.text = text;
        file.size = new Blob([text]).size;
        baselineText = text;
        setDirty(false);
        statusLeft.textContent = `${file.name} · 已保存`;
        toast("已写回本地文件");
        renderSidebarList();
        return;
      }

      downloadMarkdown(file.name, text);
      file.text = text;
      baselineText = text;
      setDirty(false);
      statusLeft.textContent = `${file.name} · 已下载`;
      toast("兼容模式：已下载 Markdown");
      renderSidebarList();
    } catch (err) {
      console.warn(err);
      statusLeft.textContent = "保存失败";
      toast("保存失败");
    }
  }

  pickBtn.addEventListener("click", async () => {
    if (!confirmDiscardIfDirty()) return;
    statusLeft.textContent = "正在打开文件夹选择…";
    if (typeof window.showDirectoryPicker === "function") {
      try {
        await loadFromDirectoryHandle(await showDirectoryPicker({ mode: "readwrite" }));
      } catch (err) {
        if (err && err.name === "AbortError") {
          statusLeft.textContent = "已取消选择";
          return;
        }
        console.warn(err);
        statusLeft.textContent = "请改用兼容模式选文件夹";
        toast("目录 API 不可用，已切换兼容模式");
        openCompatPicker();
      }
    } else {
      toast("当前浏览器使用兼容模式选文件夹");
      openCompatPicker();
    }
  });

  pickFallbackBtn.addEventListener("click", () => {
    if (!confirmDiscardIfDirty()) return;
    toast("兼容模式：传统文件选择（可编辑，保存将下载）");
    openCompatPicker();
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
      toast("已复制 Markdown 原文");
    } catch {
      toast("复制失败");
    }
  });

  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === "s") {
      e.preventDefault();
      saveActiveFile();
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  refreshRecentFolders()
    .then(() => renderSidebarList())
    .catch((err) => console.warn(err));
})();

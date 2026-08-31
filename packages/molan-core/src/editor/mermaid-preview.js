  /* --- mermaid-preview: 预览区流程图工具条与源码回填 --- */
  function bindPreviewCodeCopy() {
    if (document.documentElement.dataset.molanCodeCopy === "1") return;
    document.documentElement.dataset.molanCodeCopy = "1";
    document.addEventListener("click", async (e) => {
      const hit = e.target.closest?.(".vditor-copy");
      if (!hit) return;
      if (hit.closest(".language-mermaid, .molan-mermaid-shell, .molan-diagram-toolbar")) return;
      const pre = hit.closest("pre");
      const code = pre?.querySelector("code");
      const text = (code?.textContent || "").replace(/\n$/, "");
      if (!text) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      try {
        await copyTextToClipboard(text);
        toast(t("copiedCode"));
      } catch (err) {
        console.warn(err);
        toast(t("copyFail"));
      }
    }, true);
  }

  function mermaidCopySource(shell, getVditor) {
    let text = getMermaidSourceNear(shell);
    if (text) return text;
    const vditor = typeof getVditor === "function" ? getVditor() : null;
    if (vditor && typeof vditor.getValue === "function") {
      try {
        const sources = extractMermaidSources(vditor.getValue());
        if (sources.length) {
          const idx = getMermaidShellIndex(shell);
          return sources[idx] || sources[0] || "";
        }
      } catch (_) { /* ignore */ }
    }
    const fromMd = mermaidSourcesFromMarkdown();
    if (fromMd.length) {
      const idx = getMermaidShellIndex(shell);
      return fromMd[idx] || fromMd[0] || "";
    }
    return "";
  }

  function getMermaidSourceNear(previewEl) {
    const node = previewEl?.closest?.(".vditor-ir__node");
    const marker = node?.querySelector?.(".vditor-ir__marker--pre code.language-mermaid");
    const markerText = marker?.textContent?.trim();
    if (markerText && isValidMermaidSource(markerText)) return markerText;
    const host = previewEl?.matches?.(".language-mermaid")
      ? previewEl
      : (previewEl?.querySelector?.(".language-mermaid") || previewEl);
    const saved = host?.getAttribute?.("data-molan-source")
      || previewEl?.getAttribute?.("data-molan-source");
    if (saved && isValidMermaidSource(saved)) return saved;
    const code = previewEl?.querySelector?.("code.language-mermaid, .language-mermaid") || host;
    if (!code) return "";
    if (code.getAttribute?.("data-processed")) return "";
    const text = (code.textContent || "").trim();
    return isValidMermaidSource(text) ? text : "";
  }

  function getMermaidShellIndex(shell, root = document) {
    const host = shell?.matches?.(".language-mermaid")
      ? shell
      : (shell?.querySelector?.(".language-mermaid") || shell);
    if (!host) return -1;
    const scope = host.closest("#molanPreviewBody, .molan-preview, .vditor-ir") || root;
    const hosts = mermaidDisplayHosts(scope);
    const idx = hosts.indexOf(host);
    if (idx >= 0) return idx;
    const source = getMermaidSourceNear(shell);
    if (!source) return -1;
    const sources = mermaidSourcesFromMarkdown();
    if (!sources.length) return -1;
    return sources.findIndex((item) => item === source);
  }

  async function polishMermaidSvgs(root = document) {
    const svgs = Array.from(root.querySelectorAll?.(".language-mermaid svg, .molan-mermaid-shell svg") || [])
      .filter((svg) => svg.querySelector("foreignObject"));
    if (svgs.length) {
      await afterLayout();
      svgs.forEach((svg) => {
        try { finalizeMermaidSvg(svg); } catch (_) { /* ignore */ }
      });
    }
    stripMermaidSourceResidue(root);
  }

  function stripMermaidSourceResidue(root = document) {
    const hosts = [];
    if (root?.matches?.(".language-mermaid, .molan-mermaid-shell")) hosts.push(root);
    root.querySelectorAll?.(".language-mermaid, .molan-mermaid-shell")?.forEach((el) => hosts.push(el));
    hosts.forEach((host) => {
      if (!host.querySelector?.("svg")) return;
      Array.from(host.childNodes).forEach((node) => {
        if (node.nodeType === 3) {
          if (String(node.textContent || "").trim()) node.remove();
          return;
        }
        if (node.nodeType !== 1) return;
        if (node.tagName === "SVG" || node.classList?.contains("molan-diagram-toolbar")) return;
        if (node.querySelector?.("svg")) return;
        const text = String(node.textContent || "").trim();
        if (text && isValidMermaidSource(text)) node.remove();
      });
      if (typeof document.createTreeWalker === "function") {
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        const doomed = [];
        let node = walker.nextNode();
        while (node) {
          if (String(node.textContent || "").trim()
            && !node.parentElement?.closest("svg, .molan-diagram-toolbar")) {
            doomed.push(node);
          }
          node = walker.nextNode();
        }
        doomed.forEach((item) => item.remove());
      }
      host.setAttribute("data-processed", "true");
    });
  }

  async function polishOrDrawMermaid(root, sourceText) {
    const hasChart = () => !!root.querySelector?.(".language-mermaid svg, .molan-mermaid-shell svg");
    if (hasChart()) {
      await polishMermaidSvgs(root);
      return;
    }
    if (!markdownHasMermaid(sourceText)) return;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !hasChart()) await afterLayout();
    if (hasChart()) await polishMermaidSvgs(root);
    else await refreshMermaidDiagrams(root);
    stripMermaidSourceResidue(root);
  }

  let mermaidRenderSeq = 0;
  let mermaidRefreshChain = Promise.resolve();

  function cleanupMermaidTemp(id) {
    document.getElementById(id)?.remove();
    document.getElementById("d" + id)?.remove();
  }

  function renderMermaidSvg(source) {
    const id = "molan-mmd-" + (++mermaidRenderSeq);
    const api = global.mermaid;
    if (!api || typeof api.render !== "function") {
      return Promise.reject(new Error("mermaid.render 不可用"));
    }
    const done = (svg) => {
      cleanupMermaidTemp(id);
      return svg;
    };
    try {
      const out = api.render(id, source);
      if (out && typeof out.then === "function") {
        return out.then((result) => done(typeof result === "string" ? result : result.svg));
      }
      if (typeof out === "string") return Promise.resolve(done(out));
      if (out && out.svg) return Promise.resolve(done(out.svg));
    } catch (_) { /* mermaid 9 走回调 */ }
    return new Promise((resolve, reject) => {
      try {
        api.render(id, source, (svg) => resolve(done(svg)));
      } catch (err) {
        cleanupMermaidTemp(id);
        reject(err);
      }
    });
  }

  async function refreshMermaidDiagramsNow(root = document) {
    if (!global.mermaid || typeof mermaid.render !== "function") return;
    await whenFontsReady();
    applyMermaidTheme();
    captureMermaidSources(root);
    const fromMd = mermaidSourcesFromMarkdown();
    const hosts = mermaidDisplayHosts(root);
    let sourceIndex = 0;
    const inserted = [];
    for (let i = 0; i < hosts.length; i += 1) {
      const host = hosts[i];
      const preview = host.closest(".vditor-ir__preview") || host;
      const source = getMermaidSourceNear(preview)
        || host.getAttribute("data-molan-source")
        || fromMd[sourceIndex]
        || fromMd[i]
        || "";
      sourceIndex += 1;
      if (!isValidMermaidSource(source)) continue;
      host.setAttribute("data-molan-source", source);
      try {
        const svg = await renderMermaidSvg(source);
        const wrap = document.createElement("div");
        wrap.innerHTML = svg;
        const next = wrap.querySelector("svg");
        if (!next) continue;
        const old = host.querySelector("svg");
        if (old) old.replaceWith(next);
        else host.insertBefore(next, host.firstChild);
        host.setAttribute("data-processed", "true");
        stripMermaidSourceResidue(host);
        inserted.push(next);
      } catch (err) {
        console.warn(err);
      }
    }
    await afterLayout();
    inserted.forEach((svg) => {
      try { finalizeMermaidSvg(svg); } catch (_) { /* ignore */ }
    });
    stripMermaidSourceResidue(root);
    enhanceMermaidPreviews(root);
  }

  function refreshMermaidDiagrams(root = document) {
    const run = () => refreshMermaidDiagramsNow(root);
    mermaidRefreshChain = mermaidRefreshChain.then(run, run);
    return mermaidRefreshChain;
  }

  function findMermaidPreviewShell(fromEl) {
    if (!fromEl || !fromEl.closest) return null;
    const preview = fromEl.closest(".vditor-ir__preview");
    if (preview && preview.querySelector(".language-mermaid")) return preview;
    const lang = fromEl.closest(".language-mermaid");
    if (lang) return lang.closest("pre") || lang;
    return null;
  }

  function collapseMermaidIrNodes(root = document) {
    root.querySelectorAll?.(".vditor-ir__node--expand")?.forEach((node) => {
      if (!node.querySelector?.(".language-mermaid")) return;
      node.classList.remove("vditor-ir__node--expand");
      node.classList.remove("vditor-ir__node--hidden");
    });
  }

  function watchMermaidIrExpand(vditorRoot, ctx, lightbox, getVditor) {
    const ir = vditorRoot?.querySelector?.(".vditor-ir");
    if (!ir || ir.dataset.molanMermaidExpandGuard) return;
    ir.dataset.molanMermaidExpandGuard = "1";
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== "attributes" || m.attributeName !== "class") continue;
        const node = m.target;
        if (!node.classList?.contains("vditor-ir__node--expand")) continue;
        if (!node.querySelector?.(".language-mermaid")) continue;
        node.classList.remove("vditor-ir__node--expand");
        node.classList.remove("vditor-ir__node--hidden");
        if (document.getElementById("molanMermaidEditor")) continue;
        const shell = node.querySelector(".vditor-ir__preview") || node;
        openMermaidEditorFromShell(shell, ctx, lightbox, vditorRoot, getVditor);
      }
    });
    observer.observe(ir, { attributes: true, subtree: true, attributeFilter: ["class"] });
  }

  function openMermaidEditorFromShell(shell, ctx, lightbox, vditorRoot, getVditor) {
    const source = mermaidCopySource(shell, getVditor);
    if (!source) {
      toast(t("noMermaidSource"));
      return;
    }
    collapseMermaidIrNodes(vditorRoot || document);
    const scope = shell.closest("#molanPreviewBody, .molan-preview, .vditor-ir") || vditorRoot || document;
    const index = getMermaidShellIndex(shell, scope);
    openMermaidEditorDialog({
      source,
      onApply: (newSource) => ctx.onApplyMermaidEdit?.(index, newSource),
    });
  }

  function enhanceMermaidPreviews(root = document) {
    captureMermaidSources(root);
    const codes = root.querySelectorAll(".language-mermaid");
    codes.forEach((code) => {
      const shell = code.closest(".vditor-ir__preview") || code.closest("pre") || code;
      const source = getMermaidSourceNear(shell);
      if (source) code.setAttribute("data-molan-source", source);
      if (!shell || shell.querySelector(":scope > .molan-diagram-toolbar")) return;
      if (!shell.querySelector("svg")) return;
      if (getComputedStyle(shell).position === "static") shell.style.position = "relative";
      shell.classList.add("molan-mermaid-shell");
      const bar = document.createElement("div");
      bar.className = "molan-diagram-toolbar";
      bar.innerHTML = `
        <button type="button" class="icon-btn" data-molan-action="edit" title="${t("editSource")}" aria-label="${t("editSource")}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
        </button>
        <button type="button" class="icon-btn" data-molan-action="zoom" title="${t("viewDiagram")}" aria-label="${t("viewDiagram")}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H5a2 2 0 0 0-2 2v4"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M9 21H5a2 2 0 0 1-2-2v-4"/><path d="M15 21h4a2 2 0 0 0 2-2v-4"/></svg>
        </button>
        <button type="button" class="icon-btn" data-molan-action="copy-code" title="${t("copyCode")}" aria-label="${t("copyCode")}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2"/><rect x="4" y="8" width="12" height="12" rx="2"/></svg>
        </button>
        <button type="button" class="icon-btn" data-molan-action="copy-image" title="${t("copyImage")}" aria-label="${t("copyImage")}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M3 16l5-4 4 3 3-2 6 5"/></svg>
        </button>
      `;
      shell.appendChild(bar);
    });
  }

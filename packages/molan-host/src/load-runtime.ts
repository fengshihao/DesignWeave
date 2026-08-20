const scriptLoads = new Map<string, Promise<void>>();

function loadScript(src: string, id?: string): Promise<void> {
  const key = id || src;
  const existing = scriptLoads.get(key);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    if (id && document.getElementById(id)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    if (id) s.id = id;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptLoads.delete(key);
      reject(new Error(`加载失败: ${src}`));
    };
    document.head.appendChild(s);
  });
  scriptLoads.set(key, promise);
  return promise;
}

function ensureStylesheet(href: string, id: string) {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/** 浏览器侧加载墨览运行时（Vditor + molan-editor） */
export async function loadMolanRuntime(basePath = "/molan"): Promise<void> {
  const base = basePath.replace(/\/$/, "");
  window.__MOLAN_VDITOR_CDN__ = `${window.location.origin}${base}/vditor`;
  window.__MOLAN_LINK_BASE__ = "";

  ensureStylesheet(`${base}/vditor/dist/index.css`, "molan-vditor-css");
  ensureStylesheet(`${base}/molan.css`, "molan-core-css");

  if (typeof window.MolanEditor?.create === "function") return;

  await loadScript(`${base}/vditor/dist/js/icons/ant.js`, "vditorIconScript");
  await loadScript(`${base}/vditor/dist/method.min.js`, "vditorMethodScript");
  await loadScript(`${base}/molan-editor.js`, "molanEditorScript");
}

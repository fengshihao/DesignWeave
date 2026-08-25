#!/usr/bin/env node
/**
 * 墨览主要按钮回归：复制原文 / 流程图复制 / 灯箱 / 查找 / 主题 / 排版 / 导出菜单 / 原文 / 大纲 / 行首插入。
 * 用法（仓库根目录）：
 *   node tools/markdown-viewer/scripts/buttons-e2e.mjs
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..", "..");
const port = Number(process.env.MOLAN_E2E_PORT || 5513);
const chrome =
  process.env.CHROME_PATH
  || ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium"]
    .find((p) => existsSync(p));

if (!chrome) {
  console.error("需要 Google Chrome 或 Chromium");
  process.exit(1);
}

function loadPuppeteer() {
  const paths = [
    "puppeteer-core",
    join(repoRoot, "node_modules", "puppeteer-core"),
    "/tmp/molan-rec/node_modules/puppeteer-core",
  ];
  for (const p of paths) {
    try {
      return require(p);
    } catch {
      /* try next */
    }
  }
  console.error("请先安装 puppeteer-core：npm install --prefix /tmp/molan-rec puppeteer-core");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const ping = () => {
      http.get(url, (res) => {
        res.resume();
        resolve();
      }).on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`服务未就绪: ${url}`));
        else setTimeout(ping, 150);
      });
    };
    ping();
  });
}

const sample = [
  "# 按钮回归",
  "",
  "查找目标：alpha beta gamma",
  "",
  "```mermaid",
  "flowchart TD",
  "  A[开始] --> B{是否继续?}",
  "  B -->|是| C[完成]",
  "```",
  "",
  "```js",
  "console.log('molan-copy');",
  "```",
  "",
  "| 列 1 | 列 2 |",
  "| --- | --- |",
  "| 甲 | 乙 |",
  "",
  "第二段正文，用来悬停行首加号。",
  "",
].join("\\n");

const harness = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="night">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>buttons e2e</title>
  <link rel="stylesheet" href="./vendor/vditor/dist/index.css" />
  <link rel="stylesheet" href="./molan.css" />
  <style>
    html, body { height: 100%; margin: 0; }
    .reader-body, .editor-wrap { height: 100%; display: flex; flex-direction: column; }
    #vditor { flex: 1; min-height: 0; }
  </style>
</head>
<body>
  <header class="reader-header">
    <div class="reader-actions">
      <button class="icon-btn molan-find-btn" id="molanFindBtn" type="button" title="查找" aria-label="查找"></button>
      <button class="icon-btn" id="copyBtn" type="button" title="复制原文" aria-label="复制原文"></button>
      <div class="export-prefs" id="exportPrefs">
        <button class="icon-btn" id="pdfBtn" type="button" title="导出" aria-label="导出" aria-expanded="false" aria-haspopup="menu" aria-controls="exportMenu"></button>
        <div class="export-menu" id="exportMenu" hidden role="menu" aria-label="导出">
          <button type="button" role="menuitem" data-export="pdf">导出 PDF</button>
          <button type="button" role="menuitem" data-export="png">导出图片</button>
        </div>
      </div>
      <button class="icon-btn is-preview" id="modeBtn" type="button" title="编辑" aria-label="编辑"></button>
      <div class="type-prefs" id="typePrefs">
        <button class="icon-btn" id="typeBtn" type="button" title="排版" aria-label="排版"></button>
      </div>
      <div class="header-prefs" id="headerPrefs">
        <button class="icon-btn" id="headerPrefsBtn" type="button" title="界面配置" aria-label="界面配置"></button>
        <div class="theme-menu" id="headerPrefsMenu" hidden role="dialog" aria-label="界面配置">
          <div class="theme-switch" id="themeSwitch" role="radiogroup" aria-label="界面样式">
            <button type="button" role="radio" data-theme="xuan" aria-label="宣纸"></button>
            <button type="button" role="radio" data-theme="night" aria-label="墨夜" aria-checked="true"></button>
            <button type="button" role="radio" data-theme="hack" aria-label="终端"></button>
            <button type="button" role="radio" data-theme="rose" aria-label="胭脂"></button>
          </div>
        </div>
      </div>
    </div>
  </header>
  <div class="reader-body" id="readerBody">
    <div class="editor-wrap visible" id="editorWrap">
      <div class="molan-preview vditor-preview" id="molanPreview">
        <div class="vditor-reset" id="molanPreviewBody"></div>
      </div>
      <div id="vditor"></div>
    </div>
  </div>
  <div class="toast" id="toast"></div>
  <div class="lightbox" id="lightbox" aria-hidden="true">
    <div class="lightbox-panel" role="dialog">
      <div class="lightbox-bar">
        <div class="lightbox-actions">
          <button class="icon-btn" type="button" id="lightboxZoomOut"></button>
          <button class="icon-btn" type="button" id="lightboxZoomIn"></button>
          <button class="icon-btn" type="button" id="lightboxEdit"></button>
          <button class="icon-btn" type="button" id="lightboxReset"></button>
          <button class="icon-btn" type="button" id="lightboxCopyImage"></button>
          <button class="icon-btn" type="button" id="lightboxClose"></button>
        </div>
      </div>
      <div class="lightbox-stage" id="lightboxStage">
        <div class="lightbox-canvas" id="lightboxCanvas"></div>
      </div>
    </div>
  </div>
  <script src="./vendor/vditor/dist/method.min.js"></script>
  <script src="./molan-i18n.js"></script>
  <script src="./molan-editor.js"></script>
  <script>
    window.MolanI18n?.setLang?.("zh", false);
    window.MolanEditor.create({
      elementId: "vditor",
      defaultPreview: true,
      lang: "zh_CN",
      placeholder: "buttons e2e",
    }).then((api) => {
      window.__molan = api;
      document.getElementById("copyBtn").addEventListener("click", async () => {
        try {
          await window.MolanEditor.copyText(api.getValue());
          window.MolanEditor.toast("已复制 Markdown 原文");
        } catch (err) {
          window.MolanEditor.toast("复制失败");
        }
      });
      document.getElementById("modeBtn").addEventListener("click", async () => {
        await api.setPreview(!api.isPreview());
      });
      return api.setValue("${sample}", true);
    }).then(() => {
      document.documentElement.dataset.ready = "1";
    }).catch((err) => {
      document.documentElement.dataset.ready = "error";
      document.documentElement.dataset.error = String(err && err.message || err);
    });
  </script>
</body>
</html>
`;

async function main() {
  if (!existsSync(join(root, "vendor/vditor/dist/index.min.js"))) {
    throw new Error("缺少 vendor/vditor，请先运行 apps/vscode-molan/scripts/sync-media.mjs");
  }

  const harnessPath = join(root, ".buttons-e2e.html");
  writeFileSync(harnessPath, harness);

  const server = spawn(process.execPath, [join(root, "serve.mjs")], {
    env: { ...process.env, MOLAN_ROOT: root, MOLAN_SERVE_PORT: String(port) },
    stdio: "inherit",
  });
  const stop = () => {
    try { server.kill("SIGTERM"); } catch { /* ignore */ }
    try { unlinkSync(harnessPath); } catch { /* ignore */ }
  };
  process.on("exit", stop);
  process.on("SIGINT", () => { stop(); process.exit(1); });

  await waitForServer(`http://127.0.0.1:${port}/.buttons-e2e.html`);

  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    defaultViewport: { width: 1280, height: 900 },
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(`http://127.0.0.1:${port}`, [
    "clipboard-read",
    "clipboard-write",
  ]);
  const page = await browser.newPage();
  const failures = [];

  function assert(cond, message) {
    if (!cond) failures.push(message);
    console.log(cond ? `ok  ${message}` : `FAIL ${message}`);
  }

  async function toastText() {
    return page.evaluate(() => document.getElementById("toast")?.textContent || "");
  }

  async function hoverMermaidToolbar() {
    await page.$eval(".molan-mermaid-shell, .language-mermaid", (el) => {
      el.scrollIntoView({ block: "center" });
    });
    await page.hover(".molan-mermaid-shell, .language-mermaid");
    await page.waitForFunction(() => {
      const bar = document.querySelector(".molan-diagram-toolbar");
      return !!(bar && getComputedStyle(bar).pointerEvents !== "none");
    }, { timeout: 8000 });
  }

  try {
    await page.goto(`http://127.0.0.1:${port}/.buttons-e2e.html`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1", { timeout: 30000 });
    await page.waitForSelector("#sourceViewBtn", { timeout: 8000 });
    await sleep(400);

    assert(await page.evaluate(() => window.__molan.isPreview()) === true, "默认预览模式");

    const fallbackCopy = await page.evaluate(async () => {
      const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async () => {
        throw new Error("clipboard blocked");
      };
      try {
        await window.MolanEditor.copyText("fallback-ok");
      } finally {
        navigator.clipboard.writeText = orig;
      }
      return navigator.clipboard.readText();
    });
    assert(fallbackCopy.includes("fallback-ok"), `clipboard API 失败时降级复制，实际「${String(fallbackCopy).slice(0, 40)}」`);

    await page.click("#copyBtn");
    await sleep(200);
    const copiedMd = await page.evaluate(() => navigator.clipboard.readText());
    assert(copiedMd.includes("```mermaid"), "顶栏复制原文写入剪贴板");
    assert((await toastText()).includes("已复制"), `顶栏复制原文 toast，实际「${await toastText()}」`);

    await page.waitForSelector(".language-mermaid svg", { timeout: 25000 });
    await sleep(300);

    const fenceCopy = await page.evaluate(async () => {
      const pres = Array.from(document.querySelectorAll("pre"));
      const jsPre = pres.find((pre) => {
        const text = pre.querySelector("code")?.textContent || "";
        return text.includes("molan-copy") && !pre.querySelector(".language-mermaid");
      });
      const btn = jsPre?.querySelector(".vditor-copy") || jsPre?.querySelector(".vditor-copy span");
      if (!btn) {
        return { ok: false, error: "no .vditor-copy on js fence" };
      }
      btn.click();
      await new Promise((r) => setTimeout(r, 200));
      return { ok: true, text: await navigator.clipboard.readText() };
    });
    assert(
      fenceCopy.ok && String(fenceCopy.text || "").includes("molan-copy"),
      `代码块复制按钮应写入源码，实际 ${JSON.stringify(fenceCopy).slice(0, 120)}`,
    );

    await page.evaluate(() => {
      document.querySelectorAll("[data-molan-source]").forEach((el) => el.removeAttribute("data-molan-source"));
    });
    await hoverMermaidToolbar();
    await page.click('[data-molan-action="copy-code"]');
    await sleep(250);
    const copiedCode = await page.evaluate(() => navigator.clipboard.readText());
    assert(
      copiedCode.includes("flowchart TD") && copiedCode.includes("开始"),
      `流程图复制代码应得到 mermaid 源码，实际「${copiedCode.slice(0, 80)}」`,
    );

    await hoverMermaidToolbar();
    const imageCopy = await page.evaluate(async () => {
      const svg = document.querySelector(".language-mermaid svg");
      const blob = await window.MolanEditor.svgToPngBlob(svg);
      return { type: blob.type, size: blob.size };
    });
    assert(imageCopy.type === "image/png" && imageCopy.size > 100, `流程图栅格化 PNG，实际 ${imageCopy.type} ${imageCopy.size}`);
    await page.click('[data-molan-action="copy-image"]');
    await sleep(400);
    const imageToast = await toastText();
    assert(
      /已复制流程图图片|已改为下载|Copied diagram image|downloaded instead/i.test(imageToast),
      `流程图复制图片 toast，实际「${imageToast}」`,
    );

    await hoverMermaidToolbar();
    await page.click('[data-molan-action="zoom"]');
    await page.waitForSelector("#lightbox.open", { timeout: 5000 });
    assert(await page.evaluate(() => document.getElementById("lightbox")?.classList.contains("open")), "放大打开灯箱");
    await page.click("#lightboxCopyImage");
    await sleep(400);
    const lightboxToast = await toastText();
    assert(
      /已复制流程图图片|已改为下载|Copied diagram image|downloaded instead/i.test(lightboxToast),
      `灯箱复制图片 toast，实际「${lightboxToast}」`,
    );
    await page.click("#lightboxClose");
    await page.waitForFunction(() => !document.getElementById("lightbox")?.classList.contains("open"), { timeout: 4000 });
    assert(true, "关闭灯箱");

    await hoverMermaidToolbar();
    await page.click('[data-molan-action="edit"]');
    await page.waitForSelector("#molanMermaidEditor", { timeout: 5000 });
    const editorSrc = await page.evaluate(() => {
      return document.querySelector(".molan-mermaid-editor-source")?.value || "";
    });
    assert(
      editorSrc.includes("flowchart TD") && editorSrc.includes("开始"),
      `去掉 data-molan-source 后仍能打开流程图编辑，实际「${editorSrc.slice(0, 80)}」`,
    );
    await page.click(".molan-mermaid-editor-cancel");
    await page.waitForFunction(() => !document.getElementById("molanMermaidEditor"), { timeout: 4000 });
    assert(true, "关闭流程图编辑对话框");

    await page.click("#molanFindBtn");
    await page.waitForSelector("#molanFindBar:not([hidden])", { timeout: 5000 });
    await page.type("#molanFindInput", "alpha");
    await sleep(350);
    const findCount = await page.evaluate(() => document.getElementById("molanFindCount")?.textContent || "");
    assert(/1\/1/.test(findCount), `查找 alpha 命中，实际「${findCount}」`);
    await page.click("#molanFindClose");
    await page.waitForFunction(() => {
      const bar = document.getElementById("molanFindBar");
      return !bar || bar.hidden;
    }, { timeout: 3000 });
    assert(true, "关闭查找栏");

    await page.click("#headerPrefsBtn");
    await page.waitForSelector("#headerPrefsMenu:not([hidden])", { timeout: 3000 });
    await page.click('#themeSwitch [data-theme="xuan"]');
    await sleep(250);
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    assert(theme === "xuan", `切换宣纸主题，实际 ${theme}`);

    const typeOpen = await page.evaluate(() => {
      const before = document.querySelectorAll('link[id^="molan-reader-font-"]').length;
      document.getElementById("typeBtn")?.click();
      const after = document.querySelectorAll('link[id^="molan-reader-font-"]').length;
      const menu = document.getElementById("typeMenu");
      return {
        before,
        after,
        open: !!(menu && !menu.hidden),
      };
    });
    assert(typeOpen.open, "打开排版菜单");
    assert(
      typeOpen.after === typeOpen.before,
      `打开排版菜单不应同步拉取网络字体，打开前 ${typeOpen.before} 打开后 ${typeOpen.after}`,
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => {
      const menu = document.getElementById("typeMenu");
      return !menu || menu.hidden;
    }, { timeout: 3000 });
    assert(true, "关闭排版菜单");

    await page.click("#pdfBtn");
    await page.waitForSelector("#exportMenu:not([hidden])", { timeout: 3000 });
    const exportItems = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("#exportMenu [data-export]"))
        .map((el) => el.getAttribute("data-export"));
    });
    assert(exportItems.includes("pdf") && exportItems.includes("png"), `导出菜单含 pdf/png，实际 ${exportItems.join(",")}`);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => {
      const menu = document.getElementById("exportMenu");
      return !menu || menu.hidden;
    }, { timeout: 3000 });
    assert(true, "关闭导出菜单");

    await page.click("#sourceViewBtn");
    await page.waitForFunction(() => window.MolanEditor.source.isOpen(), { timeout: 5000 });
    assert(true, "打开查看原文");
    await page.click("#sourceViewBtn");
    await page.waitForFunction(() => !window.MolanEditor.source.isOpen(), { timeout: 5000 });
    assert(true, "关闭查看原文");

    await page.click("#outlineBtn");
    await page.waitForFunction(() => {
      const wrap = document.getElementById("editorWrap");
      return wrap?.classList.contains("is-outline-open");
    }, { timeout: 15000 });
    assert(true, "打开大纲");
    await page.click("#outlineBtn");
    await page.waitForFunction(() => {
      const wrap = document.getElementById("editorWrap");
      return wrap && !wrap.classList.contains("is-outline-open");
    }, { timeout: 5000 });
    assert(true, "关闭大纲");

    await page.evaluate(() => {
      const wrap = document.getElementById("editorWrap");
      const el = document.querySelector("#molanPreviewBody p:last-of-type");
      el.scrollIntoView({ block: "center" });
      const b = el.getBoundingClientRect();
      const x = b.left + 16;
      const y = b.bottom + 10;
      wrap.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        clientX: x,
        clientY: y,
        view: window,
      }));
      window.__molanInsertPoint = { x, y };
    });
    const insertPoint = await page.evaluate(() => window.__molanInsertPoint);
    await page.mouse.move(insertPoint.x, insertPoint.y);
    await sleep(80);
    await page.mouse.move(insertPoint.x + 1, insertPoint.y);
    await page.waitForSelector(".molan-block-insert:not([hidden])", { timeout: 5000 });
    await page.click(".molan-block-plus");
    await page.waitForSelector(".molan-insert-menu:not([hidden])", { timeout: 4000 });
    const insertIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("[data-insert-id]")).map((el) => el.getAttribute("data-insert-id"));
    });
    assert(
      ["table", "code", "math", "mermaid", "image", "task"].every((id) => insertIds.includes(id)),
      `行首插入菜单项，实际 ${insertIds.join(",")}`,
    );
    await page.keyboard.press("Escape");

    await page.click("#modeBtn");
    await page.waitForFunction(() => window.__molan.isPreview() === false, { timeout: 20000 });
    assert(true, "切换到编辑模式");
    await page.click("#modeBtn");
    await page.waitForFunction(() => window.__molan.isPreview() === true, { timeout: 15000 });
    assert(true, "切回预览模式");
  } catch (err) {
    try {
      await page.screenshot({ path: "/tmp/molan-buttons-e2e.png", fullPage: true });
      console.error("失败截图 /tmp/molan-buttons-e2e.png");
    } catch { /* ignore */ }
    failures.push(err.stack || String(err));
  } finally {
    await browser.close();
    stop();
  }

  if (failures.length) {
    console.error("\n按钮回归失败:\n" + failures.map((f) => `- ${f}`).join("\n"));
    process.exit(1);
  }
  console.log("\n按钮回归通过");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

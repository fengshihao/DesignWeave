#!/usr/bin/env node
/**
 * 编辑器核心路径回归：预览/编辑切换、查找、主题。
 * 用法（仓库根目录）：
 *   node tools/markdown-viewer/scripts/editor-e2e.mjs
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
const port = Number(process.env.MOLAN_E2E_PORT || 5512);
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

const harness = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="night">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>editor e2e</title>
  <link rel="stylesheet" href="./vendor/vditor/dist/index.css" />
  <link rel="stylesheet" href="./molan.css" />
  <style>
    html, body { height: 100%; margin: 0; }
    .editor-wrap { height: 100%; display: flex; flex-direction: column; }
    #vditor { flex: 1; min-height: 0; }
  </style>
</head>
<body>
  <header class="reader-header">
    <div class="reader-actions">
      <button class="icon-btn molan-find-btn" id="molanFindBtn" type="button" title="查找" aria-label="查找"></button>
      <button class="icon-btn is-preview" id="modeBtn" type="button" title="编辑" aria-label="编辑"></button>
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
  <div class="editor-wrap visible" id="editorWrap">
    <div id="vditor"></div>
  </div>
  <div class="toast" id="toast"></div>
  <script src="./vendor/vditor/dist/method.min.js"></script>
  <script src="./molan-i18n.js"></script>
  <script src="./molan-editor.js"></script>
  <script>
    window.MolanEditor.create({
      elementId: "vditor",
      defaultPreview: true,
      lang: "zh_CN",
      placeholder: "editor e2e",
    }).then((api) => {
      window.__molan = api;
      return api.setValue("# 墨览回归\\n\\n查找目标：alpha beta gamma\\n\\n第二段文字。", true);
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

  const harnessPath = join(root, ".editor-e2e.html");
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

  await waitForServer(`http://127.0.0.1:${port}/.editor-e2e.html`);

  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    defaultViewport: { width: 1280, height: 800 },
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const failures = [];

  function assert(cond, message) {
    if (!cond) failures.push(message);
    console.log(cond ? `ok  ${message}` : `FAIL ${message}`);
  }

  try {
    await page.goto(`http://127.0.0.1:${port}/.editor-e2e.html`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1", { timeout: 30000 });
    await sleep(400);

    const previewFirst = await page.evaluate(() => window.__molan.isPreview());
    assert(previewFirst === true, "默认处于预览模式");

    await page.evaluate(async () => {
      await window.__molan.setValue(
        "# 流程图\n\n```mermaid\nflowchart TD\n  A[开始] --> B{是否继续?}\n  B -->|是| C[完成]\n  B -->|否| D[结束]\n```\n",
        true,
      );
    });
    await page.waitForSelector(".language-mermaid svg", { timeout: 25000 });
    await sleep(400);
    const copyResult = await page.evaluate(async () => {
      const svg = document.querySelector(".language-mermaid svg");
      if (!svg) return { ok: false, error: "no svg" };
      const foCount = svg.querySelectorAll("foreignObject").length;
      try {
        const blob = await window.MolanEditor.svgToPngBlob(svg);
        return {
          ok: true,
          foCount,
          type: blob.type,
          size: blob.size,
          stillFo: svg.querySelectorAll("foreignObject").length,
        };
      } catch (err) {
        return {
          ok: false,
          foCount,
          error: String(err && err.message || err),
          name: err && err.name,
        };
      }
    });
    assert(copyResult.foCount > 0, `预览流程图应使用 HTML 标签（foreignObject），实际 ${copyResult.foCount}`);
    assert(copyResult.ok, `复制流程图不应污染 canvas，实际 ${copyResult.name || ""} ${copyResult.error || ""}`);
    assert(copyResult.type === "image/png", `导出应为 PNG，实际 ${copyResult.type}`);
    assert(copyResult.size > 100, `PNG 不应为空，实际 ${copyResult.size} bytes`);
    assert(copyResult.stillFo === copyResult.foCount, "导出不得改动页面上的流程图 SVG");

    // 本 harness 不加载 molan-app.js，预览/编辑切换走编辑器 API。
    await page.evaluate(async () => {
      await window.__molan.setValue("# 墨览回归\n\n查找目标：alpha beta gamma\n\n第二段文字。", true);
      await window.__molan.setPreview(false);
    });
    await page.waitForFunction(() => window.__molan && !window.__molan.isPreview(), { timeout: 20000 });
    await sleep(500);
    assert(await page.evaluate(() => !window.__molan.isPreview()), "setPreview(false) 进入编辑模式");

    await page.evaluate(() => {
      const api = window.__molan;
      const cur = api.getValue();
      api.setValue(cur + "\\n\\n追加一行。", false);
    });
    await sleep(300);
    const hasAppended = await page.evaluate(() => (window.__molan.getValue() || "").includes("追加一行"));
    assert(hasAppended, "编辑模式下 setValue 生效");

    await page.evaluate(async () => {
      await window.__molan.setPreview(true);
    });
    await page.waitForFunction(() => window.__molan && window.__molan.isPreview(), { timeout: 15000 });
    assert(await page.evaluate(() => window.__molan.isPreview()), "setPreview(true) 回到预览模式");

    await page.keyboard.down("Meta");
    await page.keyboard.press("f");
    await page.keyboard.up("Meta");
    await page.waitForSelector("#molanFindBar:not([hidden])", { timeout: 5000 });
    await page.type("#molanFindInput", "alpha");
    await sleep(350);
    const findCount = await page.evaluate(() => document.getElementById("molanFindCount")?.textContent || "");
    assert(/1\/1/.test(findCount), `查找 alpha 应命中 1 处，实际「${findCount}」`);

    await page.click("#molanFindClose");
    await page.waitForFunction(() => {
      const bar = document.getElementById("molanFindBar");
      return !bar || bar.hidden;
    }, { timeout: 3000 });
    const findHidden = await page.evaluate(() => {
      const bar = document.getElementById("molanFindBar");
      return !bar || bar.hidden;
    });
    assert(findHidden, "关闭查找栏");

    await page.click("#headerPrefsBtn");
    await page.waitForSelector("#headerPrefsMenu:not([hidden])", { timeout: 3000 });
    await page.click('#themeSwitch [data-theme="hack"]');
    await sleep(250);
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    assert(theme === "hack", `切换终端主题，实际 data-theme=${theme}`);
  } catch (err) {
    failures.push(err.stack || String(err));
  } finally {
    await browser.close();
    stop();
  }

  if (failures.length) {
    console.error("\n编辑器回归失败:\n" + failures.map((f) => `- ${f}`).join("\n"));
    process.exit(1);
  }
  console.log("\n编辑器回归通过");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

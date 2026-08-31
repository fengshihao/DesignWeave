#!/usr/bin/env node
/**
 * 流程图节点文字不得超出边框；实例演示里的图下不得露出 Mermaid 源码。
 * 模拟窄纸面、高 DPI、中文字体，覆盖 Windows / VS Code webview 上的溢出。
 * 用法（仓库根目录）：
 *   node tools/markdown-viewer/scripts/mermaid-e2e.mjs
 */
import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { findChromePath, loadPuppeteer, requireChromePath } from "./e2e-chrome.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..", "..");
const port = Number(process.env.MOLAN_E2E_PORT || 5514);
const chrome = findChromePath() || requireChromePath();
const shotDir = join(root, ".e2e-shots");

const sample = [
  "# 流程图溢出",
  "",
  "```mermaid",
  "flowchart TD",
  "  A[用户提交订单请求] --> B[订单服务校验参数]",
  "  B --> C{库存是否充足?}",
  "  C -->|库存不足| D[返回失败并提示补货]",
  "  C -->|库存充足| E[锁定库存并生成预扣记录]",
  "  E --> F[调用支付网关创建支付单]",
  "```",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[客户端 App] --> B[API 网关 / BFF 聚合层] --> C[用户中心服务]",
  "  B --> D[订单交易中心服务]",
  "```",
  "",
].join("\\n");

const harness = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="night">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>mermaid overflow e2e</title>
  <link rel="stylesheet" href="./vendor/vditor/dist/index.css" />
  <link rel="stylesheet" href="./molan.css" />
  <style>
    html, body { height: 100%; margin: 0; }
    .reader-body, .editor-wrap { height: 100%; display: flex; flex-direction: column; }
    #vditor { flex: 1; min-height: 0; max-width: 420px; }
    .vditor-ir pre.vditor-reset,
    .vditor-preview .vditor-reset {
      max-width: 380px !important;
    }
  </style>
</head>
<body>
  <header class="reader-header">
    <div class="reader-actions">
      <button class="icon-btn is-preview" id="modeBtn" type="button" title="编辑" aria-label="编辑"></button>
    </div>
  </header>
  <div class="editor-wrap visible" id="editorWrap">
    <div id="vditor"></div>
  </div>
  <div class="toast" id="toast"></div>
  <div class="lightbox" id="lightbox">
    <div class="lightbox-chrome">
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
      placeholder: "mermaid e2e",
    }).then((api) => {
      window.__molan = api;
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

function mermaidSettled() {
  const svgs = Array.from(document.querySelectorAll(".language-mermaid svg, .molan-mermaid-shell svg"))
    .filter((svg) => svg.querySelector("g.node"));
  if (!svgs.length) return false;
  return svgs.every((svg) => svg.querySelector("text") && !svg.querySelector("foreignObject"));
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

function collectOverflows() {
  const pad = 1.75;
  const overflows = [];
  const svgs = Array.from(document.querySelectorAll(".language-mermaid svg, .molan-mermaid-shell svg"))
    .filter((svg) => svg.querySelector("g.node"));
  if (!svgs.length) return [{ type: "missing-svg" }];
  svgs.forEach((svg, svgIndex) => {
    const fos = svg.querySelectorAll("foreignObject");
    if (fos.length) {
      overflows.push({ type: "foreignObject", svgIndex, count: fos.length });
    }
    svg.querySelectorAll("g.node").forEach((node, nodeIndex) => {
      const shape = node.querySelector("rect, polygon, circle, ellipse");
      const text = node.querySelector("text");
      if (!shape || !text) {
        overflows.push({ type: "missing-label", svgIndex, nodeIndex, text: node.textContent });
        return;
      }
      const s = shape.getBoundingClientRect();
      const t = text.getBoundingClientRect();
      if (!(s.width > 1) || !(t.width > 1)) return;
      const overflow = t.left < s.left - pad
        || t.right > s.right + pad
        || t.top < s.top - pad
        || t.bottom > s.bottom + pad;
      if (overflow) {
        overflows.push({
          type: "bbox",
          svgIndex,
          nodeIndex,
          text: (text.textContent || "").trim(),
          dx: {
            left: Number((t.left - s.left).toFixed(2)),
            right: Number((s.right - t.right).toFixed(2)),
            top: Number((t.top - s.top).toFixed(2)),
            bottom: Number((s.bottom - t.bottom).toFixed(2)),
          },
        });
      }
    });
  });
  return overflows;
}

async function runCase(browser, url, { scale, readerSize, fontFamily, name }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: scale });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "1" || document.documentElement.dataset.ready === "error",
    { timeout: 30000 },
  );
  const boot = await page.evaluate(() => ({
    ready: document.documentElement.dataset.ready,
    error: document.documentElement.dataset.error || "",
  }));
  if (boot.ready !== "1") {
    throw new Error(`墨览未就绪: ${boot.error || boot.ready}`);
  }
  await page.waitForSelector(".language-mermaid svg, .molan-mermaid-shell svg", { timeout: 25000 });
  await page.waitForFunction(mermaidSettled, { timeout: 20000 });

  if (readerSize) {
    await page.evaluate((size) => {
      document.documentElement.style.setProperty("--reader-size", size);
    }, readerSize);
    await page.evaluate(async () => {
      if (window.MolanEditor?.refreshMermaidDiagrams) {
        await window.MolanEditor.refreshMermaidDiagrams();
      }
    });
    await page.waitForFunction(mermaidSettled, { timeout: 15000 });
  }

  if (fontFamily) {
    await page.evaluate((font) => {
      document.documentElement.style.setProperty("--reader-font", font);
    }, fontFamily);
    await page.addStyleTag({
      content: `html, body, .vditor-reset, .language-mermaid svg, .molan-mermaid-shell svg {
        font-family: ${fontFamily} !important;
      }`,
    });
    await page.evaluate(async () => {
      if (window.MolanEditor?.refreshMermaidDiagrams) {
        await window.MolanEditor.refreshMermaidDiagrams();
      }
    });
    await page.waitForFunction(mermaidSettled, { timeout: 15000 });
  }

  const overflows = await page.evaluate(collectOverflows);
  if (overflows.length) {
    mkdirSync(shotDir, { recursive: true });
    await page.screenshot({
      path: join(shotDir, `mermaid-overflow-${name}.png`),
      fullPage: true,
    });
  }
  await page.close();
  return overflows;
}

function collectMermaidSourceLeaks() {
  const leaks = [];
  const hosts = Array.from(document.querySelectorAll(".language-mermaid, .molan-mermaid-shell"));
  hosts.forEach((host, i) => {
    if (!host.querySelector("svg")) {
      leaks.push({ type: "no-svg", i, text: (host.textContent || "").trim().slice(0, 80) });
      return;
    }
    Array.from(host.childNodes).forEach((node) => {
      if (node.nodeType === 3 && String(node.textContent || "").trim()) {
        leaks.push({ type: "text-node", i, text: node.textContent.trim().slice(0, 160) });
      }
    });
  });
  const preview = document.querySelector("#molanPreviewBody, .vditor-reset") || document.body;
  const text = preview.innerText || "";
  ["sequenceDiagram", "participant U as", "flowchart TD", "flowchart TB"].forEach((needle) => {
    if (text.includes(needle)) leaks.push({ type: "visible-source", needle });
  });
  return {
    svgCount: document.querySelectorAll(".language-mermaid svg, .molan-mermaid-shell svg").length,
    leaks,
  };
}

const exampleHarness = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="night">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>mermaid source residue e2e</title>
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
      <button class="icon-btn is-preview" id="modeBtn" type="button" title="编辑" aria-label="编辑"></button>
    </div>
  </header>
  <div class="editor-wrap visible" id="editorWrap">
    <div id="vditor"></div>
  </div>
  <div class="toast" id="toast"></div>
  <div class="lightbox" id="lightbox">
    <div class="lightbox-chrome">
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
      placeholder: "mermaid example e2e",
    }).then(async (api) => {
      window.__molan = api;
      const res = await fetch("./demo/" + encodeURIComponent("实例演示.md"));
      if (!res.ok) throw new Error("无法加载实例演示.md");
      await api.setValue(await res.text(), true);
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

async function runExampleSourceResidue(browser, url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 980, height: 1600, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "1" || document.documentElement.dataset.ready === "error",
    { timeout: 30000 },
  );
  const boot = await page.evaluate(() => ({
    ready: document.documentElement.dataset.ready,
    error: document.documentElement.dataset.error || "",
  }));
  if (boot.ready !== "1") {
    throw new Error(`墨览未就绪: ${boot.error || boot.ready}`);
  }
  await page.waitForFunction(
    () => document.querySelectorAll(".language-mermaid svg, .molan-mermaid-shell svg").length >= 3,
    { timeout: 25000 },
  );
  await page.waitForFunction(() => {
    const hosts = document.querySelectorAll(".language-mermaid, .molan-mermaid-shell");
    let withSvg = 0;
    for (const host of hosts) {
      if (!host.querySelector("svg")) continue;
      withSvg += 1;
      for (const node of host.childNodes) {
        if (node.nodeType === 3 && String(node.textContent || "").trim()) return false;
      }
    }
    const preview = document.querySelector("#molanPreviewBody, .vditor-reset") || document.body;
    const text = preview.innerText || "";
    if (text.includes("sequenceDiagram") || text.includes("participant U as")) return false;
    return withSvg >= 3;
  }, { timeout: 15000 });
  const result = await page.evaluate(collectMermaidSourceLeaks);
  mkdirSync(shotDir, { recursive: true });
  const shotPath = join(shotDir, "mermaid-example-no-source.png");
  await page.screenshot({ path: shotPath, fullPage: true });
  await page.close();
  return { ...result, shotPath };
}

async function main() {
  if (!existsSync(join(root, "vendor/vditor/dist/index.min.js"))) {
    throw new Error("缺少 vendor/vditor，请先运行 apps/vscode-molan/scripts/sync-media.mjs");
  }

  const harnessPath = join(root, ".mermaid-e2e.html");
  const examplePath = join(root, ".mermaid-example-e2e.html");
  writeFileSync(harnessPath, harness);
  writeFileSync(examplePath, exampleHarness);

  const server = spawn(process.execPath, [join(root, "serve.mjs")], {
    env: { ...process.env, MOLAN_ROOT: root, MOLAN_SERVE_PORT: String(port) },
    stdio: "inherit",
  });
  const stop = () => {
    try { server.kill("SIGTERM"); } catch { /* ignore */ }
    try { unlinkSync(harnessPath); } catch { /* ignore */ }
    try { unlinkSync(examplePath); } catch { /* ignore */ }
  };
  process.on("exit", stop);
  process.on("SIGINT", () => { stop(); process.exit(1); });

  const url = `http://127.0.0.1:${port}/.mermaid-e2e.html`;
  const exampleUrl = `http://127.0.0.1:${port}/.mermaid-example-e2e.html`;
  await waitForServer(url);

  const puppeteer = loadPuppeteer(repoRoot);
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const failures = [];
  const cases = [
    { name: "dpi1", scale: 1 },
    { name: "dpi125", scale: 1.25 },
    { name: "dpi150", scale: 1.5 },
    { name: "large-type", scale: 1.25, readerSize: "1.35rem" },
    {
      name: "cjk-font",
      scale: 1.25,
      fontFamily: '"WenQuanYi Micro Hei", "Noto Sans CJK SC", sans-serif',
    },
  ];

  try {
    for (const item of cases) {
      const overflows = await runCase(browser, url, item);
      if (overflows.length) {
        failures.push(`${item.name}: ${JSON.stringify(overflows)}`);
      } else {
        console.log(`通过 ${item.name}`);
      }
    }
    const example = await runExampleSourceResidue(browser, exampleUrl);
    if (example.leaks.length || example.svgCount < 3) {
      failures.push(`example-source: ${JSON.stringify(example)}`);
    } else {
      console.log(`通过 example-source（${example.svgCount} 张图，无源码残留）`);
    }
  } catch (err) {
    failures.push(err.stack || String(err));
  } finally {
    await browser.close();
    stop();
  }

  if (failures.length) {
    console.error("\n流程图溢出自测失败:\n" + failures.map((f) => `- ${f}`).join("\n"));
    process.exit(1);
  }
  console.log("\n流程图溢出自测通过");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

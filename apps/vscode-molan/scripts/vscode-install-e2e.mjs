#!/usr/bin/env node
/**
 * 端到端：安装 .vsix → 用 VS Code 打开示例 .md → 解析日志，确认扩展能加载且无 zod 等模块错误。
 * 云环境无桌面时用 xvfb-run；本机可直接跑。
 */
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..", "..");
const sampleMd = join(repoRoot, "tools", "markdown-viewer", "demo", "实例演示.md");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function listVsix() {
  return readdirSync(root)
    .filter((name) => name.startsWith("molan-markdown-") && name.endsWith(".vsix"))
    .map((name) => join(root, name))
    .sort((a, b) => b.localeCompare(a));
}

function packageVsix() {
  console.log("vscode-install-e2e: 未找到 .vsix，正在打包…");
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "@vscode/vsce",
      "package",
      "--no-dependencies",
      "--baseContentUrl",
      "https://github.com/fengshihao/DesignWeave/blob/main/apps/vscode-molan",
      "--baseImagesUrl",
      "https://molan.guoyoutech.cn",
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  assert(
    result.status === 0,
    `vsce package failed: ${result.stderr || result.stdout || result.status}`,
  );
}

function latestVsix() {
  let files = listVsix();
  if (!files.length) {
    packageVsix();
    files = listVsix();
  }
  assert(files.length, "missing molan-markdown-*.vsix after package");
  return files[0];
}

function resolveCodeBinary() {
  const env = process.env.MOLAN_VSCODE_BIN?.trim();
  if (env && existsSync(env)) return env;
  const bundled = "/tmp/vscode-test/VSCode-linux-x64/bin/code";
  if (existsSync(bundled)) return bundled;
  for (const name of ["code", "cursor"]) {
    const hit = spawnSync("sh", ["-lc", `command -v ${name}`], { encoding: "utf8" });
    const bin = hit.stdout.trim();
    if (hit.status === 0 && bin) return bin;
  }
  return "";
}

function ensureBundledVsCode() {
  const bundled = "/tmp/vscode-test/VSCode-linux-x64/bin/code";
  if (existsSync(bundled)) return bundled;
  if (process.platform !== "linux" || process.arch !== "x64") return "";
  mkdirSync("/tmp/vscode-test", { recursive: true });
  const archive = "/tmp/vscode-test/code.tar.gz";
  const dl = spawnSync(
    "curl",
    [
      "-fsSL",
      "https://update.code.visualstudio.com/latest/linux-x64/stable",
      "-o",
      archive,
    ],
    { encoding: "utf8", timeout: 120_000 },
  );
  if (dl.status !== 0) return "";
  const untar = spawnSync("tar", ["-xzf", archive, "-C", "/tmp/vscode-test"], {
    encoding: "utf8",
    timeout: 120_000,
  });
  return untar.status === 0 && existsSync(bundled) ? bundled : "";
}

function installVsix(code, vsix, extDir) {
  const result = spawnSync(
    code,
    ["--install-extension", vsix, "--extensions-dir", extDir, "--force"],
    { encoding: "utf8", timeout: 120_000 },
  );
  assert(result.status === 0, `install vsix failed: ${result.stderr || result.stdout}`);
  assert(
    existsSync(join(extDir, `fengshihao.molan-markdown-${pkg.version}`)),
    `extension dir fengshihao.molan-markdown-${pkg.version} missing`,
  );
}

function collectLogText(userDataDir) {
  const logsRoot = join(userDataDir, "logs");
  if (!existsSync(logsRoot)) return "";
  const chunks = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, name.name);
      if (name.isDirectory()) walk(path);
      else if (name.name.endsWith(".log")) {
        try {
          chunks.push(readFileSync(path, "utf8"));
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(logsRoot);
  return chunks.join("\n");
}

function analyzeLogs(text) {
  const cannotFind = /Cannot find module/i.test(text);
  const activateFail = /Activating extension fengshihao\.molan-markdown failed/i.test(text);
  const molanView = /molan\.markdownEditor/.test(text);
  const molanExt = /fengshihao\.molan-markdown/.test(text);
  const customProvider =
    /registerCustomEditorProvider[\s\S]{0,120}molan\.markdownEditor/.test(text) ||
    /\$registerCustomEditorProvider\([\s\S]{0,120}molan\.markdownEditor/.test(text);
  return { cannotFind, activateFail, molanView, molanExt, customProvider };
}

async function openSampleAndCollectLogs(code, vsix, waitMs = 18_000) {
  assert(existsSync(sampleMd), `sample markdown missing: ${sampleMd}`);
  const userDataDir = mkdtempSync(join(tmpdir(), "molan-vscode-e2e-"));
  const extDir = mkdtempSync(join(tmpdir(), "molan-vscode-ext-"));
  const logDir = mkdtempSync(join(tmpdir(), "molan-vscode-log-"));
  mkdirSync(join(userDataDir, "User"), { recursive: true });
  writeFileSync(
    join(userDataDir, "User", "settings.json"),
    JSON.stringify(
      {
        "workbench.editorAssociations": {
          "*.md": "molan.markdownEditor",
          "*.markdown": "molan.markdownEditor",
          "*.mdown": "molan.markdownEditor",
          "*.mdx": "molan.markdownEditor",
        },
        "extensions.autoCheckUpdates": false,
        "extensions.autoUpdate": false,
        "update.mode": "none",
        "telemetry.telemetryLevel": "off",
      },
      null,
      2,
    ),
  );

  installVsix(code, vsix, extDir);

  const args = [
    "--user-data-dir",
    userDataDir,
    "--extensions-dir",
    extDir,
    "--disable-gpu",
    "--no-sandbox",
    "--log",
    logDir,
    "--disable-workspace-trust",
    sampleMd,
  ];
  const prefix = process.env.DISPLAY ? [] : ["xvfb-run", "-a"];
  const cmd = prefix.length ? prefix[0] : code;
  const cmdArgs = prefix.length ? [...prefix.slice(1), code, ...args] : args;

  await new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, {
      stdio: "ignore",
      detached: true,
    });
    child.unref();
    setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
      }
      resolve();
    }, waitMs);
  });

  // 兜底清理残留 VS Code 进程（仅本测试 user-data-dir）
  spawnSync("pkill", ["-f", userDataDir], { encoding: "utf8" });

  const text = collectLogText(userDataDir);
  const stats = analyzeLogs(text);
  try {
    rmSync(userDataDir, { recursive: true, force: true });
    rmSync(extDir, { recursive: true, force: true });
    rmSync(logDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  return stats;
}

async function main() {
  let code = resolveCodeBinary();
  if (!code) code = ensureBundledVsCode();
  assert(code, "need VS Code or Cursor CLI, or linux-x64 to download VS Code");

  const vsix = latestVsix();
  console.log(`vscode-install-e2e: ${code}`);
  console.log(`  vsix: ${vsix}`);
  console.log(`  sample: ${sampleMd}`);

  const stats = await openSampleAndCollectLogs(code, vsix);
  console.log("  log checks:", stats);

  assert(!stats.cannotFind, "extension host logged Cannot find module");
  assert(!stats.activateFail, "molan-markdown activation failed");
  assert(stats.molanExt, "logs never mention fengshihao.molan-markdown");
  assert(stats.molanView, "logs never mention molan.markdownEditor");

  console.log("vscode-install-e2e ok");
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});

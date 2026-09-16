#!/usr/bin/env node
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveMolanRoot } from "./resolve-molan-root.mjs";

export function ensureMolanPackagesBuilt() {
  const molanRoot = resolveMolanRoot();
  const protocolRun = join(molanRoot, "packages", "molan-protocol", "dist", "run.js");
  const coreEditor = join(molanRoot, "packages", "molan-core", "dist", "molan-editor.js");
  const hostBridge = join(molanRoot, "packages", "molan-host", "dist", "vscode-bridge.js");

  if (existsSync(protocolRun) && existsSync(coreEditor) && existsSync(hostBridge)) return;

  console.log("==> 构建并列 molan 仓 @molan/protocol / core / host …");
  execSync("pnpm build", { cwd: molanRoot, stdio: "inherit" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ensureMolanPackagesBuilt();
}

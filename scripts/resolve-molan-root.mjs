#!/usr/bin/env node
/**
 * Resolve sibling fengshihao/molan checkout (file:../molan).
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dwRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function resolveMolanRoot() {
  if (process.env.MOLAN_ROOT) {
    return resolve(process.env.MOLAN_ROOT);
  }
  const sibling = join(dwRoot, "..", "molan");
  if (existsSync(join(sibling, "packages", "molan-host", "package.json"))) {
    return sibling;
  }
  throw new Error(
    "找不到并列的 molan 仓库。请 clone https://github.com/fengshihao/molan 到与 DesignWeave 同级目录（../molan），或设置 MOLAN_ROOT。",
  );
}

export function molanPackageDist(name) {
  return join(resolveMolanRoot(), "packages", name, "dist");
}

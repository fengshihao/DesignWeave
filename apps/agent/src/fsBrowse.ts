import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type FsEntry = {
  name: string;
  path: string;
  isDir: boolean;
};

export function browseDir(rawPath: string | undefined): {
  path: string;
  parent: string | null;
  entries: FsEntry[];
} {
  const home = os.homedir();
  const requested = rawPath && rawPath.trim() ? rawPath.trim() : home;
  const abs = path.resolve(requested);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error("这个目录不存在");
  }
  const entries = fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((d) => !d.name.startsWith("."))
    .map((d) => ({
      name: d.name,
      path: path.join(abs, d.name),
      isDir: d.isDirectory(),
    }))
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, "zh");
    });
  const parent = path.dirname(abs);
  return {
    path: abs,
    parent: parent === abs ? null : parent,
    entries,
  };
}

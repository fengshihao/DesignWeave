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
  home: string;
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
    home,
    entries,
  };
}

export function mkdirUnder(parentRaw: string, nameRaw: string): { path: string } {
  const parent = path.resolve(parentRaw.trim());
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
    throw Object.assign(new Error("这个目录不存在"), { status: 400 });
  }
  const name = nameRaw.trim();
  if (!name || name.startsWith(".") || /[\\/]/.test(name) || name.includes("..")) {
    throw Object.assign(new Error("文件夹名字不合适。不要带斜杠或点号开头。"), {
      status: 400,
    });
  }
  const dest = path.resolve(parent, name);
  if (dest === parent || !dest.startsWith(parent + path.sep)) {
    throw Object.assign(new Error("路径不合法"), { status: 400 });
  }
  if (fs.existsSync(dest)) {
    throw Object.assign(new Error("已经有这个名字了"), { status: 409 });
  }
  fs.mkdirSync(dest);
  return { path: dest };
}

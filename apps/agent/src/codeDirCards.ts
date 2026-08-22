import fs from "node:fs";
import path from "node:path";
import type { WorkbenchMode } from "./workbenchRuns.js";

export type CodeDirCard = {
  name: string;
  path: string;
  snippet: string;
};

function firstExisting(dir: string, names: string[]): string | null {
  for (const name of names) {
    const p = path.join(dir, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

function firstLines(file: string, n: number): string {
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").trim();
  return text.split("\n").slice(0, n).join("\n").slice(0, 800);
}

export function buildCodeDirCards(dirs: string[]): CodeDirCard[] {
  return dirs
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory())
    .map((dir) => {
      const readme = firstExisting(dir, ["README.md", "README.MD", "readme.md", "清单.md"]);
      return {
        name: path.basename(dir),
        path: dir,
        snippet: readme ? firstLines(readme, 8) : "",
      };
    });
}

export function formatCodeDirCards(cards: CodeDirCard[]): string {
  if (!cards.length) return "（还没有已批准的代码目录）";
  return cards
    .map((c) => {
      const snip = c.snippet
        ? c.snippet
            .split("\n")
            .map((l) => `  ${l}`)
            .join("\n")
        : "  （无 README）";
      return `- ${c.name}\n  路径：${c.path}\n${snip}`;
    })
    .join("\n");
}

/** 只把本轮选中的灌进 additionalDirectories，不要把全部已批准目录每次都塞进去。 */
export function selectCodeDirsForRun(input: {
  mode: WorkbenchMode;
  title: string;
  message: string;
  readme: string;
  approved: string[];
}): string[] {
  if (input.mode !== "feasibility") return [];
  const hay = `${input.title}\n${input.message}\n${input.readme}`.toLowerCase();
  return input.approved
    .filter((p) => fs.existsSync(p))
    .filter((p) => hay.includes(path.basename(p).toLowerCase()))
    .slice(0, 4);
}

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type GitAuthor = {
  name: string;
  email: string;
};

export type VaultVersion = {
  id: string;
  message: string;
  author: string;
  createdAt: string;
};

const IGNORE = `# DesignWeave — 可重建的运行态不要进时间线
.dw/
.DS_Store
Thumbs.db
`;

const GIT_MISSING =
  "未找到 git。请安装 Git for Windows，并确保 git 在 PATH 里（安装包自带 Git Bash）。";

let cachedGitBin: string | undefined;

function gitBin(): string {
  if (cachedGitBin) return cachedGitBin;
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Git\\cmd\\git.exe",
      "C:\\Program Files\\Git\\bin\\git.exe",
      "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
    ];
    const where = spawnSync("where", ["git"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const fromPath = (where.stdout || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && !/Windows\\System32\\bash/i.test(s));
    if (fromPath && fs.existsSync(fromPath)) {
      cachedGitBin = fromPath;
      return cachedGitBin;
    }
    const hit = candidates.find((c) => fs.existsSync(c));
    if (hit) {
      cachedGitBin = hit;
      return cachedGitBin;
    }
  }
  cachedGitBin = "git";
  return cachedGitBin;
}

function spawnGit(
  cwd: string,
  args: string[],
  input?: string
): SpawnSyncReturns<string> {
  return spawnSync(gitBin(), args, {
    cwd,
    encoding: "utf8",
    input,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  }) as SpawnSyncReturns<string>;
}

function throwIfGitMissing(result: SpawnSyncReturns<string>): void {
  const err = result.error as NodeJS.ErrnoException | undefined;
  if (err?.code === "ENOENT") {
    throw new Error(GIT_MISSING);
  }
}

function runGit(cwd: string, args: string[], input?: string): string {
  const result = spawnGit(cwd, args, input);
  throwIfGitMissing(result);
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "git 失败").trim();
    throw new Error(err);
  }
  return (result.stdout || "").trim();
}

export function looksLikeCodeTree(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  const names = fs.readdirSync(dir);
  const codeHints = [
    "package.json",
    "go.mod",
    "Cargo.toml",
    "pom.xml",
    "build.gradle",
    "CMakeLists.txt",
    "pyproject.toml",
    "src",
  ];
  const hit = names.filter((n) => codeHints.includes(n)).length;
  return hit >= 2;
}

function gitDir(dir: string): string | null {
  if (!fs.existsSync(path.join(dir, ".git"))) return null;
  return dir;
}

export function currentBranch(dir: string): string {
  const name = runGit(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return name;
}

function isMainline(branch: string): boolean {
  return branch === "main" || branch === "master";
}

export function isDirty(dir: string): boolean {
  if (!gitDir(dir)) return false;
  const out = runGit(dir, ["status", "--porcelain"]);
  return out.length > 0;
}

export function changedFiles(dir: string): string[] {
  if (!gitDir(dir)) return [];
  const out = runGit(dir, ["status", "--porcelain"]);
  if (!out) return [];
  return out
    .split("\n")
    .map((line) => {
      const rest = line.slice(2).trim();
      if (rest.includes(" -> ")) return rest.split(" -> ").pop() || rest;
      return rest.replace(/^"|"$/g, "").trim();
    })
    .filter(Boolean);
}

function initMainlineRepo(dir: string): void {
  const withBranch = spawnGit(dir, ["init", "-b", "main"]);
  throwIfGitMissing(withBranch);
  if (withBranch.status === 0) return;
  runGit(dir, ["init"]);
  runGit(dir, ["symbolic-ref", "HEAD", "refs/heads/main"]);
}

export function ensureDocumentVault(dir: string): {
  initialized: boolean;
  branch: string;
} {
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.resolve(dir);
  const ignorePath = path.join(abs, ".gitignore");
  if (!fs.existsSync(ignorePath)) {
    fs.writeFileSync(ignorePath, IGNORE, "utf8");
  }

  if (!gitDir(abs)) {
    initMainlineRepo(abs);
    runGit(abs, ["config", "user.name", "DesignWeave"]);
    runGit(abs, ["config", "user.email", "system@designweave.local"]);
    return { initialized: true, branch: "main" };
  }

  const branch = currentBranch(abs);
  if (!isMainline(branch)) {
    throw new Error(
      "这个目录已经是版本库，但当前不在主线。第一版只支持主线，请换目录或先回到主线。"
    );
  }
  return { initialized: false, branch };
}

export function commitAll(
  dir: string,
  message: string,
  author: GitAuthor
): VaultVersion | null {
  const abs = path.resolve(dir);
  runGit(abs, ["add", "-A"]);
  if (!isDirty(abs) && hasHead(abs)) {
    return null;
  }
  runGit(abs, [
    "-c",
    `user.name=${author.name}`,
    "-c",
    `user.email=${author.email}`,
    "commit",
    "--allow-empty",
    "-m",
    message,
    "--author",
    `${author.name} <${author.email}>`,
  ]);
  return listVersions(abs, 1)[0] ?? null;
}

function hasHead(dir: string): boolean {
  const result = spawnGit(dir, ["rev-parse", "--verify", "HEAD"]);
  return result.status === 0;
}

export function listVersions(dir: string, limit = 50): VaultVersion[] {
  if (!gitDir(dir) || !hasHead(dir)) return [];
  const out = runGit(dir, [
    "log",
    `-n${limit}`,
    "--format=%H%x09%an%x09%aI%x09%s",
  ]);
  if (!out) return [];
  return out.split("\n").map((line) => {
    const [id, author, createdAt, ...rest] = line.split("\t");
    return {
      id,
      author,
      createdAt,
      message: rest.join("\t"),
    };
  });
}

export function readFileAt(dir: string, rev: string, relPath: string): string | null {
  const safe = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const result = spawnGit(dir, ["show", `${rev}:${safe}`]);
  if (result.status !== 0) return null;
  return result.stdout ?? "";
}

export function restoreFile(dir: string, rev: string, relPath: string): void {
  const safe = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  runGit(dir, ["checkout", rev, "--", safe]);
}

export function revertLatestAiCommit(dir: string, author: GitAuthor): VaultVersion {
  if (!hasHead(dir)) {
    throw new Error("还没有可撤销的版本");
  }
  const latest = listVersions(dir, 1)[0];
  if (!latest) throw new Error("还没有可撤销的版本");
  if (latest.author !== "AI") {
    throw new Error("只能撤销最新的 AI 一版。人的版本请用「恢复这一篇」。");
  }
  runGit(dir, ["revert", "--no-commit", latest.id]);
  runGit(dir, [
    "-c",
    `user.name=${author.name}`,
    "-c",
    `user.email=${author.email}`,
    "commit",
    "-m",
    `我：撤销 AI 的 ${latest.message.replace(/^AI：/, "")}`,
    "--author",
    `${author.name} <${author.email}>`,
  ]);
  return listVersions(dir, 1)[0];
}

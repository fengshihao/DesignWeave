import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ClaudeKnownProject = {
  path: string;
  name: string;
  exists: boolean;
  hasDesignWeave: boolean;
  hasClaudeDir: boolean;
};

function claudeJsonPath(): string {
  return process.env.CLAUDE_JSON_PATH || path.join(os.homedir(), ".claude.json");
}

export function scanClaudeKnownProjects(): {
  source: string;
  found: boolean;
  projects: ClaudeKnownProject[];
  error?: string;
} {
  const source = claudeJsonPath();
  if (!fs.existsSync(source)) {
    return {
      source,
      found: false,
      projects: [],
      error: "未找到 ~/.claude.json。请确认本机已安装并使用过 Claude Code。",
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(source, "utf8")) as {
      projects?: Record<string, unknown>;
      githubRepoPaths?: Record<string, string[]>;
    };

    const pathSet = new Set<string>();
    if (raw.projects && typeof raw.projects === "object") {
      for (const p of Object.keys(raw.projects)) {
        if (p && p.startsWith("/")) pathSet.add(path.resolve(p));
      }
    }
    if (raw.githubRepoPaths && typeof raw.githubRepoPaths === "object") {
      for (const list of Object.values(raw.githubRepoPaths)) {
        if (Array.isArray(list)) {
          for (const p of list) {
            if (typeof p === "string" && p.startsWith("/")) {
              pathSet.add(path.resolve(p));
            }
          }
        }
      }
    }

    const projects: ClaudeKnownProject[] = [...pathSet]
      .map((repoPath) => {
        const exists = fs.existsSync(repoPath) && fs.statSync(repoPath).isDirectory();
        return {
          path: repoPath,
          name: path.basename(repoPath),
          exists,
          hasDesignWeave: exists
            ? fs.existsSync(path.join(repoPath, ".designweave"))
            : false,
          hasClaudeDir: exists
            ? fs.existsSync(path.join(repoPath, ".claude"))
            : false,
        };
      })
      .filter((p) => p.exists)
      .sort((a, b) => a.name.localeCompare(b.name, "zh"));

    return { source, found: true, projects };
  } catch (err) {
    return {
      source,
      found: true,
      projects: [],
      error: `读取 Claude 配置失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config();

export type AnthropicCredentialSource = "env" | "claude-settings" | "none";

function claudeSettingsPath(): string {
  return (
    process.env.CLAUDE_SETTINGS_PATH ||
    path.join(os.homedir(), ".claude", "settings.json")
  );
}

/** 将 Claude Code settings.json 的 env 注入进程（已有环境变量优先，不覆盖 .env） */
function loadClaudeCodeSettingsEnv(): {
  applied: string[];
  settingsPath: string;
  found: boolean;
} {
  const settingsPath = claudeSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return { applied: [], settingsPath, found: false };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as {
      env?: Record<string, unknown>;
    };
    const applied: string[] = [];
    const envBlock = raw.env && typeof raw.env === "object" ? raw.env : {};
    for (const [key, value] of Object.entries(envBlock)) {
      if (typeof value !== "string" || value.length === 0) continue;
      if (process.env[key] !== undefined && process.env[key] !== "") continue;
      process.env[key] = value;
      applied.push(key);
    }
    return { applied, settingsPath, found: true };
  } catch {
    return { applied: [], settingsPath, found: true };
  }
}

const claudeSettings = loadClaudeCodeSettingsEnv();

// Claude Code / 第三方网关常用 AUTH_TOKEN；Agent SDK 侧统一落到 API_KEY
if (!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_AUTH_TOKEN) {
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_AUTH_TOKEN;
}

function resolveCredentialSource(): AnthropicCredentialSource {
  const fromSettings =
    claudeSettings.applied.includes("ANTHROPIC_API_KEY") ||
    claudeSettings.applied.includes("ANTHROPIC_AUTH_TOKEN");
  if (fromSettings) return "claude-settings";
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    return "env";
  }
  return "none";
}

function resolveDataDir(): string {
  const raw = process.env.DATA_DIR || path.join(repoRoot, "data");
  return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
}

const anthropicApiKey =
  process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "";
const anthropicCredentialSource = resolveCredentialSource();

export const config = {
  port: Number(process.env.AGENT_PORT || process.env.PORT || 8787),
  dataDir: resolveDataDir(),
  appPassword: process.env.APP_PASSWORD || "",
  anthropicApiKey,
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || "",
  anthropicCredentialSource,
  claudeSettingsPath: claudeSettings.settingsPath,
  claudeSettingsFound: claudeSettings.found,
  claudeSettingsAppliedKeys: claudeSettings.applied,
  repoRoot,
};

/** 传给 Claude Agent SDK 的 env：保留 BASE_URL / 模型路由，并保证 API_KEY 可用 */
export function anthropicSdkEnv(): NodeJS.ProcessEnv {
  const key = config.anthropicApiKey;
  return {
    ...process.env,
    ...(key
      ? {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || key,
          ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || key,
        }
      : {}),
  };
}

export function workspacesRoot(): string {
  return path.join(config.dataDir, "workspaces");
}

export function dbPath(): string {
  return path.join(config.dataDir, "designweave.db");
}

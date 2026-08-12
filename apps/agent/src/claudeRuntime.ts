import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { anthropicSdkEnv, config } from "./config.js";

export type ClaudeSettingSource = "user" | "project" | "local";

export type ClaudeSkillInfo = {
  name: string;
  path: string;
  source: "user" | "project" | "plugin";
  plugin?: string;
};

export type ClaudePluginInfo = {
  name: string;
  path: string;
  marketplace?: string;
  enabled: boolean;
  skillCount: number;
};

export type ClaudeConfigInventory = {
  claudeHome: string;
  settingsPath: string;
  settingsFound: boolean;
  language: string | null;
  settingSources: ClaudeSettingSource[];
  skills: ClaudeSkillInfo[];
  plugins: ClaudePluginInfo[];
  enabledPluginNames: string[];
  mcpServerNames: string[];
  hasUserClaudeMd: boolean;
  hasUserRules: boolean;
};

const DEFAULT_SETTING_SOURCES: ClaudeSettingSource[] = [
  "user",
  "project",
  "local",
];

function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function listSkillDirs(root: string): string[] {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(root, d.name))
    .filter((dir) => fs.existsSync(path.join(dir, "SKILL.md")));
}

function collectSkillsFromDir(
  root: string,
  source: ClaudeSkillInfo["source"],
  plugin?: string
): ClaudeSkillInfo[] {
  return listSkillDirs(root).map((dir) => ({
    name: path.basename(dir),
    path: dir,
    source,
    plugin,
  }));
}

function resolveEnabledPlugins(
  settings: Record<string, unknown> | null
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  const block = settings?.enabledPlugins;
  if (!block || typeof block !== "object") return out;
  for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
    out.set(key, Boolean(value));
  }
  return out;
}

function marketplacePluginRoots(home: string): Array<{
  marketplace: string;
  pluginName: string;
  pluginPath: string;
}> {
  const marketplacesRoot = path.join(home, "plugins", "marketplaces");
  if (!fs.existsSync(marketplacesRoot)) return [];

  const results: Array<{
    marketplace: string;
    pluginName: string;
    pluginPath: string;
  }> = [];

  for (const marketplace of fs.readdirSync(marketplacesRoot, { withFileTypes: true })) {
    if (!marketplace.isDirectory()) continue;
    const base = path.join(marketplacesRoot, marketplace.name);
    for (const bucket of ["plugins", "external_plugins"]) {
      const bucketPath = path.join(base, bucket);
      if (!fs.existsSync(bucketPath)) continue;
      for (const plugin of fs.readdirSync(bucketPath, { withFileTypes: true })) {
        if (!plugin.isDirectory()) continue;
        const pluginPath = path.join(bucketPath, plugin.name);
        const hasManifest =
          fs.existsSync(path.join(pluginPath, ".claude-plugin", "plugin.json")) ||
          fs.existsSync(path.join(pluginPath, "plugin.json"));
        if (!hasManifest) continue;
        results.push({
          marketplace: marketplace.name,
          pluginName: plugin.name,
          pluginPath,
        });
      }
    }
  }
  return results;
}

function mcpNamesFromSettings(settings: Record<string, unknown> | null): string[] {
  const mcp = settings?.mcpServers;
  if (!mcp || typeof mcp !== "object") return [];
  return Object.keys(mcp as Record<string, unknown>).sort();
}

/** 扫描本机 Claude Code：settings / skills / plugins / MCP（只读，不回传密钥） */
export function scanClaudeConfigInventory(
  projectCwd?: string
): ClaudeConfigInventory {
  const home = claudeHome();
  const settingsPath = config.claudeSettingsPath;
  const settings = readJsonFile(settingsPath);
  const enabledMap = resolveEnabledPlugins(settings);

  const skills: ClaudeSkillInfo[] = [
    ...collectSkillsFromDir(path.join(home, "skills"), "user"),
  ];

  if (projectCwd) {
    skills.push(
      ...collectSkillsFromDir(path.join(projectCwd, ".claude", "skills"), "project")
    );
  }

  const plugins: ClaudePluginInfo[] = marketplacePluginRoots(home).map((p) => {
    const enableKey = `${p.pluginName}@${p.marketplace}`;
    const enabled = enabledMap.get(enableKey) === true || enabledMap.get(p.pluginName) === true;
    const skillCount = listSkillDirs(path.join(p.pluginPath, "skills")).length;
    return {
      name: p.pluginName,
      path: p.pluginPath,
      marketplace: p.marketplace,
      enabled,
      skillCount,
    };
  });

  const autoLoadMarketplace =
    process.env.DESIGNWEAVE_LOAD_MARKETPLACE_PLUGINS !== "0";
  const hasExplicitEnabled = plugins.some((p) => p.enabled);
  for (const p of plugins) {
    const load =
      p.skillCount > 0 &&
      (p.enabled || (!hasExplicitEnabled && autoLoadMarketplace));
    if (!load) continue;
    skills.push(
      ...collectSkillsFromDir(path.join(p.path, "skills"), "plugin", p.name)
    );
  }

  const language =
    typeof settings?.language === "string" && settings.language.trim()
      ? settings.language.trim()
      : null;

  return {
    claudeHome: home,
    settingsPath,
    settingsFound: Boolean(settings),
    language,
    settingSources: [...DEFAULT_SETTING_SOURCES],
    skills: skills.sort((a, b) => a.name.localeCompare(b.name, "zh")),
    plugins: plugins.sort((a, b) => a.name.localeCompare(b.name, "zh")),
    enabledPluginNames: plugins.filter((p) => p.enabled).map((p) => p.name),
    mcpServerNames: mcpNamesFromSettings(settings),
    hasUserClaudeMd: fs.existsSync(path.join(home, "CLAUDE.md")),
    hasUserRules:
      fs.existsSync(path.join(home, "rules")) &&
      fs.readdirSync(path.join(home, "rules")).some((f) => f.endsWith(".md")),
  };
}

function resolvePluginsForSdk(
  inventory: ClaudeConfigInventory
): Array<{ type: "local"; path: string }> {
  // 已在 Claude settings 启用的插件，显式交给 SDK（确保 skills/commands 可用）
  const enabled = inventory.plugins.filter((p) => p.enabled);
  if (enabled.length > 0) {
    return enabled.map((p) => ({ type: "local" as const, path: p.path }));
  }

  // 未显式启用时：仍加载「带 skills 的已安装 marketplace 插件」，便于复用本机 Claude 能力包
  // 可用 DESIGNWEAVE_LOAD_MARKETPLACE_PLUGINS=0 关闭
  if (process.env.DESIGNWEAVE_LOAD_MARKETPLACE_PLUGINS === "0") {
    return [];
  }
  return inventory.plugins
    .filter((p) => p.skillCount > 0)
    .map((p) => ({ type: "local" as const, path: p.path }));
}

export type ClaudeQueryBaseOptions = {
  cwd: string;
  allowedTools: string[];
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
  allowDangerouslySkipPermissions?: boolean;
  additionalDirectories?: string[];
  /** DesignWeave 角色/工作流提示，追加到 Claude Code 预设 system prompt */
  appendSystemPrompt: string;
  outputFormat?: {
    type: "json_schema";
    schema: Record<string, unknown>;
  };
};

/**
 * 构造与本机 Claude Code 对齐的 Agent SDK options：
 * - settingSources: user/project/local（加载 settings、CLAUDE.md、skills、hooks、MCP）
 * - Skill 工具
 * - 已安装/启用的 local plugins
 * - Claude Code 预设 system prompt + DesignWeave 追加指令
 */
export function buildClaudeQueryOptions(input: ClaudeQueryBaseOptions) {
  const inventory = scanClaudeConfigInventory(input.cwd);
  const plugins = resolvePluginsForSdk(inventory);
  const tools = new Set(input.allowedTools);
  tools.add("Skill");

  return {
    cwd: input.cwd,
    settingSources: inventory.settingSources,
    allowedTools: [...tools],
    permissionMode: input.permissionMode,
    allowDangerouslySkipPermissions: input.allowDangerouslySkipPermissions,
    additionalDirectories: input.additionalDirectories,
    plugins,
    env: anthropicSdkEnv(),
    systemPrompt: {
      type: "preset" as const,
      preset: "claude_code" as const,
      append: input.appendSystemPrompt,
    },
    ...(input.outputFormat ? { outputFormat: input.outputFormat } : {}),
  };
}

export function summarizeClaudeReuse(inventory = scanClaudeConfigInventory()): string {
  const parts = [
    `settings=${inventory.settingsFound ? "yes" : "no"}`,
    `skills=${inventory.skills.length}`,
    `plugins=${inventory.enabledPluginNames.length || inventory.plugins.filter((p) => p.skillCount > 0).length}/${inventory.plugins.length}`,
    `mcp=${inventory.mcpServerNames.length}`,
  ];
  if (inventory.language) parts.push(`lang=${inventory.language}`);
  return parts.join(", ");
}

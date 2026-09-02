import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { HttpError } from "./httpError.js";

export const SYSTEM_PROMPT_REL = ".dw/system-prompt.md";
export const NO_WORKSPACE_ROOT = "请先选定运行根目录。";

export function builtinSystemPromptPath(): string {
  const fromEnv = process.env.SYSTEM_PROMPT_TEMPLATE;
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(config.repoRoot, "packages/templates/system-prompt.md");
}

export function readBuiltinSystemPrompt(): string {
  return fs.readFileSync(builtinSystemPromptPath(), "utf8");
}

export function systemPromptPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, SYSTEM_PROMPT_REL);
}

export function requirePromptWorkspaceRoot(root: string | null | undefined): string {
  const value = root?.trim() || "";
  if (!value) {
    throw new HttpError(NO_WORKSPACE_ROOT, 409);
  }
  return value;
}

/** 文件不存在才拷入出厂默认。空文件算已设定，不要偷偷写回默认。 */
export function ensureSystemPromptFile(workspaceRoot: string): string {
  const dest = systemPromptPath(workspaceRoot);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, readBuiltinSystemPrompt(), "utf8");
  }
  return dest;
}

export function readSystemPrompt(workspaceRoot: string): { text: string; isDefault: boolean } {
  ensureSystemPromptFile(workspaceRoot);
  const text = fs.readFileSync(systemPromptPath(workspaceRoot), "utf8");
  return { text, isDefault: text === readBuiltinSystemPrompt() };
}

export function writeSystemPrompt(
  workspaceRoot: string,
  text: string
): { text: string; isDefault: boolean } {
  const dest = systemPromptPath(workspaceRoot);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text, "utf8");
  return { text, isDefault: text === readBuiltinSystemPrompt() };
}

export function resetSystemPrompt(workspaceRoot: string): { text: string; isDefault: boolean } {
  return writeSystemPrompt(workspaceRoot, readBuiltinSystemPrompt());
}

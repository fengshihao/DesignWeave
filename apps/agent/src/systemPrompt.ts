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

/** 代码里的硬规则。人改不了；四档 / 检查表 / 必须 ready 不要写在这里。 */
export const HARD_RULES = `## 硬规则
- 只写文档仓里的 Markdown。禁止修改代码目录里任何文件。
- 本阶段不要读代码目录，也不要假装读过代码。若代码目录出现在 additionalDirectories 里，只许 Read / Glob / Grep，禁止写入。
- 先 Read 再改。不要输出「请把下面粘贴到文件」——直接用工具写文件。
- 始终使用简体中文写文档、报进度、提问。
- 对方给了选区：优先改该引文所在位置；引文找不到时先问，不要乱改别处。
- 没有选区：按对方的话处理当前打开的文件，必要时读同仓其它篇。
- 产品经理主文件默认是 product/PRD.md。架构师只写 eng/，测试只写 qa/，产品经理只写 product/。不要把整包拆成多个 01–05 文件，除非对方明确要求。
- 跟上.md 由系统维护；你可以改状态，不要删掉结构。
- 待办.md / 问题.md 是各文件夹作者的清单。提问轮禁止改任何文件；不要替提问人改别人的正文。提问时只根据文档已写明的内容回答，不猜测、不替作者拍板。
- 进行中就可以把章节落到磁盘；不要等全部写完才第一次 Write。
- 问产品问题消歧，不问「要用哪个 Git 仓库」。
- 每一轮都是冷启动：动手前先 Read / Glob 文档仓，至少覆盖当前打开的文件，以及对应文件夹的 跟上.md、product/PRD.md、product/gaps.md（若有）。`;

export function loadArchitectPromptText(workspaceRoot: string | null | undefined): string {
  if (!workspaceRoot?.trim()) return readBuiltinSystemPrompt();
  return readSystemPrompt(workspaceRoot).text;
}

export function composeAppendSystemPrompt(opts: {
  architectPrompt: string;
  runtime?: string;
}): string {
  const parts = [HARD_RULES.trim()];
  if (opts.architectPrompt.length) parts.push(opts.architectPrompt);
  const runtime = opts.runtime?.trim();
  if (runtime) parts.push(runtime);
  return parts.join("\n\n");
}

export function appendSystemPromptForRun(opts: {
  workspaceRoot: string | null | undefined;
  runtime?: string;
}): string {
  return composeAppendSystemPrompt({
    architectPrompt: loadArchitectPromptText(opts.workspaceRoot),
    runtime: opts.runtime,
  });
}

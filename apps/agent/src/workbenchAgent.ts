import fs from "node:fs";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { agui, assistantMessageId, pickToolInput } from "@designweave/molan-protocol";
import { config } from "./config.js";
import { buildClaudeQueryOptions } from "./claudeRuntime.js";
import { commitAll, isDirty } from "./gitVault.js";
import { getRequirement, type RequirementMeta } from "./requirements.js";
import { listDocTree } from "./files.js";
import { getDb } from "./db.js";
import { isArchitect, ROLE_LABELS, type AppRole } from "./roles.js";
import {
  appendAgui,
  beginRunAbort,
  endRunAbort,
  getRun,
  isTerminal,
  setRunStatus,
  type WorkbenchMode,
} from "./workbenchRuns.js";
import { setEditing } from "./projectLocks.js";
import { listApprovedCodeDirs } from "./workspaceSettings.js";
import {
  buildCodeDirCards,
  formatCodeDirCards,
  selectCodeDirsForRun,
} from "./codeDirCards.js";
import { isReady } from "./projectMeta.js";

const AI_AUTHOR = { name: "AI", email: "ai@designweave.local" };

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("已取消"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("已取消"));
      },
      { once: true }
    );
  });
}

function readVaultFile(meta: RequirementMeta, rel: string): string {
  const p = path.join(meta.vaultPath, rel);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8");
}

function codeRootsForRun(meta: RequirementMeta, mode: WorkbenchMode, message: string): string[] {
  const approved = listApprovedCodeDirs();
  return selectCodeDirsForRun({
    mode,
    title: meta.title,
    message,
    readme: readVaultFile(meta, "PRD.md"),
    approved,
  });
}

function snapshotMtimes(root: string): Map<string, number> {
  const out = new Map<string, number>();
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === ".dw") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (/\.(md|markdown|txt)$/i.test(entry.name)) {
        const rel = path.relative(root, abs).replace(/\\/g, "/");
        out.set(rel, fs.statSync(abs).mtimeMs);
      }
    }
  }
  walk(root);
  return out;
}

function emitChangedFiles(
  runId: string,
  root: string,
  prev: Map<string, number>
): Map<string, number> {
  const next = snapshotMtimes(root);
  for (const [rel, mtime] of next) {
    if (prev.get(rel) !== mtime) {
      appendAgui(runId, agui.custom("file", { path: rel }));
    }
  }
  return next;
}

function hint(runId: string, text: string): void {
  appendAgui(runId, agui.custom("hint", { text }));
}

function fileWritten(runId: string, rel: string): void {
  appendAgui(runId, agui.custom("file", { path: rel }));
}

function ensureAssistantStart(runId: string, started: { value: boolean }): void {
  if (started.value) return;
  started.value = true;
  appendAgui(runId, agui.textStart(assistantMessageId(runId), "assistant"));
}

function assistantDelta(runId: string, started: { value: boolean }, text: string): void {
  if (!text) return;
  ensureAssistantStart(runId, started);
  appendAgui(runId, agui.textDelta(assistantMessageId(runId), "assistant", text));
}

function finishAssistant(runId: string, started: { value: boolean }): void {
  if (!started.value) return;
  appendAgui(runId, agui.textEnd(assistantMessageId(runId), "assistant"));
}

function modeLabel(mode: WorkbenchMode): string {
  if (mode === "clarify") return "检查清晰度";
  if (mode === "grill") return "拷问";
  if (mode === "feasibility") return "可行性";
  return "共创";
}

function audienceOf(userId: string): { role: AppRole; label: string } {
  const row = getDb()
    .prepare(`SELECT role FROM user WHERE id = ?`)
    .get(userId) as { role?: string } | undefined;
  const role: AppRole = isArchitect(row?.role) ? "architect" : "designer";
  return { role, label: ROLE_LABELS[role] };
}

function vaultDocInventory(projectId: string): string {
  const files = listDocTree(projectId).filter((f) => !f.isDir);
  const names = new Set(files.map((f) => f.path));
  const core = ["PRD.md", "gaps.md", "调研.md"];
  const lines = core.map((p) => `- ${p}${names.has(p) ? "（已有）" : "（还没有）"}`);
  const extra = files.filter((f) => !core.includes(f.path)).map((f) => f.path);
  if (extra.length) lines.push(`- 其他：${extra.join("、")}`);
  return lines.join("\n");
}

function audienceHint(role: AppRole, mode: WorkbenchMode): string {
  if (role === "architect") {
    return `写给架构师。可以写到模块边界、接口、仓与仓的职责；仍不要贴大段代码或堆文件路径。`;
  }
  const forPm =
    mode === "feasibility"
      ? `调研结论是给产品经理做判断用的，不是给开发看的设计说明书。`
      : `面向产品经理写文档、提问。`;
  return `${forPm}
- 少写实现细节：不要罗列类名、函数名、调用链、目录树、框架内部结构。
- 可以用产品经理本来就懂的词：接口、权限、登录态、机型、缓存、兼容、版本。
- 不要用比喻、故事、拟人来解释问题。直接说影响：谁用不了、哪一步会断、要拍什么板。`;
}

function systemPrompt(
  meta: RequirementMeta,
  mode: WorkbenchMode,
  audience: { role: AppRole; label: string },
  selectedDirs: string[]
): string {
  const cards = buildCodeDirCards(listApprovedCodeDirs());
  const codeHint =
    mode === "feasibility"
      ? selectedDirs.length
        ? `本轮只读这些已选代码目录（禁止写入）：\n${selectedDirs.map((r) => `- ${r}`).join("\n")}\n\n目录卡：\n${formatCodeDirCards(cards)}`
        : `架构师已批准一些代码目录，但这一轮还没对上该读哪几个。先对照目录卡，用产品问题消歧，不要问「要用哪个 Git 仓库」。\n\n目录卡：\n${formatCodeDirCards(cards)}`
      : "这一档不读代码目录。不要假装读过代码。";

  const modeHint =
    mode === "clarify"
      ? `档位：检查清晰度。只读 PRD.md（导入路径还要对照 import/original.md）。按检查表标清晰 / 缺失 / 含糊，写入 gaps.md，一次追问 1～3 个问题。人答完写回 PRD.md 对应章节，不要只留在对话里。
检查表：背景与用户、目标与非目标、至少 1 条完整用户故事、至少 1 条主流程、入口、规格与 OEM 约束、整包验收。
「清晰」≠「能开发」。标准是无歧义、可开始设计讨论。占位符、纯「等」「看情况」、用户故事缺验收、主流程有头无尾、规格和故事打架，都不算过。
全部过关才把 meta.md 的 clarity 改成 ready、phase 改成 ready。没过关不要改成 ready。`
      : mode === "feasibility"
        ? `档位：可行性。只读本轮选中的代码目录，只把结论写进「调研.md」（用了哪些、为什么、已有能力 / 缺口 / 风险 / 建议）。不要改业务代码。发送时若仍有 P0 缺口，必须先问。`
        : mode === "grill"
          ? `档位：拷问。追问矛盾、缺口、隐含假设。把问题写入 gaps.md。确认过的内容写回 PRD.md 对应章节。`
          : `档位：共创。根据对方的话更新 PRD.md 对应章节，每次只问 1～3 个关键问题，未决写入 gaps.md。`;

  return `
你是 DesignWeave 工作台里的文档助手。这一轮由${audience.label}托付。

## 语言
始终使用简体中文写文档、报进度、提问。

## 工作目录
cwd 是文档仓（可读写 Markdown）：${meta.vaultPath}
${codeHint}

文档仓此刻有：
${vaultDocInventory(meta.id)}

## 每一轮都是冷启动
你并没有预先读过这个产品。动手前先 Read / Glob 文档仓，至少覆盖 PRD.md、gaps.md（若有）、调研.md（若有）。
若同一主题已经有调研章节或阶段性结论：先写明「已经有什么」，再只补缺口或纠正过时判断，不要整篇重写。

## 硬规则
- 禁止修改代码目录里的任何文件。代码目录只用来 Read / Glob / Grep。
- 只写文档仓：PRD.md 是产品经理的主文件；你可创建并维护 gaps.md、调研.md、README.md 等辅助文件，以及 meta.md、import/ 下的说明。
- 产品经理只改 PRD.md；不要把整包拆成多个 01–05 文件，除非用户明确要求。
- 进行中就可以把章节落到磁盘；不要等全部写完才第一次 Write。
- 不要输出「请把下面粘贴到文件」——直接用工具写文件。
- 问产品问题消歧，不问「要用哪个 Git 仓库」。

## 写给谁
${audienceHint(audience.role, mode)}

${modeHint}

工程标题：${meta.title}
清晰度：${isReady(meta) ? "ready" : meta.clarity}
`.trim();
}

function userPrompt(
  meta: RequirementMeta,
  mode: WorkbenchMode,
  message: string,
  audience: { label: string }
): string {
  return `
工程：${meta.title}
档位：${modeLabel(mode)}
文档仓：${meta.vaultPath}

${audience.label}说：
${message}

请开始。先读文档仓里已有的 Markdown，再用中文说明你在做什么，然后读写文件。
`.trim();
}

async function runMock(
  runId: string,
  meta: RequirementMeta,
  mode: WorkbenchMode,
  message: string,
  selectedDirs: string[],
  signal: AbortSignal
): Promise<void> {
  hint(runId, "演示模式：本机没有模型密钥，也会把结论写进文档仓。");
  await sleep(400, signal);

  hint(runId, "正在阅读文档仓…");
  await sleep(500, signal);

  if (selectedDirs.length) {
    hint(runId, `正在只读代码目录：${selectedDirs.map((r) => path.basename(r)).join("、")}`);
    await sleep(500, signal);
  }

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  if (mode === "feasibility") {
    const body = `# 调研

> 演示模式 · ${stamp}
> 只读了已选代码目录，没有改任何业务代码。

## 产品经理托付

${message}

## 用了哪些代码目录

${selectedDirs.length ? selectedDirs.map((r) => `- \`${r}\``).join("\n") : "- （这一轮没有对上目录；请用产品问题消歧）"}

## 已有能力

（演示）从目录名和现有文档推断，不能当作可行性结论。

## 缺口

- 需要对照真实代码确认入口、权限、机型差异是否已覆盖。

## 建议

配置本机 Claude / API Key 后，再跑一轮可行性。未改任何业务代码。
`;
    fs.writeFileSync(path.join(meta.vaultPath, "调研.md"), body, "utf8");
    fileWritten(runId, "调研.md");
    hint(runId, "已写入 调研.md");
  } else if (mode === "clarify") {
    const gapsPath = path.join(meta.vaultPath, "gaps.md");
    const extra = `# 待补齐

> 检查清晰度（演示 · ${stamp}）

产品经理说：${message}

- [ ] 背景与用户是否无歧义
- [ ] 目标与非目标是否写清
- [ ] 至少 1 条完整用户故事（含可勾选验收）
- [ ] 至少 1 条有头有尾的主流程
- [ ] 入口
- [ ] 规格与 OEM 约束
- [ ] 整包验收

演示模式不会把清晰度标成 ready。接上真实模型后会按检查表写入，并只在全部过关时改 meta.md。
`;
    fs.writeFileSync(gapsPath, extra, "utf8");
    fileWritten(runId, "gaps.md");
    hint(runId, "已把清晰度缺口写进 gaps.md");
  } else if (mode === "grill") {
    const gapsPath = path.join(meta.vaultPath, "gaps.md");
    const prev = fs.existsSync(gapsPath) ? fs.readFileSync(gapsPath, "utf8") : "# 待补齐\n";
    const extra = `
## 拷问（演示 · ${stamp}）

产品经理说：${message}

- [ ] 成功标准是否可观测、可验收？
- [ ] 范围内外有没有互相打架的句子？
`;
    fs.writeFileSync(gapsPath, `${prev.trim()}\n${extra}\n`, "utf8");
    fileWritten(runId, "gaps.md");
    hint(runId, "已把拷问写进 gaps.md");
  } else {
    const prdPath = path.join(meta.vaultPath, "PRD.md");
    const prev = fs.existsSync(prdPath) ? fs.readFileSync(prdPath, "utf8") : `# ${meta.title}\n`;
    const extra = `
## 共创补充（演示 · ${stamp}）

${message}

（演示模式记下了这句话。接上真实模型后会按章节写入对应篇。）
`;
    fs.writeFileSync(prdPath, `${prev.trim()}\n${extra}\n`, "utf8");
    fileWritten(runId, "PRD.md");
    hint(runId, "已把这一轮写进 PRD.md");
  }

  await sleep(300, signal);
}

async function runClaude(
  runId: string,
  meta: RequirementMeta,
  mode: WorkbenchMode,
  message: string,
  audience: { role: AppRole; label: string },
  selectedDirs: string[],
  signal: AbortSignal
): Promise<void> {
  let snap = snapshotMtimes(meta.vaultPath);
  const allowedTools = ["Read", "Write", "Edit", "Glob", "Grep"];
  const started = { value: false };
  let toolSeq = 0;

  const q = query({
    prompt: userPrompt(meta, mode, message, audience),
    options: buildClaudeQueryOptions({
      cwd: meta.vaultPath,
      allowedTools,
      permissionMode: "acceptEdits",
      additionalDirectories: selectedDirs,
      appendSystemPrompt: systemPrompt(meta, mode, audience, selectedDirs),
    }),
  });

  for await (const raw of q) {
    if (signal.aborted) throw new Error("已取消");
    snap = emitChangedFiles(runId, meta.vaultPath, snap);
    const msg = raw as {
      type?: string;
      message?: {
        content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }>;
      };
      result?: string;
      error?: string;
    };
    if (msg.type === "assistant" && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text) {
          assistantDelta(runId, started, block.text);
        }
        if (block.type === "tool_use" && block.name) {
          toolSeq += 1;
          const toolCallId = `${runId}-tool-${toolSeq}`;
          appendAgui(runId, agui.toolStart(toolCallId, block.name, pickToolInput(block.input)));
          appendAgui(runId, agui.toolEnd(toolCallId, block.name));
        }
      }
    }
    if (msg.type === "result" && typeof msg.result === "string" && msg.result.trim() && !started.value) {
      assistantDelta(runId, started, msg.result);
    }
  }
  finishAssistant(runId, started);
  emitChangedFiles(runId, meta.vaultPath, snap);
}

export async function executeWorkbenchRun(runId: string): Promise<void> {
  const run = getRun(runId);
  if (!run || isTerminal(run.status)) return;
  const meta = getRequirement(run.projectId);
  if (!meta) {
    setRunStatus(runId, "failed", "工程不存在");
    appendAgui(runId, agui.error("工程不存在"));
    appendAgui(runId, agui.finished("error"));
    return;
  }

  const controller = beginRunAbort(runId);
  if (isTerminal(getRun(runId)?.status ?? "queued")) {
    endRunAbort(runId);
    return;
  }
  setRunStatus(runId, "running");
  setEditing(run.projectId, false);

  const roots = codeRootsForRun(meta, run.mode, run.message);
  appendAgui(
    runId,
    agui.custom("trust", {
      codeRoots: roots,
      writesDocsOnly: true,
      mockMode: !config.anthropicApiKey,
      text:
        run.mode === "feasibility"
          ? roots.length
            ? `只读代码目录：${roots.join("、")}。不会改业务代码，结论写进文档仓。`
            : "这一轮没有对上代码目录。不会改业务代码，只写文档仓。用产品问题消歧。"
          : "这一档不读代码目录。不会改业务代码，只写文档仓。",
    })
  );

  try {
    if (!config.anthropicApiKey) {
      await runMock(runId, meta, run.mode, run.message, roots, controller.signal);
    } else {
      await runClaude(
        runId,
        meta,
        run.mode,
        run.message,
        audienceOf(run.userId),
        roots,
        controller.signal
      );
    }

    if (controller.signal.aborted) {
      throw new Error("已取消");
    }

    let versionId: string | null = null;
    if (isDirty(meta.vaultPath)) {
      const version = commitAll(
        meta.vaultPath,
        `AI：${modeLabel(run.mode)} ${run.message.slice(0, 40)}`,
        AI_AUTHOR
      );
      versionId = version?.id ?? null;
    }
    setRunStatus(runId, "succeeded");
    hint(
      runId,
      versionId ? "本轮完成，已记入版本。未改业务代码。" : "本轮完成。文档没有新的改动需要记版。"
    );
    appendAgui(
      runId,
      agui.finished("success", {
        versionId,
        mockMode: !config.anthropicApiKey,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cancelled = controller.signal.aborted || message.includes("取消");
    if (cancelled) {
      if (getRun(runId)?.status !== "cancelled") {
        setRunStatus(runId, "cancelled", "已取消");
        appendAgui(runId, agui.error("已取消。已写下的文档还在，没有改代码仓。"));
        appendAgui(runId, agui.finished("cancelled"));
      }
    } else {
      setRunStatus(runId, "failed", message);
      appendAgui(runId, agui.error(`${message}。已写下的文档还在，没有改代码仓。`));
      appendAgui(runId, agui.finished("error"));
    }
  } finally {
    endRunAbort(runId);
  }
}

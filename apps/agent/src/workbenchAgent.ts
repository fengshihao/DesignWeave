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
} from "./workbenchRuns.js";
import { setEditing } from "./projectLocks.js";
import { getWorkspaceRoot } from "./workspaceSettings.js";
import { appendSystemPromptForRun } from "./systemPrompt.js";
import { buildWorkbenchUserPrompt, demoWriteRelPath, type WorkbenchFocus } from "./workbenchPrompt.js";

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

function codeRootsForRun(): string[] {
  // D2：本阶段不把代码目录加入 additionalDirectories。
  return [];
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

function audienceHint(role: AppRole): string {
  if (role === "architect") {
    return `写给架构师。可以写到模块边界、接口、仓与仓的职责；仍不要贴大段代码或堆文件路径。`;
  }
  return `面向产品经理写文档、提问。
- 少写实现细节：不要罗列类名、函数名、调用链、目录树、框架内部结构。
- 可以用产品经理本来就懂的词：接口、权限、登录态、机型、缓存、兼容、版本。
- 不要用比喻、故事、拟人来解释问题。直接说影响：谁用不了、哪一步会断、要拍什么板。`;
}

function runtimePromptBlock(
  meta: RequirementMeta,
  audience: { role: AppRole; label: string }
): string {
  return `
## 本轮
这一轮由${audience.label}托付。
cwd 是文档仓（可读写 Markdown）：${meta.vaultPath}

文档仓此刻有：
${vaultDocInventory(meta.id)}

## 写给谁
${audienceHint(audience.role)}

工程标题：${meta.title}
`.trim();
}

function systemPrompt(
  meta: RequirementMeta,
  audience: { role: AppRole; label: string }
): string {
  return appendSystemPromptForRun({
    workspaceRoot: getWorkspaceRoot(),
    runtime: runtimePromptBlock(meta, audience),
  });
}

function userPrompt(
  meta: RequirementMeta,
  message: string,
  focus?: WorkbenchFocus | null
): string {
  return buildWorkbenchUserPrompt({
    title: meta.title,
    file: focus?.file || "PRD.md",
    inventory: vaultDocInventory(meta.id),
    focus,
    message,
  });
}

async function runMock(
  runId: string,
  meta: RequirementMeta,
  message: string,
  focus: WorkbenchFocus | null,
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
  const rel = demoWriteRelPath(focus);
  const target = path.join(meta.vaultPath, rel);
  const prev = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : `# ${meta.title}\n`;
  const extra = `
## 托付补充（演示 · ${stamp}）

${message}

（演示模式记下了这句话。接上真实模型后会按对方的话写入对应篇。）
`;
  fs.writeFileSync(target, `${prev.trim()}\n${extra}\n`, "utf8");
  fileWritten(runId, rel);
  hint(runId, `已把这一轮写进 ${rel}`);

  await sleep(300, signal);
}

async function runClaude(
  runId: string,
  meta: RequirementMeta,
  message: string,
  audience: { role: AppRole; label: string },
  focus: WorkbenchFocus | null,
  signal: AbortSignal
): Promise<void> {
  let snap = snapshotMtimes(meta.vaultPath);
  const allowedTools = ["Read", "Write", "Edit", "Glob", "Grep"];
  const started = { value: false };
  let toolSeq = 0;

  const q = query({
    prompt: userPrompt(meta, message, focus),
    options: buildClaudeQueryOptions({
      cwd: meta.vaultPath,
      allowedTools,
      permissionMode: "acceptEdits",
      additionalDirectories: [],
      appendSystemPrompt: systemPrompt(meta, audience),
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

  const roots = codeRootsForRun();
  appendAgui(
    runId,
    agui.custom("trust", {
      codeRoots: roots,
      writesDocsOnly: true,
      mockMode: !config.anthropicApiKey,
      text: "本阶段不读代码目录。不会改业务代码，只写文档仓。不要假装读过代码。",
    })
  );

  try {
    if (!config.anthropicApiKey) {
      await runMock(runId, meta, run.message, run.focus, roots, controller.signal);
    } else {
      await runClaude(
        runId,
        meta,
        run.message,
        audienceOf(run.userId),
        run.focus,
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
        `AI：托付 ${run.message.slice(0, 40)}`,
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

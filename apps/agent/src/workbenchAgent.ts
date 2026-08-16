import fs from "node:fs";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config.js";
import { buildClaudeQueryOptions } from "./claudeRuntime.js";
import { commitAll, isDirty } from "./gitVault.js";
import { getRequirement, type RequirementMeta } from "./requirements.js";
import { listDocTree } from "./files.js";
import { getDb } from "./db.js";
import { isArchitect, ROLE_LABELS, type AppRole } from "./roles.js";
import {
  appendEvent,
  beginRunAbort,
  endRunAbort,
  getRun,
  isTerminal,
  setRunStatus,
  type WorkbenchMode,
} from "./workbenchRuns.js";
import { setEditing } from "./projectLocks.js";

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

function codeRootsOf(meta: RequirementMeta): string[] {
  return [meta.primaryRepo, ...meta.relatedRepos]
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .filter((p) => fs.existsSync(p));
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
      appendEvent(runId, "file", { path: rel });
    }
  }
  return next;
}

function modeLabel(mode: WorkbenchMode): string {
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
  audience: { role: AppRole; label: string }
): string {
  const roots = codeRootsOf(meta);
  const codeHint = roots.length
    ? `代码仓只读（禁止写入），路径如下：\n${roots.map((r) => `- ${r}`).join("\n")}`
    : "本工程还没有挂代码仓。不要假装读过代码。";

  const modeHint =
    mode === "feasibility"
      ? `档位：可行性。只读代码仓，只把结论写进文档仓的「调研.md」（已有能力 / 缺口 / 风险 / 建议）。不要改 PRD，除非用户明确要求。`
      : mode === "grill"
        ? `档位：拷问。像严厉的产品负责人追问矛盾、缺口、隐含假设。把问题写入 gaps.md。确认过的内容可以补进 PRD.md。`
        : `档位：共创。根据对方的话更新 PRD.md，每次只问 1～3 个关键问题，并把未决写入 gaps.md。`;

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
你并没有预先读过这个产品。动手前先 Read / Glob 文档仓里已有的 Markdown，至少覆盖存在的 PRD.md、gaps.md、调研.md。
若同一主题已经有调研章节或阶段性结论：先写明「已经有什么」，再只补缺口或纠正过时判断，不要整篇重写。

## 硬规则
- 禁止修改代码仓里的任何文件。代码仓只用来 Read / Glob / Grep。
- 只写文档仓：PRD.md、gaps.md、调研.md、import/ 下的说明。
- 进行中就可以把章节落到磁盘；不要等全部写完才第一次 Write。
- 不要输出「请把下面粘贴到文件」——直接用工具写文件。

## 写给谁
${audienceHint(audience.role, mode)}

${modeHint}

工程标题：${meta.title}
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
  signal: AbortSignal
): Promise<void> {
  const roots = codeRootsOf(meta);
  appendEvent(runId, "progress", { text: "演示模式：本机没有模型密钥，也会把结论写进文档仓。" });
  await sleep(400, signal);

  appendEvent(runId, "progress", { text: "正在阅读文档仓…" });
  await sleep(500, signal);

  if (roots.length) {
    appendEvent(runId, "progress", {
      text: `正在只读代码仓：${roots.map((r) => path.basename(r)).join("、")}`,
    });
    await sleep(500, signal);
  } else {
    appendEvent(runId, "progress", { text: "没有挂代码仓，只根据现有文档写。" });
    await sleep(300, signal);
  }

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  if (mode === "feasibility") {
    const body = `# 调研

> 演示模式 · ${stamp}
> 只读了代码仓，没有改任何业务代码。

## 产品经理托付

${message}

## 只读了哪些代码仓

${roots.length ? roots.map((r) => `- \`${r}\``).join("\n") : "- （本工程尚未挂代码仓）"}

## 已有能力

（演示）从目录名和现有 PRD 推断：工程里已有可对照的代码，但本轮没有调用真实模型，结论仅作结构示例。

## 缺口

- 需要对照真实代码确认入口、权限、机型差异是否已覆盖。
- 验收标准是否可测试，仍待产品经理拍板。

## 风险

- 演示模式没有真正扫仓，不能当作可行性结论。

## 建议

配置本机 Claude / API Key 后，再跑一轮可行性。未改任何业务代码。
`;
    fs.writeFileSync(path.join(meta.vaultPath, "调研.md"), body, "utf8");
    appendEvent(runId, "file", { path: "调研.md" });
    appendEvent(runId, "progress", { text: "已写入 调研.md" });
  } else if (mode === "grill") {
    const gapsPath = path.join(meta.vaultPath, "gaps.md");
    const prev = fs.existsSync(gapsPath) ? fs.readFileSync(gapsPath, "utf8") : "# 缺口与待确认\n";
    const extra = `
## 拷问（演示 · ${stamp}）

产品经理说：${message}

- [ ] 成功标准是否可观测、可验收？
- [ ] 范围内外有没有互相打架的句子？
- [ ] 主仓和关联仓的职责切清了吗？
`;
    fs.writeFileSync(gapsPath, `${prev.trim()}\n${extra}\n`, "utf8");
    appendEvent(runId, "file", { path: "gaps.md" });
    appendEvent(runId, "progress", { text: "已把拷问写进 gaps.md" });
  } else {
    const prdPath = path.join(meta.vaultPath, "PRD.md");
    const prev = fs.existsSync(prdPath) ? fs.readFileSync(prdPath, "utf8") : `# ${meta.title}\n`;
    const extra = `
## 共创补充（演示 · ${stamp}）

${message}

（演示模式记下了这句话。接上真实模型后会按章节写入，而不是永远追加在文末。）
`;
    fs.writeFileSync(prdPath, `${prev.trim()}\n${extra}\n`, "utf8");
    appendEvent(runId, "file", { path: "PRD.md" });
    appendEvent(runId, "progress", { text: "已把这一轮写进 PRD.md" });
  }

  await sleep(300, signal);
}

async function runClaude(
  runId: string,
  meta: RequirementMeta,
  mode: WorkbenchMode,
  message: string,
  audience: { role: AppRole; label: string },
  signal: AbortSignal
): Promise<void> {
  const roots = codeRootsOf(meta);
  let snap = snapshotMtimes(meta.vaultPath);
  const allowedTools =
    mode === "feasibility"
      ? ["Read", "Write", "Edit", "Glob", "Grep"]
      : ["Read", "Write", "Edit", "Glob", "Grep"];

  const q = query({
    prompt: userPrompt(meta, mode, message, audience),
    options: buildClaudeQueryOptions({
      cwd: meta.vaultPath,
      allowedTools,
      permissionMode: "acceptEdits",
      additionalDirectories: roots,
      appendSystemPrompt: systemPrompt(meta, mode, audience),
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
          appendEvent(runId, "text", { text: block.text });
        }
        if (block.type === "tool_use" && block.name) {
          appendEvent(runId, "tool", { name: block.name });
          const pretty =
            block.name === "Write" || block.name === "Edit"
              ? "正在写文档仓…"
              : block.name === "Read"
                ? "正在读文件…"
                : `正在用 ${block.name}…`;
          appendEvent(runId, "progress", { text: pretty });
        }
      }
    }
    if (msg.type === "result" && typeof msg.result === "string" && msg.result.trim()) {
      appendEvent(runId, "text", { text: msg.result });
    }
  }
  emitChangedFiles(runId, meta.vaultPath, snap);
}

export async function executeWorkbenchRun(runId: string): Promise<void> {
  const run = getRun(runId);
  if (!run || isTerminal(run.status)) return;
  const meta = getRequirement(run.projectId);
  if (!meta) {
    setRunStatus(runId, "failed", "工程不存在");
    appendEvent(runId, "error", { message: "工程不存在" });
    appendEvent(runId, "done", { ok: false });
    return;
  }

  const controller = beginRunAbort(runId);
  if (isTerminal(getRun(runId)?.status ?? "queued")) {
    endRunAbort(runId);
    return;
  }
  setRunStatus(runId, "running");
  setEditing(run.projectId, false);

  const roots = codeRootsOf(meta);
  appendEvent(runId, "trust", {
    codeRoots: roots,
    writesDocsOnly: true,
    mockMode: !config.anthropicApiKey,
    text: roots.length
      ? `只读代码仓：${roots.join("、")}。不会改业务代码，结论写进文档仓。`
      : "这一轮没有只读代码仓。不会改业务代码，只写文档仓。",
  });

  try {
    if (!config.anthropicApiKey) {
      await runMock(runId, meta, run.mode, run.message, controller.signal);
    } else {
      await runClaude(runId, meta, run.mode, run.message, audienceOf(run.userId), controller.signal);
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
    appendEvent(runId, "progress", {
      text: versionId ? "本轮完成，已记入版本。未改业务代码。" : "本轮完成。文档没有新的改动需要记版。",
    });
    appendEvent(runId, "done", { ok: true, versionId, mockMode: !config.anthropicApiKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cancelled = controller.signal.aborted || message.includes("取消");
    if (cancelled) {
      if (getRun(runId)?.status !== "cancelled") {
        setRunStatus(runId, "cancelled", "已取消");
        appendEvent(runId, "error", {
          message: "已取消。已写下的文档还在，没有改代码仓。",
        });
        appendEvent(runId, "done", { ok: false, cancelled: true });
      }
    } else {
      setRunStatus(runId, "failed", message);
      appendEvent(runId, "error", {
        message: `${message}。已写下的文档还在，没有改代码仓。`,
      });
      appendEvent(runId, "done", { ok: false });
    }
  } finally {
    endRunAbort(runId);
  }
}

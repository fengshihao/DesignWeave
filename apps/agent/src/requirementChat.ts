import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  buildRequirementSystemPrompt,
  buildRequirementUserPrompt,
  requirementChatOutputSchema,
  type RequirementChatMode,
} from "@designweave/prompts";
import { config } from "./config.js";
import {
  getRequirement,
  readGapsMarkdown,
  readOriginalImport,
  readPrdMarkdown,
  writeGapsMarkdown,
  writePrdMarkdown,
  type RequirementMeta,
} from "./requirements.js";

export type RequirementChatResult = {
  reply: string;
  questions: string[];
  prd: string;
  gaps: string;
  mockMode: boolean;
};

function parseStructured(raw: unknown): {
  reply: string;
  questions: string[];
  updatedPrd: string | null;
  updatedGaps: string | null;
} {
  if (!raw || typeof raw !== "object") {
    return { reply: String(raw ?? ""), questions: [], updatedPrd: null, updatedGaps: null };
  }
  const o = raw as Record<string, unknown>;
  return {
    reply: String(o.reply ?? ""),
    questions: Array.isArray(o.questions) ? o.questions.map(String) : [],
    updatedPrd: typeof o.updatedPrd === "string" ? o.updatedPrd : null,
    updatedGaps: typeof o.updatedGaps === "string" ? o.updatedGaps : null,
  };
}

function mockGuide(meta: RequirementMeta, prd: string, message: string): RequirementChatResult {
  const answer = message.trim();
  let nextPrd = prd;
  const lower = answer;

  if (answer && !answer.includes("开始")) {
    // 把用户回答追加进背景或未决
    if (prd.includes("（待补充）")) {
      nextPrd = prd.replace(
        "## 背景与问题\n\n（待补充）",
        `## 背景与问题\n\n${answer}`
      );
      if (nextPrd === prd) {
        nextPrd = `${prd.trim()}\n\n## 产品经理补充\n\n${answer}\n`;
      }
    } else {
      nextPrd = `${prd.trim()}\n\n## 产品经理补充\n\n${answer}\n`;
    }
  }

  const questions = [
    "这个功能覆盖哪些机型 / Android 版本 / 销售区域？有无品牌定制差异？",
    "用户从哪里进入（设置路径、桌面图标、系统弹窗等）？",
    "需要哪些敏感权限？是否涉及运营商或合规审核？",
  ];

  const reply = `（演示模式）已记录你的输入。作为 OEM 内置 App 需求，建议下一轮先确认：\n\n1. ${questions[0]}\n2. ${questions[1]}\n3. ${questions[2]}\n\n配置 ANTHROPIC_API_KEY 或复用 Claude Code 后可自动写章节。`;

  void lower;
  writePrdMarkdown(meta.id, nextPrd);
  const gaps = `# 缺口与待确认\n\n${questions.map((q) => `- [ ] ${q}`).join("\n")}\n`;
  writeGapsMarkdown(meta.id, gaps);

  return {
    reply,
    questions,
    prd: nextPrd,
    gaps,
    mockMode: true,
  };
}

function mockGaps(meta: RequirementMeta, prd: string, message: string): RequirementChatResult {
  const questions = [
    "文档中的验收标准是否可测试？缺哪些 Given/When/Then？",
    "跨工程时，主仓与关联仓的接口责任是否写清？",
    "升级失败或关闭开关时，用户侧表现是什么？",
  ];
  const reply = `（演示模式）已阅读当前 PRD（约 ${prd.length} 字）。你的回复：${message.slice(0, 80)}…\n\n建议优先补齐：\n1. ${questions[0]}\n2. ${questions[1]}\n3. ${questions[2]}`;
  const gaps = `# 缺口与待确认\n\n${questions.map((q) => `- [ ] ${q}`).join("\n")}\n`;
  writeGapsMarkdown(meta.id, gaps);
  return { reply, questions, prd, gaps, mockMode: true };
}

export async function runRequirementChat(input: {
  requirementId: string;
  mode: RequirementChatMode;
  message: string;
}): Promise<RequirementChatResult> {
  const meta = getRequirement(input.requirementId);
  if (!meta) throw new Error("需求不存在");

  const prd = readPrdMarkdown(meta.id);
  const gaps = readGapsMarkdown(meta.id);
  const originalImport = readOriginalImport(meta.id);

  if (!config.anthropicApiKey) {
    if (input.mode === "gaps" || input.mode === "normalize") {
      return mockGaps(meta, prd, input.message);
    }
    return mockGuide(meta, prd, input.message);
  }

  const cwd = meta.primaryRepo && meta.primaryRepo.length > 0 ? meta.primaryRepo : meta.vaultPath;
  const systemPrompt = buildRequirementSystemPrompt(input.mode);
  const userPrompt = buildRequirementUserPrompt({
    mode: input.mode,
    title: meta.title,
    summary: meta.summary,
    primaryRepo: meta.primaryRepo,
    relatedRepos: meta.relatedRepos,
    prd,
    gaps,
    originalImport,
    message: input.message,
  });

  let structured: unknown = undefined;
  let textOut = "";

  const q = query({
    prompt: `${systemPrompt}\n\n---\n\n${userPrompt}`,
    options: {
      cwd,
      allowedTools: ["Read", "Glob", "Grep"],
      permissionMode: "default",
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: config.anthropicApiKey,
      },
      outputFormat: {
        type: "json_schema" as const,
        schema: requirementChatOutputSchema as unknown as Record<string, unknown>,
      },
    },
  });

  for await (const message of q) {
    const msg = message as {
      type?: string;
      message?: { content?: Array<{ type?: string; text?: string }> };
      structured_output?: unknown;
      result?: string;
    };
    if (msg.type === "assistant" && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text) textOut += block.text;
      }
    }
    if (msg.type === "result") {
      structured = msg.structured_output ?? structured;
      if (typeof msg.result === "string" && !textOut) textOut = msg.result;
    }
  }

  const parsed = parseStructured(structured);
  const nextPrd = parsed.updatedPrd ?? prd;
  const nextGaps = parsed.updatedGaps ?? gaps;
  if (parsed.updatedPrd) writePrdMarkdown(meta.id, parsed.updatedPrd);
  if (parsed.updatedGaps) writeGapsMarkdown(meta.id, parsed.updatedGaps);

  return {
    reply: parsed.reply || textOut || "（无回复）",
    questions: parsed.questions,
    prd: nextPrd,
    gaps: nextGaps,
    mockMode: false,
  };
}

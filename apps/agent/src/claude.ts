import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  agentStructuredOutputJsonSchema,
  type AgentMode,
  type AgentRole,
} from "@designweave/schema";
import { buildUserTurn, getSystemPrompt } from "@designweave/prompts";
import { config } from "./config.js";
import { projectDir } from "./workspace.js";

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; input?: unknown }
  | { type: "result"; structured?: unknown; text?: string }
  | { type: "error"; message: string }
  | { type: "done" };

const DESIGNER_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"];
const READONLY_TOOLS = ["Read", "Glob", "Grep"];

export function toolsForMode(mode: AgentMode): string[] {
  if (mode === "feasibility") return READONLY_TOOLS;
  if (mode === "consistency" || mode === "grill") return ["Read", "Glob", "Grep"];
  return DESIGNER_TOOLS;
}

export async function* runAgentStream(params: {
  projectId: string;
  role: AgentRole;
  mode: AgentMode;
  message: string;
  focusSection?: string;
  repoPath?: string;
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  if (!config.anthropicApiKey) {
    yield {
      type: "error",
      message:
        "未配置 ANTHROPIC_API_KEY。请在项目根目录 .env 中设置后重启服务。",
    };
    yield { type: "done" };
    return;
  }

  const cwd =
    params.mode === "feasibility" && params.repoPath
      ? params.repoPath
      : projectDir(params.projectId);

  const systemPrompt = getSystemPrompt(params.role, params.mode);
  const userPrompt = buildUserTurn({
    message: params.message,
    projectId: params.projectId,
    focusSection: params.focusSection,
  });

  const useStructured =
    params.mode === "coauthor" ||
    params.mode === "refine" ||
    params.mode === "grill" ||
    params.mode === "consistency";

  try {
    const q = query({
      prompt: `${systemPrompt}\n\n---\n\n${userPrompt}`,
      options: {
        cwd,
        allowedTools: toolsForMode(params.mode),
        permissionMode:
          params.mode === "feasibility" ? "default" : "acceptEdits",
        allowDangerouslySkipPermissions: false,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: config.anthropicApiKey,
        },
        ...(useStructured
          ? {
              outputFormat: {
                type: "json_schema" as const,
                schema: agentStructuredOutputJsonSchema as unknown as Record<
                  string,
                  unknown
                >,
              },
            }
          : {}),
      },
    });

    for await (const message of q) {
      if (params.signal?.aborted) {
        yield { type: "error", message: "已取消" };
        break;
      }

      const msg = message as {
        type?: string;
        message?: {
          content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }>;
        };
        result?: string;
        structured_output?: unknown;
        error?: string;
      };

      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            yield { type: "text", text: block.text };
          }
          if (block.type === "tool_use" && block.name) {
            yield { type: "tool", name: block.name, input: block.input };
          }
        }
      }

      if (msg.type === "result") {
        yield {
          type: "result",
          structured: msg.structured_output,
          text: typeof msg.result === "string" ? msg.result : undefined,
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", message: `Agent 执行失败：${message}` };
  }

  yield { type: "done" };
}

/** 无 API Key 时的本地演示回复，便于先跑通 UI */
export async function* runMockStream(params: {
  mode: AgentMode;
  message: string;
}): AsyncGenerator<StreamEvent> {
  const summary =
    params.mode === "consistency"
      ? "已完成自洽检查（演示模式，未调用真实模型）。"
      : params.mode === "grill"
        ? "已提出若干拷问点（演示模式）。"
        : "已根据你的描述起草章节建议（演示模式）。";

  yield { type: "text", text: `${summary}\n\n你的输入：${params.message}\n` };

  const structured = {
    summary,
    patches:
      params.mode === "consistency" || params.mode === "grill"
        ? []
        : [
            {
              section: "problem",
              content: `【演示草稿】\n\n${params.message}\n\n请补充：目标用户、要解决的核心痛点、成功后的可观测结果。`,
              rationale: "演示模式根据用户输入生成问题与背景草稿",
            },
          ],
    questions:
      params.mode === "coauthor"
        ? ["主要用户是谁？", "最重要的成功指标是什么？"]
        : [],
    issues:
      params.mode === "grill" || params.mode === "consistency"
        ? [
            {
              title: "成功标准尚未量化",
              description: "当前文档缺少可度量的成功指标，后续验收将难以对齐。",
              severity: "major",
              section: "goals",
              suggestion: "补充 1～3 个可量化指标（如转化率、完成时长）。",
            },
            {
              title: "范围内外边界不清",
              description: "若未写明不做的事项，容易在交付中膨胀。",
              severity: "minor",
              section: "scope",
              suggestion: "明确至少 3 条范围外事项。",
            },
          ]
        : [],
  };

  yield { type: "result", structured };
  yield { type: "done" };
}

import { z } from "zod";
import { PRD_SECTION_KEYS } from "./prd.js";
import { IssueSeveritySchema } from "./issues.js";

export const AgentRoleSchema = z.enum(["designer", "architect", "qa"]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const AgentModeSchema = z.enum([
  "coauthor",
  "refine",
  "grill",
  "consistency",
  "feasibility",
  "split_sr",
  "test_plan",
]);
export type AgentMode = z.infer<typeof AgentModeSchema>;

export const AGENT_MODE_LABELS: Record<AgentMode, string> = {
  coauthor: "共创",
  refine: "细化",
  grill: "拷问",
  consistency: "自洽检查",
  feasibility: "可行性分析",
  split_sr: "拆分 SR",
  test_plan: "测试方案",
};

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  designer: "软件设计师",
  architect: "架构师",
  qa: "测试架构师",
};

export const PatchSchema = z.object({
  section: z.enum(PRD_SECTION_KEYS),
  /** 对字符串章节：完整替换正文；对结构化章节：说明性 Markdown 或 JSON 片段 */
  content: z.string(),
  rationale: z.string().default(""),
});

export const AgentStructuredResultSchema = z.object({
  summary: z.string().default(""),
  patches: z.array(PatchSchema).default([]),
  questions: z.array(z.string()).default([]),
  issues: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().default(""),
        severity: IssueSeveritySchema.default("major"),
        section: z.enum(PRD_SECTION_KEYS).optional(),
        suggestion: z.string().default(""),
      })
    )
    .default([]),
});

export type AgentStructuredResult = z.infer<typeof AgentStructuredResultSchema>;

/** JSON Schema for Claude Agent SDK outputFormat */
export const agentStructuredOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "本轮中文摘要" },
    patches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          section: { type: "string", enum: [...PRD_SECTION_KEYS] },
          content: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["section", "content"],
      },
    },
    questions: {
      type: "array",
      items: { type: "string" },
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          severity: { type: "string", enum: ["critical", "major", "minor"] },
          section: { type: "string", enum: [...PRD_SECTION_KEYS] },
          suggestion: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  required: ["summary", "patches", "questions", "issues"],
} as const;

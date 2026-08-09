import { z } from "zod";
import { PrioritySchema } from "./prd.js";

export const SrDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(""),
  priority: PrioritySchema.default("P1"),
  phase: z.string().default("M1"),
  dependsOn: z.array(z.string()).default([]),
  traces: z.array(z.string()).default([]),
  acceptance: z.array(z.string()).default([]),
  notes: z.string().default(""),
});

export type SrDocument = z.infer<typeof SrDocumentSchema>;

export const TechSpecSchema = z.object({
  overview: z.string().default(""),
  architecture: z.string().default(""),
  modules: z.string().default(""),
  dependencies: z.string().default(""),
  risks: z.string().default(""),
  feasibility: z.string().default(""),
});

export type TechSpec = z.infer<typeof TechSpecSchema>;

export function createEmptyTechSpec(): TechSpec {
  return TechSpecSchema.parse({});
}

export function srToMarkdown(sr: SrDocument): string {
  const lines = [
    `# ${sr.id} ${sr.title}`,
    "",
    `> 优先级 ${sr.priority} · 阶段 ${sr.phase}`,
    "",
    "## 描述",
    "",
    sr.description || "（待补充）",
    "",
    "## 依赖",
    "",
    sr.dependsOn.length ? sr.dependsOn.map((d) => `- ${d}`).join("\n") : "（无）",
    "",
    "## 追溯需求",
    "",
    sr.traces.length ? sr.traces.map((t) => `- ${t}`).join("\n") : "（无）",
    "",
    "## 验收标准",
    "",
    sr.acceptance.length
      ? sr.acceptance.map((a) => `- ${a}`).join("\n")
      : "（待补充）",
    "",
    "## 备注",
    "",
    sr.notes || "（无）",
    "",
  ];
  return lines.join("\n");
}

export function techSpecToMarkdown(spec: TechSpec): string {
  return [
    "# 技术方案",
    "",
    "## 概述",
    "",
    spec.overview || "（待补充）",
    "",
    "## 架构",
    "",
    spec.architecture || "（待补充）",
    "",
    "## 模块边界",
    "",
    spec.modules || "（待补充）",
    "",
    "## 依赖",
    "",
    spec.dependencies || "（待补充）",
    "",
    "## 风险",
    "",
    spec.risks || "（待补充）",
    "",
    "## 可行性分析",
    "",
    spec.feasibility || "（待补充；可配置代码仓后运行只读分析）",
    "",
  ].join("\n");
}

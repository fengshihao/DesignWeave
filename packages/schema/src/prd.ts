import { z } from "zod";

export const PRD_SECTION_KEYS = [
  "meta",
  "problem",
  "users",
  "goals",
  "scope",
  "journeys",
  "requirements",
  "edge_cases",
  "nfr",
  "open_questions",
  "changelog",
] as const;

export type PrdSectionKey = (typeof PRD_SECTION_KEYS)[number];

export const PRD_SECTION_LABELS: Record<PrdSectionKey, string> = {
  meta: "元信息",
  problem: "问题与背景",
  users: "用户",
  goals: "目标与成功标准",
  scope: "范围",
  journeys: "用户旅程",
  requirements: "功能需求",
  edge_cases: "边界与异常",
  nfr: "非功能需求",
  open_questions: "未决问题",
  changelog: "修订记录",
};

export const PrioritySchema = z.enum(["P0", "P1", "P2"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const RequirementSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(""),
  priority: PrioritySchema.default("P1"),
  acceptance: z.array(z.string()).default([]),
});

export const JourneySchema = z.object({
  id: z.string(),
  name: z.string(),
  steps: z.array(z.string()).default([]),
  relatedRequirements: z.array(z.string()).default([]),
});

export const PrdMetaSchema = z.object({
  name: z.string().default(""),
  version: z.string().default("0.1.0"),
  owner: z.string().default(""),
  status: z
    .enum(["draft", "ready", "frozen"])
    .default("draft"),
  summary: z.string().default(""),
});

export const PrdDocumentSchema = z.object({
  meta: PrdMetaSchema.default(() => ({
    name: "",
    version: "0.1.0",
    owner: "",
    status: "draft" as const,
    summary: "",
  })),
  problem: z.string().default(""),
  users: z.string().default(""),
  goals: z.string().default(""),
  scope: z
    .object({
      inScope: z.string().default(""),
      outOfScope: z.string().default(""),
    })
    .default(() => ({ inScope: "", outOfScope: "" })),
  journeys: z.array(JourneySchema).default([]),
  requirements: z.array(RequirementSchema).default([]),
  edge_cases: z.string().default(""),
  nfr: z.string().default(""),
  open_questions: z.array(z.string()).default([]),
  changelog: z
    .array(
      z.object({
        at: z.string(),
        note: z.string(),
      })
    )
    .default([]),
});

export type PrdDocument = z.infer<typeof PrdDocumentSchema>;

export function createEmptyPrd(name = "未命名项目"): PrdDocument {
  return PrdDocumentSchema.parse({
    meta: {
      name,
      version: "0.1.0",
      owner: "",
      status: "draft",
      summary: "",
    },
    problem: "",
    users: "",
    goals: "",
    scope: { inScope: "", outOfScope: "" },
    journeys: [],
    requirements: [],
    edge_cases: "",
    nfr: "",
    open_questions: [],
    changelog: [
      {
        at: new Date().toISOString(),
        note: "创建 PRD",
      },
    ],
  });
}

export function prdToMarkdown(doc: PrdDocument): string {
  const lines: string[] = [];
  lines.push(`# ${doc.meta.name || "未命名项目"}`);
  lines.push("");
  lines.push(`> 版本 ${doc.meta.version} · 状态 ${statusLabel(doc.meta.status)} · 负责人 ${doc.meta.owner || "未指定"}`);
  if (doc.meta.summary) {
    lines.push("");
    lines.push(doc.meta.summary);
  }

  const section = (title: string, body: string) => {
    lines.push("");
    lines.push(`## ${title}`);
    lines.push("");
    lines.push(body.trim() || "（待补充）");
  };

  section(PRD_SECTION_LABELS.problem, doc.problem);
  section(PRD_SECTION_LABELS.users, doc.users);
  section(PRD_SECTION_LABELS.goals, doc.goals);

  lines.push("");
  lines.push(`## ${PRD_SECTION_LABELS.scope}`);
  lines.push("");
  lines.push("### 范围内");
  lines.push("");
  lines.push(doc.scope.inScope.trim() || "（待补充）");
  lines.push("");
  lines.push("### 范围外");
  lines.push("");
  lines.push(doc.scope.outOfScope.trim() || "（待补充）");

  lines.push("");
  lines.push(`## ${PRD_SECTION_LABELS.journeys}`);
  lines.push("");
  if (doc.journeys.length === 0) {
    lines.push("（待补充）");
  } else {
    for (const j of doc.journeys) {
      lines.push(`### ${j.id} ${j.name}`);
      lines.push("");
      j.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      if (j.relatedRequirements.length) {
        lines.push("");
        lines.push(`关联需求：${j.relatedRequirements.join(", ")}`);
      }
      lines.push("");
    }
  }

  lines.push("");
  lines.push(`## ${PRD_SECTION_LABELS.requirements}`);
  lines.push("");
  if (doc.requirements.length === 0) {
    lines.push("（待补充）");
  } else {
    for (const r of doc.requirements) {
      lines.push(`### ${r.id} [${r.priority}] ${r.title}`);
      lines.push("");
      lines.push(r.description || "（无描述）");
      if (r.acceptance.length) {
        lines.push("");
        lines.push("验收标准：");
        r.acceptance.forEach((a) => lines.push(`- ${a}`));
      }
      lines.push("");
    }
  }

  section(PRD_SECTION_LABELS.edge_cases, doc.edge_cases);
  section(PRD_SECTION_LABELS.nfr, doc.nfr);

  lines.push("");
  lines.push(`## ${PRD_SECTION_LABELS.open_questions}`);
  lines.push("");
  if (doc.open_questions.length === 0) {
    lines.push("（无）");
  } else {
    doc.open_questions.forEach((q) => lines.push(`- ${q}`));
  }

  lines.push("");
  lines.push(`## ${PRD_SECTION_LABELS.changelog}`);
  lines.push("");
  if (doc.changelog.length === 0) {
    lines.push("（无）");
  } else {
    for (const c of doc.changelog) {
      lines.push(`- ${c.at}：${c.note}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function statusLabel(status: PrdDocument["meta"]["status"]): string {
  switch (status) {
    case "draft":
      return "草稿";
    case "ready":
      return "就绪";
    case "frozen":
      return "已冻结";
  }
}

import { z } from "zod";

export const TestCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  srId: z.string().default(""),
  type: z.enum(["positive", "negative", "boundary"]).default("positive"),
  steps: z.array(z.string()).default([]),
  expected: z.string().default(""),
});

export type TestCase = z.infer<typeof TestCaseSchema>;

export const TEST_CASE_TYPE_LABELS: Record<TestCase["type"], string> = {
  positive: "正向",
  negative: "异常",
  boundary: "边界",
};

export const TestPlanSchema = z.object({
  strategy: z.string().default(""),
  scope: z.string().default(""),
  environment: z.string().default(""),
  risks: z.string().default(""),
  cases: z.array(TestCaseSchema).default([]),
});

export type TestPlan = z.infer<typeof TestPlanSchema>;

export function createEmptyTestPlan(): TestPlan {
  return TestPlanSchema.parse({});
}

export function testPlanToMarkdown(plan: TestPlan): string {
  const lines = [
    "# 测试方案",
    "",
    "## 测试策略",
    "",
    plan.strategy || "（待补充）",
    "",
    "## 范围",
    "",
    plan.scope || "（待补充）",
    "",
    "## 环境",
    "",
    plan.environment || "（待补充）",
    "",
    "## 风险优先级",
    "",
    plan.risks || "（待补充）",
    "",
    "## 建议用例",
    "",
  ];

  if (plan.cases.length === 0) {
    lines.push("（待补充）");
  } else {
    for (const c of plan.cases) {
      lines.push(
        `### ${c.id} [${TEST_CASE_TYPE_LABELS[c.type]}] ${c.title}`
      );
      lines.push("");
      if (c.srId) lines.push(`关联 SR：${c.srId}`);
      lines.push("");
      lines.push("步骤：");
      c.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      lines.push("");
      lines.push(`预期：${c.expected || "（待补充）"}`);
      lines.push("");
    }
  }

  lines.push("");
  return lines.join("\n");
}

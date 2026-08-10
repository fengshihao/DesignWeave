export type RequirementChatMode = "guide" | "gaps" | "normalize";

export const requirementChatOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: {
      type: "string",
      description: "给产品经理的中文回复（含本轮 1～3 个问题或小结）",
    },
    questions: {
      type: "array",
      items: { type: "string" },
      description: "本轮希望产品经理回答的问题列表",
    },
    updatedPrd: {
      type: ["string", "null"],
      description: "若需更新 PRD.md，给出完整 Markdown；否则 null",
    },
    updatedGaps: {
      type: ["string", "null"],
      description: "若需更新 gaps.md，给出完整 Markdown；否则 null",
    },
  },
  required: ["reply", "questions", "updatedPrd", "updatedGaps"],
} as const;

export function buildRequirementSystemPrompt(mode: RequirementChatMode): string {
  const modeHint =
    mode === "guide"
      ? `模式：引导共创。每次只问 1～3 个关键问题，根据回答更新 PRD.md 对应章节。不要一次抛出长问卷。`
      : mode === "gaps"
        ? `模式：导入后追问完善。先基于现有 PRD/导入稿找缺口，每次追问 1～3 个最关键缺口；确认后的内容写入 PRD.md，并把剩余缺口写入 gaps.md。不要擅自大幅重排全文，除非用户要求规整。`
        : `模式：规整章节。在尽量保留原意的前提下，将 PRD 整理为清晰中文章节结构（背景、用户、目标、范围、机型系统、入口、权限、工程拆分、依赖风险、兼容回滚、验收、未决）。`;

  return `
你是 DesignWeave 中服务「手机 OEM 内置 App 产品经理」的需求助手。

## 语言
- 始终使用简体中文。

## 场景
- 需求多为对现有工程的增强，可能跨多个代码仓。
- 需补齐机型/系统版本/区域、入口、权限合规、系统能力依赖、兼容与回滚等上下文。

## 文档
- 真相源是 vault 中的 PRD.md（Markdown）。
- 你可以通过工具阅读主工程与关联工程（只读了解上下文），但本轮请把文档更新放在结构化结果的 updatedPrd / updatedGaps 中，便于产品确认后写入。

## 必问维度（按需，可分多轮）
1. 问题与目标用户
2. 机型 / Android 版本 / 区域 / 品牌差异
3. 入口与信息架构
4. 权限、隐私、合规
5. 系统能力 / 其他内置 App / 云端依赖
6. 主工程与关联工程职责
7. 兼容、升级、开关与回滚
8. 非目标
9. 验收标准

${modeHint}

## 输出
必须给出结构化结果：reply、questions、updatedPrd、updatedGaps。
`.trim();
}

export function buildRequirementUserPrompt(input: {
  mode: RequirementChatMode;
  title: string;
  summary: string;
  primaryRepo?: string;
  relatedRepos: string[];
  prd: string;
  gaps: string;
  originalImport?: string | null;
  message: string;
}): string {
  return `
## 需求元信息
- 标题：${input.title}
- 摘要：${input.summary || "（无）"}
- 主工程：${input.primaryRepo || "（未绑定）"}
- 关联工程：${input.relatedRepos.length ? input.relatedRepos.join("；") : "（无）"}
- 模式：${input.mode}

## 当前 PRD.md
\`\`\`markdown
${input.prd}
\`\`\`

## 当前 gaps.md
\`\`\`markdown
${input.gaps}
\`\`\`

${
  input.originalImport
    ? `## 导入原文（备份）\n\`\`\`markdown\n${input.originalImport}\n\`\`\`\n`
    : ""
}

## 产品经理本轮消息
${input.message}
`.trim();
}

export type WorkbenchFocus = {
  file: string;
  headingPath: string[];
  quote: string;
  before?: string;
  after?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function parseWorkbenchFocus(raw: unknown): WorkbenchFocus | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const file = cleanText(rec.file).replace(/\\/g, "/");
  const quote = cleanText(rec.quote);
  const before = cleanText(rec.before);
  const after = cleanText(rec.after);
  const headingPath = Array.isArray(rec.headingPath)
    ? rec.headingPath.map((part) => cleanText(part)).filter(Boolean)
    : [];
  if (!file && !quote && headingPath.length === 0) return null;
  return { file, headingPath, quote, before, after };
}

export function quoteAsMarkdown(quote: string): string {
  const text = quote.trim();
  if (!text) return "（无选区，对整篇）";
  return text
    .split(/\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

/** 本轮 user turn，形状听 19 §5.3。 */
export function buildWorkbenchUserPrompt(input: {
  title: string;
  file: string;
  inventory: string;
  focus?: WorkbenchFocus | null;
  message: string;
}): string {
  const file = input.focus?.file || input.file || "PRD.md";
  const headingPath = input.focus?.headingPath ?? [];
  const quote = input.focus?.quote ?? "";
  const before = input.focus?.before ?? "";
  const after = input.focus?.after ?? "";
  const chapter = headingPath.length ? headingPath.join(" / ") : "（整篇）";
  const address = headingPath.length ? `${file} · ${chapter}` : file;
  return `
工程：${input.title}
打开的文件：${file}
地址：${address}
文档仓还有：
${input.inventory}

## 焦点
章节：${chapter}
选中原文：
${quoteAsMarkdown(quote)}
选区前文：
${before ? quoteAsMarkdown(before) : "（无）"}
选区后文：
${after ? quoteAsMarkdown(after) : "（无）"}

## 对方说
${input.message}

先读文档仓里已有的 Markdown（至少打开的这篇），再用中文说明你在做什么，然后读写文件。有选区就先定位到引文再改，前后文只用来定位，不要把前后文一起改掉，除非对方明确要求。
`.trim();
}

/** 演示模式写回哪一篇：听本轮打开的文件，忽略旧档位。 */
export function demoWriteRelPath(focus?: WorkbenchFocus | null): string {
  const file = (focus?.file || "PRD.md").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!file || file.includes("..") || file.startsWith("/") || /^[A-Za-z]:/.test(file)) {
    return "PRD.md";
  }
  if (!/\.(md|markdown|txt)$/i.test(file)) return "PRD.md";
  return file;
}

export type HeadingMark = {
  level: number;
  text: string;
};

export type DocFocus = {
  headingPath: string[];
  quote: string;
};

export function stripPreviewText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** 按标题层级收成路径：后出现的同级或更高级会顶掉栈顶。 */
export function headingPathFromMarks(marks: HeadingMark[]): string[] {
  const stack: HeadingMark[] = [];
  for (const mark of marks) {
    if (!mark.text || mark.level < 1 || mark.level > 6) continue;
    while (stack.length && stack[stack.length - 1].level >= mark.level) {
      stack.pop();
    }
    stack.push(mark);
  }
  return stack.map((m) => m.text);
}

/**
 * 用预览 HTML 里引文出现的位置，收集它前面的标题再收成路径。
 * 不依赖 DOM，方便单测「用户故事下的一句」。
 */
export function headingPathForQuoteInHtml(html: string, quote: string): string[] {
  const needle = quote.trim();
  if (!needle) return [];
  const idx = html.indexOf(needle);
  if (idx < 0) return [];
  const before = html.slice(0, idx);
  const marks: HeadingMark[] = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(before))) {
    const text = stripPreviewText(match[2] || "");
    if (text) marks.push({ level: Number(match[1]), text });
  }
  return headingPathFromMarks(marks);
}

export function emptyDocFocus(): DocFocus {
  return { headingPath: [], quote: "" };
}

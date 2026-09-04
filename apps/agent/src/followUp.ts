import type { DocFolder } from "./docFolders.js";
import { FOLDER_LABELS } from "./docFolders.js";

export type FollowItem = {
  date: string;
  action: string;
  from: DocFolder;
  sha: string;
  note: string;
  touched: string;
};

export function emptyFollowMarkdown(): string {
  return `# 跟上

## 未处理

## 已处理
`;
}

function sectionBody(text: string, heading: string): { start: number; end: number; body: string } {
  const marker = `## ${heading}`;
  const start = text.indexOf(marker);
  if (start === -1) {
    return { start: text.length, end: text.length, body: "" };
  }
  const bodyStart = start + marker.length;
  const next = text.indexOf("\n## ", bodyStart);
  const end = next === -1 ? text.length : next;
  return { start: bodyStart, end, body: text.slice(bodyStart, end) };
}

export function hasPendingFollow(text: string): boolean {
  const pending = sectionBody(text || "", "未处理").body;
  return /###\s/.test(pending);
}

function formatItem(item: FollowItem, status: string): string {
  const sha = item.sha ? ` · \`${item.sha}\`` : "";
  return `### ${item.date} · ${item.action}
- 来自：${item.from}${sha}
- 说明：${item.note || "（无说明）"}
- 动到：${item.touched || "（未列出）"}
- 状态：${status}
`;
}

export function appendFollowItem(text: string, item: FollowItem): string {
  const src = text.trim() ? text : emptyFollowMarkdown();
  const block = formatItem(item, "未跟上").trimEnd();
  const pending = sectionBody(src, "未处理");
  if (src.indexOf("## 未处理") === -1) {
    return `${src.trim()}\n\n## 未处理\n\n${block}\n\n## 已处理\n`;
  }
  const insertAt = pending.start;
  const prefix = src.slice(0, insertAt).replace(/\s*$/, "\n\n");
  const suffix = src.slice(insertAt).replace(/^\s*/, "\n");
  return `${prefix}${block}\n${suffix}`;
}

export function markPendingCaughtUp(text: string, caughtSha: string): string {
  const src = text.trim() ? text : emptyFollowMarkdown();
  const pending = sectionBody(src, "未处理");
  const blocks = pending.body
    .split(/(?=^### )/m)
    .map((b) => b.trim())
    .filter((b) => b.startsWith("### "));
  if (!blocks.length) return src;

  const moved = blocks
    .map((block) => {
      let next = block.replace(/- 状态：未跟上/, "- 状态：已跟上");
      if (!/跟上于：/.test(next)) {
        next = `${next.trimEnd()}\n- 跟上于：\`${caughtSha || "本版"}\``;
      }
      return next.trim();
    })
    .join("\n\n");

  const withoutPending = `${src.slice(0, pending.start)}\n\n${src.slice(pending.end)}`;
  const done = sectionBody(withoutPending, "已处理");
  if (withoutPending.indexOf("## 已处理") === -1) {
    return `${withoutPending.trim()}\n\n## 已处理\n\n${moved}\n`;
  }
  const prefix = withoutPending.slice(0, done.start).replace(/\s*$/, "\n\n");
  const suffix = withoutPending.slice(done.start).replace(/^\s*/, "\n");
  return `${prefix}${moved}\n${suffix}`;
}

export function followActionLabel(folder: DocFolder): string {
  return `${FOLDER_LABELS[folder]}记入一版`;
}

export function todayStamp(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

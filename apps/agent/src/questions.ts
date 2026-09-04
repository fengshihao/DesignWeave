import fs from "node:fs";
import path from "node:path";
import type { DocFolder } from "./docFolders.js";
import { FOLDER_LABELS, questionPath } from "./docFolders.js";
import { ROLE_LABELS, type AppRole } from "./roles.js";
import { commitSelected, type GitAuthor, type VaultVersion } from "./gitVault.js";

export type InboxQuestion = {
  asker: string;
  target: string;
  question: string;
};

export function emptyTodoMarkdown(): string {
  return `# 待办

本文件夹作者要做的事。可以从问题里转过来。

| 状态 | 事项 | 来自 | 说明 |
| --- | --- | --- | --- |
`;
}

export function emptyQuestionMarkdown(): string {
  return `# 问题

给本文件夹作者看的提问。别人圈了正文，可以直接加一行，也可以先问 AI。

| 状态 | 提问人 | 针对 | 问题 |
| --- | --- | --- | --- |
`;
}

function cell(value: string): string {
  const text = value.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
  return text || "—";
}

export function appendQuestionRow(text: string, item: InboxQuestion): string {
  const src = (text || "").trim() ? text : emptyQuestionMarkdown();
  const row = `| 未答 | ${cell(item.asker)} | ${cell(item.target)} | ${cell(item.question)} |`;
  if (!src.includes("| 状态 |")) {
    return `${emptyQuestionMarkdown()}${row}\n`;
  }
  const body = src.endsWith("\n") ? src : `${src}\n`;
  return `${body}${row}\n`;
}

export function questionTargetLabel(file: string, headingPath: string[]): string {
  const path = file.replace(/\\/g, "/").replace(/^\/+/, "");
  const chapter = headingPath.map((p) => p.trim()).filter(Boolean).join(" / ");
  return chapter ? `${path} · ${chapter}` : path || "（未标明）";
}

export function askerLabel(role: AppRole, name: string): string {
  return `${name}（${ROLE_LABELS[role]}）`;
}

export function addQuestionCommitMessage(folder: DocFolder): string {
  return `我：给${FOLDER_LABELS[folder]}加了一个问题`;
}

export function recordInboxQuestion(input: {
  vaultPath: string;
  folder: DocFolder;
  item: InboxQuestion;
  author: GitAuthor;
}): VaultVersion | null {
  const rel = questionPath(input.folder);
  const abs = path.join(input.vaultPath, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : emptyQuestionMarkdown();
  fs.writeFileSync(abs, appendQuestionRow(prev, input.item), "utf8");
  return commitSelected(
    input.vaultPath,
    [rel],
    addQuestionCommitMessage(input.folder),
    input.author
  );
}

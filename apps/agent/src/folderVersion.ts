import fs from "node:fs";
import path from "node:path";
import type { GitAuthor, VaultVersion } from "./gitVault.js";
import {
  changedFiles,
  commitSelected,
  headingsTouched,
  isDirtyFolder,
  shortHead,
} from "./gitVault.js";
import {
  DOWNSTREAM,
  FOLLOW_FILE,
  followPath,
  pathUnderFolder,
  type DocFolder,
} from "./docFolders.js";
import {
  appendFollowItem,
  emptyFollowMarkdown,
  followActionLabel,
  hasPendingFollow,
  markPendingCaughtUp,
  todayStamp,
} from "./followUp.js";

function readFollow(vaultPath: string, folder: DocFolder): string {
  const abs = path.join(vaultPath, followPath(folder));
  if (!fs.existsSync(abs)) return emptyFollowMarkdown();
  return fs.readFileSync(abs, "utf8");
}

function writeFollow(vaultPath: string, folder: DocFolder, text: string): void {
  const abs = path.join(vaultPath, followPath(folder));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text.endsWith("\n") ? text : `${text}\n`, "utf8");
}

function contentFiles(files: string[], folder: DocFolder): string[] {
  return files.filter(
    (f) => pathUnderFolder(f, folder) && !f.endsWith(`/${FOLLOW_FILE}`) && path.basename(f) !== FOLLOW_FILE
  );
}

function touchedLabel(files: string[], headings: string[]): string {
  const names = [...new Set(files.map((f) => path.basename(f)))];
  const bits = [...names];
  if (headings.length) bits.push(headings.slice(0, 6).join(" / "));
  return bits.filter(Boolean).join(" · ");
}

export function folderHasPendingFollow(vaultPath: string, folder: DocFolder): boolean {
  return hasPendingFollow(readFollow(vaultPath, folder));
}

export function recordFolderVersion(input: {
  vaultPath: string;
  folder: DocFolder;
  message: string;
  author: GitAuthor;
  markCaughtUp?: boolean;
}): VaultVersion | null {
  const { vaultPath, folder, message, author } = input;
  const before = changedFiles(vaultPath);
  const contentChanged = contentFiles(before, folder);
  const shaHint = shortHead(vaultPath);

  if (input.markCaughtUp && hasPendingFollow(readFollow(vaultPath, folder))) {
    writeFollow(vaultPath, folder, markPendingCaughtUp(readFollow(vaultPath, folder), shaHint || "本版"));
  }

  if (!isDirtyFolder(vaultPath, folder) && !DOWNSTREAM[folder].some((d) => isDirtyFolder(vaultPath, d))) {
    const still = changedFiles(vaultPath).some(
      (f) =>
        pathUnderFolder(f, folder) ||
        DOWNSTREAM[folder].some((d) => f === followPath(d))
    );
    if (!still) return null;
  }

  const headings = headingsTouched(vaultPath, contentChanged);
  const note = message.replace(/^(我|AI|系统)[：:]/, "").trim() || message;

  if (contentChanged.length) {
    for (const down of DOWNSTREAM[folder]) {
      writeFollow(
        vaultPath,
        down,
        appendFollowItem(readFollow(vaultPath, down), {
          date: todayStamp(),
          action: followActionLabel(folder),
          from: folder,
          sha: shaHint,
          note,
          touched: touchedLabel(contentChanged, headings),
        })
      );
    }
  }

  const toCommit = new Set<string>();
  for (const f of changedFiles(vaultPath)) {
    if (pathUnderFolder(f, folder)) toCommit.add(f);
    if (DOWNSTREAM[folder].some((d) => f === followPath(d))) toCommit.add(f);
  }
  if (!toCommit.size) return null;
  return commitSelected(vaultPath, [...toCommit], message, author);
}

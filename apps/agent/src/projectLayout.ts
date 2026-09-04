import fs from "node:fs";
import path from "node:path";
import { DOC_FOLDERS, FOLDER_MAIN_FILE, FOLLOW_FILE, QUESTION_FILE, TODO_FILE, type DocFolder } from "./docFolders.js";
import { emptyFollowMarkdown } from "./followUp.js";
import { emptyQuestionMarkdown, emptyTodoMarkdown } from "./questions.js";
import { prdPackTemplateDir } from "./prdPack.js";
import { commitAll, isDirty } from "./gitVault.js";

function moveIfExists(from: string, to: string): boolean {
  if (!fs.existsSync(from)) return false;
  if (fs.existsSync(to)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  return true;
}

function copyTemplateFile(rel: string, destRoot: string, title: string): boolean {
  const dest = path.join(destRoot, rel);
  if (fs.existsSync(dest)) return false;
  const src = path.join(prdPackTemplateDir(), rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(src)) {
    let text = fs.readFileSync(src, "utf8");
    if (rel.endsWith(".md") && title) {
      text = text.replace("（工程名）", title);
    }
    fs.writeFileSync(dest, text, "utf8");
    return true;
  }
  if (rel.endsWith(FOLLOW_FILE)) {
    fs.writeFileSync(dest, emptyFollowMarkdown(), "utf8");
    return true;
  }
  if (rel.endsWith(TODO_FILE)) {
    fs.writeFileSync(dest, emptyTodoMarkdown(), "utf8");
    return true;
  }
  if (rel.endsWith(QUESTION_FILE)) {
    fs.writeFileSync(dest, emptyQuestionMarkdown(), "utf8");
    return true;
  }
  return false;
}

/** 把旧工程根上的 PRD / gaps / import 迁进 product/，并补齐三个固定文件夹。 */
export function ensureProjectLayout(vaultPath: string, title = ""): boolean {
  if (!vaultPath || !fs.existsSync(vaultPath)) return false;
  let changed = false;

  const product = path.join(vaultPath, "product");
  fs.mkdirSync(product, { recursive: true });
  changed = moveIfExists(path.join(vaultPath, "PRD.md"), path.join(product, "PRD.md")) || changed;
  changed = moveIfExists(path.join(vaultPath, "gaps.md"), path.join(product, "gaps.md")) || changed;
  const oldImport = path.join(vaultPath, "import");
  const newImport = path.join(product, "import");
  if (fs.existsSync(oldImport) && !fs.existsSync(newImport)) {
    fs.renameSync(oldImport, newImport);
    changed = true;
  }
  changed =
    moveIfExists(path.join(vaultPath, "调研.md"), path.join(vaultPath, "eng", "调研.md")) || changed;

  for (const folder of DOC_FOLDERS) {
    fs.mkdirSync(path.join(vaultPath, folder), { recursive: true });
  }
  for (const rel of Object.values(FOLDER_MAIN_FILE)) {
    changed = copyTemplateFile(rel, vaultPath, title) || changed;
  }
  for (const folder of DOC_FOLDERS) {
    changed = copyTemplateFile(`${folder}/${TODO_FILE}`, vaultPath, title) || changed;
    changed = copyTemplateFile(`${folder}/${QUESTION_FILE}`, vaultPath, title) || changed;
  }
  for (const folder of ["eng", "qa"] as DocFolder[]) {
    changed = copyTemplateFile(`${folder}/${FOLLOW_FILE}`, vaultPath, title) || changed;
  }
  return changed;
}

/** 补齐模板；若仓原先是干净的，立刻记一版，避免空待办/问题把发送关卡卡住。 */
export function ensureProjectLayoutAndCommit(vaultPath: string, title = ""): boolean {
  if (!vaultPath || !fs.existsSync(vaultPath)) return false;
  const dirtyBefore = isDirty(vaultPath);
  const changed = ensureProjectLayout(vaultPath, title);
  if (changed && !dirtyBefore) {
    try {
      commitAll(vaultPath, "系统：整理成产品/研发/测试", {
        name: "系统",
        email: "system@designweave.local",
      });
    } catch {
      /* 整理失败也不挡打开 */
    }
  }
  return changed;
}

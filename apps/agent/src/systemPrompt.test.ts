import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { HttpError } from "./httpError.js";
import {
  appendSystemPromptForRun,
  ensureSystemPromptFile,
  HARD_RULES,
  NO_WORKSPACE_ROOT,
  readBuiltinSystemPrompt,
  readSystemPrompt,
  requirePromptWorkspaceRoot,
  resetSystemPrompt,
  systemPromptPath,
  writeSystemPrompt,
} from "./systemPrompt.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
process.env.SYSTEM_PROMPT_TEMPLATE = path.join(repoRoot, "packages/templates/system-prompt.md");

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dw-prompt-"));
}

test("出厂默认写清有选区改选区、一次问 1～3 个问题", () => {
  const text = readBuiltinSystemPrompt();
  assert.match(text, /对方圈了哪一段，就优先改那一段/);
  assert.match(text, /一次只问 1～3 个关键问题/);
  assert.match(HARD_RULES, /架构师只写 eng\/，测试只写 qa\/，产品经理只写 product\//);
  assert.match(HARD_RULES, /跟上\.md 由系统维护/);
  assert.doesNotMatch(text, /档位：|检查清晰度|可行性只读代码/);
});

test("无根目录拒绝读写系统提示词", () => {
  assert.throws(
    () => requirePromptWorkspaceRoot(null),
    (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.message, NO_WORKSPACE_ROOT);
      assert.equal(err.status, 409);
      return true;
    }
  );
  assert.throws(() => requirePromptWorkspaceRoot(""), /请先选定运行根目录/);
});

test("根目录下没有文件时拷入出厂默认", () => {
  const root = tmpRoot();
  try {
    const dest = ensureSystemPromptFile(root);
    assert.equal(dest, systemPromptPath(root));
    assert.equal(fs.readFileSync(dest, "utf8"), readBuiltinSystemPrompt());
    const got = readSystemPrompt(root);
    assert.equal(got.text, readBuiltinSystemPrompt());
    assert.equal(got.isDefault, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("PUT 后 GET 就是刚写入的正文", () => {
  const root = tmpRoot();
  try {
    const text = "只问一件事。不要问卷。\n";
    const written = writeSystemPrompt(root, text);
    const got = readSystemPrompt(root);
    assert.equal(written.text, text);
    assert.equal(got.text, text);
    assert.equal(got.isDefault, false);
    assert.equal(fs.readFileSync(systemPromptPath(root), "utf8"), text);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reset 用内置默认覆盖磁盘", () => {
  const root = tmpRoot();
  try {
    writeSystemPrompt(root, "自定义口味");
    const reset = resetSystemPrompt(root);
    assert.equal(reset.text, readBuiltinSystemPrompt());
    assert.equal(reset.isDefault, true);
    assert.equal(fs.readFileSync(systemPromptPath(root), "utf8"), readBuiltinSystemPrompt());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("空文件视为只要硬规则，ensure 不偷偷写回默认", () => {
  const root = tmpRoot();
  try {
    writeSystemPrompt(root, "");
    ensureSystemPromptFile(root);
    const got = readSystemPrompt(root);
    assert.equal(got.text, "");
    assert.equal(got.isDefault, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("改磁盘上的系统提示词后，append 里能看到新句子", () => {
  const root = tmpRoot();
  try {
    writeSystemPrompt(root, "这是架构师刚写的口味：只改圈住的那一段。\n");
    const append = appendSystemPromptForRun({ workspaceRoot: root });
    assert.match(append, /只改圈住的那一段/);
    assert.match(append, /只写文档仓里的 Markdown/);
    assert.match(append, /不要假装读过代码/);
    assert.equal(append.startsWith(HARD_RULES.trim()), true);
    assert.doesNotMatch(append, /档位：检查清晰度|档位：共创|档位：拷问|档位：可行性/);
    assert.doesNotMatch(append, /clarity: ready|必须 ready/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("空系统提示词只要硬规则，缺文件则用出厂默认", () => {
  const emptyRoot = tmpRoot();
  const missingRoot = tmpRoot();
  try {
    writeSystemPrompt(emptyRoot, "");
    const emptyAppend = appendSystemPromptForRun({ workspaceRoot: emptyRoot });
    assert.equal(emptyAppend, HARD_RULES.trim());
    assert.doesNotMatch(emptyAppend, /一次只问 1～3 个关键问题/);

    const missingAppend = appendSystemPromptForRun({ workspaceRoot: missingRoot });
    assert.match(missingAppend, /一次只问 1～3 个关键问题/);
    assert.match(missingAppend, /对方圈了哪一段，就优先改那一段/);
    assert.match(missingAppend, /只写文档仓里的 Markdown/);
  } finally {
    fs.rmSync(emptyRoot, { recursive: true, force: true });
    fs.rmSync(missingRoot, { recursive: true, force: true });
  }
});

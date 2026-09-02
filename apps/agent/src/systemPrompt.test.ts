import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { HttpError } from "./httpError.js";
import {
  ensureSystemPromptFile,
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

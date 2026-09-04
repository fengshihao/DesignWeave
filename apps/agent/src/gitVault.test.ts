import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { changedFiles, commitSelected, ensureDocumentVault } from "./gitVault.js";

test("changedFiles 能认出中文路径，记版能 add 进去", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-git-"));
  try {
    ensureDocumentVault(dir);
    const rel = "eng/方案.md";
    fs.mkdirSync(path.join(dir, "eng"), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), "初版\n", "utf8");
    const first = commitSelected(
      dir,
      [rel, ".gitignore"],
      "系统：初版",
      { name: "系统", email: "system@designweave.local" }
    );
    assert.ok(first);
    fs.writeFileSync(path.join(dir, rel), "改过\n", "utf8");
    assert.deepEqual(changedFiles(dir), [rel]);
    const second = commitSelected(
      dir,
      changedFiles(dir),
      "我：保存 方案.md",
      { name: "阿朱", email: "a@example.com" }
    );
    assert.ok(second);
    assert.equal(changedFiles(dir).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

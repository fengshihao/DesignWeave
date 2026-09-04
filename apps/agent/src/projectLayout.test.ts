import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ensureProjectLayout } from "./projectLayout.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
process.env.PRD_PACK_TEMPLATE_DIR = path.join(repoRoot, "packages/templates/prd-pack");

test("旧工程根上的 PRD / gaps / import / 调研 迁进三文件夹", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-layout-"));
  try {
    fs.writeFileSync(path.join(dir, "PRD.md"), "# 旧 PRD\n", "utf8");
    fs.writeFileSync(path.join(dir, "gaps.md"), "# 待补齐\n", "utf8");
    fs.mkdirSync(path.join(dir, "import"));
    fs.writeFileSync(path.join(dir, "import", "original.md"), "原文\n", "utf8");
    fs.writeFileSync(path.join(dir, "调研.md"), "# 调研\n", "utf8");
    assert.equal(ensureProjectLayout(dir, "夜间模式"), true);
    assert.equal(fs.existsSync(path.join(dir, "PRD.md")), false);
    assert.equal(fs.existsSync(path.join(dir, "gaps.md")), false);
    assert.equal(fs.existsSync(path.join(dir, "调研.md")), false);
    assert.equal(fs.existsSync(path.join(dir, "import")), false);
    assert.match(fs.readFileSync(path.join(dir, "product/PRD.md"), "utf8"), /旧 PRD/);
    assert.match(fs.readFileSync(path.join(dir, "product/gaps.md"), "utf8"), /待补齐/);
    assert.match(fs.readFileSync(path.join(dir, "product/import/original.md"), "utf8"), /原文/);
    assert.match(fs.readFileSync(path.join(dir, "eng/调研.md"), "utf8"), /调研/);
    assert.ok(fs.existsSync(path.join(dir, "eng/方案.md")));
    assert.ok(fs.existsSync(path.join(dir, "eng/跟上.md")));
    assert.ok(fs.existsSync(path.join(dir, "eng/待办.md")));
    assert.ok(fs.existsSync(path.join(dir, "eng/问题.md")));
    assert.ok(fs.existsSync(path.join(dir, "qa/测试.md")));
    assert.ok(fs.existsSync(path.join(dir, "qa/跟上.md")));
    assert.ok(fs.existsSync(path.join(dir, "qa/待办.md")));
    assert.ok(fs.existsSync(path.join(dir, "qa/问题.md")));
    assert.ok(fs.existsSync(path.join(dir, "product/待办.md")));
    assert.ok(fs.existsSync(path.join(dir, "product/问题.md")));
    assert.equal(ensureProjectLayout(dir, "夜间模式"), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

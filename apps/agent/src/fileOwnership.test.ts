import test from "node:test";
import assert from "node:assert/strict";
import { canWriteFile, normalizeVaultPath } from "./fileOwnership.js";

test("normalizes vault paths", () => {
  assert.equal(normalizeVaultPath("\\product\\PRD.md"), "product/PRD.md");
});

test("PM can write product folder docs", () => {
  assert.equal(canWriteFile("designer", "product/PRD.md"), true);
  assert.equal(canWriteFile("designer", "product/待办.md"), true);
  assert.equal(canWriteFile("designer", "eng/方案.md"), false);
  assert.equal(canWriteFile("designer", "product/gaps.md"), false);
});

test("architect can write eng folder docs", () => {
  assert.equal(canWriteFile("architect", "eng/调研.md"), true);
  assert.equal(canWriteFile("architect", "eng/方案.md"), true);
  assert.equal(canWriteFile("architect", "product/PRD.md"), false);
  assert.equal(canWriteFile("architect", "qa/测试.md"), false);
});

test("tester can write qa folder docs", () => {
  assert.equal(canWriteFile("tester", "qa/测试.md"), true);
  assert.equal(canWriteFile("tester", "qa/跟上.md"), true);
  assert.equal(canWriteFile("tester", "product/PRD.md"), false);
});

test("import, meta, and gaps are not writable", () => {
  assert.equal(canWriteFile("designer", "product/import/original.md"), false);
  assert.equal(canWriteFile("architect", "meta.md"), false);
  assert.equal(canWriteFile("designer", "product/gaps.md"), false);
});

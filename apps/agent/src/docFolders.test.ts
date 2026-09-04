import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canCreateProject,
  canWritePath,
  defaultFileForRole,
  folderOfPath,
  writableFolderOf,
} from "./docFolders.js";
import {
  appendFollowItem,
  emptyFollowMarkdown,
  hasPendingFollow,
  markPendingCaughtUp,
} from "./followUp.js";

test("三角色各写一个文件夹，测试不能建工程", () => {
  assert.equal(writableFolderOf("architect"), "eng");
  assert.equal(writableFolderOf("designer"), "product");
  assert.equal(writableFolderOf("tester"), "qa");
  assert.equal(defaultFileForRole("architect"), "eng/方案.md");
  assert.equal(defaultFileForRole("designer"), "product/PRD.md");
  assert.equal(defaultFileForRole("tester"), "qa/测试.md");
  assert.equal(canWritePath("designer", "product/PRD.md"), true);
  assert.equal(canWritePath("designer", "eng/方案.md"), false);
  assert.equal(canWritePath("architect", "product/PRD.md"), false);
  assert.equal(canWritePath("tester", "qa/跟上.md"), true);
  assert.equal(canCreateProject("architect"), true);
  assert.equal(canCreateProject("designer"), true);
  assert.equal(canCreateProject("tester"), false);
  assert.equal(folderOfPath("eng/方案.md"), "eng");
  assert.equal(folderOfPath("meta.md"), null);
});

test("跟上.md 追加未处理条，标成已跟上后挪到已处理", () => {
  let text = emptyFollowMarkdown();
  assert.equal(hasPendingFollow(text), false);
  text = appendFollowItem(text, {
    date: "2026-09-04",
    action: "产品记入一版",
    from: "product",
    sha: "abc1234",
    note: "改了用户故事",
    touched: "PRD.md · 用户故事",
  });
  assert.equal(hasPendingFollow(text), true);
  assert.match(text, /## 未处理/);
  assert.match(text, /来自：product · `abc1234`/);
  assert.match(text, /状态：未跟上/);
  text = markPendingCaughtUp(text, "def5678");
  assert.equal(hasPendingFollow(text), false);
  assert.match(text, /## 已处理/);
  assert.match(text, /状态：已跟上/);
  assert.match(text, /跟上于：`def5678`/);
  assert.doesNotMatch(text.split("## 未处理")[1]?.split("## 已处理")[0] || "", /### /);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendQuestionRow,
  askerLabel,
  emptyQuestionMarkdown,
  questionTargetLabel,
} from "./questions.js";

test("问题表追加一行，去掉换行并转义竖线", () => {
  const next = appendQuestionRow(emptyQuestionMarkdown(), {
    asker: "冯（架构师）",
    target: "product/PRD.md · 用户故事",
    question: "夜间模式默认关，\n低端机是否也要开？含 | 竖线",
  });
  assert.match(next, /\| 状态 \| 提问人 \| 针对 \| 问题 \|/);
  assert.match(next, /\| 未答 \| 冯（架构师） \| product\/PRD.md · 用户故事 \|/);
  assert.match(next, /夜间模式默认关， 低端机是否也要开？含 \\| 竖线/);
});

test("空正文也能长出表头再追加", () => {
  const next = appendQuestionRow("", {
    asker: "测（测试）",
    target: "eng/方案.md",
    question: "接口超时怎么验收？",
  });
  assert.match(next, /# 问题/);
  assert.match(next, /接口超时怎么验收？/);
});

test("针对栏拼文件和章节，提问人带角色", () => {
  assert.equal(questionTargetLabel("product/PRD.md", ["用户故事", "US-001"]), "product/PRD.md · 用户故事 / US-001");
  assert.equal(questionTargetLabel("eng/方案.md", []), "eng/方案.md");
  assert.equal(askerLabel("architect", "冯"), "冯（架构师）");
  assert.equal(askerLabel("tester", "李"), "李（测试）");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { headingPathForQuoteInHtml, headingPathFromMarks } from "./docFocus.js";

test("标题栈按层级收成路径", () => {
  assert.deepEqual(
    headingPathFromMarks([
      { level: 1, text: "夜间模式" },
      { level: 2, text: "用户故事" },
      { level: 3, text: "US-001" },
    ]),
    ["夜间模式", "用户故事", "US-001"]
  );
  assert.deepEqual(
    headingPathFromMarks([
      { level: 1, text: "夜间模式" },
      { level: 2, text: "用户故事" },
      { level: 2, text: "规格与约束" },
    ]),
    ["夜间模式", "规格与约束"]
  );
});

test("用户故事下的一句能解析出该节标题", () => {
  const html = `
    <h1>夜间模式</h1>
    <h2>背景与目标</h2>
    <p>设置页太亮。</p>
    <h2>用户故事</h2>
    <p>作为用户我想要一键关灯。</p>
    <h2>规格与约束</h2>
    <p>不要改业务代码。</p>
  `;
  const path = headingPathForQuoteInHtml(html, "作为用户我想要一键关灯。");
  assert.ok(path.includes("用户故事"), `headingPath=${JSON.stringify(path)}`);
  assert.deepEqual(path, ["夜间模式", "用户故事"]);
});

test("引文不在 HTML 里或为空则没有路径", () => {
  assert.deepEqual(headingPathForQuoteInHtml("<h2>用户故事</h2><p>hello</p>", ""), []);
  assert.deepEqual(headingPathForQuoteInHtml("<h2>用户故事</h2><p>hello</p>", "没有这段"), []);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWorkbenchUserPrompt,
  parseWorkbenchFocus,
  quoteAsMarkdown,
} from "./workbenchPrompt.js";

test("parseWorkbenchFocus 丢掉空对象，收下文件 + 引文", () => {
  assert.equal(parseWorkbenchFocus(null), null);
  assert.equal(parseWorkbenchFocus({}), null);
  assert.deepEqual(parseWorkbenchFocus({ file: "PRD.md", headingPath: [], quote: "" }), {
    file: "PRD.md",
    headingPath: [],
    quote: "",
  });
  assert.deepEqual(
    parseWorkbenchFocus({
      file: " PRD.md ",
      headingPath: [" 用户故事 ", "", "US-001"],
      quote: "  作为用户我想要一键关灯。  ",
    }),
    {
      file: "PRD.md",
      headingPath: ["用户故事", "US-001"],
      quote: "作为用户我想要一键关灯。",
    }
  );
});

test("无选区时 userPrompt 按整篇拼，不写档位", () => {
  const prompt = buildWorkbenchUserPrompt({
    title: "夜间模式",
    file: "PRD.md",
    inventory: "- PRD.md（已有）",
    message: "帮我理一理",
  });
  assert.match(prompt, /工程：夜间模式/);
  assert.match(prompt, /打开的文件：PRD.md/);
  assert.match(prompt, /文档仓还有：/);
  assert.match(prompt, /章节：（整篇）/);
  assert.match(prompt, /（无选区，对整篇）/);
  assert.match(prompt, /## 对方说\n帮我理一理/);
  assert.doesNotMatch(prompt, /档位/);
  assert.match(prompt, /有选区就先定位到引文再改/);
});

test("有选区时 userPrompt 带章节路径和 markdown 引文", () => {
  const prompt = buildWorkbenchUserPrompt({
    title: "夜间模式",
    file: "gaps.md",
    inventory: "- PRD.md（已有）",
    focus: {
      file: "PRD.md",
      headingPath: ["用户故事", "US-001"],
      quote: "作为用户我想要一键关灯。",
    },
    message: "把验收写成可勾选项",
  });
  assert.match(prompt, /打开的文件：PRD.md/);
  assert.match(prompt, /章节：用户故事 \/ US-001/);
  assert.equal(quoteAsMarkdown("作为用户我想要一键关灯。"), "> 作为用户我想要一键关灯。");
  assert.match(prompt, /> 作为用户我想要一键关灯。/);
  assert.match(prompt, /把验收写成可勾选项/);
  assert.doesNotMatch(prompt, /档位/);
});

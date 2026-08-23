import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AguiEventSchema,
  maxSeq,
  mergeAguiEvents,
  parseSseData,
  reduceAguiEvents,
  toAguiEvent,
} from "./run.js";

test("AguiEventSchema 接受 RUN_STARTED / TEXT_MESSAGE_CONTENT / CUSTOM", () => {
  const started = AguiEventSchema.parse({
    seq: 1,
    type: "RUN_STARTED",
    runId: "r1",
    threadId: "p1",
    mode: "coauthor",
  });
  assert.equal(started.type, "RUN_STARTED");

  const text = AguiEventSchema.parse({
    seq: 3,
    type: "TEXT_MESSAGE_CONTENT",
    runId: "r1",
    messageId: "user-r1",
    role: "user",
    delta: "把登录写清楚",
  });
  assert.equal(text.delta, "把登录写清楚");

  const hint = AguiEventSchema.parse({
    seq: 4,
    type: "CUSTOM",
    runId: "r1",
    name: "hint",
    value: { text: "正在读文档仓…" },
  });
  assert.equal(hint.name, "hint");
});

test("toAguiEvent 把旧事件名收成 AG-UI 子集", () => {
  assert.equal(
    toAguiEvent({ seq: 1, type: "trust", payload: { text: "只写文档仓" }, runId: "r1" }).name,
    "trust"
  );
  const hint = toAguiEvent({
    seq: 2,
    type: "progress",
    payload: { text: "正在读" },
    runId: "r1",
  });
  assert.equal(hint.type, "CUSTOM");
  assert.equal(hint.name, "hint");
  assert.equal(hint.value?.text, "正在读");

  const text = toAguiEvent({
    seq: 3,
    type: "text",
    payload: { text: "你好" },
    runId: "r1",
  });
  assert.equal(text.type, "TEXT_MESSAGE_CONTENT");
  assert.equal(text.delta, "你好");

  const done = toAguiEvent({
    seq: 9,
    type: "done",
    payload: { ok: true },
    runId: "r1",
  });
  assert.equal(done.result, "success");
});

test("parseSseData 读 AG-UI 帧，也能读旧 event 名", () => {
  const modern = parseSseData("RUN_STARTED", {
    seq: 1,
    type: "RUN_STARTED",
    runId: "r1",
    threadId: "p1",
  });
  assert.equal(modern?.type, "RUN_STARTED");

  const legacy = parseSseData("tool", { seq: 4, name: "Read" }, "r1");
  assert.equal(legacy?.type, "TOOL_CALL_START");
  assert.equal(legacy?.toolCallName, "Read");

  assert.equal(parseSseData("text", { hello: 1 }), null);
});

test("reduceAguiEvents 折成用户气泡 + 助手块", () => {
  const turns = reduceAguiEvents([
    { seq: 1, type: "RUN_STARTED", runId: "r1", threadId: "p1" },
    { seq: 2, type: "TEXT_MESSAGE_START", runId: "r1", messageId: "user-r1", role: "user" },
    {
      seq: 3,
      type: "TEXT_MESSAGE_CONTENT",
      runId: "r1",
      messageId: "user-r1",
      role: "user",
      delta: "写清登录",
    },
    { seq: 4, type: "TEXT_MESSAGE_END", runId: "r1", messageId: "user-r1", role: "user" },
    {
      seq: 5,
      type: "CUSTOM",
      runId: "r1",
      name: "trust",
      value: { text: "只写文档仓。" },
    },
    { seq: 6, type: "TEXT_MESSAGE_START", runId: "r1", messageId: "assistant-r1", role: "assistant" },
    {
      seq: 7,
      type: "TEXT_MESSAGE_CONTENT",
      runId: "r1",
      messageId: "assistant-r1",
      role: "assistant",
      delta: "先读 ",
    },
    {
      seq: 8,
      type: "TEXT_MESSAGE_CONTENT",
      runId: "r1",
      messageId: "assistant-r1",
      role: "assistant",
      delta: "README。",
    },
    { seq: 9, type: "TOOL_CALL_START", runId: "r1", toolCallId: "t1", toolCallName: "Read" },
    { seq: 10, type: "TOOL_CALL_END", runId: "r1", toolCallId: "t1", toolCallName: "Read" },
    { seq: 11, type: "CUSTOM", runId: "r1", name: "file", value: { path: "01-背景与目标.md" } },
    { seq: 12, type: "RUN_FINISHED", runId: "r1", result: "success" },
  ]);

  assert.equal(turns.length, 1);
  assert.equal(turns[0].you, "写清登录");
  const kinds = turns[0].blocks.map((b) => b.kind);
  assert.deepEqual(kinds, ["trust", "text", "tool", "file", "status"]);
  const text = turns[0].blocks.find((b) => b.kind === "text");
  assert.equal(text && text.kind === "text" ? text.text : "", "先读 README。");
});

test("mergeAguiEvents 按 runId+seq 去重", () => {
  const a = [{ seq: 1, type: "RUN_STARTED" as const, runId: "r1" }];
  const b = [
    { seq: 1, type: "RUN_STARTED" as const, runId: "r1" },
    { seq: 2, type: "RUN_FINISHED" as const, runId: "r1", result: "success" as const },
  ];
  const merged = mergeAguiEvents(a, b);
  assert.equal(merged.length, 2);
  assert.equal(maxSeq(merged), 2);
});

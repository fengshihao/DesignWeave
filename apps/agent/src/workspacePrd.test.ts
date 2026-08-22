import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { folderNameFor, uniqueFolderName } from "./folderName.js";
import {
  parseMetaMarkdown,
  serializeMetaMarkdown,
  writeMetaFile,
  readMetaFile,
} from "./projectMeta.js";
import { copyPrdPack, PRD_PACK_FILES } from "./prdPack.js";
import {
  assignChunkFile,
  normalizeImportedPrd,
  splitMarkdownChunks,
} from "./importNormalize.js";
import { allowedModes, gateWorkbenchMode } from "./clarifyGate.js";
import { mergeApprovalSelection } from "./workspaceSettings.js";
import { selectCodeDirsForRun } from "./codeDirCards.js";
import { listDiskProjects } from "./requirements.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
process.env.PRD_PACK_TEMPLATE_DIR = path.join(repoRoot, "packages/templates/prd-pack");

test("文件夹名去掉非法字符，重名加 -2", () => {
  assert.equal(folderNameFor('设置页/夜间:模式*?'), "设置页夜间模式");
  assert.equal(uniqueFolderName(["设置页夜间模式"], "设置页夜间模式"), "设置页夜间模式-2");
  assert.equal(
    uniqueFolderName(["设置页夜间模式", "设置页夜间模式-2"], "设置页夜间模式"),
    "设置页夜间模式-3"
  );
});

test("meta.md 读写稳定 id，不含代码仓勾选", () => {
  const text = serializeMetaMarkdown({
    id: "abc12345",
    title: "设置页夜间模式",
    owner: "阿朱",
    source: "template",
    phase: "filling",
    clarity: "pending",
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  });
  assert.match(text, /^id: abc12345$/m);
  assert.doesNotMatch(text, /primaryRepo|relatedRepos/);
  const parsed = parseMetaMarkdown(text);
  assert.equal(parsed.id, "abc12345");
  assert.equal(parsed.title, "设置页夜间模式");
  assert.equal(parsed.source, "template");
});

test("旧 meta 的 guide/gaps 能读成填写中 / 已导入", () => {
  const parsed = parseMetaMarkdown(`---
id: oldone
title: "旧工程"
phase: gaps
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
---
`);
  assert.equal(parsed.phase, "imported");
  assert.equal(parsed.clarity, "pending");
});

test("标准文档包从模板落地，不含 arch/qa，默认 README", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-pack-"));
  try {
    copyPrdPack(dir, {
      id: "id001",
      title: "负一屏天气卡片",
      owner: "产品经理",
      source: "template",
      phase: "filling",
      clarity: "pending",
      createdAt: "2026-08-22T00:00:00.000Z",
      updatedAt: "2026-08-22T00:00:00.000Z",
    });
    for (const file of PRD_PACK_FILES) {
      assert.ok(fs.existsSync(path.join(dir, file)), file);
    }
    const readme = fs.readFileSync(path.join(dir, "README.md"), "utf8");
    assert.match(readme, /^# 负一屏天气卡片/m);
    assert.match(fs.readFileSync(path.join(dir, "02-用户故事.md"), "utf8"), /作为：/);
    assert.equal(fs.existsSync(path.join(dir, "arch")), false);
    assert.equal(fs.existsSync(path.join(dir, "qa")), false);
    assert.equal(fs.existsSync(path.join(dir, "调研.md")), false);
    assert.match(fs.readFileSync(path.join(dir, "meta.md"), "utf8"), /source: template/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("导入按文档包拆写，对不上的进 gaps，原文进 import/original.md", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-import-"));
  try {
    const original = `# 夜间模式

## 背景与问题

设置页太亮。

## 用户故事

作为用户我想要一键关灯。

## 完全对不上的附录

供应商内部备忘。
`;
    const result = normalizeImportedPrd({
      dest: dir,
      title: "设置页夜间模式",
      owner: "阿朱",
      id: "imp001",
      original,
      createdAt: "2026-08-22T00:00:00.000Z",
    });
    assert.equal(fs.readFileSync(path.join(dir, "import/original.md"), "utf8").includes("供应商内部备忘"), true);
    assert.match(fs.readFileSync(path.join(dir, "01-背景与目标.md"), "utf8"), /设置页太亮/);
    assert.match(fs.readFileSync(path.join(dir, "02-用户故事.md"), "utf8"), /一键关灯/);
    assert.match(fs.readFileSync(path.join(dir, "gaps.md"), "utf8"), /完全对不上的附录/);
    assert.equal(result.unmatched.some((c) => c.title.includes("完全对不上")), true);
    assert.match(fs.readFileSync(path.join(dir, "meta.md"), "utf8"), /source: import/);
    assert.match(fs.readFileSync(path.join(dir, "03-交互与体验.md"), "utf8"), /（待补充/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("标题分块能对上文档包文件", () => {
  assert.equal(assignChunkFile("背景与问题"), "01-背景与目标.md");
  assert.equal(assignChunkFile("US-001 夜间"), "02-用户故事.md");
  assert.equal(assignChunkFile("入口与信息架构"), "03-交互与体验.md");
  assert.equal(assignChunkFile("权限与合规"), "04-规格与约束.md");
  assert.equal(assignChunkFile("发布门槛"), "05-验收.md");
  assert.equal(assignChunkFile("供应商内部备忘"), null);
  assert.equal(splitMarkdownChunks("## 背景\n\nhello").length, 1);
});

test("清晰度门闩：未就绪只能检查清晰度；可行性还要已批准代码目录", () => {
  assert.deepEqual(
    allowedModes({ phase: "filling", clarity: "pending", hasApprovedCodeDirs: true }),
    ["clarify"]
  );
  assert.equal(
    gateWorkbenchMode({
      mode: "feasibility",
      phase: "filling",
      clarity: "pending",
      hasApprovedCodeDirs: true,
    }),
    "先检查清晰度，才能用共创 / 拷问 / 可行性。"
  );
  assert.equal(
    gateWorkbenchMode({
      mode: "feasibility",
      phase: "ready",
      clarity: "ready",
      hasApprovedCodeDirs: false,
    }),
    "架构师还没批准代码目录"
  );
  assert.equal(
    gateWorkbenchMode({
      mode: "coauthor",
      phase: "ready",
      clarity: "ready",
      hasApprovedCodeDirs: false,
    }),
    null
  );
  assert.deepEqual(
    allowedModes({ phase: "ready", clarity: "ready", hasApprovedCodeDirs: true }),
    ["coauthor", "grill", "feasibility"]
  );
});

test("批准名单只能来自扫到的路径，不能手补", () => {
  const merged = mergeApprovalSelection(["/a/one", "/a/two"], ["/a/one", "/hand/added"]);
  assert.deepEqual(merged.approved, ["/a/one"]);
  assert.deepEqual(merged.rejected, ["/hand/added"]);
});

test("可行性只把名称对得上的已批准目录带进本轮", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dw-dirs-"));
  const settings = path.join(root, "Settings");
  const weather = path.join(root, "Weather");
  fs.mkdirSync(settings);
  fs.mkdirSync(weather);
  try {
    const selected = selectCodeDirsForRun({
      mode: "feasibility",
      title: "设置页夜间模式",
      message: "对照 Settings 仓",
      readme: "",
      approved: [settings, weather],
    });
    assert.deepEqual(selected, [settings]);
    assert.deepEqual(
      selectCodeDirsForRun({
        mode: "clarify",
        title: "设置页夜间模式",
        message: "Settings",
        readme: "",
        approved: [settings],
      }),
      []
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("扫盘只认带 meta.md 的子目录", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dw-scan-"));
  try {
    fs.mkdirSync(path.join(root, "空文件夹"));
    const project = path.join(root, "设置页夜间模式");
    fs.mkdirSync(project);
    writeMetaFile(project, {
      id: "scan01",
      title: "设置页夜间模式",
      owner: "阿朱",
      source: "template",
      phase: "filling",
      clarity: "pending",
      createdAt: "2026-08-22T00:00:00.000Z",
      updatedAt: "2026-08-22T00:00:00.000Z",
    });
    const list = listDiskProjects(root);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "scan01");
    assert.equal(list[0].folderName, "设置页夜间模式");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

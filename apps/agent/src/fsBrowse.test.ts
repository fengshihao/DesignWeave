import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { browseDir, mkdirUnder } from "./fsBrowse.js";

test("browseDir 带上家目录，文件可见", () => {
  const listing = browseDir(os.homedir());
  assert.ok(listing.home);
  assert.ok(listing.path);
  assert.ok(Array.isArray(listing.entries));
  assert.ok(listing.crumbs.length >= 1);
  assert.equal(listing.crumbs[0]?.label, "家目录");
});

test("mkdirUnder 只建一层合法名字", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "dw-mkdir-"));
  try {
    const created = mkdirUnder(parent, "设置页夜间模式");
    assert.ok(fs.statSync(created.path).isDirectory());
    const listing = browseDir(parent);
    assert.ok(listing.entries.some((e) => e.name === "设置页夜间模式" && e.isDir));
    assert.throws(() => mkdirUnder(parent, "设置页夜间模式"), /已经有这个名字/);
    assert.throws(() => mkdirUnder(parent, "../escape"), /不合适/);
    assert.throws(() => mkdirUnder(parent, ".hidden"), /不合适/);
    assert.throws(() => mkdirUnder(parent, "CON"), /不合适/);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

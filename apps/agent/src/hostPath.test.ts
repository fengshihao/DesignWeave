import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalPath,
  fromMsysPath,
  isFsRoot,
  isLikelyAbsolutePath,
  isPathInside,
  isStrictlyInside,
  pathCrumbs,
  toHostPath,
} from "./hostPath.js";

test("Windows 盘符、UNC、Git Bash 路径都算绝对路径", () => {
  assert.equal(isLikelyAbsolutePath("C:\\Users\\foo", "win32"), true);
  assert.equal(isLikelyAbsolutePath("c:/Users/foo", "win32"), true);
  assert.equal(isLikelyAbsolutePath("\\\\server\\share\\repo", "win32"), true);
  assert.equal(isLikelyAbsolutePath("/c/Users/foo", "win32"), true);
  assert.equal(isLikelyAbsolutePath("/cygdrive/d/code", "win32"), true);
  assert.equal(isLikelyAbsolutePath("Users\\foo", "win32"), false);
  assert.equal(isLikelyAbsolutePath("/home/foo", "linux"), true);
  assert.equal(isLikelyAbsolutePath("C:\\Users\\foo", "linux"), false);
});

test("Git Bash /c/foo 转成盘符路径，不误伤 /home", () => {
  assert.equal(fromMsysPath("/c/Users/foo"), "C:\\Users\\foo");
  assert.equal(fromMsysPath("/d"), "D:\\");
  assert.equal(fromMsysPath("/cygdrive/e/work"), "E:\\work");
  assert.equal(fromMsysPath("/home/foo"), null);
  assert.equal(fromMsysPath("/usr/bin"), null);
});

test("Windows 路径规范化：盘符大写、去掉尾部分隔符", () => {
  assert.equal(canonicalPath("c:/Users/foo/", "win32"), "C:\\Users\\foo");
  assert.equal(canonicalPath("/c/Users/foo", "win32"), "C:\\Users\\foo");
  assert.equal(canonicalPath("C:\\", "win32"), "C:\\");
  assert.equal(canonicalPath("/home/foo/", "linux"), "/home/foo");
  assert.equal(canonicalPath("/", "linux"), "/");
});

test("toHostPath 收下 Windows 绝对路径，丢掉相对路径", () => {
  assert.equal(toHostPath("C:\\src\\app", "win32"), "C:\\src\\app");
  assert.equal(toHostPath("/c/src/app", "win32"), "C:\\src\\app");
  assert.equal(toHostPath("src/app", "win32"), null);
  assert.equal(toHostPath("/home/app", "linux"), "/home/app");
  assert.equal(toHostPath("C:\\src\\app", "linux"), null);
});

test("isPathInside 用 relative，跨盘和旁路前缀都拒绝", () => {
  assert.equal(isPathInside("C:\\work\\a\\b", "C:\\work\\a", "win32"), true);
  assert.equal(isPathInside("C:\\work\\a", "C:\\work\\a", "win32"), true);
  assert.equal(isPathInside("c:\\work\\a\\b", "C:\\work\\a", "win32"), true);
  assert.equal(isPathInside("C:\\work\\ab", "C:\\work\\a", "win32"), false);
  assert.equal(isPathInside("D:\\work\\a", "C:\\work\\a", "win32"), false);
  assert.equal(isStrictlyInside("C:\\work\\a", "C:\\work\\a", "win32"), false);
  assert.equal(isPathInside("/home/a/b", "/home/a", "linux"), true);
  assert.equal(isPathInside("/home/ab", "/home/a", "linux"), false);
});

test("运行根不能是盘符根或 Unix 根", () => {
  assert.equal(isFsRoot("C:\\", "win32"), true);
  assert.equal(isFsRoot("C:\\work", "win32"), false);
  assert.equal(isFsRoot("/", "linux"), true);
  assert.equal(isFsRoot("/home", "linux"), false);
});

test("面包屑：家目录下用「家目录」，否则从盘符/根起", () => {
  const homeWin = pathCrumbs("C:\\Users\\ada\\work\\app", "C:\\Users\\ada", "win32");
  assert.deepEqual(homeWin, [
    { label: "家目录", path: "C:\\Users\\ada" },
    { label: "work", path: "C:\\Users\\ada\\work" },
    { label: "app", path: "C:\\Users\\ada\\work\\app" },
  ]);

  const drive = pathCrumbs("C:\\src\\app", "C:\\Users\\ada", "win32");
  assert.equal(drive[0]?.label, "C:");
  assert.equal(drive[0]?.path, "C:\\");
  assert.equal(drive.at(-1)?.path, "C:\\src\\app");

  const posix = pathCrumbs("/home/ada/work", "/home/ada", "linux");
  assert.deepEqual(posix[0], { label: "家目录", path: "/home/ada" });
  assert.equal(posix.at(-1)?.path, "/home/ada/work");
});

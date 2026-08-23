import assert from "node:assert/strict";
import { test } from "node:test";
import { collectClaudeProjectPaths } from "./claudeProjects.js";

test("扫 Claude 配置时收下 Windows 盘符路径，丢掉相对路径", () => {
  const paths = collectClaudeProjectPaths(
    {
      projects: {
        "C:\\Users\\ada\\src\\app": {},
        "c:/work/other": {},
        "/c/code/msys": {},
        relative: {},
        "/home/unix-only": {},
      },
      githubRepoPaths: {
        origin: ["D:\\repos\\one", "not-abs"],
      },
    },
    "win32"
  );
  assert.ok(paths.includes("C:\\Users\\ada\\src\\app"));
  assert.ok(paths.includes("C:\\work\\other"));
  assert.ok(paths.includes("C:\\code\\msys"));
  assert.ok(paths.includes("D:\\repos\\one"));
  assert.equal(paths.includes("relative"), false);
  assert.equal(
    paths.some((p) => p.includes("unix-only") || p === "/home/unix-only"),
    false
  );
});

test("Linux 只收 POSIX 绝对路径", () => {
  const paths = collectClaudeProjectPaths(
    {
      projects: {
        "/home/ada/app": {},
        "C:\\Users\\ada\\app": {},
      },
    },
    "linux"
  );
  assert.deepEqual(paths, ["/home/ada/app"]);
});

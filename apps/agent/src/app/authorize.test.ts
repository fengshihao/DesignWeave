import assert from "node:assert/strict";
import { test } from "node:test";
import type { Actor } from "@designweave/schema";
import { authorize } from "./authorize.js";
import { AppError } from "./errors.js";

const architect: Actor = {
  id: "a1",
  name: "架构",
  email: "a@x.com",
  role: "architect",
};
const designer: Actor = {
  id: "d1",
  name: "产品",
  email: "d@x.com",
  role: "designer",
};
const tester: Actor = {
  id: "t1",
  name: "测试",
  email: "t@x.com",
  role: "tester",
};

function throwsForbidden(fn: () => void) {
  assert.throws(fn, (err: unknown) => err instanceof AppError && err.code === "forbidden");
}

test("三角色写文件夹：产品 product、架构 eng、测试 qa", () => {
  assert.doesNotThrow(() => authorize(designer, "doc.write", { folder: "product" }));
  throwsForbidden(() => authorize(designer, "doc.write", { folder: "eng" }));
  assert.doesNotThrow(() => authorize(architect, "doc.write", { folder: "eng" }));
  throwsForbidden(() => authorize(architect, "doc.write", { folder: "product" }));
  assert.doesNotThrow(() => authorize(tester, "doc.write", { folder: "qa" }));
  throwsForbidden(() => authorize(tester, "doc.write", { folder: "product" }));
});

test("测试不能建工程；架构师和产品经理可以", () => {
  assert.doesNotThrow(() => authorize(architect, "project.create"));
  assert.doesNotThrow(() => authorize(designer, "project.create"));
  throwsForbidden(() => authorize(tester, "project.create"));
});

test("改标题：架构师都行；产品经理仅 owner", () => {
  assert.doesNotThrow(() =>
    authorize(architect, "project.rename", { ownerId: "other" })
  );
  assert.doesNotThrow(() =>
    authorize(designer, "project.rename", { ownerId: designer.id })
  );
  throwsForbidden(() =>
    authorize(designer, "project.rename", { ownerId: "other" })
  );
  throwsForbidden(() => authorize(tester, "project.rename", { ownerId: tester.id }));
});

test("用户管理与审计只有架构师", () => {
  assert.doesNotThrow(() => authorize(architect, "user.create"));
  assert.doesNotThrow(() => authorize(architect, "audit.read"));
  throwsForbidden(() => authorize(designer, "user.list"));
  throwsForbidden(() => authorize(tester, "audit.read"));
});

test("chat / run 只能看自己的", () => {
  assert.doesNotThrow(() =>
    authorize(designer, "chat.read", { chatUserId: designer.id })
  );
  throwsForbidden(() =>
    authorize(designer, "chat.read", { chatUserId: architect.id })
  );
  throwsForbidden(() =>
    authorize(architect, "run.read", { runUserId: designer.id })
  );
});

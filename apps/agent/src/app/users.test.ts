import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, before, after } from "node:test";
import type { Actor } from "@designweave/schema";
import { closeDb } from "../db.js";
import { ensureUserColumns, getUserRow, listUserRows } from "../data/users.js";
import { ensureAuditTable, listAudit } from "../data/audit.js";
import {
  createMember,
  listUsers,
  setUserDisabled,
  updateUser,
} from "./users.js";
import { AppError } from "./errors.js";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-users-"));

before(() => {
  process.env.DATA_DIR = dataDir;
  closeDb();
  ensureUserColumns();
  ensureAuditTable();
});

after(() => {
  closeDb();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const architect: Actor = {
  id: "arch1",
  name: "架构师",
  email: "arch@example.com",
  role: "architect",
};

test("创建成员只能是产品经理或测试，不能再建架构师", async () => {
  // seed architect row without going through insertUser role check
  const { insertUser } = await import("../data/users.js");
  const arch = await insertUser({
    name: "架构师",
    email: "arch@example.com",
    password: "password1",
    role: "architect",
    createdBy: null,
  });
  architect.id = arch.id;

  await assert.rejects(
    () =>
      createMember(architect, {
        name: "二号",
        email: "arch2@example.com",
        password: "password1",
        role: "architect",
      }),
    (err: unknown) => err instanceof AppError && err.code === "invalid"
  );

  const pm = await createMember(architect, {
    name: "阿朱",
    email: "pm@example.com",
    password: "password1",
    role: "designer",
  });
  assert.equal(pm.role, "designer");
  assert.equal(pm.status, "active");
  assert.equal(pm.createdBy, architect.id);

  const qa = await createMember(architect, {
    name: "小测",
    email: "qa@example.com",
    password: "password1",
    role: "tester",
  });
  assert.equal(qa.role, "tester");

  const users = listUsers(architect);
  assert.ok(users.length >= 3);
});

test("可把产品经理改成测试，不能升架构师；不能停用架构师", async () => {
  const users = listUserRows();
  const pm = users.find((u) => u.role === "designer");
  assert.ok(pm);
  const updated = updateUser(architect, pm!.id, { role: "tester" });
  assert.equal(updated.role, "tester");

  assert.throws(
    () => updateUser(architect, pm!.id, { role: "architect" }),
    (err: unknown) => err instanceof AppError && err.code === "invalid"
  );

  assert.throws(
    () => setUserDisabled(architect, architect.id, true),
    (err: unknown) => err instanceof AppError && err.code === "invalid"
  );

  const disabled = setUserDisabled(architect, pm!.id, true);
  assert.equal(disabled.status, "disabled");
  assert.equal(getUserRow(pm!.id)?.status, "disabled");

  const events = listAudit(20);
  assert.ok(events.some((e) => e.action === "user.disable"));
});

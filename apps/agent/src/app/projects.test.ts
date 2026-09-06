import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Actor } from "@designweave/schema";
import { closeDb } from "../db.js";
import { setWorkspaceRoot } from "../workspaceSettings.js";
import { createProject, renameProject, transferProject } from "./projects.js";
import { getRequirement } from "../requirements.js";
import { AppError } from "./errors.js";
import { insertUser } from "../data/users.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
process.env.PRD_PACK_TEMPLATE_DIR = path.join(repoRoot, "packages/templates/prd-pack");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-proj-"));
const workspace = path.join(dataDir, "workspace");

let architect: Actor;
let designer: Actor;

before(async () => {
  process.env.DATA_DIR = dataDir;
  closeDb();
  fs.mkdirSync(workspace, { recursive: true });
  setWorkspaceRoot(workspace);
  const arch = await insertUser({
    name: "架构",
    email: "a@ex.com",
    password: "password1",
    role: "architect",
    createdBy: null,
  });
  const pm = await insertUser({
    name: "产品",
    email: "p@ex.com",
    password: "password1",
    role: "designer",
    createdBy: arch.id,
  });
  architect = { id: arch.id, name: arch.name, email: arch.email, role: "architect" };
  designer = { id: pm.id, name: pm.name, email: pm.email, role: "designer" };
});

after(() => {
  closeDb();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("建工程写入 ownerId；改名同步文件夹；可转交", () => {
  const project = createProject(architect, { title: "夜间模式" });
  assert.equal(project.ownerId, architect.id);
  assert.ok(fs.existsSync(path.join(project.vaultPath, "meta.md")));
  assert.match(fs.readFileSync(path.join(project.vaultPath, "meta.md"), "utf8"), /ownerId/);

  const renamed = renameProject(architect, project.id, "设置页夜间模式");
  assert.equal(renamed.title, "设置页夜间模式");
  assert.equal(renamed.folderName, "设置页夜间模式");
  assert.ok(fs.existsSync(renamed.vaultPath));
  assert.equal(getRequirement(project.id)?.vaultPath, renamed.vaultPath);

  const transferred = transferProject(architect, project.id, designer.id);
  assert.equal(transferred.ownerId, designer.id);
  assert.equal(transferred.ownerName, designer.name);

  const byOwner = renameProject(designer, project.id, "产品改名");
  assert.equal(byOwner.title, "产品改名");
});

test("测试不能建工程", async () => {
  const qa = await insertUser({
    name: "测",
    email: "t@ex.com",
    password: "password1",
    role: "tester",
    createdBy: architect.id,
  });
  assert.throws(
    () =>
      createProject(
        { id: qa.id, name: qa.name, email: qa.email, role: "tester" },
        { title: "不行" }
      ),
    (err: unknown) => err instanceof AppError && err.code === "forbidden"
  );
});

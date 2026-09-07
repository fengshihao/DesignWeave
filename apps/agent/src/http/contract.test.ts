import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { Express } from "express";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-http-"));
const workspace = path.join(dataDir, "workspace");

let baseUrl = "";
let server: http.Server;
let cookie = "";
let closeDb: () => void;

function jarFrom(res: Response): void {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const parts: string[] = [];
  for (const line of raw) {
    const pair = line.split(";")[0]?.trim();
    if (pair) parts.push(pair);
  }
  if (parts.length) cookie = parts.join("; ");
}

async function api(
  method: string,
  urlPath: string,
  body?: unknown
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:3100",
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jarFrom(res);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

before(async () => {
  process.env.DATA_DIR = dataDir;
  process.env.BETTER_AUTH_SECRET =
    process.env.BETTER_AUTH_SECRET || "designweave-http-contract-test-secret-32";
  process.env.WEB_ORIGIN = "http://127.0.0.1:3100";
  process.env.PRD_PACK_TEMPLATE_DIR = path.join(repoRoot, "packages/templates/prd-pack");

  const dbMod = await import("../db.js");
  closeDb = dbMod.closeDb;
  closeDb();

  const { setWorkspaceRoot } = await import("../workspaceSettings.js");
  fs.mkdirSync(workspace, { recursive: true });
  setWorkspaceRoot(workspace);

  const { createAgentApp } = await import("../index.js");
  const app: Express = createAgentApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  closeDb();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("HTTP：setup → 建成员关卡 → 建工程 → 双挂别名 → audit", async () => {
  const status = await api("GET", "/v1/auth/status");
  assert.equal(status.status, 200);
  assert.equal(status.json.needsSetup, true);

  const setup = await api("POST", "/v1/setup", {
    name: "架构师",
    email: "arch@example.com",
    password: "password1",
  });
  assert.equal(setup.status, 200, JSON.stringify(setup.json));
  assert.ok(cookie, "setup 应下发 session cookie");

  const me = await api("GET", "/v1/me");
  assert.equal(me.status, 200);
  assert.equal(me.json.user.role, "architect");

  const badRole = await api("POST", "/v1/users", {
    name: "二号架构",
    email: "arch2@example.com",
    password: "password1",
    role: "architect",
  });
  assert.equal(badRole.status, 400);
  assert.equal(badRole.json.code, "invalid");

  const pm = await api("POST", "/v1/users", {
    name: "阿朱",
    email: "pm@example.com",
    password: "password1",
    role: "designer",
  });
  assert.equal(pm.status, 201, JSON.stringify(pm.json));
  assert.equal(pm.json.user.role, "designer");

  const qa = await api("POST", "/v1/users", {
    name: "小测",
    email: "qa@example.com",
    password: "password1",
    role: "tester",
  });
  assert.equal(qa.status, 201);

  const created = await api("POST", "/v1/projects", { title: "夜间模式" });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const projectId = created.json.project?.id || created.json.requirement?.id;
  assert.ok(projectId);

  const viaAlias = await api("GET", `/v1/requirements/${projectId}`);
  assert.equal(viaAlias.status, 200, JSON.stringify(viaAlias.json));

  const viaCanon = await api("GET", `/v1/projects/${projectId}/tree`);
  assert.equal(viaCanon.status, 200);
  assert.ok(Array.isArray(viaCanon.json.files));

  cookie = "";
  const loginQa = await api("POST", "/v1/login", {
    email: "qa@example.com",
    password: "password1",
  });
  assert.equal(loginQa.status, 200, JSON.stringify(loginQa.json));
  const denied = await api("POST", "/v1/projects", { title: "测试不该建" });
  assert.equal(denied.status, 403);
  assert.equal(denied.json.code, "forbidden");

  cookie = "";
  const loginArch = await api("POST", "/v1/login", {
    email: "arch@example.com",
    password: "password1",
  });
  assert.equal(loginArch.status, 200);
  const audit = await api("GET", "/v1/audit?limit=20");
  assert.equal(audit.status, 200);
  assert.ok(Array.isArray(audit.json.events));
  assert.ok(audit.json.events.some((e: { action: string }) => e.action === "auth.setup"));
});

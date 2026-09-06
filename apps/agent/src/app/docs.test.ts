import assert from "node:assert/strict";
import { test } from "node:test";
import type { Actor } from "@designweave/schema";
import { AppError } from "./errors.js";
import { writeProjectDoc } from "./docs.js";

const designer: Actor = {
  id: "d1",
  name: "产品",
  email: "d@x.com",
  role: "designer",
};

test("产品经理不能写 eng 文档（业务层直接拒）", () => {
  assert.throws(
    () =>
      writeProjectDoc(designer, "missing", "eng/方案.md", "x", { clientId: "c1" }),
    (err: unknown) =>
      err instanceof AppError && (err.code === "forbidden" || err.code === "not_found")
  );
});

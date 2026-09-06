import { z } from "zod";
import type { AppRole } from "./user.js";
import type { DocFolder } from "./workbench.js";

export const ActionSchema = z.enum([
  "workspace.read",
  "workspace.write",
  "user.list",
  "user.create",
  "user.update",
  "user.disable",
  "user.resetPassword",
  "user.self.update",
  "user.self.password",
  "project.create",
  "project.delete",
  "project.abandon",
  "project.transfer",
  "project.rename",
  "project.read",
  "doc.read",
  "doc.write",
  "doc.question.append",
  "version.record",
  "version.restore",
  "version.revertAi",
  "lock.claim",
  "lock.heartbeat",
  "lock.release",
  "lock.forceRelease",
  "run.start",
  "run.cancel",
  "run.read",
  "chat.read",
  "chat.write",
  "audit.read",
]);
export type Action = z.infer<typeof ActionSchema>;

export type AuthzResource = {
  folder?: DocFolder;
  userId?: string;
  ownerId?: string | null;
  runUserId?: string;
  chatUserId?: string;
};

export const WRITABLE_FOLDER: Record<AppRole, DocFolder> = {
  architect: "eng",
  designer: "product",
  tester: "qa",
};

export function writableFolderOf(role: AppRole): DocFolder {
  return WRITABLE_FOLDER[role];
}

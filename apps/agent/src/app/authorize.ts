import {
  writableFolderOf,
  type Action,
  type Actor,
  type AuthzResource,
} from "@designweave/schema";
import { AppError } from "./errors.js";

function deny(message: string): never {
  throw new AppError("forbidden", message);
}

export function authorize(actor: Actor, action: Action, resource: AuthzResource = {}): void {
  const architect = actor.role === "architect";

  switch (action) {
    case "workspace.read":
    case "project.read":
    case "doc.read":
    case "doc.question.append":
      return;
    case "workspace.write":
    case "user.list":
    case "user.create":
    case "user.update":
    case "user.disable":
    case "user.resetPassword":
    case "project.delete":
    case "project.abandon":
    case "project.transfer":
    case "lock.forceRelease":
    case "audit.read":
      if (!architect) deny("需要架构师权限。");
      return;
    case "user.self.update":
    case "user.self.password":
      if (resource.userId && resource.userId !== actor.id) deny("只能改自己的账号。");
      return;
    case "project.create":
      if (actor.role === "tester") deny("测试不能新建工程。");
      return;
    case "project.rename":
      if (architect) return;
      if (actor.role === "designer" && resource.ownerId && resource.ownerId === actor.id) return;
      deny("你不能改这个工程的名称。");
      return;
    case "doc.write":
    case "version.record":
    case "version.restore":
    case "version.revertAi":
    case "lock.claim":
    case "lock.heartbeat":
    case "lock.release":
    case "run.start": {
      const folder = resource.folder;
      if (!folder) deny("缺少文件夹。");
      if (writableFolderOf(actor.role) !== folder) deny("你不能改这个文件夹。");
      return;
    }
    case "run.cancel":
    case "run.read":
      if (resource.runUserId && resource.runUserId !== actor.id) deny("只能看自己的托付。");
      return;
    case "chat.read":
    case "chat.write":
      if (resource.chatUserId && resource.chatUserId !== actor.id) deny("只能看自己的对话。");
      return;
    default:
      deny("没有这个权限。");
  }
}

import { z } from "zod";

export const ROLES = {
  architect: "architect",
  designer: "designer",
  tester: "tester",
} as const;

export const AppRoleSchema = z.enum(["architect", "designer", "tester"]);
export type AppRole = z.infer<typeof AppRoleSchema>;

export const ROLE_LABELS: Record<AppRole, string> = {
  architect: "架构师",
  designer: "产品经理",
  tester: "测试",
};

export const UserStatusSchema = z.enum(["active", "disabled"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const ActorSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: AppRoleSchema,
});
export type Actor = z.infer<typeof ActorSchema>;

export const AppUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: AppRoleSchema,
  roleLabel: z.string(),
  status: UserStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().nullable(),
});
export type AppUser = z.infer<typeof AppUserSchema>;

export function isAppRole(role: string | null | undefined): role is AppRole {
  return role === "architect" || role === "designer" || role === "tester";
}

export function asAppRole(role: string | null | undefined): AppRole {
  if (role === "architect") return "architect";
  if (role === "tester") return "tester";
  return "designer";
}

export function isArchitect(role: string | null | undefined): boolean {
  return role === "architect";
}

export function memberRole(role: string | null | undefined): "designer" | "tester" {
  return role === "tester" ? "tester" : "designer";
}

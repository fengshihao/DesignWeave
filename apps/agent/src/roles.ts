import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

export const ROLES = {
  architect: "architect",
  designer: "designer",
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<AppRole, string> = {
  architect: "架构师",
  designer: "产品经理",
};

export const statement = {
  ...defaultStatements,
} as const;

export const ac = createAccessControl(statement);

export const architectRole = ac.newRole({
  ...adminAc.statements,
});

export const designerRole = ac.newRole({});

export function isArchitect(role: string | null | undefined): boolean {
  return role === ROLES.architect;
}

export function isAppRole(role: string | null | undefined): role is AppRole {
  return role === ROLES.architect || role === ROLES.designer;
}

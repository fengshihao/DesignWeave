import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import {
  ROLES,
  ROLE_LABELS,
  asAppRole,
  isAppRole,
  isArchitect,
  type AppRole,
} from "@designweave/schema";

export { ROLES, ROLE_LABELS, asAppRole, isAppRole, isArchitect };
export type { AppRole };

export const statement = {
  ...defaultStatements,
} as const;

export const ac = createAccessControl(statement);

export const architectRole = ac.newRole({
  ...adminAc.statements,
});

export const designerRole = ac.newRole({});
export const testerRole = ac.newRole({});

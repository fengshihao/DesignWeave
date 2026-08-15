import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { admin } from "better-auth/plugins";
import type { IncomingHttpHeaders } from "node:http";
import { config } from "./config.js";
import { getDb } from "./db.js";
import {
  ac,
  architectRole,
  designerRole,
  ROLES,
} from "./roles.js";

export function countUsers(): number {
  const row = getDb().prepare(`SELECT COUNT(*) as c FROM "user"`).get() as {
    c: number;
  };
  return Number(row?.c ?? 0);
}

const webOrigin = config.webOrigin;
const trustedOrigins = Array.from(
  new Set([
    webOrigin,
    "http://localhost:3100",
    "http://127.0.0.1:3100",
  ])
);

const auth = betterAuth({
  baseURL: webOrigin,
  secret: config.authSecret,
  trustedOrigins,
  database: getDb(),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  plugins: [
    admin({
      ac,
      roles: {
        architect: architectRole,
        designer: designerRole,
      },
      defaultRole: ROLES.designer,
      adminRoles: [ROLES.architect],
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (countUsers() === 0) {
            return { data: { ...user, role: ROLES.architect } };
          }
          const role =
            "role" in user && user.role === ROLES.architect
              ? ROLES.architect
              : ROLES.designer;
          return { data: { ...user, role } };
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      if (countUsers() > 0) {
        throw new APIError("FORBIDDEN", {
          message: "请让架构师创建账号",
        });
      }
    }),
  },
  advanced: {
    useSecureCookies: webOrigin.startsWith("https://"),
    defaultCookieAttributes: {
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    },
  },
});

export const handleAuthRequest = toNodeHandler(auth);

export function authHeaders(headers: IncomingHttpHeaders) {
  return fromNodeHeaders(headers);
}

export function getAuthSession(headers: IncomingHttpHeaders) {
  return auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });
}

export function signUpFirstUser(input: {
  name: string;
  email: string;
  password: string;
  headers: IncomingHttpHeaders;
}) {
  return auth.api.signUpEmail({
    body: {
      name: input.name,
      email: input.email,
      password: input.password,
    },
    headers: fromNodeHeaders(input.headers),
    asResponse: true,
  });
}

export function createDesignerUser(input: {
  name: string;
  email: string;
  password: string;
  headers: IncomingHttpHeaders;
}) {
  return auth.api.createUser({
    headers: fromNodeHeaders(input.headers),
    body: {
      name: input.name,
      email: input.email,
      password: input.password,
      role: ROLES.designer,
    },
  });
}

export function listAuthUsers(headers: IncomingHttpHeaders) {
  return auth.api.listUsers({
    headers: fromNodeHeaders(headers),
    query: { limit: 100, sortBy: "createdAt", sortDirection: "asc" },
  });
}


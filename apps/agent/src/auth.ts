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
  testerRole,
  ROLES,
  asAppRole,
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
    "http://localhost:8787",
    "http://127.0.0.1:8787",
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
        tester: testerRole,
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
          const incoming =
            "role" in user && typeof user.role === "string" ? user.role : "";
          return { data: { ...user, role: asAppRole(incoming) } };
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

export function ensureAuthOrigin(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  if (headers.origin || headers.Origin) return headers;
  return { ...headers, origin: webOrigin };
}

export function authHeaders(headers: IncomingHttpHeaders) {
  return fromNodeHeaders(ensureAuthOrigin(headers));
}

export function getAuthSession(headers: IncomingHttpHeaders) {
  return auth.api.getSession({
    headers: authHeaders(headers),
  });
}

export async function revokeSessionToken(headers: IncomingHttpHeaders): Promise<void> {
  const session = await getAuthSession(headers).catch(() => null);
  const token = session?.session?.token;
  if (!token) return;
  getDb().prepare(`DELETE FROM "session" WHERE token = ?`).run(token);
}

export function expireAuthCookieHeaders(): string[] {
  const secure = webOrigin.startsWith("https://") ? "; Secure" : "";
  const past = "Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  const names = [
    "better-auth.session_token",
    "better-auth.session_data",
    "better-auth.dont_remember",
    ...Array.from({ length: 6 }, (_, i) => `better-auth.session_data.${i}`),
  ];
  const out: string[] = [];
  for (const name of names) {
    for (const path of ["/", "/api/auth"]) {
      out.push(`${name}=; Path=${path}; Max-Age=0; ${past}; HttpOnly; SameSite=Lax${secure}`);
    }
  }
  return out;
}

export function signInUser(input: {
  email: string;
  password: string;
  headers: IncomingHttpHeaders;
}) {
  return auth.api.signInEmail({
    body: {
      email: input.email.trim().toLowerCase(),
      password: input.password,
    },
    headers: authHeaders(input.headers),
    asResponse: true,
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
    headers: authHeaders(input.headers),
    asResponse: true,
  });
}

export function createAppUser(input: {
  name: string;
  email: string;
  password: string;
  role: "designer" | "tester";
  headers: IncomingHttpHeaders;
}) {
  return auth.api.createUser({
    headers: fromNodeHeaders(input.headers),
    body: {
      name: input.name,
      email: input.email,
      password: input.password,
      role: input.role,
    },
  });
}

/** @deprecated 用 createAppUser */
export function createDesignerUser(input: {
  name: string;
  email: string;
  password: string;
  headers: IncomingHttpHeaders;
}) {
  return createAppUser({ ...input, role: ROLES.designer });
}

export function listAuthUsers(headers: IncomingHttpHeaders) {
  return auth.api.listUsers({
    headers: fromNodeHeaders(headers),
    query: { limit: 100, sortBy: "createdAt", sortDirection: "asc" },
  });
}


import type { NextFunction, Request, Response } from "express";
import { getAuthSession } from "./auth.js";
import { isArchitect, type AppRole } from "./roles.js";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
};

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

function publicPath(req: Request): boolean {
  if (req.path === "/health") return true;
  if (req.path.startsWith("/api/auth")) return true;
  if (req.method === "GET" && req.path === "/v1/auth/status") return true;
  if (req.method === "POST" && req.path === "/v1/setup") return true;
  return false;
}

export async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (publicPath(req)) {
    next();
    return;
  }
  try {
    const session = await getAuthSession(req.headers);
    const role = session?.user?.role;
    if (!session?.user || (role !== "architect" && role !== "designer")) {
      res.status(401).json({ error: "请先登录" });
      return;
    }
    req.user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireArchitect(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: "请先登录" });
    return;
  }
  if (!isArchitect(req.user.role)) {
    res.status(403).json({ error: "需要架构师权限才能改环境和代码仓。" });
    return;
  }
  next();
}

export function publicUser(user: SessionUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: user.role === "architect" ? "架构师" : "产品经理",
  };
}

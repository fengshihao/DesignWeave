import type { Express, Request } from "express";
import type { Actor } from "@designweave/schema";
import { requireArchitect } from "../acl.js";
import { authorize } from "../app/authorize.js";
import {
  changeMyPassword,
  createMember,
  getMe,
  listUsers,
  resetUserPassword,
  setUserDisabled,
  updateMe,
  updateUser,
} from "../app/users.js";
import { listAudit } from "../data/audit.js";
import { failJson } from "./requestLog.js";

function actorOf(req: Request): Actor {
  return {
    id: req.user!.id,
    name: req.user!.name,
    email: req.user!.email,
    role: req.user!.role,
  };
}

export function registerUserRoutes(app: Express): void {
  app.get("/v1/me", (req, res) => {
    try {
      res.json({ user: getMe(actorOf(req)) });
    } catch (err) {
      failJson(res, err);
    }
  });

  app.patch("/v1/me", (req, res) => {
    try {
      const user = updateMe(actorOf(req), String(req.body?.name || ""));
      res.json({ user });
    } catch (err) {
      failJson(res, err);
    }
  });

  app.post("/v1/me/password", async (req, res) => {
    try {
      await changeMyPassword(actorOf(req), {
        current: String(req.body?.current || ""),
        next: String(req.body?.next || ""),
      });
      res.json({ ok: true });
    } catch (err) {
      failJson(res, err);
    }
  });

  app.get("/v1/users", requireArchitect, (req, res) => {
    try {
      res.json({ users: listUsers(actorOf(req)) });
    } catch (err) {
      failJson(res, err);
    }
  });

  app.post("/v1/users", requireArchitect, async (req, res) => {
    try {
      const password = String(req.body?.password || "");
      const user = await createMember(actorOf(req), {
        name: String(req.body?.name || ""),
        email: String(req.body?.email || ""),
        password,
        role: String(req.body?.role || "designer"),
      });
      res.status(201).json({ user, password });
    } catch (err) {
      failJson(res, err);
    }
  });

  app.patch("/v1/users/:id", requireArchitect, (req, res) => {
    try {
      const user = updateUser(actorOf(req), req.params.id, {
        name: typeof req.body?.name === "string" ? req.body.name : undefined,
        role: typeof req.body?.role === "string" ? req.body.role : undefined,
      });
      res.json({ user });
    } catch (err) {
      failJson(res, err);
    }
  });

  app.post("/v1/users/:id/disable", requireArchitect, (req, res) => {
    try {
      const user = setUserDisabled(actorOf(req), req.params.id, true);
      res.json({ user });
    } catch (err) {
      failJson(res, err);
    }
  });

  app.post("/v1/users/:id/enable", requireArchitect, (req, res) => {
    try {
      const user = setUserDisabled(actorOf(req), req.params.id, false);
      res.json({ user });
    } catch (err) {
      failJson(res, err);
    }
  });

  app.post("/v1/users/:id/reset-password", requireArchitect, async (req, res) => {
    try {
      const password = String(req.body?.password || "");
      const user = await resetUserPassword(actorOf(req), req.params.id, password);
      res.json({ user, password });
    } catch (err) {
      failJson(res, err);
    }
  });

  app.get("/v1/audit", requireArchitect, (req, res) => {
    try {
      authorize(actorOf(req), "audit.read");
      const limit = Number(req.query.limit || 50) || 50;
      res.json({ events: listAudit(limit) });
    } catch (err) {
      failJson(res, err);
    }
  });
}

import { customAlphabet } from "nanoid";
import type { NextFunction, Request, Response } from "express";
import { codeOf } from "../app/errors.js";
import { statusOf, errorBody } from "../httpError.js";
import { logLine } from "../log/logger.js";

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const requestId = nanoid();
  req.requestId = requestId;
  const started = Date.now();
  res.on("finish", () => {
    logLine("http.request", {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - started,
      userId: req.user?.id,
      role: req.user?.role,
    });
  });
  next();
}

export function failJson(res: Response, err: unknown): void {
  res.status(statusOf(err)).json(errorBody(err));
}

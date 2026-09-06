import { AppError, codeOf } from "./app/errors.js";

export { AppError };

export class HttpError extends AppError {
  constructor(message: string, status = 400) {
    const code =
      status === 401
        ? "unauthenticated"
        : status === 403
          ? "forbidden"
          : status === 404
            ? "not_found"
            : status === 409
              ? "conflict"
              : "invalid";
    super(code, message, status);
    this.name = "HttpError";
  }
}

export function statusOf(err: unknown, fallback = 400): number {
  if (err instanceof AppError) return err.status;
  const status = (err as { status?: number })?.status;
  return typeof status === "number" ? status : fallback;
}

export function errorBody(err: unknown): { error: string; code?: string } {
  const code = codeOf(err);
  return {
    error: err instanceof Error ? err.message : "请求失败",
    ...(code ? { code } : {}),
  };
}

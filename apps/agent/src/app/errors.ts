import { ERROR_STATUS, type ErrorCode } from "@designweave/schema";

export class AppError extends Error {
  code: ErrorCode;
  status: number;

  constructor(code: ErrorCode, message: string, status = ERROR_STATUS[code]) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function codeOf(err: unknown): ErrorCode | undefined {
  if (err instanceof AppError) return err.code;
  const code = (err as { code?: string })?.code;
  if (
    code === "unauthenticated" ||
    code === "forbidden" ||
    code === "not_found" ||
    code === "conflict" ||
    code === "invalid" ||
    code === "not_ready"
  ) {
    return code;
  }
  return undefined;
}

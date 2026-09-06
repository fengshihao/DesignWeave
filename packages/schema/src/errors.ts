import { z } from "zod";

export const ErrorCodeSchema = z.enum([
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "invalid",
  "not_ready",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid: 400,
  not_ready: 400,
};

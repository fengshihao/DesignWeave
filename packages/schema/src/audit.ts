import { z } from "zod";

export const AuditResultSchema = z.enum(["ok", "deny", "error"]);
export type AuditResult = z.infer<typeof AuditResultSchema>;

export const AuditEventSchema = z.object({
  id: z.string(),
  ts: z.string(),
  requestId: z.string().nullable(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorRole: z.string().nullable(),
  action: z.string(),
  projectId: z.string().nullable(),
  folder: z.string().nullable(),
  targetId: z.string().nullable(),
  result: AuditResultSchema,
  detail: z.record(z.string(), z.unknown()).nullable(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

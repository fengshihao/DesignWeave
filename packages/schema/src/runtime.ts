import { z } from "zod";
import { DocFolderSchema } from "./workbench.js";

export const ProjectLockInfoSchema = z
  .object({
    holderId: z.string(),
    holderName: z.string(),
    folder: DocFolderSchema,
    youHold: z.boolean(),
    editing: z.boolean(),
    otherDevice: z.boolean(),
  })
  .nullable();
export type ProjectLockInfo = z.infer<typeof ProjectLockInfoSchema>;

export const DocFocusSchema = z.object({
  file: z.string(),
  headingPath: z.array(z.string()).default([]),
  quote: z.string(),
  before: z.string().optional(),
  after: z.string().optional(),
});
export type DocFocus = z.infer<typeof DocFocusSchema>;

export const WorkbenchModeSchema = z.enum([
  "clarify",
  "coauthor",
  "grill",
  "feasibility",
  "ask",
]);
export type WorkbenchMode = z.infer<typeof WorkbenchModeSchema>;

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const WorkbenchRunSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sessionId: z.string().nullable().optional(),
  userId: z.string(),
  userName: z.string(),
  mode: WorkbenchModeSchema,
  message: z.string(),
  focus: DocFocusSchema.nullable().optional(),
  folder: DocFolderSchema,
  status: RunStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  endedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type WorkbenchRun = z.infer<typeof WorkbenchRunSchema>;

export const ChatSessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  userId: z.string(),
  title: z.string(),
  status: z.enum(["open", "closed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
});
export type ChatSession = z.infer<typeof ChatSessionSchema>;

export const InboxQuestionSchema = z.object({
  asker: z.string(),
  target: z.string(),
  question: z.string(),
});
export type InboxQuestion = z.infer<typeof InboxQuestionSchema>;

export const FollowItemSchema = z.object({
  date: z.string(),
  action: z.string(),
  from: DocFolderSchema,
  sha: z.string(),
  note: z.string(),
  touched: z.string(),
});
export type FollowItem = z.infer<typeof FollowItemSchema>;

export const DocFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  etag: z.string(),
});
export type DocFile = z.infer<typeof DocFileSchema>;

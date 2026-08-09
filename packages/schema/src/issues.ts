import { z } from "zod";
import { PRD_SECTION_KEYS } from "./prd.js";

export const IssueSeveritySchema = z.enum(["critical", "major", "minor"]);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

export const ISSUE_SEVERITY_LABELS: Record<IssueSeverity, string> = {
  critical: "严重",
  major: "重要",
  minor: "次要",
};

export const IssueStatusSchema = z.enum(["open", "resolved", "dismissed"]);
export type IssueStatus = z.infer<typeof IssueStatusSchema>;

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: "未决",
  resolved: "已回应",
  dismissed: "已否决",
};

export const IssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(""),
  severity: IssueSeveritySchema.default("major"),
  status: IssueStatusSchema.default("open"),
  section: z.enum(PRD_SECTION_KEYS).optional(),
  suggestion: z.string().default(""),
  source: z.enum(["grill", "consistency", "manual"]).default("manual"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Issue = z.infer<typeof IssueSchema>;

export const IssuesFileSchema = z.object({
  issues: z.array(IssueSchema).default([]),
});

export type IssuesFile = z.infer<typeof IssuesFileSchema>;

import { z } from "zod";

export const ProjectPhaseSchema = z.enum(["design", "architecture", "qa"]);
export type ProjectPhase = z.infer<typeof ProjectPhaseSchema>;

export const PROJECT_PHASE_LABELS: Record<ProjectPhase, string> = {
  design: "设计",
  architecture: "架构",
  qa: "测试",
};

export const ProjectMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  phase: ProjectPhaseSchema.default("design"),
  repoPath: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProjectMeta = z.infer<typeof ProjectMetaSchema>;

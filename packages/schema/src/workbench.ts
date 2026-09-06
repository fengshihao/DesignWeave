import { z } from "zod";

export const DocFolderSchema = z.enum(["product", "eng", "qa"]);
export type DocFolder = z.infer<typeof DocFolderSchema>;

export const ProjectSourceSchema = z.enum(["template", "import"]);
export type ProjectSource = z.infer<typeof ProjectSourceSchema>;

export const DiskProjectPhaseSchema = z.enum([
  "filling",
  "imported",
  "clarifying",
  "ready",
]);
export type DiskProjectPhase = z.infer<typeof DiskProjectPhaseSchema>;

export const ClarityStateSchema = z.enum(["pending", "ready"]);
export type ClarityState = z.infer<typeof ClarityStateSchema>;

export const WorkbenchProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  ownerId: z.string().nullable(),
  ownerName: z.string(),
  source: ProjectSourceSchema,
  phase: DiskProjectPhaseSchema,
  clarity: ClarityStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  vaultPath: z.string(),
  folderName: z.string(),
});
export type WorkbenchProject = z.infer<typeof WorkbenchProjectSchema>;

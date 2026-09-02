import type { ClarityState, DiskProjectPhase } from "./projectMeta.js";
import { isReady } from "./projectMeta.js";
import type { WorkbenchMode } from "./workbenchRuns.js";

export function allowedModes(_input?: {
  phase: DiskProjectPhase;
  clarity: ClarityState;
  hasApprovedCodeDirs: boolean;
}): WorkbenchMode[] {
  return ["clarify", "coauthor", "grill", "feasibility"];
}

/** G3：清晰度 / 代码目录不再拦发送。锁和记版仍听 12。 */
export function gateWorkbenchMode(_input?: {
  mode: WorkbenchMode;
  phase: DiskProjectPhase;
  clarity: ClarityState;
  hasApprovedCodeDirs: boolean;
}): string | null {
  return null;
}

export function clarityStatusLabel(input: {
  phase: DiskProjectPhase;
  clarity: ClarityState;
}): string {
  if (isReady(input)) return "清晰";
  if (input.phase === "clarifying") return "检查中";
  if (input.phase === "imported") return "已导入";
  return "填写中";
}

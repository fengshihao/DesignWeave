import type { ClarityState, DiskProjectPhase } from "./projectMeta.js";
import { isReady } from "./projectMeta.js";
import type { WorkbenchMode } from "./workbenchRuns.js";

export function allowedModes(input: {
  phase: DiskProjectPhase;
  clarity: ClarityState;
  hasApprovedCodeDirs: boolean;
}): WorkbenchMode[] {
  if (!isReady(input)) return ["clarify"];
  const modes: WorkbenchMode[] = ["coauthor", "grill", "feasibility"];
  if (!input.hasApprovedCodeDirs) {
    return ["coauthor", "grill"];
  }
  return modes;
}

export function gateWorkbenchMode(input: {
  mode: WorkbenchMode;
  phase: DiskProjectPhase;
  clarity: ClarityState;
  hasApprovedCodeDirs: boolean;
}): string | null {
  const allowed = allowedModes(input);
  if (allowed.includes(input.mode)) return null;
  if (input.mode === "feasibility" && isReady(input) && !input.hasApprovedCodeDirs) {
    return "架构师还没批准代码目录";
  }
  if (!isReady(input)) {
    return "先检查清晰度，才能用共创 / 拷问 / 可行性。";
  }
  return "这个档位现在不能用。";
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

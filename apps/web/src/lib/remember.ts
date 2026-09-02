const LAST_PROJECT = "dw-last-project";

export function rememberProject(id: string) {
  try {
    localStorage.setItem(LAST_PROJECT, id);
  } catch {
    /* 隐私模式 */
  }
}

export function lastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT);
  } catch {
    return null;
  }
}

export function forgetProject(id: string) {
  try {
    if (localStorage.getItem(LAST_PROJECT) === id) {
      localStorage.removeItem(LAST_PROJECT);
    }
    localStorage.removeItem(`dw-last-file-${id}`);
    localStorage.removeItem(`dw-entrust-size-${id}`);
    localStorage.removeItem(`dw-entrust-width-${id}`);
  } catch {
    /* 隐私模式 */
  }
}

export function rememberFile(projectId: string, path: string) {
  try {
    localStorage.setItem(`dw-last-file-${projectId}`, path);
  } catch {
    /* 隐私模式 */
  }
}

export function lastFile(projectId: string): string | null {
  try {
    return localStorage.getItem(`dw-last-file-${projectId}`);
  } catch {
    return null;
  }
}

export type EntrustSize = "collapsed" | "half" | "full";

export function rememberEntrustSize(projectId: string, size: EntrustSize) {
  try {
    localStorage.setItem(`dw-entrust-size-${projectId}`, size);
  } catch {
    /* 隐私模式 */
  }
}

export function lastEntrustSize(projectId: string): EntrustSize | null {
  try {
    const raw = localStorage.getItem(`dw-entrust-size-${projectId}`);
    if (raw === "collapsed" || raw === "half" || raw === "full") return raw;
    return null;
  } catch {
    return null;
  }
}

export function rememberEntrustWidth(projectId: string, width: number) {
  try {
    localStorage.setItem(`dw-entrust-width-${projectId}`, String(Math.round(width)));
  } catch {
    /* 隐私模式 */
  }
}

export function lastEntrustWidth(projectId: string): number | null {
  try {
    const raw = localStorage.getItem(`dw-entrust-width-${projectId}`);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 280 ? n : null;
  } catch {
    return null;
  }
}

const RAIL_WIDTH = "dw-rail-width";

export function rememberRailWidth(width: number) {
  try {
    localStorage.setItem(RAIL_WIDTH, String(Math.round(width)));
  } catch {
    /* 隐私模式 */
  }
}

export function lastRailWidth(): number | null {
  try {
    const raw = localStorage.getItem(RAIL_WIDTH);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 188 ? Math.min(380, n) : null;
  } catch {
    return null;
  }
}

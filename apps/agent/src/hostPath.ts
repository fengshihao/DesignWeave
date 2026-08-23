import path from "node:path";

export type HostPlatform = "win32" | "posix";

export type PathCrumb = {
  label: string;
  path: string;
};

export function hostPlatform(platform: string = process.platform): HostPlatform {
  return platform === "win32" ? "win32" : "posix";
}

function impl(platform: string) {
  return hostPlatform(platform) === "win32" ? path.win32 : path.posix;
}

/** Git Bash / Cygwin 的 /c/Users/... → C:\Users\...。不误伤 /home/... */
export function fromMsysPath(raw: string): string | null {
  const p = raw.trim();
  const cyg = p.match(/^\/cygdrive\/([A-Za-z])(\/.*)?$/);
  if (cyg) {
    const rest = (cyg[2] || "").replace(/\//g, "\\");
    return `${cyg[1].toUpperCase()}:${rest || "\\"}`;
  }
  const msys = p.match(/^\/([A-Za-z])(\/.*)?$/);
  if (msys) {
    const rest = (msys[2] || "").replace(/\//g, "\\");
    return `${msys[1].toUpperCase()}:${rest || "\\"}`;
  }
  return null;
}

export function isLikelyAbsolutePath(raw: string, platform: string = process.platform): boolean {
  const p = raw.trim();
  if (!p) return false;
  if (hostPlatform(platform) === "win32") {
    if (/^[A-Za-z]:[\\/]/.test(p)) return true;
    if (/^\\\\[^\\]/.test(p) || /^\/\/[^/]/.test(p)) return true;
    if (/^\/[A-Za-z](\/|$)/.test(p)) return true;
    if (/^\/cygdrive\/[A-Za-z](\/|$)/.test(p)) return true;
    return false;
  }
  return p.startsWith("/");
}

function isWinRoot(resolved: string): boolean {
  if (/^[A-Z]:\\$/.test(resolved)) return true;
  // \\server\share\ 
  return /^\\\\[^\\]+\\[^\\]+\\$/.test(resolved);
}

export function canonicalPath(raw: string, platform: string = process.platform): string {
  const hp = hostPlatform(platform);
  const p = impl(hp);
  let converted = raw.trim();
  if (hp === "win32") {
    converted = fromMsysPath(converted) ?? converted;
  }
  let resolved = p.resolve(converted);
  if (hp === "win32") {
    resolved = resolved.replace(/^([a-z]):/, (_, d: string) => `${d.toUpperCase()}:`);
    if (isWinRoot(resolved)) return resolved;
    return resolved.replace(/[\\/]+$/, "");
  }
  if (resolved !== "/") resolved = resolved.replace(/\/+$/, "");
  return resolved;
}

/** 配置 / 用户输入 → 本机绝对路径；相对路径按 cwd 解析。 */
export function resolveHostPath(raw: string, platform: string = process.platform): string {
  return canonicalPath(raw.trim() || ".", platform);
}

/** 只收绝对路径（含 Windows 盘符、UNC、Git Bash /c/...）。 */
export function toHostPath(raw: string, platform: string = process.platform): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes("\0")) return null;
  if (!isLikelyAbsolutePath(trimmed, platform)) return null;
  return canonicalPath(trimmed, platform);
}

export function isPathInside(
  child: string,
  parent: string,
  platform: string = process.platform
): boolean {
  const hp = hostPlatform(platform);
  const p = impl(hp);
  const rel = p.relative(canonicalPath(parent, platform), canonicalPath(child, platform));
  if (rel === "") return true;
  return !rel.startsWith("..") && !p.isAbsolute(rel);
}

export function isStrictlyInside(
  child: string,
  parent: string,
  platform: string = process.platform
): boolean {
  return (
    isPathInside(child, parent, platform) &&
    canonicalPath(child, platform) !== canonicalPath(parent, platform)
  );
}

export function isFsRoot(abs: string, platform: string = process.platform): boolean {
  const hp = hostPlatform(platform);
  const resolved = canonicalPath(abs, platform);
  if (hp === "posix") return resolved === "/";
  const root = impl(hp).parse(resolved).root;
  return canonicalPath(root, platform) === resolved || isWinRoot(resolved);
}

export function pathCrumbs(
  abs: string,
  home: string,
  platform: string = process.platform
): PathCrumb[] {
  const hp = hostPlatform(platform);
  const p = impl(hp);
  const current = canonicalPath(abs, platform);
  const homeAbs = canonicalPath(home, platform);

  if (isPathInside(current, homeAbs, platform)) {
    const out: PathCrumb[] = [{ label: "家目录", path: homeAbs }];
    const rel = p.relative(homeAbs, current);
    if (!rel) return out;
    let acc = homeAbs;
    for (const part of rel.split(/[\\/]/).filter(Boolean)) {
      acc = p.join(acc, part);
      out.push({ label: part, path: canonicalPath(acc, platform) });
    }
    return out;
  }

  const parsed = p.parse(current);
  const rootPath = parsed.root || (hp === "win32" ? current : "/");
  const rootLabel =
    hp === "win32" ? rootPath.replace(/[\\/]+$/, "") || rootPath : "/";
  const out: PathCrumb[] = [{ label: rootLabel, path: canonicalPath(rootPath, platform) }];
  const rel = p.relative(rootPath, current);
  if (!rel) return out;
  let acc = rootPath;
  for (const part of rel.split(/[\\/]/).filter(Boolean)) {
    acc = p.join(acc, part);
    out.push({ label: part, path: canonicalPath(acc, platform) });
  }
  return out;
}

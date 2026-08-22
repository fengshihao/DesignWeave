import fs from "node:fs";
import path from "node:path";

export const PROJECT_SOURCES = ["template", "import"] as const;
export type ProjectSource = (typeof PROJECT_SOURCES)[number];

export const PROJECT_PHASES = [
  "filling",
  "imported",
  "clarifying",
  "ready",
] as const;
export type DiskProjectPhase = (typeof PROJECT_PHASES)[number];

export const CLARITY_STATES = ["pending", "ready"] as const;
export type ClarityState = (typeof CLARITY_STATES)[number];

export type DiskProjectMeta = {
  id: string;
  title: string;
  owner: string;
  source: ProjectSource;
  phase: DiskProjectPhase;
  clarity: ClarityState;
  createdAt: string;
  updatedAt: string;
};

const LEGACY_PHASE: Record<string, DiskProjectPhase> = {
  guide: "filling",
  document: "filling",
  gaps: "imported",
  filling: "filling",
  imported: "imported",
  clarifying: "clarifying",
  ready: "ready",
};

function stripQuotes(raw: string): string {
  const t = raw.trim();
  if (t === "null" || t === "~") return "";
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    try {
      return JSON.parse(t.startsWith("'") ? JSON.stringify(t.slice(1, -1)) : t);
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

export function parseMetaMarkdown(text: string): Partial<DiskProjectMeta> {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const block = match ? match[1] : "";
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const cut = line.indexOf(":");
    if (cut <= 0) continue;
    const key = line.slice(0, cut).trim();
    if (key === "relatedRepos") continue;
    out[key] = stripQuotes(line.slice(cut + 1));
  }
  const phase = LEGACY_PHASE[out.phase || ""] || "filling";
  const source: ProjectSource =
    out.source === "import" || out.source === "template" ? out.source : "template";
  const clarity: ClarityState =
    out.clarity === "ready" || phase === "ready" ? "ready" : "pending";
  return {
    id: out.id || undefined,
    title: out.title || undefined,
    owner: out.owner || "",
    source,
    phase: clarity === "ready" ? "ready" : phase,
    clarity,
    createdAt: out.createdAt || undefined,
    updatedAt: out.updatedAt || undefined,
  };
}

export function serializeMetaMarkdown(meta: DiskProjectMeta): string {
  return `---
id: ${meta.id}
title: ${JSON.stringify(meta.title)}
owner: ${JSON.stringify(meta.owner)}
source: ${meta.source}
phase: ${meta.phase}
clarity: ${meta.clarity}
createdAt: ${meta.createdAt}
updatedAt: ${meta.updatedAt}
---

# ${meta.title}
`;
}

export function readMetaFile(dir: string): DiskProjectMeta | null {
  const p = path.join(dir, "meta.md");
  if (!fs.existsSync(p)) return null;
  const parsed = parseMetaMarkdown(fs.readFileSync(p, "utf8"));
  if (!parsed.id || !parsed.title) return null;
  const now = new Date().toISOString();
  return {
    id: parsed.id,
    title: parsed.title,
    owner: parsed.owner || "",
    source: parsed.source || "template",
    phase: parsed.phase || "filling",
    clarity: parsed.clarity || "pending",
    createdAt: parsed.createdAt || now,
    updatedAt: parsed.updatedAt || now,
  };
}

export function writeMetaFile(dir: string, meta: DiskProjectMeta): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "meta.md"), serializeMetaMarkdown(meta), "utf8");
}

export function isReady(meta: Pick<DiskProjectMeta, "clarity" | "phase">): boolean {
  return meta.clarity === "ready" || meta.phase === "ready";
}

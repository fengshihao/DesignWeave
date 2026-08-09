import fs from "node:fs";
import path from "node:path";
import {
  createEmptyPrd,
  createEmptyTechSpec,
  createEmptyTestPlan,
  prdToMarkdown,
  techSpecToMarkdown,
  testPlanToMarkdown,
  srToMarkdown,
  PrdDocumentSchema,
  IssuesFileSchema,
  TechSpecSchema,
  TestPlanSchema,
  SrDocumentSchema,
  type PrdDocument,
  type IssuesFile,
  type ProjectMeta,
  type TechSpec,
  type TestPlan,
  type SrDocument,
  type Issue,
  AgentStructuredResultSchema,
  type AgentStructuredResult,
  type PrdSectionKey,
} from "@designweave/schema";
import { workspacesRoot } from "./config.js";

export function projectDir(projectId: string): string {
  return path.join(workspacesRoot(), projectId);
}

export function ensureWorkspace(meta: ProjectMeta, seedIdea?: string): void {
  const root = projectDir(meta.id);
  const dirs = [
    root,
    path.join(root, "prd"),
    path.join(root, "arch"),
    path.join(root, "arch", "srs"),
    path.join(root, "qa"),
    path.join(root, "qa", "cases"),
    path.join(root, "sessions"),
  ];
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });

  writeJson(path.join(root, "project.json"), meta);

  const prdPath = path.join(root, "prd", "prd.json");
  if (!fs.existsSync(prdPath)) {
    const prd = createEmptyPrd(meta.name);
    if (seedIdea) {
      prd.problem = seedIdea;
      prd.meta.summary = seedIdea.slice(0, 200);
    }
    writePrd(meta.id, prd);
  }

  const issuesPath = path.join(root, "prd", "issues.json");
  if (!fs.existsSync(issuesPath)) {
    writeIssues(meta.id, { issues: [] });
  }

  const techPath = path.join(root, "arch", "tech.json");
  if (!fs.existsSync(techPath)) {
    writeTechSpec(meta.id, createEmptyTechSpec());
  }

  const testPath = path.join(root, "qa", "test-plan.json");
  if (!fs.existsSync(testPath)) {
    writeTestPlan(meta.id, createEmptyTestPlan());
  }
}

export function readProjectMeta(projectId: string): ProjectMeta {
  return readJson(path.join(projectDir(projectId), "project.json")) as ProjectMeta;
}

export function writeProjectMeta(meta: ProjectMeta): void {
  writeJson(path.join(projectDir(meta.id), "project.json"), meta);
}

export function readPrd(projectId: string): PrdDocument {
  const raw = readJson(path.join(projectDir(projectId), "prd", "prd.json"));
  return PrdDocumentSchema.parse(raw);
}

export function writePrd(projectId: string, doc: PrdDocument): void {
  const parsed = PrdDocumentSchema.parse(doc);
  const prdDir = path.join(projectDir(projectId), "prd");
  writeJson(path.join(prdDir, "prd.json"), parsed);
  fs.writeFileSync(path.join(prdDir, "PRD.md"), prdToMarkdown(parsed), "utf8");
}

export function readIssues(projectId: string): IssuesFile {
  const p = path.join(projectDir(projectId), "prd", "issues.json");
  if (!fs.existsSync(p)) return { issues: [] };
  return IssuesFileSchema.parse(readJson(p));
}

export function writeIssues(projectId: string, file: IssuesFile): void {
  writeJson(
    path.join(projectDir(projectId), "prd", "issues.json"),
    IssuesFileSchema.parse(file)
  );
}

export function readTechSpec(projectId: string): TechSpec {
  const p = path.join(projectDir(projectId), "arch", "tech.json");
  if (!fs.existsSync(p)) return createEmptyTechSpec();
  return TechSpecSchema.parse(readJson(p));
}

export function writeTechSpec(projectId: string, spec: TechSpec): void {
  const parsed = TechSpecSchema.parse(spec);
  const archDir = path.join(projectDir(projectId), "arch");
  writeJson(path.join(archDir, "tech.json"), parsed);
  fs.writeFileSync(
    path.join(archDir, "TECH_SPEC.md"),
    techSpecToMarkdown(parsed),
    "utf8"
  );
}

export function readTestPlan(projectId: string): TestPlan {
  const p = path.join(projectDir(projectId), "qa", "test-plan.json");
  if (!fs.existsSync(p)) return createEmptyTestPlan();
  return TestPlanSchema.parse(readJson(p));
}

export function writeTestPlan(projectId: string, plan: TestPlan): void {
  const parsed = TestPlanSchema.parse(plan);
  const qaDir = path.join(projectDir(projectId), "qa");
  writeJson(path.join(qaDir, "test-plan.json"), parsed);
  fs.writeFileSync(
    path.join(qaDir, "TEST_PLAN.md"),
    testPlanToMarkdown(parsed),
    "utf8"
  );
}

export function listSrs(projectId: string): SrDocument[] {
  const dir = path.join(projectDir(projectId), "arch", "srs");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => SrDocumentSchema.parse(readJson(path.join(dir, f))))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function writeSr(projectId: string, sr: SrDocument): void {
  const parsed = SrDocumentSchema.parse(sr);
  const dir = path.join(projectDir(projectId), "arch", "srs");
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, `${parsed.id}.json`), parsed);
  fs.writeFileSync(path.join(dir, `${parsed.id}.md`), srToMarkdown(parsed), "utf8");
}

export function applyPatches(
  projectId: string,
  result: AgentStructuredResult
): PrdDocument {
  const parsed = AgentStructuredResultSchema.parse(result);
  const doc = readPrd(projectId);

  for (const patch of parsed.patches) {
    applySectionPatch(doc, patch.section, patch.content);
  }

  if (parsed.patches.length) {
    doc.changelog = [
      ...doc.changelog,
      {
        at: new Date().toISOString(),
        note: `AI 采纳 ${parsed.patches.length} 处修订：${parsed.summary || "无摘要"}`,
      },
    ];
  }

  writePrd(projectId, doc);

  if (parsed.issues.length) {
    mergeIssues(projectId, parsed, "grill");
  }

  return doc;
}

export function applyConsistencyResult(
  projectId: string,
  result: AgentStructuredResult
): IssuesFile {
  const parsed = AgentStructuredResultSchema.parse(result);
  const file = mergeIssues(projectId, parsed, "consistency");
  const now = new Date().toISOString();
  const newOnes = file.issues.filter((i) => i.source === "consistency" && i.createdAt === now);

  const reportPath = path.join(
    projectDir(projectId),
    "prd",
    "consistency-report.md"
  );
  const related = file.issues.filter((i) => i.source === "consistency").slice(0, parsed.issues.length);
  const md = [
    "# 一致性报告",
    "",
    `生成时间：${now}`,
    "",
    "## 摘要",
    "",
    parsed.summary || "（无）",
    "",
    `## 问题（${related.length}）`,
    "",
    ...related.flatMap((i) => [
      `### ${i.id} ${i.title}`,
      "",
      `- 严重级别：${i.severity}`,
      `- 章节：${i.section ?? "未指定"}`,
      "",
      i.description || "（无描述）",
      "",
      i.suggestion ? `建议：${i.suggestion}` : "",
      "",
    ]),
  ].join("\n");
  fs.writeFileSync(reportPath, md, "utf8");
  return file;
}

function mergeIssues(
  projectId: string,
  parsed: AgentStructuredResult,
  source: "grill" | "consistency"
): IssuesFile {
  const file = readIssues(projectId);
  const now = new Date().toISOString();
  const prefix = source === "consistency" ? "CON" : "ISS";
  const newIssues: Issue[] = parsed.issues.map((issue, idx) => ({
    id: `${prefix}-${Date.now()}-${idx}`,
    title: issue.title,
    description: issue.description ?? "",
    severity: issue.severity ?? "major",
    status: "open" as const,
    section: issue.section,
    suggestion: issue.suggestion ?? "",
    source,
    createdAt: now,
    updatedAt: now,
  }));
  file.issues = [...newIssues, ...file.issues];
  writeIssues(projectId, file);
  return file;
}

function applySectionPatch(
  doc: PrdDocument,
  section: PrdSectionKey,
  content: string
): void {
  switch (section) {
    case "meta": {
      try {
        const obj = JSON.parse(content) as Partial<PrdDocument["meta"]>;
        doc.meta = { ...doc.meta, ...obj };
      } catch {
        doc.meta.summary = content;
      }
      break;
    }
    case "problem":
    case "users":
    case "goals":
    case "edge_cases":
    case "nfr":
      doc[section] = content;
      break;
    case "scope": {
      try {
        const obj = JSON.parse(content) as {
          inScope?: string;
          outOfScope?: string;
        };
        doc.scope = {
          inScope: obj.inScope ?? doc.scope.inScope,
          outOfScope: obj.outOfScope ?? doc.scope.outOfScope,
        };
      } catch {
        doc.scope.inScope = content;
      }
      break;
    }
    case "journeys":
    case "requirements":
    case "open_questions":
    case "changelog": {
      try {
        const parsedJson = JSON.parse(content);
        (doc as unknown as Record<string, unknown>)[section] = parsedJson;
      } catch {
        if (section === "open_questions") {
          doc.open_questions = content
            .split("\n")
            .map((l) => l.replace(/^[-*]\s*/, "").trim())
            .filter(Boolean);
        }
      }
      break;
    }
  }
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

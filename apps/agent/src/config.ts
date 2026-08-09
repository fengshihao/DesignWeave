import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config();

function resolveDataDir(): string {
  const raw = process.env.DATA_DIR || path.join(repoRoot, "data");
  return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
}

export const config = {
  port: Number(process.env.AGENT_PORT || process.env.PORT || 8787),
  dataDir: resolveDataDir(),
  appPassword: process.env.APP_PASSWORD || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  repoRoot,
};

export function workspacesRoot(): string {
  return path.join(config.dataDir, "workspaces");
}

export function dbPath(): string {
  return path.join(config.dataDir, "designweave.db");
}

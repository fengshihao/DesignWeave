import { proxyToAgent } from "@/lib/agentProxy";
import type { NextRequest } from "next/server";

export function GET(req: NextRequest) {
  return proxyToAgent(req);
}

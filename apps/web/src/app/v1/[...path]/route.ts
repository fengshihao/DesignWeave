import { proxyToAgent } from "@/lib/agentProxy";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(req: NextRequest) {
  return proxyToAgent(req);
}
export function POST(req: NextRequest) {
  return proxyToAgent(req);
}
export function PUT(req: NextRequest) {
  return proxyToAgent(req);
}
export function PATCH(req: NextRequest) {
  return proxyToAgent(req);
}
export function DELETE(req: NextRequest) {
  return proxyToAgent(req);
}

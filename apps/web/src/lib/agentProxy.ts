import { NextRequest, NextResponse } from "next/server";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function agentOrigin(): string {
  return (
    process.env.AGENT_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_AGENT_URL ||
    "http://localhost:8787"
  ).replace(/\/$/, "");
}

export async function proxyToAgent(req: NextRequest): Promise<NextResponse> {
  const incoming = new URL(req.url);
  const target = `${agentOrigin()}${incoming.pathname}${incoming.search}`;
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
    cache: "no-store",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    if (key.toLowerCase() === "set-cookie") return;
    out.set(key, value);
  });
  const cookies =
    typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : [];
  for (const cookie of cookies) {
    out.append("set-cookie", cookie);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: out,
  });
}

export const PROXY_METHODS = {
  GET: (req: NextRequest) => proxyToAgent(req),
  POST: (req: NextRequest) => proxyToAgent(req),
  PUT: (req: NextRequest) => proxyToAgent(req),
  PATCH: (req: NextRequest) => proxyToAgent(req),
  DELETE: (req: NextRequest) => proxyToAgent(req),
};

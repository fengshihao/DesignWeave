const SECRET = /password|token|cookie|authorization|content|markdown|secret/i;

function sanitize(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value.length > 240 ? `${value.slice(0, 240)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET.test(key) ? "[redacted]" : sanitize(item);
    }
    return out;
  }
  return value;
}

export function logLine(event: string, fields: Record<string, unknown> = {}): void {
  const line = {
    ts: new Date().toISOString(),
    event,
    ...((sanitize(fields) as Record<string, unknown>) || {}),
  };
  console.log(JSON.stringify(line));
}

export class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function statusOf(err: unknown, fallback = 400): number {
  if (err instanceof HttpError) return err.status;
  const status = (err as { status?: number })?.status;
  return typeof status === "number" ? status : fallback;
}

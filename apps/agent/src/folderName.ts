const FORBIDDEN = /[/\\:*?"<>|]/g;

export function folderNameFor(title: string): string {
  const name = title.replace(FORBIDDEN, "").replace(/\s+/g, " ").trim();
  return (name || "未命名工程").slice(0, 80);
}

export function uniqueFolderName(existing: Iterable<string>, title: string): string {
  const base = folderNameFor(title);
  const taken = new Set(
    [...existing].map((n) => n.toLowerCase())
  );
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`.toLowerCase())) n += 1;
  return `${base}-${n}`;
}

const FORBIDDEN = /[/\\:*?"<>|]/g;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

export function folderNameFor(title: string): string {
  let name = title.replace(FORBIDDEN, "").replace(/\s+/g, " ").trim();
  name = name.replace(/[. ]+$/g, "");
  if (!name) name = "未命名工程";
  if (RESERVED.test(name)) name = `工程-${name}`;
  return name.slice(0, 80);
}

export function isUsableFolderName(name: string): boolean {
  if (!name || name.startsWith(".") || name.includes("..")) return false;
  if (/[/\\:*?"<>|]/.test(name)) return false;
  if (/[. ]$/.test(name)) return false;
  if (RESERVED.test(name)) return false;
  return true;
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

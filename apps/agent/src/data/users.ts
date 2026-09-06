import { customAlphabet } from "nanoid";
import { hashPassword } from "better-auth/crypto";
import {
  ROLE_LABELS,
  asAppRole,
  type AppRole,
  type AppUser,
  type UserStatus,
} from "@designweave/schema";
import { getDb } from "../db.js";

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export function ensureUserColumns(): void {
  const cols = getDb()
    .prepare(`PRAGMA table_info("user")`)
    .all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "createdBy")) {
    getDb().exec(`ALTER TABLE "user" ADD COLUMN "createdBy" TEXT`);
  }
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const text = String(value || "");
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text || new Date().toISOString();
}

function mapUser(row: UserRow): AppUser {
  const role = asAppRole(row.role);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    roleLabel: ROLE_LABELS[role],
    status: row.banned ? "disabled" : "active",
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    createdBy: row.createdBy ?? null,
  };
}

function selectSql(): string {
  return `SELECT id, name, email, role, banned, createdAt, updatedAt, createdBy FROM "user"`;
}

export function listUserRows(): AppUser[] {
  ensureUserColumns();
  const rows = getDb().prepare(`${selectSql()} ORDER BY createdAt ASC`).all() as UserRow[];
  return rows.map(mapUser);
}

export function getUserRow(id: string): AppUser | null {
  ensureUserColumns();
  const row = getDb().prepare(`${selectSql()} WHERE id = ?`).get(id) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function getUserByEmail(email: string): AppUser | null {
  ensureUserColumns();
  const row = getDb()
    .prepare(`${selectSql()} WHERE lower(email) = ?`)
    .get(email.trim().toLowerCase()) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function countActiveArchitects(exceptId?: string): number {
  ensureUserColumns();
  const row = exceptId
    ? (getDb()
        .prepare(
          `SELECT COUNT(*) as c FROM "user" WHERE role = 'architect' AND IFNULL(banned, 0) = 0 AND id != ?`
        )
        .get(exceptId) as { c: number })
    : (getDb()
        .prepare(`SELECT COUNT(*) as c FROM "user" WHERE role = 'architect' AND IFNULL(banned, 0) = 0`)
        .get() as { c: number });
  return Number(row?.c ?? 0);
}

export async function insertUser(input: {
  name: string;
  email: string;
  password: string;
  role: AppRole;
  createdBy: string | null;
}): Promise<AppUser> {
  ensureUserColumns();
  const now = new Date().toISOString();
  const id = nanoid();
  const email = input.email.trim().toLowerCase();
  getDb()
    .prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, image, createdAt, updatedAt, role, banned, createdBy)
       VALUES (?, ?, ?, 1, NULL, ?, ?, ?, 0, ?)`
    )
    .run(id, input.name.trim(), email, now, now, input.role, input.createdBy);
  const hashed = await hashPassword(input.password);
  getDb()
    .prepare(
      `INSERT INTO "account"
       (id, accountId, providerId, userId, password, createdAt, updatedAt)
       VALUES (?, ?, 'credential', ?, ?, ?, ?)`
    )
    .run(nanoid(), id, id, hashed, now, now);
  return getUserRow(id)!;
}

export function updateUserRow(
  id: string,
  patch: { name?: string; role?: AppRole; status?: UserStatus }
): AppUser {
  ensureUserColumns();
  const current = getUserRow(id);
  if (!current) throw new Error("用户不存在");
  const now = new Date().toISOString();
  const name = patch.name?.trim() || current.name;
  const role = patch.role || current.role;
  const banned = (patch.status || current.status) === "disabled" ? 1 : 0;
  getDb()
    .prepare(`UPDATE "user" SET name = ?, role = ?, banned = ?, updatedAt = ? WHERE id = ?`)
    .run(name, role, banned, now, id);
  return getUserRow(id)!;
}

export async function setUserPasswordHash(id: string, password: string): Promise<void> {
  const hashed = await hashPassword(password);
  const now = new Date().toISOString();
  const updated = getDb()
    .prepare(
      `UPDATE "account" SET password = ?, updatedAt = ? WHERE userId = ? AND providerId = 'credential'`
    )
    .run(hashed, now, id);
  if (!updated.changes) {
    getDb()
      .prepare(
        `INSERT INTO "account"
         (id, accountId, providerId, userId, password, createdAt, updatedAt)
         VALUES (?, ?, 'credential', ?, ?, ?, ?)`
      )
      .run(nanoid(), id, id, hashed, now, now);
  }
}

export function deleteSessionsForUser(userId: string): void {
  getDb().prepare(`DELETE FROM "session" WHERE userId = ?`).run(userId);
}

export function isUserDisabled(id: string): boolean {
  const user = getUserRow(id);
  return user?.status === "disabled";
}

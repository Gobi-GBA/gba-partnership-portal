import { users, sessions, partnerships, attachments, changeRequests, auditLogs, feedback } from "../shared/schema.js";
import type { User, Partnership, Attachment, ChangeRequest, AuditLog, Feedback } from "../shared/schema.js";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { SEED_PARTNERS } from "./seed-data.js";
import { hashPassword, getSeedPassword, PHOTO_SEED, type IStorage } from "./storage-common.js";

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS partnerships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_en TEXT NOT NULL,
  name_cn TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  region TEXT NOT NULL DEFAULT 'hongkong',
  parent_id INTEGER,
  logo_url TEXT,
  website TEXT,
  description_en TEXT,
  description_cn TEXT,
  contact_name TEXT,
  contact_email TEXT,
  pic_name TEXT,
  context TEXT,
  partnership_type TEXT,
  start_date TEXT,
  stage TEXT NOT NULL DEFAULT 's1_new',
  collab_level INTEGER NOT NULL DEFAULT 1,
  hall_of_fame INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_by INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partnership_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  uploaded_by INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partnership_id INTEGER NOT NULL,
  proposed_by INTEGER NOT NULL,
  changes TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partnership_id INTEGER NOT NULL,
  user_id INTEGER,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  changes TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_name TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  admin_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
`;

export function createSqliteStorage(): IStorage {
  const sqlite = new Database(process.env.SQLITE_PATH || "data.db");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(DDL);

  // Lightweight migrations for DBs created before v2
  function ensureColumn(table: string, column: string, ddl: string) {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  }
  ensureColumn("partnerships", "region", "region TEXT NOT NULL DEFAULT 'hongkong'");
  ensureColumn("partnerships", "parent_id", "parent_id INTEGER");
  ensureColumn("partnerships", "pic_name", "pic_name TEXT");
  ensureColumn("partnerships", "pic_names", "pic_names TEXT");
  ensureColumn("partnerships", "context", "context TEXT");
  ensureColumn("users", "title", "title TEXT");
  ensureColumn("users", "avatar_url", "avatar_url TEXT");
  ensureColumn("users", "secret_q1", "secret_q1 TEXT");
  ensureColumn("users", "secret_a1_hash", "secret_a1_hash TEXT");
  ensureColumn("users", "secret_q2", "secret_q2 TEXT");
  ensureColumn("users", "secret_a2_hash", "secret_a2_hash TEXT");
  ensureColumn("users", "reset_token_hash", "reset_token_hash TEXT");
  ensureColumn("users", "reset_expires", "reset_expires TEXT");
  ensureColumn("partnerships", "photos", "photos TEXT");
  // Backfill example gallery photos for flagship partners (idempotent)
  for (const seed of PHOTO_SEED) {
    sqlite
      .prepare(`UPDATE partnerships SET photos = ? WHERE name_en = ? AND photos IS NULL`)
      .run(JSON.stringify(seed.photos), seed.nameEn);
  }
  // Migrate legacy single PIC into multi-PIC list
  sqlite.exec(`UPDATE partnerships SET pic_names = json_array(pic_name) WHERE pic_names IS NULL AND pic_name IS NOT NULL AND pic_name != ''`);
  // Migrate old stage values → 01-05 pipeline
  sqlite.exec(`
UPDATE partnerships SET stage = CASE stage
  WHEN 'target' THEN 's1_new'
  WHEN 'contacted' THEN 's2_engaged'
  WHEN 'met' THEN 's2_engaged'
  WHEN 'mou' THEN 's3_agreement'
  WHEN 'agreement' THEN 's3_agreement'
  WHEN 'active' THEN 's4_progressive'
  ELSE stage END
WHERE stage IN ('target','contacted','met','mou','agreement','active');
UPDATE users SET role = 'staff' WHERE role = 'member';
`);

  const db = drizzle(sqlite);

  class SqliteStorage implements IStorage {
    async getUser(id: number) {
      return db.select().from(users).where(eq(users.id, id)).get();
    }
    async getUserByEmail(email: string) {
      return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
    }
    async createUser(data: {
      name: string; email: string; passwordHash: string; role?: string; status?: string;
      secretQ1?: string | null; secretA1Hash?: string | null; secretQ2?: string | null; secretA2Hash?: string | null;
    }) {
      return db
        .insert(users)
        .values({
          name: data.name,
          email: data.email.toLowerCase(),
          passwordHash: data.passwordHash,
          role: data.role ?? "staff",
          status: data.status ?? "pending",
          secretQ1: data.secretQ1 ?? null,
          secretA1Hash: data.secretA1Hash ?? null,
          secretQ2: data.secretQ2 ?? null,
          secretA2Hash: data.secretA2Hash ?? null,
        })
        .returning()
        .get();
    }
    async listUsers() {
      return db.select().from(users).all();
    }
    async updateUser(
      id: number,
      data: Partial<
        Pick<
          User,
          | "status" | "role" | "name" | "title" | "avatarUrl" | "passwordHash"
          | "secretQ1" | "secretA1Hash" | "secretQ2" | "secretA2Hash"
          | "resetTokenHash" | "resetExpires"
        >
      >
    ) {
      return db.update(users).set(data).where(eq(users.id, id)).returning().get();
    }
    async getUserByResetToken(tokenHash: string) {
      return db.select().from(users).where(eq(users.resetTokenHash, tokenHash)).get();
    }

    async createSession(userId: number) {
      const token = randomBytes(32).toString("hex");
      return db.insert(sessions).values({ token, userId }).returning().get();
    }
    async getSession(token: string) {
      return db.select().from(sessions).where(eq(sessions.token, token)).get();
    }
    async deleteSession(token: string) {
      db.delete(sessions).where(eq(sessions.token, token)).run();
    }

    async listPartnerships() {
      return db.select().from(partnerships).all();
    }
    async getPartnership(id: number) {
      return db.select().from(partnerships).where(eq(partnerships.id, id)).get();
    }
    async createPartnership(data: Omit<Partnership, "id">) {
      return db.insert(partnerships).values(data).returning().get();
    }
    async updatePartnership(id: number, data: Partial<Partnership>) {
      const { id: _ignore, ...rest } = data as Partnership;
      return db.update(partnerships).set(rest).where(eq(partnerships.id, id)).returning().get();
    }
    async deletePartnership(id: number) {
      db.delete(partnerships).where(eq(partnerships.id, id)).run();
      db.delete(attachments).where(eq(attachments.partnershipId, id)).run();
      // detach children
      db.update(partnerships).set({ parentId: null }).where(eq(partnerships.parentId, id)).run();
    }

    async listAttachmentMeta(partnershipId: number) {
      return db
        .select({
          id: attachments.id,
          partnershipId: attachments.partnershipId,
          name: attachments.name,
          mime: attachments.mime,
          size: attachments.size,
          uploadedBy: attachments.uploadedBy,
          createdAt: attachments.createdAt,
        })
        .from(attachments)
        .where(eq(attachments.partnershipId, partnershipId))
        .all();
    }
    async getAttachment(id: number) {
      return db.select().from(attachments).where(eq(attachments.id, id)).get();
    }
    async createAttachment(data: Omit<Attachment, "id">) {
      const row = db.insert(attachments).values(data).returning().get();
      const { data: _d, ...meta } = row;
      return meta;
    }
    async deleteAttachment(id: number) {
      db.delete(attachments).where(eq(attachments.id, id)).run();
    }

    async createAuditLog(data: Omit<AuditLog, "id">) {
      return db.insert(auditLogs).values(data).returning().get();
    }
    async listAuditLogs(partnershipId: number) {
      return db.select().from(auditLogs).where(eq(auditLogs.partnershipId, partnershipId)).all();
    }

    async listChangeRequests() {
      return db.select().from(changeRequests).all();
    }
    async listChangeRequestsByUser(userId: number) {
      return db.select().from(changeRequests).where(eq(changeRequests.proposedBy, userId)).all();
    }
    async getChangeRequest(id: number) {
      return db.select().from(changeRequests).where(eq(changeRequests.id, id)).get();
    }
    async createChangeRequest(data: Omit<ChangeRequest, "id">) {
      return db.insert(changeRequests).values(data).returning().get();
    }
    async updateChangeRequestStatus(id: number, status: string) {
      return db.update(changeRequests).set({ status }).where(eq(changeRequests.id, id)).returning().get();
    }

    async listFeedback() {
      return db.select().from(feedback).all();
    }
    async listFeedbackByUser(userId: number) {
      return db.select().from(feedback).where(eq(feedback.userId, userId)).all();
    }
    async createFeedback(data: Omit<Feedback, "id">) {
      return db.insert(feedback).values(data).returning().get();
    }
    async updateFeedback(id: number, data: Partial<Pick<Feedback, "status" | "adminNote" | "updatedAt">>) {
      return db.update(feedback).set(data).where(eq(feedback.id, id)).returning().get();
    }
  }

  // ---------- Seed ----------
  const now = new Date().toISOString();

  const anyUser = db.select().from(users).all();
  if (anyUser.length === 0) {
    db.insert(users)
      .values({
        name: "Fred Li",
        email: "fred@gobi.vc",
        passwordHash: hashPassword(getSeedPassword()),
        role: "admin",
        status: "approved",
      })
      .run();
  }

  const anyPartnership = db.select().from(partnerships).all();
  if (anyPartnership.length === 0) {
    const photosFor = (nameEn: string) => PHOTO_SEED.find((s) => s.nameEn === nameEn)?.photos ?? null;
    for (const p of SEED_PARTNERS) {
      db.insert(partnerships)
        .values({ ...p, photos: photosFor((p as any).nameEn), status: "approved", submittedBy: 1, createdAt: now } as any)
        .run();
    }
  }

  return new SqliteStorage();
}

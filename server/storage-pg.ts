// Postgres storage driver — used when DATABASE_URL is set (Vercel + Neon).
// Serverless-safe: no local filesystem, schema bootstrap + seed run once per cold start.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { usersPg as users, sessionsPg as sessions, partnershipsPg as partnerships, attachmentsPg as attachments, changeRequestsPg as changeRequests, auditLogsPg as auditLogs, feedbackPg as feedback, rdItemsPg as rdItems } from "../shared/schema-pg.js";
import type { User, Partnership, Attachment, ChangeRequest, AuditLog, Feedback, RdItem } from "../shared/schema.js";
import { SEED_PARTNERS } from "./seed-data.js";
import { hashPassword, getSeedPassword, PHOTO_SEED, RD_SEED, type IStorage } from "./storage-common.js";
import { V43_UPGRADES, V43_NEW_PARTNERS } from "./upgrade-v43.js";
import { FRED_TITLE, V45_NEW_PARTNERS } from "./upgrade-v45.js";

const BOOTSTRAP: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    status TEXT NOT NULL DEFAULT 'pending'
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS partnerships (
    id SERIAL PRIMARY KEY,
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
    pic_names JSONB,
    context TEXT,
    partnership_type TEXT,
    start_date TEXT,
    stage TEXT NOT NULL DEFAULT 's1_new',
    collab_level INTEGER NOT NULL DEFAULT 1,
    hall_of_fame INTEGER NOT NULL DEFAULT 0,
    lp_status TEXT NOT NULL DEFAULT 'na',
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    submitted_by INTEGER,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id SERIAL PRIMARY KEY,
    partnership_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    data TEXT NOT NULL,
    uploaded_by INTEGER,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS change_requests (
    id SERIAL PRIMARY KEY,
    partnership_id INTEGER NOT NULL,
    proposed_by INTEGER NOT NULL,
    changes TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    partnership_id INTEGER NOT NULL,
    user_id INTEGER,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    changes TEXT,
    created_at TEXT NOT NULL
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS secret_q1 TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS secret_a1_hash TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS secret_q2 TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS secret_a2_hash TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TEXT`,
  `ALTER TABLE partnerships ADD COLUMN IF NOT EXISTS photos JSONB`,
  `ALTER TABLE partnerships ADD COLUMN IF NOT EXISTS lp_status TEXT NOT NULL DEFAULT 'na'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_ir INTEGER NOT NULL DEFAULT 0`,
  `UPDATE users SET is_ir = 1 WHERE email = 'fred@gobi.vc'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_dev INTEGER NOT NULL DEFAULT 0`,
  `UPDATE users SET is_dev = 1 WHERE email = 'fred@gobi.vc'`,
  `CREATE TABLE IF NOT EXISTS rd_items (
    id SERIAL PRIMARY KEY,
    project TEXT NOT NULL DEFAULT 'Partnership Portal Ecosystem',
    name TEXT NOT NULL,
    details TEXT,
    kind TEXT NOT NULL DEFAULT 'module',
    status TEXT NOT NULL DEFAULT 'planned',
    teammates TEXT NOT NULL DEFAULT '[]',
    start_date TEXT,
    end_date TEXT,
    created_by INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    user_name TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    admin_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  )`,
  // v4.2: backfill example gallery photos for flagship partners (idempotent)
  ...PHOTO_SEED.map(
    (s) => `UPDATE partnerships SET photos = '${JSON.stringify(s.photos)}'::jsonb WHERE name_en = '${s.nameEn.replace(/'/g, "''")}' AND photos IS NULL`,
  ),
  // v4: collaboration level is derived from the stage (single source of truth) — keep legacy rows aligned
  `UPDATE partnerships SET collab_level = CAST(SUBSTR(stage, 2, 1) AS INT) WHERE stage ~ '^s[1-5]_' AND collab_level <> CAST(SUBSTR(stage, 2, 1) AS INT)`,
];

export function createPgStorage(): IStorage {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);
  const db = drizzle(sql);

  // One-time bootstrap per process (cold start): create tables, seed if empty.
  let ready: Promise<void> | null = null;
  function init(): Promise<void> {
    if (!ready) {
      ready = (async () => {
        for (const stmt of BOOTSTRAP) {
          await sql.query(stmt);
        }
        const anyUser = await db.select({ id: users.id }).from(users).limit(1);
        if (anyUser.length === 0) {
          await db.insert(users).values({
            name: "Fred Li",
            email: "fred@gobi.vc",
            passwordHash: hashPassword(getSeedPassword()),
            role: "admin",
            status: "approved",
          });
        }
        const anyPartnership = await db.select({ id: partnerships.id }).from(partnerships).limit(1);
        if (anyPartnership.length === 0) {
          const now = new Date().toISOString();
          const photosFor = (nameEn: string) => PHOTO_SEED.find((s) => s.nameEn === nameEn)?.photos ?? null;
          for (const p of SEED_PARTNERS) {
            await db.insert(partnerships).values({ ...p, photos: photosFor((p as any).nameEn), status: "approved", submittedBy: 1, createdAt: now } as any);
          }
        }
        // v4.3 one-time info upgrade (researched descriptions, PICs, dates, LP statuses)
        const v43Res = await sql.query(`SELECT value FROM meta WHERE key = 'migration_v43_info_upgrade'`);
        const v43Rows: unknown[] = Array.isArray(v43Res) ? v43Res : ((v43Res as any)?.rows ?? []);
        if (v43Rows.length === 0) {
          for (const u of V43_UPGRADES) {
            const sets: string[] = [];
            const vals: unknown[] = [];
            const add = (expr: string, v: unknown) => {
              vals.push(v);
              sets.push(expr.replace("$?", `$${vals.length}`));
            };
            if (u.lpStatus) add("lp_status = $?", u.lpStatus);
            if (u.partnershipType) add("partnership_type = $?", u.partnershipType);
            if (u.startDate) add("start_date = $?", u.startDate);
            if (u.picNames) add("pic_names = $?::jsonb", JSON.stringify(u.picNames));
            if (u.descriptionEn) add("description_en = $?", u.descriptionEn);
            if (u.descriptionCn) add("description_cn = $?", u.descriptionCn);
            if (sets.length === 0) continue;
            vals.push(u.nameEn);
            await sql.query(`UPDATE partnerships SET ${sets.join(", ")} WHERE name_en = $${vals.length}`, vals);
          }
          for (const p of V43_NEW_PARTNERS) {
            const existRes = await sql.query(`SELECT id FROM partnerships WHERE name_en = $1`, [p.nameEn]);
            const existRows: unknown[] = Array.isArray(existRes) ? existRes : ((existRes as any)?.rows ?? []);
            if (existRows.length === 0) {
              await db.insert(partnerships).values({ ...p, status: "approved", submittedBy: 1, createdAt: new Date().toISOString() } as any);
            }
          }
          await sql.query(
            `INSERT INTO meta (key, value) VALUES ('migration_v43_info_upgrade', $1) ON CONFLICT (key) DO NOTHING`,
            [new Date().toISOString()],
          );
        }
        // v4.5 one-time site sync (Fred's role + ecosystem partners from fred-li.vercel.app)
        const v45Res = await sql.query(`SELECT value FROM meta WHERE key = 'migration_v45_site_sync'`);
        const v45Rows: unknown[] = Array.isArray(v45Res) ? v45Res : ((v45Res as any)?.rows ?? []);
        if (v45Rows.length === 0) {
          await sql.query(`UPDATE users SET title = $1 WHERE email = 'fred@gobi.vc'`, [FRED_TITLE]);
          for (const p of V45_NEW_PARTNERS) {
            const existRes = await sql.query(`SELECT id FROM partnerships WHERE name_en = $1`, [p.nameEn]);
            const existRows: unknown[] = Array.isArray(existRes) ? existRes : ((existRes as any)?.rows ?? []);
            if (existRows.length === 0) {
              await db.insert(partnerships).values({ ...p, status: "approved", submittedBy: 1, createdAt: new Date().toISOString() } as any);
            }
          }
          await sql.query(
            `INSERT INTO meta (key, value) VALUES ('migration_v45_site_sync', $1) ON CONFLICT (key) DO NOTHING`,
            [new Date().toISOString()],
          );
        }
        // Seed the R&D planner once, when empty
        const anyRd = await db.select({ id: rdItems.id }).from(rdItems).limit(1);
        if (anyRd.length === 0) {
          for (const item of RD_SEED) {
            await db.insert(rdItems).values(item as any);
          }
        }
      })().catch((err) => {
        ready = null; // allow retry on next request
        throw err;
      });
    }
    return ready;
  }

  class PgStorage implements IStorage {
    async getUser(id: number) {
      await init();
      const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return rows[0] as User | undefined;
    }
    async getUserByEmail(email: string) {
      await init();
      const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
      return rows[0] as User | undefined;
    }
    async createUser(data: {
      name: string; email: string; passwordHash: string; role?: string; status?: string;
      secretQ1?: string | null; secretA1Hash?: string | null; secretQ2?: string | null; secretA2Hash?: string | null;
    }) {
      await init();
      const rows = await db
        .insert(users)
        .values({
          name: data.name,
          email: data.email.toLowerCase(),
          passwordHash: data.passwordHash,
          secretQ1: data.secretQ1 ?? null,
          secretA1Hash: data.secretA1Hash ?? null,
          secretQ2: data.secretQ2 ?? null,
          secretA2Hash: data.secretA2Hash ?? null,
          role: data.role ?? "staff",
          status: data.status ?? "pending",
        })
        .returning();
      return rows[0] as User;
    }
    async listUsers() {
      await init();
      return (await db.select().from(users)) as User[];
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
      await init();
      const rows = await db.update(users).set(data).where(eq(users.id, id)).returning();
      return rows[0] as User | undefined;
    }
    async getUserByResetToken(tokenHash: string) {
      await init();
      const rows = await db.select().from(users).where(eq(users.resetTokenHash, tokenHash)).limit(1);
      return rows[0] as User | undefined;
    }

    async createSession(userId: number) {
      await init();
      const token = randomBytes(32).toString("hex");
      const rows = await db.insert(sessions).values({ token, userId }).returning();
      return rows[0];
    }
    async getSession(token: string) {
      await init();
      const rows = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
      return rows[0];
    }
    async deleteSession(token: string) {
      await init();
      await db.delete(sessions).where(eq(sessions.token, token));
    }

    async listPartnerships() {
      await init();
      return (await db.select().from(partnerships)) as Partnership[];
    }
    async getPartnership(id: number) {
      await init();
      const rows = await db.select().from(partnerships).where(eq(partnerships.id, id)).limit(1);
      return rows[0] as Partnership | undefined;
    }
    async createPartnership(data: Omit<Partnership, "id">) {
      await init();
      const rows = await db.insert(partnerships).values(data as any).returning();
      return rows[0] as Partnership;
    }
    async updatePartnership(id: number, data: Partial<Partnership>) {
      await init();
      const { id: _ignore, ...rest } = data as Partnership;
      const rows = await db.update(partnerships).set(rest as any).where(eq(partnerships.id, id)).returning();
      return rows[0] as Partnership | undefined;
    }
    async listRdItems() {
      await init();
      return (await db.select().from(rdItems)) as RdItem[];
    }
    async getRdItem(id: number) {
      await init();
      const rows = await db.select().from(rdItems).where(eq(rdItems.id, id)).limit(1);
      return rows[0] as RdItem | undefined;
    }
    async createRdItem(data: Omit<RdItem, "id">) {
      await init();
      const rows = await db.insert(rdItems).values(data as any).returning();
      return rows[0] as RdItem;
    }
    async updateRdItem(id: number, data: Partial<RdItem>) {
      await init();
      const { id: _ignore, ...rest } = data as RdItem;
      const rows = await db.update(rdItems).set(rest as any).where(eq(rdItems.id, id)).returning();
      return rows[0] as RdItem | undefined;
    }
    async deleteRdItem(id: number) {
      await init();
      await db.delete(rdItems).where(eq(rdItems.id, id));
    }

    async deletePartnership(id: number) {
      await init();
      await db.delete(partnerships).where(eq(partnerships.id, id));
      await db.delete(attachments).where(eq(attachments.partnershipId, id));
      await db.update(partnerships).set({ parentId: null }).where(eq(partnerships.parentId, id));
    }

    async listAttachmentMeta(partnershipId: number) {
      await init();
      return await db
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
        .where(eq(attachments.partnershipId, partnershipId));
    }
    async getAttachment(id: number) {
      await init();
      const rows = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
      return rows[0] as Attachment | undefined;
    }
    async createAttachment(data: Omit<Attachment, "id">) {
      await init();
      const rows = await db.insert(attachments).values(data as any).returning();
      const { data: _d, ...meta } = rows[0] as Attachment;
      return meta;
    }
    async deleteAttachment(id: number) {
      await init();
      await db.delete(attachments).where(eq(attachments.id, id));
    }

    async createAuditLog(data: Omit<AuditLog, "id">) {
      await init();
      const rows = await db.insert(auditLogs).values(data as any).returning();
      return rows[0] as AuditLog;
    }
    async listAuditLogs(partnershipId: number) {
      await init();
      return (await db.select().from(auditLogs).where(eq(auditLogs.partnershipId, partnershipId))) as AuditLog[];
    }

    async listChangeRequests() {
      await init();
      return (await db.select().from(changeRequests)) as ChangeRequest[];
    }
    async listChangeRequestsByUser(userId: number) {
      await init();
      return (await db.select().from(changeRequests).where(eq(changeRequests.proposedBy, userId))) as ChangeRequest[];
    }
    async getChangeRequest(id: number) {
      await init();
      const rows = await db.select().from(changeRequests).where(eq(changeRequests.id, id)).limit(1);
      return rows[0] as ChangeRequest | undefined;
    }
    async createChangeRequest(data: Omit<ChangeRequest, "id">) {
      await init();
      const rows = await db.insert(changeRequests).values(data as any).returning();
      return rows[0] as ChangeRequest;
    }
    async updateChangeRequestStatus(id: number, status: string) {
      await init();
      const rows = await db.update(changeRequests).set({ status }).where(eq(changeRequests.id, id)).returning();
      return rows[0] as ChangeRequest | undefined;
    }

    async listFeedback() {
      await init();
      return (await db.select().from(feedback)) as Feedback[];
    }
    async listFeedbackByUser(userId: number) {
      await init();
      return (await db.select().from(feedback).where(eq(feedback.userId, userId))) as Feedback[];
    }
    async createFeedback(data: Omit<Feedback, "id">) {
      await init();
      const rows = await db.insert(feedback).values(data as any).returning();
      return rows[0] as Feedback;
    }
    async updateFeedback(id: number, data: Partial<Pick<Feedback, "status" | "adminNote" | "updatedAt">>) {
      await init();
      const rows = await db.update(feedback).set(data).where(eq(feedback.id, id)).returning();
      return rows[0] as Feedback | undefined;
    }
  }

  return new PgStorage();
}

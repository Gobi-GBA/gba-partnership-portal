// Postgres storage driver — used when DATABASE_URL is set (Vercel + Neon).
// Serverless-safe: no local filesystem, schema bootstrap + seed run once per cold start.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { usersPg as users, sessionsPg as sessions, partnershipsPg as partnerships, attachmentsPg as attachments, changeRequestsPg as changeRequests } from "../shared/schema-pg.js";
import type { User, Partnership, Attachment, ChangeRequest } from "../shared/schema.js";
import { SEED_PARTNERS } from "./seed-data.js";
import { hashPassword, getSeedPassword, type IStorage } from "./storage-common.js";

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
          for (const p of SEED_PARTNERS) {
            await db.insert(partnerships).values({ ...p, status: "approved", submittedBy: 1, createdAt: now } as any);
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
    async createUser(data: { name: string; email: string; passwordHash: string; role?: string; status?: string }) {
      await init();
      const rows = await db
        .insert(users)
        .values({
          name: data.name,
          email: data.email.toLowerCase(),
          passwordHash: data.passwordHash,
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
    async updateUser(id: number, data: Partial<Pick<User, "status" | "role">>) {
      await init();
      const rows = await db.update(users).set(data).where(eq(users.id, id)).returning();
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
  }

  return new PgStorage();
}

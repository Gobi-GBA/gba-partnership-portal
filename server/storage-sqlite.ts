import { users, sessions, partnerships, attachments, changeRequests, auditLogs, feedback, rdItems, advisors, advisorRoles } from "../shared/schema.js";
import type { User, Partnership, Attachment, ChangeRequest, AuditLog, Feedback, RdItem, Advisor, AdvisorRole } from "../shared/schema.js";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { SEED_PARTNERS } from "./seed-data.js";
import { hashPassword, getSeedPassword, PHOTO_SEED, RD_SEED, type IStorage } from "./storage-common.js";
import { V43_UPGRADES, V43_NEW_PARTNERS } from "./upgrade-v43.js";
import { FRED_TITLE, V45_NEW_PARTNERS } from "./upgrade-v45.js";

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
  lp_status TEXT NOT NULL DEFAULT 'na',
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
  ensureColumn("partnerships", "lp_status", "lp_status TEXT NOT NULL DEFAULT 'na'");
  ensureColumn("partnerships", "is_domain_knowledge_partner", "is_domain_knowledge_partner INTEGER NOT NULL DEFAULT 0");
  // Advisors (v5.0)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS advisors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_cn TEXT,
    advisor_type TEXT NOT NULL DEFAULT 'honourary_advisor',
    track TEXT NOT NULL DEFAULT 'industry',
    pillar TEXT NOT NULL DEFAULT 'other',
    emails TEXT,
    domains TEXT,
    background TEXT,
    photo_url TEXT,
    photo_thumb_url TEXT,
    profile_url TEXT,
    linkedin_url TEXT,
    gobi_pics TEXT,
    cohort TEXT,
    engagement TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    submitted_by INTEGER,
    created_at TEXT NOT NULL
  )`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS advisor_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advisor_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    organization TEXT,
    partnership_id INTEGER,
    is_primary INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`);
  ensureColumn("users", "is_ir", "is_ir INTEGER NOT NULL DEFAULT 0");
  // Grant IR membership to the seed admin (idempotent)
  sqlite.prepare(`UPDATE users SET is_ir = 1 WHERE email = 'fred@gobi.vc'`).run();
  ensureColumn("users", "is_dev", "is_dev INTEGER NOT NULL DEFAULT 0");
  // The seed admin is also a developer (idempotent)
  sqlite.prepare(`UPDATE users SET is_dev = 1 WHERE email = 'fred@gobi.vc'`).run();
  // R&D planner table (developer + admin only)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS rd_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL DEFAULT 'Partnership Portal Ecosystem',
    name TEXT NOT NULL,
    details TEXT,
    kind TEXT NOT NULL DEFAULT 'module',
    status TEXT NOT NULL DEFAULT 'planned',
    teammates TEXT NOT NULL DEFAULT '[]',
    start_date TEXT,
    end_date TEXT,
    created_by INTEGER
  )`);
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

    async listRdItems() {
      return db.select().from(rdItems).all();
    }
    async getRdItem(id: number) {
      return db.select().from(rdItems).where(eq(rdItems.id, id)).get();
    }
    async createRdItem(data: Omit<RdItem, "id">) {
      return db.insert(rdItems).values(data).returning().get();
    }
    async updateRdItem(id: number, data: Partial<RdItem>) {
      const { id: _ignore, ...rest } = data as RdItem;
      return db.update(rdItems).set(rest).where(eq(rdItems.id, id)).returning().get();
    }
    async deleteRdItem(id: number) {
      db.delete(rdItems).where(eq(rdItems.id, id)).run();
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

    async listAdvisors() {
      return db.select().from(advisors).all();
    }
    async getAdvisor(id: number) {
      return db.select().from(advisors).where(eq(advisors.id, id)).get();
    }
    async createAdvisor(data: Omit<Advisor, "id">) {
      return db.insert(advisors).values(data).returning().get();
    }
    async updateAdvisor(id: number, data: Partial<Advisor>) {
      return db.update(advisors).set(data).where(eq(advisors.id, id)).returning().get();
    }
    async deleteAdvisor(id: number) {
      db.delete(advisorRoles).where(eq(advisorRoles.advisorId, id)).run();
      db.delete(advisors).where(eq(advisors.id, id)).run();
    }
    async listAdvisorRoles() {
      return db.select().from(advisorRoles).all();
    }
    async setAdvisorRoles(advisorId: number, roles: Omit<AdvisorRole, "id" | "advisorId">[]) {
      db.delete(advisorRoles).where(eq(advisorRoles.advisorId, advisorId)).run();
      if (roles.length === 0) return [];
      return db.insert(advisorRoles).values(roles.map((r) => ({ ...r, advisorId }))).returning().all();
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

  // v4.3 one-time info upgrade (researched descriptions, PICs, dates, LP statuses)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`);
  const v43Done = sqlite.prepare(`SELECT value FROM meta WHERE key = 'migration_v43_info_upgrade'`).get();
  if (!v43Done) {
    for (const u of V43_UPGRADES) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (u.lpStatus) { sets.push("lp_status = ?"); vals.push(u.lpStatus); }
      if (u.partnershipType) { sets.push("partnership_type = ?"); vals.push(u.partnershipType); }
      if (u.startDate) { sets.push("start_date = ?"); vals.push(u.startDate); }
      if (u.picNames) { sets.push("pic_names = ?"); vals.push(JSON.stringify(u.picNames)); }
      if (u.descriptionEn) { sets.push("description_en = ?"); vals.push(u.descriptionEn); }
      if (u.descriptionCn) { sets.push("description_cn = ?"); vals.push(u.descriptionCn); }
      if (sets.length === 0) continue;
      sqlite.prepare(`UPDATE partnerships SET ${sets.join(", ")} WHERE name_en = ?`).run(...vals, u.nameEn);
    }
    for (const p of V43_NEW_PARTNERS) {
      const exists = sqlite.prepare(`SELECT id FROM partnerships WHERE name_en = ?`).get(p.nameEn);
      if (!exists) {
        db.insert(partnerships)
          .values({ ...p, status: "approved", submittedBy: 1, createdAt: new Date().toISOString() } as any)
          .run();
      }
    }
    sqlite
      .prepare(`INSERT INTO meta (key, value) VALUES ('migration_v43_info_upgrade', ?)`)
      .run(new Date().toISOString());
  }

  // v4.5 one-time site sync (Fred's role + ecosystem partners from fred-li.vercel.app)
  const v45Done = sqlite.prepare(`SELECT value FROM meta WHERE key = 'migration_v45_site_sync'`).get();
  if (!v45Done) {
    sqlite.prepare(`UPDATE users SET title = ? WHERE email = 'fred@gobi.vc'`).run(FRED_TITLE);
    for (const p of V45_NEW_PARTNERS) {
      const exists = sqlite.prepare(`SELECT id FROM partnerships WHERE name_en = ?`).get(p.nameEn);
      if (!exists) {
        db.insert(partnerships)
          .values({ ...p, status: "approved", submittedBy: 1, createdAt: new Date().toISOString() } as any)
          .run();
      }
    }
    sqlite
      .prepare(`INSERT INTO meta (key, value) VALUES ('migration_v45_site_sync', ?)`)
      .run(new Date().toISOString());
  }

  // v5.0 one-time migration: org advisors join the partner list as domain knowledge partners
  const v50Done = sqlite.prepare(`SELECT value FROM meta WHERE key = 'migration_v50_advisors'`).get();
  if (!v50Done) {
    const esri = sqlite.prepare(`SELECT id FROM partnerships WHERE name_en LIKE '%Esri%'`).get();
    if (!esri) {
      db.insert(partnerships)
        .values({
          nameEn: "Esri China (HK)",
          nameCn: "Esri中国（香港）",
          category: "corporate",
          region: "hongkong",
          website: "https://www.esrichina.hk",
          logoUrl: "https://www.google.com/s2/favicons?domain=esrichina.hk&sz=128",
          descriptionEn: "Exclusive distributor of Esri ArcGIS in Hong Kong — geospatial and GIS domain knowledge partner of the Gobi Advisory Network.",
          descriptionCn: "香港 Esri ArcGIS 独家代理——戈壁顾问网络的地理空间与 GIS 领域知识伙伴。",
          partnershipType: "Domain knowledge partner",
          stage: "s2_engaged",
          collabLevel: 2,
          isDomainKnowledgePartner: 1,
          status: "approved",
          submittedBy: 1,
          createdAt: new Date().toISOString(),
        } as any)
        .run();
    } else {
      sqlite.prepare(`UPDATE partnerships SET is_domain_knowledge_partner = 1 WHERE name_en LIKE '%Esri%'`).run();
    }
    sqlite.prepare(`UPDATE partnerships SET is_domain_knowledge_partner = 1 WHERE name_en = 'OASA'`).run();
    sqlite.prepare(`INSERT INTO meta (key, value) VALUES ('migration_v50_advisors', ?)`).run(new Date().toISOString());
  }

  // Seed the R&D planner once, when empty
  const rdCount = sqlite.prepare(`SELECT COUNT(*) AS c FROM rd_items`).get() as { c: number };
  if (rdCount.c === 0) {
    for (const item of RD_SEED) {
      db.insert(rdItems).values(item).run();
    }
  }

  return new SqliteStorage();
}

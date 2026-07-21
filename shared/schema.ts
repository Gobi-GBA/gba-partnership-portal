import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---------- Users ----------
export const ROLES = ["admin", "staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const LP_STATUSES = ["na", "target", "lp"] as const;
export type LpStatus = (typeof LP_STATUSES)[number];

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("staff"), // 'admin' | 'staff' | 'viewer'
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  title: text("title"), // job title, editable by the user
  avatarUrl: text("avatar_url"), // profile photo (URL or data URI)
  isIr: integer("is_ir").notNull().default(0), // 0 | 1 — IR team member (can see LP status)
  isDev: integer("is_dev").notNull().default(0), // 0 | 1 — Developer (can see the R&D planner)
  secretQ1: text("secret_q1"), // secret question id (see SECRET_QUESTIONS)
  secretA1Hash: text("secret_a1_hash"),
  secretQ2: text("secret_q2"),
  secretA2Hash: text("secret_a2_hash"),
  resetTokenHash: text("reset_token_hash"), // sha256 of the emailed reset token
  resetExpires: text("reset_expires"), // ISO timestamp
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  passwordHash: true,
  role: true,
  status: true,
  secretQ1: true,
  secretA1Hash: true,
  secretQ2: true,
  secretA2Hash: true,
  resetTokenHash: true,
  resetExpires: true,
}).extend({
  password: z.string().min(6),
  secretQ1: z.string().min(1).max(40),
  secretA1: z.string().min(1).max(120),
  secretQ2: z.string().min(1).max(40),
  secretA2: z.string().min(1).max(120),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type SafeUser = Omit<
  User,
  "passwordHash" | "secretA1Hash" | "secretA2Hash" | "resetTokenHash" | "resetExpires"
>;

// Profile fields a user may edit about themselves
export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  title: z.string().max(120).nullable().optional(),
  avatarUrl: z.string().max(400_000).nullable().optional(), // allows small data URIs
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

// ---------- Sessions (bearer tokens; cookies are blocked in sandboxed iframes) ----------
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
});

export type Session = typeof sessions.$inferSelect;

// ---------- R&D Planner (developer + admin only) ----------
// The ecosystem is the big project; modules (e.g. Advisors), functions,
// agents and integrations are items placed on a date timeline.
export const RD_STATUSES = ["planned", "in_progress", "testing", "done", "paused"] as const;
export type RdStatus = (typeof RD_STATUSES)[number];

export const RD_KINDS = ["module", "function", "agent", "integration", "other"] as const;
export type RdKind = (typeof RD_KINDS)[number];

export const rdItems = sqliteTable("rd_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  project: text("project").notNull().default("Partnership Portal Ecosystem"), // big project / swimlane
  name: text("name").notNull(),
  details: text("details"),
  kind: text("kind").notNull().default("module"), // 'module' | 'function' | 'agent' | 'integration' | 'other'
  status: text("status").notNull().default("planned"), // see RD_STATUSES
  teammates: text("teammates").notNull().default("[]"), // JSON string[] of teammate names
  startDate: text("start_date"), // YYYY-MM-DD
  endDate: text("end_date"), // YYYY-MM-DD (target)
  createdBy: integer("created_by"),
});

export type RdItem = typeof rdItems.$inferSelect;

// API input shape — teammates travel as a real array and are serialized server-side
export const rdItemInputSchema = z.object({
  project: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  details: z.string().max(2000).nullable().optional(),
  kind: z.enum(RD_KINDS).default("module"),
  status: z.enum(RD_STATUSES).default("planned"),
  teammates: z.array(z.string().min(1).max(60)).max(12).default([]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type RdItemInput = z.infer<typeof rdItemInputSchema>;

// ---------- Partnerships ----------
// Pipeline: 01 New/Target → 02 Engaged → 03 MOU/Agreement → 04 Progressive → 05 Strategic
export const STAGES = ["s1_new", "s2_engaged", "s3_agreement", "s4_progressive", "s5_strategic"] as const;

export const CATEGORIES = [
  "university",  // 高校
  "corporate",   // 企业
  "government",  // 政府机构
  "investor",    // 投资机构
  "accelerator", // 加速器/园区
  "research",    // 科研院所
  "media",       // 媒体
  "ecosystem",   // 生态伙伴 (e.g. OASA space tech)
  "other",       // 其他
] as const;

// Territory-level regions (specific), ordered with Gobi office regions first.
// Grouped under macro-regions below (best-practice two-layer taxonomy).
export const REGIONS = [
  "hongkong",   // 香港 (Gobi office)
  "mainland",   // 中国内地 (Gobi office)
  "taiwan",     // 台湾
  "macau",      // 澳门
  "singapore",  // 新加坡 (Gobi office)
  "malaysia",   // 马来西亚 (Gobi office)
  "indonesia",  // 印度尼西亚 (Gobi office)
  "vietnam",    // 越南 (Gobi office)
  "philippines",// 菲律宾 (Gobi office)
  "japan",      // 日本
  "korea",      // 韩国
  "pakistan",   // 巴基斯坦 (Gobi office)
  "global",     // 全球 (undefined / other)
] as const;

// Macro-regions (broad) — the top layer of the two-layer taxonomy.
export const MACRO_REGIONS = [
  "greater_china",   // 大中华区: HK, Mainland, Taiwan, Macau
  "southeast_asia",  // 东南亚: Singapore, Malaysia, Indonesia, Vietnam, Philippines
  "northeast_asia",  // 东北亚: Japan, Korea
  "south_asia",      // 南亚: Pakistan
  "global",          // 全球: undefined / other
] as const;

// Maps each territory to its macro-region.
export const REGION_TO_MACRO: Record<(typeof REGIONS)[number], (typeof MACRO_REGIONS)[number]> = {
  hongkong: "greater_china",
  mainland: "greater_china",
  taiwan: "greater_china",
  macau: "greater_china",
  singapore: "southeast_asia",
  malaysia: "southeast_asia",
  indonesia: "southeast_asia",
  vietnam: "southeast_asia",
  philippines: "southeast_asia",
  japan: "northeast_asia",
  korea: "northeast_asia",
  pakistan: "south_asia",
  global: "global",
};

// Territories grouped by macro-region, in display order.
export const MACRO_TO_REGIONS: Record<(typeof MACRO_REGIONS)[number], (typeof REGIONS)[number][]> = {
  greater_china: ["hongkong", "mainland", "taiwan", "macau"],
  southeast_asia: ["singapore", "malaysia", "indonesia", "vietnam", "philippines"],
  northeast_asia: ["japan", "korea"],
  south_asia: ["pakistan"],
  global: ["global"],
};

export const partnerships = sqliteTable("partnerships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nameEn: text("name_en").notNull(),
  nameCn: text("name_cn"),
  category: text("category").notNull().default("other"),
  region: text("region").notNull().default("hongkong"),
  parentId: integer("parent_id"), // sub-entity layer, e.g. HKUMed under HKU
  logoUrl: text("logo_url"),
  website: text("website"),
  descriptionEn: text("description_en"),
  descriptionCn: text("description_cn"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  picName: text("pic_name"), // legacy single PIC (kept for migration)
  picNames: text("pic_names", { mode: "json" }).$type<string[]>(), // Gobi relationship PICs (multiple)
  context: text("context"), // narrative background, e.g. from reports / docs
  partnershipType: text("partnership_type"), // free text, e.g. "Joint fund", "Deal flow MOU"
  startDate: text("start_date"), // ISO date string
  photos: text("photos", { mode: "json" }).$type<string[]>(), // gallery photo URLs (carousel)
  stage: text("stage").notNull().default("s1_new"),
  collabLevel: integer("collab_level").notNull().default(1), // 1-5
  hallOfFame: integer("hall_of_fame").notNull().default(0), // 0 | 1
  isDomainKnowledgePartner: integer("is_domain_knowledge_partner").notNull().default(0), // 0 | 1 — org serves as a domain knowledge partner in the advisory network
  lpStatus: text("lp_status").notNull().default("na"), // 'na' | 'target' | 'lp' — visible to IR team only
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  submittedBy: integer("submitted_by"),
  createdAt: text("created_at").notNull(),
});

export const insertPartnershipSchema = createInsertSchema(partnerships).omit({
  id: true,
  status: true,
  submittedBy: true,
  createdAt: true,
}).extend({
  nameEn: z.string().min(1),
  stage: z.enum(STAGES),
  category: z.enum(CATEGORIES),
  region: z.enum(REGIONS),
  collabLevel: z.number().int().min(1).max(5),
  parentId: z.number().int().nullable().optional(),
  picNames: z.array(z.string()).max(8).nullable().optional(),
  photos: z.array(z.string()).max(12).nullable().optional(),
  isDomainKnowledgePartner: z.number().int().min(0).max(1).optional(),
});

export type InsertPartnership = z.infer<typeof insertPartnershipSchema>;
export type Partnership = typeof partnerships.$inferSelect;

export type Stage = (typeof STAGES)[number];
export type Category = (typeof CATEGORIES)[number];
export type Region = (typeof REGIONS)[number];
export type MacroRegion = (typeof MACRO_REGIONS)[number];

// ---------- Advisors (v5.0 — Gobi Advisory Network) ----------
// People-only database. Organizations that act as advisors (e.g. Esri China (HK),
// OASA) live in the partnerships table flagged with isDomainKnowledgePartner.
export const ADVISOR_ROLE_TYPES = [
  "honourary_advisor",       // 荣誉顾问
  "domain_knowledge_partner",// 领域知识伙伴 (individual acting for a partner org)
  "mentor",                  // 导师
] as const;
export type AdvisorRoleType = (typeof ADVISOR_ROLE_TYPES)[number];

export const ADVISOR_TRACKS = ["academic", "industry", "entrepreneur", "hybrid"] as const;
export type AdvisorTrack = (typeof ADVISOR_TRACKS)[number];

export const PILLARS = ["healthcare", "ai", "industry40", "esg", "spacetech", "consumer", "other"] as const;
export type Pillar = (typeof PILLARS)[number];

export const advisors = sqliteTable("advisors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  nameCn: text("name_cn"), // Chinese name, e.g. 萬鈞
  advisorType: text("advisor_type").notNull().default("honourary_advisor"), // see ADVISOR_ROLE_TYPES
  track: text("track").notNull().default("industry"), // academic | industry | entrepreneur | hybrid
  pillar: text("pillar").notNull().default("other"), // investment pillar, see PILLARS
  emails: text("emails", { mode: "json" }).$type<string[]>(), // staff-visible only
  domains: text("domains"), // expert domains, free text
  background: text("background"), // detailed background, multi-line
  photoUrl: text("photo_url"), // HD portrait (data URI or URL)
  photoThumbUrl: text("photo_thumb_url"), // small thumbnail for list views
  profileUrl: text("profile_url"), // official profile page
  linkedinUrl: text("linkedin_url"),
  gobiPics: text("gobi_pics", { mode: "json" }).$type<string[]>(), // Gobi PIC names
  cohort: text("cohort"), // e.g. "2024", "2025"
  engagement: text("engagement"), // status & history of engagement — staff-visible only
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  submittedBy: integer("submitted_by"),
  createdAt: text("created_at").notNull(),
});

export type Advisor = typeof advisors.$inferSelect;

// One person may hold multiple jobs/roles; each role can link to a partner org.
export const advisorRoles = sqliteTable("advisor_roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  advisorId: integer("advisor_id").notNull(),
  title: text("title").notNull(), // e.g. "Chair Professor of Transplant Oncology"
  organization: text("organization"), // free-text org name
  partnershipId: integer("partnership_id"), // optional link into the partner list
  isPrimary: integer("is_primary").notNull().default(0), // 0 | 1 — headline role
  sortOrder: integer("sort_order").notNull().default(0),
});

export type AdvisorRole = typeof advisorRoles.$inferSelect;

export const advisorRoleInputSchema = z.object({
  title: z.string().min(1).max(300),
  organization: z.string().max(200).nullable().optional(),
  partnershipId: z.number().int().nullable().optional(),
  isPrimary: z.number().int().min(0).max(1).default(0),
});
export type AdvisorRoleInput = z.infer<typeof advisorRoleInputSchema>;

export const advisorInputSchema = z.object({
  name: z.string().min(1).max(120),
  nameCn: z.string().max(60).nullable().optional(),
  advisorType: z.enum(ADVISOR_ROLE_TYPES).default("honourary_advisor"),
  track: z.enum(ADVISOR_TRACKS).default("industry"),
  pillar: z.enum(PILLARS).default("other"),
  emails: z.array(z.string().max(120)).max(6).nullable().optional(),
  domains: z.string().max(2000).nullable().optional(),
  background: z.string().max(8000).nullable().optional(),
  photoUrl: z.string().max(600_000).nullable().optional(), // HD data URI (~450KB max)
  photoThumbUrl: z.string().max(80_000).nullable().optional(), // thumb data URI
  profileUrl: z.string().max(400).nullable().optional(),
  linkedinUrl: z.string().max(400).nullable().optional(),
  gobiPics: z.array(z.string().max(60)).max(8).nullable().optional(),
  cohort: z.string().max(20).nullable().optional(),
  engagement: z.string().max(4000).nullable().optional(),
  roles: z.array(advisorRoleInputSchema).max(12).default([]),
});
export type AdvisorInput = z.infer<typeof advisorInputSchema>;

// Advisor enriched with roles for API responses
export type AdvisorWithRoles = Advisor & { roles: AdvisorRole[] };

// ---------- Attachments (stored in SQLite so they survive redeploys) ----------
export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partnershipId: integer("partnership_id").notNull(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  data: text("data").notNull(), // base64
  uploadedBy: integer("uploaded_by"),
  createdAt: text("created_at").notNull(),
});

export type Attachment = typeof attachments.$inferSelect;
export type AttachmentMeta = Omit<Attachment, "data">;

export const attachmentInputSchema = z.object({
  name: z.string().min(1),
  mime: z.string().min(1),
  data: z.string().min(1), // base64
});
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;

// ---------- Change requests (staff propose edits; admin approves) ----------
export const changeRequests = sqliteTable("change_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partnershipId: integer("partnership_id").notNull(),
  proposedBy: integer("proposed_by").notNull(),
  changes: text("changes").notNull(), // JSON: partial partnership fields
  note: text("note"),
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  createdAt: text("created_at").notNull(),
});

export type ChangeRequest = typeof changeRequests.$inferSelect;

export const changeRequestInputSchema = z.object({
  partnershipId: z.number().int(),
  changes: insertPartnershipSchema.partial(),
  note: z.string().optional(),
});
export type ChangeRequestInput = z.infer<typeof changeRequestInputSchema>;

// ---------- Audit log (who changed what, per partnership) ----------
export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partnershipId: integer("partnership_id").notNull(),
  userId: integer("user_id"),
  userName: text("user_name").notNull(),
  action: text("action").notNull(), // 'create' | 'update' | 'approve' | 'reject' | 'delete' | 'change_request' | 'change_approved' | 'change_rejected'
  changes: text("changes"), // JSON: { field: newValue } summary of what changed
  createdAt: text("created_at").notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type AuditAction = "create" | "update" | "approve" | "reject" | "delete" | "change_request" | "change_approved" | "change_rejected";

// ---------- Feedback / system requests ----------
export const FEEDBACK_STATUSES = ["open", "in_progress", "solved", "declined"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  userName: text("user_name").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // FEEDBACK_STATUSES
  adminNote: text("admin_note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export type Feedback = typeof feedback.$inferSelect;

export const feedbackInputSchema = z.object({
  message: z.string().min(3).max(2000),
});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

export const feedbackUpdateSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  adminNote: z.string().max(2000).nullable().optional(),
});

// ---------- Admin: create account directly ----------
export const adminCreateUserSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(["viewer", "staff", "admin"]),
});
export type AdminCreateUser = z.infer<typeof adminCreateUserSchema>;

// ---------- Gobi staff (relationship PIC directory, from gobi.vc/team) ----------
export interface GobiStaff {
  name: string;
  title: string;
  office: string;
}

export const GOBI_OFFICES = ["Hong Kong (SAR)", "Mainland China", "Malaysia", "Singapore", "Philippines", "Vietnam", "Indonesia", "Pakistan", "Other"] as const;

export const GOBI_STAFF: GobiStaff[] = [
  { name: "Thomas G. Tsao", title: "Co-founder and Chair", office: "Malaysia" },
  { name: "Chibo Tang", title: "Managing Partner", office: "Hong Kong (SAR)" },
  { name: "Dan Chong", title: "Managing Partner", office: "Singapore" },
  { name: "Jamaludin Bujang", title: "Managing Partner", office: "Malaysia" },
  { name: "Soo Wei Shaw", title: "Partner", office: "Singapore" },
  { name: "Ali Mukhtar", title: "Partner, General", office: "Pakistan" },
  { name: "Naiel Ikram", title: "Partner", office: "Pakistan" },
  { name: "Jason Gaisano", title: "Managing Partner", office: "Philippines" },
  { name: "Carlo Chen-Delantar", title: "Partner, ESG and Circular Economy", office: "Philippines" },
  { name: "Ken Ngo", title: "Partner", office: "Philippines" },
  { name: "Jong Eon Lee", title: "Partner", office: "Malaysia" },
  { name: "Nhat Minh Phan", title: "Partner", office: "Vietnam" },
  { name: "Jason Chen", title: "Chief Operating Officer, Group / Managing Director", office: "Hong Kong (SAR)" },
  { name: "Hisham Ibrahim", title: "Managing Director", office: "Malaysia" },
  { name: "Suryono Darnor", title: "Advisor", office: "Malaysia" },
  { name: "Angel Chau", title: "Chief Financial Officer", office: "Hong Kong (SAR)" },
  { name: "Fred Li", title: "Managing Director & Head of University Ventures", office: "Hong Kong (SAR)" },
  { name: "Renee Pan", title: "Managing Director", office: "Mainland China" },
  { name: "Khairil Abdullah", title: "Advisor", office: "Malaysia" },
  { name: "Wai Kit Lau", title: "Advisor", office: "Hong Kong (SAR)" },
  { name: "Kay-Mok Ku", title: "Senior Partner", office: "Singapore" },
  { name: "Erdem Dereli", title: "Venture Partner", office: "Türkiye" },
  { name: "Juliet Zhu", title: "Venture Partner", office: "United Arab Emirates" },
  { name: "Kengo Suzuki", title: "Venture Partner", office: "Japan" },
  { name: "Arya Masagung", title: "Venture Partner", office: "Singapore" },
  { name: "Abraiz Abdullah", title: "Analyst, Investment", office: "Pakistan" },
  { name: "Adlil Zulaikha", title: "Manager, Marketing", office: "Malaysia" },
  { name: "Adrian Kurnia", title: "Director, Investment", office: "Indonesia" },
  { name: "Ameen Iskandar", title: "Executive, IT Operations and Development", office: "Malaysia" },
  { name: "Angie Lam", title: "Director, Fund Administration and Compliance", office: "Malaysia" },
  { name: "Berlin Chen", title: "Senior Manager, Ecosystem", office: "Mainland China" },
  { name: "Bohan Zheng", title: "Senior Director, Investment", office: "Mainland China" },
  { name: "Bowie Tan", title: "Manager, Finance", office: "Hong Kong (SAR)" },
  { name: "Carol Tang", title: "Director, Finance", office: "Hong Kong (SAR)" },
  { name: "Catherine Shu", title: "Head, Content", office: "Taiwan" },
  { name: "Charlie Tsui", title: "Administrative Assistant", office: "Hong Kong (SAR)" },
  { name: "Dora Goh", title: "Director, Finance", office: "Malaysia" },
  { name: "Elena Chen", title: "Senior Manager, Office", office: "Mainland China" },
  { name: "Eunice Lam", title: "Senior Manager, Corporate Development", office: "Hong Kong (SAR)" },
  { name: "Faiez Akmal", title: "Manager, Investment", office: "Pakistan" },
  { name: "Gerald Ko", title: "Senior Manager, Investment", office: "Malaysia" },
  { name: "Hazel Wong", title: "Director, Public Relations", office: "Hong Kong (SAR)" },
  { name: "Hing Cheng", title: "Senior Executive Director, Corporate Development", office: "Hong Kong (SAR)" },
  { name: "Hung Cao", title: "Analyst, Investment", office: "Vietnam" },
  { name: "Imran Hafiz", title: "Director, Investment", office: "Malaysia" },
  { name: "Ivy Callista", title: "Manager, Investment", office: "Indonesia" },
  { name: "Jackson Chung", title: "Senior Manager, Investment", office: "Hong Kong (SAR)" },
  { name: "Jasdeep Maan", title: "Senior Manager, Investment", office: "Malaysia" },
  { name: "Jia Shern Neoh", title: "Manager, Legal", office: "Malaysia" },
  { name: "Jimmy Ng", title: "Senior Director, Group Strategy", office: "Hong Kong (SAR)" },
  { name: "Justine Ngo", title: "Associate, Value Creation", office: "Philippines" },
  { name: "Kelly Wong", title: "Manager, Finance", office: "Malaysia" },
  { name: "Kashaf Jamal", title: "Vice President, Investment", office: "Pakistan" },
  { name: "Katie Gan", title: "Lead, People and Admin", office: "Malaysia" },
  { name: "Kean Zen Liew", title: "Director, Investment", office: "Singapore" },
  { name: "Kennith So", title: "Director, Programme", office: "Hong Kong (SAR)" },
  { name: "Lain Yao", title: "Director, Investment", office: "Mainland China" },
  { name: "Lee Boon Ng", title: "", office: "Malaysia" },
  { name: "Leo Chen", title: "Manager, Investment and Research", office: "Mainland China" },
  { name: "Miranda Cheng", title: "Senior Director, Compliance", office: "Hong Kong (SAR)" },
  { name: "Mon Liang", title: "Assistant Manager, Project", office: "Mainland China" },
  { name: "Muhammad Ali Taufiq", title: "Vice President, Investment", office: "Pakistan" },
  { name: "Navvin Kumar", title: "Senior Director, Investment", office: "Malaysia" },
  { name: "Niccolo “Nuki” Almario", title: "Associate, Value Creation", office: "Philippines" },
  { name: "Phoebe Fontanilla", title: "Senior Manager, Investment", office: "Philippines" },
  { name: "Raof Zainuddin", title: "Director, Marketing and Communications", office: "Malaysia" },
  { name: "Rosa Dai", title: "Manager, Investment", office: "Hong Kong (SAR)" },
  { name: "Sandy Chong", title: "Senior Director, Administration / Head of Treasury", office: "Hong Kong (SAR)" },
  { name: "Sarah Jin", title: "General Counsel", office: "Hong Kong (SAR)" },
  { name: "Shaohu Zhou", title: "Manager, Investment and Research", office: "Mainland China" },
  { name: "Shirley Gong", title: "Executive, Finance", office: "Hong Kong (SAR)" },
  { name: "Syafiq Aqmar", title: "Director, Investment", office: "Malaysia" },
  { name: "Zayd Azman", title: "Senior Manager, Investment", office: "Malaysia" },
  { name: "Zuain Mohd Azni", title: "Senior Manager, Value Creation", office: "Malaysia" },
];

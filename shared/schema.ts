import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---------- Users ----------
export const ROLES = ["admin", "staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("staff"), // 'admin' | 'staff' | 'viewer'
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  passwordHash: true,
  role: true,
  status: true,
}).extend({
  password: z.string().min(6),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type SafeUser = Omit<User, "passwordHash">;

// ---------- Sessions (bearer tokens; cookies are blocked in sandboxed iframes) ----------
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
});

export type Session = typeof sessions.$inferSelect;

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

// Domicile regions — Gobi office regions ranked first
export const REGIONS = [
  "hongkong",   // 香港 (Gobi office)
  "mainland",   // 中国内地 (Gobi office)
  "malaysia",   // 马来西亚 (Gobi office)
  "singapore",  // 新加坡 (Gobi office)
  "philippines",// 菲律宾 (Gobi office)
  "vietnam",    // 越南 (Gobi office)
  "indonesia",  // 印度尼西亚 (Gobi office)
  "pakistan",   // 巴基斯坦 (Gobi office)
  "japan",      // 日本
  "korea",      // 韩国
  "taiwan",     // 台湾
  "macau",      // 澳门
  "sea",        // 东南亚（其他）
  "international", // 国际
] as const;

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
  stage: text("stage").notNull().default("s1_new"),
  collabLevel: integer("collab_level").notNull().default(1), // 1-5
  hallOfFame: integer("hall_of_fame").notNull().default(0), // 0 | 1
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
});

export type InsertPartnership = z.infer<typeof insertPartnershipSchema>;
export type Partnership = typeof partnerships.$inferSelect;

export type Stage = (typeof STAGES)[number];
export type Category = (typeof CATEGORIES)[number];
export type Region = (typeof REGIONS)[number];

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

// ---------- Gobi staff (relationship PIC directory, from gobi.vc/team) ----------
export interface GobiStaff {
  name: string;
  title: string;
  office: string;
}

export const GOBI_OFFICES = ["Hong Kong (SAR)", "Mainland China", "Malaysia", "Singapore", "Philippines", "Vietnam", "Indonesia", "Pakistan", "Other"] as const;

export const GOBI_STAFF: GobiStaff[] = [
  // Hong Kong (SAR)
  { name: "Chibo Tang", title: "Managing Partner", office: "Hong Kong (SAR)" },
  { name: "Jason Chen", title: "COO, Group / Managing Director", office: "Hong Kong (SAR)" },
  { name: "Angel Chau", title: "Chief Financial Officer", office: "Hong Kong (SAR)" },
  { name: "Fred Li", title: "Managing Director / Head of University Ventures", office: "Hong Kong (SAR)" },
  { name: "Wai Kit Lau", title: "Advisor", office: "Hong Kong (SAR)" },
  { name: "Bowie Tan", title: "Manager, Finance", office: "Hong Kong (SAR)" },
  { name: "Carol Tang", title: "Director, Finance", office: "Hong Kong (SAR)" },
  { name: "Charlie Tsui", title: "Administrative Assistant", office: "Hong Kong (SAR)" },
  { name: "Eunice Lam", title: "Senior Manager, Corporate Development", office: "Hong Kong (SAR)" },
  { name: "Hazel Wong", title: "Director, Public Relations", office: "Hong Kong (SAR)" },
  { name: "Hing Cheng", title: "Senior Executive Director, Corporate Development", office: "Hong Kong (SAR)" },
  { name: "Jackson Chung", title: "Senior Manager, Investment", office: "Hong Kong (SAR)" },
  { name: "Jimmy Ng", title: "Senior Director, Group Strategy", office: "Hong Kong (SAR)" },
  { name: "Kennith So", title: "Director, Programme", office: "Hong Kong (SAR)" },
  { name: "Miranda Cheng", title: "Senior Director, Compliance", office: "Hong Kong (SAR)" },
  { name: "Rosa Dai", title: "Manager, Investment", office: "Hong Kong (SAR)" },
  { name: "Sandy Chong", title: "Senior Director, Administration / Head of Treasury", office: "Hong Kong (SAR)" },
  { name: "Sarah Jin", title: "General Counsel", office: "Hong Kong (SAR)" },
  { name: "Shirley Gong", title: "Executive, Finance", office: "Hong Kong (SAR)" },
  // Mainland China
  { name: "Renee Pan", title: "Managing Director", office: "Mainland China" },
  { name: "Berlin Chen", title: "Senior Manager, Ecosystem", office: "Mainland China" },
  { name: "Bohan Zheng", title: "Senior Director, Investment", office: "Mainland China" },
  { name: "Elena Chen", title: "Senior Manager, Office", office: "Mainland China" },
  { name: "Lain Yao", title: "Director, Investment", office: "Mainland China" },
  { name: "Leo Chen", title: "Manager, Investment and Research", office: "Mainland China" },
  { name: "Mon Liang", title: "Assistant Manager, Project", office: "Mainland China" },
  { name: "Shaohu Zhou", title: "Manager, Investment and Research", office: "Mainland China" },
  // Malaysia
  { name: "Thomas G. Tsao", title: "Co-founder and Chair", office: "Malaysia" },
  { name: "Jamaludin Bujang", title: "Managing Partner", office: "Malaysia" },
  { name: "Hisham Ibrahim", title: "Managing Director", office: "Malaysia" },
  { name: "Jong Eon Lee", title: "Partner", office: "Malaysia" },
  { name: "Gerald Ko", title: "Senior Manager, Investment", office: "Malaysia" },
  { name: "Imran Hafiz", title: "Director, Investment", office: "Malaysia" },
  { name: "Jasdeep Maan", title: "Senior Manager, Investment", office: "Malaysia" },
  { name: "Navvin Kumar", title: "Senior Director, Investment", office: "Malaysia" },
  { name: "Syafiq Aqmar", title: "Director, Investment", office: "Malaysia" },
  { name: "Zayd Azman", title: "Senior Manager, Investment", office: "Malaysia" },
  // Singapore
  { name: "Dan Chong", title: "Managing Partner", office: "Singapore" },
  { name: "Soo Wei Shaw", title: "Partner", office: "Singapore" },
  { name: "Kay-Mok Ku", title: "Senior Partner", office: "Singapore" },
  { name: "Kean Zen Liew", title: "Director, Investment", office: "Singapore" },
  // Philippines
  { name: "Jason Gaisano", title: "Managing Partner", office: "Philippines" },
  { name: "Carlo Chen-Delantar", title: "Partner, ESG and Circular Economy", office: "Philippines" },
  { name: "Ken Ngo", title: "Partner", office: "Philippines" },
  { name: "Phoebe Fontanilla", title: "Senior Manager, Investment", office: "Philippines" },
  // Vietnam
  { name: "Nhat Minh Phan", title: "Partner", office: "Vietnam" },
  { name: "Hung Cao", title: "Analyst, Investment", office: "Vietnam" },
  // Indonesia
  { name: "Adrian Kurnia", title: "Director, Investment", office: "Indonesia" },
  { name: "Ivy Callista", title: "Manager, Investment", office: "Indonesia" },
  // Pakistan
  { name: "Ali Mukhtar", title: "Partner, General", office: "Pakistan" },
  { name: "Naiel Ikram", title: "Partner", office: "Pakistan" },
  { name: "Kashaf Jamal", title: "Vice President, Investment", office: "Pakistan" },
  { name: "Muhammad Ali Taufiq", title: "Vice President, Investment", office: "Pakistan" },
];

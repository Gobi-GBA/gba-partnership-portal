// PostgreSQL mirror of shared/schema.ts — used when DATABASE_URL is set (e.g. Vercel + Neon).
// Column names and JS-facing shapes are kept identical to the SQLite schema so the
// rest of the app (types, routes, client) is completely driver-agnostic.
import { pgTable, text, integer, serial, jsonb } from "drizzle-orm/pg-core";

export const usersPg = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("staff"),
  status: text("status").notNull().default("pending"),
  title: text("title"),
  avatarUrl: text("avatar_url"),
  isIr: integer("is_ir").notNull().default(0),
  isDev: integer("is_dev").notNull().default(0),
  secretQ1: text("secret_q1"),
  secretA1Hash: text("secret_a1_hash"),
  secretQ2: text("secret_q2"),
  secretA2Hash: text("secret_a2_hash"),
  resetTokenHash: text("reset_token_hash"),
  resetExpires: text("reset_expires"),
});

export const sessionsPg = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
});

export const rdItemsPg = pgTable("rd_items", {
  id: serial("id").primaryKey(),
  project: text("project").notNull().default("Partnership Portal Ecosystem"),
  name: text("name").notNull(),
  details: text("details"),
  kind: text("kind").notNull().default("module"),
  status: text("status").notNull().default("planned"),
  teammates: text("teammates").notNull().default("[]"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdBy: integer("created_by"),
});

export const partnershipsPg = pgTable("partnerships", {
  id: serial("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameCn: text("name_cn"),
  category: text("category").notNull().default("other"),
  region: text("region").notNull().default("hongkong"),
  parentId: integer("parent_id"),
  logoUrl: text("logo_url"),
  website: text("website"),
  descriptionEn: text("description_en"),
  descriptionCn: text("description_cn"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  picName: text("pic_name"),
  picNames: jsonb("pic_names").$type<string[]>(),
  context: text("context"),
  partnershipType: text("partnership_type"),
  startDate: text("start_date"),
  photos: jsonb("photos").$type<string[]>(),
  stage: text("stage").notNull().default("s1_new"),
  collabLevel: integer("collab_level").notNull().default(1),
  hallOfFame: integer("hall_of_fame").notNull().default(0),
  isDomainKnowledgePartner: integer("is_domain_knowledge_partner").notNull().default(0),
  lpStatus: text("lp_status").notNull().default("na"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  submittedBy: integer("submitted_by"),
  createdAt: text("created_at").notNull(),
});

export const attachmentsPg = pgTable("attachments", {
  id: serial("id").primaryKey(),
  partnershipId: integer("partnership_id").notNull(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  data: text("data").notNull(),
  uploadedBy: integer("uploaded_by"),
  createdAt: text("created_at").notNull(),
});

export const auditLogsPg = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  partnershipId: integer("partnership_id").notNull(),
  userId: integer("user_id"),
  userName: text("user_name").notNull(),
  action: text("action").notNull(),
  changes: text("changes"),
  createdAt: text("created_at").notNull(),
});

export const changeRequestsPg = pgTable("change_requests", {
  id: serial("id").primaryKey(),
  partnershipId: integer("partnership_id").notNull(),
  proposedBy: integer("proposed_by").notNull(),
  changes: text("changes").notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
});

export const advisorsPg = pgTable("advisors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameCn: text("name_cn"),
  advisorType: text("advisor_type").notNull().default("honourary_advisor"),
  track: text("track").notNull().default("industry"),
  pillar: text("pillar").notNull().default("other"),
  emails: jsonb("emails").$type<string[]>(),
  domains: text("domains"),
  background: text("background"),
  photoUrl: text("photo_url"),
  photoThumbUrl: text("photo_thumb_url"),
  profileUrl: text("profile_url"),
  linkedinUrl: text("linkedin_url"),
  gobiPics: jsonb("gobi_pics").$type<string[]>(),
  cohort: text("cohort"),
  engagement: text("engagement"),
  publicClearance: integer("public_clearance").notNull().default(0),
  birthDay: integer("birth_day"),
  birthMonth: integer("birth_month"),
  birthYear: integer("birth_year"),
  status: text("status").notNull().default("pending"),
  submittedBy: integer("submitted_by"),
  createdAt: text("created_at").notNull(),
});

export const advisorRolesPg = pgTable("advisor_roles", {
  id: serial("id").primaryKey(),
  advisorId: integer("advisor_id").notNull(),
  title: text("title").notNull(),
  organization: text("organization"),
  partnershipId: integer("partnership_id"),
  isPrimary: integer("is_primary").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const sectorTagsPg = pgTable("sector_tags", {
  id: serial("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameCn: text("name_cn"),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const advisorTagsPg = pgTable("advisor_tags", {
  id: serial("id").primaryKey(),
  advisorId: integer("advisor_id").notNull(),
  tagId: integer("tag_id").notNull(),
});

export const partnershipTagsPg = pgTable("partnership_tags", {
  id: serial("id").primaryKey(),
  partnershipId: integer("partnership_id").notNull(),
  tagId: integer("tag_id").notNull(),
});

export const advisorActivitiesPg = pgTable("advisor_activities", {
  id: serial("id").primaryKey(),
  advisorId: integer("advisor_id").notNull(),
  date: text("date").notNull(),
  type: text("type").notNull().default("note"),
  note: text("note"),
  createdBy: integer("created_by"),
  createdByName: text("created_by_name"),
  createdAt: text("created_at").notNull(),
});

export const feedbackPg = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  userName: text("user_name").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  adminNote: text("admin_note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

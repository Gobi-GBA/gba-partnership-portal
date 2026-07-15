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

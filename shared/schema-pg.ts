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

export const changeRequestsPg = pgTable("change_requests", {
  id: serial("id").primaryKey(),
  partnershipId: integer("partnership_id").notNull(),
  proposedBy: integer("proposed_by").notNull(),
  changes: text("changes").notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
});

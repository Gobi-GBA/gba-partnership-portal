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
  editRequestedAt: text("edit_requested_at"),
  mustChangePassword: integer("must_change_password").notNull().default(0),
  lastSeenVersion: text("last_seen_version"), // v6.05
  lastSeenUpdatesAt: text("last_seen_updates_at"), // v6.05
  googleLinkedAt: text("google_linked_at"), // v6.09
  lastActiveAt: text("last_active_at"), // v6.10 — presence heartbeat
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

// v6.01 — uploaded photo assets (thumb + HD), grouped per owner
export const photoAssetsPg = pgTable("photo_assets", {
  id: serial("id").primaryKey(),
  ownerType: text("owner_type").notNull().default("partnership"),
  ownerId: integer("owner_id").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  thumbData: text("thumb_data").notNull(),
  hdData: text("hd_data").notNull(),
  uploadedBy: integer("uploaded_by"),
  createdAt: text("created_at").notNull(),
});

export const auditLogsPg = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull().default("partnership"), // v6.04
  partnershipId: integer("partnership_id").notNull(),
  userId: integer("user_id"),
  userName: text("user_name").notNull(),
  action: text("action").notNull(),
  changes: text("changes"),
  createdAt: text("created_at").notNull(),
});

// v6.04 — document file assets (advisor CVs and signed letters)
export const fileAssetsPg = pgTable("file_assets", {
  id: serial("id").primaryKey(),
  ownerType: text("owner_type").notNull(),
  ownerId: integer("owner_id").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  data: text("data").notNull(),
  uploadedBy: integer("uploaded_by"),
  uploadedByName: text("uploaded_by_name"),
  createdAt: text("created_at").notNull(),
});

export const changeRequestsPg = pgTable("change_requests", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull().default("partnership"), // v7.11
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
  mobile: text("mobile"),
  mobiles: jsonb("mobiles").$type<string[]>(),
  wechatId: text("wechat_id"),
  originStaff: jsonb("origin_staff").$type<string[]>(),
  status: text("status").notNull().default("pending"),
  lifecycleStatus: text("lifecycle_status").notNull().default("proposed"),
  onboardedAt: text("onboarded_at"),
  approvalEmailedAt: text("approval_emailed_at"),
  approvedAt: text("approved_at"),
  letterIssuedAt: text("letter_issued_at"),
  signedBackAt: text("signed_back_at"),
  submittedBy: integer("submitted_by"),
  createdAt: text("created_at").notNull(),
  approvalTokenHash: text("approval_token_hash"),
  approvalTokenExpires: text("approval_token_expires"),
  approvalDecidedBy: text("approval_decided_by"),
  approvalDecidedAt: text("approval_decided_at"),
  // ---- v7.14 conflict-of-interest gate on the COO approval email ----
  coiStatus: text("coi_status").notNull().default("none"),
  coiDeclaredBy: text("coi_declared_by"),
  coiDeclaredByEmail: text("coi_declared_by_email"),
  coiDeclaredAt: text("coi_declared_at"),
  coiDetails: text("coi_details"),
  coiClearedBy: text("coi_cleared_by"),
  coiClearedAt: text("coi_cleared_at"),
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

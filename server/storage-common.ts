import type { User, Partnership, Session, Attachment, AttachmentMeta, ChangeRequest, AuditLog, Feedback, RdItem, Advisor, AdvisorRole } from "../shared/schema.js";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// Initial admin password comes from the environment — never hard-code credentials.
// If unset, a random one is generated and printed once to the server log.
export function getSeedPassword(): string {
  if (process.env.ADMIN_SEED_PASSWORD) return process.env.ADMIN_SEED_PASSWORD;
  const generated = randomBytes(9).toString("base64url");
  console.warn(`[seed] ADMIN_SEED_PASSWORD not set — generated admin password for fred@gobi.vc: ${generated}`);
  return generated;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

// LP statuses are set by the one-time v4.3 info-upgrade migration (see upgrade-v43.ts)
// so later IR-team edits are never overwritten at boot.

// Example gallery photos (Wikimedia Commons) seeded for flagship partners
export const PHOTO_SEED: { nameEn: string; photos: string[] }[] = [
  { nameEn: "The University of Hong Kong", photos: ["/partners/hku-1.jpg", "/partners/hku-2.jpg", "/partners/hku-3.jpg"] },
  { nameEn: "HKUST", photos: ["/partners/hkust-1.jpg", "/partners/hkust-2.jpg", "/partners/hkust-3.jpg"] },
  { nameEn: "HKIC", photos: ["/partners/hkic-1.jpg", "/partners/hkic-2.jpg", "/partners/hkic-3.jpg"] },
];

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(data: {
    name: string;
    email: string;
    passwordHash: string;
    role?: string;
    status?: string;
    secretQ1?: string | null;
    secretA1Hash?: string | null;
    secretQ2?: string | null;
    secretA2Hash?: string | null;
  }): Promise<User>;
  listUsers(): Promise<User[]>;
  updateUser(
    id: number,
    data: Partial<
      Pick<
        User,
        | "status" | "role" | "name" | "title" | "avatarUrl" | "passwordHash" | "isIr"
        | "secretQ1" | "secretA1Hash" | "secretQ2" | "secretA2Hash"
        | "resetTokenHash" | "resetExpires"
      >
    >
  ): Promise<User | undefined>;
  getUserByResetToken(tokenHash: string): Promise<User | undefined>;

  createSession(userId: number): Promise<Session>;
  getSession(token: string): Promise<Session | undefined>;
  deleteSession(token: string): Promise<void>;

  listPartnerships(): Promise<Partnership[]>;
  getPartnership(id: number): Promise<Partnership | undefined>;
  createPartnership(data: Omit<Partnership, "id">): Promise<Partnership>;
  updatePartnership(id: number, data: Partial<Partnership>): Promise<Partnership | undefined>;
  deletePartnership(id: number): Promise<void>;

  listAttachmentMeta(partnershipId: number): Promise<AttachmentMeta[]>;
  getAttachment(id: number): Promise<Attachment | undefined>;
  createAttachment(data: Omit<Attachment, "id">): Promise<AttachmentMeta>;
  deleteAttachment(id: number): Promise<void>;

  createAuditLog(data: Omit<AuditLog, "id">): Promise<AuditLog>;
  listAuditLogs(partnershipId: number): Promise<AuditLog[]>;

  listChangeRequests(): Promise<ChangeRequest[]>;
  listChangeRequestsByUser(userId: number): Promise<ChangeRequest[]>;
  getChangeRequest(id: number): Promise<ChangeRequest | undefined>;
  createChangeRequest(data: Omit<ChangeRequest, "id">): Promise<ChangeRequest>;
  updateChangeRequestStatus(id: number, status: string): Promise<ChangeRequest | undefined>;

  listRdItems(): Promise<RdItem[]>;
  getRdItem(id: number): Promise<RdItem | undefined>;
  createRdItem(data: Omit<RdItem, "id">): Promise<RdItem>;
  updateRdItem(id: number, data: Partial<RdItem>): Promise<RdItem | undefined>;
  deleteRdItem(id: number): Promise<void>;

  listFeedback(): Promise<Feedback[]>;
  listFeedbackByUser(userId: number): Promise<Feedback[]>;
  createFeedback(data: Omit<Feedback, "id">): Promise<Feedback>;
  updateFeedback(id: number, data: Partial<Pick<Feedback, "status" | "adminNote" | "updatedAt">>): Promise<Feedback | undefined>;

  // Advisors (v5.0)
  listAdvisors(): Promise<Advisor[]>;
  getAdvisor(id: number): Promise<Advisor | undefined>;
  createAdvisor(data: Omit<Advisor, "id">): Promise<Advisor>;
  updateAdvisor(id: number, data: Partial<Advisor>): Promise<Advisor | undefined>;
  deleteAdvisor(id: number): Promise<void>;
  listAdvisorRoles(): Promise<AdvisorRole[]>;
  setAdvisorRoles(advisorId: number, roles: Omit<AdvisorRole, "id" | "advisorId">[]): Promise<AdvisorRole[]>;
}

// ---------- R&D Planner seed (inserted once when rd_items is empty) ----------
// The ecosystem is the big project; each row is a module / function / agent on the timeline.
export const RD_SEED: Omit<RdItem, "id">[] = [
  {
    project: "Partnership Portal Ecosystem",
    name: "Portal core (directory, approvals, bilingual)",
    details: "v1-v3 foundation: bilingual partner directory, login-first flow, account approvals, star map and timeline views.",
    kind: "module",
    status: "done",
    teammates: JSON.stringify(["Fred Li"]),
    startDate: "2026-06-20",
    endDate: "2026-07-05",
    createdBy: 1,
  },
  {
    project: "Partnership Portal Ecosystem",
    name: "AI intake agent (DeepSeek)",
    details: "Generative drafting of partnership entries and descriptions via the DeepSeek API.",
    kind: "agent",
    status: "done",
    teammates: JSON.stringify(["Fred Li"]),
    startDate: "2026-07-01",
    endDate: "2026-07-10",
    createdBy: 1,
  },
  {
    project: "Partnership Portal Ecosystem",
    name: "Galaxy & Gobi desert visual themes",
    details: "Animated dark-mode galaxy and light-mode Gobi desert scenes matching the fund's identity.",
    kind: "module",
    status: "done",
    teammates: JSON.stringify(["Fred Li"]),
    startDate: "2026-07-12",
    endDate: "2026-07-15",
    createdBy: 1,
  },
  {
    project: "Partnership Portal Ecosystem",
    name: "R&D Planner",
    details: "This planner: developer/admin-only roadmap for building functions, modules and agents, shown to management.",
    kind: "function",
    status: "in_progress",
    teammates: JSON.stringify(["Fred Li"]),
    startDate: "2026-07-15",
    endDate: "2026-07-22",
    createdBy: 1,
  },
  {
    project: "Partnership Portal Ecosystem",
    name: "Advisor module",
    details: "Advisors directory as a module of the ecosystem project: profiles, expertise tags and engagement history.",
    kind: "module",
    status: "planned",
    teammates: JSON.stringify(["Fred Li", "Elaine Zhang"]),
    startDate: "2026-07-20",
    endDate: "2026-08-31",
    createdBy: 1,
  },
  {
    project: "Partnership Portal Ecosystem",
    name: "Email notifications (Gmail SMTP)",
    details: "Approval and password-reset emails via Gmail SMTP; awaiting mailbox credentials in production.",
    kind: "integration",
    status: "planned",
    teammates: JSON.stringify(["Fred Li"]),
    startDate: "2026-08-01",
    endDate: "2026-08-15",
    createdBy: 1,
  },
];

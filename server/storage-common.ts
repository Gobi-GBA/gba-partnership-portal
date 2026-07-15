import type { User, Partnership, Session, Attachment, AttachmentMeta, ChangeRequest } from "../shared/schema.js";
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

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(data: { name: string; email: string; passwordHash: string; role?: string; status?: string }): Promise<User>;
  listUsers(): Promise<User[]>;
  updateUser(id: number, data: Partial<Pick<User, "status" | "role">>): Promise<User | undefined>;

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

  listChangeRequests(): Promise<ChangeRequest[]>;
  listChangeRequestsByUser(userId: number): Promise<ChangeRequest[]>;
  getChangeRequest(id: number): Promise<ChangeRequest | undefined>;
  createChangeRequest(data: Omit<ChangeRequest, "id">): Promise<ChangeRequest>;
  updateChangeRequestStatus(id: number, status: string): Promise<ChangeRequest | undefined>;
}

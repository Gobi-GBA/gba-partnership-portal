import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { storage, hashPassword, verifyPassword } from "./storage.js";
import { mailEnabled, sendMail, registrationEmail, resetEmail } from "./mailer.js";
import { createHash, randomBytes } from "node:crypto";
import {
  insertUserSchema,
  insertPartnershipSchema,
  advisorInputSchema,
  advisorActivityInputSchema,
  sectorTagInputSchema,
  attachmentInputSchema,
  changeRequestInputSchema,
  profileUpdateSchema,
  feedbackInputSchema,
  feedbackUpdateSchema,
  adminCreateUserSchema,
  rdItemInputSchema,
  STAGES,
  CATEGORIES,
  REGIONS,
  ROLES,
  LP_STATUSES,
  GOBI_STAFF,
} from "../shared/schema.js";
import type { SafeUser, User, AuditAction, Advisor, AdvisorRole, SectorTag } from "../shared/schema.js";
import mammoth from "mammoth";
import { z } from "zod";

// Single source of truth: collaboration level is always derived from the stage.
const STAGE_LEVEL: Record<string, number> = {
  s1_new: 1,
  s2_engaged: 2,
  s3_agreement: 3,
  s4_progressive: 4,
  s5_strategic: 5,
};

// LP status is IR-team-only information. Everyone else sees 'na'.
function canSeeLp(user: User | undefined): boolean {
  return !!user && (user.role === "admin" || user.isIr === 1);
}

function redactLp<T extends { lpStatus?: string }>(p: T, user: User | undefined): T {
  return canSeeLp(user) ? p : { ...p, lpStatus: "na" };
}

function safe(user: User): SafeUser {
  const { passwordHash, secretA1Hash, secretA2Hash, resetTokenHash, resetExpires, ...rest } = user;
  return rest;
}

// Secret answers are case/whitespace-insensitive, hashed with the same scrypt scheme as passwords.
function normalizeAnswer(a: string): string {
  return a.trim().toLowerCase().replace(/\s+/g, " ");
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

const AUTO_APPROVE_DOMAIN = "@gobi.vc"; // registrations from this domain are approved instantly as viewers

// ---------- gobi.vc team page (profile sync) ----------

interface GobiTeamMember {
  name: string;
  title: string;
  photoUrl: string;
  location: string;
  linkedinUrl: string;
}

function normalizeName(n: string): string {
  return n.trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

let gobiTeamCache: { at: number; members: GobiTeamMember[] } | null = null;

async function fetchGobiTeam(): Promise<GobiTeamMember[]> {
  if (gobiTeamCache && Date.now() - gobiTeamCache.at < 10 * 60 * 1000) return gobiTeamCache.members;
  const resp = await fetch("https://gobi.vc/team", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GobiPortal/4.3)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`gobi.vc responded ${resp.status}`);
  const html = await resp.text();
  const blocks = html.split('class="team_team-members_team-member-item');
  const members: GobiTeamMember[] = [];
  for (const block of blocks.slice(1)) {
    const name = block.match(/heading-style-h5[^>]*>([^<]+)</)?.[1];
    if (!name) continue;
    const title = block.match(/text-size-regular[^>]*>([^<]+)</)?.[1] ?? "";
    const photo = block.match(/<img src="(https:\/\/cdn\.prod\.website-files\.com[^"]+)"/)?.[1] ?? "";
    const location = block.match(/text-size-tiny">([^<]+)</)?.[1] ?? "";
    const linkedin = block.match(/href="(https:\/\/(?:www\.)?linkedin\.com[^"]+)"/)?.[1] ?? "";
    members.push({
      name: decodeEntities(name),
      title: decodeEntities(title),
      photoUrl: photo,
      location: decodeEntities(location),
      linkedinUrl: linkedin,
    });
  }
  if (!members.length) throw new Error("no members parsed from gobi.vc/team");
  gobiTeamCache = { at: Date.now(), members };
  return members;
}

// ---------- Web page fetching (AI quick-fill link support) ----------

const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n"),
  );
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GobiPortal/4.3)" },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!resp.ok) return null;
    const type = resp.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text")) return null;
    const html = await resp.text();
    return htmlToText(html).slice(0, 10_000);
  } catch {
    return null;
  }
}

function appBaseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.startsWith("http")) return origin;
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}`;
}

interface AuthedRequest extends Request {
  user?: User;
}

async function resolveUser(req: AuthedRequest): Promise<User | undefined> {
  const header = req.headers.authorization;
  let token: string | undefined;
  if (header?.startsWith("Bearer ")) token = header.slice(7);
  // <a href> links (attachment downloads) cannot send headers — accept ?token= too
  if (!token && typeof req.query?.token === "string") token = req.query.token;
  if (!token) return undefined;
  const session = await storage.getSession(token);
  if (!session) return undefined;
  return storage.getUser(session.userId);
}

// Fire-and-forget audit trail writer — never blocks the main response.
async function audit(
  user: User,
  partnershipId: number,
  action: AuditAction,
  changes?: Record<string, unknown>,
) {
  try {
    await storage.createAuditLog({
      partnershipId,
      userId: user.id,
      userName: user.name,
      action,
      changes: changes && Object.keys(changes).length ? JSON.stringify(changes) : null,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("audit log failed:", err);
  }
}

// Which fields of a partial update actually differ from the stored record
function diffFields(existing: Record<string, any>, patch: Record<string, any>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (key === "id") continue;
    if (JSON.stringify(patch[key] ?? null) !== JSON.stringify(existing[key] ?? null)) {
      changed[key] = patch[key] ?? null;
    }
  }
  return changed;
}

// Role gate: "admin" = admin only; "submit" = admin or staff (viewer excluded); undefined = any approved user
function requireAuth(level?: "admin" | "submit" | "dev") {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const user = await resolveUser(req);
    if (!user || user.status !== "approved") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (level === "admin" && user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    if (level === "submit" && user.role !== "admin" && user.role !== "staff") {
      return res.status(403).json({ message: "Viewer accounts are read-only" });
    }
    if (level === "dev" && user.role !== "admin" && user.isDev !== 1) {
      return res.status(403).json({ message: "Developer access required" });
    }
    req.user = user;
    next();
  };
}

// Keep only valid Gobi staff names, dedupe, cap at 8
function sanitizePics(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const valid = v.filter((n): n is string => typeof n === "string" && GOBI_STAFF.some((s) => s.name === n));
  return Array.from(new Set(valid)).slice(0, 8);
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // ~10MB per file (base64 inflates ~33%)

function attachmentTooLarge(b64: string) {
  return b64.length > MAX_ATTACHMENT_BYTES * 1.4;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ---------- Auth ----------
  app.post("/api/auth/register", async (req, res) => {
    const parsed = insertUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid registration data" });
    const existing = await storage.getUserByEmail(parsed.data.email);
    if (existing) return res.status(409).json({ message: "Email already registered" });
    const email = parsed.data.email.toLowerCase();
    const autoApproved = email.endsWith(AUTO_APPROVE_DOMAIN);
    const user = await storage.createUser({
      name: parsed.data.name,
      email,
      passwordHash: hashPassword(parsed.data.password),
      // @gobi.vc colleagues get instant viewer access; everyone else awaits admin approval
      ...(autoApproved ? { status: "approved", role: "viewer" } : {}),
      secretQ1: parsed.data.secretQ1,
      secretA1Hash: hashPassword(normalizeAnswer(parsed.data.secretA1)),
      secretQ2: parsed.data.secretQ2,
      secretA2Hash: hashPassword(normalizeAnswer(parsed.data.secretA2)),
    });
    // Confirmation email (fire-and-forget; registration succeeds even if mail fails)
    const tpl = registrationEmail(user.name, autoApproved);
    const emailSent = await sendMail(user.email, tpl.subject, tpl.html);
    res.status(201).json({ user: safe(user), autoApproved, emailSent });
  });

  // ---------- Password reset ----------
  // Step 1a: request a reset link by email
  app.post("/api/auth/forgot", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!email) return res.status(400).json({ message: "Email required" });
    const user = await storage.getUserByEmail(email);
    let emailSent = false;
    if (user && mailEnabled) {
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      await storage.updateUser(user.id, { resetTokenHash: sha256(token), resetExpires: expires });
      const link = `${appBaseUrl(req)}/#/reset?token=${token}`;
      const tpl = resetEmail(user.name, link);
      emailSent = await sendMail(user.email, tpl.subject, tpl.html);
    }
    // Generic response — do not reveal whether the account exists
    res.json({ ok: true, emailConfigured: mailEnabled, emailSent });
  });

  // Step 1b: fetch a user's secret questions (internal tool — enumeration accepted)
  app.post("/api/auth/forgot/questions", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!email) return res.status(400).json({ message: "Email required" });
    const user = await storage.getUserByEmail(email);
    if (!user || !user.secretQ1 || !user.secretQ2 || !user.secretA1Hash || !user.secretA2Hash) {
      return res.status(404).json({ message: "no_secret_questions" });
    }
    res.json({ questions: [user.secretQ1, user.secretQ2] });
  });

  // Step 2: set a new password via token OR secret answers
  app.post("/api/auth/reset", async (req, res) => {
    const { token, email, answers, password } = req.body ?? {};
    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    let user: User | undefined;
    if (typeof token === "string" && token.length > 0) {
      user = await storage.getUserByResetToken(sha256(token));
      if (!user || !user.resetExpires || new Date(user.resetExpires).getTime() < Date.now()) {
        return res.status(400).json({ message: "invalid_or_expired_token" });
      }
    } else if (typeof email === "string" && Array.isArray(answers) && answers.length === 2) {
      const candidate = await storage.getUserByEmail(email.trim().toLowerCase());
      if (!candidate || !candidate.secretA1Hash || !candidate.secretA2Hash) {
        return res.status(400).json({ message: "wrong_answers" });
      }
      const ok =
        verifyPassword(normalizeAnswer(String(answers[0] ?? "")), candidate.secretA1Hash) &&
        verifyPassword(normalizeAnswer(String(answers[1] ?? "")), candidate.secretA2Hash);
      if (!ok) return res.status(400).json({ message: "wrong_answers" });
      user = candidate;
    } else {
      return res.status(400).json({ message: "Token or secret answers required" });
    }
    await storage.updateUser(user.id, {
      passwordHash: hashPassword(password),
      resetTokenHash: null,
      resetExpires: null,
    });
    res.json({ ok: true });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Email and password required" });
    }
    const user = await storage.getUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    if (user.status === "pending") {
      return res.status(403).json({ message: "pending_approval" });
    }
    if (user.status === "rejected") {
      return res.status(403).json({ message: "account_rejected" });
    }
    const session = await storage.createSession(user.id);
    res.json({ token: session.token, user: safe(user) });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) await storage.deleteSession(header.slice(7));
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth(), async (req: AuthedRequest, res) => {
    res.json({ user: safe(req.user!) });
  });

  // Profile self-service: name, title, photo
  app.patch("/api/me", requireAuth(), async (req: AuthedRequest, res) => {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid profile data" });
    const data: Partial<Pick<User, "name" | "title" | "avatarUrl">> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.title !== undefined) data.title = parsed.data.title ?? null;
    if (parsed.data.avatarUrl !== undefined) data.avatarUrl = parsed.data.avatarUrl ?? null;
    if (!Object.keys(data).length) return res.status(400).json({ message: "Nothing to update" });
    const updated = await storage.updateUser(req.user!.id, data);
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json({ user: safe(updated) });
  });

  // Profile sync from gobi.vc: pull photo, title (and LinkedIn) from the
  // public team page by matching the user's name.
  async function syncUserFromGobi(userId: number, userName: string) {
    const members = await fetchGobiTeam();
    const me = normalizeName(userName);
    const match =
      members.find((m) => normalizeName(m.name) === me) ??
      members.find((m) => {
        const a = normalizeName(m.name).split(" ");
        const b = me.split(" ");
        return a.length > 1 && b.length > 1 && a.every((tok) => b.includes(tok));
      });
    if (!match) return { error: 404 as const };
    const data: Partial<Pick<User, "title" | "avatarUrl">> = {};
    if (match.title) data.title = match.title;
    if (match.photoUrl) data.avatarUrl = match.photoUrl;
    const updated = await storage.updateUser(userId, data);
    if (!updated) return { error: 404 as const };
    return { user: updated, matched: match };
  }

  app.post("/api/profile/sync-gobi", requireAuth(), async (req: AuthedRequest, res) => {
    try {
      const result = await syncUserFromGobi(req.user!.id, req.user!.name);
      if ("error" in result) return res.status(404).json({ message: "not_found_on_gobi" });
      res.json({ user: safe(result.user), matched: result.matched });
    } catch (err) {
      console.error("gobi.vc sync failed:", err);
      res.status(502).json({ message: "gobi_fetch_failed" });
    }
  });

  // Admin: run the gobi.vc profile sync for any account
  app.post("/api/admin/users/:id/sync-gobi", requireAuth("admin"), async (req: AuthedRequest, res) => {
    const target = await storage.getUser(Number(req.params.id));
    if (!target) return res.status(404).json({ message: "Not found" });
    try {
      const result = await syncUserFromGobi(target.id, target.name);
      if ("error" in result) return res.status(404).json({ message: "not_found_on_gobi" });
      res.json({ user: safe(result.user), matched: result.matched });
    } catch (err) {
      console.error("gobi.vc admin sync failed:", err);
      res.status(502).json({ message: "gobi_fetch_failed" });
    }
  });

  // ---------- Partnerships ----------
  // Signed-in users only: approved partnerships
  app.get("/api/partnerships", requireAuth(), async (req: AuthedRequest, res) => {
    const all = await storage.listPartnerships();
    const users = await storage.listUsers();
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    res.json(
      all
        .filter((p) => p.status === "approved")
        .map((p) => ({
          ...redactLp(p, req.user),
          submittedByName: p.submittedBy != null ? nameById.get(p.submittedBy) ?? null : null,
        })),
    );
  });

  // Audit trail for one partnership — any signed-in user can view
  app.get("/api/partnerships/:id/audit", requireAuth(), async (req, res) => {
    const logs = await storage.listAuditLogs(Number(req.params.id));
    logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(logs);
  });

  // Authed: own submissions (any status)
  app.get("/api/mine", requireAuth(), async (req: AuthedRequest, res) => {
    const all = await storage.listPartnerships();
    res.json(all.filter((p) => p.submittedBy === req.user!.id));
  });

  // Submit new partnership — admin & staff only (viewer read-only)
  app.post("/api/partnerships", requireAuth("submit"), async (req: AuthedRequest, res) => {
    const { attachments: rawAttachments, ...body } = req.body ?? {};
    const parsed = insertPartnershipSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid partnership data", errors: parsed.error.flatten() });
    }
    if (!parsed.data.startDate) {
      return res.status(400).json({ message: "Start date is required" });
    }
    const isAdmin = req.user!.role === "admin";
    const created = await storage.createPartnership({
      ...parsed.data,
      collabLevel: STAGE_LEVEL[parsed.data.stage] ?? 1,
      nameCn: parsed.data.nameCn ?? null,
      logoUrl: parsed.data.logoUrl ?? null,
      website: parsed.data.website ?? null,
      descriptionEn: parsed.data.descriptionEn ?? null,
      descriptionCn: parsed.data.descriptionCn ?? null,
      contactName: parsed.data.contactName ?? null,
      contactEmail: parsed.data.contactEmail ?? null,
      picName: parsed.data.picName ?? null,
      picNames: sanitizePics(parsed.data.picNames),
      context: parsed.data.context ?? null,
      partnershipType: parsed.data.partnershipType ?? null,
      startDate: parsed.data.startDate ?? null,
      notes: parsed.data.notes ?? null,
      photos: parsed.data.photos ?? null,
      parentId: parsed.data.parentId ?? null,
      hallOfFame: isAdmin ? (parsed.data.hallOfFame ?? 0) : 0,
      isDomainKnowledgePartner: isAdmin ? (parsed.data.isDomainKnowledgePartner ?? 0) : 0,
      lpStatus:
        canSeeLp(req.user) && (LP_STATUSES as readonly string[]).includes(parsed.data.lpStatus ?? "")
          ? parsed.data.lpStatus!
          : "na",
      status: isAdmin ? "approved" : "pending",
      submittedBy: req.user!.id,
      createdAt: new Date().toISOString(),
    });
    // Optional attachments bundled with the submission
    if (Array.isArray(rawAttachments)) {
      for (const a of rawAttachments.slice(0, 8)) {
        const pa = attachmentInputSchema.safeParse(a);
        if (!pa.success || attachmentTooLarge(pa.data.data)) continue;
        await storage.createAttachment({
          partnershipId: created.id,
          name: pa.data.name,
          mime: pa.data.mime,
          size: Math.floor(pa.data.data.length * 0.75),
          data: pa.data.data,
          uploadedBy: req.user!.id,
          createdAt: new Date().toISOString(),
        });
      }
    }
    await audit(req.user!, created.id, "create", { nameEn: created.nameEn, stage: created.stage });
    res.status(201).json(redactLp(created, req.user));
  });

  // Direct edit — admin only (staff must use change requests; owner may edit own pending submission)
  app.patch("/api/partnerships/:id", requireAuth("submit"), async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getPartnership(id);
    if (!existing) return res.status(404).json({ message: "Not found" });
    const isAdmin = req.user!.role === "admin";
    const isOwnerPending = existing.submittedBy === req.user!.id && existing.status === "pending";
    if (!isAdmin && !isOwnerPending) {
      return res.status(403).json({ message: "Use a change request to propose edits to approved records" });
    }
    const body = { ...req.body };
    if (!isAdmin) {
      delete body.status;
      delete body.hallOfFame;
      delete body.isDomainKnowledgePartner;
    }
    // LP status: only the IR team (or admins) may view or change it
    if (!canSeeLp(req.user) || !(LP_STATUSES as readonly string[]).includes(body.lpStatus)) {
      delete body.lpStatus;
    }
    if ("picNames" in body) body.picNames = sanitizePics(body.picNames);
    if ("startDate" in body && !body.startDate) {
      return res.status(400).json({ message: "Start date is required" });
    }
    // collabLevel always mirrors the stage — never accepted from the client
    if (typeof body.stage === "string" && STAGE_LEVEL[body.stage]) {
      body.collabLevel = STAGE_LEVEL[body.stage];
    } else {
      delete body.collabLevel;
    }
    const changed = diffFields(existing as any, body);
    delete (changed as any).lpStatus; // never expose LP status in the shared audit trail
    const updated = await storage.updatePartnership(id, body);
    if (Object.keys(changed).length) await audit(req.user!, id, "update", changed);
    res.json(updated ? redactLp(updated, req.user) : updated);
  });

  app.delete("/api/partnerships/:id", requireAuth("admin"), async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getPartnership(id);
    await storage.deletePartnership(id);
    if (existing) await audit(req.user!, id, "delete", { nameEn: existing.nameEn });
    res.json({ ok: true });
  });

  // ---------- Attachments ----------
  // Signed-in users: list metadata for a partnership (no file data)
  app.get("/api/partnerships/:id/attachments", requireAuth(), async (req, res) => {
    res.json(await storage.listAttachmentMeta(Number(req.params.id)));
  });

  // Signed-in users: download/view a file (?token= supported for <a> links)
  app.get("/api/attachments/:id", requireAuth(), async (req, res) => {
    const att = await storage.getAttachment(Number(req.params.id));
    if (!att) return res.status(404).json({ message: "Not found" });
    const buf = Buffer.from(att.data, "base64");
    res.setHeader("Content-Type", att.mime);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(att.name)}"`);
    res.send(buf);
  });

  // Add attachment to existing record — admin, or owner of a pending submission
  app.post("/api/partnerships/:id/attachments", requireAuth("submit"), async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getPartnership(id);
    if (!existing) return res.status(404).json({ message: "Not found" });
    const isAdmin = req.user!.role === "admin";
    const isOwnerPending = existing.submittedBy === req.user!.id && existing.status === "pending";
    if (!isAdmin && !isOwnerPending) return res.status(403).json({ message: "Not allowed" });
    const parsed = attachmentInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid attachment" });
    if (attachmentTooLarge(parsed.data.data)) return res.status(413).json({ message: "File too large (max 10MB)" });
    const meta = await storage.createAttachment({
      partnershipId: id,
      name: parsed.data.name,
      mime: parsed.data.mime,
      size: Math.floor(parsed.data.data.length * 0.75),
      data: parsed.data.data,
      uploadedBy: req.user!.id,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(meta);
  });

  app.delete("/api/attachments/:id", requireAuth("admin"), async (req, res) => {
    await storage.deleteAttachment(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------- Change requests (staff propose, admin approve) ----------
  app.post("/api/change-requests", requireAuth("submit"), async (req: AuthedRequest, res) => {
    const parsed = changeRequestInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid change request", errors: parsed.error.flatten() });
    }
    const target = await storage.getPartnership(parsed.data.partnershipId);
    if (!target) return res.status(404).json({ message: "Partnership not found" });
    // LP status can only be proposed by IR team members
    if (!canSeeLp(req.user) && parsed.data.changes && typeof parsed.data.changes === "object") {
      delete (parsed.data.changes as Record<string, unknown>).lpStatus;
    }
    const cr = await storage.createChangeRequest({
      partnershipId: parsed.data.partnershipId,
      proposedBy: req.user!.id,
      changes: JSON.stringify(parsed.data.changes),
      note: parsed.data.note ?? null,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    await audit(req.user!, parsed.data.partnershipId, "change_request", parsed.data.changes as Record<string, unknown>);
    res.status(201).json(cr);
  });

  // Admin sees all; staff sees own
  app.get("/api/change-requests", requireAuth(), async (req: AuthedRequest, res) => {
    const list =
      req.user!.role === "admin"
        ? await storage.listChangeRequests()
        : await storage.listChangeRequestsByUser(req.user!.id);
    res.json(list);
  });

  // Approve / reject — admin only; approval applies the proposed changes
  app.patch("/api/change-requests/:id", requireAuth("admin"), async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const action = req.body?.action;
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "action must be 'approve' or 'reject'" });
    }
    const cr = await storage.getChangeRequest(id);
    if (!cr) return res.status(404).json({ message: "Not found" });
    if (cr.status !== "pending") return res.status(409).json({ message: "Already resolved" });
    if (action === "approve") {
      let changes: Record<string, unknown> = {};
      try {
        changes = JSON.parse(cr.changes);
      } catch {
        return res.status(422).json({ message: "Corrupt change payload" });
      }
      // collabLevel always mirrors the stage
      if (typeof changes.stage === "string" && STAGE_LEVEL[changes.stage]) {
        changes.collabLevel = STAGE_LEVEL[changes.stage];
      } else {
        delete changes.collabLevel;
      }
      await storage.updatePartnership(cr.partnershipId, changes);
      await audit(req.user!, cr.partnershipId, "change_approved", changes);
    } else {
      await audit(req.user!, cr.partnershipId, "change_rejected");
    }
    const updated = await storage.updateChangeRequestStatus(id, action === "approve" ? "approved" : "rejected");
    res.json(updated);
  });

  // ---------- R&D Planner (developer + admin only) ----------
  app.get("/api/rd-items", requireAuth("dev"), async (_req, res) => {
    res.json(await storage.listRdItems());
  });

  app.post("/api/rd-items", requireAuth("dev"), async (req: AuthedRequest, res) => {
    const parsed = rdItemInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid data" });
    const { teammates, ...rest } = parsed.data;
    const created = await storage.createRdItem({
      ...rest,
      details: rest.details ?? null,
      startDate: rest.startDate ?? null,
      endDate: rest.endDate ?? null,
      teammates: JSON.stringify(teammates),
      createdBy: req.user!.id,
    });
    res.status(201).json(created);
  });

  app.patch("/api/rd-items/:id", requireAuth("dev"), async (req: AuthedRequest, res) => {
    const parsed = rdItemInputSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid data" });
    const { teammates, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };
    if (teammates !== undefined) data.teammates = JSON.stringify(teammates);
    if (!Object.keys(data).length) return res.status(400).json({ message: "Nothing to update" });
    const updated = await storage.updateRdItem(Number(req.params.id), data);
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  });

  app.delete("/api/rd-items/:id", requireAuth("dev"), async (req: AuthedRequest, res) => {
    const existing = await storage.getRdItem(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Not found" });
    await storage.deleteRdItem(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------- Admin ----------
  app.get("/api/admin/users", requireAuth("admin"), async (_req, res) => {
    const all = await storage.listUsers();
    res.json(all.map(safe));
  });

  app.patch("/api/admin/users/:id", requireAuth("admin"), async (req: AuthedRequest, res) => {
    const data: { status?: string; role?: string; isIr?: number; isDev?: number; name?: string; title?: string | null; avatarUrl?: string | null } = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name || name.length > 80) return res.status(400).json({ message: "Invalid name" });
      data.name = name;
    }
    if (req.body?.title !== undefined) {
      const title = req.body.title === null ? null : String(req.body.title).trim();
      if (title !== null && title.length > 120) return res.status(400).json({ message: "Invalid title" });
      data.title = title || null;
    }
    if (req.body?.avatarUrl !== undefined) {
      const avatarUrl = req.body.avatarUrl === null ? null : String(req.body.avatarUrl).trim();
      if (avatarUrl !== null && avatarUrl.length > 500) return res.status(400).json({ message: "Invalid avatar URL" });
      data.avatarUrl = avatarUrl || null;
    }
    if (req.body?.status !== undefined) {
      if (!["approved", "rejected", "pending"].includes(req.body.status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      data.status = req.body.status;
    }
    if (req.body?.isIr !== undefined) {
      if (![0, 1].includes(req.body.isIr)) {
        return res.status(400).json({ message: "Invalid isIr value" });
      }
      data.isIr = req.body.isIr;
    }
    if (req.body?.isDev !== undefined) {
      if (![0, 1].includes(req.body.isDev)) {
        return res.status(400).json({ message: "Invalid isDev value" });
      }
      data.isDev = req.body.isDev;
    }
    if (req.body?.role !== undefined) {
      if (!(ROLES as readonly string[]).includes(req.body.role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      // Prevent removing your own admin role (lockout guard)
      if (Number(req.params.id) === req.user!.id && req.body.role !== "admin") {
        return res.status(400).json({ message: "You cannot remove your own admin role" });
      }
      data.role = req.body.role;
    }
    if (!Object.keys(data).length) return res.status(400).json({ message: "Nothing to update" });
    const updated = await storage.updateUser(Number(req.params.id), data);
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(safe(updated));
  });

  app.get("/api/admin/partnerships", requireAuth("admin"), async (_req, res) => {
    res.json(await storage.listPartnerships());
  });

  // Admin: create an account directly (pre-approved, no email verification needed)
  app.post("/api/admin/users", requireAuth("admin"), async (req, res) => {
    const parsed = adminCreateUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const { name, email, password, role } = parsed.data;
    const existing = await storage.getUserByEmail(email);
    if (existing) return res.status(409).json({ message: "email_taken" });
    const user = await storage.createUser({
      name,
      email: email.toLowerCase(),
      passwordHash: hashPassword(password),
      role,
      status: "approved",
    });
    res.status(201).json(safe(user));
  });

  // ---------- Feedback / system requests ----------
  app.post("/api/feedback", requireAuth(), async (req: AuthedRequest, res) => {
    const parsed = feedbackInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
    const fb = await storage.createFeedback({
      userId: req.user!.id,
      userName: req.user!.name,
      message: parsed.data.message.trim(),
      status: "open",
      adminNote: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    });
    res.status(201).json(fb);
  });

  app.get("/api/feedback", requireAuth(), async (req: AuthedRequest, res) => {
    const rows = req.user!.role === "admin"
      ? await storage.listFeedback()
      : await storage.listFeedbackByUser(req.user!.id);
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(rows);
  });

  app.patch("/api/feedback/:id", requireAuth("admin"), async (req, res) => {
    const parsed = feedbackUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
    const updated = await storage.updateFeedback(Number(req.params.id), {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  });

  // ---------- Advisors (v5.0 — Gobi Advisory Network) ----------
  // Emails, engagement history, and personal data (DOB) are internal: hidden from viewer accounts.
  const isStaffUser = (user: User | undefined) => !!user && (user.role === "admin" || user.role === "staff");
  const redactAdvisor = (a: Advisor, user: User | undefined): Advisor =>
    isStaffUser(user)
      ? a
      : { ...a, emails: null, engagement: null, birthDay: null, birthMonth: null, birthYear: null };

  const sortTags = (tags: SectorTag[]) => tags.sort((x, y) => x.sortOrder - y.sortOrder || x.nameEn.localeCompare(y.nameEn));
  async function advisorTagMap(): Promise<Map<number, SectorTag[]>> {
    const tagById = new Map((await storage.listSectorTags()).map((t) => [t.id, t]));
    const map = new Map<number, SectorTag[]>();
    for (const at of await storage.listAdvisorTagIds()) {
      const tag = tagById.get(at.tagId);
      if (!tag) continue;
      const list = map.get(at.advisorId) ?? [];
      list.push(tag);
      map.set(at.advisorId, list);
    }
    map.forEach((list) => sortTags(list));
    return map;
  }

  // List — thumbnails only (HD photos load on demand via the detail endpoint)
  app.get("/api/advisors", requireAuth(), async (req: AuthedRequest, res) => {
    const isAdmin = req.user!.role === "admin";
    const all = await storage.listAdvisors();
    const visible = all.filter(
      (a) => a.status === "approved" || isAdmin || a.submittedBy === req.user!.id,
    );
    const roles = await storage.listAdvisorRoles();
    const byAdvisor = new Map<number, AdvisorRole[]>();
    for (const r of roles) {
      const list = byAdvisor.get(r.advisorId) ?? [];
      list.push(r);
      byAdvisor.set(r.advisorId, list);
    }
    const tagsByAdvisor = await advisorTagMap();
    const staff = isStaffUser(req.user);
    const lastByAdvisor = new Map<number, string>();
    if (staff) {
      for (const act of await storage.listAdvisorActivities()) {
        const prev = lastByAdvisor.get(act.advisorId);
        if (!prev || act.date > prev) lastByAdvisor.set(act.advisorId, act.date);
      }
    }
    res.json(
      visible.map((a) => ({
        ...redactAdvisor(a, req.user),
        photoUrl: null, // keep the list payload light
        roles: (byAdvisor.get(a.id) ?? []).sort((x, y) => y.isPrimary - x.isPrimary || x.sortOrder - y.sortOrder),
        tags: tagsByAdvisor.get(a.id) ?? [],
        lastActivityAt: staff ? lastByAdvisor.get(a.id) ?? null : null,
      })),
    );
  });

  // Detail — full record including the HD photo
  app.get("/api/advisors/:id", requireAuth(), async (req: AuthedRequest, res) => {
    const a = await storage.getAdvisor(Number(req.params.id));
    if (!a) return res.status(404).json({ message: "Not found" });
    const isAdmin = req.user!.role === "admin";
    if (a.status !== "approved" && !isAdmin && a.submittedBy !== req.user!.id) {
      return res.status(404).json({ message: "Not found" });
    }
    const roles = (await storage.listAdvisorRoles())
      .filter((r) => r.advisorId === a.id)
      .sort((x, y) => y.isPrimary - x.isPrimary || x.sortOrder - y.sortOrder);
    const tags = (await advisorTagMap()).get(a.id) ?? [];
    res.json({ ...redactAdvisor(a, req.user), roles, tags });
  });

  // Create — staff submissions await approval; admin entries go live at once
  app.post("/api/advisors", requireAuth("submit"), async (req: AuthedRequest, res) => {
    const parsed = advisorInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid advisor data", errors: parsed.error.flatten() });
    }
    const isAdmin = req.user!.role === "admin";
    const { roles, tagIds, ...data } = parsed.data;
    const created = await storage.createAdvisor({
      name: data.name,
      nameCn: data.nameCn ?? null,
      advisorType: data.advisorType,
      track: data.track,
      pillar: data.pillar,
      emails: data.emails ?? null,
      domains: data.domains ?? null,
      background: data.background ?? null,
      photoUrl: data.photoUrl ?? null,
      photoThumbUrl: data.photoThumbUrl ?? null,
      profileUrl: data.profileUrl ?? null,
      linkedinUrl: data.linkedinUrl ?? null,
      gobiPics: data.gobiPics ?? null,
      cohort: data.cohort ?? null,
      engagement: data.engagement ?? null,
      publicClearance: data.publicClearance ?? 0,
      birthDay: data.birthDay ?? null,
      birthMonth: data.birthMonth ?? null,
      birthYear: data.birthYear ?? null,
      status: isAdmin ? "approved" : "pending",
      submittedBy: req.user!.id,
      createdAt: new Date().toISOString(),
    });
    if (tagIds) await storage.setAdvisorTags(created.id, tagIds);
    const savedRoles = await storage.setAdvisorRoles(
      created.id,
      roles.map((r, i) => ({
        title: r.title,
        organization: r.organization ?? null,
        partnershipId: r.partnershipId ?? null,
        isPrimary: r.isPrimary ?? 0,
        sortOrder: i,
      })),
    );
    res.status(201).json({ ...created, roles: savedRoles });
  });

  // Edit — admins edit anything; staff may fix their own pending submissions
  app.patch("/api/advisors/:id", requireAuth("submit"), async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getAdvisor(id);
    if (!existing) return res.status(404).json({ message: "Not found" });
    const isAdmin = req.user!.role === "admin";
    if (!isAdmin && !(existing.submittedBy === req.user!.id && existing.status === "pending")) {
      return res.status(403).json({ message: "Only admins can edit approved advisors" });
    }
    const parsed = advisorInputSchema.partial().extend({ status: z.enum(["pending", "approved", "rejected"]).optional() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid advisor data", errors: parsed.error.flatten() });
    }
    const { roles, status, tagIds, ...data } = parsed.data;
    const patch: Partial<Advisor> = { ...data } as Partial<Advisor>;
    if (isAdmin && status) patch.status = status;
    const updated = await storage.updateAdvisor(id, patch);
    if (tagIds) await storage.setAdvisorTags(id, tagIds);
    let savedRoles: AdvisorRole[] | undefined;
    if (roles) {
      savedRoles = await storage.setAdvisorRoles(
        id,
        roles.map((r, i) => ({
          title: r.title,
          organization: r.organization ?? null,
          partnershipId: r.partnershipId ?? null,
          isPrimary: r.isPrimary ?? 0,
          sortOrder: i,
        })),
      );
    } else {
      savedRoles = (await storage.listAdvisorRoles()).filter((r) => r.advisorId === id);
    }
    res.json({ ...updated, roles: savedRoles });
  });

  app.delete("/api/advisors/:id", requireAuth("admin"), async (req: AuthedRequest, res) => {
    await storage.deleteAdvisor(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------- Sector tags (v5.5 — shared by advisors and partner organisations) ----------
  app.get("/api/sector-tags", requireAuth(), async (_req, res) => {
    res.json(sortTags(await storage.listSectorTags()));
  });

  app.post("/api/sector-tags", requireAuth("admin"), async (req, res) => {
    const parsed = sectorTagInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid tag" });
    const created = await storage.createSectorTag({
      nameEn: parsed.data.nameEn,
      nameCn: parsed.data.nameCn ?? null,
      color: parsed.data.color ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
    });
    res.status(201).json(created);
  });

  app.patch("/api/sector-tags/:id", requireAuth("admin"), async (req, res) => {
    const parsed = sectorTagInputSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid tag" });
    const updated = await storage.updateSectorTag(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  });

  app.delete("/api/sector-tags/:id", requireAuth("admin"), async (req, res) => {
    await storage.deleteSectorTag(Number(req.params.id));
    res.json({ ok: true });
  });

  // Tag assignments for partner organisations (joined client-side on the partners pages)
  app.get("/api/partnership-tags", requireAuth(), async (_req, res) => {
    res.json(await storage.listPartnershipTagIds());
  });

  app.put("/api/partnerships/:id/tags", requireAuth("admin"), async (req, res) => {
    const parsed = z.object({ tagIds: z.array(z.number().int()).max(50) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid tags" });
    const p = await storage.getPartnership(Number(req.params.id));
    if (!p) return res.status(404).json({ message: "Not found" });
    await storage.setPartnershipTags(p.id, parsed.data.tagIds);
    res.json({ ok: true });
  });

  // ---------- Advisor activities (v5.5 — internal CRM log, staff and admin only) ----------
  app.get("/api/advisors/:id/activities", requireAuth("submit"), async (req, res) => {
    const rows = await storage.listAdvisorActivities(Number(req.params.id));
    rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    res.json(rows);
  });

  app.post("/api/advisors/:id/activities", requireAuth("submit"), async (req: AuthedRequest, res) => {
    const advisor = await storage.getAdvisor(Number(req.params.id));
    if (!advisor) return res.status(404).json({ message: "Not found" });
    const parsed = advisorActivityInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid activity", errors: parsed.error.flatten() });
    const created = await storage.createAdvisorActivity({
      advisorId: advisor.id,
      date: parsed.data.date,
      type: parsed.data.type ?? "note",
      note: parsed.data.note ?? null,
      createdBy: req.user!.id,
      createdByName: req.user!.name,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(created);
  });

  app.patch("/api/advisor-activities/:id", requireAuth("submit"), async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const existing = (await storage.listAdvisorActivities()).find((a) => a.id === id);
    if (!existing) return res.status(404).json({ message: "Not found" });
    if (req.user!.role !== "admin" && existing.createdBy !== req.user!.id) {
      return res.status(403).json({ message: "You can only edit your own activity entries" });
    }
    const parsed = advisorActivityInputSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid activity" });
    const updated = await storage.updateAdvisorActivity(id, parsed.data);
    res.json(updated);
  });

  app.delete("/api/advisor-activities/:id", requireAuth("submit"), async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const existing = (await storage.listAdvisorActivities()).find((a) => a.id === id);
    if (!existing) return res.status(404).json({ message: "Not found" });
    if (req.user!.role !== "admin" && existing.createdBy !== req.user!.id) {
      return res.status(403).json({ message: "You can only delete your own activity entries" });
    }
    await storage.deleteAdvisorActivity(id);
    res.json({ ok: true });
  });

  // ---------- Settings (v5.5 — approval workflow configuration) ----------
  // Read: any signed-in staff member needs the COO address for the approval email button.
  app.get("/api/settings", requireAuth(), async (_req, res) => {
    res.json({ cooEmail: (await storage.getMeta("coo_email")) ?? "" });
  });

  app.put("/api/admin/settings", requireAuth("admin"), async (req, res) => {
    const parsed = z.object({ cooEmail: z.string().trim().email().or(z.literal("")) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid email address" });
    await storage.setMeta("coo_email", parsed.data.cooEmail);
    res.json({ cooEmail: parsed.data.cooEmail });
  });

  // ---------- AI: sync advisor profile from a URL (e.g. LinkedIn) or pasted text (DeepSeek) ----------
  app.post("/api/ai/advisor-extract", requireAuth("submit"), async (req, res) => {
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    const pasted = typeof req.body?.text === "string" ? req.body.text : "";

    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(503).json({
        message: "AI extraction is not configured on this deployment. Set the DEEPSEEK_API_KEY environment variable to enable it.",
      });
    }

    let pageText = "";
    let fetchFailed = false;
    if (url && /^https?:\/\//i.test(url)) {
      const t = await fetchPageText(url);
      if (t && t.trim().length >= 80) pageText = t;
      else fetchFailed = true;
    }
    if (!pageText && pasted.trim().length < 40) {
      return res.status(422).json({
        message: fetchFailed
          ? "Could not read that page — LinkedIn and some sites block automated access. Open the profile, copy the text, and paste it instead."
          : "Provide a profile URL or paste the profile text",
        fetchFailed,
      });
    }

    try {
      const instruction = `You are a data-entry assistant for the advisor CRM of Gobi Partners, a venture capital firm. The material below is a professional profile (often LinkedIn) — it may be English, Chinese, or mixed.

Return ONLY a JSON object with these keys (use empty string "" when unknown; never invent facts):
{
  "name": "person's full name in English",
  "nameCn": "person's name in Chinese if present",
  "background": "2-4 sentence English professional bio: current position, prior experience, education, notable achievements",
  "domains": "comma-separated expertise areas, e.g. 'Biotech, University tech transfer, AI'",
  "roles": [{ "title": "job title", "organization": "organisation name", "isPrimary": 1 for the current main role else 0 }],
  "cohort": "graduation year or notable cohort if evident, else empty"
}`;
      const textBlock = [
        instruction,
        pageText ? `\nFETCHED PAGE CONTENT (${url}):\n"""\n${pageText.slice(0, 12000)}\n"""` : "",
        pasted.trim() ? `\nPASTED PROFILE TEXT:\n"""\n${pasted.slice(0, 12000)}\n"""` : "",
      ].join("\n");

      const resp = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: textBlock }],
          response_format: { type: "json_object" },
          max_tokens: 1200,
        }),
      });
      if (!resp.ok) throw new Error(`DeepSeek API error ${resp.status}: ${await resp.text()}`);
      const completion: any = await resp.json();
      const raw: string = completion.choices?.[0]?.message?.content ?? "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in model output");
      const data = JSON.parse(jsonMatch[0]);
      res.json({
        name: String(data.name ?? ""),
        nameCn: String(data.nameCn ?? ""),
        background: String(data.background ?? ""),
        domains: String(data.domains ?? ""),
        cohort: String(data.cohort ?? ""),
        roles: Array.isArray(data.roles)
          ? data.roles
              .filter((r: any) => r && typeof r.title === "string" && r.title.trim())
              .slice(0, 8)
              .map((r: any) => ({
                title: String(r.title),
                organization: r.organization ? String(r.organization) : null,
                isPrimary: r.isPrimary === 1 || r.isPrimary === true ? 1 : 0,
              }))
          : [],
        sourceUrl: url || null,
        fetched: !!pageText,
      });
    } catch (err: any) {
      console.error("AI advisor extract failed:", err);
      res.status(500).json({ message: "AI extraction failed — please fill the form manually" });
    }
  });

  // ---------- AI: extract partnership from pasted text, PDF, or DOCX (DeepSeek, text-only) ----------
  const aiFileSchema = z.object({
    name: z.string(),
    mime: z.string(),
    data: z.string(), // base64
  });

  app.post("/api/ai/extract", requireAuth("submit"), async (req, res) => {
    const text: string = typeof req.body?.text === "string" ? req.body.text : "";
    const filesRaw = Array.isArray(req.body?.files) ? req.body.files.slice(0, 4) : [];
    const files = filesRaw
      .map((f: unknown) => aiFileSchema.safeParse(f))
      .filter((r: any) => r.success)
      .map((r: any) => r.data as z.infer<typeof aiFileSchema>);

    if (text.trim().length < 20 && files.length === 0) {
      return res.status(400).json({ message: "Paste text or upload a PDF or DOCX" });
    }

    // The extraction model is text-only — images cannot be read
    if (files.some((f: { mime: string }) => f.mime.startsWith("image/"))) {
      return res.status(415).json({
        message: "Images are not supported for AI quick-fill — please paste the text or upload a PDF/DOCX instead",
      });
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(503).json({
        message:
          "AI extraction is not configured on this deployment. Set the DEEPSEEK_API_KEY environment variable to enable it.",
      });
    }

    try {
      let docText = "";
      const sources: { kind: "pdf" | "docx" | "link" | "text"; label: string; fetched?: boolean }[] = [];

      // Detect links in the pasted text and fetch their content server-side.
      const urls = Array.from(new Set(text.match(URL_RE) ?? [])).slice(0, 3);
      let webText = "";
      for (const url of urls) {
        const pageText = await fetchPageText(url);
        sources.push({ kind: "link", label: url, fetched: pageText !== null });
        if (pageText) webText += `\n\n--- WEB PAGE: ${url} ---\n${pageText}`;
      }
      const plainText = text.replace(URL_RE, " ").trim();
      if (plainText.length >= 20) sources.push({ kind: "text", label: "pasted text" });

      for (const f of files) {
        if (attachmentTooLarge(f.data)) continue;
        if (f.mime === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
          sources.push({ kind: "pdf", label: f.name });
          const { extractText, getDocumentProxy } = await import("unpdf");
          const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(f.data, "base64")));
          const { text: pdfText } = await extractText(pdf, { mergePages: true });
          docText += `\n\n--- ${f.name} ---\n${pdfText.slice(0, 12000)}`;
        } else if (
          f.mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          f.name.toLowerCase().endsWith(".docx")
        ) {
          sources.push({ kind: "docx", label: f.name });
          const result = await mammoth.extractRawText({ buffer: Buffer.from(f.data, "base64") });
          docText += `\n\n--- ${f.name} ---\n${result.value.slice(0, 12000)}`;
        }
      }

      const instruction = `You are a data-entry assistant for the partnership CRM of Gobi Partners, a venture capital firm. Analyse the material below (pasted text, fetched web pages, PDF or Word document text — may be English, Chinese, or mixed).

STEP 1 — CLASSIFY: Determine what the material is (email thread, meeting notes, press release, news article, MOU or agreement, company webpage, event brochure, etc.).
STEP 2 — UNDERSTAND: Show you understood it: who the partner organisation is and what collaboration it describes.
STEP 3 — RELATIONSHIP: Describe the relationship between Gobi Partners and the partner: how they are connected, its history and depth, and the key people on both sides.
STEP 4 — EXTRACT: Then fill the CRM fields.

Return ONLY a JSON object with these keys (use empty string "" when unknown):
{
  "materialType": "very short label for what the material is, e.g. 'Email thread', 'Press release', 'MOU document', 'News article', 'Meeting notes'",
  "materialTypeCn": "the same label in Chinese",
  "understandingEn": "2-3 sentences in English: what this material is and what it says about the partnership",
  "understandingCn": "the same understanding in Chinese",
  "relationshipEn": "2-3 sentences in English on the Gobi-partner relationship: how it started or was introduced, its nature and depth, key people involved on both sides",
  "relationshipCn": "the same relationship summary in Chinese",
  "nameEn": "partner organisation name in English",
  "nameCn": "partner organisation name in Chinese",
  "category": one of ${JSON.stringify(CATEGORIES)},
  "region": one of ${JSON.stringify(REGIONS)} (hongkong=Hong Kong, mainland=Chinese Mainland, taiwan=Taiwan, macau=Macau; singapore/malaysia/indonesia/vietnam/philippines=Southeast Asia; japan/korea=Northeast Asia; pakistan=South Asia; global=elsewhere or cannot be determined; judge by the partner's domicile),
  "website": "https://... if mentioned or confidently known",
  "descriptionEn": "1-2 sentence English summary of the partnership/collaboration",
  "descriptionCn": "1-2 sentence Chinese summary of the partnership/collaboration",
  "contactName": "main contact person at the partner org",
  "contactEmail": "contact email",
  "picNames": ["array of Gobi Partners people in charge (PIC), identified automatically. Use EXACT names from the staff list below. Look for: explicit mentions of Gobi staff; @gobi.vc email addresses (map the local part to the closest staff name, e.g. fred@gobi.vc → Fred Li); email signatures; meeting attendee lists. Only include people with clear evidence — do not guess from topic alone."],
  "context": "fuller background paragraph capturing the narrative of the material",
  "partnershipType": "short label e.g. 'Joint fund', 'Deal flow MOU', 'Co-incubation'",
  "startDate": "YYYY-MM-DD — REQUIRED, never leave empty. If no explicit date appears, give your best estimate from the material's context or your own knowledge of this partnership (announcements, news). If only a year or month is known, use the first day, e.g. 2024-01-01",
  "stage": one of ${JSON.stringify(STAGES)} (s1_new=identified target only, s2_engaged=in contact / meetings held, s3_agreement=MOU or agreement signed, s4_progressive=active deepening collaboration, s5_strategic=flagship strategic partnership),
  "notes": "any other useful details (dates, follow-ups, people)"
}

GOBI PARTNERS STAFF LIST (name — title — office):
${GOBI_STAFF.map((s) => `${s.name} — ${s.title} — ${s.office}`).join("\n")}`;

      const textBlock = [
        instruction,
        text.trim() ? `\nPASTED TEXT:\n"""\n${text.slice(0, 12000)}\n"""` : "",
        webText ? `\nFETCHED WEB PAGE CONTENT (from links in the pasted text):\n"""\n${webText.slice(0, 20000)}\n"""` : "",
        docText ? `\nDOCUMENT CONTENT:\n"""\n${docText}\n"""` : "",
      ].join("\n");

      const resp = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: textBlock }],
          response_format: { type: "json_object" },
          max_tokens: 2200,
        }),
      });
      if (!resp.ok) throw new Error(`DeepSeek API error ${resp.status}: ${await resp.text()}`);
      const completion: any = await resp.json();
      const raw: string = completion.choices?.[0]?.message?.content ?? "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in model output");
      const data = JSON.parse(jsonMatch[0]);
      const stage = (STAGES as readonly string[]).includes(data.stage) ? data.stage : "s2_engaged";
      const cleaned = {
        materialType: String(data.materialType ?? ""),
        materialTypeCn: String(data.materialTypeCn ?? ""),
        understandingEn: String(data.understandingEn ?? ""),
        understandingCn: String(data.understandingCn ?? ""),
        relationshipEn: String(data.relationshipEn ?? ""),
        relationshipCn: String(data.relationshipCn ?? ""),
        sources,
        nameEn: String(data.nameEn ?? ""),
        nameCn: String(data.nameCn ?? ""),
        category: (CATEGORIES as readonly string[]).includes(data.category) ? data.category : "other",
        region: (REGIONS as readonly string[]).includes(data.region) ? data.region : "hongkong",
        website: String(data.website ?? ""),
        descriptionEn: String(data.descriptionEn ?? ""),
        descriptionCn: String(data.descriptionCn ?? ""),
        contactName: String(data.contactName ?? ""),
        contactEmail: String(data.contactEmail ?? ""),
        picNames: Array.isArray(data.picNames)
          ? data.picNames.filter((n: unknown) => GOBI_STAFF.some((s) => s.name === n))
          : GOBI_STAFF.some((s) => s.name === data.picName) ? [String(data.picName)] : [],
        context: String(data.context ?? ""),
        partnershipType: String(data.partnershipType ?? ""),
        startDate: String(data.startDate ?? ""),
        stage,
        collabLevel: STAGE_LEVEL[stage] ?? 2,
        notes: String(data.notes ?? ""),
      };
      res.json(cleaned);
    } catch (err: any) {
      console.error("AI extract failed:", err);
      res.status(500).json({ message: "AI extraction failed — please fill the form manually" });
    }
  });

  return httpServer;
}

import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { storage, hashPassword, verifyPassword } from "./storage.js";
import { mailEnabled, sendMail, sendOutreach, outreachHtml, registrationEmail, resetEmail } from "./mailer.js";
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
import type { SafeUser, User, AuditAction, Advisor, AdvisorRole, SectorTag, Partnership } from "../shared/schema.js";
import mammoth from "mammoth";
import { invitationLetterHtml, invitationLetterDocx, letterFilename, DEFAULT_LETTER_BODY, DEFAULT_LETTER_ACK } from "./letter.js";
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

// Fetch a page and return the visible text, a best-guess portrait photo URL, and
// the scored list of image candidates (for AI-assisted portrait selection).
async function fetchPageMeta(url: string): Promise<{ text: string | null; photoUrl: string | null; photoCandidates: ImageCandidate[] }> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GobiPortal/4.3)" },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!resp.ok) return { text: null, photoUrl: null, photoCandidates: [] };
    const type = resp.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text")) return { text: null, photoUrl: null, photoCandidates: [] };
    const html = await resp.text();
    const text = htmlToText(html).slice(0, 10_000);
    const photoUrl = extractPhotoUrl(html, resp.url || url);
    const photoCandidates = collectImageCandidates(html, resp.url || url);
    return { text, photoUrl, photoCandidates };
  } catch {
    return { text: null, photoUrl: null, photoCandidates: [] };
  }
}

// ---------- Portrait photo selection preset ----------
// Auto-sync previously trusted og:image, which on company pages is usually the
// company LOGO, not the person. We now collect every plausible <img> with its
// alt/class context, hard-exclude anything that looks like a logo or decoration,
// score the rest by portrait hints, and let the AI pick the person's photo from
// the shortlist (falling back to the best-scored person-hinted candidate).
interface ImageCandidate {
  url: string;
  alt: string;
  near: string;
  score: number;
}

const IMG_EXCLUDE_RE = /(logo|icon|favicon|sprite|placeholder|blank|spacer|banner|footer|header-img|qrcode|qr-code|wordmark|brandmark|watermark|badge|seal|flag|map|arrow|button|bg[-_.]|background|pattern|divider)/i;

function collectImageCandidates(html: string, base: string): ImageCandidate[] {
  const seen = new Set<string>();
  const out: ImageCandidate[] = [];
  const personHintRe = /(headshot|portrait|avatar|profile|person|people|member|team|staff|founder|leadership|management|speaker|bio|about|dr[-_]|prof[-_])/i;

  const push = (rawUrl: string | undefined, alt: string, context: string, baseScore: number, near = "") => {
    if (!rawUrl) return;
    const abs = absolutize(rawUrl, base);
    if (!abs || seen.has(abs)) return;
    // Hard exclusions: vector/animated assets and anything logo-like in URL, alt, or class context
    if (/\.(svg|gif|ico)(\?|#|$)/i.test(abs)) return;
    if (IMG_EXCLUDE_RE.test(abs) || IMG_EXCLUDE_RE.test(alt) || IMG_EXCLUDE_RE.test(context)) return;
    seen.add(abs);
    let score = baseScore;
    if (personHintRe.test(abs) || personHintRe.test(context)) score += 3;
    // alt text that looks like a person's name ("Percy Cheng", "Dr. Nancy Man", CJK names)
    if (/([A-Z][a-z]+\s+[A-Z][A-Za-z]+)|(^(Dr|Prof|Ir|Mr|Ms|Mrs)\.?\s)/.test(alt) || /^[\u4e00-\u9fff\u00b7\s]{2,8}$/.test(alt.trim())) score += 2;
    out.push({ url: abs, alt: alt.slice(0, 120), near: near.slice(0, 160), score });
  };

  // v5.14 — capture the caption text that follows each image (team cards put
  // the person's name right after their photo), so a photo can be tied to a
  // specific person even when the alt attribute is empty.
  for (const m of Array.from(html.matchAll(/<img\b[^>]*>/gi))) {
    const tag = m[0];
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] || tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1];
    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "";
    const near = html
      .slice((m.index ?? 0) + tag.length, (m.index ?? 0) + tag.length + 600)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    push(src, alt, tag, 1, near);
  }
  // og:image joins the pool as a low-priority candidate — never the automatic winner
  const og = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i)?.[1];
  push(og, "page share image (often the company logo)", "og:image", 0, "");

  // v5.14 — return a wide pool (callers trim AFTER identity boosting): on a
  // large team page every portrait scores the same, and a cap applied here
  // would cut people who appear late in the document — exactly the target
  // person the advisor sync is looking for.
  return out.sort((a, b) => b.score - a.score).slice(0, 40);
}

function absolutize(candidate: string, base: string): string | null {
  const raw = candidate.trim();
  if (!raw || raw.startsWith("data:")) return null;
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

function extractPhotoUrl(html: string, base: string): string | null {
  // 1) Open Graph / Twitter card images (most reliable for profile pages)
  const metaPatterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
  ];
  for (const re of metaPatterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const abs = absolutize(m[1], base);
      if (abs) return abs;
    }
  }
  // 2) A prominent headshot/profile <img> by hint words in class/alt/src
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const hintRe = /(profile|headshot|avatar|portrait|photo|team|people|staff|bio)/i;
  for (const tag of imgTags) {
    if (!hintRe.test(tag)) continue;
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] || tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    if (/(sprite|logo|icon|placeholder|blank|spacer)/i.test(src)) continue;
    const abs = absolutize(src, base);
    if (abs) return abs;
  }
  return null;
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
    // Auto-approved colleagues are signed in immediately — no separate login step
    if (autoApproved) {
      const session = await storage.createSession(user.id);
      return res.status(201).json({ user: safe(user), autoApproved, emailSent, token: session.token });
    }
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

  // v5.12 — change own password. Requires the current password, except when an
  // admin force-reset flagged the account (the user just proved the temp
  // password at login, and does not keep it around).
  app.post("/api/auth/password", requireAuth(), async (req: AuthedRequest, res) => {
    const parsed = z.object({
      currentPassword: z.string().optional(),
      newPassword: z.string().min(6).max(100),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Password must be at least 6 characters" });
    const user = req.user!;
    if (!user.mustChangePassword) {
      if (!parsed.data.currentPassword || !verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
        return res.status(400).json({ message: "wrong_current_password" });
      }
    }
    if (parsed.data.currentPassword && parsed.data.currentPassword === parsed.data.newPassword) {
      return res.status(400).json({ message: "same_password" });
    }
    const updated = await storage.updateUser(user.id, {
      passwordHash: hashPassword(parsed.data.newPassword),
      mustChangePassword: 0,
      resetTokenHash: null,
      resetExpires: null,
    });
    res.json({ user: safe(updated!) });
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

  // Viewer → admin: request edit (staff) rights; shows up in the admin team table
  app.post("/api/me/request-edit", requireAuth(), async (req: AuthedRequest, res) => {
    if (req.user!.role !== "viewer") return res.status(400).json({ message: "Only viewers can request edit rights" });
    const updated = await storage.updateUser(req.user!.id, { editRequestedAt: new Date().toISOString() } as Partial<User>);
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
      // token-subset match in either direction, e.g. "Hing Ka Cheng" vs "Hing Cheng"
      members.find((m) => {
        const a = normalizeName(m.name).split(" ");
        const b = me.split(" ");
        if (a.length < 2 || b.length < 2) return false;
        return a.every((tok) => b.includes(tok)) || b.every((tok) => a.includes(tok));
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
      // Prefer the name currently typed in the form (may be unsaved) over the stored one
      const formName = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";
      const result = await syncUserFromGobi(req.user!.id, formName || req.user!.name);
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
      const formName = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";
      const result = await syncUserFromGobi(target.id, formName || target.name);
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
      // Any role decision resolves an outstanding edit-rights request
      (data as Partial<User>).editRequestedAt = null;
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
      : { ...a, emails: null, engagement: null, birthDay: null, birthMonth: null, birthYear: null, mobile: null, wechatId: null, originStaff: null };

  const sortTags = (tags: SectorTag[]) => tags.sort((x, y) => x.sortOrder - y.sortOrder || x.nameEn.localeCompare(y.nameEn));
  async function advisorTagMap(): Promise<Map<number, SectorTag[]>> {
    const [allTags, allLinks] = await Promise.all([storage.listSectorTags(), storage.listAdvisorTagIds()]);
    const tagById = new Map(allTags.map((t) => [t.id, t]));
    const map = new Map<number, SectorTag[]>();
    for (const at of allLinks) {
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
    const staff = isStaffUser(req.user);
    // One parallel round-trip to the database instead of four sequential ones.
    const [all, roles, tagsByAdvisor, activities] = await Promise.all([
      storage.listAdvisors(),
      storage.listAdvisorRoles(),
      advisorTagMap(),
      staff ? storage.listAdvisorActivities() : Promise.resolve([]),
    ]);
    const visible = all.filter(
      (a) => a.status === "approved" || isAdmin || a.submittedBy === req.user!.id,
    );
    const byAdvisor = new Map<number, AdvisorRole[]>();
    for (const r of roles) {
      const list = byAdvisor.get(r.advisorId) ?? [];
      list.push(r);
      byAdvisor.set(r.advisorId, list);
    }
    const lastByAdvisor = new Map<number, string>();
    for (const act of activities) {
      const prev = lastByAdvisor.get(act.advisorId);
      if (!prev || act.date > prev) lastByAdvisor.set(act.advisorId, act.date);
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
    const [a, allRoles, tagMap] = await Promise.all([
      storage.getAdvisor(Number(req.params.id)),
      storage.listAdvisorRoles(),
      advisorTagMap(),
    ]);
    if (!a) return res.status(404).json({ message: "Not found" });
    const isAdmin = req.user!.role === "admin";
    if (a.status !== "approved" && !isAdmin && a.submittedBy !== req.user!.id) {
      return res.status(404).json({ message: "Not found" });
    }
    const roles = allRoles
      .filter((r) => r.advisorId === a.id)
      .sort((x, y) => y.isPrimary - x.isPrimary || x.sortOrder - y.sortOrder);
    const tags = tagMap.get(a.id) ?? [];
    res.json({ ...redactAdvisor(a, req.user), roles, tags });
  });

  // Create — staff submissions await approval; admin entries go live at once
  // ---------- v5.15: advisor role ↔ partner organization auto-linking ----------
  // Free-text organizations on advisor roles are resolved against the partner
  // registry with a confidence ladder (exact → alias → acronym → CN containment).
  // Only a unique best-level match links; ambiguity leaves the role untouched.
  const ORG_ACRO_STOP = new Set(["the", "of", "and", "for", "at", "in", "a", "an"]);
  const orgCollapse = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  const cjkOnly = (s: string) => (s.match(/[\u4e00-\u9fff]/g) ?? []).join("");
  const orgSigTokens = (s: string) =>
    s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0 && !ORG_ACRO_STOP.has(t));
  const orgInitials = (s: string) => {
    const toks = orgSigTokens(s);
    return toks.length >= 2 ? toks.map((t) => t[0]).join("") : "";
  };
  const sortChars = (s: string) => s.split("").sort().join("");

  function orgMatchLevel(orgText: string, p: { nameEn: string; nameCn: string | null }): number {
    const t = orgText.trim();
    if (!t) return 0;
    const tc = orgCollapse(t);
    const cnT = cjkOnly(t);
    const cnP = cjkOnly(p.nameCn ?? "");
    // Aliases: paren-stripped name plus each parenthesised alias — "HKU Medicine (HKUMed)" → ["HKU Medicine", "HKUMed"]
    const aliases = [
      p.nameEn.replace(/\([^)]*\)/g, " ").trim(),
      ...Array.from(p.nameEn.matchAll(/\(([^)]+)\)/g)).map((m) => m[1].trim()),
    ].filter(Boolean);
    const pc = orgCollapse(p.nameEn);
    if (tc.length >= 2 && tc === pc) return 5;
    if (cnT.length >= 2 && cnP.length >= 2 && cnT === cnP) return 5;
    const aliasCollapsed = aliases.map(orgCollapse);
    if (tc.length >= 2 && aliasCollapsed.includes(tc)) return 4;
    const iT = orgInitials(t);
    const iAliases = aliases.map(orgInitials).filter((a) => a.length >= 3);
    if (iT.length >= 3 && (iT === pc || aliasCollapsed.includes(iT))) return 3; // long text vs acronym-named partner ("The Hong Kong University of Science and Technology" vs "HKUST")
    if (iAliases.some((a) => a === tc)) return 3; // acronym text vs long partner name
    if (iT.length >= 3 && iAliases.some((a) => a === iT)) return 3; // both long, same initials
    if (tc.length >= 3 && tc.length <= 6 && iAliases.some((a) => sortChars(a) === sortChars(tc))) return 2; // word-order-free acronym: "HKU" vs "The University of Hong Kong"
    if (cnT.length >= 4 && cnP.length >= 2 && (cnT.includes(cnP) || cnP.includes(cnT))) return 1;
    return 0;
  }

  function resolveOrgPartner(orgText: string | null | undefined, partners: Partnership[]): number | null {
    if (!orgText || !orgText.trim()) return null;
    let bestLevel = 0;
    let matches: number[] = [];
    for (const p of partners) {
      if (p.status === "rejected") continue;
      const lvl = orgMatchLevel(orgText, p);
      if (lvl > bestLevel) { bestLevel = lvl; matches = [p.id]; }
      else if (lvl === bestLevel && lvl > 0) matches.push(p.id);
    }
    return bestLevel > 0 && matches.length === 1 ? matches[0] : null;
  }

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
      mobile: data.mobile ?? null,
      wechatId: data.wechatId ?? null,
      originStaff: data.originStaff ?? data.gobiPics ?? null, // default: origin = initial PIC
      lifecycleStatus: data.lifecycleStatus ?? "proposed",
      onboardedAt: data.lifecycleStatus === "onboarded" ? new Date().toISOString().slice(0, 10) : null,
      approvalEmailedAt: null,
      approvedAt: null,
      letterIssuedAt: null,
      signedBackAt: null,
      status: isAdmin ? "approved" : "pending",
      submittedBy: req.user!.id,
      createdAt: new Date().toISOString(),
    });
    if (tagIds) await storage.setAdvisorTags(created.id, tagIds);
    const partnersForLink = await storage.listPartnerships();
    const savedRoles = await storage.setAdvisorRoles(
      created.id,
      roles.map((r, i) => ({
        title: r.title,
        organization: r.organization ?? null,
        partnershipId: r.partnershipId ?? resolveOrgPartner(r.organization, partnersForLink),
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
    const { roles, status, tagIds, lifecycleStatus, ...data } = parsed.data;
    const patch: Partial<Advisor> = { ...data } as Partial<Advisor>;
    if (isAdmin && status) patch.status = status;
    // Lifecycle status is admin-only and normally changes via /workflow; allow admins to set it here too.
    if (isAdmin && lifecycleStatus) {
      patch.lifecycleStatus = lifecycleStatus;
      if (lifecycleStatus === "onboarded") patch.onboardedAt = existing.onboardedAt ?? new Date().toISOString().slice(0, 10);
    }
    // Roles-only PATCHes are valid — skip the advisor update when nothing else changed
    const updated = Object.keys(patch).length > 0 ? await storage.updateAdvisor(id, patch) : existing;
    if (tagIds) await storage.setAdvisorTags(id, tagIds);
    let savedRoles: AdvisorRole[] | undefined;
    if (roles) {
      const partnersForLink = await storage.listPartnerships();
      savedRoles = await storage.setAdvisorRoles(
        id,
        roles.map((r, i) => ({
          title: r.title,
          organization: r.organization ?? null,
          partnershipId: r.partnershipId ?? resolveOrgPartner(r.organization, partnersForLink),
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

  // v5.15 — idempotent backfill: re-run the org resolver over every advisor role
  // that has organization text but no partner link. Admin-only; safe to repeat.
  app.post("/api/admin/relink-advisor-orgs", requireAuth("admin"), async (_req: AuthedRequest, res) => {
    const partners = await storage.listPartnerships();
    const advisors = await storage.listAdvisors();
    const allRoles = await storage.listAdvisorRoles();
    let checked = 0;
    const linked: Array<{ advisorId: number; advisor: string; organization: string; partnershipId: number }> = [];
    for (const a of advisors) {
      const mine = allRoles
        .filter((r) => r.advisorId === a.id)
        .sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0));
      if (mine.length === 0) continue;
      let changed = false;
      const next = mine.map((r) => {
        checked++;
        if (r.partnershipId || !r.organization) return r;
        const pid = resolveOrgPartner(r.organization, partners);
        if (pid) {
          changed = true;
          linked.push({ advisorId: a.id, advisor: a.name, organization: r.organization, partnershipId: pid });
          return { ...r, partnershipId: pid };
        }
        return r;
      });
      if (changed) {
        await storage.setAdvisorRoles(
          a.id,
          next.map(({ id: _id, advisorId: _aid, ...rest }) => rest),
        );
      }
    }
    res.json({ checked, linkedCount: linked.length, linked });
  });

  // ---------- Advisor onboarding workflow (v5.8) ----------
  // Advance a stage or change lifecycle status. Each transition is timestamped and logged.
  const WORKFLOW_STAGES = ["approval_emailed", "approved", "letter_issued", "signed_back"] as const;
  app.post("/api/advisors/:id/workflow", requireAuth("submit"), async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const advisor = await storage.getAdvisor(id);
    if (!advisor) return res.status(404).json({ message: "Not found" });
    const isAdmin = req.user!.role === "admin";
    const parsed = z.object({
      stage: z.enum(WORKFLOW_STAGES).optional(),
      lifecycleStatus: z.enum(["proposed", "onboarded", "terminated"]).optional(),
      undo: z.boolean().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid workflow request" });
    const { stage, lifecycleStatus, undo } = parsed.data;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const patch: Partial<Advisor> = {};
    let logNote = "";

    if (stage) {
      // Approving / issuing the letter is admin-gated; emailing and signing-back are open to staff.
      if ((stage === "approved" || stage === "letter_issued") && !isAdmin) {
        return res.status(403).json({ message: "Only admins can approve or issue the invitation letter" });
      }
      const col = ({
        approval_emailed: "approvalEmailedAt",
        approved: "approvedAt",
        letter_issued: "letterIssuedAt",
        signed_back: "signedBackAt",
      } as const)[stage];
      (patch as any)[col] = undo ? null : now;
      const label = ({
        approval_emailed: "Approval email sent to COO office & Fred Li",
        approved: "Onboarding approved",
        letter_issued: "Invitation letter issued",
        signed_back: "Signed invitation returned — onboarding complete",
      } as const)[stage];
      logNote = undo ? `Reverted: ${label}` : label;
      // Completing the sign-back automatically marks the advisor Onboarded.
      if (stage === "signed_back" && !undo && advisor.lifecycleStatus !== "terminated") {
        patch.lifecycleStatus = "onboarded";
        patch.onboardedAt = advisor.onboardedAt ?? today;
      }
    }

    if (lifecycleStatus) {
      if (!isAdmin) return res.status(403).json({ message: "Only admins can change lifecycle status" });
      patch.lifecycleStatus = lifecycleStatus;
      patch.onboardedAt =
        lifecycleStatus === "onboarded" ? (advisor.onboardedAt ?? today) : advisor.onboardedAt ?? null;
      logNote = logNote
        ? `${logNote}; status → ${lifecycleStatus}`
        : `Lifecycle status changed to ${lifecycleStatus}`;
    }

    if (Object.keys(patch).length === 0) return res.status(400).json({ message: "Nothing to change" });
    const updated = await storage.updateAdvisor(id, patch);
    // Log the transition into the advisor's activity feed for the audit trail.
    try {
      await storage.createAdvisorActivity({
        advisorId: id,
        date: today,
        type: "note",
        note: `[Workflow] ${logNote}`,
        createdBy: req.user!.id,
        createdByName: req.user!.name,
        createdAt: now,
      });
    } catch {}
    const roles = (await storage.listAdvisorRoles()).filter((r) => r.advisorId === id);
    res.json({ ...updated, roles });
  });

  // v5.11 — admin-editable letter template overrides (empty meta -> firm default)
  const letterOverrides = async () => ({
    body: (await storage.getMeta("tpl_letter_body")) ?? "",
    ack: (await storage.getMeta("tpl_letter_ack")) ?? "",
  });

  // Generate the advisor invitation letter as an HTML document (client prints to PDF).
  app.get("/api/advisors/:id/invitation-letter", requireAuth("submit"), async (req: AuthedRequest, res) => {
    const advisor = await storage.getAdvisor(Number(req.params.id));
    if (!advisor) return res.status(404).json({ message: "Not found" });
    const roles = (await storage.listAdvisorRoles())
      .filter((r) => r.advisorId === advisor.id)
      .sort((x, y) => y.isPrimary - x.isPrimary || x.sortOrder - y.sortOrder);
    const primaryRole = roles[0];
    const html = invitationLetterHtml(advisor, primaryRole ?? null, await letterOverrides());
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  // v5.10 — same letter as a Word document (for signing workflows / manual edits)
  app.get("/api/advisors/:id/invitation-letter.docx", requireAuth("submit"), async (req: AuthedRequest, res) => {
    const advisor = await storage.getAdvisor(Number(req.params.id));
    if (!advisor) return res.status(404).json({ message: "Not found" });
    const roles = (await storage.listAdvisorRoles())
      .filter((r) => r.advisorId === advisor.id)
      .sort((x, y) => y.isPrimary - x.isPrimary || x.sortOrder - y.sortOrder);
    try {
      const buf = await invitationLetterDocx(advisor, roles[0] ?? null, await letterOverrides());
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${letterFilename(advisor, "docx")}"`);
      res.send(buf);
    } catch (err) {
      console.error("Letter DOCX generation failed:", err);
      res.status(500).json({ message: "Letter generation failed" });
    }
  });

  // ---------- CSV export (v5.8 — contacts for other teams) ----------
  // Staff-only (contact emails are staff-visible). LP status respects IR visibility.
  const csvCell = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csvRow = (cells: unknown[]) => cells.map(csvCell).join(",");

  app.get("/api/export/advisors.csv", requireAuth("submit"), async (req: AuthedRequest, res) => {
    if (!isStaffUser(req.user)) return res.status(403).json({ message: "Staff only" });
    const advisors = (await storage.listAdvisors()).filter((a) => a.status === "approved");
    const roles = await storage.listAdvisorRoles();
    const rolesBy = new Map<number, AdvisorRole[]>();
    for (const r of roles) { const l = rolesBy.get(r.advisorId) ?? []; l.push(r); rolesBy.set(r.advisorId, l); }
    const header = ["Name (EN)", "Name (CN)", "Lifecycle status", "Type", "Track", "Pillar", "Primary title", "Primary organization", "Emails", "Mobile", "WeChat ID", "Domains", "Origin staff", "Gobi PIC", "Cohort", "Onboarded date", "Profile URL"];
    const lines = [csvRow(header)];
    advisors.sort((a, b) => a.name.localeCompare(b.name));
    for (const a of advisors) {
      const rs = (rolesBy.get(a.id) ?? []).sort((x, y) => y.isPrimary - x.isPrimary || x.sortOrder - y.sortOrder);
      const primary = rs[0];
      lines.push(csvRow([
        a.name, a.nameCn ?? "", a.lifecycleStatus, a.advisorType, a.track, a.pillar,
        primary?.title ?? "", primary?.organization ?? "",
        (a.emails ?? []).join("; "), a.mobile ?? "", a.wechatId ?? "", a.domains ?? "",
        (a.originStaff ?? []).join("; "), (a.gobiPics ?? []).join("; "),
        a.cohort ?? "", a.onboardedAt ?? "", a.profileUrl ?? a.linkedinUrl ?? "",
      ]));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="gobi-advisors-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send("\uFEFF" + lines.join("\n")); // BOM for Excel UTF-8
  });

  app.get("/api/export/partners.csv", requireAuth("submit"), async (req: AuthedRequest, res) => {
    if (!isStaffUser(req.user)) return res.status(403).json({ message: "Staff only" });
    const partners = (await storage.listPartnerships()).filter((p) => p.status === "approved");
    const seeLp = canSeeLp(req.user);
    const header = ["Name (EN)", "Name (CN)", "Category", "Region", "Stage", "Collab level", "Partnership type", "Contact name", "Contact email", "Gobi PIC", "Website", "Start date", ...(seeLp ? ["LP status"] : [])];
    const lines = [csvRow(header)];
    partners.sort((a, b) => (b.collabLevel - a.collabLevel) || a.nameEn.localeCompare(b.nameEn));
    for (const p of partners) {
      lines.push(csvRow([
        p.nameEn, p.nameCn ?? "", p.category, p.region, p.stage, p.collabLevel,
        p.partnershipType ?? "", p.contactName ?? "", p.contactEmail ?? "",
        (p.picNames ?? []).join("; "), p.website ?? "", p.startDate ?? "",
        ...(seeLp ? [p.lpStatus] : []),
      ]));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="gobi-partners-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send("\uFEFF" + lines.join("\n"));
  });

  // ---------- Team scoreboard (v5.9: staff-list base, admin-only) ----------
  // Rows are anchored to team accounts so PIC label variants ("Fred" vs
  // "Fred Li") roll up to one person. PIC labels that match no account are
  // kept as "former / unmatched" rows so departed-staff credit is never lost.
  type ScoreRow = {
    name: string; userId: number | null; role: string | null; isFormer: boolean;
    partners: number; partnersInPeriod: number;
    advOriginated: number; advManaging: number;
    advProposed: number; advOnboarded: number; advTerminated: number;
    advOnboardedInPeriod: number; advOriginatedInPeriod: number;
  };
  type LedgerAdvisor = { id: number; name: string; nameCn: string | null; lifecycleStatus: string; onboardedAt: string | null; relation: "originated" | "managing" | "both" };
  type LedgerPartner = { id: number; nameEn: string; nameCn: string | null; category: string; startDate: string | null; collabLevel: number };

  async function buildScoreboard(from: string, to: string): Promise<{ rows: ScoreRow[]; ledgers: Map<string, { advisors: LedgerAdvisor[]; partners: LedgerPartner[] }> }> {
    const inRange = (d: string | null | undefined): boolean => {
      if (!from && !to) return true;
      if (!d) return false;
      const day = d.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    };
    const staff = (await storage.listUsers()).filter((u) => u.status === "approved" && (u.role === "admin" || u.role === "staff"));
    const byFull = new Map<string, User>();
    const byFirst = new Map<string, User | null>(); // null = ambiguous first name
    staff.forEach((u) => {
      byFull.set(u.name.trim().toLowerCase(), u);
      const first = u.name.trim().split(/\s+/)[0]?.toLowerCase();
      if (first) byFirst.set(first, byFirst.has(first) ? null : u);
    });
    // Resolve a free-text PIC label to a canonical staff account (or keep as former/unmatched).
    const resolve = (label: string): { name: string; user: User | null } => {
      const trimmed = label.trim();
      if (!trimmed) return { name: "", user: null };
      const full = byFull.get(trimmed.toLowerCase());
      if (full) return { name: full.name, user: full };
      const first = byFirst.get(trimmed.toLowerCase());
      if (first) return { name: first.name, user: first };
      return { name: trimmed, user: null };
    };
    const rows = new Map<string, ScoreRow>();
    const ledgers = new Map<string, { advisors: LedgerAdvisor[]; partners: LedgerPartner[] }>();
    const ensure = (name: string, user: User | null): ScoreRow => {
      if (!rows.has(name)) {
        rows.set(name, {
          name, userId: user?.id ?? null, role: user?.role ?? null, isFormer: !user,
          partners: 0, partnersInPeriod: 0, advOriginated: 0, advManaging: 0,
          advProposed: 0, advOnboarded: 0, advTerminated: 0,
          advOnboardedInPeriod: 0, advOriginatedInPeriod: 0,
        });
        ledgers.set(name, { advisors: [], partners: [] });
      }
      return rows.get(name)!;
    };
    // Every current staff member gets a base row even with zero records.
    staff.forEach((u) => ensure(u.name, u));

    const advisors = (await storage.listAdvisors()).filter((a) => a.status === "approved");
    const partners = (await storage.listPartnerships()).filter((p) => p.status === "approved");

    advisors.forEach((a) => {
      const managing = new Set<string>();
      const originated = new Set<string>();
      (a.gobiPics ?? []).forEach((l) => { const r = resolve(l); if (r.name) managing.add(r.name); });
      (a.originStaff ?? []).forEach((l) => { const r = resolve(l); if (r.name) originated.add(r.name); });
      managing.forEach((name) => {
        const row = ensure(name, byFull.get(name.toLowerCase()) ?? null);
        row.advManaging++;
        if (a.lifecycleStatus === "proposed") row.advProposed++;
        else if (a.lifecycleStatus === "onboarded") row.advOnboarded++;
        else if (a.lifecycleStatus === "terminated") row.advTerminated++;
        if (a.lifecycleStatus === "onboarded" && inRange(a.onboardedAt)) row.advOnboardedInPeriod++;
      });
      originated.forEach((name) => {
        const row = ensure(name, byFull.get(name.toLowerCase()) ?? null);
        row.advOriginated++;
        if (a.lifecycleStatus === "onboarded" && inRange(a.onboardedAt)) row.advOriginatedInPeriod++;
      });
      const all = new Set<string>(); managing.forEach((n) => all.add(n)); originated.forEach((n) => all.add(n));
      all.forEach((name) => {
        const relation: "originated" | "managing" | "both" =
          managing.has(name) && originated.has(name) ? "both" : managing.has(name) ? "managing" : "originated";
        ledgers.get(name)!.advisors.push({ id: a.id, name: a.name, nameCn: a.nameCn, lifecycleStatus: a.lifecycleStatus, onboardedAt: a.onboardedAt, relation });
      });
    });

    partners.forEach((p) => {
      const credited = new Set<string>();
      (p.picNames ?? []).forEach((l) => { const r = resolve(l); if (r.name) credited.add(r.name); });
      credited.forEach((name) => {
        const row = ensure(name, byFull.get(name.toLowerCase()) ?? null);
        row.partners++;
        if (inRange(p.startDate ?? p.createdAt)) row.partnersInPeriod++;
        ledgers.get(name)!.partners.push({ id: p.id, nameEn: p.nameEn, nameCn: p.nameCn, category: p.category, startDate: p.startDate ?? null, collabLevel: p.collabLevel });
      });
    });

    const list = Array.from(rows.values()).sort((a, b) =>
      (Number(a.isFormer) - Number(b.isFormer)) ||
      (b.advOnboardedInPeriod - a.advOnboardedInPeriod) ||
      (b.advManaging - a.advManaging) ||
      (b.partners - a.partners) ||
      a.name.localeCompare(b.name));
    list.forEach((r) => {
      const l = ledgers.get(r.name);
      if (l) {
        l.advisors.sort((x, y) => (y.onboardedAt ?? "").localeCompare(x.onboardedAt ?? "") || x.name.localeCompare(y.name));
        l.partners.sort((x, y) => (y.collabLevel - x.collabLevel) || x.nameEn.localeCompare(y.nameEn));
      }
    });
    return { rows: list, ledgers };
  }

  app.get("/api/scoreboard", requireAuth("admin"), async (req: AuthedRequest, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : ""; // YYYY-MM-DD inclusive
    const to = typeof req.query.to === "string" ? req.query.to : "";       // YYYY-MM-DD inclusive
    const { rows } = await buildScoreboard(from, to);
    res.json({ rows, isAdmin: true, from, to });
  });

  // Click-through ledger: every record credited to one scoreboard row.
  app.get("/api/scoreboard/ledger", requireAuth("admin"), async (req: AuthedRequest, res) => {
    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
    if (!name) return res.status(400).json({ message: "Missing name" });
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    const { ledgers } = await buildScoreboard(from, to);
    const ledger = ledgers.get(name);
    if (!ledger) return res.status(404).json({ message: "No such row" });
    res.json({ name, from, to, ...ledger });
  });

  app.get("/api/export/scoreboard.csv", requireAuth("admin"), async (req: AuthedRequest, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    const { rows } = await buildScoreboard(from, to);
    const header = ["Staff", "Role", "Status", "Partners", "Partners in period", "Advisors originated", "Advisors managing", "Proposed", "Onboarded", "Terminated", "Onboarded in period", "Originated in period"];
    const lines = [csvRow(header)];
    rows.forEach((r) => {
      lines.push(csvRow([
        r.name, r.role ?? "", r.isFormer ? "former/unmatched" : "active",
        r.partners, r.partnersInPeriod, r.advOriginated, r.advManaging,
        r.advProposed, r.advOnboarded, r.advTerminated, r.advOnboardedInPeriod, r.advOriginatedInPeriod,
      ]));
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="gobi-scoreboard-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send("\uFEFF" + lines.join("\n"));
  });

  // ---------- CRM outreach to advisors (v5.8) ----------
  // Compose a per-advisor draft the caller reviews before sending. Sending is
  // done one advisor at a time (confirm-before-send on the client), either via
  // the browser mail client (mailto, built client-side) or the server SMTP.
  // v5.9 — single editable template with placeholders. The client edits the
  // subject/body ONCE; {{name}}, {{first_name}}, {{organization}} are resolved
  // per recipient (live preview client-side, defensively re-resolved on send).
  const OUTREACH_TEMPLATES: Record<string, { subject: string; body: string }> = {
    onboarding_invite: {
      subject: "Invitation to join the Gobi Advisory Network",
      body:
`Dear {{name}},

On behalf of Gobi Partners, it is our pleasure to invite you to join the Gobi Advisory Network (Global). This network connects universities, academics, and industry experts to foster the growth of technology startups with positive global impact.

As a member you will be able to:
- Attend exclusive, invitation-only Gobi events;
- Take part in project-based engagements on cutting-edge technologies;
- Connect with founders of promising next-generation companies;
- Benefit from Gobi's network and resources, and those of our investors.

The formal invitation letter is attached. To confirm your participation, kindly countersign the Acknowledgment Receipt where indicated and return a copy to us at your convenience.

To help us complete your profile, we would also be grateful if you could share a short bio (English and Chinese) and a portrait photo.

We look forward to welcoming you.

Warm regards,
Fred Li
Managing Director & Head of University Ventures, Gobi Partners
www.gobi.vc`,
    },
    general_update: {
      subject: "An update from Gobi Partners",
      body:
`Dear {{name}},

Thank you for your continued support of the Gobi Advisory Network.

[Your message here]

Warm regards,
Fred Li
Managing Director & Head of University Ventures, Gobi Partners
www.gobi.vc`,
    },
  };
  // {{first_name}} helper — skip honorifics so "Prof. Nancy Kwan" → "Nancy".
  const firstNameOf = (full: string): string => {
    const parts = full.trim().split(/\s+/).filter((p) => !/^(prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?|ir\.?|sir|dato'?|tan\s?sri)$/i.test(p));
    return parts[0] ?? full.trim();
  };
  const fillPlaceholders = (text: string, r: { name: string; firstName: string; organization: string }) =>
    text
      .replace(/\{\{\s*name\s*\}\}/gi, r.name)
      .replace(/\{\{\s*first_name\s*\}\}/gi, r.firstName)
      .replace(/\{\{\s*organization\s*\}\}/gi, r.organization);

  app.post("/api/advisors/outreach/compose", requireAuth("submit"), async (req: AuthedRequest, res) => {
    if (!isStaffUser(req.user)) return res.status(403).json({ message: "Staff only" });
    const parsed = z.object({
      advisorIds: z.array(z.number().int()).min(1).max(200),
      template: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid request" });
    const key = OUTREACH_TEMPLATES[parsed.data.template ?? ""] ? (parsed.data.template as string) : "onboarding_invite";
    // v5.11 — admin-saved overrides take precedence over the built-in defaults
    const tpl = {
      subject: (await storage.getMeta(`tpl_outreach_${key}_subject`)) || OUTREACH_TEMPLATES[key].subject,
      body: (await storage.getMeta(`tpl_outreach_${key}_body`)) || OUTREACH_TEMPLATES[key].body,
    };
    const rolesByAdvisor = new Map<number, AdvisorRole[]>();
    (await storage.listAdvisorRoles()).forEach((r) => {
      const list = rolesByAdvisor.get(r.advisorId) ?? [];
      list.push(r);
      rolesByAdvisor.set(r.advisorId, list);
    });
    const recipients: { advisorId: number; name: string; firstName: string; organization: string; to: string[] }[] = [];
    for (const idv of parsed.data.advisorIds) {
      const a = await storage.getAdvisor(idv);
      if (!a) continue;
      const roles = (rolesByAdvisor.get(a.id) ?? []).sort((x, y) => y.isPrimary - x.isPrimary || x.sortOrder - y.sortOrder);
      recipients.push({
        advisorId: a.id,
        name: a.name,
        firstName: firstNameOf(a.name),
        organization: roles[0]?.organization ?? "",
        to: a.emails ?? [],
      });
    }
    res.json({ template: { key, subject: tpl.subject, body: tpl.body }, recipients, mailEnabled });
  });

  app.post("/api/advisors/outreach/send", requireAuth("submit"), async (req: AuthedRequest, res) => {
    if (!isStaffUser(req.user)) return res.status(403).json({ message: "Staff only" });
    const parsed = z.object({
      advisorId: z.number().int(),
      to: z.string().trim().email(),
      subject: z.string().trim().min(1).max(300),
      body: z.string().trim().min(1).max(20000),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid email" });
    if (!mailEnabled) return res.status(503).json({ message: "Server email is not configured. Use the mail-client option instead." });
    const advisor = await storage.getAdvisor(parsed.data.advisorId);
    if (!advisor) return res.status(404).json({ message: "Advisor not found" });
    // Defensively resolve any placeholders the client left in, then send with
    // the Gobi-branded HTML wrapper (v5.9). Sender identity = signed-in staff.
    const roles0 = (await storage.listAdvisorRoles())
      .filter((r) => r.advisorId === advisor.id)
      .sort((x, y) => y.isPrimary - x.isPrimary || x.sortOrder - y.sortOrder);
    const rctx = {
      name: advisor.name,
      firstName: firstNameOf(advisor.name),
      organization: roles0[0]?.organization ?? "",
    };
    const subject = fillPlaceholders(parsed.data.subject, rctx);
    const body = fillPlaceholders(parsed.data.body, rctx);
    const senderEmail = req.user!.email.includes("@") ? req.user!.email : "fred@gobi.vc";
    const ok = await sendOutreach(parsed.data.to, subject, outreachHtml(body), {
      fromName: `${req.user!.name} · Gobi Partners`,
      replyTo: senderEmail,
      isHtml: true,
    });
    if (!ok) return res.status(502).json({ message: "Send failed" });
    // Log the outreach into the advisor's activity feed.
    try {
      await storage.createAdvisorActivity({
        advisorId: advisor.id,
        date: new Date().toISOString().slice(0, 10),
        type: "email",
        note: `[CRM] Sent "${subject}" to ${parsed.data.to}`,
        createdBy: req.user!.id,
        createdByName: req.user!.name,
        createdAt: new Date().toISOString(),
      });
    } catch {}
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

  // v5.12 — admin force-reset: issues a one-time temporary password and flags
  // the account so the owner must set a new password at next sign-in.
  app.post("/api/admin/users/:id/reset-password", requireAuth("admin"), async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const target = await storage.getUser(id);
    if (!target) return res.status(404).json({ message: "Not found" });
    if (target.id === req.user!.id) {
      return res.status(400).json({ message: "own_account" });
    }
    // Readable, unambiguous alphabet (no 0/O/1/l/I) — ~47 bits of entropy.
    const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    const chunk = () => Array.from(randomBytes(4)).map((b) => alphabet[b % alphabet.length]).join("");
    const tempPassword = `gobi-${chunk()}-${chunk()}`;
    await storage.updateUser(id, {
      passwordHash: hashPassword(tempPassword),
      mustChangePassword: 1,
      resetTokenHash: null,
      resetExpires: null,
    });
    res.json({ tempPassword });
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

  // ---------- Templates (v5.11 — admin-editable email + letter text) ----------
  // Effective values are returned alongside the built-in defaults so the editor
  // can show a reset-to-default action. Saving a value identical to the default
  // clears the override (keeps future default improvements flowing through).
  const TEMPLATE_DEFAULTS = () => ({
    outreachOnboardingSubject: OUTREACH_TEMPLATES.onboarding_invite.subject,
    outreachOnboardingBody: OUTREACH_TEMPLATES.onboarding_invite.body,
    outreachUpdateSubject: OUTREACH_TEMPLATES.general_update.subject,
    outreachUpdateBody: OUTREACH_TEMPLATES.general_update.body,
    letterBody: DEFAULT_LETTER_BODY,
    letterAck: DEFAULT_LETTER_ACK,
  });
  const TEMPLATE_META_KEYS: Record<string, string> = {
    outreachOnboardingSubject: "tpl_outreach_onboarding_invite_subject",
    outreachOnboardingBody: "tpl_outreach_onboarding_invite_body",
    outreachUpdateSubject: "tpl_outreach_general_update_subject",
    outreachUpdateBody: "tpl_outreach_general_update_body",
    letterBody: "tpl_letter_body",
    letterAck: "tpl_letter_ack",
  };

  app.get("/api/admin/templates", requireAuth("admin"), async (_req, res) => {
    const defaults = TEMPLATE_DEFAULTS();
    const current: Record<string, string> = {};
    for (const [field, metaKey] of Object.entries(TEMPLATE_META_KEYS)) {
      current[field] = (await storage.getMeta(metaKey)) || (defaults as Record<string, string>)[field];
    }
    res.json({ current, defaults });
  });

  app.put("/api/admin/templates", requireAuth("admin"), async (req, res) => {
    const field = z.string().trim().min(1).max(20000);
    const parsed = z.object({
      outreachOnboardingSubject: field,
      outreachOnboardingBody: field,
      outreachUpdateSubject: field,
      outreachUpdateBody: field,
      letterBody: field,
      letterAck: field,
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "All template fields are required" });
    const defaults = TEMPLATE_DEFAULTS() as Record<string, string>;
    for (const [fieldName, metaKey] of Object.entries(TEMPLATE_META_KEYS)) {
      const value = (parsed.data as Record<string, string>)[fieldName];
      await storage.setMeta(metaKey, value === defaults[fieldName] ? "" : value);
    }
    res.json({ ok: true });
  });

  // ---------- AI: sync advisor profile from a URL (e.g. LinkedIn) or pasted text (DeepSeek) ----------
  app.post("/api/ai/advisor-extract", requireAuth("submit"), async (req, res) => {
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    const pasted = typeof req.body?.text === "string" ? req.body.text : "";

    // ---- Rule-based identity preset ----
    // When the form already identifies the advisor (name, Chinese name, LinkedIn
    // slug, email), extraction is locked to THAT person: the AI must extract them
    // specifically, and the result is verified against these tokens before any
    // field is returned — a multi-person company page can no longer overwrite the
    // record with whoever is most prominent.
    const expectedName = typeof req.body?.expectedName === "string" ? req.body.expectedName.trim() : "";
    const expectedNameCn = (typeof req.body?.expectedNameCn === "string" ? req.body.expectedNameCn : "").replace(/[^\u4e00-\u9fff\u00b7]/g, "");
    const linkedinUrl = typeof req.body?.linkedinUrl === "string" ? req.body.linkedinUrl.trim() : "";
    const emails = typeof req.body?.emails === "string" ? req.body.emails.trim() : "";
    const STOP_TOKENS = new Set(["dr", "prof", "professor", "ir", "mr", "ms", "mrs", "the", "and", "www", "com", "hk", "mail", "info", "contact", "linkedin"]);
    const nameTokens = new Set<string>();
    const addTokens = (s: string) => {
      for (const tok of s.toLowerCase().split(/[^a-z]+/)) {
        if (tok.length >= 2 && !STOP_TOKENS.has(tok) && !/^\d+$/.test(tok)) nameTokens.add(tok);
      }
    };
    if (expectedName) addTokens(expectedName);
    const liSlug = linkedinUrl.match(/linkedin\.com\/in\/([a-z0-9-]+)/i)?.[1] ?? "";
    if (liSlug) addTokens(liSlug.replace(/-?[0-9a-f]{5,}$/i, "").replace(/\d+/g, " "));
    const emailLocal = emails.split(/[,;\s]+/)[0]?.split("@")[0] ?? "";
    if (emailLocal) addTokens(emailLocal.replace(/\d+/g, " "));
    const hasIdentity = nameTokens.size > 0 || expectedNameCn.length >= 2;

    // v5.14 — photo identity gate. Surname-only matches are NOT identity: on a
    // team page "Michael WONG" must never satisfy "Andy WONG". Split the form
    // name into given-name tokens and surname tokens (CAPITALISED words per the
    // portal's naming convention, falling back to the last word).
    const surnameTokens = new Set<string>(
      (expectedName.match(/\b[A-Z]{2,}\b/g) ?? [])
        .map((t: string) => t.toLowerCase())
        .filter((t: string) => t.length >= 2 && !STOP_TOKENS.has(t)),
    );
    const givenTokens = new Set<string>();
    for (const tok of expectedName.toLowerCase().split(/[^a-z]+/)) {
      if (tok.length >= 2 && !STOP_TOKENS.has(tok) && !surnameTokens.has(tok)) givenTokens.add(tok);
    }
    if (surnameTokens.size === 0 && givenTokens.size >= 2) {
      // Western order without CAPS convention — treat the last token as surname
      const toks = Array.from(givenTokens);
      const last = toks[toks.length - 1];
      surnameTokens.add(last);
      givenTokens.delete(last);
    }
    const hitTok = (hay: string, tok: string) => new RegExp(`(^|[^a-z])${tok}([^a-z]|$)`).test(hay);
    // Tie strength of an image to the TARGET person, from alt text, the caption
    // next to the image, and the file name/URL. 0 = cannot be tied.
    const photoTie = (c: { url: string; alt: string; near?: string }): number => {
      let hay = `${c.alt} ${c.near ?? ""} ${c.url}`;
      try { hay = decodeURIComponent(hay); } catch {}
      hay = hay.toLowerCase();
      let s = 0;
      if (expectedNameCn.length >= 2 && `${c.alt}${c.near ?? ""}`.includes(expectedNameCn)) s += 2;
      let given = 0;
      let sur = 0;
      for (const tok of Array.from(givenTokens)) if (hitTok(hay, tok)) given++;
      for (const tok of Array.from(surnameTokens)) if (hitTok(hay, tok)) sur++;
      if (given > 0) s += given + sur; // a given-name hit is required — surname alone is a colleague, not a match
      else if (sur > 0 && givenTokens.size === 0 && surnameTokens.size >= 1 && nameTokens.size === surnameTokens.size) s += sur; // single-word names
      if (given === 0 && s === 0 && givenTokens.size === 0 && surnameTokens.size === 0 && nameTokens.size >= 2) {
        // Identity came from LinkedIn slug / email only — require two token hits
        const hits = Array.from(nameTokens).filter((t) => hitTok(hay, t)).length;
        if (hits >= 2) s += hits;
      }
      return s;
    };

    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(503).json({
        message: "AI extraction is not configured on this deployment. Set the DEEPSEEK_API_KEY environment variable to enable it.",
      });
    }

    // ---- Multi-source harvest (v5.13) ----
    // Every link the form knows about is fetched (profile URL + LinkedIn URL),
    // the readable pages are merged into one material block, and photo
    // candidates are pooled across pages — the AI then produces one best-of
    // answer instead of relying on a single source.
    const sourceUrls = Array.from(new Set(
      [url, linkedinUrl].filter((u) => u && /^https?:\/\//i.test(u)),
    )).slice(0, 3);
    const pageSections: { url: string; text: string }[] = [];
    const photoCandidates: { url: string; alt: string; near: string; score: number }[] = [];
    const metas = await Promise.all(sourceUrls.map(async (su) => ({ su, meta: await fetchPageMeta(su) })));
    for (const { su, meta } of metas) {
      if (meta.text && meta.text.trim().length >= 80) pageSections.push({ url: su, text: meta.text });
      for (const c of meta.photoCandidates) {
        if (!photoCandidates.some((p) => p.url === c.url)) photoCandidates.push(c);
      }
    }
    const fetchFailed = sourceUrls.length > 0 && pageSections.length === 0;
    // Identity preset (v5.14): candidates that can be tied to the target person
    // by given name / Chinese name outrank everything else — surname-only hits
    // no longer count (they match colleagues and family members).
    if (hasIdentity) {
      for (const c of photoCandidates) {
        const tie = photoTie(c);
        if (tie > 0) c.score += 4 + tie;
      }
    }
    photoCandidates.sort((a, b) => b.score - a.score);
    // Trim to a prompt-sized shortlist only AFTER identity boosting — tied
    // candidates have floated to the top, so the target person survives the cut.
    photoCandidates.splice(12);
    if (pageSections.length === 0 && pasted.trim().length < 40) {
      return res.status(422).json({
        message: fetchFailed
          ? "Could not read that page — LinkedIn and some sites block automated access. Open the profile, copy the text, and paste it instead."
          : "Provide a profile URL or paste the profile text",
        fetchFailed,
      });
    }

    try {
      const instruction = `You are a data-entry assistant for the advisor CRM of Gobi Partners, a venture capital firm. The material below is a professional profile (often LinkedIn or a company "about us" page) — it may be English, Chinese, or mixed.${hasIdentity ? "" : " If the page covers several people, extract the single most prominent/senior person (never merge two people into one record)."}

Return ONLY a JSON object with these keys (use empty string "" when unknown; never invent facts):
{${hasIdentity ? `
  "personFound": true if the TARGET PERSON appears in the material, else false,` : ""}
  "name": "person's name in English",
  "nameCn": "person's name in Chinese if present",
  "background": "2-4 sentence English professional bio",
  "domains": "comma-separated expertise areas",
  "roles": [{ "title": "job title", "organization": "organisation name", "isPrimary": 1 for the current main role else 0 }],
  "cohort": "graduation year if evident, else empty",
  "photoIndex": index number of the CANDIDATE IMAGE that is a portrait/headshot of THIS person, or -1 if none clearly is
}

STANDARDISATION RULES — follow exactly:
- name: "[Honorific ]Given-name SURNAME" with the family name in CAPITALS, keeping Prof./Dr./Ir. honorifics when evident, e.g. "Percy CHENG", "Prof. Nancy Kwan MAN". No nicknames in quotes.
- nameCn: Chinese characters only, no spaces or punctuation, e.g. "王宇新". Empty if not stated — never transliterate.
- background: 2-4 factual third-person sentences — current position first, then prior experience, education, notable achievements. No marketing language ("visionary", "world-class"), no bullet points, no first person.
- domains: 2-5 items, comma-separated, each 1-3 words in Title Case with acronyms in capitals, e.g. "Biotech, University Tech Transfer, AI". Use sector names, not job titles.
- roles.title: Title Case, e.g. "Co-Founder & Executive Director". roles.organization: official English name without legal suffixes (Limited, Ltd., Inc., Co.). Exactly ONE role has isPrimary 1 (the current main position).
- cohort: a 4-digit year only, else "".
- photoIndex: pick ONLY a photo of this person's face/upper body. Company logos, brand marks, buildings, product shots and group photos are WRONG answers — return -1 rather than guess.${hasIdentity ? " Several people on the page may have similar names — only pick an image whose alt text or nearby text identifies the TARGET PERSON by their given name; if no image does, return -1." : ""}`;
      const identityBlock = hasIdentity
        ? `\nTARGET PERSON — this sync is updating an existing record. Extract ONLY the person identified by: ${[
            expectedName && `name "${expectedName}"`,
            expectedNameCn && `Chinese name "${expectedNameCn}"`,
            liSlug && `LinkedIn slug "${liSlug}"`,
            emailLocal && `email handle "${emailLocal}"`,
          ].filter(Boolean).join(", ")}. The page may present several people or a more prominent person — IGNORE everyone else. If this specific person does not appear in the material, set "personFound": false and leave every other field empty. Do NOT substitute a different person.`
        : "";
      const candidateBlock = photoCandidates.length
        ? `\nCANDIDATE IMAGES:\n${photoCandidates.map((c, i) => `${i}. ${c.url}${c.alt ? ` — alt: "${c.alt}"` : ""}${c.near ? ` — nearby text: "${c.near}"` : ""}`).join("\n")}`
        : "";
      const perSectionCap = pageSections.length > 1 ? 7000 : 12000;
      const textBlock = [
        instruction,
        identityBlock,
        candidateBlock,
        ...pageSections.map((s) => `\nFETCHED PAGE CONTENT (${s.url}):\n"""\n${s.text.slice(0, perSectionCap)}\n"""`),
        pasted.trim() ? `\nPASTED PROFILE TEXT:\n"""\n${pasted.slice(0, 12000)}\n"""` : "",
      ].join("\n");

      const resp = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-v4-flash",
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

      // Identity verification — rule layer on top of the prompt. When the form
      // identified the advisor, the extracted person must match by English name
      // token or Chinese name; otherwise nothing is applied.
      if (hasIdentity) {
        const foundName = String(data.name ?? "");
        const foundCn = String(data.nameCn ?? "").replace(/[^\u4e00-\u9fff\u00b7]/g, "");
        const foundLc = foundName.toLowerCase();
        const enMatch = nameTokens.size > 0 && Array.from(nameTokens).some((tok) => new RegExp(`(^|[^a-z])${tok}([^a-z]|$)`).test(foundLc));
        const cnMatch = expectedNameCn.length >= 2 && foundCn.length >= 2 && (foundCn.includes(expectedNameCn) || expectedNameCn.includes(foundCn));
        if (data.personFound === false || (!enMatch && !cnMatch)) {
          return res.status(409).json({
            message: "person_mismatch",
            expected: expectedName || expectedNameCn || liSlug || emailLocal,
            found: foundName || foundCn || "",
          });
        }
      }

      // Photo (v5.14): when the record identifies the person, a photo is only
      // ever applied if it can be TIED to that person (given name / Chinese name
      // in the alt text, adjacent caption, or file name). The AI's pick is
      // cross-checked against the same rule, and the strongest-tied candidate
      // wins. If nothing ties, no photo is returned — an empty photo beats a
      // colleague's photo. Without identity, the old behaviour stands.
      let photoUrl = "";
      const idx = Number(data.photoIndex);
      const aiPick = Number.isInteger(idx) && idx >= 0 && idx < photoCandidates.length ? photoCandidates[idx] : null;
      if (hasIdentity) {
        const tied = photoCandidates
          .map((c) => ({ c, tie: photoTie(c) }))
          .filter((x) => x.tie > 0)
          .sort((a, b) => b.tie - a.tie || b.c.score - a.c.score);
        if (tied.length > 0) {
          const aiTie = aiPick ? photoTie(aiPick) : 0;
          photoUrl = aiPick && aiTie >= tied[0].tie ? aiPick.url : tied[0].c.url;
        }
      } else if (aiPick) {
        photoUrl = aiPick.url;
      } else {
        const best = photoCandidates.find((c) => c.score >= 3);
        if (best) photoUrl = best.url;
      }

      // Autofill standardisation (server-side, belt and braces over the prompt)
      const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
      const nameCn = clean(data.nameCn).replace(/[^\u4e00-\u9fff\u00b7]/g, "");
      const domains = Array.from(new Set(
        clean(data.domains).split(/[,\uff0c\u3001;\uff1b/]+/).map((d) => d.trim()).filter(Boolean),
      )).slice(0, 5).join(", ");
      const cohort = clean(data.cohort).match(/(19|20)\d{2}/)?.[0] ?? "";
      const stripLegal = (s: string) => s.replace(/[,\s]+(Limited|Ltd\.?|Inc\.?|Co\.?|LLC|Corp\.?)\s*$/i, "").trim();
      let roles = Array.isArray(data.roles)
        ? data.roles
            .filter((r: any) => r && typeof r.title === "string" && r.title.trim())
            .slice(0, 8)
            .map((r: any) => ({
              title: clean(r.title),
              organization: r.organization ? stripLegal(clean(r.organization)) : null,
              isPrimary: r.isPrimary === 1 || r.isPrimary === true ? 1 : 0,
            }))
        : [];
      // exactly one primary role
      const firstPrimary = roles.findIndex((r: any) => r.isPrimary === 1);
      roles = roles.map((r: any, i: number) => ({ ...r, isPrimary: i === (firstPrimary === -1 ? 0 : firstPrimary) ? 1 : 0 }));

      res.json({
        name: clean(data.name),
        nameCn,
        background: clean(data.background),
        domains,
        cohort,
        roles,
        photoUrl: photoUrl || null,
        sourceUrl: url || sourceUrls[0] || null,
        fetched: pageSections.length > 0,
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

    // ---- Rule-based org identity preset (v5.13) ----
    // When the form already identifies the partner organisation (name, Chinese
    // name, website), extraction is anchored to THAT organisation and verified
    // before any field is returned — mirroring the advisor identity lock.
    const orgRaw = req.body?.expectedOrg ?? {};
    const expOrgEn = typeof orgRaw?.nameEn === "string" ? orgRaw.nameEn.trim() : "";
    const expOrgCn = (typeof orgRaw?.nameCn === "string" ? orgRaw.nameCn : "").replace(/[^\u4e00-\u9fff\u00b7]/g, "");
    let orgWebsite = typeof orgRaw?.website === "string" ? orgRaw.website.trim() : "";
    if (orgWebsite && !/^https?:\/\//i.test(orgWebsite)) orgWebsite = `https://${orgWebsite}`;
    const ORG_STOP = new Set(["the", "and", "of", "for", "co", "ltd", "limited", "inc", "corp", "corporation", "company", "group", "holdings", "international", "global"]);
    const orgTokens = new Set<string>();
    for (const tok of expOrgEn.toLowerCase().split(/[^a-z0-9]+/)) {
      if (tok.length >= 3 && !ORG_STOP.has(tok)) orgTokens.add(tok);
    }
    const hasOrgIdentity = orgTokens.size > 0 || expOrgCn.length >= 2;

    if (text.trim().length < 20 && files.length === 0 && !orgWebsite) {
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
      // The form's website (org identity preset) is fetched first, so a
      // website-only auto-sync works without any pasted material.
      const urls = Array.from(new Set([...(orgWebsite ? [orgWebsite] : []), ...(text.match(URL_RE) ?? [])])).slice(0, 4);
      let webText = "";
      const pages = await Promise.all(urls.map(async (url) => ({ url, pageText: await fetchPageText(url) })));
      for (const { url, pageText } of pages) {
        sources.push({ kind: "link", label: url, fetched: pageText !== null });
        if (pageText) webText += `\n\n--- WEB PAGE: ${url} ---\n${pageText}`;
      }
      const plainText = text.replace(URL_RE, " ").trim();
      if (plainText.length >= 20) sources.push({ kind: "text", label: "pasted text" });

      // Website-only sync with an unreadable site — nothing to extract from.
      if (!webText.trim() && plainText.length < 20 && files.length === 0) {
        return res.status(422).json({
          message: "Could not read the organisation's website — paste some material about the partnership instead.",
          fetchFailed: true,
        });
      }

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
{${hasOrgIdentity ? `
  "orgFound": true if the TARGET ORGANISATION appears in the material, else false,` : ""}
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

      const orgIdentityBlock = hasOrgIdentity
        ? `\nTARGET ORGANISATION — this sync is updating an existing partner record. The partner organisation is: ${[
            expOrgEn && `"${expOrgEn}"`,
            expOrgCn && `Chinese name "${expOrgCn}"`,
            orgWebsite && `website ${orgWebsite}`,
          ].filter(Boolean).join(", ")}. Fill every field for the partnership between Gobi Partners and THIS organisation only — the material may mention other organisations, IGNORE them as the partner. If the material is not about this organisation at all, set "orgFound": false and leave every other field empty. Do NOT substitute a different organisation.`
        : "";

      const textBlock = [
        instruction,
        orgIdentityBlock,
        text.trim() ? `\nPASTED TEXT:\n"""\n${text.slice(0, 12000)}\n"""` : "",
        webText ? `\nFETCHED WEB PAGE CONTENT (from the organisation's website and links in the pasted text):\n"""\n${webText.slice(0, 20000)}\n"""` : "",
        docText ? `\nDOCUMENT CONTENT:\n"""\n${docText}\n"""` : "",
      ].join("\n");

      const resp = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-v4-flash",
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

      // Org identity verification — rule layer on top of the prompt.
      if (hasOrgIdentity) {
        const foundEn = String(data.nameEn ?? "");
        const foundCn = String(data.nameCn ?? "").replace(/[^\u4e00-\u9fff\u00b7]/g, "");
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
        const acr = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !["the", "of", "and", "for"].includes(w)).map((w) => w[0]).join("");
        const eN = norm(expOrgEn);
        const fN = norm(foundEn);
        const foundLc = foundEn.toLowerCase();
        const tokMatch = Array.from(orgTokens).some((tok) => foundLc.includes(tok));
        const contain = eN.length >= 4 && fN.length >= 4 && (eN.includes(fN) || fN.includes(eN));
        const acrMatch = (eN.length >= 3 && acr(foundEn) === eN) || (fN.length >= 3 && acr(expOrgEn) === fN);
        const cnMatch = expOrgCn.length >= 2 && foundCn.length >= 2 && (foundCn.includes(expOrgCn) || expOrgCn.includes(foundCn));
        if (data.orgFound === false || (!tokMatch && !contain && !acrMatch && !cnMatch)) {
          return res.status(409).json({
            message: "org_mismatch",
            expected: expOrgEn || expOrgCn,
            found: foundEn || foundCn || "",
          });
        }
      }

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

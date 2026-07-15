import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { storage, hashPassword, verifyPassword } from "./storage.js";
import {
  insertUserSchema,
  insertPartnershipSchema,
  attachmentInputSchema,
  changeRequestInputSchema,
  profileUpdateSchema,
  STAGES,
  CATEGORIES,
  REGIONS,
  ROLES,
  GOBI_STAFF,
} from "../shared/schema.js";
import type { SafeUser, User, AuditAction } from "../shared/schema.js";
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

function safe(user: User): SafeUser {
  const { passwordHash, ...rest } = user;
  return rest;
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
function requireAuth(level?: "admin" | "submit") {
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
    const user = await storage.createUser({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: hashPassword(parsed.data.password),
    });
    res.status(201).json({ user: safe(user) });
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

  // ---------- Partnerships ----------
  // Signed-in users only: approved partnerships
  app.get("/api/partnerships", requireAuth(), async (_req, res) => {
    const all = await storage.listPartnerships();
    res.json(all.filter((p) => p.status === "approved"));
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
      parentId: parsed.data.parentId ?? null,
      hallOfFame: isAdmin ? (parsed.data.hallOfFame ?? 0) : 0,
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
    res.status(201).json(created);
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
    const updated = await storage.updatePartnership(id, body);
    if (Object.keys(changed).length) await audit(req.user!, id, "update", changed);
    res.json(updated);
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

  // ---------- Admin ----------
  app.get("/api/admin/users", requireAuth("admin"), async (_req, res) => {
    const all = await storage.listUsers();
    res.json(all.map(safe));
  });

  app.patch("/api/admin/users/:id", requireAuth("admin"), async (req: AuthedRequest, res) => {
    const data: { status?: string; role?: string } = {};
    if (req.body?.status !== undefined) {
      if (!["approved", "rejected", "pending"].includes(req.body.status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      data.status = req.body.status;
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

      for (const f of files) {
        if (attachmentTooLarge(f.data)) continue;
        if (f.mime === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
          const { extractText, getDocumentProxy } = await import("unpdf");
          const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(f.data, "base64")));
          const { text: pdfText } = await extractText(pdf, { mergePages: true });
          docText += `\n\n--- ${f.name} ---\n${pdfText.slice(0, 12000)}`;
        } else if (
          f.mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          f.name.toLowerCase().endsWith(".docx")
        ) {
          const result = await mammoth.extractRawText({ buffer: Buffer.from(f.data, "base64") });
          docText += `\n\n--- ${f.name} ---\n${result.value.slice(0, 12000)}`;
        }
      }

      const instruction = `You are a data-entry assistant for the partnership CRM of Gobi Partners, a venture capital firm. Analyse the material below (email, notes, PDF or Word document text — may be English, Chinese, or mixed).

STEP 1 — UNDERSTAND: First show you understood the material: what kind of document it is, who the partner organisation is, and what collaboration it describes.
STEP 2 — EXTRACT: Then fill the CRM fields.

Return ONLY a JSON object with these keys (use empty string "" when unknown):
{
  "understandingEn": "2-3 sentences in English: what this material is and what it says about the partnership",
  "understandingCn": "the same understanding in Chinese",
  "nameEn": "partner organisation name in English",
  "nameCn": "partner organisation name in Chinese",
  "category": one of ${JSON.stringify(CATEGORIES)},
  "region": one of ${JSON.stringify(REGIONS)} (hongkong=Hong Kong, mainland=Chinese Mainland, macau=Macau, sea=other Southeast Asia, international=elsewhere; judge by the partner's domicile),
  "website": "https://... if mentioned or confidently known",
  "descriptionEn": "1-2 sentence English summary of the partnership/collaboration",
  "descriptionCn": "1-2 sentence Chinese summary of the partnership/collaboration",
  "contactName": "main contact person at the partner org",
  "contactEmail": "contact email",
  "picNames": ["array of Gobi Partners people in charge, if identifiable. Known Gobi staff: ${GOBI_STAFF.map((s) => s.name).join(", ")}"],
  "context": "fuller background paragraph capturing the narrative of the material",
  "partnershipType": "short label e.g. 'Joint fund', 'Deal flow MOU', 'Co-incubation'",
  "startDate": "YYYY-MM-DD — REQUIRED, never leave empty. If no explicit date appears, give your best estimate from the material's context or your own knowledge of this partnership (announcements, news). If only a year or month is known, use the first day, e.g. 2024-01-01",
  "stage": one of ${JSON.stringify(STAGES)} (s1_new=identified target only, s2_engaged=in contact / meetings held, s3_agreement=MOU or agreement signed, s4_progressive=active deepening collaboration, s5_strategic=flagship strategic partnership),
  "notes": "any other useful details (dates, follow-ups, people)"
}`;

      const textBlock = [
        instruction,
        text.trim() ? `\nPASTED TEXT:\n"""\n${text.slice(0, 12000)}\n"""` : "",
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
          max_tokens: 1600,
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
        understandingEn: String(data.understandingEn ?? ""),
        understandingCn: String(data.understandingCn ?? ""),
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

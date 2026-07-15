import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { storage, hashPassword, verifyPassword } from "./storage";
import {
  insertUserSchema,
  insertPartnershipSchema,
  attachmentInputSchema,
  changeRequestInputSchema,
  STAGES,
  CATEGORIES,
  REGIONS,
  ROLES,
  GOBI_STAFF,
} from "../shared/schema";
import type { SafeUser, User } from "../shared/schema";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { z } from "zod";

function safe(user: User): SafeUser {
  const { passwordHash, ...rest } = user;
  return rest;
}

interface AuthedRequest extends Request {
  user?: User;
}

async function resolveUser(req: AuthedRequest): Promise<User | undefined> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  const session = await storage.getSession(header.slice(7));
  if (!session) return undefined;
  return storage.getUser(session.userId);
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

  // ---------- Partnerships ----------
  // Public: approved partnerships only
  app.get("/api/partnerships", async (_req, res) => {
    const all = await storage.listPartnerships();
    res.json(all.filter((p) => p.status === "approved"));
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
    const isAdmin = req.user!.role === "admin";
    const created = await storage.createPartnership({
      ...parsed.data,
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
    const updated = await storage.updatePartnership(id, body);
    res.json(updated);
  });

  app.delete("/api/partnerships/:id", requireAuth("admin"), async (req, res) => {
    await storage.deletePartnership(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------- Attachments ----------
  // Public: list metadata for a partnership (no file data)
  app.get("/api/partnerships/:id/attachments", async (req, res) => {
    res.json(await storage.listAttachmentMeta(Number(req.params.id)));
  });

  // Public: download/view a file
  app.get("/api/attachments/:id", async (req, res) => {
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
  app.patch("/api/change-requests/:id", requireAuth("admin"), async (req, res) => {
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
      await storage.updatePartnership(cr.partnershipId, changes);
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

  // ---------- AI: extract partnership from pasted text, PDF, DOCX, or images ----------
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
      return res.status(400).json({ message: "Paste text or upload a PDF, DOCX, or image" });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        message:
          "AI extraction is not configured on this deployment. Set the ANTHROPIC_API_KEY environment variable to enable it.",
      });
    }

    try {
      const client = new Anthropic();
      const content: any[] = [];
      let docxText = "";

      for (const f of files) {
        if (attachmentTooLarge(f.data)) continue;
        if (f.mime.startsWith("image/")) {
          content.push({
            type: "image",
            source: { type: "base64", media_type: f.mime, data: f.data },
          });
        } else if (f.mime === "application/pdf") {
          content.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: f.data },
          });
        } else if (
          f.mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          f.name.toLowerCase().endsWith(".docx")
        ) {
          const result = await mammoth.extractRawText({ buffer: Buffer.from(f.data, "base64") });
          docxText += `\n\n--- ${f.name} ---\n${result.value.slice(0, 12000)}`;
        }
      }

      const instruction = `You are a data-entry assistant for a Greater Bay Area VC fund's partnership CRM. Analyse the material below (email, notes, PDF, Word document, or images — may be English, Chinese, or mixed).

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
  "startDate": "YYYY-MM-DD if a start/signing date is mentioned, else \\"\\"",
  "stage": one of ${JSON.stringify(STAGES)} (s1_new=identified target only, s2_engaged=in contact / meetings held, s3_agreement=MOU or agreement signed, s4_progressive=active deepening collaboration, s5_strategic=flagship strategic partnership),
  "collabLevel": integer 1-5 estimating depth of collaboration,
  "notes": "any other useful details (dates, follow-ups, people)"
}`;

      const textBlock = [
        instruction,
        text.trim() ? `\nPASTED TEXT:\n"""\n${text.slice(0, 12000)}\n"""` : "",
        docxText ? `\nWORD DOCUMENT CONTENT:\n"""\n${docxText}\n"""` : "",
      ].join("\n");

      content.push({ type: "text", text: textBlock });

      const msg = await client.messages.create({
        model: "claude_sonnet_4_6",
        max_tokens: 1600,
        messages: [{ role: "user", content }],
      });
      const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in model output");
      const data = JSON.parse(jsonMatch[0]);
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
        stage: (STAGES as readonly string[]).includes(data.stage) ? data.stage : "s2_engaged",
        collabLevel: Math.min(5, Math.max(1, Number(data.collabLevel) || 1)),
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

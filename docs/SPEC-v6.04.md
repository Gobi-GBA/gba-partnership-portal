# Portal Upgrade — Development Spec (v6.04)

Advisor module: record update log, CV filing with AI auto-pull, signed-letter filing, contact layout tidy-up — plus a binding GitHub update-log SOP.

Owner: Fred Li · Date: 2026-07-28 · Target repos: Gobi-GBA/gba-partnership-portal (origin, Vercel) + lklfred-design mirror

---

## 1. Advisor record update log

**Problem.** Partner records carry a full change log (who changed what, when). Advisor records have none — edits, approvals, lifecycle changes and workflow steps leave no trace beyond `[Workflow]` activity notes.

**Solution.**
- Generalize the existing `audit_logs` table with an `entity_type` column (`'partnership'` default, `'advisor'` new). Existing rows are untouched.
- Server writes audit entries on advisor **create, edit (changed fields only), approve/reject, lifecycle change, workflow advance/undo, delete**.
- New endpoint `GET /api/advisors/:id/audit` (staff only).
- Advisor detail dialog gains the same "Change log" section partners have — collapsed list of `date · user · action · fields changed`.
- Sensitive values are never echoed into the log for advisors (field names only, not values) since mobile/WeChat/emails are staff-restricted.

## 2. CV / bio: file upload, storage, AI auto-pull, standard experience format

**Problem.** "From CV / bio" only accepts pasted text (pic 1). No CV is kept on file; extraction output format is unstandardized.

**Solution.**
- New `file_assets` table (mirrors `photo_assets`): `owner_type` (`advisor_cv` | `advisor_letter`), `owner_id`, `filename`, `mime`, `size`, `data` (base64), `uploaded_by`, `created_at`. Works on SQLite and Neon.
- The Extract dialog gains an **Upload CV** path next to paste: PDF / DOCX / TXT, ≤ 10 MB.
  - Server extracts text (pdf-parse for PDF, mammoth for DOCX), **stores the original file** as `advisor_cv`, then runs the same DeepSeek extraction and returns the parsed fields for review before saving.
- **Standard experience format** — the AI prompt now writes `background` as one line per position:
  `YYYY–YYYY — Organization — Role & scope` (ongoing = `YYYY–present`; unknown years = `n.a.`), most recent first, followed by a short education block in the same shape.
- Filed CVs appear as chips (filename + date) in the advisor detail dialog and in Edit advisor, with download; admins can delete. Re-upload keeps history (newest is "current").

## 3. Onboarding workflow: file the signed letter

**Problem.** The workflow tracks "Signed back" as a date only (pic 2) — the signed letter itself is not stored.

**Solution.**
- "Signed back" step gains **Upload signed letter** (PDF / JPG / PNG / DOCX, ≤ 10 MB) → stored as `advisor_letter` file asset.
- Uploading auto-completes the Signed back step (if pending) and logs a `[Workflow] Signed letter filed` activity + audit entry.
- The filed letter shows inside the workflow card with filename, date, and download; admins can replace (history kept).

## 4. Contact & links layout tidy-up

**Problem.** Email chips, activities, origin staff, current PIC and a floating "Profile URL" button are scattered down the detail dialog (pic 3).

**Solution.** One structured **Contact & links** card placed directly after Background:
- Row 1 — chips: emails, mobile (tap-to-call), WeChat (tap-to-copy).
- Row 2 — chips: Profile URL, LinkedIn (both when present, distinct icons), filed CV.
- Row 3 — compact two-column meta: Origin staff · Current PIC · birthday.
- Activities timeline follows the card; nothing floats after it. Staff-only remains staff-only.

## 5. GitHub update-log SOP (binding)

**Problem.** Multiple contributors push to the repos; there is no shared record of who shipped what.

**Solution.** Two repo files + a binding routine:
- `docs/UPDATE_LOG.md` — append-only release log: `date · version · author · summary · key files`. Backfilled from v6.00.
- `docs/SOP.md` — the standard operating procedure:
  1. **Before work**: `git fetch origin` and confirm `rev-list --count HEAD..origin/main` = 0 (pull/rebase if not); read the tail of `UPDATE_LOG.md` for anything shipped since your last sync.
  2. **Work**: implement, build, UAT.
  3. **Before push**: secret scan (`sk-` keys), storage-token scan on built assets, type-check.
  4. **After work**: append your entry to `UPDATE_LOG.md` **in the same commit** as the change; bump `versions.ts` changelog for user-visible changes.
  5. Push to **both** origin and mirror; verify Vercel READY + prod bundle hash.
- The in-app Updates page (`versions.ts`) remains the user-facing changelog; `UPDATE_LOG.md` is the engineering log.

## 6. Data & migration

- SQLite boot migration: add `entity_type` to `audit_logs`; create `file_assets`.
- Neon: same migration via script (serverless driver).
- No changes to existing advisor rows.

## 7. Acceptance (UAT)

1. Edit an advisor → change log shows the edit with field names; workflow advance/undo logged.
2. Upload a PDF CV → file chip appears; AI fills form; background follows `YYYY–YYYY — Org — Scope` lines.
3. Upload signed letter → Signed back completes, letter downloadable from workflow card, activity + audit entries created.
4. Detail dialog: contact chips, links and meta grouped in one card; no floating URL button; nothing overflows; EN/CN both clean.
5. Non-staff (viewer) sees no contact card, no change log, no files.
6. `docs/SOP.md` + `docs/UPDATE_LOG.md` in repo; this release recorded in both the update log and the in-app changelog (v6.04).

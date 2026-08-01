# Advisor Network Module — Development Spec (v5.0)

Gobi Partners GBA Partnership Portal — major update
Prepared for: Fred Li | Status: Implemented in v5.0

---

## 1. Original prompt (as given)

> New "advisor" who serves as our advisor network function — we have an advisors list in Google Sheets. One more database except for partner. Make it ver 5 major update — with photos function (both HD + thumbnail) so my teammates can record — make the records database so the organization or company can be linked to our partner list — one person may have more than one job or role — migrate data from the list, do web fact-check at the same time — photos auto-pull from the web first if you find such person. Plus: overall self-debug and UAT, and inter-linking UX (admin console records link to partner pages). Orgs (e.g. Esri, OASA) can also be advisors — combine with the partnership list and mark them as "Our domain knowledge partner".

## 2. Enhanced prompt (polished spec)

Build an **Advisor Network** module as a first-class section of the bilingual (EN/CN) partnership portal, backed by its own database tables, with the following requirements.

### 2.1 Data model

- **`advisors`** — one row per person: English name, Chinese name, advisor type (Honourary Advisor / Domain Knowledge Partner / Mentor), track (Academic / Industry / Entrepreneur / Hybrid), pillar (Healthcare, AI, Industry 4.0, ESG, SpaceTech, Consumer, Other), cohort/year, emails (staff-visible only), background notes, engagement notes (staff-visible only), official profile URL, LinkedIn URL, HD photo + thumbnail, Gobi PICs, submission status and submitter.
- **`advisor_roles`** — one row per job or role, many-to-one with advisors: title, organization, optional **link to a partnership record**, primary-role flag, sort order. One person may hold up to 12 roles.
- **`partnerships.is_domain_knowledge_partner`** — organizations that serve as advisors (e.g. Esri China (HK), OASA) live in the partnership list, flagged with a gold **Domain Knowledge Partner** badge instead of a separate org-advisor table. This keeps a single source of truth for organizations.

### 2.2 Photos

- Upload path: client-side canvas processing produces **HD (≤1200 px, JPEG q0.85)** and **thumbnail (200 px, q0.8)** variants; stored as data URIs (HD capped at 600 KB).
- Migration path: photos are auto-pulled from official university/company profile pages first; only advisors without a findable public photo fall back to an initials avatar.
- List endpoints return thumbnails only; the HD photo is fetched on detail view to keep list payloads small.

### 2.3 Access control

- All pages require sign-in (portal-wide rule since v4).
- Viewers see advisor cards and public details; **emails and engagement notes are redacted** for non-staff.
- Staff can submit advisors (pending approval); admins create approved records directly, approve/reject pending ones, edit anything, and delete.
- Only admins may set the Domain Knowledge Partner flag on a partnership.

### 2.4 Inter-linking UX

- Admin console record → click opens the partner page/dialog.
- Update log entries → click through to the partner record.
- Partner detail dialog → shows linked advisors as chips; clicking a chip opens the advisor detail.
- Advisor role with a linked organization → button navigates to the partner record.
- Advisors page shows a "Domain knowledge organizations" section listing flagged partners.
- Deep links: `/#/partner/:id` and `/#/advisors/:id` open the respective detail views directly.

### 2.5 Migration & fact-check

- Source: the advisors Google Sheet (23 rows: 21 people, 2 organizations).
- Every advisor was fact-checked against official web sources during migration; title discrepancies recorded as dated notes in the background field (e.g. role changes, understated titles).
- Org matching maps each role's organization to the partnership list with priority keyword rules (specific before general — e.g. HKUST before HKU) to avoid false matches.
- Personal data (emails, photos) never enters the public repository — migration runs directly against the databases from files kept outside the repo.

### 2.6 Quality gates

- TypeScript clean (`tsc --noEmit`), production build clean.
- Secret scan before every commit (repo is public).
- Full bilingual UAT: EN + CN, desktop + 390 px mobile, all pages, both viewer and admin flows.

## 3. Best practices adopted

- Single source of truth for organizations (partnership list) instead of duplicating orgs as advisors.
- Idempotent migration script (safe to re-run; keyed by advisor name).
- Redaction at the API layer, not the UI layer.
- Thumbnails in lists / HD on demand; canvas-side compression before upload.
- Priority-ordered fuzzy matching with manual verification pass.

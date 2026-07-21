# Advisor Module Enhancement — Development Spec (v5.5)

Gobi Partnership Portal · prepared for Fred Li · 21 July 2026
Status: approved for development. Items marked **[pending input]** await material from Fred.

---

## 0. Original prompt (verbatim, condensed)

> 1) Internal tools (pic 1): our workflow to be developed. 2) Generate an email for approval (one-click button to send to the COO office, cc Fred Li), by default on the email bar, Gobi styling. 3) Others become a workflow diagram for the team to read (other parts developed in future). 4) Advisor — add optional clearance if the advisor agreed to be put on our public website or materials, default "no". 5) LinkedIn profile URL (search online first); auto-sync its info with a click; test Adrian Lam. 6) Both domain knowledge partners and advisors should have Sector Tags (can be more than one). 7) Tags managed at the admin portal by the admin. CRM functions, date of birth (DD/MM/YYYY, year optional). Activities log for advisor momentum. Similar view filter / display options like partners — same set of functions, efficient set-up.

## 1. Objectives

Turn the Advisor Network from a directory into a light CRM: a governed approval workflow (email to COO office), public-use clearance tracking, LinkedIn-linked profiles, admin-managed sector taxonomy shared with Domain Knowledge Partners, an activity log that shows relationship momentum, and the same filtering/display ergonomics the Partners page already has — reusing existing components wherever possible.

## 2. Feature specifications

### 2.1 Approval email generator (one-click, COO office)

- On each advisor detail (admin/staff only): button **"Request approval"**.
- Generates a Gobi-styled approval email for onboarding/updating the advisor:
  - Subject: `[Approval requested] Advisor engagement — {name} ({primary role})`
  - Body (EN, plain text for mailto): advisor name, roles and organizations, expert domains, proposed engagement, public-clearance status, deep link to the advisor's portal page, requester name, Gobi sign-off block.
  - A styled HTML preview is shown in a dialog (navy/gold Gobi styling) with a **Copy** button, alongside the one-click send.
- **One-click send = `mailto:`** with To = COO office address, Cc = `fred@gobi.vc`, subject and body prefilled — it opens the user's email client ("on the email bar"); the user presses send. No SMTP server send in this version.
- COO office address is an **admin setting** (Settings section in the admin console), stored in DB. **[pending input]** — field ships blank; the button warns until it is set.

### 2.2 Internal-tools workflow diagram

- New team-readable page section: a rendered diagram of the internal tools workflow, with the advisor-approval segment (this build) highlighted as "live" and the other segments marked "planned".
- **[pending input]** — pic 1 not yet received. This version ships the page scaffold with the advisor-approval flow only (Register → Fact-check → COO approval email → Approved → Public clearance → Website/materials); remaining segments are added when pic 1 arrives.

### 2.3 Public-use clearance

- New advisor field `public_clearance` (boolean, default **No**): whether the advisor has agreed to appear on the public website or marketing materials.
- Badge on advisor detail (Cleared for public use / Internal only); editable in the admin edit form; included in the approval email.

### 2.4 LinkedIn profile + one-click sync

- New advisor field `linkedin_url`.
- Migration: LinkedIn URLs researched online for all 21 advisors and inserted directly into the databases (per the personal-data rule, via scripts outside the repo).
- Advisor detail shows a LinkedIn link chip.
- Admin action **"Sync from LinkedIn"**: server fetches the public profile page and uses DeepSeek to extract headline, current positions, and about text; a diff dialog lets the admin accept/reject each field before saving. Best-effort: LinkedIn frequently blocks anonymous fetches — on failure the dialog reports it and offers manual paste of the profile text for the same DeepSeek extraction.
- Acceptance test: **Adrian Lam**.

### 2.5 Sector tags (shared taxonomy)

- New tables: `sector_tags` (id, name_en, name_cn, color) and join tables for **both advisors and partnerships** — Domain Knowledge Partners and advisors can carry one or more tags; regular partners may also be tagged (harmless superset).
- Displayed as colored chips on advisor cards/detail and on DKP partner pages; clickable to filter.
- Seed taxonomy from current data (e.g. AI / Data, Biotech & Health, Semiconductors & EE, GIS & Space, Fintech, Advanced Materials, Robotics, Sustainability) — refined during migration fact-check.

### 2.6 Tag management (admin)

- Admin console gains a **Tags** section: create, rename (EN/CN), recolor, delete (with usage count and guarded delete), and merge is out of scope this version.
- Tag assignment via multi-select in the advisor and partner edit forms.

### 2.7 CRM fields

- `birth_day`, `birth_month` (required together when set), `birth_year` (optional) — entered/displayed **DD/MM/YYYY** with year optional (e.g. `14/03` or `14/03/1968`). Visible to admin/staff only (personal data — redacted for viewers, same policy as emails).
- Existing contact fields remain; DOB joins the redaction list.

### 2.8 Activities log (advisor momentum)

- New table `advisor_activities`: advisor_id, date, type (Meeting / Call / Email / Event / Intro / Note), note, created_by.
- Advisor detail gains an **Activity** timeline: add/delete entries (staff+), newest first.
- **Momentum indicator** on cards and detail: Active (≤30 days since last activity, aqua), Warm (≤120 days, gold), Dormant (>120 days or none, grey).
- Activities are internal: hidden from viewers.

### 2.9 Filters & display parity with Partners

- Advisors page adopts the same toolbar pattern as Partners: search, sector-tag filter, organization filter, momentum filter, sort (name / recent activity), and grid–list toggle — reusing the existing components/styles for an efficient set-up.
- DKP organizations section respects the same tag filter.

## 3. Non-functional requirements

- Bilingual EN/CN throughout; no emojis; Gobi cosmic styling (navy #0C2340, gold #D4A843, aqua #48A9C5).
- Same auth model: everything behind sign-in; viewer redaction extended to DOB and activities.
- SQLite (local) + Neon Postgres (prod) migrations, idempotent; advisor personal data inserted via out-of-repo scripts only.
- Repo hygiene: push to origin + mirror; secret scan before commit; explicit `.js` extensions in server-side relative imports.
- Version bump to v5.5 with changelog entry.

## 4. Acceptance criteria

1. Request-approval button produces a correctly prefilled mailto (To COO setting, Cc fred@gobi.vc) and a styled preview; warns when COO address unset.
2. Clearance defaults to No, editable, shown as badge, included in email.
3. All advisors have LinkedIn URLs where one exists publicly; Adrian Lam sync round-trip demonstrated.
4. Tags manageable by admin, assignable to advisors and DKP partners, filterable on the Advisors page.
5. DOB accepts day/month with optional year, displays DD/MM(/YYYY), redacted for viewers.
6. Activity log add/delete works; momentum states render correctly.
7. Advisors page filter/display parity with Partners; mobile clean at 390 px.
8. Prod (Vercel + Neon) migrated and verified live.

## 5. Out of scope (future)

- Full workflow-diagram segments beyond advisor approval (awaiting pic 1).
- SMTP direct send; approval status tracking inside the portal; tag merge; birthday reminders.

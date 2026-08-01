# Portal Upgrade — Development Spec (v6.05)

Scope: sync-from-link hardening with photo/logo auto-pull, guided input flow for both Add forms, mandatory-field highlighting, and missed-call-style pending badges for users and admins.

## 0. Diagnosis — why the LinkedIn test failed

The Auto-sync pipeline already fetches both Profile URL and LinkedIn URL and pools photo candidates. The failure in the screenshot has three compounding causes:

1. **Vercel's datacenter IPs are frequently blocked by LinkedIn** (the sandbox fetch of linkedin.com/in/fredkli succeeds and returns the full public profile; the same fetch from Vercel usually hits the sign-in wall or a 999). The current code then gives up with a paste-instead toast.
2. **No URL normalization** — `www.linkedin.com/in/fredkli/` without `https://` is silently discarded by the `^https?://` filter, so a sync with only that value reports "provide a profile URL" even though a usable URL was typed.
3. **The portal's fetch announces itself as a bot** (`User-Agent: GobiPortal/4.3`), which lowers the success rate on sites that serve real browsers fine.

## 1. Sync-from-link hardening (advisor + partnership)

### 1.1 URL normalization — client and server
- Trim whitespace; strip wrapping `<>`, quotes, and trailing `,.;)`.
- Prepend `https://` when the scheme is missing (`www.linkedin.com/…`, `linkedin.com/…`, `example.org`).
- Repair common typos: `https:/x`, `http:/x`, `https//x`, `http//x`.
- Client: applied on blur of Profile URL / LinkedIn URL / Website fields — the field visibly updates to the fixed URL.
- Server: same normalization applied defensively before the `^https?://` filter in `/api/ai/advisor-extract` and `/api/ai/extract`.

### 1.2 Best-source auto-pick
- Sync uses whichever of Profile URL / LinkedIn URL exists (both when present, deduped) — already the case, kept.
- New: a LinkedIn profile URL pasted into the Profile URL field is ALSO recognized as the LinkedIn identity source (slug feeds the identity lock), so the field mix-up in the screenshot still syncs correctly.

### 1.3 Fetch reliability ladder
For every profile/website fetch, in order, stopping at first success:
1. Direct fetch with **browser-grade headers** (current Chrome UA, `Accept`, `Accept-Language: en,zh`).
2. Direct fetch with the legacy GobiPortal UA (some sites whitelist simple bots).
3. **Public text-reader fallback** (`r.jina.ai`) — returns the page as clean text; works from datacenter IPs for LinkedIn public profiles. Text-only: photo candidates are not available on this path, but identity, background, roles and domains still fill.
A response that is technically 200 but is actually a LinkedIn auth-wall is detected and treated as a failure (falls through to the reader).
- When every rung fails, the existing paste dialog auto-opens (kept), with the clearer hint.

### 1.4 Photo / logo auto-extraction
- **Advisor** — photo candidate pooling exists; add `og:image` of a successfully fetched LinkedIn public profile into the candidate pool (subject to the existing identity tie rules — no colleague photos).
- **Partnership** — new: the fetched website's images are harvested with a logo-biased filter (og:image, header/nav images, filenames or alt text containing the brand/logo hints, small square aspect preferred; the portrait filter's exclusions inverted). The endpoint returns `logoUrl`; the form applies it only when the logo field is empty. Same one-click flow as advisor photos.

## 2. Guided input flow (both Add forms)

### 2.1 Step-0 source chooser
When opening a blank Add advisor / Register partnership form, a compact chooser strip appears above the form:
- **Paste or upload a document** — opens the existing CV-or-text dialog (advisor) / quick-fill dialog (partnership).
- **Sync from a link** — focuses the URL field and highlights the Auto-sync button.
- **Fill manually** — dismisses the strip.
The strip renders only for new records (not when editing), and disappears after any extraction succeeds or on dismissal. No extra dialog hop for people who ignore it.

### 2.2 Mandatory-field highlighting
- Unfilled mandatory fields carry an amber ring + light amber background and an "(required)" suffix on the label, live as the user types.
- Submitting with missing mandatory fields scrolls to the first one and focuses it.
- Advisor mandatory: English name. Partnership mandatory: organization name, strategic level, investment pillar. (Confirmed against current server validation during implementation.)

## 3. Pending-item badges (missed-call style)

### 3.1 Data
- New column `users.last_seen_version` (sqlite ensureColumn + pg migration).
- `GET /api/me/notifications` →
  - all approved users: `{ newVersion: boolean }` — CURRENT_VERSION vs last_seen_version; plus `myRequestsResolved`: my feedback items whose status moved off "open" since my last Updates visit.
  - admins additionally: `{ pendingUsers, pendingPartnerships, pendingAdvisors, pendingChangeRequests, openRequests }`.
- `POST /api/me/seen-version` marks the current version seen; called when the Updates page mounts (also covers the version dialog).

### 3.2 Display
- Gold (#D4A843) dot with count — the missed-call idiom — on the header nav:
  - **Updates** item: dot when `newVersion` or `myRequestsResolved` > 0 (all users).
  - **Admin** item: count badge = pendingUsers + pendingPartnerships + pendingAdvisors + pendingChangeRequests + openRequests (admins only).
- Badges refetch on navigation and every 60s; disappear as soon as the underlying queue is cleared.

## 4. SOP & logging
Per docs/SOP.md: fetch origin first, read UPDATE_LOG.md, work, scans, append the v6.05 row to docs/UPDATE_LOG.md and add the bilingual versions.ts entry in the same commit, push origin + mirror, verify Vercel.

## 5. UAT checklist
1. Sync with `www.linkedin.com/in/fredkli/` (no scheme) in the LinkedIn field only — URL is normalized on blur, sync returns fields (direct or via reader fallback), no dead end.
2. LinkedIn URL pasted in the Profile URL field — still recognized as LinkedIn identity.
3. Partnership sync from a website — logo lands in the form when the logo field was empty.
4. New-advisor dialog shows the source chooser; each tile routes correctly; strip absent when editing.
5. Mandatory highlighting: blank name shows amber; filling clears it; submit scrolls to first missing.
6. Badges: bump last_seen_version back → Updates dot appears; a pending advisor/user/change request shows the Admin count; clearing the queue clears the badge. Viewer sees no Admin badge.
7. EN/CN for every new label.

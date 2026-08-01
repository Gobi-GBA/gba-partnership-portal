# Portal Upgrade — Development Spec (v6.0)

Gobi Partnership Portal · prepared for Fred Li · 2026-07-26
Scope: performance, UX polish, navigation restructure, visual identity (desert/starry sync), star-map extensions.

---

## 1. Speed — advisor & network pages load too long

**Measured baseline (production, Vercel + Neon):** `/api/advisors` 2.1s cold / 1.0s warm (159 KB); `/api/partnerships` 1.0s (101 KB). The Advisors page shows empty skeletons ("0 advisors") for 2+ seconds on first visit.

**Root causes found in code:**
- `storage-pg.listAdvisors()` does `SELECT *`, dragging the HD `photo_url` column (up to 600 KB/row) from Neon on every list call — the route then discards it (`photoUrl: null`). Pure waste on the DB wire.
- No server-side caching: every page visit re-runs full table scans across the Neon pooler.
- No HTTP revalidation: reloads re-download identical JSON.
- No prefetch: data loading starts only when the page mounts.

**Fixes (thumbnail/HD split already exists — we make it real end-to-end):**
1. **Column-trimmed list queries** — `listAdvisors()` selects every column except `photo_url`; the detail endpoint `/api/advisors/:id` keeps serving HD. Same audit for partnerships (gallery `photos` are static URLs, already light).
2. **Server micro-cache** — in-memory TTL cache (60s) for the hot list GETs (`/api/advisors`, `/api/partnerships`, `/api/users`), version-bumped (instant invalidation) on any POST/PATCH/DELETE touching those tables. Warm serverless instances answer from memory in ~0 ms.
3. **ETag + 304 revalidation** — hot list GETs get `Cache-Control: private, no-cache` + ETag; unchanged reloads transfer no body.
4. **Login prefetch** — immediately after sign-in (and on app boot with a valid token), the client prefetches partnerships, advisors and updates in the background, so Advisors/Network/Partners open instantly.

**Target:** warm navigation to Advisors/Network feels instant (<100 ms perceived); cold prod load cut roughly in half.

## 2. Overall UX check-up

Sweep during UAT with fixes bundled in this release: consistent empty states, button busy states, dialog scroll behaviour, focus rings, mobile nav, tooltip coverage on icon-only buttons. Concrete items found are folded into §3–§6.

## 3. PIC staff picker — search + easy scrolling

`PicChecklist` (used for PIC and origin-staff selection) currently lists ~30 staff grouped by office with checkbox rows; no search; scrolling works but the list is long.

- Add a **search bar pinned at the top** of the popover (filters by name, title, office; EN + CJK substring).
- Keep office grouping under the filter; highlight nothing when query empty.
- **Selected staff bubble to a chip row** under the search bar for one-tap removal.
- Smooth two-finger trackpad scrolling: keep `modal` popover + `overscroll-contain`, raise max height, momentum scrolling on touch devices (`-webkit-overflow-scrolling: touch`).

## 4. Restricted-access sticker for R&D and Admin

- Nav items **R&D** and **Admin** get a small amber "sticker": lock glyph + `RESTRICTED` micro-label (EN) / `内部` (CN), with a tooltip explaining who can see the page (Admin: admins only; R&D: admins + dev-flagged users).
- The same badge repeats in each page's header, so screenshots of those pages are self-explanatory.

## 5. System requests → R&D page as a compact log

- The Admin "Feedback" tab moves to the **top of the R&D page** as a **compact log list**: one row per request — date · requester · message (truncated, click to expand) · status pill · inline status select + note (admin only; read-only for dev viewers).
- Admin tab count drops; the R&D page becomes the single place where the dev team triages incoming requests next to the roadmap items they become.
- Submission entry points for users stay unchanged.

## 6. Templates fold into Settings

- The Admin "Templates" editor (outreach emails + invitation letter) moves **inside the Settings tab** as a collapsible "Templates" section. One fewer top-level tab; Settings becomes the home of all configuration.

## 7. Visual — day/night desert sync, more life

The animated backdrop currently shows two unrelated scenes (light: desert + camels; dark: pure outer space). v6.0 makes them **the same Gobi desert, day and night**:

- **Shared scene** in both themes: layered dunes, a **camel caravan with human walkers** (a team moving forward — camels led and accompanied by people on foot), and an **oasis** (palm cluster + water glint) on the horizon.
- **Light mode:** warm daylight sky, sun, drifting sand grains, occasional **butterflies/dragonflies** near the oasis.
- **Dark mode:** the identical landscape under a **starry night** — existing star field + meteors kept, dunes as moonlit silhouettes, the caravan continues walking, **fireflies** glowing around the oasis, water reflecting starlight.
- Both scenes respect `prefers-reduced-motion` (static frame).

## 8. Post-login "interstellar" zoom-in

- After a successful sign-in, a ~1.6 s full-screen **warp transition** plays: star streaks accelerate radially (traveling through space), then ease into the home page.
- Skipped entirely under reduced motion; never blocks input for longer than the animation; plays only on interactive login (not on token restore).

## 9. Advisors join the partnership star map

- The Network page force graph gains **advisor nodes**: small gold star-dots orbiting the partner org they are linked to (via the v5.15 role→partner links).
- Tooltip: name · role @ org. Click → advisor profile. Legend gains "Advisor" entry and a **show/hide advisors toggle**.
- Only advisors with a linked partner appear on the org map (free-text orgs have no anchor there).

## 10. Advisor star-map view (secondary to cards)

- The Advisors page view switch becomes **Grid | List | Map**.
- Map mode renders an **advisor constellation**: org hubs (linked partners and notable free-text orgs) as constellation centres, advisors as stars clustered around their org; unlinked advisors drift in an outer ring. Starry backdrop consistent with §7/§9.
- Click a star → the existing advisor profile dialog. Filters/search above the map keep working (map shows the filtered set).

---

## Delivery plan

1. Perf work (§1) — server + client.
2. Structure moves (§4, §5, §6) + PIC picker (§3).
3. Visual scene rebuild (§7) + login warp (§8).
4. Star maps (§9, §10).
5. Full UAT (§2 sweep), bilingual check, dark/light screenshots, then release to both repos + Vercel.

Version: `CURRENT_VERSION = "6.0"` with bilingual changelog entries.

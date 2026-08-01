# Portal Upgrade — Development Spec (v6.01)

Scope: eleven targeted UI/infrastructure improvements on top of v6.0. Grounded in a code audit of the current build (commit 779885d).

## 1. Fast hover tooltips on star maps (pic 1)

**Problem.** Advisor stars on the partner network graph and advisor star map use native SVG `<title>` tooltips (network-graph.tsx:348-352, 821). Browsers delay these ~1s and style them as plain OS tooltips; the info feels slow.

**Change.**
- Replace native `<title>` with a custom HTML tooltip rendered inside the graph container: absolutely-positioned div, navy glass background, gold border, white text, `pointer-events: none`.
- Show on `mouseenter` with zero delay, follow the cursor (offset ~14px, clamped to container edges), hide on `mouseleave`.
- Apply to advisor stars on BOTH graphs (partner network + advisor star map), and extend to org/partner nodes: partner nodes show "name · collab summary", org hubs on the advisor map show "org · n advisors".
- Bilingual-safe: content is data-driven text already assembled in `tooltip` fields.
- Testid: `graph-tooltip`.

## 2. Click the Gobi hub to reset the map (pic 2)

**Problem.** After zooming/panning into a region, getting back requires the small reset button (network-graph.tsx:585, 964 already implement `resetView`).

**Change.**
- Clicking the center "Gobi Partners" node on the partner network resets zoom/pan to the fitted view (same 300ms transition as the reset button).
- Same on the advisor star map: clicking the center "Gobi Advisory Network" node resets the view.
- Cursor `pointer` + fast tooltip "Click to reset view / 点击复位视图" on the center node.
- Testid: center node carries `data-testid="node-center-reset"`.

## 3. Partner activity photos — upload portal with server-side assets

**Problem.** Partnership gallery photos are a raw URL textarea (edit-partnership.tsx:299-305, `photos: string[]` schema line 199). No uploads, no thumbnails, no grouping; external URLs rot.

**Change — storage.**
- New `assets` table: `id`, `ownerType` ('partnership' | 'advisor'), `ownerId`, `filename`, `mime`, `thumbData` (base64 JPEG ≤ ~120KB, max edge 640px), `hdData` (base64 original ≤ 8MB), `uploadedBy`, `createdAt`. Assets are grouped on the server by owner — the same registry pattern the advisor network uses — so each partner org owns its folder of activity photos.
- Endpoints (auth required, same cache discipline as v6.0):
  - `POST /api/assets` — JSON `{ownerType, ownerId, filename, mime, thumbData, hdData}` (editor+; 25MB body limit already configured, app.ts:17).
  - `GET /api/assets/:id/thumb` — decoded image, `Cache-Control: public, max-age=31536000, immutable`.
  - `GET /api/assets/:id/hd` — decoded image; `?download=1` adds `Content-Disposition: attachment; filename=...` for HD download.
  - `DELETE /api/assets/:id` — editor+.
  - `GET /api/assets?ownerType=partnership&ownerId=n` — list metadata (no blobs).
- `partnerships.photos` keeps its `string[]` shape; uploaded photos are stored as `asset:<id>` tokens alongside any legacy `https://` URLs (both render; no migration needed).

**Change — client.**
- Edit-partnership photo section becomes an upload portal: file input (multi-select, jpg/png/webp), drag-and-drop zone, thumbnail grid of current photos with remove buttons; legacy URL textarea remains available in a collapsed "Advanced" row.
- Auto-thumbnail in the browser before upload (canvas resize to 640px JPEG q0.82) — the carousel and lists always load thumbs, so speed is protected regardless of the original size.
- `PhotoCarousel` resolves `asset:<id>` → thumb URL and gains a download button (bottom-right) that fetches `/api/assets/:id/hd?download=1` for the HD original. Legacy URLs get a plain "open" link instead.
- Testids: `input-photo-upload`, `dropzone-photos`, `button-remove-photo-{i}`, `button-download-hd`.

## 4. Advisor cards/list show the Gobi PIC

**Problem.** `advisors.gobiPics` exists (schema line 266) and is editable, but card and list views don't show it — partnerships show their PICs on cards.

**Change.**
- Advisor card (grid view): a muted "PIC · name, name" row with a small person icon, matching the partnership card treatment.
- List view: a PIC column (truncated, tooltip on hover).
- Bilingual label reuses the existing PIC dictionary key.
- Testids: `text-advisor-pic-{id}` (card), same content in list rows.

## 5. User profile — mandatory email

**Problem.** `users.email` is the login identifier (schema line 15) but the profile dialog only exposes name / title / avatar; email is invisible after registration and can't be corrected for sync/automation use.

**Change.**
- ProfileDialog gains an Email field, prefilled from the account, **mandatory** (client validation: non-empty + email format; server: 400 on empty/invalid, 409 on duplicate).
- Saving updates `users.email` (login follows the new address) — the field feeds later Gmail sync and auto-workflow features.
- `PATCH /api/profile` accepts `email`; audit-logged like other profile edits.
- Testids: `input-profile-email`.

## 6. Unsaved-changes guard on all edit surfaces

**Problem.** Edit dialogs and forms (partnership editor, advisor editor, profile dialog, settings/templates) close silently on Escape, overlay click, or navigation — unsaved edits are lost without warning.

**Change.**
- A shared dirty-state guard: every edit surface tracks whether the user changed anything since open (deep compare of form state vs snapshot on open).
- If dirty and the user attempts to close (X, Escape, overlay click, Cancel, or view switch), a compact confirm dialog appears: **Save changes** (primary, runs the surface's existing save), **Discard** (destructive, closes and resets), **Keep editing** (dismiss).
- Clean forms close instantly as today.
- Applies to: partnership edit dialog, advisor editor, profile dialog, admin settings (COO email + templates), and the register/submit form's suggest-changes mode.
- Bilingual copy: "Unsaved changes / 未保存的修改", "Save changes / 保存修改", "Discard / 放弃修改", "Keep editing / 继续编辑".
- Testids: `dialog-unsaved`, `button-unsaved-save`, `button-unsaved-discard`, `button-unsaved-keep`.

## 7. System-request feedback view as a personal response tracker

**Problem.** The Updates page lists system requests, but it reads as a plain log. Regular users already see only their own submissions; admins and devs see everyone's with no way to isolate their own. Nobody gets an at-a-glance view of how their requests are progressing.

**Change.**
- A tracker strip above the request list summarising the signed-in user's own requests by status: Open / In progress / Solved / Declined counts as coloured chips; clicking a chip filters the list by that status (click again to clear).
- Admins and devs get a **Mine / All** toggle — "Mine" turns the shared log into their personal tracker; in "All" view their own rows carry a subtle "You" tag.
- Each request card shows the response timestamp (`updatedAt`) when the team has updated status or left a note — so the card tracks submission → team response.
- Bilingual labels: "My requests / 我的请求", "All requests / 全部请求", "You / 你", "Updated / 更新于".
- Testids: `tracker-feedback`, `chip-status-{status}`, `toggle-feedback-mine`, `toggle-feedback-all`, `tag-feedback-you`.

## 8. Login warp — gradient, translucent, fades into the portal

**Problem.** The post-login "warp" animation paints a near-opaque dark fill (`rgba(4,8,20,0.92)`, galaxy-bg.tsx:578) for 75% of its 1.6s run — it blacks out the screen, then hard-cuts to the portal instead of arriving in it.

**Change.**
- Replace the flat fill with a radial gradient veil — deep navy at the edges thinning to near-transparent at the centre — so the portal home page is visible underneath from the start and the streaks feel like an overlay, not a curtain.
- Cap overall veil opacity (~0.55) and ease it down continuously from mid-animation so the effect dissolves into the portal environment rather than snapping off; streak alpha follows the same curve.
- Render the home page beneath the overlay during the warp (it already mounts before `onDone`), so "arrival" is a fade, not a swap.
- Duration unchanged; `prefers-reduced-motion` skip unchanged.

## 9. Thank-you notes on submissions — auto-fading, zero-click

**Problem.** Saves and submissions confirm with plain toasts ("Saved") — functional, but they neither thank nor encourage contributors, and some require dismissal.

**Change.**
- A complimentary "thank-you" note slides in at the right-hand side after contribution events: new partnership submitted, change suggestion sent, feedback posted, advisor activity added, photo uploaded, profile completed.
- Auto-fades after ~3.5s with no buttons and no required interaction; pointer passes through — purely an acknowledgement.
- Warm, varied copy (rotates so it doesn't feel canned), bilingual, addressed with the user's first name when signed in — e.g. "Thank you, Fred — your update keeps the network sharp. / 谢谢，Fred —— 你的更新让网络更敏锐。"
- Styled to the brand: navy glass, gold accent bar, small sparkle icon; stacks politely if two fire in a row.
- Testid: `toast-thankyou`.

## 10. Gentle interactivity for the desert-night background

**Problem.** The animated background (camels, travellers, palms, stars) is decorative only; clicking it does nothing. It should feel alive — without costing loading or battery.

**Change.**
- Clicks that land on empty background (not on cards, buttons, or other interactive elements) hit-test the scene: the nearest actor within a small radius reacts once — a camel bobs its head, a traveller waves "hi", a palm sways, a star pulses a small ring.
- Reactions are short (≤1.2s), driven by the existing animation frame loop with a transient state — no new render loops, no extra assets, no layout work; cost is one hit-test per click.
- At most one reaction at a time; reduced-motion users get a subtle single-frame twinkle instead.
- Purely cosmetic: no navigation, no state changes, nothing persisted.

## 11. Faster loading overall

**Problem.** The initial bundle carries every page — d3 graphs, admin panels, editors — regardless of route; the galaxy canvas starts immediately and competes with first paint.

**Change.**
- Route-level code splitting: lazy-load heavy pages/components (network graphs incl. d3, advisor CRM, admin settings, editors) via `React.lazy` + `Suspense` with lightweight skeleton fallbacks — first paint ships only the shell + current page.
- Defer the galaxy background's animation start to `requestIdleCallback` (fallback: 300ms timeout) so content renders before decoration.
- Photo thumbnails (item 3) guarantee galleries never load HD originals into lists or carousels.
- Verify with the production build: report initial JS size before/after in UAT.

## Non-goals

- No external object storage (S3 etc.) — assets live in Neon next to advisor photos (photoUrl data-URI pattern, schema line 262), consistent with the serverless deployment.
- No public exposure: assets endpoints require a signed-in session; advisor personal data rules unchanged.

## Release

tsc + build clean → UAT (tooltips, hub reset, upload/carousel/download, advisor PIC, profile email validation, unsaved-changes guard, feedback tracker, warp fade, thank-you notes, background reactions, bundle-size check) → secret & storage-literal scans → push origin+mirror → Vercel verify → preview redeploy.

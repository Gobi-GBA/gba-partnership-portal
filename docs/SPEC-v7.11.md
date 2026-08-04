# Portal Upgrade — Development Spec (v7.11)

**Gobi staff get edit rights by default; edits and additions go live without admin approval, except partnership level**

| | |
|---|---|
| Version | 7.11 |
| Author | Fred Li |
| Date | 2026-08-04 |
| Status | Draft — awaiting approval to implement |
| Depends on | v7.09 (audit trail), v7.10 (no functional dependency) |
| Repo | `Gobi-GBA/gba-partnership-portal` (public) · mirror `lklfred-design/gba-partnership-portal` |

---

## 1. Problem

A colleague who signs in with their `@gobi.vc` Google account is auto-approved as a **viewer**, which is read-only. To do anything useful an admin must manually upgrade them, and even then a staff member cannot edit an approved partnership directly — every change has to go through a change request that an admin approves. New submissions land as `pending` and stay invisible until approved.

The production data shows this is pure friction rather than a working control:

| Fact | Value |
|---|---|
| Users with role `viewer` | **0** |
| Users with role `staff` | 11 (10 `@gobi.vc`, 1 external) |
| Users with role `admin` | 5 (all `@gobi.vc`) |
| Partnerships with status `pending` | **0** of 86 |
| Change requests ever filed | **2**, both already approved |

Every single non-admin account has been hand-upgraded away from the viewer default, and no submission has ever sat in the pending queue. The approval gate is not catching anything; it is generating manual admin work and, in the case of the change-request flow, discouraging people from correcting records at all.

## 2. Goal

Trusted colleagues on the `@gobi.vc` domain should be able to add and correct partnership and advisor information the moment they notice something, with no admin in the loop. Approval is reserved for the small number of changes that carry real weight.

## 3. Decisions taken

Confirmed with Fred on 2026-08-04:

| # | Question | Decision |
|---|---|---|
| 1 | Which changes still need approval | **Partnership stage / level only.** Not partner name, not PIC assignment. Delete stays admin-only. |
| 2 | Edit touching both a free and a gated field | **Apply the free fields immediately, queue the gated one** as a change request. No work is lost. |
| 3 | Stage a staff member may set on a brand new record | **Any stage, including strategic.** New records go live at whatever stage was chosen. |
| 4 | Scope | **Partnerships and advisors**, with advisor onboarding/lifecycle status treated as the gated field. |

### 3.1 Consequence of decision 3 worth noting

Creation is unrestricted but stage *changes* are gated, so there is a theoretical bypass: create a record directly at `s4_strategic` rather than promoting an existing one into it. This is accepted deliberately — creating a duplicate record to dodge review would be conspicuous in the log, and every creation is audited with its stage. Flagged here so the choice is on the record, not discovered later.

## 4. Permission model

### 4.1 New concept: Gobi editor

The privilege is tied to the email domain, not to the role alone — matching the requirement that this applies to "staff with `@gobi.vc`". The one external staff account keeps today's change-request behaviour.

```
isGobiEditor(user) =
  user.status === "approved" && (
    user.role === "admin" ||
    (user.role === "staff" && user.email endsWith "@gobi.vc")
  )
```

Implemented in `server/routes.ts` next to the existing `isGobiEmail` helper, and mirrored to the client via `/api/auth/me` as a boolean `canEditDirectly` so the UI never has to re-derive the rule.

### 4.2 Capability matrix

| Capability | Admin | Gobi staff (new) | Gobi staff (today) | External staff | Viewer |
|---|---|---|---|---|---|
| Add partnership, live immediately | Yes | **Yes** | No — lands pending | No — lands pending | No |
| Edit approved partnership, free fields | Yes | **Yes** | No — change request | No — change request | No |
| Change partnership stage | Yes | Queued for approval | No — change request | No — change request | No |
| Add advisor, live immediately | Yes | **Yes** | No — lands pending | No — lands pending | No |
| Edit approved advisor, free fields | Yes | **Yes** | No | No | No |
| Change advisor lifecycle / status | Yes | Queued for approval | No | No | No |
| Delete partnership or advisor | Yes | No | No | No | No |
| Hall of Fame, Domain Knowledge Partner | Yes | No | No | No | No |
| LP status | IR team only | IR team only | IR team only | IR team only | No |

Rows marked "No" for the new column are unchanged from today. The Hall of Fame, Domain Knowledge Partner and LP restrictions are pre-existing and deliberately left alone — decision 1 named stage only, so this spec does not widen access to anything else.

### 4.3 Default role on sign-up

`server/routes.ts` currently assigns `role: "viewer"` to auto-approved `@gobi.vc` accounts in two places — `POST /api/auth/register` (line ~683) and the Google callback (line ~793). Both become `role: "staff"`.

External Google sign-ups are unaffected: they continue to be created as `staff` with status `pending`, awaiting admin approval, and even once approved they are not Gobi editors.

## 5. Behaviour

### 5.1 `POST /api/partnerships`

Change one line of intent: `status: isAdmin ? "approved" : "pending"` becomes `status: isGobiEditor ? "approved" : "pending"`.

The `hallOfFame` and `isDomainKnowledgePartner` flags remain `isAdmin`-gated. Stage is accepted as submitted per decision 3.

### 5.2 `PATCH /api/partnerships/:id`

Current guard rejects any non-admin editing an approved record. New logic:

1. Allow when `isGobiEditor`, or when the caller owns the record and it is still pending (unchanged).
2. Split the incoming body:
   - **Admin-only fields** — `status`, `hallOfFame`, `isDomainKnowledgePartner`: stripped for non-admins, as today.
   - **LP status** — unchanged, IR team only.
   - **Gated field** — `stage`. For a non-admin Gobi editor, if `stage` is present and differs from the stored value, remove `stage` and `collabLevel` from the patch and open a change request containing only `{ stage }`.
   - **Everything else** applies immediately.
3. Audit as today for the applied fields, plus a `change_request` entry for the queued stage.

Editing one's own still-pending record keeps today's unrestricted behaviour — the record is not live, so there is nothing to protect.

**Response contract.** The endpoint returns the updated partnership with two optional extra keys so the client can be precise about what happened:

```jsonc
{
  "...": "updated partnership fields",
  "queued": { "stage": "s4_strategic" },   // present only when something was deferred
  "changeRequestId": 7
}
```

### 5.3 `DELETE /api/partnerships/:id`

Unchanged — admin only.

### 5.4 `POST /api/advisors`

`status: isAdmin ? "approved" : "pending"` becomes `status: isGobiEditor ? "approved" : "pending"`.

### 5.5 `PATCH /api/advisors/:id`

Current guard: only admins may edit an approved advisor. New logic mirrors 5.2 — Gobi editors may edit approved advisors, with `lifecycleStatus` and `status` as the gated fields. Both are already admin-gated in the handler; for a non-admin Gobi editor a requested `lifecycleStatus` change is now queued as a change request rather than silently dropped.

The existing `POST /api/advisors/:id/workflow` route, which drives lifecycle transitions with their own approval emails, is **not** changed. It stays admin-driven and remains the primary path for onboarding an advisor. The queued change request is a fallback for someone who edits the field on the profile form.

### 5.6 Personal data

Advisor emails, photos, mobile numbers and WeChat IDs remain excluded from the public repository. This spec does not add, move or expose any of those fields. Widening who may edit an advisor record does not widen who may see contact details — the existing redaction rules are untouched.

## 6. Data model

`change_requests` is currently partnership-only. Extend it the same way `audit_logs` was generalised in v6.04: add an `entity_type` column defaulting to `'partnership'`, and let `partnership_id` double as the generic entity id.

**`shared/schema.ts`**

```ts
export const changeRequests = sqliteTable("change_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type").notNull().default("partnership"), // 'partnership' | 'advisor' (v7.11)
  partnershipId: integer("partnership_id").notNull(),               // generic entity id
  proposedBy: integer("proposed_by").notNull(),
  changes: text("changes").notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
});
```

**`server/storage-pg.ts`** — append to the idempotent migration list:

```sql
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'partnership'
```

**`server/storage-sqlite.ts`** — matching column for local development.

The default backfills the two existing rows correctly, so no data migration is required.

`PATCH /api/change-requests/:id` (admin approve/reject) must branch on `entityType` and apply the approved change to the right table.

## 7. Frontend

| File | Change |
|---|---|
| `client/src/pages/partners.tsx` / detail dialog | Show the edit affordance to Gobi editors, not just admins. Stage control carries a short note that changes go to an admin. |
| `client/src/pages/submit.tsx` | Drop the "your submission will be reviewed" messaging for Gobi editors; confirm the record is live. |
| `client/src/pages/advisors.tsx` | Same treatment for the advisor form. |
| `client/src/pages/admin.tsx` | Change-request queue shows an entity-type column and renders advisor rows. |
| `client/src/components/user-panels.tsx` | The "request edit rights" prompt is now only meaningful for external accounts — hide it for Gobi editors. |
| `client/src/lib/i18n.tsx` | New EN/CN strings for the partial-save notice, the stage-queued note and the revised submit confirmation. |

**Partial-save notice.** When a response carries `queued`, the toast must state plainly what saved and what did not, in both languages. English: "Saved. The partnership level change is waiting for admin approval." Simplified Chinese: "已保存。合作层级的变更正在等待管理员审批。"

## 8. Copy and email changes

`server/mailer.ts` line ~132 tells new colleagues they are approved "as a **viewer**" and that "an admin can upgrade your role if you need to register or edit partnerships". Both sentences are now wrong. Replace with wording that says they can add and edit partnership and advisor records straight away, and that changes to partnership level go to an admin. Both EN and CN variants.

## 9. Audit trail

No new audit actions. Direct edits by Gobi editors record `update` exactly as an admin edit does, so v7.09's update log picks them up with no change. Queued stage changes record `change_request`, and the admin decision records `change_approved` or `change_rejected` as today.

This matters for accountability: removing the approval gate must not remove the record of who changed what. It does not — every write still passes through `audit()`.

## 10. Migration and rollout

- No user-row migration needed: there are zero viewers to upgrade.
- One idempotent `ALTER TABLE` on `change_requests`, safe to re-run.
- No change to existing partnership or advisor rows.
- Reversible: restoring `isAdmin` in place of `isGobiEditor` at the four call sites returns the old behaviour without touching data.

## 11. Out of scope

- Renaming the `staff` role to `editor`. Cosmetic, and it would touch every role check.
- Per-field or per-record permissions beyond the domain rule above.
- Any change to the advisor `/workflow` approval-email flow.
- Any change to Hall of Fame, Domain Knowledge Partner or LP status gating.

## 12. Test plan

Executed against a local build before release, then spot-checked in production.

1. A `@gobi.vc` staff account can add a partnership and see it live immediately, at every stage including strategic.
2. The same account edits an approved partnership's description — saves instantly, appears in the update log as `update`.
3. The same account edits description **and** stage together — description saves, stage is queued, response carries `queued.stage`, toast names both outcomes, admin queue shows one pending request.
4. Approving that request applies the stage and mirrors `collabLevel`.
5. The same account cannot delete, cannot set Hall of Fame, cannot set Domain Knowledge Partner.
6. The external staff account still gets the change-request path for every edit.
7. A viewer account, created by hand for the test, remains read-only.
8. Advisor equivalents of 1, 2, 3 and 5.
9. Google sign-in with a fresh `@gobi.vc` account provisions role `staff`, approved, and lands on a portal where the edit controls are visible.
10. Typecheck, production build, secret scan, browser-storage scan.

## 13. Open dependency

Google sign-in on `network.gobi.vc` was verified working on 2026-08-04: the authorization request reaches Google's account chooser with no `redirect_uri_mismatch`, using OAuth client `206232852755-7ucsolh4k5n30lqfqupjsr0t2mkbs0i7`. The full round trip still needs a real `@gobi.vc` Google account to confirm, which is test 9 above.

---

*Sources for the production figures in section 1: direct queries against the Neon production database on 2026-08-04 — `users`, `partnerships` and `change_requests` tables. Route and schema line references are against commit `1cfd096` (v7.10).*

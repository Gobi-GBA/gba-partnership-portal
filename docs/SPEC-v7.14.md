# Portal Upgrade — Development Spec (v7.14)

**A conflict-of-interest declaration is required before the COO advisor approval email can be sent**

| | |
|---|---|
| Version | 7.14 |
| Author | Fred Li |
| Date | 2026-08-06 |
| Status | Implemented |
| Depends on | v6.11 (single-source approval email), v7.09 (advisor audit trail and route ordering), v7.11 (Gobi editor permission model) |
| Repo | `Gobi-GBA/gba-partnership-portal` (public) · mirror `lklfred-design/gba-partnership-portal` |

---

## 1. Problem

Any approved staff member can open an advisor record and send the COO office an
approval request arguing for that person's appointment. The email is persuasive
by design — it opens with an AI-drafted "why this advisor, and why now"
paragraph written by the requester.

Nothing in that flow asks the requester whether they stand to gain from the
appointment. A staff member who holds equity in the candidate's employer, who
receives consulting fees from an affiliated organisation, or who is related to
the candidate can advocate for them to the COO with no disclosure whatsoever,
and the COO office has no way to know from the email that they should discount
it. The record of who asked exists (`requesterName`, the audit log), but the
material fact — whether that person was disinterested — is nowhere.

This is the one place in the portal where an individual's advocacy converts
directly into an appointment decision made by someone else, so it is the one
place the declaration belongs.

## 2. Goal

Make the disinterest of the requester an explicit, recorded, server-enforced
precondition of the approval email, and make a declared conflict stop the email
rather than merely annotate it.

## 3. Decisions taken

Confirmed with Fred before implementation:

| # | Question | Decision |
|---|---|---|
| 1 | Does a declared conflict block anything besides the approval email | **No.** CRM outreach emails and invitation letters are explicitly out of scope and keep today's behaviour. The gate covers `POST /api/advisors/:id/approval/send` only. |
| 2 | What does the declaration cover | **The candidate personally, and their employer or any affiliated organisation, including any equity holding or payment.** One sentence, one scope, used verbatim in the dialog, the email attestation and the audit note. |
| 3 | Where is a declaration recorded | **On the advisor record, and in both the activity feed and the audit log.** Not one or the other. |

### 3.1 The candidate is never punished for the sender's conflict

The most important consequence, stated explicitly so it is not eroded by a later
change: a declared conflict is a fact about the **sender**, not about the
candidate. It must never reject, downgrade or withdraw the candidate. They stay
`pending` with their lifecycle status untouched, and the block exists purely so
an admin can hand the approval request to a colleague who has no conflict.

### 3.2 A block applies to everyone, not just the declarer

If a conflict were only binding on the person who declared it, the control would
be worthless: the same staff member could ask a colleague to click send, or the
declarer could reopen the dialog and change their answer. So once the flag is
raised, the approval email is blocked for **every** sender until an admin clears
it. That is the only reason the admin clearance step exists.

## 4. Data model

Seven columns added to `advisors`, in both `shared/schema.ts` (SQLite, local) and
`shared/schema-pg.ts` (Neon Postgres, Vercel), with matching additive migrations
in `server/storage-sqlite.ts` (`ensureColumn`) and `server/storage-pg.ts`
(`ADD COLUMN IF NOT EXISTS`).

| Column | Type | Notes |
|---|---|---|
| `coi_status` | text, not null, default `"none"` | one of `none` \| `cleared` \| `blocked` |
| `coi_declared_by` | text, nullable | display name of the declaring staff member |
| `coi_declared_by_email` | text, nullable | staff email, staff-visible only |
| `coi_declared_at` | text, nullable | ISO timestamp of the declaration |
| `coi_details` | text, nullable | free text, trimmed and capped at 2000 chars |
| `coi_cleared_by` | text, nullable | admin who cleared the flag |
| `coi_cleared_at` | text, nullable | ISO timestamp of the clearance |

All seven are additive with safe defaults, so existing rows migrate to
`coi_status = "none"` and behave as "no declaration on file yet".

`redactAdvisor` nulls `coi_declared_by`, `coi_declared_by_email`,
`coi_declared_at`, `coi_details`, `coi_cleared_by` and `coi_cleared_at` for
non-staff readers. The bare `coi_status` is retained for everyone, because it
carries no personal data and the client needs it to reason about the send
button.

## 5. The gate

`shared/coi.ts` is a new dependency-free module holding the rules, so the server
route, the client button state and the tests reason about one implementation
rather than three. `evaluateCoiGate(current, declaration)` resolves in strict
precedence order:

| # | Condition | Result | Effect |
|---|---|---|---|
| 1 | `coiStatus === "blocked"` | `coi_blocked`, next status `null` | Send refused. Nothing re-recorded — the original declaration stands. |
| 2 | `declaration.conflict === true` | `coi_declared`, next status `blocked` | Send refused, declaration persisted, flag raised, activity + audit written. Candidate status untouched. |
| 3 | otherwise | allowed, next status `cleared` | Send proceeds; attestation stamped into the email and onto the record. |

Rule 1 deliberately outranks rule 2: an already-blocked advisor does not get a
second declaration written over the first.

The module also exports `normalizeCoiDetails` (trim, cap, empty → `null`),
`formatCoiTimestamp` (`2026-08-06 15:42 UTC`, dependency-free and identical on
client and server), `COI_SCOPE` (the decision-2 wording, en + cn) and
`coiAttestationText(lang, requesterName, declaredAtIso)`.

## 6. Server behaviour

### 6.1 `POST /api/advisors/:id/approval/send`

`approvalSendSchema` gains a **required** field:

```ts
coi: z.object({ conflict: z.boolean(), details: z.string().max(2000).optional() })
```

Required with no default, deliberately: an older client that omits the field
gets a `400` rather than silently sending an unattested approval email.

The gate is evaluated **before** the `mailEnabled` check, so a conflict is
recorded even on an instance where outbound email is not configured.

| Outcome | Status | Body | Side effects |
|---|---|---|---|
| Already blocked | `409` | `{ reason: "coi_blocked", coi }` | None. |
| Conflict declared now | `409` | `{ reason: "coi_declared", coi }` | `coiStatus = "blocked"`, declarer + timestamp + details persisted, activity note, audit entry. Candidate `status` and `lifecycleStatus` unchanged. |
| Clean declaration | `200` | as before | `coiStatus = "cleared"`, declarer + timestamp persisted, attestation rendered into the email, activity note, enriched audit entry. |

### 6.2 `POST /api/advisors/:id/coi/clear` — new, admin only

Clears the flag so the request can be reassigned. `409 coi_not_blocked` if the
advisor is not blocked. Accepts an optional `note`. Writes `coiClearedBy`,
`coiClearedAt`, an activity note and an audit entry. Clearing is explicitly
**not** a decision on the candidate.

### 6.3 `GET /api/advisors/coi/blocked` — new, admin only

Feeds the admin console panel. Two path segments after `/api/advisors`, so it
cannot be swallowed by the single-segment `/api/advisors/:id` route the way
`/api/advisors/audit` was in v7.09 — the same shape as the existing
`/api/advisors/outreach/*` endpoints. Do not introduce an
`/api/advisors/:id/:something` route above it.

### 6.4 Not reachable through the generic edit

The COI columns are absent from `advisorInputSchema`, and `PATCH
/api/advisors/:id` builds its patch from that whitelist, so no COI field can be
set or cleared through the ordinary advisor edit. The only writers are the three
routes above.

## 7. Email

`ApprovalEmailData` gains optional `coiAttestation?: string | null`. When
present, one extra row is spliced into the candidate-profile table between
"Public listing clearance" and "Requested by", labelled *Conflict of interest* /
*利益冲突声明*. When absent — the pre-declaration preview — the row does not
render at all.

The attestation names the requester and the declaration timestamp:

> Fred Li declared no conflict of interest on 2026-08-06 15:42 UTC, covering the
> candidate personally, and their employer or any affiliated organisation,
> including any equity holding or payment.

> 李国樑 已于 2026-08-06 15:42 UTC 声明：与该人选本人，及其雇主或任何关联机构，包括任何股权或报酬安排之间不存在利益冲突。

Because the email is rendered from `shared/approval-email.ts` by both the live
preview and the send path (v6.11), the attestation the requester sees in the
dialog is the one the COO receives.

## 8. Frontend

### 8.1 `client/src/components/advisor-approval-dialog.tsx`

- A declaration block sits directly above the email preview: a two-option radio
  (*no conflict* / *conflict to declare*), the scope sentence, and a details
  textarea that appears only when a conflict is selected.
- The declaration is **never** pre-filled and is reset on every open, so a prior
  attestation cannot be carried silently into a new send.
- `button-approval-send` stays disabled until *no conflict* is selected, and is
  disabled outright when the advisor is already blocked.
- Selecting *conflict to declare* replaces the send button with a destructive
  *Record conflict and stop* action. No path from this dialog both declares a
  conflict and sends the email.
- If `compose.coi.blocked` is true on open, a block banner naming the declarer
  and the date replaces the declaration form entirely.

### 8.2 `client/src/pages/admin.tsx`

New **Conflicts** tab reading `GET /api/advisors/coi/blocked`, one card per
blocked advisor showing the declarer, date and details, with a *Clear conflict*
action. Copy states plainly that clearing is not an approval or rejection of the
candidate.

### 8.3 i18n

All new strings are bilingual in `client/src/lib/i18n.tsx` (EN + CN), including
the scope sentence and the note that the gate covers the COO approval email only.

## 9. Audit trail

Every declaration and every clearance writes both an advisor activity note and
an audit entry with `entityType = "advisor"`. Details text is staff-visible only,
in line with §4.

## 10. Out of scope

- `client/src/components/advisor-outreach.tsx` — the CRM outreach email. Untouched by decision 1.
- `server/letter.ts` — the invitation letter. Untouched by decision 1.
- Any automatic decision on the candidate. See §3.1.
- Any notion of a conflict register for partnerships rather than advisors.

## 11. Test plan

COI cases were added to the existing `server/mailer.test.ts` rather than a
throwaway script, run by `npm test` / `npm run test:outreach`:

| Case | Asserts |
|---|---|
| Clean declaration from `none` | allowed, next status `cleared` |
| Clean declaration from `cleared` | allowed — a previously cleared advisor can be sent again |
| Conflict declared from `none` | refused, `coi_declared`, next status `blocked` |
| Clean declaration against `blocked` | refused, `coi_blocked` — a colleague cannot route around a declaration |
| Conflict declared against `blocked` | refused, `coi_blocked` — rule 1 outranks rule 2 |
| `normalizeCoiDetails` | trims, caps at 2000, empty/undefined/null → `null` |
| `coiAttestationText` | names requester and UTC timestamp, in EN and CN, with the decision-2 scope wording |
| `buildApprovalEmail` with attestation | renders the labelled row in EN and CN, in HTML and plain text |
| `buildApprovalEmail` without attestation | omits the row entirely |

## 12. Data note

The four `Analyst01` author cells in `UPDATE_LOG.md` (v6.06, v6.07, v7.12,
v7.13) and the matching four in `client/src/lib/versions.ts` were rewritten to
**Elaine Zhang**, her real name, in the same release. The `analyst01@gobi.vc`
address in `DEFAULT_APPROVAL_CC` is a mailbox rather than a display name and was
deliberately left alone.

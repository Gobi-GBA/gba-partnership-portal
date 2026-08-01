# Portal Upgrade — Development Spec (v7.09)

**Author:** Fred Li · **Date:** 2026-08-01 · **Baseline:** v7.08 (`166ab09`)

This is your prompt rewritten as a build spec. Four requirements, each with the
evidence I gathered from production, the decision taken, and the acceptance test
that proves it done.

---

## Findings from production before writing this spec

These numbers come from the live Neon database and the live site on 1 Aug 2026.
They change what requirements 1 and 2 have to say.

| Observation | Value | Consequence |
| --- | --- | --- |
| Partnerships table has **no `updated_at` column** | only `created_at`, `start_date` | "Sort by modify date" cannot read a column; it must be derived from the newest audit entry per record |
| Partnership records with **no creation entry** in the audit log | 71 of 86 | The log is not merely filtered — the history was never written |
| Advisors with **no creation entry** in the audit log | 22 of 25 | Same gap, worse proportionally |
| Audit logging actually starts | partnerships 15 Jul, advisors 29 Jul | Everything entered before those dates is invisible |
| Partnerships by status | 86 approved, 0 pending, 0 rejected | The v7.08 fix works, but there is currently nothing pending to reveal |
| Advisors by status | 24 approved, 1 rejected | Status badges will have something to show |
| `APP_URL` in Vercel | now `https://network.gobi.vc` | **Root cause of requirements 3 and 4 — see below** |

### Root cause found for requirements 3 and 4

The portal moved to the custom domain `network.gobi.vc`. Both failures follow
from that one change:

- **Google sign-in.** The server now sends Google
  `redirect_uri=https://network.gobi.vc/api/auth/google/callback`. Ameen
  registered `https://gba-partnership-portal.vercel.app/api/auth/google/callback`
  — the old domain. Google rejects the new one, so sign-in fails again.
- **Approval email.** The emailed link now points at `network.gobi.vc`. The
  approver must sign in to record a decision, sign-in is broken, so the approval
  journey dead-ends. The email itself sends correctly; the landing does not work.

Both are fixed by registering two more entries in Google Cloud Console, not by
changing code. Code changes below cover only the logs.

---

## R1 — The three data logs must be complete, status-bearing and activity-sorted

Applies to **System requests**, **Partnership records log** and **Advisor update
log**. The **System update log** tab is the release history and is out of scope;
it stays sorted newest version first.

1. **Show every submission regardless of status**, not only approved ones. A
   record awaiting approval is exactly the record a colleague needs to see.
2. **Every row carries a status badge** — pending, approved or rejected — using
   the existing status colour vocabulary.
3. **Sort by when the record was entered or last touched, newest first.** Not by
   effective date, not by partnership start date. Where a record has been edited,
   the edit date governs its position.
   - Partnerships: `lastActivityAt = max(newest audit entry for that record, created_at)`.
   - Advisors: newest audit entry for that advisor.
   - System requests: `updatedAt` where present, else `createdAt`.
4. **Each row states its own last activity in words** — action, who did it, when
   — so the log reads as a log rather than a directory.

**Acceptance:** for each of the three tabs, the first row is the most recently
touched record in the database; a record edited today outranks a record created
last week with a start date next year; every row shows a status.

## R2 — Recover the missing history

**Decision taken:** backfill from the records themselves.

1. For every partnership and advisor with no creation entry, synthesise one:
   dated from the record's own `created_at`, attributed to `submitted_by` where
   that is recorded.
2. Where no submitter is on file, attribute it to "original submitter not
   recorded" rather than inventing a name.
3. Mark every synthesised entry as **reconstructed from the record** so the log
   never passes derived data off as captured data.
4. **Synthesise at read time in the API, do not write rows into `audit_logs`.**
   The reconstruction stays reversible, cannot double-write, needs no migration,
   and keeps the genuine audit table genuine.
5. Surface partnership *edits*, not just partnership records: each row expands to
   its full audit trail via the existing `/api/partnerships/:id/audit`, with the
   reconstructed creation entry at the foot of the trail.

**Acceptance:** the advisor log shows an entry for all 25 advisors, the
partnership log for all 86 partnerships, the 93 reconstructed entries are
visually distinguishable from the 94 genuine ones, and `select count(*) from
audit_logs` is unchanged after the feature ships.

## R3 — Advisor approval email

**Reported:** not working.

**Diagnosed:** `compose` and the AI relevance draft both return 200 on
production. The break is downstream — the emailed link lands on
`network.gobi.vc`, where Google sign-in fails, so the approver cannot act.

1. Register the new domain with Google (see R4) — this is the actual fix.
2. Re-test the whole path end to end after v7.01 (CC sender plus chibo@gobi.vc,
   CV auto-attachment, advisor name in subject) and v7.06p1 (token moved inside
   the hash fragment), none of which existed when the email was built in v6.11.
3. Confirm the CV attachment path does not fail the send when an advisor has no
   CV on file, and that the token survives the `/advisor-approval` rewrite.

**Acceptance:** an approval email sends with the correct CC list and CV
attached; clicking the link on the live domain reaches the approval screen with
the token intact; signing in with Google succeeds; approving writes to the
advisor's audit trail.

## R4 — Google OAuth on the new domain

Ameen must add two entries to OAuth client
`206232852755-kck5pnrhmmsdepkv32ss89vhuo6fabq1.apps.googleusercontent.com`:

- Authorized redirect URI: `https://network.gobi.vc/api/auth/google/callback`
- Authorized JavaScript origin: `https://network.gobi.vc`

The existing `gba-partnership-portal.vercel.app` entries should stay, so the
Vercel URL keeps working as a fallback.

**Acceptance:** signing in with Google from `network.gobi.vc` completes and
lands on the portal; the same from the approval link records a decision.

---

## Out of scope

Writing reconstructed entries into `audit_logs`; adding an `updated_at` column to
partnerships; any change to the System update log tab.

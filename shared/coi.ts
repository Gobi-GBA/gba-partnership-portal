// v7.14 — Conflict-of-interest gate for the advisor COO approval email.
//
// Scope is deliberately narrow. This gate governs exactly one action: the
// internal approval request sent to the COO office
// (POST /api/advisors/:id/approval/send). The CRM outreach email and the
// invitation letter are out of scope and keep their existing behaviour.
//
// The rules, in order of precedence:
//   1. An advisor already flagged `blocked` is blocked for EVERYONE — a second
//      staff member cannot route around a colleague's declaration. Only an
//      admin clearing the flag reopens the path.
//   2. A staff member who declares a conflict blocks the send and raises the
//      flag. The candidate is NEVER auto-rejected: the record stays exactly as
//      it was so an admin can reassign the request to a different sender.
//   3. No conflict declared — the send proceeds and the attestation is recorded
//      on the advisor record and stamped into the email.
//
// Keep this file dependency-free: it is imported by the browser bundle and by
// the Node server (which requires the explicit .js extension on its side).

export const ADVISOR_COI_STATUS = ["none", "cleared", "blocked"] as const;
export type CoiStatus = (typeof ADVISOR_COI_STATUS)[number];

/** The slice of the advisor record this gate reads and writes. */
export interface CoiState {
  coiStatus: CoiStatus;
  coiDeclaredBy: string | null;
  coiDeclaredByEmail: string | null;
  coiDeclaredAt: string | null;
  coiDetails: string | null;
  coiClearedBy: string | null;
  coiClearedAt: string | null;
}

/** What the sender attests to in the dialog before the send button unlocks. */
export interface CoiDeclaration {
  /** true = "I have a conflict"; false = "I have no conflict". */
  conflict: boolean;
  /** Optional free-text description, only meaningful when conflict is true. */
  details?: string;
}

export type CoiGateResult =
  /** Proceed with the send; stamp the attestation onto the email and record. */
  | { allowed: true; nextStatus: "cleared" }
  /** Sender declared a conflict now — record it and raise the flag. */
  | { allowed: false; reason: "coi_declared"; nextStatus: "blocked" }
  /** Someone already declared a conflict — stays blocked until an admin clears. */
  | { allowed: false; reason: "coi_blocked"; nextStatus: null };

/**
 * The single decision point for the gate. Pure and synchronous so the server
 * route, the client's button state and the tests all reason about the same
 * rules instead of re-implementing them three times.
 */
export function evaluateCoiGate(
  current: Pick<CoiState, "coiStatus">,
  declaration: CoiDeclaration,
): CoiGateResult {
  // Rule 1 — an existing block outranks whatever the current sender attests to.
  if (current.coiStatus === "blocked") {
    return { allowed: false, reason: "coi_blocked", nextStatus: null };
  }
  // Rule 2 — a fresh declaration blocks the send without touching the candidate.
  if (declaration.conflict) {
    return { allowed: false, reason: "coi_declared", nextStatus: "blocked" };
  }
  // Rule 3 — clean attestation, send proceeds.
  return { allowed: true, nextStatus: "cleared" };
}

/** Trim and cap the optional conflict description before it is persisted. */
export function normalizeCoiDetails(details: string | undefined | null): string | null {
  const trimmed = String(details ?? "").trim();
  return trimmed ? trimmed.slice(0, 2000) : null;
}

/** `2026-08-06 15:42 UTC` — dependency-free and stable across client/server. */
export function formatCoiTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(
    d.getUTCHours(),
  )}:${p(d.getUTCMinutes())} UTC`;
}

/**
 * The declaration wording, kept in one place so the dialog checkbox, the email
 * attestation row and the audit note all describe the same undertaking. The
 * scope was fixed in the v7.14 design review: the candidate personally AND
 * their employer or affiliated organisation, including equity or payment.
 */
export const COI_SCOPE = {
  en: "the candidate personally, and their employer or any affiliated organisation, including any equity holding or payment",
  cn: "该人选本人，及其雇主或任何关联机构，包括任何股权或报酬安排",
} as const;

export function coiAttestationText(
  lang: "en" | "cn",
  requesterName: string,
  declaredAtIso: string,
): string {
  const when = formatCoiTimestamp(declaredAtIso);
  if (lang === "cn") {
    return `${requesterName} 已于 ${when} 声明：与${COI_SCOPE.cn}之间不存在利益冲突。`;
  }
  return `${requesterName} declared no conflict of interest on ${when}, covering ${COI_SCOPE.en}.`;
}

/**
 * v7.15 — wire contract for GET /api/advisors/coi/blocked, shared so the server
 * projection and the admin Conflicts tab cannot drift apart. v7.14 shipped with
 * the server emitting `declaredBy`/`details` and the client reading
 * `coiDeclaredBy`/`coiDetails`; because the client's local type marked those
 * fields optional, tsc saw nothing wrong and every row rendered an em dash.
 * Both sides now import this type, so a rename fails the build.
 */
export type CoiBlockedRow = {
  id: number;
  name: string;
  nameCn: string | null;
  status: string;
  lifecycleStatus: string | null;
  organisation: string | null;
  coiDeclaredBy: string | null;
  coiDeclaredByEmail: string | null;
  coiDeclaredAt: string | null;
  coiDetails: string | null;
};

/**
 * Builds one row of the admin Conflicts feed. Kept here, beside the type it
 * returns, so the projection is unit-testable without standing up the route —
 * the v7.14 field-name bug was invisible precisely because the mapping lived
 * inline in an Express handler that no test touched.
 */
export function toCoiBlockedRow(
  advisor: {
    id: number;
    name: string;
    nameCn?: string | null;
    status?: string | null;
    lifecycleStatus?: string | null;
    coiDeclaredBy?: string | null;
    coiDeclaredByEmail?: string | null;
    coiDeclaredAt?: string | null;
    coiDetails?: string | null;
  },
  organisation?: string | null,
): CoiBlockedRow {
  return {
    id: advisor.id,
    name: advisor.name,
    nameCn: advisor.nameCn ?? null,
    status: advisor.status ?? "pending",
    lifecycleStatus: advisor.lifecycleStatus ?? null,
    organisation: (organisation ?? "").trim() || null,
    coiDeclaredBy: advisor.coiDeclaredBy ?? null,
    coiDeclaredByEmail: advisor.coiDeclaredByEmail ?? null,
    coiDeclaredAt: advisor.coiDeclaredAt ?? null,
    coiDetails: advisor.coiDetails ?? null,
  };
}

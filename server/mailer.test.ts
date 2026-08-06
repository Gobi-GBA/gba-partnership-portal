import assert from "node:assert/strict";
import test from "node:test";
import { campaignCopyEmail } from "./mailer.js";
import { buildApprovalEmail, type ApprovalEmailData } from "../shared/approval-email.js";
import { coiAttestationText, evaluateCoiGate, normalizeCoiDetails, toCoiBlockedRow } from "../shared/coi.js";

test("renders one safe campaign copy with the shared Markdown template", () => {
  const email = campaignCopyEmail({
    senderName: "Analyst <Lead>",
    sentAt: new Date("2026-08-06T02:30:00.000Z"),
    advisorNames: ["Advisor <One>", "Advisor Two"],
    allCampaignRecipients: true,
    subject: "Update for {{name}} <script>",
    body: "## Hello {{name}}\n\n- **First**\n- [Gobi](https://www.gobi.vc)\n\n<script>alert(1)</script>",
  });

  assert.match(email.subject, /^Campaign copy · 顾问群发汇总/);
  assert.match(email.html, /All advisors in this campaign \(2\)/);
  assert.match(email.html, /Analyst &lt;Lead&gt;/);
  assert.match(email.html, /Update for \{\{name\}\} &lt;script&gt;/);
  assert.match(email.html, /<h2 style=/);
  assert.match(email.html, /<strong style=/);
  assert.match(email.html, /href="https:\/\/www\.gobi\.vc"/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.text, /- First/);
  assert.match(email.text, /Gobi \(https:\/\/www\.gobi\.vc\)/);
});

test("lists subset advisor names in HTML and plain text", () => {
  const email = campaignCopyEmail({
    senderName: "Analyst01",
    sentAt: new Date("2026-08-06T02:30:00.000Z"),
    advisorNames: ["Amy & Co", "Bo Zhang"],
    allCampaignRecipients: false,
    subject: "Network update",
    body: "Dear {{name}},\n\nAn update.",
  });

  assert.match(email.html, /<li>Amy &amp; Co<\/li>/);
  assert.match(email.html, /<li>Bo Zhang<\/li>/);
  assert.match(email.text, /Advisors · 顾问: Amy & Co, Bo Zhang/);
  assert.match(email.text, /Dear \{\{name\}\}/);
});

// ---------------- v7.14 — conflict-of-interest gate ----------------

const baseApproval: Omit<ApprovalEmailData, "lang" | "coiAttestation"> = {
  fullName: "Ruizhao JIANG (蒋蕊钊)",
  advisorType: "Technical Advisor",
  roleLine: "Technical Lead — HKUST",
  tags: ["AI & Robotics"],
  domains: "Optical switching",
  background: "Twelve years in photonics.",
  engagement: "Quarterly technical review of two portfolio companies.",
  publicClearance: true,
  requesterName: "Fred Li",
  intro: "A rare bench-to-fab operator in a field where we have two live deals.",
  approvalLink: "https://network.gobi.vc/#/advisor-approval?token=abc",
  expiryDays: 7,
};

test("a clean declaration lets the send proceed and marks the record cleared", () => {
  const result = evaluateCoiGate({ coiStatus: "none" }, { conflict: false });
  assert.equal(result.allowed, true);
  assert.equal(result.nextStatus, "cleared");
});

test("an advisor previously cleared can be sent again", () => {
  const result = evaluateCoiGate({ coiStatus: "cleared" }, { conflict: false });
  assert.equal(result.allowed, true);
  assert.equal(result.nextStatus, "cleared");
});

test("declaring a conflict blocks the send and raises the flag", () => {
  const result = evaluateCoiGate({ coiStatus: "none" }, { conflict: true });
  assert.equal(result.allowed, false);
  assert.equal(result.allowed === false && result.reason, "coi_declared");
  assert.equal(result.nextStatus, "blocked");
});

test("an existing block stops a second sender who declares no conflict", () => {
  // The whole point of the flag: a colleague must not be able to route around
  // someone else's declaration by attesting cleanly themselves.
  const result = evaluateCoiGate({ coiStatus: "blocked" }, { conflict: false });
  assert.equal(result.allowed, false);
  assert.equal(result.allowed === false && result.reason, "coi_blocked");
  assert.equal(result.nextStatus, null);
});

test("an existing block outranks a fresh conflict declaration", () => {
  const result = evaluateCoiGate({ coiStatus: "blocked" }, { conflict: true });
  assert.equal(result.allowed === false && result.reason, "coi_blocked");
});

test("conflict details are trimmed, capped and normalised to null when empty", () => {
  assert.equal(normalizeCoiDetails("  I hold shares.  "), "I hold shares.");
  assert.equal(normalizeCoiDetails("   "), null);
  assert.equal(normalizeCoiDetails(undefined), null);
  assert.equal(normalizeCoiDetails(null), null);
  assert.equal(normalizeCoiDetails("x".repeat(2500))?.length, 2000);
});

test("the attestation names the requester and a UTC timestamp in both languages", () => {
  const en = coiAttestationText("en", "Fred Li", "2026-08-06T15:42:09.000Z");
  assert.match(en, /Fred Li declared no conflict of interest on 2026-08-06 15:42 UTC/);
  assert.match(en, /their employer or any affiliated organisation, including any equity holding or payment/);

  const cn = coiAttestationText("cn", "李国樑", "2026-08-06T15:42:09.000Z");
  assert.match(cn, /李国樑 已于 2026-08-06 15:42 UTC 声明/);
  assert.match(cn, /其雇主或任何关联机构，包括任何股权或报酬安排/);
});

test("the approval email renders the attestation row in English and Chinese", () => {
  const attestation = coiAttestationText("en", "Fred Li", "2026-08-06T15:42:09.000Z");
  const en = buildApprovalEmail({ ...baseApproval, lang: "en", coiAttestation: attestation });
  assert.match(en.html, /Conflict of interest/);
  assert.match(en.html, /Fred Li declared no conflict of interest on 2026-08-06 15:42 UTC/);
  assert.match(en.plain, /Fred Li declared no conflict of interest/);

  const cnAttestation = coiAttestationText("cn", "李国樑", "2026-08-06T15:42:09.000Z");
  const cn = buildApprovalEmail({ ...baseApproval, lang: "cn", coiAttestation: cnAttestation });
  assert.match(cn.html, /利益冲突/);
  assert.match(cn.html, /李国樑 已于 2026-08-06 15:42 UTC 声明/);
});

test("the approval email omits the attestation row before a declaration is made", () => {
  const email = buildApprovalEmail({ ...baseApproval, lang: "en" });
  assert.doesNotMatch(email.html, /Conflict of interest/);
  assert.doesNotMatch(email.plain, /conflict of interest/i);
});

// ---- v7.15 regression: the admin Conflicts feed wire contract ----------------
// v7.14 emitted declaredBy/declaredByEmail/declaredAt/details while the admin
// tab read coiDeclaredBy/coiDeclaredAt/coiDetails, so every blocked row showed
// "Declared by: —" and never showed the stated reason. These lock the key names
// the client reads; renaming a field now fails the build and this test.
test("the blocked-advisor row uses the coi-prefixed names the admin tab reads", () => {
  const row = toCoiBlockedRow(
    {
      id: 42,
      name: "Test Advisor",
      nameCn: "测试顾问",
      status: "pending",
      lifecycleStatus: "proposed",
      coiDeclaredBy: "Elaine Zhang",
      coiDeclaredByEmail: "elaine@gobi.vc",
      coiDeclaredAt: "2026-08-06T15:42:09.000Z",
      coiDetails: "Holds equity in the candidate's employer.",
    },
    "  Test Organisation  ",
  );

  assert.deepEqual(Object.keys(row).sort(), [
    "coiDeclaredAt",
    "coiDeclaredBy",
    "coiDeclaredByEmail",
    "coiDetails",
    "id",
    "lifecycleStatus",
    "name",
    "nameCn",
    "organisation",
    "status",
  ]);
  assert.equal(row.coiDeclaredBy, "Elaine Zhang");
  assert.equal(row.coiDeclaredByEmail, "elaine@gobi.vc");
  assert.equal(row.coiDeclaredAt, "2026-08-06T15:42:09.000Z");
  assert.equal(row.coiDetails, "Holds equity in the candidate's employer.");
  assert.equal(row.organisation, "Test Organisation");
});

test("a blocked row with no declared reason or organisation degrades to null", () => {
  const row = toCoiBlockedRow({ id: 7, name: "Sparse Advisor" }, "   ");
  assert.equal(row.nameCn, null);
  assert.equal(row.organisation, null);
  assert.equal(row.coiDeclaredBy, null);
  assert.equal(row.coiDeclaredByEmail, null);
  assert.equal(row.coiDeclaredAt, null);
  assert.equal(row.coiDetails, null);
  assert.equal(row.status, "pending");
  assert.equal(row.lifecycleStatus, null);
});

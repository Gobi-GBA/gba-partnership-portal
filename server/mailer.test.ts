import assert from "node:assert/strict";
import test from "node:test";
import { campaignCopyEmail } from "./mailer.js";

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

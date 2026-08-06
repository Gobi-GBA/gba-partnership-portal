// v6.11 — Single source of truth for the advisor approval email.
//
// Both the client (live preview + "Copy email") and the server (the message it
// actually sends) render from this module, so what the requester reviews in the
// dialog is byte-for-byte what the approver receives. The only difference is the
// approval link: the preview renders a placeholder, the send path substitutes a
// freshly minted one-time token.
//
// Keep this file dependency-free — it is imported by the browser bundle and by
// the Node server (which requires the explicit .js extension on its side).

export type ApprovalLang = "en" | "cn";

export interface ApprovalEmailData {
  lang: ApprovalLang;
  /** e.g. "Ruizhao JIANG (蒋蕊钊)" */
  fullName: string;
  /** one of ADVISOR_ROLE_TYPES */
  advisorType: string;
  /** e.g. "Technical Lead — HKUST" */
  roleLine: string;
  /** already-localised sector tag names */
  tags: string[];
  domains: string;
  background: string;
  engagement: string;
  publicClearance: boolean;
  requesterName: string;
  /** the relevance paragraph — AI drafted, requester editable */
  intro: string;
  /** empty string renders the email without the approval call-to-action */
  approvalLink: string;
  expiryDays?: number;
  /**
   * v7.14 — conflict-of-interest attestation. Present once the requester has
   * declared no conflict; renders an extra profile row naming them and the
   * moment they attested. Omitted in the pre-declaration preview.
   */
  coiAttestation?: string | null;
}

const L = {
  en: {
    brand: "GOBI PARTNERS",
    title: "Advisor Approval Request",
    greeting: "Dear COO Office,",
    lead:
      "I would like to request approval for the following advisor appointment. The candidate's background, expertise and the engagement we propose are summarised below for your review.",
    relevance: "Why this advisor, and why now",
    profile: "Candidate profile",
    name: "Name",
    advisorType: "Advisor type",
    role: "Primary role",
    tags: "Sector tags",
    domains: "Expert domains",
    background: "Background",
    engagement: "Suggested engagement and potential projects",
    clearance: "Public listing clearance",
    coi: "Conflict of interest",
    requestedBy: "Requested by",
    clearanceYes: "Yes — cleared for public listing",
    clearanceNo: "No — internal only",
    cta: "Review and approve",
    ctaHint:
      "Sign in to the portal with your Gobi account to record your decision. Approving or rejecting from this link files the outcome to the advisor's audit log automatically.",
    expiry: (d: number) => `This link expires in ${d} days.`,
    linkFallback: "Or paste this link into your browser:",
    signoff: "Best regards,",
    footer: "Gobi Partners · 4209-11, Hopewell Centre, 183 Queen's Road East, Wanchai, Hong Kong",
    generated: "Generated from the Gobi Partners Partnership Portal.",
    subject: (n: string, p: string) => `Advisor approval request — ${n} (proposed by ${p})`,
    none: "—",
  },
  cn: {
    brand: "GOBI PARTNERS",
    title: "顾问审批申请",
    greeting: "COO 办公室，您好：",
    lead: "现提请审批以下顾问任命。该人选的背景、专长领域与建议的合作方式摘要如下，敬请审阅。",
    relevance: "推荐理由与时机",
    profile: "人选概况",
    name: "姓名",
    advisorType: "顾问类别",
    role: "主要职务",
    tags: "行业标签",
    domains: "专长领域",
    background: "背景简介",
    engagement: "建议合作方式与可能项目",
    clearance: "公开展示许可",
    coi: "利益冲突声明",
    requestedBy: "申请人",
    clearanceYes: "是 — 可公开展示",
    clearanceNo: "否 — 仅限内部",
    cta: "审阅并审批",
    ctaHint: "请使用您的 Gobi 账户登录门户以确认决定。通过此链接批准或否决后，结果将自动记入该顾问的审计记录。",
    expiry: (d: number) => `此链接将在 ${d} 天后失效。`,
    linkFallback: "或将此链接粘贴至浏览器：",
    signoff: "此致",
    footer: "Gobi Partners · 香港湾仔皇后大道东 183 号合和中心 4209-11 室",
    generated: "由 Gobi Partners 合作伙伴门户生成。",
    subject: (n: string, p: string) => `顾问审批申请 — ${n}（推荐人：${p}）`,
    none: "—",
  },
} as const;

const ADVISOR_TYPE_LABEL: Record<string, { en: string; cn: string }> = {
  honourary_advisor: { en: "Honourary Advisor", cn: "荣誉顾问" },
  domain_knowledge_partner: { en: "Domain Knowledge Partner", cn: "领域知识伙伴" },
  mentor: { en: "Mentor", cn: "导师" },
};

export function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function para(s: string): string {
  return esc(s).replace(/\n/g, "<br/>");
}

export function approvalSubject(data: Pick<ApprovalEmailData, "lang" | "fullName" | "requesterName">): string {
  return L[data.lang].subject(data.fullName, data.requesterName || "");
}

/** Deterministic fallback used when AI drafting is unavailable or returns nothing. */
export function fallbackIntro(data: Pick<ApprovalEmailData, "lang" | "fullName" | "roleLine" | "domains">): string {
  const role = data.roleLine && data.roleLine !== "—" ? data.roleLine : "";
  if (data.lang === "cn") {
    return `${data.fullName}${role ? `现任${role}` : ""}，其专长领域为${data.domains || "相关技术方向"}，与我们在大湾区的投资布局高度契合。建议纳入 Gobi 顾问网络，以加强该领域的项目筛选与尽调能力。`;
  }
  return `${data.fullName}${role ? `, ${role},` : ""} brings directly relevant expertise in ${data.domains || "the candidate's stated domains"}. Their profile maps closely onto our Greater Bay Area deal flow, and adding them to the Gobi Advisory Network would strengthen our screening and diligence capacity in this area.`;
}

const FONT = "Calibri,'Segoe UI','Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif";

export function buildApprovalEmail(data: ApprovalEmailData): { subject: string; html: string; plain: string } {
  const t = L[data.lang];
  const days = data.expiryDays ?? 7;
  const dash = t.none;
  const typeLabel = ADVISOR_TYPE_LABEL[data.advisorType]?.[data.lang] ?? data.advisorType;
  const tagsLine = data.tags.filter(Boolean).join(", ") || dash;
  const clearance = data.publicClearance ? t.clearanceYes : t.clearanceNo;
  const intro = (data.intro || "").trim() || fallbackIntro(data);
  const subject = approvalSubject(data);

  const rows: Array<[string, string]> = [
    [t.name, data.fullName],
    [t.advisorType, typeLabel],
    [t.role, data.roleLine || dash],
    [t.tags, tagsLine],
    [t.domains, data.domains || dash],
    [t.clearance, clearance],
    // v7.14 — the attestation sits next to the public-clearance row, which is
    // the closest existing analogue: both are undertakings by the requester
    // that the COO needs on the face of the email, not buried in an audit log.
    ...((data.coiAttestation ?? "").trim()
      ? ([[t.coi, (data.coiAttestation as string).trim()]] as Array<[string, string]>)
      : []),
    [t.requestedBy, data.requesterName || dash],
  ];

  const blocks: Array<[string, string]> = [
    [t.background, data.background || ""],
    [t.engagement, data.engagement || ""],
  ].filter(([, v]) => v.trim().length > 0) as Array<[string, string]>;

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 16px 8px 0;color:#6b7280;font-weight:600;vertical-align:top;white-space:nowrap;font-size:13px;">${esc(
          k,
        )}</td><td style="padding:8px 0;color:#0C2340;font-size:13px;">${para(v)}</td></tr>`,
    )
    .join("");

  const blocksHtml = blocks
    .map(
      ([k, v]) =>
        `<p style="margin:18px 0 4px;color:#6b7280;font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">${esc(
          k,
        )}</p><p style="margin:0;color:#0C2340;font-size:13px;line-height:1.6;">${para(v)}</p>`,
    )
    .join("");

  const ctaHtml = data.approvalLink
    ? `<div style="margin:26px 0 6px;text-align:center;">
      <a href="${esc(data.approvalLink)}" style="background:#0C2340;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:6px;display:inline-block;font-weight:700;font-size:14px;">${esc(
        t.cta,
      )}</a>
    </div>
    <p style="margin:12px 0 0;color:#6b7280;font-size:12px;line-height:1.6;text-align:center;">${esc(t.ctaHint)}<br/>${esc(
      t.expiry(days),
    )}</p>`
    : "";

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f5f7;font-family:${FONT};">
<div style="max-width:600px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e5ea;">
  <div style="background:#0C2340;padding:20px 28px;">
    <p style="margin:0;color:#D4A843;font-size:11px;font-weight:700;letter-spacing:2.5px;">${esc(t.brand)}</p>
    <p style="margin:6px 0 0;color:#ffffff;font-size:19px;font-weight:700;">${esc(t.title)}</p>
  </div>
  <div style="height:3px;background:linear-gradient(90deg,#D4A843,#48A9C5);"></div>
  <div style="padding:26px 28px;">
    <p style="margin:0 0 14px;color:#333a45;font-size:14px;line-height:1.6;">${esc(t.greeting)}</p>
    <p style="margin:0 0 18px;color:#333a45;font-size:14px;line-height:1.6;">${esc(t.lead)}</p>

    <div style="background:#f6f8fa;border-left:3px solid #D4A843;border-radius:0 6px 6px 0;padding:14px 16px;margin:0 0 22px;">
      <p style="margin:0 0 6px;color:#0C2340;font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">${esc(
        t.relevance,
      )}</p>
      <p style="margin:0;color:#333a45;font-size:14px;line-height:1.65;">${para(intro)}</p>
    </div>

    <p style="margin:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">${esc(
      t.profile,
    )}</p>
    <table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>
    ${blocksHtml}
    ${ctaHtml}

    <p style="margin:26px 0 0;color:#333a45;font-size:14px;line-height:1.6;">${esc(t.signoff)}<br/>${esc(
      data.requesterName,
    )}</p>
  </div>
  <div style="background:#f8f9fb;padding:14px 28px;border-top:1px solid #eceef2;">
    <p style="margin:0;color:#9aa2ad;font-size:11px;line-height:1.6;">${esc(t.footer)}<br/>${esc(t.generated)}</p>
  </div>
</div>
</body></html>`;

  const plainParts = [
    t.greeting,
    "",
    t.lead,
    "",
    `${t.relevance.toUpperCase()}`,
    intro,
    "",
    `${t.profile.toUpperCase()}`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...blocks.flatMap(([k, v]) => ["", `${k}:`, v]),
  ];
  if (data.approvalLink) {
    plainParts.push("", `${t.cta}: ${data.approvalLink}`, t.ctaHint, t.expiry(days));
  }
  plainParts.push("", t.signoff, data.requesterName, "", t.footer, t.generated);

  return { subject, html, plain: plainParts.join("\n") };
}

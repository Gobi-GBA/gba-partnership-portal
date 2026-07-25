// v5.10 — Official Gobi Advisory Network invitation letter (signing copy).
// Replicates the firm's letter template: centered Gobi letterhead, "Strictly
// Private & Confidential", BY EMAIL, Re: line, five standard paragraphs with
// the expertise clause auto-filled from the advisor's domains, and a page-2
// Acknowledgment Receipt. Rendered two ways from one source of truth:
//   - HTML print view (client prints / saves to PDF)
//   - DOCX download (docx package — pure JS, serverless-safe)
import {
  AlignmentType,
  Document,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
  UnderlineType,
} from "docx";
import type { Advisor, AdvisorRole } from "../shared/schema.js";
import { GOBI_LOGO_B64 } from "./letter-logo.js";

const SIGNATORY_NAME = "Fred Li";
const SIGNATORY_TITLE = "Managing Director & Head of University Ventures, Gobi Partners";

function escHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

// "July 26, 2026" — matches the firm's template date style
export function letterDate(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Hong_Kong" });
}

// "Prof. Nancy Kwan MAN" -> "Prof. MAN"; names without an honorific keep the full name.
const HONORIFIC_RE = /^(professor|prof\.?|doctor|dr\.?|ir\.?|mr\.?|mrs\.?|ms\.?|sir|dato'?|tan sri)\s+/i;
const HONORIFIC_MAP: Record<string, string> = {
  professor: "Prof.", prof: "Prof.", doctor: "Dr.", dr: "Dr.", ir: "Ir.",
  mr: "Mr.", mrs: "Mrs.", ms: "Ms.", sir: "Sir", dato: "Dato'", "tan sri": "Tan Sri",
};
export function salutationOf(name: string): string {
  const trimmed = name.trim();
  const m = trimmed.match(HONORIFIC_RE);
  if (!m) return trimmed;
  const hon = HONORIFIC_MAP[m[1].toLowerCase().replace(/[.']/g, "").trim()] ?? m[1];
  const rest = trimmed.slice(m[0].length).trim();
  const surname = rest.split(/\s+/).pop() ?? rest;
  return `${hon} ${surname}`;
}

interface LetterText {
  dateStr: string;
  addressee: string;
  orgLine: string | null;
  salutation: string;
  reLine: string;
  paragraphs: string[];
  ackTitle: string;
  ackParagraphs: string[];
  ackLines: { label: string; value: string }[];
}

function letterText(advisor: Advisor, role: AdvisorRole | null): LetterText {
  const name = advisor.name.trim();
  const domains = (advisor.domains ?? "").trim().replace(/\.+$/, "");
  const expertiseClause = domains ? `, particularly in areas such as ${domains}` : "";
  return {
    dateStr: letterDate(),
    addressee: name,
    orgLine: role?.organization?.trim() || null,
    salutation: salutationOf(name),
    reLine: "Re: GOBI PARTNERS - INVITATION TO GOBI ADVISORY NETWORK",
    paragraphs: [
      "On behalf of Gobi Partners, I write to cordially invite you to join as a member of the Gobi Advisory Network.",
      "Gobi Partners is a leading Asia-focused venture capital firm headquartered in Kuala Lumpur and Hong Kong. Founded in 2002, Gobi now has a network of over 16 locations and has invested in over 380 technology startups in the region. The firm supports entrepreneurs from the early to growth stages, with a particular focus on emerging markets, and is a frontier to groom university spin-offs from research to high-growth start-ups.",
      "With achievements in areas of your expertise, the Gobi team hopes to draw from your wealth of knowledge, experience, and network to assist Gobi in pursuing our ambitious goals to empower aspiring startup founders.",
      `We are assembling a team of distinguished experts across different sectors to join the Gobi Partners Advisory Network. Your expertise would be invaluable in providing guidance and strategic advice to our board of directors${expertiseClause}.`,
      "The role of our Gobi Advisory Network (\u201CAdvisor\u201D) is to shape Gobi's overall development strategy and mutually exchange domain-specific knowledge. The initial term of engagement is set for one year and will automatically renew annually until further written notice.",
      "Thank you for taking the time to consider our invitation. We look forward to working with you soon.",
    ],
    ackTitle: "Acknowledgment Receipt",
    ackParagraphs: [
      `I, ${name}, have received a copy of \u201CGOBI PARTNERS - INVITATION TO GOBI ADVISORY NETWORK\u201D and acknowledge receipt of this document.`,
      `I, ${name}, understand and agree that this copy of the document supersedes and negates all previous versions of the document, if any.`,
      "I understand my engagement with Gobi Partners entailed in the document does not constitute any employment relationship nor any monetary implications, and I understand that either Gobi or I can terminate the engagement at any time for any reason in the form of a written notice.",
    ],
    ackLines: [
      { label: "Advisor Name:", value: name },
      { label: "Advisor signature:", value: "" },
      { label: "Date:", value: "" },
      { label: "Acknowledgment received by:", value: name },
    ],
  };
}

export function letterFilename(advisor: Advisor, ext: "docx"): string {
  const safe = advisor.name.trim().replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "");
  return `Gobi-Advisory-Network-Letter-to-${safe}.${ext}`;
}

// ---------- HTML print view (client saves to PDF via Ctrl/Cmd-P) ----------

export function invitationLetterHtml(advisor: Advisor, role: AdvisorRole | null): string {
  const t = letterText(advisor, role);
  const paras = t.paragraphs.map((p) => `<p>${escHtml(p)}</p>`).join("\n  ");
  const ackParas = t.ackParagraphs.map((p) => `<p>${escHtml(p)}</p>`).join("\n  ");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Gobi Advisory Network Letter — ${escHtml(advisor.name)}</title>
<style>
  @page { size: A4; margin: 18mm 24mm; }
  * { box-sizing: border-box; }
  body { font-family: Calibri, "Segoe UI", "Noto Sans SC", Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.45; margin: 0; }
  .page { max-width: 720px; margin: 0 auto; padding: 34px 40px 60px; }
  .page + .page { page-break-before: always; border-top: 1px dashed #ccc; }
  @media print { .page + .page { border-top: 0; } .page { padding: 0; } .print-hint { display: none; } }
  .logo { text-align: center; margin-bottom: 34px; }
  .logo img { width: 128px; height: auto; }
  p { margin: 0 0 12px; text-align: justify; }
  .meta { text-align: left; }
  .underline { text-decoration: underline; }
  .re { font-weight: 700; }
  .sig-gap { height: 58px; }
  .ack-line { margin: 0 0 16px; }
  .print-hint { background: #0C2340; color: #fff; text-align: center; padding: 10px; font-size: 10pt; }
</style></head>
<body>
<div class="print-hint">Press Ctrl/Cmd + P to save this letter as a PDF.</div>
<div class="page">
  <div class="logo"><img src="data:image/png;base64,${GOBI_LOGO_B64}" alt="Gobi Partners"></div>
  <p class="meta">Strictly Private &amp; Confidential</p>
  <p class="meta">${escHtml(t.dateStr)}</p>
  <p class="meta" style="margin-bottom:0">${escHtml(t.addressee)}</p>
  ${t.orgLine ? `<p class="meta">${escHtml(t.orgLine)}</p>` : `<p class="meta" style="margin:0"></p>`}
  <p class="meta" style="margin-top:12px"><span class="underline">BY EMAIL</span></p>
  <p class="meta">Dear ${escHtml(t.salutation)},</p>
  <p class="re">${escHtml(t.reLine)}</p>
  ${paras}
  <p style="margin-top:18px">Warm regards,</p>
  <div class="sig-gap"></div>
  <p style="margin-bottom:0">${escHtml(SIGNATORY_NAME)}</p>
  <p>${escHtml(SIGNATORY_TITLE)}</p>
</div>
<div class="page">
  <div class="logo"><img src="data:image/png;base64,${GOBI_LOGO_B64}" alt="Gobi Partners"></div>
  <p><span class="underline">${escHtml(t.ackTitle)}</span></p>
  ${ackParas}
  ${t.ackLines
    .map((l) =>
      l.label === "Advisor signature:"
        ? `<p class="ack-line" style="margin-bottom:46px">${escHtml(l.label)}</p>`
        : `<p class="ack-line">${escHtml(l.label)}${l.value ? ` ${escHtml(l.value)}` : ""}</p>`,
    )
    .join("\n  ")}
</div>
</body></html>`;
}

// ---------- DOCX download ----------

const FONT = "Calibri";
const SIZE = 22; // 11pt in half-points

function bodyPara(text: string, opts: { bold?: boolean; underline?: boolean; justify?: boolean; spaceAfter?: number } = {}): Paragraph {
  return new Paragraph({
    alignment: opts.justify === false ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
    spacing: { after: opts.spaceAfter ?? 200 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: SIZE,
        bold: opts.bold ?? false,
        underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
      }),
    ],
  });
}

export async function invitationLetterDocx(advisor: Advisor, role: AdvisorRole | null): Promise<Buffer> {
  const t = letterText(advisor, role);
  const logo = Buffer.from(GOBI_LOGO_B64, "base64");
  // Letterhead logo repeats on every page via the section header (816x242 source).
  const header = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [
          new ImageRun({ type: "png", data: logo, transformation: { width: 128, height: 38 } }),
        ],
      }),
    ],
  });

  const page1: Paragraph[] = [
    bodyPara("Strictly Private & Confidential", { justify: false }),
    bodyPara(t.dateStr, { justify: false }),
    bodyPara(t.addressee, { justify: false, spaceAfter: t.orgLine ? 0 : 200 }),
    ...(t.orgLine ? [bodyPara(t.orgLine, { justify: false })] : []),
    bodyPara("BY EMAIL", { justify: false, underline: true }),
    bodyPara(`Dear ${t.salutation},`, { justify: false }),
    bodyPara(t.reLine, { justify: false, bold: true }),
    ...t.paragraphs.map((p) => bodyPara(p)),
    bodyPara("Warm regards,", { justify: false, spaceAfter: 1400 }),
    bodyPara(SIGNATORY_NAME, { justify: false, spaceAfter: 0 }),
    bodyPara(SIGNATORY_TITLE, { justify: false }),
  ];

  const page2: Paragraph[] = [
    new Paragraph({
      pageBreakBefore: true,
      spacing: { after: 200 },
      children: [new TextRun({ text: t.ackTitle, font: FONT, size: SIZE, underline: { type: UnderlineType.SINGLE } })],
    }),
    ...t.ackParagraphs.map((p) => bodyPara(p)),
    ...t.ackLines.map((l) =>
      bodyPara(l.value ? `${l.label} ${l.value}` : l.label, {
        justify: false,
        spaceAfter: l.label === "Advisor signature:" ? 900 : 300,
      }),
    ),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        headers: { default: header },
        properties: {
          page: { margin: { top: 720, right: 1160, bottom: 1000, left: 1160 } },
        },
        children: [...page1, ...page2],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

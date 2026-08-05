// Gmail SMTP mailer — configure with MAIL_SERVER / MAIL_PORT / MAIL_USE_TLS /
// MAIL_USERNAME / MAIL_PASSWORD / MAIL_DEFAULT_SENDER.
// When not configured, sendMail is a no-op returning false (features degrade
// gracefully: registration succeeds without a confirmation email, password reset
// falls back to secret questions).
import nodemailer from "nodemailer";
import { renderEmailMarkdownHtml } from "../shared/markdown.js";

function parseBool(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

const MAIL_SERVER = process.env.MAIL_SERVER ?? "smtp.gmail.com";
const MAIL_PORT = Number(process.env.MAIL_PORT ?? "587");
const MAIL_USE_TLS = parseBool(process.env.MAIL_USE_TLS, true);
const MAIL_USERNAME = process.env.MAIL_USERNAME ?? process.env.GMAIL_USER;
const MAIL_PASSWORD = process.env.MAIL_PASSWORD ?? process.env.GMAIL_APP_PASSWORD;
const MAIL_DEFAULT_SENDER = process.env.MAIL_DEFAULT_SENDER ?? "noreply@gobi.vc";

export const mailEnabled = Boolean(MAIL_USERNAME && MAIL_PASSWORD);

const transporter = mailEnabled
  ? nodemailer.createTransport({
      host: MAIL_SERVER,
      port: MAIL_PORT,
      secure: MAIL_PORT === 465,
      requireTLS: MAIL_USE_TLS,
      auth: { user: MAIL_USERNAME, pass: MAIL_PASSWORD },
    })
  : null;

const BRAND = "Gobi Partnership Portal · 合作伙伴门户";
// v5.9 — Gobi house style for all portal email: Calibri-first font stack.
export const GOBI_FONT = "Calibri,'Segoe UI','Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif";
const GOBI_ADDRESS = "4209-11, Hopewell Centre, 183 Queen's Road East, Wanchai, Hong Kong";

function wrap(bodyHtml: string): string {
  return `
  <div style="font-family:${GOBI_FONT};max-width:560px;margin:0 auto;padding:24px;color:#0C2340;">
    <div style="border-bottom:3px solid #D4A843;padding-bottom:12px;margin-bottom:20px;">
      <strong style="font-size:16px;">${BRAND}</strong>
    </div>
    ${bodyHtml}
    <div style="border-top:1px solid #e2e8f0;margin-top:28px;padding-top:12px;font-size:12px;color:#64748b;">
      Internal partnership registry · Gobi Partners<br/>
      This is an automated message — please do not reply. 此邮件为系统自动发送，请勿回复。
    </div>
  </div>`;
}

// v5.9 — Gobi-branded wrapper for person-to-person outreach email.
// Navy masthead with the Gobi wordmark, gold rule, Calibri body, and the
// official footer — but no automated/do-not-reply chrome.
export function outreachHtml(bodyMarkdown: string): string {
  const renderedBody = renderEmailMarkdownHtml(bodyMarkdown);
  return `
  <div style="font-family:${GOBI_FONT};max-width:600px;margin:0 auto;color:#1a2433;">
    <div style="background:#0C2340;padding:18px 28px;">
      <span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:3px;">GOBI PARTNERS</span>
    </div>
    <div style="height:3px;background:#D4A843;"></div>
    <div style="padding:26px 28px;font-size:15px;">
      ${renderedBody}
    </div>
    <div style="border-top:1px solid #e2e8f0;padding:14px 28px 22px;font-size:12px;color:#64748b;">
      Gobi Partners · ${GOBI_ADDRESS}<br/>
      <a href="https://www.gobi.vc" style="color:#0C2340;">www.gobi.vc</a>
    </div>
  </div>`;
}

export async function sendMail(to: string, subject: string, bodyHtml: string): Promise<boolean> {
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: MAIL_USERNAME ? `"Gobi Partnership Portal" <${MAIL_USERNAME}>` : MAIL_DEFAULT_SENDER,
      replyTo: MAIL_DEFAULT_SENDER,
      to,
      subject,
      html: wrap(bodyHtml),
    });
    return true;
  } catch (err) {
    console.error("[mailer] send failed:", err);
    return false;
  }
}

// v5.8 — Raw outreach send (CRM). No automated/do-not-reply chrome: this is a
// person-to-person email (e.g. Fred → advisor). Body may be plain text or HTML.
// v7.01 — attachments supported (e.g. advisor CVs on approval emails).
export type OutreachAttachment = { filename: string; content: Buffer; contentType?: string };

export async function sendOutreach(
  to: string,
  subject: string,
  body: string,
  opts?: { fromName?: string; replyTo?: string; isHtml?: boolean; cc?: string | string[]; text?: string; attachments?: OutreachAttachment[] },
): Promise<boolean> {
  if (!transporter) return false;
  const fromName = opts?.fromName ?? "Gobi Partners";
  try {
    await transporter.sendMail({
      from: MAIL_USERNAME ? `"${fromName}" <${MAIL_USERNAME}>` : MAIL_DEFAULT_SENDER,
      replyTo: opts?.replyTo ?? MAIL_DEFAULT_SENDER,
      to,
      ...(opts?.cc ? { cc: opts.cc } : {}),
      subject,
      // v6.11 — HTML sends may carry an explicit plain-text alternative so mail
      // clients without HTML rendering still get a readable message.
      ...(opts?.isHtml ? { html: body, ...(opts.text ? { text: opts.text } : {}) } : { text: body }),
      ...(opts?.attachments ? { attachments: opts.attachments } : {}),
    });
    return true;
  } catch (err) {
    console.error("[mailer] outreach send failed:", err);
    return false;
  }
}

export function registrationEmail(name: string, autoApproved: boolean): { subject: string; html: string } {
  if (autoApproved) {
    return {
      subject: "Welcome — your account is ready · 账户已开通",
      html: `
        <p>Hi ${name},</p>
        <p>Your registration on the Gobi Partnership Portal is complete. Your @gobi.vc account has been approved automatically with <strong>edit rights</strong> — you can sign in right away and add or update partnership and advisor records yourself, with no approval step. Changes to a partnership level go to an admin for review, as does deleting a record.</p>
        <p>${name}，您好：您在 Gobi 合作伙伴门户的注册已完成。您的 @gobi.vc 账户已自动获批并具备<strong>编辑权限</strong>，现在即可登录，并可直接新增或更新合作伙伴与顾问资料，无需审批。变更合作层级或删除记录仍需管理员审核。</p>`,
    };
  }
  return {
    subject: "Registration received — pending approval · 注册待审批",
    html: `
      <p>Hi ${name},</p>
      <p>Your registration on the Gobi Partnership Portal has been received and is <strong>pending admin approval</strong>. You will be able to sign in once an administrator approves your account.</p>
      <p>${name}，您好：您在 Gobi 合作伙伴门户的注册申请已收到，目前<strong>等待管理员审批</strong>。审批通过后即可登录。</p>`,
  };
}

export function resetEmail(name: string, link: string): { subject: string; html: string } {
  return {
    subject: "Reset your password · 重置密码",
    html: `
      <p>Hi ${name},</p>
      <p>We received a request to reset your Gobi Partnership Portal password. Click the button below within <strong>1 hour</strong> to set a new one. If you did not request this, you can safely ignore this email.</p>
      <p>${name}，您好：我们收到了重置您门户密码的请求。请在 <strong>1 小时内</strong>点击下方按钮设置新密码。如非本人操作，请忽略此邮件。</p>
      <p style="margin:24px 0;">
        <a href="${link}" style="background:#0C2340;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;display:inline-block;font-weight:bold;">Reset password · 重置密码</a>
      </p>
      <p style="font-size:12px;color:#64748b;">Or copy this link 或复制此链接：<br/>${link}</p>`,
  };
}

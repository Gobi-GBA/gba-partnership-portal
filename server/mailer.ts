// Gmail SMTP mailer — configure with GMAIL_USER + GMAIL_APP_PASSWORD env vars.
// When not configured, sendMail is a no-op returning false (features degrade gracefully:
// registration succeeds without a confirmation email, password reset falls back to
// secret questions).
import nodemailer from "nodemailer";

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

export const mailEnabled = Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);

const transporter = mailEnabled
  ? nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    })
  : null;

const BRAND = "Gobi Partnership Portal · 合作伙伴门户";

function wrap(bodyHtml: string): string {
  return `
  <div style="font-family:'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0C2340;">
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

export async function sendMail(to: string, subject: string, bodyHtml: string): Promise<boolean> {
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: `"Gobi Partnership Portal" <${GMAIL_USER}>`,
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

export function registrationEmail(name: string, autoApproved: boolean): { subject: string; html: string } {
  if (autoApproved) {
    return {
      subject: "Welcome — your account is ready · 账户已开通",
      html: `
        <p>Hi ${name},</p>
        <p>Your registration on the Gobi Partnership Portal is complete. Your @gobi.vc account has been approved automatically as a <strong>viewer</strong> — you can sign in right away. An admin can upgrade your role if you need to register or edit partnerships.</p>
        <p>${name}，您好：您在 Gobi 合作伙伴门户的注册已完成。您的 @gobi.vc 账户已自动获批为<strong>查看者</strong>，现在即可登录。如需登记或编辑合作伙伴，管理员可为您升级权限。</p>`,
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

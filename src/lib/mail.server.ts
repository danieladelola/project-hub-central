/** Public site address used in every email link. */
export const APP_URL = "https://universalcrest.vip";

type Mail = { to: string; subject: string; html: string; attachments?: { filename: string; content: string; mimeType: string }[] };

async function cfg() {
  try { return await (await import("./settings.server")).getSettings(); } catch { return null; }
}

export async function sendMail({ to, subject, html, attachments }: Mail) {
  const c = await cfg();
  const host = process.env["SMTP_HOST"] || "mail.spacemail.com";
  const user = process.env["SMTP_USER"]!;
  const pass = process.env["SMTP_PASS"]!;
  const from = { name: c?.email.senderName || c?.general.siteName || "Universal Crest", email: user };
  const replyTo = c?.email.replyTo || undefined;
  const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

  if (onWorkers) {
    const { WorkerMailer } = await import("worker-mailer");
    await WorkerMailer.send(
      { host, port: 465, secure: true, credentials: { username: user, password: pass }, authType: "plain" },
      { from, to: { email: to }, ...(replyTo ? { reply: { email: replyTo } } : {}), subject, html, ...(attachments ? { attachments } : {}) },
    );
  } else {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({ host, port: 465, secure: true, auth: { user, pass } });
    await transport.sendMail({ from: `"${from.name}" <${from.email}>`, to, ...(replyTo ? { replyTo } : {}), subject, html, attachments: attachments?.map((a) => ({ filename: a.filename, content: a.content, encoding: "base64", contentType: a.mimeType })) });
  }
}

export async function confirmationEmail(name: string, link: string) {
  const b = await brand();
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#2a0d14">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    ${b.header}
    <h1 style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:bold;font-size:28px;margin:32px 0 12px">Confirm your email</h1>
    <p style="line-height:1.6;color:#5a4045">Hi ${name.replace(/[<>&"]/g, "")}, thank you for opening an account with ${b.name}. Please confirm your email address to activate your account.</p>
    <p style="margin:32px 0"><a href="${link}" style="background:${b.color};color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;display:inline-block">Confirm email</a></p>
    ${b.footer}<p style="font-size:12px;color:#8a7075">If you didn't create this account, you can ignore this email.</p>
  </div></body></html>`;
}

const esc = (s: string) => s.replace(/[<>&"]/g, "");

export async function simpleEmail(title: string, body: string, button?: { label: string; link: string }) {
  const b = await brand();
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#2a0d14">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    ${b.header}
    <h1 style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:bold;font-size:28px;margin:32px 0 12px">${esc(title)}</h1>
    <p style="line-height:1.6;color:#5a4045">${body}</p>
    ${button ? `<p style="margin:32px 0"><a href="${button.link}" style="background:${b.color};color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;display:inline-block">${esc(button.label)}</a></p>` : ""}
    ${b.footer}<p style="font-size:12px;color:#8a7075">If you didn't request this, you can ignore this email or contact support.</p>
  </div></body></html>`;
}

async function brand() {
  const c = await cfg();
  const name = esc(c?.general.siteName || "Universal Crest");
  const color = c?.email.buttonColor || c?.branding.primaryColor || "#6b1a2b";
  let logo = "";
  {
    const { db } = await import("./db.server");
    const r = (await (await db())`select slot from bank_setting_assets where slot in ('email_logo','logo') order by slot = 'email_logo' desc limit 1`)[0];
    if (r) logo = `<img src="${APP_URL}/api/brand/${r.slot}" alt="${name}" style="max-height:48px;margin-bottom:8px" />`;
  }
  return {
    name, color,
    header: `${logo}<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:22px;color:${color}">${name}</div>`,
    footer: c?.email.footer ? `<p style="font-size:12px;color:#8a7075;white-space:pre-line">${esc(c.email.footer)}</p>` : "",
  };
}

/** Email the configured admin alert address. Never throws — alerts must not break customer actions. */
export async function sendAdminAlert(title: string, body: string) {
  try {
    const c = await cfg();
    const to = c?.notifications.alertEmail || c?.general.adminEmail || process.env["ADMIN_EMAIL"];
    if (!to) return;
    await sendMail({ to, subject: `[Admin alert] ${title}`, html: await simpleEmail(title, esc(body)) });
  } catch (e) { console.error("admin alert failed", e); }
}

/** Email a customer a copy of an in-app notification. Never throws. */
export async function emailUserNotification(userId: number, title: string, body: string) {
  try {
    const { db } = await import("./db.server");
    const u = (await (await db())`select email, status from bank_users where id = ${userId}`)[0];
    if (!u?.email || u.status === "erased") return;
    await sendMail({ to: u.email, subject: title, html: await simpleEmail(title, esc(body), { label: "Open online banking", link: `${APP_URL}/login` }) });
  } catch (e) { console.error("notification email failed", e); }
}

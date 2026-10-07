import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie, getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "./db.server";

const COOKIE = "uc_session";

async function createSession(userId: number) {
  const sql = await db();
  const days = (await (await import("./settings.server")).getSettings(sql)).security.sessionDays;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const h = getRequest().headers;
  const ip = (h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "").trim().slice(0, 64) || null;
  const ua = (h.get("user-agent") ?? "").slice(0, 300) || null;
  await sql`insert into bank_sessions (token, user_id, expires_at, ip, user_agent)
    values (${token}, ${userId}, now() + make_interval(days => ${days}), ${ip}, ${ua})`;
  setCookie(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    partitioned: true,
    path: "/",
    maxAge: 60 * 60 * 24 * days,
  });
}

export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { id: "upper", label: "At least one uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { id: "number", label: "At least one number", test: (p: string) => /[0-9]/.test(p) },
  { id: "special", label: "At least one special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200)
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character.");

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

async function checkCredentials(email: string, password: string) {
  const sql = await db();
  const rows = await sql`select u.id, u.password_hash, u.email_verified, u.two_factor_enabled, u.full_name, u.email, u.status,
      exists(select 1 from bank_user_roles r where r.user_id = u.id and r.role = 'admin') as is_admin
    from bank_users u where u.email = ${email.toLowerCase()}`;
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
  return {
    id: user.id as number,
    isAdmin: user.is_admin as boolean,
    verified: user.email_verified as boolean,
    twoFactor: user.two_factor_enabled as boolean,
    fullName: user.full_name as string,
    email: user.email as string,
    status: user.status as string,
  };
}

export const registerUser = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      fullName: z.string().trim().min(2).max(100),
      email: z.string().trim().email().max(255),
      phone: z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/),
      country: z.string().trim().min(2).max(100),
      state: z.string().trim().max(100),
      password: passwordSchema,
      accountType: z.enum(["checking", "savings", "business", "corporate"]),
      pin: z.string().regex(/^\d{4}$/),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sql = await db();
    const cfg = await (await import("./settings.server")).getSettings(sql);
    if (!cfg.security.allowRegistration || cfg.maintenance.enabled) return { ok: false as const, error: "New account registration is currently closed." };
    const email = data.email.toLowerCase();
    const exists = await sql`select 1 from bank_users where email = ${email}`;
    if (exists.length) return { ok: false as const, error: "An account with this email already exists." };
    const hash = await bcrypt.hash(data.password, 10);
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const pinHash = await bcrypt.hash(data.pin, 10);
    const { createAccount } = await import("./banking.server");
    const type = data.accountType === "savings" ? "savings" : "checking";
    const label = type === "savings" ? "Savings" : "Checking";
    const currencies: Array<[string, string]> = [
      ["USD", "US Dollar"],
    ];
    await sql.begin(async (tx: any) => {
      const rows = await tx`insert into bank_users (full_name, email, password_hash, phone, country, state, verify_token, account_type, pin_hash, email_verified)
        values (${data.fullName}, ${email}, ${hash}, ${data.phone}, ${data.country}, ${data.state}, ${token}, ${data.accountType}, ${pinHash}, false)
        returning id`;
      const uid = rows[0].id;
      for (const [cur, name] of currencies) {
        await createAccount(tx, uid, uid, { nickname: `${name} ${label}`, type, currency: cur });
      }
    });
    if (cfg.notifications.registrationAlerts) {
      const { sendAdminAlert } = await import("./mail.server");
      await sendAdminAlert("New customer registration", `${data.fullName} (${email}) opened a ${data.accountType} account.`);
    }
    let emailSent = false;
    try {
      const { sendMail, confirmationEmail, APP_URL } = await import("./mail.server");
      await sendMail({ to: email, subject: "Confirm your Universal Crest account", html: await confirmationEmail(data.fullName, `${APP_URL}/verify-email?token=${token}`) });
      emailSent = true;
    } catch (e) { console.error("Signup confirmation email failed", e); }
    return { ok: true as const, emailSent, verified: false };
  });

const DEFAULT_CURRENCIES: Array<[string, string]> = [
  ["USD", "US Dollar"],
];

async function ensureDefaultAccounts(sql: any, userId: number) {
  const rows = await sql`select account_type from bank_users where id = ${userId}`;
  if (!rows[0]) return;
  const type = rows[0].account_type === "savings" ? "savings" : "checking";
  const label = type === "savings" ? "Savings" : "Checking";
  const existing = await sql`select currency from bank_accounts where user_id = ${userId}`;
  const have = new Set(existing.map((r: any) => r.currency));
  const { createAccount } = await import("./banking.server");
  for (const [cur, name] of DEFAULT_CURRENCIES) {
    if (!have.has(cur)) {
      await createAccount(sql, userId, userId, { nickname: `${name} ${label}`, type, currency: cur });
    }
  }
}

export const verifyEmail = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(10).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const sql = await db();
    const rows = await sql`update bank_users set email_verified = true, verify_token = null
      where verify_token = ${data.token} returning id`;
    return { ok: rows.length > 0 };
  });

export const loginUser = createServerFn({ method: "POST" })
  .inputValidator((d) => loginSchema.parse(d))
  .handler(async ({ data }) => {
    // Temporary lock: 5 wrong passwords within 15 minutes blocks sign-in for that email until the window passes.
    const lockSql = await db();
    const cfg = await (await import("./settings.server")).getSettings(lockSql);
    const maxTries = cfg.security.maxLoginAttempts, lockMin = cfg.security.lockMinutes;
    const email = data.email.trim().toLowerCase();
    const recent = (await lockSql`select count(*)::int as n, min(created_at) as first from bank_login_failures
      where email = ${email} and created_at > now() - make_interval(mins => ${lockMin})`)[0];
    if (recent.n >= maxTries) {
      const mins = Math.max(1, Math.ceil((new Date(recent.first).getTime() + lockMin * 60000 - Date.now()) / 60000));
      return { ok: false as const, error: `Too many incorrect attempts. Sign-in is locked for ${mins} more minute${mins === 1 ? "" : "s"}. You can reset your password if you've forgotten it.` };
    }
    const user = await checkCredentials(data.email, data.password);
    if (!user) {
      const h = getRequest().headers;
      const ip = (h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "").trim().slice(0, 64) || null;
      await lockSql`insert into bank_login_failures (email, ip) values (${email}, ${ip})`;
      await lockSql`delete from bank_login_failures where created_at < now() - interval '1 day'`;
      const left = maxTries - 1 - recent.n;
      return { ok: false as const, error: left > 0 ? `Incorrect email or password. ${left} attempt${left === 1 ? "" : "s"} left before sign-in is temporarily locked.` : `Incorrect email or password. Sign-in is now locked for ${lockMin} minutes.` };
    }
    if (cfg.maintenance.enabled && !user.isAdmin)
      return { ok: false as const, error: "Online banking is temporarily unavailable for maintenance. Please try again later." };
    await lockSql`delete from bank_login_failures where email = ${email}`;
    if (!user.verified && !user.isAdmin)
      return { ok: false as const, error: "Please confirm your email first. Check your inbox for the confirmation link." };
    if (user.status === "suspended")
      return { ok: false as const, error: "This account is suspended. Please contact support." };
    if (user.twoFactor) {
      const { randomToken } = await import("./session.server");
      const sql = await db();
      const token = randomToken();
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1000000).padStart(6, "0");
      const hash = await bcrypt.hash(code, 10);
      await sql`delete from bank_login_codes where user_id = ${user.id}`;
      await sql`insert into bank_login_codes (token, user_id, code_hash, expires_at)
        values (${token}, ${user.id}, ${hash}, now() + interval '10 minutes')`;
      const { sendMail, simpleEmail } = await import("./mail.server");
      try {
        await sendMail({
          to: user.email,
          subject: "Your Universal Crest sign-in code",
          html: await simpleEmail("Your sign-in code", `Use this code to finish signing in: <strong style="font-size:24px;letter-spacing:4px">${code}</strong><br/>It expires in 10 minutes.`),
        });
      } catch (e) {
        console.error("2FA email failed", e);
        return { ok: false as const, error: "We couldn't send your sign-in code. Please try again." };
      }
      return { ok: true as const, twoFactor: true as const, pendingToken: token, isAdmin: user.isAdmin };
    }
    const sql2 = await db();
    await ensureDefaultAccounts(sql2, user.id);
    await createSession(user.id);
    return { ok: true as const, twoFactor: false as const, isAdmin: user.isAdmin };
  });

export const verifyLoginCode = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(10).max(100), code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data }) => {
    const sql = await db();
    const rows = await sql`select l.user_id, l.code_hash, l.attempts,
        exists(select 1 from bank_user_roles r where r.user_id = l.user_id and r.role = 'admin') as is_admin
      from bank_login_codes l where l.token = ${data.token} and l.expires_at > now()`;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "This code has expired. Please sign in again." };
    if (row.attempts >= 5) {
      await sql`delete from bank_login_codes where token = ${data.token}`;
      return { ok: false as const, error: "Too many attempts. Please sign in again." };
    }
    if (!(await bcrypt.compare(data.code, row.code_hash))) {
      await sql`update bank_login_codes set attempts = attempts + 1 where token = ${data.token}`;
      return { ok: false as const, error: "That code is not correct." };
    }
    await sql`delete from bank_login_codes where token = ${data.token}`;
    await ensureDefaultAccounts(sql, row.user_id);
    await createSession(row.user_id);
    return { ok: true as const, isAdmin: row.is_admin as boolean };
  });

export const resendVerification = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const sql = await db();
    const rows = await sql`select id, full_name, email_verified from bank_users where email = ${data.email.toLowerCase()}`;
    const u = rows[0];
    if (u && !u.email_verified) {
      const { randomToken } = await import("./session.server");
      const token = randomToken(24);
      await sql`update bank_users set verify_token = ${token} where id = ${u.id}`;
      const { APP_URL: origin } = await import("./mail.server");
      const { sendMail, confirmationEmail } = await import("./mail.server");
      try {
        await sendMail({ to: data.email.toLowerCase(), subject: "Confirm your Universal Crest account", html: await confirmationEmail(u.full_name, `${origin}/verify-email?token=${token}`) });
      } catch (e) {
        console.error("Resend verification failed", e);
      }
    }
    return { ok: true };
  });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const sql = await db();
    const rows = await sql`select id, full_name from bank_users where email = ${data.email.toLowerCase()}`;
    const u = rows[0];
    if (u) {
      const { randomToken } = await import("./session.server");
      const token = randomToken(32);
      await sql`update bank_users set reset_token = ${token}, reset_expires = now() + interval '1 hour' where id = ${u.id}`;
      const { APP_URL: origin } = await import("./mail.server");
      const { sendMail, simpleEmail } = await import("./mail.server");
      try {
        await sendMail({
          to: data.email.toLowerCase(),
          subject: "Reset your Universal Crest password",
          html: await simpleEmail("Reset your password", "We received a request to reset your password. This link expires in 1 hour.", { label: "Reset password", link: `${origin}/reset-password?token=${token}` }),
        });
      } catch (e) {
        console.error("Reset email failed", e);
      }
    }
    return { ok: true };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(10).max(100), password: passwordSchema }).parse(d))
  .handler(async ({ data }) => {
    const sql = await db();
    const hash = await bcrypt.hash(data.password, 10);
    const rows = await sql`update bank_users set password_hash = ${hash}, reset_token = null, reset_expires = null
      where reset_token = ${data.token} and reset_expires > now() returning id`;
    if (!rows[0]) return { ok: false as const, error: "This reset link is invalid or has expired." };
    await sql`delete from bank_sessions where user_id = ${rows[0].id}`;
    return { ok: true as const };
  });

export const loginAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => loginSchema.parse(d))
  .handler(async ({ data }) => {
    const user = await checkCredentials(data.email, data.password);
    if (!user || !user.isAdmin) return { ok: false as const, error: "Invalid administrator credentials." };
    await createSession(user.id);
    return { ok: true as const };
  });

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie(COOKIE);
  if (!token) return null;
  const sql = await db();
  const rows = await sql`select u.id, u.full_name, u.email,
      exists(select 1 from bank_user_roles r where r.user_id = u.id and r.role = 'admin') as is_admin,
      exists(select 1 from bank_accounts a where a.user_id = u.id and a.is_demo) as is_demo
    from bank_sessions s join bank_users u on u.id = s.user_id
    where s.token = ${token} and s.expires_at > now()`;
  const u = rows[0];
  if (!u) return null;
  return { id: u.id as number, fullName: u.full_name as string, email: u.email as string, isAdmin: u.is_admin as boolean, isDemo: u.is_demo as boolean };
});

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(COOKIE);
  if (token) {
    const sql = await db();
    await sql`delete from bank_sessions where token = ${token}`;
  }
  deleteCookie(COOKIE, {
    secure: true,
    sameSite: "none",
    partitioned: true,
    path: "/",
  });
  return { ok: true };
});

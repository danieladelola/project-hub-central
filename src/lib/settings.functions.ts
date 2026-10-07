import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "./db.server";
import { CATEGORIES, SETTINGS_SCHEMA, type SettingsCategory } from "./settings-schema";

async function adminId() {
  const { requireAdminId } = await import("./session.server");
  return requireAdminId();
}

/** Safe, public subset used for branding, SEO and maintenance on every page. */
export const getPublicSettings = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await db();
  const { getPublicSettings } = await import("./settings.server");
  return getPublicSettings(sql);
});

export const adminGetSettings = createServerFn({ method: "GET" }).handler(async () => {
  await adminId();
  const sql = await db();
  const { getSettings } = await import("./settings.server");
  const settings = await getSettings(sql);
  const assets = await sql`select slot, mime, length(data)::int as size, extract(epoch from updated_at)::bigint as v from bank_setting_assets`;
  const updated = await sql`select s.category, s.updated_at, u.full_name from bank_settings s left join bank_users u on u.id = s.updated_by`;
  return {
    settings,
    assets: Object.fromEntries(assets.map((a: any) => [a.slot, { url: `/api/brand/${a.slot}?v=${a.v}`, size: a.size as number, mime: a.mime as string }])) as Record<string, { url: string; size: number; mime: string }>,
    updated: Object.fromEntries(updated.map((r: any) => [r.category, { at: new Date(r.updated_at).toISOString(), by: (r.full_name ?? "") as string }])) as Record<string, { at: string; by: string }>,
    smtp: { host: Boolean(process.env["SMTP_HOST"]), user: Boolean(process.env["SMTP_USER"]), pass: Boolean(process.env["SMTP_PASS"]) },
  };
});

export const adminSaveSettings = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ category: z.enum(CATEGORIES as [SettingsCategory, ...SettingsCategory[]]), values: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const parsed = SETTINGS_SCHEMA[data.category].safeParse(data.values);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return { ok: false as const, error: `${i?.path.join(".") || "Value"}: ${i?.message ?? "invalid"}` };
    }
    const sql = await db();
    const { audit } = await import("./banking.server");
    await sql.begin(async (tx: any) => {
      await tx`insert into bank_settings (category, value, updated_by, updated_at) values (${data.category}, ${tx.json(parsed.data)}, ${actor}, now())
        on conflict (category) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`;
      await audit(tx, null, actor, "settings.update", { category: data.category });
    });
    (await import("./settings.server")).clearSettingsCache();
    return { ok: true as const, values: parsed.data };
  });

export const adminResetSettings = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ category: z.enum(CATEGORIES as [SettingsCategory, ...SettingsCategory[]]) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit } = await import("./banking.server");
    await sql.begin(async (tx: any) => {
      await tx`delete from bank_settings where category = ${data.category}`;
      await audit(tx, null, actor, "settings.reset", { category: data.category });
    });
    (await import("./settings.server")).clearSettingsCache();
    return { ok: true as const, values: SETTINGS_SCHEMA[data.category].parse({}) };
  });

export const adminChangeOwnPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ current: z.string().min(1).max(200), next: z.string().min(10, "Use at least 10 characters.").max(200) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const u = (await sql`select password_hash from bank_users where id = ${actor}`)[0];
    if (!u || !(await bcrypt.compare(data.current, u.password_hash))) return { ok: false as const, error: "Current password is incorrect." };
    if (!/[A-Z]/.test(data.next) || !/[a-z]/.test(data.next) || !/\d/.test(data.next)) return { ok: false as const, error: "Include upper and lower case letters and a number." };
    const hash = await bcrypt.hash(data.next, 10);
    const { getCookie } = await import("@tanstack/react-start/server");
    const { SESSION_COOKIE } = await import("./session.server");
    const token = getCookie(SESSION_COOKIE) ?? "";
    await sql.begin(async (tx: any) => {
      await tx`update bank_users set password_hash = ${hash} where id = ${actor}`;
      await tx`delete from bank_sessions where user_id = ${actor} and token <> ${token}`;
      const { audit } = await import("./banking.server");
      await audit(tx, actor, actor, "admin.password_changed", {});
    });
    return { ok: true as const };
  });

export const adminSendTestEmail = createServerFn({ method: "POST" }).handler(async () => {
  const actor = await adminId();
  const sql = await db();
  const u = (await sql`select email from bank_users where id = ${actor}`)[0];
  try {
    const { sendMail, simpleEmail } = await import("./mail.server");
    await sendMail({ to: u.email, subject: "Test email", html: await simpleEmail("Test email", "Your email settings are working.") });
    return { ok: true as const, to: u.email as string };
  } catch (e) {
    console.error("test email", e);
    return { ok: false as const, error: "Sending failed. Check the mail server settings." };
  }
});

export const adminSystemInfo = createServerFn({ method: "GET" }).handler(async () => {
  await adminId();
  const sql = await db();
  const t0 = Date.now();
  const r = (await sql`select version() as v, pg_database_size(current_database())::bigint as size,
    (select count(*) from bank_users)::int as users, (select count(*) from bank_accounts)::int as accounts,
    (select count(*) from bank_ledger_txns)::int as txns, (select count(*) from bank_sessions where expires_at > now())::int as sessions`)[0];
  return {
    dbLatencyMs: Date.now() - t0, dbVersion: String(r.v).split(" ").slice(0, 2).join(" "), dbSizeMb: Math.round(Number(r.size) / 1048576),
    users: r.users as number, accounts: r.accounts as number, txns: r.txns as number, sessions: r.sessions as number,
    runtime: typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers" ? "Edge worker" : "Node",
    kycMaxMb: 5, avatarMaxMb: 2, brandMaxMb: 1, version: "1.0.0",
  };
});

export const adminClearSettingsCache = createServerFn({ method: "POST" }).handler(async () => {
  await adminId();
  (await import("./settings.server")).clearSettingsCache();
  return { ok: true as const };
});

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db.server";

const id = z.number().int().positive();
async function adminId() {
  const { requireAdminId } = await import("./session.server");
  return requireAdminId();
}
async function userId() {
  const { requireUserId } = await import("./session.server");
  return requireUserId();
}
async function lib() {
  return import("./banking.server");
}
const isoOrNull = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

// ======================= Sessions & security =======================
export const adminListSessions = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ userId: id }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const rows = await sql`select substr(token, 1, 12) as handle, created_at, expires_at, ip, user_agent
      from bank_sessions where user_id = ${data.userId} and expires_at > now() order by created_at desc`;
    return rows.map((r: any) => ({ handle: r.handle as string, createdAt: isoOrNull(r.created_at), expiresAt: isoOrNull(r.expires_at)!, ip: (r.ip ?? "") as string, userAgent: (r.user_agent ?? "") as string }));
  });

export const adminRevokeSession = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ userId: id, handle: z.string().regex(/^[0-9a-f]{12}$/) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit } = await lib();
    return sql.begin(async (tx: any) => {
      const r = await tx`delete from bank_sessions where user_id = ${data.userId} and substr(token, 1, 12) = ${data.handle} returning 1`;
      if (r.length === 0) return { ok: false as const, error: "That session has already ended." };
      await audit(tx, data.userId, actor, "admin.session_revoked", { session: data.handle });
      return { ok: true as const };
    });
  });

export const adminForcePasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ userId: id, reason: z.string().trim().min(5).max(300) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    if (actor === data.userId) return { ok: false as const, error: "Use Settings to change your own password." };
    const sql = await db();
    const bcrypt = (await import("bcryptjs")).default;
    const { randomToken } = await import("./session.server");
    const { audit, notify } = await lib();
    const token = randomToken(32);
    const scrambled = await bcrypt.hash(randomToken(32), 10);
    const u = await sql.begin(async (tx: any) => {
      const row = (await tx`update bank_users set password_hash = ${scrambled}, reset_token = ${token}, reset_expires = now() + interval '24 hours'
        where id = ${data.userId} returning id, email`)[0];
      if (!row) return null;
      await tx`delete from bank_sessions where user_id = ${row.id}`;
      await notify(tx, row.id, "security", "Password reset required", "For your security, your password was reset by our team. Use the link we emailed you to choose a new one.");
      await audit(tx, row.id, actor, "admin.force_password_reset", { reason: data.reason });
      return row;
    });
    if (!u) return { ok: false as const, error: "Customer not found." };
    const { getRequest } = await import("@tanstack/react-start/server");
    const { APP_URL: origin } = await import("./mail.server");
    const { sendMail, simpleEmail } = await import("./mail.server");
    try {
      await sendMail({ to: u.email, subject: "Action required: set a new Universal Crest password", html: await simpleEmail("Set a new password", "Your password was reset by our security team and all devices were signed out. Choose a new password using the link below. It expires in 24 hours.", { label: "Set new password", link: `${origin}/reset-password?token=${token}` }) });
      return { ok: true as const, emailed: true };
    } catch (e) {
      console.error("Forced reset email failed", e);
      return { ok: true as const, emailed: false };
    }
  });

// ======================= Account closures =======================
export const requestAccountClosure = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ accountId: id, reason: z.string().trim().min(5).max(500) }).parse(d))
  .handler(async ({ data }) => {
    const uid = await userId();
    const sql = await db();
    const { audit } = await lib();
    return sql.begin(async (tx: any) => {
      const a = (await tx`select id, status from bank_accounts where id = ${data.accountId} and user_id = ${uid} for update`)[0];
      if (!a) return { ok: false as const, error: "Account not found." };
      if (a.status === "closed") return { ok: false as const, error: "This account is already closed." };
      const dup = await tx`select 1 from bank_closure_requests where account_id = ${a.id} and status = 'pending'`;
      if (dup.length) return { ok: false as const, error: "You already have a closing request for this account." };
      setTimeout(() => { void import("./mail.server").then((m) => m.sendAdminAlert("Account closure requested", "A customer asked to close an account. Review it in the admin console, Closures tab.")); }, 1500);
      await tx`insert into bank_closure_requests (user_id, account_id, reason) values (${uid}, ${a.id}, ${data.reason})`;
      await audit(tx, uid, uid, "account.closure_requested", { accountId: a.id });
      return { ok: true as const };
    });
  });

export const myClosureRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ accountId: id }).parse(d))
  .handler(async ({ data }) => {
    const uid = await userId();
    const sql = await db();
    const r = (await sql`select id, status, reason, admin_note, created_at from bank_closure_requests
      where account_id = ${data.accountId} and user_id = ${uid} order by created_at desc limit 1`)[0];
    return r ? { id: r.id as number, status: r.status as string, reason: r.reason as string, note: (r.admin_note ?? "") as string, createdAt: isoOrNull(r.created_at)! } : null;
  });

export const cancelClosureRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ requestId: id }).parse(d))
  .handler(async ({ data }) => {
    const uid = await userId();
    const sql = await db();
    const r = await sql`update bank_closure_requests set status = 'cancelled' where id = ${data.requestId} and user_id = ${uid} and status = 'pending' returning 1`;
    return r.length ? { ok: true as const } : { ok: false as const, error: "This request can no longer be cancelled." };
  });

export const adminListClosures = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ status: z.enum(["pending", "approved", "rejected", "cancelled", "all"]) }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const { balancesFor } = await lib();
    const rows = await sql`select c.*, a.account_number, a.nickname, a.currency, a.status as account_status, u.full_name, u.email, d.full_name as decided_name
      from bank_closure_requests c join bank_accounts a on a.id = c.account_id join bank_users u on u.id = c.user_id
      left join bank_users d on d.id = c.decided_by
      where ${data.status === "all" ? sql`true` : sql`c.status = ${data.status}`} order by c.created_at desc limit 200`;
    const bals = await balancesFor(sql, rows.map((r: any) => r.account_id as number));
    return rows.map((r: any) => {
      const b = bals.get(r.account_id)!;
      return {
        id: r.id as number, status: r.status as string, reason: r.reason as string, note: (r.admin_note ?? "") as string,
        createdAt: isoOrNull(r.created_at)!, decidedAt: isoOrNull(r.decided_at), decidedBy: (r.decided_name ?? "") as string,
        customer: r.full_name as string, email: r.email as string, accountId: r.account_id as number, number: r.account_number as string,
        nickname: r.nickname as string, currency: r.currency as string, accountStatus: r.account_status as string,
        current: b.current, held: b.held, pendingIn: b.pendingIn,
      };
    });
  });

export const adminDecideClosure = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ requestId: id, decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).optional() }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { balancesFor, audit, notify } = await lib();
    return sql.begin(async (tx: any) => {
      const c = (await tx`select * from bank_closure_requests where id = ${data.requestId} for update`)[0];
      if (!c || c.status !== "pending") return { ok: false as const, error: "This request has already been decided." };
      const a = (await tx`select * from bank_accounts where id = ${c.account_id} for update`)[0];
      if (data.decision === "reject") {
        if (!data.note || data.note.length < 5) return { ok: false as const, error: "Give the customer a reason (at least 5 characters)." };
        await tx`update bank_closure_requests set status = 'rejected', admin_note = ${data.note}, decided_by = ${actor}, decided_at = now() where id = ${c.id}`;
        await notify(tx, c.user_id, "account_status", "Account closing request declined", `Your request to close "${a.nickname}" was declined. ${data.note}`);
        await audit(tx, c.user_id, actor, "admin.closure_rejected", { accountId: a.id, requestId: c.id, note: data.note });
        return { ok: true as const };
      }
      // Final balance check — nothing may remain on the account.
      const b = (await balancesFor(tx, [a.id])).get(a.id)!;
      if (b.current !== "0") return { ok: false as const, error: "Final balance check failed: the balance must be exactly zero. Move or pay out the remaining funds first." };
      if (b.held !== "0") return { ok: false as const, error: "Final balance check failed: release active holds and settle pending debits first." };
      if (b.pendingIn !== "0") return { ok: false as const, error: "Final balance check failed: settle pending incoming transactions first." };
      await tx`update bank_accounts set status = 'closed', closed_at = now() where id = ${a.id}`;
      await tx`update bank_closure_requests set status = 'approved', admin_note = ${data.note ?? null}, decided_by = ${actor}, decided_at = now() where id = ${c.id}`;
      await notify(tx, c.user_id, "account_status", "Account closed", `Your account "${a.nickname}" has been closed as you requested.`);
      await audit(tx, c.user_id, actor, "admin.account_closed", { accountId: a.id, requestId: c.id });
      return { ok: true as const };
    });
  });

// ======================= Exports & reports =======================
function csv(rows: Array<Record<string, unknown>>, headers: string[]) {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // block spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\r\n");
}
const minor = (v: unknown) => {
  const n = BigInt(String(v ?? "0"));
  const neg = n < 0n; const a = neg ? -n : n;
  return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
};
const range = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export const adminExportCsv = createServerFn({ method: "POST" })
  .inputValidator((d) => range.extend({ kind: z.enum(["transactions", "loans", "customers"]) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const from = data.from ?? "1970-01-01";
    const to = data.to ?? "2999-12-31";
    let out = "";
    if (data.kind === "transactions") {
      const rows = await sql`select t.reference, t.created_at, t.posted_at, t.status, t.kind, t.description, a.account_number, u.full_name, u.email, e.currency, e.amount_minor::text as amount
        from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id join bank_accounts a on a.id = e.account_id join bank_users u on u.id = a.user_id
        where t.created_at >= ${from}::date and t.created_at < ${to}::date + 1 order by t.created_at desc limit 50000`;
      out = csv(rows.map((r: any) => ({ ...r, created_at: isoOrNull(r.created_at), posted_at: isoOrNull(r.posted_at), amount: minor(r.amount) })),
        ["reference", "created_at", "posted_at", "status", "kind", "description", "account_number", "full_name", "email", "currency", "amount"]);
    } else if (data.kind === "loans") {
      const rows = await sql`select l.*, u.full_name, u.email from bank_loan_requests l join bank_users u on u.id = l.user_id
        where l.created_at >= ${from}::date and l.created_at < ${to}::date + 1 order by l.created_at desc`;
      out = csv(rows.map((r: any) => ({ id: r.id, created_at: isoOrNull(r.created_at), full_name: r.full_name, email: r.email, loan_type: r.loan_type, currency: r.currency, amount: minor(r.amount_minor), term_months: r.term_months, status: r.status, apr: r.apr ?? "", purpose: r.purpose })),
        ["id", "created_at", "full_name", "email", "loan_type", "currency", "amount", "term_months", "status", "apr", "purpose"]);
    } else {
      const rows = await sql`select u.id, u.full_name, u.email, u.phone, u.country, u.state, u.kyc_status, u.status, u.email_verified, u.created_at,
          (select count(*) from bank_accounts a where a.user_id = u.id and a.status <> 'closed')::int as open_accounts
        from bank_users u where not exists (select 1 from bank_user_roles r where r.user_id = u.id and r.role = 'admin')
          and u.created_at >= ${from}::date and u.created_at < ${to}::date + 1 order by u.created_at desc`;
      out = csv(rows.map((r: any) => ({ ...r, created_at: isoOrNull(r.created_at) })),
        ["id", "full_name", "email", "phone", "country", "state", "kyc_status", "status", "email_verified", "open_accounts", "created_at"]);
    }
    const { audit } = await lib();
    await audit(sql, null, actor, "admin.export", { kind: data.kind, from: data.from ?? null, to: data.to ?? null });
    return { filename: `${data.kind}-${data.from ?? "all"}-to-${data.to ?? "now"}.csv`, csv: out };
  });

export const adminMonthlyReport = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const start = `${data.month}-01`;
    const money = await sql`select e.currency,
        coalesce(sum(e.amount_minor) filter (where e.amount_minor > 0), 0)::text as money_in,
        coalesce(sum(-e.amount_minor) filter (where e.amount_minor < 0), 0)::text as money_out,
        count(distinct t.id)::int as txns
      from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id
      where e.account_id is not null and t.status = 'posted' and t.posted_at >= ${start}::date and t.posted_at < ${start}::date + interval '1 month'
      group by e.currency order by e.currency`;
    const loans = await sql`select currency, count(*)::int as requested,
        count(*) filter (where status = 'approved')::int as approved,
        coalesce(sum(amount_minor), 0)::text as requested_amount,
        coalesce(sum(amount_minor) filter (where status = 'approved'), 0)::text as approved_amount
      from bank_loan_requests where created_at >= ${start}::date and created_at < ${start}::date + interval '1 month' group by currency order by currency`;
    const c = (await sql`select
        (select count(*) from bank_users u where created_at >= ${start}::date and created_at < ${start}::date + interval '1 month'
          and not exists (select 1 from bank_user_roles r where r.user_id = u.id and r.role = 'admin'))::int as new_customers,
        (select count(*) from bank_accounts where opened_at >= ${start}::date and opened_at < ${start}::date + interval '1 month')::int as accounts_opened,
        (select count(*) from bank_accounts where closed_at >= ${start}::date and closed_at < ${start}::date + interval '1 month')::int as accounts_closed`)[0];
    return {
      month: data.month,
      newCustomers: c.new_customers as number, accountsOpened: c.accounts_opened as number, accountsClosed: c.accounts_closed as number,
      money: money.map((r: any) => ({ currency: r.currency as string, moneyIn: r.money_in as string, moneyOut: r.money_out as string, txns: r.txns as number })) as Array<{ currency: string; moneyIn: string; moneyOut: string; txns: number }>,
      loans: loans.map((r: any) => ({ currency: r.currency as string, requested: r.requested as number, approved: r.approved as number, requestedAmount: r.requested_amount as string, approvedAmount: r.approved_amount as string })) as Array<{ currency: string; requested: number; approved: number; requestedAmount: string; approvedAmount: string }>,
    };
  });

// ======================= Staff management =======================
export const adminListStaff = createServerFn({ method: "GET" }).handler(async () => {
  const me = await adminId();
  const sql = await db();
  const owner = process.env["ADMIN_EMAIL"]?.toLowerCase() ?? "";
  const rows = await sql`select u.id, u.full_name, u.email, u.created_at,
      (select max(created_at) from bank_audit_log l where l.actor_id = u.id) as last_action,
      (select count(*) from bank_audit_log l where l.actor_id = u.id)::int as actions
    from bank_users u join bank_user_roles r on r.user_id = u.id and r.role = 'admin' order by u.created_at`;
  return rows.map((r: any) => ({ id: r.id as number, name: r.full_name as string, email: r.email as string, createdAt: isoOrNull(r.created_at)!, lastAction: isoOrNull(r.last_action), actions: r.actions as number, isMe: r.id === me, isOwner: r.email === owner }));
});

export const adminAddStaff = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ fullName: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email().max(200) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const bcrypt = (await import("bcryptjs")).default;
    const { randomToken } = await import("./session.server");
    const { audit } = await lib();
    const token = randomToken(32);
    const res = await sql.begin(async (tx: any) => {
      const existing = (await tx`select id from bank_users where email = ${data.email}`)[0];
      if (existing) {
        const hasMoney = await tx`select 1 from bank_accounts where user_id = ${existing.id} limit 1`;
        if (hasMoney.length) return { ok: false as const, error: "That email belongs to a customer. Staff must use a separate work email." };
        const already = await tx`select 1 from bank_user_roles where user_id = ${existing.id} and role = 'admin'`;
        if (already.length) return { ok: false as const, error: "That person is already staff." };
      }
      const hash = await bcrypt.hash(randomToken(32), 10);
      const uid = existing ? existing.id : (await tx`insert into bank_users (full_name, email, password_hash, email_verified) values (${data.fullName}, ${data.email}, ${hash}, true) returning id`)[0].id;
      await tx`update bank_users set reset_token = ${token}, reset_expires = now() + interval '72 hours' where id = ${uid}`;
      await tx`insert into bank_user_roles (user_id, role) values (${uid}, 'admin') on conflict do nothing`;
      await audit(tx, uid, actor, "admin.staff_added", { email: data.email });
      return { ok: true as const };
    });
    if (!res.ok) return res;
    const { getRequest } = await import("@tanstack/react-start/server");
    const { APP_URL: origin } = await import("./mail.server");
    const { sendMail, simpleEmail } = await import("./mail.server");
    try {
      await sendMail({ to: data.email, subject: "You've been added as Universal Crest staff", html: await simpleEmail("Set up your staff account", "You've been given access to the Universal Crest admin console. Choose your password using the link below (valid for 72 hours), then sign in on the admin page.", { label: "Choose password", link: `${origin}/reset-password?token=${token}` }) });
      return { ok: true as const, emailed: true };
    } catch (e) {
      console.error("Staff invite email failed", e);
      return { ok: true as const, emailed: false };
    }
  });

export const adminRemoveStaff = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ userId: id }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    if (actor === data.userId) return { ok: false as const, error: "You can't remove your own access." };
    const sql = await db();
    const owner = process.env["ADMIN_EMAIL"]?.toLowerCase() ?? "";
    const { audit } = await lib();
    return sql.begin(async (tx: any) => {
      const u = (await tx`select u.id, u.email from bank_users u join bank_user_roles r on r.user_id = u.id and r.role = 'admin' where u.id = ${data.userId} for update`)[0];
      if (!u) return { ok: false as const, error: "That person is not staff." };
      if (u.email === owner) return { ok: false as const, error: "The main administrator from settings can't be removed." };
      await tx`delete from bank_user_roles where user_id = ${u.id} and role = 'admin'`;
      await tx`delete from bank_sessions where user_id = ${u.id}`;
      await audit(tx, u.id, actor, "admin.staff_removed", { email: u.email });
      return { ok: true as const };
    });
  });

export const adminStaffActivity = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ staffId: id }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const rows = await sql`select l.id, l.action, l.detail, l.created_at, u.full_name as subject
      from bank_audit_log l left join bank_users u on u.id = l.user_id where l.actor_id = ${data.staffId} order by l.created_at desc limit 200`;
    return rows.map((r: any) => ({ id: Number(r.id), action: r.action as string, detail: r.detail ? JSON.stringify(r.detail) : "", subject: (r.subject ?? "") as string, at: isoOrNull(r.created_at)! }));
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db.server";

const id = z.number().int().positive();
async function uid() { const { requireUserId } = await import("./session.server"); return requireUserId(); }
async function adminId() { const { requireAdminId } = await import("./session.server"); return requireAdminId(); }
const iso = (d: any) => (d ? new Date(d).toISOString() : null);

export const DISPUTE_REASONS = ["I didn't make this transaction", "Wrong amount", "Duplicate charge", "Money never arrived", "Other"] as const;

// ---------- Daily sending limits ----------
export const adminSetDailyLimit = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ accountId: id, amount: z.string().trim().regex(/^(\d{1,12}(\.\d{1,2})?)?$/, "Enter an amount like 5000 or 5000.00, or leave blank for the default.") }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, notify } = await import("./banking.server");
    const { formatMinor } = await import("./money");
    let minor: bigint | null = null;
    if (data.amount) { const [w, f = ""] = data.amount.split("."); minor = BigInt(w!) * 100n + BigInt((f + "00").slice(0, 2)); }
    return sql.begin(async (tx: any) => {
      const a = (await tx`select id, user_id, nickname, currency from bank_accounts where id = ${data.accountId} for update`)[0];
      if (!a) return { ok: false as const, error: "Account not found." };
      await tx`update bank_accounts set daily_send_limit_minor = ${minor === null ? null : minor.toString()} where id = ${a.id}`;
      await audit(tx, a.user_id, actor, "account.daily_limit", { accountId: a.id, limit: minor === null ? "default" : minor.toString() });
      await notify(tx, a.user_id, "limit_changed", "Daily sending limit updated",
        minor === null ? `The daily sending limit on "${a.nickname}" is back to the standard limit.` : `The daily sending limit on "${a.nickname}" is now ${formatMinor(minor, a.currency)}.`);
      return { ok: true as const };
    });
  });

export const getDailyLimits = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ userId: id.optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const target = data.userId ? (await adminId(), data.userId) : await uid();
    const sql = await db();
    const { DEFAULT_DAILY_SEND_LIMIT_MINOR } = await import("./banking.server");
    const rows = await sql`select a.id, a.currency, a.daily_send_limit_minor::text as lim,
        coalesce((select sum(t.amount_minor) from bank_ledger_txns t where t.from_account_id = a.id
          and t.kind in ('transfer','wire','local_transfer') and t.status in ('posted','pending')
          and t.created_at >= date_trunc('day', now())), 0)::text as used
      from bank_accounts a where a.user_id = ${target} and a.status <> 'closed'`;
    return rows.map((r: any) => ({ accountId: r.id as number, currency: r.currency as string, custom: r.lim != null,
      limit: (r.lim ?? DEFAULT_DAILY_SEND_LIMIT_MINOR.toString()) as string, usedToday: r.used as string }));
  });

// ---------- Customer disputes ----------
export const fileDispute = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    txnId: id, accountId: id,
    reason: z.enum(DISPUTE_REASONS),
    details: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(1000),
  }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const { audit, notify } = await import("./banking.server");
    try {
      return await sql.begin(async (tx: any) => {
        const t = (await tx`select t.id, t.reference from bank_ledger_txns t join bank_ledger_entries e on e.txn_id = t.id
          join bank_accounts a on a.id = e.account_id where t.id = ${data.txnId} and a.id = ${data.accountId} and a.user_id = ${userId} limit 1`)[0];
        if (!t) return { ok: false as const, error: "Transaction not found." };
        const d = (await tx`insert into bank_disputes (user_id, txn_id, account_id, reason, details)
          values (${userId}, ${t.id}, ${data.accountId}, ${data.reason}, ${data.details}) returning id`)[0];
        await audit(tx, userId, userId, "dispute.filed", { disputeId: d.id, txnId: Number(t.id) });
        await notify(tx, userId, "dispute", "Dispute received", `We've received your dispute for transaction ${t.reference}. Our team will review it and get back to you.`);
        return { ok: true as const };
      });
    } catch (e: any) {
      if (e?.code === "23505") return { ok: false as const, error: "You already have an open dispute for this transaction." };
      throw e;
    }
  });

export const myDisputes = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await uid();
  const sql = await db();
  const rows = await sql`select d.id, d.txn_id, d.reason, d.status, d.admin_note, d.created_at, t.reference
    from bank_disputes d join bank_ledger_txns t on t.id = d.txn_id where d.user_id = ${userId} order by d.created_at desc`;
  return rows.map((r: any) => ({ id: r.id as number, txnId: Number(r.txn_id), reference: r.reference as string, reason: r.reason as string,
    status: r.status as string, adminNote: (r.admin_note ?? "") as string, createdAt: iso(r.created_at)! }));
});

export const cancelDispute = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const r = await sql`update bank_disputes set status = 'cancelled' where id = ${data.id} and user_id = ${userId} and status = 'open' returning id`;
    return r[0] ? { ok: true as const } : { ok: false as const, error: "This dispute can no longer be withdrawn." };
  });

export const adminListDisputes = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ status: z.enum(["open", "all"]).default("open") }).parse(d ?? {}))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const rows = await sql`select d.id, d.reason, d.details, d.status, d.admin_note, d.created_at, d.decided_at,
        u.full_name, u.email, t.reference, t.description, t.status as txn_status, t.created_at as txn_date,
        a.nickname, a.account_number, e.amount_minor::text as amount, e.currency
      from bank_disputes d join bank_users u on u.id = d.user_id join bank_ledger_txns t on t.id = d.txn_id
      join bank_accounts a on a.id = d.account_id
      left join lateral (select amount_minor, currency from bank_ledger_entries where txn_id = t.id and account_id = a.id limit 1) e on true
      where (${data.status} = 'all' or d.status = 'open') order by d.created_at limit 500`;
    return rows.map((r: any) => ({ id: r.id as number, reason: r.reason as string, details: r.details as string, status: r.status as string,
      adminNote: (r.admin_note ?? "") as string, createdAt: iso(r.created_at)!, decidedAt: iso(r.decided_at),
      customer: r.full_name as string, email: r.email as string, reference: r.reference as string, description: r.description as string,
      txnStatus: r.txn_status as string, txnDate: iso(r.txn_date)!, account: `${r.nickname} •••• ${String(r.account_number).slice(-4)}`,
      amount: (r.amount ?? "0") as string, currency: (r.currency ?? "USD") as string }));
  });

export const adminDecideDispute = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id, decision: z.enum(["resolved", "rejected"]), note: z.string().trim().min(3, "Write a short note for the customer.").max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, notify } = await import("./banking.server");
    return sql.begin(async (tx: any) => {
      const d = (await tx`select d.id, d.user_id, t.reference from bank_disputes d join bank_ledger_txns t on t.id = d.txn_id
        where d.id = ${data.id} and d.status = 'open' for update of d`)[0];
      if (!d) return { ok: false as const, error: "This dispute is no longer open." };
      await tx`update bank_disputes set status = ${data.decision}, admin_note = ${data.note}, decided_by = ${actor}, decided_at = now() where id = ${d.id}`;
      await audit(tx, d.user_id, actor, `dispute.${data.decision}`, { disputeId: d.id });
      await notify(tx, d.user_id, "dispute", data.decision === "resolved" ? "Dispute resolved" : "Dispute declined",
        `Your dispute for transaction ${d.reference} was ${data.decision === "resolved" ? "resolved" : "declined"}: ${data.note}`);
      return { ok: true as const };
    });
  });

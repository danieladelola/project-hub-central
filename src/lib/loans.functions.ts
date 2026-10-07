import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db.server";

async function uid() {
  const { requireUserId } = await import("./session.server");
  return requireUserId();
}
const toMinor = (n: number) => BigInt(Math.round(n * 100));

export const listMyLoanRequests = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await uid();
  const sql = await db();
  const { loanState } = await import("./loans.server");
  const rows = await sql`select *, amount_minor::text as amount, monthly_payment_minor::text as pmt
    from bank_loan_requests where user_id = ${userId} order by created_at desc`;
  type LoanRow = { id: number; type: string; amount: string; currency: string; termMonths: number; purpose: string; status: string; note: string | null; createdAt: string; apr: number | null; payment: string | null; state: import("./loans.server").LoanState };
  return rows.map((r: any): LoanRow => ({ state: loanState(r),
    id: Number(r.id), type: r.loan_type as string, amount: r.amount as string, currency: r.currency as string,
    termMonths: Number(r.term_months), purpose: r.purpose as string, status: r.status as string,
    note: (r.admin_note ?? null) as string | null, createdAt: new Date(r.created_at).toISOString(),
    apr: r.apr_bps == null ? null : Number(r.apr_bps) / 100, payment: (r.pmt ?? null) as string | null,
  }));
});

export const requestLoan = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    type: z.enum(["personal", "mortgage", "auto", "education", "business"]),
    amount: z.number().min(500, "Minimum loan is 500.").max(5_000_000),
    currency: z.enum(["USD"]),
    termMonths: z.number().int().min(6).max(360),
    purpose: z.string().trim().min(10, "Tell us briefly what the loan is for.").max(1000),
    monthlyIncome: z.number().min(0).max(10_000_000),
    employment: z.enum(["employed", "self_employed", "business_owner", "student", "retired", "other"]),
  }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const open = await sql`select count(*)::int as n from bank_loan_requests where user_id = ${userId} and status = 'pending'`;
    if (open[0].n >= 3) return { ok: false as const, error: "You already have 3 loan requests under review." };
    await sql`insert into bank_loan_requests (user_id, loan_type, amount_minor, currency, term_months, purpose, monthly_income_minor, employment)
      values (${userId}, ${data.type}, ${toMinor(data.amount).toString()}, ${data.currency}, ${data.termMonths}, ${data.purpose}, ${toMinor(data.monthlyIncome).toString()}, ${data.employment})`;
    await sql`insert into bank_notifications (user_id, kind, title, body)
      values (${userId}, 'loan', 'Loan request received', ${`Your ${data.type} loan request for ${data.currency} ${data.amount.toLocaleString()} is under review.`})`.catch(() => {});
    if ((await (await import("./settings.server")).getSettings(sql)).notifications.loanAlerts) {
      await (await import("./mail.server")).sendAdminAlert("New loan request", `A ${data.type} loan request for ${data.currency} ${data.amount.toLocaleString()} (${data.termMonths} months) is awaiting review.`);
    }
    return { ok: true as const };
  });

export const cancelLoanRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    await sql`update bank_loan_requests set status = 'cancelled', updated_at = now()
      where id = ${data.id} and user_id = ${userId} and status = 'pending'`;
    return { ok: true as const };
  });

export const getMyLoan = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const { loanDetail } = await import("./loans.server");
    const { balancesFor } = await import("./banking.server");
    const l = (await sql`select * from bank_loan_requests where id = ${data.id} and user_id = ${userId}`)[0];
    if (!l) throw new Error("Loan not found.");
    const accounts = await sql`select id, nickname, account_number from bank_accounts where user_id = ${userId} and currency = ${l.currency} and status = 'active' order by id`;
    const bals = await balancesFor(sql, accounts.map((a: any) => a.id));
    const d = await loanDetail(sql, l);
    return { ...d, accounts: accounts.map((a: any) => ({ id: Number(a.id), label: `${a.nickname} ••••${String(a.account_number).slice(-4)}`, available: bals.get(a.id)?.available ?? "0" })) };
  });

export const payMyLoan = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    loanId: z.number().int().positive(), accountId: z.number().int().positive(), mode: z.enum(["installment", "payoff", "custom"]),
    amount: z.number().positive().max(10_000_000).optional(), idempotencyKey: z.string().min(8).max(100),
  }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const { applyLoanPayment } = await import("./loans.server");
    const { BankError } = await import("./banking.server");
    try {
      return await sql.begin(async (tx: any) => {
        const r = await applyLoanPayment(tx, { loanId: data.loanId, accountId: data.accountId, mode: data.mode, amountMinor: data.amount != null ? toMinor(data.amount) : undefined, actorId: userId, source: "customer", idempotencyKey: `u${userId}:` + data.idempotencyKey, ownerId: userId });
        return { ok: true as const, ...r };
      });
    } catch (e) {
      if (e instanceof BankError) return { ok: false as const, error: e.message };
      throw e;
    }
  });

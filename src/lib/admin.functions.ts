import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db.server";

const id = z.number().int().positive();
async function adminId() {
  const { requireAdminId } = await import("./session.server");
  return requireAdminId();
}
async function lib() {
  return import("./banking.server");
}

export const adminOverview = createServerFn({ method: "GET" }).handler(async () => {
  await adminId();
  const sql = await db();
  const c = (await sql`select
      (select count(*) from bank_users u where not exists (select 1 from bank_user_roles r where r.user_id = u.id and r.role = 'admin'))::int as customers,
      (select count(*) from bank_users where status = 'suspended')::int as suspended,
      (select count(*) from bank_accounts where status <> 'closed')::int as accounts,
      (select count(*) from bank_accounts where status in ('frozen','restricted'))::int as flagged,
      (select count(*) from bank_ledger_txns where status = 'pending')::int as pending,
      (select count(*) from bank_loan_requests where status = 'pending')::int as loans,
      (select count(*) from bank_tax_refunds where status = 'pending')::int as taxes,
      (select count(*) from bank_cards where status <> 'deleted')::int as cards,
      (select count(*) from bank_kyc_applications where status in ('submitted','under_review'))::int as kyc`)[0];
  const deposits = await sql`select e.currency, coalesce(sum(e.amount_minor),0)::text as total
    from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id
    where e.account_id is not null and t.status = 'posted' group by e.currency order by e.currency`;
  type Slice = { name: string; value: number };
  const slices = (rows: any[]): Slice[] => rows.map((r) => ({ name: String(r.name ?? "unknown"), value: Number(r.value) }));
  const flow = await sql`with b as (select generate_series(date_trunc('day', now() - interval '29 days'), date_trunc('day', now()), interval '1 day') as d)
    select to_char(b.d, 'DD Mon') as label,
      coalesce(sum(e.amount_minor) filter (where e.amount_minor > 0), 0)::text as money_in,
      coalesce(sum(-e.amount_minor) filter (where e.amount_minor < 0), 0)::text as money_out,
      count(distinct t.id)::int as txns
    from b left join bank_ledger_txns t on t.status = 'posted' and date_trunc('day', t.posted_at) = b.d
    left join bank_ledger_entries e on e.txn_id = t.id and e.account_id is not null and e.currency = 'USD'
    group by b.d order by b.d`;
  const signups = await sql`with b as (select generate_series(date_trunc('month', now() - interval '11 months'), date_trunc('month', now()), interval '1 month') as m)
    select to_char(b.m, 'Mon YY') as label,
      (select count(*) from bank_users u where date_trunc('month', u.created_at) = b.m)::int as customers,
      (select count(*) from bank_accounts a where date_trunc('month', a.opened_at) = b.m)::int as accounts
    from b order by b.m`;
  const kycStatus = await sql`select kyc_status as name, count(*)::int as value from bank_users u
    where not exists (select 1 from bank_user_roles r where r.user_id = u.id and r.role = 'admin') group by 1 order by 2 desc`;
  const accountTypes = await sql`select account_type as name, count(*)::int as value from bank_accounts where status <> 'closed' group by 1`;
  const accountStatus = await sql`select status as name, count(*)::int as value from bank_accounts group by 1`;
  const currencies = await sql`select currency as name, count(*)::int as value from bank_accounts where status <> 'closed' group by 1 order by 2 desc`;
  const txnStatus = await sql`select status as name, count(*)::int as value from bank_ledger_txns group by 1`;
  const loanStatus = await sql`select status as name, count(*)::int as value from bank_loan_requests group by 1`;
  const loanTypes = await sql`select loan_type as name, (sum(amount_minor) / 100)::float8 as value from bank_loan_requests where status in ('pending','approved') group by 1`;
  const cardBrands = await sql`select brand as name, count(*)::int as value from bank_cards where status <> 'deleted' group by 1`;
  const top = await sql`select u.full_name, a.currency, sum(e.amount_minor)::text as bal
    from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id and t.status = 'posted'
    join bank_accounts a on a.id = e.account_id join bank_users u on u.id = a.user_id
    group by u.id, u.full_name, a.currency having sum(e.amount_minor) > 0 order by sum(e.amount_minor) desc limit 5`;
  const today = (await sql`select
      (select count(*) from bank_users where created_at >= date_trunc('day', now()))::int as new_customers,
      (select count(*) from bank_ledger_txns where created_at >= date_trunc('day', now()))::int as txns_today,
      (select count(*) from bank_sessions where expires_at > now())::int as active_sessions,
      (select count(*) from bank_users where email_verified)::int as verified_emails`)[0];
  // Aging: [tab, label, warn-after days, count waiting past threshold, oldest wait in days]
  const ag = (await sql`select
      (select count(*) from bank_loan_requests where status = 'pending' and created_at < now() - interval '2 days')::int as loans,
      (select extract(epoch from now() - min(created_at)) / 86400 from bank_loan_requests where status = 'pending')::float8 as loans_old,
      (select count(*) from bank_kyc_applications where status in ('submitted','under_review') and coalesce(submitted_at, created_at) < now() - interval '7 days')::int as kyc,
      (select extract(epoch from now() - min(coalesce(submitted_at, created_at))) / 86400 from bank_kyc_applications where status in ('submitted','under_review'))::float8 as kyc_old,
      (select count(*) from bank_tax_refunds where status = 'pending' and created_at < now() - interval '5 days')::int as taxes,
      (select extract(epoch from now() - min(created_at)) / 86400 from bank_tax_refunds where status = 'pending')::float8 as taxes_old,
      (select count(*) from bank_support_tickets where status = 'open' and updated_at < now() - interval '1 day')::int as tickets,
      (select extract(epoch from now() - min(updated_at)) / 86400 from bank_support_tickets where status = 'open')::float8 as tickets_old,
      (select count(*) from bank_ledger_txns where status = 'pending' and created_at < now() - interval '2 days')::int as pending,
      (select extract(epoch from now() - min(created_at)) / 86400 from bank_ledger_txns where status = 'pending')::float8 as pending_old,
      (select count(*) from bank_closure_requests where status = 'pending' and created_at < now() - interval '3 days')::int as closures,
      (select extract(epoch from now() - min(created_at)) / 86400 from bank_closure_requests where status = 'pending')::float8 as closures_old`)[0];
  const aging = ([
    ["Loans", "loan requests", 2, "loans"], ["KYC", "KYC applications", 7, "kyc"], ["Tax refunds", "tax refund requests", 5, "taxes"],
    ["Support", "open support tickets without a reply", 1, "tickets"], ["Transactions", "pending transfers", 2, "pending"], ["Closures", "account closing requests", 3, "closures"],
  ] as const).map(([tab, label, days, k]) => ({ tab, label, days, count: Number(ag[k] ?? 0), oldestDays: ag[`${k}_old`] == null ? null : Math.floor(Number(ag[`${k}_old`])) }));
  return {
    aging,
    counts: c as { customers: number; suspended: number; accounts: number; flagged: number; pending: number; loans: number; taxes: number; cards: number; kyc: number },
    today: today as { new_customers: number; txns_today: number; active_sessions: number; verified_emails: number },
    deposits: deposits.map((d: any) => ({ currency: d.currency as string, total: d.total as string })) as Array<{ currency: string; total: string }>,
    flow: flow.map((r: any) => ({ label: r.label as string, moneyIn: r.money_in as string, moneyOut: r.money_out as string, txns: r.txns as number })) as Array<{ label: string; moneyIn: string; moneyOut: string; txns: number }>,
    signups: signups.map((r: any) => ({ label: r.label as string, customers: r.customers as number, accounts: r.accounts as number })) as Array<{ label: string; customers: number; accounts: number }>,
    kycStatus: slices(kycStatus), accountTypes: slices(accountTypes), accountStatus: slices(accountStatus), currencies: slices(currencies),
    txnStatus: slices(txnStatus), loanStatus: slices(loanStatus), loanTypes: slices(loanTypes), cardBrands: slices(cardBrands),
    top: top.map((r: any) => ({ name: r.full_name as string, currency: r.currency as string, balance: r.bal as string })) as Array<{ name: string; currency: string; balance: string }>,
  };
});

export const adminListTransactions = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ status: z.enum(["all", "pending", "posted", "cancelled"]), q: z.string().trim().max(100).optional() }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const q = data.q ? `%${data.q.replace(/[%_\\]/g, "\\$&")}%` : null;
    const rows = await sql`select t.id, t.reference, t.description, t.status, t.created_at, t.posted_at, t.details,
        e.amount_minor::text as amount, e.currency, a.nickname, a.account_number, u.full_name, u.email
      from bank_ledger_txns t join bank_ledger_entries e on e.txn_id = t.id
      join bank_accounts a on a.id = e.account_id join bank_users u on u.id = a.user_id
      where 1=1 ${data.status !== "all" ? sql`and t.status = ${data.status}` : sql``}
      ${q ? sql`and (t.reference ilike ${q} or t.description ilike ${q} or u.full_name ilike ${q} or u.email ilike ${q} or a.account_number ilike ${q})` : sql``}
      order by (t.status = 'pending') desc, t.created_at desc limit 200`;
    return rows.map((r: any) => ({
      txnId: Number(r.id), reference: r.reference as string, description: r.description as string, status: r.status as string,
      date: new Date(r.posted_at ?? r.created_at).toISOString(), amount: r.amount as string, currency: r.currency as string,
      account: `${r.nickname} · ${String(r.account_number).slice(-4)}`, customer: r.full_name as string, email: r.email as string,
      details: r.details ? JSON.stringify(r.details) : "",
    })) as Array<{ txnId: number; reference: string; description: string; status: string; date: string; amount: string; currency: string; account: string; customer: string; email: string; details: string }>;
  });

export const adminListLoans = createServerFn({ method: "GET" }).handler(async () => {
  await adminId();
  const sql = await db();
  const { loanState } = await import("./loans.server");
  const rows = await sql`select l.*, l.amount_minor::text as amt, l.monthly_income_minor::text as inc, l.monthly_payment_minor::text as pmt, u.full_name, u.email
    from bank_loan_requests l join bank_users u on u.id = l.user_id order by (l.status = 'pending') desc, l.created_at desc limit 300`;
  return rows.map((r: any) => ({
    userId: Number(r.user_id), state: loanState(r),
    id: r.id as number, customer: r.full_name as string, email: r.email as string, type: r.loan_type as string, amount: r.amt as string,
    currency: r.currency as string, term: r.term_months as number, purpose: r.purpose as string, income: r.inc as string,
    employment: r.employment as string, status: r.status as string, note: (r.admin_note ?? "") as string, createdAt: new Date(r.created_at).toISOString(),
    apr: r.apr_bps == null ? null : Number(r.apr_bps) / 100, payment: (r.pmt ?? null) as string | null,
  })) as Array<{ id: number; customer: string; email: string; type: string; amount: string; currency: string; term: number; purpose: string; income: string; employment: string; status: string; note: string; createdAt: string; apr: number | null; payment: string | null; userId: number; state: import("./loans.server").LoanState }>;
});

export const adminLoanDetail = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const { loanDetail } = await import("./loans.server");
    const l = (await sql`select * from bank_loan_requests where id = ${data.id}`)[0];
    if (!l) throw new Error("Loan not found.");
    const accounts = await sql`select id, nickname, account_number, currency from bank_accounts where user_id = ${l.user_id} and currency = ${l.currency} and status = 'active' order by id`;
    const d = await loanDetail(sql, l);
    const { balancesFor } = await lib();
    const bals = await balancesFor(sql, accounts.map((a: any) => a.id));
    return { ...d, accounts: accounts.map((a: any) => ({ id: Number(a.id), label: `${a.nickname} ••••${String(a.account_number).slice(-4)}`, available: bals.get(a.id)?.available ?? "0" })) };
  });

export const adminRecordLoanPayment = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    loanId: id, accountId: id, mode: z.enum(["installment", "payoff", "custom"]),
    amount: z.number().positive().max(10_000_000).optional(), idempotencyKey: z.string().min(8).max(100),
  }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { applyLoanPayment } = await import("./loans.server");
    const { BankError } = await lib();
    try {
      return await sql.begin(async (tx: any) => {
        const r = await applyLoanPayment(tx, { loanId: data.loanId, accountId: data.accountId, mode: data.mode, amountMinor: data.amount != null ? BigInt(Math.round(data.amount * 100)) : undefined, actorId: actor, source: "admin", idempotencyKey: "a:" + data.idempotencyKey });
        return { ok: true as const, ...r };
      });
    } catch (e) {
      if (e instanceof BankError) return { ok: false as const, error: e.message };
      throw e;
    }
  });

export const adminSearchAccounts = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ q: z.string().trim().min(2).max(100) }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const q = `%${data.q.replace(/[%_\\]/g, "\\$&")}%`;
    const rows = await sql`select a.id, a.nickname, a.account_number, a.currency, a.status, u.full_name, u.email from bank_accounts a join bank_users u on u.id = a.user_id
      where a.status <> 'closed' and (u.full_name ilike ${q} or u.email ilike ${q} or a.account_number ilike ${q}) order by u.full_name, a.id limit 25`;
    const { balancesFor } = await lib();
    const bals = await balancesFor(sql, rows.map((r: any) => r.id));
    return rows.map((r: any) => ({
      id: Number(r.id), customer: r.full_name as string, email: r.email as string, nickname: r.nickname as string, number: String(r.account_number),
      currency: r.currency as string, status: r.status as string, current: bals.get(r.id)?.current ?? "0", available: bals.get(r.id)?.available ?? "0",
    }));
  });

const ADJ_CATEGORIES = ["opening_deposit", "correction", "dispute_credit", "fee_reversal", "interest_credit", "fee_charge", "chargeback", "other"] as const;

export const adminManualAdjustment = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    accountId: id, direction: z.enum(["credit", "debit"]), category: z.enum(ADJ_CATEGORIES),
    amount: z.string().trim().regex(/^\d{1,13}(\.\d{1,2})?$/, "Enter an amount like 100 or 100.50."),
    reason: z.string().trim().min(10, "Give an internal reason of at least 10 characters.").max(500),
    memo: z.string().trim().min(3, "Enter the statement description.").max(80),
    notifyCustomer: z.boolean(), idempotencyKey: z.string().min(8).max(100),
  }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, notify, newReference, balancesFor, checkLowBalance } = await lib();
    const { formatMinor } = await import("./money");
    const [w, f = ""] = data.amount.split(".");
    const amount = BigInt(w ?? "0") * 100n + BigInt((f + "00").slice(0, 2));
    if (amount <= 0n) return { ok: false as const, error: "Amount must be greater than zero." };
    return sql.begin(async (tx: any) => {
      const key = "adj:" + data.idempotencyKey;
      const dup = (await tx`select reference from bank_ledger_txns where idempotency_key = ${key}`)[0];
      if (dup) return { ok: true as const, reference: dup.reference as string, duplicate: true };
      const acc = (await tx`select id, user_id, currency, status, account_number from bank_accounts where id = ${data.accountId} for update`)[0];
      if (!acc) return { ok: false as const, error: "Account not found." };
      if (acc.status === "closed") return { ok: false as const, error: "Account is closed." };
      if (data.direction === "debit") {
        const bal = (await balancesFor(tx, [acc.id])).get(acc.id)!;
        if (BigInt(bal.available) < amount) return { ok: false as const, error: `Debit exceeds the available balance (${formatMinor(bal.available, acc.currency)}).` };
      }
      const signed = data.direction === "credit" ? amount : -amount;
      const reference = newReference("ADJ");
      const txn = (await tx`insert into bank_ledger_txns (idempotency_key, reference, description, status, created_by, posted_at, kind, ${data.direction === "credit" ? tx`to_account_id` : tx`from_account_id`}, amount_minor, currency, memo, details)
        values (${key}, ${reference}, ${data.memo}, 'posted', ${actor}, now(), 'adjustment', ${acc.id}, ${amount.toString()}, ${acc.currency}, ${data.reason}, ${tx.json({ category: data.category, direction: data.direction })}) returning id`)[0];
      await tx`insert into bank_ledger_entries (txn_id, account_id, currency, amount_minor) values (${txn.id}, ${acc.id}, ${acc.currency}, ${signed.toString()})`;
      await tx`insert into bank_ledger_entries (txn_id, system_account, currency, amount_minor) values (${txn.id}, ${"SYSTEM:ADJUSTMENTS:" + acc.currency}, ${acc.currency}, ${(-signed).toString()})`;
      await tx`insert into bank_adjustments (account_id, txn_id, reference, direction, category, amount_minor, currency, reason, customer_memo, notify_customer, created_by)
        values (${acc.id}, ${txn.id}, ${reference}, ${data.direction}, ${data.category}, ${amount.toString()}, ${acc.currency}, ${data.reason}, ${data.memo}, ${data.notifyCustomer}, ${actor})`;
      if (data.notifyCustomer) {
        await notify(tx, acc.user_id, "adjustment", data.direction === "credit" ? "Account credited" : "Account debited",
          `${data.direction === "credit" ? "A credit" : "A debit"} of ${formatMinor(amount.toString(), acc.currency)} was posted to account ••••${String(acc.account_number).slice(-4)}: ${data.memo} (ref ${reference}).`);
      }
      await audit(tx, acc.user_id, actor, "ledger.manual_adjustment", { txnId: Number(txn.id), accountId: acc.id, direction: data.direction, category: data.category, amount: amount.toString(), reason: data.reason });
      await checkLowBalance(tx, acc.id);
      return { ok: true as const, reference, duplicate: false };
    });
  });

export const adminListAdjustments = createServerFn({ method: "GET" }).handler(async () => {
  await adminId();
  const sql = await db();
  const rows = await sql`select j.*, j.amount_minor::text as amt, a.account_number, a.nickname, u.full_name, s.full_name as staff
    from bank_adjustments j join bank_accounts a on a.id = j.account_id join bank_users u on u.id = a.user_id left join bank_users s on s.id = j.created_by
    order by j.created_at desc limit 200`;
  return rows.map((r: any) => ({
    id: Number(r.id), reference: (r.reference ?? "") as string, direction: r.direction as string, category: r.category as string, amount: r.amt as string,
    currency: r.currency as string, reason: r.reason as string, memo: r.customer_memo as string, customer: r.full_name as string,
    account: `${r.nickname} ••••${String(r.account_number).slice(-4)}`, staff: (r.staff ?? "—") as string, date: new Date(r.created_at).toISOString(),
  }));
});

/** Standard amortized monthly payment, in minor units. */
function monthlyPayment(principalMinor: bigint, aprPct: number, months: number): bigint {
  const p = Number(principalMinor);
  const r = aprPct / 100 / 12;
  const pmt = r === 0 ? p / months : (p * r) / (1 - Math.pow(1 + r, -months));
  return BigInt(Math.ceil(pmt));
}

export const adminDecideLoan = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    id, decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(500).optional(),
    apr: z.number().min(0).max(36, "APR cannot exceed 36%.").optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, notify, newReference } = await lib();
    const { formatMinor } = await import("./money");
    return sql.begin(async (tx: any) => {
      const l = (await tx`select id, user_id, status, loan_type, amount_minor::text as amt, currency, term_months from bank_loan_requests where id = ${data.id} for update`)[0];
      if (!l) return { ok: false as const, error: "Loan request not found." };
      if (l.status !== "pending") return { ok: false as const, error: "This request was already decided." };
      if (data.decision === "rejected") {
        await tx`update bank_loan_requests set status = 'rejected', admin_note = ${data.note || null}, decided_at = now(), updated_at = now() where id = ${l.id}`;
        await notify(tx, l.user_id, "loan", "Loan request declined", `Your ${l.loan_type} loan request was declined.${data.note ? " Note: " + data.note : ""}`);
        await audit(tx, l.user_id, actor, "loan.rejected", { loanId: l.id });
        return { ok: true as const };
      }
      if (data.apr == null) return { ok: false as const, error: "Enter the APR to approve this loan." };
      const acct = (await tx`select id, account_number from bank_accounts where user_id = ${l.user_id} and currency = ${l.currency} and status = 'active' order by id limit 1 for update`)[0];
      if (!acct) return { ok: false as const, error: `Customer has no active ${l.currency} account to receive the funds.` };
      const amount = BigInt(l.amt);
      const pmt = monthlyPayment(amount, data.apr, Number(l.term_months));
      const reference = newReference("LON");
      const txn = (await tx`insert into bank_ledger_txns (idempotency_key, reference, description, status, created_by, posted_at, kind, to_account_id, amount_minor, currency)
        values (${"loan:" + l.id}, ${reference}, ${`Loan disbursement · ${l.loan_type} loan #${l.id}`}, 'posted', ${actor}, now(), 'loan_disbursement', ${acct.id}, ${amount.toString()}, ${l.currency}) returning id`)[0];
      await tx`insert into bank_ledger_entries (txn_id, account_id, currency, amount_minor) values (${txn.id}, ${acct.id}, ${l.currency}, ${amount.toString()})`;
      await tx`insert into bank_ledger_entries (txn_id, system_account, currency, amount_minor) values (${txn.id}, ${"SYSTEM:LOANS:" + l.currency}, ${l.currency}, ${(-amount).toString()})`;
      await tx`update bank_loan_requests set status = 'approved', admin_note = ${data.note || null}, apr_bps = ${Math.round(data.apr * 100)},
        monthly_payment_minor = ${pmt.toString()}, disbursed_account_id = ${acct.id}, disbursed_txn_id = ${txn.id}, decided_at = now(), updated_at = now(),
        outstanding_minor = ${amount.toString()}, last_accrual_at = now(), first_due_date = (now() + interval '1 month')::date where id = ${l.id}`;
      await notify(tx, l.user_id, "loan", "Loan approved and funded",
        `Your ${l.loan_type} loan of ${formatMinor(amount.toString(), l.currency)} was approved at ${data.apr}% APR and deposited to account ••••${String(acct.account_number).slice(-4)}. Monthly payment: ${formatMinor(pmt.toString(), l.currency)} for ${l.term_months} months (ref ${reference}).${data.note ? " Note: " + data.note : ""}`);
      await audit(tx, l.user_id, actor, "loan.approved", { loanId: l.id, apr: data.apr, txnId: Number(txn.id) });
      return { ok: true as const };
    });
  });

export const adminListTaxRefunds = createServerFn({ method: "GET" }).handler(async () => {
  await adminId();
  const sql = await db();
  const rows = await sql`select r.*, r.amount_minor::text as amt, r.agi_minor::text as agi, r.withheld_minor::text as wh, r.approved_minor::text as appr,
      u.full_name, u.email, a.account_number
    from bank_tax_refunds r join bank_users u on u.id = r.user_id left join bank_accounts a on a.id = r.deposit_account_id
    order by (r.status = 'pending') desc, r.created_at desc limit 200`;
  return rows.map((r: any) => ({
    id: Number(r.id), customer: r.full_name as string, email: r.email as string, year: Number(r.tax_year), filing: r.filing_status as string,
    form: r.irs_form as string, last4: r.ssn_last4 as string, amount: r.amt as string, agi: (r.agi ?? null) as string | null, withheld: (r.wh ?? null) as string | null,
    approved: (r.appr ?? null) as string | null, account: r.account_number ? `••••${String(r.account_number).slice(-4)}` : "—",
    status: r.status as string, note: (r.admin_note ?? "") as string, createdAt: new Date(r.created_at).toISOString(),
  })) as Array<{ id: number; customer: string; email: string; year: number; filing: string; form: string; last4: string; amount: string; agi: string | null; withheld: string | null; approved: string | null; account: string; status: string; note: string; createdAt: string }>;
});

export const adminDecideTaxRefund = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    id, decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(500).optional(),
    amount: z.number().positive().max(1_000_000).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, notify, newReference } = await lib();
    const { formatMinor } = await import("./money");
    return sql.begin(async (tx: any) => {
      const r = (await tx`select id, user_id, status, tax_year, amount_minor::text as amt, deposit_account_id from bank_tax_refunds where id = ${data.id} for update`)[0];
      if (!r) return { ok: false as const, error: "Refund request not found." };
      if (r.status !== "pending") return { ok: false as const, error: "This request was already decided." };
      if (data.decision === "rejected") {
        await tx`update bank_tax_refunds set status = 'rejected', admin_note = ${data.note || null}, decided_at = now(), updated_at = now() where id = ${r.id}`;
        await notify(tx, r.user_id, "tax_refund", "Tax refund declined", `Your ${r.tax_year} IRS tax refund request was declined.${data.note ? " Reason: " + data.note : ""}`);
        await audit(tx, r.user_id, actor, "tax_refund.rejected", { id: r.id });
        return { ok: true as const };
      }
      const acct = (await tx`select id, account_number from bank_accounts where id = ${r.deposit_account_id} and user_id = ${r.user_id} and currency = 'USD' and status = 'active' for update`)[0];
      if (!acct) return { ok: false as const, error: "The deposit account is no longer active." };
      const amount = data.amount != null ? BigInt(Math.round(data.amount * 100)) : BigInt(r.amt);
      const reference = newReference("IRS");
      const txn = (await tx`insert into bank_ledger_txns (idempotency_key, reference, description, status, created_by, posted_at, kind, to_account_id, amount_minor, currency)
        values (${"taxref:" + r.id}, ${reference}, ${`IRS TREAS 310 TAX REF · ${r.tax_year}`}, 'posted', ${actor}, now(), 'tax_refund', ${acct.id}, ${amount.toString()}, 'USD') returning id`)[0];
      await tx`insert into bank_ledger_entries (txn_id, account_id, currency, amount_minor) values (${txn.id}, ${acct.id}, 'USD', ${amount.toString()})`;
      await tx`insert into bank_ledger_entries (txn_id, system_account, currency, amount_minor) values (${txn.id}, 'SYSTEM:IRS:USD', 'USD', ${(-amount).toString()})`;
      await tx`update bank_tax_refunds set status = 'approved', approved_minor = ${amount.toString()}, deposit_txn_id = ${txn.id}, admin_note = ${data.note || null}, decided_at = now(), updated_at = now() where id = ${r.id}`;
      const adjusted = amount.toString() !== r.amt;
      await notify(tx, r.user_id, "tax_refund", "Tax refund deposited",
        `Your ${r.tax_year} federal tax refund of ${formatMinor(amount.toString(), "USD")} was deposited to account ••••${String(acct.account_number).slice(-4)} (ref ${reference}).${adjusted ? " The amount was adjusted from your estimate." : ""}${data.note ? " Note: " + data.note : ""}`);
      await audit(tx, r.user_id, actor, "tax_refund.approved", { id: r.id, amount: amount.toString(), txnId: Number(txn.id) });
      return { ok: true as const };
    });
  });

export const adminListCards = createServerFn({ method: "GET" }).handler(async () => {
  await adminId();
  const sql = await db();
  const rows = await sql`select c.id, c.brand, c.card_number, c.exp_month, c.exp_year, c.holder_name, c.currency, c.status, c.created_at, u.full_name, u.email
    from bank_cards c join bank_users u on u.id = c.user_id where c.status <> 'deleted' order by c.created_at desc limit 200`;
  return rows.map((r: any) => ({
    id: r.id as number, brand: r.brand as string, last4: String(r.card_number).slice(-4), exp: `${String(r.exp_month).padStart(2, "0")}/${String(r.exp_year).slice(-2)}`,
    holder: r.holder_name as string, currency: r.currency as string, status: r.status as string, customer: r.full_name as string, email: r.email as string,
  })) as Array<{ id: number; brand: string; last4: string; exp: string; holder: string; currency: string; status: string; customer: string; email: string }>;
});

export const adminSetCardStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id, status: z.enum(["active", "frozen"]) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, notify } = await lib();
    return sql.begin(async (tx: any) => {
      const c = (await tx`update bank_cards set status = ${data.status} where id = ${data.id} and status <> 'deleted' returning user_id, card_number`)[0];
      if (!c) return { ok: false as const, error: "Card not found." };
      await notify(tx, c.user_id, "card", data.status === "frozen" ? "Card frozen" : "Card unfrozen", `Your card ending ${String(c.card_number).slice(-4)} is now ${data.status}.`);
      await audit(tx, c.user_id, actor, "card.status_changed", { cardId: data.id, to: data.status });
      return { ok: true as const };
    });
  });

export const adminSendNotification = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ userId: id.optional(), title: z.string().trim().min(2).max(100), body: z.string().trim().min(2).max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { notify } = await lib();
    return sql.begin(async (tx: any) => {
      const users = data.userId
        ? await tx`select id from bank_users where id = ${data.userId}`
        : await tx`select id from bank_users u where status = 'active' and not exists (select 1 from bank_user_roles r where r.user_id = u.id and r.role = 'admin')`;
      for (const u of users) await notify(tx, u.id, "message", data.title, data.body);
      void actor;
      return { ok: true as const, sent: users.length as number };
    });
  });

export const adminAuditLog = createServerFn({ method: "GET" }).handler(async () => {
  await adminId();
  const sql = await db();
  const rows = await sql`select * from bank_audit_log order by created_at desc limit 100`.catch(() => []);
  return (rows as any[]).map((r) => ({ id: Number(r.id), action: String(r.action ?? ""), userId: r.user_id as number, actorId: r.actor_id as number, meta: r.detail ? JSON.stringify(r.detail) : "", at: new Date(r.created_at).toISOString() }));
});

// ---------------- Customer management ----------------
const SAFE_USER = (r: any) => ({
  id: r.id as number, fullName: r.full_name as string, email: r.email as string, phone: (r.phone ?? "") as string,
  country: (r.country ?? "") as string, state: (r.state ?? "") as string, address: (r.address ?? "") as string,
  dateOfBirth: (r.date_of_birth ?? "") as string, accountType: (r.account_type ?? "") as string,
  emailVerified: !!r.email_verified, twoFactor: !!r.two_factor_enabled, kycStatus: r.kyc_status as string,
  status: r.status as string, createdAt: new Date(r.created_at).toISOString(),
});

export const adminSearchCustomers = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ q: z.string().trim().max(100).optional(), status: z.enum(["all", "active", "suspended"]).default("all"), kyc: z.string().max(30).default("all") }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const q = data.q ? `%${data.q.replace(/[%_\\]/g, "\\$&")}%` : null;
    const rows = await sql`select u.*,
        (select count(*) from bank_accounts a where a.user_id = u.id and a.status <> 'closed')::int as accounts,
        (select max(s.expires_at) from bank_sessions s where s.user_id = u.id) as last_seen
      from bank_users u
      where not exists (select 1 from bank_user_roles r where r.user_id = u.id and r.role = 'admin')
      ${q ? sql`and (u.full_name ilike ${q} or u.email ilike ${q} or u.phone ilike ${q} or u.id::text = ${data.q})` : sql``}
      ${data.status !== "all" ? sql`and u.status = ${data.status}` : sql``}
      ${data.kyc !== "all" ? sql`and u.kyc_status = ${data.kyc}` : sql``}
      order by u.created_at desc limit 500`;
    return rows.map((r: any) => ({ ...SAFE_USER(r), accounts: r.accounts as number, lastSeen: r.last_seen ? new Date(r.last_seen).toISOString() : null }));
  });

export const adminGetCustomer = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ userId: id }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const u = (await sql`select * from bank_users where id = ${data.userId}`)[0];
    if (!u) throw new Error("Customer not found");
    const stats = (await sql`select
        (select count(*) from bank_accounts where user_id = ${u.id} and status <> 'closed')::int as accounts,
        (select count(*) from bank_cards where user_id = ${u.id} and status <> 'deleted')::int as cards,
        (select count(*) from bank_beneficiaries where user_id = ${u.id})::int as beneficiaries,
        (select count(*) from bank_loan_requests where user_id = ${u.id})::int as loans,
        (select count(*) from bank_sessions where user_id = ${u.id} and expires_at > now())::int as sessions`)[0];
    const txns = await sql`select t.id, t.reference, t.description, t.status, t.created_at, t.posted_at, e.amount_minor::text as amount, e.currency, a.nickname
      from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id join bank_accounts a on a.id = e.account_id
      where a.user_id = ${u.id} order by t.created_at desc limit 100`;
    const activity = await sql`select l.id, l.action, l.detail, l.created_at, act.full_name as actor
      from bank_audit_log l left join bank_users act on act.id = l.actor_id where l.user_id = ${u.id} order by l.created_at desc limit 100`;
    const cards = await sql`select id, brand, card_number, status from bank_cards where user_id = ${u.id} and status <> 'deleted' order by created_at desc`;
    const loans = await sql`select id, loan_type, amount_minor::text as amount, currency, status, created_at from bank_loan_requests where user_id = ${u.id} order by created_at desc`;
    const bens = await sql`select id, name, dest_type, bank_name, account_identifier from bank_beneficiaries where user_id = ${u.id} order by name`;
    return {
      profile: SAFE_USER(u),
      stats: stats as { accounts: number; cards: number; beneficiaries: number; loans: number; sessions: number },
      transactions: txns.map((r: any) => ({ id: Number(r.id), reference: r.reference as string, description: r.description as string, status: r.status as string, date: new Date(r.posted_at ?? r.created_at).toISOString(), amount: r.amount as string, currency: r.currency as string, account: r.nickname as string })) as Array<{ id: number; reference: string; description: string; status: string; date: string; amount: string; currency: string; account: string }>,
      activity: activity.map((r: any) => ({ id: Number(r.id), action: r.action as string, detail: r.detail ? JSON.stringify(r.detail) : "", actor: (r.actor ?? "") as string, at: new Date(r.created_at).toISOString() })) as Array<{ id: number; action: string; detail: string; actor: string; at: string }>,
      cards: cards.map((r: any) => ({ id: r.id as number, brand: r.brand as string, last4: String(r.card_number).slice(-4), status: r.status as string })) as Array<{ id: number; brand: string; last4: string; status: string }>,
      loans: loans.map((r: any) => ({ id: r.id as number, type: r.loan_type as string, amount: r.amount as string, currency: r.currency as string, status: r.status as string, createdAt: new Date(r.created_at).toISOString() })) as Array<{ id: number; type: string; amount: string; currency: string; status: string; createdAt: string }>,
      beneficiaries: bens.map((r: any) => ({ id: r.id as number, name: r.name as string, type: r.dest_type as string, bank: (r.bank_name ?? "") as string, account: r.account_identifier as string })) as Array<{ id: number; name: string; type: string; bank: string; account: string }>,
    };
  });

export const adminUpdateCustomer = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    userId: id,
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(200),
    phone: z.string().trim().max(30),
    country: z.string().trim().max(100),
    state: z.string().trim().max(100),
    address: z.string().trim().max(300),
    dateOfBirth: z.string().trim().max(20),
    emailVerified: z.boolean(),
    twoFactor: z.boolean(),
  }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, notify } = await lib();
    try {
      return await sql.begin(async (tx: any) => {
        const upd = await tx`update bank_users set full_name = ${data.fullName}, email = ${data.email}, phone = ${data.phone}, country = ${data.country},
          state = ${data.state}, address = ${data.address}, date_of_birth = ${data.dateOfBirth}, email_verified = ${data.emailVerified},
          two_factor_enabled = ${data.twoFactor} where id = ${data.userId} returning id`;
        if (!upd[0]) return { ok: false as const, error: "Customer not found." };
        await notify(tx, data.userId, "profile", "Profile updated", "Your profile details were updated by our team.");
        await audit(tx, data.userId, actor, "admin.profile_updated", {});
        return { ok: true as const };
      });
    } catch (e: any) {
      if (e?.code === "23505") return { ok: false as const, error: "Another customer already uses that email." };
      throw e;
    }
  });

export const adminCustomerControl = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    userId: id,
    action: z.enum(["suspend", "reactivate", "freeze_all", "unfreeze_all", "sign_out", "reset_pin"]),
    reason: z.string().trim().max(300).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, notify } = await lib();
    return sql.begin(async (tx: any) => {
      const u = (await tx`select id, status from bank_users u where id = ${data.userId}
        and not exists (select 1 from bank_user_roles r where r.user_id = u.id and r.role = 'admin') for update`)[0];
      if (!u) return { ok: false as const, error: "Customer not found." };
      const why = data.reason ? ` Reason: ${data.reason}` : "";
      switch (data.action) {
        case "suspend":
          // Suspension blocks sign-in and every banking feature: profile, accounts and cards are all locked.
          await tx`update bank_users set status = 'suspended' where id = ${u.id}`;
          await tx`update bank_accounts set status = 'frozen' where user_id = ${u.id} and status = 'active'`;
          await tx`update bank_cards set status = 'frozen' where user_id = ${u.id} and status = 'active'`;
          await tx`delete from bank_sessions where user_id = ${u.id}`;
          await notify(tx, u.id, "account_status", "Profile suspended", `Your online banking has been suspended.${why}`);
          break;
        case "reactivate":
          await tx`update bank_users set status = 'active' where id = ${u.id}`;
          await tx`update bank_accounts set status = 'active' where user_id = ${u.id} and status = 'frozen'`;
          await tx`update bank_cards set status = 'active' where user_id = ${u.id} and status = 'frozen'`;
          await notify(tx, u.id, "account_status", "Profile reactivated", "Your online banking is active again.");
          break;
        case "freeze_all":
          await tx`update bank_accounts set status = 'frozen' where user_id = ${u.id} and status in ('active','restricted')`;
          await tx`update bank_cards set status = 'frozen' where user_id = ${u.id} and status = 'active'`;
          await notify(tx, u.id, "account_status", "Accounts frozen", `All your accounts and cards have been frozen.${why}`);
          break;
        case "unfreeze_all":
          await tx`update bank_accounts set status = 'active' where user_id = ${u.id} and status = 'frozen'`;
          await tx`update bank_cards set status = 'active' where user_id = ${u.id} and status = 'frozen'`;
          await notify(tx, u.id, "account_status", "Accounts unfrozen", "Your accounts and cards are active again.");
          break;
        case "sign_out":
          await tx`delete from bank_sessions where user_id = ${u.id}`;
          break;
        case "reset_pin":
          await tx`update bank_users set pin_hash = null where id = ${u.id}`;
          await notify(tx, u.id, "security", "Transaction PIN reset", "Your transaction PIN was reset. Set a new one in Settings.");
          break;
      }
      await audit(tx, u.id, actor, `admin.${data.action}`, data.reason ? { reason: data.reason } : {});
      return { ok: true as const };
    });
  });

// ---------------- Support tickets ----------------
export const adminListTickets = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ status: z.enum(["all", "open", "answered", "closed"]).default("all") }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const rows = await sql`select t.id, t.subject, t.category, t.status, t.updated_at, u.id as user_id, u.full_name, u.email,
        (select count(*) from bank_ticket_messages m where m.ticket_id = t.id)::int as messages
      from bank_support_tickets t join bank_users u on u.id = t.user_id
      ${data.status !== "all" ? sql`where t.status = ${data.status}` : sql``}
      order by (t.status = 'open') desc, t.updated_at desc limit 300`;
    return rows.map((r: any) => ({ id: Number(r.id), subject: r.subject as string, category: r.category as string, status: r.status as string, messages: r.messages as number, updatedAt: new Date(r.updated_at).toISOString(), userId: Number(r.user_id), customer: r.full_name as string, email: r.email as string }));
  });

export const adminGetTicket = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const t = (await sql`select t.*, u.full_name, u.email from bank_support_tickets t join bank_users u on u.id = t.user_id where t.id = ${data.id}`)[0];
    if (!t) throw new Error("Ticket not found");
    const msgs = await sql`select m.id, m.from_staff, m.body, m.created_at, a.full_name as author from bank_ticket_messages m left join bank_users a on a.id = m.author_id where m.ticket_id = ${t.id} order by m.created_at`;
    return {
      id: Number(t.id), subject: t.subject as string, category: t.category as string, status: t.status as string, createdAt: new Date(t.created_at).toISOString(),
      userId: Number(t.user_id), customer: t.full_name as string, email: t.email as string,
      messages: msgs.map((m: any) => ({ id: Number(m.id), staff: !!m.from_staff, author: (m.author ?? "") as string, body: m.body as string, at: new Date(m.created_at).toISOString() })) as Array<{ id: number; staff: boolean; author: string; body: string; at: string }>,
    };
  });

export const adminReplyTicket = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id, body: z.string().trim().min(2, "Write a reply.").max(4000), close: z.boolean().default(false) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, notify } = await lib();
    return sql.begin(async (tx: any) => {
      const t = (await tx`select id, user_id, subject from bank_support_tickets where id = ${data.id} for update`)[0];
      if (!t) return { ok: false as const, error: "Ticket not found." };
      await tx`insert into bank_ticket_messages (ticket_id, author_id, from_staff, body) values (${t.id}, ${actor}, true, ${data.body})`;
      await tx`update bank_support_tickets set status = ${data.close ? "closed" : "answered"}, updated_at = now() where id = ${t.id}`;
      await notify(tx, t.user_id, "support", "Support replied", `We replied to ticket #${t.id} "${t.subject}".`);
      await audit(tx, t.user_id, actor, "support.replied", { ticketId: t.id, closed: data.close });
      return { ok: true as const };
    });
  });

export const adminSetTicketStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id, status: z.enum(["open", "closed"]) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit } = await lib();
    return sql.begin(async (tx: any) => {
      const t = (await tx`update bank_support_tickets set status = ${data.status}, updated_at = now() where id = ${data.id} returning user_id`)[0];
      if (!t) return { ok: false as const, error: "Ticket not found." };
      await audit(tx, t.user_id, actor, `support.${data.status === "closed" ? "closed" : "reopened"}`, { ticketId: data.id });
      return { ok: true as const };
    });
  });

const HOLD_CATEGORIES = ["legal", "fraud_review", "dispute", "compliance", "deposit_verification", "collateral", "other"] as const;

export const adminListHolds = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ status: z.enum(["active", "released", "expired", "all"]), q: z.string().trim().max(100).optional() }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const q = data.q ? `%${data.q.replace(/[%_\\]/g, "\\$&")}%` : null;
    const expired = sql`(h.status = 'active' and h.expires_at is not null and h.expires_at <= now())`;
    const rows = await sql`select h.*, h.amount_minor::text as amt, a.account_number, a.nickname, a.currency, u.full_name, u.email,
        c.full_name as placed_by, r.full_name as released_by_name, ${expired} as is_expired
      from bank_holds h join bank_accounts a on a.id = h.account_id join bank_users u on u.id = a.user_id
      left join bank_users c on c.id = h.created_by left join bank_users r on r.id = h.released_by
      where 1=1
      ${data.status === "active" ? sql`and h.status = 'active' and not ${expired}` : data.status === "released" ? sql`and h.status = 'released'` : data.status === "expired" ? sql`and ${expired}` : sql``}
      ${q ? sql`and (u.full_name ilike ${q} or u.email ilike ${q} or a.account_number ilike ${q} or h.reason ilike ${q})` : sql``}
      order by h.created_at desc limit 300`;
    const totals = await sql`select a.currency, count(*)::int as n, sum(h.amount_minor)::text as total from bank_holds h join bank_accounts a on a.id = h.account_id
      where h.status = 'active' and (h.expires_at is null or h.expires_at > now()) group by a.currency order by a.currency`;
    return {
      totals: totals.map((t: any) => ({ currency: t.currency as string, count: Number(t.n), total: t.total as string })) as Array<{ currency: string; count: number; total: string }>,
      rows: rows.map((r: any) => ({
        id: Number(r.id), amount: r.amt as string, currency: r.currency as string, reason: r.reason as string, category: r.category as string,
        customerNote: (r.customer_note ?? "") as string, status: (r.is_expired ? "expired" : r.status) as string,
        customer: r.full_name as string, email: r.email as string, account: `${r.nickname} ••••${String(r.account_number).slice(-4)}`,
        placedBy: (r.placed_by ?? "—") as string, releasedBy: (r.released_by_name ?? "") as string, releaseReason: (r.release_reason ?? "") as string,
        createdAt: new Date(r.created_at).toISOString(), expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
        releasedAt: r.released_at ? new Date(r.released_at).toISOString() : null,
      })) as Array<{ id: number; amount: string; currency: string; reason: string; category: string; customerNote: string; status: string; customer: string; email: string; account: string; placedBy: string; releasedBy: string; releaseReason: string; createdAt: string; expiresAt: string | null; releasedAt: string | null }>,
    };
  });

export const adminCreateHold = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    accountId: id, category: z.enum(HOLD_CATEGORIES),
    amount: z.string().trim().regex(/^\d{1,13}(\.\d{1,2})?$/, "Enter an amount like 100 or 100.50."),
    reason: z.string().trim().min(10, "Give an internal reason of at least 10 characters.").max(500),
    customerNote: z.string().trim().max(200).optional(), expiresInDays: z.number().int().min(1).max(365).optional(),
    notifyCustomer: z.boolean(),
  }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, notify, balancesFor, checkLowBalance } = await lib();
    const { formatMinor } = await import("./money");
    const [w, f = ""] = data.amount.split(".");
    const amount = BigInt(w ?? "0") * 100n + BigInt((f + "00").slice(0, 2));
    if (amount <= 0n) return { ok: false as const, error: "Amount must be greater than zero." };
    return sql.begin(async (tx: any) => {
      const a = (await tx`select id, user_id, currency, status, account_number from bank_accounts where id = ${data.accountId} for update`)[0];
      if (!a) return { ok: false as const, error: "Account not found." };
      if (a.status === "closed") return { ok: false as const, error: "Account is closed." };
      const before = (await balancesFor(tx, [a.id])).get(a.id)!;
      const h = (await tx`insert into bank_holds (account_id, amount_minor, reason, created_by, category, customer_note, expires_at)
        values (${a.id}, ${amount.toString()}, ${data.reason}, ${actor}, ${data.category}, ${data.customerNote || null},
          ${data.expiresInDays ? tx`now() + make_interval(days => ${data.expiresInDays})` : null}) returning id`)[0];
      if (data.notifyCustomer) {
        await notify(tx, a.user_id, "hold", "Funds placed on hold",
          `${formatMinor(amount.toString(), a.currency)} on account ••••${String(a.account_number).slice(-4)} has been placed on hold${data.customerNote ? ": " + data.customerNote : "."}${data.expiresInDays ? ` It is scheduled to release automatically in ${data.expiresInDays} day(s).` : ""} Contact support with any questions.`);
      }
      await audit(tx, a.user_id, actor, "hold.placed", { accountId: a.id, holdId: h.id, amount: amount.toString(), category: data.category, reason: data.reason, expiresInDays: data.expiresInDays ?? null });
      await checkLowBalance(tx, a.id);
      const exceeds = BigInt(before.available) < amount;
      return { ok: true as const, warning: exceeds ? `Hold exceeds the available balance (${formatMinor(before.available, a.currency)}); the account will show a negative available balance.` : null };
    });
  });

export const adminReleaseHoldWithReason = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ holdId: id, reason: z.string().trim().min(3, "Enter a release reason.").max(300), notifyCustomer: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, notify, checkLowBalance } = await lib();
    const { formatMinor } = await import("./money");
    return sql.begin(async (tx: any) => {
      const h = (await tx`update bank_holds set status = 'released', released_at = now(), released_by = ${actor}, release_reason = ${data.reason}
        where id = ${data.holdId} and status = 'active' returning account_id, amount_minor::text as amt`)[0];
      if (!h) return { ok: false as const, error: "Hold is no longer active." };
      const a = (await tx`select user_id, currency, account_number from bank_accounts where id = ${h.account_id}`)[0];
      if (data.notifyCustomer) await notify(tx, a.user_id, "hold", "Hold released", `The hold of ${formatMinor(h.amt, a.currency)} on account ••••${String(a.account_number).slice(-4)} has been released. The funds are available again.`);
      await audit(tx, a.user_id, actor, "hold.released", { holdId: data.holdId, reason: data.reason });
      await checkLowBalance(tx, h.account_id);
      return { ok: true as const };
    });
  });

// ---------------- Delete customer ----------------
// Customers with no money history are removed completely. Customers with ledger history are erased
// (personal data wiped, accounts closed, sign-in disabled) so the immutable ledger stays intact.
export const adminDeleteCustomer = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ userId: id, reason: z.string().trim().max(300).optional() }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, balancesFor } = await lib();
    try {
      return await sql.begin(async (tx: any) => {
        const u = (await tx`select id, email from bank_users u where id = ${data.userId}
          and not exists (select 1 from bank_user_roles r where r.user_id = u.id and r.role = 'admin') for update`)[0];
        if (!u) return { ok: false as const, error: "Customer not found (staff can't be deleted here)." };
        const accs = await tx`select id from bank_accounts where user_id = ${u.id} for update`;
        const bal = await balancesFor(tx, accs.map((a: any) => a.id));
        for (const b of bal.values()) {
          if (BigInt(b.current) !== 0n || BigInt(b.held) !== 0n || BigInt(b.pendingIn) !== 0n || BigInt(b.pendingOut) !== 0n)
            return { ok: false as const, error: "This customer still has money, holds or pending transfers. Settle and empty every account first." };
        }
        const openLoan = (await tx`select 1 from bank_loan_requests where user_id = ${u.id} and (status = 'pending' or (status = 'approved' and coalesce(outstanding_minor,0) > 0))`)[0];
        if (openLoan) return { ok: false as const, error: "This customer has an unpaid or pending loan." };
        try {
          await tx.savepoint(async (sp: any) => {
            await sp`delete from bank_accounts where user_id = ${u.id}`;
            await sp`delete from bank_users where id = ${u.id}`;
          });
          await audit(tx, null, actor, "customer.deleted", { userId: u.id, mode: "removed", reason: data.reason });
          return { ok: true as const, mode: "removed" as const };
        } catch (e: any) {
          if (!["23503", "23001"].includes(e?.code)) throw e; // history references the customer → erase instead
        }
        const scrambled = "!deleted:" + crypto.randomUUID();
        await tx`update bank_users set full_name = 'Deleted customer', email = ${`deleted-${u.id}@deleted.invalid`}, password_hash = ${scrambled},
          pin_hash = null, phone = null, address = null, date_of_birth = null, country = null, state = null, avatar_data = null, avatar_mime = null,
          verify_token = null, reset_token = null, reset_expires = null, two_factor_enabled = false, status = 'suspended' where id = ${u.id}`;
        await tx`update bank_accounts set status = 'closed' where user_id = ${u.id}`;
        await tx`update bank_cards set status = 'deleted' where user_id = ${u.id}`;
        await tx`delete from bank_sessions where user_id = ${u.id}`;
        await tx`update bank_standing_orders set status = 'cancelled' where user_id = ${u.id} and status in ('active','paused')`;
        await audit(tx, u.id, actor, "customer.deleted", { userId: u.id, mode: "erased", reason: data.reason });
        return { ok: true as const, mode: "erased" as const };
      });
    } catch (e) {
      console.error("adminDeleteCustomer", e);
      return { ok: false as const, error: "Could not delete this customer. Please try again." };
    }
  });

/** Admin signs in as a customer (session replaces the admin's own; audited). */
export const adminLoginAsCustomer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ userId: id }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const u = (await sql`select id, status from bank_users where id = ${data.userId}`)[0];
    if (!u) return { ok: false as const, error: "Customer not found." };
    const { randomToken, SESSION_COOKIE } = await import("./session.server");
    const { setCookie } = await import("@tanstack/react-start/server");
    const { audit } = await lib();
    const token = randomToken();
    await sql.begin(async (tx: any) => {
      await tx`insert into bank_sessions (token, user_id, expires_at, ip, user_agent)
        values (${token}, ${data.userId}, now() + interval '2 hours', null, ${"admin-login-as:" + actor})`;
      await audit(tx, data.userId, actor, "admin.login_as_customer", {});
    });
    setCookie(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "none", partitioned: true, path: "/", maxAge: 60 * 60 * 2 });
    return { ok: true as const };
  });

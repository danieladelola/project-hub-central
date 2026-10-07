import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "./db.server";
import { formatMinor } from "./money";

const CURRENCY = z.enum(["USD"]);
const OPEN_CURRENCY = z.enum(["USD"]);
const id = z.number().int().positive();

async function uid() {
  const { requireUserId } = await import("./session.server");
  return requireUserId();
}
async function kycUid() {
  const { requireVerifiedUserId } = await import("./session.server");
  return requireVerifiedUserId();
}
async function lib() {
  return import("./banking.server");
}
function fail(error: string) {
  return { ok: false as const, error };
}

async function verifyPin(userId: number, pin: string) {
  const sql = await db();
  const r = (await sql`select pin_hash from bank_users where id = ${userId}`)[0];
  return !!r?.pin_hash && (await bcrypt.compare(pin, r.pin_hash));
}
async function verifyPassword(userId: number, password: string) {
  const sql = await db();
  const r = (await sql`select password_hash from bank_users where id = ${userId}`)[0];
  return !!r && (await bcrypt.compare(password, r.password_hash));
}

type TxnRow = {
  id: number; accountId: number; accountName: string; currency: string; amount: string;
  description: string; reference: string; status: string; date: string;
};
function mapTxn(r: any): TxnRow {
  return {
    id: Number(r.entry_id), accountId: r.account_id, accountName: r.nickname, currency: r.currency,
    amount: String(r.amount), description: r.description, reference: r.reference, status: r.status,
    date: new Date(r.posted_at ?? r.created_at).toISOString(),
  };
}

type AccRow = { id: number; accountNumber: string; holderName: string; nickname: string; type: string; currency: string; status: string; masked: string; openedAt: string; lowAlert: boolean; threshold: string; current: string; held: string; available: string; pendingIn: string; pendingOut: string };
async function accountsWithBalances(sql: any, userId: number): Promise<AccRow[]> {
  const { balancesFor, mask } = await lib();
  const holderName = ((await sql`select full_name from bank_users where id = ${userId}`)[0]?.full_name as string) ?? "";
  const rows = await sql`select id, account_number, nickname, account_type, currency, status, opened_at, low_alert_active,
      low_balance_threshold::text as threshold
    from bank_accounts where user_id = ${userId} order by (status = 'closed'), opened_at`;
  const bal = await balancesFor(sql, rows.map((r: any) => r.id));
  return rows.map((r: any) => ({
    id: r.id as number, accountNumber: r.account_number as string, holderName, nickname: r.nickname as string, type: r.account_type as string, currency: r.currency as string,
    status: r.status as string, masked: mask(r.account_number), openedAt: new Date(r.opened_at).toISOString(),
    lowAlert: r.low_alert_active as boolean, threshold: r.threshold as string, ...bal.get(r.id)!,
  }));
}

// ---------------- Dashboard ----------------
export const getUnreadCount = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await uid();
  const sql = await db();
  const row = (await sql`select count(*)::int as n from bank_notifications where user_id = ${userId} and read_at is null`)[0];
  return { unread: row.n as number };
});

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await uid();
  const sql = await db();
  try { await (await import("./standing-orders.server")).processDueStandingOrders(sql); } catch (e) { console.error("standing orders", e); }
  const user = (await sql`select full_name, kyc_status, status from bank_users where id = ${userId}`)[0];
  const accounts = await accountsWithBalances(sql, userId);
  const totals: Record<string, { current: bigint; available: bigint }> = {};
  for (const a of accounts) {
    if (a.status === "closed") continue;
    const t = (totals[a.currency] ??= { current: 0n, available: 0n });
    t.current += BigInt(a.current);
    t.available += BigInt(a.available);
  }
  const recent = await sql`select e.id as entry_id, e.account_id, a.nickname, e.currency, e.amount_minor::text as amount,
      t.description, t.reference, t.status, t.posted_at, t.created_at
    from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id join bank_accounts a on a.id = e.account_id
    where a.user_id = ${userId} and t.status <> 'cancelled'
    order by coalesce(t.posted_at, t.created_at) desc, e.id desc limit 10`;
  const monthly = await sql`select e.currency,
      coalesce(sum(e.amount_minor) filter (where e.amount_minor > 0), 0)::text as money_in,
      coalesce(sum(-e.amount_minor) filter (where e.amount_minor < 0), 0)::text as money_out
    from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id join bank_accounts a on a.id = e.account_id
    where a.user_id = ${userId} and t.status = 'posted'
      and t.posted_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
    group by e.currency order by e.currency`;
  const notes = await sql`select id, kind, title, body, created_at from bank_notifications
    where user_id = ${userId} and read_at is null order by created_at desc limit 5`;
  const unread = (await sql`select count(*)::int as n from bank_notifications where user_id = ${userId} and read_at is null`)[0].n;
  return {
    fullName: user.full_name as string,
    kycStatus: user.kyc_status as string,
    accounts,
    totals: Object.entries(totals).map(([currency, t]) => ({ currency, current: t.current.toString(), available: t.available.toString() })),
    recent: recent.map(mapTxn) as TxnRow[],
    monthly: monthly.map((m: any) => ({ currency: m.currency as string, moneyIn: m.money_in as string, moneyOut: m.money_out as string })) as Array<{ currency: string; moneyIn: string; moneyOut: string }>,
    notifications: notes.map((n: any) => ({ id: n.id as number, kind: n.kind as string, title: n.title as string, body: n.body as string, createdAt: new Date(n.created_at).toISOString() })) as Array<{ id: number; kind: string; title: string; body: string; createdAt: string }>,
    unread: unread as number,
  };
});

export const getCashflow = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]), currency: CURRENCY }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const unit = data.days === 365 ? "month" : "day";
    const rows = await sql`
      with buckets as (
        select generate_series(
          date_trunc(${unit}, (now() at time zone 'UTC') - make_interval(days => ${data.days - 1})),
          date_trunc(${unit}, now() at time zone 'UTC'),
          ${unit === "month" ? "1 month" : "1 day"}::interval) as b
      )
      select to_char(b.b, ${unit === "month" ? "Mon YY" : "DD Mon"}) as label,
        coalesce(sum(e.amount_minor) filter (where e.amount_minor > 0), 0)::text as money_in,
        coalesce(sum(-e.amount_minor) filter (where e.amount_minor < 0), 0)::text as money_out
      from buckets b
      left join bank_ledger_txns t on t.status = 'posted' and date_trunc(${unit}, t.posted_at at time zone 'UTC') = b.b
      left join bank_ledger_entries e on e.txn_id = t.id and e.currency = ${data.currency}
        and e.account_id in (select id from bank_accounts where user_id = ${userId})
      group by b.b order by b.b`;
    return rows.map((r: any) => ({ label: r.label as string, moneyIn: r.money_in as string, moneyOut: r.money_out as string })) as Array<{ label: string; moneyIn: string; moneyOut: string }>;
  });

// ---------------- Accounts ----------------
export const listAccounts = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await uid();
  const sql = await db();
  return accountsWithBalances(sql, userId);
});

async function eligibility(sql: any, userId: number) {
  const { MAX_OPEN_ACCOUNTS } = await lib();
  const u = (await sql`select status, email_verified,
      exists(select 1 from bank_user_roles r where r.user_id = ${userId} and r.role = 'admin') as is_admin
    from bank_users where id = ${userId}`)[0];
  const open = (await sql`select count(*)::int as n from bank_accounts where user_id = ${userId} and status <> 'closed'`)[0].n as number;
  let reason: string | null = null;
  if (u.status !== "active") reason = "Your profile is suspended. Please contact support.";
  else if (!u.email_verified && !u.is_admin) reason = "Confirm your email address before opening an account.";
  else if (open >= MAX_OPEN_ACCOUNTS) reason = `You can hold up to ${MAX_OPEN_ACCOUNTS} open accounts.`;
  return { eligible: !reason, reason, open, max: MAX_OPEN_ACCOUNTS };
}

export const getOpenEligibility = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await uid();
  return eligibility(await db(), userId);
});

export const openAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    nickname: z.string().trim().min(2, "Nickname must be at least 2 characters.").max(40),
    type: z.enum(["savings", "checking"]),
    currency: OPEN_CURRENCY.default("USD"),
    requestKey: z.string().min(8).max(100),
    pin: z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN."),
  }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    if (!(await verifyPin(userId, data.pin))) return fail("Incorrect PIN.");
    const { createAccount } = await lib();
    return sql.begin(async (tx: any) => {
      await tx`select id from bank_users where id = ${userId} for update`; // serialize concurrent opens per user
      const prior = (await tx`select id from bank_accounts where user_id = ${userId} and open_request_key = ${data.requestKey}`)[0];
      if (prior) return { ok: true as const, accountId: prior.id as number, duplicate: true };
      const e = await eligibility(tx, userId);
      if (!e.eligible) return fail(e.reason!);
      const accountId = await createAccount(tx, userId, userId, data);
      return { ok: true as const, accountId, duplicate: false };
    });
  });

async function ownedAccount(sql: any, userId: number, accountId: number) {
  const r = (await sql`select * from bank_accounts where id = ${accountId} and user_id = ${userId}`)[0];
  if (!r) throw new Error("Account not found");
  return r;
}

export const getAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const a = await ownedAccount(sql, userId, data.id);
    const { balancesFor } = await lib();
    const bal = (await balancesFor(sql, [a.id])).get(a.id)!;
    const holder = (await sql`select full_name from bank_users where id = ${userId}`)[0].full_name as string;
    const txns = await sql`select e.id as entry_id, e.account_id, ${a.nickname}::text as nickname, e.currency, e.amount_minor::text as amount,
        t.description, t.reference, t.status, t.posted_at, t.created_at
      from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id
      where e.account_id = ${a.id} and t.status <> 'cancelled'
      order by coalesce(t.posted_at, t.created_at) desc, e.id desc limit 25`;
    const holds = await sql`select id, amount_minor::text as amount, reason, created_at from bank_holds where account_id = ${a.id} and status = 'active' order by created_at desc`;
    return {
      id: a.id as number, holder, nickname: a.nickname as string, type: a.account_type as string, currency: a.currency as string,
      accountNumber: a.account_number as string, status: a.status as string, openedAt: new Date(a.opened_at).toISOString(),
      closedAt: a.closed_at ? new Date(a.closed_at).toISOString() : null, threshold: String(a.low_balance_threshold),
      ...bal,
      holds: holds.map((h: any) => ({ id: h.id as number, amount: h.amount as string, reason: h.reason as string, createdAt: new Date(h.created_at).toISOString() })) as Array<{ id: number; amount: string; reason: string; createdAt: string }>,
      transactions: txns.map(mapTxn),
    };
  });

const minorFromDecimal = z.string().trim().regex(/^\d{1,13}(\.\d{1,2})?$/, "Enter an amount like 100 or 100.50.")
  .transform((v) => { const [w, f = ""] = v.split("."); return BigInt(w!) * 100n + BigInt((f + "00").slice(0, 2)); });

export const updateAccountSettings = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id, nickname: z.string().trim().min(2).max(40), threshold: minorFromDecimal }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const a = await ownedAccount(sql, userId, data.id);
    if (a.status === "closed") return fail("Closed accounts cannot be changed.");
    const { audit, checkLowBalance } = await lib();
    await sql.begin(async (tx: any) => {
      await tx`update bank_accounts set nickname = ${data.nickname}, low_balance_threshold = ${data.threshold.toString()}, low_alert_active = false where id = ${a.id}`;
      await audit(tx, userId, userId, "account.settings_updated", { accountId: a.id });
      await checkLowBalance(tx, a.id);
    });
    return { ok: true as const };
  });

export const closeAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id, pin: z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN.") }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    if (!(await verifyPin(userId, data.pin))) return fail("Incorrect PIN.");
    const { balancesFor, audit, notify } = await lib();
    return sql.begin(async (tx: any) => {
      const a = (await tx`select * from bank_accounts where id = ${data.id} and user_id = ${userId} for update`)[0];
      if (!a) return fail("Account not found.");
      if (a.status === "closed") return fail("This account is already closed.");
      if (a.status === "frozen") return fail("Frozen accounts cannot be closed online. Please contact support.");
      const b = (await balancesFor(tx, [a.id])).get(a.id)!;
      if (b.current !== "0") return fail("The account balance must be zero before closing.");
      if (b.held !== "0") return fail("The account has active holds or pending debits.");
      if (b.pendingIn !== "0") return fail("The account has pending incoming transactions.");
      await tx`update bank_accounts set status = 'closed', closed_at = now() where id = ${a.id}`;
      await notify(tx, userId, "account_status", "Account closed", `Your account "${a.nickname}" has been closed.`);
      await audit(tx, userId, userId, "account.closed", { accountId: a.id });
      return { ok: true as const };
    });
  });

// ---------------- Statements ----------------
export const getStatement = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    accountId: id,
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).refine((v) => v.from <= v.to, "Start date must be before end date.").parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const a = await ownedAccount(sql, userId, data.accountId);
    const holder = (await sql`select full_name from bank_users where id = ${userId}`)[0].full_name as string;
    const start = `${data.from}T00:00:00Z`;
    const endExcl = new Date(Date.parse(`${data.to}T00:00:00Z`) + 86400000).toISOString();
    const opening = BigInt((await sql`select coalesce(sum(e.amount_minor), 0)::text as s
      from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id
      where e.account_id = ${a.id} and t.status = 'posted' and t.posted_at < ${start}`)[0].s);
    const rows = await sql`select e.id, e.amount_minor::text as amount, t.description, t.reference, t.posted_at
      from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id
      where e.account_id = ${a.id} and t.status = 'posted' and t.posted_at >= ${start} and t.posted_at < ${endExcl}
      order by t.posted_at, e.id`;
    let running = opening, debits = 0n, credits = 0n;
    type Line = { id: number; date: string; description: string; reference: string; debit: string; credit: string; balance: string };
    const lines: Line[] = rows.map((r: any) => {
      const amt = BigInt(r.amount);
      running += amt;
      if (amt < 0n) debits += -amt; else credits += amt;
      return {
        id: Number(r.id), date: new Date(r.posted_at).toISOString(), description: r.description as string, reference: r.reference as string,
        debit: amt < 0n ? (-amt).toString() : "", credit: amt > 0n ? amt.toString() : "", balance: running.toString(),
      };
    });
    const pending = await sql`select e.id, e.amount_minor::text as amount, t.description, t.reference, t.created_at
      from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id
      where e.account_id = ${a.id} and t.status = 'pending' order by t.created_at, e.id`;
    return {
      holder, nickname: a.nickname as string, type: a.account_type as string, currency: a.currency as string,
      accountNumber: a.account_number as string, from: data.from, to: data.to, timezone: "UTC",
      opening: opening.toString(), closing: running.toString(), totalDebits: debits.toString(), totalCredits: credits.toString(),
      lines,
      pending: pending.map((p: any) => ({ id: Number(p.id), date: new Date(p.created_at).toISOString(), description: p.description as string, reference: p.reference as string, amount: p.amount as string })) as Array<{ id: number; date: string; description: string; reference: string; amount: string }>,
      generatedAt: new Date().toISOString(),
    };
  });

export const emailStatement = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    filename: z.string().regex(/^[A-Za-z0-9_.-]{1,100}\.pdf$/),
    pdfBase64: z.string().min(100).max(4_000_000).regex(/^[A-Za-z0-9+/=]+$/),
    period: z.string().max(60),
  }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const u = (await sql`select full_name, email from bank_users where id = ${userId}`)[0];
    if (!Buffer.from(data.pdfBase64.slice(0, 8), "base64").toString("latin1").startsWith("%PDF")) return fail("Invalid statement file.");
    const { sendMail, simpleEmail } = await import("./mail.server");
    try {
      await sendMail({
        to: u.email, subject: "Your Universal Crest account statement",
        html: await simpleEmail("Your statement is attached", `Hi ${String(u.full_name).replace(/[<>&"]/g, "")}, your account statement for ${data.period.replace(/[<>&"]/g, "")} is attached as a PDF.`),
        attachments: [{ filename: data.filename, content: data.pdfBase64, mimeType: "application/pdf" }],
      });
    } catch (e) { console.error("statement email failed", e); return fail("We couldn't send the email right now. Please try again."); }
    return { ok: true as const, email: u.email as string };
  });

// ---------------- Beneficiaries ----------------
const benInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(2, "Enter the beneficiary name.").max(100),
  nickname: z.string().trim().max(40).optional().default(""),
  destType: z.enum(["internal", "local", "international"]),
  accountIdentifier: z.string().trim().min(4, "Enter the account number.").max(40).regex(/^[A-Za-z0-9 -]+$/, "Use letters, numbers, spaces or dashes only."),
  bankName: z.string().trim().max(100).optional().default(""),
  country: z.string().trim().max(60).optional().default(""),
  currency: CURRENCY.optional(),
  password: z.string().min(1, "Enter your password to confirm.").max(200),
}).superRefine((v, ctx) => {
  if (v.destType !== "internal") {
    if (v.bankName.length < 2) ctx.addIssue({ code: "custom", message: "Enter the bank name.", path: ["bankName"] });
    if (v.country.length < 2) ctx.addIssue({ code: "custom", message: "Enter the bank country.", path: ["country"] });
    if (!v.currency) ctx.addIssue({ code: "custom", message: "Choose a currency.", path: ["currency"] });
  }
});

function normId(s: string) { return s.replace(/[\s-]/g, "").toUpperCase(); }

export const listBeneficiaries = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ q: z.string().trim().max(100).optional() }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const q = data.q ? `%${data.q.replace(/[%_\\]/g, "\\$&")}%` : null;
    const rows = await sql`select * from bank_beneficiaries where user_id = ${userId}
      ${q ? sql`and (name ilike ${q} or nickname ilike ${q} or account_identifier ilike ${q} or bank_name ilike ${q})` : sql``}
      order by name`;
    return rows.map((r: any) => ({
      id: r.id as number, name: r.name as string, nickname: (r.nickname ?? "") as string, destType: r.dest_type as string,
      accountIdentifier: r.account_identifier as string, bankName: (r.bank_name ?? "") as string, country: (r.country ?? "") as string,
      currency: (r.currency ?? "") as string, createdAt: new Date(r.created_at).toISOString(),
    })) as Array<{ id: number; name: string; nickname: string; destType: string; accountIdentifier: string; bankName: string; country: string; currency: string; createdAt: string }>;
  });

export const checkInternalAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ accountNumber: z.string().trim().min(4).max(40) }).parse(d))
  .handler(async ({ data }) => {
    await uid();
    const sql = await db();
    const r = (await sql`select currency, status from bank_accounts where account_number = ${normId(data.accountNumber)}`)[0];
    if (!r || r.status === "closed") return { valid: false as const };
    return { valid: true as const, currency: r.currency as string };
  });

export const saveBeneficiary = createServerFn({ method: "POST" })
  .inputValidator((d) => benInput.parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    if (!(await verifyPassword(userId, data.password))) return fail("Password is incorrect.");
    const ident = normId(data.accountIdentifier);
    let currency = data.currency ?? null;
    if (data.destType === "internal") {
      const r = (await sql`select currency, status from bank_accounts where account_number = ${ident}`)[0];
      if (!r || r.status === "closed") return fail("No open Universal Crest account matches that number.");
      currency = r.currency;
    }
    const bank = data.destType === "internal" ? "Universal Crest" : data.bankName;
    const country = data.destType === "internal" ? null : data.country;
    const { audit, notify } = await lib();
    try {
      return await sql.begin(async (tx: any) => {
        if (data.id) {
          const upd = await tx`update bank_beneficiaries set name = ${data.name}, nickname = ${data.nickname || null}, dest_type = ${data.destType},
            account_identifier = ${ident}, bank_name = ${bank}, country = ${country}, currency = ${currency}, updated_at = now()
            where id = ${data.id} and user_id = ${userId} returning id`;
          if (!upd[0]) return fail("Beneficiary not found.");
          await notify(tx, userId, "beneficiary", "Beneficiary updated", `"${data.name}" was updated.`);
          await audit(tx, userId, userId, "beneficiary.updated", { beneficiaryId: data.id });
        } else {
          const ins = await tx`insert into bank_beneficiaries (user_id, name, nickname, dest_type, account_identifier, bank_name, country, currency)
            values (${userId}, ${data.name}, ${data.nickname || null}, ${data.destType}, ${ident}, ${bank}, ${country}, ${currency}) returning id`;
          await notify(tx, userId, "beneficiary", "Beneficiary added", `"${data.name}" was added to your beneficiaries.`);
          await audit(tx, userId, userId, "beneficiary.added", { beneficiaryId: ins[0].id });
        }
        return { ok: true as const };
      });
    } catch (e: any) {
      if (e?.code === "23505") return fail("You already saved a beneficiary with this account.");
      throw e;
    }
  });

export const deleteBeneficiary = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id, password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    if (!(await verifyPassword(userId, data.password))) return fail("Password is incorrect.");
    const { audit, notify } = await lib();
    return sql.begin(async (tx: any) => {
      const del = await tx`delete from bank_beneficiaries where id = ${data.id} and user_id = ${userId} returning name`;
      if (!del[0]) return fail("Beneficiary not found.");
      await notify(tx, userId, "beneficiary", "Beneficiary removed", `"${del[0].name}" was removed from your beneficiaries.`);
      await audit(tx, userId, userId, "beneficiary.deleted", { beneficiaryId: data.id });
      return { ok: true as const };
    });
  });

// ---------------- Receive ----------------
export const getReceiveDetails = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await kycUid();
  const sql = await db();
  const holder = (await sql`select full_name from bank_users where id = ${userId}`)[0].full_name as string;
  const rows = await sql`select id, nickname, account_type, currency, account_number, status from bank_accounts
    where user_id = ${userId} and status <> 'closed' order by opened_at`;
  return { holder, accounts: rows.map((r: any) => ({ id: r.id as number, nickname: r.nickname as string, type: r.account_type as string, currency: r.currency as string, accountNumber: r.account_number as string, status: r.status as string })) as Array<{ id: number; nickname: string; type: string; currency: string; accountNumber: string; status: string }> };
});

// ---------------- Notifications ----------------
export const listNotifications = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await uid();
  const sql = await db();
  const rows = await sql`select id, kind, title, body, read_at, created_at from bank_notifications where user_id = ${userId} order by created_at desc limit 100`;
  return rows.map((n: any) => ({ id: n.id as number, kind: n.kind as string, title: n.title as string, body: n.body as string, read: !!n.read_at, createdAt: new Date(n.created_at).toISOString() })) as Array<{ id: number; kind: string; title: string; body: string; read: boolean; createdAt: string }>;
});

export const markNotificationRead = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    await sql`update bank_notifications set read_at = now() where id = ${data.id} and user_id = ${userId} and read_at is null`;
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await uid();
  const sql = await db();
  await sql`update bank_notifications set read_at = now() where user_id = ${userId} and read_at is null`;
  return { ok: true };
});

// ---------------- Admin (privileged ledger tools) ----------------
async function adminId() {
  const { requireAdminId } = await import("./session.server");
  return requireAdminId();
}

export const adminListUserAccounts = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ userId: id }).parse(d))
  .handler(async ({ data }) => {
    await adminId();
    const sql = await db();
    const accounts = await accountsWithBalances(sql, data.userId);
    const pending = await sql`select t.id, t.reference, t.description, e.account_id, e.amount_minor::text as amount, e.currency
      from bank_ledger_txns t join bank_ledger_entries e on e.txn_id = t.id join bank_accounts a on a.id = e.account_id
      where a.user_id = ${data.userId} and t.status = 'pending' order by t.created_at`;
    const holds = await sql`select h.id, h.account_id, h.amount_minor::text as amount, h.reason, a.currency from bank_holds h join bank_accounts a on a.id = h.account_id
      where a.user_id = ${data.userId} and h.status = 'active' order by h.created_at`;
    return {
      accounts,
      pending: pending.map((p: any) => ({ txnId: Number(p.id), reference: p.reference as string, description: p.description as string, accountId: p.account_id as number, amount: p.amount as string, currency: p.currency as string })) as Array<{ txnId: number; reference: string; description: string; accountId: number; amount: string; currency: string }>,
      holds: holds.map((h: any) => ({ id: h.id as number, accountId: h.account_id as number, amount: h.amount as string, reason: h.reason as string, currency: h.currency as string })) as Array<{ id: number; accountId: number; amount: string; reason: string; currency: string }>,
    };
  });

export const adminSetAccountStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ accountId: id, status: z.enum(["active", "restricted", "frozen"]), reason: z.string().trim().max(300).optional() }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, notify } = await lib();
    return sql.begin(async (tx: any) => {
      const a = (await tx`select id, user_id, nickname, status from bank_accounts where id = ${data.accountId} for update`)[0];
      if (!a) return fail("Account not found.");
      if (a.status === "closed") return fail("Closed accounts cannot be changed.");
      if (a.status === data.status) return { ok: true as const };
      await tx`update bank_accounts set status = ${data.status} where id = ${a.id}`;
      await notify(tx, a.user_id, "account_status", "Account status changed",
        `Your account "${a.nickname}" is now ${data.status}.${data.reason ? " Reason: " + data.reason : ""}`);
      await audit(tx, a.user_id, actor, "account.status_changed", { accountId: a.id, from: a.status, to: data.status });
      return { ok: true as const };
    });
  });

export const adminPostAdjustment = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    accountId: id, amount: minorFromDecimal, direction: z.enum(["credit", "debit"]),
    description: z.string().trim().min(3).max(140), status: z.enum(["posted", "pending"]),
    idempotencyKey: z.string().min(8).max(100),
  }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const { postAdjustment, BankError } = await lib();
    try {
      const r = await postAdjustment({
        idempotencyKey: data.idempotencyKey, accountId: data.accountId, description: data.description, status: data.status, actorId: actor,
        amountMinor: data.direction === "credit" ? data.amount : -data.amount,
      });
      return { ok: true as const, ...r };
    } catch (e) {
      if (e instanceof BankError) return fail(e.message);
      throw e;
    }
  });

export const adminSettlePending = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ txnId: id, action: z.enum(["post", "cancel"]) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, checkLowBalance } = await lib();
    return sql.begin(async (tx: any) => {
      const entries = await tx`select e.account_id from bank_ledger_entries e where e.txn_id = ${data.txnId} and e.account_id is not null`;
      for (const e of entries) await tx`select id from bank_accounts where id = ${e.account_id} for update`;
      const t = (await tx`select id, status from bank_ledger_txns where id = ${data.txnId} for update`)[0];
      if (!t || t.status !== "pending") return fail("Transaction is not pending.");
      if (data.action === "post") await tx`update bank_ledger_txns set status = 'posted', posted_at = now() where id = ${t.id}`;
      else await tx`update bank_ledger_txns set status = 'cancelled' where id = ${t.id}`;
      for (const e of entries) {
        const owner = (await tx`select user_id from bank_accounts where id = ${e.account_id}`)[0];
        await audit(tx, owner.user_id, actor, `ledger.pending_${data.action}`, { txnId: Number(t.id) });
        await checkLowBalance(tx, e.account_id);
      }
      return { ok: true as const };
    });
  });

export const adminPlaceHold = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ accountId: id, amount: minorFromDecimal, reason: z.string().trim().min(3).max(140) }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, checkLowBalance } = await lib();
    if (data.amount <= 0n) return fail("Amount must be positive.");
    return sql.begin(async (tx: any) => {
      const a = (await tx`select id, user_id from bank_accounts where id = ${data.accountId} for update`)[0];
      if (!a) return fail("Account not found.");
      const h = await tx`insert into bank_holds (account_id, amount_minor, reason, created_by) values (${a.id}, ${data.amount.toString()}, ${data.reason}, ${actor}) returning id`;
      await audit(tx, a.user_id, actor, "hold.placed", { accountId: a.id, holdId: h[0].id });
      await checkLowBalance(tx, a.id);
      return { ok: true as const };
    });
  });

export const adminReleaseHold = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ holdId: id }).parse(d))
  .handler(async ({ data }) => {
    const actor = await adminId();
    const sql = await db();
    const { audit, checkLowBalance } = await lib();
    return sql.begin(async (tx: any) => {
      const h = (await tx`update bank_holds set status = 'released', released_at = now() where id = ${data.holdId} and status = 'active'
        returning account_id`)[0];
      if (!h) return fail("Hold is not active.");
      const a = (await tx`select user_id from bank_accounts where id = ${h.account_id}`)[0];
      await audit(tx, a.user_id, actor, "hold.released", { holdId: data.holdId });
      await checkLowBalance(tx, h.account_id);
      return { ok: true as const };
    });
  });

// ---------------- Internal transfers (USD ledger) ----------------
const acctNo = z.string().trim().transform((v) => v.replace(/[\s-]/g, "")).pipe(z.string().regex(/^\d{10}$/, "Account numbers are 10 digits."));
function maskName(name: string) {
  return name.split(/\s+/).filter(Boolean).map((p, i) => (i === 0 ? p : `${p[0]}.`)).join(" ");
}

export const lookupRecipient = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ accountNumber: acctNo, fromAccountId: id.optional() }).parse(d))
  .handler(async ({ data }) => {
    const userId = await kycUid();
    const sql = await db();
    const r = (await sql`select a.id, a.currency, a.status, a.account_type, u.full_name, u.status as user_status
      from bank_accounts a join bank_users u on u.id = a.user_id where a.account_number = ${data.accountNumber}`)[0];
    if (!r) return fail("No account found with that number.");
    if (r.status !== "active" || r.user_status !== "active") return fail("That account can't receive transfers right now.");
    if (data.fromAccountId && r.id === data.fromAccountId) return fail("You can't send money to the same account.");
    if (data.fromAccountId) {
      const src = (await sql`select currency from bank_accounts where id = ${data.fromAccountId} and user_id = ${userId}`)[0];
      if (!src) return fail("Source account not found.");
      if (src.currency !== r.currency) return fail(`That account holds ${r.currency}. Send from a ${r.currency} account instead.`);
    }
    return { ok: true as const, holder: maskName(r.full_name), type: r.account_type as string, currency: r.currency as string };
  });

export const sendMoney = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    fromAccountId: id,
    toAccountNumber: acctNo,
    amount: minorFromDecimal,
    description: z.string().trim().max(140).optional().default(""),
    pin: z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN."),
    idempotencyKey: z.string().min(8).max(100),
  }).parse(d))
  .handler(async ({ data }) => {
    const userId = await kycUid();
    if (data.amount <= 0n) return fail("Enter an amount greater than zero.");
    if (data.amount > 100000000n) return fail("Transfers are limited to 1,000,000.00 per transaction.");
    if (!(await verifyPin(userId, data.pin))) return fail("Incorrect PIN.");
    const sql = await db();
    const { balancesFor, newReference, notify, audit, checkLowBalance, BankError } = await lib();
    const key = `xfer:${userId}:${data.idempotencyKey}`;
    type Receipt = { reference: string; amount: string; currency: string; from: string; to: string; toName: string; description: string; date: string; status: string };
    const receiptFor = async (q: any, txnId: number): Promise<Receipt> => {
      const t = (await q`select t.reference, t.amount_minor::text as amount, t.currency, t.memo, t.status, t.posted_at, t.created_at,
          fa.account_number as from_no, ta.account_number as to_no, tu.full_name as to_name
        from bank_ledger_txns t join bank_accounts fa on fa.id = t.from_account_id join bank_accounts ta on ta.id = t.to_account_id
        join bank_users tu on tu.id = ta.user_id where t.id = ${txnId}`)[0];
      return { reference: t.reference, amount: t.amount, currency: t.currency, from: t.from_no, to: t.to_no, toName: maskName(t.to_name),
        description: t.memo ?? "", date: new Date(t.posted_at ?? t.created_at).toISOString(), status: t.status };
    };
    try {
      return await sql.begin(async (tx: any) => {
        const prior = (await tx`select id from bank_ledger_txns where idempotency_key = ${key}`)[0];
        if (prior) return { ok: true as const, duplicate: true, receipt: await receiptFor(tx, Number(prior.id)) };
        const dest = (await tx`select id from bank_accounts where account_number = ${data.toAccountNumber}`)[0];
        if (!dest) throw new BankError("No account found with that number.");
        if (dest.id === data.fromAccountId) throw new BankError("You can't send money to the same account.");
        // Lock both accounts in a stable order to prevent deadlocks and concurrent overspending.
        const locked = await tx`select a.id, a.user_id, a.account_number, a.nickname, a.currency, a.status, u.full_name, u.status as user_status
          from bank_accounts a join bank_users u on u.id = a.user_id
          where a.id in (${data.fromAccountId}, ${dest.id}) order by a.id for update of a`;
        const src = locked.find((a: any) => a.id === data.fromAccountId);
        const dst = locked.find((a: any) => a.id === dest.id);
        if (!src || src.user_id !== userId) throw new BankError("Source account not found.");
        if (src.status !== "active" || src.user_status !== "active") throw new BankError(`Your account is ${src.status}; transfers are not allowed.`);
        if (dst.status !== "active" || dst.user_status !== "active") throw new BankError("That account can't receive transfers right now.");
        if (src.currency !== dst.currency) throw new BankError(`Both accounts must hold the same currency (${src.currency} → ${dst.currency}).`);
        const cur = src.currency as string;
        const bal = (await balancesFor(tx, [src.id])).get(src.id)!;
        if (BigInt(bal.available) < data.amount) throw new BankError("Insufficient available balance.");
        await (await lib()).checkDailyLimit(tx, src.id, data.amount, cur);
        const reference = newReference("TRF");
        const desc = `Transfer ${src.full_name} → ${dst.full_name}${data.description ? ` · ${data.description}` : ""}`;
        const txn = (await tx`insert into bank_ledger_txns (idempotency_key, reference, description, status, created_by, posted_at,
            kind, from_account_id, to_account_id, amount_minor, currency, memo)
          values (${key}, ${reference}, ${desc}, 'posted', ${userId}, now(), 'transfer', ${src.id}, ${dst.id},
            ${data.amount.toString()}, ${cur}, ${data.description || null}) returning id`)[0];
        await tx`insert into bank_ledger_entries (txn_id, account_id, currency, amount_minor) values
          (${txn.id}, ${src.id}, ${cur}, ${(-data.amount).toString()}), (${txn.id}, ${dst.id}, ${cur}, ${data.amount.toString()})`;
        const after = (await balancesFor(tx, [src.id])).get(src.id)!;
        if (BigInt(after.available) < 0n) throw new BankError("Insufficient available balance.");
        const amt = formatMinor(data.amount, cur);
        await notify(tx, src.user_id, "transfer_sent", "Money sent", `You sent ${amt} to ${maskName(dst.full_name)} (ref ${reference}).`);
        await notify(tx, dst.user_id, "transfer_received", "Money received", `You received ${amt} from ${maskName(src.full_name)} (ref ${reference}).`);
        await audit(tx, userId, userId, "transfer.internal", { txnId: Number(txn.id), from: src.id, to: dst.id, amount: data.amount.toString() });
        await checkLowBalance(tx, src.id);
        return { ok: true as const, duplicate: false, receipt: await receiptFor(tx, Number(txn.id)) };
      });
    } catch (e) {
      if (e instanceof BankError) return fail(e.message);
      // A concurrent retry with the same key may have committed first.
      const prior = (await sql`select id from bank_ledger_txns where idempotency_key = ${key}`)[0];
      if (prior) return { ok: true as const, duplicate: true, receipt: await receiptFor(sql, Number(prior.id)) };
      throw e;
    }
  });

// ---------------- All transactions (every status, every account) ----------------
export const listTransactions = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    accountId: id.optional(),
    status: z.enum(["all", "posted", "pending", "cancelled"]).default("all"),
    direction: z.enum(["all", "in", "out"]).default("all"),
    q: z.string().trim().max(80).default(""),
  }).parse(d))
  .handler(async ({ data }) => {
    const userId = await uid();
    const sql = await db();
    const q = `%${data.q.replace(/[%_\\]/g, "\\$&")}%`;
    const rows = await sql`select e.id, t.id as txn_id, e.account_id, a.nickname, a.account_number, e.currency, e.amount_minor::text as amount,
        t.description, t.reference, t.status, t.kind, t.memo, t.created_at, t.posted_at
      from bank_ledger_entries e
      join bank_ledger_txns t on t.id = e.txn_id
      join bank_accounts a on a.id = e.account_id
      where a.user_id = ${userId}
        and (${data.accountId ?? null}::int is null or a.id = ${data.accountId ?? null}::int)
        and (${data.status} = 'all' or t.status = ${data.status})
        and (${data.direction} = 'all' or (${data.direction} = 'in' and e.amount_minor > 0) or (${data.direction} = 'out' and e.amount_minor < 0))
        and (${data.q} = '' or t.description ilike ${q} or t.reference ilike ${q} or coalesce(t.memo,'') ilike ${q})
      order by coalesce(t.posted_at, t.created_at) desc, e.id desc
      limit 1000`;
    return rows.map((r: any) => ({
      id: Number(r.id), txnId: Number(r.txn_id), accountId: r.account_id as number, accountName: r.nickname as string, accountNumber: r.account_number as string,
      currency: r.currency as string, amount: r.amount as string, description: r.description as string, reference: r.reference as string,
      status: r.status as string, kind: (r.kind ?? "") as string, memo: (r.memo ?? "") as string,
      date: new Date(r.posted_at ?? r.created_at).toISOString(),
    })) as Array<{ id: number; txnId: number; accountId: number; accountName: string; accountNumber: string; currency: string; amount: string; description: string; reference: string; status: string; kind: string; memo: string; date: string }>;
  });

// ---------------- External transfers (local bank transfer / international wire) ----------------
const externalBase = {
  fromAccountId: id,
  amount: minorFromDecimal,
  beneficiaryName: z.string().trim().min(2, "Enter the recipient's full name.").max(80),
  bankName: z.string().trim().min(2, "Enter the recipient's bank.").max(80),
  accountNumber: z.string().trim().regex(/^[A-Za-z0-9 -]{6,34}$/, "Enter a valid account number or IBAN."),
  reference: z.string().trim().max(140).optional().default(""),
  pin: z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN."),
  idempotencyKey: z.string().min(8).max(100),
};
const externalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("local"), ...externalBase, routingNumber: z.string().trim().regex(/^[A-Za-z0-9 -]{3,20}$/, "Enter a valid routing / sort code.") }),
  z.object({
    kind: z.literal("wire"), ...externalBase,
    swift: z.string().trim().toUpperCase().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, "Enter a valid 8 or 11 character SWIFT/BIC code."),
    country: z.string().trim().min(2, "Choose the recipient's country.").max(60),
    bankAddress: z.string().trim().max(160).optional().default(""),
    purpose: z.string().trim().min(2, "Choose the purpose of payment.").max(60),
  }),
]);

export const sendExternal = createServerFn({ method: "POST" })
  .inputValidator((d) => externalSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await kycUid();
    if (data.amount <= 0n) return fail("Enter an amount greater than zero.");
    if (data.amount > 100000000n) return fail("Transfers are limited to 1,000,000.00 per transaction.");
    if (!(await verifyPin(userId, data.pin))) return fail("Incorrect PIN.");
    const sql = await db();
    const { balancesFor, newReference, notify, audit, checkLowBalance, BankError } = await lib();
    const key = `ext:${userId}:${data.idempotencyKey}`;
    const label = data.kind === "wire" ? "International wire" : "Local transfer";
    const receiptFor = async (q: any, txnId: number) => {
      const t = (await q`select t.reference, t.amount_minor::text as amount, t.currency, t.status, t.created_at, t.memo, a.account_number
        from bank_ledger_txns t join bank_accounts a on a.id = t.from_account_id where t.id = ${txnId}`)[0];
      return { reference: t.reference as string, amount: t.amount as string, currency: t.currency as string, status: t.status as string,
        date: new Date(t.created_at).toISOString(), from: t.account_number as string, memo: (t.memo ?? "") as string };
    };
    try {
      return await sql.begin(async (tx: any) => {
        const prior = (await tx`select id from bank_ledger_txns where idempotency_key = ${key}`)[0];
        if (prior) return { ok: true as const, receipt: await receiptFor(tx, Number(prior.id)) };
        const src = (await tx`select a.id, a.currency, a.status, u.status as user_status from bank_accounts a join bank_users u on u.id = a.user_id
          where a.id = ${data.fromAccountId} and a.user_id = ${userId} for update of a`)[0];
        if (!src) throw new BankError("Source account not found.");
        if (src.status !== "active" || src.user_status !== "active") throw new BankError(`Your account is ${src.status}; transfers are not allowed.`);
        const bal = (await balancesFor(tx, [src.id])).get(src.id)!;
        if (BigInt(bal.available) < data.amount) throw new BankError("Insufficient available balance.");
        await (await lib()).checkDailyLimit(tx, src.id, data.amount, src.currency);
        const reference = newReference(data.kind === "wire" ? "WIR" : "LCL");
        const acctMasked = `••••${data.accountNumber.replace(/[\s-]/g, "").slice(-4)}`;
        const desc = `${label} to ${data.beneficiaryName} · ${data.bankName} ${acctMasked}${data.reference ? ` · ${data.reference}` : ""}`;
        const details = data.kind === "wire"
          ? { beneficiaryName: data.beneficiaryName, bankName: data.bankName, accountNumber: data.accountNumber, swift: data.swift, country: data.country, bankAddress: data.bankAddress, purpose: data.purpose }
          : { beneficiaryName: data.beneficiaryName, bankName: data.bankName, accountNumber: data.accountNumber, routingNumber: data.routingNumber };
        const txn = (await tx`insert into bank_ledger_txns (idempotency_key, reference, description, status, created_by,
            kind, from_account_id, amount_minor, currency, memo, details)
          values (${key}, ${reference}, ${desc}, 'pending', ${userId}, ${data.kind === "wire" ? "wire" : "local_transfer"}, ${src.id},
            ${data.amount.toString()}, ${src.currency}, ${data.reference || null}, ${tx.json(details)}) returning id`)[0];
        await tx`insert into bank_ledger_entries (txn_id, account_id, currency, amount_minor) values (${txn.id}, ${src.id}, ${src.currency}, ${(-data.amount).toString()})`;
        await tx`insert into bank_ledger_entries (txn_id, system_account, currency, amount_minor) values (${txn.id}, ${"SYSTEM:EXTERNAL:" + src.currency}, ${src.currency}, ${data.amount.toString()})`;
        const amt = formatMinor(data.amount, src.currency);
        await notify(tx, userId, "transfer_sent", `${label} submitted`, `Your ${label.toLowerCase()} of ${amt} to ${data.beneficiaryName} is being processed (ref ${reference}).`);
        await audit(tx, userId, userId, `transfer.${data.kind}`, { txnId: Number(txn.id), from: src.id, amount: data.amount.toString() });
        await checkLowBalance(tx, src.id);
        setTimeout(() => { void import("./mail.server").then((m) => m.sendAdminAlert(`${label} awaiting approval`, `A ${label.toLowerCase()} of ${amt} to ${data.beneficiaryName} (ref ${reference}) is pending. Complete or cancel it in the admin console.`)); }, 1500);
        return { ok: true as const, receipt: await receiptFor(tx, Number(txn.id)) };
      });
    } catch (e) {
      if (e instanceof BankError) return fail(e.message);
      const prior = (await sql`select id from bank_ledger_txns where idempotency_key = ${key}`)[0];
      if (prior) return { ok: true as const, receipt: await receiptFor(sql, Number(prior.id)) };
      throw e;
    }
  });

// ---------------- Currency conversion between own accounts ----------------
let fxCache: { at: number; rates: Record<string, number> } | null = null;
async function usdRates(): Promise<Record<string, number>> {
  if (fxCache && Date.now() - fxCache.at < 10 * 60 * 1000) return fxCache.rates;
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  const j: any = await res.json().catch(() => null);
  if (!res.ok || j?.result !== "success" || !j.rates) throw new Error("Exchange rates are unavailable right now. Please try again shortly.");
  fxCache = { at: Date.now(), rates: j.rates };
  return j.rates;
}
async function fxRate(from: string, to: string) {
  const r = await usdRates();
  if (!r[from] || !r[to]) throw new Error(`No exchange rate available for ${from} → ${to}.`);
  return r[to] / r[from];
}

export const getFxQuote = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ from: CURRENCY, to: CURRENCY }).parse(d))
  .handler(async ({ data }) => {
    await kycUid();
    try { return { ok: true as const, rate: await fxRate(data.from, data.to), at: new Date().toISOString() }; }
    catch (e) { return fail((e as Error).message); }
  });

export const convertCurrency = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    fromAccountId: id, toAccountId: id, amount: minorFromDecimal,
    quotedRate: z.number().positive(),
    pin: z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN."),
    idempotencyKey: z.string().min(8).max(100),
  }).parse(d))
  .handler(async ({ data }) => {
    const userId = await kycUid();
    if (data.amount <= 0n) return fail("Enter an amount greater than zero.");
    if (data.amount > 100000000n) return fail("Conversions are limited to 1,000,000.00 per transaction.");
    if (data.fromAccountId === data.toAccountId) return fail("Choose two different accounts.");
    if (!(await verifyPin(userId, data.pin))) return fail("Incorrect PIN.");
    const sql = await db();
    const { balancesFor, newReference, notify, audit, checkLowBalance, BankError } = await lib();
    const key = `fx:${userId}:${data.idempotencyKey}`;
    const prior = (await sql`select reference from bank_ledger_txns where idempotency_key = ${key}`)[0];
    if (prior) return { ok: true as const, duplicate: true, reference: prior.reference as string, credited: "", rate: data.quotedRate };
    try {
      return await sql.begin(async (tx: any) => {
        const locked = await tx`select a.id, a.user_id, a.nickname, a.currency, a.status, u.status as user_status
          from bank_accounts a join bank_users u on u.id = a.user_id
          where a.id in (${data.fromAccountId}, ${data.toAccountId}) order by a.id for update of a`;
        const src = locked.find((a: any) => a.id === data.fromAccountId);
        const dst = locked.find((a: any) => a.id === data.toAccountId);
        if (!src || !dst || src.user_id !== userId || dst.user_id !== userId) throw new BankError("Account not found.");
        if (src.status !== "active" || dst.status !== "active" || src.user_status !== "active") throw new BankError("Both accounts must be active.");
        if (src.currency === dst.currency) throw new BankError("Both accounts hold the same currency — use Send Money instead.");
        const rate = await fxRate(src.currency, dst.currency);
        if (Math.abs(rate - data.quotedRate) / data.quotedRate > 0.01) throw new BankError("The exchange rate has changed. Please review the new rate and try again.");
        const credited = BigInt(Math.floor(Number(data.amount) * rate));
        if (credited <= 0n) throw new BankError("Amount is too small to convert.");
        const bal = (await balancesFor(tx, [src.id])).get(src.id)!;
        if (BigInt(bal.available) < data.amount) throw new BankError("Insufficient available balance.");
        const reference = newReference("FX");
        const from = formatMinor(data.amount, src.currency), to = formatMinor(credited, dst.currency);
        const desc = `Currency conversion ${from} → ${to} @ ${rate.toFixed(6)}`;
        const txn = (await tx`insert into bank_ledger_txns (idempotency_key, reference, description, status, created_by, posted_at,
            kind, from_account_id, to_account_id, amount_minor, currency, details)
          values (${key}, ${reference}, ${desc}, 'posted', ${userId}, now(), 'fx', ${src.id}, ${dst.id},
            ${data.amount.toString()}, ${src.currency}, ${tx.json({ rate, toCurrency: dst.currency, credited: credited.toString() })}) returning id`)[0];
        await tx`insert into bank_ledger_entries (txn_id, account_id, system_account, currency, amount_minor) values
          (${txn.id}, ${src.id}, null, ${src.currency}, ${(-data.amount).toString()}),
          (${txn.id}, null, ${"SYSTEM:FX:" + src.currency}, ${src.currency}, ${data.amount.toString()}),
          (${txn.id}, null, ${"SYSTEM:FX:" + dst.currency}, ${dst.currency}, ${(-credited).toString()}),
          (${txn.id}, ${dst.id}, null, ${dst.currency}, ${credited.toString()})`;
        const after = (await balancesFor(tx, [src.id])).get(src.id)!;
        if (BigInt(after.available) < 0n) throw new BankError("Insufficient available balance.");
        await notify(tx, userId, "fx", "Currency converted", `You converted ${from} to ${to} (ref ${reference}).`);
        await audit(tx, userId, userId, "fx.convert", { txnId: Number(txn.id), from: src.id, to: dst.id, amount: data.amount.toString(), rate });
        await checkLowBalance(tx, src.id);
        return { ok: true as const, duplicate: false, reference, credited: to, rate };
      });
    } catch (e) {
      if (e instanceof BankError) return fail(e.message);
      if (e instanceof Error && e.message.startsWith("Exchange rates") ) return fail(e.message);
      throw e;
    }
  });

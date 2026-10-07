import { db } from "./db.server";

export const CURRENCIES = ["USD"] as const;
export const MAX_OPEN_ACCOUNTS = 5;
/** Default daily sending cap per account, in minor units (10,000.00). Staff can override per account. */
export const DEFAULT_DAILY_SEND_LIMIT_MINOR = 1000000n;

/** Throws if sending `amount` would push the account over its daily cap. Call with the account row locked. */
export async function checkDailyLimit(tx: any, accountId: number, amount: bigint, currency: string) {
  const r = (await tx`select a.daily_send_limit_minor::text as lim,
      coalesce((select sum(t.amount_minor) from bank_ledger_txns t where t.from_account_id = a.id
        and t.kind in ('transfer','wire','local_transfer') and t.status in ('posted','pending')
        and t.created_at >= date_trunc('day', now())), 0)::text as used
    from bank_accounts a where a.id = ${accountId}`)[0];
  const limit = r?.lim != null ? BigInt(r.lim) : DEFAULT_DAILY_SEND_LIMIT_MINOR;
  const used = BigInt(r?.used ?? "0");
  if (used + amount > limit) {
    const { formatMinor } = await import("./money");
    const left = limit > used ? limit - used : 0n;
    throw new BankError(`This exceeds the account's daily sending limit of ${formatMinor(limit, currency)}. You can send up to ${formatMinor(left, currency)} more today.`);
  }
}

export class BankError extends Error {}

function digits(n: number) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => String(x % 10)).join("");
}

export function newReference(prefix = "UC") {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${digits(4)}`;
}

export async function audit(sqlOrTx: any, userId: number | null, actorId: number | null, action: string, detail: Record<string, unknown> = {}) {
  await sqlOrTx`insert into bank_audit_log (user_id, actor_id, action, detail) values (${userId}, ${actorId}, ${action}, ${sqlOrTx.json(detail)})`;
}

export async function notify(sqlOrTx: any, userId: number, kind: string, title: string, body: string) {
  await sqlOrTx`insert into bank_notifications (user_id, kind, title, body) values (${userId}, ${kind}, ${title}, ${body})`;
  // Email a copy shortly after, so it goes out once the surrounding transaction has committed.
  setTimeout(() => { void import("./mail.server").then((m) => m.emailUserNotification(userId, title, body)); }, 1500);
}

export function mask(num: string) {
  return `•••• ${num.slice(-4)}`;
}

/** Balance query for a set of accounts. All values are integer minor units returned as strings. */
export async function balancesFor(sqlOrTx: any, accountIds: number[]) {
  if (accountIds.length === 0) return new Map<number, Bal>();
  const rows = await sqlOrTx`
    select a.id,
      coalesce((select sum(e.amount_minor) from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id
        where e.account_id = a.id and t.status = 'posted'), 0)::text as current,
      coalesce((select sum(h.amount_minor) from bank_holds h where h.account_id = a.id and h.status = 'active' and (h.expires_at is null or h.expires_at > now())), 0)::text as holds,
      coalesce((select sum(-e.amount_minor) from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id
        where e.account_id = a.id and t.status = 'pending' and e.amount_minor < 0), 0)::text as pending_out,
      coalesce((select sum(e.amount_minor) from bank_ledger_entries e join bank_ledger_txns t on t.id = e.txn_id
        where e.account_id = a.id and t.status = 'pending' and e.amount_minor > 0), 0)::text as pending_in
    from bank_accounts a where a.id = any(${accountIds})`;
  const m = new Map<number, Bal>();
  for (const r of rows) {
    const current = BigInt(r.current);
    const held = BigInt(r.holds) + BigInt(r.pending_out);
    m.set(r.id, {
      current: current.toString(),
      held: held.toString(),
      available: (current - held).toString(),
      pendingIn: BigInt(r.pending_in).toString(),
      pendingOut: BigInt(r.pending_out).toString(),
    });
  }
  return m;
}
export type Bal = { current: string; held: string; available: string; pendingIn: string; pendingOut: string };

export async function createAccount(sqlOrTx: any, userId: number, actorId: number | null, input: { nickname: string; type: "savings" | "checking"; currency: string; requestKey?: string }) {
  for (let i = 0; i < 5; i++) {
    const number = `40${digits(8)}`;
    const rows = await sqlOrTx`insert into bank_accounts (user_id, account_number, nickname, account_type, currency, open_request_key)
      values (${userId}, ${number}, ${input.nickname}, ${input.type}, ${input.currency}, ${input.requestKey ?? null})
      on conflict (account_number) do nothing returning id, account_number`;
    if (rows[0]) {
      await notify(sqlOrTx, userId, "account_created", "New account opened",
        `Your ${input.type} account "${input.nickname}" (${input.currency}, ${mask(number)}) is open with a zero balance.`);
      await audit(sqlOrTx, userId, actorId, "account.created", { accountId: rows[0].id, type: input.type, currency: input.currency });
      return rows[0].id as number;
    }
  }
  throw new BankError("Could not allocate an account number. Please try again.");
}

/** Raise or clear the low-balance alert once per threshold crossing. */
export async function checkLowBalance(sqlOrTx: any, accountId: number) {
  const acc = (await sqlOrTx`select id, user_id, nickname, currency, low_balance_threshold::text as t, low_alert_active from bank_accounts where id = ${accountId}`)[0];
  if (!acc) return;
  const threshold = BigInt(acc.t);
  const bal = (await balancesFor(sqlOrTx, [accountId])).get(accountId)!;
  const avail = BigInt(bal.available);
  if (threshold > 0n && avail < threshold && !acc.low_alert_active) {
    await sqlOrTx`update bank_accounts set low_alert_active = true where id = ${accountId}`;
    await notify(sqlOrTx, acc.user_id, "low_balance", "Low available balance",
      `The available balance on "${acc.nickname}" has fallen below your ${acc.currency} alert threshold.`);
  } else if (acc.low_alert_active && (threshold === 0n || avail >= threshold)) {
    await sqlOrTx`update bank_accounts set low_alert_active = false where id = ${accountId}`;
  }
}

/**
 * Privileged posting: moves money between a customer account and the system clearing account
 * for the same currency. amountMinor > 0 credits the customer, < 0 debits. Idempotent by key.
 */
export async function postAdjustment(input: {
  idempotencyKey: string;
  accountId: number;
  amountMinor: bigint;
  description: string;
  status: "posted" | "pending";
  actorId: number;
}) {
  const sql = await db();
  if (input.amountMinor === 0n) throw new BankError("Amount must not be zero.");
  return sql.begin(async (tx: any) => {
    const existing = await tx`select id, reference from bank_ledger_txns where idempotency_key = ${input.idempotencyKey}`;
    if (existing[0]) return { txnId: Number(existing[0].id), reference: existing[0].reference as string, duplicate: true };
    const acc = (await tx`select id, user_id, currency, status from bank_accounts where id = ${input.accountId} for update`)[0];
    if (!acc) throw new BankError("Account not found.");
    if (acc.status === "closed" || acc.status === "frozen") throw new BankError(`Account is ${acc.status}; no postings allowed.`);
    if (input.amountMinor < 0n) {
      if (acc.status === "restricted") throw new BankError("Account is restricted; debits are not allowed.");
      const bal = (await balancesFor(tx, [acc.id])).get(acc.id)!;
      if (BigInt(bal.available) + input.amountMinor < 0n) throw new BankError("Insufficient available balance.");
    }
    const reference = newReference();
    const txn = (await tx`insert into bank_ledger_txns (idempotency_key, reference, description, status, created_by, posted_at)
      values (${input.idempotencyKey}, ${reference}, ${input.description}, ${input.status}, ${input.actorId},
        ${input.status === "posted" ? tx`now()` : null})
      on conflict (idempotency_key) do nothing returning id`)[0];
    if (!txn) {
      const again = (await tx`select id, reference from bank_ledger_txns where idempotency_key = ${input.idempotencyKey}`)[0];
      return { txnId: Number(again.id), reference: again.reference as string, duplicate: true };
    }
    const amt = input.amountMinor.toString();
    const neg = (-input.amountMinor).toString();
    await tx`insert into bank_ledger_entries (txn_id, account_id, currency, amount_minor) values (${txn.id}, ${acc.id}, ${acc.currency}, ${amt})`;
    await tx`insert into bank_ledger_entries (txn_id, system_account, currency, amount_minor) values (${txn.id}, ${"SYSTEM:CLEARING:" + acc.currency}, ${acc.currency}, ${neg})`;
    const unbalanced = await tx`select currency from bank_ledger_entries where txn_id = ${txn.id} group by currency having sum(amount_minor) <> 0`;
    if (unbalanced.length) throw new BankError("Ledger transaction does not balance.");
    await audit(tx, acc.user_id, input.actorId, "ledger.adjustment", { txnId: Number(txn.id), accountId: acc.id, status: input.status });
    await checkLowBalance(tx, acc.id);
    return { txnId: Number(txn.id), reference, duplicate: false };
  });
}

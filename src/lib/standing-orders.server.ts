import { audit, balancesFor, checkDailyLimit, checkLowBalance, newReference, notify, BankError } from "./banking.server";
import { formatMinor } from "./money";

/** Next run date (YYYY-MM-DD) on `day` of the month, strictly after `after` unless `inclusive`. */
export function nextRunDate(day: number, after: Date, inclusive = false) {
  const y = after.getUTCFullYear(), m = after.getUTCMonth();
  const thisMonth = new Date(Date.UTC(y, m, day));
  const afterDay = Date.UTC(y, m, after.getUTCDate());
  const d = inclusive ? (thisMonth.getTime() >= afterDay ? thisMonth : new Date(Date.UTC(y, m + 1, day)))
    : (thisMonth.getTime() > afterDay ? thisMonth : new Date(Date.UTC(y, m + 1, day)));
  return d.toISOString().slice(0, 10);
}

const MAX_FAILURES = 3;

/** Run one due standing order inside its own DB transaction. Idempotent per order + run date. */
async function runOne(sql: any, orderId: number) {
  return sql.begin(async (tx: any) => {
    const o = (await tx`select * from bank_standing_orders where id = ${orderId} for update skip locked`)[0];
    if (!o || o.status !== "active") return;
    const runDate = new Date(o.next_run_date).toISOString().slice(0, 10);
    if (runDate > new Date().toISOString().slice(0, 10)) return;
    const advance = async (result: string, ok: boolean) => {
      const next = nextRunDate(o.day_of_month, new Date(runDate + "T00:00:00Z"));
      const failures = ok ? 0 : o.failures + 1;
      const ended = o.end_date && next > new Date(o.end_date).toISOString().slice(0, 10);
      const status = ended ? "completed" : failures >= MAX_FAILURES ? "paused" : "active";
      await tx`update bank_standing_orders set next_run_date = ${next}, last_run_at = now(), last_result = ${result},
        failures = ${failures}, runs_count = runs_count + ${ok ? 1 : 0}, status = ${status} where id = ${o.id}`;
      return status;
    };
    const key = `so:${o.id}:${runDate}`;
    if ((await tx`select id from bank_ledger_txns where idempotency_key = ${key}`)[0]) { await advance("Already sent", true); return; }
    const amt = formatMinor(String(o.amount_minor), o.currency);
    try {
      await tx`savepoint so_run`;
      const dest = (await tx`select id from bank_accounts where account_number = ${o.to_account_number}`)[0];
      if (!dest) throw new BankError("Recipient account no longer exists.");
      const locked = await tx`select a.id, a.user_id, a.currency, a.status, u.full_name, u.status as user_status
        from bank_accounts a join bank_users u on u.id = a.user_id where a.id in (${o.from_account_id}, ${dest.id}) order by a.id for update of a`;
      const src = locked.find((a: any) => a.id === o.from_account_id);
      const dst = locked.find((a: any) => a.id === dest.id);
      if (!src || src.user_id !== o.user_id || !dst) throw new BankError("Account not found.");
      if (src.status !== "active" || src.user_status !== "active") throw new BankError("Your account isn't active.");
      if (dst.status !== "active" || dst.user_status !== "active") throw new BankError("Recipient account can't receive transfers.");
      if (src.currency !== dst.currency || src.currency !== o.currency) throw new BankError("Currency mismatch.");
      const amount = BigInt(o.amount_minor);
      const bal = (await balancesFor(tx, [src.id])).get(src.id)!;
      if (BigInt(bal.available) < amount) throw new BankError("Insufficient available balance.");
      await checkDailyLimit(tx, src.id, amount, o.currency);
      const reference = newReference("STO");
      const desc = `Standing order ${src.full_name} → ${dst.full_name}${o.description ? ` · ${o.description}` : ""}`;
      const txn = (await tx`insert into bank_ledger_txns (idempotency_key, reference, description, status, created_by, posted_at, kind, from_account_id, to_account_id, amount_minor, currency, memo)
        values (${key}, ${reference}, ${desc}, 'posted', ${o.user_id}, now(), 'transfer', ${src.id}, ${dst.id}, ${amount.toString()}, ${o.currency}, ${o.description || null}) returning id`)[0];
      await tx`insert into bank_ledger_entries (txn_id, account_id, currency, amount_minor) values
        (${txn.id}, ${src.id}, ${o.currency}, ${(-amount).toString()}), (${txn.id}, ${dst.id}, ${o.currency}, ${amount.toString()})`;
      await notify(tx, src.user_id, "transfer_sent", "Standing order paid", `Your standing order #${o.id} sent ${amt} (ref ${reference}).`);
      await notify(tx, dst.user_id, "transfer_received", "Money received", `You received ${amt} by standing order (ref ${reference}).`);
      await audit(tx, o.user_id, o.user_id, "standing_order.run", { orderId: o.id, txnId: Number(txn.id), amount: amount.toString() });
      await checkLowBalance(tx, src.id);
      await advance(`Sent · ref ${reference}`, true);
    } catch (e) {
      if (!(e instanceof BankError)) throw e;
      await tx`rollback to savepoint so_run`;
      const status = await advance(`Failed: ${e.message}`, false);
      await notify(tx, o.user_id, "transfer_sent", "Standing order failed",
        `Standing order #${o.id} (${amt}) could not be paid: ${e.message}${status === "paused" ? " It has been paused after repeated failures." : ""}`);
    }
  });
}

/** Process due standing orders (no scheduler: triggered by page visits). */
export async function processDueStandingOrders(sql: any, userId?: number) {
  const due = await sql`select id from bank_standing_orders where status = 'active' and next_run_date <= current_date
    and coalesce((select k.status = 'verified' from bank_kyc_applications k where k.user_id = bank_standing_orders.user_id order by k.created_at desc limit 1),
      (select u.kyc_status = 'verified' from bank_users u where u.id = bank_standing_orders.user_id), false)
    and (${userId ?? null}::int is null or user_id = ${userId ?? null}::int) order by next_run_date, id limit 50`;
  for (const r of due) {
    // Catch up on missed months one run at a time.
    for (let i = 0; i < 12; i++) {
      await runOne(sql, r.id);
      const again = (await sql`select 1 from bank_standing_orders where id = ${r.id} and status = 'active' and next_run_date <= current_date`)[0];
      if (!again) break;
    }
  }
}

import { audit, balancesFor, checkLowBalance, newReference, notify, BankError } from "./banking.server";
import { formatMinor } from "./money";

const DAY = 86_400_000;

export function addMonths(d: Date, n: number) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(d.getUTCDate(), last));
  return x;
}
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Interest accrued (actual/365, simple daily) on the outstanding principal since the last accrual date. */
export function accruedInterest(outstanding: bigint, aprBps: number, since: Date, until = new Date()) {
  const days = Math.max(0, Math.floor((until.getTime() - since.getTime()) / DAY));
  if (outstanding <= 0n || days === 0 || aprBps === 0) return 0n;
  return BigInt(Math.round((Number(outstanding) * (aprBps / 10000) * days) / 365));
}

/** Original amortization schedule from the approved terms. */
export function buildSchedule(principal: bigint, aprBps: number, months: number, payment: bigint, firstDue: Date) {
  const r = aprBps / 10000 / 12;
  let bal = Number(principal);
  const rows: Array<{ n: number; dueDate: string; payment: string; principal: string; interest: string; balance: string }> = [];
  for (let n = 1; n <= months && bal > 0; n++) {
    const interest = Math.round(bal * r);
    let pay = Number(payment);
    let prin = pay - interest;
    if (n === months || prin >= bal) { prin = bal; pay = bal + interest; }
    bal -= prin;
    rows.push({ n, dueDate: isoDate(addMonths(firstDue, n - 1)), payment: String(pay), principal: String(prin), interest: String(interest), balance: String(bal) });
  }
  return rows;
}

export type LoanState = {
  outstanding: string; paidTotal: string; paidPrincipal: string; paidInterest: string; accrued: string; payoff: string;
  nextDueDate: string | null; nextDueAmount: string; installmentsPaid: number; daysPastDue: number; repayment: "current" | "overdue" | "paid_off" | null;
};

/** Derived servicing state of an approved loan row (requires the repayment columns). */
export function loanState(l: any, now = new Date()): LoanState {
  const empty: LoanState = { outstanding: "0", paidTotal: "0", paidPrincipal: "0", paidInterest: "0", accrued: "0", payoff: "0", nextDueDate: null, nextDueAmount: "0", installmentsPaid: 0, daysPastDue: 0, repayment: null };
  if (l.status !== "approved" || l.outstanding_minor == null) return empty;
  const outstanding = BigInt(l.outstanding_minor);
  const paidTotal = BigInt(l.paid_total_minor ?? 0);
  const paidPrincipal = BigInt(l.paid_principal_minor ?? 0);
  const paidInterest = BigInt(l.paid_interest_minor ?? 0);
  if (outstanding <= 0n || l.paid_off_at) {
    return { ...empty, paidTotal: paidTotal.toString(), paidPrincipal: paidPrincipal.toString(), paidInterest: paidInterest.toString(), installmentsPaid: Number(l.term_months), repayment: "paid_off" };
  }
  const accrued = accruedInterest(outstanding, Number(l.apr_bps ?? 0), new Date(l.last_accrual_at ?? l.decided_at), now);
  const pmt = BigInt(l.monthly_payment_minor ?? 0);
  const installmentsPaid = pmt > 0n ? Math.min(Number(l.term_months), Number(paidTotal / pmt)) : 0;
  const firstDue = new Date(l.first_due_date);
  const nextDue = addMonths(firstDue, installmentsPaid);
  const remainder = pmt - (paidTotal - BigInt(installmentsPaid) * pmt);
  const payoff = outstanding + accrued;
  const nextDueAmount = remainder > payoff ? payoff : remainder;
  const daysPastDue = Math.max(0, Math.floor((now.getTime() - nextDue.getTime()) / DAY));
  return {
    outstanding: outstanding.toString(), paidTotal: paidTotal.toString(), paidPrincipal: paidPrincipal.toString(), paidInterest: paidInterest.toString(),
    accrued: accrued.toString(), payoff: payoff.toString(), nextDueDate: isoDate(nextDue), nextDueAmount: nextDueAmount.toString(),
    installmentsPaid, daysPastDue, repayment: daysPastDue > 0 ? "overdue" : "current",
  };
}

/**
 * Apply a repayment inside an open DB transaction: debits the payer account, splits the money into
 * accrued interest (SYSTEM:LOAN_INTEREST) and principal (SYSTEM:LOANS), updates the loan balance.
 */
export async function applyLoanPayment(tx: any, input: {
  loanId: number; accountId: number; mode: "installment" | "payoff" | "custom"; amountMinor?: bigint | undefined;
  actorId: number; source: "customer" | "admin"; idempotencyKey: string; ownerId?: number;
}) {
  const dup = (await tx`select txn_id, reference from bank_loan_payments where idempotency_key = ${input.idempotencyKey}`)[0];
  if (dup) return { reference: dup.reference as string, duplicate: true, paidOff: false, amount: "0" };
  const l = (await tx`select * from bank_loan_requests where id = ${input.loanId} for update`)[0];
  if (!l || (input.ownerId != null && l.user_id !== input.ownerId)) throw new BankError("Loan not found.");
  if (l.status !== "approved" || l.outstanding_minor == null) throw new BankError("This loan is not in repayment.");
  const st = loanState(l);
  if (st.repayment === "paid_off") throw new BankError("This loan is already paid off.");
  const acc = (await tx`select id, user_id, currency, status, account_number from bank_accounts where id = ${input.accountId} for update`)[0];
  if (!acc || acc.user_id !== l.user_id) throw new BankError("Choose one of the borrower's own accounts.");
  if (acc.currency !== l.currency) throw new BankError(`Pay from a ${l.currency} account.`);
  if (acc.status !== "active") throw new BankError(`That account is ${acc.status}; payments can't be taken from it.`);

  const payoff = BigInt(st.payoff);
  let amount = input.mode === "payoff" ? payoff : input.mode === "installment" ? BigInt(st.nextDueAmount) : (input.amountMinor ?? 0n);
  if (amount <= 0n) throw new BankError("Enter a payment amount.");
  if (amount > payoff) amount = payoff; // never overpay
  const bal = (await balancesFor(tx, [acc.id])).get(acc.id)!;
  if (BigInt(bal.available) < amount) throw new BankError("Insufficient available balance for this payment.");

  const accrued = BigInt(st.accrued);
  const interest = amount < accrued ? amount : accrued;
  const principal = amount - interest;
  const newOutstanding = BigInt(l.outstanding_minor) - principal;
  const paidOff = newOutstanding <= 0n;
  const reference = newReference("LNP");
  const txn = (await tx`insert into bank_ledger_txns (idempotency_key, reference, description, status, created_by, posted_at, kind, from_account_id, amount_minor, currency, details)
    values (${"loanpay:" + input.idempotencyKey}, ${reference}, ${`Loan repayment · ${l.loan_type} loan #${l.id}`}, 'posted', ${input.actorId}, now(), 'loan_repayment', ${acc.id}, ${amount.toString()}, ${l.currency},
      ${tx.json({ loanId: l.id, principal: principal.toString(), interest: interest.toString(), source: input.source })}) returning id`)[0];
  await tx`insert into bank_ledger_entries (txn_id, account_id, currency, amount_minor) values (${txn.id}, ${acc.id}, ${l.currency}, ${(-amount).toString()})`;
  if (principal > 0n) await tx`insert into bank_ledger_entries (txn_id, system_account, currency, amount_minor) values (${txn.id}, ${"SYSTEM:LOANS:" + l.currency}, ${l.currency}, ${principal.toString()})`;
  if (interest > 0n) await tx`insert into bank_ledger_entries (txn_id, system_account, currency, amount_minor) values (${txn.id}, ${"SYSTEM:LOAN_INTEREST:" + l.currency}, ${l.currency}, ${interest.toString()})`;
  await tx`insert into bank_loan_payments (loan_id, txn_id, reference, account_id, amount_minor, principal_minor, interest_minor, source, created_by, idempotency_key)
    values (${l.id}, ${txn.id}, ${reference}, ${acc.id}, ${amount.toString()}, ${principal.toString()}, ${interest.toString()}, ${input.source}, ${input.actorId}, ${input.idempotencyKey})`;
  await tx`update bank_loan_requests set outstanding_minor = ${(paidOff ? 0n : newOutstanding).toString()},
      paid_total_minor = paid_total_minor + ${amount.toString()}, paid_principal_minor = paid_principal_minor + ${principal.toString()},
      paid_interest_minor = paid_interest_minor + ${interest.toString()}, last_accrual_at = now(),
      paid_off_at = ${paidOff ? tx`now()` : null}, updated_at = now() where id = ${l.id}`;
  const f = (v: bigint) => formatMinor(v.toString(), l.currency);
  await notify(tx, l.user_id, "loan", paidOff ? "Loan paid off" : "Loan payment received",
    paidOff
      ? `Congratulations — your ${l.loan_type} loan #${l.id} is paid in full. Final payment ${f(amount)} (ref ${reference}).`
      : `We received ${f(amount)} toward your ${l.loan_type} loan #${l.id} (${f(principal)} principal, ${f(interest)} interest). Remaining balance: ${f(newOutstanding)}. Ref ${reference}.`);
  await audit(tx, l.user_id, input.actorId, paidOff ? "loan.paid_off" : "loan.payment", { loanId: l.id, txnId: Number(txn.id), amount: amount.toString(), source: input.source });
  await checkLowBalance(tx, acc.id);
  return { reference, duplicate: false, paidOff, amount: amount.toString() };
}

export function mapPayment(p: any) {
  return {
    id: Number(p.id), reference: p.reference as string, amount: String(p.amount_minor), principal: String(p.principal_minor), interest: String(p.interest_minor),
    source: p.source as string, date: new Date(p.created_at).toISOString(), account: p.account_number ? `••••${String(p.account_number).slice(-4)}` : "—",
  };
}

/** Full detail (state + schedule + payments) for one loan row. */
export async function loanDetail(sql: any, l: any) {
  const payments = await sql`select p.*, a.account_number from bank_loan_payments p left join bank_accounts a on a.id = p.account_id where p.loan_id = ${l.id} order by p.created_at desc`;
  const state = loanState(l);
  const schedule = l.status === "approved" && l.first_due_date && l.monthly_payment_minor
    ? buildSchedule(BigInt(l.amount_minor), Number(l.apr_bps ?? 0), Number(l.term_months), BigInt(l.monthly_payment_minor), new Date(l.first_due_date)) : [];
  let cum = 0n;
  const paid = BigInt(l.paid_total_minor ?? 0);
  const today = isoDate(new Date());
  const rows = schedule.map((s) => {
    cum += BigInt(s.payment);
    const status = state.repayment === "paid_off" || paid >= cum ? "paid" : s.dueDate < today ? "overdue" : s.dueDate === state.nextDueDate ? "due" : "upcoming";
    return { ...s, status };
  });
  return { state, schedule: rows, payments: payments.map(mapPayment) };
}

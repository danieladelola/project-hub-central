import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMinor, fmtDate } from "@/lib/money";
import { cn } from "@/lib/utils";

export type LoanStateView = {
  outstanding: string; paidTotal: string; paidPrincipal: string; paidInterest: string; accrued: string; payoff: string;
  nextDueDate: string | null; nextDueAmount: string; installmentsPaid: number; daysPastDue: number; repayment: "current" | "overdue" | "paid_off" | null;
};
type Detail = {
  state: LoanStateView;
  schedule: Array<{ n: number; dueDate: string; payment: string; principal: string; interest: string; balance: string; status: string }>;
  payments: Array<{ id: number; reference: string; amount: string; principal: string; interest: string; source: string; date: string; account: string }>;
  accounts: Array<{ id: number; label: string; available: string }>;
};
type PayInput = { loanId: number; accountId: number; mode: "installment" | "payoff" | "custom"; amount?: number | undefined; idempotencyKey: string };

export function RepaymentBadge({ state }: { state: LoanStateView }) {
  if (!state.repayment) return null;
  if (state.repayment === "paid_off") return <Badge variant="secondary">Paid off</Badge>;
  if (state.repayment === "overdue") return <Badge variant="destructive">{state.daysPastDue} days past due</Badge>;
  return <Badge variant="outline">Current</Badge>;
}

export function LoanSummary({ state, currency, term }: { state: LoanStateView; currency: string; term: number }) {
  const f = (v: string) => formatMinor(v, currency);
  const items: Array<[string, string, boolean?]> = state.repayment === "paid_off"
    ? [["Total repaid", f(state.paidTotal)], ["Principal repaid", f(state.paidPrincipal)], ["Interest paid", f(state.paidInterest)], ["Installments", `${term} / ${term}`]]
    : [
      ["Balance left", f(state.outstanding)], ["Paid so far", f(state.paidTotal)],
      ["Next payment", state.nextDueDate ? `${f(state.nextDueAmount)} · ${fmtDate(state.nextDueDate)}` : "—", state.repayment === "overdue"],
      ["Payoff today", f(state.payoff)], ["Installments paid", `${state.installmentsPaid} / ${term}`], ["Accrued interest", f(state.accrued)],
    ];
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {items.map(([k, v, warn]) => (
        <div key={k} className="rounded-md border bg-muted/30 p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className={cn("mt-0.5 font-semibold", warn && "text-destructive")}>{v}</dd></div>
      ))}
    </dl>
  );
}

export function LoanServicing({ loanId, currency, term, load, pay, payLabel = "Make a payment", onChanged }: {
  loanId: number; currency: string; term: number;
  load: (a: { data: { id: number } }) => Promise<Detail>;
  pay: (a: { data: PayInput }) => Promise<{ ok: true; paidOff: boolean; amount: string; reference: string } | { ok: false; error: string }>;
  payLabel?: string; onChanged?: () => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [mode, setMode] = useState<PayInput["mode"]>("installment");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"schedule" | "payments">("schedule");
  const refresh = useCallback(() => load({ data: { id: loanId } }).then((x) => { setD(x); setAccountId((cur) => cur ?? x.accounts[0]?.id ?? null); })
    .catch((e) => setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not load loan." })), [load, loanId]);
  useEffect(() => { refresh(); }, [refresh]);
  if (!d) return msg ? <p className="text-sm text-destructive">{msg.text}</p> : <div className="h-24 animate-pulse rounded-md bg-muted" />;
  const f = (v: string) => formatMinor(v, currency);
  const s = d.state;
  const preview = mode === "installment" ? s.nextDueAmount : mode === "payoff" ? s.payoff : amount ? String(Math.round(Number(amount) * 100)) : "0";

  const submit = async () => {
    if (!accountId) return setMsg({ ok: false, text: `No active ${currency} account to pay from.` });
    const amt = mode === "custom" ? Number(amount) : undefined;
    if (mode === "custom" && (!Number.isFinite(amt) || !amt || amt <= 0)) return setMsg({ ok: false, text: "Enter a valid amount." });
    if (!window.confirm(`Pay ${f(preview)} toward loan #${loanId}?`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await pay({ data: { loanId, accountId, mode, amount: amt, idempotencyKey: crypto.randomUUID() } });
      setMsg(r.ok ? { ok: true, text: r.paidOff ? `Final payment of ${f(r.amount)} received — the loan is paid off.` : `Payment of ${f(r.amount)} posted (ref ${r.reference}).` } : { ok: false, text: r.error });
      if (r.ok) { setAmount(""); await refresh(); onChanged?.(); }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Payment failed." }); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <LoanSummary state={s} currency={currency} term={term} />
      {msg && <p className={cn("text-sm", msg.ok ? "text-primary" : "text-destructive")}>{msg.text}</p>}
      {s.repayment && s.repayment !== "paid_off" && (() => {
        const remainingScheduled = (d.schedule ?? []).slice(s.installmentsPaid).reduce((t: number, r: { payment: string }) => t + Number(r.payment), 0);
        const saved = Math.max(0, remainingScheduled - Number(s.payoff));
        return (
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-medium">Early payoff</p>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Remaining balance</p><p className="font-medium">{f(s.outstanding)}</p></div>
              <div><p className="text-xs text-muted-foreground">Interest to date</p><p className="font-medium">{f(s.accrued)}</p></div>
              <div><p className="text-xs text-muted-foreground">Payoff amount today</p><p className="font-semibold">{f(s.payoff)}</p></div>
              <div><p className="text-xs text-muted-foreground">Est. interest saved</p><p className="font-medium text-primary">{f(String(saved))}</p></div>
            </div>
            <Button size="sm" className="mt-3" variant={mode === "payoff" ? "default" : "outline"} onClick={() => setMode("payoff")}>
              {mode === "payoff" ? "Payoff selected — confirm below" : "Pay off loan early"}</Button>
          </div>
        );
      })()}
      {s.repayment && s.repayment !== "paid_off" && (
        <div className="rounded-md border p-3">
          <p className="mb-2 text-sm font-medium">{payLabel}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1"><Label className="text-xs">From account</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value))}>
                {d.accounts.length === 0 && <option value="">No {currency} account</option>}
                {d.accounts.map((a) => <option key={a.id} value={a.id}>{a.label} · {f(a.available)} available</option>)}
              </select></div>
            <div className="space-y-1"><Label className="text-xs">Amount</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value as PayInput["mode"])}>
                <option value="installment">Amount due · {f(s.nextDueAmount)}</option>
                <option value="payoff">Pay off in full · {f(s.payoff)}</option>
                <option value="custom">Other amount</option>
              </select></div>
            {mode === "custom" && <div className="space-y-1"><Label className="text-xs">Custom amount ({currency})</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-9" /></div>}
            <div className="flex items-end"><Button className="w-full" disabled={busy || !accountId} onClick={submit}>{busy ? "Processing…" : `Pay ${f(preview)}`}</Button></div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Payments cover accrued interest first, then reduce the principal. Extra payments shorten the loan.</p>
        </div>
      )}
      <div className="flex gap-1 border-b text-sm">
        {(["schedule", "payments"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={cn("-mb-px border-b-2 px-3 py-1.5 capitalize", view === v ? "border-primary font-medium" : "border-transparent text-muted-foreground")}>
            {v === "schedule" ? "Repayment schedule" : `Payments (${d.payments.length})`}</button>
        ))}
      </div>
      {view === "schedule" ? (
        <div className="max-h-80 overflow-auto"><table className="w-full min-w-[560px] text-sm">
          <thead className="sticky top-0 bg-card"><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">#</th><th>Due date</th><th className="text-right">Payment</th><th className="text-right">Principal</th><th className="text-right">Interest</th><th className="text-right">Balance</th><th className="pl-3">Status</th></tr></thead>
          <tbody>{d.schedule.map((r) => (
            <tr key={r.n} className={cn("border-b last:border-0", r.status === "overdue" && "bg-destructive/5")}>
              <td className="py-1.5">{r.n}</td><td>{fmtDate(r.dueDate)}</td><td className="text-right">{f(r.payment)}</td><td className="text-right">{f(r.principal)}</td><td className="text-right">{f(r.interest)}</td><td className="text-right">{f(r.balance)}</td>
              <td className="pl-3"><span className={cn("text-xs capitalize", r.status === "paid" && "text-primary", r.status === "overdue" && "font-medium text-destructive", r.status === "due" && "font-medium")}>{r.status}</span></td>
            </tr>))}</tbody>
        </table></div>
      ) : d.payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Date</th><th>Reference</th><th>From</th><th className="text-right">Amount</th><th className="text-right">Principal</th><th className="text-right">Interest</th><th className="pl-3">By</th></tr></thead>
          <tbody>{d.payments.map((p) => (
            <tr key={p.id} className="border-b last:border-0"><td className="py-1.5">{fmtDate(p.date)}</td><td className="font-mono text-xs">{p.reference}</td><td>{p.account}</td><td className="text-right">{f(p.amount)}</td><td className="text-right">{f(p.principal)}</td><td className="text-right">{f(p.interest)}</td><td className="pl-3 capitalize">{p.source === "admin" ? "Bank staff" : "Customer"}</td></tr>))}</tbody>
        </table></div>
      )}
    </div>
  );
}

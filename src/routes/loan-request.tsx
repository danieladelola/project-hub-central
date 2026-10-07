import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountPage, Panel, errText } from "@/components/AccountPage";
import { listMyLoanRequests, requestLoan } from "@/lib/loans.functions";
import { formatMinor, fmtDate } from "@/lib/money";

export const Route = createFileRoute("/loan-request")({
  ssr: false,
  head: () => ({ meta: [{ title: "Loan Request — Universal Crest" }, { name: "description", content: "Apply for a personal, mortgage, auto, education or business loan." }, { property: "og:title", content: "Loan Request — Universal Crest" }, { property: "og:description", content: "Apply for a loan online." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: LoanRequestPage,
});

const TYPES = [["personal", "Personal loan"], ["mortgage", "Mortgage"], ["auto", "Auto loan"], ["education", "Education loan"], ["business", "Business loan"]] as const;
const EMPLOY = [["employed", "Employed"], ["self_employed", "Self-employed"], ["business_owner", "Business owner"], ["student", "Student"], ["retired", "Retired"], ["other", "Other"]] as const;
type LoanItem = { id: number; type: string; amount: string; currency: string; termMonths: number; status: string; note: string | null; createdAt: string };
const sel = "h-11 w-full rounded-md border bg-background px-3 text-sm";

function LoanRequestPage() {
  const list = useServerFn(listMyLoanRequests);
  const submit = useServerFn(requestLoan);
  const [items, setItems] = useState<Awaited<ReturnType<typeof listMyLoanRequests>> | null>(null);
  const [f, setF] = useState({ type: "personal", amount: "10000", currency: "USD", termMonths: "36", purpose: "", monthlyIncome: "", employment: "employed" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const reload = useCallback(() => list().then(setItems).catch(() => setItems([])), [list]);
  useEffect(() => { reload(); }, [reload]);
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await submit({ data: { type: f.type as "personal", amount: Number(f.amount), currency: f.currency as "USD", termMonths: Number(f.termMonths), purpose: f.purpose, monthlyIncome: Number(f.monthlyIncome || 0), employment: f.employment as "employed" } });
      if (r.ok) { setMsg({ ok: true, text: "Your loan request has been submitted. We'll notify you once it's reviewed." }); setF({ ...f, purpose: "" }); reload(); }
      else setMsg({ ok: false, text: r.error });
    } catch (err) { setMsg({ ok: false, text: errText(err) }); } finally { setBusy(false); }
  }

  return (
    <AccountPage title="Loan Request" subtitle="Apply for a loan. Every request is reviewed by our lending team." wide>
      <Panel title="New loan request">
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="type">Loan type</Label><select id="type" className={sel} value={f.type} onChange={up("type")}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <div className="space-y-2"><Label htmlFor="amount">Amount</Label><Input id="amount" type="number" min={500} step="0.01" required value={f.amount} onChange={up("amount")} className="h-11" /></div>
            <div className="space-y-2"><Label htmlFor="cur">Currency</Label><select id="cur" className={sel} value={f.currency} onChange={up("currency")}>{["USD"].map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
          <div className="space-y-2"><Label htmlFor="term">Repayment term</Label><select id="term" className={sel} value={f.termMonths} onChange={up("termMonths")}>{[6, 12, 24, 36, 48, 60, 84, 120, 180, 240, 360].map((m) => <option key={m} value={m}>{m < 24 ? `${m} months` : `${m / 12} years`}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="emp">Employment status</Label><select id="emp" className={sel} value={f.employment} onChange={up("employment")}>{EMPLOY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="inc">Monthly income ({f.currency})</Label><Input id="inc" type="number" min={0} step="0.01" required value={f.monthlyIncome} onChange={up("monthlyIncome")} className="h-11" /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="purpose">Purpose of the loan</Label><textarea id="purpose" required minLength={10} maxLength={1000} rows={3} value={f.purpose} onChange={up("purpose")} className="w-full rounded-md border bg-background p-3 text-sm" /></div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <Button type="submit" className="h-11" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</Button>
            {msg && <p className={msg.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{msg.text}</p>}
          </div>
        </form>
      </Panel>
      <Panel title="Recent requests" description={items && items.length > 0 ? `${items.filter((l: LoanItem) => l.status === "pending").length} under review` : undefined}>
        {!items ? <div className="h-16 animate-pulse rounded-md bg-muted" /> : items.length === 0 ? <p className="text-sm text-muted-foreground">You haven't requested a loan yet.</p> : (
          <ul className="divide-y text-sm">{items.slice(0, 3).map((l: LoanItem) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><span className="capitalize">{l.type}</span> · {formatMinor(l.amount, l.currency)} · {fmtDate(l.createdAt)}</span><span className="capitalize text-muted-foreground">{l.status === "pending" ? "Under review" : l.status}</span></li>
          ))}</ul>
        )}
        <Button asChild variant="outline" className="mt-4"><Link to="/loan-history">View full loan history</Link></Button>
      </Panel>
    </AccountPage>
  );
}

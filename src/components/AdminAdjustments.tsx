import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { adminListAdjustments, adminManualAdjustment, adminSearchAccounts } from "@/lib/admin.functions";
import { formatMinor, fmtDate } from "@/lib/money";
import { cn } from "@/lib/utils";

const CATEGORIES: Array<{ value: string; label: string; dir: "credit" | "debit"; memo: string }> = [
  { value: "opening_deposit", label: "Opening deposit", dir: "credit", memo: "Opening deposit" },
  { value: "correction", label: "Balance correction", dir: "credit", memo: "Account correction" },
  { value: "dispute_credit", label: "Dispute credit", dir: "credit", memo: "Dispute resolution credit" },
  { value: "fee_reversal", label: "Fee reversal", dir: "credit", memo: "Fee reversal" },
  { value: "interest_credit", label: "Interest credit", dir: "credit", memo: "Interest credit" },
  { value: "fee_charge", label: "Fee charge", dir: "debit", memo: "Service fee" },
  { value: "chargeback", label: "Chargeback / reversal", dir: "debit", memo: "Credit reversal" },
  { value: "other", label: "Other", dir: "credit", memo: "" },
];
const catLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;
type Acct = Awaited<ReturnType<typeof adminSearchAccounts>>[number];

export function AdminAdjustments() {
  const search = useServerFn(adminSearchAccounts);
  const post = useServerFn(adminManualAdjustment);
  const list = useServerFn(adminListAdjustments);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Acct[] | null>(null);
  const [acct, setAcct] = useState<Acct | null>(null);
  const [category, setCategory] = useState("opening_deposit");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("Opening deposit");
  const [reason, setReason] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminListAdjustments>> | null>(null);
  const refresh = useCallback(() => list().then(setRows).catch(() => setRows([])), [list]);
  useEffect(() => { refresh(); }, [refresh]);

  const pickCategory = (v: string) => {
    const c = CATEGORIES.find((x) => x.value === v)!;
    setCategory(v); setDirection(c.dir); setMemo(c.memo);
  };
  const doSearch = async () => {
    if (q.trim().length < 2) return;
    try { setResults(await search({ data: { q } })); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Search failed." }); }
  };
  const submit = async () => {
    if (!acct) return;
    if (!/^\d{1,13}(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0) return setMsg({ ok: false, text: "Enter an amount like 100 or 100.50." });
    if (reason.trim().length < 10) return setMsg({ ok: false, text: "Give an internal reason of at least 10 characters." });
    const shown = formatMinor(String(Math.round(Number(amount) * 100)), acct.currency);
    if (!window.confirm(`${direction === "credit" ? "CREDIT" : "DEBIT"} ${shown} ${direction === "credit" ? "to" : "from"} ${acct.customer}'s account ••••${acct.number.slice(-4)}?\n\nThis posts immediately and cannot be edited. A reversal requires an opposite adjustment.`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await post({ data: { accountId: acct.id, direction, category: category as never, amount: amount.trim(), memo, reason, notifyCustomer, idempotencyKey: key } });
      if (r.ok) {
        setMsg({ ok: true, text: `Posted ${shown} ${direction} · ref ${r.reference}.` });
        setAmount(""); setReason(""); setKey(crypto.randomUUID()); setAcct(null); setResults(null); setQ("");
        refresh();
      } else setMsg({ ok: false, text: r.error });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not post adjustment." }); }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold">Post a manual adjustment</h3>
        <p className="mt-1 text-sm text-muted-foreground">Credits or debits a customer account with a recorded reason. Every adjustment is double-entry, audit-logged and cannot be edited.</p>
        {msg && <p className={cn("mt-3 text-sm", msg.ok ? "text-primary" : "text-destructive")}>{msg.text}</p>}

        <div className="mt-4 space-y-2">
          <Label>1. Find the account</Label>
          {acct ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex-1"><p className="font-medium">{acct.customer} · {acct.nickname} ••••{acct.number.slice(-4)}</p><p className="text-xs text-muted-foreground">{acct.email} · {acct.currency} · balance {formatMinor(acct.current, acct.currency)} · available {formatMinor(acct.available, acct.currency)}</p></div>
              {acct.status !== "active" && <Badge variant="destructive" className="capitalize">{acct.status}</Badge>}
              <Button size="sm" variant="ghost" onClick={() => setAcct(null)}>Change</Button>
            </div>
          ) : (
            <>
              <div className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()} placeholder="Customer name, email or account number" /><Button variant="outline" onClick={doSearch}>Search</Button></div>
              {results && (results.length === 0 ? <p className="text-sm text-muted-foreground">No matching accounts.</p> : (
                <div className="divide-y rounded-md border">{results.map((a) => (
                  <button key={a.id} onClick={() => setAcct(a)} className="flex w-full items-center gap-3 p-2 text-left text-sm hover:bg-muted/50">
                    <span className="flex-1"><span className="font-medium">{a.customer}</span> · {a.nickname} ••••{a.number.slice(-4)} <span className="text-xs text-muted-foreground">{a.email}</span></span>
                    <span className="text-xs capitalize text-muted-foreground">{a.status}</span><span>{formatMinor(a.current, a.currency)}</span>
                  </button>))}</div>
              ))}
            </>
          )}
        </div>

        {acct && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1"><Label>2. Type</Label>
              <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={category} onChange={(e) => pickCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select></div>
            <div className="space-y-1"><Label>Direction</Label>
              <div className="flex gap-2">{(["credit", "debit"] as const).map((d) => (
                <Button key={d} type="button" variant={direction === d ? (d === "debit" ? "destructive" : "default") : "outline"} className="flex-1 capitalize" onClick={() => setDirection(d)}>{d === "credit" ? "Credit (add money)" : "Debit (remove money)"}</Button>
              ))}</div></div>
            <div className="space-y-1"><Label>Amount ({acct.currency})</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-1"><Label>Statement description (customer sees this)</Label><Input value={memo} maxLength={80} onChange={(e) => setMemo(e.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Internal reason (staff only, required)</Label><Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Ticket #142 — duplicate card fee charged on 3 Oct, refunded after review." /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} /> Notify the customer</label>
            <div className="sm:col-span-2"><Button disabled={busy} variant={direction === "debit" ? "destructive" : "default"} onClick={submit}>{busy ? "Posting…" : `Post ${direction}`}</Button></div>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 font-semibold">Adjustment register</h3>
        {!rows ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No manual adjustments yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Date</th><th>Reference</th><th>Customer / account</th><th>Type</th><th className="text-right">Amount</th><th className="pl-4">Reason</th><th>By</th></tr></thead>
            <tbody>{rows.map((r: (typeof rows)[number]) => (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap py-2">{fmtDate(r.date)}</td><td className="font-mono text-xs">{r.reference}</td>
                <td>{r.customer}<p className="text-xs text-muted-foreground">{r.account}</p></td>
                <td>{catLabel(r.category)}<p className="text-xs text-muted-foreground">{r.memo}</p></td>
                <td className={cn("whitespace-nowrap text-right font-medium", r.direction === "debit" ? "text-destructive" : "text-primary")}>{r.direction === "debit" ? "−" : "+"}{formatMinor(r.amount, r.currency)}</td>
                <td className="max-w-[18rem] pl-4 text-xs">{r.reason}</td><td className="text-xs">{r.staff}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

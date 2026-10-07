import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { adminCreateHold, adminListHolds, adminReleaseHoldWithReason, adminSearchAccounts } from "@/lib/admin.functions";
import { formatMinor, fmtDate } from "@/lib/money";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  ["fraud_review", "Fraud review"], ["dispute", "Dispute / chargeback"], ["deposit_verification", "Deposit verification"],
  ["compliance", "Compliance / AML"], ["legal", "Legal order / garnishment"], ["collateral", "Collateral"], ["other", "Other"],
] as const;
const catLabel = (v: string) => CATEGORIES.find(([k]) => k === v)?.[1] ?? v;
type Acct = Awaited<ReturnType<typeof adminSearchAccounts>>[number];
type Data = Awaited<ReturnType<typeof adminListHolds>>;

export function AdminHolds() {
  const list = useServerFn(adminListHolds);
  const create = useServerFn(adminCreateHold);
  const release = useServerFn(adminReleaseHoldWithReason);
  const search = useServerFn(adminSearchAccounts);
  const [status, setStatus] = useState<"active" | "released" | "expired" | "all">("active");
  const [filterQ, setFilterQ] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Acct[] | null>(null);
  const [acct, setAcct] = useState<Acct | null>(null);
  const [category, setCategory] = useState<string>("fraud_review");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [days, setDays] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => list({ data: { status, q: filterQ || undefined } }).then(setData)
    .catch((e) => { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not load holds." }); setData({ totals: [], rows: [] }); }), [list, status, filterQ]);
  useEffect(() => { refresh(); }, [refresh]);

  const doSearch = async () => { if (q.trim().length >= 2) setResults(await search({ data: { q } }).catch(() => [])); };
  const reset = () => { setAcct(null); setResults(null); setQ(""); setAmount(""); setReason(""); setCustomerNote(""); setDays(""); setShowForm(false); };

  const place = async () => {
    if (!acct) return;
    if (!/^\d{1,13}(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0) return setMsg({ ok: false, text: "Enter an amount like 100 or 100.50." });
    if (reason.trim().length < 10) return setMsg({ ok: false, text: "Give an internal reason of at least 10 characters." });
    const d = days.trim() ? Number(days) : undefined;
    if (d !== undefined && (!Number.isInteger(d) || d < 1 || d > 365)) return setMsg({ ok: false, text: "Auto-release must be 1–365 days, or leave it empty." });
    const shown = formatMinor(String(Math.round(Number(amount) * 100)), acct.currency);
    if (!window.confirm(`Place a hold of ${shown} on ${acct.customer}'s account ••••${acct.number.slice(-4)}?`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await create({ data: { accountId: acct.id, category: category as never, amount: amount.trim(), reason, customerNote: customerNote || undefined, expiresInDays: d, notifyCustomer } });
      if (r.ok) { setMsg({ ok: true, text: `Hold of ${shown} placed.${r.warning ? " " + r.warning : ""}` }); reset(); refresh(); }
      else setMsg({ ok: false, text: r.error });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not place hold." }); }
    setBusy(false);
  };

  const doRelease = async (h: Data["rows"][number]) => {
    const why = window.prompt(`Release the hold of ${formatMinor(h.amount, h.currency)} on ${h.customer}'s account?\nEnter the release reason (staff only):`);
    if (why === null) return;
    if (why.trim().length < 3) return setMsg({ ok: false, text: "Enter a release reason." });
    const tell = window.confirm("Notify the customer that the funds are available again?");
    try {
      const r = await release({ data: { holdId: h.id, reason: why.trim(), notifyCustomer: tell } });
      setMsg(r.ok ? { ok: true, text: "Hold released." } : { ok: false, text: r.error }); refresh();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not release hold." }); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Active holds</p><p className="mt-1 font-semibold">{data ? data.totals.reduce((n, t) => n + t.count, 0) : "…"}</p></div>
        <div className="rounded-lg border bg-card p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Funds on hold</p><p className="mt-1 font-semibold">{data ? (data.totals.map((t) => formatMinor(t.total, t.currency)).join(" · ") || "—") : "…"}</p></div>
        <div className="flex items-center justify-end"><Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Close" : "Place a hold"}</Button></div>
      </div>
      {msg && <p className={cn("text-sm", msg.ok ? "text-primary" : "text-destructive")}>{msg.text}</p>}

      {showForm && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Place a hold</h3>
          <p className="mt-1 text-sm text-muted-foreground">Held funds stay in the account but can't be spent, sent or withdrawn until released.</p>
          <div className="mt-4 space-y-2">
            <Label>Account</Label>
            {acct ? (
              <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm">
                <div className="flex-1"><p className="font-medium">{acct.customer} · {acct.nickname} ••••{acct.number.slice(-4)}</p><p className="text-xs text-muted-foreground">{acct.email} · balance {formatMinor(acct.current, acct.currency)} · available {formatMinor(acct.available, acct.currency)}</p></div>
                <Button size="sm" variant="ghost" onClick={() => setAcct(null)}>Change</Button>
              </div>
            ) : (
              <>
                <div className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()} placeholder="Customer name, email or account number" /><Button variant="outline" onClick={doSearch}>Search</Button></div>
                {results && (results.length === 0 ? <p className="text-sm text-muted-foreground">No matching accounts.</p> : (
                  <div className="divide-y rounded-md border">{results.map((a) => (
                    <button key={a.id} onClick={() => setAcct(a)} className="flex w-full items-center gap-3 p-2 text-left text-sm hover:bg-muted/50">
                      <span className="flex-1"><span className="font-medium">{a.customer}</span> · {a.nickname} ••••{a.number.slice(-4)}</span><span>{formatMinor(a.available, a.currency)} avail.</span>
                    </button>))}</div>
                ))}
              </>
            )}
          </div>
          {acct && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="space-y-1"><Label>Hold type</Label>
                <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></div>
              <div className="space-y-1"><Label>Amount ({acct.currency})</Label>
                <div className="flex gap-2"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                  <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => setAmount((Math.max(0, Number(acct.available)) / 100).toFixed(2))}>All available</Button></div></div>
              <div className="space-y-1"><Label>Auto-release after (days, optional)</Label><Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} placeholder="No expiry" /></div>
              <div className="space-y-1 sm:col-span-3"><Label>Internal reason (staff only, required)</Label><Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Mobile check deposit #1182 pending clearance." /></div>
              <div className="space-y-1 sm:col-span-3"><Label>Message to customer (optional)</Label><Input value={customerNote} maxLength={200} onChange={(e) => setCustomerNote(e.target.value)} placeholder="e.g. Pending verification of a recent deposit" /></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} /> Notify the customer</label>
              <div><Button disabled={busy} onClick={place}>{busy ? "Placing…" : "Place hold"}</Button></div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["active", "expired", "released", "all"] as const).map((s) => <Button key={s} size="sm" variant={status === s ? "default" : "outline"} className="capitalize" onClick={() => setStatus(s)}>{s}</Button>)}
        <Input value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="Filter by customer, account or reason" className="ml-auto h-9 max-w-xs" />
      </div>

      {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : data.rows.length === 0 ? <p className="text-sm text-muted-foreground">No holds in this view.</p> : (
        <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[900px] text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3">Placed</th><th>Customer / account</th><th>Type</th><th className="text-right">Amount</th><th className="pl-4">Reason</th><th>Status</th><th /></tr></thead>
          <tbody>{data.rows.map((h) => (
            <tr key={h.id} className="border-b align-top last:border-0">
              <td className="whitespace-nowrap p-3">{fmtDate(h.createdAt)}<p className="text-xs text-muted-foreground">by {h.placedBy}</p></td>
              <td>{h.customer}<p className="text-xs text-muted-foreground">{h.account}</p></td>
              <td>{catLabel(h.category)}</td>
              <td className="whitespace-nowrap text-right font-medium">{formatMinor(h.amount, h.currency)}</td>
              <td className="max-w-[18rem] pl-4 text-xs">{h.reason}{h.customerNote && <p className="mt-1 text-muted-foreground">Customer sees: {h.customerNote}</p>}{h.releaseReason && <p className="mt-1 text-muted-foreground">Released: {h.releaseReason}</p>}</td>
              <td className="py-3">
                <Badge variant={h.status === "active" ? "default" : "outline"} className="capitalize">{h.status}</Badge>
                {h.status === "active" && h.expiresAt && <p className="mt-1 text-xs text-muted-foreground">Auto-releases {fmtDate(h.expiresAt)}</p>}
                {h.status === "released" && h.releasedAt && <p className="mt-1 text-xs text-muted-foreground">{fmtDate(h.releasedAt)}{h.releasedBy ? ` · ${h.releasedBy}` : ""}</p>}
                {h.status === "expired" && h.expiresAt && <p className="mt-1 text-xs text-muted-foreground">Expired {fmtDate(h.expiresAt)}</p>}
              </td>
              <td className="pr-3 text-right">{h.status === "active" && <Button size="sm" variant="outline" onClick={() => doRelease(h)}>Release</Button>}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </div>
  );
}

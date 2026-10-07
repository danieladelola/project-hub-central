import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AccountPage, Panel } from "@/components/AccountPage";
import { listAccounts, listTransactions } from "@/lib/banking.functions";
import { formatMinor } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DISPUTE_REASONS, cancelDispute, fileDispute, myDisputes } from "@/lib/safety.functions";

export const Route = createFileRoute("/transactions")({
  ssr: false,
  head: () => ({ meta: [{ title: "Transactions — Universal Crest" }, { name: "description", content: "Every transaction across your Universal Crest accounts." }, { property: "og:title", content: "Transactions — Universal Crest" }, { property: "og:description", content: "Every transaction across your Universal Crest accounts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: TransactionsPage,
});

type Row = Awaited<ReturnType<typeof listTransactions>>[number];
type Status = "all" | "posted" | "pending" | "cancelled";
type Dir = "all" | "in" | "out";
const sel = "h-11 rounded-md border bg-background px-3 text-sm";

function TransactionsPage() {
  const load = useServerFn(listTransactions);
  const accs = useServerFn(listAccounts);
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof listAccounts>>>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [accountId, setAccountId] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [direction, setDirection] = useState<Dir>("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [disputing, setDisputing] = useState<Row | null>(null);

  useEffect(() => { accs().then(setAccounts).catch(() => {}); }, [accs]);
  useEffect(() => {
    const t = setTimeout(() => {
      setRows(null); setError("");
      load({ data: { accountId: accountId ? Number(accountId) : undefined, status, direction, q } })
        .then(setRows).catch(() => { setRows([]); setError("We couldn't load your transactions. Please try again."); });
    }, 250);
    return () => clearTimeout(t);
  }, [load, accountId, status, direction, q]);

  return (
    <AccountPage title="Transactions" subtitle="Every payment in and out of your Universal Crest accounts." wide>
      <Panel title="Filter">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2"><Label htmlFor="tx-account">Account</Label><select id="tx-account" className={`${sel} w-full`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.nickname} · {a.currency}</option>)}
          </select></div>
          <div className="space-y-2"><Label htmlFor="tx-status">Status</Label><select id="tx-status" className={`${sel} w-full`} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="all">All statuses</option><option value="posted">Completed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option>
          </select></div>
          <div className="space-y-2"><Label htmlFor="tx-direction">Direction</Label><select id="tx-direction" className={`${sel} w-full`} value={direction} onChange={(e) => setDirection(e.target.value as Dir)}>
            <option value="all">Money in & out</option><option value="in">Money in</option><option value="out">Money out</option>
          </select></div>
          <div className="space-y-2"><Label htmlFor="tx-search">Search</Label><Input id="tx-search" placeholder="Description or reference" value={q} onChange={(e) => setQ(e.target.value)} className="h-11" /></div>
        </div>
      </Panel>
      {disputing && <DisputeForm row={disputing} onClose={() => setDisputing(null)} />}
      <MyDisputes key={disputing ? "open" : "closed"} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!rows ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="text-muted-foreground">No transactions found.</p> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3">Account</th><th className="p-3">Reference</th><th className="p-3">Status</th><th className="p-3 text-right">Amount</th><th className="p-3"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="whitespace-nowrap p-3">{new Date(r.date).toLocaleString()}</td>
                  <td className="p-3"><p className="font-medium">{r.description}</p>{r.memo && <p className="text-xs text-muted-foreground">{r.memo}</p>}</td>
                  <td className="whitespace-nowrap p-3">{r.accountName} <span className="text-muted-foreground">•••• {r.accountNumber.slice(-4)}</span></td>
                  <td className="p-3 font-mono text-xs">{r.reference}</td>
                  <td className="p-3"><Badge variant={r.status === "posted" ? "default" : r.status === "pending" ? "secondary" : "outline"}>{r.status === "posted" ? "Completed" : r.status === "pending" ? "Pending" : "Cancelled"}</Badge></td>
                  <td className={`whitespace-nowrap p-3 text-right font-semibold ${r.amount.startsWith("-") ? "text-destructive" : "text-primary"}`}>{formatMinor(r.amount, r.currency, { signed: true })}</td>
                  <td className="p-3 text-right"><Button size="sm" variant="ghost" onClick={() => setDisputing(r)}>Dispute</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t p-3 text-xs text-muted-foreground">{rows.length} transaction{rows.length === 1 ? "" : "s"}{rows.length >= 1000 ? " (showing latest 1,000)" : ""}</p>
        </div>
      )}
    </AccountPage>
  );
}

function DisputeForm({ row, onClose }: { row: Row; onClose: () => void }) {
  const file = useServerFn(fileDispute);
  const [reason, setReason] = useState<(typeof DISPUTE_REASONS)[number]>(DISPUTE_REASONS[0]);
  const [details, setDetails] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Panel title="Dispute a transaction" description={`${row.reference} · ${row.description} · ${formatMinor(row.amount, row.currency, { signed: true })}`}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setMsg(null);
        try {
          const r = await file({ data: { txnId: row.txnId, accountId: row.accountId, reason, details } });
          if (r.ok) onClose(); else setMsg({ ok: false, text: r.error });
        } catch (x) { setMsg({ ok: false, text: x instanceof Error ? x.message : "Something went wrong." }); }
        finally { setBusy(false); }
      }}>
        <div className="space-y-2"><Label htmlFor="d-reason">What's wrong?</Label>
          <select id="d-reason" className={`${sel} w-full`} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            {DISPUTE_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select></div>
        <div className="space-y-2"><Label htmlFor="d-details">Details</Label>
          <Textarea id="d-details" required minLength={10} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Tell us what happened" /></div>
        <p className="text-xs text-muted-foreground">If you think someone else has access to your account, change your password and PIN now in Security settings.</p>
        {msg && <p className="text-sm text-destructive">{msg.text}</p>}
        <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? "Sending…" : "Submit dispute"}</Button><Button type="button" variant="outline" onClick={onClose}>Cancel</Button></div>
      </form>
    </Panel>
  );
}

function MyDisputes() {
  const load = useServerFn(myDisputes);
  const cancel = useServerFn(cancelDispute);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof myDisputes>>>([]);
  const refresh = () => load().then(setRows).catch(() => {});
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (rows.length === 0) return null;
  const label: Record<string, string> = { open: "Under review", resolved: "Resolved", rejected: "Declined", cancelled: "Withdrawn" };
  return (
    <Panel title="Your disputes">
      <ul className="divide-y text-sm">
        {rows.map((d: { id: number; reference: string; reason: string; status: string; adminNote: string; createdAt: string }) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="font-mono text-xs">{d.reference}</span><span>{d.reason}</span>
            <Badge variant={d.status === "open" ? "secondary" : "outline"}>{label[d.status] ?? d.status}</Badge>
            <span className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleDateString()}</span>
            {d.adminNote && <span className="w-full text-muted-foreground">Our reply: {d.adminNote}</span>}
            {d.status === "open" && <Button size="sm" variant="ghost" className="ml-auto" onClick={async () => { await cancel({ data: { id: d.id } }); refresh(); }}>Withdraw</Button>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

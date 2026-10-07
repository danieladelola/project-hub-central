import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AccountPage, Panel, Msg, errText } from "@/components/AccountPage";
import { cancelTaxRefund, listMyTaxRefunds, listMyUsdAccounts, requestTaxRefund } from "@/lib/services.functions";
import { formatMinor, fmtDate } from "@/lib/money";

export const Route = createFileRoute("/tax-refund")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "IRS Tax Refund — Universal Crest" },
      { name: "description", content: "Request your IRS tax refund to be deposited into your Universal Crest account." },
      { property: "og:title", content: "IRS Tax Refund — Universal Crest" },
      { property: "og:description", content: "Request your IRS tax refund deposit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TaxRefundPage,
});

const FILING = [["single", "Single"], ["married_joint", "Married filing jointly"], ["married_separate", "Married filing separately"], ["head_of_household", "Head of household"], ["widow", "Qualifying surviving spouse"]] as const;
const sel = "h-11 w-full rounded-md border bg-background px-3 text-sm";
const label = (s: string) => (s === "pending" ? "Under review" : s);

function TaxRefundPage() {
  const list = useServerFn(listMyTaxRefunds);
  const accts = useServerFn(listMyUsdAccounts);
  const submit = useServerFn(requestTaxRefund);
  const cancel = useServerFn(cancelTaxRefund);
  const [items, setItems] = useState<Awaited<ReturnType<typeof listMyTaxRefunds>> | null>(null);
  const [accounts, setAccounts] = useState<Array<{ id: number; label: string }> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => list().then(setItems).catch((e) => { setItems([]); setMsg({ ok: false, text: errText(e) }); }), [list]);
  useEffect(() => { reload(); accts().then(setAccounts).catch(() => setAccounts([])); }, [reload, accts]);
  const year = new Date().getFullYear();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true); setMsg(null);
    try {
      const r = await submit({ data: { year: Number(f.get("year")), filing: f.get("filing") as "single", ssnLast4: String(f.get("ssn")), form: f.get("form") as "1040", agi: Number(f.get("agi")), withheld: Number(f.get("withheld")), amount: Number(f.get("amount")), accountId: Number(f.get("account")) } });
      if (r.ok) { setMsg({ ok: true, text: "Request submitted. We'll notify you once it's reviewed." }); form.reset(); reload(); }
      else setMsg({ ok: false, text: r.error });
    } catch (x) { setMsg({ ok: false, text: errText(x) }); } finally { setBusy(false); }
  }

  return (
    <AccountPage title="IRS Tax Refund" subtitle="Have your federal tax refund deposited straight into your account." wide>
      <Panel title="New refund request" description="Refunds can be claimed for the last 3 tax years. Only the last 4 digits of your SSN or ITIN are needed. Our team verifies each request before any deposit.">
        {accounts && accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">You need an active USD account to receive a refund. <Link to="/accounts" className="text-primary underline">Open one in Accounts</Link>.</p>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="year">Tax year</Label><select id="year" name="year" className={sel} defaultValue={year - 1}>{Array.from({ length: 3 }, (_, i) => year - 1 - i).map((y) => <option key={y}>{y}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="filing">Filing status</Label><select id="filing" name="filing" className={sel}>{FILING.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="ssn">Last 4 of SSN / ITIN</Label><Input id="ssn" name="ssn" inputMode="numeric" maxLength={4} pattern="\d{4}" required className="h-11" autoComplete="off" /></div>
            <div className="space-y-2"><Label htmlFor="form">Return filed</Label><select id="form" name="form" className={sel}><option value="1040">Form 1040</option><option value="1040-SR">Form 1040-SR (65 or older)</option><option value="1040-NR">Form 1040-NR (nonresident)</option><option value="1040-X">Form 1040-X (amended)</option></select></div>
            <div className="space-y-2"><Label htmlFor="agi">Adjusted gross income (USD)</Label><Input id="agi" name="agi" type="number" min={0} step="0.01" required className="h-11" /></div>
            <div className="space-y-2"><Label htmlFor="withheld">Federal tax withheld (W-2 box 2, USD)</Label><Input id="withheld" name="withheld" type="number" min={0} step="0.01" required className="h-11" /></div>
            <div className="space-y-2"><Label htmlFor="amount">Expected refund (USD)</Label><Input id="amount" name="amount" type="number" min={1} step="0.01" required className="h-11" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="account">Deposit to</Label>
              <select id="account" name="account" className={sel} required disabled={!accounts}>{(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit" className="h-11" disabled={busy || !accounts}>{busy ? "Submitting…" : "Submit request"}</Button>
              <Msg msg={msg} />
            </div>
          </form>
        )}
      </Panel>
      <Panel title="Your refund requests">
        {!items ? <div className="h-24 animate-pulse rounded-md bg-muted" /> : items.length === 0 ? <p className="text-sm text-muted-foreground">No refund requests yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Submitted</th><th>Tax year</th><th>Amount</th><th>Deposit to</th><th>Status</th><th /></tr></thead>
            <tbody>{items.map((r: { id: number; year: number; amount: string; account: string; status: string; note: string | null; createdAt: string; approved: string | null }) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-3">{fmtDate(r.createdAt)}</td><td>{r.year}</td><td>{formatMinor(r.approved ?? r.amount, "USD")}{r.approved && r.approved !== r.amount && <p className="text-xs text-muted-foreground">Est. {formatMinor(r.amount, "USD")}</p>}</td><td>{r.account}</td>
                <td><Badge variant="outline" className="capitalize">{label(r.status)}</Badge>{r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}</td>
                <td className="text-right">{r.status === "pending" && <Button size="sm" variant="outline" onClick={async () => { if (!window.confirm("Cancel this refund request?")) return; const x = await cancel({ data: { id: r.id } }); if (!x.ok) setMsg({ ok: false, text: x.error }); reload(); }}>Cancel</Button>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Panel>
    </AccountPage>
  );
}

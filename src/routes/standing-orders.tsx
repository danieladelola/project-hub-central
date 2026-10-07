import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountPage, Panel, Msg, errText } from "@/components/AccountPage";
import { listAccounts } from "@/lib/banking.functions";
import { listStandingOrders, createStandingOrder, updateStandingOrder } from "@/lib/standing-orders.functions";
import { formatMinor } from "@/lib/money";

export const Route = createFileRoute("/standing-orders")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Standing Orders — Universal Crest" },
      { name: "description", content: "Set up monthly recurring transfers between Universal Crest accounts." },
      { property: "og:title", content: "Standing Orders — Universal Crest" },
      { property: "og:description", content: "Set up monthly recurring transfers between Universal Crest accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StandingOrdersPage,
});

type Orders = Awaited<ReturnType<typeof listStandingOrders>>;
type Accounts = Awaited<ReturnType<typeof listAccounts>>;
const ord = (n: number) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

function StandingOrdersPage() {
  const loadOrders = useServerFn(listStandingOrders);
  const loadAccounts = useServerFn(listAccounts);
  const create = useServerFn(createStandingOrder);
  const update = useServerFn(updateStandingOrder);
  const [orders, setOrders] = useState<Orders | null>(null);
  const [accounts, setAccounts] = useState<Accounts>([]);
  const [form, setForm] = useState({ fromAccountId: 0, to: "", amount: "", description: "", day: 1, endDate: "", pin: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => loadOrders().then(setOrders).catch((e) => { setOrders([]); setMsg({ ok: false, text: errText(e) }); });
  useEffect(() => {
    refresh();
    loadAccounts().then((rows) => {
      const usable = rows.filter((a) => a.status === "active");
      setAccounts(usable);
      setForm((f) => ({ ...f, fromAccountId: f.fromAccountId || usable[0]?.id || 0 }));
    }).catch(() => setAccounts([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await create({ data: { fromAccountId: form.fromAccountId, toAccountNumber: form.to.replace(/[\s-]/g, ""), amount: form.amount.trim(),
        description: form.description, dayOfMonth: form.day, endDate: form.endDate || null, pin: form.pin } });
      if (!r.ok) setMsg({ ok: false, text: r.error });
      else { setMsg({ ok: true, text: `Standing order set up. First payment: ${r.nextRun}.` }); setForm((f) => ({ ...f, to: "", amount: "", description: "", endDate: "", pin: "" })); await refresh(); }
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
    setBusy(false);
  }

  async function act(id: number, action: "pause" | "resume" | "cancel") {
    if (action === "cancel" && !window.confirm("Cancel this standing order? No further payments will be made.")) return;
    try {
      const r = await update({ data: { id, action } });
      if (!r.ok) setMsg({ ok: false, text: r.error });
      await refresh();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  }

  const sel = "h-10 w-full rounded-md border bg-background px-3 text-sm";
  return (
    <AccountPage requireKyc title="Standing Orders" subtitle="Payments that repeat automatically every month.">
      <Panel title="New standing order" description="Sends a fixed amount to another Universal Crest account on the same day each month.">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>From account</Label>
            <select className={sel} value={form.fromAccountId} onChange={(e) => setForm({ ...form, fromAccountId: Number(e.target.value) })}>
              {accounts.length === 0 && <option value={0}>No active account</option>}
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.nickname} {a.masked} · {a.currency}</option>)}
            </select></div>
          <div className="space-y-1.5"><Label>Recipient account number</Label>
            <Input inputMode="numeric" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="10 digits" /></div>
          <div className="space-y-1.5"><Label>Monthly amount</Label>
            <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></div>
          <div className="space-y-1.5"><Label>Pay on day</Label>
            <select className={sel} value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ord(d)} of each month</option>)}
            </select></div>
          <div className="space-y-1.5"><Label>End date (optional)</Label>
            <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Reference (optional)</Label>
            <Input maxLength={140} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Rent" /></div>
          <div className="space-y-1.5"><Label>Transaction PIN</Label>
            <Input type="password" inputMode="numeric" maxLength={4} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></div>
          <div className="flex items-end"><Button type="submit" className="w-full" disabled={busy || !form.fromAccountId}>{busy ? "Saving…" : "Set up standing order"}</Button></div>
        </form>
        <div className="mt-3"><Msg msg={msg} /></div>
      </Panel>

      <Panel title="Your standing orders" description="If a payment can't be made (e.g. low balance) you'll be notified; after 3 failures in a row the order is paused.">
        {!orders ? <div className="h-20 animate-pulse rounded-md bg-muted" /> : orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No standing orders yet.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2">From → To</th><th>Amount</th><th>Schedule</th><th>Next payment</th><th>Status</th><th>Last result</th><th /></tr></thead>
            <tbody>{orders.map((o: Orders[number]) => (
              <tr key={o.id} className="border-b align-top">
                <td className="py-2">{o.fromAccount} → {o.to}{o.description && <div className="text-xs text-muted-foreground">{o.description}</div>}</td>
                <td>{formatMinor(o.amount, o.currency)}</td>
                <td>{ord(o.day)} monthly{o.endDate && <div className="text-xs text-muted-foreground">until {o.endDate}</div>}</td>
                <td>{o.status === "active" ? o.nextRun : "—"}</td>
                <td className="capitalize">{o.status}<div className="text-xs text-muted-foreground">{o.runs} paid</div></td>
                <td className="max-w-[200px] text-xs text-muted-foreground">{o.lastResult || "—"}</td>
                <td className="space-x-1 whitespace-nowrap text-right">
                  {o.status === "active" && <Button size="sm" variant="outline" onClick={() => act(o.id, "pause")}>Pause</Button>}
                  {o.status === "paused" && <Button size="sm" variant="outline" onClick={() => act(o.id, "resume")}>Resume</Button>}
                  {(o.status === "active" || o.status === "paused") && <Button size="sm" variant="outline" onClick={() => act(o.id, "cancel")}>Cancel</Button>}
                </td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Panel>
    </AccountPage>
  );
}

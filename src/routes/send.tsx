import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AccountPage, Panel, Msg, errText } from "@/components/AccountPage";
import { listAccounts, lookupRecipient, sendMoney } from "@/lib/banking.functions";
import { formatMinor } from "@/lib/money";

export const Route = createFileRoute("/send")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Send Money — Universal Crest" },
      { name: "description", content: "Send money instantly to another Universal Crest account." },
      { property: "og:title", content: "Send Money — Universal Crest" },
      { property: "og:description", content: "Send money instantly to another Universal Crest account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SendPage,
});

type Accounts = Awaited<ReturnType<typeof listAccounts>>;
type Receipt = Extract<Awaited<ReturnType<typeof sendMoney>>, { ok: true }>["receipt"];
const AMOUNT_RE = /^\d{1,13}(\.\d{1,2})?$/;
const toMinor = (v: string) => { const [w = "0", f = ""] = v.split("."); return BigInt(w) * 100n + BigInt((f + "00").slice(0, 2)); };

function SendPage() {
  const load = useServerFn(listAccounts);
  const lookup = useServerFn(lookupRecipient);
  const send = useServerFn(sendMoney);
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [form, setForm] = useState({ fromAccountId: 0, to: "", amount: "", description: "" });
  const [recipient, setRecipient] = useState<{ holder: string; type: string } | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => load().then((rows) => {
    const usable = rows.filter((a) => a.status === "active");
    setAccounts(usable);
    setForm((f) => (f.fromAccountId || !usable[0] ? f : { ...f, fromAccountId: usable[0].id }));
  }).catch(() => setAccounts([]));
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const src = accounts?.find((a) => a.id === form.fromAccountId);

  async function review(ev: FormEvent) {
    ev.preventDefault();
    setMsg(null);
    const to = form.to.replace(/[\s-]/g, "");
    if (!src) return setMsg({ ok: false, text: "Choose the account to send from." });
    if (!/^\d{10}$/.test(to)) return setMsg({ ok: false, text: "Recipient account numbers are 10 digits." });
    if (!AMOUNT_RE.test(form.amount.trim()) || toMinor(form.amount.trim()) <= 0n) return setMsg({ ok: false, text: "Enter an amount like 25 or 25.50." });
    if (toMinor(form.amount.trim()) > BigInt(src.available)) return setMsg({ ok: false, text: "Insufficient available balance." });
    setBusy(true);
    try {
      const r = await lookup({ data: { accountNumber: to, fromAccountId: src.id } });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setRecipient({ holder: r.holder, type: r.type });
      setForm((f) => ({ ...f, to }));
      setStep("confirm");
    } catch (x) { setMsg({ ok: false, text: errText(x) }); } finally { setBusy(false); }
  }

  async function confirm(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (busy) return;
    const pin = String(new FormData(ev.currentTarget).get("pin") ?? "");
    setBusy(true); setMsg(null);
    try {
      const r = await send({ data: { fromAccountId: form.fromAccountId, toAccountNumber: form.to, amount: form.amount.trim(), description: form.description, pin, idempotencyKey: key } });
      if (!r.ok) setMsg({ ok: false, text: r.error });
      else { setReceipt(r.receipt); setStep("done"); refresh(); }
    } catch (x) { setMsg({ ok: false, text: errText(x) + " If unsure, retry — you won't be charged twice." }); } finally { setBusy(false); }
  }

  function again() {
    setKey(crypto.randomUUID()); setReceipt(null); setRecipient(null);
    setForm((f) => ({ ...f, to: "", amount: "", description: "" })); setStep("form"); setMsg(null);
  }

  return (
    <AccountPage requireKyc title="Send Money" subtitle="Instant, free transfers to any Universal Crest account in US Dollars.">
      <Msg msg={msg} />
      {!accounts ? <p className="text-muted-foreground">Loading…</p> : accounts.length === 0 ? (
        <Panel title="No account to send from">
          <p className="text-sm text-muted-foreground">Open an active account first.</p>
          <Button asChild className="mt-4 h-11"><Link to="/accounts">Go to accounts</Link></Button>
        </Panel>
      ) : step === "form" ? (
        <Panel title="Transfer details">
          <form onSubmit={review} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="from">From account</Label>
               <select id="from" value={form.fromAccountId} onChange={(e) => setForm({ ...form, fromAccountId: Number(e.target.value) })} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
                 {accounts.map((a) => <option key={a.id} value={a.id}>{a.nickname} · •••• {a.accountNumber.slice(-4)} · {a.currency}</option>)}
              </select>
               {src && <p className="text-sm text-muted-foreground">Available balance: <span className="font-medium text-foreground">{formatMinor(src.available, src.currency)}</span></p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">Recipient account number</Label>
              <Input id="to" inputMode="numeric" maxLength={14} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="10-digit account number" className="h-11 font-mono" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ({src?.currency ?? "USD"})</Label>
              <Input id="amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className="h-11" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description (optional)</Label>
              <Textarea id="desc" maxLength={140} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <Button type="submit" className="h-11" disabled={busy}>{busy ? "Checking recipient…" : "Continue"}</Button>
          </form>
        </Panel>
      ) : step === "confirm" && recipient && src ? (
        <Panel title="Confirm transfer" description="Check the recipient's name before sending.">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Recipient</dt><dd className="font-medium">{recipient.holder}</dd></div>
            <div><dt className="text-muted-foreground">Recipient account</dt><dd className="font-mono">{form.to} <span className="capitalize text-muted-foreground">({recipient.type})</span></dd></div>
            <div><dt className="text-muted-foreground">From</dt><dd>{src.nickname} · <span className="font-mono">{src.accountNumber}</span> · {src.holderName}</dd></div>
            <div><dt className="text-muted-foreground">Amount</dt><dd className="text-lg font-semibold">{formatMinor(toMinor(form.amount.trim()), src.currency)}</dd></div>
            {form.description && <div className="sm:col-span-2"><dt className="text-muted-foreground">Description</dt><dd>{form.description}</dd></div>}
          </dl>
          <form onSubmit={confirm} className="mt-6 space-y-4">
            <div className="space-y-2"><Label htmlFor="pin">Enter your 4-digit transaction PIN</Label><Input id="pin" name="pin" type="password" inputMode="numeric" maxLength={4} pattern="\d{4}" required className="h-11 max-w-40" /></div>
            <div className="flex gap-2">
              <Button type="submit" className="h-11" disabled={busy}>{busy ? "Sending…" : "Send money"}</Button>
              <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => setStep("form")}>Back</Button>
            </div>
          </form>
        </Panel>
      ) : receipt ? (
        <Panel title="Transfer receipt">
          <div className="flex items-center gap-2 text-primary"><CheckCircle2 className="size-5" /><span className="font-medium">Money sent successfully</span></div>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Reference</dt><dd className="font-mono">{receipt.reference}</dd></div>
            <div><dt className="text-muted-foreground">Amount</dt><dd className="text-lg font-semibold">{formatMinor(receipt.amount, receipt.currency)}</dd></div>
            <div><dt className="text-muted-foreground">From</dt><dd className="font-mono">{receipt.from}</dd></div>
            <div><dt className="text-muted-foreground">To</dt><dd>{receipt.toName} · <span className="font-mono">{receipt.to}</span></dd></div>
            <div><dt className="text-muted-foreground">Date</dt><dd>{new Date(receipt.date).toLocaleString()}</dd></div>
            <div><dt className="text-muted-foreground">Status</dt><dd className="capitalize">{receipt.status === "posted" ? "Completed" : receipt.status}</dd></div>
            {receipt.description && <div className="sm:col-span-2"><dt className="text-muted-foreground">Description</dt><dd>{receipt.description}</dd></div>}
          </dl>
          <div className="mt-6 flex flex-wrap gap-2 print:hidden">
            <Button className="h-11" onClick={again}>Send another</Button>
            <Button variant="outline" className="h-11" onClick={() => window.print()}>Print receipt</Button>
            <Button asChild variant="outline" className="h-11"><Link to="/account">Back to dashboard</Link></Button>
          </div>
        </Panel>
      ) : null}
    </AccountPage>
  );
}

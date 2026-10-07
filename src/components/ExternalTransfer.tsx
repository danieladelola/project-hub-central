import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountPage, Panel, Msg, errText } from "@/components/AccountPage";
import { listAccounts, sendExternal } from "@/lib/banking.functions";
import { formatMinor } from "@/lib/money";

type Kind = "local" | "wire";
type Accounts = Awaited<ReturnType<typeof listAccounts>>;
type Receipt = Extract<Awaited<ReturnType<typeof sendExternal>>, { ok: true }>["receipt"];
const AMOUNT_RE = /^\d{1,13}(\.\d{1,2})?$/;
const toMinor = (v: string) => { const [w = "0", f = ""] = v.split("."); return BigInt(w) * 100n + BigInt((f + "00").slice(0, 2)); };
const SWIFT_RE = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
const PURPOSES = ["Family support", "Payment for goods", "Payment for services", "Tuition / education", "Salary / payroll", "Investment", "Rent / property", "Other"];
const COUNTRIES = ["United States", "United Kingdom", "Canada", "Germany", "France", "Spain", "Italy", "Netherlands", "Switzerland", "Ireland", "Australia", "New Zealand", "Japan", "China", "Hong Kong", "Singapore", "India", "United Arab Emirates", "Saudi Arabia", "South Africa", "Nigeria", "Ghana", "Kenya", "Brazil", "Mexico", "Other"];

const empty = { fromAccountId: 0, beneficiaryName: "", bankName: "", accountNumber: "", routingNumber: "", swift: "", country: "", bankAddress: "", purpose: "", amount: "", reference: "" };
const sel = "h-11 w-full rounded-md border bg-background px-3 text-sm";

export function ExternalTransferPage({ kind }: { kind: Kind }) {
  const wire = kind === "wire";
  const load = useServerFn(listAccounts);
  const send = useServerFn(sendExternal);
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const [form, setForm] = useState(empty);
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
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
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: k === "fromAccountId" ? Number(e.target.value) : e.target.value }));

  function review(ev: FormEvent) {
    ev.preventDefault();
    setMsg(null);
    const amount = form.amount.trim();
    if (!src) return setMsg({ ok: false, text: "Choose the account to send from." });
    if (form.beneficiaryName.trim().length < 2) return setMsg({ ok: false, text: "Enter the recipient's full name." });
    if (form.bankName.trim().length < 2) return setMsg({ ok: false, text: "Enter the recipient's bank." });
    if (!/^[A-Za-z0-9 -]{6,34}$/.test(form.accountNumber.trim())) return setMsg({ ok: false, text: wire ? "Enter a valid account number or IBAN." : "Enter a valid account number." });
    if (!wire && !/^[A-Za-z0-9 -]{3,20}$/.test(form.routingNumber.trim())) return setMsg({ ok: false, text: "Enter a valid routing number or sort code." });
    if (wire && !SWIFT_RE.test(form.swift.trim().toUpperCase())) return setMsg({ ok: false, text: "Enter a valid 8 or 11 character SWIFT/BIC code." });
    if (wire && !form.country) return setMsg({ ok: false, text: "Choose the recipient's country." });
    if (wire && !form.purpose) return setMsg({ ok: false, text: "Choose the purpose of payment." });
    if (!AMOUNT_RE.test(amount) || toMinor(amount) <= 0n) return setMsg({ ok: false, text: "Enter an amount like 250 or 250.50." });
    if (toMinor(amount) > BigInt(src.available)) return setMsg({ ok: false, text: "Insufficient available balance." });
    setStep("confirm");
  }

  async function confirm(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (busy) return;
    const pin = String(new FormData(ev.currentTarget).get("pin") ?? "");
    setBusy(true); setMsg(null);
    const base = { fromAccountId: form.fromAccountId, amount: form.amount.trim(), beneficiaryName: form.beneficiaryName, bankName: form.bankName, accountNumber: form.accountNumber, reference: form.reference, pin, idempotencyKey: key };
    try {
      const r = await send({ data: wire
        ? { kind: "wire", ...base, swift: form.swift.trim().toUpperCase(), country: form.country, bankAddress: form.bankAddress, purpose: form.purpose }
        : { kind: "local", ...base, routingNumber: form.routingNumber } });
      if (!r.ok) setMsg({ ok: false, text: r.error });
      else { setReceipt(r.receipt); setStep("done"); refresh(); }
    } catch (x) { setMsg({ ok: false, text: errText(x) + " If unsure, retry — you won't be charged twice." }); } finally { setBusy(false); }
  }

  function again() { setKey(crypto.randomUUID()); setReceipt(null); setForm((f) => ({ ...empty, fromAccountId: f.fromAccountId })); setStep("form"); setMsg(null); }

  const title = wire ? "International Wire" : "Local Transfer";
  const rows: Array<[string, string]> = [
    ["Recipient", form.beneficiaryName], ["Bank", form.bankName], [wire ? "Account / IBAN" : "Account number", form.accountNumber],
    ...(wire ? [["SWIFT / BIC", form.swift.toUpperCase()], ["Country", form.country], ...(form.bankAddress ? [["Bank address", form.bankAddress]] : []), ["Purpose", form.purpose]] as Array<[string, string]> : [["Routing / sort code", form.routingNumber]] as Array<[string, string]>),
    ...(form.reference ? [["Reference", form.reference]] as Array<[string, string]> : []),
  ];

  return (
    <AccountPage requireKyc title={title} subtitle={wire ? "Send money to bank accounts worldwide via SWIFT." : "Send money to an account at another bank in your country."}>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Clock, t: wire ? "1–5 business days" : "Same or next business day", d: "Typical arrival time" },
          { icon: ShieldCheck, t: "PIN protected", d: "Every transfer is confirmed with your PIN" },
          { icon: CheckCircle2, t: "Tracked", d: "Follow progress on the Transactions page" },
        ].map(({ icon: I, t, d }) => (
          <div key={t} className="flex items-start gap-3 rounded-lg border bg-card p-4"><I className="mt-0.5 size-5 text-primary" /><div><p className="text-sm font-medium">{t}</p><p className="text-xs text-muted-foreground">{d}</p></div></div>
        ))}
      </div>
      <Msg msg={msg} />
      {!accounts ? <p className="text-muted-foreground">Loading…</p> : accounts.length === 0 ? (
        <Panel title="No account to send from">
          <p className="text-sm text-muted-foreground">Open an active account first.</p>
          <Button asChild className="mt-4 h-11"><Link to="/accounts">Go to accounts</Link></Button>
        </Panel>
      ) : step === "form" ? (
        <form onSubmit={review} className="space-y-6">
          <Panel title="From">
            <Label htmlFor={`${kind}-from`}>From account</Label>
            <select id={`${kind}-from`} value={form.fromAccountId} onChange={set("fromAccountId")} className={`${sel} mt-2`}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.nickname} · •••• {a.accountNumber.slice(-4)} · {a.currency}</option>)}
            </select>
            {src && <p className="mt-2 text-sm text-muted-foreground">Available balance: <span className="font-medium text-foreground">{formatMinor(src.available, src.currency)}</span></p>}
          </Panel>
          <Panel title="Recipient details" description="Make sure these match the recipient's bank records exactly.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="bn">Recipient full name</Label><Input id="bn" value={form.beneficiaryName} onChange={set("beneficiaryName")} maxLength={80} className="h-11" required /></div>
              <div className="space-y-2"><Label htmlFor="bank">Bank name</Label><Input id="bank" value={form.bankName} onChange={set("bankName")} maxLength={80} className="h-11" required /></div>
              <div className="space-y-2"><Label htmlFor="acct">{wire ? "Account number or IBAN" : "Account number"}</Label><Input id="acct" value={form.accountNumber} onChange={set("accountNumber")} maxLength={34} className="h-11 font-mono" required /></div>
              {wire ? (
                <>
                  <div className="space-y-2"><Label htmlFor="swift">SWIFT / BIC code</Label><Input id="swift" value={form.swift} onChange={set("swift")} maxLength={11} placeholder="e.g. DEUTDEFF" className="h-11 font-mono uppercase" required /></div>
                  <div className="space-y-2"><Label htmlFor="country">Recipient country</Label><select id="country" value={form.country} onChange={set("country")} className={sel} required><option value="">Select country</option>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></div>
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor="baddr">Bank address (optional)</Label><Input id="baddr" value={form.bankAddress} onChange={set("bankAddress")} maxLength={160} className="h-11" /></div>
                </>
              ) : (
                <div className="space-y-2"><Label htmlFor="routing">Routing number / sort code</Label><Input id="routing" value={form.routingNumber} onChange={set("routingNumber")} maxLength={20} className="h-11 font-mono" required /></div>
              )}
            </div>
          </Panel>
          <Panel title="Payment">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="amount">Amount ({src?.currency ?? ""})</Label><Input id="amount" inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="0.00" className="h-11" required /></div>
              {wire && <div className="space-y-2"><Label htmlFor="purpose">Purpose of payment</Label><select id="purpose" value={form.purpose} onChange={set("purpose")} className={sel} required><option value="">Select purpose</option>{PURPOSES.map((p) => <option key={p}>{p}</option>)}</select></div>}
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="ref">Reference for recipient (optional)</Label><Input id="ref" value={form.reference} onChange={set("reference")} maxLength={140} className="h-11" /></div>
            </div>
          </Panel>
          <Button type="submit" className="h-11">Review transfer</Button>
        </form>
      ) : step === "confirm" && src ? (
        <Panel title="Confirm transfer" description="Check every detail. Transfers to other banks can't be recalled once processed.">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">From</dt><dd>{src.nickname} · <span className="font-mono">{src.accountNumber}</span></dd></div>
            <div><dt className="text-muted-foreground">Amount</dt><dd className="text-lg font-semibold">{formatMinor(toMinor(form.amount.trim()), src.currency)}</dd></div>
            {rows.map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-all font-medium">{v}</dd></div>)}
          </dl>
          <form onSubmit={confirm} className="mt-6 space-y-4">
            <div className="space-y-2"><Label htmlFor="pin">Enter your 4-digit transaction PIN</Label><Input id="pin" name="pin" type="password" inputMode="numeric" maxLength={4} pattern="\d{4}" required className="h-11 max-w-40" /></div>
            <div className="flex gap-2">
              <Button type="submit" className="h-11" disabled={busy}>{busy ? "Submitting…" : "Send transfer"}</Button>
              <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => setStep("form")}>Edit</Button>
            </div>
          </form>
        </Panel>
      ) : receipt ? (
        <Panel title="Transfer submitted">
          <div className="flex items-center gap-2 text-primary"><CheckCircle2 className="size-5" /><span className="font-medium">Your {wire ? "wire" : "transfer"} is being processed</span></div>
          <p className="mt-2 text-sm text-muted-foreground">The amount is reserved from your balance now and will show as completed once it's sent to the recipient's bank.</p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Reference</dt><dd className="font-mono">{receipt.reference}</dd></div>
            <div><dt className="text-muted-foreground">Amount</dt><dd className="text-lg font-semibold">{formatMinor(receipt.amount, receipt.currency)}</dd></div>
            <div><dt className="text-muted-foreground">From</dt><dd className="font-mono">{receipt.from}</dd></div>
            <div><dt className="text-muted-foreground">To</dt><dd>{form.beneficiaryName} · {form.bankName}</dd></div>
            <div><dt className="text-muted-foreground">Date</dt><dd>{new Date(receipt.date).toLocaleString()}</dd></div>
            <div><dt className="text-muted-foreground">Status</dt><dd>{receipt.status === "pending" ? "Processing" : receipt.status === "posted" ? "Completed" : "Cancelled"}</dd></div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-2 print:hidden">
            <Button className="h-11" onClick={again}>New transfer</Button>
            <Button variant="outline" className="h-11" onClick={() => window.print()}>Print receipt</Button>
            <Button asChild variant="outline" className="h-11"><Link to="/transactions">View transactions</Link></Button>
          </div>
        </Panel>
      ) : null}
    </AccountPage>
  );
}

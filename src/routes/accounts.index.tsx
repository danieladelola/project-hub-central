import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, Msg, errText } from "@/components/AccountPage";
import { Badge } from "@/components/ui/badge";
import { AccountPage } from "@/components/AccountPage";
import { getOpenEligibility, listAccounts, openAccount } from "@/lib/banking.functions";
import { formatMinor, statusTone, OPEN_CURRENCIES } from "@/lib/money";

export const Route = createFileRoute("/accounts/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Accounts — Universal Crest" }, { name: "description", content: "View and manage your Universal Crest multi-currency accounts." }, { property: "og:title", content: "Accounts — Universal Crest" }, { property: "og:description", content: "View and manage your Universal Crest multi-currency accounts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: AccountsPage,
});

function AccountsPage() {
  const load = useServerFn(listAccounts);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listAccounts>> | null>(null);
  const elig = useServerFn(getOpenEligibility);
  const open = useServerFn(openAccount);
  const [e, setE] = useState<Awaited<ReturnType<typeof getOpenEligibility>> | null>(null);
  const [step, setStep] = useState<"closed" | "form" | "confirm">("closed");
  const [draft, setDraft] = useState({ nickname: "", type: "checking", currency: "USD" });
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => { load().then(setRows).catch(() => setRows([])); elig().then(setE).catch(() => {}); }, [load, elig]);
  useEffect(() => { refresh(); }, [refresh]);

  function review(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const nickname = String(f.get("nickname") ?? "").trim();
    if (nickname.length < 2) return setMsg({ ok: false, text: "Nickname must be at least 2 characters." });
    setDraft({ nickname, type: String(f.get("type")), currency: String(f.get("currency") || "USD") });
    setMsg(null); setStep("confirm");
  }
  async function confirm(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const pin = String(new FormData(ev.currentTarget).get("pin") ?? "");
    setBusy(true); setMsg(null);
    try {
      const r = await open({ data: { nickname: draft.nickname, type: draft.type as "checking", currency: draft.currency as "USD", requestKey, pin } });
      if (!r.ok) setMsg({ ok: false, text: r.error });
      else { setStep("closed"); setRequestKey(crypto.randomUUID()); setMsg({ ok: true, text: `Your new ${draft.currency} account is open with a ${formatMinor("0", draft.currency)} balance.` }); refresh(); }
    } catch (x) { setMsg({ ok: false, text: errText(x) }); } finally { setBusy(false); }
  }

  return (
    <AccountPage title="Accounts" subtitle="Your Universal Crest accounts." wide
      actions={step === "closed" && e && (e.eligible ? <Button data-header-action-mobile-hidden className="hidden min-h-11 sm:inline-flex" onClick={() => setStep("form")}>Open new account</Button> : <p data-header-action-mobile-hidden className="hidden max-w-xs text-sm text-muted-foreground sm:block">{e.reason}</p>)}>
      <section className="relative overflow-hidden rounded-xl bg-primary p-6 text-primary-foreground shadow-lg">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border-[18px] border-primary-foreground/10" />
        <p className="font-serif text-2xl">Universal Crest</p>
        <p className="mt-1 text-sm text-primary-foreground/80">All accounts are held in US Dollars (USD).</p>
        <div className="mt-4 flex flex-wrap gap-1.5">{OPEN_CURRENCIES.map((c) => <span key={c.code} className="rounded-full border border-primary-foreground/25 px-2.5 py-0.5 text-xs font-medium">{c.code}</span>)}</div>
      </section>
      <Msg msg={msg} />
      {step === "closed" && e && (e.eligible ? (
        <Button className="min-h-11 w-full sm:hidden" onClick={() => setStep("form")}>Open new account</Button>
      ) : (
        <p className="text-sm text-muted-foreground sm:hidden">{e.reason}</p>
      ))}
      {step === "form" && (
        <Panel title="Open a new account" description={e ? `You have ${e.open} of ${e.max} accounts open. New accounts start at a zero balance. Balances are held on Universal Crest's internal ledger.` : undefined}>
          <form onSubmit={review} className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="nickname">Nickname</Label><Input id="nickname" name="nickname" defaultValue={draft.nickname} maxLength={40} required className="h-11" /></div>
            <div className="space-y-2"><Label htmlFor="type">Type</Label><select id="type" name="type" defaultValue={draft.type} className="h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="checking">Checking / current</option><option value="savings">Savings</option></select></div>
            <div className="space-y-2"><Label htmlFor="currency">Currency</Label><select id="currency" name="currency" defaultValue={draft.currency} className="h-11 w-full rounded-md border bg-background px-3 text-sm">{OPEN_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}</select></div>
            <div className="flex gap-2 sm:col-span-3"><Button type="submit" className="h-11">Review</Button><Button type="button" variant="outline" className="h-11" onClick={() => setStep("closed")}>Cancel</Button></div>
          </form>
        </Panel>
      )}
      {step === "confirm" && (
        <Panel title="Confirm new account" description={`${draft.nickname} · ${draft.type === "savings" ? "Savings" : "Checking"} · ${draft.currency}`}>
          <form onSubmit={confirm} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="pin">Enter your 4-digit transaction PIN</Label><Input id="pin" name="pin" type="password" inputMode="numeric" maxLength={4} pattern="\d{4}" required className="h-11 max-w-40" /></div>
            <div className="flex gap-2"><Button type="submit" className="h-11" disabled={busy}>{busy ? "Opening…" : "Open account"}</Button><Button type="button" variant="outline" className="h-11" onClick={() => setStep("form")}>Back</Button></div>
          </form>
        </Panel>
      )}
      {!rows ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="text-muted-foreground">You don't have any accounts yet.</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((a) => (
            <Link key={a.id} to="/accounts/$accountId" params={{ accountId: String(a.id) }} className="block overflow-hidden rounded-lg border border-t-4 border-t-primary bg-card p-5 transition hover:border-primary hover:shadow-md">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{a.currency.slice(0, 2)}</span><p className="min-w-0 truncate font-medium">{a.nickname}</p><Badge variant={statusTone[a.status]} className="shrink-0 capitalize">{a.status}</Badge></div>
              <p className="mt-2 text-xs capitalize text-muted-foreground">Universal Crest {a.type} · {a.currency}</p>
              <p className="mt-1 font-mono text-sm tracking-wider">{a.accountNumber}</p>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{a.holderName}</p>
              <p className="mt-3 text-2xl font-semibold">{formatMinor(a.current, a.currency)}</p>
              <p className="text-xs text-muted-foreground">Available {formatMinor(a.available, a.currency)}</p>
            </Link>
          ))}
        </div>
      )}
    </AccountPage>
  );
}

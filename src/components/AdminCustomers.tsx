import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AdminAccounts } from "@/components/AdminAccounts";
import { AdminSessions } from "@/components/AdminSessions";
import { adminCustomerControl, adminDeleteCustomer, adminGetCustomer, adminLoginAsCustomer, adminSearchCustomers, adminUpdateCustomer } from "@/lib/admin.functions";
import { formatMinor, fmtDate } from "@/lib/money";
import { cn } from "@/lib/utils";

type Row = Awaited<ReturnType<typeof adminSearchCustomers>>[number];
type Detail = Awaited<ReturnType<typeof adminGetCustomer>>;
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const kycVariant = (s: string) => (s === "verified" ? "default" : s === "pending" || s === "submitted" ? "secondary" : "outline") as "default" | "secondary" | "outline";

export function AdminCustomers() {
  const [open, setOpen] = useState<number | null>(null);
  return open ? <CustomerDetail userId={open} onBack={() => setOpen(null)} /> : <CustomerList onOpen={setOpen} />;
}

function CustomerList({ onOpen }: { onOpen: (id: number) => void }) {
  const search = useServerFn(adminSearchCustomers);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "suspended">("all");
  const [kyc, setKyc] = useState("all");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { setRows(null); search({ data: { q: q || undefined, status, kyc } }).then(setRows).catch((e) => { setErr(errText(e)); setRows([]); }); }, [search, q, status, kyc]);
  useEffect(() => { load(); }, [status, kyc]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] lg:items-end">
        <div className="space-y-1 sm:col-span-2 lg:col-span-1"><Label htmlFor="c-q">Search</Label>
          <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="c-q" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="Name, email, phone or customer ID" /></div></div>
        <div className="space-y-1"><Label htmlFor="c-s">Status</Label>
          <select id="c-s" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-10 w-full rounded-md border bg-background px-2 text-sm"><option value="all">All</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
        <div className="space-y-1"><Label htmlFor="c-k">KYC</Label>
          <select id="c-k" value={kyc} onChange={(e) => setKyc(e.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm"><option value="all">All</option><option value="unverified">Unverified</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></div>
        <Button type="submit">Search</Button>
      </form>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {!rows ? <div className="h-40 animate-pulse rounded-lg bg-muted" /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No customers match.</p> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <p className="border-b px-4 py-2 text-xs text-muted-foreground">{rows.length} customer{rows.length === 1 ? "" : "s"}</p>
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3">ID</th><th className="p-3">Customer</th><th className="p-3">Phone / country</th><th className="p-3">Accounts</th><th className="p-3">KYC</th><th className="p-3">Status</th><th className="p-3">Joined</th><th className="p-3" /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => onOpen(r.id)}>
                <td className="p-3 font-mono text-xs">#{r.id}</td>
                <td className="p-3"><p className="font-medium">{r.fullName}</p><p className="text-xs text-muted-foreground">{r.email}{!r.emailVerified && " · unconfirmed"}</p></td>
                <td className="p-3"><p>{r.phone || "—"}</p><p className="text-xs text-muted-foreground">{r.country || "—"}</p></td>
                <td className="p-3">{r.accounts}</td>
                <td className="p-3"><Badge variant={kycVariant(r.kycStatus)} className="capitalize">{r.kycStatus}</Badge></td>
                <td className="p-3"><Badge variant={r.status === "active" ? "outline" : "destructive"} className="capitalize">{r.status}</Badge></td>
                <td className="whitespace-nowrap p-3 text-xs">{fmtDate(r.createdAt)}</td>
                <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}>Manage</Button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const SECTIONS = ["Profile", "Accounts & funding", "Transactions", "Cards & loans", "Security", "Activity"] as const;

function CustomerDetail({ userId, onBack }: { userId: number; onBack: () => void }) {
  const get = useServerFn(adminGetCustomer);
  const control = useServerFn(adminCustomerControl);
  const del = useServerFn(adminDeleteCustomer);
  const loginAs = useServerFn(adminLoginAsCustomer);
  async function signInAs() {
    if (!window.confirm("Sign in as this customer? You will be signed out of admin.")) return;
    setBusy(true); setMsg(null);
    try { const r = await loginAs({ data: { userId } }); if (!r.ok) { setMsg({ ok: false, text: r.error }); return; } window.location.href = "/account"; }
    catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  }
  const [d, setD] = useState<Detail | null>(null);
  const [sec, setSec] = useState<(typeof SECTIONS)[number]>("Profile");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => get({ data: { userId } }).then(setD).catch((e) => setMsg({ ok: false, text: errText(e) })), [get, userId]);
  useEffect(() => { load(); }, [load]);

  async function act(action: "suspend" | "reactivate" | "freeze_all" | "unfreeze_all" | "sign_out" | "reset_pin", label: string, askReason = false) {
    if (!window.confirm(`${label} for this customer?`)) return;
    const reason = askReason ? window.prompt("Reason (shown to the customer, optional):") ?? undefined : undefined;
    setBusy(true); setMsg(null);
    try { const r = await control({ data: { userId, action, reason: reason || undefined } }); setMsg(r.ok ? { ok: true, text: `${label}: done.` } : { ok: false, text: r.error }); await load(); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  }

  async function remove() {
    if (!d) return;
    setBusy(true); setMsg(null);
    try {
      const r = await del({ data: { userId } });
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: r.mode === "removed" ? "Customer deleted." : "Customer deleted. Their past transactions are kept for the records, but all personal details were erased and sign-in is disabled." });
      onBack();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  }

  if (!d) return <div className="space-y-3"><Button variant="ghost" onClick={onBack}><ArrowLeft /> All customers</Button>{msg ? <p className="text-sm text-destructive">{msg.text}</p> : <div className="h-40 animate-pulse rounded-lg bg-muted" />}</div>;
  const p = d.profile;
  const suspended = p.status === "suspended";

  return (
    <div className="space-y-5">
      <Button variant="ghost" onClick={onBack} className="-ml-3"><ArrowLeft /> All customers</Button>
      <section className="grid gap-4 rounded-lg border bg-card p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">{p.fullName.split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("")}</span>
          <div className="min-w-0">
            <h2 className="truncate text-2xl">{p.fullName}</h2>
            <p className="truncate text-sm text-muted-foreground">#{p.id} · {p.email}</p>
            <div className="mt-2 flex flex-wrap gap-2"><Badge variant={suspended ? "destructive" : "outline"} className="capitalize">{p.status}</Badge><Badge variant={kycVariant(p.kycStatus)} className="capitalize">KYC: {p.kycStatus}</Badge>{p.twoFactor && <Badge variant="secondary">2-step on</Badge>}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={signInAs}>Log in as customer</Button>
          {suspended
            ? <Button disabled={busy} onClick={() => act("reactivate", "Reactivate profile")}>Reactivate</Button>
            : <Button disabled={busy} variant="destructive" onClick={() => act("suspend", "Suspend all banking", true)}>Suspend all banking</Button>}
          <Button disabled={busy} variant="outline" onClick={() => act("freeze_all", "Freeze all accounts & cards", true)}>Freeze all</Button>
          <Button disabled={busy} variant="outline" onClick={() => act("unfreeze_all", "Unfreeze all accounts & cards")}>Unfreeze all</Button>
          <Button disabled={busy} variant="outline" onClick={() => act("sign_out", "Sign out all devices")}>Sign out devices</Button>
          <Button disabled={busy} variant="outline" onClick={() => act("reset_pin", "Reset transaction PIN")}>Reset PIN</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button disabled={busy} variant="destructive">Delete customer</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><TriangleAlert className="size-5 text-destructive" /> Permanently delete {p.fullName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes <span className="font-medium">{p.fullName}</span> ({p.email}) and all accounts, cards and settings.
                  {d.transactions.length > 0 ? " Past transactions are kept for the records, but every personal detail will be erased and sign-in disabled." : " This cannot be undone."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={busy} className="bg-destructive text-white hover:bg-destructive/90" onClick={async (e) => { e.preventDefault(); await remove(); }}>
                  {busy ? "Deleting…" : "Delete customer"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>
      {msg && <p className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([["Open accounts", d.stats.accounts], ["Cards", d.stats.cards], ["Beneficiaries", d.stats.beneficiaries], ["Loan requests", d.stats.loans], ["Signed-in devices", d.stats.sessions]] as const).map(([l, n]) => (
          <div key={l} className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-semibold">{n}</p></div>
        ))}
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b pb-2" aria-label="Customer sections">
        {SECTIONS.map((s) => <Button key={s} size="sm" variant={sec === s ? "default" : "ghost"} className="shrink-0" onClick={() => setSec(s)}>{s}</Button>)}
      </nav>
      {sec === "Profile" && <ProfileForm d={d} onSaved={load} />}
      {sec === "Accounts & funding" && <div className="rounded-lg border bg-card p-4"><p className="mb-3 text-sm text-muted-foreground">Credit to fund, debit to withdraw. Change account status, place holds and settle pending items.</p><AdminAccounts userId={userId} /></div>}
      {sec === "Transactions" && (
        d.transactions.length === 0 ? <p className="text-sm text-muted-foreground">No transactions.</p> : (
          <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[680px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3">Account</th><th className="p-3">Status</th><th className="p-3 text-right">Amount</th></tr></thead>
            <tbody>{d.transactions.map((t, i) => <tr key={`${t.id}-${i}`} className="border-b last:border-0"><td className="whitespace-nowrap p-3">{fmtDate(t.date)}</td><td className="p-3"><p>{t.description}</p><p className="font-mono text-xs text-muted-foreground">{t.reference}</p></td><td className="p-3">{t.account}</td><td className="p-3"><Badge variant="outline" className="capitalize">{t.status}</Badge></td><td className={cn("whitespace-nowrap p-3 text-right font-medium", !t.amount.startsWith("-") && "text-primary")}>{formatMinor(t.amount, t.currency, { signed: true })}</td></tr>)}</tbody>
          </table></div>
        )
      )}
      {sec === "Cards & loans" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <List title="Cards" empty="No cards." items={d.cards.map((c) => ({ k: c.id, a: <span className="capitalize">{c.brand} •••• {c.last4}</span>, b: c.status }))} />
          <List title="Loan requests" empty="No loan requests." items={d.loans.map((l) => ({ k: l.id, a: <span><span className="capitalize">{l.type}</span> · {formatMinor(l.amount, l.currency)}</span>, b: l.status }))} />
          <List title="Beneficiaries" empty="No beneficiaries." items={d.beneficiaries.map((b) => ({ k: b.id, a: <span className="break-all">{b.name} · {b.bank} · {b.account}</span>, b: b.type }))} />
        </div>
      )}
      {sec === "Security" && <AdminSessions userId={userId} onChange={load} />}
      {sec === "Activity" && (
        d.activity.length === 0 ? <p className="text-sm text-muted-foreground">No activity recorded.</p> : (
          <ol className="divide-y rounded-lg border bg-card text-sm">{d.activity.map((a) => <li key={a.id} className="grid gap-1 p-3 sm:grid-cols-[11rem_minmax(0,1fr)]"><span className="text-xs text-muted-foreground">{fmtDate(a.at)}</span><span className="min-w-0 break-words"><span className="font-medium">{a.action}</span>{a.actor && ` · by ${a.actor}`} {a.detail !== "{}" && <span className="text-xs text-muted-foreground">{a.detail}</span>}</span></li>)}</ol>
        )
      )}
    </div>
  );
}

function List({ title, empty, items }: { title: string; empty: string; items: Array<{ k: number; a: ReactNode; b: string }> }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="font-sans text-base font-semibold">{title}</h3>
      {items.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{empty}</p> : <ul className="mt-2 divide-y text-sm">{items.map((i) => <li key={i.k} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0">{i.a}</span><Badge variant="outline" className="shrink-0 capitalize">{i.b}</Badge></li>)}</ul>}
    </section>
  );
}

function ProfileForm({ d, onSaved }: { d: Detail; onSaved: () => void }) {
  const save = useServerFn(adminUpdateCustomer);
  const p = d.profile;
  const [ev, setEv] = useState(p.emailVerified);
  const [tf, setTf] = useState(p.twoFactor);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "");
    setBusy(true); setMsg(null);
    try {
      const r = await save({ data: { userId: p.id, fullName: s("fullName"), email: s("email"), phone: s("phone"), country: s("country"), state: s("state"), address: s("address"), dateOfBirth: s("dob"), emailVerified: ev, twoFactor: tf } });
      setMsg(r.ok ? { ok: true, text: "Profile saved." } : { ok: false, text: r.error }); if (r.ok) onSaved();
    } catch (x) { setMsg({ ok: false, text: errText(x) }); } finally { setBusy(false); }
  }
  const field = (name: string, label: string, value: string, type = "text") => (
    <div className="space-y-1"><Label htmlFor={`pf-${name}`}>{label}</Label><Input id={`pf-${name}`} name={name} type={type} defaultValue={value} /></div>
  );
  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("fullName", "Full name", p.fullName)}{field("email", "Email", p.email, "email")}
        {field("phone", "Phone", p.phone)}{field("dob", "Date of birth", p.dateOfBirth)}
        {field("country", "Country", p.country)}{field("state", "State / region", p.state)}
        <div className="sm:col-span-2">{field("address", "Address", p.address)}</div>
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2"><Checkbox checked={ev} onCheckedChange={(v) => setEv(!!v)} /> Email confirmed</label>
        <label className="flex items-center gap-2"><Checkbox checked={tf} onCheckedChange={(v) => setTf(!!v)} /> 2-step sign-in</label>
      </div>
      <p className="text-xs text-muted-foreground">Account type: {p.accountType || "—"} · Joined {fmtDate(p.createdAt)}</p>
      <div className="flex items-center gap-3"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>{msg && <p className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}</div>
    </form>
  );
}

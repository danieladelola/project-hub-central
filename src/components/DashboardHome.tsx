import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Bell, Eye, EyeOff, FileText, Plus, Send, Users, AlertTriangle, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCashflow, getDashboard } from "@/lib/banking.functions";
import { formatMinor, fmtDate, minorToChartNumber, statusTone, txnStatusBadge } from "@/lib/money";
import { cn } from "@/lib/utils";

type Dash = Awaited<ReturnType<typeof getDashboard>>;
type Days = 7 | 30 | 90 | 365;

export function DashboardHome() {
  const load = useServerFn(getDashboard);
  const flow = useServerFn(getCashflow);
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [days, setDays] = useState<Days>(30);
  const [cur, setCur] = useState<string | null>(null);
  const [series, setSeries] = useState<Awaited<ReturnType<typeof getCashflow>> | null>(null);

  useEffect(() => {
    setHidden(localStorage.getItem("uc_hide_bal") === "1");
    load().then((x) => { setD(x); setCur(x.totals[0]?.currency ?? x.accounts[0]?.currency ?? "USD"); }).catch(() => setErr(true));
  }, [load]);
  useEffect(() => {
    if (!cur) return;
    setSeries(null);
    flow({ data: { days, currency: cur as "USD" } }).then(setSeries).catch(() => setSeries([]));
  }, [cur, days, flow]);

  const toggle = () => { const n = !hidden; setHidden(n); localStorage.setItem("uc_hide_bal", n ? "1" : "0"); };
  const money = (m: string, c: string, signed = false) => (hidden ? "••••••" : formatMinor(m, c, { signed }));

  if (err) return <p className="text-destructive">We couldn't load your dashboard. Please refresh the page.</p>;
  if (!d) return <div className="space-y-4" aria-busy="true"><div className="h-28 animate-pulse rounded-lg bg-muted" /><div className="h-48 animate-pulse rounded-lg bg-muted" /></div>;

  const alerts = d.accounts.filter((a) => a.status === "restricted" || a.status === "frozen" || a.lowAlert);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-b pb-7">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{greet}</p>
          <h2 className="mt-1 break-words text-2xl min-[360px]:text-3xl sm:text-4xl">{d.fullName}</h2>
        </div>
        <Button variant="outline" className="min-h-11" onClick={toggle} aria-pressed={hidden}>
          {hidden ? <Eye /> : <EyeOff />} {hidden ? "Show balances" : "Hide balances"}
        </Button>
      </section>

      {d.kycStatus !== "verified" && (
        <section aria-label="Identity verification" className="flex flex-wrap items-center gap-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
          <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{d.kycStatus === "pending" ? "Your identity is under review" : "Verify your identity to unlock full banking"}</p>
            <p className="text-sm text-muted-foreground">{d.kycStatus === "pending" ? "Our compliance team usually reviews documents within 1–2 business days." : "Required by banking regulations. It takes about 5 minutes with a valid ID."}</p>
          </div>
          {d.kycStatus !== "pending" && <Button asChild className="min-h-11"><Link to="/kyc">Verify now</Link></Button>}
        </section>
      )}

      {/* Quick actions */}
      <section aria-label="Quick actions" className="grid grid-cols-2 gap-2 min-[500px]:grid-cols-5">
        <QuickAction icon={Send} label="Send" to="/send" />
        <QuickAction icon={ArrowDownLeft} label="Receive" to="/receive" />
        <QuickAction icon={ArrowLeftRight} label="Transfer" to="/send" />
        <QuickAction icon={FileText} label="Statements" to="/statements" />
        <QuickAction icon={Users} label="Beneficiaries" to="/beneficiaries" />
      </section>

      {alerts.length > 0 && (
        <section aria-label="Account alerts" className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p>
                <Link to="/accounts/$accountId" params={{ accountId: String(a.id) }} className="font-medium underline">{a.nickname}</Link>{" "}
                {a.status === "frozen" ? "is frozen — no money can move in or out." : a.status === "restricted" ? "is restricted — outgoing payments are blocked." : "is below your low-balance alert threshold."}
              </p>
            </div>
          ))}
        </section>
      )}

      {/* Totals */}
      <section aria-label="Balances by currency" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {d.totals.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 md:col-span-3">
            <p className="font-medium">You don't have an open account yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Open a savings or checking account to get started.</p>
            <Button asChild className="mt-4 min-h-11"><Link to="/accounts"><Plus /> Open an account</Link></Button>
          </div>
        ) : d.totals.map((t) => (
          <article key={t.currency} className="rounded-lg border bg-primary p-5 text-primary-foreground shadow-sm">
            <p className="text-xs font-semibold uppercase opacity-80">Total balance · {t.currency}</p>
            <p className="mt-3 font-serif text-3xl">{money(t.current, t.currency)}</p>
            <p className="mt-2 text-sm opacity-80">Available {money(t.available, t.currency)}</p>
          </article>
        ))}
      </section>


      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly stats + chart */}
        <section aria-labelledby="flow-h" className="rounded-lg border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="flow-h" className="mr-auto font-sans text-lg font-semibold">Money in &amp; out</h3>
            {d.totals.length > 1 && (
              <select aria-label="Currency" value={cur ?? ""} onChange={(e) => setCur(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                {d.totals.map((t) => <option key={t.currency}>{t.currency}</option>)}
              </select>
            )}
            <select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value) as Days)} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option>
            </select>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(d.monthly.length ? d.monthly : [{ currency: cur ?? "USD", moneyIn: "0", moneyOut: "0" }]).map((m) => (
              <div key={m.currency} className="grid grid-cols-2 gap-3 sm:col-span-2">
                <div className="rounded-md bg-muted/60 p-3"><p className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowDownLeft className="size-3" /> In this month · {m.currency}</p><p className="mt-1 font-semibold">{money(m.moneyIn, m.currency)}</p></div>
                <div className="rounded-md bg-muted/60 p-3"><p className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowUpRight className="size-3" /> Out this month · {m.currency}</p><p className="mt-1 font-semibold">{money(m.moneyOut, m.currency)}</p></div>
              </div>
            ))}
          </div>
          <div className="mt-5 h-64">
            {!series ? <div className="h-full animate-pulse rounded bg-muted" /> : hidden ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">Balances are hidden.</div>
            ) : series.every((s) => s.moneyIn === "0" && s.moneyOut === "0") ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">No posted transactions in this period.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series.map((s) => ({ label: s.label, In: minorToChartNumber(s.moneyIn), Out: minorToChartNumber(s.moneyOut) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={60} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="In" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Out" fill="var(--muted-foreground)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Notifications */}
        <section aria-labelledby="notif-h" className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <h3 id="notif-h" className="font-sans text-lg font-semibold">Notifications</h3>
            {d.unread > 0 && <Badge className="ml-2">{d.unread}</Badge>}
            <Link to="/notifications" className="ml-auto text-sm text-primary underline">View all</Link>
          </div>
          {d.notifications.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Bell className="size-4" /> You're all caught up.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {d.notifications.map((n) => (
                <li key={n.id} className="py-3 text-sm"><p className="font-medium">{n.title}</p><p className="text-muted-foreground">{n.body}</p><p className="mt-1 text-xs text-muted-foreground">{fmtDate(n.createdAt)}</p></li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recent transactions */}
      <section aria-labelledby="tx-h" className="rounded-lg border bg-card p-5 shadow-sm">
        <h3 id="tx-h" className="font-sans text-lg font-semibold">Recent transactions</h3>
        <TxnTable rows={d.recent} hidden={hidden} showAccount />
      </section>
    </div>
  );
}

function QuickAction({ icon: Icon, label, to, unavailable }: { icon: typeof Send; label: string; to?: "/receive" | "/statements" | "/beneficiaries" | "/send" | "/convert"; unavailable?: boolean }) {
  const cls = "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border bg-card p-3 text-sm shadow-sm";
  if (unavailable)
    return (
      <div className={cn(cls, "cursor-not-allowed text-muted-foreground opacity-70")} aria-disabled="true" title={`${label} is not available yet`}>
        <Icon className="size-5" /><span>{label}</span><span className="text-[10px] uppercase">Not available yet</span>
      </div>
    );
  if (!to) return null;
  return <Link to={to} className={cn(cls, "transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}><Icon className="size-5" /><span>{label}</span></Link>;
}

export function TxnTable({ rows, hidden = false, showAccount = false }: { rows: Array<{ id: number; accountName: string; currency: string; amount: string; description: string; reference: string; status: string; date: string }>; hidden?: boolean; showAccount?: boolean }) {
  if (rows.length === 0) return <p className="mt-4 text-sm text-muted-foreground">No transactions yet. Money moving in or out of your accounts will appear here.</p>;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Date</th><th className="py-2 font-medium">Description</th>{showAccount && <th className="py-2 font-medium">Account</th>}<th className="py-2 font-medium">Status</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b last:border-0">
              <td className="whitespace-nowrap py-3">{fmtDate(t.date)}</td>
              <td className="py-3"><p>{t.description}</p><p className="font-mono text-xs text-muted-foreground">{t.reference}</p></td>
              {showAccount && <td className="py-3">{t.accountName}</td>}
              <td className="py-3"><Badge variant="outline" className={txnStatusBadge(t.status, t.amount).className}>{txnStatusBadge(t.status, t.amount).label}</Badge></td>
              <td className={cn("whitespace-nowrap py-3 text-right font-medium", t.amount.startsWith("-") ? "" : "text-primary")}>{hidden ? "••••" : formatMinor(t.amount, t.currency, { signed: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

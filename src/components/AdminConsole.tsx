import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AdminKyc } from "@/components/AdminKyc";
import { AdminCustomers } from "@/components/AdminCustomers";
import { AdminSupport } from "@/components/AdminSupport";
import { AdminAdjustments } from "@/components/AdminAdjustments";
import { AdminHolds } from "@/components/AdminHolds";
import { AdminClosures } from "@/components/AdminClosures";
import { AdminDisputes } from "@/components/AdminDisputes";
import { AdminReports } from "@/components/AdminReports";
import { AdminStaff } from "@/components/AdminStaff";
import { AdminSettings } from "@/components/AdminSettings";
import { LoanServicing, RepaymentBadge } from "@/components/LoanServicing";
import { adminSettlePending } from "@/lib/banking.functions";
import { adminAuditLog, adminDecideLoan, adminLoanDetail, adminRecordLoanPayment, adminDecideTaxRefund, adminListTaxRefunds, adminListCards, adminListLoans, adminListTransactions, adminOverview, adminSendNotification, adminSetCardStatus } from "@/lib/admin.functions";
import { formatMinor, fmtDate, minorToChartNumber } from "@/lib/money";
import { cn } from "@/lib/utils";

export const TABS = ["Overview", "Customers", "KYC", "Transactions", "Loans", "Adjustments", "Holds", "Tax refunds", "Cards", "Closures", "Disputes", "Support", "Messages", "Reports", "Staff", "Activity", "Settings"] as const;
export type Tab = (typeof TABS)[number];
const err = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export function AdminConsole({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div>
      {tab === "Overview" && <Overview go={setTab} />}
      {tab === "Customers" && <AdminCustomers />}
      {tab === "KYC" && <AdminKyc />}
      {tab === "Transactions" && <Transactions />}
      {tab === "Loans" && <Loans />}
      {tab === "Adjustments" && <AdminAdjustments />}
      {tab === "Holds" && <AdminHolds />}
      {tab === "Tax refunds" && <TaxRefunds />}
      {tab === "Cards" && <Cards />}
      {tab === "Support" && <AdminSupport />}
      {tab === "Messages" && <Messages />}
      {tab === "Closures" && <AdminClosures />}
      {tab === "Disputes" && <AdminDisputes />}
      {tab === "Reports" && <AdminReports />}
      {tab === "Staff" && <AdminStaff />}
      {tab === "Activity" && <Activity />}
      {tab === "Settings" && <AdminSettings />}
    </div>
  );
}

type Aging = { tab: string; label: string; days: number; count: number; oldestDays: number | null };
function AgingAlerts({ items, go }: { items: Aging[]; go: (t: Tab) => void }) {
  const late = items.filter((a) => a.count > 0);
  if (late.length === 0)
    return <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Nothing is waiting too long. All queues are within their review times.</p>;
  return (
    <section aria-label="Waiting too long" className="space-y-2">
      <h3 className="font-sans text-lg font-semibold">Needs attention</h3>
      {late.map((a) => (
        <button key={a.tab} onClick={() => go(a.tab as Tab)} className={cn("flex w-full flex-wrap items-center gap-2 rounded-lg border p-4 text-left text-sm transition-colors hover:border-primary", (a.oldestDays ?? 0) >= a.days * 2 ? "border-destructive/50 bg-destructive/5" : "border-primary/30 bg-primary/5")}>
          <Badge variant={(a.oldestDays ?? 0) >= a.days * 2 ? "destructive" : "secondary"}>{a.count}</Badge>
          <span className="font-medium">{a.label} waiting {a.days}+ day{a.days === 1 ? "" : "s"}</span>
          {a.oldestDays != null && <span className="text-muted-foreground">· oldest {a.oldestDays} day{a.oldestDays === 1 ? "" : "s"}</span>}
          <span className="ml-auto text-primary">Review →</span>
        </button>
      ))}
    </section>
  );
}

function Overview({ go }: { go: (t: Tab) => void }) {
  const load = useServerFn(adminOverview);
  const [d, setD] = useState<Awaited<ReturnType<typeof adminOverview>> | null>(null);
  const [e, setE] = useState<string | null>(null);
  useEffect(() => { load().then(setD).catch((x) => setE(err(x))); }, [load]);
  if (e) return <p className="text-sm text-destructive">{e}</p>;
  if (!d) return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  const c = d.counts;
  const tiles: Array<[string, number, Tab]> = [
    ["Customers", c.customers, "Customers"], ["Suspended customers", c.suspended, "Customers"],
    ["Open accounts", c.accounts, "Customers"], ["Frozen / restricted accounts", c.flagged, "Customers"],
    ["KYC awaiting review", c.kyc, "KYC"], ["Pending transactions", c.pending, "Transactions"],
    ["Pending loan requests", c.loans, "Loans"], ["Pending tax refunds", c.taxes, "Tax refunds"], ["Active cards", c.cards, "Cards"],
  ];
  const t = d.today ?? { new_customers: 0, txns_today: 0, active_sessions: 0, verified_emails: 0 };
  const arr = <T,>(x: T[] | undefined) => x ?? [];
  return (
    <div className="space-y-6">
      <AgingAlerts items={arr(d.aging)} go={go} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([label, n, tb]) => (
          <button key={label} onClick={() => go(tb)} className="rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{n}</p>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([["New customers today", t.new_customers], ["Transactions today", t.txns_today], ["Signed-in sessions", t.active_sessions], ["Confirmed emails", t.verified_emails]] as const).map(([l, n]) => (
          <div key={l} className="rounded-lg bg-primary p-4 text-primary-foreground shadow-sm"><p className="text-xs opacity-80">{l}</p><p className="mt-1 text-2xl font-semibold">{n}</p></div>
        ))}
      </div>
      <section className="rounded-lg border bg-card p-5">
        <h3 className="font-sans text-lg font-semibold">Total customer deposits</h3>
        {d.deposits.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No posted balances yet.</p> : (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">{d.deposits.map((x) => <div key={x.currency} className="rounded-md bg-muted/60 p-3"><p className="text-xs text-muted-foreground">{x.currency}</p><p className="font-semibold">{formatMinor(x.total, x.currency)}</p></div>)}</div>
        )}
      </section>
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Money in & out · USD · last 30 days" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={arr(d.flow).map((f) => ({ label: f.label, In: minorToChartNumber(f.moneyIn), Out: minorToChartNumber(f.moneyOut) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" /><YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" width={55} /><Tooltip /><Legend />
              <Bar dataKey="In" fill="var(--primary)" radius={[3, 3, 0, 0]} /><Bar dataKey="Out" fill="var(--gold)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <PieCard title="KYC status" data={arr(d.kycStatus)} />
        <ChartCard title="Transactions per day · last 30 days" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={arr(d.flow)}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" width={35} /><Tooltip />
              <Area type="monotone" dataKey="txns" name="Transactions" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} /></AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <PieCard title="Transaction status" data={arr(d.txnStatus)} />
        <ChartCard title="New customers & accounts · 12 months" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={arr(d.signups)}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" width={35} /><Tooltip /><Legend />
              <Bar dataKey="customers" name="Customers" fill="var(--primary)" radius={[3, 3, 0, 0]} /><Bar dataKey="accounts" name="Accounts" fill="var(--teal-mid)" radius={[3, 3, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <PieCard title="Account currencies" data={arr(d.currencies)} />
        <PieCard title="Account types" data={arr(d.accountTypes)} />
        <PieCard title="Account status" data={arr(d.accountStatus)} />
        <PieCard title="Card brands" data={arr(d.cardBrands)} />
        <PieCard title="Loan requests by status" data={arr(d.loanStatus)} />
        <ChartCard title="Loan amount requested by type">
          {arr(d.loanTypes).length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={arr(d.loanTypes)} layout="vertical"><XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" /><YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} stroke="var(--muted-foreground)" /><Tooltip />
                <Bar dataKey="value" name="Amount" fill="var(--primary)" radius={[0, 3, 3, 0]} /></BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <h3 className="font-sans text-base font-semibold">Top customer balances</h3>
          {arr(d.top).length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No balances yet.</p> : (
            <ol className="mt-3 divide-y text-sm">{arr(d.top).map((x, i) => <li key={`${x.name}-${x.currency}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-2 py-2"><span className="text-muted-foreground">{i + 1}</span><span className="truncate">{x.name}</span><span className="font-medium">{formatMinor(x.balance, x.currency)}</span></li>)}</ol>
          )}
        </section>
      </div>
    </div>
  );
}

const PIE_COLORS = ["var(--primary)", "var(--gold)", "var(--teal-mid)", "var(--muted-foreground)", "var(--teal-glow)", "var(--destructive)", "var(--ink)", "var(--success)"];

function Empty() { return <div className="grid h-full place-items-center text-sm text-muted-foreground">No data yet.</div>; }

function ChartCard({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card p-5 shadow-sm", className)}>
      <h3 className="font-sans text-base font-semibold">{title}</h3>
      <div className="mt-4 h-64">{children}</div>
    </section>
  );
}

function PieCard({ title, data }: { title: string; data: Array<{ name: string; value: number }> }) {
  return (
    <ChartCard title={title}>
      {data.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="75%" paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip /><Legend wrapperStyle={{ fontSize: 12, textTransform: "capitalize" }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function Transactions() {
  const list = useServerFn(adminListTransactions);
  const settle = useServerFn(adminSettlePending);
  const [status, setStatus] = useState<"all" | "pending" | "posted" | "cancelled">("pending");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminListTransactions>> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = useCallback(() => { setRows(null); list({ data: { status, q: q || undefined } }).then(setRows).catch((e) => { setMsg(err(e)); setRows([]); }); }, [list, status, q]);
  useEffect(() => { refresh(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (txnId: number, action: "post" | "cancel") => {
    if (!window.confirm(action === "post" ? "Complete this transaction?" : "Cancel this transaction and return the funds?")) return;
    try { const r = await settle({ data: { txnId, action } }); setMsg(r.ok ? "Done." : r.error); refresh(); } catch (e) { setMsg(err(e)); }
  };
  return (
    <div className="space-y-4">
      <form className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); refresh(); }}>
        <div className="space-y-1"><Label htmlFor="atx-status">Status</Label>
          <select id="atx-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
            <option value="pending">Pending</option><option value="posted">Posted</option><option value="cancelled">Cancelled</option><option value="all">All</option>
          </select></div>
        <div className="space-y-1"><Label htmlFor="atx-q">Search</Label><Input id="atx-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, customer, email or account number" /></div>
        <Button type="submit">Search</Button>
      </form>
      {msg && <p className="text-sm">{msg}</p>}
      {!rows ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No transactions found.</p> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3">Date</th><th className="p-3">Customer</th><th className="p-3">Description</th><th className="p-3">Status</th><th className="p-3 text-right">Amount</th><th className="p-3" /></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={`${r.txnId}-${i}`} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap p-3">{fmtDate(r.date)}</td>
                <td className="p-3"><p>{r.customer}</p><p className="text-xs text-muted-foreground">{r.account}</p></td>
                <td className="p-3"><p>{r.description}</p><p className="font-mono text-xs text-muted-foreground">{r.reference}</p>{r.details && <p className="mt-1 max-w-xs break-all text-xs text-muted-foreground">{r.details}</p>}</td>
                <td className="p-3"><Badge variant={r.status === "posted" ? "outline" : r.status === "pending" ? "secondary" : "destructive"} className="capitalize">{r.status}</Badge></td>
                <td className={cn("whitespace-nowrap p-3 text-right font-medium", !r.amount.startsWith("-") && "text-primary")}>{formatMinor(r.amount, r.currency, { signed: true })}</td>
                <td className="whitespace-nowrap p-3 text-right">{r.status === "pending" && <><Button size="sm" onClick={() => act(r.txnId, "post")}>Complete</Button> <Button size="sm" variant="outline" onClick={() => act(r.txnId, "cancel")}>Cancel</Button></>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Loans() {
  const list = useServerFn(adminListLoans);
  const decide = useServerFn(adminDecideLoan);
  const loanDetail = useServerFn(adminLoanDetail);
  const recordPayment = useServerFn(adminRecordLoanPayment);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<number | null>(null);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminListLoans>> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = useCallback(() => list().then(setRows).catch((e) => { setMsg(err(e)); setRows([]); }), [list]);
  useEffect(() => { refresh(); }, [refresh]);
  const act = async (id: number, decision: "approved" | "rejected") => {
    let apr: number | undefined;
    if (decision === "approved") {
      const a = window.prompt("Annual interest rate (APR %) for this loan, e.g. 9.5:");
      if (a === null) return;
      apr = Number(a);
      if (!Number.isFinite(apr) || apr < 0 || apr > 36) { setMsg("Enter an APR between 0 and 36."); return; }
    }
    const note = window.prompt(`Note to customer (optional) — ${decision === "rejected" ? "decline reason" : "approval note"}:`);
    if (note === null) return;
    try { const r = await decide({ data: { id, decision, apr, note: note || undefined } }); setMsg(r.ok ? "Saved. The customer has been notified." : r.error); refresh(); } catch (e) { setMsg(err(e)); }
  };
  if (!rows) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const active = rows.filter((l) => l.state.repayment === "current" || l.state.repayment === "overdue");
  const overdue = rows.filter((l) => l.state.repayment === "overdue");
  const shown = rows.filter((l) => filter === "all" ? true : filter === "pending" ? l.status === "pending" : filter === "active" ? l.state.repayment === "current" || l.state.repayment === "overdue" : filter === "overdue" ? l.state.repayment === "overdue" : filter === "paid_off" ? l.state.repayment === "paid_off" : l.status === "rejected" || l.status === "cancelled");
  const sumBy = (list: typeof rows, k: "outstanding" | "paidTotal") => {
    const m = new Map<string, bigint>();
    for (const l of list) m.set(l.currency, (m.get(l.currency) ?? 0n) + BigInt(l.state[k]));
    return [...m].map(([c, v]) => formatMinor(v.toString(), c)).join(" · ") || "—";
  };
  const FILTERS = [["all", "All"], ["pending", "Pending review"], ["active", "In repayment"], ["overdue", "Overdue"], ["paid_off", "Paid off"], ["closed", "Declined / cancelled"]] as const;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        {([["Pending review", String(rows.filter((l) => l.status === "pending").length)], ["Loans in repayment", String(active.length)], ["Outstanding principal", sumBy(active, "outstanding")], ["Overdue loans", `${overdue.length}${overdue.length ? " · " + sumBy(overdue, "outstanding") : ""}`]] as const).map(([k, v]) => (
          <div key={k} className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{k}</p><p className={cn("mt-1 font-semibold", k === "Overdue loans" && overdue.length > 0 && "text-destructive")}>{v}</p></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map(([k, label]) => <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>{label}</Button>)}
      </div>
      {msg && <p className="text-sm">{msg}</p>}
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">No loans in this view.</p> : shown.map((l) => (
        <div key={l.id} className={cn("rounded-lg border bg-card p-4", l.state.repayment === "overdue" && "border-destructive/50")}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1"><p className="font-medium">#{l.id} · {l.customer} · <span className="capitalize">{l.type}</span></p><p className="truncate text-xs text-muted-foreground">{l.email} · applied {fmtDate(l.createdAt)}</p></div>
            <p className="font-semibold">{formatMinor(l.amount, l.currency)}</p>
            <Badge variant={l.status === "approved" ? "default" : l.status === "pending" ? "secondary" : "outline"} className="capitalize">{l.status === "rejected" ? "declined" : l.status}</Badge>
            <RepaymentBadge state={l.state} />
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Term</dt><dd>{l.term} months</dd></div>
            <div><dt className="text-xs text-muted-foreground">Monthly income</dt><dd>{formatMinor(l.income, l.currency)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Employment</dt><dd>{l.employment || "—"}</dd></div>
            <div className="sm:col-span-3"><dt className="text-xs text-muted-foreground">Purpose</dt><dd className="break-words">{l.purpose}</dd></div>
            {l.apr != null && l.payment && <div className="sm:col-span-3"><dt className="text-xs text-muted-foreground">Terms</dt><dd>{l.apr}% APR · {formatMinor(l.payment, l.currency)}/month</dd></div>}
            {l.state.repayment && l.state.repayment !== "paid_off" && <div className="sm:col-span-3"><dt className="text-xs text-muted-foreground">Servicing</dt><dd>Balance {formatMinor(l.state.outstanding, l.currency)} · paid {formatMinor(l.state.paidTotal, l.currency)} · next {formatMinor(l.state.nextDueAmount, l.currency)} due {l.state.nextDueDate ? fmtDate(l.state.nextDueDate) : "—"}</dd></div>}
            {l.note && <div className="sm:col-span-3"><dt className="text-xs text-muted-foreground">Reviewer note</dt><dd>{l.note}</dd></div>}
          </dl>
          {l.status === "pending" && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => act(l.id, "approved")}>Approve</Button><Button size="sm" variant="destructive" onClick={() => act(l.id, "rejected")}>Decline</Button></div>}
          {l.state.repayment && <div className="mt-3"><Button size="sm" variant="outline" onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? "Hide repayments" : "Repayments & schedule"}</Button></div>}
          {open === l.id && <div className="mt-4 border-t pt-4"><LoanServicing loanId={l.id} currency={l.currency} term={l.term} load={loanDetail} pay={recordPayment} payLabel="Collect a payment from the borrower's account" onChanged={refresh} /></div>}
        </div>
      ))}
    </div>
  );
}

const FILING_LABEL: Record<string, string> = { single: "Single", married_joint: "Married filing jointly", married_separate: "Married filing separately", head_of_household: "Head of household", widow: "Qualifying surviving spouse" };

function TaxRefunds() {
  const list = useServerFn(adminListTaxRefunds);
  const decide = useServerFn(adminDecideTaxRefund);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminListTaxRefunds>> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = useCallback(() => list().then(setRows).catch((e) => { setMsg(err(e)); setRows([]); }), [list]);
  useEffect(() => { refresh(); }, [refresh]);
  const act = async (r: { id: number; amount: string }, decision: "approved" | "rejected") => {
    let amount: number | undefined;
    if (decision === "approved") {
      const a = window.prompt("Refund amount to deposit (USD). Change it if the IRS adjusted the refund:", (Number(r.amount) / 100).toFixed(2));
      if (a === null) return;
      amount = Number(a);
      if (!Number.isFinite(amount) || amount <= 0) { setMsg("Enter a valid amount."); return; }
    }
    const note = window.prompt(decision === "rejected" ? "Reason for declining (shown to customer):" : "Note to customer (optional):");
    if (note === null) return;
    try { const x = await decide({ data: { id: r.id, decision, amount, note: note || undefined } }); setMsg(x.ok ? (decision === "approved" ? "Refund deposited. The customer has been notified." : "Declined. The customer has been notified.") : x.error); refresh(); } catch (e) { setMsg(err(e)); }
  };
  if (!rows) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-3">
      {msg && <p className="text-sm">{msg}</p>}
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No tax refund requests yet.</p> : rows.map((r) => (
        <div key={r.id} className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1"><p className="font-medium">{r.customer} · Tax year {r.year}</p><p className="truncate text-xs text-muted-foreground">{r.email} · {fmtDate(r.createdAt)}</p></div>
            <p className="font-semibold">{formatMinor(r.approved ?? r.amount, "USD")}</p>
            <Badge variant={r.status === "approved" ? "default" : r.status === "pending" ? "secondary" : "outline"} className="capitalize">{r.status === "rejected" ? "declined" : r.status === "approved" ? "deposited" : r.status}</Badge>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Form</dt><dd>{r.form}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Filing status</dt><dd>{FILING_LABEL[r.filing] ?? r.filing}</dd></div>
            <div><dt className="text-xs text-muted-foreground">SSN / ITIN</dt><dd>•••-••-{r.last4}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Adjusted gross income</dt><dd>{r.agi ? formatMinor(r.agi, "USD") : "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Federal tax withheld</dt><dd>{r.withheld ? formatMinor(r.withheld, "USD") : "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Deposit account</dt><dd>{r.account}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Estimated refund</dt><dd>{formatMinor(r.amount, "USD")}</dd></div>
            {r.note && <div className="sm:col-span-3"><dt className="text-xs text-muted-foreground">Reviewer note</dt><dd>{r.note}</dd></div>}
          </dl>
          {r.status === "pending" && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => act(r, "approved")}>Approve &amp; deposit</Button><Button size="sm" variant="destructive" onClick={() => act(r, "rejected")}>Decline</Button></div>}
        </div>
      ))}
    </div>
  );
}

function Cards() {
  const list = useServerFn(adminListCards);
  const set = useServerFn(adminSetCardStatus);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminListCards>> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = useCallback(() => list().then(setRows).catch((e) => { setMsg(err(e)); setRows([]); }), [list]);
  useEffect(() => { refresh(); }, [refresh]);
  if (!rows) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-3">
      {msg && <p className="text-sm">{msg}</p>}
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No cards issued yet.</p> : rows.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
          <div className="min-w-0 flex-1"><p className="font-medium capitalize">{c.brand} •••• {c.last4} <span className="text-sm font-normal text-muted-foreground">exp {c.exp} · {c.currency}</span></p><p className="truncate text-xs text-muted-foreground">{c.customer} · {c.email}</p></div>
          <Badge variant={c.status === "active" ? "outline" : "destructive"} className="capitalize">{c.status}</Badge>
          <Button size="sm" variant="outline" onClick={async () => { try { const r = await set({ data: { id: c.id, status: c.status === "active" ? "frozen" : "active" } }); setMsg(r.ok ? "Done." : r.error); refresh(); } catch (e) { setMsg(err(e)); } }}>{c.status === "active" ? "Freeze" : "Unfreeze"}</Button>
        </div>
      ))}
    </div>
  );
}

function Messages() {
  const send = useServerFn(adminSendNotification);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    const raw = String(f.get("userId") || "").trim();
    if (!raw && !window.confirm("Send this message to every active customer?")) return;
    setBusy(true); setMsg(null);
    try {
      const r = await send({ data: { userId: raw ? Number(raw) : undefined, title: String(f.get("title")), body: String(f.get("body")) } });
      setMsg({ ok: true, text: `Sent to ${r.sent} customer${r.sent === 1 ? "" : "s"}.` }); form.reset();
    } catch (x) { setMsg({ ok: false, text: err(x) }); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="max-w-xl space-y-4 rounded-lg border bg-card p-5">
      <p className="text-sm text-muted-foreground">Messages appear in the customer's notifications.</p>
      <div className="space-y-1"><Label htmlFor="m-user">Customer ID (leave empty for all customers)</Label><Input id="m-user" name="userId" inputMode="numeric" pattern="\d*" /></div>
      <div className="space-y-1"><Label htmlFor="m-title">Title</Label><Input id="m-title" name="title" required minLength={2} maxLength={100} /></div>
      <div className="space-y-1"><Label htmlFor="m-body">Message</Label><Textarea id="m-body" name="body" required minLength={2} maxLength={1000} /></div>
      <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send message"}</Button>
      {msg && <p className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
    </form>
  );
}

function Activity() {
  const load = useServerFn(adminAuditLog);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminAuditLog>> | null>(null);
  useEffect(() => { load().then(setRows).catch(() => setRows([])); }, [load]);
  if (!rows) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;
  return (
    <ol className="divide-y rounded-lg border bg-card text-sm">
      {rows.map((r) => <li key={r.id} className="grid gap-1 p-3 sm:grid-cols-[11rem_minmax(0,1fr)]"><span className="text-xs text-muted-foreground">{fmtDate(r.at)}</span><span className="min-w-0 break-words"><span className="font-medium">{r.action}</span> · customer #{r.userId ?? "—"} · by #{r.actorId ?? "—"} {r.meta && <span className="text-xs text-muted-foreground">{r.meta}</span>}</span></li>)}
    </ol>
  );
}

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminExportCsv, adminMonthlyReport } from "@/lib/staff.functions";
import { formatMinor } from "@/lib/money";

type Report = Awaited<ReturnType<typeof adminMonthlyReport>>;
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const thisMonth = () => new Date().toISOString().slice(0, 7);

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminReports() {
  const exp = useServerFn(adminExportCsv);
  const rep = useServerFn(adminMonthlyReport);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [month, setMonth] = useState(thisMonth());
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const doExport = async (kind: "transactions" | "loans" | "customers") => {
    setBusy(kind); setMsg(null);
    try { const r = await exp({ data: { kind, from: from || undefined, to: to || undefined } }); download(r.filename, r.csv); }
    catch (e) { setMsg(errText(e)); } finally { setBusy(null); }
  };
  const runReport = async () => {
    setBusy("report"); setMsg(null);
    try { setReport(await rep({ data: { month } })); } catch (e) { setMsg(errText(e)); } finally { setBusy(null); }
  };
  const reportCsv = () => {
    if (!report) return;
    const lines = [["Metric", "Currency", "Value"], ["New customers", "", report.newCustomers], ["Accounts opened", "", report.accountsOpened], ["Accounts closed", "", report.accountsClosed],
      ...report.money.flatMap((m) => [["Money in", m.currency, m.moneyIn], ["Money out", m.currency, m.moneyOut], ["Transactions", m.currency, m.txns]]),
      ...report.loans.flatMap((l) => [["Loans requested", l.currency, `${l.requested} (${l.requestedAmount})`], ["Loans approved", l.currency, `${l.approved} (${l.approvedAmount})`]])];
    download(`monthly-report-${report.month}.csv`, lines.map((r) => r.join(",")).join("\r\n"));
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl">Exports &amp; reports</h2><p className="text-sm text-muted-foreground">Download spreadsheets for audits, or view a monthly summary. Every export is recorded in the activity log.</p></div>
      <section className="space-y-4 rounded-lg border bg-card p-5 print:hidden">
        <h3 className="font-sans text-base font-semibold">CSV exports</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2"><Label htmlFor="exp-from">From (optional)</Label><Input id="exp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 w-44" /></div>
          <div className="space-y-2"><Label htmlFor="exp-to">To (optional)</Label><Input id="exp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-44" /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!!busy} onClick={() => doExport("transactions")}>{busy === "transactions" ? "Preparing…" : "Transactions CSV"}</Button>
          <Button variant="outline" disabled={!!busy} onClick={() => doExport("loans")}>{busy === "loans" ? "Preparing…" : "Loans CSV"}</Button>
          <Button variant="outline" disabled={!!busy} onClick={() => doExport("customers")}>{busy === "customers" ? "Preparing…" : "Customers CSV"}</Button>
        </div>
      </section>
      <section className="space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <div className="space-y-2"><Label htmlFor="rep-month">Monthly summary</Label><Input id="rep-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 w-48" /></div>
          <Button disabled={!!busy || !month} onClick={runReport}>{busy === "report" ? "Loading…" : "Show report"}</Button>
          {report && <><Button variant="outline" onClick={reportCsv}>Download CSV</Button><Button variant="outline" onClick={() => window.print()}>Print / save PDF</Button></>}
        </div>
        {report && (
          <div className="space-y-5">
            <h3 className="font-sans text-lg font-semibold">Summary for {new Date(report.month + "-01T00:00:00Z").toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</h3>
            <div className="grid grid-cols-3 gap-3">
              {([["New customers", report.newCustomers], ["Accounts opened", report.accountsOpened], ["Accounts closed", report.accountsClosed]] as const).map(([l, n]) => (
                <div key={l} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-semibold">{n}</p></div>
              ))}
            </div>
            <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Currency</th><th className="py-2 text-right">Money in</th><th className="py-2 text-right">Money out</th><th className="py-2 text-right">Net</th><th className="py-2 text-right">Transactions</th></tr></thead>
              <tbody>{report.money.length === 0 ? <tr><td colSpan={5} className="py-3 text-muted-foreground">No posted transactions this month.</td></tr> : report.money.map((m) => (
                <tr key={m.currency} className="border-b last:border-0"><td className="py-2">{m.currency}</td><td className="py-2 text-right">{formatMinor(m.moneyIn, m.currency)}</td><td className="py-2 text-right">{formatMinor(m.moneyOut, m.currency)}</td><td className="py-2 text-right font-medium">{formatMinor((BigInt(m.moneyIn) - BigInt(m.moneyOut)).toString(), m.currency)}</td><td className="py-2 text-right">{m.txns}</td></tr>
              ))}</tbody></table>
            <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Loans</th><th className="py-2 text-right">Requested</th><th className="py-2 text-right">Requested amount</th><th className="py-2 text-right">Approved</th><th className="py-2 text-right">Approved amount</th></tr></thead>
              <tbody>{report.loans.length === 0 ? <tr><td colSpan={5} className="py-3 text-muted-foreground">No loan requests this month.</td></tr> : report.loans.map((l) => (
                <tr key={l.currency} className="border-b last:border-0"><td className="py-2">{l.currency}</td><td className="py-2 text-right">{l.requested}</td><td className="py-2 text-right">{formatMinor(l.requestedAmount, l.currency)}</td><td className="py-2 text-right">{l.approved}</td><td className="py-2 text-right">{formatMinor(l.approvedAmount, l.currency)}</td></tr>
              ))}</tbody></table>
          </div>
        )}
      </section>
      {msg && <p className="text-sm text-destructive">{msg}</p>}
    </div>
  );
}

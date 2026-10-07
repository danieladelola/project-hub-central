import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountPage, Panel, errText } from "@/components/AccountPage";
import { emailStatement, getStatement, listAccounts } from "@/lib/banking.functions";
import { formatMinor, fmtDate, minorToDecimal } from "@/lib/money";

export const Route = createFileRoute("/statements")({
  ssr: false,
  head: () => ({ meta: [{ title: "Statements — Universal Crest" }, { name: "description", content: "Preview, download, print, or email your Universal Crest account statements." }, { property: "og:title", content: "Statements — Universal Crest" }, { property: "og:description", content: "Preview, download, print, or email your Universal Crest account statements." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: StatementsPage,
});

type Stmt = Awaited<ReturnType<typeof getStatement>>;

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

function daysRange(n: number) {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  return { from: iso(new Date(today.getTime() - (n - 1) * 86400000)), to: iso(today) };
}

// Neutralise spreadsheet formula injection.
function csvCell(v: string) {
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadBlob(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StatementsPage() {
  const loadAcc = useServerFn(listAccounts);
  const loadStmt = useServerFn(getStatement);
  const sendStmt = useServerFn(emailStatement);
  const [days, setDays] = useState(30);
  const [mailMsg, setMailMsg] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof listAccounts>> | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [mode, setMode] = useState<"days" | "month" | "custom">("days");
  const now = new Date();
  const [month, setMonth] = useState(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
  const [from, setFrom] = useState(monthRange(month).from);
  const [to, setTo] = useState(monthRange(month).to);
  const [s, setS] = useState<Stmt | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { loadAcc().then((a) => { setAccounts(a); setAccountId(a[0]?.id ?? null); }).catch(() => setAccounts([])); }, [loadAcc]);

  async function preview() {
    if (!accountId) return;
    const r = mode === "days" ? daysRange(days) : mode === "month" ? monthRange(month) : { from, to };
    setMailMsg(null);
    setBusy(true); setErr(null);
    try { setS(await loadStmt({ data: { accountId, ...r } })); } catch (e) { setErr(errText(e)); setS(null); } finally { setBusy(false); }
  }

  const fileBase = s ? `statement-${s.accountNumber.slice(-4)}-${s.from}_${s.to}` : "statement";

  function exportCsv() {
    if (!s) return;
    const rows = [
      ["Account holder", s.holder], ["Account", `${s.nickname} (${s.accountNumber})`], ["Currency", s.currency],
      ["Period (UTC)", `${s.from} to ${s.to}`], ["Opening balance", minorToDecimal(s.opening)], [],
      ["Date", "Description", "Reference", "Debit", "Credit", "Balance"],
      ...s.lines.map((l) => [l.date.slice(0, 10), l.description, l.reference, minorToDecimal(l.debit), minorToDecimal(l.credit), minorToDecimal(l.balance)]),
      [], ["Total debits", minorToDecimal(s.totalDebits)], ["Total credits", minorToDecimal(s.totalCredits)], ["Closing balance", minorToDecimal(s.closing)],
    ];
    downloadBlob(rows.map((r) => r.map((c) => csvCell(c ?? "")).join(",")).join("\r\n"), `${fileBase}.csv`, "text/csv;charset=utf-8");
  }

  async function buildPdf() {
    if (!s) return null;
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    const m = (v: string) => (v ? minorToDecimal(v) : "");
    doc.setFontSize(16); doc.text(s.isDemo ? "DEMO — FICTIONAL FUNDS — NOT A REAL STATEMENT" : "Universal Crest — Account Statement", 14, 18);
    doc.setFontSize(10);
    [`Account holder: ${s.holder}`, `Account: ${s.nickname} (${s.accountNumber}) · ${s.type}`, `Currency: ${s.currency}`,
      `Period: ${s.from} to ${s.to} (UTC)`, `Opening balance: ${m(s.opening)}`].forEach((t, i) => doc.text(t, 14, 28 + i * 6));
    autoTable(doc, {
      startY: 60,
      head: [["Date", "Description", "Reference", "Debit", "Credit", "Balance"]],
      body: s.lines.map((l) => [l.date.slice(0, 10), l.description, l.reference, m(l.debit), m(l.credit), m(l.balance)]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [107, 26, 43] },
    });
    const y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60) + 10;
    doc.text(`Total debits: ${m(s.totalDebits)}   Total credits: ${m(s.totalCredits)}   Closing balance: ${m(s.closing)}`, 14, y);
    return doc;
  }

  async function exportPdf() {
    const doc = await buildPdf();
    doc?.save(`${fileBase}.pdf`);
  }

  async function emailPdf() {
    if (!s) return;
    const doc = await buildPdf();
    if (!doc) return;
    setBusy(true); setMailMsg(null);
    try {
      const b64 = (doc.output("datauristring") as string).split(",")[1];
      if (!b64) { setMailMsg("We couldn't prepare this statement for email. Please download the PDF instead."); return; }
      const r = await sendStmt({ data: { filename: `${fileBase}.pdf`, pdfBase64: b64, period: `${s.from} to ${s.to}` } });
      setMailMsg(r.ok ? `Statement sent to ${r.email}.` : r.error);
    } catch (e) { setMailMsg(errText(e)); } finally { setBusy(false); }
  }

  return (
    <AccountPage title="Statements" subtitle="Posted transactions only. All dates are in UTC." wide>
      <div className="print:hidden">
        <Panel title="Choose a period">
          {!accounts ? <p className="text-muted-foreground">Loading…</p> : accounts.length === 0 ? <p className="text-muted-foreground">You have no accounts.</p> : (
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="acc">Account</Label>
                <select id="acc" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value))}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.nickname} · {a.currency} · {a.masked} · {a.holderName}</option>)}
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="mode">Period</Label>
                <select id="mode" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={mode} onChange={(e) => setMode(e.target.value as "month")}>
                  <option value="days">Last number of days</option><option value="month">Month</option><option value="custom">Custom range</option>
                </select>
              </div>
              {mode === "days" ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="days">Number of days</Label>
                   <div className="flex flex-wrap gap-2">
                    <Input id="days" type="number" min={1} max={730} value={days} onChange={(e) => setDays(Math.max(1, Math.min(730, Number(e.target.value) || 1)))} className="h-11 w-28" />
                    {[7, 30, 90, 180, 365].map((n) => <Button key={n} type="button" variant={days === n ? "default" : "outline"} className="h-11" onClick={() => setDays(n)}>{n}</Button>)}
                  </div>
                </div>
              ) : mode === "month" ? (
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="month">Month</Label><Input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-11" /></div>
              ) : (
                <>
                  <div className="space-y-2"><Label htmlFor="from">From</Label><Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" /></div>
                  <div className="space-y-2"><Label htmlFor="to">To</Label><Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" /></div>
                </>
              )}
              <div className="flex items-end sm:col-span-4"><Button className="h-11" onClick={preview} disabled={busy}>{busy ? "Loading…" : "Preview statement"}</Button></div>
              {err && <p className="text-sm text-destructive sm:col-span-4">{err}</p>}
            </div>
          )}
        </Panel>
      </div>

      {s && (
        <>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button onClick={emailPdf} disabled={busy}>{busy ? "Sending…" : "Email me the PDF"}</Button>
            <Button variant="outline" onClick={exportPdf}>Download PDF</Button>
            <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
            <Button variant="outline" onClick={() => window.print()}>Print</Button>
            {mailMsg && <p className="w-full text-sm text-muted-foreground">{mailMsg}</p>}
          </div>
          <section className="rounded-lg border bg-card p-6 print:border-0 print:p-0">
            <h2 className="text-2xl">Account statement</h2>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Account holder</dt><dd>{s.holder}</dd></div>
              <div><dt className="text-muted-foreground">Account</dt><dd>{s.nickname} · <span className="font-mono">{s.accountNumber}</span> · <span className="capitalize">{s.type}</span></dd></div>
              <div><dt className="text-muted-foreground">Period (UTC)</dt><dd>{s.from} to {s.to}</dd></div>
              <div><dt className="text-muted-foreground">Currency</dt><dd>{s.currency}</dd></div>
            </dl>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Date</th><th>Description</th><th>Reference</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
                <tbody>
                  <tr className="border-b"><td className="py-2" colSpan={5}>Opening balance</td><td className="text-right font-medium">{formatMinor(s.opening, s.currency)}</td></tr>
                  {s.lines.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No posted transactions in this period.</td></tr>}
                  {s.lines.map((l) => (
                    <tr key={l.id} className="border-b">
                      <td className="whitespace-nowrap py-2">{fmtDate(l.date)}</td><td>{l.description}</td><td className="font-mono text-xs">{l.reference}</td>
                      <td className="text-right">{l.debit && formatMinor(l.debit, s.currency)}</td><td className="text-right">{l.credit && formatMinor(l.credit, s.currency)}</td>
                      <td className="text-right">{formatMinor(l.balance, s.currency)}</td>
                    </tr>
                  ))}
                  <tr className="border-b font-medium"><td className="py-2" colSpan={3}>Totals</td><td className="text-right">{formatMinor(s.totalDebits, s.currency)}</td><td className="text-right">{formatMinor(s.totalCredits, s.currency)}</td><td /></tr>
                  <tr className="font-semibold"><td className="py-2" colSpan={5}>Closing balance</td><td className="text-right">{formatMinor(s.closing, s.currency)}</td></tr>
                </tbody>
              </table>
            </div>
            {s.pending.length > 0 && (
              <div className="mt-6">
                <h3 className="font-sans font-semibold">Pending (not part of this statement)</h3>
                <ul className="mt-2 text-sm">{s.pending.map((p) => <li key={p.id}>{fmtDate(p.date)} · {p.description} · {formatMinor(p.amount, s.currency, { signed: true })}</li>)}</ul>
              </div>
            )}
          </section>
        </>
      )}
    </AccountPage>
  );
}

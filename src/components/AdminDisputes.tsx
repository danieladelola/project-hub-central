import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { adminDecideDispute, adminListDisputes } from "@/lib/safety.functions";
import { formatMinor } from "@/lib/money";
import { errText } from "@/components/AccountPage";

type Row = Awaited<ReturnType<typeof adminListDisputes>>[number];

export function AdminDisputes() {
  const list = useServerFn(adminListDisputes);
  const decide = useServerFn(adminDecideDispute);
  const [status, setStatus] = useState<"open" | "all">("open");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => list({ data: { status } }).then(setRows).catch((e) => setMsg({ ok: false, text: errText(e) })), [list, status]);
  useEffect(() => { setRows(null); refresh(); }, [refresh]);

  const act = async (id: number, decision: "resolved" | "rejected") => {
    setBusy(true); setMsg(null);
    try {
      const r = await decide({ data: { id, decision, note: notes[id] ?? "" } });
      setMsg(r.ok ? { ok: true, text: "Customer notified." } : { ok: false, text: r.error });
      await refresh();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Customer disputes</h2>
        <select aria-label="Filter" className="ml-auto h-9 rounded-md border bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as "open")}>
          <option value="open">Open</option><option value="all">All</option>
        </select>
      </div>
      <p className="text-sm text-muted-foreground">Customers flag transactions here. If money needs to move, use Adjustments or Holds, then resolve the dispute with a note.</p>
      {msg && <p role="status" className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
      {!rows ? <div className="h-32 animate-pulse rounded-lg bg-muted" /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No disputes.</p> : rows.map((d) => (
        <div key={d.id} className="space-y-2 rounded-lg border bg-card p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{d.customer}</span><span className="text-muted-foreground">{d.email}</span>
            <Badge variant={d.status === "open" ? "secondary" : "outline"} className="capitalize sm:ml-auto">{d.status}</Badge>
          </div>
          <p><span className="font-mono text-xs">{d.reference}</span> · {d.description} · {formatMinor(d.amount, d.currency, { signed: true })} · {d.account} · {new Date(d.txnDate).toLocaleDateString()}</p>
          <p><strong>{d.reason}</strong> — {d.details}</p>
          <p className="text-xs text-muted-foreground">Filed {new Date(d.createdAt).toLocaleString()}</p>
          {d.status === "open" ? (
            <div className="space-y-2">
              <Textarea placeholder="Note to the customer" value={notes[d.id] ?? ""} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => act(d.id, "resolved")}>Resolve</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => act(d.id, "rejected")}>Decline</Button>
              </div>
            </div>
          ) : d.adminNote && <p className="text-muted-foreground">Note: {d.adminNote}</p>}
        </div>
      ))}
    </div>
  );
}

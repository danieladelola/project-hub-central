import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adminDecideClosure, adminListClosures } from "@/lib/staff.functions";
import { formatMinor, fmtDate } from "@/lib/money";

type Status = "pending" | "approved" | "rejected" | "cancelled" | "all";
type Row = Awaited<ReturnType<typeof adminListClosures>>[number];
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export function AdminClosures() {
  const list = useServerFn(adminListClosures);
  const decide = useServerFn(adminDecideClosure);
  const [status, setStatus] = useState<Status>("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => list({ data: { status } }).then(setRows).catch((e) => { setRows([]); setMsg({ ok: false, text: errText(e) }); }), [list, status]);
  useEffect(() => { refresh(); }, [refresh]);

  const act = async (r: Row, decision: "approve" | "reject") => {
    let note: string | undefined;
    if (decision === "reject") { note = window.prompt("Reason for declining (sent to the customer):")?.trim(); if (!note) return; }
    else if (!window.confirm(`Close ${r.customer}'s account ••••${r.number.slice(-4)}? A final balance check runs first.`)) return;
    setBusy(true); setMsg(null);
    try { const res = await decide({ data: { requestId: r.id, decision, note } }); setMsg(res.ok ? { ok: true, text: decision === "approve" ? "Account closed." : "Request declined." } : { ok: false, text: res.error }); await refresh(); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-2xl">Account closing requests</h2><p className="text-sm text-muted-foreground">An account can only be closed when its balance is zero with no holds or pending items.</p></div>
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Filter by status">
          <option value="pending">Pending</option><option value="approved">Closed</option><option value="rejected">Declined</option><option value="cancelled">Cancelled</option><option value="all">All</option>
        </select>
      </div>
      {msg && <p className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
      {!rows ? <div className="h-40 animate-pulse rounded-lg bg-muted" /> : rows.length === 0 ? <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">No requests here.</p> : (
        <div className="space-y-3">
          {rows.map((r) => {
            const clear = r.current === "0" && r.held === "0" && r.pendingIn === "0";
            return (
              <article key={r.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{r.customer} <span className="text-sm font-normal text-muted-foreground">· {r.email}</span></p>
                    <p className="text-sm text-muted-foreground">{r.nickname} ••••{r.number.slice(-4)} · {r.currency} · requested {fmtDate(r.createdAt)}</p>
                  </div>
                  <Badge variant={r.status === "pending" ? "secondary" : "outline"} className="capitalize">{r.status === "approved" ? "closed" : r.status}</Badge>
                </div>
                <p className="mt-3 text-sm">“{r.reason}”</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Balance</dt><dd className="font-semibold">{formatMinor(r.current, r.currency)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Held / pending out</dt><dd className="font-semibold">{formatMinor(r.held, r.currency)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Pending in</dt><dd className="font-semibold">{formatMinor(r.pendingIn, r.currency)}</dd></div>
                </dl>
                {r.note && <p className="mt-2 text-xs text-muted-foreground">Note: {r.note}{r.decidedBy && ` — ${r.decidedBy}`}</p>}
                {r.status === "pending" && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button disabled={busy} variant="destructive" onClick={() => act(r, "approve")}>Close account</Button>
                    <Button disabled={busy} variant="outline" onClick={() => act(r, "reject")}>Decline</Button>
                    {!clear && <p className="text-xs text-destructive">Balance check will fail: pay out or move remaining funds (Adjustments tab) and release holds first.</p>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

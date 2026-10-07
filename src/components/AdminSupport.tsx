import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminGetTicket, adminListTickets, adminReplyTicket, adminSetTicketStatus } from "@/lib/admin.functions";
import { fmtDate } from "@/lib/money";
import { cn } from "@/lib/utils";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
type Row = { id: number; subject: string; category: string; status: string; messages: number; updatedAt: string; customer: string; email: string };
type Msg = { ok: boolean; text: string } | null;
const tone = (s: string) => (s === "open" ? "default" : s === "answered" ? "secondary" : "outline") as "default" | "secondary" | "outline";

export function AdminSupport() {
  const [open, setOpen] = useState<number | null>(null);
  return open ? <Thread id={open} onBack={() => setOpen(null)} /> : <TicketList onOpen={setOpen} />;
}

function TicketList({ onOpen }: { onOpen: (id: number) => void }) {
  const list = useServerFn(adminListTickets);
  const [status, setStatus] = useState<"all" | "open" | "answered" | "closed">("open");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { setRows(null); setErr(null); list({ data: { status } }).then(setRows).catch((e) => { setErr(errText(e)); setRows([]); }); }, [list, status]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["open", "answered", "closed", "all"] as const).map((s) => <Button key={s} size="sm" variant={status === s ? "default" : "outline"} className="capitalize" onClick={() => setStatus(s)}>{s === "open" ? "Needs reply" : s}</Button>)}
        <Button size="sm" variant="ghost" onClick={load}>Refresh</Button>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {!rows ? <div className="h-40 animate-pulse rounded-lg bg-muted" /> : rows.length === 0 ? (!err && <p className="text-sm text-muted-foreground">No tickets here.</p>) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3">Ticket</th><th className="p-3">Customer</th><th className="p-3">Category</th><th className="p-3">Status</th><th className="p-3">Updated</th><th className="p-3" /></tr></thead>
            <tbody>{rows.map((t) => (
              <tr key={t.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => onOpen(t.id)}>
                <td className="p-3"><p className="font-medium">#{t.id} · {t.subject}</p><p className="text-xs text-muted-foreground">{t.messages} message{t.messages === 1 ? "" : "s"}</p></td>
                <td className="p-3"><p>{t.customer}</p><p className="text-xs text-muted-foreground">{t.email}</p></td>
                <td className="p-3 capitalize">{t.category.replace("_", " ")}</td>
                <td className="p-3"><Badge variant={tone(t.status)} className="capitalize">{t.status === "open" ? "Needs reply" : t.status}</Badge></td>
                <td className="whitespace-nowrap p-3 text-xs">{fmtDate(t.updatedAt)}</td>
                <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onOpen(t.id); }}>Open</Button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Thread({ id, onBack }: { id: number; onBack: () => void }) {
  const get = useServerFn(adminGetTicket);
  const reply = useServerFn(adminReplyTicket);
  const setStatus = useServerFn(adminSetTicketStatus);
  const [t, setT] = useState<Awaited<ReturnType<typeof adminGetTicket>> | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => get({ data: { id } }).then(setT).catch((e) => setMsg({ ok: false, text: errText(e) })), [get, id]);
  useEffect(() => { load(); }, [load]);

  async function send(e: FormEvent<HTMLFormElement>, close: boolean) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true); setMsg(null);
    try {
      const r = await reply({ data: { id, body: String(new FormData(form).get("body")), close } });
      if (r.ok) { form.reset(); setMsg({ ok: true, text: close ? "Reply sent and ticket closed." : "Reply sent. The customer was notified." }); await load(); }
      else setMsg({ ok: false, text: r.error });
    } catch (x) { setMsg({ ok: false, text: errText(x) }); } finally { setBusy(false); }
  }
  async function toggle(status: "open" | "closed") {
    setBusy(true); setMsg(null);
    try { const r = await setStatus({ data: { id, status } }); setMsg(r.ok ? { ok: true, text: status === "closed" ? "Ticket closed." : "Ticket reopened." } : { ok: false, text: r.error }); await load(); }
    catch (x) { setMsg({ ok: false, text: errText(x) }); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack} className="-ml-3"><ArrowLeft /> All tickets</Button>
      {msg && <p role="status" className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
      {!t ? (!msg && <div className="h-40 animate-pulse rounded-lg bg-muted" />) : (
        <>
          <section className="flex flex-wrap items-start gap-3 rounded-lg border bg-card p-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl">#{t.id} · {t.subject}</h2>
              <p className="text-sm text-muted-foreground">{t.customer} · {t.email} · <span className="capitalize">{t.category.replace("_", " ")}</span> · opened {fmtDate(t.createdAt)}</p>
            </div>
            <Badge variant={tone(t.status)} className="capitalize">{t.status === "open" ? "Needs reply" : t.status}</Badge>
            {t.status === "closed"
              ? <Button size="sm" variant="outline" disabled={busy} onClick={() => toggle("open")}>Reopen</Button>
              : <Button size="sm" variant="outline" disabled={busy} onClick={() => toggle("closed")}>Close ticket</Button>}
          </section>
          <ol className="space-y-3">{t.messages.map((m) => (
            <li key={m.id} className={cn("max-w-[85%] rounded-lg border p-3 text-sm", m.staff ? "ml-auto bg-secondary" : "bg-card")}>
              <p className="mb-1 text-xs text-muted-foreground">{m.staff ? `Staff${m.author ? ` · ${m.author}` : ""}` : t.customer} · {fmtDate(m.at)}</p>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </li>
          ))}</ol>
          <form onSubmit={(e) => send(e, false)} className="space-y-3 rounded-lg border bg-card p-4">
            <Label htmlFor="admin-reply">Reply to customer</Label>
            <Textarea id="admin-reply" name="body" required minLength={2} maxLength={4000} rows={4} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send reply"}</Button>
              <Button type="button" variant="outline" disabled={busy} onClick={(e) => { const f = e.currentTarget.form; if (f && f.reportValidity()) send({ preventDefault() {}, currentTarget: f } as unknown as FormEvent<HTMLFormElement>, true); }}>Reply & close</Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

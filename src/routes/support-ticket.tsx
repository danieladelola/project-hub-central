import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AccountPage, Panel, Msg, errText } from "@/components/AccountPage";
import { closeTicket, createTicket, getMyTicket, listMyTickets, replyTicket } from "@/lib/services.functions";
import { fmtDate } from "@/lib/money";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/support-ticket")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Support Ticket — Universal Crest" },
      { name: "description", content: "Open and follow support tickets with the Universal Crest team." },
      { property: "og:title", content: "Support Ticket — Universal Crest" },
      { property: "og:description", content: "Open and follow support tickets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SupportTicketPage,
});

const CATS = [["account", "Account"], ["cards", "Cards"], ["transfers", "Transfers"], ["loans", "Loans"], ["tax_refund", "Tax refund"], ["security", "Security"], ["other", "Other"]] as const;
const sel = "h-11 w-full rounded-md border bg-background px-3 text-sm";
type M = { ok: boolean; text: string } | null;

function SupportTicketPage() {
  const [open, setOpen] = useState<number | null>(null);
  return open ? <TicketThread id={open} onBack={() => setOpen(null)} /> : <TicketList onOpen={setOpen} />;
}

function TicketList({ onOpen }: { onOpen: (id: number) => void }) {
  const list = useServerFn(listMyTickets);
  const create = useServerFn(createTicket);
  const [items, setItems] = useState<Awaited<ReturnType<typeof listMyTickets>> | null>(null);
  const [msg, setMsg] = useState<M>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => list().then(setItems).catch((e) => { setItems([]); setMsg({ ok: false, text: errText(e) }); }), [list]);
  useEffect(() => { reload(); }, [reload]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true); setMsg(null);
    try {
      const r = await create({ data: { subject: String(f.get("subject")), category: f.get("category") as "other", body: String(f.get("body")) } });
      if (r.ok) { form.reset(); setMsg({ ok: true, text: `Ticket #${r.id} opened. We'll reply here and notify you.` }); reload(); }
      else setMsg({ ok: false, text: r.error });
    } catch (x) { setMsg({ ok: false, text: errText(x) }); } finally { setBusy(false); }
  }

  return (
    <AccountPage title="Support Ticket" subtitle="Tell us what you need help with. Our team replies right here." wide>
      <Panel title="Open a new ticket">
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="space-y-2"><Label htmlFor="subject">Subject</Label><Input id="subject" name="subject" required minLength={4} maxLength={140} className="h-11" /></div>
          <div className="space-y-2"><Label htmlFor="category">Category</Label><select id="category" name="category" className={sel}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="body">Message</Label><textarea id="body" name="body" required minLength={10} maxLength={4000} rows={4} className="w-full rounded-md border bg-background p-3 text-sm" /></div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button type="submit" className="h-11" disabled={busy}>{busy ? "Sending…" : "Submit ticket"}</Button><Msg msg={msg} /></div>
        </form>
      </Panel>
      <Panel title="Your tickets">
        {!items ? <div className="h-24 animate-pulse rounded-md bg-muted" /> : items.length === 0 ? <p className="text-sm text-muted-foreground">No tickets yet.</p> : (
          <ul className="divide-y">{items.map((t: { id: number; subject: string; status: string; messages: number; updatedAt: string }) => (
            <li key={t.id}><button type="button" onClick={() => onOpen(t.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-3 text-left text-sm hover:bg-muted/50">
              <span className="font-mono text-xs text-muted-foreground">#{t.id}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{t.subject}</span>
              <Badge variant={t.status === "answered" ? "default" : "outline"} className="capitalize">{t.status}</Badge>
              <span className="w-full text-xs text-muted-foreground sm:w-auto">{t.messages} message{t.messages === 1 ? "" : "s"} · {fmtDate(t.updatedAt)}</span>
            </button></li>
          ))}</ul>
        )}
      </Panel>
    </AccountPage>
  );
}

function TicketThread({ id, onBack }: { id: number; onBack: () => void }) {
  const get = useServerFn(getMyTicket);
  const reply = useServerFn(replyTicket);
  const close = useServerFn(closeTicket);
  const [t, setT] = useState<Awaited<ReturnType<typeof getMyTicket>> | null>(null);
  const [msg, setMsg] = useState<M>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => get({ data: { id } }).then(setT).catch((e) => setMsg({ ok: false, text: errText(e) })), [get, id]);
  useEffect(() => { load(); }, [load]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true); setMsg(null);
    try {
      const r = await reply({ data: { id, body: String(new FormData(form).get("body")) } });
      if (r.ok) { form.reset(); await load(); } else setMsg({ ok: false, text: r.error });
    } catch (x) { setMsg({ ok: false, text: errText(x) }); } finally { setBusy(false); }
  }

  return (
    <AccountPage title={t ? `Ticket #${t.id}` : "Support Ticket"} subtitle={t?.subject} wide
      actions={<Button variant="ghost" onClick={onBack}><ArrowLeft /> All tickets</Button>}>
      <Msg msg={msg} />
      {!t ? (!msg && <div className="h-40 animate-pulse rounded-lg bg-muted" />) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline" className="capitalize">{t.status}</Badge>
            <span className="text-muted-foreground">{CATS.find(([v]) => v === t.category)?.[1]} · opened {fmtDate(t.createdAt)}</span>
            {t.status !== "closed" && <Button size="sm" variant="outline" className="ml-auto" onClick={async () => { if (!window.confirm("Close this ticket?")) return; await close({ data: { id } }); load(); }}>Close ticket</Button>}
          </div>
          <ol className="space-y-3">{t.messages.map((m: { id: number; staff: boolean; body: string; at: string }) => (
            <li key={m.id} className={cn("max-w-[85%] rounded-lg border p-3 text-sm", m.staff ? "bg-secondary" : "ml-auto bg-card")}>
              <p className="mb-1 text-xs text-muted-foreground">{m.staff ? "Universal Crest support" : "You"} · {fmtDate(m.at)}</p>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </li>
          ))}</ol>
          {t.status === "closed" ? <p className="text-sm text-muted-foreground">This ticket is closed. Open a new one if you still need help.</p> : (
            <form onSubmit={onSubmit} className="space-y-3 rounded-lg border bg-card p-4">
              <Label htmlFor="reply">Reply</Label>
              <textarea id="reply" name="body" required minLength={2} maxLength={4000} rows={3} className="w-full rounded-md border bg-background p-3 text-sm" />
              <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send reply"}</Button>
            </form>
          )}
        </>
      )}
    </AccountPage>
  );
}

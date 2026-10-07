import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminAddStaff, adminListStaff, adminRemoveStaff, adminStaffActivity } from "@/lib/staff.functions";

type Staff = Awaited<ReturnType<typeof adminListStaff>>[number];
type Act = Awaited<ReturnType<typeof adminStaffActivity>>[number];
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export function AdminStaff() {
  const list = useServerFn(adminListStaff);
  const add = useServerFn(adminAddStaff);
  const remove = useServerFn(adminRemoveStaff);
  const activity = useServerFn(adminStaffActivity);
  const [rows, setRows] = useState<Staff[] | null>(null);
  const [sel, setSel] = useState<Staff | null>(null);
  const [acts, setActs] = useState<Act[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => list().then(setRows).catch((e) => { setRows([]); setMsg({ ok: false, text: errText(e) }); }), [list]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (sel) { setActs(null); activity({ data: { staffId: sel.id } }).then(setActs).catch(() => setActs([])); } }, [sel, activity]);

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true); setMsg(null);
    try {
      const r = await add({ data: { fullName: String(f.get("name")), email: String(f.get("email")) } });
      if (r.ok) { form.reset(); setMsg({ ok: true, text: r.emailed ? "Staff member added and emailed a link to set their password." : "Staff member added, but the invite email failed. Ask them to use Forgot password." }); refresh(); }
      else setMsg({ ok: false, text: r.error });
    } catch (x) { setMsg({ ok: false, text: errText(x) }); } finally { setBusy(false); }
  }
  async function onRemove(s: Staff) {
    if (!window.confirm(`Remove admin access for ${s.name}? They'll be signed out immediately.`)) return;
    setBusy(true); setMsg(null);
    try { const r = await remove({ data: { userId: s.id } }); setMsg(r.ok ? { ok: true, text: `${s.name} no longer has admin access.` } : { ok: false, text: r.error }); if (sel?.id === s.id) setSel(null); refresh(); }
    catch (x) { setMsg({ ok: false, text: errText(x) }); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div><h2 className="text-2xl">Staff</h2><p className="text-sm text-muted-foreground">People with access to this admin console, and everything they've done.</p></div>
      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="space-y-2"><Label htmlFor="staff-name">Full name</Label><Input id="staff-name" name="name" required minLength={2} maxLength={100} className="h-10 w-56" /></div>
        <div className="space-y-2"><Label htmlFor="staff-email">Work email</Label><Input id="staff-email" name="email" type="email" required maxLength={200} className="h-10 w-64" /></div>
        <Button type="submit" disabled={busy}>Add staff member</Button>
      </form>
      {msg && <p className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
      {!rows ? <div className="h-32 animate-pulse rounded-lg bg-muted" /> : (
        <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3">Name</th><th className="p-3">Actions logged</th><th className="p-3">Last action</th><th className="p-3" /></tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.id} className="border-b last:border-0">
              <td className="p-3"><p className="font-medium">{s.name} {s.isMe && <Badge variant="secondary">You</Badge>} {s.isOwner && <Badge variant="outline">Main admin</Badge>}</p><p className="text-xs text-muted-foreground">{s.email}</p></td>
              <td className="p-3">{s.actions}</td>
              <td className="p-3">{when(s.lastAction)}</td>
              <td className="p-3 text-right"><div className="flex justify-end gap-2">
                <Button size="sm" variant={sel?.id === s.id ? "default" : "outline"} onClick={() => setSel(sel?.id === s.id ? null : s)}>Activity</Button>
                {!s.isMe && !s.isOwner && <Button size="sm" variant="destructive" disabled={busy} onClick={() => onRemove(s)}>Remove</Button>}
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {sel && (
        <section className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 font-sans text-base font-semibold">What {sel.name} did</h3>
          {!acts ? <div className="h-24 animate-pulse rounded bg-muted" /> : acts.length === 0 ? <p className="text-sm text-muted-foreground">No actions recorded yet.</p> : (
            <ol className="divide-y text-sm">{acts.map((a) => (
              <li key={a.id} className="grid gap-1 py-2 sm:grid-cols-[12rem_minmax(0,1fr)]"><span className="text-xs text-muted-foreground">{when(a.at)}</span>
                <span className="min-w-0 break-words"><span className="font-medium">{a.action}</span>{a.subject && ` · ${a.subject}`} {a.detail !== "{}" && <span className="text-xs text-muted-foreground">{a.detail}</span>}</span></li>
            ))}</ol>
          )}
        </section>
      )}
    </div>
  );
}

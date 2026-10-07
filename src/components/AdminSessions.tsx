import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { adminForcePasswordReset, adminListSessions, adminRevokeSession } from "@/lib/staff.functions";
import { adminCustomerControl } from "@/lib/admin.functions";

type S = Awaited<ReturnType<typeof adminListSessions>>[number];
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Before tracking began");
function device(ua: string) {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}

export function AdminSessions({ userId, onChange }: { userId: number; onChange: () => void }) {
  const list = useServerFn(adminListSessions);
  const revoke = useServerFn(adminRevokeSession);
  const control = useServerFn(adminCustomerControl);
  const force = useServerFn(adminForcePasswordReset);
  const [rows, setRows] = useState<S[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => list({ data: { userId } }).then(setRows).catch((e) => { setRows([]); setMsg({ ok: false, text: errText(e) }); }), [list, userId]);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error ?? "Failed." }); await refresh(); onChange(); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-sans text-base font-semibold">Active sign-ins</h3>
          <Button size="sm" variant="destructive" disabled={busy || !rows?.length}
            onClick={() => window.confirm("Sign this customer out of every device?") && run(() => control({ data: { userId, action: "sign_out" } }), "All devices signed out.")}>Sign out everywhere</Button>
        </div>
        {!rows ? <div className="h-24 animate-pulse rounded bg-muted" /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No one is signed in to this profile.</p> : (
          <ul className="divide-y text-sm">
            {rows.map((s) => (
              <li key={s.handle} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{device(s.userAgent)}</p>
                  <p className="text-xs text-muted-foreground">IP {s.ip || "unknown"} · signed in {when(s.createdAt)} · expires {when(s.expiresAt)}</p>
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => revoke({ data: { userId, handle: s.handle } }), "Session ended.")}>End session</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="font-sans text-base font-semibold">Force password reset</h3>
        <p className="text-sm text-muted-foreground">Use if the account may be compromised. The current password stops working immediately, every device is signed out, and the customer is emailed a link to choose a new one.</p>
        <div className="space-y-2"><Label htmlFor="force-reason">Internal reason</Label><Textarea id="force-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Customer reported unrecognised sign-in" /></div>
        <Button variant="destructive" disabled={busy || reason.trim().length < 5}
          onClick={() => window.confirm("Reset this customer's password and sign them out everywhere?") && run(async () => {
            const r = await force({ data: { userId, reason } });
            if (r.ok) { setReason(""); if (!r.emailed) return { ok: false, error: "Password reset and devices signed out, but the email could not be sent. Ask the customer to use Forgot password." }; }
            return r;
          }, "Password reset. The customer has been emailed a link.")}>Force password reset</Button>
      </section>
      {msg && <p className={msg.ok ? "text-sm text-primary lg:col-span-2" : "text-sm text-destructive lg:col-span-2"}>{msg.text}</p>}
    </div>
  );
}

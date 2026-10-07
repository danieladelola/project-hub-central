import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  adminListUserAccounts, adminPlaceHold, adminPostAdjustment, adminReleaseHold, adminSetAccountStatus, adminSettlePending,
} from "@/lib/banking.functions";
import { formatMinor, statusTone } from "@/lib/money";
import { adminSetDailyLimit, getDailyLimits } from "@/lib/safety.functions";
import { errText } from "@/components/AccountPage";

export function AdminAccounts({ userId }: { userId: number }) {
  const list = useServerFn(adminListUserAccounts);
  const setStatus = useServerFn(adminSetAccountStatus);
  const post = useServerFn(adminPostAdjustment);
  const settle = useServerFn(adminSettlePending);
  const hold = useServerFn(adminPlaceHold);
  const release = useServerFn(adminReleaseHold);
  const setLimit = useServerFn(adminSetDailyLimit);
  const getLimits = useServerFn(getDailyLimits);
  const [limits, setLimits] = useState<Awaited<ReturnType<typeof getDailyLimits>>>([]);
  const [d, setD] = useState<Awaited<ReturnType<typeof adminListUserAccounts>> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    setLoadErr(null);
    getLimits({ data: { userId } }).then(setLimits).catch(() => {});
    return list({ data: { userId } }).then(setD).catch((e) => setLoadErr(errText(e)));
  }, [list, getLimits, userId]);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setMsg(null); setBusy(true);
    try { const r = await fn(); setMsg(r.ok ? { ok: true, text: "Done." } : { ok: false, text: r.error ?? "Failed." }); await refresh(); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); }
    finally { setBusy(false); }
  };

  if (loadErr) return <div className="space-y-2"><p className="text-sm text-destructive">Couldn't load accounts: {loadErr}</p><Button size="sm" variant="outline" onClick={() => refresh()}>Try again</Button></div>;
  if (!d) return <div className="h-32 animate-pulse rounded-lg bg-muted" />;
  if (d.accounts.length === 0) return <p className="text-sm text-muted-foreground">This customer has no bank accounts yet.</p>;

  return (
    <div className="space-y-3">
      {msg && <p role="status" className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
      {d.accounts.map((a) => (
        <div key={a.id} className="space-y-3 rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{a.nickname}</span><span className="text-muted-foreground">{a.type} · {a.currency} · {a.masked}</span>
            <Badge variant={statusTone[a.status]} className="capitalize">{a.status}</Badge>
            <span className="w-full sm:ml-auto sm:w-auto">Current {formatMinor(a.current, a.currency)} · Available {formatMinor(a.available, a.currency)}</span>
          </div>
          {a.status !== "closed" && (
            <>
              <div className="flex flex-wrap gap-2">
                {(["active", "restricted", "frozen"] as const).filter((s) => s !== a.status).map((s) => (
                  <Button key={s} size="sm" variant="outline" disabled={busy} className="capitalize" onClick={() => {
                    if (!window.confirm(`Set this account to ${s}?`)) return;
                    const reason = window.prompt(`Reason for setting ${s} (optional, shown to customer):`) || undefined;
                    run(() => setStatus({ data: { accountId: a.id, status: s, reason } }));
                  }}>Set {s}</Button>
                ))}
              </div>
              <form className="grid gap-2 sm:flex sm:flex-wrap" onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const form = e.currentTarget;
                const dir = String(f.get("direction"));
                if (!window.confirm(`${dir === "credit" ? "Add" : "Take out"} ${f.get("amount")} ${a.currency} ${dir === "credit" ? "to" : "from"} ${a.nickname}?`)) return;
                run(async () => {
                  const r = await post({ data: { accountId: a.id, amount: String(f.get("amount")), direction: dir as "credit", description: String(f.get("description")), status: f.get("status") as "posted", idempotencyKey: String(f.get("key")) } });
                  if (r.ok) form.reset();
                  return r;
                });
              }}>
                <input type="hidden" name="key" value={crypto.randomUUID()} />
                <select name="direction" aria-label="Direction" className="h-9 rounded-md border bg-background px-2"><option value="credit">Credit (add money)</option><option value="debit">Debit (take out)</option></select>
                <Input name="amount" placeholder="Amount" inputMode="decimal" required className="h-9 sm:w-28" />
                <Input name="description" placeholder="Description" required minLength={3} className="h-9 sm:w-48" />
                <select name="status" aria-label="Posting status" className="h-9 rounded-md border bg-background px-2"><option value="posted">Posted</option><option value="pending">Pending</option></select>
                <Button size="sm" type="submit" disabled={busy}>Post</Button>
              </form>
              <form className="grid gap-2 sm:flex sm:flex-wrap" onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const form = e.currentTarget;
                run(async () => { const r = await hold({ data: { accountId: a.id, amount: String(f.get("amount")), reason: String(f.get("reason")) } }); if (r.ok) form.reset(); return r; });
              }}>
                <Input name="amount" placeholder="Hold amount" inputMode="decimal" required className="h-9 sm:w-28" />
                <Input name="reason" placeholder="Hold reason" required minLength={3} className="h-9 sm:w-48" />
                <Button size="sm" variant="outline" type="submit" disabled={busy}>Place hold</Button>
              </form>
              {(() => {
                const l = limits.find((x: { accountId: number; limit: string; custom: boolean; usedToday: string }) => x.accountId === a.id);
                return (
                  <form className="grid gap-2 sm:flex sm:flex-wrap sm:items-center" onSubmit={(e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault();
                    const amount = String(new FormData(e.currentTarget).get("limit") ?? "").trim();
                    run(() => setLimit({ data: { accountId: a.id, amount } }));
                  }}>
                    <span className="text-muted-foreground">Daily send limit{l ? `: ${formatMinor(l.limit, a.currency)}${l.custom ? "" : " (standard)"} · used today ${formatMinor(l.usedToday, a.currency)}` : ""}</span>
                    <Input name="limit" placeholder="New limit (blank = standard)" inputMode="decimal" className="h-9 sm:w-56" />
                    <Button size="sm" variant="outline" type="submit" disabled={busy}>Save limit</Button>
                  </form>
                );
              })()}
            </>
          )}
          {d.holds.filter((h) => h.accountId === a.id).map((h) => (
            <div key={h.id} className="flex flex-wrap items-center gap-2">Hold {formatMinor(h.amount, h.currency)} · {h.reason}<Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => release({ data: { holdId: h.id } }))}>Release</Button></div>
          ))}
          {d.pending.filter((p) => p.accountId === a.id).map((p) => (
            <div key={p.txnId} className="flex flex-wrap items-center gap-2">Pending {formatMinor(p.amount, p.currency, { signed: true })} · {p.description}
              <Button size="sm" variant="ghost" onClick={() => run(() => settle({ data: { txnId: p.txnId, action: "post" } }))}>Post</Button>
              <Button size="sm" variant="ghost" onClick={() => run(() => settle({ data: { txnId: p.txnId, action: "cancel" } }))}>Cancel</Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

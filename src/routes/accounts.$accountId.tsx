import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccountPage, Panel, Msg, errText } from "@/components/AccountPage";
import { TxnTable } from "@/components/DashboardHome";
import { closeAccount, getAccount, updateAccountSettings } from "@/lib/banking.functions";
import { cancelClosureRequest, myClosureRequest, requestAccountClosure } from "@/lib/staff.functions";
import { formatMinor, fmtDate, maskNumber, minorToDecimal, statusTone } from "@/lib/money";

export const Route = createFileRoute("/accounts/$accountId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Account details — Universal Crest" }, { name: "robots", content: "noindex" }] }),
  component: AccountDetail,
});

function AccountDetail() {
  const { accountId } = Route.useParams();
  const load = useServerFn(getAccount);
  const [a, setA] = useState<Awaited<ReturnType<typeof getAccount>> | null>(null);
  const [err, setErr] = useState(false);
  const [show, setShow] = useState(false);
  const upd = useServerFn(updateAccountSettings);
  const close = useServerFn(closeAccount);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const refresh = useCallback(() => load({ data: { id: Number(accountId) } }).then(setA).catch(() => setErr(true)), [load, accountId]);
  useEffect(() => { refresh(); }, [refresh]);
  async function onSettings(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    try {
      const r = await upd({ data: { id: Number(accountId), nickname: String(f.get("nickname")), threshold: String(f.get("threshold") || "0") } });
      setMsg(r.ok ? { ok: true, text: "Settings saved." } : { ok: false, text: r.error }); refresh();
    } catch (x) { setMsg({ ok: false, text: errText(x) }); }
  }
  async function onClose(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    try {
      const r = await close({ data: { id: Number(accountId), pin: String(new FormData(ev.currentTarget).get("pin")) } });
      setMsg(r.ok ? { ok: true, text: "Account closed." } : { ok: false, text: r.error }); refresh();
    } catch (x) { setMsg({ ok: false, text: errText(x) }); }
  }
  if (err) return <AccountPage title="Account not found"><p className="text-muted-foreground">This account doesn't exist or isn't yours.</p></AccountPage>;
  return (
    <AccountPage title={a?.nickname ?? "Account"} wide>
      {!a ? <p className="text-muted-foreground">Loading…</p> : (
        <>
          <Panel title="Details">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-muted-foreground">Holder</dt><dd>{a.holder}</dd></div>
              <div><dt className="text-muted-foreground">Type</dt><dd className="capitalize">{a.type}</dd></div>
              <div><dt className="text-muted-foreground">Currency</dt><dd>{a.currency}</dd></div>
              <div><dt className="text-muted-foreground">Account number</dt><dd className="flex items-center gap-2 font-mono">{show ? a.accountNumber : maskNumber(a.accountNumber)}
                <Button size="sm" variant="ghost" onClick={() => setShow(!show)}>{show ? "Hide" : "Reveal"}</Button>
                <Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(a.accountNumber); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</Button></dd></div>
              <div><dt className="text-muted-foreground">Status</dt><dd><Badge variant={statusTone[a.status]} className="capitalize">{a.status}</Badge></dd></div>
              <div><dt className="text-muted-foreground">Opened</dt><dd>{fmtDate(a.openedAt)}</dd></div>
              <div><dt className="text-muted-foreground">Current balance</dt><dd className="text-lg font-semibold">{formatMinor(a.current, a.currency)}</dd></div>
              <div><dt className="text-muted-foreground">Available</dt><dd className="text-lg font-semibold">{formatMinor(a.available, a.currency)}</dd></div>
              <div><dt className="text-muted-foreground">Held</dt><dd className="text-lg font-semibold">{formatMinor(a.held, a.currency)}</dd></div>
            </dl>
          </Panel>
          <Msg msg={msg} />
          {a.holds.length > 0 && <Panel title="Active holds"><ul className="text-sm">{a.holds.map((h) => <li key={h.id}>{formatMinor(h.amount, a.currency)} · {h.reason} · {fmtDate(h.createdAt)}</li>)}</ul></Panel>}
          <Panel title="Recent transactions"><TxnTable rows={a.transactions} /></Panel>
          {a.status !== "closed" && (
            <>
              <Panel title="Account settings">
                <form onSubmit={onSettings} className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2"><Label htmlFor="nickname">Nickname</Label><Input id="nickname" name="nickname" defaultValue={a.nickname} maxLength={40} className="h-11" /></div>
                  <div className="space-y-2"><Label htmlFor="threshold">Low-balance alert ({a.currency}, 0 = off)</Label><Input id="threshold" name="threshold" defaultValue={minorToDecimal(a.threshold)} inputMode="decimal" className="h-11" /></div>
                  <div className="flex items-end"><Button type="submit" className="h-11">Save</Button></div>
                </form>
              </Panel>
              <Panel title="Close account" description="Only possible when the balance is zero and there are no holds or pending transactions.">
                <form onSubmit={onClose} className="flex flex-wrap items-end gap-3">
                  <div className="space-y-2"><Label htmlFor="pin">Transaction PIN</Label><Input id="pin" name="pin" type="password" inputMode="numeric" maxLength={4} required className="h-11 w-32" /></div>
                  <Button type="submit" variant="destructive" className="h-11">Close account</Button>
                </form>
              </Panel>
              <ClosureRequest accountId={Number(accountId)} />
            </>
          )}
        </>
      )}
    </AccountPage>
  );
}

function ClosureRequest({ accountId }: { accountId: number }) {
  const get = useServerFn(myClosureRequest);
  const send = useServerFn(requestAccountClosure);
  const cancel = useServerFn(cancelClosureRequest);
  const [req, setReq] = useState<Awaited<ReturnType<typeof myClosureRequest>> | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = useCallback(() => get({ data: { accountId } }).then(setReq).catch(() => setReq(null)), [get, accountId]);
  useEffect(() => { refresh(); }, [refresh]);
  const run = async (p: Promise<{ ok: boolean; error?: string }>, done: string) => {
    try { const r = await p; setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error ?? "Failed." }); refresh(); } catch (x) { setMsg({ ok: false, text: errText(x) }); }
  };
  if (req === undefined) return null;
  return (
    <Panel title="Ask us to close this account" description="If there's still money on the account or you can't close it yourself, our team will review your request and help settle the final balance.">
      {req?.status === "pending" ? (
        <div className="flex flex-wrap items-center gap-3 text-sm"><Badge variant="secondary">Request under review</Badge><span className="text-muted-foreground">Sent {fmtDate(req.createdAt)}</span>
          <Button size="sm" variant="outline" onClick={() => run(cancel({ data: { requestId: req.id } }), "Request cancelled.")}>Cancel request</Button></div>
      ) : (
        <div className="space-y-3">
          {req?.status === "rejected" && <p className="text-sm text-muted-foreground">Your last request was declined{req.note ? `: ${req.note}` : "."}</p>}
          <div className="space-y-2"><Label htmlFor="close-reason">Why do you want to close it?</Label><Input id="close-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="h-11" /></div>
          <Button variant="outline" disabled={reason.trim().length < 5} onClick={() => run(send({ data: { accountId, reason } }), "Request sent. We'll notify you once it's reviewed.").then(() => setReason(""))}>Send request</Button>
        </div>
      )}
      <div className="mt-3"><Msg msg={msg} /></div>
    </Panel>
  );
}

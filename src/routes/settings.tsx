import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { AccountPage, Panel, Msg, errText } from "@/components/AccountPage";
import { changePassword, changePin, getProfile, setTwoFactor } from "@/lib/account.functions";

export const Route = createFileRoute("/settings")({
  ssr: false,
  head: () => ({ meta: [{ title: "Security settings — Universal Crest" }, { name: "robots", content: "noindex" }] }),
  component: SettingsPage,
});

type F = Record<"current" | "next" | "confirm" | "pin" | "pinConfirm" | "pinPassword" | "tfPassword", string>;
type M = { ok: boolean; text: string } | null;

function useForm(fn: (f: F) => Promise<string | null>, okText: string) {
  const [msg, setMsg] = useState<M>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form)) as F;
    setBusy(true); setMsg(null);
    try {
      const err = await fn(f);
      setMsg(err ? { ok: false, text: err } : { ok: true, text: okText });
      if (!err) form.reset();
    } catch (x) { setMsg({ ok: false, text: errText(x) }); }
    finally { setBusy(false); }
  }
  return { msg, busy, onSubmit };
}

function Pw({ name, label, auto = "current-password" }: { name: string; label: string; auto?: string }) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><PasswordInput id={name} name={name} autoComplete={auto} required /></div>;
}

function SettingsPage() {
  const cp = useServerFn(changePassword);
  const cpin = useServerFn(changePin);
  const s2fa = useServerFn(setTwoFactor);
  const load = useServerFn(getProfile);
  const [twoFactor, setTwo] = useState<boolean | null>(null);
  useEffect(() => { load().then((p) => setTwo(p.twoFactor)).catch(() => {}); }, [load]);

  const pw = useForm(async (f) => {
    if (f.next !== f.confirm) return "New passwords don't match.";
    const r = await cp({ data: { current: f.current, next: f.next } });
    return r.ok ? null : r.error;
  }, "Password changed.");
  const pin = useForm(async (f) => {
    if (f.pin !== f.pinConfirm) return "PINs don't match.";
    const r = await cpin({ data: { password: f.pinPassword, pin: f.pin } });
    return r.ok ? null : r.error;
  }, "Transaction PIN changed.");
  const tf = useForm(async (f) => {
    const r = await s2fa({ data: { enabled: !twoFactor, password: f.tfPassword } });
    if (!r.ok) return r.error;
    setTwo(!twoFactor);
    return null;
  }, twoFactor ? "2-step sign-in turned off." : "2-step sign-in turned on.");

  return (
    <AccountPage title="Security settings" subtitle="Manage your password, transaction PIN and sign-in protection.">
      <Panel title="2-step sign-in" description={twoFactor ? "On — we email you a 6-digit code every time you sign in." : "Off — turn on to require an emailed code at every sign-in."}>
        {twoFactor === null ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <form onSubmit={tf.onSubmit} className="space-y-4">
            <Pw name="tfPassword" label="Confirm with your password" />
            <Msg msg={tf.msg} />
            <Button type="submit" className="h-11" variant={twoFactor ? "outline" : "default"} disabled={tf.busy}>{twoFactor ? "Turn off" : "Turn on"}</Button>
          </form>
        )}
      </Panel>
      <Panel title="Change password">
        <form onSubmit={pw.onSubmit} className="space-y-4">
          <Pw name="current" label="Current password" />
          <Pw name="next" label="New password" auto="new-password" />
          <Pw name="confirm" label="Confirm new password" auto="new-password" />
          <p className="text-xs text-muted-foreground">At least 8 characters with an uppercase letter, a number and a special character.</p>
          <Msg msg={pw.msg} />
          <Button type="submit" className="h-11" disabled={pw.busy}>Change password</Button>
        </form>
      </Panel>
      <Panel title="Change transaction PIN" description="Your 4-digit PIN is used to approve transfers.">
        <form onSubmit={pin.onSubmit} className="space-y-4">
          <Pw name="pinPassword" label="Your password" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="pin">New PIN</Label><Input id="pin" name="pin" type="password" inputMode="numeric" maxLength={4} pattern="\d{4}" required className="h-11" /></div>
            <div className="space-y-2"><Label htmlFor="pinConfirm">Confirm PIN</Label><Input id="pinConfirm" name="pinConfirm" type="password" inputMode="numeric" maxLength={4} pattern="\d{4}" required className="h-11" /></div>
          </div>
          <Msg msg={pin.msg} />
          <Button type="submit" className="h-11" disabled={pin.busy}>Change PIN</Button>
        </form>
      </Panel>
    </AccountPage>
  );
}

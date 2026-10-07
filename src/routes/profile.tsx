import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AccountPage, Panel, Msg, errText } from "@/components/AccountPage";
import { getProfile, updateProfile } from "@/lib/account.functions";
import { AvatarUpload } from "@/components/AvatarUpload";

export const Route = createFileRoute("/profile")({
  ssr: false,
  head: () => ({ meta: [{ title: "Profile — Universal Crest" }, { name: "robots", content: "noindex" }] }),
  component: ProfilePage,
});

type Profile = Awaited<ReturnType<typeof getProfile>>;

export const kycLabel: Record<string, string> = { unverified: "Not verified", pending: "Under review", verified: "Verified", rejected: "Rejected" };

function ProfilePage() {
  const load = useServerFn(getProfile);
  const save = useServerFn(updateProfile);
  const [p, setP] = useState<Profile | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { load().then(setP).catch(() => {}); }, [load]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<"fullName" | "phone" | "country" | "state" | "address" | "dateOfBirth", string>;
    setBusy(true); setMsg(null);
    try {
      await save({ data: { fullName: f.fullName, phone: f.phone, country: f.country, state: f.state, address: f.address, dateOfBirth: f.dateOfBirth } });
      setMsg({ ok: true, text: "Profile saved." });
      setP(await load());
    } catch (err) { setMsg({ ok: false, text: errText(err) }); }
    finally { setBusy(false); }
  }

  const field = (name: keyof Profile, label: string, type = "text") => (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={String(p?.[name] ?? "")} className="h-11" />
    </div>
  );

  return (
    <AccountPage title="Profile" subtitle="Your personal details and account status.">
      {!p ? <p className="text-muted-foreground">Loading…</p> : (
        <>
          <Panel title="Profile picture">
            <AvatarUpload name={p.fullName ?? ""} />
          </Panel>

          <Panel title="Account status">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Account</dt><dd className="mt-1"><Badge variant={p.status === "active" ? "default" : "destructive"}>{p.status === "active" ? "Active" : "Suspended"}</Badge></dd></div>
              <div><dt className="text-muted-foreground">Identity (KYC)</dt><dd className="mt-1 flex items-center gap-2"><Badge variant={p.kycStatus === "verified" ? "default" : "secondary"}>{kycLabel[p.kycStatus] ?? p.kycStatus}</Badge>{p.kycStatus !== "verified" && <Link to="/kyc" className="text-primary underline">Verify now</Link>}</dd></div>
              <div><dt className="text-muted-foreground">Email</dt><dd className="mt-1">{p.email} {p.emailVerified ? "(confirmed)" : "(not confirmed)"}</dd></div>
              <div><dt className="text-muted-foreground">Account type</dt><dd className="mt-1 capitalize">{p.accountType || "—"}</dd></div>
              <div><dt className="text-muted-foreground">2-step sign-in</dt><dd className="mt-1">{p.twoFactor ? "On" : "Off"} · <Link to="/settings" className="text-primary underline">Manage</Link></dd></div>
              <div><dt className="text-muted-foreground">Member since</dt><dd className="mt-1">{new Date(p.createdAt).toLocaleDateString()}</dd></div>
            </dl>
          </Panel>
          <Panel title="Personal details">
            <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
              {field("fullName", "Full name")}
              {field("phone", "Phone number", "tel")}
              {field("dateOfBirth", "Date of birth", "date")}
              {field("country", "Country")}
              {field("state", "State / region")}
              {field("address", "Home address")}
              <div className="space-y-3 sm:col-span-2">
                <Msg msg={msg} />
                <Button type="submit" className="h-11" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
              </div>
            </form>
          </Panel>
        </>
      )}
    </AccountPage>
  );
}

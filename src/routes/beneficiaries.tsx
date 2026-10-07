import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PasswordInput } from "@/components/PasswordInput";
import { AccountPage, Panel, Msg, errText } from "@/components/AccountPage";
import { deleteBeneficiary, listBeneficiaries, saveBeneficiary } from "@/lib/banking.functions";
import { CURRENCY_LIST, fmtDate } from "@/lib/money";

export const Route = createFileRoute("/beneficiaries")({
  ssr: false,
  head: () => ({ meta: [{ title: "Beneficiaries — Universal Crest" }, { name: "description", content: "Save and manage the people and bank accounts you pay." }, { property: "og:title", content: "Beneficiaries — Universal Crest" }, { property: "og:description", content: "Save and manage the people and bank accounts you pay." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: BeneficiariesPage,
});

type Ben = Awaited<ReturnType<typeof listBeneficiaries>>[number];
const typeLabel: Record<string, string> = { internal: "Universal Crest account", local: "Local bank", international: "International bank" };

function BeneficiariesPage() {
  const list = useServerFn(listBeneficiaries);
  const save = useServerFn(saveBeneficiary);
  const del = useServerFn(deleteBeneficiary);
  const [rows, setRows] = useState<Ben[] | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Ben | "new" | null>(null);
  const [destType, setDestType] = useState("internal");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting, setDeleting] = useState<Ben | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => list({ data: { q: q || undefined } }).then(setRows), [list, q]);
  useEffect(() => { const t = setTimeout(refresh, 250); return () => clearTimeout(t); }, [refresh]);

  function startEdit(b: Ben | "new") { setEditing(b); setDestType(b === "new" ? "internal" : b.destType); setMsg(null); }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<"name" | "nickname" | "accountIdentifier" | "bankName" | "country" | "currency" | "password", string>;
    setBusy(true); setMsg(null);
    try {
      const r = await save({ data: {
        id: editing && editing !== "new" ? editing.id : undefined, name: f.name, nickname: f.nickname, destType: destType as "internal",
        accountIdentifier: f.accountIdentifier, bankName: f.bankName ?? "", country: f.country ?? "",
        currency: destType === "internal" ? undefined : (f.currency as "USD"), password: f.password,
      } });
      if (!r.ok) setMsg({ ok: false, text: r.error });
      else { setEditing(null); setMsg({ ok: true, text: "Beneficiary saved. Saved bank details are not verified with the receiving bank." }); refresh(); }
    } catch (x) { setMsg({ ok: false, text: errText(x) }); } finally { setBusy(false); }
  }

  async function onDelete(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!deleting) return;
    const pw = String(new FormData(e.currentTarget).get("password") ?? "");
    setBusy(true);
    try {
      const r = await del({ data: { id: deleting.id, password: pw } });
      setMsg(r.ok ? { ok: true, text: "Beneficiary removed." } : { ok: false, text: r.error });
      if (r.ok) { setDeleting(null); refresh(); }
    } finally { setBusy(false); }
  }

  const cur = editing && editing !== "new" ? editing : null;

  return (
    <AccountPage title="Beneficiaries" subtitle="People and accounts you pay. Saving details does not send money." actions={!editing && <Button className="min-h-11" onClick={() => startEdit("new")}>Add beneficiary</Button>}>
      <Msg msg={msg} />
      {editing && (
        <Panel title={cur ? "Edit beneficiary" : "Add beneficiary"}>
          <form onSubmit={onSave} className="grid gap-4 sm:grid-cols-2" key={cur?.id ?? "new"}>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="destType">Destination</Label>
              <select id="destType" value={destType} onChange={(e) => setDestType(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
                <option value="internal">Universal Crest account</option><option value="local">Local bank</option><option value="international">International bank</option>
              </select>
            </div>
            <div className="space-y-2"><Label htmlFor="name">Beneficiary name</Label><Input id="name" name="name" required defaultValue={cur?.name} className="h-11" /></div>
            <div className="space-y-2"><Label htmlFor="nickname">Nickname (optional)</Label><Input id="nickname" name="nickname" defaultValue={cur?.nickname} className="h-11" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="accountIdentifier">{destType === "internal" ? "Universal Crest account number" : "Account number"}</Label><Input id="accountIdentifier" name="accountIdentifier" required defaultValue={cur?.accountIdentifier} className="h-11 font-mono" /></div>
            {destType !== "internal" && (
              <>
                <div className="space-y-2"><Label htmlFor="bankName">Bank name</Label><Input id="bankName" name="bankName" required defaultValue={cur?.bankName} className="h-11" /></div>
                <div className="space-y-2"><Label htmlFor="country">Bank country</Label><Input id="country" name="country" required defaultValue={cur?.country} className="h-11" /></div>
                <div className="space-y-2"><Label htmlFor="currency">Currency</Label>
                  <select id="currency" name="currency" defaultValue={cur?.currency || "USD"} className="h-11 w-full rounded-md border bg-background px-3 text-sm">{CURRENCY_LIST.map((c) => <option key={c}>{c}</option>)}</select>
                </div>
              </>
            )}
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="password">Confirm with your password</Label><PasswordInput id="password" name="password" autoComplete="current-password" required /></div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" className="h-11" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        </Panel>
      )}

      {deleting && (
        <Panel title={`Remove ${deleting.name}?`}>
          <form onSubmit={onDelete} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="delpw">Confirm with your password</Label><PasswordInput id="delpw" name="password" autoComplete="current-password" required /></div>
            <div className="flex gap-2"><Button type="submit" variant="destructive" className="h-11" disabled={busy}>Remove</Button><Button type="button" variant="outline" className="h-11" onClick={() => setDeleting(null)}>Cancel</Button></div>
          </form>
        </Panel>
      )}

      <Input aria-label="Search beneficiaries" placeholder="Search by name, nickname, bank or account" value={q} onChange={(e) => setQ(e.target.value)} className="h-11" />
      {!rows ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? (
        <p className="text-muted-foreground">{q ? "No beneficiaries match your search." : "You haven't saved any beneficiaries yet."}</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((b) => (
            <li key={b.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2 p-4 text-sm sm:gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{b.name}{b.nickname && <span className="text-muted-foreground"> · {b.nickname}</span>}</p>
                <p className="break-words text-muted-foreground"><span className="break-all font-mono">{b.accountIdentifier}</span> · {b.bankName}{b.country && `, ${b.country}`}{b.currency && ` · ${b.currency}`}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">{typeLabel[b.destType]}</Badge> Added {fmtDate(b.createdAt)}</p>
              </div>
              <Button size="icon" variant="ghost" aria-label={`Edit ${b.name}`} onClick={() => startEdit(b)}><Pencil /></Button>
              <Button size="icon" variant="ghost" aria-label={`Remove ${b.name}`} onClick={() => setDeleting(b)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
    </AccountPage>
  );
}

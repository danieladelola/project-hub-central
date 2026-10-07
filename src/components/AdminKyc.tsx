import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { adminKycDecide, adminKycDetail, adminKycQueue, adminPurgeKycDocuments } from "@/lib/kyc.functions";
import { KYC_STATUS_LABEL, SECTIONS, SECTION_LABEL, SLOT_LABEL, ID_DOC_TYPES, type KycStatus, type Section, type Slot } from "@/lib/kyc-config";

type Row = Awaited<ReturnType<typeof adminKycQueue>>[number];
type Detail = Awaited<ReturnType<typeof adminKycDetail>>;

function variant(s: KycStatus) {
  return s === "verified" ? "default" : s === "rejected" || s === "action_required" ? "destructive" : s === "submitted" || s === "under_review" ? "secondary" : "outline";
}

export function AdminKyc() {
  const queue = useServerFn(adminKycQueue);
  const purge = useServerFn(adminPurgeKycDocuments);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  const refresh = useCallback(() => queue().then(setRows).catch((e) => setErr(e instanceof Error ? e.message : "Failed to load")), [queue]);
  useEffect(() => { refresh(); }, [refresh]);

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!rows) return <p className="text-muted-foreground">Loading applications…</p>;
  const shown = filter === "open" ? rows.filter((r) => r.status === "submitted" || r.status === "under_review") : rows;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>Awaiting review ({rows.filter((r) => r.status === "submitted" || r.status === "under_review").length})</Button>
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All applications</Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={async () => { const r = await purge(); setPurgeMsg(`Retention policy (${r.days} days): removed ${r.files} files from ${r.applications} decided applications.`); }}>Apply retention policy</Button>
      </div>
      {purgeMsg && <p className="text-xs text-muted-foreground">{purgeMsg}</p>}
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">No applications here.</p> : shown.map((r) => (
        <div key={r.id} className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.name}</p>
              <p className="truncate text-xs text-muted-foreground">{r.email} · <span className="font-mono">{r.reference}</span>{r.submittedAt && ` · submitted ${new Date(r.submittedAt).toLocaleString()}`}</p>
            </div>
            <Badge variant={variant(r.status)}>{KYC_STATUS_LABEL[r.status as KycStatus]}</Badge>
            <Button size="sm" variant="outline" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Close" : "Open"}</Button>
          </div>
          {open === r.id && <Review id={r.id} onDone={() => { refresh(); }} />}
        </div>
      ))}
    </div>
  );
}

function Review({ id, onDone }: { id: number; onDone: () => void }) {
  const detail = useServerFn(adminKycDetail);
  const decide = useServerFn(adminKycDecide);
  const [d, setD] = useState<Detail | null>(null);
  const [feedback, setFeedback] = useState("");
  const [note, setNote] = useState("");
  const [corr, setCorr] = useState<Partial<Record<Section, string>>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => detail({ data: { id } }).then((x) => { setD(x); setNote(x.internalNote); }), [detail, id]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>;
  const p = d.data.personal ?? {}, a = d.data.address ?? {}, i = d.data.identity ?? {};
  const actionable = d.status === "submitted" || d.status === "under_review";

  async function act(decision: "under_review" | "verified" | "rejected" | "action_required") {
    if (decision === "verified" && !window.confirm("Approve this customer's identity verification?")) return;
    setBusy(true); setMsg(null);
    try {
      const corrections = Object.entries(corr).filter(([, m]) => m && m.trim()).map(([section, message]) => ({ section: section as Section, message: message!.trim() }));
      const r = await decide({ data: { id, decision, feedback, internalNote: note, corrections } });
      if (!r.ok) setMsg({ ok: false, text: r.error });
      else { setMsg({ ok: true, text: "Saved. The customer has been notified." }); await load(); onDone(); }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" }); }
    finally { setBusy(false); }
  }

  const row = (k: string, v?: string) => <div><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-sm">{v || "—"}</dd></div>;

  return (
    <div className="mt-4 space-y-5 border-t pt-4">
      <dl className="grid gap-3 sm:grid-cols-3">
        {row("Legal name", [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" "))}{row("Date of birth", p.dob)}{row("Nationality / residence", `${p.nationality ?? ""} / ${p.residence ?? ""}`)}
        {row("Email", `${d.email} (${d.emailVerified ? "verified" : "not verified"})`)}{row("Phone (not verified)", p.phone)}{row("Occupation", `${p.occupation ?? ""} · ${p.employmentStatus ?? ""}`)}
        {row("Source of funds", p.sourceOfFunds)}{row("Account use", p.accountUse)}{row("Monthly range", p.monthlyRange)}
        {row("Address", [a.line1, a.line2, a.city, a.region, a.postalCode, a.country].filter(Boolean).join(", "))}
        {row("Document", `${ID_DOC_TYPES.find((x) => x.value === i.docType)?.label ?? ""} · ${i.issuingCountry ?? ""}`)}{row("Document number", i.docNumber)}
        {row("Issued / expires", `${i.issueDate || "—"} / ${i.expiryDate || "—"}`)}
      </dl>
      <div>
        <h4 className="mb-2 font-sans text-sm font-semibold">Documents</h4>
        {d.docsPurged ? <p className="text-sm text-muted-foreground">Files were deleted under the retention policy.</p> : d.docs.length === 0 ? <p className="text-sm text-muted-foreground">No documents.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {d.docs.map((x) => (
              <a key={x.id} href={`/api/kyc/file/${x.id}`} target="_blank" rel="noreferrer" className="block rounded border p-2 text-xs hover:bg-muted">
                {x.mime.startsWith("image/") ? <img src={`/api/kyc/file/${x.id}`} alt={SLOT_LABEL[x.slot as Slot] ?? x.slot} className="mb-2 max-h-56 w-full object-contain" /> : <FileText className="mb-2 size-8" />}
                {SLOT_LABEL[x.slot as Slot] ?? x.slot} — {x.fileName}
              </a>
            ))}
          </div>
        )}
      </div>
      {actionable && (
        <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
          <div className="space-y-2">
            <Label htmlFor={`fb-${id}`}>Message to customer</Label>
            <Textarea id={`fb-${id}`} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Shown to the customer (required when rejecting)" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Correction requests</p>
            {SECTIONS.map((s) => (
              <div key={s} className="flex items-start gap-3">
                <Checkbox id={`c-${id}-${s}`} checked={corr[s] !== undefined} onCheckedChange={(v) => setCorr((c) => { const n = { ...c }; if (v) n[s] = ""; else delete n[s]; return n; })} />
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`c-${id}-${s}`} className="font-normal">{SECTION_LABEL[s]}</Label>
                  {corr[s] !== undefined && <Textarea value={corr[s]} onChange={(e) => setCorr((c) => ({ ...c, [s]: e.target.value }))} placeholder="What needs to change?" aria-label={`Correction for ${SECTION_LABEL[s]}`} />}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`note-${id}`}>Internal note (staff only)</Label>
            <Textarea id={`note-${id}`} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {d.status === "submitted" && <Button size="sm" variant="outline" disabled={busy} onClick={() => act("under_review")}>Start review</Button>}
            <Button size="sm" disabled={busy} onClick={() => act("verified")}>Approve</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act("action_required")}>Request corrections</Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => act("rejected")}>Reject</Button>
          </div>
          {msg && <p className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
        </div>
      )}
      {!actionable && d.internalNote && <p className="text-sm"><span className="text-muted-foreground">Internal note:</span> {d.internalNote}</p>}
      <div>
        <h4 className="mb-2 font-sans text-sm font-semibold">History</h4>
        <ol className="space-y-1 text-xs">
          {d.history.map((h: Detail["history"][number], k: number) => <li key={k}><span className="text-muted-foreground">{new Date(h.at).toLocaleString()}</span> · {KYC_STATUS_LABEL[h.status as KycStatus] ?? h.status}{h.actor && ` by ${h.actor}`}{h.note && ` — ${h.note}`}</li>)}
        </ol>
      </div>
    </div>
  );
}

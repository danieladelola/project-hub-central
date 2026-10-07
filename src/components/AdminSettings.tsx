import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { Globe, Palette, PanelTop, Search, Share2, Mail, Bell, ShieldCheck, Wrench, Server, Plus, Trash2, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AdminSessions } from "@/components/AdminSessions";
import { errText } from "@/components/AccountPage";
import { adminChangeOwnPassword, adminClearSettingsCache, adminGetSettings, adminResetSettings, adminSaveSettings, adminSendTestEmail, adminSystemInfo } from "@/lib/settings.functions";
import { getMe } from "@/lib/auth.functions";
import type { Settings, SettingsCategory } from "@/lib/settings-schema";
import { cn } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof adminGetSettings>>;
type Msg = { ok: boolean; text: string } | null;
const SECTIONS = [
  { id: "general", label: "General", icon: Globe },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "headerfooter", label: "Header & Footer", icon: PanelTop },
  { id: "seo", label: "SEO", icon: Search },
  { id: "social", label: "Social Media", icon: Share2 },
  { id: "email", label: "Email", icon: Mail },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "system", label: "System", icon: Server },
] as const;
type Section = (typeof SECTIONS)[number]["id"];
const sel = "h-10 w-full rounded-md border bg-background px-3 text-sm";

export function AdminSettings() {
  const load = useServerFn(adminGetSettings);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sec, setSec] = useState<Section>("general");
  const refresh = useCallback(() => load().then(setD).catch((e) => setErr(errText(e))), [load]);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => setSec(s.id)} aria-current={sec === s.id ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors", sec === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <s.icon className="size-4" /> {s.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 space-y-5">
        {!d ? (err ? <p className="text-sm text-destructive">{err}</p> : <div className="h-64 animate-pulse rounded-lg bg-muted" />) : (
          <>
            {sec === "general" && <GeneralForm d={d} onSaved={refresh} />}
            {sec === "branding" && <BrandingForm d={d} onSaved={refresh} />}
            {sec === "headerfooter" && <><HeaderForm d={d} onSaved={refresh} /><FooterForm d={d} onSaved={refresh} /></>}
            {sec === "seo" && <SeoForm d={d} onSaved={refresh} />}
            {sec === "social" && <SocialForm d={d} onSaved={refresh} />}
            {sec === "email" && <EmailForm d={d} onSaved={refresh} />}
            {sec === "notifications" && <NotificationsForm d={d} onSaved={refresh} />}
            {sec === "security" && <SecuritySection d={d} onSaved={refresh} />}
            {sec === "maintenance" && <MaintenanceForm d={d} onSaved={refresh} />}
            {sec === "system" && <SystemSection />}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- shared building blocks ---------- */

function Card({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="border-b p-5"><h2 className="font-sans text-lg font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>
      <div className="space-y-4 p-5">{children}</div>
      {footer && <div className="flex flex-wrap items-center gap-3 border-t bg-muted/30 px-5 py-3">{footer}</div>}
    </section>
  );
}
function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <div className={cn("space-y-1.5", wide && "sm:col-span-2")}><Label>{label}</Label>{children}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>;
}
function Grid({ children }: { children: ReactNode }) { return <div className="grid gap-4 sm:grid-cols-2">{children}</div>; }
function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string | undefined; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-md border p-3">
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
function MsgLine({ msg }: { msg: Msg }) { return msg ? <p role="status" className={cn("text-sm", msg.ok ? "text-primary" : "text-destructive")}>{msg.text}</p> : null; }

/** Form state + save/reset for one settings category. */
function useCategory<C extends SettingsCategory>(d: Data, category: C, onSaved: () => void) {
  const save = useServerFn(adminSaveSettings);
  const reset = useServerFn(adminResetSettings);
  const router = useRouter();
  const [v, setV] = useState<Settings[C]>(d.settings[category]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const set = <K extends keyof Settings[C]>(k: K, val: Settings[C][K]) => setV((x) => ({ ...x, [k]: val }));
  const dirty = JSON.stringify(v) !== JSON.stringify(d.settings[category]);
  const done = async () => { onSaved(); await router.invalidate(); };
  const onSave = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await save({ data: { category, values: v as Record<string, unknown> } });
      if (!r.ok) setMsg({ ok: false, text: r.error }); else { setV(r.values as Settings[C]); setMsg({ ok: true, text: "Settings saved." }); await done(); }
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
    setBusy(false);
  };
  const onReset = async () => {
    if (!window.confirm("Reset this section to its default values? Your saved values will be lost.")) return;
    setBusy(true); setMsg(null);
    try { const r = await reset({ data: { category } }); setV(r.values as Settings[C]); setMsg({ ok: true, text: "Restored defaults." }); await done(); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); }
    setBusy(false);
  };
  const updated = d.updated[category];
  const footer = (
    <>
      <Button onClick={onSave} disabled={busy || !dirty}>{busy && <Loader2 className="animate-spin" />}{busy ? "Saving…" : "Save changes"}</Button>
      <Button variant="outline" onClick={() => setV(d.settings[category])} disabled={busy || !dirty}>Discard</Button>
      <Button variant="ghost" onClick={onReset} disabled={busy}>Reset to defaults</Button>
      <MsgLine msg={msg} />
      {updated && <span className="ml-auto text-xs text-muted-foreground">Last saved {new Date(updated.at).toLocaleString()}{updated.by && ` by ${updated.by}`}</span>}
    </>
  );
  return { v, set, footer };
}

function ImageSlot({ slot, label, hint, d, onChange }: { slot: string; label: string; hint?: string; d: Data; onChange: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const cur = d.assets[slot];
  const upload = (file: File) => {
    if (file.size > 1024 * 1024) return setMsg({ ok: false, text: "Image must be 1 MB or smaller." });
    setMsg(null); setProgress(0);
    const fd = new FormData(); fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/brand/${slot}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = async () => {
      setProgress(null);
      let body: { error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) { setMsg({ ok: true, text: "Uploaded." }); onChange(); await router.invalidate(); }
      else setMsg({ ok: false, text: body.error ?? "Upload failed." });
    };
    xhr.onerror = () => { setProgress(null); setMsg({ ok: false, text: "Upload failed. Check your connection." }); };
    xhr.send(fd);
  };
  const remove = async () => {
    if (!window.confirm(`Remove the ${label.toLowerCase()}?`)) return;
    const r = await fetch(`/api/brand/${slot}`, { method: "DELETE", credentials: "include" });
    if (r.ok) { setMsg({ ok: true, text: "Removed." }); onChange(); await router.invalidate(); } else setMsg({ ok: false, text: "Could not remove the image." });
  };
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center">
      <div className="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
        {cur ? <img src={cur.url} alt={`${label} preview`} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">No image</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint ?? "PNG, JPG, WebP or ICO, up to 1 MB."}{cur && ` · ${Math.ceil(cur.size / 1024)} KB`}</p>
        {progress != null && <Progress value={progress} className="mt-2 h-1.5" />}
        <MsgLine msg={msg} />
      </div>
      <div className="flex gap-2">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/x-icon,.ico" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        <Button size="sm" variant="outline" disabled={progress != null} onClick={() => input.current?.click()}><Upload /> {cur ? "Replace" : "Upload"}</Button>
        {cur && <Button size="sm" variant="ghost" onClick={remove} aria-label={`Remove ${label}`}><Trash2 /></Button>}
      </div>
    </div>
  );
}

function LinksEditor({ value, onChange }: { value: Array<{ label: string; url: string }>; onChange: (v: Array<{ label: string; url: string }>) => void }) {
  return (
    <div className="space-y-2">
      {value.map((l, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <Input aria-label="Link label" placeholder="Label" value={l.label} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <Input aria-label="Link URL" placeholder="https://… or /page" value={l.url} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          <Button variant="ghost" size="icon" aria-label="Remove link" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 /></Button>
        </div>
      ))}
      {value.length < 12 && <Button size="sm" variant="outline" onClick={() => onChange([...value, { label: "", url: "" }])}><Plus /> Add link</Button>}
    </div>
  );
}

/* ---------- sections ---------- */

type P = { d: Data; onSaved: () => void };

function GeneralForm({ d, onSaved }: P) {
  const { v, set, footer } = useCategory(d, "general", onSaved);
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];
  return (
    <Card title="General" description="Basic details shown across the website, emails and customer pages." footer={footer}>
      <Grid>
        <Field label="Site name"><Input value={v.siteName} onChange={(e) => set("siteName", e.target.value)} /></Field>
        <Field label="Company name"><Input value={v.company} onChange={(e) => set("company", e.target.value)} /></Field>
        <Field label="Site description" wide><Textarea rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} /></Field>
        <Field label="Website URL" hint="Used for email images and social previews."><Input value={v.siteUrl} placeholder="https://example.com" onChange={(e) => set("siteUrl", e.target.value)} /></Field>
        <Field label="Admin email" hint="Not shown publicly."><Input type="email" value={v.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} /></Field>
        <Field label="Support email"><Input type="email" value={v.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} /></Field>
        <Field label="Contact phone"><Input value={v.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Address" wide><Textarea rows={2} value={v.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label="Timezone"><select className={sel} value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>{["UTC", ...zones.filter((z) => z !== "UTC")].map((z) => <option key={z}>{z}</option>)}</select></Field>
        <Field label="Default currency"><select className={sel} value={v.currency} onChange={(e) => set("currency", e.target.value as typeof v.currency)}>{["USD"].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Date format"><select className={sel} value={v.dateFormat} onChange={(e) => set("dateFormat", e.target.value as typeof v.dateFormat)}>{["MMM d, yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Default language"><select className={sel} value={v.language} onChange={(e) => set("language", e.target.value as typeof v.language)}>{[["en", "English"], ["fr", "French"], ["es", "Spanish"], ["de", "German"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </Grid>
    </Card>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} hint="Leave empty to use the built-in colour.">
      <div className="flex gap-2">
        <input type="color" aria-label={`${label} picker`} className="h-10 w-12 cursor-pointer rounded-md border bg-background" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} />
        <Input value={value} placeholder="#6b1a2b" onChange={(e) => onChange(e.target.value)} />
        {value && <Button variant="ghost" onClick={() => onChange("")}>Clear</Button>}
      </div>
    </Field>
  );
}

function BrandingForm({ d, onSaved }: P) {
  const { v, set, footer } = useCategory(d, "branding", onSaved);
  return (
    <>
      <Card title="Colours" description="Applied instantly to the website and dashboards after saving." footer={footer}>
        <Grid>
          <ColorField label="Primary colour" value={v.primaryColor} onChange={(x) => set("primaryColor", x)} />
          <ColorField label="Secondary colour" value={v.secondaryColor} onChange={(x) => set("secondaryColor", x)} />
          <ColorField label="Background colour" value={v.backgroundColor} onChange={(x) => set("backgroundColor", x)} />
          <Field label="Logo letter" hint="Shown in the round badge when no logo image is uploaded."><Input maxLength={4} value={v.logoText} onChange={(e) => set("logoText", e.target.value)} /></Field>
        </Grid>
        <div className="flex flex-wrap gap-3 text-xs">
          {[["Primary", v.primaryColor], ["Secondary", v.secondaryColor], ["Background", v.backgroundColor]].map(([l, c]) => (
            <span key={l} className="flex items-center gap-2"><span className="size-5 rounded border" style={{ background: c || "var(--muted)" }} />{l}</span>
          ))}
        </div>
      </Card>
      <Card title="Logos & icons" description="Upload, replace, preview or remove brand images.">
        <ImageSlot slot="logo" label="Website / header logo" d={d} onChange={onSaved} />
        <ImageSlot slot="login_logo" label="Login page logo" d={d} onChange={onSaved} />
        <ImageSlot slot="footer_logo" label="Footer logo" hint="Shown on the dark footer — a light version works best." d={d} onChange={onSaved} />
        <ImageSlot slot="admin_logo" label="Admin logo" d={d} onChange={onSaved} />
        <ImageSlot slot="favicon" label="Favicon" hint="Square PNG or ICO, 32×32 or larger." d={d} onChange={onSaved} />
      </Card>
    </>
  );
}

function HeaderForm({ d, onSaved }: P) {
  const { v, set, footer } = useCategory(d, "header", onSaved);
  return (
    <Card title="Header" description="The top bar of the public website." footer={footer}>
      <Field label="Header title" hint="Defaults to the site name."><Input value={v.title} onChange={(e) => set("title", e.target.value)} /></Field>
      <Toggle label="Show navigation menu" checked={v.showNav} onChange={(x) => set("showNav", x)} />
      <Toggle label="Show Sign in / Open account buttons" checked={v.showAuthButtons} onChange={(x) => set("showAuthButtons", x)} />
      <Field label="Extra header links"><LinksEditor value={v.links} onChange={(x) => set("links", x)} /></Field>
    </Card>
  );
}

function FooterForm({ d, onSaved }: P) {
  const { v, set, footer } = useCategory(d, "footer", onSaved);
  return (
    <Card title="Footer" description="Social links are managed under Social Media; contact details under General." footer={footer}>
      <Field label="Footer text"><Textarea rows={2} value={v.tagline} onChange={(e) => set("tagline", e.target.value)} /></Field>
      <Field label="Copyright text" hint="Leave empty for “© year Company. All rights reserved.”"><Input value={v.copyright} onChange={(e) => set("copyright", e.target.value)} /></Field>
      <Toggle label="Show contact information" hint="Phone, address and support email from General settings." checked={v.showContact} onChange={(x) => set("showContact", x)} />
      <Field label="Footer links"><LinksEditor value={v.links} onChange={(x) => set("links", x)} /></Field>
    </Card>
  );
}

function SeoForm({ d, onSaved }: P) {
  const { v, set, footer } = useCategory(d, "seo", onSaved);
  return (
    <>
      <Card title="Search & sharing" description="Defaults for pages that don't set their own title or description." footer={footer}>
        <Grid>
          <Field label="Meta title"><Input value={v.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} /></Field>
          <Field label="Keywords" hint="Comma separated."><Input value={v.keywords} onChange={(e) => set("keywords", e.target.value)} /></Field>
          <Field label="Meta description" wide><Textarea rows={2} value={v.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} /></Field>
          <Field label="Social sharing title"><Input value={v.ogTitle} onChange={(e) => set("ogTitle", e.target.value)} /></Field>
          <Field label="Social sharing description"><Input value={v.ogDescription} onChange={(e) => set("ogDescription", e.target.value)} /></Field>
          <Field label="Google verification code" hint="Only the content value from Google Search Console."><Input value={v.googleVerification} onChange={(e) => set("googleVerification", e.target.value)} /></Field>
          <Field label="Google Analytics ID"><Input value={v.analyticsId} placeholder="G-XXXXXXX" onChange={(e) => set("analyticsId", e.target.value)} /></Field>
        </Grid>
        <Toggle label="Allow search engines to index the site" checked={v.allowIndexing} onChange={(x) => set("allowIndexing", x)} />
      </Card>
      <Card title="Social preview image" description="Requires the Website URL in General settings.">
        <ImageSlot slot="og_image" label="Open Graph image" hint="1200×630 PNG or JPG, up to 1 MB." d={d} onChange={onSaved} />
      </Card>
    </>
  );
}

function SocialForm({ d, onSaved }: P) {
  const { v, set, footer } = useCategory(d, "social", onSaved);
  const fields: Array<[keyof Settings["social"], string]> = [["facebook", "Facebook"], ["instagram", "Instagram"], ["twitter", "X / Twitter"], ["linkedin", "LinkedIn"], ["youtube", "YouTube"], ["tiktok", "TikTok"], ["whatsapp", "WhatsApp (wa.me link)"], ["telegram", "Telegram"]];
  return (
    <Card title="Social media" description="Filled-in profiles appear in the website footer." footer={footer}>
      <Grid>{fields.map(([k, l]) => <Field key={k} label={l}><Input value={v[k]} placeholder="https://" onChange={(e) => set(k, e.target.value)} /></Field>)}</Grid>
    </Card>
  );
}

function EmailForm({ d, onSaved }: P) {
  const { v, set, footer } = useCategory(d, "email", onSaved);
  const test = useServerFn(adminSendTestEmail);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Card title="Email appearance" description="Applies to every email the bank sends." footer={footer}>
        <Grid>
          <Field label="Sender name" hint="Defaults to the site name."><Input value={v.senderName} onChange={(e) => set("senderName", e.target.value)} /></Field>
          <Field label="Reply-to email"><Input type="email" value={v.replyTo} onChange={(e) => set("replyTo", e.target.value)} /></Field>
          <ColorField label="Button colour" value={v.buttonColor} onChange={(x) => set("buttonColor", x)} />
          <Field label="Email footer" wide><Textarea rows={3} value={v.footer} onChange={(e) => set("footer", e.target.value)} /></Field>
        </Grid>
      </Card>
      <Card title="Email logo"><ImageSlot slot="email_logo" label="Email logo" hint="Needs the Website URL in General settings so mail apps can load it." d={d} onChange={onSaved} /></Card>
      <Card title="Mail server" description="Mail server credentials are stored as secure secrets and are never shown here.">
        <div className="flex flex-wrap gap-2">
          {([["Server", d.smtp.host], ["Username", d.smtp.user], ["Password", d.smtp.pass]] as const).map(([l, ok]) => <Badge key={l} variant={ok ? "secondary" : "destructive"}>{l}: {ok ? "configured" : "missing"}</Badge>)}
        </div>
        <p className="text-xs text-muted-foreground">The sender address is the mail server username. To change server details, update the project's secrets.</p>
        <div className="flex items-center gap-3">
          <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); setMsg(null); try { const r = await test(); setMsg(r.ok ? { ok: true, text: `Test email sent to ${r.to}.` } : { ok: false, text: r.error }); } catch (e) { setMsg({ ok: false, text: errText(e) }); } setBusy(false); }}>
            {busy && <Loader2 className="animate-spin" />}Send test email to me</Button>
          <MsgLine msg={msg} />
        </div>
      </Card>
    </>
  );
}

function NotificationsForm({ d, onSaved }: P) {
  const { v, set, footer } = useCategory(d, "notifications", onSaved);
  return (
    <Card title="Admin alerts" description="Email alerts sent to staff when customers take action. In-app notifications to customers are always on." footer={footer}>
      <Field label="Alert email" hint="Defaults to the admin email in General settings."><Input type="email" value={v.alertEmail} onChange={(e) => set("alertEmail", e.target.value)} /></Field>
      <Toggle label="New registration alerts" checked={v.registrationAlerts} onChange={(x) => set("registrationAlerts", x)} />
      <Toggle label="New loan request alerts" checked={v.loanAlerts} onChange={(x) => set("loanAlerts", x)} />
      <Toggle label="New support ticket alerts" checked={v.ticketAlerts} onChange={(x) => set("ticketAlerts", x)} />
    </Card>
  );
}

function SecuritySection({ d, onSaved }: P) {
  const { v, set, footer } = useCategory(d, "security", onSaved);
  const change = useServerFn(adminChangeOwnPassword);
  const me = useServerFn(getMe);
  const [myId, setMyId] = useState<number | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { me().then((u) => setMyId(u?.id ?? null)).catch(() => {}); }, [me]);
  const num = (k: "sessionDays" | "maxLoginAttempts" | "lockMinutes") => (e: { target: { value: string } }) => set(k, Number(e.target.value) || 0);
  return (
    <>
      <Card title="Sign-in protection" description="Enforced on the server for every sign-in." footer={footer}>
        <Grid>
          <Field label="Session length (days)" hint="1–30. Applies to new sign-ins."><Input type="number" min={1} max={30} value={v.sessionDays} onChange={num("sessionDays")} /></Field>
          <Field label="Failed attempts before lock" hint="3–20."><Input type="number" min={3} max={20} value={v.maxLoginAttempts} onChange={num("maxLoginAttempts")} /></Field>
          <Field label="Lock duration (minutes)" hint="5–1440."><Input type="number" min={5} max={1440} value={v.lockMinutes} onChange={num("lockMinutes")} /></Field>
        </Grid>
        <Toggle label="Allow new customer registrations" checked={v.allowRegistration} onChange={(x) => set("allowRegistration", x)} />
        <p className="text-xs text-muted-foreground">Customers sign in with an emailed 6-digit code when they turn on two-step sign-in in their own settings.</p>
      </Card>
      <Card title="Change my password" description="Your other devices will be signed out.">
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={async (e) => {
          e.preventDefault(); setMsg(null);
          if (pw.next !== pw.confirm) return setMsg({ ok: false, text: "New passwords don't match." });
          setBusy(true);
          try { const r = await change({ data: { current: pw.current, next: pw.next } }); setMsg(r.ok ? { ok: true, text: "Password changed." } : { ok: false, text: r.error }); if (r.ok) setPw({ current: "", next: "", confirm: "" }); }
          catch (x) { setMsg({ ok: false, text: errText(x) }); }
          setBusy(false);
        }}>
          <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="New password" hint="10+ characters with upper, lower case and a number."><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          <div className="flex items-center gap-3 sm:col-span-3"><Button type="submit" disabled={busy || !pw.current || !pw.next}>{busy ? "Saving…" : "Change password"}</Button><MsgLine msg={msg} /></div>
        </form>
      </Card>
      <Card title="My signed-in devices">{myId ? <AdminSessions userId={myId} onChange={() => {}} /> : <div className="h-16 animate-pulse rounded bg-muted" />}</Card>
    </>
  );
}

function MaintenanceForm({ d, onSaved }: P) {
  const { v, set, footer } = useCategory(d, "maintenance", onSaved);
  return (
    <>
      <Card title="Maintenance mode" description="When on, visitors see the maintenance page, customers can't sign in or use online banking, and new registrations are closed. Staff can still use the admin area." footer={footer}>
        <Toggle label="Enable maintenance mode" hint={v.enabled ? "Remember to save — customers will be locked out." : undefined} checked={v.enabled}
          onChange={(x) => { if (x && !window.confirm("Turn on maintenance mode? Customers will be blocked from online banking once you save.")) return; set("enabled", x); }} />
        <Field label="Title"><Input value={v.title} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="Message"><Textarea rows={4} value={v.message} onChange={(e) => set("message", e.target.value)} /></Field>
        <Field label="Contact information" hint="e.g. “Urgent? Call +1 555 0100”"><Input value={v.contact} onChange={(e) => set("contact", e.target.value)} /></Field>
      </Card>
      <Card title="Maintenance page logo"><ImageSlot slot="maintenance_logo" label="Maintenance logo" hint="Falls back to the website logo." d={d} onChange={onSaved} /></Card>
    </>
  );
}

function SystemSection() {
  const info = useServerFn(adminSystemInfo);
  const clear = useServerFn(adminClearSettingsCache);
  const router = useRouter();
  const [d, setD] = useState<Awaited<ReturnType<typeof adminSystemInfo>> | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const refresh = useCallback(() => info().then(setD).catch((e) => setMsg({ ok: false, text: errText(e) })), [info]);
  useEffect(() => { refresh(); }, [refresh]);
  const rows: Array<[string, string | number]> = d ? [
    ["Status", "Operational"], ["App version", d.version], ["Runtime", d.runtime], ["Database", d.dbVersion], ["Database response", `${d.dbLatencyMs} ms`],
    ["Database size", `${d.dbSizeMb} MB`], ["Customers & staff", d.users], ["Accounts", d.accounts], ["Transactions", d.txns], ["Active sessions", d.sessions],
  ] : [];
  return (
    <>
      <Card title="System status" footer={<><Button variant="outline" onClick={refresh}>Refresh</Button><MsgLine msg={msg} /></>}>
        {!d ? <div className="h-32 animate-pulse rounded bg-muted" /> : (
          <dl className="grid gap-3 sm:grid-cols-2">{rows.map(([k, val]) => <div key={k} className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{val}</dd></div>)}</dl>
        )}
      </Card>
      <Card title="Upload limits" description="Fixed for safety; files are type-checked on the server.">
        {d && <ul className="space-y-1 text-sm"><li>KYC documents: {d.kycMaxMb} MB</li><li>Profile photos: {d.avatarMaxMb} MB</li><li>Brand images: {d.brandMaxMb} MB</li></ul>}
      </Card>
      <Card title="Cache" description="Settings are cached for 30 seconds. Clear it to apply changes immediately everywhere.">
        <div><Button variant="outline" onClick={async () => { await clear(); await router.invalidate(); setMsg({ ok: true, text: "Cache cleared." }); }}>Clear settings cache</Button></div>
      </Card>
    </>
  );
}

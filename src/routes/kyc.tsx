import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Camera, CheckCircle2, FileText, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { AccountPage, Panel, Msg, errText } from "@/components/AccountPage";
import { listCountries, listStates } from "@/lib/geo.functions";
import { deleteKycDocument, getMyKyc, saveKycSection, submitKycApplication } from "@/lib/kyc.functions";
import {
  ACCOUNT_USE, EDITABLE, EMPLOYMENT, ID_DOC_TYPES, KYC_POLICY, KYC_STATUS_LABEL, KYC_STATUS_TEXT, MONTHLY_RANGE, NO_POSTCODE_COUNTRIES,
  SECTION_LABEL, SLOT_LABEL, SOURCE_OF_FUNDS, allowedDocTypes, maskDocNumber,
  type AddressData, type IdentityData, type KycStatus, type PersonalData, type Section, type Slot,
} from "@/lib/kyc-config";

export const Route = createFileRoute("/kyc")({
  ssr: false,
  head: () => ({ meta: [{ title: "Verify your identity — Universal Crest" }, { name: "description", content: "Complete identity verification for your Universal Crest account." }, { name: "robots", content: "noindex" }] }),
  component: KycPage,
});

type Kyc = Awaited<ReturnType<typeof getMyKyc>>;
type Doc = Kyc["docs"][number];
type Country = { code: string; name: string };
const STEPS = ["Personal details", "Address", "Identity documents", "Review & submit"] as const;
const selectCls = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

function statusVariant(s: KycStatus): "default" | "secondary" | "destructive" | "outline" {
  return s === "verified" ? "default" : s === "rejected" || s === "action_required" ? "destructive" : s === "not_started" ? "outline" : "secondary";
}

function Field({ id, label, error, hint, children, optional }: { id: string; label: string; error?: string | undefined; hint?: string | undefined; optional?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}{optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}</Label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Sel({ id, value, onChange, options, placeholder, invalid }: { id: string; value: string; onChange: (v: string) => void; options: Array<string | { value: string; label: string }>; placeholder: string; invalid?: boolean }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-err` : undefined}>
      <option value="">{placeholder}</option>
      {options.map((o) => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function KycPage() {
  const load = useServerFn(getMyKyc);
  const save = useServerFn(saveKycSection);
  const del = useServerFn(deleteKycDocument);
  const submit = useServerFn(submitKycApplication);
  const loadCountries = useServerFn(listCountries);
  const loadStates = useServerFn(listStates);

  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [states, setStates] = useState<Country[]>([]);
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const [personal, setPersonal] = useState<PersonalData>({ firstName: "", middleName: "", lastName: "", dob: "", nationality: "", residence: "", phone: "", occupation: "", employmentStatus: "", sourceOfFunds: "", accountUse: "", monthlyRange: "" });
  const [address, setAddress] = useState<AddressData>({ line1: "", line2: "", city: "", region: "", postalCode: "", country: "" });
  const [identity, setIdentity] = useState<IdentityData>({ docType: "", issuingCountry: "", docNumber: "", issueDate: "", expiryDate: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const refresh = useCallback(async () => {
    const k = await load();
    setKyc(k);
    return k;
  }, [load]);

  useEffect(() => {
    refresh().then((k) => {
      const d = k.data;
      setPersonal((p) => ({ ...p, firstName: k.prefill.firstName, lastName: k.prefill.lastName, dob: k.prefill.dob, phone: k.prefill.phone, residence: k.prefill.residence, ...d.personal }));
      setAddress((a) => ({ ...a, line1: k.prefill.line1, country: k.prefill.residence, ...d.address }));
      setIdentity((i) => ({ ...i, ...d.identity }));
      if (k.status === "action_required" && k.corrections[0]) setStep({ personal: 0, address: 1, identity: 2, supporting: 2 }[k.corrections[0].section]);
      else if (k.status === "in_progress") setStep(!d.personal ? 0 : !d.address ? 1 : 2);
    }).catch((e) => setLoadErr(errText(e)));
    loadCountries().then(setCountries).catch(() => {});
  }, [refresh, loadCountries]);

  useEffect(() => {
    if (!address.country) return setStates([]);
    loadStates({ data: { country: address.country } }).then(setStates).catch(() => setStates([]));
  }, [address.country, loadStates]);

  const countryName = useMemo(() => Object.fromEntries(countries.map((c) => [c.code, c.name])), [countries]);
  const countryOpts = useMemo(() => countries.map((c) => ({ value: c.code, label: c.name })), [countries]);

  if (loadErr) return <AccountPage title="Verify your identity"><Panel title="Couldn't load your verification"><p className="text-sm text-destructive">{loadErr}</p><Button className="mt-4" variant="outline" onClick={() => location.reload()}><RefreshCw /> Try again</Button></Panel></AccountPage>;
  if (!kyc) return <AccountPage title="Verify your identity"><p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin" /> Loading your verification…</p></AccountPage>;

  const status = kyc.status;
  const editable = EDITABLE.includes(status);
  const flagged = new Set<Section>(kyc.corrections.map((c) => c.section));
  const canEdit = (s: Section) => editable && (status !== "action_required" || flagged.has(s));
  const docBySlot = Object.fromEntries(kyc.docs.map((d) => [d.slot, d])) as Partial<Record<Slot, Doc>>;
  const docType = ID_DOC_TYPES.find((d) => d.value === identity.docType);
  const regionRequired = states.length > 0;
  const postcodeOptional = !!address.country && NO_POSTCODE_COUNTRIES.includes(address.country);

  function validate(s: number) {
    const e: Record<string, string> = {};
    const req = (k: string, v: string, l: string) => { if (!v.trim()) e[k] = `Enter your ${l}.`; };
    if (s === 0) {
      req("firstName", personal.firstName, "legal first name"); req("lastName", personal.lastName, "legal last name");
      if (!personal.dob) e["dob"] = "Enter your date of birth.";
      else { const age = (Date.now() - new Date(personal.dob).getTime()) / 3.15576e10; if (age < 18) e["dob"] = "You must be at least 18 years old."; else if (age > 120) e["dob"] = "Enter a valid date of birth."; }
      if (!personal.nationality) e["nationality"] = "Choose your nationality.";
      if (!personal.residence) e["residence"] = "Choose your country of residence.";
      if (!/^\+?[0-9 ()-]{6,20}$/.test(personal.phone)) e["phone"] = "Enter a valid phone number, including the country code.";
      req("occupation", personal.occupation, "occupation");
      if (!personal.employmentStatus) e["employmentStatus"] = "Choose your employment status.";
      if (!personal.sourceOfFunds) e["sourceOfFunds"] = "Choose your source of funds.";
      if (!personal.accountUse) e["accountUse"] = "Choose how you'll use the account.";
      if (!personal.monthlyRange) e["monthlyRange"] = "Choose a range.";
    }
    if (s === 1) {
      req("line1", address.line1, "street address"); req("city", address.city, "city");
      if (!address.country) e["country"] = "Choose your country.";
      if (regionRequired && !address.region) e["region"] = "Choose your state, province or region.";
      if (!postcodeOptional && !address.postalCode.trim()) e["postalCode"] = "Enter your postal code.";
    }
    if (s === 2) {
      if (!identity.issuingCountry) e["issuingCountry"] = "Choose the issuing country.";
      if (!identity.docType) e["docType"] = "Choose a document type.";
      if (!identity.docNumber.trim()) e["docNumber"] = "Enter the document number.";
      else if (!/^[A-Za-z0-9 -]{3,30}$/.test(identity.docNumber)) e["docNumber"] = "Use only letters, numbers, spaces and dashes.";
      if (docType?.needsIssueDate && !identity.issueDate) e["issueDate"] = "Enter the issue date.";
      if (identity.issueDate && new Date(identity.issueDate) > new Date()) e["issueDate"] = "The issue date can't be in the future.";
      if (!identity.expiryDate) e["expiryDate"] = "Enter the expiry date.";
      else if (new Date(identity.expiryDate) <= new Date()) e["expiryDate"] = "This document has expired. Please use a valid document.";
      if (!docBySlot.id_front) e["id_front"] = "Upload the front of your document.";
      if (docType?.needsBack && !docBySlot.id_back) e["id_back"] = "Upload the back of your document.";
      if (KYC_POLICY.requireProofOfAddress && !docBySlot.proof_of_address) e["proof_of_address"] = "Upload a proof of address.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function saveStep(s: number): Promise<boolean> {
    const section: Section | null = s === 0 ? "personal" : s === 1 ? "address" : s === 2 ? "identity" : null;
    if (!section || !canEdit(section)) return true;
    const r = s === 0 ? await save({ data: { section: "personal", values: personal } })
      : s === 1 ? await save({ data: { section: "address", values: address } })
      : await save({ data: { section: "identity", values: identity } });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return false; }
    return true;
  }

  async function go(next: number, check: boolean) {
    setMsg(null);
    if (check && !validate(step)) { setMsg({ ok: false, text: "Please fix the highlighted fields." }); return; }
    setBusy(true);
    try {
      if (await saveStep(step)) { await refresh(); setErrors({}); setStep(next); headingRef.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    } catch (x) { setMsg({ ok: false, text: errText(x) }); }
    finally { setBusy(false); }
  }

  async function saveAndExit() {
    setBusy(true); setMsg(null);
    try { if (await saveStep(step)) { await refresh(); setMsg({ ok: true, text: "Progress saved. You can come back any time to continue." }); } }
    catch (x) { setMsg({ ok: false, text: errText(x) }); }
    finally { setBusy(false); }
  }

  async function onSubmit() {
    setMsg(null); setMissing([]);
    if (!declared) return setMsg({ ok: false, text: "Please confirm the declaration before submitting." });
    setBusy(true);
    try {
      const r = await submit({ data: { declaration: true, regionRequired } });
      if (!r.ok) { setMsg({ ok: false, text: r.error }); if ("missing" in r && r.missing) setMissing(r.missing); return; }
      setDone(r.reference);
      await refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (x) { setMsg({ ok: false, text: errText(x) }); }
    finally { setBusy(false); }
  }

  const statusPanel = (
    <Panel title="Verification status">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={statusVariant(status)}>{KYC_STATUS_LABEL[status]}</Badge>
        {kyc.reference && <span className="text-xs text-muted-foreground">Reference <span className="font-mono">{kyc.reference}</span></span>}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{KYC_STATUS_TEXT[status]}</p>
      {kyc.feedback && <p className="mt-3 rounded-md border bg-muted/40 p-3 text-sm"><span className="font-medium">Message from our team:</span> {kyc.feedback}</p>}
      {status === "action_required" && kyc.corrections.length > 0 && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-4" role="alert">
          <p className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4 text-destructive" /> Please correct the following</p>
          <ul className="mt-2 space-y-1 text-sm">
            {kyc.corrections.map((c, i) => <li key={i}><span className="font-medium">{SECTION_LABEL[c.section]}:</span> {c.message}</li>)}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Only these sections can be changed. Other sections stay as you submitted them.</p>
        </div>
      )}
      {kyc.submittedAt && <p className="mt-3 text-xs text-muted-foreground">Last submitted {new Date(kyc.submittedAt).toLocaleString()}</p>}
      {(status === "submitted" || status === "under_review") && KYC_POLICY.reviewTimeEstimate && <p className="mt-1 text-xs text-muted-foreground">Typical review time: {KYC_POLICY.reviewTimeEstimate}</p>}
    </Panel>
  );

  const historyPanel = kyc.history.length > 0 && (
    <Panel title="Application history">
      <ol className="space-y-2 text-sm">
        {kyc.history.map((h: Kyc["history"][number], i: number) => (
          <li key={i} className="flex flex-wrap gap-x-3"><span className="w-40 shrink-0 text-xs text-muted-foreground">{new Date(h.at).toLocaleString()}</span><span className="font-medium">{KYC_STATUS_LABEL[h.status as KycStatus] ?? h.status}</span>{h.note && <span className="text-muted-foreground">— {h.note}</span>}</li>
        ))}
      </ol>
      {kyc.past.length > 0 && <p className="mt-4 text-xs text-muted-foreground">Previous applications: {kyc.past.map((p: Kyc["past"][number]) => `${p.reference} (${KYC_STATUS_LABEL[p.status as KycStatus] ?? p.status})`).join(", ")}</p>}
    </Panel>
  );

  const intro = "We're required to confirm who our customers are to keep accounts secure and prevent fraud. Your details are reviewed by our team and stored privately.";

  // ---------- confirmation / locked views ----------
  if (done || !editable) {
    return (
      <AccountPage title="Verify your identity" subtitle={intro}>
        {done && (
          <Panel title="Application submitted">
            <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-5 text-primary" /> Thank you — your application has been received.</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Application reference</dt><dd className="font-mono">{done}</dd></div>
              <div><dt className="text-muted-foreground">Submitted</dt><dd>{kyc.submittedAt ? new Date(kyc.submittedAt).toLocaleString() : new Date().toLocaleString()}</dd></div>
            </dl>
            <p className="mt-4 text-sm text-muted-foreground">We'll send you a notification when the review is finished.</p>
          </Panel>
        )}
        {statusPanel}
        {status === "rejected" && <Button className="h-11" onClick={async () => { setBusy(true); try { const r = await save({ data: { section: "personal", values: personal } }); if (!r.ok) setMsg({ ok: false, text: r.error }); else { await refresh(); setStep(0); setDone(null); } } finally { setBusy(false); } }} disabled={busy}>Start a new application</Button>}
        <Msg msg={msg} />
        {historyPanel}
      </AccountPage>
    );
  }

  if (status === "not_started" && !started) {
    return (
      <AccountPage title="Verify your identity" subtitle={intro}>
        {statusPanel}
        <Panel title="What you'll need" description="It usually takes about 10 minutes. You can save and come back at any time.">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Your personal details and residential address</li>
            <li>A valid passport, national identity card or driver's licence</li>
            {KYC_POLICY.requireProofOfAddress && <li>A proof of address dated within the last {KYC_POLICY.proofOfAddressRecencyMonths} months</li>}
            {KYC_POLICY.selfieEnabled && <li>Optionally, a selfie photo</li>}
          </ul>
          <Button className="mt-5 h-11" onClick={() => setStarted(true)}>Start verification</Button>
        </Panel>
      </AccountPage>
    );
  }

  const ro = (s: Section) => !canEdit(s);

  return (
    <AccountPage title="Verify your identity" subtitle={intro}>
      {statusPanel}

      <nav aria-label="Verification progress">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" onClick={() => i < step && go(i, false)} disabled={i > step || busy} aria-current={i === step ? "step" : undefined}
                className={`w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${i === step ? "border-primary bg-primary/5 font-semibold text-foreground" : i < step ? "text-foreground hover:bg-muted" : "text-muted-foreground"}`}>
                <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Step {i + 1}</span>{s}
              </button>
            </li>
          ))}
        </ol>
        <Progress className="mt-3" value={((step + 1) / STEPS.length) * 100} aria-label={`Step ${step + 1} of ${STEPS.length}`} />
      </nav>

      <h2 ref={headingRef} tabIndex={-1} className="sr-only">{STEPS[step]}</h2>

      {step === 0 && (
        <Panel title="Personal details" description="Use your name exactly as it appears on your identity document.">
          <fieldset disabled={ro("personal")} className="grid gap-4 sm:grid-cols-3">
            <Field id="firstName" label="Legal first name" error={errors["firstName"]}><Input id="firstName" autoComplete="given-name" value={personal.firstName} aria-invalid={!!errors["firstName"]} onChange={(e) => setPersonal({ ...personal, firstName: e.target.value })} /></Field>
            <Field id="middleName" label="Middle name" optional><Input id="middleName" autoComplete="additional-name" value={personal.middleName} onChange={(e) => setPersonal({ ...personal, middleName: e.target.value })} /></Field>
            <Field id="lastName" label="Legal last name" error={errors["lastName"]}><Input id="lastName" autoComplete="family-name" value={personal.lastName} aria-invalid={!!errors["lastName"]} onChange={(e) => setPersonal({ ...personal, lastName: e.target.value })} /></Field>
          </fieldset>
          <fieldset disabled={ro("personal")} className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field id="dob" label="Date of birth" error={errors["dob"]}><Input id="dob" type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} value={personal.dob} aria-invalid={!!errors["dob"]} onChange={(e) => setPersonal({ ...personal, dob: e.target.value })} /></Field>
            <Field id="nationality" label="Nationality" error={errors["nationality"]}><Sel id="nationality" value={personal.nationality} onChange={(v) => setPersonal({ ...personal, nationality: v })} options={countryOpts} placeholder="Choose a country" invalid={!!errors["nationality"]} /></Field>
            <Field id="residence" label="Country of residence" error={errors["residence"]}><Sel id="residence" value={personal.residence} onChange={(v) => setPersonal({ ...personal, residence: v })} options={countryOpts} placeholder="Choose a country" invalid={!!errors["residence"]} /></Field>
          </fieldset>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="email" label="Email address" hint={kyc.emailVerified ? "Verified" : "Not verified yet — confirm it from the link we emailed you."}>
              <div className="flex items-center gap-2"><Input id="email" value={kyc.email} readOnly aria-describedby="email-hint" /><Badge variant={kyc.emailVerified ? "default" : "outline"}>{kyc.emailVerified ? "Verified" : "Not verified"}</Badge></div>
            </Field>
            <fieldset disabled={ro("personal")}>
              <Field id="phone" label="Phone number" error={errors["phone"]} hint="Include your country code. Phone numbers are not verified.">
                <div className="flex items-center gap-2"><Input id="phone" type="tel" autoComplete="tel" value={personal.phone} aria-invalid={!!errors["phone"]} aria-describedby={errors["phone"] ? "phone-err" : "phone-hint"} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} /><Badge variant="outline">Not verified</Badge></div>
              </Field>
            </fieldset>
          </div>
          <fieldset disabled={ro("personal")} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="occupation" label="Occupation" error={errors["occupation"]}><Input id="occupation" autoComplete="organization-title" value={personal.occupation} aria-invalid={!!errors["occupation"]} onChange={(e) => setPersonal({ ...personal, occupation: e.target.value })} /></Field>
            <Field id="employmentStatus" label="Employment status" error={errors["employmentStatus"]}><Sel id="employmentStatus" value={personal.employmentStatus} onChange={(v) => setPersonal({ ...personal, employmentStatus: v })} options={EMPLOYMENT} placeholder="Choose one" invalid={!!errors["employmentStatus"]} /></Field>
            <Field id="sourceOfFunds" label="Main source of funds" error={errors["sourceOfFunds"]}><Sel id="sourceOfFunds" value={personal.sourceOfFunds} onChange={(v) => setPersonal({ ...personal, sourceOfFunds: v })} options={SOURCE_OF_FUNDS} placeholder="Choose one" invalid={!!errors["sourceOfFunds"]} /></Field>
            <Field id="accountUse" label="Intended account use" error={errors["accountUse"]}><Sel id="accountUse" value={personal.accountUse} onChange={(v) => setPersonal({ ...personal, accountUse: v })} options={ACCOUNT_USE} placeholder="Choose one" invalid={!!errors["accountUse"]} /></Field>
            <Field id="monthlyRange" label="Expected monthly transactions" error={errors["monthlyRange"]}><Sel id="monthlyRange" value={personal.monthlyRange} onChange={(v) => setPersonal({ ...personal, monthlyRange: v })} options={MONTHLY_RANGE} placeholder="Choose a range" invalid={!!errors["monthlyRange"]} /></Field>
          </fieldset>
        </Panel>
      )}

      {step === 1 && (
        <Panel title="Residential address" description="Where you currently live. A PO box can't be accepted.">
          <fieldset disabled={ro("address")} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field id="country" label="Country" error={errors["country"]}><Sel id="country" value={address.country} onChange={(v) => setAddress({ ...address, country: v, region: "" })} options={countryOpts} placeholder="Choose a country" invalid={!!errors["country"]} /></Field></div>
            <div className="sm:col-span-2"><Field id="line1" label="Address line 1" error={errors["line1"]}><Input id="line1" autoComplete="address-line1" value={address.line1} aria-invalid={!!errors["line1"]} onChange={(e) => setAddress({ ...address, line1: e.target.value })} /></Field></div>
            <div className="sm:col-span-2"><Field id="line2" label="Address line 2" optional><Input id="line2" autoComplete="address-line2" value={address.line2} onChange={(e) => setAddress({ ...address, line2: e.target.value })} /></Field></div>
            <Field id="city" label="City or town" error={errors["city"]}><Input id="city" autoComplete="address-level2" value={address.city} aria-invalid={!!errors["city"]} onChange={(e) => setAddress({ ...address, city: e.target.value })} /></Field>
            <Field id="region" label="State, province or region" optional={!regionRequired} error={errors["region"]}>
              {states.length > 0 ? <Sel id="region" value={address.region} onChange={(v) => setAddress({ ...address, region: v })} options={states.map((s) => ({ value: s.name, label: s.name }))} placeholder="Choose one" invalid={!!errors["region"]} />
                : <Input id="region" autoComplete="address-level1" value={address.region} onChange={(e) => setAddress({ ...address, region: e.target.value })} />}
            </Field>
            <Field id="postalCode" label="Postal code" optional={postcodeOptional} error={errors["postalCode"]} hint={postcodeOptional ? "Not usually required in this country." : undefined}>
              <Input id="postalCode" autoComplete="postal-code" value={address.postalCode} aria-invalid={!!errors["postalCode"]} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} />
            </Field>
          </fieldset>
        </Panel>
      )}

      {step === 2 && (
        <>
          <Panel title="Identity document" description="Documents must be readable, complete (all four corners visible) and not expired.">
            <fieldset disabled={ro("identity")} className="grid gap-4 sm:grid-cols-2">
              <Field id="issuingCountry" label="Issuing country" error={errors["issuingCountry"]}><Sel id="issuingCountry" value={identity.issuingCountry} onChange={(v) => setIdentity({ ...identity, issuingCountry: v, docType: allowedDocTypes(v).some((d) => d.value === identity.docType) ? identity.docType : "" })} options={countryOpts} placeholder="Choose a country" invalid={!!errors["issuingCountry"]} /></Field>
              <Field id="docType" label="Document type" error={errors["docType"]}><Sel id="docType" value={identity.docType} onChange={(v) => setIdentity({ ...identity, docType: v })} options={allowedDocTypes(identity.issuingCountry).map((d) => ({ value: d.value, label: d.label }))} placeholder="Choose a document" invalid={!!errors["docType"]} /></Field>
              <Field id="docNumber" label="Document number" error={errors["docNumber"]}><Input id="docNumber" autoComplete="off" spellCheck={false} value={identity.docNumber} aria-invalid={!!errors["docNumber"]} onChange={(e) => setIdentity({ ...identity, docNumber: e.target.value.toUpperCase() })} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field id="issueDate" label="Issue date" optional={!docType?.needsIssueDate} error={errors["issueDate"]}><Input id="issueDate" type="date" max={new Date().toISOString().slice(0, 10)} value={identity.issueDate} aria-invalid={!!errors["issueDate"]} onChange={(e) => setIdentity({ ...identity, issueDate: e.target.value })} /></Field>
                <Field id="expiryDate" label="Expiry date" error={errors["expiryDate"]}><Input id="expiryDate" type="date" value={identity.expiryDate} aria-invalid={!!errors["expiryDate"]} onChange={(e) => setIdentity({ ...identity, expiryDate: e.target.value })} /></Field>
              </div>
            </fieldset>
            <p className="mt-5 text-xs text-muted-foreground">JPG, PNG or PDF · up to {KYC_POLICY.maxFileBytes / 1024 / 1024} MB per file.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <UploadSlot slot="id_front" doc={docBySlot.id_front} disabled={ro("identity")} error={errors["id_front"]} onChange={refresh} del={del} />
              {docType?.needsBack && <UploadSlot slot="id_back" doc={docBySlot.id_back} disabled={ro("identity")} error={errors["id_back"]} onChange={refresh} del={del} />}
            </div>
          </Panel>
          <Panel title="Supporting documents">
            <div className="grid gap-4 sm:grid-cols-2">
              {KYC_POLICY.requireProofOfAddress && (
                <div>
                  <UploadSlot slot="proof_of_address" doc={docBySlot.proof_of_address} disabled={ro("supporting")} error={errors["proof_of_address"]} onChange={refresh} del={del} />
                  <p className="mt-2 text-xs text-muted-foreground">Accepted: utility bill, bank or credit card statement, tax letter or government letter showing your name and address, dated within the last {KYC_POLICY.proofOfAddressRecencyMonths} months.</p>
                </div>
              )}
              {KYC_POLICY.selfieEnabled && (
                <div>
                  <UploadSlot slot="selfie" doc={docBySlot.selfie} disabled={ro("supporting")} optional capture onChange={refresh} del={del} />
                  <p className="mt-2 text-xs text-muted-foreground">Optional. A clear photo of your face helps our team compare it with your ID photo by eye. Your device may ask for camera permission — you can also choose an existing photo. This is not an automated face match.</p>
                </div>
              )}
            </div>
          </Panel>
        </>
      )}

      {step === 3 && (
        <>
          <ReviewSection title="Personal details" onEdit={canEdit("personal") ? () => setStep(0) : undefined} rows={[
            ["Legal name", [personal.firstName, personal.middleName, personal.lastName].filter(Boolean).join(" ")], ["Date of birth", personal.dob],
            ["Nationality", countryName[personal.nationality] ?? personal.nationality], ["Country of residence", countryName[personal.residence] ?? personal.residence],
            ["Email", `${kyc.email} (${kyc.emailVerified ? "verified" : "not verified"})`], ["Phone", `${personal.phone} (not verified)`],
            ["Occupation", personal.occupation], ["Employment status", personal.employmentStatus], ["Source of funds", personal.sourceOfFunds],
            ["Account use", personal.accountUse], ["Monthly transactions", personal.monthlyRange],
          ]} />
          <ReviewSection title="Residential address" onEdit={canEdit("address") ? () => setStep(1) : undefined} rows={[
            ["Address", [address.line1, address.line2].filter(Boolean).join(", ")], ["City", address.city], ["Region", address.region], ["Postal code", address.postalCode], ["Country", countryName[address.country] ?? address.country],
          ]} />
          <ReviewSection title="Identity documents" onEdit={canEdit("identity") || canEdit("supporting") ? () => setStep(2) : undefined} rows={[
            ["Document", docType?.label ?? ""], ["Issuing country", countryName[identity.issuingCountry] ?? identity.issuingCountry], ["Document number", maskDocNumber(identity.docNumber)],
            ["Issue date", identity.issueDate], ["Expiry date", identity.expiryDate],
            ...(["id_front", "id_back", "proof_of_address", "selfie"] as Slot[]).filter((s) => docBySlot[s]).map((s) => [SLOT_LABEL[s], docBySlot[s]!.fileName] as [string, string]),
          ]} />
          <Panel title="Declaration">
            <div className="flex items-start gap-3">
              <Checkbox id="declare" checked={declared} onCheckedChange={(v) => setDeclared(v === true)} />
              <Label htmlFor="declare" className="text-sm font-normal leading-relaxed">I confirm the information and documents I've provided are accurate, complete and belong to me. I understand they'll be reviewed by Universal Crest staff and handled as described in the <Link to="/privacy" className="text-primary underline" target="_blank">privacy notice</Link>.</Label>
            </div>
            {missing.length > 0 && (
              <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
                <p className="font-medium">Still needed before you can submit:</p>
                <ul className="mt-1 list-disc pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )}
          </Panel>
        </>
      )}

      <div className="space-y-3">
        <Msg msg={msg} />
        <div className="flex flex-wrap gap-2">
          {step > 0 && <Button variant="outline" className="h-11" disabled={busy} onClick={() => go(step - 1, false)}>Back</Button>}
          {step < 3 && <Button className="h-11" disabled={busy} onClick={() => go(step + 1, true)}>{busy ? <Loader2 className="animate-spin" /> : null} Save and continue</Button>}
          {step < 3 && <Button variant="ghost" className="h-11" disabled={busy} onClick={saveAndExit}>Save progress</Button>}
          {step === 3 && <Button className="h-11" disabled={busy || !declared} onClick={onSubmit}>{busy ? <Loader2 className="animate-spin" /> : null} {status === "action_required" ? "Resubmit for review" : "Submit for review"}</Button>}
        </div>
      </div>
      {historyPanel}
    </AccountPage>
  );
}

function ReviewSection({ title, rows, onEdit }: { title: string; rows: Array<[string, string]>; onEdit?: (() => void) | undefined }) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3"><h2 className="font-sans text-lg font-semibold">{title}</h2>{onEdit && <Button variant="link" className="h-auto p-0" onClick={onEdit}>Edit<span className="sr-only"> {title}</span></Button>}</div>
      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className={v ? "" : "text-destructive"}>{v || "Missing"}</dd></div>)}
      </dl>
    </section>
  );
}

function UploadSlot({ slot, doc, disabled, error, optional, capture, onChange, del }: {
  slot: Slot; doc: Doc | undefined; disabled: boolean; error?: string | undefined; optional?: boolean; capture?: boolean;
  onChange: () => Promise<unknown>; del: (a: { data: { id: number } }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const id = `file-${slot}`;

  function pick(file: File | undefined) {
    setErr(null);
    if (!file) return;
    if (!(KYC_POLICY.acceptedMime as readonly string[]).includes(file.type)) return setErr("Only JPG, PNG or PDF files are accepted.");
    if (slot === "selfie" && file.type === "application/pdf") return setErr("A selfie must be a JPG or PNG photo.");
    if (file.size > KYC_POLICY.maxFileBytes) return setErr(`This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`);
    const fd = new FormData();
    fd.append("slot", slot);
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/kyc/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = async () => {
      let body: { error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) await onChange(); else setErr(body.error ?? "Upload failed. Please try again.");
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    };
    xhr.onerror = () => { setErr("Network error — check your connection and try again."); setProgress(null); };
    setProgress(0);
    xhr.send(fd);
  }

  const shownErr = err ?? error;
  return (
    <div className={`rounded-lg border p-4 ${shownErr ? "border-destructive" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="font-medium">{SLOT_LABEL[slot]}{optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}</Label>
        {doc && <CheckCircle2 className="size-4 text-primary" aria-label="Uploaded" />}
      </div>
      {doc ? (
        <div className="mt-3">
          {doc.mime.startsWith("image/") ? <img src={`/api/kyc/file/${doc.id}`} alt={`${SLOT_LABEL[slot]} preview`} className="h-36 w-full rounded border bg-muted object-contain" />
            : <a href={`/api/kyc/file/${doc.id}`} target="_blank" rel="noreferrer" className="flex h-36 flex-col items-center justify-center gap-2 rounded border bg-muted text-sm text-muted-foreground hover:text-foreground"><FileText className="size-8" /> Open PDF</a>}
          <p className="mt-2 truncate text-xs text-muted-foreground">{doc.fileName} · {(doc.size / 1024).toFixed(0)} KB</p>
        </div>
      ) : <p className="mt-2 text-xs text-muted-foreground">No file yet.</p>}
      {progress !== null && <div className="mt-3" aria-live="polite"><Progress value={progress} aria-label="Upload progress" /><p className="mt-1 text-xs text-muted-foreground">Uploading… {progress}%</p></div>}
      <input ref={inputRef} id={id} type="file" className="sr-only" disabled={disabled || progress !== null}
        accept={slot === "selfie" ? "image/jpeg,image/png" : "image/jpeg,image/png,application/pdf"} {...(capture ? { capture: "user" as const } : {})}
        aria-describedby={shownErr ? `${id}-err` : undefined} onChange={(e) => pick(e.target.files?.[0])} />
      {!disabled && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={progress !== null} onClick={() => inputRef.current?.click()}>
            {capture ? <Camera /> : <Upload />} {doc ? "Replace" : capture ? "Take or choose photo" : "Choose file"}
          </Button>
          {doc && <Button type="button" size="sm" variant="ghost" onClick={async () => { const r = await del({ data: { id: doc.id } }); if (!r.ok) setErr(r.error ?? "Could not remove."); await onChange(); }}><Trash2 /> Remove</Button>}
        </div>
      )}
      {shownErr && <p id={`${id}-err`} role="alert" className="mt-2 text-xs text-destructive">{shownErr}</p>}
    </div>
  );
}

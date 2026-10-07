import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AuthShell, StatusIcon } from "@/components/AuthShell";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerUser, resendVerification, PASSWORD_RULES } from "@/lib/auth.functions";
import { listCountries, listStates } from "@/lib/geo.functions";
import { CreditCard, PiggyBank, Briefcase, Building2, KeyRound, Eye, EyeOff, ChevronDown, Check, MailCheck, MailX, Lock } from "lucide-react";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Open an account — Universal Crest" },
      { name: "description", content: "Open a Universal Crest bank account online in minutes." },
      { property: "og:title", content: "Open an account — Universal Crest" },
      { property: "og:description", content: "Open a Universal Crest bank account online in minutes." },
    ],
  }),
  component: RegisterPage,
});

type Country = { code: string; name: string; flag: string; phone: string };
type State = { code: string; name: string };

const selectCls =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

const ACCOUNT_TYPES = [
  { id: "checking", name: "Checking Account", desc: "Perfect for daily transactions and bill payments", icon: CreditCard },
  { id: "savings", name: "Savings Account", desc: "Earn interest on your deposits", icon: PiggyBank },
  { id: "business", name: "Business Account", desc: "Built for companies and entrepreneurs", icon: Briefcase },
  { id: "corporate", name: "Corporate Account", desc: "Advanced tools for larger organizations", icon: Building2 },
];

const STEPS = ["Personal details", "Security", "Account setup"];

function RegisterPage() {
  const register = useServerFn(registerUser);
  const getCountries = useServerFn(listCountries);
  const getStates = useServerFn(listStates);
  const [countries, setCountries] = useState<Country[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ email: string; sent: boolean; verified?: boolean } | null>(null);

  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountType, setAccountType] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [resent, setResent] = useState(false);
  const resend = useServerFn(resendVerification);

  useEffect(() => { getCountries().then(setCountries); }, []);
  useEffect(() => {
    setStates([]);
    setState("");
    if (country) getStates({ data: { country } }).then(setStates);
  }, [country]);

  const selected = countries.find((c) => c.code === country);
  const visibleTypes = showMore ? ACCOUNT_TYPES : ACCOUNT_TYPES.slice(0, 2);

  function next() {
    setError(null);
    if (step === 0) {
      if (fullName.trim().length < 2) return setError("Please enter your full name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Please enter a valid email address.");
      if (!selected) return setError("Please select your country.");
      if (states.length > 0 && !state) return setError("Please select your state.");
      if (!/^[0-9 ()-]{6,15}$/.test(phone.trim())) return setError("Please enter a valid phone number.");
    }
    if (step === 1) {
      const failed = PASSWORD_RULES.find((r) => !r.test(password));
      if (failed) return setError(`Password requirement not met: ${failed.label.toLowerCase()}.`);
      if (password !== confirmPassword) return setError("Passwords do not match.");
    }
    setStep(step + 1);
  }

  async function submit() {
    setError(null);
    if (!accountType) return setError("Please choose an account type.");
    if (!/^\d{4}$/.test(pin)) return setError("Your transaction PIN must be exactly 4 digits.");
    if (!agreed) return setError("Please accept the Terms and Privacy Policy to continue.");
    const rawPhone = phone.trim().replace(/^\+/, "");
    const fullPhone = `+${selected!.phone.replace(/^\+/, "")} ${rawPhone}`;
    setLoading(true);
    try {
      const res = await register({
        data: {
          fullName: fullName.trim(), email: email.trim(), phone: fullPhone,
          country: selected!.name, state, password, accountType, pin,
        },
      });
      if (!res.ok) setError(res.error);
      else setDone({ email: email.trim(), sent: res.emailSent, verified: res.verified });
    } catch {
      setError("Please check your details and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done && !done.sent && done.verified) {
    return (
      <AuthShell
        icon={<StatusIcon tone="success"><MailCheck /></StatusIcon>}
        title="Welcome to Universal Crest"
        subtitle={<>Your profile for <strong className="text-foreground">{done.email}</strong> is verified and ready.</>}
      >
        <ul className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm">
          <li>US Dollar account (USD)</li>
        </ul>
        <Button asChild size="lg" className="mt-6 h-11 w-full"><Link to="/login">Sign in</Link></Button>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        icon={<StatusIcon tone={done.sent ? "success" : "destructive"}>{done.sent ? <MailCheck /> : <MailX />}</StatusIcon>}
        title={done.sent ? "Check your inbox" : "Account created"}
        subtitle={done.sent ? <>We sent a confirmation link to <strong className="text-foreground">{done.email}</strong>.</> : "We couldn't send your confirmation email just now."}
      >
        {done.sent ? (
          <ol className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
            <li><strong>1.</strong> Open the email from Universal Crest.</li>
            <li><strong>2.</strong> Click <em>Confirm email</em> to activate your account.</li>
            <li><strong>3.</strong> Sign in and verify your identity.</li>
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Your details are saved. Try resending below, or contact support.</p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">Can't find it? Check your spam or promotions folder.</p>
        <Button variant="outline" size="lg" className="mt-6 h-11 w-full" disabled={resent} onClick={async () => { await resend({ data: { email: done.email } }); setResent(true); }}>
          {resent ? "Confirmation email sent again" : "Resend confirmation email"}
        </Button>
        <Button asChild size="lg" className="mt-3 h-11 w-full"><Link to="/login">Go to sign in</Link></Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Open an account" subtitle={<span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> About 3 minutes · Your information is encrypted</span>}>
      {/* Step indicator */}
      <ol className="mb-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span className={`h-1.5 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />
            <span className={`text-[11px] font-medium ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <Field label="Full name" value={fullName} onChange={setFullName} autoComplete="name" />
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <select id="country" required className={selectCls} value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">{countries.length ? "Select country" : "Loading…"}</option>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State / Region</Label>
              <select id="state" className={selectCls} disabled={!states.length} key={country} value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">{!country ? "Select country first" : states.length ? "Select state" : "Not applicable"}</option>
                {states.map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <div className="grid grid-cols-[auto_minmax(0,1fr)]">
              <span className="inline-flex h-11 min-w-14 items-center justify-center rounded-l-md border border-r-0 border-input bg-muted px-2 text-sm text-muted-foreground sm:min-w-16 sm:px-3">
                {selected ? `+${selected.phone.replace(/^\+/, "")}` : "+"}
              </span>
              <Input id="phone" type="tel" autoComplete="tel-national" pattern="[0-9 ()-]{6,15}" className="h-11 rounded-l-none" placeholder="801 234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
          <ul className="space-y-1.5 rounded-md border border-input bg-muted/40 p-3">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(password);
              return (
                <li key={r.id} className={`flex items-center gap-2 text-sm ${ok ? "text-success" : "text-muted-foreground"}`}>
                  <Check className={`h-3.5 w-3.5 ${ok ? "" : "opacity-30"}`} />
                  {r.label}
                </li>
              );
            })}
          </ul>
          <Field label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Account Type <span className="text-destructive">*</span></Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleTypes.map((t) => {
                const active = accountType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAccountType(t.id)}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                      active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input hover:border-primary/50"
                    }`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                      <t.icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="flex items-center gap-1.5 font-medium">
                        {t.name}
                        {active && <Check className="h-4 w-4 text-primary" />}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{t.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {showMore ? "Show fewer account types" : "Show more account types"}
              <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? "rotate-180" : ""}`} />
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin">Transaction PIN (4 digits) <span className="text-destructive">*</span></Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="pin"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                className="h-11 pl-9 pr-10 tracking-[0.5em]"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-sm text-muted-foreground">Your PIN will be required to authorize transactions</p>
          </div>
        </div>
      )}

      {step === 2 && (
        <label className="mt-5 flex items-start gap-3 text-sm text-muted-foreground">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I agree to the <Link to="/terms" className="text-primary underline">Terms of Service</Link> and <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>, and confirm my details are accurate.</span>
        </label>
      )}

      {error && <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className={`mt-6 flex gap-3 ${step > 0 ? "" : ""}`}>
        {step > 0 && (
          <Button type="button" variant="outline" size="lg" className="h-11 flex-1" onClick={() => { setError(null); setStep(step - 1); }} disabled={loading}>
            Back
          </Button>
        )}
        {step < 2 ? (
          <Button type="button" size="lg" className="h-11 flex-1" onClick={next}>Continue</Button>
        ) : (
          <Button type="button" size="lg" className="h-11 flex-1" disabled={loading} onClick={submit}>
            {loading ? "Please wait…" : "Create account"}
          </Button>
        )}
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Already a customer? <Link to="/login" className="text-primary underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {type === "password" ? (
        <PasswordInput id={id} autoComplete={autoComplete} required value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input id={id} type={type} autoComplete={autoComplete} required className="h-11" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AuthShell, StatusIcon } from "@/components/AuthShell";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ShieldCheck } from "lucide-react";
import { AuthForm } from "@/components/AuthForm";
import { Button } from "@/components/ui/button";
import { loginUser, verifyLoginCode, resendVerification } from "@/lib/auth.functions";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Universal Crest" },
      { name: "description", content: "Sign in to Universal Crest online banking." },
      { property: "og:title", content: "Sign in — Universal Crest" },
      { property: "og:description", content: "Sign in to Universal Crest online banking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const login = useServerFn(loginUser);
  const verify = useServerFn(verifyLoginCode);
  const resend = useServerFn(resendVerification);
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  if (pending) return <CodeStep token={pending} onBack={() => setPending(null)} onDone={(admin) => navigate({ to: admin ? "/admin" : "/account" })} verify={verify} />;

  return (
    <AuthShell title="Welcome back" subtitle="Sign in securely to Universal Crest online banking.">
      <AuthForm
        submitLabel="Sign in"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
        onSubmit={async (v) => {
          setUnverified(null);
          const res = await login({ data: { email: v.email, password: v.password } });
          if (!res.ok) {
            if (res.error.startsWith("Please confirm")) setUnverified(v.email);
            return res.error;
          }
          if (res.twoFactor) { setPending(res.pendingToken); return null; }
          navigate({ to: res.isAdmin ? "/admin" : "/account" });
          return null;
        }}
      />
      {unverified && (
        <Button variant="outline" className="mt-4 h-11 w-full" disabled={resent} onClick={async () => { await resend({ data: { email: unverified } }); setResent(true); }}>
          {resent ? "Confirmation email sent" : "Resend confirmation email"}
        </Button>
      )}
      <p className="mt-6 text-sm"><Link to="/forgot-password" className="text-primary underline">Forgot your password?</Link></p>
      <p className="mt-3 text-sm text-muted-foreground">
        New to Universal Crest? <Link to="/register" className="text-primary underline">Open an account</Link>
      </p>
    </AuthShell>
  );
}

function CodeStep({ token, onBack, onDone, verify }: {
  token: string;
  onBack: () => void;
  onDone: (isAdmin: boolean) => void;
  verify: ReturnType<typeof useServerFn<typeof verifyLoginCode>>;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(value = code) {
    if (!/^\d{6}$/.test(value)) return setError("Enter all 6 digits.");
    setError(null);
    setLoading(true);
    try {
      const r = await verify({ data: { token, code: value } });
      if (!r.ok) { setError(r.error); setCode(""); }
      else onDone(r.isAdmin);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      icon={<StatusIcon tone="primary"><ShieldCheck /></StatusIcon>}
      title="Verify it's you"
      subtitle="For your security, we emailed a 6-digit code to your registered address. It expires in 10 minutes."
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <InputOTP maxLength={6} value={code} autoFocus onChange={(v) => { setCode(v.replace(/\D/g, "")); if (v.length === 6) submit(v); }} containerClassName="justify-between">
          <InputOTPGroup>
            {[0, 1, 2].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />)}
          </InputOTPGroup>
          <InputOTPGroup>
            {[3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />)}
          </InputOTPGroup>
        </InputOTP>
        {error && <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="mt-6 h-11 w-full" disabled={loading}>
          {loading ? "Verifying…" : "Verify and sign in"}
        </Button>
      </form>
      <p className="mt-4 text-xs text-muted-foreground">Didn't get it? Check spam, or go back and sign in again for a new code.</p>
      <Button variant="link" className="mt-2 px-0" onClick={onBack}>← Back to sign in</Button>
    </AuthShell>
  );
}

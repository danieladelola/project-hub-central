import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { AuthShell, StatusIcon } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { verifyEmail } from "@/lib/auth.functions";

export const Route = createFileRoute("/verify-email")({
  ssr: false,
  validateSearch: z.object({ token: z.string().optional() }),
  head: () => ({ meta: [{ title: "Confirm email — Universal Crest" }, { name: "robots", content: "noindex" }] }),
  component: VerifyPage,
});

function VerifyPage() {
  const { token } = Route.useSearch();
  const verify = useServerFn(verifyEmail);
  const [status, setStatus] = useState<"loading" | "ok" | "fail">("loading");

  useEffect(() => {
    if (!token) return setStatus("fail");
    verify({ data: { token } }).then((r) => setStatus(r.ok ? "ok" : "fail")).catch(() => setStatus("fail"));
  }, [token]);

  if (status === "loading")
    return <AuthShell icon={<StatusIcon tone="primary"><Loader2 className="animate-spin" /></StatusIcon>} title="Confirming your email" subtitle="This only takes a moment." >{null}</AuthShell>;

  if (status === "ok")
    return (
      <AuthShell icon={<StatusIcon tone="success"><CheckCircle2 /></StatusIcon>} title="Email confirmed" subtitle="Your Universal Crest account is now active.">
        <ol className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
          <li><strong>1.</strong> Sign in with your email and password.</li>
          <li><strong>2.</strong> Enter the 6-digit code we email you.</li>
          <li><strong>3.</strong> Verify your identity to unlock all features.</li>
        </ol>
        <Button asChild size="lg" className="mt-6 h-11 w-full"><Link to="/login">Sign in to your account</Link></Button>
      </AuthShell>
    );

  return (
    <AuthShell icon={<StatusIcon tone="destructive"><XCircle /></StatusIcon>} title="This link has expired" subtitle="The confirmation link is invalid or has already been used.">
      <p className="text-sm text-muted-foreground">If you've already confirmed, just sign in. Otherwise, sign in and we'll offer to send a fresh link.</p>
      <Button asChild size="lg" className="mt-6 h-11 w-full"><Link to="/login">Go to sign in</Link></Button>
      <Button asChild variant="link" className="mt-2 w-full"><Link to="/support">Contact support</Link></Button>
    </AuthShell>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { requestPasswordReset } from "@/lib/auth.functions";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot password — Universal Crest" },
      { name: "description", content: "Reset your Universal Crest online banking password." },
      { property: "og:title", content: "Forgot password — Universal Crest" },
      { property: "og:description", content: "Reset your Universal Crest online banking password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPage,
});

function ForgotPage() {
  const request = useServerFn(requestPasswordReset);
  const [sent, setSent] = useState(false);
  return (
    <AuthShell title="Forgot password" subtitle={sent ? "If that email has an account, a reset link is on its way. Check your inbox." : "Enter your email and we'll send you a reset link."}>
      {!sent && (
        <AuthForm
          submitLabel="Send reset link"
          fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
          onSubmit={async (v) => {
            await request({ data: { email: v.email } });
            setSent(true);
            return null;
          }}
        />
      )}
      <p className="mt-6 text-sm text-muted-foreground"><Link to="/login" className="text-primary underline">Back to sign in</Link></p>
    </AuthShell>
  );
}

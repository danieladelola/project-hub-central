import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { Button } from "@/components/ui/button";
import { resetPassword } from "@/lib/auth.functions";
import { errText } from "@/components/AccountPage";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  validateSearch: z.object({ token: z.string().optional() }),
  head: () => ({ meta: [{ title: "Set a new password — Universal Crest" }, { name: "robots", content: "noindex" }] }),
  component: ResetPage,
});

function ResetPage() {
  const { token } = Route.useSearch();
  const reset = useServerFn(resetPassword);
  const [done, setDone] = useState(false);
  if (!token) return <AuthShell title="Link not valid" subtitle="This reset link is missing or broken."><Button asChild className="h-11 w-full"><Link to="/forgot-password">Request a new link</Link></Button></AuthShell>;
  if (done) return <AuthShell title="Password updated" subtitle="You can now sign in with your new password."><Button asChild className="h-11 w-full"><Link to="/login">Go to sign in</Link></Button></AuthShell>;
  return (
    <AuthShell title="Set a new password" subtitle="At least 8 characters with an uppercase letter, a number and a special character.">
      <AuthForm
        submitLabel="Update password"
        fields={[
          { name: "password", label: "New password", type: "password", autoComplete: "new-password" },
          { name: "confirm", label: "Confirm new password", type: "password", autoComplete: "new-password" },
        ]}
        onSubmit={async (v) => {
          const vals = v as unknown as { password: string; confirm: string };
          if (vals.password !== vals.confirm) return "Passwords don't match.";
          try {
            const r = await reset({ data: { token, password: vals.password } });
            if (!r.ok) return r.error;
            setDone(true);
            return null;
          } catch (e) { return errText(e); }
        }}
      />
    </AuthShell>
  );
}

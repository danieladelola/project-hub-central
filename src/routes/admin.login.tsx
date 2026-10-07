import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { loginAdmin } from "@/lib/auth.functions";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Staff sign in — Universal Crest" },
      { name: "description", content: "Administrator access for Universal Crest staff." },
      { property: "og:title", content: "Staff sign in — Universal Crest" },
      { property: "og:description", content: "Administrator access for Universal Crest staff." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const login = useServerFn(loginAdmin);
  const navigate = useNavigate();
  return (
    <AuthShell badge="Administrator" title="Staff sign in" subtitle="Restricted to authorised personnel.">
      <AuthForm
        submitLabel="Sign in as admin"
        fields={[
          { name: "email", label: "Admin email", type: "email", autoComplete: "username" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
        onSubmit={async (v) => {
          const res = await login({ data: { email: v.email, password: v.password } });
          if (!res.ok) return res.error;
          navigate({ to: "/admin" });
          return null;
        }}
      />
    </AuthShell>
  );
}

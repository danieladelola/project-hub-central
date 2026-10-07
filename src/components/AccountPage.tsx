import type { ReactNode } from "react";
import { SignedInShell } from "@/components/SignedIn";
import { KycGate } from "@/components/KycGate";

export function AccountPage({ title, subtitle, children, wide = false, actions, requireKyc = false }: { title: string; subtitle?: string | undefined; children: ReactNode; wide?: boolean; actions?: ReactNode; requireKyc?: boolean }) {
  return (
    <SignedInShell title={title} subtitle={subtitle} actions={actions} wide={wide}>
      <div className="space-y-6">{requireKyc ? <KycGate>{children}</KycGate> : children}</div>
    </SignedInShell>
  );
}

export function Panel({ title, description, children }: { title: string; description?: string | undefined; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="font-sans text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>;
}

export function errText(e: unknown) {
  if (e instanceof Error) {
    try {
      const parsed = JSON.parse(e.message);
      if (Array.isArray(parsed) && parsed[0]?.message) return parsed[0].message as string;
    } catch { /* not zod */ }
    return e.message;
  }
  return "Something went wrong. Please try again.";
}

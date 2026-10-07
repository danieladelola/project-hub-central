import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getKycAccess } from "@/lib/kyc.functions";

export function KycGate({ children }: { children: ReactNode }) {
  const check = useServerFn(getKycAccess);
  const [state, setState] = useState<{ verified: boolean; status: string } | null>(null);
  useEffect(() => { check().then(setState).catch(() => setState({ verified: false, status: "unknown" })); }, [check]);

  if (!state) return <div className="h-40 animate-pulse rounded-lg border bg-muted/40" />;
  if (state.verified) return <>{children}</>;

  const pending = state.status === "submitted" || state.status === "under_review" || state.status === "pending";
  return (
    <section className="mx-auto max-w-xl rounded-lg border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        {pending ? <Clock className="size-7" /> : <ShieldAlert className="size-7" />}
      </div>
      <h2 className="mt-4 font-sans text-xl font-semibold">{pending ? "Verification under review" : "Identity verification required"}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {pending
          ? "Thanks for submitting your documents. This feature unlocks as soon as our team approves your verification."
          : "To keep your money safe, this feature is available only after your identity (KYC) has been verified and approved by our team."}
      </p>
      <Button asChild className="mt-6"><Link to="/kyc">{pending ? "View verification status" : "Verify my identity"}</Link></Button>
    </section>
  );
}

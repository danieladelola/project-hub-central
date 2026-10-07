import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Eye, KeyRound, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { FeatureGrid, PageShell, Eyebrow, SectionHead } from "@/components/site/Site";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/security")({
  head: () => ({ meta: [
    { title: "Security Centre — Universal Crest" },
    { name: "description", content: "Learn how Universal Crest protects accounts and how to recognize and report scams or suspicious activity." },
    { property: "og:title", content: "Security Centre — Universal Crest" },
    { property: "og:description", content: "Protect your Universal Crest account and report suspicious activity." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <PageShell>
      <section className="bg-ink text-ink-foreground">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <Eyebrow light>Security centre</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight sm:text-5xl md:text-6xl">Your security is part of every transaction.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-ink-foreground/75 sm:text-lg">Learn how we help protect your account and the practical steps you can take to bank safely.</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <SectionHead eyebrow="Protection" title="How we protect your account" />
        <div className="mt-10"><FeatureGrid items={[
          { icon: <LockKeyhole />, title: "Secure access", text: "Protected sign-in and email verification help prevent unauthorized account access." },
          { icon: <Eye />, title: "Activity monitoring", text: "Security controls help identify unusual access and transaction patterns." },
          { icon: <ShieldCheck />, title: "Data safeguards", text: "Sensitive information is protected using layered technical and operational controls." },
        ]} /></div>
      </section>
      <section className="bg-secondary py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHead eyebrow="Stay safe" title="Simple habits make a difference" />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: <KeyRound />, title: "Use a unique password", text: "Choose a long password you do not use elsewhere. Never share it with anyone." },
              { icon: <Smartphone />, title: "Protect your devices", text: "Keep software current, use a screen lock and avoid banking on shared devices." },
              { icon: <AlertTriangle />, title: "Pause before acting", text: "Be cautious of urgent requests, unexpected links and callers asking for security details." },
            ].map((item) => <div key={item.title} className="rounded-lg border bg-card p-6"><div className="text-primary [&_svg]:h-7 [&_svg]:w-7">{item.icon}</div><h3 className="mt-4 text-2xl">{item.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p></div>)}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="border-l-4 border-primary bg-secondary p-6 sm:p-8">
          <h2 className="text-2xl sm:text-3xl">Think something is wrong?</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">Stop communicating with the suspected sender, do not approve further requests, and contact us immediately. Include only the details needed to identify the activity—never send your password or PIN.</p>
          <Button asChild size="lg" className="mt-6 w-full sm:w-auto"><a href="mailto:support@universalcrest.vip?subject=Urgent%20security%20report">Report suspicious activity</a></Button>
        </div>
      </section>
    </PageShell>
  );
}
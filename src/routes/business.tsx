import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Building2, Globe2, Landmark, Users, Wallet } from "lucide-react";
import { PageShell, PageHero, SectionHead, FeatureGrid, ProductCards } from "@/components/site/Site";
import img from "@/assets/business.jpg";

export const Route = createFileRoute("/business")({
  head: () => ({
    meta: [
      { title: "Business Banking — Universal Crest" },
      { name: "description", content: "Business accounts, payments, payroll and financing from Universal Crest." },
      { property: "og:title", content: "Business Banking — Universal Crest" },
      { property: "og:description", content: "Business accounts, payments, payroll and financing." },
    ],
  }),
  component: () => (
    <PageShell>
      <PageHero eyebrow="Business banking" title="Banking that grows with your business" text="From your first invoice to international expansion, get accounts, payments and financing built for business." image={img} />
      <section className="mx-auto max-w-6xl px-6 py-24">
        <SectionHead eyebrow="Built for business" title="Everything your business needs" />
        <div className="mt-12">
          <FeatureGrid items={[
            { icon: <Wallet />, title: "Business accounts", text: "Multi-user access, clear statements and real-time balances." },
            { icon: <Globe2 />, title: "International payments", text: "Pay suppliers and receive payments in multiple currencies." },
            { icon: <Users />, title: "Payroll", text: "Pay your team on time with bulk and scheduled payments." },
            { icon: <BarChart3 />, title: "Cash-flow insights", text: "Reporting and dashboards that show where your money goes." },
            { icon: <Landmark />, title: "Business lending", text: "Working capital, equipment finance and credit lines." },
            { icon: <Building2 />, title: "Merchant services", text: "Accept card payments in-store and online with next-day settlement." },
          ]} />
        </div>
      </section>
      <section className="bg-secondary py-24">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHead center eyebrow="Accounts" title="Choose your business account" />
          <div className="mt-12">
            <ProductCards items={[
              { name: "Starter", tag: "Sole traders", text: "Simple banking for freelancers and new businesses.", points: ["No monthly fee", "Free local transfers", "Virtual debit card"] },
              { name: "Growth", tag: "Most popular", text: "For growing teams that need more control.", points: ["Up to 10 team cards", "Multi-currency wallets", "Accounting integrations", "Priority support"] },
              { name: "Enterprise", tag: "Large companies", text: "Tailored banking with a dedicated relationship manager.", points: ["Custom limits", "Treasury services", "Dedicated manager"] },
            ]} />
          </div>
        </div>
      </section>
    </PageShell>
  ),
});

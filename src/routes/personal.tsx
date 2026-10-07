import { createFileRoute } from "@tanstack/react-router";
import { Bell, PiggyBank, Send, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { PageShell, PageHero, SectionHead, FeatureGrid, ProductCards } from "@/components/site/Site";
import img from "@/assets/personal-hero.jpg";

export const Route = createFileRoute("/personal")({
  head: () => ({
    meta: [
      { title: "Personal Banking — Universal Crest" },
      { name: "description", content: "Current accounts, savings and transfers for everyday life with Universal Crest." },
      { property: "og:title", content: "Personal Banking — Universal Crest" },
      { property: "og:description", content: "Current accounts, savings and transfers for everyday life." },
    ],
  }),
  component: () => (
    <PageShell>
      <PageHero eyebrow="Personal banking" title="Everyday banking, made effortless" text="Spend, save and send money with accounts designed around your life." image={img} />
      <section className="mx-auto max-w-6xl px-6 py-24">
        <SectionHead eyebrow="Why Universal Crest" title="Banking that fits in your pocket" />
        <div className="mt-12">
          <FeatureGrid items={[
            { icon: <Wallet />, title: "Current accounts", text: "A full-featured account with a debit card and no hidden fees." },
            { icon: <PiggyBank />, title: "Savings", text: "Flexible and fixed-term savings with competitive rates." },
            { icon: <Send />, title: "Global transfers", text: "Send money abroad quickly with clear exchange rates." },
            { icon: <Smartphone />, title: "Mobile banking", text: "Manage everything from your phone, any time." },
            { icon: <Bell />, title: "Instant alerts", text: "Know the moment money moves in or out of your account." },
            { icon: <ShieldCheck />, title: "Protected", text: "Fraud monitoring and secure sign-in keep your money safe." },
          ]} />
        </div>
      </section>
      <section className="bg-secondary py-24">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHead center eyebrow="Accounts" title="Pick the account that suits you" />
          <div className="mt-12">
            <ProductCards items={[
              { name: "Everyday", tag: "Current account", text: "All the essentials for daily spending.", points: ["Free debit card", "Free local transfers", "Mobile & online banking"] },
              { name: "Premier", tag: "Most popular", text: "Extra benefits for people who want more.", points: ["Premium metal card", "Fee-free foreign spending", "Travel insurance", "Priority support"] },
              { name: "Savings", tag: "Grow your money", text: "Put money aside and watch it grow.", points: ["Competitive interest", "Instant access option", "Goal tracking"] },
            ]} />
          </div>
        </div>
      </section>
    </PageShell>
  ),
});

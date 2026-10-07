import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Gift, Globe2, Lock, Plane, Smartphone } from "lucide-react";
import { PageShell, PageHero, SectionHead, FeatureGrid, ProductCards } from "@/components/site/Site";
import img from "@/assets/card.jpg";

export const Route = createFileRoute("/credit-cards")({
  head: () => ({
    meta: [
      { title: "Credit Cards — Universal Crest" },
      { name: "description", content: "Rewards, travel and everyday credit cards from Universal Crest." },
      { property: "og:title", content: "Credit Cards — Universal Crest" },
      { property: "og:description", content: "Rewards, travel and everyday credit cards." },
    ],
  }),
  component: () => (
    <PageShell>
      <PageHero eyebrow="Credit cards" title="A card for every way you spend" text="Earn rewards, travel further and stay in control with Universal Crest credit cards." image={img} />
      <section className="bg-secondary py-24">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHead center eyebrow="Our cards" title="Find your card" />
          <div className="mt-12">
            <ProductCards items={[
              { name: "Classic", tag: "Everyday", text: "A simple card for daily purchases.", points: ["No annual fee", "Contactless payments", "Virtual card instantly"] },
              { name: "Crest Metal", tag: "Premium", text: "Our premium metal card with exclusive benefits.", points: ["Airport lounge access", "Travel insurance", "Concierge service", "Higher rewards"] },
              { name: "Rewards", tag: "Cashback", text: "Earn on everything you buy.", points: ["Cashback on all spend", "Bonus categories", "Redeem any time"] },
            ]} />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-24">
        <SectionHead eyebrow="Card benefits" title="More than just a card" />
        <div className="mt-12">
          <FeatureGrid items={[
            { icon: <Gift />, title: "Rewards", text: "Earn points or cashback with every purchase." },
            { icon: <Plane />, title: "Travel perks", text: "Fee-free spending abroad and travel protection." },
            { icon: <Lock />, title: "Freeze & unfreeze", text: "Lock your card instantly from the app." },
            { icon: <Smartphone />, title: "Mobile wallets", text: "Pay with your phone or watch." },
            { icon: <Globe2 />, title: "Accepted worldwide", text: "Use your card in millions of places." },
            { icon: <CreditCard />, title: "Virtual cards", text: "Shop online safely with a separate virtual number." },
          ]} />
        </div>
      </section>
    </PageShell>
  ),
});

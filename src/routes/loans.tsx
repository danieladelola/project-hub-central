import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Car, GraduationCap, Home, Briefcase } from "lucide-react";
import { PageShell, PageHero, SectionHead, FeatureGrid } from "@/components/site/Site";
import { Label } from "@/components/ui/label";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import img from "@/assets/loans.jpg";

export const Route = createFileRoute("/loans")({
  head: () => ({
    meta: [
      { title: "Loans — Universal Crest" },
      { name: "description", content: "Personal, home, auto and business loans from Universal Crest, with a simple repayment calculator." },
      { property: "og:title", content: "Loans — Universal Crest" },
      { property: "og:description", content: "Personal, home, auto and business loans." },
    ],
  }),
  component: LoansPage,
});

function LoansPage() {
  const [amount, setAmount] = useState(20000);
  const [years, setYears] = useState(5);
  const rate = 0.089;
  const r = rate / 12, n = years * 12;
  const monthly = (amount * r) / (1 - Math.pow(1 + r, -n));
  return (
    <PageShell>
      <PageHero eyebrow="Loans" title="Borrow with confidence" text="Clear rates, flexible terms and fast decisions — for life's big moments." image={img} />
       <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <SectionHead eyebrow="Loan types" title="A loan for every plan" />
        <div className="mt-12">
          <FeatureGrid items={[
            { icon: <Briefcase />, title: "Personal loans", text: "Fund what matters with fixed monthly repayments." },
            { icon: <Home />, title: "Mortgages", text: "Buy your home or remortgage with competitive rates." },
            { icon: <Car />, title: "Auto loans", text: "Drive away sooner with flexible car finance." },
            { icon: <GraduationCap />, title: "Education loans", text: "Invest in your future with student-friendly terms." },
          ]} />
        </div>
      </section>
       <section className="bg-ink py-16 sm:py-24">
         <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-2 md:gap-12">
          <SectionHead light eyebrow="Loan calculator" title="Estimate your monthly repayment" text="Example based on a representative 8.9% APR. Your actual rate depends on your circumstances." />
           <div className="min-w-0 rounded-lg bg-card p-5 text-card-foreground sm:p-8">
            <Label>Loan amount: ${amount.toLocaleString()}</Label>
            <input type="range" min={1000} max={200000} step={1000} value={amount} onChange={(e) => setAmount(+e.target.value)} className="mt-3 w-full accent-[var(--primary)]" />
            <Label className="mt-6 block">Term: {years} years</Label>
            <input type="range" min={1} max={30} value={years} onChange={(e) => setYears(+e.target.value)} className="mt-3 w-full accent-[var(--primary)]" />
            <div className="mt-8 rounded-lg bg-secondary p-6">
              <p className="text-sm text-muted-foreground">Estimated monthly repayment</p>
               <p className="mt-1 break-all font-display text-3xl text-primary sm:text-5xl">${monthly.toFixed(2)}</p>
            </div>
            <Button asChild className="mt-6 w-full"><Link to="/loan-request">Apply for a loan</Link></Button>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

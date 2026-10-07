import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageCircle, ShieldAlert } from "lucide-react";
import { PageShell, SectionHead, Eyebrow } from "@/components/site/Site";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Universal Crest" },
      { name: "description", content: "Get help with your Universal Crest account, cards, transfers and online banking." },
      { property: "og:title", content: "Support — Universal Crest" },
      { property: "og:description", content: "Get help with your account, cards, transfers and online banking." },
    ],
  }),
  component: SupportPage,
});

const faqs = [
  { q: "How do I open an account?", a: "Click 'Open account', fill in your details and confirm your email address. You can then sign in to online banking." },
  { q: "I didn't receive my confirmation email.", a: "Check your spam or junk folder. If it's still missing, email support@universalcrest.vip and we'll help." },
  { q: "How do I reset my password?", a: "Contact our support team from the email address on your account and we'll guide you through resetting it." },
  { q: "How long do international transfers take?", a: "Most transfers arrive within 24 hours, depending on the destination country and receiving bank." },
  { q: "What should I do if my card is lost or stolen?", a: "Contact us immediately so we can block your card and send you a replacement." },
];

function SupportPage() {
  return (
    <PageShell>
      <section className="bg-secondary">
         <div className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6 sm:py-20">
          <Eyebrow>Support centre</Eyebrow>
           <h1 className="mt-4 text-4xl leading-tight sm:text-5xl md:text-6xl">How can we help?</h1>
          <p className="mx-auto mt-5 max-w-lg text-lg text-muted-foreground">Find answers to common questions or reach our team directly.</p>
        </div>
      </section>
       <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-3">
        {[
          { icon: <Mail />, t: "Email us", d: "support@universalcrest.vip", href: "mailto:support@universalcrest.vip" },
          { icon: <MessageCircle />, t: "General enquiries", d: "We aim to reply within one business day.", href: "mailto:support@universalcrest.vip?subject=Enquiry" },
          { icon: <ShieldAlert />, t: "Report fraud", d: "Suspicious activity? Contact us right away.", href: "mailto:support@universalcrest.vip?subject=Fraud%20report" },
        ].map((c) => (
           <a key={c.t} href={c.href} className="min-w-0 rounded-lg border bg-card p-6 transition-shadow hover:shadow-lg sm:p-8">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-secondary text-primary">{c.icon}</div>
            <h3 className="mt-5 text-2xl">{c.t}</h3>
             <p className="mt-2 break-words text-sm text-muted-foreground">{c.d}</p>
          </a>
        ))}
      </section>
       <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 sm:pb-24">
        <SectionHead center eyebrow="FAQ" title="Frequently asked questions" />
        <Accordion type="single" collapsible className="mt-10">
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`f${i}`}>
              <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </PageShell>
  );
}

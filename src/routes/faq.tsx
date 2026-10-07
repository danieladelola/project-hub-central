import { createFileRoute } from "@tanstack/react-router";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageShell, Eyebrow } from "@/components/site/Site";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Frequently Asked Questions — Universal Crest" },
      { name: "description", content: "Answers to common questions about Universal Crest accounts, sign-in, transfers, cards, loans and support." },
      { property: "og:title", content: "Frequently Asked Questions — Universal Crest" },
      { property: "og:description", content: "Find answers about Universal Crest accounts, transfers, cards and online banking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FaqPage,
});

const groups = [
  {
    title: "Accounts and access",
    questions: [
      ["How do I open an account?", "Select Open account, enter your personal details, choose your country and state, then confirm your email address before signing in."],
      ["Why do I need to confirm my email?", "Email confirmation helps us verify that the address belongs to you and protects your new account from unauthorized access."],
      ["I did not receive my confirmation email. What should I do?", "Check your spam or junk folder first. If it is still missing, contact support@universalcrest.vip from the email address used to register."],
      ["How do I reset my password?", "Contact our support team from the email address registered to your account. We will guide you through the secure recovery process."],
    ],
  },
  {
    title: "Transfers and cards",
    questions: [
      ["How long do international transfers take?", "Transfer times vary by destination, receiving institution and required checks. The final delivery estimate is shown before you confirm a transfer."],
      ["What should I do if my card is lost or stolen?", "Contact us immediately so the card can be blocked. Review recent transactions and report anything you do not recognize."],
      ["Why might a card payment be declined?", "A payment may be declined because of an incorrect PIN, account limits, security checks or insufficient available funds. Contact support if the reason is unclear."],
      ["Are exchange rates guaranteed?", "Displayed rates are indicative. Your final rate and any applicable fee are confirmed before a currency exchange or transfer is completed."],
    ],
  },
  {
    title: "Loans and support",
    questions: [
      ["How is a loan decision made?", "Eligibility and pricing depend on the information provided, affordability checks and applicable lending criteria. An estimate is not a guaranteed offer."],
      ["How can I report suspicious activity?", "Email support@universalcrest.vip immediately with the subject Fraud report. Never include your password, PIN or full security credentials."],
      ["When is support available?", "You can email us at any time. General enquiries are normally answered within one business day, while urgent security reports are prioritized."],
    ],
  },
];

function FaqPage() {
  return (
    <PageShell>
      <section className="bg-secondary">
        <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-6 sm:py-20">
          <Eyebrow>Help centre</Eyebrow>
          <h1 className="mt-4 text-4xl leading-tight sm:text-5xl md:text-6xl">Frequently asked questions</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">Quick answers about your account, payments, cards and keeping your money safe.</p>
        </div>
      </section>
      <section className="mx-auto max-w-3xl space-y-12 px-4 py-14 sm:px-6 sm:py-20">
        {groups.map((group) => (
          <div key={group.title}>
            <h2 className="text-2xl sm:text-3xl">{group.title}</h2>
            <Accordion type="single" collapsible className="mt-5">
              {group.questions.map(([question, answer], index) => (
                <AccordionItem key={question} value={`${group.title}-${index}`}>
                  <AccordionTrigger className="min-h-14 text-left text-sm leading-6 sm:text-base">{question}</AccordionTrigger>
                  <AccordionContent className="pr-6 text-sm leading-7 text-muted-foreground sm:text-base">{answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </section>
    </PageShell>
  );
}
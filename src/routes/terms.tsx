import { createFileRoute } from "@tanstack/react-router";
import { InformationPage } from "@/components/site/InformationPage";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [
    { title: "Terms & Conditions — Universal Crest" },
    { name: "description", content: "Terms governing access to and use of Universal Crest accounts, products and digital services." },
    { property: "og:title", content: "Terms & Conditions — Universal Crest" },
    { property: "og:description", content: "Terms for using Universal Crest accounts, products and digital services." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <InformationPage
    eyebrow="Legal"
    title="Terms & Conditions"
    intro="These general terms govern your access to Universal Crest's website, online banking and available products. Product-specific terms may also apply."
    updated="October 5, 2026"
    sections={[
      { title: "Eligibility and account information", body: "You must provide accurate, complete and current information and meet the eligibility requirements for the product you request. We may ask for additional information to verify identity, assess eligibility or meet legal obligations." },
      { title: "Using our services", items: ["Use your account only for lawful purposes and in accordance with applicable product limits.", "Do not allow another person to use your sign-in details or misrepresent your identity.", "Review transaction details before confirming an instruction and tell us promptly about errors.", "Do not interfere with, copy, misuse or attempt unauthorized access to our services."] },
      { title: "Payments and transactions", body: "We may decline, delay or review an instruction when information is incomplete, funds are unavailable, limits apply or a legal, compliance or security concern arises. Exchange rates, fees and expected timing should be shown before a transaction is confirmed." },
      { title: "Fees and interest", body: "Any applicable fees, interest rates and charges will be disclosed in the relevant product information or before you complete a transaction. Rates and charges may change where permitted, with notice when required." },
      { title: "Your security responsibilities", body: "Keep passwords, PINs and security codes secret; use accurate contact details; review account activity; and report a lost device, card or suspected compromise immediately. We will never ask you to disclose your complete password by email." },
      { title: "Restrictions and account closure", body: "We may restrict, suspend or close access where required by law, where fraud or misuse is suspected, where information cannot be verified, or where these terms are materially breached. You may request account closure subject to pending transactions and other obligations." },
      { title: "Service availability and liability", body: "We work to keep services secure and available, but interruptions may occur for maintenance, outages or events outside reasonable control. Nothing in these terms excludes responsibility that cannot legally be excluded." },
      { title: "Changes and contact", body: <>We may update these terms to reflect service, legal or security changes and will provide notice where required. Questions can be sent to <a className="font-semibold text-primary underline" href="mailto:support@universalcrest.vip">support@universalcrest.vip</a>.</> },
    ]}
  />,
});
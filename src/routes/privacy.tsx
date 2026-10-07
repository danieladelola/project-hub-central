import { createFileRoute } from "@tanstack/react-router";
import { InformationPage } from "@/components/site/InformationPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [
    { title: "Privacy Policy — Universal Crest" },
    { name: "description", content: "How Universal Crest collects, uses, protects and retains personal information." },
    { property: "og:title", content: "Privacy Policy — Universal Crest" },
    { property: "og:description", content: "How Universal Crest handles and protects personal information." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <InformationPage
    eyebrow="Legal"
    title="Privacy Policy"
    intro="This policy explains what personal information Universal Crest collects, why we use it and the choices available to you."
    updated="October 5, 2026"
    sections={[
      { title: "Information we collect", body: "We collect information you provide when opening or using an account, contacting support or applying for a product.", items: ["Identity and contact details, including your name, email address, telephone number, country and state.", "Account, transaction and payment information needed to provide banking services.", "Device, browser, sign-in and security information used to protect accounts and prevent fraud.", "Messages and records created when you communicate with our support team."] },
      { title: "How we use information", items: ["To provide, administer and improve accounts, payments, cards, loans and support.", "To verify identity, secure access, monitor fraud and comply with legal obligations.", "To communicate service notices and respond to your requests.", "To understand service performance and maintain reliable digital experiences."] },
      { title: "When information is shared", body: "We do not sell personal information. We may share only what is necessary with payment networks, service providers, professional advisers, regulators or law enforcement where authorized or required. Providers must protect the information entrusted to them." },
      { title: "Security and retention", body: "We use administrative, technical and organizational safeguards appropriate to the sensitivity of the information. Records are kept only as long as needed to provide services, resolve disputes, prevent fraud and meet legal or regulatory requirements." },
      { title: "Your choices and rights", body: "Depending on where you live, you may ask to access, correct, delete, restrict or receive a copy of your personal information, or object to certain uses. Some records must be retained for legal and security reasons." },
      { title: "Cookies and digital services", body: "Our website may use essential browser storage and similar technologies to operate sign-in, security and preferences. Optional analytics or marketing technologies, if introduced, will be described through an appropriate notice or choice." },
      { title: "Contact us", body: <>For privacy questions or requests, email <a className="font-semibold text-primary underline" href="mailto:support@universalcrest.vip">support@universalcrest.vip</a>. We may need to verify your identity before completing a request.</> },
    ]}
  />,
});
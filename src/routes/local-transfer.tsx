import { createFileRoute } from "@tanstack/react-router";
import { ExternalTransferPage } from "@/components/ExternalTransfer";

export const Route = createFileRoute("/local-transfer")({
  ssr: false,
  head: () => ({ meta: [{ title: "Local Transfer — Universal Crest" }, { name: "description", content: "Send money to accounts at other local banks." }, { property: "og:title", content: "Local Transfer — Universal Crest" }, { property: "og:description", content: "Send money to accounts at other local banks." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => <ExternalTransferPage kind="local" />,
});

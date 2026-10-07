import { createFileRoute } from "@tanstack/react-router";
import { ExternalTransferPage } from "@/components/ExternalTransfer";

export const Route = createFileRoute("/wire")({
  ssr: false,
  head: () => ({ meta: [{ title: "International Wire — Universal Crest" }, { name: "description", content: "Send international SWIFT wire transfers worldwide." }, { property: "og:title", content: "International Wire — Universal Crest" }, { property: "og:description", content: "Send international SWIFT wire transfers worldwide." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => <ExternalTransferPage kind="wire" />,
});

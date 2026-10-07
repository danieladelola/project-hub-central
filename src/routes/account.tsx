import { createFileRoute } from "@tanstack/react-router";
import { SignedIn } from "@/components/SignedIn";

export const Route = createFileRoute("/account")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard — Universal Crest" },
      { name: "description", content: "View your Universal Crest online banking dashboard." },
      { property: "og:title", content: "Dashboard — Universal Crest" },
      { property: "og:description", content: "View your Universal Crest online banking dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <SignedIn />,
});

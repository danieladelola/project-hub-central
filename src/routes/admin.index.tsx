import { createFileRoute } from "@tanstack/react-router";
import { SignedIn } from "@/components/SignedIn";

export const Route = createFileRoute("/admin/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin — Universal Crest" }, { name: "robots", content: "noindex" }] }),
  component: () => <SignedIn requireAdmin />,
});

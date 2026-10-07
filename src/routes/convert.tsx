import { createFileRoute, redirect } from "@tanstack/react-router";

// Only US Dollar accounts exist, so currency conversion is no longer offered.
export const Route = createFileRoute("/convert")({
  beforeLoad: () => { throw redirect({ to: "/send" }); },
});

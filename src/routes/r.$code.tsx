import { createFileRoute } from "@tanstack/react-router";
import { App } from "@/components/app";

export const Route = createFileRoute("/r/$code")({
  component: Invite,
});

function Invite() {
  const { code } = Route.useParams();
  return <App invite={code} />;
}

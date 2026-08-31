import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/suno-hook")({
  server: {
    handlers: {
      POST: async () => {
        return Response.json({ status: "received" });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { mintToken, sessionCookie, verifyLaunchParams, vkConfigured } from "@/lib/vk/session.server";
import { readWallet } from "@/lib/notes-db.server";

export const Route = createFileRoute("/api/vk-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { search?: string; name?: string } = {};
        try {
          body = (await request.json()) as { search?: string; name?: string };
        } catch {
          body = {};
        }
        const launch = verifyLaunchParams(body.search ?? "");
        let vkId = launch?.vkId ?? "";
        let name = (body.name ?? launch?.name ?? "").slice(0, 40);
        if (!vkId) {
          if (vkConfigured() || process.env.DATABASE_URL?.trim()) {
            return Response.json({ ok: false, error: "Нужен вход через VK." }, { status: 401 });
          }
          vkId = "preview";
          name = name || "превью";
        }
        const token = mintToken({ vkId, name });
        const wallet = await readWallet({ vkId, name });
        return new Response(
          JSON.stringify({
            ok: true,
            token,
            vkId,
            name: wallet.name || name,
            notes: wallet.notes,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "set-cookie": sessionCookie(token),
              "cache-control": "no-store",
            },
          },
        );
      },
    },
  },
});

import { createHash, randomBytes } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { DOOR_COOKIE, GUEST_COOKIE, doorCookieValue, guestToken, loginVk, setCookie } from "@/lib/purse.server";

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export const Route = createFileRoute("/api/vk-id")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const app = (process.env.VK_CLIENT_ID || "").trim();
        const url = new URL(request.url);
        const back = `${url.origin}/api/vk-id`;
        if (!app) {
          return new Response("VK ID ещё не подключён: в .env нет VK_CLIENT_ID.", {
            status: 501,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        const code = url.searchParams.get("code") || "";
        if (!code) {
          const state = randomBytes(16).toString("hex");
          const verifier = b64url(randomBytes(32));
          const challenge = b64url(createHash("sha256").update(verifier).digest());
          const headers = new Headers({ "cache-control": "no-store" });
          headers.append("set-cookie", setCookie(request, "kadr_vk_state", state).replace("Max-Age=2592000", "Max-Age=600"));
          headers.append("set-cookie", setCookie(request, "kadr_vk_ver", verifier).replace("Max-Age=2592000", "Max-Age=600"));
          const auth = new URL("https://id.vk.com/authorize");
          auth.searchParams.set("response_type", "code");
          auth.searchParams.set("client_id", app);
          auth.searchParams.set("redirect_uri", back);
          auth.searchParams.set("state", state);
          auth.searchParams.set("code_challenge", challenge);
          auth.searchParams.set("code_challenge_method", "s256");
          auth.searchParams.set("scope", "vkid.personal_info");
          headers.set("location", auth.toString());
          return new Response(null, { status: 302, headers });
        }
        const jar = request.headers.get("cookie") || "";
        const pick = (name: string) => {
          const hit = jar.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
          if (!hit) return "";
          try {
            return decodeURIComponent(hit.slice(name.length + 1));
          } catch {
            return "";
          }
        };
        const state = url.searchParams.get("state") || "";
        if (!state || state !== pick("kadr_vk_state")) {
          return new Response("Вход через VK сбился. Открой кнопку ещё раз.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
        }
        const tokenRes = await fetch("https://id.vk.com/oauth2/auth", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            code_verifier: pick("kadr_vk_ver"),
            client_id: app,
            device_id: url.searchParams.get("device_id") || "",
            redirect_uri: back,
            state,
          }),
        });
        const token = (await tokenRes.json().catch(() => null)) as { access_token?: string; user_id?: number; error?: string } | null;
        if (!token?.access_token || !token.user_id) {
          return new Response("VK не отдал вход. Проверь приложение и адрес возврата.", {
            status: 401,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        let shown = "";
        const infoRes = await fetch("https://id.vk.com/oauth2/user_info", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: app, access_token: token.access_token }),
        });
        const info = (await infoRes.json().catch(() => null)) as { user?: { first_name?: string; last_name?: string } } | null;
        shown = `${info?.user?.first_name || ""} ${info?.user?.last_name || ""}`.trim();
        const row = await loginVk(String(token.user_id), shown);
        if (!row) return new Response("Не завелось.", { status: 500 });
        const headers = new Headers({ location: "/", "cache-control": "no-store" });
        headers.append("set-cookie", setCookie(request, DOOR_COOKIE, doorCookieValue()));
        headers.append("set-cookie", setCookie(request, GUEST_COOKIE, guestToken(row)));
        return new Response(null, { status: 302, headers });
      },
    },
  },
});

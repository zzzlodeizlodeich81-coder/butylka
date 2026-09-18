import { createMiddleware } from "@tanstack/react-start";
import type { VkUser } from "./session.server";

const TOKEN_KEY = "vk-session";

export function readVkToken() {
  if (typeof sessionStorage === "undefined") return undefined;
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeVkToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export const vkMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => next({ sendContext: { vkToken: readVkToken() } }))
  .server(async ({ next, context }) => {
    const { resolveVkUser } = await import("./session.server");
    const vk = await resolveVkUser((context as { vkToken?: string }).vkToken);
    return next({ context: { vk: vk as VkUser | null } });
  });

import { getWallet } from "@/lib/notes-api";
import { useGame } from "@/lib/store";
import { useWallet } from "@/lib/wallet";
import { writeVkToken } from "./middleware";

function looksLikeVk() {
  if (typeof window === "undefined") return false;
  const q = window.location.search;
  return /vk_user_id=/.test(q) || /vk_app_id=/.test(q);
}

export async function bootVk() {
  let name = "";
  let photo: string | null = null;
  let inVk = looksLikeVk();
  try {
    const bridge = (await import("@vkontakte/vk-bridge")).default;
    await bridge.send("VKWebAppInit");
    inVk = true;
    const info = await bridge.send("VKWebAppGetUserInfo");
    name = `${info.first_name ?? ""} ${info.last_name ?? ""}`.trim();
    photo = info.photo_200 ?? info.photo_100 ?? null;
  } catch {
    /* opened outside VK */
  }

  try {
    const res = await fetch("/api/vk-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ search: window.location.search, name }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      token?: string;
      vkId?: string;
      name?: string;
      notes?: number;
      error?: string;
    };
    if (json.ok && json.token) {
      writeVkToken(json.token);
      const walletName = json.name || name;
      useWallet.getState().apply({
        ready: true,
        inVk,
        vkId: json.vkId ?? null,
        name: walletName,
        photo,
        notes: Number(json.notes ?? 0),
        error: null,
      });
      const game = useGame.getState();
      if (walletName) game.setPlayerName(game.youId, walletName.slice(0, 16) || game.players[0]?.name || "Я");
      if (photo) game.setAvatar(game.youId, photo);
      game.setYouNotes(Number(json.notes ?? 0));
      return;
    }
    useWallet.getState().apply({ ready: true, inVk, error: json.error ?? null });
  } catch {
    useWallet.getState().apply({ ready: true, inVk, error: "Сессия VK не открылась." });
  }
}

export async function refreshWallet() {
  const row = await getWallet();
  if (!row.ok) {
    useWallet.getState().apply({ notes: 0, error: row.error });
    return row;
  }
  useWallet.getState().apply({
    notes: row.notes,
    name: row.name || useWallet.getState().name,
    vkId: row.vkId,
    error: null,
  });
  useGame.getState().setYouNotes(row.notes);
  return row;
}

export async function buyPack(item: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const bridge = (await import("@vkontakte/vk-bridge")).default;
    const result = (await bridge.send("VKWebAppShowOrderBox", { type: "item", item })) as {
      success?: boolean;
    };
    if (!result?.success) return { ok: false, error: "Оплата не прошла." };
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => window.setTimeout(r, 700));
      const w = await refreshWallet();
      if (w.ok) return { ok: true };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "VK не открыл оплату." };
  }
}

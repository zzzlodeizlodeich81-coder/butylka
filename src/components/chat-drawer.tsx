import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersonAvatar } from "@/components/person-avatar";
import { playerById, useGame } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ChatDrawer() {
  const open = useGame((s) => s.chatOpen);
  const setChatOpen = useGame((s) => s.setChatOpen);
  const target = useGame((s) => s.chatTarget);
  const setChatTarget = useGame((s) => s.setChatTarget);
  const players = useGame((s) => s.players);
  const youId = useGame((s) => s.youId);
  const chat = useGame((s) => s.chat);
  const sendChat = useGame((s) => s.sendChat);
  const [draft, setDraft] = useState("");
  const others = players.filter((p) => p.id !== youId);
  const visible = chat.filter((m) =>
    target === "all"
      ? m.toId === "all"
      : (m.toId === target && m.fromId === youId) || (m.fromId === target && m.toId === youId),
  );

  if (!open) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[70%] flex-col rounded-t-2xl border border-border bg-surface">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-display text-base text-fg">Чат</p>
        <Button variant="ghost" size="icon" aria-label="Закрыть чат" onClick={() => setChatOpen(false)}>
          <X />
        </Button>
      </div>
      <div className="flex gap-1 overflow-x-auto px-4 pb-2">
        <button
          type="button"
          onClick={() => setChatTarget("all")}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-sm",
            target === "all" ? "border-accent bg-accent text-accent-fg" : "border-border text-muted",
          )}
        >
          Общий
        </button>
        {others.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setChatTarget(p.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-sm",
              target === p.id ? "border-accent bg-accent text-accent-fg" : "border-border text-muted",
            )}
          >
            <PersonAvatar url={p.avatarUrl} name={p.name} size="sm" />
            {p.name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto px-4 py-2">
        {visible.length === 0 ? (
          <p className="text-sm text-subtle">
            {target === "all" ? "Общий стол. Пиши сюда — увидят все." : "Приват. Только вы двое."}
          </p>
        ) : (
          visible.map((m) => {
            const from = playerById(players, m.fromId);
            const mine = m.fromId === youId;
            return (
              <div key={m.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                <PersonAvatar url={from?.avatarUrl ?? null} name={from?.name ?? ""} size="sm" />
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                    mine ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg",
                  )}
                >
                  {!mine ? <p className="mb-0.5 text-xs text-muted">{from?.name}</p> : null}
                  <p>{m.text}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form
        className="flex gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          sendChat(draft, target);
          setDraft("");
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={target === "all" ? "В общий чат" : "Приватно"}
          maxLength={240}
        />
        <Button type="submit">Ок</Button>
      </form>
    </div>
  );
}

export function ChatButton() {
  const setChatOpen = useGame((s) => s.setChatOpen);
  const chat = useGame((s) => s.chat);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Чат"
      onClick={() => setChatOpen(true)}
      className="relative"
    >
      <MessageCircle />
      {chat.length > 0 ? (
        <span className="absolute top-2 right-2 size-1.5 rounded-full bg-wine" />
      ) : null}
    </Button>
  );
}

import { createServerFn } from "@tanstack/react-start";

export const playRoom = createServerFn({ method: "POST" })
  .validator(
    (input: {
      action: "claim" | "spin" | "box" | "hint" | "bandit" | "prize";
      hints?: number;
      step?: "deal" | "pick";
      pick?: number;
      kind?: "cake" | "cards" | "brick";
    }) => input,
  )
  .handler(async ({ data }) => {
    const { runPlayRoom } = await import("@/lib/rooms");
    return runPlayRoom(data);
  });

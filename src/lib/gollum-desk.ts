import { createServerFn } from "@tanstack/react-start";

export const gollumDesk = createServerFn({ method: "POST" })
  .validator((input: { action: "pile" | "clean" | "fence" | "ring" | "play" | "pick" | "take"; room?: string; pick?: number }) => input)
  .handler(async ({ data }) => {
    const { runGollum } = await import("@/lib/gollum.server");
    return runGollum(data);
  });

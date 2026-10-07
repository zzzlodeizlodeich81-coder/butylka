import { createServerFn } from "@tanstack/react-start";
import type { PlotKind } from "@/lib/lands";

export const landDesk = createServerFn({ method: "POST" })
  .validator(
    (input: {
      action: "look" | "buy" | "tool" | "bundle" | "join" | "war" | "track" | "vote" | "settle" | "roster" | "kick" | "swear";
      kind?: PlotKind;
      mark?: string;
      title?: string;
      tool?: string;
      code?: string;
      plot?: string;
      url?: string;
      how?: "paid" | "state";
      who?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { runLand } = await import("@/lib/lands.server");
    return runLand(data);
  });

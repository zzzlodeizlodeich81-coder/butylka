import { createServerFn } from "@tanstack/react-start";
import { vkMiddleware } from "@/lib/vk/middleware";

export type YardSong = {
  id: string;
  kind: "draft" | "release";
  url: string;
  title: string;
  author: string;
  vk: string;
  at: number;
  hook: number;
  lyric: number;
  music: number;
  orig: number;
  n: number;
  up?: number;
  yard?: string;
};

export type YardLine = {
  id: string;
  name: string;
  text: string;
  at: number;
  room?: string;
  who?: string;
  photo?: string;
  image?: string;
  audio?: string;
};

export type YardSpot = { id: string; name: string; photo: string; spot: string; figure?: boolean };

export type Hero = {
  vk: string;
  name: string;
  notes: number;
  frames: number;
  tracks: number;
  hook: number;
  lyric: number;
  music: number;
  orig: number;
  votes: number;
  fame: number;
};

export const yardBoard = createServerFn({ method: "POST" })
  .middleware([vkMiddleware])
  .validator(
    (input: {
      action: "list" | "add" | "rate" | "hear" | "drop" | "say" | "glory" | "home" | "build" | "spot" | "stalls" | "rent" | "type" | "field" | "sow" | "tap" | "resow";
      kind?: "draft" | "release";
      url?: string;
      title?: string;
      songId?: string;
      tier?: string;
      text?: string;
      image?: string;
      audio?: string;
      hook?: number;
      lyric?: number;
      music?: number;
      orig?: number;
      author?: string;
      heroId?: string;
      frames?: number;
      plot?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { runYardBoard } = await import("@/lib/yard-board");
    return runYardBoard(data, context);
  });

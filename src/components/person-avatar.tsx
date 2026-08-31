import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

export function PersonAvatar({
  url,
  name,
  size = "md",
  className,
}: {
  url: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const box =
    size === "xl"
      ? "size-24"
      : size === "lg"
        ? "size-14"
        : size === "sm"
          ? "size-8"
          : "size-11";
  const icon = size === "xl" ? "size-10" : size === "lg" ? "size-6" : size === "sm" ? "size-3.5" : "size-5";

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={cn("shrink-0 rounded-full object-cover", box, className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted",
        box,
        className,
      )}
      aria-hidden
    >
      <Mic className={icon} strokeWidth={1.75} />
    </span>
  );
}

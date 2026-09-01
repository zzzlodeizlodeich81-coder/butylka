import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadTake, type SavedTrack } from "@/lib/library";
import { cn } from "@/lib/utils";

export function TrackTakes({ track, className }: { track: SavedTrack; className?: string }) {
  function grab(kind: "plus" | "minus" | "vocal" | "take" | "cover") {
    if (!downloadTake(track, kind)) {
      toast.error(
        kind === "minus"
          ? "Сначала сними минус."
          : kind === "take"
            ? "Сначала запиши голос."
            : kind === "cover"
              ? "Сначала свари кавер."
              : "Нет файла.",
      );
      return;
    }
  }

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <Button type="button" variant="secondary" className="rounded-xl" onClick={() => grab("plus")}>
        Скачать оригинал
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="rounded-xl"
        onClick={() => grab("minus")}
        disabled={!track.minusBlob}
      >
        Скачать минус
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="rounded-xl"
        onClick={() => grab("take")}
        disabled={!track.takeBlob}
      >
        Скачать запись
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="rounded-xl"
        onClick={() => grab("cover")}
        disabled={!track.coverBlob}
      >
        Скачать кавер
      </Button>
      {track.vocalBlob ? (
        <Button type="button" variant="secondary" className="col-span-2 rounded-xl" onClick={() => grab("vocal")}>
          Скачать вокал
        </Button>
      ) : null}
    </div>
  );
}

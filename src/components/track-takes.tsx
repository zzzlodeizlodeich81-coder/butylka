import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { previewFile, renderMasteredMix, startTakePreview, stopPreview } from "@/lib/audio";
import { downloadBlob, downloadTake, fileNameFor, objectUrlFor, type SavedTrack } from "@/lib/library";
import { cn } from "@/lib/utils";

export function TrackTakes({
  track,
  minusUrl,
  className,
}: {
  track: SavedTrack;
  minusUrl?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const bedUrl = track.minusBlob ? objectUrlFor(`${track.id}-minus`, track.minusBlob) : minusUrl;
  const voiceUrl = track.takeBlob ? objectUrlFor(`${track.id}-take`, track.takeBlob) : null;

  function listen() {
    if (!voiceUrl) {
      toast.error("Нет записи.");
      return;
    }
    stopPreview();
    if (!bedUrl) {
      previewFile(voiceUrl);
      toast.message("Это только голос — минуса нет.");
      return;
    }
    startTakePreview(bedUrl, voiceUrl, {
      shiftMs: track.takeShiftMs,
      rate: track.takeRate,
      volume: track.takeVolume,
      minusVol: track.takeMinusVol,
    });
  }

  async function grabMix() {
    if (!track.takeBlob) {
      toast.error("Сначала запиши голос.");
      return;
    }
    if (!track.minusBlob && !minusUrl) {
      downloadTake(track, "take");
      toast.message("Минуса нет — скачался только голос.");
      return;
    }
    setBusy(true);
    try {
      const minus = track.minusBlob ?? (await fetch(minusUrl!).then((r) => r.blob()));
      const mix = await renderMasteredMix(minus, track.takeBlob, {
        shiftMs: track.takeShiftMs,
        rate: track.takeRate,
        volume: track.takeVolume,
        minusVol: track.takeMinusVol,
      });
      downloadBlob(mix, fileNameFor(track.title, "karaoke", "audio/wav"));
      toast.success("Караоке: минус + голос.");
    } catch {
      toast.error("Сведение не собралось. Скачаю голос.");
      downloadTake(track, "take");
    } finally {
      setBusy(false);
    }
  }

  function grab(kind: "plus" | "minus" | "vocal" | "cover") {
    if (!downloadTake(track, kind)) {
      toast.error(
        kind === "minus"
          ? "Сначала сними минус."
          : kind === "cover"
            ? "Сначала свари кавер."
            : "Нет файла.",
      );
    }
  }

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <Button type="button" variant="secondary" className="rounded-xl" onClick={() => grab("plus")} disabled={track.blob.size < 800}>
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
      <Button type="button" className="rounded-xl" onClick={listen} disabled={!track.takeBlob}>
        Слушать что спел
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="rounded-xl"
        onClick={() => void grabMix()}
        disabled={!track.takeBlob || busy}
      >
        {busy ? "Свожу…" : "Скачать запись"}
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
        <Button type="button" variant="secondary" className="rounded-xl" onClick={() => grab("vocal")}>
          Скачать вокал
        </Button>
      ) : null}
    </div>
  );
}

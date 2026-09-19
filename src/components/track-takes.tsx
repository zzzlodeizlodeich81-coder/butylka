import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { previewFile, renderMasteredMix, startTakePreview, stopPreview } from "@/lib/audio";
import { downloadBlob, downloadTake, fileNameFor, objectUrlFor, type SavedTrack } from "@/lib/library";
import { cn } from "@/lib/utils";

export function TrackTakes({
  track,
  minusUrl,
  plusUrl,
  className,
}: {
  track: SavedTrack;
  minusUrl?: string;
  plusUrl?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState<"mix" | "plus" | "minus" | null>(null);
  const bedUrl = track.minusBlob ? objectUrlFor(`${track.id}-minus`, track.minusBlob) : minusUrl;
  const voiceUrl = track.takeBlob ? objectUrlFor(`${track.id}-take`, track.takeBlob) : null;
  const originUrl = track.blob.size >= 800 ? objectUrlFor(track.id, track.blob) : plusUrl;

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
    const voice = track.takeBlob;
    if (!voice) {
      toast.error("Сначала запиши голос.");
      return;
    }
    if (!track.minusBlob && !minusUrl) {
      downloadTake(track, "take");
      toast.message("Минуса нет — скачался только голос.");
      return;
    }
    setBusy("mix");
    try {
      const minus: Blob = track.minusBlob
        ? track.minusBlob
        : await fetch(minusUrl as string).then((r) => r.blob());
      const mix = await renderMasteredMix(minus, voice, {
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
      setBusy(null);
    }
  }

  async function grabUrl(kind: "plus" | "minus", url?: string) {
    if (kind === "plus" && track.blob.size >= 800) {
      downloadTake(track, "plus");
      return;
    }
    if (kind === "minus" && track.minusBlob) {
      downloadTake(track, "minus");
      return;
    }
    if (!url) {
      toast.error(kind === "plus" ? "Нет оригинала." : "Сначала сними минус.");
      return;
    }
    setBusy(kind);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      downloadBlob(blob, fileNameFor(track.title, kind === "plus" ? "original" : "minus", blob.type || "audio/mpeg"));
      toast.success(kind === "plus" ? "Оригинал из строк скачался." : "Минус скачался.");
    } catch {
      toast.error(kind === "plus" ? "Оригинал не скачался." : "Минус не скачался.");
    } finally {
      setBusy(null);
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
      <Button
        type="button"
        variant="secondary"
        className="rounded-xl"
        onClick={() => void grabUrl("plus", originUrl)}
        disabled={(!originUrl && track.blob.size < 800) || busy === "plus"}
      >
        {busy === "plus" ? "Качаю…" : "Скачать оригинал"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="rounded-xl"
        onClick={() => void grabUrl("minus", bedUrl)}
        disabled={(!track.minusBlob && !minusUrl) || busy === "minus"}
      >
        {busy === "minus" ? "Качаю…" : "Скачать минус"}
      </Button>
      <Button type="button" className="rounded-xl" onClick={listen} disabled={!track.takeBlob}>
        Слушать что спел
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="rounded-xl"
        onClick={() => void grabMix()}
        disabled={!track.takeBlob || busy === "mix"}
      >
        {busy === "mix" ? "Свожу…" : "Скачать запись"}
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

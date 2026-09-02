import { useEffect } from "react";
import { BottleTable } from "@/components/bottle-table";
import { BringSong } from "@/components/bring-song";
import { CookBridge } from "@/components/cook-bridge";
import { KaraokeStage } from "@/components/karaoke";
import { NetSync } from "@/components/net-sync";
import { Chrome, GateScreen, Lobby, ProfileScreen, Result, Reveal } from "@/components/screens";
import { SongPick } from "@/components/song-pick";
import { VerseRound } from "@/components/verse-round";
import { listSavedTracks, songFromSaved } from "@/lib/library";
import { useGame } from "@/lib/store";
import { armAudioGestures, setMixer, unlockAudio } from "@/lib/audio";

function Shell() {
  const phase = useGame((s) => s.phase);
  const mode = useGame((s) => s.mode);
  const hostId = useGame((s) => s.hostId);
  const youId = useGame((s) => s.youId);
  const host = mode !== "net" || hostId === youId;

  if (phase === "gate") return <GateScreen />;
  if (phase === "profile") return <ProfileScreen />;
  if (phase === "lobby") return <Lobby />;

  return (
    <Chrome>
      {host ? <CookBridge /> : null}
      {phase === "bring" ? host ? <BringSong /> : <WaitDeck /> : null}
      {phase === "verse" ? <VerseRound /> : null}
      {phase === "table" ? <BottleTable /> : null}
      {phase === "reveal" ? <Reveal /> : null}
      {phase === "song" ? <SongPick /> : null}
      {phase === "karaoke" ? <KaraokeStage /> : null}
      {phase === "result" ? <Result /> : null}
    </Chrome>
  );
}

function WaitDeck() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 text-center">
      <p className="font-display text-2xl text-fg">Хозяин собирает колоду</p>
      <p className="mt-2 max-w-xs text-sm text-muted">Песни появятся у всех, когда стол начнётся.</p>
    </div>
  );
}

export function App({ invite }: { invite?: string }) {
  const roomCode = useGame((s) => s.roomCode);

  useEffect(() => {
    useGame.getState().rehydrate();
    if (invite) {
      const s = useGame.getState();
      if (!(s.mode === "net" && s.roomCode === invite && s.wantHost)) {
        s.joinRoom(invite);
      }
    }
    armAudioGestures();
    const s = useGame.getState();
    setMixer({ muted: s.muted, music: s.musicGain, sfx: s.sfxGain });
    void listSavedTracks()
      .then((saved) => {
        const artist =
          useGame.getState().players.find((p) => p.id === useGame.getState().youId)?.name ?? "мой трек";
        const songs = saved.map((t) => songFromSaved(t, artist));
        useGame.getState().replaceCustomSongs(songs);
        const cur = useGame.getState().song;
        if (cur && !cur.audioUrl) {
          const match = songs.find((song) => song.id === cur.id);
          if (match) useGame.setState({ song: match });
        }
      })
      .catch(() => {
        /* library optional */
      });
    const block = (e: DragEvent) => {
      e.preventDefault();
    };
    const wake = () => unlockAudio();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, [invite]);

  if (roomCode) {
    return (
      <NetSync key={roomCode} room={roomCode}>
        <Shell />
      </NetSync>
    );
  }
  return <Shell />;
}

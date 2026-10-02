import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const SCRIPT = "https://myradio24.com/player/player.js?v3.31";

export function Matreshka({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    const prev = document.getElementById("matreshka-js");
    if (prev) {
      const $ = (window as unknown as { $?: { player_init?: (id: string) => void } }).$;
      $?.player_init?.("my_player");
      return;
    }
    const script = document.createElement("script");
    script.id = "matreshka-js";
    script.src = SCRIPT;
    script.async = true;
    script.dataset.radio = "matreshka";
    script.dataset.interval = "15";
    script.dataset.vmid = "170563";
    script.dataset.lang = "ru";
    document.body.appendChild(script);
  }, []);

  return (
    <div className={open ? "absolute inset-0 z-30 flex items-end bg-black/45" : "hidden"}>
      <div className="max-h-[86%] w-full overflow-auto rounded-t-3xl bg-[#2a1a0c] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[#f4e4c4]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl">Матрёшка</h2>
          <Button variant="ghost" className="text-[#f4e4c4]" onClick={onClose}>
            На двор
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div id="my_player" className="my_player shrink-0" data-player="custom" data-autoplay="0" data-volume="70" data-streamurl="https://myradio24.org/matreshka" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="block text-xs tracking-widest text-[#c4a574]">СЕЙЧАС</span>
            <b data-myinfo="song">эфир поднимается</b>
          </p>
          <canvas className="my_visualizer h-12 w-28" width={320} height={128} data-size={48} data-revert={0} data-color="red" />
        </div>
        <div id="my_player_html" className="hidden">
          <button type="button" className="my_play" aria-label="Эфир" />
        </div>
        <p className="mt-2 text-xs text-[#c4a574]">
          <b data-myinfo="listeners">—</b> слушают · <span data-myinfo="kbps">—</span> kbps
        </p>
        <p className="mt-4 text-xs tracking-widest text-[#c4a574]">ПОСЛЕДНИЕ</p>
        <div className="my_lastsongs mt-2 max-h-40 overflow-auto text-sm" data-revert={1}>
          <div className="my_lastsonghtml hidden">
            <div className="flex items-center gap-2 py-1">
              <img className="my_lastsong_cover size-9 rounded" alt="" />
              <span className="text-xs text-[#c4a574]">%songtime%</span>
              <a className="truncate text-[#f4e4c4] underline" href="https://www.youtube.com/results?search_query=%songencode%" target="_blank" rel="noreferrer">
                %song%
              </a>
            </div>
          </div>
        </div>
        <a
          className="mt-4 inline-block text-sm text-[#f4e4c4] underline"
          href="https://myradio24.com/ru/table/matreshka"
          target="_blank"
          rel="noreferrer"
        >
          Заказать песню
        </a>
      </div>
      <style>{`
        #my_player .my_play {
          width: 3.25rem;
          height: 3.25rem;
          border-radius: 999px;
          border: 0;
          background: #f4e4c4;
          cursor: pointer;
          position: relative;
        }
        #my_player .my_play::before {
          content: "";
          position: absolute;
          left: 1.25rem;
          top: 1rem;
          border-style: solid;
          border-width: 0.6rem 0 0.6rem 0.95rem;
          border-color: transparent transparent transparent #2a1a0c;
        }
        #my_player .my_play.my_playing::before {
          left: 1.15rem;
          top: 1rem;
          width: 0.95rem;
          height: 1.15rem;
          border: 0;
          background: linear-gradient(#2a1a0c, #2a1a0c) 0 0 / 0.28rem 100% no-repeat,
            linear-gradient(#2a1a0c, #2a1a0c) 100% 0 / 0.28rem 100% no-repeat;
        }
      `}</style>
    </div>
  );
}

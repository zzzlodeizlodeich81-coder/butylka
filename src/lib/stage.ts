import { useEffect, useState } from "react";

/** phone — вертикальный телефон, своя картинка и своя разметка.
 *  wide — горизонтальный телефон и стол: одна широкая карта, кнопки те же. */
export type StageId = "phone" | "wide";

export function readStage(): StageId {
  if (typeof window === "undefined") return "wide";
  const w = window.innerWidth;
  const h = window.innerHeight;
  return w < 900 && h > w ? "phone" : "wide";
}

export function useStage() {
  const [stage, setStage] = useState<StageId>("wide");
  useEffect(() => {
    const apply = () => setStage(readStage());
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);
  return stage;
}

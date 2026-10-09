import { NOTE_RUB } from "@/lib/notes";

/** YandexGPT Lite, синхронный режим, ₽ за 1000 токенов, с НДС. */
const RUB_PER_1K = 0.2;

export function assistBill(inTok: number, outTok: number) {
  const tokens = Math.max(0, Math.round(inTok)) + Math.max(0, Math.round(outTok));
  const costRub = Math.round((tokens / 1000) * RUB_PER_1K * 100) / 100;
  const priceRub = Math.round(costRub * 1.5 * 100) / 100;
  const raw = priceRub / NOTE_RUB;
  const notes = Math.max(0.1, Math.ceil(raw * 10) / 10);
  return { tokens, costRub, priceRub, notes };
}

export function guessTokens(chars: number) {
  return Math.max(1, Math.ceil(chars / 2));
}

import type { HouseId } from "@/lib/lands";

export function HouseMark({ id }: { id: HouseId }) {
  if (id === "chum") {
    return (
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden>
        <path d="M24 6 L40 40 H8 Z" fill="#c4a574" stroke="#1a120c" strokeWidth="2" />
        <path d="M24 6 L24 40" stroke="#1a120c" strokeWidth="1.5" />
      </svg>
    );
  }
  if (id === "bunker") {
    return (
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden>
        <path d="M4 34 Q24 16 44 34 V40 H4 Z" fill="#5c6b4a" stroke="#1a120c" strokeWidth="2" />
        <rect x="18" y="28" width="12" height="4" rx="1" fill="#111" />
      </svg>
    );
  }
  if (id === "boyar") {
    return (
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden>
        <path d="M6 22 L24 8 L42 22 V42 H6 Z" fill="#f4e4c4" stroke="#1a120c" strokeWidth="2" />
        <path d="M6 22 L24 8 L42 22" fill="#8b1e1e" stroke="#1a120c" strokeWidth="2" />
        <rect x="20" y="28" width="8" height="14" fill="#5c3a1e" />
      </svg>
    );
  }
  if (id === "brick") {
    return (
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden>
        <path d="M8 20 H40 V42 H8 Z" fill="#a33b32" stroke="#1a120c" strokeWidth="2" />
        <path d="M4 20 L24 8 L44 20 Z" fill="#3a3a3a" stroke="#1a120c" strokeWidth="2" />
        <rect x="20" y="28" width="8" height="14" fill="#1a120c" />
      </svg>
    );
  }
  if (id === "wings") {
    return (
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden>
        <path d="M4 24 Q14 10 22 22" fill="#f4e4c4" stroke="#1a120c" strokeWidth="2" />
        <path d="M44 24 Q34 10 26 22" fill="#f4e4c4" stroke="#1a120c" strokeWidth="2" />
        <path d="M16 24 H32 V40 H16 Z" fill="#f7f3ea" stroke="#1a120c" strokeWidth="2" />
        <path d="M14 24 L24 14 L34 24 Z" fill="#d4af37" stroke="#1a120c" strokeWidth="2" />
      </svg>
    );
  }
  if (id === "nest") {
    return (
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden>
        <ellipse cx="24" cy="28" rx="14" ry="16" fill="#c23b3b" stroke="#1a120c" strokeWidth="2" />
        <ellipse cx="24" cy="30" rx="8" ry="10" fill="#f4e4c4" stroke="#1a120c" strokeWidth="1.5" />
        <circle cx="24" cy="16" r="6" fill="#f4e4c4" stroke="#1a120c" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden>
      <path d="M8 22 L24 10 L40 22 V42 H8 Z" fill="#8b5a2b" stroke="#1a120c" strokeWidth="2" />
      <rect x="20" y="28" width="8" height="14" fill="#1a120c" />
    </svg>
  );
}

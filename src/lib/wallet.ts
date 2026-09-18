import { create } from "zustand";

type WalletState = {
  ready: boolean;
  vkId: string | null;
  name: string;
  photo: string | null;
  notes: number;
  inVk: boolean;
  shopOpen: boolean;
  error: string | null;
  setShop: (open: boolean) => void;
  apply: (patch: Partial<Omit<WalletState, "setShop" | "apply">>) => void;
};

export const useWallet = create<WalletState>((set) => ({
  ready: false,
  vkId: null,
  name: "",
  photo: null,
  notes: 0,
  inVk: false,
  shopOpen: false,
  error: null,
  setShop: (shopOpen) => set({ shopOpen }),
  apply: (patch) => set(patch),
}));

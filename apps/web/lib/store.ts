import { create } from "zustand";

interface TerminalState {
  symbol: string;
  portfolioId: string;
  dataQuality: "LIVE" | "DELAYED" | "STALE" | "DEGRADED" | "UNAVAILABLE";
  setSymbol: (s: string) => void;
  setPortfolioId: (p: string) => void;
  setDataQuality: (q: TerminalState["dataQuality"]) => void;
}

export const useTerminal = create<TerminalState>((set) => ({
  symbol: "BTCUSDT",
  portfolioId: "pf_1",
  dataQuality: "LIVE",
  setSymbol: (symbol) => set({ symbol }),
  setPortfolioId: (portfolioId) => set({ portfolioId }),
  setDataQuality: (dataQuality) => set({ dataQuality }),
}));

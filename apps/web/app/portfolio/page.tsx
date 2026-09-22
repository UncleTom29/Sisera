"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useTerminal } from "../../lib/store";
import { formatAmount } from "@sisera/ui";

export default function PortfolioPage() {
  const { portfolioId } = useTerminal();
  const portfolio = useQuery({
    queryKey: ["portfolio", portfolioId],
    queryFn: () => api.getPortfolio(portfolioId),
  });

  return (
    <div style={{ padding: 16 }}>
      <h1>Portfolio</h1>
      {portfolio.data ? (
        <p>
          {portfolio.data.name} · equity {formatAmount(portfolio.data.equity)}
        </p>
      ) : (
        <p>Loading…</p>
      )}
    </div>
  );
}

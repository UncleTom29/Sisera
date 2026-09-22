"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useTerminal } from "../lib/store";
import { qualityLabel } from "@sisera/ui";

export default function DashboardPage() {
  const { symbol, dataQuality } = useTerminal();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
  });

  return (
    <div style={{ padding: 16 }}>
      <h1>Dashboard</h1>
      <p>
        Watching <strong>{symbol}</strong> ·{" "}
        <span title="Market-data quality">{qualityLabel(dataQuality)}</span> · API{" "}
        {health.data ? health.data.status : "…"}
      </p>
    </div>
  );
}

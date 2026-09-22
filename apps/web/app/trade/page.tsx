"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useTerminal } from "../../lib/store";

export default function TradePage() {
  const { symbol, portfolioId } = useTerminal();
  const [quantity, setQuantity] = useState("0.1");
  const [result, setResult] = useState<string>("");

  const mutation = useMutation({
    mutationFn: () =>
      api.createOrder({
        client_order_id: `web_${Date.now()}`,
        instrument_id: symbol,
        side: "BUY",
        order_type: "MARKET",
        quantity,
        account_id: "web",
        portfolio_id: portfolioId,
      }),
    onSuccess: (order) => setResult(`Created ${order.sisera_order_id} (${order.state})`),
    onError: (e: Error) => setResult(`Error: ${e.message}`),
  });

  return (
    <div style={{ padding: 16 }}>
      <h1>Trade {symbol}</h1>
      <label>
        Quantity{" "}
        <input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </label>{" "}
      <button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        Buy (paper)
      </button>
      <p>{result}</p>
    </div>
  );
}

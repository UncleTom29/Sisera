import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../../lib/api";
import { formatAmount } from "@sisera/ui";

export default function HomeScreen() {
  const [equity, setEquity] = useState<string>("—");
  const [status, setStatus] = useState<string>("…");

  useEffect(() => {
    api
      .health()
      .then((h) => setStatus(h.status))
      .catch(() => setStatus("offline"));
    api
      .getPortfolio("pf_1")
      .then((p) => setEquity(formatAmount(p.equity)))
      .catch(() => setEquity("—"));
  }, []);

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#0a0e14" }}>
      <Text style={{ color: "#e6edf3", fontSize: 24, fontWeight: "700" }}>Sisera</Text>
      <Text style={{ color: "#8b95a5" }}>API {status} · Equity {equity}</Text>
    </View>
  );
}

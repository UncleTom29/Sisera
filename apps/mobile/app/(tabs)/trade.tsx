import { useState } from "react";
import { Button, Text, TextInput, View } from "react-native";
import { api } from "../../lib/api";

export default function TradeScreen() {
  const [quantity, setQuantity] = useState("0.1");
  const [result, setResult] = useState("");

  const submit = async () => {
    try {
      const order = await api.createOrder({
        client_order_id: `mobile_${Date.now()}`,
        instrument_id: "BTCUSDT",
        side: "BUY",
        order_type: "MARKET",
        quantity,
        account_id: "mobile",
        portfolio_id: "pf_1",
      });
      setResult(`Created ${order.sisera_order_id} (${order.state})`);
    } catch (e) {
      setResult(`Error: ${(e as Error).message}`);
    }
  };

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#0a0e14" }}>
      <Text style={{ color: "#e6edf3", fontSize: 20 }}>Trade BTCUSDT (paper)</Text>
      <TextInput
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
        style={{ borderWidth: 1, borderColor: "#1e2632", color: "#e6edf3", padding: 8, marginVertical: 8 }}
      />
      <Button title="Buy" onPress={submit} />
      <Text style={{ color: "#8b95a5", marginTop: 8 }}>{result}</Text>
    </View>
  );
}

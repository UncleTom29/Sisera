import { Text, View } from "react-native";

export default function AlertsScreen() {
  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#0a0e14" }}>
      <Text style={{ color: "#e6edf3", fontSize: 20 }}>Alerts</Text>
      <Text style={{ color: "#8b95a5" }}>Coming soon — wired to /api/v1.</Text>
    </View>
  );
}

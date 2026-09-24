import { useEffect, useState } from "react";
import { Button, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api } from "../../lib/api";
import { formatAmount } from "@sisera/ui";

export default function HomeScreen() {
  const [equity, setEquity] = useState<string>("100,000.00");
  const [dailyPnl, setDailyPnl] = useState<string>("+1,612.50 (+1.61%)");
  const [alertStatus, setAlertStatus] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPortfolio("pf_1")
      .then((p) => {
        if (p?.equity) setEquity(formatAmount(p.equity));
      })
      .catch(() => {});
  }, []);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>SISERA</Text>
          <Text style={styles.subtitle}>Institutional Trading OS</Text>
        </View>
        <View style={styles.paperBadge}>
          <Text style={styles.paperBadgeText}>● PAPER MODE</Text>
        </View>
      </View>

      {/* NAV & Risk Card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>NET ASSET VALUE (NAV)</Text>
        <Text style={styles.navAmount}>${equity}</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.greenText}>{dailyPnl} Today</Text>
          <Text style={styles.riskBadge}>RISK: NORMAL (0.48x)</Text>
        </View>
      </View>

      {/* Actionable Alert Card (spec §32) */}
      <View style={[styles.card, styles.alertCard]}>
        <View style={styles.rowBetween}>
          <Text style={styles.alertHeader}>⚠ ACTIONABLE RISK ALERT (§32)</Text>
          <Text style={styles.confidenceText}>Confidence: 82%</Text>
        </View>
        <Text style={styles.alertTitle}>ETH Regime Changed: Momentum Overheat</Text>
        <Text style={styles.alertBody}>
          Open interest breakout + funding accelerating rapidly. Current ETH exposure: $18,420.
        </Text>
        <Text style={styles.recommendationText}>Recommended action: Reduce exposure 22%</Text>

        {alertStatus ? (
          <Text style={styles.alertStatusText}>{alertStatus}</Text>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnApprove]}
              onPress={() => setAlertStatus("✓ Approved: Reducing ETH exposure 22% via SOR maker-first route.")}
            >
              <Text style={styles.btnTextDark}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnReject]}
              onPress={() => setAlertStatus("✗ Alert rejected by operator.")}
            >
              <Text style={styles.btnTextLight}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnOutline]}>
              <Text style={styles.btnTextLight}>Reasoning</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Open Positions Summary */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Open Positions</Text>
        <View style={styles.positionItem}>
          <View>
            <Text style={styles.boldText}>BTC-PERP (0.75 BTC)</Text>
            <Text style={styles.dimText}>Entry: $62,100 · 2.5x Lev</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.boldText, styles.greenText]}>+$1,612.50</Text>
            <Text style={styles.dimText}>Liq: 33.8% dist</Text>
          </View>
        </View>
      </View>

      {/* Agent Status */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Autonomous Agents</Text>
          <Text style={styles.dimText}>2 Active</Text>
        </View>
        <Text style={styles.dimText}>Alpha Momentum 1: POLICY_AUTO · Scanning every 60s</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080b10",
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    color: "#f3f4f6",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  subtitle: {
    color: "#6b7280",
    fontSize: 12,
  },
  paperBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  paperBadgeText: {
    color: "#f59e0b",
    fontSize: 10,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#0e131b",
    borderColor: "#1e2633",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  cardLabel: {
    color: "#6b7280",
    fontSize: 11,
    fontWeight: "600",
  },
  navAmount: {
    color: "#f3f4f6",
    fontSize: 26,
    fontWeight: "800",
    marginVertical: 4,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greenText: {
    color: "#10b981",
    fontWeight: "700",
  },
  riskBadge: {
    color: "#10b981",
    fontSize: 11,
    fontWeight: "600",
  },
  alertCard: {
    borderColor: "rgba(245, 158, 11, 0.4)",
    backgroundColor: "rgba(245, 158, 11, 0.05)",
  },
  alertHeader: {
    color: "#f59e0b",
    fontSize: 11,
    fontWeight: "800",
  },
  confidenceText: {
    color: "#9ca3af",
    fontSize: 11,
  },
  alertTitle: {
    color: "#f3f4f6",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
  },
  alertBody: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 4,
  },
  recommendationText: {
    color: "#f59e0b",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  btnApprove: {
    backgroundColor: "#10b981",
  },
  btnReject: {
    backgroundColor: "#ef4444",
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: "#1e2633",
  },
  btnTextDark: {
    color: "#080b10",
    fontWeight: "700",
    fontSize: 12,
  },
  btnTextLight: {
    color: "#f3f4f6",
    fontWeight: "600",
    fontSize: 12,
  },
  alertStatusText: {
    color: "#10b981",
    fontWeight: "600",
    fontSize: 12,
    marginTop: 8,
  },
  sectionTitle: {
    color: "#f3f4f6",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  positionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  boldText: {
    color: "#f3f4f6",
    fontWeight: "600",
  },
  dimText: {
    color: "#6b7280",
    fontSize: 11,
  },
});
